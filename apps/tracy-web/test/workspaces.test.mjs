import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { dbSitesResolver } from '../src/sites/resolver.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const env = {
  TRACY_ORIGIN: 'http://tracy.test',
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://host',
  HOST_local_DSH_ORIGIN: 'http://dsh',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

function harness(pool) {
  let nowMs = Date.now()
  const sent = []
  const mail = {
    send: async (m) => {
      sent.push(m)
    }
  }
  const config = readConfig(env)
  const app = buildApp({ config, pool, mail, sites: dbSitesResolver(pool, config), now: () => nowMs })
  const cookieFor = async (email) => {
    const { mintSession } = await import('../src/lib/session.js')
    return `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  }
  const get = (path, cookie) =>
    app.fetch(new Request(`http://tracy.test${path}`, { headers: cookie ? { cookie } : {} }))
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  return { app, sent, config, cookieFor, get, send, advance: (ms) => (nowMs += ms) }
}

async function accountId(pool, email) {
  const { rows } = await pool.query('select id from account where email = $1', [email])
  return rows[0]?.id ?? null
}

async function makeSite(pool, siteKey, label) {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
}

/** A seat on `siteKey` for `email`, written straight into the site's own book. `status` is the
 *  seat's lifecycle: `accepted` (live), `pending` (invited, never accepted), `revoked`, `declined`. */
async function seatOn(pool, siteKey, email, role, status = 'accepted') {
  const id = (
    await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [email]
    )
  ).rows[0].id
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at, revoked_at, declined_at)
     values ($1, $2, $3, $2, $4, $5, $6)`,
    [
      siteKey,
      id,
      role,
      status === 'pending' ? null : new Date(),
      status === 'revoked' ? new Date() : null,
      status === 'declined' ? new Date() : null
    ]
  )
  return id
}

/** Everything the site↔workspace door can change, read back in one shape: the site's workspace
 *  link and every seat on it. A refused PUT must leave this exactly as it found it. */
async function siteState(pool, siteKey) {
  const links = await pool.query('select workspace_id from workspace_site where site_key = $1', [siteKey])
  const seatRows = await pool.query(
    `select a.email, s.role, s.accepted_at is not null as accepted, s.revoked_at is not null as revoked,
            s.declined_at is not null as declined
     from seat s join account a on a.id = s.account_id where s.site_key = $1 order by a.email`,
    [siteKey]
  )
  return { links: links.rows.map((r) => r.workspace_id), seats: seatRows.rows }
}

/** Seed the `tracy_admin` workspace directly, plus one accepted member — the one door this task
 *  deliberately gives NO way to create through the API (`POST /workspaces` never accepts `kind`). */
async function seedTracyAdmin(pool, ownerEmail, role = 'owner') {
  const owner = (
    await pool.query(
      `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
      [ownerEmail]
    )
  ).rows[0].id
  const workspaceId = (
    await pool.query(
      "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
    )
  ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [workspaceId, owner, role]
  )
  return { workspaceId, ownerId: owner }
}

test(
  "agency owner creates a workspace, declares a site into it, invites an editor; that member's workspace grant does NOT reach the site's own seats door (ADR 0067)",
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'client.example', 'client-example')
    const { sent, cookieFor, get, send } = harness(pool)

    const created = await send('POST', '/workspaces', await cookieFor('owner@x.y'), {
      displayName: 'Acme Agency'
    })
    assert.equal(created.status, 201)
    const { id: workspaceId, displayName } = await created.json()
    assert.equal(displayName, 'Acme Agency')

    // The creator is immediately an ACCEPTED owner — no invitation to answer for one's own agency.
    const mine = await get('/me/workspaces', await cookieFor('owner@x.y'))
    const mineBody = await mine.json()
    assert.equal(mineBody.workspaces.length, 1)
    assert.equal(mineBody.workspaces[0].role, 'owner')
    assert.equal(mineBody.workspaces[0].status, 'accepted')

    // The declaring admin must already sit on the site as owner/admin (#663): a workspace grant
    // alone never reaches a site, and declaring never mints a site seat.
    await seatOn(pool, 'client.example', 'owner@x.y', 'owner')
    const declared = await send('PUT', '/api/sites/client.example/workspace', await cookieFor('owner@x.y'), {
      workspaceId
    })
    assert.equal(declared.status, 200)
    const declaredBody = await declared.json()
    assert.equal(declaredBody.workspaceId, workspaceId)
    assert.equal(declaredBody.ownerGranted, undefined)

    const read = await get('/api/sites/client.example/workspace', await cookieFor('owner@x.y'))
    assert.deepEqual(await read.json(), { workspace: { id: workspaceId, displayName: 'Acme Agency' } })

    const ownerSites = await get('/api/sites', await cookieFor('owner@x.y'))
    const ownerSitesBody = await ownerSites.json()
    assert.equal(ownerSitesBody.sites[0].role, 'owner')
    assert.equal(ownerSitesBody.sites[0].status, 'accepted')

    // A site-level editor, invited the ordinary way — the target of the escalated PATCH below.
    const teamInvite = await send('POST', '/api/team/invite', await cookieFor('owner@x.y'), {
      emails: ['dev@x.y'],
      role: 'editor',
      siteKeys: ['client.example']
    })
    assert.equal(teamInvite.status, 200)
    const devId = await accountId(pool, 'dev@x.y')

    // Invite an admin to the WORKSPACE — not to the site directly.
    const invited = await send('POST', `/workspaces/${workspaceId}/seats`, await cookieFor('owner@x.y'), {
      email: 'admin@x.y',
      role: 'editor'
    })
    assert.equal(invited.status, 201)
    const invitedBody = await invited.json()
    assert.equal(invitedBody.notified, true)
    assert.equal(invitedBody.seat.role, 'editor')
    assert.equal(invitedBody.seat.status, 'invited')
    assert.ok(sent.some((m) => m.to === 'admin@x.y' && m.subject.includes('Acme Agency')))

    const beforeAccept = await send(
      'PATCH',
      `/api/sites/client.example/seats/${devId}`,
      await cookieFor('admin@x.y'),
      {
        role: 'viewer'
      }
    )
    assert.equal(beforeAccept.status, 403)
    assert.deepEqual(await beforeAccept.json(), { code: 'SEAT_NOT_AUTHORIZED' })

    const accepted = await send('POST', `/me/workspaces/${workspaceId}/accept`, await cookieFor('admin@x.y'))
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { accepted: true })

    // ADR 0067 (19/08, `workers/seat-registry`): workspace-tier inheritance was deliberately
    // removed from SITE authorization. Checked directly against the shipped Worker —
    // `workspaceGrantFor` is read at EIGHT call sites in `workers/seat-registry/src/index.js`
    // (4964, 5083, 5479, 5525, 7199, 7212, 7401, 7734; an earlier version of this comment
    // miscounted them as four — corrected in Fix Round 2). Seven decide a WORKSPACE-scoped
    // question inside a `/workspaces/*`-shaped handler; `handleSetRole`/`handleRosterRevoke`
    // (the site's own seats door) call `grantFor` — the SITE book alone — and are not among the
    // eight. The eighth, `handleCreateRepo` (line 7734), is ADR 0067 §3's one documented
    // bootstrap exception: a workspace admin may create a site's GitHub repo when the site has
    // no `seat` row yet, and `ensureSiteOwnerSeat` grants the first real one immediately after so
    // the site's own book governs from the next call. That exception is the GitHub door's to
    // carry, not this one's, and does not change what this test asserts: even now that this
    // admin has ACCEPTED the workspace grant, and even though this exact site is declared into
    // that exact workspace, the site's own seats door still answers `SEAT_NOT_AUTHORIZED` — a
    // workspace grant's power stays inside workspace doors (`/workspaces/:id/seats*`,
    // `/me/workspaces/*`) and never opens a door shaped `/api/sites/*`. Do NOT "fix" this into a
    // 200 later — that is exactly the hole ADR 0067 closed, and Fix Round 1 of this task reverted
    // a Care Point that had reopened it by mistake.
    const stillRefused = await send(
      'PATCH',
      `/api/sites/client.example/seats/${devId}`,
      await cookieFor('admin@x.y'),
      {
        role: 'viewer'
      }
    )
    assert.equal(stillRefused.status, 403)
    assert.deepEqual(await stillRefused.json(), { code: 'SEAT_NOT_AUTHORIZED' })

    // The site's own owner (a REAL `seat` row, held before declaring the site) still can, of course —
    // this is the site's own book working normally, not a regression from the ruling above.
    const ownerCan = await send(
      'PATCH',
      `/api/sites/client.example/seats/${devId}`,
      await cookieFor('owner@x.y'),
      {
        role: 'viewer'
      }
    )
    assert.equal(ownerCan.status, 200)
    assert.deepEqual(await ownerCan.json(), { id: devId, role: 'viewer' })

    // A plain stranger with no grant anywhere gets the same refusal.
    const nobody = await send(
      'PATCH',
      `/api/sites/client.example/seats/${devId}`,
      await cookieFor('nobody@x.y'),
      {
        role: 'editor'
      }
    )
    assert.equal(nobody.status, 403)
  }
)

test('workspace name is unique: a second workspace with the same display name is refused', opts, async () => {
  const { pool } = db
  const { cookieFor, send } = harness(pool)
  const first = await send('POST', '/workspaces', await cookieFor('a@x.y'), { displayName: 'Acme' })
  assert.equal(first.status, 201)
  const second = await send('POST', '/workspaces', await cookieFor('b@x.y'), { displayName: 'Acme' })
  assert.equal(second.status, 409)
  assert.deepEqual(await second.json(), { code: 'WORKSPACE_NAME_TAKEN' })
})

test('workspace last-owner guard: leaving or revoking the only owner is refused', opts, async () => {
  const { pool } = db
  const { cookieFor, send } = harness(pool)
  const created = await send('POST', '/workspaces', await cookieFor('solo@x.y'), { displayName: 'Solo Co' })
  const { id: workspaceId } = await created.json()

  const leave = await send('POST', `/me/workspaces/${workspaceId}/leave`, await cookieFor('solo@x.y'))
  assert.equal(leave.status, 403)
  assert.deepEqual(await leave.json(), { code: 'CANNOT_REVOKE_LAST_OWNER' })

  const soloId = await accountId(pool, 'solo@x.y')
  const revoke = await send(
    'DELETE',
    `/workspaces/${workspaceId}/seats/${soloId}`,
    await cookieFor('solo@x.y')
  )
  assert.equal(revoke.status, 403)
  assert.deepEqual(await revoke.json(), { code: 'CANNOT_REVOKE_SELF' })
})

test(
  'workspace join-request: asking, then the admin approving through the same invite door',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send, get } = harness(pool)
    const created = await send('POST', '/workspaces', await cookieFor('owner@x.y'), {
      displayName: 'Open Co'
    })
    const { id: workspaceId } = await created.json()

    const asked = await send(
      'POST',
      `/me/workspaces/${workspaceId}/join-request`,
      await cookieFor('asker@x.y')
    )
    assert.equal(asked.status, 201)
    assert.deepEqual(await asked.json(), {
      requested: true,
      already: false,
      workspace: { id: workspaceId, displayName: 'Open Co' }
    })

    const roster = await get(`/workspaces/${workspaceId}/seats`, await cookieFor('owner@x.y'))
    const rosterBody = await roster.json()
    const askerRow = rosterBody.seats.find((s) => s.email === 'asker@x.y')
    assert.equal(askerRow.status, 'invited')
    assert.ok(askerRow.requestedAt)

    // Approving is the SAME door as inviting — Admin choosing "editor" for someone already asking.
    const approved = await send('POST', `/workspaces/${workspaceId}/seats`, await cookieFor('owner@x.y'), {
      email: 'asker@x.y',
      role: 'editor'
    })
    assert.equal(approved.status, 200)
    const approvedBody = await approved.json()
    assert.equal(approvedBody.approved, true)
    assert.equal(approvedBody.seat.status, 'active')
  }
)

test('tracy-admin/whoami: staff sees their rank, everybody else is refused', opts, async () => {
  const { pool } = db
  await seedTracyAdmin(pool, 'staff@tracy.test', 'owner')
  const { cookieFor, get } = harness(pool)

  const staff = await get('/tracy-admin/whoami', await cookieFor('staff@tracy.test'))
  assert.equal(staff.status, 200)
  assert.deepEqual(await staff.json(), { email: 'staff@tracy.test', role: 'owner' })

  const stranger = await get('/tracy-admin/whoami', await cookieFor('customer@x.y'))
  assert.equal(stranger.status, 403)
  assert.deepEqual(await stranger.json(), { code: 'SEAT_NOT_AUTHORIZED' })

  const anon = await get('/tracy-admin/whoami')
  assert.equal(anon.status, 401)
})

test('every /tracy-admin/* door refuses a non-member with 403, not a partial answer', opts, async () => {
  const { pool } = db
  await seedTracyAdmin(pool, 'staff@tracy.test', 'owner')
  const { cookieFor, get, send } = harness(pool)
  const cookie = await cookieFor('customer@x.y')

  assert.equal((await get('/tracy-admin/overview', cookie)).status, 403)
  assert.deepEqual(await (await get('/tracy-admin/overview', cookie)).json(), {
    code: 'SEAT_NOT_AUTHORIZED'
  })
  assert.equal((await get('/tracy-admin/members', cookie)).status, 403)
  assert.equal(
    (await send('POST', '/tracy-admin/members', cookie, { email: 'x@y.z', role: 'admin' })).status,
    403
  )
  assert.equal(
    (await send('POST', '/tracy-admin/members/00000000-0000-0000-0000-000000000000/code', cookie)).status,
    403
  )
  assert.equal(
    (await send('DELETE', '/tracy-admin/members/00000000-0000-0000-0000-000000000000', cookie)).status,
    403
  )
})

test(
  'tracy-admin/overview: every workspace with its seat counts and sites, plus the not-yet-declared queue',
  opts,
  async () => {
    const { pool } = db
    await seedTracyAdmin(pool, 'staff@tracy.test', 'owner')
    const { cookieFor, get, send } = harness(pool)
    const staffCookie = await cookieFor('staff@tracy.test')

    const created = await send('POST', '/workspaces', await cookieFor('agencyowner@x.y'), {
      displayName: 'Overview Agency'
    })
    const { id: workspaceId } = await created.json()
    await makeSite(pool, 'declared.example', 'declared-example')
    await seatOn(pool, 'declared.example', 'agencyowner@x.y', 'owner')
    await send('PUT', '/api/sites/declared.example/workspace', await cookieFor('agencyowner@x.y'), {
      workspaceId
    })
    // A pending invitation — counted, but as `pending`, not folded into `total` silently.
    await send('POST', `/workspaces/${workspaceId}/seats`, await cookieFor('agencyowner@x.y'), {
      email: 'pendingeditor@x.y',
      role: 'editor'
    })

    // A site with a live owner seat, never declared into any workspace — the overview's queue.
    await makeSite(pool, 'undeclared.example', 'undeclared-example')
    const undeclaredOwner = await pool.query(
      `insert into account (email) values ('undeclaredowner@x.y') returning id`
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('undeclared.example', $1, 'owner', $1, now())`,
      [undeclaredOwner.rows[0].id]
    )

    const overview = await get('/tracy-admin/overview', staffCookie)
    assert.equal(overview.status, 200)
    const body = await overview.json()
    assert.equal(body.viewerRole, 'owner')

    const agency = body.workspaces.find((w) => w.id === workspaceId)
    assert.ok(agency, 'the new workspace must appear in the overview')
    assert.equal(agency.displayName, 'Overview Agency')
    assert.equal(agency.kind, 'customer')
    assert.deepEqual(agency.sites, ['declared.example'])
    assert.equal(agency.seats.total, 2) // the owner (accepted) + the pending editor
    assert.equal(agency.seats.pending, 1)
    assert.equal(agency.seats.byRole.owner, 1)
    assert.equal(agency.seats.byRole.editor, 1)
    // Who holds power in a customer workspace: its owners only (ADR 0028).
    assert.deepEqual(agency.seats.admins, [{ email: 'agencyowner@x.y', role: 'owner', accepted: true }])
    // Tracy's own workspace shows up too — `allWorkspaces` has no kind filter, same as the Worker.
    assert.ok(body.workspaces.some((w) => w.kind === 'tracy_admin'))

    assert.ok(body.undeclaredSites.includes('undeclared.example'))
    assert.ok(!body.undeclaredSites.includes('declared.example'))
  }
)

test(
  'tracy-admin/members: an owner invites an admin by mail, then removes them with a mailed removal code',
  opts,
  async () => {
    const { pool } = db
    await seedTracyAdmin(pool, 'owner@tracy.test', 'owner')
    const { sent, cookieFor, get, send } = harness(pool)
    const ownerCookie = await cookieFor('owner@tracy.test')

    const invited = await send('POST', '/tracy-admin/members', ownerCookie, {
      email: 'new@tracy.test',
      role: 'admin'
    })
    assert.equal(invited.status, 201)
    const invitedBody = await invited.json()
    assert.equal(invitedBody.member.role, 'admin')
    assert.equal(invitedBody.member.status, 'invited')
    assert.equal(invitedBody.notified, true)
    assert.equal(sent.length, 1)

    const newId = await accountId(pool, 'new@tracy.test')

    // A pending invite is a LIVE row already (not revoked/declined) — `liveGrant` in the Worker
    // this was ported from filters on that, not on `accepted_at` — so it shows up here too, just
    // with `status: 'invited'`.
    const members = await get('/tracy-admin/members', ownerCookie)
    const membersBody = await members.json()
    assert.equal(membersBody.viewer.role, 'owner')
    assert.equal(membersBody.members.length, 2)
    assert.equal(membersBody.members.find((m) => m.id === newId).status, 'invited')

    // Accept the invitation the same generic way every workspace invite is accepted.
    const seatWorkspace = await pool.query('select workspace_id from seat_workspace where account_id = $1', [
      newId
    ])
    const workspaceId = seatWorkspace.rows[0].workspace_id
    const accepted = await send(
      'POST',
      `/me/workspaces/${workspaceId}/accept`,
      await cookieFor('new@tracy.test')
    )
    assert.equal(accepted.status, 200)

    const membersAfter = await (await get('/tracy-admin/members', ownerCookie)).json()
    assert.equal(membersAfter.members.length, 2)
    assert.equal(membersAfter.members.find((m) => m.id === newId).status, 'active')

    // Removal: no code yet.
    const noCode = await send('DELETE', `/tracy-admin/members/${newId}`, ownerCookie)
    assert.equal(noCode.status, 428)
    assert.deepEqual(await noCode.json(), { code: 'REMOVAL_CODE_REQUIRED' })

    const codeReq = await send('POST', `/tracy-admin/members/${newId}/code`, ownerCookie)
    assert.equal(codeReq.status, 200)
    const codeBody = await codeReq.json()
    assert.equal(codeBody.to, 'o***r@***.test')
    assert.equal(codeBody.expiresInSeconds, 600)
    assert.equal(sent.length, 2)
    const code = sent[1].text.match(/Code:\s*(\d{6})/)[1]
    const wrongCode = String((Number(code) + 1) % 1000000).padStart(6, '0')

    const wrong = await send('DELETE', `/tracy-admin/members/${newId}`, ownerCookie, { code: wrongCode })
    assert.equal(wrong.status, 403)
    assert.deepEqual(await wrong.json(), { code: 'REMOVAL_CODE_INVALID', triesLeft: 4 })

    const removed = await send('DELETE', `/tracy-admin/members/${newId}`, ownerCookie, { code })
    assert.equal(removed.status, 200)
    const removedBody = await removed.json()
    assert.equal(removedBody.removed.status, 'revoked')

    // The code is single-use: asking again with the SAME (now-deleted) code fails closed.
    const reused = await send('DELETE', `/tracy-admin/members/${newId}`, ownerCookie, { code })
    assert.equal(reused.status, 428)

    const whoamiAfter = await get('/tracy-admin/whoami', await cookieFor('new@tracy.test'))
    assert.equal(whoamiAfter.status, 403)
  }
)

test('tracy-admin removal code: five wrong guesses exhausts it', opts, async () => {
  const { pool } = db
  await seedTracyAdmin(pool, 'owner@tracy.test', 'owner')
  const { cookieFor, send } = harness(pool)
  const ownerCookie = await cookieFor('owner@tracy.test')
  await send('POST', '/tracy-admin/members', ownerCookie, { email: 'new@tracy.test', role: 'admin' })
  const newId = await accountId(pool, 'new@tracy.test')
  await send('POST', `/tracy-admin/members/${newId}/code`, ownerCookie)

  let last
  for (let i = 0; i < 5; i += 1) {
    last = await send('DELETE', `/tracy-admin/members/${newId}`, ownerCookie, { code: '999999' })
  }
  assert.equal(last.status, 429)
  assert.deepEqual(await last.json(), { code: 'REMOVAL_CODE_EXHAUSTED' })
})

test('tracy-admin removal code: expires after ten minutes', opts, async () => {
  const { pool } = db
  await seedTracyAdmin(pool, 'owner@tracy.test', 'owner')
  const { cookieFor, send, advance } = harness(pool)
  const ownerCookie = await cookieFor('owner@tracy.test')
  await send('POST', '/tracy-admin/members', ownerCookie, { email: 'new@tracy.test', role: 'admin' })
  const newId = await accountId(pool, 'new@tracy.test')
  const codeReq = await send('POST', `/tracy-admin/members/${newId}/code`, ownerCookie)
  const sent = await codeReq.json()
  assert.equal(sent.sent, true)

  advance(10 * 60 * 1000 + 1)
  const tooLate = await send('DELETE', `/tracy-admin/members/${newId}`, ownerCookie, { code: '123456' })
  assert.equal(tooLate.status, 428)
  assert.deepEqual(await tooLate.json(), { code: 'REMOVAL_CODE_REQUIRED' })
})

test(
  'tracy-admin removal: an admin cannot remove an owner, and the last owner cannot be removed',
  opts,
  async () => {
    const { pool } = db
    const { ownerId } = await seedTracyAdmin(pool, 'owner@tracy.test', 'owner')
    const { cookieFor, send } = harness(pool)
    const ownerCookie = await cookieFor('owner@tracy.test')

    await send('POST', '/tracy-admin/members', ownerCookie, { email: 'admin2@tracy.test', role: 'admin' })
    const admin2Id = await accountId(pool, 'admin2@tracy.test')
    await pool.query('update seat_workspace set accepted_at = now() where account_id = $1', [admin2Id])
    const admin2Cookie = await cookieFor('admin2@tracy.test')

    const code = await send('POST', `/tracy-admin/members/${ownerId}/code`, admin2Cookie)
    assert.equal(code.status, 403, 'an admin removing the owner is refused before any code is even usable')

    const soloCode = await send('POST', `/tracy-admin/members/${ownerId}/code`, ownerCookie)
    assert.equal(soloCode.status, 409)
    assert.deepEqual(await soloCode.json(), { code: 'LAST_OWNER' })
  }
)

// ── #663: PUT /api/sites/:key/workspace needs a seat ON THE SITE, not only on the workspace ────

/** A fresh workspace owned by `email` (through the real door), answering its id. */
async function workspaceOf(send, cookieFor, email, displayName) {
  const created = await send('POST', '/workspaces', await cookieFor(email), { displayName })
  assert.equal(created.status, 201)
  return (await created.json()).id
}

test(
  'PUT site workspace (#663): a workspace owner with no seat on the site is refused, for an owned site and an ownerless one, and nothing moves',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send } = harness(pool)
    await makeSite(pool, 'owned.example', 'owned-example')
    await seatOn(pool, 'owned.example', 'victim@x.y', 'owner')
    await makeSite(pool, 'ownerless.example', 'ownerless-example')
    const workspaceId = await workspaceOf(send, cookieFor, 'stranger@x.y', 'Stranger Co')
    const stranger = await cookieFor('stranger@x.y')

    for (const siteKey of ['owned.example', 'ownerless.example']) {
      const before = await siteState(pool, siteKey)
      const res = await send('PUT', `/api/sites/${siteKey}/workspace`, stranger, { workspaceId })
      assert.equal(res.status, 403, siteKey)
      assert.deepEqual(await res.json(), { code: 'SEAT_NOT_AUTHORIZED' }, siteKey)
      assert.deepEqual(await siteState(pool, siteKey), before, `${siteKey}: nothing may change`)
    }

    // The ownerless site in particular: the caller did not become its owner (the escalation).
    const minted = await pool.query(
      `select 1 from seat s join account a on a.id = s.account_id
       where s.site_key = 'ownerless.example' and a.email = 'stranger@x.y'`
    )
    assert.equal(minted.rowCount, 0)
    const sites = await (await harness(pool).get('/api/sites', stranger)).json()
    assert.ok(!(sites.sites ?? []).some((s) => s.siteKey === 'ownerless.example'))
  }
)

test(
  'PUT site workspace (#663, ADR 0028 Q3): only a LIVE owner seat on THIS site opens the door — every other seat, an editor included, is refused before any write',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send } = harness(pool)
    await makeSite(pool, 'target.example', 'target-example')
    await makeSite(pool, 'other.example', 'other-example')
    await seatOn(pool, 'target.example', 'realowner@x.y', 'owner')

    const cases = [
      { email: 'elsewhere@x.y', seat: ['other.example', 'owner', 'accepted'], code: 'SEAT_NOT_AUTHORIZED' },
      { email: 'pending@x.y', seat: ['target.example', 'editor', 'pending'], code: 'SEAT_NOT_AUTHORIZED' },
      { email: 'revoked@x.y', seat: ['target.example', 'owner', 'revoked'], code: 'SEAT_NOT_AUTHORIZED' },
      { email: 'declined@x.y', seat: ['target.example', 'editor', 'declined'], code: 'SEAT_NOT_AUTHORIZED' },
      { email: 'viewer@x.y', seat: ['target.example', 'viewer', 'accepted'], code: 'NOT_SITE_OWNER' },
      // Declaring where a site belongs is administration: an Editor edits the site, an Owner places it.
      { email: 'editor@x.y', seat: ['target.example', 'editor', 'accepted'], code: 'NOT_SITE_OWNER' }
    ]
    for (const { email, seat, code } of cases) {
      await seatOn(pool, seat[0], email, seat[1], seat[2])
      const workspaceId = await workspaceOf(send, cookieFor, email, `Co ${email}`)
      const before = await siteState(pool, 'target.example')
      const res = await send('PUT', '/api/sites/target.example/workspace', await cookieFor(email), {
        workspaceId
      })
      assert.equal(res.status, 403, email)
      assert.deepEqual(await res.json(), { code }, email)
      assert.deepEqual(await siteState(pool, 'target.example'), before, `${email}: nothing may change`)
    }
  }
)

test(
  'PUT site workspace (#663): a site owner declares, repeats idempotently, and is refused once the seat is revoked',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, get, send } = harness(pool)
    await makeSite(pool, 'mine.example', 'mine-example')
    const ownerId = await seatOn(pool, 'mine.example', 'owner@x.y', 'owner')
    const workspaceId = await workspaceOf(send, cookieFor, 'owner@x.y', 'Mine Co')
    const cookie = await cookieFor('owner@x.y')

    const undeclared = await get('/api/sites/mine.example/workspace', cookie)
    assert.deepEqual(await undeclared.json(), { workspace: null })

    for (let i = 0; i < 2; i += 1) {
      const res = await send('PUT', '/api/sites/mine.example/workspace', cookie, { workspaceId })
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { siteKey: 'mine.example', workspaceId })
    }
    const state = await siteState(pool, 'mine.example')
    assert.deepEqual(state.links, [workspaceId])
    assert.deepEqual(state.seats, [
      { email: 'owner@x.y', role: 'owner', accepted: true, revoked: false, declined: false }
    ])
    const read = await get('/api/sites/mine.example/workspace', cookie)
    assert.deepEqual(await read.json(), { workspace: { id: workspaceId, displayName: 'Mine Co' } })

    // A site must keep one owner (`seat_keep_one_owner`), so a co-owner stays behind.
    await seatOn(pool, 'mine.example', 'coowner@x.y', 'owner')
    await pool.query(
      `update seat set revoked_at = now() where site_key = 'mine.example' and account_id = $1`,
      [ownerId]
    )
    const after = await send('PUT', '/api/sites/mine.example/workspace', cookie, { workspaceId })
    assert.equal(after.status, 403)
    assert.deepEqual(await after.json(), { code: 'SEAT_NOT_AUTHORIZED' })
  }
)

test(
  'PUT site workspace (#663, ADR 0028 Q3): a site EDITOR is refused, even on an ownerless site, and nothing is written',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send } = harness(pool)
    await makeSite(pool, 'editoronly.example', 'editoronly-example')
    await seatOn(pool, 'editoronly.example', 'siteeditor@x.y', 'editor')
    // The editor owns the target workspace: the site's own seat still decides.
    const workspaceId = await workspaceOf(send, cookieFor, 'siteeditor@x.y', 'Editor Co')
    const before = await siteState(pool, 'editoronly.example')

    const res = await send(
      'PUT',
      '/api/sites/editoronly.example/workspace',
      await cookieFor('siteeditor@x.y'),
      { workspaceId }
    )
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'NOT_SITE_OWNER' })
    assert.deepEqual(await siteState(pool, 'editoronly.example'), before)
    assert.deepEqual(before, {
      links: [],
      seats: [{ email: 'siteeditor@x.y', role: 'editor', accepted: true, revoked: false, declined: false }]
    })
  }
)

test(
  'PUT site workspace (ADR 0028 Q3): a site owner who is only an EDITOR of the target workspace is refused, and nothing moves',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send } = harness(pool)
    await makeSite(pool, 'placed.example', 'placed-example')
    await seatOn(pool, 'placed.example', 'placer@x.y', 'owner')
    const agencyWs = await workspaceOf(send, cookieFor, 'boss@x.y', 'Boss Co')
    const boss = await cookieFor('boss@x.y')
    assert.equal(
      (await send('POST', `/workspaces/${agencyWs}/seats`, boss, { email: 'placer@x.y', role: 'editor' }))
        .status,
      201
    )
    const placer = await cookieFor('placer@x.y')
    assert.equal((await send('POST', `/me/workspaces/${agencyWs}/accept`, placer)).status, 200)
    const before = await siteState(pool, 'placed.example')

    const res = await send('PUT', '/api/sites/placed.example/workspace', placer, { workspaceId: agencyWs })
    assert.equal(res.status, 403)
    assert.deepEqual(await res.json(), { code: 'NOT_SITE_OWNER' })
    assert.deepEqual(await siteState(pool, 'placed.example'), before)
  }
)

test(
  'PUT site workspace (#663, ADR 0028 Q3): moving between workspaces needs an owner seat on BOTH sides, on top of the site owner seat',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, get, send } = harness(pool)
    await makeSite(pool, 'moving.example', 'moving-example')
    await seatOn(pool, 'moving.example', 'siteowner@x.y', 'owner')
    await seatOn(pool, 'moving.example', 'agency@x.y', 'owner')
    const agencyWs = await workspaceOf(send, cookieFor, 'agency@x.y', 'Agency One')
    const ownerWs = await workspaceOf(send, cookieFor, 'siteowner@x.y', 'Owner Own')
    const agency = await cookieFor('agency@x.y')
    const siteOwner = await cookieFor('siteowner@x.y')

    assert.equal(
      (await send('PUT', '/api/sites/moving.example/workspace', agency, { workspaceId: agencyWs })).status,
      200
    )

    // Site owner, owner of the destination, but nothing on the workspace the site sits in: 409.
    const refused = await send('PUT', '/api/sites/moving.example/workspace', siteOwner, {
      workspaceId: ownerWs
    })
    assert.equal(refused.status, 409)
    assert.deepEqual(await refused.json(), {
      code: 'SITE_HAS_OWNER',
      workspace: { id: agencyWs, displayName: 'Agency One' }
    })
    assert.deepEqual((await siteState(pool, 'moving.example')).links, [agencyWs])

    // A third party on BOTH workspaces, but with no site seat: still refused (403).
    const bothSides = 'both@x.y'
    for (const [ws, by] of [
      [agencyWs, agency],
      [ownerWs, siteOwner]
    ]) {
      assert.equal(
        (await send('POST', `/workspaces/${ws}/seats`, by, { email: bothSides, role: 'editor' })).status,
        201
      )
      assert.equal(
        (await send('POST', `/me/workspaces/${ws}/accept`, await cookieFor(bothSides))).status,
        200
      )
    }
    const noSeat = await send('PUT', '/api/sites/moving.example/workspace', await cookieFor(bothSides), {
      workspaceId: ownerWs
    })
    assert.equal(noSeat.status, 403)
    assert.deepEqual(await noSeat.json(), { code: 'SEAT_NOT_AUTHORIZED' })
    assert.deepEqual((await siteState(pool, 'moving.example')).links, [agencyWs])

    // The site owner made an EDITOR of the current workspace: still not enough to take the site out.
    assert.equal(
      (
        await send('POST', `/workspaces/${agencyWs}/seats`, agency, {
          email: 'siteowner@x.y',
          role: 'editor'
        })
      ).status,
      201
    )
    assert.equal((await send('POST', `/me/workspaces/${agencyWs}/accept`, siteOwner)).status, 200)
    const asEditor = await send('PUT', '/api/sites/moving.example/workspace', siteOwner, {
      workspaceId: ownerWs
    })
    assert.equal(asEditor.status, 409)
    assert.equal((await asEditor.json()).code, 'SITE_HAS_OWNER')
    assert.deepEqual((await siteState(pool, 'moving.example')).links, [agencyWs])

    // Promoted to Owner of the current workspace from its roster: the move goes through.
    const siteOwnerId = await accountId(pool, 'siteowner@x.y')
    const promoted = await send('PATCH', `/workspaces/${agencyWs}/seats/${siteOwnerId}`, agency, {
      role: 'owner'
    })
    assert.equal(promoted.status, 200)
    const moved = await send('PUT', '/api/sites/moving.example/workspace', siteOwner, {
      workspaceId: ownerWs
    })
    assert.equal(moved.status, 200)
    assert.deepEqual(await moved.json(), { siteKey: 'moving.example', workspaceId: ownerWs })
    assert.deepEqual((await siteState(pool, 'moving.example')).links, [ownerWs])
    const read = await get('/api/sites/moving.example/workspace', siteOwner)
    assert.deepEqual(await read.json(), { workspace: { id: ownerWs, displayName: 'Owner Own' } })
  }
)

test(
  'PUT site workspace (#663): a bad session, body or key is refused before anything is written',
  opts,
  async () => {
    const { pool } = db
    const { app, cookieFor, send } = harness(pool)
    await makeSite(pool, 'input.example', 'input-example')
    await seatOn(pool, 'input.example', 'owner@x.y', 'owner')
    const workspaceId = await workspaceOf(send, cookieFor, 'owner@x.y', 'Input Co')
    const cookie = await cookieFor('owner@x.y')
    const before = await siteState(pool, 'input.example')

    assert.equal(
      (await send('PUT', '/api/sites/input.example/workspace', undefined, { workspaceId })).status,
      401
    )
    assert.equal(
      (await send('PUT', '/api/sites/input.example/workspace', 'tracy_sess=forged', { workspaceId })).status,
      401
    )
    const raw = (body) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/input.example/workspace', {
          method: 'PUT',
          headers: { cookie, 'content-type': 'application/json' },
          ...(body === undefined ? {} : { body })
        })
      )
    for (const body of [
      undefined,
      '',
      '{not json',
      '{}',
      '{"workspaceId":42}',
      '{"workspaceId":"not-a-uuid"}'
    ]) {
      const res = await raw(body)
      assert.equal(res.status, 400, String(body))
      assert.deepEqual(await res.json(), { code: 'INVALID_REQUEST' }, String(body))
    }
    // A key that is not a host at all, and a real-looking one that names no site: no grant, refused.
    for (const key of ['not a host', 'missing.example']) {
      const res = await send('PUT', `/api/sites/${encodeURIComponent(key)}/workspace`, cookie, {
        workspaceId
      })
      assert.equal(res.status, 403, key)
      assert.deepEqual(await res.json(), { code: 'SEAT_NOT_AUTHORIZED' }, key)
    }
    assert.deepEqual(await siteState(pool, 'input.example'), before)
    const anyLink = await pool.query('select count(*)::int as n from workspace_site')
    assert.equal(anyLink.rows[0].n, 0)
  }
)

/** `pool` with a fault planted: any `query` whose SQL matches `pattern` throws, on the pool and on
 *  every client it hands out. Everything else passes straight through. */
function faultyPool(pool, pattern) {
  const fail = (text) => {
    if (pattern.test(typeof text === 'string' ? text : (text?.text ?? ''))) throw new Error('planted fault')
  }
  return new Proxy(pool, {
    get(target, prop) {
      if (prop === 'query') {
        return async (text, ...rest) => {
          fail(text)
          return target.query(text, ...rest)
        }
      }
      if (prop === 'connect') {
        return async () => {
          const client = await target.connect()
          return new Proxy(client, {
            get(inner, p) {
              if (p === 'query') {
                return async (text, ...rest) => {
                  if (!/^(begin|commit|rollback)$/i.test(String(text).trim())) fail(text)
                  return inner.query(text, ...rest)
                }
              }
              const v = inner[p]
              return typeof v === 'function' ? v.bind(inner) : v
            }
          })
        }
      }
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    }
  })
}

test(
  'PUT site workspace (#663): a failed site-seat lookup is a 500, never a fallback to the workspace grant',
  opts,
  async () => {
    const { pool } = db
    const setup = harness(pool)
    await makeSite(pool, 'fault.example', 'fault-example')
    await seatOn(pool, 'fault.example', 'owner@x.y', 'owner')
    const workspaceId = await workspaceOf(setup.send, setup.cookieFor, 'owner@x.y', 'Fault Co')
    const before = await siteState(pool, 'fault.example')

    const broken = harness(faultyPool(pool, /from seat\s+where account_id/i))
    const res = await broken.send(
      'PUT',
      '/api/sites/fault.example/workspace',
      await broken.cookieFor('owner@x.y'),
      {
        workspaceId
      }
    )
    assert.equal(res.status, 500)
    assert.deepEqual(await siteState(pool, 'fault.example'), before)
  }
)

test(
  'PUT site workspace (#663): a failed link write rolls back — the site stays where it was and no seat appears',
  opts,
  async () => {
    const { pool } = db
    const setup = harness(pool)
    await makeSite(pool, 'rollback.example', 'rollback-example')
    await seatOn(pool, 'rollback.example', 'owner@x.y', 'owner')
    const first = await workspaceOf(setup.send, setup.cookieFor, 'owner@x.y', 'First Co')
    const second = await workspaceOf(setup.send, setup.cookieFor, 'owner@x.y', 'Second Co')
    const cookie = await setup.cookieFor('owner@x.y')
    assert.equal(
      (await setup.send('PUT', '/api/sites/rollback.example/workspace', cookie, { workspaceId: first }))
        .status,
      200
    )
    const before = await siteState(pool, 'rollback.example')

    const broken = harness(faultyPool(pool, /insert into workspace_site/i))
    const res = await broken.send('PUT', '/api/sites/rollback.example/workspace', cookie, {
      workspaceId: second
    })
    assert.equal(res.status, 500)
    assert.deepEqual(await siteState(pool, 'rollback.example'), before)
    assert.deepEqual(before.links, [first])
  }
)

test(
  'PUT site workspace (#663): the creator of a brand-new site already holds its owner seat and declares it',
  opts,
  async () => {
    const { pool } = db
    const config = readConfig(env)
    const fetchImpl = async (input) => {
      const u = new URL(String(input))
      if (u.pathname === '/_host/provision')
        return new Response(JSON.stringify({ jobId: 'job-1' }), { status: 200 })
      if (u.pathname.startsWith('/_host/jobs/')) {
        return new Response(JSON.stringify({ state: 'done', port: 8123 }), { status: 200 })
      }
      return new Response(null, { status: 404 })
    }
    const { hostCall, hostJob } = await import('../src/host/client.js')
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, config),
      host: { hostCall, hostJob },
      fetchImpl
    })
    const { mintSession } = await import('../src/lib/session.js')
    const cookie = `tracy_sess=${await mintSession('creator@x.y', config.sessionSecret)}`
    const send = (method, path, body) =>
      app.fetch(
        new Request(`http://tracy.test${path}`, {
          method,
          headers: { cookie, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        })
      )

    const created = await send('POST', '/api/sites', { label: 'lantern', platform: 'wordpress' })
    assert.equal(created.status, 202, JSON.stringify(await created.clone().json()))
    const { siteKey } = await created.json()
    assert.ok(siteKey)

    const ws = await send('POST', '/workspaces', { displayName: 'Creator Co' })
    assert.equal(ws.status, 201)
    const { id: workspaceId } = await ws.json()

    const declared = await send('PUT', `/api/sites/${siteKey}/workspace`, { workspaceId })
    assert.equal(declared.status, 200)
    assert.deepEqual(await declared.json(), { siteKey, workspaceId })
    const state = await siteState(pool, siteKey)
    assert.deepEqual(state.links, [workspaceId])
    assert.deepEqual(state.seats, [
      { email: 'creator@x.y', role: 'owner', accepted: true, revoked: false, declined: false }
    ])
  }
)

test(
  'workspace roster (ADR 0028): editors invite viewers and editors, viewers invite nobody, only owners change or remove',
  opts,
  async () => {
    const { pool } = db
    const { cookieFor, send } = harness(pool)
    const created = await send('POST', '/workspaces', await cookieFor('o@x.y'), {
      displayName: 'Three Roles Co'
    })
    const { id: ws } = await created.json()
    const join = async (email, role) => {
      assert.equal(
        (await send('POST', `/workspaces/${ws}/seats`, await cookieFor('o@x.y'), { email, role })).status,
        201
      )
      assert.equal((await send('POST', `/me/workspaces/${ws}/accept`, await cookieFor(email))).status, 200)
      return accountId(pool, email)
    }
    const editorId = await join('ed@x.y', 'editor')
    const viewerId = await join('vi@x.y', 'viewer')
    const editor = await cookieFor('ed@x.y')
    const viewer = await cookieFor('vi@x.y')

    // Owners are never invited, and the retired roles are no role at all.
    for (const role of ['owner', 'admin', 'developer']) {
      const res = await send('POST', `/workspaces/${ws}/seats`, await cookieFor('o@x.y'), {
        email: 'n@x.y',
        role
      })
      assert.equal(res.status, 400, role)
    }
    const byViewer = await send('POST', `/workspaces/${ws}/seats`, viewer, { email: 'n@x.y', role: 'viewer' })
    assert.deepEqual([byViewer.status, await byViewer.json()], [403, { code: 'NOT_SITE_EDITOR' }])
    const byEditor = await send('POST', `/workspaces/${ws}/seats`, editor, { email: 'n@x.y', role: 'viewer' })
    assert.equal(byEditor.status, 201)
    assert.equal((await byEditor.json()).seat.role, 'viewer')

    // A waiting request to join is approved by an owner only.
    await send('POST', `/me/workspaces/${ws}/join-request`, await cookieFor('asker@x.y'))
    const approveByEditor = await send('POST', `/workspaces/${ws}/seats`, editor, {
      email: 'asker@x.y',
      role: 'editor'
    })
    assert.deepEqual(
      [approveByEditor.status, await approveByEditor.json()],
      [403, { code: 'NOT_SITE_OWNER' }]
    )

    for (const [method, body] of [
      ['PATCH', { role: 'editor' }],
      ['DELETE', undefined]
    ]) {
      const res = await send(method, `/workspaces/${ws}/seats/${viewerId}`, editor, body)
      assert.deepEqual([res.status, await res.json()], [403, { code: 'NOT_SITE_OWNER' }], method)
    }
    const promoted = await send('PATCH', `/workspaces/${ws}/seats/${viewerId}`, await cookieFor('o@x.y'), {
      role: 'editor'
    })
    assert.deepEqual(await promoted.json(), { id: viewerId, role: 'editor' })
    const retired = await send('PATCH', `/workspaces/${ws}/seats/${editorId}`, await cookieFor('o@x.y'), {
      role: 'admin'
    })
    assert.equal(retired.status, 400)
  }
)

test(
  'workspace roster (ADR 0028): Tracy staff keep their ranks; a customer role never lands in tracy_admin',
  opts,
  async () => {
    const { pool } = db
    const { workspaceId } = await seedTracyAdmin(pool, 'boss@tracy.test', 'owner')
    const { cookieFor, send } = harness(pool)
    const boss = await cookieFor('boss@tracy.test')
    const invited = await send('POST', `/workspaces/${workspaceId}/seats`, boss, {
      email: 'x@tracy.test',
      role: 'editor'
    })
    assert.equal(invited.status, 400)

    assert.equal(
      (await send('POST', '/tracy-admin/members', boss, { email: 'dev@tracy.test', role: 'developer' }))
        .status,
      201
    )
    const devId = await accountId(pool, 'dev@tracy.test')
    const toAdmin = await send('PATCH', `/workspaces/${workspaceId}/seats/${devId}`, boss, { role: 'admin' })
    assert.deepEqual(await toAdmin.json(), { id: devId, role: 'admin' })
    const toViewer = await send('PATCH', `/workspaces/${workspaceId}/seats/${devId}`, boss, {
      role: 'viewer'
    })
    assert.equal(toViewer.status, 400)
  }
)

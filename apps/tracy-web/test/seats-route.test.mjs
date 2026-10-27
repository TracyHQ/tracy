import assert from 'node:assert/strict'
import { test, after, before, beforeEach } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

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

function harness(pool, { seatDoor } = {}) {
  const sent = []
  const mail = {
    send: async (m) => {
      sent.push(m)
    }
  }
  const config = readConfig(env)
  const app = buildApp({ config, pool, mail, sites: dbSitesResolver(pool, config), seatDoor })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
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
  return { app, sent, config, cookieFor, get, send }
}

async function makeSite(pool, siteKey, label) {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
}

async function makeOwner(pool, siteKey, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())`,
    [siteKey, rows[0].id]
  )
  return rows[0].id
}

async function accountId(pool, email) {
  const { rows } = await pool.query('select id from account where email = $1', [email])
  return rows[0]?.id ?? null
}

function tokenFrom(mailText) {
  const link = mailText.match(/https?:\/\/\S+?\/invite\/([\w.-]+)/)
  assert.ok(link, `no invite link in mail text:\n${mailText}`)
  return link[1]
}

test('GET /api/sites: 401 signed out, {sites:[]} for a signed-in stranger', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  const anon = await get('/api/sites')
  assert.equal(anon.status, 401)
  assert.deepEqual(await anon.json(), { code: 'NOT_SIGNED_IN' })

  const stranger = await get('/api/sites', await cookieFor('nobody@x.y'))
  assert.equal(stranger.status, 200)
  assert.deepEqual(await stranger.json(), { addressPrefix: '', sites: [] })
})

test('each My Sites row names the folder the seat works in on the host (/site/<label>)', opts, async () => {
  const { pool } = db
  // An imported site's label is not the first part of its key: the folder comes from the stored label.
  await makeSite(pool, 'shop.customer.example', 'shop-customer-example-1a2b3c')
  await makeOwner(pool, 'shop.customer.example', 'owner@x.y')
  const { cookieFor, get } = harness(pool)
  const mine = await get('/api/sites', await cookieFor('owner@x.y'))
  assert.equal(mine.status, 200)
  const [row] = (await mine.json()).sites
  assert.equal(row.siteKey, 'shop.customer.example')
  assert.equal(row.folder, '/site/shop-customer-example-1a2b3c')
})

test(
  'owner invites an editor over two sites; the editor accepts by link; My Sites shows both; owner revokes one',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'one.example', 'one-example')
    await makeSite(pool, 'two.example', 'two-example')
    await makeOwner(pool, 'one.example', 'owner@x.y')
    await makeOwner(pool, 'two.example', 'owner@x.y')

    const { sent, cookieFor, get, send } = harness(pool)
    const ownerCookie = await cookieFor('owner@x.y')
    const editorCookie = await cookieFor('e@x.y')

    const invited = await send('POST', '/api/team/invite', ownerCookie, {
      emails: ['e@x.y'],
      role: 'editor',
      siteKeys: ['one.example', 'two.example']
    })
    assert.equal(invited.status, 200)
    const invitedBody = await invited.json()
    assert.equal(invitedBody.results[0].notified, true)
    assert.deepEqual(
      invitedBody.results[0].sites.map((s) => s.outcome),
      ['invited', 'invited']
    )
    assert.equal(sent.length, 1)
    const token = tokenFrom(sent[0].text)

    const accepted = await get(`/invite/${token}`, editorCookie)
    assert.equal(accepted.status, 200)
    assert.match(await accepted.text(), /You are on 2 sites now/)
    const signals = (
      await pool.query(
        "select kind,count(*)::int as n from ops_signal where kind in ('team.invite','team.accept') group by kind order by kind"
      )
    ).rows
    assert.deepEqual(signals, [
      { kind: 'team.accept', n: 2 },
      { kind: 'team.invite', n: 2 }
    ])

    const mine = await get('/api/sites', editorCookie)
    assert.equal(mine.status, 200)
    const mineBody = await mine.json()
    assert.equal(mineBody.sites.length, 2)
    for (const row of mineBody.sites) {
      assert.equal(row.status, 'accepted')
      assert.equal(row.role, 'editor')
    }

    const editorId = await accountId(pool, 'e@x.y')
    const revoked = await send('DELETE', `/api/sites/one.example/seats/${editorId}`, ownerCookie, {
      kind: 'revoke'
    })
    assert.equal(revoked.status, 200)
    assert.deepEqual(await revoked.json(), { revoked: true, kind: 'revoke' })

    const mineAfter = await get('/api/sites', editorCookie)
    const mineAfterBody = await mineAfter.json()
    assert.equal(mineAfterBody.sites.length, 1)
    assert.equal(mineAfterBody.sites[0].siteKey, 'two.example')

    // DEVIATION FROM THE BRIEF'S OWN SKETCH, FOLLOWING THE WORKER INSTEAD (task instructions:
    // "the authority for behaviour is the shipped Worker, not the brief"). The brief's interface
    // line reads "the roster of every site the viewer is admin of" and its test sketch expects 403 here
    // for a non-admin caller — but the Worker's own `apiTeam`/`handleRoster` carry no such gate:
    // any LIVE grant (`grantFor`), any role, may read a site's roster ("A team sees each other — like
    // collaborators on GitHub", index.js:4091). `handleRoster`'s only guard is a live grant,
    // and `apiTeam` populates `seats` for every `accepted` site regardless of the caller's role
    // on it. So the editor here gets 200 with the one remaining site's roster, not 403.
    const team = await get('/api/team', editorCookie)
    assert.equal(team.status, 200)
    const teamBody = await team.json()
    assert.equal(teamBody.sites.length, 1)
    assert.equal(teamBody.sites[0].siteKey, 'two.example')
    assert.ok(Array.isArray(teamBody.sites[0].seats), 'an accepted seat can read its own site roster')
  }
)

test(
  'POST /api/team/invite: a site the caller has no seat on is refused per-site, not for the whole call',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'mine.example', 'mine-example')
    await makeSite(pool, 'notmine.example', 'notmine-example')
    await makeOwner(pool, 'mine.example', 'owner@x.y')

    const { sent, cookieFor, send } = harness(pool)
    const res = await send('POST', '/api/team/invite', await cookieFor('owner@x.y'), {
      emails: ['e@x.y'],
      role: 'editor',
      siteKeys: ['mine.example', 'notmine.example']
    })
    assert.equal(res.status, 200)
    const body = await res.json()
    const bySite = Object.fromEntries(body.results[0].sites.map((s) => [s.siteKey, s]))
    assert.equal(bySite['mine.example'].outcome, 'invited')
    assert.deepEqual(bySite['notmine.example'], {
      siteKey: 'notmine.example',
      outcome: 'refused',
      code: 'SEAT_NOT_AUTHORIZED'
    })
    assert.equal(sent.length, 1, 'one mail still goes out, for the one site that went through')
  }
)

test(
  'POST /api/team/invite: a viewer invites nobody (NOT_SITE_EDITOR), and owner or a retired role is never invited',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.example', 'x-example')
    const ownerId = await makeOwner(pool, 'x.example', 'owner@x.y')
    for (const [email, role] of [
      ['viewer@x.y', 'viewer'],
      ['editor@x.y', 'editor']
    ]) {
      await pool.query(`insert into account (email) values ($1)`, [email])
      await pool.query(
        `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $4, now())`,
        ['x.example', await accountId(pool, email), role, ownerId]
      )
    }

    const { sent, cookieFor, send } = harness(pool)
    const res = await send('POST', '/api/team/invite', await cookieFor('viewer@x.y'), {
      emails: ['new@x.y'],
      role: 'viewer',
      siteKeys: ['x.example']
    })
    const body = await res.json()
    assert.equal(body.results[0].sites[0].code, 'NOT_SITE_EDITOR')
    assert.equal(sent.length, 0)
    assert.equal(await accountId(pool, 'new@x.y'), null, 'nobody is created when every site is refused')

    for (const role of ['owner', 'admin', 'developer']) {
      for (const by of ['owner@x.y', 'editor@x.y']) {
        const refused = await send('POST', '/api/team/invite', await cookieFor(by), {
          emails: ['new@x.y'],
          role,
          siteKeys: ['x.example']
        })
        assert.equal(refused.status, 400, `${by} inviting as ${role}`)
      }
    }

    // An editor invites a viewer: the row is written with the role the invitation names.
    const invited = await send('POST', '/api/team/invite', await cookieFor('editor@x.y'), {
      emails: ['new@x.y'],
      role: 'viewer',
      siteKeys: ['x.example']
    })
    assert.equal((await invited.json()).results[0].sites[0].outcome, 'invited')
    const { rows } = await pool.query('select role from seat where account_id = $1', [
      await accountId(pool, 'new@x.y')
    ])
    assert.deepEqual(rows, [{ role: 'viewer' }])
  }
)

test(
  'PATCH/DELETE seats: change a role, cannot revoke the last owner, cannot revoke yourself',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'roles.example', 'roles-example')
    const ownerId = await makeOwner(pool, 'roles.example', 'owner@x.y')
    const memberId = await pool
      .query(
        `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
        ['m@x.y']
      )
      .then((r) => r.rows[0].id)
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'editor', $3, now())`,
      ['roles.example', memberId, ownerId]
    )

    const { cookieFor, send } = harness(pool)
    const ownerCookie = await cookieFor('owner@x.y')

    const promoted = await send('PATCH', `/api/sites/roles.example/seats/${memberId}`, ownerCookie, {
      role: 'viewer'
    })
    assert.equal(promoted.status, 200)
    assert.deepEqual(await promoted.json(), { id: memberId, role: 'viewer' })
    // A retired role is not a role any more.
    const retired = await send('PATCH', `/api/sites/roles.example/seats/${memberId}`, ownerCookie, {
      role: 'admin'
    })
    assert.equal(retired.status, 400)

    const selfRevoke = await send('DELETE', `/api/sites/roles.example/seats/${ownerId}`, ownerCookie, {
      kind: 'revoke'
    })
    assert.equal(selfRevoke.status, 403)
    assert.deepEqual(await selfRevoke.json(), { code: 'CANNOT_REVOKE_SELF' })

    // Promote the member to owner, then only the ORIGINAL owner may be demoted (two owners now).
    await send('PATCH', `/api/sites/roles.example/seats/${memberId}`, ownerCookie, { role: 'owner' })
    const memberCookie = await cookieFor('m@x.y')
    const demoteOriginal = await send('PATCH', `/api/sites/roles.example/seats/${ownerId}`, memberCookie, {
      role: 'editor'
    })
    assert.equal(demoteOriginal.status, 200)

    // Now only one owner (the member) is left — demoting them is refused.
    const demoteLast = await send('PATCH', `/api/sites/roles.example/seats/${memberId}`, memberCookie, {
      role: 'editor'
    })
    assert.equal(demoteLast.status, 403)
    assert.deepEqual(await demoteLast.json(), { code: 'CANNOT_REVOKE_LAST_OWNER' })
  }
)

test(
  'DELETE seats: the count of live Owners refuses the removal of an Owner row before any write',
  opts,
  async () => {
    // WHAT THIS CAN AND CANNOT SHOW. An Owner never removes themselves (CANNOT_REVOKE_SELF) and
    // only a live Owner may call this door, so a second ACCEPTED Owner as the target always makes
    // the count two; with that target the door's own count never decides, the database trigger
    // does (`seat-actions.test.mjs`). The count decides alone for an Owner row nobody has
    // accepted: an invitation raised to Owner from the Team list. The trigger does not look at
    // such a row, so the answer below is the door's count and nothing else. It shows the count is
    // read before the write; it does not show a site left without an Owner.
    const { pool } = db
    await makeSite(pool, 'count.example', 'count-example')
    const ownerId = await makeOwner(pool, 'count.example', 'owner@x.y')
    const { cookieFor, send } = harness(pool)
    const ownerCookie = await cookieFor('owner@x.y')

    const invited = await send('POST', '/api/team/invite', ownerCookie, {
      emails: ['next@x.y'],
      role: 'editor',
      siteKeys: ['count.example']
    })
    assert.equal(invited.status, 200)
    const nextId = await accountId(pool, 'next@x.y')
    const raised = await send('PATCH', `/api/sites/count.example/seats/${nextId}`, ownerCookie, {
      role: 'owner'
    })
    assert.deepEqual([raised.status, await raised.json()], [200, { id: nextId, role: 'owner' }])

    const rowOf = async (id) =>
      (
        await pool.query(
          `select role, accepted_at is not null as accepted, revoked_at is not null as revoked, removal_kind
           from seat where site_key = 'count.example' and account_id = $1`,
          [id]
        )
      ).rows[0]
    const waiting = { role: 'owner', accepted: false, revoked: false, removal_kind: null }
    const holding = { role: 'owner', accepted: true, revoked: false, removal_kind: null }

    // One live Owner (the caller): the Owner row is not removed, and nothing on the book moved.
    const refused = await send('DELETE', `/api/sites/count.example/seats/${nextId}`, ownerCookie, {
      kind: 'cancel_invite'
    })
    assert.deepEqual([refused.status, await refused.json()], [403, { code: 'CANNOT_REVOKE_LAST_OWNER' }])
    assert.deepEqual(await rowOf(nextId), waiting)
    assert.deepEqual(await rowOf(ownerId), holding)

    // Two live Owners: the same request goes through, and both of them keep their seats.
    const secondId = await makeOwner(pool, 'count.example', 'second@x.y')
    const cancelled = await send('DELETE', `/api/sites/count.example/seats/${nextId}`, ownerCookie, {
      kind: 'cancel_invite'
    })
    assert.deepEqual(
      [cancelled.status, await cancelled.json()],
      [200, { revoked: true, kind: 'cancel_invite' }]
    )
    assert.deepEqual(await rowOf(nextId), { ...waiting, revoked: true, removal_kind: 'cancel_invite' })
    assert.deepEqual(await rowOf(ownerId), holding)
    assert.deepEqual(await rowOf(secondId), holding)
  }
)

test(
  'PATCH/DELETE seats: an editor changes no role and removes nobody — an Owner act (ADR 0028)',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'own.example', 'own-example')
    const ownerId = await makeOwner(pool, 'own.example', 'owner@x.y')
    const ids = {}
    for (const [email, role] of [
      ['ed@x.y', 'editor'],
      ['vi@x.y', 'viewer']
    ]) {
      await pool.query(`insert into account (email) values ($1)`, [email])
      ids[email] = await accountId(pool, email)
      await pool.query(
        `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $4, now())`,
        ['own.example', ids[email], role, ownerId]
      )
    }
    const { cookieFor, send } = harness(pool)
    const editor = await cookieFor('ed@x.y')
    const patch = await send('PATCH', `/api/sites/own.example/seats/${ids['vi@x.y']}`, editor, {
      role: 'editor'
    })
    assert.deepEqual([patch.status, await patch.json()], [403, { code: 'NOT_SITE_OWNER' }])
    const del = await send('DELETE', `/api/sites/own.example/seats/${ids['vi@x.y']}`, editor, {
      kind: 'revoke'
    })
    assert.deepEqual([del.status, await del.json()], [403, { code: 'NOT_SITE_OWNER' }])
    const { rows } = await pool.query('select role, revoked_at from seat where account_id = $1', [
      ids['vi@x.y']
    ])
    assert.deepEqual(rows, [{ role: 'viewer', revoked_at: null }])
  }
)

test('POST /api/sites/:key/leave: the last owner cannot leave', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'lone.example', 'lone-example')
  await makeOwner(pool, 'lone.example', 'owner@x.y')
  const { cookieFor, send } = harness(pool)
  const res = await send('POST', '/api/sites/lone.example/leave', await cookieFor('owner@x.y'))
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'CANNOT_REVOKE_LAST_OWNER' })
})

test(
  'POST /api/sites/:key/leave: a successful leave answers { left: true }, not { revoked: true }',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'canleave.example', 'canleave-example')
    const ownerId = await makeOwner(pool, 'canleave.example', 'owner@x.y')
    const memberId = await pool
      .query(
        `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
        ['m@x.y']
      )
      .then((r) => r.rows[0].id)
    // A non-owner leaving never trips the last-owner guard, whether or not it also holds.
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'editor', $3, now())`,
      ['canleave.example', memberId, ownerId]
    )
    const { cookieFor, send } = harness(pool)
    const res = await send('POST', '/api/sites/canleave.example/leave', await cookieFor('m@x.y'))
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { left: true })
  }
)

test(
  'DELETE /api/sites/:key/seats/:grant: the revoke calls the seat door for every configured host, and reports lanes',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'lanes.example', 'lanes-example')
    const ownerId = await makeOwner(pool, 'lanes.example', 'owner@x.y')
    const memberId = await pool
      .query(
        `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
        ['m@x.y']
      )
      .then((r) => r.rows[0].id)
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'editor', $3, now())`,
      ['lanes.example', memberId, ownerId]
    )

    const calls = []
    const { cookieFor, send } = harness(pool, {
      seatDoor: {
        revokeSeatAtDoor: async (args) => {
          calls.push(args)
          return { ok: true, revoked: 1 }
        }
      }
    })
    const res = await send(
      'DELETE',
      `/api/sites/lanes.example/seats/${memberId}`,
      await cookieFor('owner@x.y'),
      { kind: 'revoke' }
    )
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      revoked: true,
      kind: 'revoke',
      lanes: [{ lane: 'local', ok: true, revoked: 1 }]
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].origin, 'http://dsh') // HOST_local_DSH_ORIGIN
    assert.equal(calls[0].secret, 'k') // SEAT_local_SECRET
    assert.equal(calls[0].email, 'm@x.y')
    assert.equal(calls[0].site, 'lanes.example')
  }
)

test(
  'DELETE /api/sites/:key/seats/:grant: a seat door that cannot be reached does not fail the revoke',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'downdoor.example', 'downdoor-example')
    const ownerId = await makeOwner(pool, 'downdoor.example', 'owner@x.y')
    const memberId = await pool
      .query(
        `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
        ['m@x.y']
      )
      .then((r) => r.rows[0].id)
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'editor', $3, now())`,
      ['downdoor.example', memberId, ownerId]
    )

    const originalWarn = console.warn
    console.warn = () => {} // the failure is expected and logged on purpose; keep test output clean
    try {
      const { cookieFor, send } = harness(pool, {
        seatDoor: {
          revokeSeatAtDoor: async () => {
            throw new Error('ECONNREFUSED')
          }
        }
      })
      const res = await send(
        'DELETE',
        `/api/sites/downdoor.example/seats/${memberId}`,
        await cookieFor('owner@x.y'),
        { kind: 'revoke' }
      )
      assert.equal(res.status, 200, 'an unreachable door must not fail an already-committed revoke')
      // The host that did not answer is named, with why, and QUEUED: `cron.js` tells it again
      // (`seat_sync`, 13/09). Never reported as revoked on that host.
      assert.deepEqual(await res.json(), {
        revoked: true,
        kind: 'revoke',
        lanes: [{ lane: 'local', ok: false, revoked: null, error: 'ECONNREFUSED', queued: true }]
      })
      const owed = await pool.query(
        'select kind, host, email, site_key, attempts, last_error from seat_sync where done_at is null'
      )
      assert.deepEqual(owed.rows, [
        {
          kind: 'revoke',
          host: 'local',
          email: 'm@x.y',
          site_key: 'downdoor.example',
          attempts: 1,
          last_error: 'ECONNREFUSED'
        }
      ])
    } finally {
      console.warn = originalWarn
    }
  }
)

test(
  'POST /me/sites/:key/join-request: asking, then asking again is idempotent, then the admin was mailed',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'ask.example', 'ask-example')
    await makeOwner(pool, 'ask.example', 'owner@x.y')
    const { sent, cookieFor, send } = harness(pool)
    const askerCookie = await cookieFor('asker@x.y')

    const first = await send('POST', '/me/sites/ask.example/join-request', askerCookie)
    assert.equal(first.status, 201)
    assert.deepEqual(await first.json(), { requested: true, already: false })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'owner@x.y')

    const again = await send('POST', '/me/sites/ask.example/join-request', askerCookie)
    assert.equal(again.status, 200)
    assert.deepEqual(await again.json(), { requested: true, already: true })
    assert.equal(sent.length, 1, 'no second mail for an idempotent repeat')
  }
)

test('POST /me/sites/:key/join-request: a site with no owner is SITE_UNCLAIMED', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'nobody.example', 'nobody-example')
  const { cookieFor, send } = harness(pool)
  const res = await send('POST', '/me/sites/nobody.example/join-request', await cookieFor('asker@x.y'))
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { code: 'SITE_UNCLAIMED' })
})

test(
  'GET /:label/team: unknown label 404s, signed-out redirects to login, a member sees the roster',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'label.example', 'label-example')
    await makeOwner(pool, 'label.example', 'owner@x.y')
    const { get, cookieFor } = harness(pool)

    const unknown = await get('/no-such-label/team')
    assert.equal(unknown.status, 404)

    const anon = await get('/label-example/team')
    assert.equal(anon.status, 303)
    assert.match(anon.headers.get('location'), /^\/login\?next=/)

    const seen = await get('/label-example/team', await cookieFor('owner@x.y'))
    assert.equal(seen.status, 200)
    assert.match(await seen.text(), /owner@x\.y/)

    // `/api/team` (a real door registered above) must win over the `/:label/team` param route —
    // a site whose label happened to be "api" must never be able to shadow it.
    const stranger = await get('/label-example/team', await cookieFor('stranger@x.y'))
    assert.equal(stranger.status, 403)
  }
)

test('a site labelled "api" cannot shadow /api/team or /api/sites', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'api', 'api') // a label that collides with the API prefix, on purpose
  const { get } = harness(pool)
  const team = await get('/api/team')
  assert.equal(team.status, 401) // NOT_SIGNED_IN from the real /api/team door, not /:label/team's 404
  assert.deepEqual(await team.json(), { code: 'NOT_SIGNED_IN' })
})

test(
  'GET/POST /:label/join: ask-to-join page renders, and posting to it writes the same request as the JSON door',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'joinlabel.example', 'joinlabel-example')
    await makeOwner(pool, 'joinlabel.example', 'owner@x.y')
    const { get, send, sent, cookieFor } = harness(pool)
    const askerCookie = await cookieFor('asker@x.y')

    const form = await get('/joinlabel-example/join', askerCookie)
    assert.equal(form.status, 200) // #806: a page that renders is not an error to a monitor or `fetch().ok`
    assert.match(await form.text(), /Request to join joinlabel.example/)

    const posted = await send('POST', '/joinlabel-example/join', askerCookie)
    assert.equal(posted.status, 200)
    assert.match(await posted.text(), /Request sent/)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'owner@x.y')
  }
)

test(
  'GET /:label/join: someone who already HOLDS an invitation is shown the Accept button',
  opts,
  async () => {
    // `joinPage` has always had this state; until 11/09 a GET could not reach it — it was only ever
    // passed after a POST came back ALREADY_INVITED. So an invited person was shown "Ask for
    // access", had to ask for what they already had, and only then met the button. And
    // `workspace/route.js`'s empty-handed page now links people straight here, which makes this the
    // first screen an invited person sees.
    const { pool } = db
    await makeSite(pool, 'invited.example', 'invited-example')
    await makeOwner(pool, 'invited.example', 'owner@x.y')
    const { get, cookieFor } = harness(pool)
    const acct = (await pool.query("insert into account (email) values ('guest@x.y') returning id")).rows[0]
    // Invited and unanswered: no accepted_at, no requested_at — the state between a stranger and
    // a member.
    await pool.query(
      "insert into seat (site_key, account_id, role, granted_by) values ('invited.example', $1, 'editor', $1)",
      [acct.id]
    )
    const res = await get('/invited-example/join', await cookieFor('guest@x.y'))
    const html = await res.text()
    assert.match(html, /You have an invitation/)
    assert.match(html, /Accept invitation/)
    assert.doesNotMatch(html, /Request to join/)
  }
)

test(
  'GET /:label/join?next=...: an already-invited viewer gets an accept button that lands on `next`, sanitised',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'invited.example', 'invited-example')
    await makeOwner(pool, 'invited.example', 'owner@x.y')
    const acct = (
      await pool.query(
        `insert into account (email) values ('invited@x.y') on conflict (email) do update set email = excluded.email returning id`
      )
    ).rows[0]
    // A live, unaccepted, unrequested grant — an open invitation, matching `joinRequest`'s own
    // ALREADY_INVITED branch (`existing && !requested_at && !revoked_at && !declined_at`).
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by) values ('invited.example', $1, 'editor', $1)`,
      [acct.id]
    )
    const { send, config, cookieFor } = harness(pool)
    const invitedCookie = await cookieFor('invited@x.y')

    // Review round 2, finding 3: the accept button used to always land on `/` — this pins it
    // landing on the destination the visitor actually came from instead, sanitised through the
    // same safePath every other redirect in this app uses. `settled: 'invited'` is reached on
    // the POST branch (joinRequest's own ALREADY_INVITED answer), same as the existing test
    // above reaches `requested: true`.
    const res = await send('POST', '/invited-example/join?next=%2Fdeep%2Fpage', invitedCookie)
    assert.equal(res.status, 409)
    const html = await res.text()
    assert.match(html, /You have an invitation/)
    assert.equal(
      html.includes(`data-redirect="${config.origin}/deep/page"`),
      true,
      'accept form should redirect to the sanitised next, not /'
    )
  }
)

test(
  'GET /invite/:token: a wrong-account viewer is told whose invitation it is, not silently refused',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'w.example', 'w-example')
    await makeOwner(pool, 'w.example', 'owner@x.y')
    const { sent, cookieFor, send, get } = harness(pool)
    await send('POST', '/api/team/invite', await cookieFor('owner@x.y'), {
      emails: ['invitee@x.y'],
      role: 'editor',
      siteKeys: ['w.example']
    })
    const token = tokenFrom(sent[0].text)

    const wrong = await get(`/invite/${token}`, await cookieFor('someone-else@x.y'))
    assert.equal(wrong.status, 403)
    assert.match(await wrong.text(), /sent to <!--email_off-->invitee@x.y<!--email_on-->/)

    const anon = await get(`/invite/${token}`)
    assert.equal(anon.status, 303)
    assert.match(anon.headers.get('location'), /^\/login\?next=/)

    const invalid = await get('/invite/not-a-real-token')
    assert.equal(invalid.status, 404)
  }
)

test(
  'GET /invite/:token is rate-limited by token, at the same cap as every other write door here',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'capped.example', 'capped-example')
    await makeOwner(pool, 'capped.example', 'owner@x.y')
    const { sent, cookieFor, send, get } = harness(pool)
    await send('POST', '/api/team/invite', await cookieFor('owner@x.y'), {
      emails: ['invitee@x.y'],
      role: 'editor',
      siteKeys: ['capped.example']
    })
    const token = tokenFrom(sent[0].text)

    // Seed the bucket to one under the cap this door shares with the rest of the cluster
    // (`WRITE_LIMIT_PER_HOUR`, `seats/route.js`) — same technique `test/rate.test.mjs` uses,
    // against the exact key this route computes (`invite-accept:<token>`).
    const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
    await pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, $3)', [
      `invite-accept:${token}`,
      windowStart,
      600
    ])

    const capped = await get(`/invite/${token}`, await cookieFor('invitee@x.y'))
    assert.equal(capped.status, 429)
    assert.match(await capped.text(), /Too many attempts/)
  }
)

// ── copyUrl is the address a person clicks, so it must be the address the site answers on ──────
//
// Chrome pass 2 (`chrome-pass2-sites.md`): on a laptop, `/api/sites` was reporting
// `https://qatest1.localhost/` for a site genuinely serving at `http://qatest1.localhost:8080/`.
// The Worker wrote that literal (`workers/cowork-web/src/worker.js:1566`) and it was right on the
// one origin the Worker ever ran on. My Sites builds four things on this field — the "Live" fact,
// copy-to-clipboard, the live-site tab, and the `/wp-admin` link — so all four pointed nowhere.
test(
  "GET /api/sites: copyUrl is the site's own published address, not a guessed https:// one",
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await makeSite(pool, 'published.example', 'published')
    await makeSite(pool, 'nameless.example', 'nameless')
    await makeOwner(pool, 'published.example', 'owner@x.y')
    await makeOwner(pool, 'nameless.example', 'owner@x.y')
    // What `sites/route.js`'s `localAddress` writes when a local site is provisioned.
    await pool.query('update site set address = $1 where site_key = $2', [
      'http://published.tracy.test:8080/',
      'published.example'
    ])

    const res = await get('/api/sites', await cookieFor('owner@x.y'))
    assert.equal(res.status, 200)
    const byKey = Object.fromEntries((await res.json()).sites.map((s) => [s.siteKey, s]))

    assert.equal(
      byKey['published.example'].copyUrl,
      'http://published.tracy.test:8080/',
      'a site that published an address must be shown THAT address, port and scheme included'
    )
    // No address published yet: the fallback derives scheme and port from `config.origin`
    // (`http://tracy.test`, no port here) rather than writing either down.
    assert.equal(byKey['nameless.example'].copyUrl, 'http://nameless.tracy.test/')
  }
)

// #1037: a connected domain of the customer's own does not move the address a seat holder opens the
// site and its back office under. The CMS stays at its Tracy address — where signing in works — and
// the own domain is the visitors' name for the same site.
test(
  'GET /api/sites: with an own domain connected, copyUrl is still the Tracy address — "Open admin" is built on it',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await makeSite(pool, 'shop.example', 'shop')
    await makeOwner(pool, 'shop.example', 'owner@x.y')
    await pool.query("update site set address = $1, publish = 'published' where site_key = $2", [
      'https://shop.tracy.test/',
      'shop.example'
    ])
    await pool.query(
      `insert into site_name(name, site_key, kind, state, token, routed_at, probe_secret)
       values ('www.customer-shop.com', 'shop.example', 'custom', 'active', repeat('a', 48), now(), repeat('b', 64))`
    )
    const res = await get('/api/sites', await cookieFor('owner@x.y'))
    assert.equal(res.status, 200)
    const listed = (await res.json()).sites.find((s) => s.siteKey === 'shop.example')
    assert.equal(listed.copyUrl, 'https://shop.tracy.test/')
  }
)

// My Sites shows when each site was made, newest first (Akemi, 29/09). The book already keeps
// `site.created_at`; the door has to hand it over, as an ISO string the page can compare.
test('GET /api/sites: each site carries createdAt, the moment the site row was made', opts, async () => {
  const { pool } = db
  const { get, cookieFor } = harness(pool)
  await makeSite(pool, 'older.example', 'older')
  await makeSite(pool, 'newer.example', 'newer')
  await makeOwner(pool, 'older.example', 'owner@x.y')
  await makeOwner(pool, 'newer.example', 'owner@x.y')
  await pool.query('update site set created_at = $1 where site_key = $2', [
    '2026-09-15T08:00:00Z',
    'older.example'
  ])
  await pool.query('update site set created_at = $1 where site_key = $2', [
    '2026-09-29T08:00:00Z',
    'newer.example'
  ])

  const res = await get('/api/sites', await cookieFor('owner@x.y'))
  assert.equal(res.status, 200)
  const byKey = Object.fromEntries((await res.json()).sites.map((s) => [s.siteKey, s]))
  assert.equal(new Date(byKey['older.example'].createdAt).toISOString(), '2026-09-15T08:00:00.000Z')
  assert.equal(new Date(byKey['newer.example'].createdAt).toISOString(), '2026-09-29T08:00:00.000Z')
})

// ── #340: the door every open page reads costs the same whether the viewer holds one site or ten ──
//
// `GET /api/sites` asked `sites.labelOf` once per accepted seat, one query after another, on a door
// the pages of every plugin read. The label now rides the batch read of the `site` table.
test(
  'GET /api/sites: the number of queries does not grow with the number of accepted sites',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    const cookie = await cookieFor('owner@x.y')
    let queries = 0
    const query = pool.query.bind(pool)
    pool.query = (...args) => {
      queries += 1
      return query(...args)
    }
    const count = async () => {
      queries = 0
      const res = await get('/api/sites', cookie)
      assert.equal(res.status, 200)
      return { queries, body: await res.json() }
    }

    await makeSite(pool, 'one.example', 'one')
    await makeOwner(pool, 'one.example', 'owner@x.y')
    // The first request of a sign-in also asks whether it was signed out (`lib/session.js`), once,
    // then the answer is cached; warm that up so both counts are the steady state.
    await count()
    const single = await count()
    assert.equal(single.body.sites.length, 1)

    for (const n of ['two', 'three', 'four']) {
      await makeSite(pool, `${n}.example`, n)
      await makeOwner(pool, `${n}.example`, 'owner@x.y')
    }
    const many = await count()
    assert.equal(many.body.sites.length, 4)
    assert.equal(many.queries, single.queries, 'three more accepted sites must not cost three more queries')
    // Same answer as the per-site lookup gave: the stored label builds the fallback address.
    const byKey = Object.fromEntries(many.body.sites.map((s) => [s.siteKey, s]))
    assert.equal(byKey['three.example'].copyUrl, 'http://three.tracy.test/')
  }
)

// ── #340: a page left open on a deleted site learns that from the first request it makes ──
//
// Measured 24/09 on dev: a tab still open on a deleted site sent both plugins' hellos each time it
// became visible, each redirected to `/<label>/join` and answered 404. `@tracy/core/hello` stops on
// exactly that answer (a join page answering 404 at the end of a redirect); this pins the server half
// it relies on, and that a reload of that page takes the same way — so no plugin boots to greet again.
test(
  'a deleted site: its hello and a reload of its page both end at /<label>/join, and that answers 404',
  opts,
  async () => {
    const { pool } = db
    const { get, send, cookieFor } = harness(pool)
    const cookie = await cookieFor('owner@x.y')
    await makeSite(pool, 'gone.example', 'gone')
    await makeOwner(pool, 'gone.example', 'owner@x.y')
    await pool.query("delete from seat where site_key = 'gone.example'")
    await pool.query("delete from site where site_key = 'gone.example'")

    const hello = await send('POST', '/gone.example/api/tracy-site-tools/hello', cookie)
    const reload = await get('/gone.example/', cookie)
    for (const res of [hello, reload]) {
      assert.equal(res.status, 302)
      const location = res.headers.get('location') ?? ''
      assert.match(new URL(location, 'http://tracy.test').pathname, /^\/[^/]+\/join$/)
      const join = await get(location, cookie)
      assert.equal(join.status, 404, 'the join page of a site the book does not hold is "Unknown site"')
    }
  }
)

// ── P07/P08: the book is written, then every host hears it (plan first-site-build-onboarding §4) ──

async function roleFixture(pool) {
  await pool.query(
    "insert into site (site_key, label, host) values ('rolesite.example', 'rolesite', 'local')"
  )
  const ownerId = await pool
    .query("insert into account (email) values ('owner@x.y') returning id")
    .then((r) => r.rows[0].id)
  const memberId = await pool
    .query("insert into account (email) values ('m@x.y') returning id")
    .then((r) => r.rows[0].id)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('rolesite.example', $1, 'owner', $1, now()), ('rolesite.example', $2, 'viewer', $1, now())`,
    [ownerId, memberId]
  )
  return { ownerId, memberId }
}

test(
  "P07: PATCH role writes the book, then re-mints the seat at every host with the role's fixed toolsets",
  opts,
  async () => {
    const { pool } = db
    const { memberId } = await roleFixture(pool)
    const minted = []
    const { cookieFor, send } = harness(pool, {
      seatDoor: {
        mintSeatSession: async ({ origin, grant }) => {
          minted.push({ origin, grant })
          return 'discarded-token'
        }
      }
    })
    const res = await send(
      'PATCH',
      `/api/sites/rolesite.example/seats/${memberId}`,
      await cookieFor('owner@x.y'),
      {
        role: 'editor'
      }
    )
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), {
      id: memberId,
      role: 'editor',
      lanes: [{ lane: 'local', ok: true }]
    })
    assert.equal(
      (await pool.query('select role from seat where account_id = $1', [memberId])).rows[0].role,
      'editor'
    )
    // The grant the host was handed: the SAME shape `workspace/route.js` mints on a visit — the
    // new role, the site's folder, and the editor's fixed toolsets (ADR 0028).
    assert.deepEqual(minted, [
      {
        origin: 'http://dsh',
        grant: {
          role: 'editor',
          email: 'm@x.y',
          folders: ['/site/rolesite'],
          site: 'rolesite.example',
          toolsets: ['content', 'code', 'site']
        }
      }
    ])
    // A stored site policy changes nothing any more; back to viewer is an EMPTY list, sent as one.
    await pool.query(
      'insert into site_role_policy (site_key, policy) values (\'rolesite.example\', \'{"viewer":{"content":true,"code":true}}\')'
    )
    await send('PATCH', `/api/sites/rolesite.example/seats/${memberId}`, await cookieFor('owner@x.y'), {
      role: 'viewer'
    })
    assert.deepEqual(minted.at(-1).grant.toolsets, [])
    assert.equal((await pool.query('select count(*)::int as n from seat_sync')).rows[0].n, 0)
  }
)

test(
  'P08: a host that does not answer the role change is queued, and the outbox drains it once the host is back',
  opts,
  async () => {
    const { pool } = db
    const { memberId } = await roleFixture(pool)
    const originalWarn = console.warn
    console.warn = () => {}
    try {
      const { cookieFor, send } = harness(pool, {
        seatDoor: {
          mintSeatSession: async () => {
            throw new Error('ECONNREFUSED')
          }
        }
      })
      const res = await send(
        'PATCH',
        `/api/sites/rolesite.example/seats/${memberId}`,
        await cookieFor('owner@x.y'),
        {
          role: 'editor'
        }
      )
      assert.equal(res.status, 200)
      assert.deepEqual((await res.json()).lanes, [
        { lane: 'local', ok: false, error: 'ECONNREFUSED', queued: true }
      ])
      const owed = (await pool.query('select * from seat_sync where done_at is null')).rows
      assert.equal(owed.length, 1)
      assert.equal(owed[0].kind, 'mint')
      assert.deepEqual(owed[0].payload, {
        role: 'editor',
        email: 'm@x.y',
        folders: ['/site/rolesite'],
        site: 'rolesite.example',
        toolsets: ['content', 'code', 'site']
      })

      // The host is back. The outbox — `cron.js`'s `flushSeatSync` — tells it, with the exact
      // grant that was owed, and settles the row.
      const { flushSeatSync } = await import('../src/cron.js')
      const { readConfig } = await import('../src/config.js')
      await pool.query('update seat_sync set next_at = now()')
      const told = []
      const first = await flushSeatSync(pool, readConfig(env), {
        seatDoor: {
          mintSeatSession: async ({ grant }) => {
            told.push(grant)
            return 'tok'
          },
          revokeSeatAtDoor: async () => ({ ok: true })
        },
        log: { warn: () => {} }
      })
      assert.deepEqual(first, { ran: true, done: 1, failed: 0 })
      assert.deepEqual(told, [owed[0].payload])
      assert.equal(
        (await pool.query('select count(*)::int as n from seat_sync where done_at is null')).rows[0].n,
        0
      )
    } finally {
      console.warn = originalWarn
    }
  }
)

test(
  'P08: a host still down at drain time keeps the row, with a growing wait and the reason',
  opts,
  async () => {
    const { pool } = db
    const { enqueueSeatSync } = await import('../src/seats/store.js')
    const { flushSeatSync } = await import('../src/cron.js')
    const { readConfig } = await import('../src/config.js')
    await enqueueSeatSync(pool, {
      kind: 'revoke',
      host: 'local',
      email: 'm@x.y',
      siteKey: 'rolesite.example',
      error: 'first'
    })
    await pool.query('update seat_sync set next_at = now()')
    const result = await flushSeatSync(pool, readConfig(env), {
      seatDoor: {
        revokeSeatAtDoor: async () => {
          throw new Error('still down')
        },
        mintSeatSession: async () => null
      },
      log: { warn: () => {} }
    })
    assert.deepEqual(result, { ran: true, done: 0, failed: 1 })
    const row = (
      await pool.query('select attempts, last_error, done_at, next_at > now() as later from seat_sync')
    ).rows[0]
    assert.equal(row.attempts, 2)
    assert.equal(row.last_error, 'still down')
    assert.equal(row.done_at, null)
    assert.equal(row.later, true)
    // Not due yet: a second drain right away does nothing to it.
    assert.deepEqual(await flushSeatSync(pool, readConfig(env), { seatDoor: {}, log: { warn: () => {} } }), {
      ran: true,
      done: 0,
      failed: 0
    })
  }
)

test('P08: leaving a site takes the seat back at every host, like an admin revoke does', opts, async () => {
  const { pool } = db
  await roleFixture(pool)
  const revoked = []
  const { cookieFor, send } = harness(pool, {
    seatDoor: {
      revokeSeatAtDoor: async ({ email, site }) => {
        revoked.push({ email, site })
        return { ok: true, revoked: 7 }
      }
    }
  })
  const res = await send('POST', '/api/sites/rolesite.example/leave', await cookieFor('m@x.y'))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { left: true, lanes: [{ lane: 'local', ok: true, revoked: 7 }] })
  assert.deepEqual(revoked, [{ email: 'm@x.y', site: 'rolesite.example' }])
})

test(
  'GET /api/team: a roster row names WHO granted it by email, not by account id (29/09)',
  opts,
  async () => {
    // cowork.tracy.site, 29/09: the Team tab read "Granted 14 days ago by 14283358-185e-…": the seat
    // book keeps granted_by as an account id, and the roster handed that id to a screen that prints
    // it. Each row now also carries the granter's email, read for the whole roster at once.
    const { pool } = db
    await makeSite(pool, 'one.example', 'one-example')
    await makeOwner(pool, 'one.example', 'o@x.y')
    const ownerId = await accountId(pool, 'o@x.y')
    const { rows } = await pool.query(`insert into account (email) values ('e@x.y') returning id`)
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('one.example', $1, 'editor', $2, now())`,
      [rows[0].id, ownerId]
    )
    const { cookieFor, get } = harness(pool)
    const team = await get('/api/team', await cookieFor('o@x.y'))
    assert.equal(team.status, 200)
    const seats = (await team.json()).sites[0].seats
    const byEmail = Object.fromEntries(seats.map((s) => [s.email, s]))
    assert.equal(byEmail['e@x.y'].grantedByEmail, 'o@x.y', 'the editor was granted by the owner')
    assert.equal(byEmail['o@x.y'].grantedByEmail, 'o@x.y', 'the owner granted their own seat')
    assert.equal(byEmail['e@x.y'].grantedBy, ownerId, 'grantedBy keeps the account id for existing callers')
  }
)

import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import {
  SeatStoreRejected,
  accountByEmail,
  ensureAccount,
  grantFor,
  seatsOfSite,
  sitesOfAccount,
  ownersOf,
  grantSite,
  acceptGrant,
  declineGrant,
  setGrantRole,
  revokeGrant,
  revokeAllGrants,
  requestSiteJoin,
  approveSiteJoinRequest,
  displayNamesFor,
  rolePolicy,
  writeRolePolicy
} from '../src/seats/store.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

async function makeSite(pool, siteKey, label) {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
}

test('accountByEmail: null for a stranger, the row once ensureAccount has made one', opts, async () => {
  const { pool } = db
  assert.equal(await accountByEmail(pool, 'nobody@x.y'), null)
  const { id } = await ensureAccount(pool, 'a@x.y')
  const row = await accountByEmail(pool, 'a@x.y')
  assert.equal(row.id, id)
  assert.equal(row.email, 'a@x.y')
})

test('accountByEmail finds the row regardless of the address case queried with', opts, async () => {
  const { pool } = db
  const { id } = await ensureAccount(pool, 'a@x.y')
  const row = await accountByEmail(pool, 'A@X.Y')
  assert.ok(row, 'a mixed-case query still finds the lower-case row')
  assert.equal(row.id, id)
  assert.equal(row.email, 'a@x.y')
})

test(
  'ensureAccount is idempotent: same email, same id, second call does not create a row',
  opts,
  async () => {
    const { pool } = db
    const first = await ensureAccount(pool, 'a@x.y')
    const second = await ensureAccount(pool, 'a@x.y')
    assert.equal(first.id, second.id)
    const { rows } = await pool.query('select count(*) from account where email = $1', ['a@x.y'])
    assert.equal(Number(rows[0].count), 1)
  }
)

test('grantSite upserts; a second owner can be demoted but the last cannot', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-1')
  const a = await ensureAccount(pool, 'a@x.y')
  const b = await ensureAccount(pool, 'b@x.y')
  await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id, activate: true })
  await grantSite(pool, { siteKey: 'x.y', accountId: b.id, role: 'owner', grantedBy: a.id, activate: true })
  await setGrantRole(pool, 'x.y', b.id, 'editor')
  await assert.rejects(setGrantRole(pool, 'x.y', a.id, 'editor'))
  assert.equal((await grantFor(pool, b.id, 'x.y')).role, 'editor')
  assert.equal(await grantFor(pool, b.id, 'nope'), null)
})

test('grantSite leaves a live (non-revoked, non-declined) grant untouched', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-2')
  const a = await ensureAccount(pool, 'a@x.y')
  const first = await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'editor', grantedBy: a.id })
  assert.ok(first)
  const second = await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id })
  assert.equal(second, null)
  const row = await pool.query('select role from seat where site_key = $1 and account_id = $2', ['x.y', a.id])
  assert.equal(row.rows[0].role, 'editor')
})

test('grantSite revives a revoked row as a fresh invite, resetting prior answers', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-3')
  const a = await ensureAccount(pool, 'a@x.y')
  await grantSite(pool, {
    siteKey: 'x.y',
    accountId: a.id,
    role: 'editor',
    grantedBy: a.id,
    activate: true
  })
  const revoked = await revokeGrant(pool, 'x.y', a.id)
  assert.ok(revoked.revoked_at)
  const revived = await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'viewer', grantedBy: a.id })
  assert.equal(revived.role, 'viewer')
  assert.equal(revived.revoked_at, null)
  assert.equal(revived.accepted_at, null)
})

test('grantSite({ requested: true }) lands as a pending request, not a live grant', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-3a')
  const a = await ensureAccount(pool, 'a@x.y')
  const row = await grantSite(pool, {
    siteKey: 'x.y',
    accountId: a.id,
    role: 'editor',
    grantedBy: a.id,
    requested: true
  })
  assert.ok(row.requested_at)
  assert.equal(row.accepted_at, null)
  // A pending request is neither revoked nor declined, so it is LIVE — a second grantSite call
  // must leave it untouched, same as any other live row.
  assert.equal(
    await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id }),
    null
  )
})

test(
  'a grantSite({ requested: true }) row reaches the accepted state via approveSiteJoinRequest',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.y', 'x-y-3b')
    const owner = await ensureAccount(pool, 'owner@x.y')
    const asker = await ensureAccount(pool, 'asker@x.y')
    await grantSite(pool, {
      siteKey: 'x.y',
      accountId: owner.id,
      role: 'owner',
      grantedBy: owner.id,
      activate: true
    })
    const requested = await grantSite(pool, {
      siteKey: 'x.y',
      accountId: asker.id,
      role: 'editor',
      grantedBy: asker.id,
      requested: true
    })
    assert.ok(requested.requested_at)
    assert.equal(requested.accepted_at, null)

    const approved = await approveSiteJoinRequest(pool, 'x.y', asker.id, 'viewer', owner.id)
    assert.equal(approved.role, 'viewer')
    assert.ok(approved.accepted_at)
    assert.ok(approved.requested_at, 'requested_at survives the approval')
    assert.ok(await grantFor(pool, asker.id, 'x.y'), 'the account now holds a live grant')
  }
)

test(
  'grantSite({ activate: true, requested: true }) stamps both — an already-approved request in one call',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.y', 'x-y-3c')
    const a = await ensureAccount(pool, 'a@x.y')
    // Neither flag overrides the other: this is the shape requestSiteJoin + approveSiteJoinRequest
    // would produce across two calls, folded into one. See the grantSite docstring for why this is
    // intended rather than an unhandled combination.
    const row = await grantSite(pool, {
      siteKey: 'x.y',
      accountId: a.id,
      role: 'editor',
      grantedBy: a.id,
      activate: true,
      requested: true
    })
    assert.ok(row.requested_at, 'the request timestamp is still recorded')
    assert.ok(row.accepted_at, 'and the grant is immediately live')
    assert.ok(await grantFor(pool, a.id, 'x.y'))
  }
)

test('acceptGrant flips accepted_at once, and a second call is a no-op returning null', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-4')
  const a = await ensureAccount(pool, 'a@x.y')
  await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'editor', grantedBy: a.id })
  const accepted = await acceptGrant(pool, 'x.y', a.id)
  assert.ok(accepted.accepted_at)
  assert.equal(await acceptGrant(pool, 'x.y', a.id), null)
})

test('declineGrant flips declined_at, and the seat never becomes a live grant', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-5')
  const a = await ensureAccount(pool, 'a@x.y')
  await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'editor', grantedBy: a.id })
  const declined = await declineGrant(pool, 'x.y', a.id)
  assert.ok(declined.declined_at)
  assert.equal(await grantFor(pool, a.id, 'x.y'), null)
})

test('revokeGrant (leave) sets revoked_at on a live grant, and a second call is a no-op', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-6')
  const a = await ensureAccount(pool, 'a@x.y')
  const b = await ensureAccount(pool, 'b@x.y')
  // Two owners so revoking one does not trip the last-owner guard.
  await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id, activate: true })
  await grantSite(pool, { siteKey: 'x.y', accountId: b.id, role: 'owner', grantedBy: a.id, activate: true })
  const revoked = await revokeGrant(pool, 'x.y', b.id)
  assert.ok(revoked.revoked_at)
  assert.equal(await revokeGrant(pool, 'x.y', b.id), null)
})

test('revokeGrant on the last owner is refused as SeatStoreRejected(LAST_OWNER)', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-7')
  const a = await ensureAccount(pool, 'a@x.y')
  await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id, activate: true })
  await assert.rejects(revokeGrant(pool, 'x.y', a.id), (error) => {
    assert.ok(error instanceof SeatStoreRejected)
    assert.equal(error.code, 'LAST_OWNER')
    return true
  })
})

test(
  'requestSiteJoin sets requested_at; approveSiteJoinRequest accepts it at the chosen role',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.y', 'x-y-8')
    const owner = await ensureAccount(pool, 'owner@x.y')
    const asker = await ensureAccount(pool, 'asker@x.y')
    await grantSite(pool, {
      siteKey: 'x.y',
      accountId: owner.id,
      role: 'owner',
      grantedBy: owner.id,
      activate: true
    })
    const requested = await requestSiteJoin(pool, 'x.y', asker.id)
    assert.ok(requested.requested_at)
    assert.equal(requested.accepted_at, null)
    const approved = await approveSiteJoinRequest(pool, 'x.y', asker.id, 'viewer', owner.id)
    assert.equal(approved.role, 'viewer')
    assert.ok(approved.accepted_at)
    assert.ok(approved.requested_at, 'requested_at survives approval')
  }
)

test('requestSiteJoin is idempotent: asking again while pending revives the same request', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-9')
  const asker = await ensureAccount(pool, 'asker@x.y')
  const first = await requestSiteJoin(pool, 'x.y', asker.id)
  const second = await requestSiteJoin(pool, 'x.y', asker.id)
  assert.ok(second.requested_at >= first.requested_at)
  assert.equal(second.accepted_at, null)
})

test(
  'seatsOfSite returns every grant ever written, revoked ones included, joined with the account',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.y', 'x-y-10')
    const a = await ensureAccount(pool, 'a@x.y')
    const b = await ensureAccount(pool, 'b@x.y')
    await pool.query('update account set display_name = $2 where id = $1', [a.id, 'A Name'])
    await grantSite(pool, {
      siteKey: 'x.y',
      accountId: a.id,
      role: 'owner',
      grantedBy: a.id,
      activate: true
    })
    await grantSite(pool, {
      siteKey: 'x.y',
      accountId: b.id,
      role: 'owner',
      grantedBy: a.id,
      activate: true
    })
    await revokeGrant(pool, 'x.y', b.id)

    const rows = await seatsOfSite(pool, 'x.y')
    assert.equal(rows.length, 2, 'revoked rows are not dropped')
    const rowA = rows.find((r) => r.account_id === a.id)
    assert.deepEqual(rowA.seat, { email: 'a@x.y', display_name: 'A Name', avatar_url: null })
    const rowB = rows.find((r) => r.account_id === b.id)
    assert.ok(rowB.revoked_at)
  }
)

test(
  'sitesOfAccount computes status accepted|requested|pending and drops revoked/declined sites',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'accepted.y', 'accepted-y')
    await makeSite(pool, 'requested.y', 'requested-y')
    await makeSite(pool, 'pending.y', 'pending-y')
    await makeSite(pool, 'gone.y', 'gone-y')
    const a = await ensureAccount(pool, 'a@x.y')
    await grantSite(pool, {
      siteKey: 'accepted.y',
      accountId: a.id,
      role: 'editor',
      grantedBy: a.id,
      activate: true
    })
    await requestSiteJoin(pool, 'requested.y', a.id)
    await grantSite(pool, { siteKey: 'pending.y', accountId: a.id, role: 'editor', grantedBy: a.id })
    await grantSite(pool, { siteKey: 'gone.y', accountId: a.id, role: 'editor', grantedBy: a.id })
    await revokeGrant(pool, 'gone.y', a.id)

    const rows = await sitesOfAccount(pool, a.id)
    const bySite = Object.fromEntries(rows.map((r) => [r.site_key, r.status]))
    assert.deepEqual(bySite, {
      'accepted.y': 'accepted',
      'requested.y': 'requested',
      'pending.y': 'pending'
    })
  }
)

test('ownersOf counts only accepted, live owners — a pending owner invite does not count', opts, async () => {
  const { pool } = db
  await makeSite(pool, 'x.y', 'x-y-11')
  const a = await ensureAccount(pool, 'a@x.y')
  const b = await ensureAccount(pool, 'b@x.y')
  await grantSite(pool, { siteKey: 'x.y', accountId: a.id, role: 'owner', grantedBy: a.id, activate: true })
  await grantSite(pool, { siteKey: 'x.y', accountId: b.id, role: 'owner', grantedBy: a.id })
  const owners = await ownersOf(pool, 'x.y')
  assert.deepEqual(
    owners.map((o) => o.account_id),
    [a.id]
  )
})

test(
  'revokeAllGrants (teardown) revokes every living seat of one site and returns the count',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.y', 'x-y-12')
    await makeSite(pool, 'p.q', 'p-q-12')
    const a = await ensureAccount(pool, 'a@x.y')
    const b = await ensureAccount(pool, 'b@x.y')
    await grantSite(pool, {
      siteKey: 'x.y',
      accountId: a.id,
      role: 'owner',
      grantedBy: a.id,
      activate: true
    })
    await grantSite(pool, {
      siteKey: 'p.q',
      accountId: b.id,
      role: 'owner',
      grantedBy: b.id,
      activate: true
    })

    const count = await revokeAllGrants(pool, 'x.y')
    assert.equal(count, 1)
    assert.equal(await grantFor(pool, a.id, 'x.y'), null)
    // The other site's own single owner is untouched — the escape hatch is scoped to x.y alone.
    assert.ok(await grantFor(pool, b.id, 'p.q'))
  }
)

test(
  'displayNamesFor maps account id to display_name, skipping ids with none and unknown ids',
  opts,
  async () => {
    const { pool } = db
    const a = await ensureAccount(pool, 'a@x.y')
    const b = await ensureAccount(pool, 'b@x.y')
    await pool.query('update account set display_name = $2 where id = $1', [a.id, 'A Name'])
    const names = await displayNamesFor(pool, [a.id, b.id, '00000000-0000-0000-0000-000000000000'])
    assert.deepEqual(names, { [a.id]: 'A Name' })
    assert.deepEqual(await displayNamesFor(pool, []), {})
  }
)

test(
  'rolePolicy is null by default; writeRolePolicy upserts the current row and appends history',
  opts,
  async () => {
    const { pool } = db
    await makeSite(pool, 'x.y', 'x-y-13')
    const a = await ensureAccount(pool, 'a@x.y')
    assert.equal(await rolePolicy(pool, 'x.y'), null)

    const first = { editor: { content: true, code: false, site: false, lifecycle: false } }
    const written = await writeRolePolicy(pool, 'x.y', first, a.id)
    assert.deepEqual(written.policy, first)
    assert.deepEqual((await rolePolicy(pool, 'x.y')).policy, first)

    const second = { editor: { content: true, code: true, site: false, lifecycle: false } }
    await writeRolePolicy(pool, 'x.y', second, a.id)
    assert.deepEqual((await rolePolicy(pool, 'x.y')).policy, second, 'current row is the latest write')

    const { rows: history } = await pool.query(
      'select policy from site_role_policy_history where site_key = $1 order by updated_at asc',
      ['x.y']
    )
    assert.equal(history.length, 2, 'both writes are logged')
    assert.deepEqual(history[1].policy, second)
  }
)

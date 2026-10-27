// The staff seats a new deployment's operators get on an empty database (shard installer, spec §6).
//   TEST_DATABASE_URL=postgres://tracy:tracy@127.0.0.1:51730/tracy node --test apps/tracy-web/test/seed-admin-seats.test.mjs
// (a database of your own, never a shared one — docs/references/ha-tang-bi-mat-deploy.md, step 2)
import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { parseEmails, seedAdminSeats, SeedError } from '../scripts/seed-admin-seats.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const pg = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

// The question /ops asks (ops/admit.js:34-46), word for word.
async function staffRole(pool, email) {
  const { rows } = await pool.query(
    `select sw.role
       from account a
       join seat_workspace sw on sw.account_id = a.id
       join workspace w on w.id = sw.workspace_id
      where a.email = $1
        and w.kind = 'tracy_admin'
        and sw.revoked_at is null and sw.declined_at is null and sw.accepted_at is not null
      limit 1`,
    [email]
  )
  return rows[0]?.role ?? null
}

test('parseEmails trims, lowercases, de-duplicates and keeps the order', () => {
  assert.deepEqual(parseEmails(' Anh@Example.com, em@example.com,anh@example.com '), [
    'anh@example.com',
    'em@example.com'
  ])
})

test('parseEmails refuses an empty list and anything that is not an address', () => {
  assert.throws(() => parseEmails(' , '), SeedError)
  assert.throws(() => parseEmails('anh@example.com,not-an-email'), /not an email address: not-an-email/)
})

test(
  'an empty database gets one tracy_admin workspace and an accepted owner seat per email',
  pg,
  async () => {
    const report = await seedAdminSeats(db.pool, { emails: ['anh@example.com', 'em@example.com'] })
    assert.equal(report.workspace.created, true)
    assert.deepEqual(report.seats, [
      { email: 'anh@example.com', status: 'granted' },
      { email: 'em@example.com', status: 'granted' }
    ])
    assert.equal(await staffRole(db.pool, 'anh@example.com'), 'owner')
    assert.equal(await staffRole(db.pool, 'em@example.com'), 'owner')
  }
)

test('a second run reuses the workspace and keeps the seats', pg, async () => {
  const first = await seedAdminSeats(db.pool, { emails: ['anh@example.com'] })
  const second = await seedAdminSeats(db.pool, {
    emails: ['anh@example.com', 'em@example.com'],
    role: 'admin'
  })
  assert.equal(second.workspace.id, first.workspace.id)
  assert.equal(second.workspace.created, false)
  assert.deepEqual(second.seats, [
    { email: 'anh@example.com', status: 'kept' },
    { email: 'em@example.com', status: 'granted' }
  ])
  assert.equal(await staffRole(db.pool, 'anh@example.com'), 'owner', 'an existing seat keeps its rank')
  assert.equal(await staffRole(db.pool, 'em@example.com'), 'admin')
  const { rows } = await db.pool.query("select count(*)::int as n from workspace where kind = 'tracy_admin'")
  assert.equal(rows[0].n, 1)
})

test('a revoked seat stays revoked: reopening it is a person, not a script', pg, async () => {
  const { workspace } = await seedAdminSeats(db.pool, { emails: ['gone@example.com'] })
  await db.pool.query(
    "update seat_workspace set revoked_at = now() where workspace_id = $1 and account_id = (select id from account where email = 'gone@example.com')",
    [workspace.id]
  )
  const again = await seedAdminSeats(db.pool, { emails: ['gone@example.com'] })
  assert.deepEqual(again.seats, [{ email: 'gone@example.com', status: 'kept' }])
  assert.equal(await staffRole(db.pool, 'gone@example.com'), null)
})

test('two tracy_admin workspaces is a book it refuses to guess about', pg, async () => {
  await db.pool.query(
    "insert into workspace (display_name, kind) values ('Staff A', 'tracy_admin'), ('Staff B', 'tracy_admin')"
  )
  await assert.rejects(seedAdminSeats(db.pool, { emails: ['anh@example.com'] }), /2 tracy_admin workspaces/)
})

test('a customer rank is refused before the database is touched', pg, async () => {
  await assert.rejects(seedAdminSeats(db.pool, { emails: ['anh@example.com'], role: 'viewer' }), SeedError)
  const { rows } = await db.pool.query('select count(*)::int as n from workspace')
  assert.equal(rows[0].n, 0)
})

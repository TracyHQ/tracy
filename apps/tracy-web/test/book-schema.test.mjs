import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from '../src/db/index.js'
import { fileDb, scratchPool } from './_db.mjs'

const MIGRATIONS = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const url = process.env.TEST_DATABASE_URL
test('002 creates the book, and keep_one_owner refuses to strip the last owner', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const { rows } = await pool.query(
    'select table_name from information_schema.tables where table_schema=current_schema() order by 1'
  )
  const names = rows.map((r) => r.table_name)
  for (const t of [
    'account',
    'identity',
    'site',
    'seat',
    'site_role_policy',
    'invite',
    'staff',
    'job',
    'audit',
    'workspace',
    'seat_workspace',
    'workspace_site',
    'workspace_role_policy',
    'merge_ledger',
    'rate_bucket'
  ])
    assert.ok(names.includes(t), t)
  const a = (await pool.query("insert into account (email) values ('o@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000000', 'local', 'wordpress')"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now())",
    [a]
  )
  await assert.rejects(pool.query("update seat set role = 'editor' where site_key = 'x.y'"), /owner/)
})

test('seat_keep_one_owner: revoking the last owner raises', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000001', 'local', 'wordpress')"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now())",
    [a]
  )
  await assert.rejects(
    pool.query('update seat set revoked_at = now() where site_key = $1 and account_id = $2', ['x.y', a]),
    /owner/
  )
})

test('seat_keep_one_owner: revoking one of two owners succeeds', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  const b = (await pool.query("insert into account (email) values ('b@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000002', 'local', 'wordpress')"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now()), ('x.y', $2, 'owner', $1, now())",
    [a, b]
  )
  await pool.query('update seat set revoked_at = now() where site_key = $1 and account_id = $2', ['x.y', a])
  const { rows } = await pool.query('select account_id, revoked_at from seat where site_key = $1', ['x.y'])
  assert.ok(rows.find((r) => r.account_id === a).revoked_at)
  assert.equal(rows.find((r) => r.account_id === b).revoked_at, null)
})

test('seat_revoke_all_site_grants opens the door for its own site', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000003', 'local', 'wordpress')"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now())",
    [a]
  )
  const { rows } = await pool.query("select * from seat_revoke_all_site_grants('x.y')")
  assert.equal(rows.length, 1)
  assert.ok(rows[0].revoked_at)
})

test('seat_keep_one_owner: the teardown flag for a DIFFERENT site does not open the door', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const client = await pool.connect()
  try {
    const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
    const b = (await pool.query("insert into account (email) values ('b@x.y') returning id")).rows[0].id
    await pool.query(
      "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000004', 'local', 'wordpress'), ('p.q', 'p-q-00000004', 'local', 'wordpress')"
    )
    await pool.query(
      "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now()), ('p.q', $2, 'owner', $2, now())",
      [a, b]
    )
    await client.query('begin')
    // The flag is set for a different site (`p.q`); revoking x.y's only owner must still raise.
    await client.query("select set_config('tracy.site_teardown', 'p.q', true)")
    await assert.rejects(client.query("update seat set revoked_at = now() where site_key = 'x.y'"), /owner/)
    await client.query('rollback')
  } finally {
    client.release()
  }
})

test('workspace has the full column set restored from schema.sql:227-251', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const { rows } = await pool.query(
    "select column_name from information_schema.columns where table_schema=current_schema() and table_name='workspace' order by 1"
  )
  assert.deepEqual(
    rows.map((r) => r.column_name),
    ['created_at', 'created_by', 'display_name', 'id', 'industry', 'kind', 'revenue_modes']
  )
})

test('workspace.kind defaults to customer, and only accepts customer/tracy_admin', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  const w = (
    await pool.query("insert into workspace (display_name, created_by) values ('Acme', $1) returning id", [a])
  ).rows[0].id
  const { rows } = await pool.query('select kind from workspace where id = $1', [w])
  assert.equal(rows[0].kind, 'customer')
  await pool.query("update workspace set kind = 'tracy_admin' where id = $1", [w])
  await assert.rejects(pool.query("update workspace set kind = 'bogus' where id = $1", [w]))
})

test('workspace.revenue_modes only accepts the four known modes', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into workspace (display_name, created_by, revenue_modes) values ('Acme', $1, '{goods,services}')",
    [a]
  )
  await assert.rejects(
    pool.query(
      "insert into workspace (display_name, created_by, revenue_modes) values ('Bogus', $1, '{not_a_mode}')",
      [a]
    )
  )
})

test('seat carries seen_at and created_by_proof, restored from schema.sql', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000005', 'local', 'wordpress')"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at, seen_at, created_by_proof) values ('x.y', $1, 'owner', $1, now(), now(), 'creator')",
    [a]
  )
  const { rows } = await pool.query(
    'select seen_at, created_by_proof from seat where site_key = $1 and account_id = $2',
    ['x.y', a]
  )
  assert.ok(rows[0].seen_at)
  assert.equal(rows[0].created_by_proof, 'creator')
})

test('seat_workspace defaults to editor, keeps each workspace kind on its own ladder, and carries seen_at', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  const w = (
    await pool.query("insert into workspace (display_name, created_by) values ('Acme', $1) returning id", [a])
  ).rows[0].id
  // No role given on insert: must default to 'editor', same as seat_site's org-membership table.
  await pool.query('insert into seat_workspace (workspace_id, account_id, granted_by) values ($1, $2, $2)', [
    w,
    a
  ])
  const { rows } = await pool.query(
    'select role, seen_at from seat_workspace where workspace_id = $1 and account_id = $2',
    [w, a]
  )
  assert.equal(rows[0].role, 'editor')
  assert.equal(rows[0].seen_at, null)

  const setRole = (workspaceId, role) =>
    pool.query('update seat_workspace set role = $3 where workspace_id = $1 and account_id = $2', [
      workspaceId,
      a,
      role
    ])
  // A customer workspace takes the three roles of ADR 0028, and refuses the retired and staff ranks.
  for (const role of ['owner', 'editor', 'viewer']) await setRole(w, role)
  for (const role of ['admin', 'developer', 'bogus']) await assert.rejects(setRole(w, role), new RegExp(role))

  // The tracy_admin workspace keeps Tracy's staff ranks (editor = read-only staff), refuses viewer.
  const staff = (
    await pool.query(
      "insert into workspace (display_name, created_by, kind) values ('Tracy', $1, 'tracy_admin') returning id",
      [a]
    )
  ).rows[0].id
  await pool.query(
    "insert into seat_workspace (workspace_id, account_id, role, granted_by) values ($1, $2, 'owner', $2)",
    [staff, a]
  )
  for (const role of ['admin', 'developer', 'editor', 'owner']) await setRole(staff, role)
  for (const role of ['viewer', 'bogus']) await assert.rejects(setRole(staff, role), new RegExp(role))

  await pool.query('update seat_workspace set seen_at = now() where workspace_id = $1 and account_id = $2', [
    w,
    a
  ])
  const seen = await pool.query(
    'select seen_at from seat_workspace where workspace_id = $1 and account_id = $2',
    [w, a]
  )
  assert.ok(seen.rows[0].seen_at)
})

test('seat takes the three roles of ADR 0028 and refuses the retired ones', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  const { pool } = db
  const a = (await pool.query("insert into account (email) values ('a@x.y') returning id")).rows[0].id
  const b = (await pool.query("insert into account (email) values ('b@x.y') returning id")).rows[0].id
  await pool.query(
    "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000006', 'local', 'wordpress')"
  )
  await pool.query(
    "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ('x.y', $1, 'owner', $1, now()), ('x.y', $2, 'viewer', $1, now())",
    [a, b]
  )
  await pool.query("update seat set role = 'editor' where site_key = 'x.y' and account_id = $1", [b])
  for (const role of ['admin', 'developer', 'bogus']) {
    await assert.rejects(
      pool.query('update seat set role = $2 where site_key = $3 and account_id = $1', [b, role, 'x.y']),
      /seat_role_check/
    )
  }
})

test('078 turns admin and developer into editor, except on the tracy_admin workspace', {
  skip: url ? false : 'set TEST_DATABASE_URL'
}, async () => {
  // A database that stopped one file short of 078, holding rows of the four-role book.
  const dir = await mkdtemp(join(tmpdir(), 'tracy-078-'))
  const all = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql'))
  for (const name of all.filter((n) => n < '078')) await copyFile(join(MIGRATIONS, name), join(dir, name))
  const { pool, close } = await scratchPool()
  try {
    await migrate(pool, dir, { lockId: 7_243_078 })
    const id = async (email) =>
      (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
    const [o, ad, dev, ed] = [await id('o@x.y'), await id('ad@x.y'), await id('dev@x.y'), await id('ed@x.y')]
    await pool.query(
      "insert into site (site_key, label, host, platform) values ('x.y', 'x-y-00000078', 'local', 'wordpress')"
    )
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at) values
         ('x.y', $1, 'owner', $1, now()), ('x.y', $2, 'admin', $1, now()),
         ('x.y', $3, 'developer', $1, now()), ('x.y', $4, 'editor', $1, null)`,
      [o, ad, dev, ed]
    )
    const customer = (
      await pool.query("insert into workspace (display_name, created_by) values ('Acme', $1) returning id", [
        o
      ])
    ).rows[0].id
    const staff = (
      await pool.query(
        "insert into workspace (display_name, created_by, kind) values ('Tracy', $1, 'tracy_admin') returning id",
        [o]
      )
    ).rows[0].id
    for (const w of [customer, staff]) {
      await pool.query(
        `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at) values
           ($1, $2, 'owner', $2, now()), ($1, $3, 'admin', $2, now()), ($1, $4, 'developer', $2, now())`,
        [w, o, ad, dev]
      )
    }
    await pool.query(
      `insert into seat_sync (kind, host, email, site_key, payload) values
         ('mint', 'h', 'ad@x.y', 'x.y', '{"role":"admin","toolsets":["content","code","site"],"site":"x.y"}'),
         ('mint', 'h', 'o@x.y', 'x.y', '{"role":"owner","toolsets":["content","code","site","lifecycle"]}')`
    )

    const { applied } = await migrate(pool, MIGRATIONS, { lockId: 7_243_078 })
    assert.deepEqual(
      applied,
      all.filter((n) => n >= '078')
    )

    const roles = async (sql, params) =>
      Object.fromEntries((await pool.query(sql, params)).rows.map((r) => [r.account_id, r.role]))
    assert.deepEqual(await roles('select account_id, role from seat', []), {
      [o]: 'owner',
      [ad]: 'editor',
      [dev]: 'editor',
      [ed]: 'editor'
    })
    const ws = 'select account_id, role from seat_workspace where workspace_id = $1'
    assert.deepEqual(await roles(ws, [customer]), { [o]: 'owner', [ad]: 'editor', [dev]: 'editor' })
    assert.deepEqual(await roles(ws, [staff]), { [o]: 'owner', [ad]: 'admin', [dev]: 'developer' })

    const queued = (await pool.query('select email, payload from seat_sync order by id')).rows
    assert.deepEqual(queued[0].payload, {
      role: 'editor',
      toolsets: ['content', 'code', 'site'],
      site: 'x.y'
    })
    assert.equal(queued[1].payload.role, 'owner')
  } finally {
    await close()
    await rm(dir, { recursive: true, force: true })
  }
})

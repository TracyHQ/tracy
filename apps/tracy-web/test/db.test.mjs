import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createPool, migrate } from '../src/db/index.js'
import { createSeatPlanBroker } from '../src/seat-plan/broker.js'
import { LLM_DOORS } from '../src/lib/llm-catalog.js'
import { scratchPool } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL

test('migrate: with no lockId it queues behind the production advisory lock 7243001', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool, close } = await scratchPool()
  const holder = await pool.connect()
  try {
    await holder.query('select pg_advisory_lock(7243001)')
    const running = migrate(pool)
    // A not-granted advisory lock on that exact key in pg_locks is the migrator waiting for it.
    let waiting = 0
    for (let i = 0; i < 500 && waiting === 0; i++) {
      const { rows } = await holder.query(
        "select count(*)::int as n from pg_locks where locktype='advisory' and not granted and objid=7243001 and classid=0"
      )
      waiting = rows[0].n
      if (waiting === 0) await new Promise((r) => setTimeout(r, 10))
    }
    assert.ok(waiting >= 1, 'migrate() is blocked on lock 7243001')
    await holder.query('select pg_advisory_unlock(7243001)')
    const { applied } = await running
    assert.ok(applied.includes('001-identity.sql'))
  } finally {
    holder.release()
    await close()
  }
})

test('migrate: a caller-supplied lockId does not queue behind the production lock', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool, close } = await scratchPool()
  const holder = await pool.connect()
  try {
    await holder.query('select pg_advisory_lock(7243001)')
    const { applied } = await migrate(pool, undefined, { lockId: 7243002 })
    assert.ok(applied.includes('001-identity.sql'))
  } finally {
    await holder.query('select pg_advisory_unlock(7243001)').catch(() => {})
    holder.release()
    await close()
  }
})

test('migrate applies every file once, and a second run applies nothing', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool, close } = await scratchPool()
  try {
    const first = await migrate(pool)
    assert.ok(first.applied.includes('001-identity.sql')) // later plans add 002-…; the count is not the claim
    const second = await migrate(pool)
    assert.deepEqual(second.applied, [])
    const { rows } = await pool.query(
      "select column_name from information_schema.columns where table_schema=current_schema() and table_name='account' order by 1"
    )
    assert.deepEqual(
      rows.map((r) => r.column_name),
      [
        'avatar_url',
        'beta_admission',
        'created_at',
        'display_name',
        'email',
        'id',
        'language',
        'last_seen_at',
        'onboarding_completed_at',
        'onboarding_menu_hidden_at'
      ]
    )
  } finally {
    await close()
  }
})

/**
 * A copy of the migrations folder holding only the files named before `upTo`, so a test can build
 * the schema as it was, write the rows a deployment had, and then watch one migration run on them.
 */
async function migrationsBefore(upTo) {
  const source = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
  const dir = await mkdtemp(join(tmpdir(), 'tracy-migrations-'))
  for (const name of await readdir(source))
    if (name.endsWith('.sql') && name < upTo) await copyFile(join(source, name), join(dir, name))
  return dir
}

test('migration 095: Tracy AI becomes an entry of every saved order, once, and the old flag goes', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool, close } = await scratchPool()
  try {
    await migrate(pool, await migrationsBefore('095'))
    // Five shapes a deployment holds before 095: an empty order, an order saved without Tracy AI, a
    // connection the saved order never named, the old flag off, and an account with no row at all.
    // `off` also had automatic switching off: the switch left the interface (G2), so 095 turns it on.
    const [empty, saved, unlisted, off, none] = Array.from({ length: 5 }, () => randomUUID())
    await pool.query(
      `insert into account(id,email) values($1,'empty@t'),($2,'saved@t'),($3,'unlisted@t'),($4,'off@t'),($5,'none@t')`,
      [empty, saved, unlisted, off, none]
    )
    const c = { saved: randomUUID(), listed: randomUUID(), unlisted: randomUUID(), off: randomUUID() }
    await pool.query(
      `insert into seat_plan_connection(id,account_id,provider,provider_subject,subject_label,secret)
       values($1,$2,'claude','s1','one','{}'),($3,$4,'claude','s2','two','{}'),($5,$4,'codex','s3','three','{}'),($6,$7,'claude','s4','four','{}')`,
      [c.saved, saved, c.listed, unlisted, c.unlisted, c.off, off]
    )
    await pool.query(
      `insert into seat_plan_routing(account_id,connection_order,tracy_fallback,enabled)
       values($1,'[]',true,true),($2,$3,true,true),($4,$5,true,true),($6,$7,false,false)`,
      [
        empty,
        saved,
        JSON.stringify([c.saved]),
        unlisted,
        JSON.stringify([c.listed]),
        off,
        JSON.stringify([c.off])
      ]
    )

    // 095 runs first; later migrations (096 on) may follow it.
    const { applied } = await migrate(pool)
    assert.equal(applied[0], '095-routing-tracy-entry.sql')

    const order = async (account) =>
      (await pool.query('select connection_order from seat_plan_routing where account_id=$1', [account]))
        .rows[0]?.connection_order
    assert.deepEqual(await order(empty), ['tracy'])
    assert.deepEqual(await order(saved), [c.saved, 'tracy'])
    assert.deepEqual(await order(unlisted), [c.listed, 'tracy'])
    assert.deepEqual(await order(off), [c.off, 'tracy'])
    assert.equal(await order(none), undefined)
    await pool.query('insert into seat_plan_routing(account_id) values($1)', [none])
    assert.deepEqual(await order(none), ['tracy'], 'the default applies to a row made after 095')
    const switching = await pool.query('select enabled from seat_plan_routing where account_id=$1', [off])
    assert.equal(switching.rows[0].enabled, true, 'automatic switching is back on for a row that had it off')
    // The old flag's column stays one release, unread and nullable, so an older web image still
    // runs against this schema (a rollback, or the window of a deploy).
    const column = (
      await pool.query(
        "select is_nullable, column_default from information_schema.columns where table_schema=current_schema() and table_name='seat_plan_routing' and column_name='tracy_fallback'"
      )
    ).rows[0]
    assert.deepEqual(column, { is_nullable: 'YES', column_default: 'true' })

    // Read through the broker: the connection the saved order never named stands before Tracy AI.
    const broker = createSeatPlanBroker({
      pool,
      kek: Buffer.alloc(32, 1).toString('base64'),
      policy: async () => ({ llm: { connect: true, providers: ['claude', 'codex'] } })
    })
    assert.deepEqual((await broker.status(unlisted)).routing.connectionOrder, [c.listed, c.unlisted, 'tracy'])
    assert.deepEqual((await broker.status(none)).routing.connectionOrder, ['tracy'])
  } finally {
    await close()
  }
})

test('llm_assignment_door_check allows exactly the doors in LLM_DOORS (the last migration that sets it)', async () => {
  const dir = fileURLToPath(new URL('../src/db/migrations/', import.meta.url))
  const files = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort()
  let doors = null
  for (const name of files) {
    const sql = await readFile(join(dir, name), 'utf8')
    for (const m of sql.matchAll(
      /add constraint llm_assignment_door_check\s+check\s*\(\s*door in \(([^)]*)\)\s*\)/g
    ))
      doors = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  }
  assert.ok(doors, 'no migration sets llm_assignment_door_check')
  assert.deepEqual([...doors].sort(), LLM_DOORS.map((d) => d.id).sort())
})

test('migration 097: a questions assignment is deleted, the others stay, and the door is refused after', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { pool, close } = await scratchPool()
  try {
    await migrate(pool, await migrationsBefore('097'))
    await pool.query(`insert into llm_provider(id, name, updated_by) values ('p', 'P', 't')`)
    await pool.query(
      `insert into llm_assignment(door, provider_id, model, updated_by) values ('questions', 'p', 'm', 't'), ('web', 'p', 'm', 't')`
    )
    await migrate(pool)
    const { rows } = await pool.query('select door from llm_assignment order by door')
    assert.deepEqual(
      rows.map((r) => r.door),
      ['web']
    )
    await assert.rejects(
      pool.query(
        `insert into llm_assignment(door, provider_id, model, updated_by) values ('questions', 'p', 'm', 't')`
      ),
      /llm_assignment_door_check/
    )
  } finally {
    await close()
  }
})

/**
 * The server ends one connection of a `createPool` pool — idle in the pool, or checked out between
 * two queries — and the test waits for what follows: the pool's warning, or an uncaught exception
 * (the `'error'` nobody listened to, which used to end tracy-web).
 */
async function serverDrops({ checkedOut }) {
  const warned = []
  const uncaught = []
  const catcher = (error) => uncaught.push(error.message)
  process.on('uncaughtException', catcher)
  const pool = createPool(url, { log: { warn: (line) => warned.push(line) } })
  const admin = createPool(url)
  try {
    const client = checkedOut ? await pool.connect() : null
    const {
      rows: [{ pid }]
    } = await (client ?? pool).query('select pg_backend_pid() as pid')
    await admin.query('select pg_terminate_backend($1)', [pid])
    for (let i = 0; i < 300 && warned.length === 0 && uncaught.length === 0; i++)
      await new Promise((r) => setTimeout(r, 10))
    client?.release(true)
    const { rows } = await pool.query('select 1 as one')
    return { warned, uncaught, after: rows[0].one }
  } finally {
    process.off('uncaughtException', catcher)
    await pool.end()
    await admin.end()
  }
}

test('createPool: an idle connection the server ends is logged once, not thrown, and the pool keeps answering', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { warned, uncaught, after } = await serverDrops({ checkedOut: false })
  assert.deepEqual(uncaught, [])
  assert.equal(warned.length, 1)
  assert.match(
    warned[0],
    /^\[db\] a connection was dropped by the server: terminating connection due to administrator command/
  )
  assert.equal(after, 1)
})

test('createPool: a checked-out connection the server ends between queries is logged, not thrown', {
  skip: url ? false : 'set TEST_DATABASE_URL to run against a real Postgres'
}, async () => {
  const { warned, uncaught, after } = await serverDrops({ checkedOut: true })
  assert.deepEqual(uncaught, [])
  assert.ok(warned.length >= 1, 'the drop was reported')
  assert.match(warned[0], /^\[db\] a connection was dropped by the server: /)
  assert.equal(after, 1)
})

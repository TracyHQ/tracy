// Test-only helper: a pool on a scratch database of its own (a schema when CREATEDB is not granted).
//
// 🔒 EVERY CALLER GETS ITS OWN SCHEMA, and that is the whole point. This used to drop and recreate
// `public`, which meant two pg-gated files running at once wiped each other's tables mid-test —
// measured on a repo-wide run: 99 failures, every one of them `relation "account" does not exist`,
// with nothing wrong in the code under test. A shared scratch space is not a scratch space.
//
// The schema name carries the process id and a random suffix, so files running in parallel (which
// node:test does by default) and repeated runs on one machine never collide. `search_path` points
// at it, so the migrations — which name no schema — build inside it.
import { createHash, randomBytes } from 'node:crypto'
import { createPool, migrate } from '../src/db/index.js'

/**
 * A pool on a scratch database of its own, NOT migrated — for the tests that need to watch
 * `migrate()` build a database from nothing. Everything else wants `fileDb()` or `freshPool()`.
 *
 * 🔒 A DATABASE, NOT A SCHEMA IN THE SHARED ONE (16/10/2026). Each schema created here and dropped
 * again bloats the catalog of the database `TEST_DATABASE_URL` names; on the CI runners' shared
 * postgres that catalog reached 31 GB, so opening a connection to it took seconds and the
 * healthcheck timed out (tracy-runners `compose.yml`, the 14–16/10 incident). A database of its own
 * is dropped whole with its catalog. Without CREATEDB it falls back to a schema, as before.
 */
export async function scratchPool() {
  return scratchDatabase().catch(() => scratchSchema())
}

/** A pool on a scratch schema in the shared database: the fallback when CREATEDB is not granted. */
async function scratchSchema() {
  const schema = `t_${process.pid}_${randomBytes(4).toString('hex')}`
  const base = new URL(process.env.TEST_DATABASE_URL)
  base.searchParams.set('options', `-c search_path=${schema},public`)
  const setup = createPool(process.env.TEST_DATABASE_URL)
  await setup.query(`create schema if not exists ${schema}`)
  await setup.end()
  const url = base.toString()
  const pool = createPool(url)
  return {
    pool,
    // Hand this to anything that opens its OWN pool (a server under test), or it will look in the
    // default schema and never see the rows this helper just wrote.
    url,
    close: async () => {
      try {
        await pool.query(`drop schema if exists ${schema} cascade`)
      } catch {}
      await pool.end()
    }
  }
}

/**
 * One migrated schema for a whole test FILE, emptied between tests. Migrating per test cost ~0.4 s
 * each and queued every file behind one global advisory lock; wiping rows costs ~20 ms.
 *
 *   const db = fileDb()
 *   before(db.open); beforeEach(db.reset); after(db.close)
 *   test('…', async () => { const { pool, url } = db … })
 *
 * Not for tests that need a virgin `schema_migration` or watch the migrator: use freshPool() there.
 * Tests in one file must run one at a time (node:test's default) — they share the schema.
 */
/**
 * A database of its own, for one file. Advisory locks are per DATABASE, and several code paths take
 * fixed ones (the cron sweeps, the reconciler, the site-mail store), so two files running in
 * parallel on separate schemas of one database would still make each other's `ran: false`. Needs
 * CREATEDB; without it, fileDb falls back to a schema (fine unless those locks are involved).
 */
async function scratchDatabase() {
  const name = `t_${process.pid}_${randomBytes(4).toString('hex')}`
  const admin = createPool(process.env.TEST_DATABASE_URL)
  try {
    await admin.query(`create database ${name}`)
  } finally {
    await admin.end()
  }
  const base = new URL(process.env.TEST_DATABASE_URL)
  base.pathname = `/${name}`
  const url = base.toString()
  const pool = createPool(url)
  // `pool.end()` resolves once idle clients are REMOVED, not once their sockets are closed, so the
  // forced drop below can terminate a connection still closing; that error is ours, and only then.
  let closing = false
  const ours = (error) => {
    if (!closing) throw error
  }
  // A client's error, and pg-pool's re-emit of an IDLE client's error on the pool itself.
  pool.on('error', ours)
  pool.on('connect', (client) => client.on('error', ours))
  return {
    pool,
    url,
    close: async () => {
      closing = true
      await pool.end()
      const drop = createPool(process.env.TEST_DATABASE_URL)
      try {
        await drop.query(`drop database if exists ${name} with (force)`)
      } catch {
      } finally {
        await drop.end()
      }
    }
  }
}

export function fileDb() {
  let scratch = null
  let wipe = null
  const need = () => {
    if (!scratch) throw new Error('fileDb: open() has not run — add before(db.open)')
    return scratch
  }
  return {
    get pool() {
      return need().pool
    },
    get url() {
      return need().url
    },
    async open() {
      if (!process.env.TEST_DATABASE_URL) return // every test in the file is skipped without it
      scratch = await scratchPool()
      // Its own lock id: the default one is global, so parallel files would queue on each other.
      const lockId = createHash('sha256').update(scratch.url).digest().readUInt32BE(0)
      try {
        await migrate(scratch.pool, undefined, { lockId })
        const { rows } = await scratch.pool.query(
          `select table_name from information_schema.tables
           where table_schema = current_schema() and table_type = 'BASE TABLE' and table_name <> 'schema_migration'`
        )
        const tables = rows.map((r) => `"${r.table_name}"`)
        const seqs = (
          await scratch.pool.query(
            `select sequencename from pg_sequences where schemaname = current_schema()`
          )
        ).rows.map((r) => `alter sequence "${r.sequencename}" restart`)
        // DELETE under replica role skips FK checks (~20 ms); TRUNCATE ... CASCADE is the fallback
        // for a role that may not set it (~115 ms).
        wipe = { tables, seqs }
        const probe = await scratch.pool.connect()
        try {
          await probe.query('set session_replication_role = replica')
          await probe.query('reset session_replication_role')
          wipe.replica = true
        } catch {
          wipe.replica = false
        } finally {
          probe.release()
        }
      } catch (error) {
        await scratch.close()
        scratch = null
        throw error
      }
    },
    async reset() {
      if (!scratch) return
      const { pool } = scratch
      const { tables, seqs, replica } = wipe
      const client = await pool.connect()
      try {
        if (replica) {
          await client.query('set session_replication_role = replica')
          try {
            await client.query([...tables.map((t) => `delete from ${t}`), ...seqs].join(';\n'))
          } finally {
            await client.query('reset session_replication_role')
          }
        } else {
          await client.query(`truncate ${tables.join(', ')} restart identity cascade`)
        }
      } finally {
        client.release()
      }
    },
    async close() {
      if (!scratch) return
      const s = scratch
      scratch = null
      await s.close()
    }
  }
}

export async function freshPool() {
  const { pool, url, close } = await scratchPool()
  // Its own lock id, as fileDb's: the database is this caller's alone, so the global id only made
  // every file running in parallel wait for each other's migrations.
  const lockId = createHash('sha256').update(url).digest().readUInt32BE(0)
  await migrate(pool, undefined, { lockId })
  return { pool, url, close }
}

/**
 * Run one write with row triggers off, in its own transaction: a test standing in for rows an older version wrote,
 * which an immutability trigger (e.g. the published place snapshot guard) now refuses.
 */
export async function writeAsHistory(pool, sql, params = []) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('set local session_replication_role = replica')
    const out = await client.query(sql, params)
    await client.query('commit')
    return out
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The pool, and the migrator. Migrations are numbered .sql files applied in name order under one
 * advisory lock, so n replicas starting at once apply each file exactly once.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import pg from 'pg'

const MIGRATIONS_DIR = new URL('./migrations/', import.meta.url)
const LOCK_ID = 7_243_001

/**
 * 🔒 A CONNECTION THE SERVER DROPS IS LOGGED, NEVER THROWN. When Postgres ends a connection that is
 * not running a query (a restart, `pg_terminate_backend`, a forced `drop database`, a network cut),
 * pg emits `'error'` — on the pool for an idle client, on the client itself for one checked out
 * between queries. An `'error'` with no listener is thrown by EventEmitter, and nothing in tracy-web
 * catches it, so one dropped idle connection used to end the whole process. pg-pool already removes
 * the dead client and the next query opens a new one; all that was missing is the listener. Measured
 * in CI as the `proxy.test.mjs` flake (09/10/2026, run 37942879853): the forced drop of the test
 * database killed the server's own connections while they closed, and the file went red.
 *
 * @param {string} databaseUrl
 * @param {{ log?: Pick<Console, 'warn'> }} [options] - where a dropped connection is reported.
 */
export function createPool(databaseUrl, { log = console } = {}) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  // pg-pool re-emits an idle client's error on the pool, so the same error reaches both listeners.
  const seen = new WeakSet()
  const dropped = (/** @type {Error} */ error) => {
    if (seen.has(error)) return
    seen.add(error)
    log.warn(`[db] a connection was dropped by the server: ${error.message}`)
  }
  pool.on('error', dropped)
  pool.on('connect', (client) => client.on('error', dropped))
  return pool
}

// `lockId` exists for tests that migrate private schemas in parallel; production never passes it.
export async function migrate(pool, dir = MIGRATIONS_DIR, { lockId = LOCK_ID } = {}) {
  const client = await pool.connect()
  const applied = []
  try {
    await client.query('select pg_advisory_lock($1)', [lockId])
    await client.query(
      'create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())'
    )
    const done = new Set((await client.query('select name from schema_migration')).rows.map((r) => r.name))
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
    for (const name of files) {
      if (done.has(name)) continue
      const sql = await readFile(join(dir instanceof URL ? dir.pathname : dir, name), 'utf8')
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query('insert into schema_migration (name) values ($1)', [name])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
      applied.push(name)
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [lockId]).catch(() => {})
    client.release()
  }
  return { applied }
}

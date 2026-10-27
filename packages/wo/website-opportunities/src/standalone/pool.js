// Copied from tracy-web `db/index.js` `createPool` (ADR 0036): the standalone server opens its own pool.
import pg from 'pg'

/**
 * A pool whose dropped connections are logged, never thrown: pg emits `'error'` for a connection the server ends
 * while idle, and an unheard `'error'` would end the process. pg-pool already replaces the dead client.
 * @param {string} databaseUrl
 * @param {{ log?: Pick<Console, 'warn'> }} [options]
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

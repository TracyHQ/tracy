// An empty database of its own for one test file, on the server `TEST_DATABASE_URL` names; dropped at close.
import { randomBytes } from 'node:crypto'
import pg from 'pg'

/** @returns {Promise<{ url: string, pool: import('pg').Pool, close: () => Promise<void> }>} */
export async function scratchDatabase() {
  const name = `wo_t_${process.pid}_${randomBytes(4).toString('hex')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 })
  await admin.query(`create database ${name}`)
  const url = new URL(process.env.TEST_DATABASE_URL)
  url.pathname = `/${name}`
  const pool = new pg.Pool({ connectionString: url.toString() })
  return {
    url: url.toString(),
    pool,
    async close() {
      await pool.end()
      // pool.end() resolves before the sockets close; dropping with force then kills them mid-close.
      for (let i = 0; i < 50; i += 1) {
        const { rows } = await admin.query(
          'select count(*)::int as n from pg_stat_activity where datname = $1',
          [name]
        )
        if (rows[0].n === 0) break
        await new Promise((r) => setTimeout(r, 20))
      }
      await admin.query(`drop database if exists ${name} with (force)`).catch(() => {})
      await admin.end()
    }
  }
}

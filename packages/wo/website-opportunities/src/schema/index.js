/**
 * The Website Opportunities schema: numbered .sql files in this folder, applied in name order, each recorded with its
 * sha256 in `wo_schema_migration`. A file that was applied and has since changed is refused, never re-run.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SCHEMA_DIR = fileURLToPath(new URL('./', import.meta.url))
export const BASELINE = '0001-baseline.sql'
// Shared with the host's own migrator by default, so a host that runs both never interleaves them.
export const LOCK_ID = 7_243_001

export const LEDGER_SQL = `create table if not exists wo_schema_migration (
  name text primary key,
  checksum text not null,
  how text not null check (how in ('applied', 'adopted')),
  target text,
  applied_at timestamptz not null default now()
)`

/** @returns {Promise<{ name: string, sql: string, checksum: string }[]>} the schema files in apply order. */
export async function readSchemaFiles(dir = SCHEMA_DIR) {
  const names = (await readdir(dir)).filter((f) => /^\d{4}-.+\.sql$/.test(f)).sort()
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(dir, name), 'utf8')
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') }
    })
  )
}

/** @returns {Promise<Map<string, { name: string, checksum: string }>>} the recorded files, empty without a ledger. */
export async function readLedger(client) {
  const { rows } = await client.query(`select to_regclass('wo_schema_migration') is not null as present`)
  if (!rows[0].present) return new Map()
  return new Map(
    (await client.query('select name, checksum from wo_schema_migration')).rows.map((r) => [r.name, r])
  )
}

/** Throws when an applied file's checksum no longer matches the file on disk. */
export function assertUnchanged(files, applied) {
  for (const file of files) {
    const row = applied.get(file.name)
    if (row && row.checksum !== file.checksum) {
      throw new Error(
        `wo schema: ${file.name} was applied with checksum ${row.checksum} but the file now has checksum ` +
          `${file.checksum}; an applied migration must never change, add a new file instead`
      )
    }
  }
}

/**
 * Bring a database to the package's schema. Safe to call from every replica at boot: one advisory lock, each file in
 * its own transaction, already-applied files skipped.
 *
 * A database that already holds the tables without a record of them (it reached them through another history) is
 * refused: it must be verified and adopted first (`adoptWoSchema` in ./verify.js).
 *
 * @param {import('pg').Pool} pool
 * @param {{ dir?: string, lockId?: number }} [options]
 * @returns {Promise<{ applied: string[] }>}
 */
export async function migrate(pool, { dir = SCHEMA_DIR, lockId = LOCK_ID } = {}) {
  const files = await readSchemaFiles(dir)
  const client = await pool.connect()
  const applied = []
  try {
    await client.query('select pg_advisory_lock($1)', [lockId])
    const done = await readLedger(client)
    assertUnchanged(files, done)
    if (!done.has(BASELINE)) {
      const { rows } = await client.query(`select to_regclass('wo_opportunity') is not null as present`)
      if (rows[0].present) {
        throw new Error(
          'wo schema: the database already has the wo_* tables but no record of the baseline; ' +
            'verify and adopt it with adoptWoSchema() before migrating'
        )
      }
    }
    await client.query(LEDGER_SQL)
    for (const file of files) {
      if (done.has(file.name)) continue
      await client.query('begin')
      try {
        await client.query(file.sql)
        await client.query(
          `insert into wo_schema_migration (name, checksum, how) values ($1, $2, 'applied')`,
          [file.name, file.checksum]
        )
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        throw error
      }
      applied.push(file.name)
    }
  } finally {
    await client.query('select pg_advisory_unlock($1)', [lockId]).catch(() => {})
    client.release()
  }
  return { applied }
}

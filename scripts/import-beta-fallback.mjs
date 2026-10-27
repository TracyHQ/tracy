/** Import a private JSON export through stdin; neither emails nor API credentials are logged. */
import { readFile } from 'node:fs/promises'
import { createPool } from '../apps/tracy-web/src/db/index.js'
import { fallbackHashes } from '../apps/tracy-web/src/lib/beta-fallback.js'

const day = process.argv[2]
if (!process.env.DATABASE_URL || !day)
  throw new Error(
    'Usage: DATABASE_URL=... node scripts/import-beta-fallback.mjs YYYY-MM-DD < private-export.json'
  )
let records
try {
  records = JSON.parse(await readFile('/dev/stdin', 'utf8'))
} catch {
  throw new Error('Fallback export must be valid JSON; input was not logged')
}
const hashes = await fallbackHashes(records, day)
const pool = createPool(process.env.DATABASE_URL)
const client = await pool.connect()
try {
  await client.query('begin')
  await client.query('lock table beta_fallback in exclusive mode')
  await client.query('delete from beta_fallback')
  await client.query(
    'insert into beta_fallback (email_hash,source_day) select unnest($1::text[]), $2::date',
    [hashes, day]
  )
  await client.query('commit')
  console.log(`Fallback replaced: ${hashes.length} eligible members; source day ${day}`)
} catch {
  await client.query('rollback')
  throw new Error('Fallback import failed; previous list was preserved')
} finally {
  client.release()
  await pool.end()
}

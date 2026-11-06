#!/usr/bin/env node
/**
 * The picture bench from a shell (#340): the bench has no screen, so its runs are started, read and cancelled here,
 * and the worker inside the running tracy-web process picks each run up. Run it where tracy-web runs: it needs that
 * container's DATABASE_URL and SESSION_SECRET (it opens the picker door's key), the same file store folder as the
 * server (TRACY_PICTURE_BENCH_DIR, or the default in the system's temporary directory) and imports ../src. The image carries it (apps/tracy-web/Dockerfile names it):
 *
 *   docker exec <tracy-web> node scripts/site-pictures-bench.mjs run --plan-file plan.json --kit ja-boxing/j6/1.0.10 --brief-revision <id>
 *   docker exec <tracy-web> node scripts/site-pictures-bench.mjs run --plan-file plan.json --kit ja-boxing/j6/1.0.10 --brief-file brief.json --photos photos
 *   docker exec <tracy-web> node scripts/site-pictures-bench.mjs status <runId>
 *   docker exec <tracy-web> node scripts/site-pictures-bench.mjs get <runId> --out run-files
 *
 * `get` also writes run-files/mapping.json, the write step's picture file (exportPictureMapping of the final manifest),
 * beside site-pictures.json and the files/ both name, so the write step reads the folder as it is:
 *
 *   docker exec <tracy-web> node scripts/write-step-bench.mjs run ... --pictures-file run-files/mapping.json
 *
 * Every command and its options: `node scripts/site-pictures-bench.mjs` with no command (src/site-pictures/bench-cli.js).
 * Nothing it prints or writes carries a key.
 */
import { createPool } from '../src/db/index.js'
import { runCli } from '../src/site-pictures/bench-cli.js'
import { defaultStoreDir } from '../src/site-pictures/file-store.js'

export async function main(argv, env = process.env) {
  if (!env.DATABASE_URL) {
    process.stderr.write('site-pictures-bench: DATABASE_URL must be set (run it in tracy-web)\n')
    return 1
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    return await runCli(argv, { pool, secret: env.SESSION_SECRET, storeDir: defaultStoreDir(env) })
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    }
  )
}

#!/usr/bin/env node
/**
 * The site planner bench from a shell (ADR 0041, #301): the bench has no screen, so its runs are started, read and
 * cancelled here, and the worker inside the running tracy-web process picks each run up. Run it where tracy-web runs:
 * it needs that container's DATABASE_URL and SESSION_SECRET (the key that opens the site planner door's provider)
 * and imports ../src. The image carries it (apps/tracy-web/Dockerfile names it):
 *
 *   docker exec <tracy-web> node scripts/site-planner-bench.mjs kits
 *   docker exec <tracy-web> node scripts/site-planner-bench.mjs run --kit ja-boxing/j6/1.0.10 --brief-revision <id>
 *   docker exec <tracy-web> node scripts/site-planner-bench.mjs status <runId>
 *
 * Every command and its options: `node scripts/site-planner-bench.mjs` with no command (src/site-planner/bench-cli.js).
 * Nothing it prints or writes carries a key.
 */
import { createPool } from '../src/db/index.js'
import { runCli } from '../src/site-planner/bench-cli.js'

export async function main(argv, env = process.env) {
  if (!env.DATABASE_URL || !env.SESSION_SECRET) {
    process.stderr.write(
      'site-planner-bench: DATABASE_URL and SESSION_SECRET must be set (run it in tracy-web)\n'
    )
    return 1
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    return await runCli(argv, { pool, secret: env.SESSION_SECRET })
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

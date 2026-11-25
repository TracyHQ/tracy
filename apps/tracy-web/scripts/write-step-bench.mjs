#!/usr/bin/env node
/**
 * The write step bench from a shell (ADR 0044). BENCH ONLY: it creates, writes and deletes trial sites on the server it
 * runs on and never runs in a customer's flow. Run it where tracy-web runs: it needs that container's DATABASE_URL and
 * SESSION_SECRET (to sign in as the bench account), and calls the web app's own doors on its loopback port. A run happens
 * in this process, with no worker in the server, and stops when this process stops.
 *
 *   node scripts/write-step-bench.mjs create-site --kit <contract id> --account <bench account email>
 *   node scripts/write-step-bench.mjs run --site <site key> --kit <contract id> --plan-file <path> --copy-file <path> --account <email>
 *   node scripts/write-step-bench.mjs run ... --repair --out <dir>   (step 9 whole, with step 9b through Tracy's site agent)
 *   node scripts/write-step-bench.mjs check --run <run> --account <email> [--out <dir>]
 *   node scripts/write-step-bench.mjs list | status <run> | get <run> --out <dir> | cancel <run>
 *
 * Every command and its options: `node scripts/write-step-bench.mjs` with no command (src/write-step-bench-cli.js).
 */
import { createPool } from '../src/db/index.js'
import { runCli } from '../src/write-step-bench-cli.js'
import { writeStepBenchDeps } from '../src/write-step-bench-deps.js'

export async function main(argv, env = process.env) {
  if (!env.DATABASE_URL || !env.SESSION_SECRET) {
    process.stderr.write(
      'write-step-bench: DATABASE_URL and SESSION_SECRET must be set (run it in tracy-web)\n'
    )
    return 1
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    return await runCli(argv, writeStepBenchDeps({ pool, env }))
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

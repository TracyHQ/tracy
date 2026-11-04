#!/usr/bin/env node
/**
 * The write step bench from a shell (ADR 0044). BENCH ONLY: it creates and deletes trial sites on the server it runs
 * on and never runs in a customer's flow. Run it where tracy-web runs: it needs that container's DATABASE_URL and
 * SESSION_SECRET (to sign in as the bench account), and calls the web app's own doors on its loopback port.
 *
 *   node scripts/write-step-bench.mjs create-site --kit <contract id> --account <bench account email>
 *   node scripts/write-step-bench.mjs status
 *   node scripts/write-step-bench.mjs list
 *
 * Every command and its options: `node scripts/write-step-bench.mjs` with no command (src/write-step/bench-site-cli.js).
 */
import { createPool } from '../src/db/index.js'
import { runCli } from '../src/write-step/bench-site-cli.js'
import { httpSiteDoor } from '../src/write-step/bench-site-door.js'
import { pgBenchSiteStore } from '../src/write-step/bench-site-store.js'

export async function main(argv, env = process.env) {
  if (!env.DATABASE_URL || !env.SESSION_SECRET) {
    process.stderr.write(
      'write-step-bench: DATABASE_URL and SESSION_SECRET must be set (run it in tracy-web)\n'
    )
    return 1
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    return await runCli(argv, {
      store: pgBenchSiteStore(pool),
      makeDoor: ({ account, platform }) =>
        httpSiteDoor({
          baseUrl: env.WRITE_BENCH_BASE_URL ?? `http://127.0.0.1:${env.PORT ?? 8080}`,
          ...(env.TRACY_ORIGIN ? { hostHeader: new URL(env.TRACY_ORIGIN).host } : {}),
          secret: env.SESSION_SECRET,
          email: account,
          platform
        })
    })
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

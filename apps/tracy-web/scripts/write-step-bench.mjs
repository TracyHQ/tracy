#!/usr/bin/env node
/**
 * The write step bench from a shell (ADR 0044). BENCH ONLY: it creates, writes and deletes trial sites on the server it
 * runs on and never runs in a customer's flow. Run it where tracy-web runs: it needs that container's DATABASE_URL and
 * SESSION_SECRET (to sign in as the bench account), and calls the web app's own doors on its loopback port. A run happens
 * in this process, with no worker in the server, and stops when this process stops.
 *
 *   node scripts/write-step-bench.mjs create-site --kit <contract id> --account <bench account email>
 *   node scripts/write-step-bench.mjs run --site <site key> --kit <contract id> --plan-file <path> --copy-file <path> --account <email>
 *   node scripts/write-step-bench.mjs check --run <run> --account <email> [--out <dir>]
 *   node scripts/write-step-bench.mjs list | status <run> | get <run> --out <dir> | cancel <run>
 *
 * Every command and its options: `node scripts/write-step-bench.mjs` with no command (src/write-step/bench-cli.js).
 */
import { readConfig } from '../src/config.js'
import { createPool } from '../src/db/index.js'
import { hostCall } from '../src/host/client.js'
import { demoSelfNames } from '../src/ops/quickstarts.js'
import { siteByKey } from '../src/sites/store.js'
import { fileBaselineStore } from '../src/site-check/demo-baseline.js'
import { hostMeasure } from '../src/site-check/host-measure.js'
import { readReleases, templateOfTag } from '../src/lib/quickstart-releases.js'
import { runCli } from '../src/write-step/bench-cli.js'
import { httpSiteDoor } from '../src/write-step/bench-site-door.js'
import { pgBenchSiteStore } from '../src/write-step/bench-site-store.js'
import { pgWriteRunStore } from '../src/write-step/write-run-store.js'

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
      // The site check's page groups: the site's host reads the pages, against a demo baseline kept per quickstart version
      // in WRITE_BENCH_BASELINE_DIR (outside the repo). Neither is needed by the other commands.
      makeHost: async (siteKey) => {
        const site = await siteByKey(pool, siteKey)
        if (!site) throw new Error(`No site ${siteKey}`)
        return hostMeasure({ hostCall, config: readConfig(env), site, selfNames: demoSelfNames })
      },
      ...(env.WRITE_BENCH_BASELINE_DIR ? { baselines: fileBaselineStore(env.WRITE_BENCH_BASELINE_DIR) } : {}),
      runs: pgWriteRunStore(pool),
      makeDoor: ({ account, platform }) =>
        httpSiteDoor({
          baseUrl: env.WRITE_BENCH_BASE_URL ?? `http://127.0.0.1:${env.PORT ?? 8080}`,
          ...(env.TRACY_ORIGIN ? { hostHeader: new URL(env.TRACY_ORIGIN).host } : {}),
          secret: env.SESSION_SECRET,
          email: account,
          platform,
          templateOf: async (quickstart) => templateOfTag(await readReleases(pool), quickstart)
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

// The write step bench's wiring (ADR 0044), shared by its command line (scripts/write-step-bench.mjs) and by the chain build
// replay that tracy-web runs in process (step-chain-replay.js). BENCH ONLY: what it wires creates, writes and deletes trial
// sites on this server and never runs in a customer's flow. It signs in as the bench account with SESSION_SECRET and calls
// the web app's own doors on its loopback port.
import { readConfig } from './config.js'
import { hostCall } from './host/client.js'
import { demoSelfNames } from './ops/quickstarts.js'
import { designSystemSiteReaders } from './sites/design-system-site-readers.js'
import { siteByKey } from './sites/store.js'
import { defaultContracts } from './lib/contracts.js'
import { contractBaselineStore, fileBaselineStore } from './site-check/demo-baseline.js'
import { hostMeasure } from './site-check/host-measure.js'
import { readReleases, templateOfTag } from './lib/quickstart-releases.js'
import { httpSiteDoor } from './write-step/bench-site-door.js'
import { siteFileReader } from './write-step/site-file.js'
import { sitePageReader, siteSheetsReader } from './write-step/site-sheets.js'
import { pgBenchSiteStore } from './write-step/bench-site-store.js'
import { pgWriteRunStore } from './write-step/write-run-store.js'
import { mintSeatSession } from './workspace/seat-door.js'
import { benchRepairAgent } from './write-step-bench-repair-agent.js'

/**
 * @param {{ pool: import('pg').Pool, env?: Record<string, string | undefined> }} input
 * @returns {object} the deps of `runCli` (write-step-bench-cli.js)
 */
export function writeStepBenchDeps({ pool, env = process.env }) {
  // Where a site is read and served; the write step's readers take it from here rather than from the sites domain.
  const readers = designSystemSiteReaders({ config: readConfig(env) })
  const deps = {
    store: pgBenchSiteStore(pool),
    // The site check's page groups: the site's host reads the pages, against the demo baseline of the quickstart version
    // committed beside its contract (demo-baseline.json, step 0), or else the one cached in WRITE_BENCH_BASELINE_DIR
    // (outside the repo). Neither is needed by the other commands.
    makeHost: async (siteKey) => {
      const site = await siteByKey(pool, siteKey)
      if (!site) throw new Error(`No site ${siteKey}`)
      return hostMeasure({ hostCall, config: readConfig(env), site, selfNames: demoSelfNames })
    },
    // The stylesheets the site's template serves, which the brand's accent module is built from.
    templateSheets: siteSheetsReader({
      siteOf: (siteKey) => siteByKey(pool, siteKey),
      readers
    }),
    // A file of the site as a visitor reads it: the picture stage reads the look of the template's icons from there.
    templateFiles: siteFileReader({
      siteOf: (siteKey) => siteByKey(pool, siteKey),
      readers
    }),
    // A page as a visitor reads it: the write step's printed check and the site check's written-not-printed read it.
    pageHtml: sitePageReader({
      siteOf: (siteKey) => siteByKey(pool, siteKey),
      readers
    }),
    // Step 9b (`run --repair`): Tracy's site agent, reached as the owner of the bench site (write-step-bench-repair-agent.js).
    makeRepairAgent: async ({ siteKey, account }) =>
      benchRepairAgent({
        pool,
        config: readConfig(env),
        seatDoor: { mintSeatSession },
        door: deps.makeDoor({ account, platform: 'joomla' }),
        siteKey,
        email: account
      }),
    baselines: contractBaselineStore({
      index: defaultContracts(),
      cache: env.WRITE_BENCH_BASELINE_DIR ? fileBaselineStore(env.WRITE_BENCH_BASELINE_DIR) : null
    }),
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
  }
  return deps
}

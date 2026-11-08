#!/usr/bin/env node
/**
 * Measure the demo baseline of a quickstart version on an UNTOUCHED site (ADR 0044, decision 8) and keep it, once per
 * version. BENCH ONLY. Run it where tracy-web runs, like write-step-bench.mjs. The site must be a fresh quickstart
 * nobody has written to: a baseline read off a written site would call the written words demo.
 *
 * A stored baseline is reused and printed as reused; `--force` measures again on purpose (about six minutes).
 * `write-step-bench.mjs create-site` settles the same baseline by itself, so this script is for measuring on its own.
 * A version with `demo-baseline.json` committed beside its contract is reused from there.
 *
 * STEP 0 (#419): this is how the baseline of a NEW quickstart version is made. Measure it here on a site freshly built
 * from the quickstart, then write the stored file beside the contract with the template kit tool, and commit it:
 *
 *   node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs baseline \
 *     --from <WRITE_BENCH_BASELINE_DIR>/<contract id with / as _>.json --contract <contract dir>
 *
 * It is measured here and not by the kit tool because only tracy-web can reach a site's host (the demo-qa door).
 *
 *   WRITE_BENCH_BASELINE_DIR=<dir> node scripts/site-check-baseline.mjs --site <site key> --version <contract id> \
 *     --pages-file <json> [--force]
 *   WRITE_BENCH_BASELINE_DIR=<dir> node scripts/site-check-baseline.mjs --base <untouched demo address> \
 *     --version <contract id> --pages-file <json> [--force]
 *
 * `--base` reads the demo on this machine with tracy-host's own browser reader, as `demo-measures.mjs --base` does (it
 * needs the tracy-host dependencies with Chromium, and no database): step 0 then needs no tracy-web and tracy-host running
 * the current code. The pages are asked under `/index.php`, as the site's host asks a Joomla site's pages.
 *
 * `--pages-file` is a JSON array of the site's paths (the kit's `pages[].path`). It reads them through the host,
 * fifteen per call, and stores texts, labels and picture files and hashes, and the words on a picture with what lay
 * under them. Nothing else of the site is kept. A page the untouched template itself breaks is named as having no demo
 * and the baseline is kept; a page the host could not reach, a broken home, or a site mostly answering errors exits non
 * zero and keeps nothing.
 */
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { readConfig } from '../src/config.js'
import { createPool } from '../src/db/index.js'
import { hostCall } from '../src/host/client.js'
import { defaultContracts } from '../src/lib/contracts.js'
import { demoSelfNames } from '../src/ops/quickstarts.js'
import {
  baselineOutcome,
  contractBaselineStore,
  ensureBaseline,
  fileBaselineStore
} from '../src/site-check/demo-baseline.js'
import { hostMeasure, underIndex } from '../src/site-check/host-measure.js'
import { siteByKey } from '../src/sites/store.js'

/** Joomla answers its pages under `/index.php` (WordPress does not: `underIndex` leaves its pages be): the demo read on this machine is asked them as the site's host asks them. */
const underIndexHost =
  (host, platform = 'joomla') =>
  ({ pages, ...payload }) =>
    host({
      ...payload,
      ...(Array.isArray(pages) ? { pages: pages.map((p) => underIndex(platform, p)) } : {})
    })

/** The platform of the contract whose id is `version`: wordpress or joomla. */
function platformOfVersion(index, version) {
  for (const contract of index.values())
    if (contract.id === version) return contract.platform === 'wordpress' ? 'wordpress' : 'joomla'
  return 'joomla'
}

/** A demo read on this machine by tracy-host's own browser reader (`demo-measures.mjs --base`). */
async function localReader(base, platform) {
  const { localHost } = await import('./demo-measures.mjs')
  return localHost(base, platform)
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} [env]
 * @param {{ hostOf?: Function, index?: Map<string, any>, out?: Function, err?: Function }} [deps] for tests: the reader of
 *   `--base`, the contract index, and where lines go
 */
export async function main(argv, env = process.env, deps = {}) {
  const out = deps.out ?? ((l) => console.log(l))
  const err = deps.err ?? ((l) => process.stderr.write(`${l}\n`))
  const { values } = parseArgs({
    args: argv,
    options: {
      site: { type: 'string' },
      base: { type: 'string' },
      version: { type: 'string' },
      'pages-file': { type: 'string' },
      force: { type: 'boolean' }
    }
  })
  if (
    Boolean(values.site) === Boolean(values.base) ||
    !values.version ||
    !values['pages-file'] ||
    !env.WRITE_BENCH_BASELINE_DIR ||
    (values.site && !env.DATABASE_URL)
  ) {
    err(
      'usage: WRITE_BENCH_BASELINE_DIR=<dir> DATABASE_URL=... node scripts/site-check-baseline.mjs --site <key> --version <contract id> --pages-file <json> [--force]\n' +
        '   or: WRITE_BENCH_BASELINE_DIR=<dir> node scripts/site-check-baseline.mjs --base <untouched demo address> --version <contract id> --pages-file <json> [--force]'
    )
    return 2
  }
  const pages = JSON.parse(await readFile(values['pages-file'], 'utf8'))
  const store = contractBaselineStore({
    index: deps.index ?? defaultContracts(),
    cache: fileBaselineStore(env.WRITE_BENCH_BASELINE_DIR)
  })
  const measure = async (host) => {
    const { baseline, measured } = await ensureBaseline({
      host,
      pages,
      version: values.version,
      // The file committed beside the contract wins: a version that has one is not measured unless forced.
      store,
      force: values.force === true
    })
    out(
      `${baselineOutcome({ measured, force: values.force === true })} ${values.version}: ${baseline.texts.length} texts, ${baseline.labels.length} labels, ${baseline.pictures.files.length} picture files, ${baseline.over?.length ?? 0} words over pictures, ${baseline.unread?.length ?? 0} pages with no demo${baseline.unread?.length ? ` (${baseline.unread.map((u) => `${u.path}: ${u.why}`).join('; ')})` : ''}`
    )
    return 0
  }
  if (values.base) {
    // The platform is the contract's own (its manifest); a version with no contract here is read as Joomla, as before.
    const platform = platformOfVersion(deps.index ?? defaultContracts(), values.version)
    const reader = deps.hostOf ? await deps.hostOf(values) : await localReader(values.base, platform)
    try {
      return await measure(underIndexHost(reader.host, platform))
    } finally {
      await reader.close?.()
    }
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    const site = await siteByKey(pool, values.site)
    if (!site) throw new Error(`No site ${values.site}`)
    return await measure(hostMeasure({ hostCall, config: readConfig(env), site, selfNames: demoSelfNames }))
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

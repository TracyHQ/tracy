#!/usr/bin/env node
/**
 * Measure the demo baseline of a quickstart version on an UNTOUCHED site (ADR 0044, decision 8) and keep it, once per
 * version. BENCH ONLY. Run it where tracy-web runs, like write-step-bench.mjs. The site must be a fresh quickstart nobody
 * has written to: a baseline read off a written site would call the written words demo.
 *
 *   WRITE_BENCH_BASELINE_DIR=<dir> node scripts/site-check-baseline.mjs --site <site key> --version <contract id> --pages-file <json> [--force]
 *
 * `--pages-file` is a JSON array of the site's paths (the kit's `pages[].path`). It reads them through the host, fifteen per call, and stores texts, labels and picture files
 * and hashes, and per page and theme each element's computed look (for the template look group). Nothing else of the site is kept.
 * A page the untouched template itself breaks is named as having no demo and the baseline is kept; a page the host could not reach,
 * a broken home, or a site mostly answering errors exits non zero and keeps nothing.
 */
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { readConfig } from '../src/config.js'
import { createPool } from '../src/db/index.js'
import { hostCall } from '../src/host/client.js'
import { demoSelfNames } from '../src/ops/quickstarts.js'
import { ensureBaseline, fileBaselineStore } from '../src/site-check/demo-baseline.js'
import { hostMeasure } from '../src/site-check/host-measure.js'
import { siteByKey } from '../src/sites/store.js'

export async function main(argv, env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: {
      site: { type: 'string' },
      version: { type: 'string' },
      'pages-file': { type: 'string' },
      force: { type: 'boolean' }
    }
  })
  if (
    !values.site ||
    !values.version ||
    !values['pages-file'] ||
    !env.WRITE_BENCH_BASELINE_DIR ||
    !env.DATABASE_URL
  ) {
    process.stderr.write(
      'usage: WRITE_BENCH_BASELINE_DIR=<dir> DATABASE_URL=... node scripts/site-check-baseline.mjs --site <key> --version <contract id> --pages-file <json> [--force]\n'
    )
    return 2
  }
  const pool = createPool(env.DATABASE_URL)
  try {
    const site = await siteByKey(pool, values.site)
    if (!site) throw new Error(`No site ${values.site}`)
    const host = hostMeasure({ hostCall, config: readConfig(env), site, selfNames: demoSelfNames })
    const { baseline, measured } = await ensureBaseline({
      host,
      pages: JSON.parse(await readFile(values['pages-file'], 'utf8')),
      version: values.version,
      store: fileBaselineStore(env.WRITE_BENCH_BASELINE_DIR),
      force: values.force === true
    })
    console.log(
      `${measured ? 'measured' : 'kept'} ${values.version}: ${baseline.texts.length} texts, ${baseline.labels.length} labels, ${baseline.pictures.files.length} picture files, the look of ${Object.keys(baseline.look?.pages ?? {}).length} pages, ${baseline.unread?.length ?? 0} pages with no demo${baseline.unread?.length ? ` (${baseline.unread.map((u) => `${u.path}: ${u.why}`).join('; ')})` : ''}`
    )
    return 0
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

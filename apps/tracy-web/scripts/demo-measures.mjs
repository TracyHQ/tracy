#!/usr/bin/env node
/**
 * Measure the UNTOUCHED demo of a quickstart version with the site check's layout measures (main headings, empty blocks,
 * text past its box or past the right edge, orphan card rows, blank footer columns) at 1440 and 390, and write `demo-measures.json` beside its contract, where
 * the template readiness verdict reads it (`src/lib/template-readiness/demo-measures-check.js`, ticket #436).
 *
 *   node apps/tracy-web/scripts/demo-measures.mjs --contract <contract folder> --base <demo address> [--pages-file <json>]
 *   DATABASE_URL=... node apps/tracy-web/scripts/demo-measures.mjs --contract <contract folder> --site <site key> [--pages-file <json>]
 *
 *   --base   the demo's own address (a local DDEV site or the dev demo). Read on this machine by tracy-host's own browser
 *            reader (`apps/tracy-host/src/demo-qa-browser.js`, the one `POST /_host/demo-qa` runs), so it needs the
 *            tracy-host dependencies installed (Playwright with Chromium).
 *   --site   a site Tracy knows, read through its host as the site check reads a built site (`site-check/host-measure.js`);
 *            run it where tracy-web runs.
 *
 * The pages are the template kit's (`template-kit.json` in the contract folder, `pages[].path`) unless `--pages-file`
 * names a JSON array of paths; the quickstart slug and version are the kit's. The site must be a fresh quickstart nobody
 * has written to. The file keeps what was found and where (path, width, the words seen), never the site's address.
 * Exit code 0 when the file was written and the demo is clean, 1 when written with faults or unmeasured groups, 2 when
 * nothing was written.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { DEMO_MEASURES_COMMAND } from '../src/lib/template-readiness/demo-measures-check.js'
import { DEMO_MEASURES_FILE } from '../src/lib/template-readiness/demo-measures-file.js'
import { measureDemo } from '../src/site-check/demo-measures.js'

const USAGE = `usage: ${DEMO_MEASURES_COMMAND}\n`

/** A host reader run on this machine: tracy-host's own browser code, opened at `base`. */
async function localHost(base) {
  const origin = new URL(base).origin
  const hostSrc = new URL('../../tracy-host/src/', import.meta.url)
  const { makeDemoQa } = await import(new URL('demo-qa-browser.js', hostSrc).href)
  const { demoQaBody } = await import(new URL('demo-qa.js', hostSrc).href)
  const demoQa = await makeDemoQa({ log: { warn: (s) => process.stderr.write(`${s}\n`), log: () => {} } })
  if (!demoQa)
    throw new Error(
      'Playwright is not installed for apps/tracy-host: run pnpm install, then npx playwright install chromium'
    )
  const host = async ({ timeoutMs = 320_000, ...payload }) => {
    const asked = demoQaBody({
      label: 'demo',
      platform: 'joomla',
      host: new URL(origin).hostname,
      ...payload
    })
    if (asked.error) throw new Error(`The page read was refused: ${asked.error}`)
    return demoQa({ asked, base: origin, signal: AbortSignal.timeout(timeoutMs) })
  }
  return { host, close: () => demoQa.close?.() }
}

/** The host of a site Tracy knows, as the site check reaches it. */
async function siteHost(siteKey, env) {
  const [{ readConfig }, { createPool }, { hostCall }, { demoSelfNames }, { hostMeasure }, { siteByKey }] =
    await Promise.all([
      import('../src/config.js'),
      import('../src/db/index.js'),
      import('../src/host/client.js'),
      import('../src/ops/quickstarts.js'),
      import('../src/site-check/host-measure.js'),
      import('../src/sites/store.js')
    ])
  const pool = createPool(env.DATABASE_URL)
  const site = await siteByKey(pool, siteKey)
  if (!site) {
    await pool.end()
    throw new Error(`No site ${siteKey}`)
  }
  const host = hostMeasure({ hostCall, config: readConfig(env), site, selfNames: demoSelfNames })
  return { host, close: () => pool.end() }
}

/** One line per group, then the faults. */
export function measuresText(doc) {
  const lines = doc.groups.map(
    (g) =>
      `  ${g.status.padEnd(14)} ${g.name.padEnd(14)} ${g.failures.length} finding(s)${g.reason ? ` (${g.reason})` : ''}`
  )
  const faults = doc.groups.flatMap((g) =>
    g.failures.map(
      (f) =>
        `    ${f.level} ${g.name} ${f.page ?? ''} @${f.width ?? '-'}: ${f.reason ?? ''} ${f.measured ? JSON.stringify(f.measured) : ''}`
    )
  )
  return [
    `${doc.quickstart.slug} ${doc.quickstart.version}: ${doc.status}, ${doc.pages.length} pages`,
    ...lines,
    ...faults
  ].join('\n')
}

/**
 * @param {string[]} argv
 * @param {{ env?: NodeJS.ProcessEnv, out?: (s: string) => void, err?: (s: string) => void, hostOf?: Function }} [io]
 *   `hostOf(values)` stands in for the two readers above (tests)
 */
export async function main(
  argv,
  {
    env = process.env,
    out = (s) => process.stdout.write(s),
    err = (s) => process.stderr.write(s),
    hostOf
  } = {}
) {
  const { values } = parseArgs({
    args: argv,
    options: {
      contract: { type: 'string' },
      base: { type: 'string' },
      site: { type: 'string' },
      'pages-file': { type: 'string' }
    }
  })
  if (
    !values.contract ||
    Boolean(values.base) === Boolean(values.site) ||
    (values.site && !env.DATABASE_URL)
  ) {
    err(USAGE)
    return 2
  }
  let kit
  try {
    kit = JSON.parse(readFileSync(path.join(values.contract, 'template-kit.json'), 'utf8'))
  } catch {
    err(
      `No readable template-kit.json in ${values.contract}: the demo's pages and version are read from it.\n`
    )
    return 2
  }
  const quickstart = {
    slug: kit.quickstart?.product,
    version: kit.quickstart?.version
  }
  if (typeof quickstart.slug !== 'string' || typeof quickstart.version !== 'string') {
    err('The template kit names no quickstart slug and version.\n')
    return 2
  }
  let pages
  try {
    pages = values['pages-file']
      ? JSON.parse(readFileSync(values['pages-file'], 'utf8'))
      : (kit.pages ?? []).map((p) => p.path).filter((p) => typeof p === 'string')
  } catch {
    err(`${values['pages-file']} is not a readable JSON array of paths.\n`)
    return 2
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    err('No page to measure.\n')
    return 2
  }
  const reader = hostOf
    ? await hostOf(values)
    : values.base
      ? await localHost(values.base)
      : await siteHost(values.site, env)
  let doc
  try {
    doc = await measureDemo({ host: reader.host, pages, quickstart })
  } finally {
    await reader.close?.()
  }
  const file = path.join(values.contract, DEMO_MEASURES_FILE)
  writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`)
  out(`${measuresText(doc)}\nwrote ${DEMO_MEASURES_FILE}\n`)
  return doc.status === 'green' ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(2)
    }
  )
}

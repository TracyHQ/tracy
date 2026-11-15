#!/usr/bin/env node
/**
 * The marker test of the release gate (ticket #585): write a marker into every place an AI quickstart declares, render
 * every page at 390, 768 and 1440 in light and dark, and report every word, picture, link, alt, title and meta that is
 * no marker, with its page, place and source; scan the same pages for demo words and pictures; write a check record.
 *
 *   GATE_TOKEN_FILE=<file holding the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/gate/gate.mjs <AI quickstart folder> --installer <blank site .zip> --out <folder>
 *       [--site <base URL>] [--plugin <version>]
 *
 * Without `--site` it stops after the write on a memory site (the accounting of the universe). With it, the site is a
 * throwaway blank site of that AI quickstart, the Claude Cowork plugin installed and its updater off: the command binds
 * it, writes the marker plan through the plugin (`site-doors.mjs`), reads the plugin version at the start and the end
 * (it must not move and must be `--plugin`, by default the version `apps/tracy-web/src/quickstarts.json` pins), and
 * renders headless (Playwright of the workspace). `--out` gets `record.json`, `record.html`, `shots/` and the raw
 * calls; keep it outside the repository. Exits 0 when the record passes, 1 when it does not, 2 on a usage error.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { demoCorpus, corpusInputOf } from '../rendered-scan.mjs'
import { siteDoors } from '../site-doors.mjs'
import { directSend } from '../site-doors-send.mjs'
import { accountFor } from './accounting.mjs'
import { sitePages } from './adapters/joomla-t4.mjs'
import { classify } from './classify.mjs'
import { demoChecks } from './demo-checks.mjs'
import { keptKeysOf } from './exemptions.mjs'
import { markerBuild } from './marker-plan.mjs'
import { MEASURED_REFUSALS, memoryTryWrite, openMarkerPicture } from './memory-write.mjs'
import { checkRecord, splitOf } from './record.mjs'
import { recordHtml } from './record-html.mjs'
import { renderSite, THEMES, WIDTHS } from './render.mjs'
import { filesOf, sourceResolver } from './sources.mjs'
import { realWrite } from './site-write.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
const installer = flag('--installer')
const out = flag('--out')
const site = flag('--site')?.replace(/\/+$/, '') ?? null
if (!folder || !installer || !out) {
  console.error(
    'usage: gate.mjs <AI quickstart folder> --installer <blank site .zip> --out <folder> [--site <URL>]'
  )
  process.exit(2)
}
const startedAt = new Date().toISOString()
mkdirSync(out, { recursive: true })
const json = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
const mapping = json('mapping.json')
const kit = {
  ref: `${mapping.template?.slug}/${mapping.template?.cms ?? 'j6'}@${mapping.template?.version}`,
  template: mapping.template,
  blockStore: json('block-store.json'),
  pageRecipes: json('page-recipes.json'),
  mapping,
  blankContract: json('blank-site-contract/content-map.json'),
  lock: json('blank-site-contract/presentation-lock.json')
}
const log = (line) => {
  console.log(line)
  appendFileSync(path.join(out, 'gate.log'), `${line}\n`)
}

// 1. The marker build, written first on a memory site: the write step gaps are learnt there.
const built = await markerBuild(kit, {
  iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
  tryWrite: memoryTryWrite(kit)
})
const accounting = accountFor(kit, built)
log(
  `memory write ${built.written.report.status}: ${built.writePlan.ops.length} operations, ${built.gaps.length} gaps`
)
log(`universe ${JSON.stringify(accounting.counts)}`)
log(`split ${JSON.stringify(splitOf(accounting.places))}`)
if (!site) {
  writeFileSync(
    path.join(out, 'accounting.json'),
    JSON.stringify(
      {
        counts: accounting.counts,
        split: splitOf(accounting.places),
        places: accounting.places,
        gaps: built.gaps
      },
      null,
      1
    )
  )
  process.exit(accounting.counts.unexplained ? 1 : 0)
}

// 2. The real site: bind, write, plugin version asserted at both ends.
const token = readFileSync(process.env.GATE_TOKEN_FILE ?? '', 'utf8').trim()
const send = directSend({
  base: site,
  token,
  log: (e) => appendFileSync(path.join(out, 'calls.jsonl'), `${JSON.stringify(e).slice(0, 4000)}\n`)
})
const pin = flag('--plugin') ?? pinnedPlugin()
const real = await realWrite({
  send,
  base: site,
  built,
  out,
  pin,
  log,
  open: openMarkerPicture(built.registry)
})
const doors = siteDoors({ send })

// 3. Render every page, then read the renders.
const { chromium } = createRequire(
  path.join(ROOT, 'node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/package.json')
)('playwright')
const pages = await sitePages({ base: site, record: real.record, doors, order: built.order })
// One request before the renders: the template builds its cache on the first page it serves, and two browsers asking
// at once met a server error there (measured on the first real run).
for (const p of pages.slice(0, 1)) await fetch(p.url).catch(() => null)
const renders = await renderSite({ pages, chromium, out, log })
const siteValues = new Map()
for (const [key, id] of Object.entries(real.record.ids ?? {}))
  if (key.startsWith('article:')) {
    const name = (await doors.get({ kind: 'article', id }))?.author?.name
    if (name)
      siteValues.set(name, {
        kind: 'data',
        table: 'users',
        column: 'name',
        why: 'the account the plugin writes as, printed as the author'
      })
  }
const classified = classify({
  renders,
  origin: new URL(site).origin,
  registry: built.registry.entries,
  writePlan: built.writePlan,
  uploaded: real.record.paths,
  ids: real.record.ids,
  resolve: sourceResolver(filesOf(installer), { site: new URL(site).origin }),
  kept: keptKeysOf(mapping),
  siteValues
})
const corpus = demoCorpus(corpusInputOf({ ...kit, contentMap: kit.blankContract }))
const demo = await demoChecks({
  renders,
  corpus,
  leaks: classified.findings.filter((f) => f.group === 'unmarked_text')
})
const record = checkRecord({
  kit,
  origin: new URL(site).origin,
  built,
  accounting,
  real: real.report,
  renders,
  pages,
  classified,
  demo,
  widths: WIDTHS,
  themes: THEMES,
  plugin: real.plugin,
  refusals: MEASURED_REFUSALS,
  startedAt
})
writeFileSync(path.join(out, 'record.json'), JSON.stringify(record, null, 1))
writeFileSync(path.join(out, 'record.html'), recordHtml(record))
log(`record: ${JSON.stringify(record.verdict)} leaks by group ${JSON.stringify(record.markerTest.byGroup)}`)
process.exit(record.verdict.pass ? 0 : 1)

function pinnedPlugin() {
  const file = path.join(ROOT, 'apps/tracy-web/src/quickstarts.json')
  if (!existsSync(file)) return null
  const pins = JSON.parse(readFileSync(file, 'utf8'))
  return (
    pins[`quickstart/${mapping.template?.slug}/${mapping.template?.cms ?? 'j6'}`]?.cowork?.version ?? null
  )
}

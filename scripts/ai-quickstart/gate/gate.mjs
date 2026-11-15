#!/usr/bin/env node
/**
 * The marker test of the release gate (ticket #585): write a marker into every place an AI quickstart declares, render
 * every page at 390, 768 and 1440 in light and dark, and report every word, picture, link, alt, title and meta that is
 * no marker, with its page, place and true source, grouped with the fix each group most likely needs; scan the same
 * pages for demo words and pictures, with the scan's two controls; write a check record and its review page.
 *
 *   GATE_TOKEN_FILE=<file holding the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/gate/gate.mjs <AI quickstart folder> --human-quickstart <human quickstart .zip> \
 *       --out <folder> [--site <base URL>] [--human-site <base URL> | --human-control <control.json>]
 *       [--installer <blank site .zip>] [--plugin <v>]
 *   node scripts/ai-quickstart/gate/gate.mjs <AI quickstart folder> --human-quickstart <zip> --out <folder> \
 *     --control-only <base URL of the untouched human quickstart>
 *
 * The AI quickstart folder and its human quickstart are the only inputs; nothing in the gate names a template. The
 * blank site archive is made from the human quickstart (`blank-site.mjs`) unless `--installer` gives it. Without
 * `--site` the command stops after the write on a memory site (the accounting of the universe). With it, `--site` is
 * a throwaway blank site of that archive, the Claude Cowork plugin installed and its updater off, and `--human-site`
 * the untouched human quickstart restored on another throwaway site. The command renders both controls first (the
 * demo scan must find demo on the human quickstart and none on the blank site), then binds the blank site, writes
 * the marker plan through the plugin (`site-doors.mjs`), reads the plugin version at both ends (it must not move and
 * must be `--plugin`, by default the version `apps/tracy-web/src/quickstarts.json` pins) and renders headless
 * (Playwright of the workspace). `--out` gets `record.json`, `record.html`, `shots/`, `crops/` and the raw calls; keep
 * it outside the repository. Exits 0 when the record passes, 1 when it does not, 2 on a usage error. A machine that
 * can hold one throwaway site at a time measures the human control first with `--control-only` (it writes
 * `controls/human.json` and stops) and gives that file to the full run with `--human-control`.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { corpusInputOf, demoCorpus } from '../rendered-scan.mjs'
import { siteDoors } from '../site-doors.mjs'
import { directSend } from '../site-doors-send.mjs'
import { EXEMPTIONS, SYSTEM_PAGES, sitePages } from './adapters/joomla-t4.mjs'
import { crawlPages } from './adapters/web-frame.mjs'
import { cropGroups } from './crops.mjs'
import { controlOf } from './demo-checks.mjs'
import { MEASURED_REFUSALS, memoryTryWrite, openMarkerPicture } from './memory-write.mjs'
import { kitHashesOf, splitOf } from './record.mjs'
import { recordHtml } from './record-html.mjs'
import { renderSite, THEMES, WIDTHS } from './render.mjs'
import { runGate } from './run-gate.mjs'
import { realWrite } from './site-write.mjs'
import { filesOf } from './sources.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
const human = flag('--human-quickstart')
const out = flag('--out') ? path.resolve(flag('--out')) : null
const site = flag('--site')?.replace(/\/+$/, '') ?? null
const humanSite = flag('--human-site')?.replace(/\/+$/, '') ?? null
const controlOnly = flag('--control-only')?.replace(/\/+$/, '') ?? null
const humanControl = flag('--human-control')
if (!folder || !out || (!human && !flag('--installer'))) {
  console.error(
    'usage: gate.mjs <AI quickstart folder> --human-quickstart <zip> --out <folder> [--site <URL>] [--human-site <URL>]'
  )
  process.exit(2)
}
mkdirSync(out, { recursive: true })
const json = (file) => JSON.parse(readFileSync(path.join(folder, file), 'utf8'))
const mapping = json('mapping.json')
const t = mapping.template ?? {}
const kit = {
  ref: `${t.slug}/${t.cms ?? 'j6'}@${t.version}`,
  template: t,
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
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

// The blank site archive: made from the human quickstart by the blank site step, or given.
const installer = flag('--installer') ?? path.join(out, 'blank', `${t.slug}-blank-${t.version}.zip`)
if (!flag('--installer')) {
  mkdirSync(path.dirname(installer), { recursive: true })
  execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'scripts/ai-quickstart/blank-site.mjs'),
      human,
      '--out',
      installer,
      '--mapping',
      path.join(folder, 'mapping.json')
    ],
    { stdio: 'inherit' }
  )
}
log(`blank site archive ${path.basename(installer)} sha256 ${sha(installer)}`)

const browser = () =>
  createRequire(path.join(ROOT, 'node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/package.json'))(
    'playwright'
  ).chromium
const corpus = demoCorpus(corpusInputOf({ ...kit, contentMap: kit.blankContract }))
const controlRender = async (base, name) => {
  const pages = [
    ...(await crawlPages({ base })),
    ...SYSTEM_PAGES.map((s) => ({ ...s, url: new URL(s.path, `${base}/`).toString(), from: 'system' }))
  ]
  await fetch(pages[0].url).catch(() => null)
  const controlOut = path.join(out, 'controls', name)
  return renderSite({
    pages,
    chromium: browser(),
    out: controlOut,
    themes: ['light'],
    widths: [1440],
    shots: { theme: 'light', widths: [] },
    log
  })
}

if (controlOnly) {
  const control = await controlOf(await controlRender(controlOnly, 'human'), corpus)
  mkdirSync(path.join(out, 'controls'), { recursive: true })
  writeFileSync(path.join(out, 'controls', 'human.json'), JSON.stringify(control, null, 1))
  log(`control human: ${control.status}, ${control.findings} finding(s) on ${control.pages} page(s)`)
  process.exit(control.findings > 0 ? 0 : 1)
}

let token = null
let send = null
const result = await runGate({
  kit,
  archive: filesOf(installer),
  adapter: { exemptions: EXEMPTIONS },
  iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
  tryWrite: memoryTryWrite(kit),
  corpus,
  widths: WIDTHS,
  themes: THEMES,
  refusals: MEASURED_REFUSALS,
  kitHashes: kitHashesOf(folder),
  inputs: {
    blankSite: { file: path.basename(installer), sha256: sha(installer) },
    ...(human ? { humanQuickstart: { file: path.basename(human), sha256: sha(human) } } : {})
  },
  log,
  ...(site && {
    controls: async () => ({
      human: humanSite
        ? await controlOf(await controlRender(humanSite, 'human'), corpus)
        : humanControl
          ? JSON.parse(readFileSync(humanControl, 'utf8'))
          : { status: 'not_run', findings: null },
      blank: await controlOf(await controlRender(site, 'blank'), corpus)
    }),
    site: async ({ built }) => {
      token = readFileSync(process.env.GATE_TOKEN_FILE ?? '', 'utf8').trim()
      send = directSend({
        base: site,
        token,
        log: (e) => appendFileSync(path.join(out, 'calls.jsonl'), `${JSON.stringify(e).slice(0, 4000)}\n`)
      })
      const real = await realWrite({
        send,
        base: site,
        built,
        out,
        pin: flag('--plugin') ?? pinnedPlugin(),
        log,
        open: openMarkerPicture(built.registry)
      })
      const doors = siteDoors({ send })
      const pages = await sitePages({ base: site, record: real.record, doors, order: built.order })
      // The account the plugin writes as, printed as the author of an article: a value of the site's own records.
      const siteValues = new Map()
      for (const [key, id] of Object.entries(real.record.ids ?? {}))
        if (key.startsWith('article:')) {
          const name = (await doors.get({ kind: 'article', id }))?.author?.name
          if (name)
            siteValues.set(name, { table: 'users', column: 'name', why: 'the account the plugin writes as' })
        }
      return { origin: new URL(site).origin, real, pages, siteValues }
    },
    render: async (pages) => {
      // One request first: the template builds its cache on the first page it serves (two browsers at once met a
      // server error there, measured on the first real run).
      await fetch(pages[0].url).catch(() => null)
      return renderSite({ pages, chromium: browser(), out, log })
    }
  })
})

if (!result.record) {
  const { accounting, built } = result
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
const { record } = result
const sharp = createRequire(path.join(ROOT, 'apps/tracy-web/package.json'))('sharp')
log(`crops ${await cropGroups({ groups: record.markerTest.groups, out, sharp })}`)
writeFileSync(path.join(out, 'record.json'), JSON.stringify(record, null, 1))
writeFileSync(path.join(out, 'record.html'), recordHtml(record))
log(`record: ${JSON.stringify(record.verdict)}`)
log(`groups ${JSON.stringify(record.markerTest.groupCounts)}`)
process.exit(record.verdict.pass ? 0 : 1)

function pinnedPlugin() {
  const file = path.join(ROOT, 'apps/tracy-web/src/quickstarts.json')
  if (!existsSync(file)) return null
  const pins = JSON.parse(readFileSync(file, 'utf8'))
  return pins[`quickstart/${t.slug}/${t.cms ?? 'j6'}`]?.cowork?.version ?? null
}

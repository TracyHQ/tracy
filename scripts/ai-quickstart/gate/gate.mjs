#!/usr/bin/env node
/**
 * The release gate in one command (tickets #585 and #586). Every measurement in its order on one throwaway site
 * (`release-gate.mjs`): the secret scan, the untouched human quickstart (the demo scan's control and the quality
 * baseline), the marker test, the full structure variant, template quality, the hidden variant, the minimum variant on
 * a reset site, the write safety passes; then `record.json`, `record.html` and `check-record/` (the record and its
 * verdict file) in `--out`.
 *
 *   GATE_TOKEN_FILE=<file holding the site's Claude Cowork token> \
 *     node scripts/ai-quickstart/gate/gate.mjs <AI quickstart folder> --human-quickstart <zip> --out <folder> \
 *       [--site <base URL>] [--reset-site "<command>"] [--human-site <URL> | --human-control <control.json>]
 *       [--quality-control <quality.json>] [--quality-baseline <demo-measures.json>] [--installer <blank site .zip>]
 *       [--plugin <v>] [--contract <blank site contract ref>] [--demo-content <released content-map.json>]
 *       [--into-kit] [--no-gitleaks]
 *   node scripts/ai-quickstart/gate/gate.mjs <folder> --human-quickstart <zip> --out <folder> --control-only <URL>
 *   node scripts/ai-quickstart/gate/gate.mjs <folder> --human-quickstart <zip> --out <folder> --secrets-only
 *
 * Without `--site` the command stops after the marker build on a memory site (`accounting.json`). `--site` is a fresh
 * blank site of the blank site archive with the plugin installed; `--reset-site` a shell command that makes it fresh
 * again (without it the minimum variant and write safety are `not_run`, and the verdict fails). `--control-only`
 * measures the untouched human quickstart alone (`controls/human.json`, `controls/quality.json`) for a machine that
 * holds one throwaway site at a time, as the gate's own files (`gate-controls.mjs`); the full run reads them with
 * `--human-control` (the quality file beside it is found on its own) and refuses any other file. `--secrets-only` runs
 * the secret scan alone (`secrets.json`). `--into-kit` also writes `check-record/` into the kit folder. The write
 * safety passes are kept in `<out>/write-safety-state.json`, so a run stopped by its time limit resumes when run again
 * into the same folder. A run that stops before its phases still writes a failing record (`stoppedRecord`). Exit 0
 * when what ran passed, 1 when not, 2 on a usage error.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import {
  PHOSPHOR_SET,
  phosphorCatalog
} from '../../../apps/tracy-web/src/lib/picture-paint/icons/phosphor-set.js'
import { demoRoutesOf } from '../../built-site-check/inputs.mjs'
import { corpusInputOf, demoCorpus } from '../rendered-scan.mjs'
import { JOOMLA_PROBES } from './adapters/joomla-probes.mjs'
import { joomlaQualityPath } from './adapters/joomla-quality-path.mjs'
import { DECLARED_HOSTS, EXEMPTIONS, PLATFORM, SYSTEM_PAGES } from './adapters/joomla-t4.mjs'
import { crawlPages } from './adapters/web-frame.mjs'
import { cropGroups } from './crops.mjs'
import { joomlaPageKey } from './adapters/joomla-page-key.mjs'
import { measureControls, readControls, writeControls } from './gate-controls.mjs'
import {
  baselineOf,
  kitOf,
  pinnedPlugin,
  recordScanner,
  ROOT,
  secretAllowOf,
  secretsOf
} from './gate-inputs.mjs'
import { MEASURED_REFUSALS, memoryTryWrite } from './memory-write.mjs'
import { markerBuild } from './marker-plan.mjs'
import { kitHashesOf, splitOf } from './record.mjs'
import { releaseGate } from './release-gate.mjs'
import { writeRecordFiles } from './release-gate-files.mjs'
import { stoppedRecord } from './release-gate-record.mjs'
import { renderSite, THEMES, WIDTHS } from './render.mjs'
import { runGate } from './run-gate.mjs'
import { qualityOn, siteSession } from './site-session.mjs'
import { filesOf } from './sources.mjs'
import { blankControlOf } from './verdict.mjs'
import { PROBE_CATALOGUE } from './write-probes-edge.mjs'
import { fileState } from './write-safety-state.mjs'

const argv = process.argv.slice(2)
const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null)
const url = (name) => flag(name)?.replace(/\/+$/, '') ?? null
const folder = argv.find((a, i) => !a.startsWith('-') && !argv[i - 1]?.startsWith('--'))
const human = flag('--human-quickstart')
const out = flag('--out') ? path.resolve(flag('--out')) : null
const [site, humanSite, controlOnly] = [url('--site'), url('--human-site'), url('--control-only')]
if (!folder || !out || (!human && !flag('--installer'))) {
  console.error(
    'usage: gate.mjs <AI quickstart folder> --human-quickstart <zip> --out <folder> [--site <URL>] ...'
  )
  process.exit(2)
}
mkdirSync(path.join(out, 'controls'), { recursive: true })
const log = (line) => {
  console.log(line)
  appendFileSync(path.join(out, 'gate.log'), new Date().toISOString() + ' ' + line + '\n')
}
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const startedAt = new Date().toISOString()
let stage = 'kit'
let kit = null
// A step before the phases that throws still leaves a record, failing with the stage and the reason.
const stop = (error) => {
  log(
    'stopped at ' +
      stage +
      ': ' +
      (error?.code ?? 'error') +
      ' ' +
      String(error?.message ?? error).slice(0, 300)
  )
  const inputs =
    human && existsSync(human) ? { humanQuickstart: { file: path.basename(human), sha256: sha(human) } } : {}
  writeRecordFiles(out, stoppedRecord({ kit, inputs, startedAt, stage, error }))
  process.exit(1)
}
process.on('uncaughtException', stop)
process.on('unhandledRejection', stop)
kit = kitOf(folder)
const t = kit.template

// The blank site archive: made from the human quickstart by the blank site step, or given.
stage = 'blank site'
const installer = flag('--installer') ?? path.join(out, 'blank', t.slug + '-blank-' + t.version + '.zip')
if (!flag('--installer')) {
  mkdirSync(path.dirname(installer), { recursive: true })
  const step = path.join(ROOT, 'scripts/ai-quickstart/blank-site.mjs')
  execFileSync(
    process.execPath,
    [step, human, '--out', installer, '--mapping', path.join(folder, 'mapping.json')],
    {
      stdio: 'inherit'
    }
  )
}
log('blank site archive ' + path.basename(installer) + ' sha256 ' + sha(installer))
const secrets = () =>
  secretsOf({ folder, installer, human, cms: PLATFORM, gitleaks: !argv.includes('--no-gitleaks') })

if (argv.includes('--secrets-only')) {
  const began = Date.now()
  const result = secrets()
  writeFileSync(path.join(out, 'secrets.json'), JSON.stringify(result, null, 1) + '\n')
  for (const f of result.findings) log('finding ' + f.file + ' ' + f.at + ' ' + f.rule + ' ' + f.fingerprint)
  log(
    'secrets ' +
      result.status +
      ': ' +
      result.findings.length +
      ' finding(s), ' +
      result.allowed.length +
      ' allowed, control ' +
      result.control.status +
      ' in ' +
      Math.round((Date.now() - began) / 1000) +
      ' s'
  )
  process.exit(result.status === 'passed' ? 0 : 1)
}

// The browser of the workspace's own Playwright (the root devDependency), resolved the normal way.
const { chromium } = await import('@playwright/test')
const corpus = demoCorpus(corpusInputOf({ ...kit, contentMap: kit.blankContract }))
const crawl = async (base) => [
  ...(await crawlPages({ base })),
  ...SYSTEM_PAGES.map((s) => ({ ...s, url: new URL(s.path, base + '/').toString(), from: 'system' }))
]
const controlRender = async (base, name, pages) => {
  await fetch(pages[0].url).catch(() => null)
  const shots = { theme: 'light', widths: [] }
  const opts = {
    pages,
    chromium,
    out: path.join(out, 'controls', name),
    themes: ['light'],
    widths: [1440],
    shots,
    log
  }
  return renderSite(opts)
}
// The control is asked at the marker site's addresses: every page, the system pages too, as the host reads it as is.
const paths = (pages) => [...new Set(pages.map((p) => joomlaQualityPath(p.path)))]
const humanSha = human ? sha(human) : null
const controlDeps = {
  crawl,
  render: controlRender,
  corpus,
  qualityOn,
  platform: PLATFORM,
  paths,
  qualityPath: joomlaQualityPath
}

if (controlOnly) {
  stage = 'human control'
  const controls = await measureControls(controlOnly, controlDeps)
  writeControls(out, controls, humanSha)
  const { human: demo, quality } = controls
  log('control human: ' + demo.status + ', ' + demo.findings + ' finding(s) on ' + demo.pages + ' page(s)')
  log(
    'control quality: ' +
      quality.groups.map((g) => g.name + ' ' + g.status + ' ' + g.failures.length).join(', ')
  )
  process.exit(demo.findings > 0 ? 0 : 1)
}

const common = {
  kit,
  archive: filesOf(installer),
  adapter: { exemptions: EXEMPTIONS, declaredHosts: DECLARED_HOSTS },
  iconLibrary: { set: PHOSPHOR_SET, icons: phosphorCatalog() },
  tryWrite: memoryTryWrite(kit),
  corpus,
  widths: WIDTHS,
  themes: THEMES,
  refusals: MEASURED_REFUSALS,
  kitHashes: kitHashesOf(folder),
  inputs: {
    blankSite: { file: path.basename(installer), sha256: sha(installer) },
    ...(human ? { humanQuickstart: { file: path.basename(human), sha256: humanSha } } : {}),
    ...(secretAllowOf(folder) ? { secretAllow: secretAllowOf(folder) } : {})
  },
  log
}

if (!site) {
  const { accounting, built } = await runGate(common)
  const doc = {
    counts: accounting.counts,
    split: splitOf(accounting.places),
    places: accounting.places,
    gaps: built.gaps
  }
  writeFileSync(path.join(out, 'accounting.json'), JSON.stringify(doc, null, 1))
  process.exit(accounting.counts.unexplained ? 1 : 0)
}

stage = 'site session'
const pin = flag('--plugin') ?? pinnedPlugin(t)
const plain = await markerBuild(kit, { iconLibrary: common.iconLibrary, tryWrite: common.tryWrite }).catch(
  () => null
)
const session = siteSession({
  base: site,
  token: readFileSync(process.env.GATE_TOKEN_FILE ?? '', 'utf8').trim(),
  out,
  pin,
  kit,
  platform: PLATFORM,
  resetCommand: flag('--reset-site'),
  contract: flag('--contract'),
  firstMarks: plain?.writePlan?.ops.filter((o) => o.kind === 'menuItem.create').map((o) => o.mark) ?? [],
  log
})
const given = flag('--human-control')
const qualityFile =
  flag('--quality-control') ?? (given ? path.join(path.dirname(given), 'quality.json') : null)
const demoContent = flag('--demo-content')
// A control file that is not the gate's own for this installer refuses the run before anything is written.
let read = null
if (!humanSite && given) {
  try {
    read = readControls({
      humanFile: given,
      qualityFile: qualityFile && existsSync(qualityFile) ? qualityFile : null,
      humanQuickstartSha256: humanSha
    })
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
stage = 'phases'
const { record } = await releaseGate({
  ...common,
  site: session,
  reset: session.reset,
  quality: session.quality,
  secrets,
  scanRecord: recordScanner({ cms: PLATFORM, gitleaks: !argv.includes('--no-gitleaks') }),
  pageKey: joomlaPageKey,
  qualityPath: joomlaQualityPath,
  pin,
  writeSafetyState: fileState(path.join(out, 'write-safety-state.json')),
  baseline: baselineOf(folder, flag('--quality-baseline')),
  probes: [...PROBE_CATALOGUE, ...JOOMLA_PROBES],
  demoRoutes: demoContent && existsSync(demoContent) ? demoRoutesOf(readJson(demoContent)) : [],
  control: async () => ({
    ...(humanSite
      ? await measureControls(humanSite, controlDeps)
      : (read ?? { human: { status: 'not_run', findings: null }, quality: null })),
    // The blank site before the write serves no page by design: its statuses are recorded, never judged.
    blank: blankControlOf(await controlRender(site, 'blank', await crawl(site)))
  }),
  // One request first: the template builds its cache on the first page it serves.
  render: async (pages) => {
    await fetch(pages[0].url).catch(() => null)
    return renderSite({ pages, chromium, out, log })
  },
  // The crop of each finding group, named in the record before it is written.
  decorate: async (r) => {
    if (!r.markerTest?.groups?.length) return
    const sharp = createRequire(path.join(ROOT, 'apps/tracy-web/package.json'))('sharp')
    log('crops ' + (await cropGroups({ groups: r.markerTest.groups, out, sharp })))
  },
  out
})
if (argv.includes('--into-kit'))
  cpSync(path.join(out, 'check-record'), path.join(folder, 'check-record'), { recursive: true })
log('verdict ' + JSON.stringify({ pass: record.verdict.pass, failing: record.verdict.failing }))
process.exit(record.verdict.pass ? 0 : 1)

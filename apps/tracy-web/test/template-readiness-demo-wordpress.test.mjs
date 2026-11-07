/**
 * Ticket #456: the demo baseline and the demo measures of a WordPress quickstart. The measuring commands work on a
 * WordPress demo (pages come from the contract's content map, no /index.php), write their files beside the WordPress
 * contract, and the two checks of the verdict judge a WordPress release by the Joomla rules.
 *
 * The fixture is the published JA Diner WP7 1.0.1 contract (manifest and content map copied to a temp folder), with the
 * two files made by the real commands against an invented host. No browser opens and no file of the contract changes.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { main as measure } from '../scripts/demo-measures.mjs'
import { main as baselineMain } from '../scripts/site-check-baseline.mjs'
import { defaultContracts } from '../src/lib/contracts.js'
import { BASELINE_FILE } from '../src/lib/template-kit/demo-baseline-file.js'
import { DEMO_BASELINE_CHECK } from '../src/lib/template-readiness/demo-baseline-check.js'
import { DEMO_MEASURES_CHECK } from '../src/lib/template-readiness/demo-measures-check.js'
import { DEMO_MEASURES_FILE } from '../src/lib/template-readiness/demo-measures-file.js'
import { readinessVerdict } from '../src/lib/template-readiness/verdict.js'
import { demoRead, fakeHost as baselineHost } from './_site-check-pages.mjs'

const TAG = 'quickstart/ja-diner/wp7'
const ID = 'ja-diner/wp7/1.0.1'
const KIT_CLI = fileURLToPath(
  new URL('../../../packages/cms/tracy-quickstart-tools/template-kit/cli.mjs', import.meta.url)
)

const release = (over = {}) => ({
  tag: TAG,
  kind: 'quickstart',
  platform: 'wordpress',
  setting: { platform: 'wordpress', version: '1.0.1', template: 'ja-diner' },
  inspiration: null,
  inspirationHidden: true,
  choosable: true,
  ...over
})
const published = () => release({ inspiration: { template: 'ja-diner' }, inspirationHidden: false })

const scratch = []
after(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true })
})

/** A copy of the published contract folder's manifest, content map and inventory, with no measured file yet. */
function contractCopy() {
  const own = [...defaultContracts().values()].find((c) => c.id === ID)
  assert.ok(own, `the contract ${ID} is in the checkout`)
  const dir = mkdtempSync(path.join(os.tmpdir(), 'demo-wp-'))
  scratch.push(dir)
  for (const f of ['manifest.json', 'content-map.json', 'inventory.json'])
    cpSync(path.join(own.dir, f), path.join(dir, f))
  return { dir, contracts: new Map([[`${TAG}@1.0.1`, { id: ID, dir, platform: 'wordpress' }]]) }
}

const judgeBoth = (c, rel = release()) => ({
  baseline: DEMO_BASELINE_CHECK.judge(rel, { contracts: c.contracts }, { steps: [], version: '1.0.1' }),
  measures: DEMO_MEASURES_CHECK.judge(rel, { contracts: c.contracts }, { steps: [], version: '1.0.1' })
})

// ── An invented host: every page read clean at both widths ───────────────────────────────────────────────────────────

const PASSING = ['no-empty-picture-slots', 'no-empty-boxes'].map((id) => ({
  id,
  pass: true,
  detail: [],
  measured: 0,
  expected: 'none'
}))
const cleanMeasure = (p, width) => ({
  path: p,
  width,
  textBoxes: [
    {
      selector: 'h2.title',
      text: 'Table for two',
      boxWidth: 300,
      boxHeight: 40,
      contentWidth: 300,
      contentHeight: 40,
      clips: false,
      right: Math.min(width, 340)
    }
  ],
  mainHeadings: ['Table for two'],
  orphanRows: [],
  blankFooterColumns: []
})
function measureHost(change = (m) => m) {
  const asked = []
  const host = async (payload) => {
    asked.push(payload)
    const pages = [...payload.pages, ...payload.plan]
    return {
      checks: PASSING,
      visited: pages.map((p) => ({ path: p, status: 200 })),
      pageMeasures: pages.flatMap((p) => [1440, 390].map((w) => change(cleanMeasure(p, w))))
    }
  }
  return { host, asked }
}

async function measureInto(c, change) {
  const { host, asked } = measureHost(change)
  let out = ''
  const code = await measure(['--contract', c.dir, '--base', 'https://demo.example.test'], {
    out: (s) => (out += s),
    hostOf: async () => ({ host })
  })
  return { code, out, asked }
}

// ── Tests ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

test('demo measures: a WordPress contract is measured by slug from its content map, with no /index.php, and the file is judged green', async () => {
  const c = contractCopy()
  const { code, out, asked } = await measureInto(c)
  assert.equal(code, 0, out)
  const pages = asked.flatMap((a) => [...a.pages, ...a.plan])
  assert.ok(pages.includes('/'), 'the front page is the site root')
  assert.ok(pages.includes('/about-us/'), 'a page is asked by its slug')
  assert.ok(!pages.includes('/front-page/'))
  // A page under a parent is asked under it: `/login/` is WordPress's own login, not the demo's page.
  assert.ok(pages.includes('/j-pages/login/'))
  assert.ok(!pages.includes('/login/'))
  assert.ok(pages.includes('/content/fetured-articles/'))
  assert.ok(
    pages.every((p) => !p.startsWith('/index.php')),
    'WordPress pages are not asked under /index.php'
  )
  const doc = JSON.parse(readFileSync(path.join(c.dir, DEMO_MEASURES_FILE), 'utf8'))
  assert.deepEqual(doc.quickstart, { slug: 'ja-diner', version: '1.0.1' })
  assert.doesNotMatch(JSON.stringify(doc), /example\.test/)
  const { measures } = judgeBoth(c)
  assert.deepEqual([measures.state, measures.code], ['done', 'demo-measures-clean'])
})

test('demo measures: a measure outside its rule is red with its fault code, a missing file is demo-measure-missing', async () => {
  const c = contractCopy()
  assert.deepEqual(
    [judgeBoth(c).measures.state, judgeBoth(c).measures.code],
    ['todo', 'demo-measure-missing']
  )
  const run = await measureInto(c, (m) =>
    m.width === 390 && m.path === '/about-us/'
      ? { ...m, textBoxes: [{ ...m.textBoxes[0], selector: 'div.card', right: 460 }] }
      : m
  )
  assert.equal(run.code, 1)
  const judged = judgeBoth(c).measures
  assert.deepEqual([judged.state, judged.code], ['todo', 'demo-overflow'])
  assert.equal(judged.params.faults[0].page, '/about-us/')
  assert.deepEqual([judgeBoth(c, published()).measures.state], ['warn'])
})

test('demo baseline: measured with --base on a WordPress contract, asked without /index.php, recorded by the kit tool, judged green', async () => {
  const c = contractCopy()
  const cache = path.join(c.dir, '..', `cache-${path.basename(c.dir)}`)
  mkdirSync(cache)
  scratch.push(cache)
  const pagesFile = path.join(cache, 'pages.json')
  writeFileSync(pagesFile, JSON.stringify(['/', '/about-us/']))
  const { host, calls } = baselineHost({ '/': demoRead('/'), '/about-us/': demoRead('/about-us/') })
  const said = []
  const code = await baselineMain(
    ['--base', 'https://demo.example.test', '--version', ID, '--pages-file', pagesFile],
    { WRITE_BENCH_BASELINE_DIR: cache },
    { hostOf: async () => ({ host }), index: c.contracts, out: (l) => said.push(l) }
  )
  assert.equal(code, 0, said.join('\n'))
  assert.deepEqual(calls[0].pages, ['/', '/about-us/'], 'WordPress pages are asked as they are')
  const kept = path.join(cache, 'ja-diner_wp7_1.0.1.json')
  const recorded = spawnSync(process.execPath, [KIT_CLI, 'baseline', '--from', kept, '--contract', c.dir], {
    encoding: 'utf8'
  })
  assert.equal(recorded.status, 0, recorded.stderr)
  const judged = judgeBoth(c).baseline
  assert.deepEqual([judged.state, judged.code], ['done', 'demo-baseline-recorded'])
  assert.equal(JSON.parse(readFileSync(path.join(c.dir, BASELINE_FILE), 'utf8')).quickstart, ID)
})

test('demo baseline: a missing file is demo-baseline-missing, one of another version is demo-baseline-stale', () => {
  const c = contractCopy()
  const missing = judgeBoth(c).baseline
  assert.deepEqual([missing.state, missing.code], ['todo', 'demo-baseline-missing'])
  assert.deepEqual([judgeBoth(c, published()).baseline.state], ['warn'])
  writeFileSync(
    path.join(c.dir, BASELINE_FILE),
    JSON.stringify({
      schema: 'demo-baseline/1',
      quickstart: 'ja-diner/wp7/1.0.0',
      source: 'host',
      texts: [],
      labels: [],
      pictures: { files: [], shas: [] }
    })
  )
  assert.equal(judgeBoth(c).baseline.code, 'demo-baseline-stale')
})

test('in the verdict: a WordPress release with the baseline file is green on the demo baseline piece, a copy without it is red', async () => {
  // The demo measures join the template-kit piece, whose earlier steps decide it first (kit-waiting on WordPress until the
  // kit steps judge it); their own verdict is asserted through the check above.
  const c = contractCopy()
  const world = { contracts: c.contracts, server: false, checks: [DEMO_BASELINE_CHECK, DEMO_MEASURES_CHECK] }
  const baselinePiece = () =>
    readinessVerdict(release(), world).pieces.find((p) => p.piece === 'demo-baseline')
  assert.deepEqual([baselinePiece().state, baselinePiece().code], ['todo', 'demo-baseline-missing'])
  writeFileSync(
    path.join(c.dir, BASELINE_FILE),
    JSON.stringify({
      schema: 'demo-baseline/1',
      quickstart: ID,
      source: 'host',
      texts: ['Table for two'],
      labels: [],
      pictures: { files: ['images/a.jpg'], shas: ['b'.repeat(64)] }
    })
  )
  assert.deepEqual([baselinePiece().state, baselinePiece().code], ['done', 'demo-baseline-recorded'])
})

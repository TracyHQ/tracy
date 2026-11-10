/**
 * The demo progress card (`src/client/demo-progress.tsx`): a step chain build draws its own steps, minutes left and
 * cost so far (#516), and the Build button line says the measured time and price. Bundles the real component with React 18 and renders static markup.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-demo-progress-'))
  const outfile = path.join(outDir, 'demo-progress.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { BuildEstimate, DemoProgress, buildEstimateText } from './demo-progress.tsx'
        export { chainProgressView } from '@tracy/wo-views'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** A translator that shows the parameters, so a number on the card can be asserted. */
const tp = (key, params) =>
  params
    ? `[${key} ${Object.entries(params)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}]`
    : `[${key}]`

const NOW = Date.parse('2026-11-09T10:30:00Z')
const minutesAgo = (n) => new Date(NOW - n * 60_000).toISOString()
const step = (id, state, minutes = null) => ({ id, label: id, state, minutes })
/** A chain build with the kit and the plan done, the brand, copy and pictures under way, 8 minutes in. */
const chainRun = (over = {}) => ({
  steps: [
    step('kit', 'done', 0.1),
    step('brand', 'current'),
    step('plan', 'done', 6),
    step('copy', 'current'),
    step('pictures', 'current'),
    step('write', 'upcoming')
  ],
  current: 'pictures',
  startedAt: minutesAgo(8),
  minutes: 8,
  usd: 0.25,
  estimate: { minutes: 26, usd: 1.84 },
  ...over
})
const chainRow = (run, action = {}) => ({
  id: 'o3',
  demoAction: { id: 'a3', state: 'queued', step: run.current ?? 'build', error: null, run, ...action },
  latestBuild: { id: 'b3', state: 'provisioning', done: false, qa: null },
  latestRevision: { id: 'r3', cms: 'joomla' }
})
const OLD = /v3\.step\.(brief|build|fill|check)/
const draw = (row) =>
  lib.renderToStaticMarkup(lib.createElement(lib.DemoProgress, { t: tp, row, locale: 'en', now: NOW }))

test('the progress model: bar over the chain steps, minutes left from the estimate, cost so far', () => {
  const view = lib.chainProgressView(chainRun(), NOW)
  assert.deepEqual([view.done, view.total], [2, 6])
  assert.equal(view.fraction, 2 / 6)
  assert.equal(view.current, 'pictures')
  assert.equal(view.minutesLeft, 18)
  assert.equal(view.usd, 0.25)
})

test('minutes left never go below zero when a build runs past its estimate', () => {
  const view = lib.chainProgressView(chainRun({ startedAt: minutesAgo(40) }), NOW)
  assert.equal(view.minutesLeft, 0)
  assert.match(draw(chainRow(chainRun({ startedAt: minutesAgo(40) }))), /\[progress\.over\]/)
})

test('the card says one sentence for the current step, minutes left and the cost, and lists the steps', () => {
  const html = draw(chainRow(chainRun()))
  assert.match(html, /\[progress\.now\.pictures\]/)
  assert.match(html, /\[progress\.left n=18\]/)
  assert.match(html, /\[progress\.spent usd=\$0\.25\]/)
  assert.match(html, /\[progress\.show n=6\]/)
  for (const id of ['kit', 'brand', 'plan', 'copy', 'pictures', 'write'])
    assert.match(html, new RegExp(`\\[progress\\.step\\.${id}\\]`), id)
  assert.match(html, /data-state="done"[^>]*>.*?\[progress\.step\.kit\]/)
  assert.match(html, /aria-valuenow="2"/)
  assert.doesNotMatch(html, OLD)
})

test('with no measured build the card says time and cost are measured on the first build, and no number', () => {
  const html = draw(chainRow(chainRun({ estimate: null })))
  assert.match(html, /\[progress\.firstBuild\]/)
  assert.doesNotMatch(html, /progress\.left/)
  assert.doesNotMatch(html, /progress\.over/)
  assert.equal(lib.chainProgressView(chainRun({ estimate: null }), NOW).minutesLeft, null)
})

test('a finished chain reads Ready and a stopped one names its step, never the old step names', () => {
  const finished = chainRun({
    steps: chainRun().steps.map((s) => ({ ...s, state: 'done' })),
    current: 'write'
  })
  const ready = draw(chainRow(finished, { state: 'completed', step: 'write' }))
  assert.match(ready, /\[progress\.ready\]/)
  assert.doesNotMatch(ready, /qaPassed|passed/)
  const stopped = draw(chainRow(chainRun(), { state: 'failed', error: 'DEMO_STEP_TIMEOUT' }))
  assert.match(stopped, /\[progress\.stopped step=\[progress\.step\.pictures\]\]/)
  assert.match(stopped, /\[reason\.demo_step_timeout\]/)
  assert.doesNotMatch(draw(chainRow(chainRun())), OLD)
})

test('under the Build button: the measured time and price, the first build note, or nothing', () => {
  assert.equal(
    lib.buildEstimateText(tp, 'en', { minutes: 26, usd: 1.84 }),
    '[progress.estimate n=26 usd=$1.84]'
  )
  assert.equal(lib.buildEstimateText(tp, 'en', null), '[progress.firstBuild]')
  assert.equal(lib.buildEstimateText(tp, 'en', undefined), null)
  const line = lib.renderToStaticMarkup(
    lib.createElement(lib.BuildEstimate, { t: tp, locale: 'en', estimate: { minutes: 26, usd: 1.84 } })
  )
  assert.match(line, /\[progress\.estimate n=26 usd=\$1\.84\]/)
})

test('the chain steps draw the standard sub-step row: done, running and waiting nodes, a stopped step as failed', () => {
  const html = draw(chainRow(chainRun()))
  assert.match(html, /<ol class="tracy-wo-band-subs" data-layout="row" data-many="">/)
  const nodes = [...html.matchAll(/class="tracy-wo-band-sub-node" data-node="(\w+)"/g)].map((m) => m[1])
  assert.deepEqual(nodes, ['done', 'running', 'done', 'running', 'running', 'waiting'])
  assert.doesNotMatch(html, /tracy-wo-progress-steps|lucide-(circle-check|circle-x|clock)/)
  const stopped = draw(chainRow(chainRun(), { state: 'failed', error: 'DEMO_STEP_TIMEOUT' }))
  assert.match(
    stopped,
    /<li data-state="failed" title="\[progress\.step\.copy\]: \[brief\.job\.state\.failed\]">/
  )
  const finished = draw(chainRow(chainRun(), { state: 'completed' }))
  assert.equal((finished.match(/data-node="done"/g) ?? []).length, 6)
})

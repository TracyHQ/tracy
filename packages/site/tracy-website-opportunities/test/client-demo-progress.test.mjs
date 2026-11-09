/**
 * The demo progress cells (`src/client/demo-progress.tsx`): a failed demo action always draws its reason, whatever
 * an older check of the same build said; a step chain build draws its own steps, minutes left and cost so far (#516),
 * and the Build button line says the measured time and price. Bundles the real component with React 18 and renders static markup.
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
        export { BuildEstimate, DemoProgress, ProgressCell, Steps, buildEstimateText } from './demo-progress.tsx'
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

const t = (key) => `[${key}]`
const row = {
  id: 'o1',
  demoAction: { id: 'a1', state: 'failed', step: 'check', error: 'DEMO_STEP_TIMEOUT' },
  latestBuild: { id: 'b1', state: 'done', done: true, qa: 'passed' },
  latestRevision: { id: 'r1', cms: 'wordpress' }
}

test('a failed action over a build whose older check passed draws its reason, in the list cell and the steps', () => {
  for (const Component of [lib.ProgressCell, lib.Steps]) {
    const html = lib.renderToStaticMarkup(lib.createElement(Component, { t, row, locale: 'en', now: 0 }))
    assert.match(html, /\[reason\.demo_step_timeout\]/, Component.name)
    assert.doesNotMatch(html, /\[v3\.demoReady\]/, Component.name)
  }
})

test('a Retry still running over an older passed check draws its progress, not Demo ready', () => {
  const running = { ...row, demoAction: { id: 'a2', state: 'queued', step: 'build', error: null } }
  for (const Component of [lib.ProgressCell, lib.Steps]) {
    const html = lib.renderToStaticMarkup(
      lib.createElement(Component, { t, row: running, locale: 'en', now: 0 })
    )
    assert.doesNotMatch(html, /\[v3\.demoReady\]/, Component.name)
  }
  const cell = lib.renderToStaticMarkup(
    lib.createElement(lib.ProgressCell, { t, row: running, locale: 'en', now: 0 })
  )
  assert.match(cell, /\[v3\.step\.build\]/)
  assert.match(cell, /\[v3\.building\]/)
})

test('Find sources is open once research has started, done included, and closed while nothing has started', () => {
  const sources = lib.createElement('p', null, 'source rows')
  const draw = (job) =>
    lib.renderToStaticMarkup(
      lib.createElement(lib.Steps, { t, row: { id: 'o2', job }, locale: 'en', now: 0, children: sources })
    )
  for (const state of ['completed', 'running', 'failed', 'cancelled'])
    assert.match(draw({ state, stage: 'collection' }), /<details open="">/, state)
  assert.match(draw(null), /<details><summary/)
  assert.match(draw({ state: 'queued' }), /<details><summary/)
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
const draw = (row, Component = lib.DemoProgress) =>
  lib.renderToStaticMarkup(lib.createElement(Component, { t: tp, row, locale: 'en', now: NOW }))

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
  for (const Component of [lib.DemoProgress, lib.ProgressCell, lib.Steps])
    assert.doesNotMatch(draw(chainRow(chainRun()), Component), OLD, Component.name)
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

/**
 * The Progress band of Details (`src/client/progress-band.tsx`, #537): one fixed height in every state, the running
 * step's sub-steps as one horizontal row. Bundles the real component with React 18 and renders it to static markup;
 * the fixed height itself is CSS, so the tests check the markup and the stylesheet that hold it.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-progress-band.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-band-'))
  const outfile = path.join(outDir, 'band.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProgressBand } from './progress-band.tsx'
        export { stepperView } from './stepper-model.ts'
        export { PROGRESS_BAND_CSS } from './progress-band-css.ts'
        export { DETAILS_CSS } from './details-css.ts'
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

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const RESEARCHED = { state: 'done', researchedAt: '2026-11-09T08:00:00Z', done: true }
const RUNNING_BRIEF = { id: 'j-1', state: 'running', steps: [] }
const draw = (input, extra = {}) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.ProgressBand, {
      t,
      view: lib.stepperView(input),
      locale: 'en-US',
      busy: false,
      onAction: () => undefined,
      ...extra
    })
  )
const researching = {
  research: { state: 'running', researchedAt: null, done: false },
  researchJob: { state: 'running' },
  demo: 'none'
}
const subs = (n, running = 1) =>
  Array.from({ length: n }, (_, i) => ({
    key: `s${i}`,
    label: `Source number ${i + 1}`,
    state: i < running ? 'done' : i === running ? 'running' : 'waiting'
  }))
const rowHtml = (html) => html.slice(html.indexOf('<ol class="tracy-wo-band-subs"'))
const rowOf = (html) => html.match(/<ol class="tracy-wo-band-subs"[^>]*>/)?.[0] ?? ''

test('the running step lists its sub-steps as ONE horizontal row of nodes, each with its label and state on hover', () => {
  const html = draw(researching, { subSteps: subs(2) })
  assert.match(rowOf(html), /data-layout="row"/)
  assert.equal((html.match(/<ol class="tracy-wo-band-subs"/g) ?? []).length, 1)
  assert.equal((rowHtml(html).match(/class="tracy-wo-band-sub-node"/g) ?? []).length, 2)
  assert.match(html, /<li data-state="done" title="Source number 1: \[brief\.job\.state\.done\]">/)
  assert.match(html, /<li data-state="running" title="Source number 2: \[brief\.job\.state\.running\]">/)
  assert.match(html, /class="tracy-wo-band-sub-label">Source number 2</)
  // The state word stays in the markup for screen readers (hidden on screen by the band CSS).
  assert.match(html, /class="tracy-wo-band-sub-state">\[brief\.job\.state\.running\]</)
})

test('a long sub-step set stays one row: no second list, the done nodes fold (data-many), a failed node keeps its state', () => {
  const short = draw(researching, { subSteps: subs(2) })
  const long = draw(researching, {
    subSteps: [
      ...subs(7, 6).slice(0, 6),
      { key: 'facts', label: 'Writing the business facts', state: 'failed' }
    ]
  })
  assert.doesNotMatch(rowOf(short), /data-many/)
  assert.match(rowOf(long), /data-many=""/)
  assert.equal((long.match(/<ol class="tracy-wo-band-subs"/g) ?? []).length, 1)
  assert.equal((rowHtml(long).match(/class="tracy-wo-band-sub-node"/g) ?? []).length, 7)
  assert.match(
    long,
    /<li data-state="failed" title="Writing the business facts: \[brief\.job\.state\.failed\]">/
  )
})

test('the pane keeps the same parts whatever the number of sub-steps: kicker, name, line, row, buttons at the end', () => {
  const order = (html) =>
    [
      ...html.matchAll(
        /class="(tracy-wo-band-kicker|tracy-wo-band-name|tracy-wo-band-line|tracy-wo-band-subs|tracy-wo-band-acts)"/g
      )
    ].map((m) => m[1])
  const want = [
    'tracy-wo-band-kicker',
    'tracy-wo-band-name',
    'tracy-wo-band-line',
    'tracy-wo-band-subs',
    'tracy-wo-band-acts'
  ]
  assert.deepEqual(order(draw(researching, { subSteps: subs(1, 0) })), want)
  assert.deepEqual(order(draw(researching, { subSteps: subs(7, 3) })), want)
})

test('the band carries data-fixed, and a refused press sits in the button row instead of growing the pane', () => {
  const html = draw({ research: RESEARCHED, demo: 'none' }, { error: 'Daily limit reached' })
  assert.match(html, /<section class="tracy-wo-band" data-fixed=""/)
  const acts = html.slice(html.indexOf('class="tracy-wo-band-acts"'))
  assert.match(
    acts,
    /class="tracy-wo-error tracy-wo-small tracy-wo-band-refused" role="alert" title="Daily limit reached"/
  )
})

test('a locked step shows only a lock icon in its pill, the reason on hover and as the aria-label, no word Locked', () => {
  const html = draw({
    research: RESEARCHED,
    brief: { id: 'b-1', n: 1, createdAt: '2026-11-09T09:00:00Z' },
    demo: 'none',
    approval: { research: 'ok', profile: 'needed', brief: 'stale', briefStale: 'profile' }
  })
  assert.match(
    html,
    /<span class="tracy-wo-stab-pill tracy-wo-band-pill" data-state="locked" role="img" title="\[stepper\.lock\.profile\]" aria-label="\[stepper\.lock\.profile\]"><svg[\s\S]*?<\/svg><\/span>/
  )
  assert.doesNotMatch(html, /tracy-wo-band-lock|>\[stepper\.lock\.profile\]</)
  assert.doesNotMatch(html, /\[stepper\.locked\]/)
  assert.doesNotMatch(html, /brief\.chip\.older|tracy-wo-band-stale/)
})

test('the brief job running shows no sub-step row when the server sent none, only the one running line', () => {
  const html = draw({ research: RESEARCHED, briefJob: RUNNING_BRIEF, demo: 'none' })
  assert.doesNotMatch(html, /tracy-wo-band-subs/)
  assert.match(html, /class="tracy-wo-band-running" role="status"/)
})

test('the band CSS fixes one height, lays the sub-steps in a row and is joined to the Details stylesheet', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(css, /\.tracy-wo-band\[data-fixed\] \{[^}]*height: var\(--wo-band-h\)/)
  assert.match(css, /\.tracy-wo-band-subs, [^{]*\{[^}]*flex-direction: row;[^}]*overflow-x: auto/)
  assert.match(css, /-webkit-line-clamp: 2/)
  assert.ok(!css.includes('`'), 'no backtick inside the template')
  assert.ok(lib.DETAILS_CSS.endsWith(css))
})

test('each step shows its status as a pill right of the name and one fixed purpose line under it', () => {
  const html = draw(researching)
  const rows = html.split('<li class="tracy-wo-step"').slice(1)
  assert.equal(rows.length, 3)
  assert.match(
    rows[0],
    /class="tracy-wo-band-top"><span class="tracy-wo-step-name"[^>]*>\[step\.research\]<\/span><span class="tracy-wo-stab-pill tracy-wo-band-pill" data-state="reading"/
  )
  assert.match(rows[0], /<span class="tracy-wo-band-sub-node" data-node="running"/)
  assert.match(rows[0], /tracy-wo-band-pill-text">\[stepper\.running\]</)
  assert.match(rows[0], /class="tracy-wo-band-purpose"[^>]*>\[band\.purpose\.research\]</)
  assert.match(rows[1], /class="tracy-wo-band-purpose"[^>]*>\[band\.purpose\.brief\]</)
  assert.match(rows[2], /class="tracy-wo-band-purpose"[^>]*>\[band\.purpose\.build\]</)
  assert.doesNotMatch(html, /tracy-wo-step-sub|tracy-wo-band-status/)
})

test('done is a success pill with a check, review is amber, up next is neutral, failed is danger', () => {
  const review = draw({ research: RESEARCHED, demo: 'none', approval: { research: 'ok', profile: 'needed' } })
  assert.match(
    review,
    /data-state="review"[^>]*>(<span[^>]*><\/span>)?<span class="tracy-wo-band-pill-text">\[stepper\.needsReview\]</
  )
  assert.match(draw(researching), /data-state="next"[^>]*title="\[stepper\.upNext\]"/)
  const done = draw({ research: RESEARCHED, brief: { id: 'b-1', n: 1 }, demo: 'none' })
  assert.match(done, /data-state="collected"[^>]*><span class="tracy-wo-band-sub-node" data-node="done"/)
  const failed = draw({
    research: { state: 'failed', researchedAt: null, done: false },
    researchJob: { state: 'failed' },
    demo: 'none'
  })
  assert.match(failed, /data-state="failed"[^>]*><span class="tracy-wo-band-sub-node" data-node="failed"/)
})

test('the band CSS keeps the pill on one line and truncates the name, not the pill', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(css, /\.tracy-wo-band-top > \.tracy-wo-band-pill \{[^}]*flex: none/)
  assert.match(css, /\.tracy-wo-band-top > \.tracy-wo-step-name \{[^}]*flex: 0 1 auto/)
  assert.match(css, /--wo-band-h: 176px/)
})

test('the sub-step connector is one continuous 1px line: no gaps, segment pseudo elements, label masked by the pane colour', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(css, /\.tracy-wo-band-subs > li::before[^{]*\{[^}]*height: 1px[^}]*var\(--border\)/)
  assert.match(css, /\.tracy-wo-band-subs > li:first-child::before[^{]*\{[^}]*display: none/)
  assert.match(css, /\.tracy-wo-band-subs > li\[data-state='done'\]::after[^{]*\{[^}]*var\(--success\)/)
  assert.match(css, /\.tracy-wo-band-sub-label[^{]*\{[^}]*padding: 0 4px; background: var\(--wo-pane-bg\)/)
  assert.doesNotMatch(css, /li \+ li::before/)
})

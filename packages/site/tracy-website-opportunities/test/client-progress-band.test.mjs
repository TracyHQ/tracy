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
        export { DemoProgress } from './demo-progress.tsx'
        export { briefControlView } from './research-gate-model.ts'
        export { buildColumns } from './progress-band-build-model.ts'
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
const rowHtml = (html) => {
  const from = html.indexOf('<ol class="tracy-wo-band-subs"')
  return from < 0 ? '' : html.slice(from, html.indexOf('</ol>', from) + 5)
}
const rowOf = (html) => html.match(/<ol class="tracy-wo-band-subs"[^>]*>/)?.[0] ?? ''

test('the running step lists its sub-steps as ONE horizontal row of nodes, each with its label and state on hover', () => {
  const html = draw(researching, { subSteps: subs(2) })
  assert.match(rowOf(html), /data-layout="row"/)
  assert.equal((html.match(/<ol class="tracy-wo-band-subs"/g) ?? []).length, 1)
  // The done sub-step is a node with its label; the running one is the running status pill with its label.
  assert.equal((rowHtml(html).match(/class="tracy-wo-band-sub-node"/g) ?? []).length, 1)
  assert.match(html, /<li data-state="done" title="Source number 1: \[brief\.job\.state\.done\]">/)
  assert.match(html, /<li data-state="running" title="Source number 2: \[brief\.job\.state\.running\]">/)
  assert.match(html, /class="tracy-wo-band-sub-label">Source number 1</)
  assert.match(
    rowHtml(html),
    /<li data-state="running"[^>]*><span class="tracy-wo-pill" data-pill="running" data-glyph=""><svg[^>]*data-spin=""[\s\S]*?<span class="tracy-wo-pill-text">Source number 2<\/span>/
  )
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
  // Six done nodes and the failed one (no sub-step runs here).
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

test('a locked step shows a neutral Locked pill with a lock glyph, the reason on hover', () => {
  const html = draw({
    research: RESEARCHED,
    brief: { id: 'b-1', n: 1, createdAt: '2026-11-09T09:00:00Z' },
    demo: 'none',
    approval: { research: 'ok', profile: 'needed', brief: 'stale', briefStale: 'profile' }
  })
  assert.match(
    html,
    /<span class="tracy-wo-pill" data-pill="neutral" data-glyph="" title="\[stepper\.lock\.profile\]"><svg[^>]*lucide-lock[^>]*>[\s\S]*?<\/svg><span class="tracy-wo-pill-text">\[stepper\.locked\]<\/span><\/span>/
  )
  assert.doesNotMatch(html, /tracy-wo-band-lock|>\[stepper\.lock\.profile\]</)
  assert.doesNotMatch(html, /brief\.chip\.older|tracy-wo-band-stale/)
})

test('the brief job running shows no sub-step row when the server sent none, only the one running line', () => {
  const html = draw({ research: RESEARCHED, briefJob: RUNNING_BRIEF, demo: 'none' })
  assert.doesNotMatch(html, /tracy-wo-band-subs/)
  assert.match(html, /class="tracy-wo-band-running" role="status"/)
})

test('while a job runs the button row shows the Running status pill, never a disabled Running button', () => {
  const html = draw({ research: RESEARCHED, briefJob: RUNNING_BRIEF, demo: 'none' })
  const acts = html.slice(html.indexOf('class="tracy-wo-band-acts"'))
  assert.match(acts, /<span class="tracy-wo-pill" data-pill="running" data-glyph=""><svg[^>]*data-spin=""/)
  assert.match(acts, /<span class="tracy-wo-pill-text">\[stepper\.running\]<\/span>/)
  assert.doesNotMatch(acts, /<button[^>]*disabled/)
})

test('the band CSS fixes one height, lays the sub-steps in a row and is joined to the Details stylesheet', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(css, /\.tracy-wo-band\[data-fixed\] \{[^}]*height: var\(--wo-band-h\)/)
  assert.match(css, /\.tracy-wo-band-subs \{[^}]*flex-direction: row;[^}]*overflow-x: auto/)
  assert.match(css, /-webkit-line-clamp: 2/)
  assert.ok(!css.includes('`'), 'no backtick inside the template')
  // The Details stylesheet joins the band CSS; the facts bands come after it.
  assert.ok(lib.DETAILS_CSS.includes(css))
})

test('each step shows its status as a pill right of the name and one fixed purpose line under it', () => {
  const html = draw(researching)
  const rows = html.split('<li class="tracy-wo-step"').slice(1)
  assert.equal(rows.length, 3)
  assert.match(
    rows[0],
    /class="tracy-wo-band-top"><span class="tracy-wo-step-name"[^>]*>\[step\.research\]<\/span><span class="tracy-wo-pill" data-pill="running" data-glyph="" title="\[stepper\.running\]"><svg[^>]*lucide-loader-circle/
  )
  assert.match(rows[0], /tracy-wo-pill-text">\[stepper\.running\]</)
  assert.match(rows[0], /class="tracy-wo-band-purpose"[^>]*>\[band\.purpose\.research\]</)
  assert.match(rows[1], /class="tracy-wo-band-purpose"[^>]*>\[band\.purpose\.brief\]</)
  assert.match(rows[2], /class="tracy-wo-band-purpose"[^>]*>\[band\.purpose\.build\]</)
  assert.doesNotMatch(html, /tracy-wo-step-sub|tracy-wo-band-status/)
})

test('a finished step has no pill, review is attention, up next is neutral, failed is the red failed pill', () => {
  const review = draw({ research: RESEARCHED, demo: 'none', approval: { research: 'ok', profile: 'needed' } })
  assert.match(
    review,
    /data-pill="attention" data-glyph=""[^>]*><svg[^>]*lucide-triangle-alert[\s\S]*?<span class="tracy-wo-pill-text">\[stepper\.needsReview\]</
  )
  assert.match(draw(researching), /data-pill="neutral" data-glyph="" title="\[stepper\.upNext\]"/)
  const done = draw({ research: RESEARCHED, brief: { id: 'b-1', n: 1 }, demo: 'none' })
  // A finished step shows only its green check in the dot: no "Done" pill (owner, #537).
  assert.doesNotMatch(done, /data-pill="done"/)
  assert.match(done, /class="tracy-wo-step" data-state="done"[\s\S]*?lucide-check/)
  const failed = draw({
    research: { state: 'failed', researchedAt: null, done: false },
    researchJob: { state: 'failed' },
    demo: 'none'
  })
  assert.match(failed, /data-pill="failed" data-glyph=""[^>]*><svg[^>]*lucide-x /)
})

test('the left pane is as wide as its content: a capped fit-content track, names and pills never shrink', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(
    css,
    /\.tracy-wo-band\[data-fixed\] \{[^}]*grid-template-columns: fit-content\(min\(46%, 400px\)\) minmax\(0, 1fr\)/
  )
  assert.doesNotMatch(css, /44fr|56fr/)
  // The list never goes below its min-content (the widest name with its pill), even though it clips vertically.
  assert.match(css, /\.tracy-wo-band-list \{[^}]*min-width: min-content;[^}]*overflow: hidden/)
  assert.match(css, /\.tracy-wo-band\[data-fixed\] \.tracy-wo-step \{ grid-template-columns: 22px auto; \}/)
  // The pill itself never shrinks (status-pill-css.ts) and the band keeps no pill rule of its own.
  assert.match(css, /\.tracy-wo-band-top > \.tracy-wo-step-name \{ flex: none; \}/)
  assert.doesNotMatch(css, /tracy-wo-band-pill|tracy-wo-stab-pill/)
  // A purpose line wraps for sizing (min-content is one word) and shows one clamped line.
  assert.match(css, /\.tracy-wo-band-purpose \{[^}]*-webkit-line-clamp: 1;[^}]*white-space: normal/)
  assert.match(css, /--wo-band-h: 176px/)
  assert.match(
    css,
    /@container \(max-width: 719px\) \{\s*\.tracy-wo-band\[data-fixed\] \{[^}]*grid-template-columns: minmax\(0, 1fr\)/
  )
})

test('the band CSS draws no colour literal and keeps no rule for the old build chain', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  assert.doesNotMatch(css, /tracy-wo-progress-steps/)
})

const BRIEF_RUNNING = { id: 'j-2', state: 'running', step: 'labelling' }
const briefInput = { research: RESEARCHED, briefJob: BRIEF_RUNNING, demo: 'none' }
/** The brief sub-steps exactly as Details derives them from the brief job. */
const briefSubs = () =>
  lib
    .briefControlView({ research: { state: 'done' }, brief: null, briefJob: BRIEF_RUNNING })
    .steps.map((s) => ({ key: s.step, label: t(s.labelKey), state: s.state }))
/** Each sub-step's look: a node by its state, or the running status pill. */
const nodeStates = (html) =>
  [
    ...rowHtml(html).matchAll(
      /class="tracy-wo-band-sub-node" data-node="(\w+)"|class="tracy-wo-pill" data-pill="(running)"/g
    )
  ].map((m) => m[1] ?? m[2])
const liStates = (html) => [...rowHtml(html).matchAll(/<li data-state="(\w+)"/g)].map((m) => m[1])

test('the brief job draws the research row: the same nodes, one state per item, no other look', () => {
  const html = draw(briefInput, { subSteps: briefSubs() })
  assert.equal((html.match(/<ol class="tracy-wo-band-subs" data-layout="row"/g) ?? []).length, 1)
  assert.deepEqual(nodeStates(html), ['done', 'running', 'waiting'])
  assert.deepEqual(liStates(html), ['done', 'running', 'waiting'])
  assert.match(html, /class="tracy-wo-pill-text">\[brief\.job\.step\.labelling\]</)
  assert.doesNotMatch(html, /tracy-wo-demo-|tracy-wo-progress-steps/)
})

const step = (id, state, minutes = null, usd = null, estimate) => ({
  id,
  label: id,
  state,
  minutes,
  usd,
  ...(estimate === undefined ? {} : { estimate })
})
const buildRun = () => ({
  steps: [
    step('kit', 'done', 0.1, 0.01),
    step('brand', 'done', 2, 0.06),
    step('plan', 'done', 6, 0.08),
    step('copy', 'current', 3),
    step('pictures', 'current', null),
    step('write', 'upcoming', null, null, { minutes: 4, usd: 0.3 })
  ],
  current: 'pictures',
  startedAt: new Date(Date.parse('2026-11-10T10:00:00Z') - 8 * 60_000).toISOString(),
  minutes: 8,
  usd: 0.15,
  estimate: { minutes: 26, usd: 1.84 }
})
const buildRow = (actionState = 'running') => ({
  id: 'o1',
  demoAction: { id: 'a1', state: actionState, step: 'pictures', error: null, run: buildRun() }
})
const drawBuild = (row) =>
  draw(
    {
      research: RESEARCHED,
      brief: { id: 'b-1', n: 1 },
      demo: 'building',
      approval: { research: 'ok', profile: 'approved', brief: 'approved' }
    },
    {
      buildSteps: lib.createElement(lib.DemoProgress, {
        t,
        row,
        locale: 'en',
        now: Date.parse('2026-11-10T10:00:00Z'),
        open: true
      })
    }
  )
const colStates = (html) =>
  [...html.matchAll(/class="tracy-wo-band-col-node" data-node="(\w+)"/g)].map((m) => m[1])

test('the build run spans the pane as six columns: a node, the name always shown, the time and cost line kept above', () => {
  const html = drawBuild(buildRow())
  assert.match(html, /data-build=""/)
  assert.equal((html.match(/<ol class="tracy-wo-band-cols"/g) ?? []).length, 1)
  assert.deepEqual(colStates(html), ['done', 'done', 'done', 'running', 'running', 'waiting'])
  for (const id of ['kit', 'brand', 'plan', 'copy', 'pictures', 'write'])
    assert.match(html, new RegExp(`class="tracy-wo-band-col-name">\\[progress\\.step\\.${id}\\]<`), id)
  // The minutes left and the cost so far stay on their line above the columns.
  assert.match(html, /\[progress\.left\{&quot;n&quot;:18\}\] · \[progress\.spent/)
  assert.ok(html.indexOf('[progress.left') < html.indexOf('class="tracy-wo-band-cols"'))
  // No folded row, no sub-step row and no demo classes inside the band.
  assert.doesNotMatch(html, /tracy-wo-band-subs|<details|tracy-wo-demo-|tracy-wo-progress-steps|<b>/)
})

test('each column says its time and cost: done what it took, running how long so far, waiting what it usually takes', () => {
  const cols = lib.buildColumns(t, buildRun(), 'running', 'en')
  const fig = Object.fromEntries(cols.map((c) => [c.key, c.figure]))
  assert.equal(fig.kit, '[progress.col.done{"time":"[progress.col.underMinute]","usd":"$0.01"}]')
  assert.equal(fig.plan, '[progress.col.done{"time":"[progress.minutes{\\"n\\":6}]","usd":"$0.08"}]')
  assert.equal(fig.copy, '[progress.col.runningFor{"time":"[progress.minutes{\\"n\\":3}]"}]')
  assert.equal(fig.pictures, '[progress.col.running]', 'a running step with no start says only running')
  assert.equal(fig.write, '[progress.col.about{"time":"[progress.minutes{\\"n\\":4}]","usd":"$0.30"}]')
  // A running step with a known spend says it, and a waiting step never measured says nothing.
  const run = buildRun()
  run.steps[3].usd = 0.07
  run.steps[5].estimate = null
  const more = Object.fromEntries(lib.buildColumns(t, run, 'running', 'en').map((c) => [c.key, c.figure]))
  assert.equal(more.copy, '[progress.col.runningSpent{"time":"[progress.minutes{\\"n\\":3}]","usd":"$0.07"}]')
  assert.equal(more.write, null)
  // An older answer with no per-step cost keeps the time alone.
  const old = buildRun()
  delete old.steps[1].usd
  assert.equal(lib.buildColumns(t, old, 'running', 'en')[1].figure, '[progress.minutes{"n":2}]')
})

test('a stopped build marks its step Stopped, a finished one every step done', () => {
  const stopped = lib.buildColumns(t, buildRun(), 'failed', 'en')
  assert.deepEqual(
    stopped.map((c) => c.state),
    ['done', 'done', 'done', 'failed', 'failed', 'waiting']
  )
  assert.equal(stopped[3].figure, '[progress.col.stopped]')
  const finished = lib.buildColumns(t, buildRun(), 'completed', 'en')
  assert.ok(finished.every((c) => c.state === 'done'))
})

test('the build columns CSS: six equal columns, two rows of three on a narrow pane, the band grows only for them', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(css, /\.tracy-wo-band-cols \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/)
  assert.match(css, /@container \(max-width: 560px\) \{\s*[^}]*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(
    css,
    /:has\(> \.tracy-wo-band-pane\[data-build\]\) \{ height: auto; min-height: var\(--wo-band-h\)/
  )
  assert.match(css, /li\[data-state='done'\]::after \{ background: var\(--success\)/)
  assert.match(css, /data-node='running'\] \{[^}]*border-top-color: var\(--primary\)/)
})

test('the sub-step connector is one continuous 1px line: no gaps, segment pseudo elements, label masked by the pane colour', () => {
  const css = lib.PROGRESS_BAND_CSS
  assert.match(css, /\.tracy-wo-band-subs > li::before[^{]*\{[^}]*height: 1px[^}]*var\(--border\)/)
  assert.match(css, /\.tracy-wo-band-subs > li:first-child::before[^{]*\{[^}]*display: none/)
  assert.match(css, /\.tracy-wo-band-subs > li\[data-state='done'\]::after[^{]*\{[^}]*var\(--success\)/)
  assert.match(css, /\.tracy-wo-band-sub-label[^{]*\{[^}]*padding: 0 4px; background: var\(--wo-pane-bg\)/)
  assert.doesNotMatch(css, /li \+ li::before/)
})

test('the estimate pill explains itself on hover, and the build estimate is an open-ended minimum', () => {
  const html = draw({
    research: RESEARCHED,
    brief: { id: 'b-1', n: 1 },
    demo: 'none',
    approval: { research: 'ok', profile: 'approved', brief: 'approved' }
  })
  assert.match(html, /class="tracy-wo-band-est" title="\[stepper\.estimate\.build\.why\]"/)
  assert.match(html, /\[stepper\.estimate\.build\]</)
})

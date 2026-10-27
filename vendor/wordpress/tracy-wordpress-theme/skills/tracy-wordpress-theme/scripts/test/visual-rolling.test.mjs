// visual-rolling.test.mjs — the rolling Visual QA loop: several tiers in one round, page jobs in
// parallel with the same report as in series, the net-progress stop rule, the change → pages
// selection in every tier's DOM state, and the controller (round.mjs --watch) with its client
// (recheck.mjs) end to end on a three-page mock site served from a temp dir.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stopRule, nextStep, churn } from '../visual/rounds.mjs'
import { dependentPages, matchStatesFor, pagesMatching } from '../visual/affected.mjs'
import { BINDING_FILE, BINDING_SCHEMA, SWEEP_CHECKS, checkpointGate, isCompleteCheckpoint, latestClusters, loadConfig, packArtifacts, planScope, reportProblems, runRound, sampleRecheck, sweepStep } from '../visual/round.mjs'
import { sumsText } from '../quickstart/lib.mjs'
import { acquireLock, lockHolder, lockFile, releaseLock, request, status, submit, summarize, takeoverFile, waitFor, workOrder } from '../visual/recheck.mjs'
import { run } from '../visual/visual-qa.mjs'
import { buildContract, specHash } from '../visual/contract.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('round.latestClusters surfaces schema refusals with the field name', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-cluster-schema-'))
  try {
    const tier = path.join(dir, 'light-desktop')
    mkdirSync(tier)
    writeFileSync(path.join(tier, 'clusters.json'), JSON.stringify({ schemaVersion: 1, history: false, totals: {}, clusters: [] }))
    assert.throws(() => latestClusters([{ tiers: { 'light-desktop': { out: tier } } }], ['light-desktop']), /clusters\.json:.*totals\.findings/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
async function until(fn, what, ms = 120000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(100)
  }
}

/**
 * Waits for `fn()` to be truthy. There is no elapsed-time budget: it fails only when `progress()` (a snapshot of what the thing under test is doing) has not
 * changed for `idleMs` — a controller that is slow under load keeps changing it, one that hangs does not.
 */
async function untilIdle(fn, what, progress, idleMs = 120000) {
  let last = progress()
  let since = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    const now = progress()
    if (now !== last) {
      last = now
      since = Date.now()
    } else if (Date.now() - since > idleMs) throw new Error(`nothing changed for ${idleMs / 1000} s while waiting for ${what}`)
    await sleep(100)
  }
}

/** What a controller and its held pages are doing, as one string: it changes while the work moves and stays put when it hangs. */
const progressOf = (evidence, name, f) => () => JSON.stringify([status({ evidence, name }), f.held.slow, f.held.waiting?.length])

/** A request to the controller, answered when the controller answers it (the file is the event); fails only when `progress()` stops changing for `idleMs`. */
async function ask({ evidence, name, kind, changed = [] }, progress, idleMs = 120000) {
  if (!lockHolder(evidence)?.alive) return { verdict: 'error', why: 'no rolling controller is running for this ledger' }
  const id = submit({ evidence, name, kind, changed })
  const file = path.join(evidence, name, 'requests', `${id}.result.json`)
  return untilIdle(async () => {
    const r = await waitFor({ evidence, name, id, timeoutS: 0.2, pollMs: 50 })
    return /^no answer within/.test(r.why ?? '') ? null : r
  }, `the answer to the ${kind} request (${file})`, progress, idleMs)
}

// ── the stop rule and the decisions (pure) ──────────────────────────────────────────────────────
test('rounds.stopRule: net progress decides — 100 → 81 closing 20 and opening 1 continues; flat, up, or closed ≤ new stops', () => {
  const r = stopRule(100, 81, { closed: 20, new: 1 })
  assert.equal(r.stop, false, r.reason)
  assert.equal(r.drop, 0.19, 'a 19 % drop, which the old < 20 % rule stopped')
  assert.equal(stopRule(100, 100, { closed: 5, new: 5 }).stop, true)
  assert.match(stopRule(100, 100).reason, /not decreasing/)
  assert.equal(stopRule(100, 110, { closed: 2, new: 12 }).stop, true)
  const churned = stopRule(100, 95, { closed: 30, new: 30 })
  assert.equal(churned.stop, true, 'a total that went down while closing no more than it opened is no real progress')
  assert.match(churned.reason, /closed 30 ≤ new 30/)
  assert.equal(stopRule(null, 40).stop, false, 'the first checkpoint never stops')
  assert.equal(stopRule(100, 0, { closed: 100, new: 0 }).stop, false)
  // the churn guard is unchanged beside it
  assert.equal(churn({ deterministic: { closed: 20, new: 1 } }).verdict, 'pass')
  assert.equal(churn({ deterministic: { closed: 10, new: 4 } }).verdict, 'fix-again-before-full')
})

test('rounds.nextStep: an incomplete measurement never closes, never stops, never counts — measure again', () => {
  const base = { round: 1, maxRounds: 3, churnVerdict: 'pass', stop: null, findings: 0, unclassified: 0, nondeterministic: 0, axisErrors: 0 }
  assert.equal(nextStep({ ...base, scope: 'full', incomplete: 'no report from dark-desktop' }).next, 'full')
  assert.equal(nextStep({ ...base, scope: 'full', incomplete: 'cancelled', stop: { stop: true, reason: 'x' } }).next, 'full')
  assert.equal(nextStep({ ...base, scope: 'targeted', incomplete: 'no report from light-desktop' }).next, 'full')
  assert.equal(nextStep({ ...base, scope: 'full' }).next, 'close-tier')
  assert.equal(nextStep({ ...base, scope: 'targeted' }).next, 'full', 'a clean recheck never closes a tier')
})

test('rounds.nextStep (#19 item 8): a checkpoint with churn above the guard has ONE next — fix the regressions — not also stop; the bound still decides', () => {
  // JA Vega M4c lr-1: churn 0.57 (`fix-again-before-full`) and a stop rule fired by the same
  // regressions (closed ≤ new) — the line said both `fix-again-before-full` and `stop-decision-list`
  const stop = stopRule(120, 130, { closed: 21, new: 31 })
  assert.equal(stop.stop, true)
  const guard = churn({ deterministic: { closed: 21, new: 31 } })
  assert.equal(guard.verdict, 'fix-again-before-full')
  const base = { scope: 'full', maxRounds: 3, churnVerdict: guard.verdict, stop, findings: 130, unclassified: 0, nondeterministic: 0, axisErrors: 0 }
  const r = nextStep({ ...base, round: 1 })
  assert.equal(r.next, 'fix-again', r.why)
  assert.match(r.why, /stop rule is judged on that checkpoint/)
  assert.equal(nextStep({ ...base, round: 3 }).next, 'stop-decision-list', 'at the bound the stop rule decides, not another fix round')
  assert.equal(nextStep({ ...base, round: 3, stop: { stop: false } }).next, 'replan')
  assert.equal(nextStep({ ...base, round: 1, churnVerdict: 'pass' }).next, 'stop-decision-list', 'no churn: the stop rule decides')
  assert.equal(nextStep({ ...base, round: 1, stop: { stop: false } }).next, 'fix-again')
})

// ── config ──────────────────────────────────────────────────────────────────────────────────────
test('round.loadConfig: stages in the fixed order under one tier key; bad limits and unknown stages fail closed; one stage keeps its old key', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-cfg-'))
  try {
    const f = path.join(dir, 'round.json')
    const write = (o) => writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://x', ...o }))
    write({ stages: ['dark-desktop', 'light-desktop'] })
    const c = loadConfig(f, { name: 'n' })
    assert.deepEqual(c.stages, ['light-desktop', 'dark-desktop'])
    assert.equal(c.stage, 'light-desktop+dark-desktop')
    assert.deepEqual([c.tierConcurrency, c.concurrency, c.checkpointEvery], [2, 2, null], 'no periodic full checkpoint by default')
    write({ stage: 'light-desktop', concurrency: 3 })
    assert.deepEqual([loadConfig(f, { name: 'n' }).stage, loadConfig(f, { name: 'n' }).multi], ['light-desktop', false])
    assert.equal(loadConfig(f, { name: 'n', overrides: { stages: ['light-desktop', 'light-responsive'], tierConcurrency: '4' } }).tierConcurrency, 4)
    write({ stages: ['light-desktop', 'dusk'] })
    assert.throws(() => loadConfig(f, { name: 'n' }), /unknown stage dusk/)
    write({ stages: ['light-desktop', 'light-desktop'] })
    assert.throws(() => loadConfig(f, { name: 'n' }), /twice/)
    write({ stages: ['light-desktop'], tierConcurrency: 0 })
    assert.throws(() => loadConfig(f, { name: 'n' }), /tierConcurrency must be a positive integer/)
    write({ stage: 'light-desktop' })
    assert.throws(() => loadConfig(f, { name: 'n', overrides: { concurrency: '2.5' } }), /concurrency must be a positive integer/)
    write({ stages: ['light-desktop'], visualQaArgsByStage: { 'dark-desktop': [] } })
    assert.throws(() => loadConfig(f, { name: 'n' }), /not a stage of this config/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// stands in for site-sweep.mjs: writes a report with two defect groups into --out and exits 1, as the real one does
const SWEEP_STUB = `const fs = require('fs'); const out = process.argv.at(-1); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(out + '/site-sweep.json', JSON.stringify({ checks: [{ id: 'overflow', defects: 2, notMeasured: 0 }, { id: 'forms', defects: 0, notMeasured: 1 }] })); process.exit(1)`

// ── the build loop's rules: two free full checkpoints, a sweep after every deploy ──
test('round.loadConfig: no periodic full checkpoint by default; a schedule needs a stated reason, which the config carries', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-cfg-'))
  try {
    const f = path.join(dir, 'round.json')
    const write = (o) => writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://x', ...o }))
    write({})
    assert.equal(loadConfig(f, { name: 'n' }).checkpointEvery, null)
    write({ checkpointEvery: 4 })
    assert.throws(() => loadConfig(f, { name: 'n' }), /\[checkpoint-reason\] .*--checkpoint-reason "<text>".*recorded in the run record/)
    assert.throws(() => loadConfig(f, { name: 'n', overrides: { checkpointEvery: '3' } }), /\[checkpoint-reason\]/)
    assert.throws(() => loadConfig(f, { name: 'n', overrides: { checkpointEvery: '3', checkpointReason: '  ' } }), /\[checkpoint-reason\]/)
    const c = loadConfig(f, { name: 'n', overrides: { checkpointEvery: '3', checkpointReason: 'the port has a global stylesheet that every fix touches' } })
    assert.deepEqual([c.checkpointEvery, c.checkpointReason], [3, 'the port has a global stylesheet that every fix touches'])
    write({ checkpointEvery: 0, checkpointReason: 'x' })
    assert.throws(() => loadConfig(f, { name: 'n' }), /checkpointEvery must be a positive integer/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('round.checkpointGate: the baseline and the final integration checkpoint are free; a third or later needs a stated reason', () => {
  assert.equal(checkpointGate({ completed: 0 }).ok, true)
  assert.equal(checkpointGate({ completed: 1 }).ok, true)
  const third = checkpointGate({ completed: 2 })
  assert.equal(third.ok, false)
  assert.equal(third.code, 'checkpoint-limit')
  assert.match(third.why, /\[checkpoint-limit\] 2 full checkpoint\(s\) are already complete .*recheck\.mjs --checkpoint --reason/)
  assert.equal(checkpointGate({ completed: 2, reason: '   ' }).ok, false, 'a blank reason is no reason')
  assert.deepEqual(checkpointGate({ completed: 7, reason: ' a regression after the final checkpoint ' }), { ok: true, reason: 'a regression after the final checkpoint' })
})

test('round.sweepStep: the loop sweeps after every deploy with all eleven checks; source is optional for spec-bound none pages', () => {
  assert.deepEqual(SWEEP_CHECKS, ['overflow', 'scheme', 'background', 'header', 'chips', 'fixed-widgets', 'icons', 'forms', 'text', 'first-interaction', 'heights'])
  const dir = mkdtempSync(path.join(tmpdir(), 'vqa-cfg-'))
  try {
    const f = path.join(dir, 'round.json')
    const write = (o) => writeFileSync(f, JSON.stringify({ runRoot: 'd', site: 'http://port.test', ...o }))
    write({ sourceSite: 'http://src.test', spec: 'spec' })
    const step = sweepStep(loadConfig(f, { name: 'n' }), '/out/sweep')
    const argv = step.cmd.slice(1)
    assert.match(argv[0], /visual\/site-sweep\.mjs$/)
    const flag = (n) => argv[argv.indexOf(n) + 1]
    assert.deepEqual([flag('--site'), flag('--source'), flag('--out')], ['http://port.test', 'http://src.test', '/out/sweep'])
    assert.ok(!argv.includes('--only'), 'no --only: the sweep keeps its history (scoped re-run) mode')
    assert.ok(argv.includes('--run-root') && argv.includes('--spec'))
    write({})
    const targetOnly = sweepStep(loadConfig(f, { name: 'n' }), '/out/sweep')
    assert.ok(targetOnly.cmd.includes('--site'))
    assert.ok(!targetOnly.cmd.includes('--source'))
    assert.ok(!targetOnly.cmd.includes('--only'), 'all eleven checks and history remain enabled')
    write({ steps: { sweep: { cmd: ['echo', 'x'] } } })
    assert.deepEqual(sweepStep(loadConfig(f, { name: 'n' }), '/o').cmd, ['echo', 'x', '--out', '/o'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── templates and patterns by the contract's map ────────────────────────────────────────────────
test('round.planScope: a template reaches the pages it serves, a pattern the pages whose sections map to it; what the map cannot place is FULL', async () => {
  const contract = {
    pages: [
      { id: 'a', path: '/a/', layout: 'page', sections: ['hero'] },
      { id: 'b', path: '/b/', layout: 'page', sections: ['cards'] },
      { id: 'c', path: '/c/', layout: 'single', sections: ['hero'] }
    ],
    layouts: [{ id: 'page', template: 'templates/page.html' }, { id: 'single', template: 'templates/single.html' }]
  }
  const patternsMap = { types: { hero: { pattern: 'tracy/section-hero' }, cards: { pattern: 'tracy/section-cards' } } }
  const theme = { 'templates/page.html': '1', 'templates/single.html': '1', 'templates/unused.html': '1', 'patterns/section-hero.php': '1', 'patterns/section-cards.php': '1', 'patterns/section-orphan.php': '1' }
  const html = { a: '1', b: '1', c: '1' }
  const prev = { contractHash: 'h', theme, cssDir: '/nonexistent', html, nondeterministic: [] }
  const plan = (changed, extra = {}) => planScope({ prev, contract, contractHashNow: 'h', themeNow: { ...theme, ...changed }, themeDir: '/nonexistent', html, nondeterministic: [], site: 'http://x', patternsMap, ...extra })
  assert.deepEqual((await plan({ 'templates/page.html': '2' })).pages, ['a', 'b'], 'served HTML unchanged yet: the template map still selects its pages')
  assert.deepEqual((await plan({ 'patterns/section-hero.php': '2' })).pages, ['a', 'c'])
  assert.deepEqual((await plan({ 'patterns/section-cards.php': '2' })).pages, ['b'])
  assert.equal((await plan({ 'templates/unused.html': '2' })).kind, 'none', 'a template no page is served by reaches a page only by moving its HTML')
  assert.equal((await plan({ 'patterns/section-orphan.php': '2' })).kind, 'full', 'a pattern no page maps to is unknown: full')
  assert.equal((await plan({ 'patterns/section-cards.php': '2' }, { patternsMap: null })).kind, 'full', 'no map: full')
  const unplaced = { ...contract, pages: [...contract.pages, { id: 'd', path: '/d/', layout: 'nowhere' }] }
  const full = await planScope({ prev: { ...prev, html: { ...html, d: '1' } }, contract: unplaced, contractHashNow: 'h', themeNow: { ...theme, 'templates/single.html': '2' }, themeDir: '/nonexistent', html: { ...html, d: '1' }, nondeterministic: [], site: 'http://x', patternsMap })
  assert.equal(full.kind, 'full')
  assert.match(full.reason, /no known template/)
  assert.deepEqual(dependentPages({ contract, files: ['templates/single.html'], patternsMap }).pages, ['c'])
})

test('round.sampleRecheck: a shared change measures each layout representative, the pages it cannot stand in for and the changed clusters — deterministically; the rest is deferred', async () => {
  // JA Vega M4d (27/09): a shared template or prose rule reached nearly every page and each recheck
  // measured all of them (8–11 minutes); a representative per layout stands in for the rest
  const contract = {
    pages: [
      { id: 'p1', layout: 'page' },
      { id: 'p2', layout: 'page' },
      { id: 'p3', layout: 'page' },
      { id: 's1', layout: 'single' },
      { id: 's2', layout: 'single' },
      { id: 'x', layout: null }
    ],
    layouts: [
      { id: 'page', representative: 'p1', pages: ['p1', 'p2', 'p3'] },
      { id: 'single', representative: 's1', pages: ['s1', 's2'] }
    ]
  }
  const all = contract.pages.map((p) => p.id)
  const clean = (ids) => new Map(ids.map((id) => [id, { id, findings: [] }]))
  const latest = { 'light-desktop': clean(all), 'dark-desktop': clean(all) }
  latest['light-desktop'].set('p3', { id: 'p3', findings: [{ kind: 'parity-mismatch' }] })
  latest['dark-desktop'].set('s2', { id: 's2', findings: [{ kind: 'parity-mismatch' }] })
  const templates = { kind: 'full', allAffected: true, pages: all, by: { html: [], deps: all, css: [] }, markup: true }
  // no cluster hint: every affected page with findings on any tier, plus the representatives
  const r = sampleRecheck({ scope: templates, contract, latest })
  assert.deepEqual(r.measure, ['p1', 'p3', 's1', 's2', 'x'])
  assert.deepEqual(r.deferred, ['p2'])
  assert.deepEqual(r.affected, all)
  assert.deepEqual(r.reasons.p1, ['layout representative'])
  assert.deepEqual(r.reasons.x, ['no layout representative'])
  assert.equal(r.clusters.used, false)
  // a usable hint narrows the open pages to the cluster's: p3's open cluster is not the one changed
  const clusters = { 'light-desktop': { clusters: [{ id: 'C-a', status: 'open', pages: ['s2', 'p2'] }, { id: 'C-b', status: 'open', pages: ['p3'] }, { id: 'C-z', status: 'accepted', pages: ['p3'] }] } }
  const hinted = sampleRecheck({ scope: templates, contract, latest, clusters, hint: ['C-a'] })
  assert.deepEqual(hinted.measure, ['p1', 'p2', 's1', 's2', 'x'])
  assert.deepEqual(hinted.deferred, ['p3'], 'deferred, not closed: its finding stays open until the next checkpoint')
  assert.match(hinted.reasons.p2.join(), /changed cluster\(s\) C-a/)
  // a hint the clusters do not hold (unknown, accepted, or reaching no affected page) is not used
  for (const bad of [['C-nope'], ['C-z'], ['C-a', 'C-nope']]) assert.deepEqual(sampleRecheck({ scope: templates, contract, latest, clusters, hint: bad }).measure, r.measure, bad.join())
  // same answer whatever the order of the inputs
  const shuffled = { ...templates, pages: [...all].reverse(), by: { html: [], deps: [...all].reverse(), css: [] } }
  assert.deepEqual(sampleRecheck({ scope: shuffled, contract, latest, clusters, hint: ['C-a', 'C-a'] }), hinted)
  // a narrow selector that matches p2 but not its representative keeps p2 itself
  const narrow = { kind: 'targeted', pages: ['p2', 's1', 's2'], by: { html: [], deps: [], css: ['p2', 's1', 's2'] }, markup: false }
  const n = sampleRecheck({ scope: narrow, contract, latest: { 'light-desktop': clean(all) } })
  assert.deepEqual(n.measure, ['p2', 's1'])
  assert.deepEqual(n.deferred, ['s2'])
  assert.match(n.reasons.p2[0], /precise: its representative p1 is not reached/)
  // served HTML stands in only when a theme markup file changed; a page's own HTML is its own
  const own = { kind: 'targeted', pages: ['p1', 'p2'], by: { html: ['p1', 'p2'], deps: [], css: [] }, markup: false }
  assert.deepEqual(sampleRecheck({ scope: own, contract, latest: { 'light-desktop': clean(all) } }).measure, ['p1', 'p2'])
  assert.deepEqual(sampleRecheck({ scope: { ...own, markup: true }, contract, latest: { 'light-desktop': clean(all) } }).measure, ['p1'])
  // a page never measured on a tier is measured
  assert.deepEqual(sampleRecheck({ scope: templates, contract, latest: { 'light-desktop': clean(['p1', 's1', 'x']) } }).measure, all)
  // a representative that is not a page of its layout fails closed
  const broken = { ...contract, layouts: [{ id: 'page', representative: 's1', pages: ['p1', 'p2', 'p3'] }, contract.layouts[1]] }
  assert.match(sampleRecheck({ scope: templates, contract: broken, latest }).full, /representative s1 is not a page of the layout/)
  // planScope says which channel reached which page, and marks a known change that reaches all
  const pc = { pages: [{ id: 'a', layout: 'page' }, { id: 'b', layout: 'page' }], layouts: [{ id: 'page', template: 'templates/page.html', representative: 'a', pages: ['a', 'b'] }] }
  const prev = { contractHash: 'h', theme: { 'templates/page.html': '1' }, cssDir: '/nonexistent', html: { a: '1', b: '1' }, nondeterministic: [] }
  const known = await planScope({ prev, contract: pc, contractHashNow: 'h', themeNow: { 'templates/page.html': '2' }, themeDir: '/nonexistent', html: { a: '1', b: '1' }, nondeterministic: [], site: 'http://x' })
  assert.equal(known.kind, 'full')
  assert.equal(known.allAffected, true)
  assert.deepEqual(known.by, { html: [], deps: ['a', 'b'], css: [] })
  const unknown = await planScope({ prev, contract: pc, contractHashNow: 'h', themeNow: { 'templates/page.html': '1', 'theme.json': '1' }, themeDir: '/nonexistent', html: { a: '1', b: '1' }, nondeterministic: [], site: 'http://x' })
  assert.equal(unknown.kind, 'full')
  assert.equal(unknown.allAffected, undefined, 'uncertainty is never sampled')
})

// ── the mock site: three pages, a theme stylesheet, a stylesheet outside the theme ──────────────
const CSS = 'body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}main{padding:40px}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}'
const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
const THEME_JS = "<script>try{const m=document.cookie.match(/tracy_theme=(dark|light)/);if(m){document.documentElement.setAttribute('data-theme',m[1])}}catch(e){}</script>"
const sitePage = (h1, extra = '', tail = '', h1Class = '') =>
  `<!doctype html><html lang="en"><head><link rel="stylesheet" href="/assets/css/site.css"><link rel="stylesheet" href="/plugin/extra.css">${THEME_JS}</head><body class="tracy-page-page"><main><h1${h1Class ? ` class="${h1Class}"` : ''}>${h1}</h1>${extra}${words}</main>${tail}</body></html>`
const srcPage = (h1, extra = '') => `<!doctype html><html lang="en"><head><style>${CSS}</style></head><body><main><h1>${h1}</h1>${extra}${words}</main></body></html>`
// the about page draws a class below 600 px only (a responsive script); the contact page waits on a
// request the test can hold (networkidle waits for it, DOMContentLoaded does not)
const NARROW = "<script>if(innerWidth<600)document.querySelector('main').classList.add('narrow')</script>"
const SLOW = "<script>fetch('/slow').catch(()=>{})</script>"

/**
 * One mock site per test, so the browser-backed tests run side by side (the `describe` below) and
 * no test sees another's knobs or files. A held request waits for the test to `release()` it — a
 * barrier, not a timer: `held.slow` counts the contact page's requests as they arrive, and a
 * document the browser asks for while `hold.docs` is set waits the same way.
 */
async function makeSite() {
  const root = mkdtempSync(path.join(tmpdir(), 'vqa-rolling-'))
  const site = path.join(root, 'site')
  const theme = path.join(root, 'theme')
  const spec = path.join(root, 'spec')
  const runRoot = path.join(root, 'dossier')
  for (const d of [path.join(site, 'about'), path.join(site, 'team'), path.join(site, 'contact'), path.join(site, 'plugin'), path.join(theme, 'assets', 'css'), path.join(theme, 'templates'), path.join(spec, 'reference', 'rendered'), runRoot]) mkdirSync(d, { recursive: true })
  writeFileSync(path.join(site, 'about', 'index.html'), sitePage('About us', '', NARROW, 'about-title'))
  writeFileSync(path.join(site, 'team', 'index.html'), sitePage('Our team', '<p class="team-only">Team lead of the studio</p>'))
  writeFileSync(path.join(site, 'contact', 'index.html'), sitePage('Contact', '<p class="contact-only">Write to the studio office</p>', SLOW))
  writeFileSync(path.join(site, 'plugin', 'extra.css'), '/* a plugin stylesheet, outside the theme */')
  writeFileSync(path.join(theme, 'assets', 'css', 'site.css'), CSS)
  writeFileSync(path.join(theme, 'templates', 'page.html'), '<!-- wp:post-content /-->')
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), srcPage('About us'))
  // the source draws the team page's h1 larger: a finding that stays open throughout
  writeFileSync(path.join(spec, 'reference', 'rendered', 'team--1440-light.html'), srcPage('Our team', '<p>Team lead of the studio</p>').replace('</style>', 'h1{font-size:48px}</style>'))
  writeFileSync(path.join(spec, 'reference', 'rendered', 'contact--1440-light.html'), srcPage('Contact', '<p>Write to the studio office</p>'))
  for (const f of ['sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const pageMap = {
    locales: ['en'],
    defaultLocale: 'en',
    pages: [
      { file: 'About.html', view: 'page', title: 'About us', path: '/about/', locale: 'en' },
      { file: 'Team.html', view: 'page', title: 'Our team', path: '/team/', locale: 'en' },
      { file: 'Contact.html', view: 'page', title: 'Contact', path: '/contact/', locale: 'en' }
    ]
  }
  // the intrinsic mobile probe (#65) reads its routes from the spec's page-map.json, so it must list the pages
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify(pageMap))
  const reference = { pages: ['about', 'team', 'contact'].map((s) => ({ page: `${s[0].toUpperCase()}${s.slice(1)}.html`, path: `reference/rendered/${s}--1440-light.html` })) }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page', '/team/': 'page', '/contact/': 'page' } }, specHash: specHash(spec), id: 'rolling' })
  writeFileSync(path.join(runRoot, 'visual.contract.json'), JSON.stringify(contract))
  const knobs = { docDelayMs: 0, inflight: 0, maxInflight: 0, dropNodeFetches: 0, hold: { slow: false, docs: false } }
  const held = { slow: 0, waiting: [] }
  const release = () => {
    knobs.hold.slow = false
    knobs.hold.docs = false
    for (const go of held.waiting.splice(0)) go()
  }
  const s = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p === '/slow') {
      held.slow++
      const answer = () => {
        res.writeHead(200, { 'content-type': 'text/plain' })
        res.end('ok')
      }
      if (knobs.hold.slow) held.waiting.push(answer)
      else answer()
      return
    }
    const base = p.startsWith('/assets/') ? theme : site
    const doc = p.endsWith('/')
    // a transient failure of the runner's own fetch (the determinism preflight), not the browser's
    if (doc && knobs.dropNodeFetches > 0 && req.headers['user-agent'] === 'node') {
      knobs.dropNodeFetches--
      req.socket.destroy()
      return
    }
    if (doc) p += 'index.html'
    const file = path.join(base, p)
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('<html lang="en"><body><main><h1>Not found</h1></main></body></html>')
      return
    }
    const send = () => {
      res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
    }
    // documents a browser asks for are counted in flight: how many page jobs overlap
    if (doc && /HeadlessChrome/.test(req.headers['user-agent'] ?? '')) {
      if (knobs.hold.docs) {
        held.waiting.push(send)
        return
      }
      knobs.inflight++
      knobs.maxInflight = Math.max(knobs.maxInflight, knobs.inflight)
      setTimeout(() => {
        knobs.inflight--
        send()
      }, knobs.docDelayMs)
      return
    }
    send()
  })
  await new Promise((resolve, reject) => {
    s.once('error', reject)
    s.listen(0, '127.0.0.1', resolve)
  })
  const origin = `http://127.0.0.1:${s.address().port}`
  const contractFile = path.join(runRoot, 'visual.contract.json')
  return {
    root,
    origin,
    knobs,
    held,
    release,
    contractFile,
    readContract: () => JSON.parse(readFileSync(contractFile, 'utf8')),
    writeConfig: (file, o) => writeFileSync(path.join(root, file), JSON.stringify({ runRoot: 'dossier', site: origin, spec: 'spec', theme: 'theme', fetches: 2, ...o })),
    close: async () => {
      release()
      s.closeAllConnections()
      await new Promise((r) => s.close(r))
      rmSync(root, { recursive: true, force: true })
    }
  }
}
async function withSite(fn) {
  const f = await makeSite()
  try {
    return await fn(f)
  } finally {
    await f.close()
  }
}
// a quickstart pack that checks out, and a theme zip, written an hour ago (the tiers bind to them)
const hex = (b) => createHash('sha256').update(b).digest('hex')
function writePack(dir, { webroot = 'webroot-bytes', database = 'database-bytes' } = {}) {
  const pack = path.join(dir, 'pack')
  mkdirSync(pack, { recursive: true })
  const manifest = { schemaVersion: 'tracy-quickstart/v1', id: 'tracy-base/wp7', version: '1.0.0', platform: 'wordpress', wpVersion: '7.1', theme: { name: 'tracy-base' }, webroot: { file: 'webroot.tar.gz', sha256: hex(webroot) }, database: { file: 'database.sql.gz', sha256: hex(database) } }
  writeFileSync(path.join(pack, manifest.webroot.file), webroot)
  writeFileSync(path.join(pack, manifest.database.file), database)
  const m = JSON.stringify(manifest)
  writeFileSync(path.join(pack, 'manifest.json'), m)
  writeFileSync(path.join(pack, 'SHA256SUMS'), sumsText([{ file: 'manifest.json', sha256: hex(m) }, { file: manifest.webroot.file, sha256: manifest.webroot.sha256 }, { file: manifest.database.file, sha256: manifest.database.sha256 }]))
  const artifact = path.join(dir, 'tracy-base-1.0.0.zip')
  if (!existsSync(artifact)) writeFileSync(artifact, 'theme-zip-bytes')
  const past = new Date(Date.now() - 3600_000)
  for (const f of [artifact, path.join(pack, manifest.webroot.file), path.join(pack, manifest.database.file)]) utimesSync(f, past, past)
  return { pack, artifact }
}
/** The binding of one tier directory, checked against its report and the artifacts as they are now. */
function assertBound(dir, stage, { pack, artifact }) {
  const bytes = readFileSync(path.join(dir, 'visual.json'))
  const b = JSON.parse(readFileSync(path.join(dir, BINDING_FILE), 'utf8'))
  assert.equal(b.schema, BINDING_SCHEMA)
  assert.equal(b.stage, stage)
  assert.deepEqual(b.report, { file: 'visual.json', sha256: `sha256:${hex(bytes)}` })
  assert.equal(b.measuredAt, JSON.parse(bytes).at)
  const now = packArtifacts({ pack, artifact })
  for (const k of ['theme', 'webroot', 'database']) assert.deepEqual(b.artifactHash[k], { file: now[k].file, sha256: now[k].sha256 }, `${stage} ${k}`)
  return b
}
const ledgerOf = (evidence) => readFileSync(path.join(evidence, 'rounds.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const pageLines = (dir) => (existsSync(path.join(dir, 'pages.jsonl')) ? readFileSync(path.join(dir, 'pages.jsonl'), 'utf8').trim().split('\n').filter(Boolean) : [])

// what a report says, without its timings: the parallel run must say exactly what the serial run says
const projection = (report, out) => ({
  pages: report.pages.map((p) => ({
    id: p.id,
    hash: p.hash,
    axes: p.axes.map((a) => ({ variant: a.variant, stage: a.stage, measured: a.measured, screenshot: a.screenshot ?? null, sourceScreenshot: a.sourceScreenshot ?? null, components: (a.components ?? []).map((c) => c.element), unclassified: a.coverage?.unclassified ?? null, findings: a.findings.map((f) => ({ kind: f.kind, element: f.element ?? f.selector ?? f.what ?? null })) }))
  })),
  stages: report.stages.map((s) => ({ id: s.id, status: s.status, pages: s.pages, axes: s.axes, findings: s.findings })),
  summary: { findings: report.summary.findings, distinct: report.summary.distinct, unclassified: report.summary.unclassified },
  shots: (function list(d, rel = '') {
    return readdirSync(d).flatMap((e) => (statSync(path.join(d, e)).isDirectory() ? list(path.join(d, e), `${rel}${e}/`) : [`${rel}${e}`])).sort()
  })(path.join(out, 'shots'))
})

// ── the cut checkpoint (the formerly intermittent "cut cp1 pagesMeasured not < 3") ──────────────
test('rolling: a fix cuts cp1 before its held page completes', async () => {
  // A fix arriving while checkpoint 1 runs cuts it at the deploy boundary: the visual-qa processes
  // get SIGTERM with the contact page still held. Before the fix in round.mjs (leader first) and
  // the handler in visual-qa.mjs, Chromium could die before Node saw its signal, and the held page
  // was published as an axis-error with a whole report: 3 pages measured on a cut checkpoint.
  await withSite(async (f) => {
    const stages = ['light-desktop', 'dark-desktop']
    f.writeConfig('cut.json', { evidence: 'ev-cut', stages, tierConcurrency: 2, concurrency: 2 })
    const evidence = path.join(f.root, 'ev-cut')
    const name = 'c1'
    f.knobs.hold.slow = true
    const ctl = runRound(['--config', path.join(f.root, 'cut.json'), '--name', name, '--watch', '--skip-deploy', '--poll-ms', '100'])
    let stopped = false
    try {
      // no elapsed-time assumption anywhere in this test: each wait ends on the state it names, and fails only when the controller and the pages stop
      // changing altogether (a hang), however slow the machine is
      const progress = () => JSON.stringify([status({ evidence, name }), f.held.slow])
      // both tiers have published about and team, and each has the contact page's request in hand
      await untilIdle(() => {
        const pages = status({ evidence, name }).pages
        return f.held.slow >= 2 && stages.every((s) => pages[s]?.['en-team'] && pages[s]?.['en-about'])
      }, 'the fast pages published and the contact page held on both tiers', progress)
      for (const s of stages) {
        mkdirSync(path.join(evidence, name, 'cp1', s, 'notes'), { recursive: true })
        writeFileSync(path.join(evidence, name, 'cp1', s, 'notes', 'layout.md'), '# Layout lens\n')
      }
      appendFileSync(path.join(f.root, 'theme', 'assets', 'css', 'site.css'), '.team-only{color:rgb(20,23,26)}')
      // the verdict is the controller's answer to the request (cut, deploy, recheck): awaited as that event
      const fix = await ask({ evidence, name, kind: 'recheck', changed: ['assets/css/site.css'] }, progress)
      assert.equal(fix.verdict, 'findings', JSON.stringify(fix).slice(0, 600))
      const cp1 = ledgerOf(evidence).find((l) => l.run === `${name}/cp1`)
      assert.equal(cp1.complete, false)
      assert.equal(cp1.interrupted, true)
      const cut = Object.fromEntries(stages.map((s) => [s, pageLines(path.join(evidence, name, 'cp1', s))]))
      for (const s of stages) {
        const dir = path.join(evidence, name, 'cp1', s)
        const evidenceOf = () => JSON.stringify({ tier: cp1.tiers[s], report: existsSync(path.join(dir, 'visual.json')), pages: cut[s].map((l) => l.slice(0, 300)), cutAt: cp1.end })
        assert.ok(cp1.tiers[s].pagesMeasured < 3, `${s}: the checkpoint was cut before the held page: ${evidenceOf()}`)
        assert.equal(existsSync(path.join(dir, 'visual.json')), false, `${s}: a cut run writes no report`)
        assert.ok(!cut[s].some((l) => JSON.parse(l).page === 'en-contact'), `${s}: the held page is never published: ${evidenceOf()}`)
      }
      const bye = await ask({ evidence, name, kind: 'stop' }, progress)
      assert.equal(bye.verdict, 'stopped')
      stopped = true
      await ctl
      // the held requests are answered only now: nothing of the cut run is left to publish
      f.release()
      for (const s of stages) assert.deepEqual(pageLines(path.join(evidence, name, 'cp1', s)), cut[s], `${s}: no page line after the cut`)
      assert.equal(lockHolder(evidence), null)
    } finally {
      f.release()
      if (!stopped) {
        await ask({ evidence, name, kind: 'stop' }, () => '').catch(() => null)
        await ctl.catch(() => null)
      }
    }
  })
})

// ── the two free full checkpoints: a third is asked for with a reason ──────────────────────────────
// A ledger that already holds the baseline and the final integration checkpoint of the tier (two complete lines).
function seedTwoCheckpoints(root, evidence) {
  mkdirSync(evidence, { recursive: true })
  const lines = [1, 2].map((n) => {
    const out = path.join(evidence, `old-cp${n}`)
    mkdirSync(out, { recursive: true })
    writeFileSync(path.join(out, 'visual.json'), '{}')
    return JSON.stringify({ run: `old/cp${n}`, stage: 'light-desktop', kind: 'checkpoint', deployed: false, out, complete: true, ...(n === 1 ? { tierStart: true } : {}), end: new Date().toISOString() })
  })
  writeFileSync(path.join(evidence, 'rounds.jsonl'), lines.join('\n') + '\n')
}

test('rolling: a session on a tier that already has its two full checkpoints needs a stated reason for the third; a request without one is refused by name', () =>
  withSite(async (f) => {
    // no reason: the session's own first checkpoint would be the third — refused before anything is measured
    f.writeConfig('third.json', { evidence: 'ev-third', stage: 'light-desktop' })
    seedTwoCheckpoints(f.root, path.join(f.root, 'ev-third'))
    await assert.rejects(runRound(['--config', path.join(f.root, 'third.json'), '--name', 't1', '--watch', '--skip-deploy', '--poll-ms', '100']), /\[checkpoint-limit\] 2 full checkpoint\(s\) are already complete.*--checkpoint-reason/)
    assert.equal(lockHolder(path.join(f.root, 'ev-third')), null, 'the refusal releases the lock')
    // with a reason: it starts and records the reason; a request that gives none is refused, one that gives one is queued
    f.writeConfig('third2.json', { evidence: 'ev-third', stage: 'light-desktop', checkpointReason: 'a regression after the final checkpoint', checkpointEvery: 50 })
    const evidence = path.join(f.root, 'ev-third')
    const name = 't2'
    f.knobs.hold.slow = true
    const ctl = runRound(['--config', path.join(f.root, 'third2.json'), '--name', name, '--watch', '--skip-deploy', '--poll-ms', '100'])
    let stopped = false
    try {
      const progress = progressOf(evidence, name, f)
      await until(() => status({ evidence, name }).control?.active?.id === 'cp1', 'the third checkpoint, started with its reason')
      const refused = await ask({ evidence, name, kind: 'checkpoint' }, progress)
      assert.equal(refused.verdict, 'refused', JSON.stringify(refused))
      assert.equal(refused.code, 'checkpoint-limit')
      assert.match(refused.why, /recheck\.mjs --checkpoint --reason/)
      const bye = await ask({ evidence, name, kind: 'stop' }, progress)
      assert.equal(bye.verdict, 'stopped')
      stopped = true
      await ctl
      f.release()
      const cp = ledgerOf(evidence).find((l) => l.run === `${name}/cp1`)
      assert.equal(cp.reason, 'a regression after the final checkpoint', 'the reason is in the run record')
    } finally {
      f.release()
      if (!stopped) {
        await ask({ evidence, name, kind: 'stop' }, () => '').catch(() => null)
        await ctl.catch(() => null)
      }
    }
  }))

// ── browser-backed tests, side by side: each has its own site, server and knobs ────────────────
describe('rolling, browser-backed', { concurrency: 4 }, () => {
  // ── every tier's DOM state ────────────────────────────────────────────────────────────────────
  test('affected.pagesMatching: a mobile-only and a dark-only selector are found in their own state, and missed on the light desktop DOM alone', () =>
    withSite(async (f) => {
      const contract = f.readContract()
      const states = matchStatesFor(contract)
      assert.deepEqual(states.map((s) => s.id), ['1440-dark', '1440-light', '390-dark', '390-light'])
      assert.equal(states.find((s) => s.id === '390-dark').hook, 'cookie:tracy_theme=dark')
      assert.deepEqual(matchStatesFor(contract, ['light-desktop']).map((s) => s.id), ['1440-light'])
      const narrow = await pagesMatching({ site: f.origin, pages: contract.pages, selectors: ['.narrow h1'], states })
      assert.deepEqual(narrow.affected, ['en-about'])
      assert.deepEqual(narrow.byState, { '390-dark': ['en-about'], '390-light': ['en-about'] })
      const dark = await pagesMatching({ site: f.origin, pages: contract.pages, selectors: ['html[data-theme=dark] .contact-only'], states })
      assert.deepEqual(dark.affected, ['en-contact'])
      const lightOnly = await pagesMatching({ site: f.origin, pages: contract.pages, selectors: ['.narrow h1', 'html[data-theme=dark] .contact-only'] })
      assert.deepEqual(lightOnly.affected, [], 'the light desktop DOM alone misses both')
    }))

  // ── page jobs and tiers in parallel ───────────────────────────────────────────────────────────
  test('visual-qa: pages and tiers in parallel give the same report as in series, and the bound holds (tier-concurrency × concurrency)', () =>
    withSite(async (f) => {
      const base = { contract: f.contractFile, site: f.origin, spec: path.join(f.root, 'spec'), theme: path.join(f.root, 'theme'), megaItems: '.none', stage: 'light-desktop,dark-desktop' }
      // in series one document is in flight whatever the delay; the delay is only there to make
      // parallel page jobs overlap where the server can count them
      const serialOut = path.join(f.root, 'serial')
      const serial = await run({ ...base, out: serialOut, concurrency: 1, tierConcurrency: 1 })
      const serialMax = f.knobs.maxInflight
      f.knobs.maxInflight = 0
      f.knobs.docDelayMs = 300
      const events = []
      const parallelOut = path.join(f.root, 'parallel')
      const parallel = await run({ ...base, out: parallelOut, concurrency: 2, tierConcurrency: 2, onPage: (e) => events.push(e) })
      const parallelMax = f.knobs.maxInflight
      assert.equal(serialMax, 1, 'in series one page is in flight at a time')
      assert.ok(parallelMax >= 2, `pages overlapped (max ${parallelMax} in flight)`)
      assert.ok(parallelMax <= 4, `never more than 2 tiers × 2 pages in flight (max ${parallelMax})`)
      assert.deepEqual(projection(parallel, parallelOut), projection(serial, serialOut))
      assert.ok(serial.summary.findings >= 1, 'the team finding is there in both')
      // every page of every tier was published once, and pages.jsonl holds the same events
      assert.equal(events.length, 6)
      assert.deepEqual(events.map((e) => `${e.stage} ${e.page}`).sort(), ['dark-desktop en-about', 'dark-desktop en-contact', 'dark-desktop en-team', 'light-desktop en-about', 'light-desktop en-contact', 'light-desktop en-team'])
      const logged = pageLines(parallelOut).map((l) => JSON.parse(l))
      assert.equal(logged.length, 6)
      assert.ok(logged.find((e) => e.stage === 'light-desktop' && e.page === 'en-team').findings.some((x) => x.kind === 'parity-mismatch'))
    }))

  test('visual-qa: a page is published the moment it is done — a held page does not hold back another page\'s findings', () =>
    withSite(async (f) => {
      f.knobs.hold.slow = true
      const events = []
      const done = run({ contract: f.contractFile, site: f.origin, out: path.join(f.root, 'slow-run'), spec: path.join(f.root, 'spec'), theme: path.join(f.root, 'theme'), megaItems: '.none', stage: 'light-desktop', concurrency: 2, priority: ['en-contact', 'en-team'], onPage: (e) => events.push({ ...e, released: !f.knobs.hold.slow }) })
      try {
        // contact went first (priority) and is held; team is published while it waits
        await until(() => f.held.slow >= 1 && events.some((e) => e.page === 'en-team'), 'the team page published while contact is held', 20000)
        assert.equal(events.some((e) => e.page === 'en-contact'), false, 'the held page is still being measured')
      } finally {
        f.release()
      }
      await done
      const team = events.find((e) => e.page === 'en-team')
      const contact = events.find((e) => e.page === 'en-contact')
      assert.ok(team.findings.length >= 1, 'the team page has its finding')
      assert.equal(team.released, false, 'team was published before the held request was answered')
      assert.equal(contact.released, true, 'contact was published only once its request was answered')
      assert.ok(events.indexOf(team) < events.indexOf(contact))
    }))

  test('visual-qa CLI: SIGTERM (a cut checkpoint) ends the run at once — exit 143, no report, no page line after the signal', () =>
    withSite(async (f) => {
      // Playwright's own SIGTERM handler closes Chromium and leaves Node running: before the handler in
      // visual-qa.mjs a cut run went on, turned the page in flight into an axis-error and could write a
      // whole visual.json (the rolling test's "cut cp1 pagesMeasured not < 3", 4 of 14 runs, 27/09)
      const out = path.join(f.root, 'sigterm-run')
      f.knobs.hold.slow = true
      const child = spawn(process.execPath, [new URL('../visual/visual-qa.mjs', import.meta.url).pathname, '--contract', f.contractFile, '--site', f.origin, '--out', out, '--spec', path.join(f.root, 'spec'), '--theme', path.join(f.root, 'theme'), '--mega-items', '.none', '--stage', 'light-desktop', '--concurrency', '2', '--priority', 'en-about,en-team'], { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', (d) => (err += d))
      const closed = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })))
      try {
        // about and team are done; contact is held
        await untilIdle(() => pageLines(out).length >= 2 && f.held.slow >= 1, 'the two fast pages and the held one', () => JSON.stringify([pageLines(out), f.held.slow, err.length]))
        const before = pageLines(out)
        child.kill('SIGTERM')
        const { code, signal } = await closed
        // the run's own handler ended it (143, not a signal death): nothing in this test sends a later SIGKILL while the child is alive, so no clock is needed to tell
        assert.equal(code, 143, `exit ${code} ${signal ?? ''}: ${err.slice(-600)}`)
        assert.equal(signal, null)
        assert.match(err, /SIGTERM: cancelled — no report is written/)
        f.release()
        assert.equal(existsSync(path.join(out, 'visual.json')), false, 'a cut run writes no report')
        assert.deepEqual(pageLines(out), before, 'no page line after the signal')
        assert.ok(!pageLines(out).some((l) => JSON.parse(l).page === 'en-contact'))
      } finally {
        f.release()
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        await closed
      }
    }))

  test('round --watch in-process: SIGTERM winds the session down and ends the process — exit 143, lock released — even with other work keeping Node alive', () =>
    withSite(async (f) => {
      // A test file the runner timed out got SIGTERM while a controller ran inside it: the handler
      // stopped the session, and the process lived on, starting the next test (27/09, check 2)
      f.writeConfig('signal.json', { evidence: 'ev-signal', stage: 'light-desktop' })
      const ev = path.join(f.root, 'ev-signal')
      const url = new URL('../visual/round.mjs', import.meta.url).href
      const script = `import { runRound } from ${JSON.stringify(url)}
setInterval(() => {}, 1000)
await runRound(['--config', ${JSON.stringify(path.join(f.root, 'signal.json'))}, '--name', 'sg1', '--watch', '--skip-deploy', '--poll-ms', '100'])
console.log('runRound returned and the process lives on')`
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (d) => (out += d))
      child.stderr.on('data', (d) => (out += d))
      const closed = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })))
      let timer
      try {
        await until(() => lockHolder(ev)?.pid === child.pid && existsSync(path.join(ev, 'sg1', 'control.json')), 'the controller to take the ledger', 60000)
        child.kill('SIGTERM')
        const alive = new Promise((r) => (timer = setTimeout(() => r('still running 20 s after SIGTERM'), 20000)))
        const r = await Promise.race([closed, alive])
        assert.deepEqual(r, { code: 143, signal: null }, out.slice(-600))
        assert.doesNotMatch(out, /lives on/)
        assert.equal(lockHolder(ev), null, 'the lock is released on the way out')
      } finally {
        clearTimeout(timer)
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        await closed
      }
    }))

  test('recheck.status: `work` orders open clusters largest first (only pages still open), then pages no cluster covers; without clusters.json, pages by findings', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vqa-work-order-'))
    try {
      const run1 = path.join(dir, 'cp1', 'light-desktop')
      const run2 = path.join(dir, 'cp1', 'dark-desktop')
      for (const d of [run1, run2]) mkdirSync(d, { recursive: true })
      const ev = (page, n) => JSON.stringify({ page, measured: 'now', findings: Array.from({ length: n }, () => ({ kind: 'parity-mismatch' })), unclassified: 0, at: 't' })
      writeFileSync(path.join(run1, 'pages.jsonl'), [ev('a', 3), ev('b', 1), ev('c', 0), ev('d', 2)].join('\n') + '\n')
      writeFileSync(path.join(run2, 'pages.jsonl'), [ev('a', 1), ev('b', 4)].join('\n') + '\n')
      const cluster = (id, size, pages, st = 'open') => ({ id: `C-${id.toLowerCase().padStart(8, '0')}`, size, findings: size, pages, axes: ['1440-light'], representative: pages[0], unchanged: false, streak: 0, members: [{ key: `${pages[0]}|1440-light|findings#0`, page: pages[0], axis: '1440-light', list: 'findings', index: 0, findingKey: 'k', element: null }], status: st, kind: 'parity-mismatch', selector: `.${id}`, property: 'color', expected: '#000', observed: '#fff', inference: null, viaSelectors: [] })
      const totals = { findings: 0, accepted: 0, units: 0, clusters: 0, acceptedClusters: 0, inMoreThanOneCluster: 0, inferred: 0, unchanged: 0, compared: 0 }
      writeFileSync(path.join(run1, 'clusters.json'), JSON.stringify({ schemaVersion: 1, history: false, totals, clusters: [cluster('c2', 5, ['a', 'c']), cluster('c1', 9, ['c']), cluster('c3', 2, ['b']), cluster('a1', 7, ['d'], 'accepted')] }))
      const runs = [{ id: 'cp1', kind: 'checkpoint', gen: 1, tiers: { 'light-desktop': run1, 'dark-desktop': run2 } }]
      const w = workOrder(runs, status({ evidence: dir, name: 'none' }).pages ?? {}) // no control file: no pages
      assert.deepEqual(w, [])
      const pages = { 'light-desktop': {}, 'dark-desktop': {} }
      for (const [s, d] of [['light-desktop', run1], ['dark-desktop', run2]])
        for (const l of readFileSync(path.join(d, 'pages.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x))) pages[s][l.page] = { run: 'cp1', findings: l.findings.length, kinds: ['parity-mismatch'] }
      const order = workOrder(runs, pages)
      assert.deepEqual(
        order.map((x) => (x.by === 'cluster' ? `${x.stage} ${x.cluster} ${x.pages.join(',')}` : `${x.stage} page ${x.page}`)),
        [
          'light-desktop C-000000c2 a', // C1 (only page c, now clean) is gone; C2 keeps only its open page
          'light-desktop C-000000c3 b',
          'dark-desktop page b', // no clusters.json for dark: pages, most findings first
          'light-desktop page d', // accepted cluster A1 is not work
          'dark-desktop page a'
        ]
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── one round over several tiers ──────────────────────────────────────────────────────────────
  test('round: one invocation measures all four tiers, one report per tier, ONE ledger line; a tier that fails hides nothing of the others', () =>
    withSite(async (f) => {
      const bound = writePack(f.root)
      f.writeConfig('multi.json', { evidence: 'ev-multi', stages: ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive'], tierConcurrency: 2, concurrency: 2, artifact: bound.artifact, pack: bound.pack })
      const line = await runRound(['--config', path.join(f.root, 'multi.json'), '--name', 'm1', '--skip-deploy'])
      assert.equal(line.failedStep, undefined, JSON.stringify(line).slice(0, 800))
      assert.deepEqual(line.stages, ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive'])
      assert.equal(line.stage, 'light-desktop+light-responsive+dark-desktop+dark-responsive')
      assert.equal(line.kind, 'checkpoint')
      assert.equal(line.complete, true)
      for (const s of line.stages) {
        assert.ok(existsSync(path.join(f.root, 'ev-multi', 'm1', s, 'visual.json')), `${s} wrote its own report`)
        assert.ok(existsSync(path.join(f.root, 'ev-multi', 'm1', s, 'clusters.json')), `${s} wrote its clusters (cluster.mjs), every round`)
        assert.equal(line.tiers[s].clusters.findings, line.tiers[s].findings.total)
        assert.equal(line.tiers[s].measuredPages, 3)
        assert.ok(line.durations_s.visualQaByTier[s] > 0)
        // #59: each tier is bound to the theme zip and the pack as it is measured, never afterwards by hand
        assertBound(path.join(f.root, 'ev-multi', 'm1', s), s, bound)
        assert.equal(line.tiers[s].binding, path.join(f.root, 'ev-multi', 'm1', s, BINDING_FILE))
      }
      assert.equal(line.findings.total, Object.values(line.tiers).reduce((n, t) => n + t.findings.total, 0), 'the totals are the tiers summed')
      assert.match(line.lensesDue, /^layout/)
      assert.deepEqual(line.tiers['dark-desktop'].lenses, ['layout'])
      assert.equal(ledgerOf(path.join(f.root, 'ev-multi')).length, 1)

      f.writeConfig('broken.json', { evidence: 'ev-broken', stages: ['light-desktop', 'dark-desktop'], visualQaArgsByStage: { 'dark-desktop': ['--scope', 'no-such-scope'] } })
      const broken = await runRound(['--config', path.join(f.root, 'broken.json'), '--name', 'b1', '--skip-deploy'])
      assert.deepEqual(broken.failedTiers, ['dark-desktop'])
      assert.equal(broken.complete, false)
      assert.equal(broken.next, 'full', 'a checkpoint missing a tier does not count')
      assert.equal(broken.tiers['dark-desktop'].error, 'visual-qa wrote no report')
      assert.ok(broken.tiers['light-desktop'].findings.total >= 1, 'the light tier still reports its finding')
      assert.equal(broken.stop, null, 'no stop decision on an incomplete checkpoint')
    }))

  test('round: a checkpoint narrowed by its tier args, or whose determinism preflight could not read a page, does not count', () =>
    withSite(async (f) => {
      f.writeConfig('narrow.json', { evidence: 'ev-narrow', stage: 'light-desktop', visualQaArgsByStage: { 'light-desktop': ['--pages', 'en-about'] } })
      const narrow = await runRound(['--config', path.join(f.root, 'narrow.json'), '--name', 'n1', '--skip-deploy'])
      assert.equal(narrow.kind, 'checkpoint')
      assert.equal(narrow.complete, false, JSON.stringify(narrow).slice(0, 600))
      assert.match(narrow.incomplete, /scope targeted-debug, not full/)
      assert.match(narrow.incomplete, /not measured/)
      assert.equal(narrow.next, 'full')
      assert.equal(narrow.stop, null)

      f.writeConfig('flaky.json', { evidence: 'ev-flaky', stage: 'light-desktop' })
      f.knobs.dropNodeFetches = 1
      const flaky = await runRound(['--config', path.join(f.root, 'flaky.json'), '--name', 'f1', '--skip-deploy'])
      f.knobs.dropNodeFetches = 0
      assert.equal(flaky.determinism.errors.length, 1, JSON.stringify(flaky.determinism))
      assert.equal(flaky.tiers, undefined)
      assert.equal(flaky.measuredPages, 3, 'the browser measured every page')
      assert.equal(flaky.complete, false)
      assert.match(flaky.incomplete, /determinism preflight failed on 1 page/)
      assert.equal(flaky.next, 'full')
    }))

  test('round CLI: a checkpoint that does not count exits 1, so a shell never takes it for a result', () =>
    withSite(async (f) => {
      // the fixture server lives in this process: the child must run asynchronously
      const cli = (args) =>
        new Promise((resolve) => {
          const child = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'visual', 'round.mjs'), ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
          let out = ''
          child.stdout.on('data', (d) => (out += d))
          child.on('close', (code) => resolve({ code, out }))
        })
      f.writeConfig('narrow-cli.json', { evidence: 'ev-narrow-cli', stage: 'light-desktop', visualQaArgsByStage: { 'light-desktop': ['--pages', 'en-about'] } })
      const { code, out } = await cli(['--config', path.join(f.root, 'narrow-cli.json'), '--name', 'n1', '--skip-deploy'])
      const line = JSON.parse(out.trim().split('\n').pop())
      assert.equal(line.complete, false, out.slice(0, 600))
      assert.equal(code, 1)
    }))

  test('round.isCompleteCheckpoint: a ledger line without `complete: true` is never a baseline, report on disk or not', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'vqa-legacy-'))
    try {
      const out = path.join(dir, 'old')
      mkdirSync(out, { recursive: true })
      writeFileSync(path.join(out, 'visual.json'), JSON.stringify({ scope: { kind: 'targeted-debug' }, pages: [] }))
      const legacy = { run: 'old', stage: 'light-desktop', out, scope: { kind: 'full' } }
      assert.equal(isCompleteCheckpoint(legacy, ['light-desktop']), false, 'written before `complete` existed: its scope and coverage were never checked')
      assert.equal(isCompleteCheckpoint({ ...legacy, complete: false }, ['light-desktop']), false)
      assert.equal(isCompleteCheckpoint({ ...legacy, complete: true }, ['light-desktop']), true)
      assert.equal(isCompleteCheckpoint({ ...legacy, complete: true, out: path.join(dir, 'gone') }, ['light-desktop']), false, 'no report on disk')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('round: a clean checkpoint closes the tier only once every lens note is written — then a checkpoint of the same deployment closes it', () =>
    withSite(async (f) => {
      // a dossier of the about page alone, built like the fixture's
      const clean = path.join(f.root, 'dossier-clean')
      mkdirSync(clean, { recursive: true })
      const pageMap = { locales: ['en'], defaultLocale: 'en', pages: [{ file: 'About.html', view: 'page', title: 'About us', path: '/about/', locale: 'en' }] }
      const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
      const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates: { '/about/': 'page' } }, specHash: specHash(path.join(f.root, 'spec')), id: 'rolling-clean' })
      writeFileSync(path.join(clean, 'visual.contract.json'), JSON.stringify(contract))
      f.writeConfig('clean.json', { runRoot: 'dossier-clean', evidence: 'ev-clean', stage: 'light-desktop' })
      const cfg = path.join(f.root, 'clean.json')
      const c1 = await runRound(['--config', cfg, '--name', 'c1', '--skip-deploy'])
      assert.equal(c1.complete, true, c1.log ? readFileSync(c1.log, 'utf8').slice(-1500) : JSON.stringify(c1).slice(0, 800))
      assert.equal(c1.findings.total, 0, 'the about page is clean on the light desktop tier')
      assert.equal(c1.next, 'lenses', 'clean, but no lens note is written: the tier does not close')
      assert.match(c1.lensesDue, /^all lenses/)
      assert.deepEqual(c1.lenses, ['layout', 'typography', 'color', 'images', 'interaction'])
      assert.equal(c1.lensGap.length, 5)
      // a note for some lenses is not enough
      mkdirSync(path.join(c1.out, 'notes'), { recursive: true })
      writeFileSync(path.join(c1.out, 'notes', 'layout.md'), '# Layout lens\n')
      const c2 = await runRound(['--config', cfg, '--name', 'c2', '--skip-deploy', '--scope', 'full'])
      assert.equal(c2.next, 'lenses')
      assert.equal(c2.lensGap.length, 4)
      for (const l of c1.lenses) writeFileSync(path.join(c1.out, 'notes', `${l}.md`), `# ${l} lens\n`)
      const c3 = await runRound(['--config', cfg, '--name', 'c3', '--skip-deploy', '--scope', 'full'])
      assert.equal(c3.next, 'close-tier', JSON.stringify(c3).slice(0, 800))
      assert.equal(c3.lensGap, undefined)
    }))

  test('recheck: a dead lock taken over by several controllers at once has exactly one winner', async () => {
    const ev = mkdtempSync(path.join(tmpdir(), 'vqa-race-'))
    try {
      const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']).stdout.toString()
      const url = new URL('../visual/recheck.mjs', import.meta.url).href
      // every child is started, then all try at the same instant, report, and hold what they got until all have tried
      const script = `import { acquireLock } from ${JSON.stringify(url)}
process.stdout.write('ready\\n')
process.stdin.once('data', () => {
  let r; try { acquireLock(${JSON.stringify(ev)}, 'c' + process.pid); r = 'won' } catch (e) { r = 'lost: ' + e.message }
  process.stdout.write(r); process.stdin.once('data', () => process.exit(0))
})`
      for (let attempt = 0; attempt < 3; attempt++) {
        writeFileSync(lockFile(ev), JSON.stringify({ pid: Number(dead), name: 'crashed', at: 'then' }))
        const kids = Array.from({ length: 6 }, () => {
          const c = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'inherit'] })
          let out = ''
          const ready = new Promise((resolve) => c.stdout.on('data', function onData(d) {
            out += d
            if (out.startsWith('ready\n')) resolve()
          }))
          const tried = new Promise((resolve) => c.stdout.on('data', () => out.length > 6 && resolve()))
          const closed = new Promise((resolve) => c.on('close', resolve))
          return { c, ready, tried, closed, result: () => out.slice(6) }
        })
        await Promise.all(kids.map((k) => k.ready))
        for (const k of kids) k.c.stdin.write('go\n')
        await Promise.all(kids.map((k) => k.tried))
        for (const k of kids) k.c.stdin.end('bye\n')
        await Promise.all(kids.map((k) => k.closed))
        const results = kids.map((k) => k.result())
        assert.equal(results.filter((r) => r === 'won').length, 1, results.join('\n'))
        assert.ok(results.filter((r) => r !== 'won').every((r) => /owns|taking over/.test(r)), results.join('\n'))
        rmSync(lockFile(ev), { force: true })
      }
      // a takeover left behind by a controller that died mid-way is refused by name, never raced
      writeFileSync(lockFile(ev), JSON.stringify({ pid: Number(dead), name: 'crashed', at: 'then' }))
      writeFileSync(takeoverFile(ev), JSON.stringify({ pid: Number(dead), name: 'half' }))
      assert.throws(() => acquireLock(ev, 'late'), /died doing it/)
    } finally {
      rmSync(ev, { recursive: true, force: true })
    }
  })

  // ── one writer per ledger ─────────────────────────────────────────────────────────────────────
  test('recheck: one controller per ledger — a second is refused, a dead one is taken over, a round waits, a request without a controller is an error', () =>
    withSite(async (f) => {
      const ev = path.join(f.root, 'ev-lock')
      acquireLock(ev, 'first')
      try {
        assert.throws(() => acquireLock(ev, 'second'), /owns/)
        f.writeConfig('lock.json', { evidence: 'ev-lock', stage: 'light-desktop' })
        await assert.rejects(() => runRound(['--config', path.join(f.root, 'lock.json'), '--name', 'x1', '--skip-deploy']), /owns/)
      } finally {
        releaseLock(ev)
      }
      assert.equal(lockHolder(ev), null)
      const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']).stdout.toString()
      writeFileSync(lockFile(ev), JSON.stringify({ pid: Number(dead), name: 'crashed', at: 'then' }))
      const taken = acquireLock(ev, 'third')
      assert.equal(taken.recovered.name, 'crashed')
      releaseLock(ev)
      mkdirSync(path.join(ev, 'nobody', 'requests'), { recursive: true })
      const r = await request({ evidence: ev, name: 'nobody', kind: 'recheck', changed: ['a.css'], timeoutS: 5 })
      assert.equal(r.verdict, 'error')
      assert.match(r.why, /no rolling controller/)
    }))

  test('round: a one-round run holds the ledger lock for its whole run — a second round and a controller beside it are refused, the ledger gets ONE line', () =>
    withSite(async (f) => {
      f.writeConfig('lock-round.json', { evidence: 'ev-lock-round', stage: 'light-desktop' })
      const cfg = path.join(f.root, 'lock-round.json')
      const ev = path.join(f.root, 'ev-lock-round')
      // the browser's documents are held until the refusals are checked: the round is still running
      f.knobs.hold.docs = true
      let first
      try {
        first = runRound(['--config', cfg, '--name', 'r1', '--skip-deploy'])
        const h = await until(() => (lockHolder(ev)?.role === 'round' ? lockHolder(ev) : null), 'the first round to take the lock', 30000)
        assert.equal(h.name, 'r1')
        assert.equal(h.pid, process.pid)
        await assert.rejects(() => runRound(['--config', cfg, '--name', 'r2', '--skip-deploy']), /one-round run \(pid \d+, run r1\) owns/)
        assert.throws(() => acquireLock(ev, 'ctl'), /one-round run .* owns/, 'a controller cannot take the ledger from a running round')
        f.release()
        const line = await first
        assert.equal(line.run, 'r1')
      } finally {
        f.release()
        await first?.catch(() => null)
      }
      assert.equal(lockHolder(ev), null, 'released when the round ends')
      assert.deepEqual(ledgerOf(ev).map((l) => l.run), ['r1'], 'the refused round wrote nothing')
      assert.ok(!existsSync(path.join(ev, 'r2')), 'the refused round left no run directory')
      // a lock left by a dead writer is taken over, and the line says so
      const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']).stdout.toString()
      writeFileSync(lockFile(ev), JSON.stringify({ pid: Number(dead), name: 'crashed', role: 'controller', at: 'then' }))
      const r3 = await runRound(['--config', cfg, '--name', 'r3', '--skip-deploy'])
      assert.deepEqual(r3.recoveredLock, { pid: Number(dead), name: 'crashed' })
      assert.equal(lockHolder(ev), null)
      const after = ledgerOf(ev)
      assert.deepEqual(after.map((l) => l.run), ['r1', 'r3'])
      assert.deepEqual(after[1].recoveredLock, { pid: Number(dead), name: 'crashed' }, 'the takeover is in the ledger, not only in the return value')
      assert.equal(after[0].recoveredLock, undefined, 'a round that took a free lock records no takeover')
    }))

  test('rolling: a checkpoint cut with tiers still queued (tier-concurrency 1 of 4) starts none of them — it is recorded as soon as the running tier ends', () =>
    withSite(async (f) => {
      f.writeConfig('cut-queue.json', { evidence: 'ev-cut-queue', stages: ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive'], tierConcurrency: 1, concurrency: 2 })
      const evidence = path.join(f.root, 'ev-cut-queue')
      const name = 'q1'
      const progress = progressOf(evidence, name, f)
      f.knobs.hold.slow = true
      const ctl = runRound(['--config', path.join(f.root, 'cut-queue.json'), '--name', name, '--watch', '--skip-deploy', '--poll-ms', '100'])
      try {
        await until(() => (status({ evidence, name }).pages['light-desktop'] ?? {})['en-team'] && f.held.slow >= 1, 'the first tier to publish a page, its contact page held', 60000)
        const t0 = Date.now()
        const bye = await ask({ evidence, name, kind: 'stop' }, progress)
        assert.equal(bye.verdict, 'stopped')
        await ctl
        const took = Date.now() - t0
        assert.ok(took < 30000, `the cut waited ${took} ms: a queued tier ran into the held page`)
      } finally {
        f.release()
        await ctl.catch(() => null)
      }
      const cp1 = ledgerOf(evidence).find((l) => l.run === `${name}/cp1`)
      assert.equal(cp1.complete, false)
      assert.equal(cp1.interrupted, true)
      assert.equal(cp1.tiers['light-desktop'].started, undefined, 'the running tier was started, and cut')
      for (const s of ['light-responsive', 'dark-desktop', 'dark-responsive']) {
        assert.equal(cp1.tiers[s].started, false, `${s} was queued, never started`)
        assert.equal(cp1.tiers[s].pagesMeasured, 0)
        assert.ok(!existsSync(path.join(evidence, name, 'cp1', `visualQa-${s}.log`)), `${s}: no visual-qa process was spawned after the cut`)
      }
      assert.equal(lockHolder(evidence), null)
    }))

  // ── the rolling loop with artifact binding ────────────────────────────────────────────────────
  test('rolling: a checkpoint binds every tier to the pack; a pack rebuilt while the checkpoint runs leaves it unbound and incomplete', () =>
    withSite(async (f) => {
      const bound = writePack(f.root)
      const stages = ['light-desktop', 'dark-desktop']
      f.writeConfig('bound.json', { evidence: 'ev-bound', stages, tierConcurrency: 2, concurrency: 2, artifact: bound.artifact, pack: bound.pack })
      const evidence = path.join(f.root, 'ev-bound')
      const name = 'bd1'
      const progress = progressOf(evidence, name, f)
      f.knobs.hold.docs = true
      const ctl = runRound(['--config', path.join(f.root, 'bound.json'), '--name', name, '--watch', '--skip-deploy', '--poll-ms', '100'])
      let stopped = false
      try {
        // cp1's tiers are measuring (a document is held) when the pack is rebuilt under them
        await until(() => f.held.waiting.length >= 1, 'a page of cp1 in the browser', 60000)
        writePack(f.root, { webroot: 'webroot-bytes, rebuilt' })
        f.release()
        const cp1 = await until(() => existsSync(path.join(evidence, 'rounds.jsonl')) && ledgerOf(evidence).find((l) => l.run === `${name}/cp1`), 'cp1 on the ledger', 120000)
        assert.equal(cp1.complete, false, JSON.stringify(cp1).slice(0, 600))
        assert.match(cp1.incomplete, /webroot artifact changed during the measurement/)
        for (const s of stages) assert.equal(existsSync(path.join(evidence, name, 'cp1', s, BINDING_FILE)), false, `${s}: no binding of a measurement the pack changed under`)
        // measured again over the pack as it is now: bound, complete
        const cp = await ask({ evidence, name, kind: 'checkpoint' }, progressOf(evidence, name, f))
        assert.equal(cp.line.complete, true, JSON.stringify(cp).slice(0, 600))
        for (const s of stages) assertBound(path.join(evidence, name, 'cp2', s), s, bound)
        const bye = await ask({ evidence, name, kind: 'stop' }, progress)
        assert.equal(bye.verdict, 'stopped')
        stopped = true
        await ctl
      } finally {
        f.release()
        if (!stopped) {
          await ask({ evidence, name, kind: 'stop' }, () => '').catch(() => null)
          await ctl.catch(() => null)
        }
      }
    }))

  // ── the rolling loop, end to end ──────────────────────────────────────────────────────────────
  test('rolling: findings while the checkpoint runs; a fix is judged on the pages it reaches on every tier without waiting; a regression outside that set is caught by the next checkpoint', () =>
    withSite(async (f) => {
      f.writeConfig('rolling.json', { evidence: 'ev-rolling', stages: ['light-desktop', 'dark-desktop'], tierConcurrency: 2, concurrency: 2, checkpointEvery: 3, checkpointReason: 'test: the fix-count schedule', steps: { sweep: { cmd: [process.execPath, '-e', SWEEP_STUB, '--'] } } })
      const cfg = path.join(f.root, 'rolling.json')
      const evidence = path.join(f.root, 'ev-rolling')
      const name = 's1'
      const progress = progressOf(evidence, name, f)
      const site = path.join(f.root, 'theme', 'assets', 'css', 'site.css')
      f.knobs.hold.slow = true
      const ctl = runRound(['--config', cfg, '--name', name, '--watch', '--skip-deploy', '--poll-ms', '100'])
      let stopped = false
      try {
        // 1. the first checkpoint runs; the team page's findings are readable while the contact page is held
        const early = await until(() => {
          const st = status({ evidence, name }).pages['light-desktop'] ?? {}
          return st['en-team'] && st['en-about'] ? st : null
        }, 'the first pages of the checkpoint')
        assert.ok(early['en-team'].findings >= 1)
        assert.equal(early['en-contact'], undefined, 'the held page is still being measured')
        assert.equal(early['en-team'].run, 'cp1')

        // 2. a fix before the tier's layout lens note is refused before any deploy
        const refused = await request({ evidence, name, kind: 'recheck', changed: ['assets/css/site.css'], timeoutS: 60 })
        assert.equal(refused.verdict, 'refused', JSON.stringify(refused))
        assert.equal(refused.failedStep, 'lenses')
        for (const s of ['light-desktop', 'dark-desktop']) {
          mkdirSync(path.join(evidence, name, 'cp1', s, 'notes'), { recursive: true })
          writeFileSync(path.join(evidence, name, 'cp1', s, 'notes', 'layout.md'), '# Layout lens\n')
        }

        // 3. a rule only the team page matches, and — unannounced, outside the theme — a regression on about
        appendFileSync(site, '.team-only{color:rgb(20,23,26)}')
        writeFileSync(path.join(f.root, 'site', 'plugin', 'extra.css'), '.about-title{font-size:52px}')
        const t0 = Date.now()
        const fix = await request({ evidence, name, kind: 'recheck', changed: ['overlays/tracy-base/assets/css/site.css'], timeoutS: 120 })
        const took = Date.now() - t0
        assert.equal(fix.verdict, 'findings', JSON.stringify(fix).slice(0, 600))
        assert.ok(took < 60000, `answered in ${took} ms, without waiting for the held page`)
        assert.equal(fix.scope.kind, 'targeted')
        assert.deepEqual(fix.scope.pages, ['en-team'])
        assert.deepEqual(Object.keys(fix.pages), ['light-desktop', 'dark-desktop'])
        for (const s of ['light-desktop', 'dark-desktop']) assert.deepEqual(Object.keys(fix.pages[s]), ['en-team'], `${s}: exactly the page the selector matches`)
        assert.deepEqual(fix.changed.hintNotChanged, [])
        assert.deepEqual(fix.changed.actual, ['assets/css/site.css'])
        assert.equal(fix.closesGate, false)
        assert.equal(fix.gen, 2)
        // (the cut of cp1 itself: 'rolling: a fix cuts cp1 before its held page completes')
        f.release()

        // 4. a dark-only rule reaches the contact page, and is measured on the light tier too
        appendFileSync(site, 'html[data-theme=dark] .contact-only{color:rgb(236,234,228)}')
        const dark = await request({ evidence, name, kind: 'recheck', changed: ['assets/css/site.css'], timeoutS: 120 })
        assert.deepEqual(dark.scope.pages, ['en-contact'], JSON.stringify(dark.scope))
        for (const s of ['light-desktop', 'dark-desktop']) assert.deepEqual(Object.keys(dark.pages[s]), ['en-contact'])
        assert.ok(!Object.keys(dark.pages['light-desktop']).includes('en-about'), 'the about regression is outside the affected set')

        // 5. two requests queued together are one deploy and one recheck, both answered with it
        appendFileSync(site, '.team-only{font-weight:400}')
        const ids = [submit({ evidence, name, kind: 'recheck', changed: ['assets/css/site.css'] }), submit({ evidence, name, kind: 'recheck', changed: ['assets/css/site.css'], note: 'the same fix, sent twice' })]
        const [a, b] = await Promise.all(ids.map((id) => waitFor({ evidence, name, id, timeoutS: 120 })))
        assert.equal(a.line.run, b.line.run)
        assert.equal(a.gen, b.gen)
        assert.equal(a.checkpointDue, true, 'three fixes: a checkpoint is owed')

        // 6. the checkpoint measures every page on every tier and finds the regression no recheck measured
        const cp = await ask({ evidence, name, kind: 'checkpoint' }, progressOf(evidence, name, f))
        assert.equal(cp.verdict, 'open', JSON.stringify(cp).slice(0, 600))
        assert.equal(cp.line.complete, true)
        assert.equal(cp.line.kind, 'checkpoint')
        assert.equal(cp.line.gen, a.gen, 'measured whole at the current generation')
        assert.ok(cp.line.regressions.some((r) => r.stage === 'light-desktop' && r.page === 'en-about' && r.new >= 1), JSON.stringify(cp.line.regressions))
        assert.match(cp.line.stop.reason, /first checkpoint/, 'the cut checkpoint never counted')
        assert.notEqual(cp.line.next, 'close-tier')

        const bye = await ask({ evidence, name, kind: 'stop' }, progress)
        assert.equal(bye.verdict, 'stopped')
        stopped = true
        const summary = await ctl
        assert.equal(summary.fixes, 3)
        assert.equal(lockHolder(evidence), null, 'the lock is released')
        const lines = ledgerOf(evidence).filter((l) => l.watch === name)
        // Until a checkpoint runs whole, the controller restarts it whenever it is idle, and the next fix
        // cuts it again: every cut one is on the ledger as incomplete, and only the last one counts.
        const rechecks = lines.filter((l) => l.kind === 'recheck')
        const checkpoints = lines.filter((l) => l.kind === 'checkpoint')
        assert.deepEqual(rechecks.map((l) => l.gen), [2, 3, 4])
        // every deploy of the loop was followed by the sweep, and its result rides on the ledger line that follows it
        assert.ok(rechecks.every((l) => l.sweep?.status === 'defects' && l.sweep.exit === 1 && l.sweep.defects === 2 && l.sweep.notMeasured === 1 && l.sweep.checks.join() === 'overflow,forms'), JSON.stringify(rechecks.map((l) => l.sweep)))
        assert.equal(fix.sweep.status, 'defects', 'the answer to a fix carries the sweep too')
        assert.deepEqual(checkpoints.filter((l) => l.complete).map((l) => l.run), [cp.line.run], 'one complete checkpoint, the last line')
        assert.equal(lines.at(-1).run, cp.line.run)
        assert.ok(checkpoints.filter((l) => !l.complete).every((l) => l.interrupted && l.next === 'full'), 'every cut checkpoint is incomplete and asks for a full one')
        assert.equal(lines[0].tierStart, true)
        assert.ok(lines.filter((l) => l.kind === 'recheck').every((l) => l.next !== 'close-tier' && l.scope.kind === 'targeted'))
      } finally {
        f.release()
        if (!stopped) {
          await ask({ evidence, name, kind: 'stop' }, () => '').catch(() => null)
          await ctl.catch(() => null)
        }
      }
    }))

  test('rolling: a shared template change is rechecked on the layout representative and the changed cluster, not every page; a regression on a deferred page is caught by the next checkpoint', () =>
    withSite(async (f) => {
      f.writeConfig('sampled.json', { evidence: 'ev-sampled', stages: ['light-desktop', 'dark-desktop'], tierConcurrency: 2, concurrency: 2, checkpointEvery: 5, checkpointReason: 'test: the fix-count schedule' })
      const evidence = path.join(f.root, 'ev-sampled')
      const name = 'sp1'
      const progress = progressOf(evidence, name, f)
      const extra = path.join(f.root, 'site', 'plugin', 'extra.css')
      const template = path.join(f.root, 'theme', 'templates', 'page.html')
      const ctl = runRound(['--config', path.join(f.root, 'sampled.json'), '--name', name, '--watch', '--skip-deploy', '--poll-ms', '100'])
      let stopped = false
      try {
        // checkpoint 0, whole: the team page's h1 finding is open in one cluster
        const cp0 = await ask({ evidence, name, kind: 'checkpoint' }, progressOf(evidence, name, f))
        assert.equal(cp0.line.complete, true, JSON.stringify(cp0).slice(0, 600))
        for (const s of ['light-desktop', 'dark-desktop']) {
          mkdirSync(path.join(cp0.line.out, s, 'notes'), { recursive: true })
          writeFileSync(path.join(cp0.line.out, s, 'notes', 'layout.md'), '# Layout lens\n')
        }
        const clusters = JSON.parse(readFileSync(path.join(cp0.line.out, 'light-desktop', 'clusters.json'), 'utf8')).clusters.filter((c) => c.status === 'open' && c.pages.includes('en-team'))
        assert.ok(clusters.length >= 1, 'the team finding is clustered')
        // the template every page is served by changes; outside the theme, the contact page regresses
        writeFileSync(template, '<!-- wp:post-content {"layout":{"type":"constrained"}} /-->')
        writeFileSync(extra, '.contact-only{font-size:30px}')
        const fix = await request({ evidence, name, kind: 'recheck', changed: ['templates/page.html'], clusters: clusters.map((c) => c.id), timeoutS: 120 })
        assert.equal(fix.scope.kind, 'targeted', JSON.stringify(fix).slice(0, 800))
        assert.equal(fix.scope.allAffected, true, 'every page is affected — and still a recheck, not a checkpoint')
        assert.deepEqual(fix.scope.affected, ['en-about', 'en-team', 'en-contact'])
        assert.deepEqual(fix.scope.pages, ['en-about', 'en-team'], 'the representative and the changed cluster')
        assert.deepEqual(fix.scope.deferred, ['en-contact'])
        assert.deepEqual(fix.deferred, ['en-contact'])
        assert.equal(fix.scope.clusters.used, true)
        assert.deepEqual(fix.scope.selection['en-about'], ['layout representative'])
        for (const s of ['light-desktop', 'dark-desktop']) assert.deepEqual(Object.keys(fix.pages[s]), ['en-about', 'en-team'], `${s}: the sample, on every tier`)
        assert.equal(fix.closesGate, false)
        const rc = ledgerOf(evidence).find((l) => l.run === fix.line.run)
        assert.deepEqual([rc.kind, rc.scope.deferred, rc.scope.pages], ['recheck', ['en-contact'], ['en-about', 'en-team']], 'the ledger says what was measured and what waits')
        assert.equal(isCompleteCheckpoint(rc, ['light-desktop', 'dark-desktop']), false, 'a sampled recheck is never checkpoint evidence')
        // the next checkpoint measures every page on every tier and finds the deferred page's regression
        const cp = await ask({ evidence, name, kind: 'checkpoint' }, progressOf(evidence, name, f))
        assert.equal(cp.line.complete, true)
        assert.ok(cp.line.regressions.some((r) => r.page === 'en-contact' && r.new >= 1), JSON.stringify(cp.line.regressions))
        assert.notEqual(cp.line.next, 'close-tier')
        const bye = await ask({ evidence, name, kind: 'stop' }, progress)
        assert.equal(bye.verdict, 'stopped')
        stopped = true
        await ctl
      } finally {
        if (!stopped) {
          await ask({ evidence, name, kind: 'stop' }, () => '').catch(() => null)
          await ctl.catch(() => null)
        }
      }
    }))
})

test('summarize keeps the verdict and counts per tier and points at the whole answer', () => {
  const pages = { desktop: { a: { findings: 2 }, b: { findings: 0 } }, mobile: { a: { findings: 0 } } }
  const s = summarize({ verdict: 'findings', next: 'fix', pages, deferred: ['x', 'y', 'z'], regressions: [] }, '/ev/s/requests/1.result.json')
  assert.deepEqual(s, { verdict: 'findings', next: 'fix', regressions: [], pages: { desktop: { pages: 2, withFindings: 1 }, mobile: { pages: 1, withFindings: 0 } }, deferred: 3, detail: '/ev/s/requests/1.result.json' })
})

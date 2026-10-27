// site-sweep.mjs: the pure judgements on fixtures, one real-browser test per check on small local pages served by
// the test (two servers: the "port" and the "source"), the exit codes of the command line, and the fix-measure it writes.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lazyBrowser } from '../lib/browser.mjs'
import { validateFixMeasure } from '../lib/fix-measure.mjs'
import { dossierPlan, fixChecks, readBaseline, runSweep, schemeStates, themeVersionOf, formatSummary } from '../visual/site-sweep.mjs'
import { summarise, summaryLines, MAX_LINES } from '../visual/site-sweep-summary.mjs'
import { applyAccept, validateSweepAccept } from '../visual/site-sweep-accept.mjs'
import { parseDecisions } from '../lib/parity-acceptance.mjs'
import { causeOf, exitCodeOf, groupDefects, judgeBackground, judgeChips, judgeHeader, judgeOverflow, judgeScheme, pairChips, parseColor, sameColor, sameInset, sameRadius, notDefectsForMeasure } from '../visual/site-sweep-judge.mjs'

const SWEEP = fileURLToPath(new URL('../visual/site-sweep.mjs', import.meta.url))
const browser = lazyBrowser()
const servers = []
const tmps = []
after(async () => {
  await browser.close()
  for (const s of servers) s.close()
  for (const t of tmps) rmSync(t, { recursive: true, force: true })
})
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'site-sweep-'))
  tmps.push(d)
  return d
}

// ---- pure parts -----------------------------------------------------------------------------------------------------

test('colours: parsed, equal within one channel step, and text that is no colour must match exactly', () => {
  assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1])
  assert.deepEqual(parseColor('rgba(1, 2, 3, 0.5)'), [1, 2, 3, 0.5])
  assert.equal(parseColor('red'), null)
  assert.ok(sameColor('rgb(10, 10, 10)', 'rgb(11, 10, 10)'))
  assert.ok(!sameColor('rgb(10, 10, 10)', 'rgb(13, 10, 10)'))
  assert.ok(sameColor('canvas', 'canvas'))
  assert.ok(!sameColor('canvas', 'rgb(255, 255, 255)'))
})

test('insets and radii: sub-pixel noise is equal, a pill is a pill at any radius', () => {
  assert.ok(sameInset([4, 8, 4, 8], [5, 8, 4, 9]))
  assert.ok(!sameInset([4, 8, 4, 8], [4, 20, 4, 20]))
  assert.ok(sameRadius('9999px', '50px', 28))
  assert.ok(!sameRadius('8px', '0px', 28))
})

test('overflow: the port past 1 px where the source is not is a defect with its culprit; both sides over is the source\'s fault', () => {
  const row = (s, p, culprit = null) => ({ route: '/a', width: 390, scheme: 'light', source: { over: s }, port: { over: p, culprit } })
  const j = judgeOverflow([row(0, 0), row(0, 1), row(0, 40, { selector: 'div.wide', right: 430 }), row(35, 40, { selector: 'div.wide' }), row(35, 300)])
  assert.equal(j.cases, 5)
  assert.equal(j.defects.length, 1)
  assert.equal(j.defects[0].culprit, 'div.wide')
  assert.deepEqual([j.defects[0].source, j.defects[0].port], [0, 40])
  assert.equal(j.notDefects.length, 2)
  assert.equal(j.notDefects[1].worse, true)
  const m = notDefectsForMeasure(j.notDefects)
  assert.equal(m.length, 1)
  assert.match(m[0].what, /2 case/)
})

test('background: both readings are compared, with the two values and the element that paints', () => {
  const side = (content, edge) => ({ bgContent: { color: content, at: 'main' }, bgEdge: { color: edge, at: 'body' } })
  const j = judgeBackground([{ route: '/a', width: 1440, scheme: 'dark', source: side('rgb(17, 21, 31)', 'rgb(17, 21, 31)'), port: side('rgb(248, 248, 255)', 'rgb(17, 21, 31)') }])
  assert.equal(j.cases, 1)
  assert.equal(j.defects.length, 1)
  assert.equal(j.defects[0].what, 'page-background (content)')
  assert.equal(j.defects[0].port, 'rgb(248, 248, 255)')
})

test('header: a height difference with the content at the same y is listed, not counted; a 404 source picture is not a defect; controls are paired by role', () => {
  const ctl = (left, role = 'logo') => ({ [role]: { left, right: left + 60, center: left + 30, width: 60, name: 'a.x', text: 'Home' } })
  const hd = (o) => ({ selector: 'header', height: 100, iw: 768, controls: ctl(20), contentTop: 100, broken: [], ...o })
  const row = (s, p) => ({ route: '/a', width: 768, scheme: 'light', source: { header: hd(s) }, port: { header: hd(p) } })
  const j = judgeHeader(
    [row({}, { height: 120, contentTop: 100 }), row({}, { height: 120, contentTop: 120 }), row({ broken: [{ src: 'http://s/x.png', how: 'did not load' }] }, { height: 60, contentTop: 60 }), row({}, { controls: ctl(29) }), row({}, { height: 101, controls: ctl(21) })],
    { fetchStatus: { 'http://s/x.png': 404 } }
  )
  assert.equal(j.cases, 5)
  assert.equal(j.listed.length, 1)
  assert.match(j.listed[0].why, /same y/)
  assert.deepEqual(j.defects.map((d) => d.what), ['header-height', 'header-logo-inset-left'])
  assert.equal(j.notDefects.length, 1)
  assert.match(j.notDefects[0].evidence, /x\.png → 404/)
  const withoutProof = judgeHeader([row({ broken: [{ src: 'http://s/x.png', how: 'did not load' }] }, { height: 60, contentTop: 60 })], { fetchStatus: { 'http://s/x.png': 200 } })
  assert.equal(withoutProof.defects.length, 1)
})

test('header: a menu button only the port has is a missing/extra control, never an inset of two different things; the same inset on N routes is one defect', () => {
  // `left` and `right` are the insets from the viewport's left and right edges, as the probe reports them
  const c = (o) => ({ left: 20, right: 80, center: 50, width: 60, name: 'x', text: 't', ...o })
  const hd = (controls) => ({ selector: 'header', height: 100, iw: 768, controls, contentTop: 100, broken: [] })
  // morgan-like: the source's first control is the logo at 24, the port's first control is a menu button at 344 — different things
  const sourceSide = hd({ logo: c({ left: 24, right: 100, center: 62 }) })
  const portSide = hd({ logo: c({ left: 24, right: 100, center: 62 }), 'menu-button': c({ left: 344, right: 380, center: 362 }) })
  const j = judgeHeader([{ route: '/a', width: 768, scheme: 'light', source: sourceSide, port: portSide }].map((r) => ({ ...r, source: { header: r.source }, port: { header: r.port } })))
  assert.deepEqual(j.defects.map((d) => [d.what, d.role]), [['header-control-extra', 'menu-button']])
  // the port's menu button is the source's unnamed button in the same place: not a difference
  const same = judgeHeader([{ route: '/a', width: 768, scheme: 'light', source: { header: { ...hd({}), places: [350] } }, port: { header: hd({ 'menu-button': c({ left: 330, right: 380, center: 355 }) }) } }])
  assert.deepEqual([same.defects.length, same.listed.length], [0, 1])
  // a call to action is paired by its words and measured from the edge it sits next to
  const cta = (right, center) => ({ ctas: [{ text: 'Subscribe', left: 600, right, center, width: 120, name: 'a.btn' }, { text: 'Other', left: 10, right: 10, center: 30, width: 40, name: 'a.btn' }] })
  const right = judgeHeader([{ route: '/a', width: 768, scheme: 'light', source: { header: { ...hd({}), ...cta(28, 670) } }, port: { header: { ...hd({}), ...cta(68, 630) } } }])
  assert.deepEqual([right.defects[0].what, right.defects[0].source, right.defects[0].port], ['header-cta-inset-right', 28, 68])
  // a search the source draws that the port's markup also mentions (but no control was recognised) is listed, not a defect
  const unsure = judgeHeader([{ route: '/a', width: 768, scheme: 'light', source: { header: hd({ search: c({}) }) }, port: { header: { ...hd({}), traces: { search: true } } } }])
  assert.deepEqual([unsure.defects.length, unsure.listed.length], [0, 1])
  // an icon control is read at its centre: the same icon in a bigger box on one side is the same place
  const icon = judgeHeader([{ route: '/a', width: 768, scheme: 'light', source: { header: hd({ search: c({ left: 700, right: 18, center: 725 }) }) }, port: { header: hd({ search: c({ left: 706, right: 22, center: 727 }) }) } }])
  assert.equal(icon.defects.length, 0)
  // 3 routes × 2 widths with the same inset difference = ONE defect with 6 occurrences
  const rows = []
  for (const route of ['/a', '/b', '/c']) for (const width of [1024, 1180]) rows.push({ route, width, scheme: 'light', source: { header: hd({ logo: c({ left: 18 }) }) }, port: { header: hd({ logo: c({ left: 26 }) }) } })
  const g = groupDefects(judgeHeader(rows).defects)
  assert.equal(g.length, 1)
  assert.equal(g[0].occurrences, 6)
  assert.deepEqual(g[0].routes, ['/a', '/b', '/c'])
  assert.deepEqual(g[0].widths, [1024, 1180])
})

test('background behind a picture or a translucent layer is listed, not counted; a header is measured to its bottom edge, wherever the markup puts the top bar', () => {
  const side = (color, solid) => ({ bgContent: { color, at: 'main', solid }, bgEdge: { color, at: 'section', solid } })
  const j = judgeBackground([{ route: '/a', width: 1440, scheme: 'light', source: side('rgb(255, 255, 255)', true), port: side('rgb(0, 0, 0)', false) }])
  assert.equal(j.defects.length, 0)
  assert.equal(j.listed.length, 2)
  const hd = (o) => ({ selector: 'header', height: 90, bottom: 130, controls: {}, contentTop: 130, broken: [], ...o })
  // the port's <header> holds a 40 px top bar the source keeps outside its <header>: 130 px both, not a 40 px defect
  const h = judgeHeader([{ route: '/a', width: 1440, scheme: 'light', source: { header: hd({}) }, port: { header: hd({ height: 130 }) } }])
  assert.equal(h.defects.length, 0)
  assert.equal(h.cases, 1)
})

test('chips: paired by section and order with no selector; the same text twice pairs in order; leftovers make the page not-measured', () => {
  const chip = (text, key, n, bg = 'rgb(1, 1, 1)') => ({ text, key, n, region: 'body', bg, color: 'rgb(255, 255, 255)', padding: '4px 8px', inset: [4, 8, 4, 8], radius: '4px', w: 60, h: 24, name: 'a' })
  const source = [chip('Health', 'First card title', 1), chip('Health', 'Second card title', 1), chip('Design', 'Second card title', 1)]
  const port = [chip('Health', 'First card title', 1), chip('Health', 'Second card title', 1, 'rgb(200, 0, 0)'), chip('Design', 'Second card title', 1)]
  const paired = pairChips(source, port)
  assert.equal(paired.pairs.length, 3)
  assert.equal(paired.unpairedSource.length + paired.unpairedPort.length, 0)
  const j = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: source }, port: { chips: port } }])
  assert.equal(j.defects.length, 1)
  assert.equal(j.defects[0].what, 'chip-background')
  assert.equal(j.pages[0].status, 'measured')
  // a chip only the port draws is a difference of its own kind, never "not measured"
  const extra = judgeChips([{ route: '/b', width: 1440, scheme: 'light', source: { chips: source }, port: { chips: [...port, chip('Rss', '', 1)] } }])
  assert.equal(extra.pages[0].status, 'measured')
  assert.equal(extra.notMeasured.length, 0)
  assert.deepEqual(extra.defects.filter((d) => d.what === 'chip-port-only').map((d) => [d.text, d.cause]), [['Rss', 'chip-port-only|body|rss']])
  // a page with no chip on either side has nothing to measure
  assert.equal(judgeChips([{ route: '/c', width: 1440, scheme: 'light', source: { chips: [] }, port: { chips: [] } }]).pages[0].status, 'none')
})

test('chips: only a sure pairing is measured; one defect per chip class and property with its occurrences; a size that differs by text metrics is listed', () => {
  const chip = (text, key, n, o = {}) => ({ text, key, n, region: 'body', bg: 'rgb(1, 1, 1)', color: 'rgb(255, 255, 255)', inset: [4, 8, 4, 8], radius: '4px', font: '12px', w: 60, h: 24, name: 'a.badge', ...o })
  // same text in another section is NOT paired by position: the page is not measured, nothing is called a defect
  const unsure = pairChips([chip('Health', 'Card one', 1), chip('Health', 'Card two', 1)], [chip('Health', 'Other heading', 1), chip('Health', 'Another heading', 1)])
  assert.equal(unsure.pairs.length, 0)
  assert.equal(unsure.unpairedSource.length, 2)
  // the text alone pairs only when it is the sole one of its kind on both sides
  assert.equal(pairChips([chip('Health', 'A', 1)], [chip('Health', 'B', 1)]).pairs.length, 1)
  const rows = []
  for (const route of ['/a', '/b']) for (const width of [390, 1440]) for (const scheme of ['light', 'dark']) rows.push({ route, width, scheme, source: { chips: [chip('Health', 'First card', 1), chip('Design', 'First card', 1)] }, port: { chips: [chip('Health', 'First card', 1, { bg: 'rgb(200, 0, 0)' }), chip('Design', 'First card', 1, { bg: 'rgb(0, 0, 200)' })] } })
  const j = judgeChips(rows)
  assert.equal(j.defects.length, 16)
  const g = groupDefects(j.defects)
  assert.equal(g.length, 1, 'one chip class, one property: one defect')
  assert.equal(g[0].occurrences, 16)
  assert.equal(g[0].values.length, 2)
  // 3 px wider from text metrics with padding, font, colours and radius equal: listed; 24 px wider: counted
  const size = (w) => judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('Health', 'K', 1)] }, port: { chips: [chip('Health', 'K', 1, { w })] } }])
  assert.equal(size(63).defects.length, 0)
  assert.equal(size(63).listed.length, 1)
  assert.equal(size(84).defects.length, 1)
  assert.equal(size(84).defects[0].what, 'chip-size')
  // letter-spacing is visible and is the cause of the width: one defect, not a size defect as well
  const spaced = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('Health', 'K', 1)] }, port: { chips: [chip('Health', 'K', 1, { letterSpacing: '1px', w: 84 })] } }])
  assert.deepEqual(spaced.defects.map((d) => d.what), ['chip-letter-spacing'])
  // the same words twice in one section, the same count on both sides: paired by order (the first differs, the second does not)
  const twice = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('New', 'K', 1), chip('New', 'K', 2)] }, port: { chips: [chip('New', 'K', 1, { bg: 'rgb(9, 9, 9)' }), chip('New', 'K', 2)] } }])
  assert.equal(twice.pages[0].status, 'measured')
  assert.deepEqual(twice.defects.map((d) => d.what), ['chip-background'])
})

test('scheme: judged by what is visible — a surface on the other side of the scheme is a defect, an attribute alone is listed, a source that does not take the saved switch is not compared', () => {
  const dark = 'rgb(17, 21, 31)'
  const light = 'rgb(248, 248, 255)'
  const surf = (bg, text) => ({ color: bg, solid: true, at: 'x', texts: [{ t: 'Same words', color: text, at: 'p' }] })
  const probe = (says, page, parts = {}) => ({ says, bgContent: { color: page, at: 'body', solid: true }, bgEdge: { color: page, at: 'body', solid: true }, surfaces: { header: surf(page, page === dark ? 'rgb(240, 240, 240)' : 'rgb(30, 30, 30)'), ...parts } })
  const lightText = 'rgb(240, 240, 240)'
  const row = (state, saved, source, port) => ({ route: '/a', state, sys: 'dark', saved, source, port })
  const j = judgeScheme([
    // attribute differs, every landmark identical: listed, not a defect
    row('os-dark/no-choice', 'none', probe('dark', dark), probe(null, dark)),
    // the real half-dark case: root unset, the page canvas is dark but the card kept its light surface
    row('os-dark/no-choice', 'none', probe('dark', dark, { card: surf('rgb(30, 36, 48)', lightText) }), probe(null, dark, { card: surf('rgb(255, 255, 255)', lightText) })),
    row('os-light/saved-dark', 'dark', probe('light', light), probe('dark', dark)),
    row('os-light/saved-dark', 'dark', probe('dark', dark), probe('light', light))
  ])
  assert.equal(j.listed.length, 1)
  assert.equal(j.listed[0].note, 'attribute differs, nothing visible differs')
  assert.deepEqual(j.defects.map((d) => d.what), ['card-surface-on-other-side', 'saved-choice-ignored'])
  assert.match(j.defects[0].rootNote, /root says nothing/)
  assert.equal(j.defects[0].landmark, 'card')
  assert.equal(j.unhonoured.length, 1)
  assert.match(j.unhonoured[0].reason, /does not take that switch/)
  // a landmark whose background is a picture is not compared; a text colour beyond the tolerance is
  const k = judgeScheme([row('os-light/no-choice', 'none', probe(null, light, { sidebar: surf(light, 'rgb(30, 30, 30)') }), probe(null, light, { sidebar: { ...surf('rgb(0, 0, 0)', 'rgb(120, 30, 30)'), solid: false } }))])
  assert.deepEqual(k.defects.map((d) => d.what), ['sidebar-text-colour'])
  // a landmark that shares no word with its namesake is not known to be the same part of the page: its surface is not compared either
  const strange = judgeScheme([row('os-dark/no-choice', 'none', probe('dark', dark, { footer: surf('rgb(29, 54, 119)', lightText) }), probe('dark', dark, { footer: { ...surf(dark, lightText), texts: [{ t: 'Other words', color: lightText, at: 'p' }] } }))])
  assert.deepEqual(strange.defects, [])
  // words only one side has are not a pair: the colour of the source's first words is not compared with the port's first words
  const other = judgeScheme([row('os-dark/no-choice', 'none', probe('dark', dark, { footer: surf(dark, 'rgb(33, 37, 41)') }), probe('dark', dark, { footer: { ...surf(dark, 'rgb(238, 241, 246)'), texts: [{ t: 'Other words', color: 'rgb(238, 241, 246)', at: 'p' }] } }))])
  assert.deepEqual(other.defects, [])
})

test('exit codes: a defect is 1, nothing found but something owed is 3, only a complete clean sweep is 0', () => {
  const clean = [{ id: 'overflow', defects: 0, notMeasured: 0 }]
  assert.equal(exitCodeOf(clean, []), 0)
  assert.equal(exitCodeOf(clean, [{ route: '/a', reason: 'unreachable' }]), 3)
  assert.equal(exitCodeOf([{ id: 'chips', defects: 0, notMeasured: 2 }], []), 3)
  assert.equal(exitCodeOf([{ id: 'chips', defects: 1, notMeasured: 2 }], [{ route: '/a' }]), 1)
})

const contract = (extra = {}) => ({
  design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tracy_theme' } } },
  source: { kind: 'live', darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light' },
  pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }],
  ...extra
})

test('the dossier gives the pairs and the switches: contract pages, hooksOf, states from the hooks', () => {
  const plan = dossierPlan({ contract: contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/old-a' }, { id: 'r', path: '/r', status: 301, sourceRoute: '/r' }, { id: 'n', path: '/missing', status: 404, sourceRoute: '/missing' }] }) })
  assert.deepEqual(plan.pages.map((p) => [p.path, p.sourceRoute]), [['/a', '/old-a'], ['/missing', '/missing']])
  assert.equal(plan.hooks.site.dark, 'cookie:tracy_theme=dark')
  assert.equal(plan.hooks.site.light, 'cookie:tracy_theme=light')
  assert.equal(plan.hooks.source.dark, 'attr:data-theme=dark')
  assert.equal(plan.hooks.source.light, 'attr:data-theme=light')
  assert.deepEqual(plan.marks.site, [{ kind: 'attr', name: 'data-theme', dark: 'dark', light: 'light' }])
  const states = schemeStates(plan.hooks)
  assert.equal(states.length, 6)
  assert.ok(states.every((s) => !s.unavailable))
  const noLight = schemeStates({ ...plan.hooks, source: { ...plan.hooks.source, light: null } })
  assert.equal(noLight.filter((s) => s.unavailable).length, 2)
  // a spec page-map is the fallback for the pages
  const fromMap = dossierPlan({ contract: null, config: { hook: { type: 'attribute', name: 'data-theme' } }, pageMap: { pages: [{ path: '/', view: 'front-page' }, { path: '/gone', status: 301 }] } })
  assert.deepEqual(fromMap.pages.map((p) => p.path), ['/'])
  assert.throws(() => dossierPlan({ contract: null, config: null, pageMap: { pages: [{ path: '/' }] } }), /no dark hook/)
})

test('reference.kind=none: overflow is measured on the target while its source comparison stays typed N/A', async () => {
  const port = await serve({
    '/edge': html('<main>ok</main><div style="position:absolute;left:0;top:40px;width:391px;height:2px"></div>'),
    '/wide': html('<main>ok</main><div style="position:absolute;left:0;top:40px;width:430px;height:2px"></div>')
  })
  const pages = ['/edge', '/wide'].map((route) => ({ id: route, path: route, status: 200, referenceKind: 'none', sourceRoute: null }))
  const plan = dossierPlan({ contract: contract({ pages }) })
  const report = await runSweep({ browser: await browser.get(), site: port.origin, source: null, plan, pairs: plan.pages.map((p) => ({ ...p, sourceUrl: null })), widths: [390], heightsWidths: [390], schemes: ['light'], only: ['overflow'], concurrency: 1, settleMs: 20, confirm: false })
  const overflow = check(report, 'overflow')
  assert.equal(report.owed.length, 0)
  assert.equal(overflow.cases, 2)
  assert.equal(overflow.defects, 1)
  assert.equal(overflow.pass, false)
  assert.equal(overflow.notApplicable, 2)
  assert.equal(overflow.status, 'fail')
  assert.deepEqual(report.applicability.outcomes.filter((x) => x.check === 'overflow').map((x) => x.status).sort(), ['fail', 'pass'])
  assert.equal(report.applicability.outcomes.filter((x) => x.check === 'sweep-overflow-comparison').length, 2)
})

test('reference.kind=none with an unread target probe is not mislabeled N/A', async () => {
  const port = await serve({ '/none': html('<main>target</main>') })
  const page = { id: '/none', path: '/none', status: 200, referenceKind: 'none', sourceRoute: null }
  const plan = dossierPlan({ contract: contract({ pages: [page] }) })
  const report = await runSweep({ browser: await browser.get(), site: port.origin, source: null, plan, pairs: plan.pages.map((p) => ({ ...p, sourceUrl: null })), widths: [390], heightsWidths: [390], schemes: ['light'], only: ['background'], concurrency: 1, deadlineAt: Date.now() - 1, settleMs: 20, confirm: false })
  const background = check(report, 'background')
  assert.equal(background.notApplicable, 1)
  assert.equal(background.notMeasured, 1)
  assert.equal(background.status, 'not-measured', JSON.stringify({ background, owed: report.owed, outcomes: report.applicability.outcomes }))
  assert.equal(background.pass, false)
})

test('reference.kind=none scheme target outcomes retain their scheduled width', async () => {
  const port = await serve({ '/none': html('<main>target</main>') })
  const page = { id: '/none', path: '/none', status: 200, referenceKind: 'none', sourceRoute: null }
  const plan = dossierPlan({ contract: contract({ pages: [page] }) })
  const report = await runSweep({ browser: await browser.get(), site: port.origin, source: null, plan, pairs: plan.pages.map((p) => ({ ...p, sourceUrl: null })), widths: [390], heightsWidths: [390], schemes: ['light'], only: ['scheme'], concurrency: 1, settleMs: 20, confirm: false })
  const outcomes = report.applicability.outcomes.filter((x) => x.check === 'scheme')
  assert.ok(outcomes.length > 0)
  assert.ok(outcomes.every((x) => x.width === 390), JSON.stringify(outcomes))
})

test('none CLI: an invalid configured source is never read, and the report records source fingerprint and cache as N/A', async () => {
  const port = await serve({ '/a': html('<main>target</main>') })
  const runRoot = tmp()
  const spec = tmp()
  writeFileSync(path.join(runRoot, 'visual.contract.json'), JSON.stringify(contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a', referenceKind: 'none', pagemapPath: '/a' }] })))
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages: [{ path: '/a', file: 'a.html' }] }))
  writeFileSync(path.join(spec, 'reference.json'), JSON.stringify({ kind: 'none' }))
  const out = tmp()
  const result = await cli(['--site', port.origin, '--source', 'http://127.0.0.1:1', '--run-root', runRoot, '--spec', spec, '--out', out, '--widths', '390', '--schemes', 'light', '--only', 'overflow', '--settle-ms', '20'])
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(readFileSync(path.join(out, 'site-sweep.json'), 'utf8'))
  assert.equal(report.source, null)
  assert.equal(report.sourceFingerprint, null)
  assert.deepEqual(report.sourceFingerprintApplicability, { status: 'not-applicable', reason: 'all renderable pages bind to reference.kind=none' })
  assert.match(report.sourceCache.bypass, /not-applicable/)
  assert.ok(report.applicability.outcomes.some((x) => x.check === 'sweep-overflow-comparison' && x.status === 'not-applicable'))
})

// a stored zip with one style.css and one deflated one
const zipOf = (members) => {
  const parts = []
  const central = []
  let offset = 0
  for (const [name, text, deflate] of members) {
    const data = Buffer.from(text)
    const body = deflate ? deflateRawSync(data) : data
    const nm = Buffer.from(name)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(deflate ? 8 : 0, 8)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(data.length, 22)
    lh.writeUInt16LE(nm.length, 26)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(deflate ? 8 : 0, 10)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(data.length, 24)
    ch.writeUInt16LE(nm.length, 28)
    ch.writeUInt32LE(offset, 42)
    central.push(ch, nm)
    parts.push(lh, nm, body)
    offset += 30 + nm.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(members.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end])
}

test('the theme version comes from style.css in the zip, stored or deflated; a baseline needs its version and the same checks', () => {
  for (const deflate of [false, true]) assert.equal(themeVersionOf(zipOf([['theme/readme.txt', 'x', false], ['theme/style.css', '/*\nTheme Name: T\nVersion: 1.0.5\n*/', deflate]])), '1.0.5')
  assert.equal(themeVersionOf(zipOf([['theme/a.txt', 'x', false]])), null)
  const dir = tmp()
  const doc = { schema: 'tracy-fix-measure/v1', ranAt: '2026-10-04T10:00:00.000Z', checks: [{ id: 'overflow', pass: false }, { id: 'header', pass: true }] }
  writeFileSync(path.join(dir, 'fix-measure.json'), JSON.stringify(doc))
  assert.throws(() => readBaseline(dir), /does not say which theme version/)
  const b = readBaseline(dir, '1.0.4')
  assert.deepEqual([b.version, b.passed, b.total], ['1.0.4', 1, 2])
  assert.throws(() => readBaseline(path.join(dir, 'nope.json'), '1.0.4'), /no such file/)
})

// ---- a real browser on small local pages -----------------------------------------------------------------------------

const serve = (routes) =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const r = routes[req.url.split('?')[0]]
      if (!r) {
        res.writeHead(404, { 'content-type': 'text/html' })
        return res.end('<!doctype html><title>404</title><body>not found')
      }
      res.writeHead(r.status ?? 200, { 'content-type': r.type ?? 'text/html' })
      res.end(r.body)
    })
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      resolve({ origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })
    })
  })

const html = (body, { css = '', script = '' } = {}) => ({ body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px/24px Arial;background:#fff}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>` })
// the source writes the scheme on the root from the system setting, as a T4 template does
const SOURCE_SCRIPT = "document.documentElement.setAttribute('data-theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')"
const DARK_CSS = '@media (prefers-color-scheme: dark){body{background:rgb(17,21,31)}}'

async function sweep({ port, source, only, widths = [390, 1024], schemes = ['light', 'dark'], pages, contractExtra, accept }) {
  const [p, s] = await Promise.all([serve(port), serve(source)])
  const routes = pages ?? Object.keys(port)
  const plan = dossierPlan({ contract: contract({ pages: routes.map((r) => ({ id: r, path: r, status: 200, sourceRoute: r })), ...contractExtra }) })
  const pairs = plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s.origin).href }))
  const b = await browser.get()
  return runSweep({ browser: b, site: p.origin, source: s.origin, plan, pairs, widths, schemes, only, concurrency: 2, settleMs: 50, statusOf: async (u) => (await fetch(u)).status, accept })
}
const check = (report, id) => report.checks.find((c) => c.id === id)

test('overflow (browser): found at 390 with its culprit; not found when the source overflows too, which is listed as the source\'s', async () => {
  const wide = '<div class="wide" style="width:620px;height:20px;background:#ccc">wide</div>'
  const base = '<main><p>text</p></main>'
  const report = await sweep({
    port: { '/over': html(base + wide), '/both': html(base + wide), '/fine': html(base) },
    source: { '/over': html(base), '/both': html(base + wide), '/fine': html(base) },
    only: ['overflow']
  })
  const c = check(report, 'overflow')
  assert.equal(c.cases, 3 * 2 * 2)
  const bad = report.defects.overflow
  assert.ok(bad.length > 0 && bad.every((d) => d.route === '/over' && d.width === 390), JSON.stringify(bad.map((d) => [d.route, d.width])))
  assert.equal(bad[0].culprit, 'div.wide')
  assert.ok(bad[0].port > 200 && bad[0].source <= 1)
  assert.ok(report.notDefectCases.some((n) => n.route === '/both'))
  assert.equal(report.exit, 1)
})

test('overflow (browser): a defect that appears only after the page is resized is not a defect a visitor sees; one that persists on a fresh load stays', async () => {
  // sized by script at load and never re-flowed: 900 px wide when loaded wide (fits at 1024), 20 px under the viewport when loaded narrow
  const scripted = html('<main><div id="w" style="height:10px;background:#ccc"></div></main>', { script: "document.getElementById('w').style.width=(innerWidth>600?900:innerWidth-20)+'px'" })
  const fixed = html('<main><div style="width:620px;height:10px;background:#ccc"></div></main>')
  const plain = html('<main><p>text</p></main>')
  const report = await sweep({ port: { '/resized': scripted, '/fixed': fixed }, source: { '/resized': plain, '/fixed': plain }, only: ['overflow'], widths: [390, 1024], schemes: ['light'] })
  assert.ok(report.defects.overflow.length > 0 && report.defects.overflow.every((d) => d.route === '/fixed'), JSON.stringify(report.defects.overflow.map((d) => [d.route, d.width])))
  assert.ok(report.listed.overflow.some((l) => l.route === '/resized' && /fresh load/.test(l.why)), JSON.stringify(report.listed.overflow))
  assert.deepEqual(report.confirmation.overflow, { kept: 1, demoted: 1 })
  // a demotion is never silent: the group, its cells, the cells measured again and the reason are in the report
  assert.equal(report.confirmationDemotions.length, 1)
  const [demoted] = report.confirmationDemotions
  assert.deepEqual([demoted.check, demoted.cells.every(([route]) => route === '/resized'), demoted.remeasured.length > 0], ['overflow', true, true])
  assert.match(demoted.reason, /does not reproduce on a fresh load \(\d+ cell\(s\) re-measured\)/)
  assert.match(formatSummary(report), /demoted by the fresh-load confirmation: `[^`]+` — \d+ row\(s\) on \d+ cell\(s\)/)
  assert.equal(check(report, 'overflow').defects, 1)
})

test('background (browser): the page background from the main content up, port against source, per scheme', async () => {
  const main = '<main><p>text</p></main>'
  const report = await sweep({
    port: { '/same': html(main, { css: DARK_CSS }), '/diff': html(main, { css: DARK_CSS + 'main{background:rgb(250,240,230)}' }) },
    source: { '/same': html(main, { css: DARK_CSS }), '/diff': html(main, { css: DARK_CSS }) },
    only: ['background'],
    widths: [1024]
  })
  const bad = report.defects.background
  assert.ok(bad.length > 0 && bad.every((d) => d.route === '/diff'))
  const light = bad.find((d) => d.scheme === 'light' && d.what.includes('content'))
  assert.equal(light.port, 'rgb(250, 240, 230)')
  assert.equal(light.source, 'rgb(255, 255, 255)')
  assert.equal(check(report, 'background').pass, false)
})

test('scheme (browser): attribute unset with nothing visible differing is listed; the real half-dark case (a surface keyed on the attribute stays light) is a defect; the saved states are honoured or named', async () => {
  const body = '<main><article class="card"><h2>Card title</h2><p>Some text in the card</p></article></main>'
  const portScript = "var c=document.cookie.match(/tracy_theme=(\\w+)/);if(c){document.documentElement.setAttribute('data-theme',c[1])}"
  const cardCss = '.card{height:120px;padding:10px;background:#fff;color:#111}html[data-theme=dark] .card{background:rgb(30,36,48);color:#eee}'
  // nothing keyed on the attribute: the root is unset on the port, every surface is the same, so nothing is visible
  const quiet = await sweep({
    port: { '/a': html(body, { css: DARK_CSS + '.card{height:120px;padding:10px;background:rgb(30,36,48)}@media (prefers-color-scheme: light){.card{background:#fff}}', script: portScript }) },
    source: { '/a': html(body, { css: DARK_CSS + '.card{height:120px;padding:10px;background:rgb(30,36,48)}@media (prefers-color-scheme: light){.card{background:#fff}}', script: SOURCE_SCRIPT }) },
    only: ['scheme'],
    widths: [1024]
  })
  assert.deepEqual(quiet.defects.scheme.filter((d) => d.what !== 'saved-choice-ignored'), [])
  assert.ok(quiet.listed.scheme.some((l) => l.state === 'os-dark/no-choice' && l.note === 'attribute differs, nothing visible differs'), JSON.stringify(quiet.listed.scheme))
  assert.equal(check(quiet, 'scheme').defects, 0)
  // the half-dark page: the canvas follows the system, the card is keyed on the attribute the port never wrote
  const half = await sweep({
    port: { '/a': html(body, { css: DARK_CSS + cardCss, script: portScript }) },
    source: { '/a': html(body, { css: DARK_CSS + cardCss, script: SOURCE_SCRIPT }) },
    only: ['scheme'],
    widths: [1024]
  })
  const bad = half.defects.scheme
  assert.ok(bad.some((d) => d.what === 'card-surface-on-other-side' && d.state === 'os-dark/no-choice' && /light/.test(d.port) && /dark/.test(d.source) && /says nothing/.test(d.rootNote)), JSON.stringify(bad))
  assert.equal(check(half, 'scheme').defects, half.groups.scheme.length)
  assert.ok(check(half, 'scheme').defects <= check(half, 'scheme').defectRows)
  // the source's own script overrides the saved switch, so those states are named and not compared
  const states = check(half, 'scheme').statesUnavailable
  assert.ok(states.length >= 1 && states.every((s) => /does not take that switch/.test(s.reason)))
  assert.ok(!bad.some((d) => d.what === 'saved-choice-ignored'), 'the port honours its saved cookie')
  assert.equal(half.exit, 1)
})

test('header (browser): height differing with the content at the same y is listed, a side margin is counted, a 404 source picture is the source\'s', async () => {
  const hdr = (h, pad, img = '') => `<header style="height:${h}px;box-sizing:border-box;padding:0 ${pad}px;background:#eee"><a href="/" class="logo" style="display:inline-block;margin-top:10px">Home</a>${img}</header><main style="margin-top:${150 - h}px"><h1>Title</h1></main>`
  const report = await sweep({
    // /listed: header 100 vs 120 but the h1 starts at 150 on both; /margin: same height, 8px more side margin; /pic: source picture 404
    port: { '/listed': html(hdr(120, 20)), '/margin': html(hdr(100, 28)), '/pic': html(hdr(60, 20)) },
    source: { '/listed': html(hdr(100, 20)), '/margin': html(hdr(100, 20)), '/pic': html(hdr(100, 20, '<img src="/missing.png" width="40" height="40" alt="logo">')) },
    only: ['header'],
    widths: [1024]
  })
  assert.ok(report.listed.header.some((l) => l.route === '/listed' && /same y/.test(l.why)))
  assert.ok(!report.defects.header.some((d) => d.route === '/listed'))
  assert.ok(report.defects.header.some((d) => d.route === '/margin' && d.what === 'header-logo-inset-left' && d.source === 20 && d.port === 28))
  assert.ok(!report.defects.header.some((d) => d.route === '/pic' && d.what === 'header-height'))
  assert.ok(report.notDefects.some((n) => /404/.test(n.why) && /missing\.png → 404/.test(n.evidence)))
  assert.match(formatSummary(report), /Listed, not counted/)
})

test('header (browser): a page that scrolls itself on load (an autofocused field below the fold) is measured from its top (ja-restaurant login pages)', async () => {
  // the source focuses its username field 1500px down, so the browser scrolls there on load: the header used to read -1400px high
  const page = (focus) => `<header style="height:100px;background:#eee"><a href="/" class="logo">Home</a></header><main><h1>Login</h1><div style="height:1500px"></div><form><input name="username" aria-label="Username" ${focus ? 'autofocus' : ''}></form><div style="height:1500px"></div></main>`
  const report = await sweep({
    port: { '/login': html(page(false)) },
    source: { '/login': html(page(true)) },
    only: ['header'],
    widths: [1024]
  })
  assert.deepEqual(report.defects.header.filter((d) => d.what === 'header-height'), [], JSON.stringify(report.defects.header))
})

test('chips (browser): chips pair by section and order without selectors; a wrong colour is found; chips that cannot be paired make the page not-measured', async () => {
  const chip = (t, bg) => `<a href="#" class="x" style="display:inline-block;padding:4px 10px;border-radius:12px;background:${bg};color:#fff;font-size:12px;line-height:16px">${t}</a>`
  const card = (title, chips) => `<article><h2>${title} of the card</h2>${chips}</article>`
  const page = (cards) => html(`<main>${cards}</main>`)
  const report = await sweep({
    port: {
      '/ok': page(card('First', chip('Health', 'rgb(0,100,0)')) + card('Second', chip('Design', 'rgb(0,0,100)'))),
      '/wrong': page(card('First', chip('Health', 'rgb(100,0,0)'))),
      '/odd': page(card('First', chip('Health', 'rgb(0,100,0)') + chip('Extra', 'rgb(5,5,5)'))),
      '/counts': page(card('First', chip('Health', 'rgb(0,100,0)') + chip('Health', 'rgb(0,100,0)') + chip('Health', 'rgb(0,100,0)')))
    },
    source: {
      '/ok': page(card('First', chip('Health', 'rgb(0,100,0)')) + card('Second', chip('Design', 'rgb(0,0,100)'))),
      '/wrong': page(card('First', chip('Health', 'rgb(0,100,0)'))),
      '/odd': page(card('First', chip('Health', 'rgb(0,100,0)'))),
      '/counts': page(card('First', chip('Health', 'rgb(0,100,0)') + chip('Health', 'rgb(0,100,0)')))
    },
    only: ['chips'],
    widths: [1024],
    schemes: ['light']
  })
  const pages = check(report, 'chips').pages
  assert.equal(pages.find((p) => p.route === '/ok').status, 'measured')
  // a chip only the port draws is a difference of its own kind; the same label a different number of times is not measured, with both counts
  assert.equal(pages.find((p) => p.route === '/odd').status, 'measured')
  assert.equal(pages.find((p) => p.route === '/counts').status, 'not-measured')
  assert.deepEqual(report.defects.chips.map((d) => [d.route, d.what, d.source]).sort(), [['/odd', 'chip-port-only', 'none'], ['/wrong', 'chip-background', 'rgb(0, 100, 0)']])
  assert.equal(check(report, 'chips').notMeasured, 1)
  const owed = report.notMeasured.chips[0]
  assert.equal(owed.route, '/counts')
  assert.equal(owed.causes[0].cause, 'repeated-label')
  assert.match(owed.causes[0].detail[0], /2 on the source, 3 on the port/)
  assert.equal(check(report, 'chips').notMeasuredCauses['repeated-label'].pages, 1)
  assert.equal(report.exit, 1)
})

test('a source route that answers a bare page (no stylesheet) is named as not a defect and takes the route out of every check', async () => {
  const [p, s] = await Promise.all([serve({ '/missing': { status: 404, body: '<!doctype html><html><head><meta charset="utf-8"><title>Themed 404</title><style>body{background:rgb(248,248,255)}</style></head><body><main>nope</main></body></html>' } }), serve({ '/missing': { status: 404, body: '<!doctype html><html><head><title>404 Not Found</title></head><body><h1>Not Found</h1></body></html>' } })])
  const plan = dossierPlan({ contract: contract({ pages: [{ id: 'm', path: '/missing', status: 404, sourceRoute: '/missing' }] }) })
  const pairs = plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s.origin).href }))
  const report = await runSweep({ browser: await browser.get(), site: p.origin, source: s.origin, plan, pairs, widths: [1024], schemes: ['light'], only: ['background', 'overflow'], concurrency: 1, settleMs: 50 })
  assert.deepEqual(report.defects.background, [])
  assert.equal(report.notDefects.length, 1)
  assert.match(report.notDefects[0].evidence, /404 Not Found.*no stylesheet/)
})

test('a clean sweep is 0 only when nothing is owed: an unreachable route makes it 3, never 0', async () => {
  const body = '<main><p>text</p></main>'
  const [p, s] = await Promise.all([serve({ '/a': html(body) }), serve({ '/a': html(body) })])
  const plan = dossierPlan({ contract: contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }, { id: 'b', path: '/gone', status: 200, sourceRoute: '/gone' }] }) })
  const pairs = plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s.origin).href }))
  const report = await runSweep({ browser: await browser.get(), site: p.origin, source: s.origin, plan, pairs, widths: [1024], schemes: ['light'], only: ['overflow', 'background'], concurrency: 2, settleMs: 50 })
  assert.equal(report.owed.length, 1)
  assert.equal(report.owed[0].route, '/gone')
  assert.equal(check(report, 'overflow').pass, false)
  assert.equal(report.exit, 3)
  const clean = await runSweep({ browser: await browser.get(), site: p.origin, source: s.origin, plan: { ...plan, pages: [plan.pages[0]] }, pairs: [pairs[0]], widths: [1024], schemes: ['light'], only: ['overflow', 'background'], concurrency: 2, settleMs: 50 })
  assert.equal(clean.exit, 0)
  // a deadline already passed owes every scheme, so the sweep cannot be 0
  const late = await runSweep({ browser: await browser.get(), site: p.origin, source: s.origin, plan: { ...plan, pages: [plan.pages[0]] }, pairs: [pairs[0]], widths: [1024], schemes: ['light'], only: ['overflow'], concurrency: 1, deadlineAt: Date.now() - 1, settleMs: 50 })
  assert.equal(late.exit, 3)
})

// ---- the command line -----------------------------------------------------------------------------------------------

// asynchronous on purpose: the pages are served by this process, which a blocking spawn would leave unable to answer
const cli = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [SWEEP, ...args])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    const timer = setTimeout(() => child.kill(), 240000)
    child.on('close', (status) => {
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    })
  })

test('command line: --explain reads one page at one width, prints the walk, exits by the page totals, and writes nothing', async () => {
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }, { id: 'b', path: '/b', status: 200, sourceRoute: '/b' }] })))
  // what a normal sweep would have left: its history and reports. The explain does not touch either.
  const sentinel = { 'site-sweep-state.json': 'not touched\n', 'summary.md': 'the summary\n' }
  for (const [n, t] of Object.entries(sentinel)) writeFileSync(path.join(dossier, n), t)
  const before = readdirSync(dossier).sort()
  const doc = (extra) => html(`<main><section><h2>Intro</h2><p>text</p></section>${extra}</main>`)
  const tall = '<section><h2>More</h2><div style="height:200px"></div></section>'
  const [p, s] = await Promise.all([serve({ '/a': doc(tall), '/b': doc('') }), serve({ '/a': doc(''), '/b': doc('') })])
  const base = ['--site', p.origin, '--source', s.origin, '--run-root', dossier, '--settle-ms', '50', '--only', 'heights']
  const a = await cli([...base, '--explain', '/a@1024'])
  assert.equal(a.status, 1, a.stderr + a.stdout)
  assert.match(a.stdout, /^explain \/a @1024: page height source \d+px, port \d+px, delta \+\d+px \(tolerance ±8px\) — the page totals differ/m)
  assert.match(a.stdout, /<== first block beyond the tolerance/)
  assert.match(a.stdout, /^first difference: block \d+ — /m)
  const b = await cli([...base, '--explain', '/b@1024'])
  assert.equal(b.status, 0, b.stderr + b.stdout)
  assert.match(b.stdout, /the page totals agree/)
  assert.match(b.stdout, /no block is beyond the tolerance/)
  // nothing was written: no new file, the history and the summary byte for byte
  assert.deepEqual(readdirSync(dossier).sort(), before)
  for (const [n, t] of Object.entries(sentinel)) assert.equal(readFileSync(path.join(dossier, n), 'utf8'), t)
  // input that is not a page at a width is a usage error (2), before any browser
  const bad = (extra) => cli([...base, ...extra])
  for (const extra of [['--explain', '/a'], ['--explain', '/a@12'], ['--explain', ''], ['--explain', '/nope@1024'], ['--explain', '/a@1024', '--out', tmp()], ['--explain', '/a@1024', '--zip', '/x.zip'], ['--explain', '/a@1024', '--baseline', '/x'], ['--explain', '/a@1024', '--pages', '/a'], ['--explain', '/a@1024', '--widths', '390'], ['--explain', '/a@1024', '--full']]) {
    const r = await bad(extra)
    assert.equal(r.status, 2, `${extra.join(' ')}: ${r.stderr}`)
  }
  const wrongOnly = await cli(['--site', p.origin, '--source', s.origin, '--run-root', dossier, '--only', 'overflow', '--explain', '/a@1024'])
  assert.equal(wrongOnly.status, 2)
  assert.match(wrongOnly.stderr, /--only heights --explain/)
  assert.equal((await cli(['--site', p.origin, '--source', s.origin, '--run-root', dossier, '--explain', '/a@1024'])).status, 2)
  // a source that does not answer is not measured (3), not a defect
  const dead = await cli(['--site', p.origin, '--source', 'http://127.0.0.1:1', '--run-root', dossier, '--settle-ms', '50', '--only', 'heights', '--explain', '/a@1024'])
  assert.equal(dead.status, 3, dead.stderr + dead.stdout)
  assert.match(dead.stdout, /not measured/)
  assert.deepEqual(readdirSync(dossier).sort(), before)
})

test('command line: --explain reaches the verdict of the sweep: sweep.accept rows of the dossier cover the cell (0, naming the accept key); an invalid row is refused before a browser (2)', async () => {
  const dossier = tmp()
  const pages = [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }]
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract({ pages })))
  writeFileSync(path.join(dossier, 'DECISIONS.md'), '- **D-7** · the port keeps the extra section by decision.\n')
  writeFileSync(path.join(dossier, 'shot.png'), 'x')
  const doc = (extra) => html(`<main><section><h2>Intro</h2><p>text</p></section>${extra}</main>`)
  const tall = '<section><h2>More</h2><div style="height:200px"></div></section>'
  const [p, s] = await Promise.all([serve({ '/a': doc(tall) }), serve({ '/a': doc('') })])
  const base = ['--site', p.origin, '--source', s.origin, '--run-root', dossier, '--settle-ms', '50', '--only', 'heights', '--explain', '/a@1024']
  const open = await cli(base)
  assert.equal(open.status, 1, open.stderr + open.stdout)
  // the causes the sweep itself reports for the cell
  const plan = dossierPlan({ contract: contract({ pages }), config: null, pageMap: null })
  const swept = await runSweep({ browser: await browser.get(), site: p.origin, source: s.origin, plan, pairs: plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s.origin).href })), widths: [1024], heightsWidths: [1024], schemes: ['light'], only: ['heights'], concurrency: 1, settleMs: 50, confirm: false })
  const causes = [...new Set(swept.defects.heights.map((d) => causeOf(d)))]
  assert.ok(causes.length > 0)
  const accept = causes.map((cause) => ({ check: 'heights', cause, routes: ['/a'], widths: [1024], kind: 'decided', decision: 'D-7', evidence: 'shot.png' }))
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept } }))
  const quiet = await cli(base)
  assert.equal(quiet.status, 0, quiet.stderr + quiet.stdout)
  assert.match(quiet.stdout, /quiet only because of sweep\.accept: /)
  assert.ok(causes.every((c) => quiet.stdout.includes(c)), quiet.stdout)
  assert.doesNotMatch(quiet.stdout, /<== first block beyond the tolerance/)
  // a row that also names a route the command did not measure stands by its part in this cell (0) and prints nothing of the rest; the sweep over both routes refuses the same row
  const broad = accept.map((r) => ({ ...r, routes: ['/a', '/b'] }))
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: broad } }))
  const wide = await cli(base)
  assert.equal(wide.status, 0, wide.stderr + wide.stdout)
  assert.doesNotMatch(wide.stdout, /\/b\b|not measured/)
  assert.deepEqual(readdirSync(dossier).sort(), ['DECISIONS.md', 'review.config.json', 'shot.png', 'visual.contract.json'])
  const twoPages = [...pages, { id: 'b', path: '/b', status: 200, sourceRoute: '/b' }]
  const [p2, s2] = await Promise.all([serve({ '/a': doc(tall), '/b': doc('') }), serve({ '/a': doc(''), '/b': doc('') })])
  const plan2 = dossierPlan({ contract: contract({ pages: twoPages }), config: null, pageMap: null })
  const full = await runSweep({ browser: await browser.get(), site: p2.origin, source: s2.origin, plan: plan2, pairs: plan2.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s2.origin).href })), widths: [1024], heightsWidths: [1024], schemes: ['light'], only: ['heights'], concurrency: 1, settleMs: 50, confirm: false, accept: { rows: broad, decisions: parseDecisions('- **D-7** · the port keeps the extra section by decision.\n'), runRoot: dossier } })
  assert.match(JSON.stringify(full.acceptErrors ?? full.accept ?? full), /names route \/b/)
  // a row that cites a decision the dossier does not have is refused the way the sweep refuses it
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept: accept.map((r) => ({ ...r, decision: 'D-99' })) } }))
  const bad = await cli(base)
  assert.equal(bad.status, 2, bad.stderr + bad.stdout)
  assert.match(bad.stderr, /D-99/)
})

test('command line: usage errors exit 2; a defect exits 1 and a clean sweep exits 0, both writing site-sweep.json and a fix-measure that validates', async () => {
  assert.equal((await cli([])).status, 2)
  assert.equal((await cli(['--site', 'http://127.0.0.1:1', '--source', 'http://127.0.0.1:1', '--run-root', '/nonexistent', '--out', tmp()])).status, 2)
  assert.equal((await cli(['--site', 'http://127.0.0.1:1', '--source', 'http://127.0.0.1:1', '--run-root', tmp(), '--out', tmp(), '--only', 'colours'])).status, 2)
  const body = '<main><p>text</p></main>'
  const wide = '<div style="width:700px;height:10px"></div>'
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }] })))
  const zip = path.join(tmp(), 'theme.zip')
  const zipBytes = zipOf([['t/style.css', 'Theme Name: T\nVersion: 2.0.1\n', true]])
  writeFileSync(zip, zipBytes)
  // one source for every run: a baseline is taken on the same source as the run it serves
  const source = await serve({ '/': html(body), '/a': html(body) })
  const run = async (portBody, extra = []) => {
    const p = await serve({ '/a': html(portBody) })
    const s = source
    const out = tmp()
    const r = await cli(['--site', p.origin, '--source', s.origin, '--run-root', dossier, '--out', out, '--widths', '390', '--schemes', 'light', '--only', 'overflow,background', '--zip', zip, '--settle-ms', '50', ...extra])
    return { r, out }
  }
  const bad = await run(body + wide)
  assert.equal(bad.r.status, 1, bad.r.stderr)
  const badFix = JSON.parse(readFileSync(path.join(bad.out, 'fix-measure.json'), 'utf8'))
  assert.deepEqual(validateFixMeasure(badFix), [])
  assert.equal(badFix.checks.find((c) => c.id === 'overflow').pass, false)
  assert.equal(badFix.artifact.themeZipSha256, createHash('sha256').update(zipBytes).digest('hex'))
  const ok = await run(body)
  assert.equal(ok.r.status, 0, ok.r.stderr)
  assert.ok(existsSync(path.join(ok.out, 'site-sweep.json')) && existsSync(path.join(ok.out, 'site-sweep.md')))
  const fix = JSON.parse(readFileSync(path.join(ok.out, 'fix-measure.json'), 'utf8'))
  assert.deepEqual(validateFixMeasure(fix), [])
  assert.deepEqual([fix.passed, fix.total, fix.baseline], [2, 2, null])
  // a normal run prints one line per check and the summary path, nothing per case
  assert.deepEqual(ok.r.stdout.trim().split('\n'), ['overflow: pass, 0 group(s), 1 case(s), 0 not measured', 'background: pass, 0 group(s), 1 case(s), 0 not measured', `summary: ${path.join(ok.out, 'summary.md')}`])
  assert.equal(JSON.parse(readFileSync(path.join(ok.out, 'summary.json'), 'utf8')).schema, 'tracy-site-sweep-summary/v1')
  assert.match(readFileSync(path.join(ok.out, 'summary.md'), 'utf8'), /## overflow — pass/)
  assert.match(bad.r.stdout, /overflow: fail, 1 group\(s\)/)
  assert.match(readFileSync(path.join(bad.out, 'summary.md'), 'utf8'), /DEFECT/)
  const verbose = await run(body, ['--verbose'])
  assert.match(verbose.r.stderr, /check overflow: .* in-page/)
  assert.match(verbose.r.stdout, /# Site sweep — /)
  // the failing run is the baseline of the passing one: same checks, the earlier version named
  const based = await run(body, ['--baseline', bad.out, '--baseline-version', '2.0.0'])
  assert.equal(based.r.status, 0, based.r.stderr)
  const withBase = JSON.parse(readFileSync(path.join(based.out, 'fix-measure.json'), 'utf8'))
  assert.deepEqual([withBase.baseline.version, withBase.baseline.passed, withBase.baseline.total], ['2.0.0', 1, 2])
  // the baseline is per check (release.mjs holds it by id), not counts only
  assert.deepEqual(withBase.baseline.checks.map((c) => c.id), ['overflow', 'background'])
  assert.equal(withBase.baseline.checks.filter((c) => c.pass).length, withBase.baseline.passed)
  assert.deepEqual(validateFixMeasure(withBase), [])
  assert.deepEqual(fixChecks(JSON.parse(readFileSync(path.join(ok.out, 'site-sweep.json'), 'utf8')).checks).map((c) => c.id), ['overflow', 'background'])
  assert.equal(withBase.baseline.sourceFingerprint.id, withBase.sourceFingerprint.id)
  assert.deepEqual(withBase.coverage.explicit.sort(), ['--only', '--schemes', '--widths'])
  // every option spelled out with the value of the full scope is still an explicit scope: the measure says so, and a patch release refuses it
  const spelled = tmp()
  const wholly = await cli(['--site', (await serve({ '/a': html(body) })).origin, '--source', source.origin, '--run-root', dossier, '--out', spelled, '--only', 'overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction,heights', '--pages', '/a', '--widths', '320,390,768,1024,1180,1440', '--schemes', 'light,dark', '--zip', zip, '--settle-ms', '50'])
  assert.ok(existsSync(path.join(spelled, 'fix-measure.json')), wholly.stderr)
  const spelledFix = JSON.parse(readFileSync(path.join(spelled, 'fix-measure.json'), 'utf8'))
  assert.deepEqual([spelledFix.coverage.mode, spelledFix.coverage.explicit], ['scoped', ['--only', '--pages', '--widths', '--schemes']])
  assert.deepEqual(spelledFix.coverage.checks, ['overflow', 'scheme', 'background', 'header', 'chips', 'fixed-widgets', 'icons', 'forms', 'text', 'first-interaction', 'heights'])
  // a baseline taken against another source (same shape, other server) is refused before any browser starts
  const other = await serve({ '/': html(body), '/a': html(body) })
  const foreign = await cli(['--site', (await serve({ '/a': html(body) })).origin, '--source', other.origin, '--run-root', dossier, '--out', tmp(), '--widths', '390', '--schemes', 'light', '--only', 'overflow,background', '--zip', zip, '--settle-ms', '50', '--baseline', bad.out, '--baseline-version', '2.0.0'])
  assert.equal(foreign.status, 2)
  assert.match(foreign.stderr, /was measured against another source/)
  // a route the source does not serve is owed: exit 3, not 0
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }, { id: 'g', path: '/gone', status: 200, sourceRoute: '/gone' }] })))
  const owed = await run(body)
  assert.equal(owed.r.status, 3, owed.r.stderr)
  assert.match(owed.r.stdout, /not measured/)
  assert.match(readFileSync(path.join(owed.out, 'summary.md'), 'utf8'), /## Not measured, by cause\n\n- \*\*owed: /)
  const owedVerbose = await run(body, ['--verbose'])
  assert.match(owedVerbose.r.stdout, /Owed and not measured/)
})

test('scheme (browser): a copy of the menu parked beside the viewport is not the header a person sees', async () => {
  const css = DARK_CSS + 'header{height:60px;background:#fff}header a{color:#111}.park{position:absolute;left:100%;top:0}.park a{color:#f00}'
  const src = '<header><a href="#">Home</a></header><main><p>Body</p></main>'
  const withParked = '<header><nav class="park"><a href="#">Home</a></nav><a href="#">Home</a></header><main><p>Body</p></main>'
  const r = await sweep({
    port: { '/a': html(withParked, { css, script: "document.documentElement.setAttribute('data-theme','light')" }) },
    source: { '/a': html(src, { css, script: "document.documentElement.setAttribute('data-theme','light')" }) },
    only: ['scheme'],
    widths: [1024],
    schemes: ['light']
  })
  assert.deepEqual(r.defects.scheme.filter((d) => /header-text/.test(d.what)), [], JSON.stringify(r.defects.scheme))
})

test('scheme (browser): a footer that paints nothing but is filled by a dark wrapper is dark, as the source whose footer paints itself', async () => {
  const css = 'footer{height:200px}.src{background:#111;color:#ccc}.fill{height:200px;background:#111;color:#ccc}'
  const body = (inner) => `<main><p>Body text here</p></main>${inner}`
  const r = await sweep({
    port: { '/a': html(body('<footer><div class="fill"><p>Footer words</p></div></footer>'), { css }) },
    source: { '/a': html(body('<footer class="src"><p>Footer words</p></footer>'), { css }) },
    only: ['scheme'],
    widths: [1024],
    schemes: ['light']
  })
  assert.deepEqual(r.defects.scheme.filter((d) => /footer-surface/.test(d.what)), [], JSON.stringify(r.defects.scheme))
})

test('scheme (browser): a word that stands twice in a landmark is not a pair, whichever copy each side lists first', async () => {
  const css = '.k{color:#a3e635}.g{color:#7f8b86}'
  const r = await sweep({
    port: { '/a': html('<main><p class="g">Field notes</p><p class="k">Field notes</p></main>', { css }) },
    source: { '/a': html('<main><p class="k">Field notes</p><p class="g">Field notes</p></main>', { css }) },
    only: ['scheme'],
    widths: [1024],
    schemes: ['light']
  })
  assert.deepEqual(r.defects.scheme.filter((d) => /text/.test(d.what)), [], JSON.stringify(r.defects.scheme))
})

test('background: an edge sample that fell in the footer on one side and in content on the other is listed, not counted', () => {
  const side = (edge, land) => ({ bgContent: { color: 'rgb(251, 252, 250)', at: 'main' }, bgEdge: { color: edge, at: 'x', land } })
  const j = judgeBackground([{ route: '/a', width: 1440, scheme: 'light', source: side('rgb(242, 245, 238)', 'footer'), port: side('rgb(251, 252, 250)', 'content') }])
  assert.equal(j.defects.length, 0)
  assert.equal(j.listed.length, 1)
  assert.match(j.listed[0].why, /footer on the source and in the content on the port/)
})

test('scheme: the same words in a different kind of element are not a pair; a page canvas sampled in the footer on one side only is not compared', () => {
  const probe = (tag, color, land) => ({ says: null, bgEdge: { color, solid: true, at: 'x', land }, surfaces: { card: { color: 'rgb(18, 22, 20)', solid: true, at: 'a', texts: [{ t: 'Field notes', tag, color, at: tag }] } } })
  const mk = (s, p) => [{ route: '/a', width: 1440, scheme: 'dark', state: 'os-dark/no-choice', saved: null, source: s, port: p }]
  const j = judgeScheme(mk(probe('span', 'rgb(163, 230, 53)', 'footer'), probe('h1', 'rgb(242, 245, 243)', 'content')))
  assert.deepEqual(j.defects, [], JSON.stringify(j.defects))
  const same = judgeScheme(mk(probe('span', 'rgb(163, 230, 53)', 'content'), probe('span', 'rgb(242, 245, 243)', 'content')))
  assert.ok(same.defects.some((d) => d.what === 'card-text-colour'))
})

test('scheme (browser): a wrapper that carries a sidebar layout class is not the sidebar; the narrow column is', async () => {
  const css = 'body{margin:0}.wrap{padding:20px}.col{float:right;width:200px;min-height:120px;padding:10px}aside.col{background:#f7f7f7}'
  const r = await sweep({
    port: { '/a': html('<div class="wrap"><aside class="col"><p>Side words</p></aside><main><p>Main words here</p></main></div>', { css }) },
    source: { '/a': html('<div class="wrap sidebar-left"><div class="col"><p>Side words</p></div><main><p>Main words here</p></main></div>', { css }) },
    only: ['scheme'],
    widths: [1024],
    schemes: ['light']
  })
  assert.ok(!r.defects.scheme.some((d) => /^sidebar/.test(d.what)), JSON.stringify(r.defects.scheme))
})

test('scheme (browser): a sidebar column taller than the card in it is judged by the card, as the source whose aside paints itself', async () => {
  const css = 'body{margin:0}main{float:left;width:600px;min-height:600px}.col{float:right;width:300px;min-height:600px}.card{background:#f7f7f7;height:200px;padding:10px}aside.card{min-height:0}'
  const r = await sweep({
    port: { '/a': html('<main><p>Main words here</p></main><aside class="card"><p>Side words</p></aside>', { css }) },
    source: { '/a': html('<main><p>Main words here</p></main><div class="col sidebar-r"><div class="card"><p>Side words</p></div></div>', { css }) },
    only: ['scheme'],
    widths: [1024],
    schemes: ['light']
  })
  assert.ok(!r.defects.scheme.some((d) => /^sidebar-surface/.test(d.what)), JSON.stringify(r.defects.scheme))
})

test('header: a source without its web font lists what depends on text width (height, controls after the menu) and still counts the edges', () => {
  const c = (o) => ({ left: 20, right: 80, center: 50, width: 60, name: 'x', text: 't', ...o })
  const hd = (height, controls) => ({ selector: 'header', height, iw: 1180, controls, contentTop: height + 10, broken: [] })
  const fonts = (body, loaded) => ({ body, loaded })
  const row = (srcFonts) => ({
    route: '/a',
    width: 1180,
    scheme: 'light',
    source: { fonts: srcFonts, header: hd(123, { logo: c({ left: 18, right: 900, center: 60 }), search: c({ left: 940, right: 190, center: 960 }) }) },
    port: { fonts: fonts('Jost', ['Jost']), header: hd(150, { logo: c({ left: 26, right: 900, center: 60 }), search: c({ left: 980, right: 150, center: 1000 }) }) }
  })
  const lacking = judgeHeader([row(fonts('Times', ['FontAwesome']))])
  assert.deepEqual(lacking.defects.map((d) => d.what), ['header-logo-inset-left'])
  assert.ok(lacking.listed.some((l) => l.what === 'header-height' && /system face/.test(l.why)))
  assert.ok(lacking.listed.some((l) => l.what === 'header-search-inset-right'))
  const loaded = judgeHeader([row(fonts('Jost', ['Jost']))])
  assert.deepEqual(loaded.defects.map((d) => d.what).sort(), ['header-height', 'header-logo-inset-left', 'header-search-inset-right'])
})

// ---- gaps found on real releases: recording the source's faults, not-measured causes, labels, header ------------------------

const DECISIONS = `# Decisions

- **D-7** · the source keeps a light badge on its dark page; the port draws it dark (key span.badge).
- **D-8** · the source's header breaks at 320 px.
- **D-9** · first copy.
- **D-9** · second copy, the same id.
`
const decisionsOf = () => parseDecisions(DECISIONS)
const evidenceDir = () => {
  const d = tmp()
  writeFileSync(path.join(d, 'shot.png'), 'x')
  return d
}
const defectRow = (o) => ({ route: '/a', width: 1440, scheme: 'dark', what: 'chip-background', source: 'rgb(242, 243, 247)', port: 'rgb(20, 25, 39)', culprit: 'span.badge', cause: 'chip-background|span.badge', ...o })
const rowOf = (dir, o = {}) => ({ check: 'chips', cause: 'chip-background|span.badge', routes: ['/a'], decision: 'D-7', evidence: 'shot.png', kind: 'source-fault', ...o })

test('accept rows: every refusal is named — wildcard routes, no routes, a missing, duplicated or two decisions, no evidence, an unknown kind', () => {
  const dir = evidenceDir()
  const errs = (o) => validateSweepAccept([rowOf(dir, o)], { decisions: decisionsOf(), runRoot: dir })
  assert.deepEqual(errs({}), [])
  assert.match(errs({ routes: ['/*'] }).join('\n'), /wildcard/)
  assert.match(errs({ routes: undefined }).join('\n'), /routes is omitted/)
  assert.match(errs({ routes: ['/a?s=*'] }).join('\n'), /wildcard/)
  assert.deepEqual(errs({ routes: ['/?s=zqxwv', '/a'] }), [], 'a search page is an exact route with its query')
  assert.match(errs({ routes: [] }).join('\n'), /non-empty/)
  assert.match(errs({ decision: 'D-99' }).join('\n'), /does not exist/)
  assert.match(errs({ decision: 'D-9' }).join('\n'), /defined more than once/)
  assert.match(errs({ decision: 'D-7 and D-8' }).join('\n'), /exactly one decision id/)
  assert.match(errs({ decision: undefined }).join('\n'), /exactly one decision id/)
  assert.match(errs({ key: 'words the decision never says' }).join('\n'), /does not mention/)
  assert.deepEqual(errs({ key: 'span.badge' }), [])
  assert.match(errs({ evidence: undefined }).join('\n'), /needs evidence/)
  assert.match(errs({ evidence: 'gone.png' }).join('\n'), /does not exist/)
  assert.deepEqual(errs({ evidence: 'https://example.test/shot.png' }), [])
  assert.match(errs({ kind: 'whatever' }).join('\n'), /kind must be/)
  assert.match(errs({ check: 'colours' }).join('\n'), /check must be one of/)
  assert.match(errs({ cause: '' }).join('\n'), /cause key/)
  assert.match(validateSweepAccept([rowOf(dir)], { decisions: null, runRoot: dir }).join('\n'), /no decisions were given/)
})

test('accept rows: a group moves to notDefects with its decision and evidence; a stale row, a row naming a route the group is not on, and a defect row two rows cover are errors', () => {
  const judged = () => ({ chips: { cases: 4, defects: [defectRow({ route: '/a' }), defectRow({ route: '/b', width: 390 }), defectRow({ route: '/c', cause: 'chip-radius|a.x', what: 'chip-radius' })], listed: [], notDefects: [], notMeasured: [] } })
  const scope = { routes: ['/a', '/b', '/c'], widths: [390, 1440] }
  const ok = judged()
  const r = applyAccept(ok, [rowOf(null, { routes: ['/a', '/b'] })], scope)
  assert.deepEqual(r.errors, [])
  assert.equal(r.accepted.length, 1)
  assert.deepEqual([r.accepted[0].decision, r.accepted[0].occurrences, r.accepted[0].routes], ['D-7', 2, ['/a', '/b']])
  assert.deepEqual(ok.chips.defects.map((d) => d.route), ['/c'])
  assert.deepEqual([ok.chips.notDefects.length, ok.chips.notDefects[0].decision, ok.chips.notDefects[0].evidence, ok.chips.notDefects[0].kind], [2, 'D-7', 'shot.png', 'source-fault'])
  // narrower by width: only that width moves, the other row of the cause stays a defect
  const narrow = judged()
  assert.deepEqual(applyAccept(narrow, [rowOf(null, { routes: ['/a'], widths: [1440] })], scope).errors, [])
  assert.deepEqual(narrow.chips.defects.map((d) => d.route), ['/b', '/c'])
  // stale: the cause is not a defect any more
  const stale = applyAccept(judged(), [rowOf(null, { cause: 'chip-background|span.gone' })], scope)
  assert.equal(stale.errors.length, 1)
  assert.match(stale.errors[0].message, /stale exception/)
  assert.match(stale.errors[0].message, /chip-background\|span\.badge/)
  // a route, a width, a scheme the group does not occur on
  assert.match(applyAccept(judged(), [rowOf(null, { routes: ['/a', '/c'] })], scope).errors[0].message, /route \/c where the group does not occur/)
  assert.match(applyAccept(judged(), [rowOf(null, { routes: ['/a'], widths: [390] })], scope).errors[0].message, /width 390 where the group does not occur/)
  assert.match(applyAccept(judged(), [rowOf(null, { routes: ['/a'], schemes: ['light'] })], scope).errors[0].message, /scheme light/)
  const unchanged = judged()
  applyAccept(unchanged, [rowOf(null, { routes: ['/a', '/c'] })], scope)
  assert.equal(unchanged.chips.defects.length, 3, 'a refused row moves nothing')
  // a group is matched to at most one row
  const twice = applyAccept(judged(), [rowOf(null, { routes: ['/a'] }), rowOf(null, { routes: ['/a', '/b'], decision: 'D-8' })], scope)
  assert.equal(twice.accepted.length, 1)
  assert.match(twice.errors[0].message, /matched to at most one row/)
  // a row for a check that did not run, or for routes that were not part of this run, is skipped, not stale
  const skip = applyAccept(judged(), [rowOf(null, { check: 'header' }), rowOf(null, { routes: ['/zzz'] })], scope)
  assert.deepEqual([skip.errors.length, skip.skipped.length], [0, 2])
  // a chip only the port draws is accepted by its label, as any other group
  const portOnly = { chips: { cases: 1, defects: [defectRow({ what: 'chip-port-only', cause: 'chip-port-only|body|facebook', source: 'none', port: '36×36px', culprit: 'a.je-share__facebook' })], listed: [], notDefects: [], notMeasured: [] } }
  assert.deepEqual(applyAccept(portOnly, [rowOf(null, { cause: 'chip-port-only|body|facebook', kind: 'decided' })], scope).errors, [])
  assert.equal(portOnly.chips.defects.length, 0)
  // the fix-measure carries the decision and the evidence, and validates
  const m = notDefectsForMeasure(ok.chips.notDefects)
  assert.equal(m.length, 1)
  assert.match(m[0].why, /source-fault under D-7/)
  assert.equal(m[0].evidence, 'shot.png')
})

test('accept (browser): an accepted source fault no longer fails the check and is written to notDefects; a stale row is an error and fails it', async () => {
  const dir = evidenceDir()
  const chip = (bg) => `<span class="badge" style="display:inline-block;padding:4px 10px;border-radius:12px;background:${bg};color:#fff;font-size:12px;line-height:16px">Hits</span>`
  const page = (bg) => html(`<main><section><h2>Section heading text</h2>${chip(bg)}</section></main>`)
  const run = async (rows) =>
    sweep({ port: { '/a': page('rgb(20,25,39)') }, source: { '/a': page('rgb(242,243,247)') }, only: ['chips'], widths: [1024], schemes: ['light'], accept: { rows, decisions: decisionsOf(), runRoot: dir } })
  const before = await run([])
  assert.equal(check(before, 'chips').pass, false)
  const cause = before.groups.chips[0].cause
  assert.match(cause, /^chip-background\|span\.badge/)
  assert.match(formatSummary(before), new RegExp(`cause \`${cause.replace(/[|.]/g, '\\$&')}\``))
  const accepted = await run([{ check: 'chips', cause, routes: ['/a'], decision: 'D-7', evidence: 'shot.png', kind: 'source-fault' }])
  assert.deepEqual(accepted.defects.chips, [])
  assert.equal(check(accepted, 'chips').pass, true)
  assert.equal(check(accepted, 'chips').accepted, 1)
  assert.equal(accepted.exit, 0)
  assert.equal(accepted.accepted[0].decision, 'D-7')
  assert.ok(accepted.notDefects.some((n) => /D-7/.test(n.why) && n.evidence === 'shot.png'))
  assert.deepEqual(validateFixMeasure({ schema: 'tracy-fix-measure/v1', tool: 't', ranAt: '2026-10-04T10:00:00.000Z', site: 'http://x.test', source: 's', artifact: { themeZipSha256: 'a'.repeat(64) }, checks: fixChecks(accepted.checks), passed: 1, total: 1, baseline: null, notDefects: accepted.notDefects }), [])
  assert.match(formatSummary(accepted), /Accepted by the dossier/)
  const stale = await run([{ check: 'chips', cause: 'chip-background|span.other', routes: ['/a'], decision: 'D-7', evidence: 'shot.png', kind: 'decided' }])
  assert.equal(check(stale, 'chips').pass, false)
  assert.equal(stale.acceptErrors.length, 1)
  assert.equal(stale.exit, 1)
  assert.match(formatSummary(stale), /ERROR/)
  // a row that is refused before the browser starts
  await assert.rejects(run([{ check: 'chips', cause, routes: ['/*'], decision: 'D-7', evidence: 'shot.png', kind: 'decided' }]), /wildcard/)
})

test('command line: the default run is all eleven checks; --only narrows it; a baseline of five or of ten checks against the eleven is refused with the fix named', async () => {
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }] })))
  const zip = path.join(tmp(), 'theme.zip')
  writeFileSync(zip, zipOf([['t/style.css', 'Theme Name: T\nVersion: 2.0.1\n', true]]))
  const page = html('<main><p>text</p></main>')
  const [p, s] = await Promise.all([serve({ '/a': page }), serve({ '/': page, '/a': page })])
  const base = ['--site', p.origin, '--source', s.origin, '--run-root', dossier, '--widths', '390', '--schemes', 'light', '--zip', zip, '--settle-ms', '50']
  // a five-check run, the baseline of the next
  const five = tmp()
  const old = await cli([...base, '--out', five, '--only', 'overflow,scheme,background,header,chips'])
  assert.ok(existsSync(path.join(five, 'site-sweep.json')), old.stderr)
  // the default run names all eleven checks; with a five-check baseline it is refused before any browser starts, and the message says how to fix it
  const refused = await cli([...base, '--out', tmp(), '--baseline', five, '--baseline-version', '2.0.0'])
  assert.equal(refused.status, 2)
  assert.match(refused.stderr, /--baseline ran 5 check\(s\) \(overflow,scheme,background,header,chips\), this run 11 \(overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction,heights\): not the same checks\. The default run is all eleven checks/)
  assert.match(refused.stderr, /--only overflow,scheme,background,header,chips/)
  // a baseline from before `heights` (ten checks) against the default run: refused, with the three ways out named
  const TEN = 'overflow,scheme,background,header,chips,fixed-widgets,icons,forms,text,first-interaction'
  const ten = tmp()
  const oldTen = await cli([...base, '--out', ten, '--only', TEN])
  assert.ok(existsSync(path.join(ten, 'site-sweep.json')), oldTen.stderr)
  const refusedTen = await cli([...base, '--out', tmp(), '--baseline', ten, '--baseline-version', '2.0.0'])
  assert.equal(refusedTen.status, 2)
  assert.match(refusedTen.stderr, /--baseline ran 10 check\(s\)/)
  assert.match(refusedTen.stderr, /from before the heights check existed/)
  assert.match(refusedTen.stderr, /run the baseline again with the same zip so that it runs all eleven/)
  assert.match(refusedTen.stderr, /--new heights=/)
  // --only still narrows the run, and the same five against the same five is accepted
  const narrow = await cli([...base, '--out', tmp(), '--only', 'overflow,scheme,background,header,chips', '--baseline', five, '--baseline-version', '2.0.0'])
  assert.notEqual(narrow.status, 2, narrow.stderr)
  // no --only: every check runs
  const all = tmp()
  await cli([...base, '--out', all])
  assert.deepEqual(JSON.parse(readFileSync(path.join(all, 'site-sweep.json'), 'utf8')).only, ['overflow', 'scheme', 'background', 'header', 'chips', 'fixed-widgets', 'icons', 'forms', 'text', 'first-interaction', 'heights'])
})

test('command line: sweep.accept without the dossier\'s DECISIONS.md, or citing a decision that is not there, is a usage error (exit 2)', async () => {
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract({ pages: [{ id: 'a', path: '/a', status: 200, sourceRoute: '/a' }] })))
  writeFileSync(path.join(dossier, 'shot.png'), 'x')
  const accept = [{ check: 'overflow', cause: 'page-overflow|div', routes: ['/a'], decision: 'D-7', evidence: 'shot.png', kind: 'decided' }]
  writeFileSync(path.join(dossier, 'review.config.json'), JSON.stringify({ sweep: { accept } }))
  const args = ['--site', 'http://127.0.0.1:1', '--source', 'http://127.0.0.1:1', '--run-root', dossier, '--out', tmp(), '--only', 'overflow']
  const none = await cli(args)
  assert.equal(none.status, 2)
  assert.match(none.stderr, /needs the dossier's DECISIONS\.md/)
  writeFileSync(path.join(dossier, 'DECISIONS.md'), '- **D-1** · something else\n')
  const missing = await cli(args)
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /decision D-7 does not exist/)
})

test('chips: the same label a different number of times is not measured, with both counts; a label only one side has is a difference of its own kind; a box nobody sees is no chip', () => {
  const chip = (text, key, o = {}) => ({ text, key, region: 'body', bg: 'rgb(1, 1, 1)', color: 'rgb(255, 255, 255)', inset: [4, 8, 4, 8], radius: '4px', font: '12px', w: 60, h: 24, name: 'a.badge', ...o })
  const diff = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('New', 'K'), chip('New', 'K')] }, port: { chips: [chip('New', 'K'), chip('New', 'K'), chip('New', 'K')] } }])
  assert.equal(diff.pages[0].status, 'not-measured')
  assert.equal(diff.notMeasured[0].causes[0].cause, 'repeated-label')
  assert.match(diff.notMeasured[0].causes[0].detail[0], /2 on the source, 3 on the port/)
  assert.deepEqual(diff.defects, [])
  // the same label under another heading: not sure, named as such
  const section = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('Health', 'One'), chip('Health', 'Two')] }, port: { chips: [chip('Health', 'Three'), chip('Health', 'Four')] } }])
  assert.equal(section.notMeasured[0].causes[0].cause, 'no-counterpart-section')
  // an apostrophe typed differently in the section heading does not unpair the same chip
  assert.equal(pairChips([chip('Health', "Nature's Intricacy")], [chip('Health', 'Nature’s Intricacy')]).pairs.length, 1)
  // nested painted boxes of different sizes are named, not guessed
  const nested = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('Home', 'K')] }, port: { chips: [chip('Home', 'K', { nested: true, w: 90 }), chip('Home', 'K', { nested: true })] } }])
  assert.ok(nested.notMeasured[0].causes.some((c) => c.cause === 'nested-painted-boxes'))
  // a 0×0 anchor is not a chip on either side
  const hidden = judgeChips([{ route: '/a', width: 390, scheme: 'light', source: { chips: [chip('Share', 'K', { w: 0, h: 0 })] }, port: { chips: [] } }])
  assert.equal(hidden.pages[0].status, 'none')
  // port-only: its own group per label, groupable and acceptable through a decision
  const only = judgeChips([{ route: '/a', width: 390, scheme: 'light', source: { chips: [] }, port: { chips: [chip('Facebook', 'K', { name: 'a.je-share__facebook' })] } }])
  assert.deepEqual(only.defects.map((d) => [d.what, d.cause]), [['chip-port-only', 'chip-port-only|body|facebook']])
  assert.equal(only.notMeasured.length, 0)
})

test('chips: a size difference is text metrics only when the height is the same and the width differs by the text\'s own width', () => {
  const chip = (o) => ({ text: 'Health', key: 'K', region: 'body', bg: 'rgb(1, 1, 1)', color: 'rgb(255, 255, 255)', inset: [4, 8, 4, 8], radius: '4px', font: '12px', w: 126.1, h: 30, textW: 90, name: 'a.badge', ...o })
  const size = (a, b) => judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip(a)] }, port: { chips: [chip(b)] } }])
  // the real case: 126.1×30 against 126.1×33.4 — same width, another height
  const height = size({}, { h: 33.4 })
  assert.deepEqual(height.defects.map((d) => [d.what, d.source, d.port]), [['chip-size', '126.1×30px', '126.1×33.4px']])
  assert.equal(height.listed.length, 0)
  // 6 px wider and the text is 6 px wider: the text
  const wide = size({}, { w: 132.1, textW: 96 })
  assert.deepEqual([wide.defects.length, wide.listed.length], [0, 1])
  assert.match(wide.listed[0].why, /height equal and the width differs with the text/)
  // 6 px wider and the text the same width: padding, a defect
  assert.equal(size({}, { w: 132.1 }).defects.length, 1)
})

test('chips (browser): a heading drawn as a pill is a chip with no selector; a painted li around a painted a is one chip; a repeated label pairs by order', async () => {
  const pill = 'display:inline-block;padding:4px 10px;border-radius:12px;color:#fff;font-size:12px;line-height:16px;margin:0'
  const heading = (t, bg) => `<h3 style="${pill};background:${bg}">${t}</h3>`
  const tagLi = (t, bg) => `<li style="${pill};background:${bg};list-style:none;padding:0"><a href="#" style="display:inline-block;padding:4px 10px;border-radius:12px;background:${bg};color:#fff">${t}</a></li>`
  const tagA = (t, bg) => `<a href="#" style="${pill};background:${bg}">${t}</a>`
  const sec = (inner) => `<section><h2>Section heading text</h2>${inner}</section>`
  const page = (inner) => html(`<main>${sec(inner)}</main>`)
  const report = await sweep({
    port: {
      '/pill': page(heading('Pill', 'rgb(100,0,0)')),
      '/nest': page('<ul style="margin:0;padding:0">' + tagA('Lifestyle', 'rgb(0,0,100)') + '</ul>'),
      '/rep': page(tagA('New', 'rgb(0,100,0)') + tagA('New', 'rgb(100,0,0)') + tagA('New', 'rgb(0,100,0)'))
    },
    source: {
      '/pill': page(heading('Pill', 'rgb(0,100,0)')),
      '/nest': page('<ul style="margin:0;padding:0">' + tagLi('Lifestyle', 'rgb(0,0,100)') + '</ul>'),
      '/rep': page(tagA('New', 'rgb(0,100,0)') + tagA('New', 'rgb(0,100,0)') + tagA('New', 'rgb(0,100,0)'))
    },
    only: ['chips'],
    widths: [1024],
    schemes: ['light']
  })
  const pages = check(report, 'chips').pages
  assert.deepEqual(pages.map((p) => [p.route, p.status, p.source, p.port]).sort(), [['/nest', 'measured', 1, 1], ['/pill', 'measured', 1, 1], ['/rep', 'measured', 3, 3]])
  const d = report.defects.chips.map((x) => [x.route, x.what, x.source, x.port]).sort()
  assert.deepEqual(d, [['/pill', 'chip-background', 'rgb(0, 100, 0)', 'rgb(100, 0, 0)'], ['/rep', 'chip-background', 'rgb(0, 100, 0)', 'rgb(100, 0, 0)']])
  assert.equal(check(report, 'chips').notMeasured, 0)
})

test('header: a control whose picture answers 404 on the source has its inset listed as the source\'s, as its height is; other controls stay counted', () => {
  const c = (o) => ({ left: 20, right: 80, center: 50, width: 60, name: 'x', text: 't', ...o })
  const hd = (controls, extra = {}) => ({ selector: 'header', height: 100, iw: 1024, controls, contentTop: 100, broken: [], ...extra })
  const broken = [{ src: 'http://s/dark.png', how: 'swapped by content:url()', control: 'a.brand' }]
  const row = (s, p) => ({ route: '/home-4', width: 1024, scheme: 'dark', source: { header: s }, port: { header: p } })
  const j = judgeHeader([row(hd({ logo: c({ left: 18, right: 600, center: 700, name: 'a.brand' }), search: c({ left: 900, center: 920, name: 'button.search' }) }, { broken }), hd({ logo: c({ left: 18, right: 400, center: 500, name: 'a.brand' }), search: c({ left: 800, center: 820, name: 'button.search' }) }))], { fetchStatus: { 'http://s/dark.png': 404 } })
  assert.deepEqual(j.defects.map((d) => d.what), ['header-search-inset-right'])
  assert.deepEqual(j.notDefects.map((d) => [d.what, d.why]), [['header-logo-inset-right', 'the source header picture answers 404']])
  assert.match(j.notDefects[0].evidence, /dark\.png → 404/)
  // and the fix-measure says so: one entry for the inset, with the file and its answer
  const m = notDefectsForMeasure(j.notDefects)
  assert.equal(m.length, 1)
  assert.match(m[0].what, /^header-logo-inset-right differs on 1 case/)
  assert.match(m[0].evidence, /dark\.png → 404/)
})

test('header: an unnamed icon-only control (the three-bar button) is the menu control, never "extra"; the site name and header words are compared in size, weight, spacing and case', () => {
  const c = (o) => ({ left: 20, right: 80, center: 50, width: 60, name: 'x', text: 't', ...o })
  const hd = (controls, extra = {}) => ({ selector: 'header', height: 100, iw: 390, controls, contentTop: 100, broken: [], ...extra })
  // the source's button has no name the probe could recognise as a menu; the port's is named: paired by edge and shape
  const noName = judgeHeader([{ route: '/a', width: 390, scheme: 'light', source: { header: hd({}, { unroled: [{ left: 330, right: 20, center: 350, width: 40, name: 'button.x', text: 'bar bar bar' }] }) }, port: { header: hd({ 'menu-button': c({ left: 330, right: 20, center: 350, name: 'button.menu' }) }) } }])
  assert.deepEqual([noName.defects.length, noName.listed.length], [0, 0])
  // the same pairing shows a real inset difference as an inset, not as "extra"
  const shifted = judgeHeader([{ route: '/a', width: 390, scheme: 'light', source: { header: hd({}, { unroled: [{ left: 330, right: 20, center: 350, width: 40, name: 'button.x', text: '' }] }) }, port: { header: hd({ 'menu-button': c({ left: 280, right: 70, center: 300, name: 'button.menu' }) }) } }])
  assert.deepEqual(shifted.defects.map((d) => d.what), ['header-menu-button-inset-right'])
  // typography: 14px/700 against 16px/600 on the site name
  const type = (size, weight, spacing = 0, transform = 'none') => ({ size, weight, spacing, transform })
  const logo = (t) => ({ logo: c({ name: 'a.brand', text: 'JA Essence', type: t }) })
  const j = judgeHeader([{ route: '/a', width: 1440, scheme: 'light', source: { header: hd(logo(type(16, 600, 1.5)), { iw: 1440 }) }, port: { header: hd(logo(type(14, 700, 0.5)), { iw: 1440 }) } }])
  assert.deepEqual(j.defects.map((d) => [d.what, d.source, d.port]), [['header-logo-font-size', '16px', '14px'], ['header-logo-font-weight', 600, 700], ['header-logo-letter-spacing', '1.5px', '0.5px']])
  const same = judgeHeader([{ route: '/a', width: 1440, scheme: 'light', source: { header: hd(logo(type(16, 600)), { iw: 1440 }) }, port: { header: hd(logo(type(16.2, 600)), { iw: 1440 }) } }])
  assert.deepEqual(same.defects, [])
  // navigation words are paired where a word stands once on each side
  const navRow = (a, b) => ({ route: '/a', width: 1440, scheme: 'light', source: { header: hd({}, { iw: 1440, nav: [{ text: 'Home', type: a, center: 100 }, { text: 'Blog', type: a, center: 200 }] }) }, port: { header: hd({}, { iw: 1440, nav: [{ text: 'Home', type: b, center: 100 }, { text: 'Blog', type: a, center: 200 }] }) } })
  assert.deepEqual(judgeHeader([navRow(type(15, 400), type(15, 400, 0, 'uppercase'))]).defects.map((d) => [d.what, d.source, d.port]), [['header-nav-text-transform', 'none', 'uppercase']])
})

test('header (browser): an unnamed three-bar button on the source is the menu control of the port\'s named one — no header-control-extra; the site name\'s type is compared', async () => {
  const bars = '<button type="button" style="border:0;background:none;padding:10px;position:absolute;right:12px;top:10px"><span style="display:block;width:20px;height:2px;background:#000;margin:4px 0"></span><span style="display:block;width:20px;height:2px;background:#000;margin:4px 0"></span><span style="display:block;width:20px;height:2px;background:#000;margin:4px 0"></span></button>'
  const named = '<button type="button" aria-label="Open the menu" class="menu-toggle" style="border:0;background:none;padding:10px;position:absolute;right:12px;top:10px"><svg width="20" height="14" viewBox="0 0 20 14"><rect width="20" height="2" y="0"/><rect width="20" height="2" y="6"/><rect width="20" height="2" y="12"/></svg></button>'
  const hdr = (btn, brand) => `<header style="position:relative;height:70px">${brand}${btn}</header><main><h1>Title</h1></main>`
  const brand = (size, weight) => `<a href="/" class="site-name" style="font-size:${size}px;font-weight:${weight};letter-spacing:0">JA Essence</a>`
  const report = await sweep({
    port: { '/a': html(hdr(named, brand(14, 700))) },
    source: { '/a': html(hdr(bars, brand(16, 600))) },
    only: ['header'],
    widths: [390],
    schemes: ['light']
  })
  assert.ok(!report.defects.header.some((d) => /control-(extra|missing)/.test(d.what)), JSON.stringify(report.defects.header))
  assert.deepEqual(report.defects.header.filter((d) => /logo-/.test(d.what)).map((d) => [d.what, d.source, d.port]).sort(), [['header-logo-font-size', '16px', '14px'], ['header-logo-font-weight', 600, 700]])
})

test('a baseline: an earlier sweep run without --zip is accepted with --baseline-version; without it the error says what the run needs', () => {
  const dir = tmp()
  writeFileSync(path.join(dir, 'site-sweep.json'), JSON.stringify({ schema: 'tracy-site-sweep/v1', ranAt: '2026-10-04T10:00:00.000Z', theme: { version: null, zipSha256: null }, checks: [{ id: 'overflow', pass: false }, { id: 'header', pass: true }] }))
  const b = readBaseline(dir, '1.0.5')
  assert.deepEqual([b.version, b.passed, b.total, b.ids], ['1.0.5', 1, 2, ['overflow', 'header']])
  assert.throws(() => readBaseline(dir), /a baseline run needs --zip <the previous version's theme zip>/)
  // the version the earlier run's own zip named is enough
  writeFileSync(path.join(dir, 'site-sweep.json'), JSON.stringify({ schema: 'tracy-site-sweep/v1', ranAt: '2026-10-04T10:00:00.000Z', theme: { version: '1.0.4' }, checks: [{ id: 'overflow', pass: true }] }))
  assert.equal(readBaseline(dir).version, '1.0.4')
  writeFileSync(path.join(dir, 'site-sweep.json'), '{"schema":"other"}')
  assert.throws(() => readBaseline(dir, '1'), /neither a tracy-site-sweep\/v1 site-sweep\.json nor a tracy-fix-measure\/v1/)
})

test('command line: --help names what a baseline run needs', async () => {
  const r = await cli([])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /a baseline run needs --zip <the previous version's theme zip>/)
})

test('chips: the same kind of chip in the same section with other words (a hit counter) is paired by order and its words are listed, not a pair of one-sided chips', () => {
  const chip = (text, o = {}) => ({ text, key: 'News and update', region: 'body', bg: 'rgb(242, 243, 247)', color: 'rgb(119, 119, 119)', inset: [4, 8, 4, 8], radius: '4px', font: '12px', w: 60, h: 18, textW: 40, name: 'span.list-hits.badge', ...o })
  const j = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('Hits: 270')] }, port: { chips: [chip('Hits: 218', { bg: 'rgb(20, 25, 39)' })] } }])
  assert.equal(j.pages[0].status, 'measured')
  assert.deepEqual(j.defects.map((d) => d.what), ['chip-background'])
  assert.deepEqual(j.listed.map((l) => [l.what, l.source, l.port]), [['chip-words', 'Hits: 270', 'Hits: 218']])
  // different classes are not the same kind of chip: one-sided on both ends
  const other = judgeChips([{ route: '/a', width: 1440, scheme: 'light', source: { chips: [chip('Joomla', { name: 'a' })] }, port: { chips: [chip('Studio', { name: 'a.tag-cloud-link' })] } }])
  assert.deepEqual(other.defects.map((d) => d.what).sort(), ['chip-port-only', 'chip-source-only'])
})

test('summary (browser): a failing group, an accepted group, a baseline-fixed group and a not-measured cause are in summary.md/json; the group count and the line cap hold', async () => {
  const dir = evidenceDir()
  const chip = (bg) => `<span class="badge" style="display:inline-block;padding:4px 10px;border-radius:12px;background:${bg};color:#fff;font-size:12px;line-height:16px">Hits</span>`
  const page = (bg) => html(`<main><section><h2>Section heading text</h2>${chip(bg)}</section></main>`)
  const run = (accept) => sweep({ port: { '/a': page('rgb(20,25,39)'), '/b': page('rgb(20,25,39)') }, source: { '/a': page('rgb(242,243,247)'), '/b': page('rgb(242,243,247)') }, only: ['chips', 'overflow'], widths: [1024], schemes: ['light'], accept })
  const failing = await run()
  const cause = failing.groups.chips[0].cause
  const sFail = summarise(failing, { baseline: { version: '1.0.0', groups: { chips: [cause, 'chip-background|span.gone'], overflow: [] } } })
  const chips = sFail.summary.checks.find((c) => c.id === 'chips')
  assert.equal(chips.verdict, 'fail')
  assert.equal(chips.groupList[0].key, cause)
  assert.equal(chips.groupList[0].status, 'defect')
  assert.equal(chips.groupList[0].routes, 2)
  assert.ok(chips.groupList[0].examples.length >= 1 && chips.groupList[0].examples.length <= 3)
  assert.equal(chips.groupList[0].baseline, 'unchanged')
  assert.deepEqual(chips.fixed, ['chip-background|span.gone'])
  assert.match(sFail.md, /fixed \(in the baseline, gone now\)/)
  assert.match(sFail.md, /source .* → port /)
  const sNew = summarise(failing, { baseline: { version: '1.0.0', groups: { chips: [], overflow: [] } } })
  assert.equal(sNew.summary.checks.find((c) => c.id === 'chips').groupList[0].baseline, 'new')
  const accepted = await run({ rows: [{ check: 'chips', cause, routes: ['/a', '/b'], decision: 'D-7', evidence: 'shot.png', kind: 'source-fault' }], decisions: decisionsOf(), runRoot: dir })
  const sAcc = summarise(accepted)
  const g = sAcc.summary.checks.find((c) => c.id === 'chips').groupList[0]
  assert.equal(g.status, 'accepted')
  assert.equal(g.accept.decision, 'D-7')
  assert.equal(g.evidence, 'shot.png')
  assert.equal(sAcc.summary.checks.find((c) => c.id === 'chips').verdict, 'pass')
  assert.deepEqual(summaryLines(sAcc.summary, 'S').filter((l) => l.startsWith('chips:')), [`chips: pass, 0 group(s) (+1 accepted), ${accepted.checks.find((c) => c.id === 'chips').cases} case(s), 0 not measured`])
  // a not-measured cause is listed once with its count
  const synthetic = { site: 'p', source: 's', ranAt: 'now', exit: 3, routesMeasured: 2, routesTotal: 2, widths: [390], schemes: ['light'], checks: [{ id: 'chips', pass: false, defects: 0, cases: 2, notMeasured: 2, notMeasuredCauses: { 'no-chip': { pages: 2, why: 'no chip on the page', example: '/a' } } }, { id: 'icons', pass: false, defects: 0, cases: 1, notMeasured: 1, notMeasuredCauses: { 'no-chip': { pages: 1, why: 'no chip on the page', example: '/b' } } }], groups: {}, defects: {}, owed: [] }
  const sNm = summarise(synthetic)
  assert.deepEqual(sNm.summary.notMeasured.map((n) => [n.cause, n.count, n.checks]), [['no-chip', 3, ['chips', 'icons']]])
  assert.equal(sNm.md.match(/\*\*no-chip\*\*/g).length, 1)
  assert.equal(sNm.summary.checks[0].verdict, 'not-measured')
  // 40 groups of 5 cells: every group stays, the examples shrink to fit the cap
  const many = {
    ...synthetic,
    exit: 1,
    checks: [{ id: 'overflow', pass: false, defects: 40, cases: 200, notMeasured: 0 }],
    groups: { overflow: Array.from({ length: 40 }, (_, i) => ({ cause: `k${i}`, what: 'in-page', routes: ['/a'], widths: [390], schemes: ['light'], occurrences: 5 })) },
    defects: { overflow: Array.from({ length: 40 }, (_, i) => ({ cause: `k${i}`, what: 'in-page', route: '/a', width: 390, source: 1, port: 2 })) }
  }
  const sMany = summarise(many)
  assert.equal(sMany.summary.checks[0].groupList.length, 40)
  assert.ok(sMany.md.split('\n').length <= MAX_LINES)
  const big = { ...many, defects: { overflow: Array.from({ length: 150 * 3 }, (_, i) => ({ cause: `k${i % 150}`, what: 'in-page', route: `/r${i}`, width: 390, source: 1, port: 2 })) }, groups: { overflow: Array.from({ length: 150 }, (_, i) => ({ cause: `k${i}`, what: 'in-page', routes: ['/a'], widths: [390], schemes: ['light'], occurrences: 5 })) }, checks: [{ id: 'overflow', pass: false, defects: 150, cases: 750, notMeasured: 0 }] }
  const sBig = summarise(big)
  assert.equal(sBig.summary.examplesPerGroup, 0)
  assert.equal(sBig.summary.checks[0].groupList.length, 150)
})

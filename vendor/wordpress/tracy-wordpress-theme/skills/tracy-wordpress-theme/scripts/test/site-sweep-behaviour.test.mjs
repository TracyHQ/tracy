// The behaviour checks of site-sweep (fixed-widgets, icons, forms, text, first-interaction): the pure rules on fixtures, and one
// real-browser test per check on small local pages — each check finds its defect on a pair of pages and stays clean on an identical pair.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bindingsFrom } from '../lib/canonical.mjs'
import { PNG } from 'pngjs'
import { validateFixMeasure } from '../lib/fix-measure.mjs'
import { lazyBrowser } from '../lib/browser.mjs'
import { dossierPlan, runSweep, fixChecks, formatSummary } from '../visual/site-sweep.mjs'
import { inkOf, ownPaint, movedPageLink, pushGeometry, targetTouchRows } from '../visual/site-sweep-behaviour.mjs'
import { judgeChips, pairChips } from '../visual/site-sweep-judge.mjs'
import { applyAccept, validateSweepAccept } from '../visual/site-sweep-accept.mjs'
import { groupDefects } from '../visual/site-sweep-judge.mjs'
import { judgeFixedWidgets, judgeForms, judgeIcons, judgeText, judgeFirstInteraction, judgeTargetBehaviour, pairIcons, pairWidgets, BEHAVIOUR_ORDER, rangesCover } from '../visual/site-sweep-behaviour-judge.mjs'

const browser = lazyBrowser()
const servers = []
const specDirs = []
after(async () => {
  await browser.close()
  for (const s of servers) s.close()
  for (const d of specDirs) rmSync(d, { recursive: true, force: true })
})

// ---- pure parts -----------------------------------------------------------------------------------------------------

const solid = (w, h, [r, g, b], dots = []) => {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) [png.data[i * 4], png.data[i * 4 + 1], png.data[i * 4 + 2], png.data[i * 4 + 3]] = [r, g, b, 255]
  for (const [x, y, c] of dots) [png.data[(y * w + x) * 4], png.data[(y * w + x) * 4 + 1], png.data[(y * w + x) * 4 + 2]] = c
  return png
}

test('ink: a white chevron on a white tab has none; on a blue square it has ink and a box', () => {
  const white = inkOf(solid(40, 40, [255, 255, 255], [[20, 20, [250, 250, 250]]]))
  assert.ok(white.ratio < 0.004 && white.box === null)
  const dots = []
  for (let x = 10; x < 30; x++) dots.push([x, 20, [255, 255, 255]], [x, 21, [255, 255, 255]])
  const blue = inkOf(solid(40, 40, [29, 78, 216], dots))
  assert.ok(blue.ratio > 0.02 && blue.box.w === 20 && blue.bg[2] > 200)
})

// SYNTHETIC: a hand-built coverage shape (0 ground … 9 painted) standing for "the glyph that was read" in hand-built icon readings
const SYN_SHAPE = { w: 6, h: 6, rows: ['009900', '099990', '999999', '099990', '009900', '000000'], cells: 14 }
const widget = (o = {}) => ({ corner: 'br', name: 'Top', sel: 'a#top', rect: { x: 1384, y: 834, w: 56, h: 50 }, fromRight: 0, fromBottom: 16, hasMark: true, ink: { ratio: 0.1, bg: [29, 78, 216], box: { w: 20, h: 10 } }, ...o })
test('fixed widgets: paired by corner; an empty mark, a missing widget and a different box are defects, each its own cause', () => {
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { widgets: s }, port: { widgets: p } })
  const clean = judgeFixedWidgets([row([widget()], [widget({ name: 'Back to top' })])])
  assert.equal(clean.defects.length, 0)
  const empty = judgeFixedWidgets([row([widget()], [widget({ ink: { ratio: 0, bg: [255, 255, 255], box: null } })])])
  assert.deepEqual(empty.defects.map((d) => d.what), ['fixed-widget-mark-invisible'])
  assert.equal(judgeFixedWidgets([row([widget()], [])]).defects[0].what, 'fixed-widget-only-source')
  assert.equal(judgeFixedWidgets([row([widget()], [widget({ rect: { x: 1384, y: 834, w: 40, h: 40 } })])]).defects[0].what, 'fixed-widget-box')
  const both = judgeFixedWidgets([row([widget({ ink: { ratio: 0, bg: [255, 255, 255], box: null } })], [widget({ ink: { ratio: 0, bg: [255, 255, 255], box: null } })])])
  assert.equal(both.defects.length, 0)
  assert.equal(both.listed.length, 1)
  // two widgets in one corner and no common name: not paired, not guessed
  const crowded = pairWidgets([widget({ name: 'a' }), widget({ name: 'b' })], [widget({ name: 'c' })])
  assert.equal(crowded.pairs.length, 0)
  assert.equal(judgeFixedWidgets([row([widget({ name: 'a' }), widget({ name: 'b' })], [widget({ name: 'c' })])]).notMeasured[0].cause, 'widgets-unpairable')
})

const field = (o = {}) => ({ type: 'text', name: 'user', required: true, autofocus: false, placeholder: '', label: 'Username', focusedOnLoad: false, ...o })
const form = (o = {}) => ({ purpose: 'login', land: 'main', id: 'f', action: '/login', box: { w: 400, h: 350 }, fields: [field(), field({ type: 'password', name: 'pw', label: 'Password' })], links: ['forgot your username?'], focusedOnLoad: false, focus: null, ...o })
test('forms: required, focus on load, links of one side, box; field names are listed; an unknown form with no partner is not-measured', () => {
  const row = (s, p) => ({ route: '/login', width: 1440, scheme: 'light', source: { forms: s }, port: { forms: p } })
  assert.equal(judgeForms([row([form()], [form({ fields: [field({ name: 'log' }), field({ type: 'password', name: 'pwd', label: 'Password' })] })])]).defects.length, 0)
  const j = judgeForms([row([form()], [form({ fields: [field({ required: false }), field({ type: 'password', required: false, label: 'Password' })], links: [], box: { w: 400, h: 330 } })])])
  assert.deepEqual([...new Set(j.defects.map((d) => d.what))].sort(), ['form-box', 'form-field-required', 'form-links-only-source'])
  // links inside the form element are the box's extra height: the box follows them and is listed, not counted twice
  const inside = judgeForms([row([form({ linksIn: 1 })], [form({ links: [], linksIn: 0, box: { w: 400, h: 330 } })])])
  assert.deepEqual([...new Set(inside.defects.map((d) => d.what))], ['form-links-only-source'])
  assert.equal(inside.listed.filter((l) => l.what === 'form-box-follows-links').length, 1)
  assert.equal(groupDefects(j.defects).find((g) => g.what === 'form-field-required').occurrences, 2)
  assert.equal(judgeForms([row([form({ purpose: 'newsletter', land: 'footer' })], [])]).defects[0].what, 'form-only-source')
  assert.equal(judgeForms([row([form({ purpose: 'other' })], [])]).notMeasured[0].cause, 'form-purpose-unknown')
  const ring = { before: { border: 'rgb(0, 0, 0)', borderWidth: '1px', outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', shadow: 'none' }, after: { border: 'rgb(134, 183, 254)', borderWidth: '1px', outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0, 0, 0)', shadow: 'none' } }
  const f = judgeForms([row([form({ focus: ring })], [form({ focus: { ...ring, after: { ...ring.after, border: 'rgb(0, 0, 0)', shadow: 'rgba(13, 110, 253, 0.25) 0px 0px 0px 4px' } } })])])
  assert.ok(f.defects.some((d) => d.what === 'form-focus-style'))
})

test('text: a cut that ends elsewhere is a defect, equal visible words with a longer page text are listed, case of a label is a defect', () => {
  const block = (text, visible = text) => ({ land: 'main', head: 'More', tag: 'p', text, visible, clipped: false })
  const long = 'Our team keeps designing the whole experience because it is pain, and we do it again and again until it is done well'
  const row = (s, p, sl = [], pl = []) => ({ route: '/', width: 1440, scheme: 'light', source: { text: { blocks: s, labels: sl } }, port: { text: { blocks: p, labels: pl } } })
  const cut = judgeText([row([block(long.slice(0, 50) + '...')], [block(long, long.slice(0, 60) + '…')])])
  assert.equal(cut.defects[0].what, 'text-cut')
  assert.equal(judgeText([row([block(long)], [block(long)])]).defects.length, 0)
  assert.equal(judgeText([row([block(long.slice(0, 50) + '...', 'x')], [block(long, 'x')])]).defects.length, 0)
  const lab = (text, o = {}) => ({ kind: 'nav', land: 'header', text, nth: 0, size: 16, weight: 600, spacing: 0, transform: 'uppercase', ...o })
  const l = judgeText([row([], [], [lab('OUR SERVICES')], [lab('Our Services', { transform: 'none', size: 15 })])])
  assert.deepEqual(l.defects.map((d) => d.what).sort(), ['label-case', 'label-size'])
})

test('first interaction: a click that changes nothing on the port, a tap that navigates where the source opens, a drawer without its back row; a control not found is not-measured', () => {
  const t = (s, p, state = 'os-light/no-choice') => ({ route: '/', width: 390, state, kind: 'theme', source: s, port: p })
  const j = judgeFirstInteraction([t({ before: 'light', after: 'dark', flips: true }, { before: 'light', after: 'light', flips: false }), t({ before: 'dark', after: 'light', flips: true }, { before: 'dark', after: 'light', flips: true }, 'os-dark/saved-dark'), t({ before: 'light', after: 'dark', flips: true }, { missing: 'no visible theme control by role/name' }, 'os-light/saved-light')])
  assert.deepEqual(j.defects.map((d) => d.what), ['theme-first-click-noop'])
  assert.equal(j.notMeasured.length, 1)
  const touch = judgeFirstInteraction([{ route: '/', width: 1024, state: 'touch', kind: 'touch', what: '"services"', source: { taps: [{ navigated: false, opened: true }, { navigated: true, opened: false }] }, port: { taps: [{ navigated: true, opened: false }] } }])
  assert.equal(touch.defects[0].what, 'touch-tap-outcome')
  const white = [[255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255]]
  const base = { opens: true, rows: [{ text: 'Home', size: 16 }], back: { text: 'OUR SERVICES', transform: 'uppercase', size: 16, weight: 600, w: 236, h: 32 }, backWorks: true, closes: true, pushedHeaderX: -300, pushedMainX: -300, strip: { edge: 80, grid: white } }
  const drawer = (port) => judgeFirstInteraction([{ route: '/', width: 768, state: 'drawer', kind: 'drawer', source: base, port: { ...base, ...port } }])
  const d = drawer({ back: { ...base.back, text: 'Our Services' }, pushedHeaderX: 0, strip: { edge: 80, grid: [[29, 78, 216], [29, 78, 216], [29, 78, 216], [29, 78, 216]] } })
  assert.deepEqual(d.defects.map((x) => x.what).sort(), ['drawer-back-row-text', 'drawer-open-strip'])
  // the page moves differently but the strip a visitor sees is the same: listed, not counted
  const quiet = drawer({ pushedHeaderX: 0 })
  assert.equal(quiet.defects.length, 0)
  assert.equal(quiet.listed[0].what, 'drawer-open-push-differs')
})

test('icons: paired by link host; a box that differs is a defect, a different mark of the same size is not', () => {
  const ic = (o = {}) => ({ land: 'footer', order: 0, key: 'facebook', name: '', href: 'https://facebook.com/x', tag: 'a', rect: { x: 76, y: 10, w: 18, h: 18 }, mark: { x: 76, y: 10, w: 18, h: 18 }, reachable: true, ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: SYN_SHAPE }, ...o })
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { icons: s }, port: { icons: p } })
  assert.equal(judgeIcons([row([ic()], [ic({ ink: { ratio: 0.25, bg: [0, 0, 0], box: { w: 13, h: 15 }, shape: SYN_SHAPE } })])]).defects.length, 0)
  const j = judgeIcons([row([ic({ ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 6, h: 14 }, shape: SYN_SHAPE } })], [ic()])])
  assert.equal(j.defects[0].what, 'icon-mark-size')
  // controls left on ONE side are controls the other side lacks: a defect of its own, not a not-measured case
  const extra = judgeIcons([row([ic(), ic({ key: 'x', rect: { x: 100, y: 10, w: 18, h: 18 } })], [ic()])])
  assert.equal(extra.notMeasured.length, 0)
  assert.deepEqual(extra.defects.map((d) => d.what), ['icon-only-source'])
  // controls left on BOTH sides with nothing that settles which is which stay not measured
  assert.equal(judgeIcons([row([ic(), ic({ key: 'x', role: '', path: '' }), ic({ key: 'y' })], [ic(), ic({ key: 'z' })])]).notMeasured[0].cause, 'icons-unpairable')
})

test('icons: two sides that name a header control differently are paired by what it is for or the page it links to, before giving up', () => {
  const ic = (o = {}) => ({ land: 'header', order: 0, key: '', name: '', href: '', role: '', path: '', tag: 'button', rect: { x: 0, y: 10, w: 24, h: 24 }, mark: { x: 0, y: 10, w: 24, h: 24 }, reachable: true, ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: SYN_SHAPE }, ...o })
  // the source has 2 controls, the port 3, and every name differs (the case of a header with a theme switch, a menu button and a cart)
  const src = [ic({ key: 'toggle navigation', name: 'Toggle navigation', role: 'menu' }), ic({ key: 'switch', name: 'Switch', role: 'theme' })]
  const port = [ic({ key: 'open menu', name: 'Open menu', role: 'menu' }), ic({ key: 'dark mode', name: 'Dark mode', role: 'theme' }), ic({ key: 'cart', name: 'Cart', role: 'cart' })]
  const { pairs, unpaired } = pairIcons(src, port)
  assert.deepEqual(pairs.map((p) => [p.source.role, p.by]), [['menu', 'role'], ['theme', 'role']])
  assert.deepEqual([unpaired.source.length, unpaired.port.map((x) => x.role)], [0, ['cart']])
  const j = judgeIcons([{ route: '/', width: 1440, scheme: 'light', source: { icons: src }, port: { icons: port } }])
  assert.equal(j.notMeasured.length, 0)
  assert.deepEqual(j.defects.map((d) => d.cause), ['icon-only-port|header'])
  // by the internal page the control links to
  const byPath = pairIcons([ic({ key: 'a', path: '/contact', tag: 'a' }), ic({ key: 'b', path: '/login', tag: 'a' })], [ic({ key: 'c', path: '/login', tag: 'a' }), ic({ key: 'd', path: '/contact', tag: 'a' }), ic({ key: 'e', path: '/x', tag: 'a' })])
  assert.deepEqual(byPath.pairs.map((p) => p.by), ['link', 'link'])
  // two controls of one role on one side are not guessed
  const two = pairIcons([ic({ key: 'a', role: 'theme' }), ic({ key: 'b', role: 'theme' })], [ic({ key: 'c', role: 'theme' }), ic({ key: 'd' }), ic({ key: 'e' })])
  assert.equal(two.pairs.length, 0)
})

test('first interaction: a source with no theme switch while the port has one is nothing to compare, listed; a control missing on the port or on both sides stays not-measured', () => {
  const t = (s, p, state = 'os-light/no-choice') => ({ route: '/', width: 390, state, kind: 'theme', source: s, port: p })
  const found = { before: 'light', after: 'dark', flips: true, control: 'Toggle dark mode' }
  const none = { missing: 'no visible theme control by role/name' }
  const j = judgeFirstInteraction([t(none, found)])
  assert.deepEqual([j.notMeasured.length, j.cases, j.listed.map((l) => l.what)], [0, 0, ['theme-no-source-control']])
  assert.equal(judgeFirstInteraction([t(found, none)]).notMeasured[0].cause, 'theme-control-not-found')
  assert.equal(judgeFirstInteraction([t(none, none)]).notMeasured[0].cause, 'theme-control-not-found')
  // a hint the dossier gave that matches nothing is a mistake of the dossier, not a source without the control
  assert.equal(judgeFirstInteraction([t({ missing: 'the hint .x matches nothing visible' }, found)]).notMeasured.length, 1)
  const touch = (s, p) => ({ route: '/', width: 1024, state: 'touch', kind: 'touch', what: 'parent menu items', source: s, port: p })
  const j2 = judgeFirstInteraction([touch({ missing: 'no parent menu item with a hidden panel was found in the header at 1024px' }, { parents: [{ text: 'a', taps: [] }] })])
  assert.deepEqual([j2.notMeasured.length, j2.listed[0].what], [0, 'touch-no-source-control'])
})

const NM = (check, cause, extra = {}) => ({ check, cause, kind: 'not-measurable', cases: 2, reason: 'the tool cannot pair them', measurement: 'both headers hold the same two icons', evidence: import.meta.filename, ...extra })
const unmeasured = (cause, n, extra = {}) => Array.from({ length: n }, (_, i) => ({ route: `/p${i}`, width: 1440, scheme: 'light', cause, why: 'w', detail: 'd', ...extra }))
test('accept: a not-measurable row closes the not-measured cases of its cause up to its count; a new cause, a larger count and a stale row fail', () => {
  const judge = (nm) => ({ icons: { cases: 5, defects: [], notDefects: [], listed: [], notMeasured: nm } })
  // closed: recorded 2, measured 2 — the cases leave notMeasured, the report keeps the row with its count
  const j = judge(unmeasured('icons-unpairable', 2))
  const r = applyAccept(j, [NM('icons', 'icons-unpairable')], { routes: ['/p0', '/p1'], widths: [1440] })
  assert.deepEqual(r.errors, [])
  assert.deepEqual([j.icons.notMeasured.length, j.icons.closedNotMeasured.length, r.closedItems.icons], [0, 2, 2])
  assert.deepEqual([r.accepted[0].kind, r.accepted[0].occurrences, r.accepted[0].recordedCases, r.accepted[0].measurement], ['not-measurable', 2, 2, 'both headers hold the same two icons'])
  // fewer than recorded is still closed
  assert.equal(applyAccept(judge(unmeasured('icons-unpairable', 1)), [NM('icons', 'icons-unpairable')], {}).errors.length, 0)
  // a count that grew beyond the record: an error, nothing is closed
  const grown = judge(unmeasured('icons-unpairable', 3))
  const g = applyAccept(grown, [NM('icons', 'icons-unpairable')], {})
  assert.match(g.errors[0].message, /3 case\(s\).*records 2.*grew/)
  assert.equal(grown.icons.notMeasured.length, 3)
  // a NEW cause beside the recorded one stays not measured
  const mixed = judge([...unmeasured('icons-unpairable', 2), ...unmeasured('icon-covered', 1)])
  const m = applyAccept(mixed, [NM('icons', 'icons-unpairable')], {})
  assert.deepEqual([m.errors.length, mixed.icons.notMeasured.map((x) => x.cause)], [0, ['icon-covered']])
  // a row whose cause no longer occurs is stale
  const stale = applyAccept(judge([]), [NM('icons', 'icons-unpairable')], {})
  assert.match(stale.errors[0].message, /stale/)
  // a chips case with two causes closes only when both are recorded
  const chips = { chips: { cases: 1, defects: [], notDefects: [], listed: [], notMeasured: [{ route: '/', width: 390, scheme: 'light', causes: [{ cause: 'repeated-label' }, { cause: 'no-counterpart-section' }] }] } }
  applyAccept(chips, [NM('chips', 'repeated-label', { cases: 1 })], {})
  assert.equal(chips.chips.notMeasured.length, 1)
  applyAccept(chips, [NM('chips', 'repeated-label', { cases: 1 }), NM('chips', 'no-counterpart-section', { cases: 1 })], {})
  assert.equal(chips.chips.notMeasured.length, 0)
})

test('accept: a not-measurable row needs its count, reason, hand measurement and evidence that exists, and no route, decision or other scope', () => {
  const errs = (row) => validateSweepAccept([row], { decisions: null, runRoot: '/' })
  assert.deepEqual(errs(NM('icons', 'icons-unpairable')), [])
  assert.match(errs(NM('icons', 'icons-unpairable', { cases: 0 })).join(), /cases/)
  assert.match(errs(NM('icons', 'icons-unpairable', { measurement: '' })).join(), /measurement/)
  assert.match(errs(NM('icons', 'icons-unpairable', { reason: undefined })).join(), /reason/)
  assert.match(errs(NM('icons', 'icons-unpairable', { evidence: '/no/such/file.png' })).join(), /does not exist/)
  assert.match(errs(NM('icons', 'icons-unpairable', { routes: ['/'] })).join(), /no routes/)
  assert.match(errs(NM('icons', 'icons-unpairable', { decision: 'D-1' })).join(), /no decision/)
})

test('the behaviour checks are named and accepted by sweep.accept rows', () => {
  assert.deepEqual(BEHAVIOUR_ORDER, ['fixed-widgets', 'icons', 'forms', 'text', 'first-interaction'])
  const judged = { forms: { defects: [{ route: '/login', what: 'form-field-required', cause: 'form-field-required|login|false>true', width: 1440, scheme: 'light' }], notDefects: [], listed: [], notMeasured: [], cases: 1 } }
  const { accepted, errors } = applyAccept(judged, [{ check: 'forms', cause: 'form-field-required|login|false>true', routes: ['/login'], decision: 'D-1', kind: 'source-fault', evidence: 'the source posts the same form' }], { routes: ['/login'], widths: [1440] })
  assert.equal(errors.length, 0)
  assert.equal(accepted.length, 1)
})

test('none target behaviour: widgets, icons, focus and first interaction keep their target invariants without a source side', () => {
  const row = (port, extra = {}) => ({ route: '/', referenceKind: 'none', width: 390, ...extra, port })
  const widgets = judgeTargetBehaviour('fixed-widgets', [row({ widgets: [] }), row({ widgets: [{ sel: '.float', ink: { ratio: 0.004 } }] }), row({ widgets: [{ sel: '.blank', ink: { ratio: 0.0039 } }] }), row({ widgets: [{ sel: '.unknown', ink: null }] })])
  assert.deepEqual(widgets.outcomes.map((x) => x.status), ['pass', 'pass', 'fail', 'not-measured'])
  assert.equal(judgeTargetBehaviour('fixed-widgets', [{ ...row({ widgets: [] }), scheme: 'dark' }]).outcomes[0].scheme, 'dark')
  const icons = judgeTargetBehaviour('icons', [row({ icons: [{ reachable: true, ink: { ratio: 0.004 }, key: 'ok' }, { reachable: false, ink: { ratio: 0.1 }, key: 'covered' }, { reachable: true, ink: { ratio: 0.0039 }, key: 'blank' }, { reachable: true, ink: null, key: 'unread' }] })])
  assert.deepEqual(icons.outcomes.map((x) => x.status), ['pass', 'fail', 'fail', 'not-measured'])
  const focus = { before: { borderTopColor: 'rgb(0,0,0)', borderTopWidth: '1px', outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0,0,0)', shadow: 'none' }, after: { borderTopColor: 'rgb(0,0,0)', borderTopWidth: '1px', outlineStyle: 'none', outlineWidth: '0px', outlineColor: 'rgb(0,0,0)', shadow: 'none' } }
  const forms = judgeTargetBehaviour('forms', [row({ forms: [] }), row({ forms: [{ fields: [{ type: 'text' }], focus }] }), row({ forms: [{ fields: [{ type: 'text' }], focus: null }] })])
  assert.deepEqual(forms.outcomes.map((x) => x.status), ['pass', 'fail', 'not-measured'])
  const first = judgeTargetBehaviour('first-interaction', [
    row({ before: 'light', after: 'dark', flips: true }, { kind: 'theme', expect: 'light', state: 'os-light/no-choice' }),
    row({ before: 'light', after: 'light', flips: false }, { kind: 'theme', expect: 'dark', state: 'os-dark/saved-dark' }),
    row({ parents: [{ text: 'Home', taps: [{ opened: true, navigated: false }] }], found: 1, readCount: 1 }, { kind: 'touch', state: 'touch' }),
    row({ parents: [{ text: 'Home', taps: [{ opened: false, navigated: true }] }], found: 1, readCount: 1 }, { kind: 'touch', state: 'touch' }),
    row({ opens: true, closes: true, backWorks: true }, { kind: 'drawer', state: 'drawer' }),
    row({ opens: false, closes: null }, { kind: 'drawer', state: 'drawer' })
  ])
  assert.ok(first.outcomes.some((x) => x.status === 'fail' && x.reason === 'target did not honor the requested saved scheme'))
  assert.ok(first.outcomes.some((x) => x.status === 'fail' && x.reason === 'first tap must open the panel without navigating'))
  assert.ok(first.outcomes.some((x) => x.status === 'fail' && x.reason === 'drawer must open'))
  const producedTouch = targetTouchRows({ route: '/', width: 1024, port: { found: 1, parents: [{ text: 'Home', taps: [{ opened: false, navigated: true }] }] } })
  const judgedTouch = judgeTargetBehaviour('first-interaction', producedTouch)
  assert.equal(judgedTouch.outcomes[0].status, 'fail')
  assert.equal(judgedTouch.outcomes[0].width, 1024)
  assert.equal(judgedTouch.outcomes[0].state, 'touch')
  const partialTouch = targetTouchRows({ route: '/', width: 1024, port: { found: 2, parents: [{ text: 'Home', taps: [{ opened: true, navigated: false }] }] } })
  const judgedPartialTouch = judgeTargetBehaviour('first-interaction', partialTouch)
  assert.deepEqual(judgedPartialTouch.outcomes.map((x) => x.status), ['pass', 'not-measured'])
})

// ---- false positives of the rule, each with the false case passing and the real difference beside it still failing -------------------

const gridOf4 = (c) => [c, c, c, c, c, c]
const stripRow = (s, p) => ({ route: '/', width: 390, state: 'drawer', kind: 'drawer', source: { opens: true, rows: [{ text: 'Home', size: 16 }], back: null, backWorks: null, closes: true, pushedHeaderX: 0, pushedMainX: 0, ...s }, port: { opens: true, rows: [{ text: 'Home', size: 16 }], back: null, backWorks: null, closes: true, pushedHeaderX: 0, pushedMainX: 0, ...p } })
const strip = (closed, open) => ({ edge: 80, closed: gridOf4(closed), grid: gridOf4(open) })
test('drawer-open-strip: compared with the same strip with the drawer closed — a page that differs under the strip is not a drawer that differs', () => {
  const white = [255, 255, 255]
  const hero = [20, 60, 200]
  const dim = [80, 80, 82]
  // the pages differ in the strip with the drawer closed (a hero copy), and both dim it the same when the drawer opens: no difference
  const same = judgeFirstInteraction([stripRow({ strip: strip(white, dim) }, { strip: strip(hero, [Math.round(hero[0] * 0.31), Math.round(hero[1] * 0.31), Math.round(hero[2] * 0.31)]) })])
  assert.equal(same.defects.length, 0)
  // the pages differ with the drawer closed and neither draws a drawer effect on the strip: still no difference
  assert.equal(judgeFirstInteraction([stripRow({ strip: strip(white, white) }, { strip: strip(hero, hero) })]).defects.length, 0)
  // the drawer dims the source's strip and not the port's: the real difference, whatever the strip held with the drawer closed
  const real = judgeFirstInteraction([stripRow({ strip: strip(white, dim) }, { strip: strip(hero, hero) })])
  assert.deepEqual(real.defects.map((d) => d.what), ['drawer-open-strip'])
  assert.match(real.defects[0].port, /change differently from the source's when the drawer opens/)
  // a dark page both sides dim to the same darkness: the cells move by 21 on one side and 20 on the other, either side of the 20-level step, and that is no difference
  // (measured: vega / at 768, 27 of 6572 cells; the open strips differ by 0.0% of their pixels)
  const dark = judgeFirstInteraction([stripRow({ strip: strip([22, 21, 30], [6, 6, 8]) }, { strip: strip([22, 21, 28], [6, 6, 8]) })])
  assert.equal(dark.defects.length, 0, JSON.stringify(dark.defects))
  // a drawer that dims a bright page on one side only stays a difference whatever the step does
  assert.equal(judgeFirstInteraction([stripRow({ strip: strip([200, 200, 210], [60, 60, 64]) }, { strip: strip([200, 200, 210], [200, 200, 210]) })]).defects.length, 1)
  // a strip read without its closed picture is compared as before
  assert.equal(judgeFirstInteraction([stripRow({ strip: { edge: 80, grid: gridOf4(white) } }, { strip: { edge: 80, grid: gridOf4(hero) } })]).defects[0].what, 'drawer-open-strip')
})

test('drawer-rows: the cause key carries no counts, so an accept row does not go stale when a row more or less is missing', () => {
  const rows = (...t) => t.map((x) => ({ text: x, size: 16 }))
  const a = judgeFirstInteraction([stripRow({ rows: rows('Home', 'About', 'Blog', 'Shop', 'Help') }, { rows: rows('Home') })])
  const b = judgeFirstInteraction([stripRow({ rows: rows('Home', 'About') }, { rows: rows('Home') })])
  assert.deepEqual([a.defects[0].cause, b.defects[0].cause], ['drawer-rows|rows', 'drawer-rows|rows'])
  assert.match(a.defects[0].source, /5 rows, missing on port: about \| blog \| shop \| help/)
})

test('drawer rows: a link of the page the drawer pushed sideways is not a row of the drawer', () => {
  const before = [{ text: 'Get help now', href: '/help', x: 16, y: 300 }]
  assert.equal(movedPageLink(before, { text: 'Get help now', href: '/help', x: 76, y: 300 }), true)
  assert.equal(movedPageLink(before, { text: 'Get help now', href: '/help', x: 16, y: 120 }), false)
  assert.equal(movedPageLink(before, { text: 'Get help now', href: '/other', x: 76, y: 300 }), false)
  assert.equal(movedPageLink(before, { text: 'Home', href: '/help', x: 76, y: 300 }), false)
})

test('forms: a link drawn as a button on one side is the other side\'s <button>; the same visual region of controls decides what a form\'s box wraps', () => {
  const row = (s, p) => ({ route: '/contact', width: 1440, scheme: 'light', source: { forms: s }, port: { forms: p } })
  const base = (o) => form({ purpose: 'contact', links: [], buttons: [], controlsBox: { w: 400, h: 300 }, ...o })
  // the source's "Send Email" is an <a>, the port's a <button>: the same button
  const same = judgeForms([row([base({ links: ['send email'], buttons: [] })], [base({ links: [], buttons: ['send email'] })])])
  assert.equal(same.defects.length, 0)
  // a link the port lacks that is no button of its own stays a difference
  const real = judgeForms([row([base({ links: ['send email', 'forgot password'] })], [base({ buttons: ['send email'] })])])
  assert.deepEqual(real.defects.map((d) => d.cause), ['form-links-only-source|contact'])
  assert.match(real.defects[0].source, /forgot password/)
  // the boxes of the form elements differ, the box of the controls does not: the form wraps an intro or a list on one side
  const wrap = judgeForms([row([base({ box: { w: 400, h: 340 } })], [base({ box: { w: 400, h: 310 } })])])
  assert.equal(wrap.defects.length, 0)
  assert.equal(wrap.listed.filter((l) => l.what === 'form-box-wraps-content').length, 1)
  // the controls themselves take another box (a taller row pitch): the real difference is counted
  const tall = judgeForms([row([base({ box: { w: 400, h: 340 }, controlsBox: { w: 400, h: 330 } })], [base({ box: { w: 400, h: 310 }, controlsBox: { w: 400, h: 300 } })])])
  assert.deepEqual(tall.defects.map((d) => d.what), ['form-box'])
})

test('text-visible-ending: clones of a carousel slide are paired by content, not by order', () => {
  const T = 'Our team keeps designing the whole experience because it is pain, and we do it again and again until it is done well enough'
  const blk = (visible) => ({ land: 'main', head: 'More', tag: 'p', text: T, visible, clipped: true })
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { text: { blocks: s, labels: [] } }, port: { text: { blocks: p, labels: [] } } })
  const a = 'Our team keeps designing the whole experience because it is pain,'
  const b = 'Our team keeps designing the whole experience because'
  // the source lists its slide then its clone, the port lists the clone first: by order every block meets the wrong one
  assert.equal(judgeText([row([blk(a), blk(b)], [blk(b), blk(a)])]).defects.length, 0)
  // a clamp that really ends elsewhere on the port is still a defect
  const c = 'Our team keeps designing the whole experience'
  assert.equal(judgeText([row([blk(a), blk(b)], [blk(c), blk(c)])]).defects[0].what, 'text-visible-ending')
})

test('fixed widgets: the widget\'s own paint is read — a glyph over another photograph is the same glyph; a bigger glyph is still a different mark', () => {
  const photo = (w, h, f) => {
    const png = new PNG({ width: w, height: h })
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) [png.data[(y * w + x) * 4], png.data[(y * w + x) * 4 + 1], png.data[(y * w + x) * 4 + 2], png.data[(y * w + x) * 4 + 3]] = [...f(x, y), 255]
    return png
  }
  const withGlyph = (bg, size) => {
    const off = photo(56, 50, bg)
    const on = photo(56, 50, bg)
    for (let y = 25 - size / 2; y < 25 + size / 2; y++) for (let x = 28 - size / 2; x < 28 + size / 2; x++) [on.data[(y * 56 + x) * 4], on.data[(y * 56 + x) * 4 + 1], on.data[(y * 56 + x) * 4 + 2]] = [255, 255, 255]
    return ownPaint(on, off)
  }
  const photoA = (x, y) => [180 - y, 40 + x, 60]
  const photoB = (x, y) => [30 + x, 150 - y, 200]
  const a = withGlyph(photoA, 20)
  const b = withGlyph(photoB, 20)
  assert.equal(a.transparent, true)
  assert.deepEqual([a.box.w, a.box.h], [20, 20])
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { widgets: [widget({ ink: s })] }, port: { widgets: [widget({ ink: p })] } })
  assert.equal(judgeFixedWidgets([row(a, b)]).defects.length, 0)
  const real = judgeFixedWidgets([row(a, withGlyph(photoB, 36))])
  assert.deepEqual(real.defects.map((d) => d.what), ['fixed-widget-mark-size'])
  // a tile of its own is read as before: its colour and the mark on it
  const tile = (bg) => {
    const off = photo(56, 50, photoA)
    const on = photo(56, 50, photoA)
    for (let y = 0; y < 50; y++) for (let x = 0; x < 56; x++) [on.data[(y * 56 + x) * 4], on.data[(y * 56 + x) * 4 + 1], on.data[(y * 56 + x) * 4 + 2]] = x > 20 && x < 36 && y > 20 && y < 30 ? [255, 255, 255] : bg
    return ownPaint(on, off)
  }
  const navy = tile([27, 48, 96])
  assert.equal(navy.transparent, false)
  assert.deepEqual(navy.bg, [27, 48, 96])
  assert.deepEqual(judgeFixedWidgets([row(navy, tile([103, 97, 92]))]).defects.map((d) => d.what), ['fixed-widget-paint'])
})

test('chips: a live counter is not the label — "Hits: 383" and "Hits: 442" are one chip', () => {
  const chip = (text, o = {}) => ({ text, key: 'News', region: 'body', n: 1, bg: 'rgb(242, 243, 247)', color: 'rgb(119, 119, 119)', inset: [4, 8, 4, 8], radius: '4px', font: '12px', w: 60, h: 18, textW: 40, name: 'span.list-hits.badge', ...o })
  const j = judgeChips([{ route: '/', width: 1440, scheme: 'light', source: { chips: [chip('Hits: 383')] }, port: { chips: [chip('Hits: 442')] } }])
  assert.deepEqual([j.defects.length, j.notMeasured.length, j.pages[0].status], [0, 0, 'measured'])
  assert.equal(j.listed.some((l) => l.what === 'chip-words'), true)
  // another label, or a paint that differs, is not hidden by it
  assert.equal(judgeChips([{ route: '/', width: 1440, scheme: 'light', source: { chips: [chip('Hits: 383')] }, port: { chips: [chip('Hits: 442', { bg: 'rgb(20, 25, 39)' })] } }]).defects[0].what, 'chip-background')
  // another word is still another label: paired only as the same kind of chip with other content (listed by the judge)
  assert.equal(pairChips([chip('Hits: 383')], [chip('Views: 383')]).pairs[0].textDiffers, true)
})

test('behaviour checks: a source that answers the web server\'s own page is nothing to compare — listed, not a defect', () => {
  const row = { route: '/404', width: 1440, scheme: 'light', source: { bare: true, widgets: [] }, port: { bare: false, widgets: [widget()] } }
  const j = judgeFixedWidgets([row])
  assert.deepEqual([j.defects.length, j.listed.map((l) => l.what)], [0, ['bare-source-page']])
  assert.equal(judgeFixedWidgets([{ ...row, source: { bare: false, widgets: [] } }]).defects[0].what, 'fixed-widget-only-port')
})

// ---- a real browser on small local pages ----------------------------------------------------------------------------

const serve = (routes) =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const r = routes[req.url.split('?')[0]]
      if (!r) {
        res.writeHead(404, { 'content-type': 'text/html' })
        return res.end('<!doctype html><title>404</title><body>not found')
      }
      res.writeHead(r.status ?? 200, { 'content-type': 'text/html' })
      res.end(typeof r.body === 'function' ? r.body(req) : r.body)
    })
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      resolve({ origin: `http://127.0.0.1:${server.address().port}` })
    })
  })
const html = (body, { css = '', script = '' } = {}) => ({ body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px/24px Arial;background:#fff}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>` })
const contract = (extra = {}) => ({
  design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tracy_theme' } } },
  source: { kind: 'live', darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light' },
  ...extra
})
// a spec-pack on disk whose page-map has `theme`, and the bindings a contract fresh for it records (`moveOn`: the page-map changes after)
function specPack(theme, moveOn = null) {
  const dir = mkdtempSync(path.join(tmpdir(), 'sweep-spec-'))
  specDirs.push(dir)
  const write = (t) => {
    writeFileSync(path.join(dir, 'page-map.json'), JSON.stringify({ pages: [], theme: t }))
    for (const f of ['sections.json', 'content.json']) writeFileSync(path.join(dir, f), '{}')
  }
  write(theme)
  const bindings = bindingsFrom({ specDir: dir })
  if (moveOn) write(moveOn)
  return { dir, bindings }
}
async function sweep({ port, source, only, widths = [1440], schemes = ['light'], behaviour, accept, confirm = false, sourceSide = null, spec = null }) {
  const [p, s] = await Promise.all([serve(port), serve(source)])
  const routes = Object.keys(port)
  const plan = dossierPlan({ contract: contract({ pages: routes.map((r) => ({ id: r, path: r, status: 200, sourceRoute: r })), ...(sourceSide ? { source: sourceSide } : {}), ...(spec ? { bindings: spec.bindings } : {}) }), config: behaviour ? { sweep: { behaviour } } : null, specDir: spec?.dir ?? null })
  const pairs = plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, s.origin).href }))
  return runSweep({ browser: await browser.get(), site: p.origin, source: s.origin, plan, pairs, widths, schemes, only, concurrency: 2, settleMs: 50, statusOf: async (u) => (await fetch(u)).status, confirm, accept })
}
const check = (report, id) => report.checks.find((c) => c.id === id)
const causes = (report, id) => [...new Set(report.defects[id].map((d) => d.what))].sort()
const TALL = '<div style="height:3000px"></div>'

test('dark cells (browser): a source the contract declares has no dark of its own closes them as not owed, with the reason; undeclared they stay owed, and only by the check read in dark (ja-restaurant S-40)', async () => {
  const page = html(`<header><a href="https://facebook.com/x"><i style="display:inline-block;width:18px;height:18px;background:#000"></i></a></header><main><form action="/s"><input name="q" aria-label="Search"><button>Go</button></form><p>Words</p></main>${TALL}`)
  const only = ['overflow', 'fixed-widgets', 'icons', 'forms', 'text', 'heights']
  const DERIVED = { kind: 'live', darkHook: null, darkDerived: true }
  const run = (sourceSide, o = {}) => sweep({ port: { '/a': page, '/b': page }, source: { '/a': page, '/b': page }, only, widths: [390, 1440], schemes: ['light', 'dark'], sourceSide, spec: specPack({ darkDerived: true, hook: null }), ...o })
  const derived = await run(DERIVED)
  assert.deepEqual(derived.owed, [], JSON.stringify(derived.owed))
  assert.equal(derived.exit, 0, JSON.stringify(derived.checks.map((c) => [c.id, c.notMeasured, c.defects])))
  for (const id of ['overflow', 'fixed-widgets', 'icons', 'forms', 'text']) assert.equal(check(derived, id).notMeasured, 0, id)
  // every dark cell is listed with the declaration's reason: the plain pass per route, fixed-widgets per route and width
  assert.ok(derived.notOwed.every((o) => o.scheme === 'dark' && /source\.darkDerived/.test(o.reason)), JSON.stringify(derived.notOwed))
  assert.deepEqual(derived.notOwed.filter((o) => o.checks.includes('fixed-widgets')).map((o) => `${o.route}@${o.width}:${o.checks.join('+')}`).sort(), ['/a@1440:fixed-widgets', '/a@390:fixed-widgets', '/b@1440:fixed-widgets', '/b@390:fixed-widgets'])
  assert.deepEqual(derived.notOwed.filter((o) => o.checks.includes('overflow')).map((o) => o.route).sort(), ['/a', '/b'])
  // no declaration: the same cells are owed and the run is not clean — the dark cell owes fixed-widgets, not the checks read in light
  const undeclared = await run({ kind: 'live', darkHook: null })
  assert.equal(undeclared.exit, 3)
  assert.deepEqual(undeclared.notOwed, [])
  assert.equal(check(undeclared, 'fixed-widgets').notMeasured, 4)
  for (const id of ['icons', 'forms', 'text']) assert.equal(check(undeclared, id).notMeasured, 0, id)
  assert.ok(check(undeclared, 'overflow').notMeasured > 0)
  // review: the declaration closes nothing on a contract that is not fresh for the spec-pack read — the page-map moved on to a
  // source with a dark of its own — nor with no spec-pack to check it against
  for (const [what, o] of [['stale', { spec: specPack({ darkDerived: true, hook: null }, { hook: { attribute: 'data-theme', darkValue: 'dark' } }) }], ['no spec', { spec: null }]]) {
    const r = await run(DERIVED, o)
    assert.deepEqual(r.notOwed, [], what)
    assert.equal(r.exit, 3, what)
    assert.ok(r.owed.some((x) => /source\.darkDerived is not taken/.test(x.reason)), `${what}: ${JSON.stringify(r.owed[0])}`)
  }
  // review: a dark-only run of a declared source reads nothing — its cells stay owed, the checks read once are not closed with them,
  // and a run that read no cell never exits 0
  const darkOnly = await run(DERIVED, { schemes: ['dark'] })
  assert.deepEqual(darkOnly.notOwed, [])
  assert.equal(darkOnly.measuredCells, 0)
  assert.equal(darkOnly.exit, 3)
  for (const id of ['fixed-widgets', 'icons', 'forms', 'text']) assert.ok(check(darkOnly, id).notMeasured > 0, id)
  // dark first: the checks read once are read in light, where both sides are, and only fixed-widgets' dark cells are closed
  const darkFirst = await run(DERIVED, { schemes: ['dark', 'light'] })
  assert.equal(darkFirst.exit, 0, JSON.stringify(darkFirst.checks.map((c) => [c.id, c.cases, c.notMeasured])))
  for (const id of ['icons', 'forms', 'text']) assert.ok(check(darkFirst, id).cases > 0, id)
  assert.ok(darkFirst.notOwed.filter((o) => o.width != null).every((o) => o.checks.join() === 'fixed-widgets'), JSON.stringify(darkFirst.notOwed))
})

test('a sweep that measured no cell never exits 0, even with no route at all (review)', async () => {
  const plan = dossierPlan({ contract: contract({ pages: [{ id: 'x', path: '/x', status: 200, sourceRoute: '/x' }] }) })
  for (const only of [['overflow'], ['fixed-widgets', 'icons', 'forms', 'text'], ['heights']]) {
    const r = await runSweep({ browser: await browser.get(), site: 'http://127.0.0.1:9', source: 'http://127.0.0.1:9', plan, pairs: [], widths: [1440], schemes: ['light'], only, concurrency: 1, settleMs: 0, statusOf: async () => 0, confirm: false })
    assert.equal(r.measuredCells, 0, only.join())
    assert.equal(r.exit, 3, only.join())
  }
})

test('fixed-widgets (browser): a white chevron on a white tab is a defect, the identical pair is clean', async () => {
  const src = html(`<main>page</main>${TALL}<a id="top" href="#" style="position:fixed;right:0;bottom:16px;width:56px;height:50px;background:#fff"><span style="display:block;width:40px;height:40px;margin:5px 8px;background:#1d4ed8;color:#fff;text-align:center;line-height:40px">^</span></a>`)
  const bad = html(`<main>page</main>${TALL}<a id="top" href="#" style="position:fixed;right:0;bottom:16px;width:56px;height:50px;background:#fff"><svg width="16" height="16" style="margin:17px 20px"><path d="M2 12 L8 4 L14 12" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/></svg></a>`)
  const report = await sweep({ port: { '/bad': bad, '/ok': src }, source: { '/bad': src, '/ok': src }, only: ['fixed-widgets'] })
  assert.deepEqual(report.defects['fixed-widgets'].map((d) => [d.route, d.what]), [['/bad', 'fixed-widget-mark-invisible']], JSON.stringify(report.defects['fixed-widgets']))
  assert.equal(check(report, 'fixed-widgets').defects, 1)
  assert.equal(report.exit, 1)
})

test('icons (browser): social icons of another width are a defect; identical rows are clean', async () => {
  const row = (w) => `<footer><a href="https://facebook.com/x" style="display:inline-block;margin-right:16px"><i class="icon" style="display:inline-block;width:${w[0]}px;height:18px;background:#000"></i></a><a href="https://instagram.com/x"><i class="icon" style="display:inline-block;width:${w[1]}px;height:18px;background:#000"></i></a></footer>`
  const report = await sweep({ port: { '/bad': html(row([18, 18])), '/ok': html(row([10, 15])) }, source: { '/bad': html(row([10, 15])), '/ok': html(row([10, 15])) }, only: ['icons'] })
  assert.ok(report.defects.icons.length > 0 && report.defects.icons.every((d) => d.route === '/bad'), JSON.stringify(report.defects.icons))
  assert.ok(causes(report, 'icons').some((w) => w === 'icon-box' || w === 'icon-mark-size'), causes(report, 'icons').join())
})

test('icons (browser): a page with neither header nor footer on either side adds no case and no not-measured entry, and the sweep exits 0; a region on one side only is not measured', async () => {
  const bare = html('<main><p>Not found</p></main>')
  const report = await sweep({ port: { '/404': bare }, source: { '/404': bare }, only: ['icons'] })
  assert.deepEqual([check(report, 'icons').cases, check(report, 'icons').notMeasured, check(report, 'icons').defects], [0, 0, 0], JSON.stringify(check(report, 'icons')))
  assert.equal(report.exit, 0)
  const one = await sweep({ port: { '/404': bare }, source: { '/404': html('<header>h</header><main><p>Not found</p></main><footer>f</footer>') }, only: ['icons'] })
  assert.ok(check(one, 'icons').notMeasured > 0, JSON.stringify(check(one, 'icons')))
  assert.equal(one.exit, 3)
})

test('icons (browser): the chevron button that opens a sub-level of a menu item is not an icon control, on either side', async () => {
  const head = (chevron) => html(`<header><nav><ul style="margin:0;padding:0;list-style:none"><li><a href="/svc">Services</a>${chevron}</li></ul></nav><button aria-label="Search" style="width:24px;height:24px"><svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#000"/></svg></button></header><footer>f</footer>`)
  const chevron = '<button class="wp-block-navigation-submenu__toggle" aria-expanded="false" aria-label="Services submenu" style="width:20px;height:20px"><svg width="10" height="10"><path d="M0 0L10 0L5 8z" fill="#000"/></svg></button>'
  const report = await sweep({ port: { '/': head(chevron) }, source: { '/': head('') }, only: ['icons'] })
  assert.equal(report.defects.icons.length, 0, JSON.stringify(report.defects.icons))
  assert.equal(check(report, 'icons').notMeasured, 0)
})

test('not-measurable (browser): a not-measured cause the dossier recorded no longer fails the check, stays in the report and fix-measure.json with its count; a count beyond the record fails again', async () => {
  // a form that is neither login, registration, search, contact nor newsletter, with no partner: form-purpose-unknown
  const lone = html('<main><form action="/poll"><input type="checkbox" name="a"><input type="checkbox" name="b"></form></main>')
  const bare = html('<main>nothing</main>')
  const row = (extra = {}) => ({ check: 'forms', cause: 'form-purpose-unknown', kind: 'not-measurable', cases: 1, reason: 'a poll form of the source with no counterpart', measurement: 'the port has no poll; checked on both pages', evidence: import.meta.filename, ...extra })
  const run = (rows, port = { '/': bare, '/q': bare }, source = { '/': lone, '/q': bare }) => sweep({ port, source, only: ['forms'], accept: { rows, decisions: null, runRoot: '/' } })
  const before = await run([])
  assert.equal(check(before, 'forms').pass, false)
  assert.equal(before.exit, 3)
  const closed = await run([row()])
  const c = check(closed, 'forms')
  assert.deepEqual([c.pass, c.notMeasured, closed.exit], [true, 0, 0])
  assert.deepEqual(c.notMeasurable.map((n) => [n.cause, n.cases, n.recordedCases]), [['form-purpose-unknown', 1, 1]])
  assert.match(formatSummary(closed), /not measured \*\*form-purpose-unknown\*\*.*measured by hand: the port has no poll/)
  const fixed = fixChecks(closed.checks)
  assert.equal(fixed[0].pass, true)
  assert.equal(fixed[0].notMeasurable[0].evidence, import.meta.filename)
  assert.deepEqual(validateFixMeasure({ schema: 'tracy-fix-measure/v1', tool: 't', ranAt: '2026-10-04T10:00:00.000Z', site: 'http://x.test', source: 's', artifact: { themeZipSha256: 'a'.repeat(64) }, checks: fixed, passed: 1, total: 1, baseline: null, notDefects: closed.notDefects }), [])
  assert.ok(closed.notDefects.some((n) => /form-purpose-unknown/.test(n.what) && n.evidence === import.meta.filename))
  // the same lone form on two routes: 2 cases beyond the 1 recorded — the check fails again and says why
  const grown = await run([row()], { '/': bare, '/q': bare }, { '/': lone, '/q': lone })
  assert.equal(check(grown, 'forms').pass, false)
  assert.equal(grown.exit, 1)
  assert.match(grown.acceptErrors[0].message, /grew beyond/)
  // a second not-measured cause the row does not name is a new cause: it fails
  const stale = await run([row({ cause: 'icons-unpairable', check: 'forms' })])
  assert.match(stale.acceptErrors[0].message, /stale/)
})

const drawerPage = ({ push = false, srText = 'Facebook', rows = ['Home', 'About', 'Contact'], back = '<span class="back" style="font-weight:600">Our Services</span>' } = {}) =>
  html(
    `<header><button class="burger" aria-label="Open menu" style="position:absolute;right:8px;top:8px;width:44px;height:44px">=</button></header><main><a id="hero" href="/help" style="display:inline-block;margin-top:300px">Get help now</a></main><div id="drawer" style="display:none;position:fixed;right:0;top:0;width:260px;height:100%;background:#eee">${rows.map((r) => `<a href="/${r}" style="display:block">${r}</a>`).join('')}<a href="#" style="display:block"><i style="display:inline-block;width:20px;height:20px;background:#000"></i><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">${srText}</span></a><button aria-label="Show submenu" aria-expanded="false" id="subt">+</button><div id="back" style="display:none">${back}<a href="/s1" style="display:block">S1</a></div></div>`,
    { script: `var q=function(i){return document.getElementById(i)};document.querySelector('.burger').onclick=function(){q('drawer').style.display='block';${push ? "document.querySelector('main').style.paddingLeft='60px'" : ''}};q('subt').onclick=function(){q('back').style.display='block'}` }
  )
const drawerRun = (port, source) => sweep({ port: { '/': port }, source: { '/': source }, only: ['first-interaction'], widths: [390], schemes: ['light'] })
const whatsOf = (report) => report.defects['first-interaction'].map((d) => d.what)

test('drawer rows (browser): a hero button the open drawer pushed beside the panel and an icon link with screen-reader text are not rows; a row the port lacks still is', async () => {
  // the source pushes the page 60 px when it opens and its icon link names itself "Facebook" for a screen reader; the port does neither
  const noisy = await drawerRun(drawerPage({ srText: 'Follow us on Facebook' }), drawerPage({ push: true }))
  assert.ok(!whatsOf(noisy).includes('drawer-rows'), JSON.stringify(noisy.defects['first-interaction']))
  const real = await drawerRun(drawerPage({ rows: ['Home', 'About'] }), drawerPage({ push: true }))
  const d = real.defects['first-interaction'].find((x) => x.what === 'drawer-rows')
  assert.ok(d, JSON.stringify(real.defects['first-interaction']))
  assert.equal(d.cause, 'drawer-rows|rows')
  assert.match(d.source, /missing on port: contact/)
})

test('drawer back row (browser): the type is read from the button inside the list item named for going back, as the source\'s own span', async () => {
  const li = (weight) => `<ul style="list-style:none;margin:0;padding:0"><li class="jn-drill-back" style="font-weight:400"><button class="jn-drill-back__btn" style="font:inherit;font-weight:${weight};border:0;background:none;padding:0">Our Services</button></li></ul>`
  const same = await drawerRun(drawerPage({ back: li(600) }), drawerPage())
  assert.ok(!whatsOf(same).includes('drawer-back-row-type'), JSON.stringify(same.defects['first-interaction']))
  const real = await drawerRun(drawerPage({ back: li(400) }), drawerPage())
  assert.ok(whatsOf(real).includes('drawer-back-row-type'), JSON.stringify(real.defects['first-interaction']))
})

test('touch tap (browser): a second tap that reloads the page it is on is a navigation, on either side', async () => {
  const nav = html('<header><nav><ul style="margin:0;padding:0;list-style:none"><li id="li" style="display:inline-block"><a id="svc" href="/" style="padding:12px;display:inline-block">Home</a><ul id="sub" style="display:none;position:absolute;list-style:none;margin:0;padding:0"><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li></ul></li></ul></nav></header><main>x</main>', { script: "var n=0;document.getElementById('svc').addEventListener('click',function(e){if(n++===0){e.preventDefault();document.getElementById('sub').style.display='block'}})" })
  const report = await sweep({ port: { '/': nav }, source: { '/': nav }, only: ['first-interaction'], widths: [1024], schemes: ['light'] })
  const row = report.behaviourRows['first-interaction'].find((r) => r.kind === 'touch')
  assert.deepEqual([row.port.taps[1]?.navigated, row.source.taps[1]?.navigated], [true, true], JSON.stringify(row))
  assert.equal(report.defects['first-interaction'].length, 0)
})

test('drawer (browser): a drawer with no sub-level is not tapped through its own opener, which the close button covers; a close button that closes nothing is still a defect', async () => {
  // measured: kinetic source at 768 — the sub-level finder took "Open menu" for a sub opener, the tap hit "Close menu" drawn over it, and the close was then "not found"
  const drawer = (closeWorks, covered = true) => html(`<header><button class="t4-offcanvas-toggle" aria-label="Open menu" style="position:absolute;right:8px;top:8px;width:44px;height:44px"><span class="toggle-bars" style="display:block;width:20px;height:20px;margin:auto;background:#000"></span></button></header><main><p>text</p></main><aside id="drawer" style="display:none;position:fixed;right:0;top:0;width:300px;height:100%;background:#eee"><button class="close js-offcanvas-close" aria-label="Close menu" id="x" style="position:absolute;${covered ? 'right:8px' : 'left:8px'};top:8px;width:44px;height:44px">x</button><a href="/home" style="display:block;margin-top:70px">Home</a><a href="/about" style="display:block">About</a><a href="/contact" style="display:block">Contact</a></aside>`, { script: `var q=function(i){return document.getElementById(i)};document.querySelector('.t4-offcanvas-toggle').onclick=function(){q('drawer').style.display='block'};q('x').onclick=function(){${closeWorks ? "q('drawer').style.display='none'" : ''}}` })
  const ok = await sweep({ port: { '/': drawer(true, false) }, source: { '/': drawer(true) }, only: ['first-interaction'], widths: [390], schemes: ['light'] })
  assert.deepEqual(ok.notMeasured['first-interaction'].filter((n) => n.cause === 'drawer-close-not-found'), [], JSON.stringify(ok.notMeasured['first-interaction']))
  assert.equal(ok.defects['first-interaction'].length, 0, JSON.stringify(ok.defects['first-interaction']))
  const bad = await sweep({ port: { '/': drawer(false, false) }, source: { '/': drawer(true) }, only: ['first-interaction'], widths: [390], schemes: ['light'] })
  assert.ok(bad.defects['first-interaction'].some((d) => d.what === 'drawer-close'), JSON.stringify(bad.defects['first-interaction']))
})

test('forms (browser): a link and a <button> of the same words, a font-size:0 or hidden label, a caption that is no <label for>, and a list inside the form on one side only are the same form; a link and a label the port lacks are not', async () => {
  const css = '*{box-sizing:border-box}input[type=text],input[type=password]{display:block;width:240px;height:24px;margin:0 0 8px}.btn{display:block;width:100px;height:30px;margin:0;padding:0;border:0;background:#ccc;font:inherit}.chk{display:block;height:24px;margin:0 0 8px}ul{margin:0;padding:0;list-style:none}'
  const list = (two) => `<ul><li><a href="/o">One</a></li>${two ? '<li><a href="/t">Two</a></li>' : ''}</ul>`
  const src = (two, remember) => html(`<main><form action="/login" id="adminForm"><label for="n" style="display:none">Name</label><input id="n" name="n" type="text"><input name="pw" type="password"><div class="chk"><input type="checkbox" name="r"><span>${remember}</span></div><a class="btn" href="/send">Send Email</a>${list(two)}</form></main>`, { css })
  const port = (two, remember) => html(`<main><form action="/login"><label style="font-size:0">Name<input name="n" type="text"></label><input name="pw" type="password"><label class="chk"><input type="checkbox" name="r"> ${remember}</label><button type="button" class="btn">Send Email</button></form>${list(two)}</main>`, { css })
  const report = await sweep({ port: { '/same': port(true, 'Remember Me'), '/real': port(false, 'Keep me signed in') }, source: { '/same': src(true, 'Remember Me'), '/real': src(true, 'Remember Me') }, only: ['forms'] })
  const same = report.defects.forms.filter((d) => d.route === '/same')
  assert.deepEqual(same.map((d) => d.cause), [], JSON.stringify(same))
  const real = report.defects.forms.filter((d) => d.route === '/real').map((d) => d.what).sort()
  assert.ok(real.includes('form-links-only-source') && real.includes('form-field-label'), real.join())
})

test('forms (browser): a post link 100 px under a search form is no link of the form, whichever side of the old 100 px line it falls; a login link right under the form is', async () => {
  const css = '*{box-sizing:border-box}input{display:block;width:240px;height:24px;margin:0}a{display:block;height:20px}ul{margin:0;padding:0;list-style:none}'
  // the same latest-posts list below the form on both sides, 99.8 px under the controls on one and 100.8 px on the other (measured: vega /featured-articles at 390)
  const page = (gap, link) => html(`<main><aside><form role="search" action="/s"><input name="s" type="search"></form>${link}<div style="height:${gap}px"></div><ul><li><a href="/post-1">First post title</a></li><li><a href="/post-2">Second post title</a></li></ul></aside></main>`, { css })
  const report = await sweep({ port: { '/posts': page(99.8, ''), '/login': page(200, '<a href="/forgot">Forgot your password?</a>') }, source: { '/posts': page(100.8, ''), '/login': page(200, '') }, only: ['forms'], widths: [390] })
  const posts = report.defects.forms.filter((d) => d.route === '/posts')
  assert.deepEqual(posts.map((d) => d.cause), [], JSON.stringify(posts))
  const login = report.defects.forms.filter((d) => d.route === '/login').map((d) => d.cause)
  assert.deepEqual(login, ['form-links-only-port|search'], JSON.stringify(report.defects.forms))
})

test('fixed widgets (browser): a glyph over another photograph is the same widget; a bigger glyph on the port is a different mark', async () => {
  const widgetPage = (bg, glyph) => html(`<main>page</main><div style="height:3000px;background:${bg}"></div><a id="top" href="#" style="position:fixed;right:0;bottom:16px;width:56px;height:50px"><span style="display:block;width:${glyph}px;height:${glyph}px;margin:${(50 - glyph) / 2}px ${(56 - glyph) / 2}px;background:#fff"></span></a>`)
  const red = 'linear-gradient(#a33,#33a)'
  const green = 'linear-gradient(#3a3,#aa3)'
  const report = await sweep({ port: { '/same': widgetPage(green, 20), '/big': widgetPage(green, 36) }, source: { '/same': widgetPage(red, 20), '/big': widgetPage(red, 20) }, only: ['fixed-widgets'] })
  assert.deepEqual(report.defects['fixed-widgets'].filter((d) => d.route === '/same').map((d) => d.what), [], JSON.stringify(report.defects['fixed-widgets']))
  assert.ok(report.defects['fixed-widgets'].some((d) => d.route === '/big' && d.what === 'fixed-widget-mark-size'), JSON.stringify(report.defects['fixed-widgets']))
})

test('icons (browser): a mark read small on one load that no fresh load shows again is not a defect; a mark that is small on every load still is', async () => {
  const mark = (w, h, host = 'facebook') => `<footer><a href="https://${host}.com/x" style="display:inline-block"><i style="display:inline-block;width:${w}px;height:${h}px;background:#000"></i></a></footer>`
  // the port draws a 10×12 mark for the first browser that asks and 9×17 after it (measured: vega footer facebook, one reading of 34 routes)
  let asked = 0
  const flaky = { body: (req) => html(/Chrome/.test(req.headers['user-agent'] ?? '') && asked++ === 0 ? mark(10, 12, 'instagram') : mark(9, 17, 'instagram')).body }
  const report = await sweep({ port: { '/flaky': flaky, '/real': html(mark(10, 12)) }, source: { '/flaky': html(mark(9, 17, 'instagram')), '/real': html(mark(9, 17)) }, only: ['icons'], confirm: true })
  assert.deepEqual(report.defects.icons.map((d) => [d.route, d.what]), [['/real', 'icon-mark-size']], JSON.stringify(report.defects.icons))
  assert.match(JSON.stringify(report.listed ?? report), /photographed before it settled/, 'the demoted reading is listed with its reason')
})

test('icons (browser): an inline link\'s box is its painted child\'s, so an inline and an inline-flex link holding the same mark have the same box', async () => {
  const foot = (display) => html(`<footer><a href="https://facebook.com/x" style="display:${display}"><i style="display:inline-block;width:40px;height:40px;background:#000"></i></a></footer>`)
  const report = await sweep({ port: { '/': foot('inline-flex') }, source: { '/': foot('inline') }, only: ['icons'] })
  assert.deepEqual(report.defects.icons, [], JSON.stringify(report.defects.icons))
})

test('chips (browser): a wordless icon link is paired by its accessible name; a chip that exists on one side only is still reported', async () => {
  const chipCss = 'a{display:inline-block;padding:4px 10px;border-radius:12px;background:#1d4ed8;color:#fff;font-size:12px;line-height:16px;margin-right:8px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}i{display:inline-block;width:12px;height:12px;background:#fff}'
  const source = html('<main><section><h2>Share this story</h2><a href="#" aria-label="Facebook"><i></i></a></section></main>', { css: chipCss })
  const port = html('<main><section><h2>Share this story</h2><a href="#"><i></i> Facebook</a></section></main>', { css: chipCss })
  const extra = html('<main><section><h2>Share this story</h2><a href="#"><i></i> Facebook</a><a href="#"><i></i> Mastodon</a></section></main>', { css: chipCss })
  const ok = await sweep({ port: { '/': port }, source: { '/': source }, only: ['chips'], widths: [1440] })
  assert.deepEqual(ok.defects.chips.map((d) => d.cause), [], JSON.stringify(ok.defects.chips))
  const bad = await sweep({ port: { '/': extra }, source: { '/': source }, only: ['chips'], widths: [1440] })
  assert.deepEqual(bad.defects.chips.map((d) => d.cause), ['chip-port-only|body|mastodon'])
})

test('chips (browser): the pairing is the same after the width changed as on a fresh load at that width', async () => {
  const chipCss = 'a{display:inline-block;padding:4px 10px;border-radius:12px;background:#1d4ed8;color:#fff;font-size:12px;line-height:16px;margin-right:8px}'
  const src = html('<main><section><h2>Filed under</h2><a href="#">Health</a></section></main>', { css: chipCss })
  // the port\'s page script adds a second "Health" chip when the window is resized after load (a re-cloned list): a fresh load never shows it
  const port = html('<main><section id="s"><h2>Filed under</h2><a href="#">Health</a></section></main>', { css: chipCss, script: "var done=false;addEventListener('resize',function(){if(done)return;done=true;var a=document.createElement('a');a.href='#';a.textContent='Health';document.getElementById('s').appendChild(a)})" })
  const report = await sweep({ port: { '/': port }, source: { '/': src }, only: ['chips'], widths: [1440, 390] })
  assert.equal(check(report, 'chips').notMeasured, 0, JSON.stringify(report.notMeasured.chips))
  assert.equal(report.defects.chips.length, 0, JSON.stringify(report.defects.chips))
})

test('forms (browser): required, focus on load, the link of the region and the focus look are defects; the identical pair is clean', async () => {
  const f = (req, auto, link) => html(`<main><div><form action="/login" id="f"><label for="u">Username</label><input id="u" name="u" type="text" ${req} ${auto}><label for="p">Password</label><input id="p" name="p" type="password" ${req}><button>Log in</button></form>${link}</div></main>`, { css: auto ? 'input:focus{outline:none;border:2px solid #86b7fe}' : 'input:focus{outline:4px solid #f0f}' })
  const src = f('required', 'autofocus', '<a href="/forgot">Forgot your username?</a>')
  const bad = f('', '', '')
  const report = await sweep({ port: { '/bad': bad, '/ok': src }, source: { '/bad': src, '/ok': src }, only: ['forms'] })
  const bads = report.defects.forms.filter((d) => d.route === '/bad')
  assert.deepEqual([...new Set(bads.map((d) => d.what))].sort(), ['form-box', 'form-field-focus-on-load', 'form-field-required', 'form-focus-style', 'form-links-only-source'].filter((w) => bads.some((d) => d.what === w)))
  for (const w of ['form-field-required', 'form-field-focus-on-load', 'form-links-only-source', 'form-focus-style']) assert.ok(bads.some((d) => d.what === w), `${w} in ${JSON.stringify(bads.map((d) => d.what))}`)
  assert.equal(report.defects.forms.filter((d) => d.route === '/ok').length, 0)
})

test('text (browser): a server-side cut against a CSS clamp, and a label in another case, are defects; identical pages are clean', async () => {
  const long = 'Our team keeps designing the whole experience because it is pain, and we do it again and again until it is done well enough to ship to everyone.'
  const page = (excerpt, navCss, clamp) => html(`<header><nav><a href="/x" style="${navCss}">Our Services</a></nav></header><main><section><h2>More</h2><p style="width:240px;${clamp}">${excerpt}</p></section></main>`)
  const src = page(long.slice(0, 80) + '...', 'text-transform:uppercase;font-weight:600', '')
  const bad = page(long, 'font-weight:600', 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden')
  // the same clamp drawn by a wrapper of the text on both sides is the same ending, whichever element hides the lines
  const wrapped = (inner) => html(`<main><section><h2>More</h2><div style="${inner}"><p style="width:240px;margin:0">${long}</p></div></section></main>`)
  const clampA = wrapped('display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden')
  const clampB = wrapped('max-height:48px;overflow:hidden')
  const report = await sweep({ port: { '/bad': bad, '/ok': src, '/clamp': clampB }, source: { '/bad': src, '/ok': src, '/clamp': clampA }, only: ['text'] })
  assert.equal(report.defects.text.filter((d) => d.route === '/clamp').length, 0, JSON.stringify(report.defects.text.filter((d) => d.route === '/clamp')))
  assert.ok(report.defects.text.every((d) => d.route === '/bad'), JSON.stringify(report.defects.text))
  assert.ok(causes(report, 'text').includes('text-cut'), causes(report, 'text').join())
  assert.ok(causes(report, 'text').includes('label-case'))
})

test('first-interaction (browser): the theme click that does nothing on a light system, the first tap that navigates, a drawer with another back row', async () => {
  const css = '[data-theme=dark] body{background:#111;color:#eee}'
  const srcTheme = `var d=document.documentElement;document.getElementById('t').onclick=function(){var cur=d.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');d.setAttribute('data-theme',cur==='dark'?'light':'dark')}`
  const portTheme = (fixed) => `var d=document.documentElement;var m=document.cookie.match(/tracy_theme=(\\w+)/);if(m&&m[1]!=='auto')d.setAttribute('data-theme',m[1]);document.getElementById('t').onclick=function(){var s=(document.cookie.match(/tracy_theme=(\\w+)/)||[])[1];var os=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var cur=d.getAttribute('data-theme')||os;if(!s&&!${fixed}){document.cookie='tracy_theme=auto;path=/';return}var n=cur==='dark'?'light':'dark';document.cookie='tracy_theme='+n+';path=/';d.setAttribute('data-theme',n)}`
  const page = (script) => html('<header><button id="t" aria-label="Toggle dark mode">Mode</button></header><main>text</main>', { css, script })
  const [p, s] = [page(portTheme(false)), page(srcTheme)]
  const report = await sweep({ port: { '/': p }, source: { '/': s }, only: ['first-interaction'], widths: [1440], schemes: ['light'] })
  const bad = report.defects['first-interaction']
  assert.ok(bad.some((d) => d.what === 'theme-first-click-noop' && d.state === 'os-light/no-choice'), JSON.stringify(bad.map((d) => [d.what, d.state])))
  assert.ok(!bad.some((d) => d.state === 'os-light/saved-light' || d.state === 'os-light/saved-dark'), JSON.stringify(bad.map((d) => [d.what, d.state])))
  const ok = await sweep({ port: { '/': page(portTheme(true)) }, source: { '/': s }, only: ['first-interaction'], widths: [1440], schemes: ['light'] })
  assert.equal(ok.defects['first-interaction'].length, 0, JSON.stringify(ok.defects['first-interaction']))
  // the old "auto" value has no switch on a source that stores nothing: shown as a state not compared, not counted as measured
  const c = ok.checks.find((x) => x.id === 'first-interaction')
  assert.ok(c.statesUnavailable.some((u) => u.state === 'os-light/old-auto-value'), JSON.stringify(c.statesUnavailable))
  assert.equal(ok.exit, 0)
  // a page with no switch at all is not-measured with the reason, never clean
  const none = await sweep({ port: { '/': html('<main>x</main>') }, source: { '/': html('<main>x</main>') }, only: ['first-interaction'], widths: [1440], schemes: ['light'] })
  assert.ok(check(none, 'first-interaction').notMeasured > 0)
  assert.equal(none.exit, 3)
})

test('first-interaction (browser): touch menu first tap and the mobile drawer', async () => {
  const nav = (js, upper) => html(`<header><nav><ul style="margin:0;padding:0;list-style:none"><li id="li" style="display:inline-block"><a id="svc" href="/svc" style="padding:12px;display:inline-block">Services</a><ul id="sub" style="display:none;position:absolute;list-style:none;margin:0;padding:0"><li><a href="/a">Alpha</a></li><li><a href="/b">Beta</a></li></ul></li></ul></nav><button class="burger" aria-label="Open menu" style="position:absolute;right:8px;top:8px;width:44px;height:44px">=</button><div id="drawer" style="display:none;position:fixed;right:0;top:0;width:300px;height:100%;background:#eee"><button aria-label="Close menu" id="x">x</button><a href="/home" style="display:block">Home</a><a href="/about" style="display:block">About</a><a href="/contact" style="display:block">Contact</a><button aria-label="Show submenu" aria-expanded="false" id="subt">+</button><div id="back" style="display:none"><button class="back" style="text-transform:${upper}">Our Services</button><a href="/s1" style="display:block">S1</a></div></div></header><main>x</main>`, { script: js })
  const drawerJs = "var q=function(i){return document.getElementById(i)};document.querySelector('.burger').onclick=function(){q('drawer').style.display='block'};q('x').onclick=function(){q('drawer').style.display='none'};q('subt').onclick=function(){q('back').style.display='block'};document.querySelector('.back').onclick=function(){q('back').style.display='none'}"
  const tapJs = (first) => `var li=document.getElementById('li'),n=0;document.getElementById('svc').addEventListener('click',function(e){if(${first}&&n++===0){e.preventDefault();document.getElementById('sub').style.display='block'}})`
  const src = nav(drawerJs + ";" + tapJs(true), 'uppercase')
  const bad = nav(drawerJs + ";" + tapJs(false), 'none')
  const report = await sweep({ port: { '/': bad }, source: { '/': src }, only: ['first-interaction'], widths: [390, 1024], schemes: ['light'] })
  // an identical pair is clean: the same first tap, the same drawer
  const same = await sweep({ port: { '/': src }, source: { '/': src }, only: ['first-interaction'], widths: [390, 1024], schemes: ['light'] })
  assert.equal(same.defects['first-interaction'].length, 0, JSON.stringify(same.defects['first-interaction']))
  const w = report.defects['first-interaction'].map((d) => d.what)
  assert.ok(w.includes('touch-tap-outcome'), JSON.stringify(report.defects['first-interaction']))
  assert.ok(w.includes('drawer-back-row-text'), JSON.stringify(report.defects['first-interaction']))
})

// ---- a missing landmark is not x = 0; a zero-width control is not an icon ---------------------------------------------------

test('drawer push: a main (or header) the page lacks is not measured with its selector, never x = 0', () => {
  const run = (s, p) => judgeFirstInteraction([stripRow(s, p)])
  const missing = run({ pushedMainX: 60 }, { pushedMainX: null })
  assert.deepEqual(missing.listed.filter((l) => l.what === 'drawer-open-push-differs'), [])
  assert.deepEqual(missing.notMeasured.map((n) => [n.cause, n.detail]), [['drawer-push-not-measured', 'main missing on the port']])
  assert.match(missing.notMeasured[0].why, /not measured: main missing/)
  const both = run({ pushedHeaderX: null, pushedMainX: null }, { pushedHeaderX: null, pushedMainX: 0 })
  assert.deepEqual(both.notMeasured.map((n) => n.detail).sort(), ['header missing on the source and the port', 'main missing on the source'])
  // a landmark both sides have is compared as before
  assert.equal(run({ pushedMainX: 60 }, { pushedMainX: 0 }).listed[0].what, 'drawer-open-push-differs')
  assert.equal(run({ pushedMainX: 60 }, { pushedMainX: 60 }).notMeasured.length, 0)
})

test('drawer push (browser): the probe reads null for a page with no <main>, and the check says so', async () => {
  const noMain = (page) => ({ body: page.body.replace('<main>', '<div id="stage">').replace('</main>', '</div>') })
  const report = await drawerRun(noMain(drawerPage()), drawerPage({ push: true }))
  const row = report.behaviourRows['first-interaction'].find((r) => r.kind === 'drawer')
  assert.equal(row.port.pushedMainX, null)
  assert.equal(typeof row.source.pushedMainX, 'number')
  assert.ok(report.notMeasured['first-interaction'].some((n) => n.cause === 'drawer-push-not-measured' && /main missing on the port/.test(n.detail)), JSON.stringify(report.notMeasured['first-interaction']))
  assert.ok(!report.defects['first-interaction'].some((d) => d.what === 'drawer-open-strip' && /main x 0/.test(d.port)))
})

test('drawer push (browser): the content region is main, else [role=main], else the one block between the header and the footer holding the most height; none or equals is not measured', async () => {
  const read = async (markup) => {
    const page = await (await browser.get()).newPage({ viewport: { width: 390, height: 800 } })
    try {
      await page.setContent(`<!doctype html><body style="margin:0">${markup}</body>`)
      return await page.evaluate(pushGeometry)
    } finally {
      await page.close()
    }
  }
  const head = '<header style="height:50px">H</header>'
  const foot = '<footer style="height:50px">F</footer>'
  const blk = (id, h, left = 0) => `<div id="${id}" style="height:${h}px;margin-left:${left}px">x</div>`
  assert.equal((await read(`${head}<main style="margin-left:11px">m</main>${blk('w', 500, 22)}${foot}`)).pushedMainX, 11)
  assert.equal((await read(`${head}<div role="main" style="margin-left:12px">m</div>${blk('w', 500, 22)}${foot}`)).pushedMainX, 12)
  // main wins over an earlier [role=main]; a faded-out main or [role=main] is not the region; a faded-out block taller than the content does not win
  assert.equal((await read(`${head}<div role="main" style="margin-left:12px">r</div><main style="margin-left:11px">m</main>${foot}`)).pushedMainX, 11)
  assert.equal((await read(`${head}<main style="opacity:0;margin-left:11px">m</main><div role="main" style="margin-left:12px">r</div>${foot}`)).pushedMainX, 12)
  assert.equal((await read(`${head}${blk('a', 300, 7)}<div style="opacity:0;height:900px;margin-left:9px">z</div>${foot}`)).pushedMainX, 7)
  // a plain div between the header and the footer; a smaller block beside it does not make it ambiguous; a wrapper around everything is not a candidate
  const plain = await read(`<div id="page">${head}<div id="hero" style="height:80px;margin-left:5px">h</div><div id="content" style="margin-left:33px"><p style="height:400px;margin:0">c</p></div>${foot}</div>`)
  assert.deepEqual([plain.pushedHeaderX, plain.pushedMainX], [0, 33])
  // no header or footer region: nothing to place the block between
  assert.equal((await read(`${blk('a', 400, 7)}${foot}`)).pushedMainX, null)
  assert.equal((await read(`${head}${blk('a', 400, 7)}`)).pushedMainX, null)
  assert.equal((await read(blk('a', 400, 7))).pushedMainX, null)
  // two blocks of equal height; an invisible block is not a candidate
  assert.equal((await read(`${head}${blk('a', 300, 7)}${blk('b', 300, 9)}${foot}`)).pushedMainX, null)
  assert.equal((await read(`${head}${blk('a', 300, 7)}<div style="display:none;height:900px">z</div>${foot}`)).pushedMainX, 7)
})

test('icons (browser): a control clipped inside a zero-width submenu and a control outside the header are not icons of the header; a zero-width parent that shows its child, and a header the page draws without a semantic element, still are', async () => {
  const { iconsInPage } = await import('../visual/site-sweep-behaviour-probe.mjs')
  const svg = '<svg width="20" height="20"><rect width="20" height="20"/></svg>'
  const keys = async (markup) => {
    const page = await (await browser.get()).newPage({ viewport: { width: 1200, height: 800 } })
    try {
      await page.setContent(`<!doctype html><body style="margin:0">${markup}</body>`)
      return (await page.evaluate(iconsInPage)).filter((x) => !/missing/.test(x.unmeasured ?? '')).map((x) => (x.unmeasured ? `!${x.unmeasured}` : `${x.land}:${x.key}`))
    } finally {
      await page.close()
    }
  }
  const social = `<a href="https://x.test/fb" aria-label="Facebook">${svg}</a>`
  // a submenu collapsed to no width and clipped: its button is not seen
  assert.deepEqual(await keys(`<header>${social}<nav><ul><li><a href="/p">Parent</a><ul class="sub-menu" style="width:0;overflow:hidden;position:absolute"><li><button aria-label="More" style="width:20px;height:20px">${svg}</button></li></ul></li></ul></nav></header>`), ['header:x'])
  // a parent with no width whose child is drawn (overflow visible) is a visible control
  assert.deepEqual(await keys(`<header><div style="width:0"><a href="https://x.test/s" aria-label="Search">${svg}</a></div></header>`), ['header:x'])
  // a section named "...header" beside the real header, and a control inside the main content of a wrapper so named, are not the header
  assert.deepEqual(await keys(`<header>${social}</header><section class="hero-header"><a href="https://x.test/b" aria-label="Hero">${svg}</a></section>`), ['header:x'])
  assert.deepEqual(await keys(`<div class="page-header-wrap"><header>${social}</header><main><a href="https://x.test/b" aria-label="Share">${svg}</a></main></div>`), ['header:x'])
  // no semantic header or footer on the page: the region the template names stands in for it
  assert.deepEqual(await keys(`<div id="t3-header">${social}</div><main>x</main><div id="t4-footer" style="margin-top:900px"><a href="https://x.test/tw" aria-label="Twitter">${svg}</a></div>`), ['header:x', 'footer:x'])
  // no semantic header and several boxes named "header" (a header and a hero, a header inside a wrapper so named): they cannot be told apart, none is read
  assert.deepEqual(await keys(`<div id="t3-header">${social}</div><section class="hero-header"><a href="https://hero.test/b" aria-label="Hero">${svg}</a></section><main>x</main>`), ['!header landmark ambiguous'])
  assert.deepEqual(await keys(`<div class="site-header">${social}</div><section id="hero-header"><a href="https://hero.test/b" aria-label="Hero">${svg}</a></section><main>x</main>`), ['!header landmark ambiguous'])
  assert.deepEqual(await keys(`<div class="page-header-wrap"><div id="t3-header">${social}</div><p><a href="https://x.test/o" aria-label="Other">${svg}</a></p></div><main>x</main>`), ['!header landmark ambiguous'])
  // a page that draws no footer says so: the footer is missing
  const raw = await (async () => { const page = await (await browser.get()).newPage(); try { await page.setContent('<!doctype html><body><header>x</header><main>y</main></body>'); return await page.evaluate(iconsInPage) } finally { await page.close() } })()
  assert.deepEqual(raw, [{ land: 'footer', unmeasured: 'footer landmark missing' }])
  // a box named so that is not drawn does not count among the candidates
  assert.deepEqual(await keys(`<div id="t3-header">${social}</div><section class="hero-header" style="display:none"><a href="https://hero.test/b" aria-label="Hero">${svg}</a></section><div class="x-header" style="width:0;height:0"></div><main>x</main>`), ['header:x'])
  // a candidate faded out (its own opacity or a parent's) beside the real header leaves one candidate: measured, not ambiguous
  assert.deepEqual(await keys(`<div id="t3-header">${social}</div><section class="hero-header" style="opacity:0"><a href="https://hero.test/b" aria-label="Hero">${svg}</a></section><main>x</main>`), ['header:x'])
  assert.deepEqual(await keys(`<div id="t3-header">${social}</div><div style="opacity:0"><section class="hero-header"><a href="https://hero.test/b" aria-label="Hero">${svg}</a></section></div><main>x</main>`), ['header:x'])
  // a box with a non-zero box of less than a pixel is drawn: it is the region, not a missing one
  assert.deepEqual(await keys(`<div id="t3-header" style="width:0.5px;height:20px;overflow:visible">${social}</div><main>x</main>`), ['header:x'])
  // a footer control beside a semantic footer is still the footer's
  assert.deepEqual(await keys(`<main>x</main><footer style="margin-top:900px"><a href="https://x.test/tw" aria-label="Twitter">${svg}</a></footer>`), ['footer:x'])
})

test('icons (judge): a header or footer the probe could not read is not measured for that cell, on whichever side it occurs', () => {
  // SYNTHETIC reading: the control was photographed and its glyph read on this side
  const ic = (key) => ({ land: 'header', key, name: key, rect: { x: 10, y: 10, w: 20, h: 20 }, reachable: true, ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: SYN_SHAPE } })
  const un = (why) => ({ land: 'header', unmeasured: `header landmark ${why}` })
  const run = (source, port) => judgeIcons([{ route: '/a', width: 1200, source: { icons: source }, port: { icons: port } }])
  for (const [source, port, side] of [[[un('ambiguous')], [ic('fb')], 'source'], [[ic('fb')], [un('ambiguous')], 'port'], [[un('ambiguous')], [], 'source'], [[ic('fb')], [un('missing')], 'port']]) {
    const j = run(source, port)
    assert.deepEqual(j.defects, [], side)
    assert.equal(j.notMeasured.length, 1, side)
    assert.match(j.notMeasured[0].why, new RegExp(`not measured: ${side} header landmark (ambiguous|missing)`))
  }
  // a region missing on ONE side only is not measured, whatever the other side holds there
  for (const [source, port] of [[[un('missing')], []], [[], [un('missing')]], [[un('missing')], [ic('fb')]]]) {
    const one = run(source, port)
    assert.equal(one.notMeasured.length, 1)
    assert.deepEqual(one.defects, [])
  }
  // a region missing on BOTH sides is an equal absence: no case, no entry
  const both = run([un('missing')], [un('missing')])
  assert.deepEqual([both.cases, both.notMeasured.length, both.defects.length], [0, 0, 0])
  // ambiguous on either side is not measured, also when the other side lacks the region
  for (const [source, port] of [[[un('ambiguous')], [un('missing')]], [[un('missing')], [un('ambiguous')]], [[un('ambiguous')], [un('ambiguous')]]]) {
    assert.equal(run(source, port).notMeasured.length, 1)
  }
  // both sides read: compared as before
  assert.equal(run([ic('fb')], [ic('fb')]).notMeasured.length, 0)
})

test('ja-fresco S-34: a label is compared as shown — the value of an <input type=submit> is not transformed when read, so its text-transform is applied before the case is judged', () => {
  const row = (sl, pl) => ({ route: '/contact', width: 1440, scheme: 'light', source: { text: { blocks: [], labels: sl } }, port: { text: { blocks: [], labels: pl } } })
  const lab = (text, transform) => ({ kind: 'button', land: 'main', text, nth: 0, size: 14, weight: 700, spacing: 1, transform })
  // both sides draw "SEND A MESSAGE": the source <button> reads its innerText, the port <input> its raw value
  assert.deepEqual(judgeText([row([lab('SEND A MESSAGE', 'uppercase')], [lab('Send a message', 'uppercase')])]).defects, [])
  assert.deepEqual(judgeText([row([lab('Read More', 'capitalize')], [lab('read more', 'capitalize')])]).defects, [])
  // a port that does not transform its value still shows other words than the source
  assert.deepEqual(judgeText([row([lab('SEND A MESSAGE', 'uppercase')], [lab('Send a message', 'none')])]).defects.map((d) => d.cause), ['label-case|button|uppercase>none'])
})

test('ja-fresco D-30: a translucent tile shows the page through it — the backdrop is not its mark, the glyph is', () => {
  const W = 50
  const photo = (f) => {
    const png = new PNG({ width: W, height: W })
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) [png.data[(y * W + x) * 4], png.data[(y * W + x) * 4 + 1], png.data[(y * W + x) * 4 + 2], png.data[(y * W + x) * 4 + 3]] = [...f(x, y), 255]
    return png
  }
  // rgba(0,0,0,.5) over a page whose lower part is light and upper part dark, with a 14×9 light chevron in the middle
  const shoot = (edge) => {
    const back = (x, y) => (y >= edge ? [240, 236, 230] : [20, 20, 22])
    const off = photo(back)
    const on = photo((x, y) => (x >= 18 && x < 32 && y >= 21 && y < 30 ? [250, 250, 250] : back(x, y).map((c) => Math.round(c * 0.5))))
    return ownPaint(on, off)
  }
  const s = shoot(21)
  const p = shoot(44)
  assert.deepEqual([s.box, p.box].map((b) => [b.w, b.h]), [[14, 9], [14, 9]])
  const row = { route: '/', width: 1440, scheme: 'light', source: { widgets: [widget({ ink: s })] }, port: { widgets: [widget({ ink: p })] } }
  assert.deepEqual(judgeFixedWidgets([row]).defects, [])
})

test('forms (browser): ja-fresco D-30 — a list of links that starts beside the form is the region\'s whole list; a list that starts far below is not', async () => {
  const { formsInPage } = await import('../visual/site-sweep-behaviour-probe.mjs')
  const linksOf = async (markup) => {
    const page = await (await browser.get()).newPage({ viewport: { width: 390, height: 900 } })
    try {
      await page.setContent(`<!doctype html><body style="margin:0;font:16px/24px sans-serif"><main>${markup}</main></body>`)
      return (await page.evaluate(formsInPage)).find((f) => f.purpose === 'login').links
    } finally {
      await page.close()
    }
  }
  const form = '<form><label for="u">Username</label><input id="u" name="u"><label for="p">Password</label><input id="p" type="password" name="p"><button>Log in</button></form>'
  const list = (items, gap) => `<ul class="other-links" style="margin:${gap}px 0 0;padding:0;list-style:none">${items.map((t) => `<li><a href="/${t.length}">${t}</a></li>`).join('')}</ul>`
  // the source of ja-fresco at 390: three stacked links, the first 20 px under the button, the third 68 px under it
  assert.deepEqual(await linksOf(form + list(['Forgot your password?', 'Forgot your username?', "Don't have an account?"], 20)), ['forgot your password?', 'forgot your username?', "don't have an account?"])
  // a list of posts 100 px below the form is not of the form's region
  assert.deepEqual(await linksOf(form + list(['Post one', 'Post two'], 100)), [])
})

test('text-visible-ending: demoted only where the cell proves the words were painted by a system fallback because the source\'s web font failed — everything else keeps the defect (synthetic readings)', () => {
  const T = 'Our team keeps designing the whole experience because it is pain, and we do it again and again until it is done well enough'
  const SYS = [{ name: 'Synthetic System Serif', custom: false, glyphs: 90 }]
  const WEB = [{ name: 'Synthetic Web', custom: true, glyphs: 90 }]
  const block = (visible, requested, platform) => ({ n: 0, land: 'main', head: 'More', tag: 'p', text: T, visible, clipped: true, requested, fontStyle: 'normal', fontWeight: '400', fontStretch: '100%', ...(platform ? { platform } : {}) })
  // one row per cell: the source's visible words end earlier than the port's; `faces` are the @font-face of the source and how they ended
  const row = (route, width, scheme, { requested = 'Synthetic Web, serif', platform = SYS, faces = [{ family: 'Synthetic Web', status: 'error' }], portRequested = 'Synthetic Web, serif', portLoaded = ['Synthetic Web'] } = {}) => ({
    route,
    width,
    scheme,
    source: { fonts: { body: 'x', loaded: faces.filter((f) => f.status === 'loaded').map((f) => f.family), ...(faces ? { faces: faces.map((f) => ({ unicodeRange: 'U+0-10FFFF', style: 'normal', weight: '400', stretch: '100%', ...f })) } : {}) }, text: { blocks: [block('Our team keeps designing the whole experience because it is pain,', requested, platform)], labels: [] } },
    port: { fonts: { body: 'x', loaded: portLoaded }, text: { blocks: [block('Our team keeps designing the whole experience because', portRequested)], labels: [] } }
  })
  const demoted = (j) => j.listed.filter((l) => l.what === 'text-clamp-visible').map((l) => [l.route, l.width, l.scheme])
  // only the cell whose own reading proves the fallback is demoted; the same route at another width, where the source painted its web font, keeps the defect
  const j = judgeText([row('/fallback', 390, 'light'), row('/normal', 390, 'light', { faces: [{ family: 'Synthetic Web', status: 'loaded' }], platform: WEB }), row('/fallback', 1440, 'light', { faces: [{ family: 'Synthetic Web', status: 'loaded' }], platform: WEB })])
  assert.deepEqual(demoted(j), [['/fallback', 390, 'light']])
  assert.deepEqual(j.defects.map((d) => [d.route, d.width]), [['/normal', 390], ['/fallback', 1440]])
  // a face the source chose on purpose: it declares no web font of that name — a system stack is no fallback
  assert.equal(judgeText([row('/chosen', 390, 'light', { requested: 'Synthetic System Serif, serif', faces: [{ family: 'Synthetic Web', status: 'error' }] })]).defects.length, 1)
  // a web font that is pending (not used yet, still loading) is not a failure
  assert.equal(judgeText([row('/pending', 390, 'light', { faces: [{ family: 'Synthetic Web', status: 'unloaded' }] })]).defects.length, 1)
  // a stack whose first web font failed and whose second loaded and painted: the words were drawn in a web font, not a fallback
  const stack = row('/stack', 390, 'light', { requested: 'Synthetic Primary, Synthetic Secondary, sans-serif', faces: [{ family: 'Synthetic Primary', status: 'error' }, { family: 'Synthetic Secondary', status: 'loaded' }], platform: [{ name: 'Synthetic Secondary', custom: true, glyphs: 90 }] })
  assert.equal(judgeText([stack]).defects.length, 1)
  // a face limited to other scripts is skipped by its unicode-range, not by failure: it errored on other text of the page, the Latin block was drawn in a system font by range
  const ranged = (unicodeRange) => judgeText([row('/ranged', 390, 'light', { faces: [{ family: 'Synthetic Web', status: 'error', unicodeRange }] })])
  assert.equal(ranged('U+0400-04FF').defects.length, 1)
  assert.equal(ranged('U+0-7F').defects.length, 0)
  assert.equal(ranged('U+0-1F, U+20-7F, U+4??').defects.length, 0)
  // the faces of a family together: Latin in one, the rest in another — both ranges are needed to cover the text, and one that does not leaves a character out
  const T_ACCENT = 'Our team keeps designing the whole experience because it is pain, and we do it again and again until it is done well enough é' // language-allow: data: accented text
  const accented = row('/accent', 390, 'light', { faces: [{ family: 'Synthetic Web', status: 'error', unicodeRange: 'U+0-7F' }, { family: 'Synthetic Web', status: 'error', unicodeRange: 'U+80-FF' }] })
  accented.source.text.blocks[0].text = T_ACCENT
  accented.port.text.blocks[0].text = T_ACCENT
  assert.equal(judgeText([accented]).defects.length, 0)
  accented.source.fonts.faces[1].unicodeRange = 'U+100-17F'
  assert.equal(judgeText([accented]).defects.length, 1)
  // two faces of one family: the face drawing the Latin block decides, not the failed Cyrillic one
  const two = (cyr, lat, block = {}) => {
    const r = row('/two', 390, 'light', { faces: [{ family: 'Synthetic Web', status: cyr, unicodeRange: 'U+0400-04FF' }, { family: 'Synthetic Web', status: lat, unicodeRange: 'U+0-FF' }] })
    Object.assign(r.source.text.blocks[0], block)
    return judgeText([r])
  }
  assert.equal(two('error', 'unloaded').defects.length, 1)
  assert.equal(two('unloaded', 'error').defects.length, 0)
  // a failed face of a weight or style the block does not use is not the face it would select
  const weighted = (faceWeight, faceStyle, block) => {
    const r = row('/weighted', 390, 'light', { faces: [{ family: 'Synthetic Web', status: 'error', weight: faceWeight, style: faceStyle }, { family: 'Synthetic Web', status: 'unloaded', weight: '400', style: 'normal' }] })
    Object.assign(r.source.text.blocks[0], block)
    return judgeText([r])
  }
  assert.equal(weighted('700', 'normal', { fontWeight: '400', fontStyle: 'normal' }).defects.length, 1)
  assert.equal(weighted('400', 'italic', { fontWeight: '400', fontStyle: 'normal' }).defects.length, 1)
  assert.equal(weighted('700', 'normal', { fontWeight: '700', fontStyle: 'normal' }).defects.length, 0)
  // a loaded face of another script does not veto a failed face that draws this block
  assert.equal(two('loaded', 'error').defects.length, 0)
  // CSS matching is directional: at weight 300 the lighter unloaded 100 face is chosen before the heavier failed 400 face; at 600 the heavier failed 700 comes before 300
  const competing = (weights, block) => {
    const r = row('/competing', 390, 'light', { faces: weights.map(([weight, status]) => ({ family: 'Synthetic Web', status, weight, style: 'normal' })) })
    Object.assign(r.source.text.blocks[0], block)
    return judgeText([r])
  }
  assert.equal(competing([['100', 'unloaded'], ['400', 'error']], { fontWeight: '300' }).defects.length, 1)
  assert.equal(competing([['400', 'unloaded'], ['700', 'error']], { fontWeight: '600' }).defects.length, 0)
  assert.equal(competing([['400', 'unloaded'], ['700', 'error']], { fontWeight: '500' }).defects.length, 1)
  assert.equal(competing([['700', 'unloaded'], ['400', 'error']], { fontWeight: '600' }).defects.length, 1)
  // style: an italic block takes the italic face before the oblique one; a normal block never takes either before the normal face
  const styled = (faces, block) => {
    const r = row('/styled', 390, 'light', { faces: faces.map(([style, status, extra]) => ({ family: 'Synthetic Web', status, style, ...extra })) })
    Object.assign(r.source.text.blocks[0], block)
    return judgeText([r])
  }
  assert.equal(styled([['italic', 'error'], ['oblique', 'unloaded']], { fontStyle: 'italic' }).defects.length, 0)
  assert.equal(styled([['italic', 'unloaded'], ['oblique', 'error']], { fontStyle: 'italic' }).defects.length, 1)
  assert.equal(styled([['normal', 'unloaded'], ['oblique', 'error']], { fontStyle: 'normal' }).defects.length, 1)
  // stretch is matched before style: the condensed failed italic face loses to the normal-width unloaded normal face
  assert.equal(styled([['italic', 'error', { stretch: '75%' }], ['normal', 'unloaded', { stretch: '100%' }]], { fontStyle: 'italic', fontStretch: '100%' }).defects.length, 1)
  // an unreadable descriptor on the block or a face proves nothing
  assert.equal(styled([['italic', 'error']], { fontStyle: 'italic', fontWeight: undefined }).defects.length, 1)
  assert.equal(styled([['wobbly', 'error']], {}).defects.length, 1)
  // a range that cannot be read, or none at all, proves nothing
  assert.equal(ranged('not a range').defects.length, 1)
  assert.equal(ranged(undefined).defects.length, 1)
  // a stack whose FIRST family is the failed web font and which nothing else painted: the browser skipped it for a system font, demoted
  assert.deepEqual(demoted(judgeText([row('/stack-failed', 390, 'light', { requested: 'Synthetic Primary, Synthetic Secondary, sans-serif', faces: [{ family: 'Synthetic Primary', status: 'error' }, { family: 'Synthetic Secondary', status: 'error' }] })])), [['/stack-failed', 390, 'light']])
  // a system font BEFORE the broken web font paints the block itself: the broken font elsewhere in the stack, or on the page, is not why the words wrap so
  assert.equal(judgeText([row('/system-first', 390, 'light', { requested: 'Synthetic System Sans, Synthetic Web, sans-serif', faces: [{ family: 'Synthetic Web', status: 'error' }] })]).defects.length, 1)
  // the failed web font only second, after another web font that loaded but painted nothing here: not the exact form either
  assert.equal(judgeText([row('/second', 390, 'light', { requested: 'Synthetic Other, Synthetic Web, sans-serif', faces: [{ family: 'Synthetic Other', status: 'loaded' }, { family: 'Synthetic Web', status: 'error' }] })]).defects.length, 1)
  // a face that loaded in one place and failed in another (several faces of the family): a loaded face is no failure
  assert.equal(judgeText([row('/mixed', 390, 'light', { faces: [{ family: 'Synthetic Web', status: 'error' }, { family: 'Synthetic Web', status: 'loaded' }] })]).defects.length, 1)
  // missing evidence proves nothing: no platform fonts of the block, no @font-face list, no fonts reading at all
  assert.equal(judgeText([row('/no-platform', 390, 'light', { platform: null })]).defects.length, 1)
  const noFaces = row('/no-faces', 390, 'light')
  delete noFaces.source.fonts.faces
  assert.equal(judgeText([noFaces]).defects.length, 1)
  const bare = row('/bare', 390, 'light')
  delete bare.source.fonts
  assert.equal(judgeText([bare]).defects.length, 1)
  // the port must have drawn its words in a web font it loaded: a port that did not load its font explains nothing
  assert.equal(judgeText([row('/port-system', 390, 'light', { portLoaded: [] })]).defects.length, 1)
})

test('text (browser): a clamped block is read with the fonts that painted it and the @font-face list of the page — a web font that answers 404 is an error, a system stack is no @font-face', async () => {
  const words = 'Our team keeps designing the whole experience because it is pain, and we do it again and again until it is done well enough for everyone who reads it today'
  const clamp = 'width:260px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden'
  const page = (family, face) => html(`<main><h2>More</h2><p id="t" style="${clamp};font-family:${family}">${words}</p></main>`, { css: face })
  const broken = '@font-face{font-family:"Synthetic Web";src:url(/missing.woff2) format("woff2")}'
  const report = await sweep({ port: { '/web': page('serif'), '/sys': page('serif') }, source: { '/web': page("'Synthetic Web', serif", broken), '/sys': page('Georgia, serif') }, only: ['text'] })
  const rowOf = (route) => report.behaviourRows.text.find((r) => r.route === route)
  const web = rowOf('/web').source
  const block = web.text.blocks.find((b) => b.clipped)
  assert.ok(block, JSON.stringify(web.text.blocks))
  assert.match(block.requested, /Synthetic Web/)
  assert.ok(Array.isArray(block.platform) && block.platform.length > 0 && block.platform.every((f) => f.custom === false), JSON.stringify(block.platform))
  assert.deepEqual(web.fonts.faces, [{ family: 'Synthetic Web', status: 'error', unicodeRange: 'U+0-10FFFF', style: 'normal', weight: 'normal', stretch: 'normal' }])
  // a face limited to Cyrillic that errored where Cyrillic text used it says nothing about the Latin block, which the browser drew in a system font by range
  const cyr = '@font-face{font-family:"Synthetic Ranged";src:url(/missing.woff2) format("woff2");unicode-range:U+0400-04FF}'
  const ranged = (family) => html(`<main><h2>More</h2><p id="c" style="font-family:${family}">Привет мир</p><p id="t" style="${clamp};font-family:${family}">${words}</p></main>`, { css: cyr })
  const r2 = await sweep({ port: { '/ranged': page('serif') }, source: { '/ranged': ranged("'Synthetic Ranged', serif") }, only: ['text'] })
  const src = r2.behaviourRows.text.find((r) => r.route === '/ranged').source
  const face = src.fonts.faces.find((f) => f.family === 'Synthetic Ranged')
  assert.equal(face.status, 'error')
  assert.match(face.unicodeRange, /400/)
  const latin = src.text.blocks.find((b) => b.clipped)
  assert.ok(latin.platform.every((f) => f.custom === false))
  assert.equal(rangesCover([face.unicodeRange], latin.text), false)
  // a system stack the source chose declares no @font-face: nothing failed
  const sys = rowOf('/sys').source
  assert.deepEqual(sys.fonts.faces, [])
  assert.ok(sys.text.blocks.find((b) => b.clipped).platform.every((f) => f.custom === false))
})

// ---- glyph, top band and short labels -----------------------------------------------------------------------------------

// two drawings of one box: a bird-like silhouette and a cross. Anonymous shapes; they stand for any pair of different glyphs.
const BIRD = '<path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>'
const CROSS = '<path d="M3 3l18 18M21 3L3 21" stroke="currentColor" stroke-width="3.6" fill="none"/>'
const social = (glyph, { href = 'https://social.test/morgan', tile = 'background:#1d4ed8;border-radius:50%', glyphColour = '#fff', size = 32, name = 'Follow' } = {}) =>
  `<a href="${href}" aria-label="${name}" style="display:inline-block;width:${size}px;height:${size}px;${tile}"><svg viewBox="0 0 24 24" width="${size * 0.56}" height="${size * 0.56}" style="margin:${size * 0.22}px;fill:${glyphColour};color:${glyphColour};display:block">${glyph}</svg></a>`
const shell = (head, { main = '<p>page</p>', foot = '<p>f</p>' } = {}) => html(`${head}<main>${main}</main><footer>${foot}</footer>`)

test('icon glyph (browser): a cross where the source draws the bird is a defect with both shapes, on a round tile, a square tile and bare; the same glyph is quiet', async () => {
  const head = (g, o) => `<header><div style="padding:8px">${social(g, o)}</div></header>`
  const cases = {
    '/round': [head(BIRD), head(CROSS)],
    '/square': [head(BIRD, { tile: 'background:#1d4ed8' }), head(CROSS, { tile: 'background:#1d4ed8' })],
    '/bare': [head(BIRD, { tile: '', glyphColour: '#111' }), head(CROSS, { tile: '', glyphColour: '#111' })],
    '/same': [head(BIRD), head(BIRD)],
    // the same bird drawn at another sub-pixel place and a pixel larger on the port: raster variation, not another glyph
    '/shifted': [head(BIRD), `<header><div style="padding:8.4px 8px 8px 8.4px">${social(BIRD)}</div></header>`]
  }
  const report = await sweep({ source: Object.fromEntries(Object.entries(cases).map(([r, [s]]) => [r, shell(s)])), port: Object.fromEntries(Object.entries(cases).map(([r, [, p]]) => [r, shell(p)])), only: ['icons'] })
  const glyph = report.defects.icons.filter((d) => d.what === 'icon-glyph')
  assert.deepEqual(glyph.map((d) => d.route).sort(), ['/bare', '/round', '/square'], JSON.stringify(report.defects.icons))
  for (const d of glyph) {
    assert.match(d.source, /glyph \d+×\d+ cells/)
    assert.ok(d.sourceShape.length > 4 && d.portShape.length > 4, 'both shapes are in the finding')
    assert.notDeepEqual(d.sourceShape, d.portShape)
  }
  assert.equal(report.defects.icons.filter((d) => d.route === '/same' || d.route === '/shifted').length, 0, JSON.stringify(report.defects.icons))
  assert.equal(report.exit, 1)
})

test('icon glyph (browser): a glyph the fresh-load confirmation reads again stays a defect', async () => {
  const head = (g) => `<header>${social(g)}</header>`
  const report = await sweep({ source: { '/a': shell(head(BIRD)) }, port: { '/a': shell(head(CROSS)) }, only: ['icons'], confirm: true })
  assert.deepEqual(causes(report, 'icons'), ['icon-glyph'])
  assert.equal(report.exit, 1)
})

test('icons (browser): a topbar drawn before the header and one drawn inside it are the same row — paired by name, not left over as icon-only or unpairable, at 1440 and 390', async () => {
  const links = (extra = '') => ['Facebook', 'Twitter', 'Linkedin'].map((n, i) => social(BIRD, { href: `https://${n.toLowerCase()}.test/m`, name: n, size: 24 + (extra ? 0 : 0) })).join('')
  const outside = shell(`<div class="topbar" style="padding:6px">${links()}</div><header style="padding:10px"><a href="/">Morgan</a></header>`)
  const inside = shell(`<header><div class="topbar" style="padding:6px">${links()}</div><div style="padding:10px"><a href="/">Morgan</a></div></header>`)
  for (const width of [1440, 390]) {
    const report = await sweep({ source: { '/p': outside }, port: { '/p': inside }, only: ['icons'], widths: [width] })
    assert.equal(report.defects.icons.length, 0, `${width}: ${JSON.stringify(report.defects.icons)}`)
    assert.equal(check(report, 'icons').notMeasured, 0, `${width}: ${JSON.stringify(report.notMeasured?.icons)}`)
    assert.ok(check(report, 'icons').cases >= 3, `${width}: three controls were compared`)
  }
  // the topbar is still compared: another glyph in it is found although it sits outside the header on one side
  const crossed = shell(`<header><div class="topbar" style="padding:6px">${social(CROSS, { href: 'https://twitter.test/m', name: 'Twitter', size: 24 })}</div></header>`)
  const bird = shell(`<div class="topbar" style="padding:6px">${social(BIRD, { href: 'https://twitter.test/m', name: 'Twitter', size: 24 })}</div><header style="padding:10px"><a href="/">Morgan</a></header>`)
  const report = await sweep({ source: { '/p': bird }, port: { '/p': crossed }, only: ['icons'] })
  assert.deepEqual(causes(report, 'icons'), ['icon-glyph'], JSON.stringify(report.defects.icons))
})

test('icons (browser): twitter.com and x.com are one network; a control that merely holds the letter x is not a social one, and a close cross is not X', async () => {
  const { iconsInPage } = await import('../visual/site-sweep-behaviour-probe.mjs')
  const page = await (await browser.get()).newPage({ viewport: { width: 1200, height: 600 } })
  try {
    const svg = '<svg width="20" height="20"><rect width="20" height="20"/></svg>'
    const { origin } = await serve({ '/': html(`<header>
      <a href="https://twitter.com/m" aria-label="Twitter">${svg}</a>
      <a href="https://x.com/m" aria-label="Profile">${svg}</a>
      <a href="/a" class="icon-x" aria-label="Share">${svg}</a>
      <a href="/b" class="fa-x-twitter" aria-label="Share">${svg}</a>
      <a href="/c" aria-label="Index">${svg}</a>
      <a href="/d" aria-label="Box">${svg}</a>
      <button class="close-x" aria-label="Close">${svg}</button></header><main>x</main><footer>f</footer>`) })
    await page.goto(`${origin}/`)
    const got = (await page.evaluate(iconsInPage)).filter((x) => x.land === 'header' && !x.unmeasured)
    const net = Object.fromEntries(got.map((x) => [x.name, x.network]))
    assert.equal(net.Twitter, 'x-twitter')
    assert.equal(net.Profile, 'x-twitter')
    assert.equal(got.find((x) => x.path === '/a').network, 'x-twitter')
    assert.equal(got.find((x) => x.path === '/b').network, 'x-twitter')
    assert.equal(net.Index, '')
    assert.equal(net.Box, '')
    assert.equal(net.Close, '')
  } finally {
    await page.close()
  }
  // the network pairs two controls whose host names differ
  const ic = (o) => ({ land: 'header', order: 0, key: '', name: '', href: '', role: '', path: '', network: '', tag: 'a', rect: { x: 0, y: 0, w: 24, h: 24 }, reachable: true, ...o })
  const { pairs, unpaired } = pairIcons([ic({ key: 'twitter', network: 'x-twitter' }), ic({ key: 'facebook', network: 'facebook', rect: { x: 40, y: 0, w: 24, h: 24 } })], [ic({ key: 'facebook', network: 'facebook', rect: { x: 40, y: 0, w: 24, h: 24 } }), ic({ key: 'x', network: 'x-twitter' })])
  assert.deepEqual(pairs.map((p) => [p.source.key, p.port.key]).sort(), [['facebook', 'facebook'], ['twitter', 'x']])
  assert.deepEqual([unpaired.source.length, unpaired.port.length], [0, 0])
})

test('icons (judge): synthetic readings — a glyph of another drawing is a defect, a glyph that could not be read or photographed is not-measured, never quiet', () => {
  // coverage rows (0 ground … 9 painted), marked synthetic: hand-built readings of two different drawings
  const shape = (rows) => ({ w: rows[0].length, h: rows.length, rows, cells: rows.join('').split('').filter((c) => Number(c) >= 4).length })
  const A = shape(['009900', '099990', '999999', '099990', '009900', '000000'])
  const B = shape(['900009', '090090', '009900', '009900', '090090', '900009'])
  const ic = (o = {}) => ({ land: 'header', order: 0, key: 'follow', name: 'Follow', href: 'https://social.test/m', tag: 'a', rect: { x: 0, y: 0, w: 24, h: 24 }, mark: {}, reachable: true, ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: A }, ...o })
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { icons: [s] }, port: { icons: [p] } })
  assert.equal(judgeIcons([row(ic(), ic())]).defects.length, 0)
  const diff = judgeIcons([row(ic(), ic({ ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: B } }))])
  assert.deepEqual(diff.defects.map((d) => d.what), ['icon-glyph'])
  assert.deepEqual(diff.defects[0].sourceShape.slice(0, 1), ['..##..'])
  assert.ok(diff.defects[0].portShape.length === 6)
  const unread = judgeIcons([row(ic(), ic({ ink: { ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: null } }))])
  assert.deepEqual([unread.defects.length, unread.notMeasured.map((n) => n.cause)], [0, ['icon-glyph-not-read']])
  const lost = judgeIcons([row(ic(), ic({ ink: null }))])
  assert.deepEqual([lost.defects.length, lost.notMeasured.map((n) => n.cause)], [0, ['icon-not-rasterised']])
})

test('text labels (judge): synthetic readings — changed words of a paired short label are a defect with both strings; equal, moved numbers and unmatched sets are not', () => {
  const lab = (kind, text, o = {}) => ({ kind, land: kind === 'footer' ? 'footer' : 'header', text, nth: 0, path: '', x: 100, y: 40, size: 16, weight: 400, spacing: 0, transform: 'none', family: 'Arial', ...o })
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { text: { blocks: [], labels: s } }, port: { text: { blocks: [], labels: p } } })
  const j = judgeText([
    row(
      [lab('logo', 'Morgan.'), lab('nav', 'Home', { path: '/' }), lab('nav', 'News', { path: '/news' }), lab('nav', 'Contact', { path: '/contact' })],
      [lab('logo', 'JA Morgan.'), lab('nav', 'Home', { path: '/' }), lab('nav', 'Blog', { path: '/news' }), lab('nav', 'Contact', { path: '/contact' })]
    )
  ])
  assert.deepEqual(j.defects.map((d) => [d.what, d.source, d.port]), [['text-label-differs', '"Morgan."', '"JA Morgan."'], ['text-label-differs', '"News"', '"Blog"']])
  // equal short labels, and a number that changed, are quiet
  const quiet = judgeText([row([lab('logo', 'Morgan.'), lab('button', 'Hits: 383')], [lab('logo', 'Morgan.'), lab('button', 'Hits: 442')])])
  assert.deepEqual([quiet.defects.length, quiet.notMeasured.length], [0, 0])
  // a label the other side has nothing in its place for is a defect of its own (missing on the port, or extra on it), not a changed word
  const extra = judgeText([row([lab('nav', 'Home'), lab('nav', 'Shop')], [lab('nav', 'Home')])])
  assert.deepEqual(extra.defects.map((d) => [d.what, d.source, d.port]), [['text-label-only-source', '"Shop"', 'none']])
  const added = judgeText([row([lab('nav', 'Home')], [lab('nav', 'Home'), lab('nav', 'Shop')])])
  assert.deepEqual(added.defects.map((d) => [d.what, d.source, d.port]), [['text-label-only-port', 'none', '"Shop"']])
  // two labels on each side between the same anchors, with no link or place to tell them by: not measured, never guessed
  const crowd = judgeText([row([lab('nav', 'Home'), lab('nav', 'A', { path: '/a' }), lab('nav', 'B'), lab('nav', 'Z')], [lab('nav', 'Home'), lab('nav', 'C', { path: '/c' }), lab('nav', 'D'), lab('nav', 'E'), lab('nav', 'Z')])])
  assert.equal(crowd.defects.length, 0, JSON.stringify(crowd.defects))
  assert.deepEqual(crowd.notMeasured.map((n) => n.cause), ['labels-unpairable'])
})

test('text labels (browser): changed words of the logo, a nav item, a button, a pagination link and a footer line are each a text finding; equal labels are clean', async () => {
  const page = (o) =>
    shell(
      `<header style="padding:10px"><a class="brand" href="/" style="font-size:22px;font-weight:700">${o.logo}</a><nav><a href="/news">${o.nav}</a> <a href="/contact">Contact</a></nav></header>`,
      {
        main: `<p>Intro.</p><button type="button">${o.button}</button><div class="pagination"><a href="/p?page=2">${o.next}</a></div>`,
        foot: `<p>${o.line}</p><p>All rights reserved</p>`
      }
    )
  const src = { logo: 'Morgan.', nav: 'News', button: 'Read more', next: 'Next', line: 'Powered by us' }
  const port = { logo: 'JA Morgan.', nav: 'Blog', button: 'Learn more', next: 'Older', line: 'Built by us' }
  const report = await sweep({ source: { '/bad': page(src), '/ok': page(src) }, port: { '/bad': page(port), '/ok': page(src) }, only: ['text'] })
  const got = report.defects.text.filter((d) => d.what === 'text-label-differs')
  assert.deepEqual(got.map((d) => [d.route, d.source, d.port]).sort((a, b) => a[1].localeCompare(b[1])), [
    ['/bad', '"Morgan."', '"JA Morgan."'],
    ['/bad', '"News"', '"Blog"'],
    ['/bad', '"Next"', '"Older"'],
    ['/bad', '"Powered by us"', '"Built by us"'],
    ['/bad', '"Read more"', '"Learn more"']
  ], JSON.stringify(report.defects.text))
  assert.equal(report.defects.text.filter((d) => d.route === '/ok').length, 0)
  assert.equal(report.exit, 1)
})

test('header (browser): different logo wording does not hide a logo of another size', async () => {
  const page = (text, size) => shell(`<header style="padding:10px"><a class="brand" href="/" style="font-size:${size}px;font-weight:700">${text}</a></header>`)
  const report = await sweep({ source: { '/a': page('Morgan.', 22) }, port: { '/a': page('JA Morgan.', 30) }, only: ['header', 'text'] })
  assert.ok(causes(report, 'header').some((w) => /header-logo-font-size/.test(w)), JSON.stringify(report.defects.header))
  assert.ok(causes(report, 'text').includes('text-label-differs'), JSON.stringify(report.defects.text))
})

test('icon glyph (browser): the same glyph drawn at a sub-pixel offset and a pixel larger on the port is quiet; a different one at that size is not', async () => {
  const at = (g, { dx = 0, size = 32 } = {}) => `<header style="padding:8px"><div style="transform:translate(${dx}px,${dx}px)">${social(g, { size, tile: 'background:#1d4ed8;border-radius:50%' })}</div></header>`
  const report = await sweep({
    source: { '/quiet': shell(at(BIRD)), '/loud': shell(at(BIRD)) },
    port: { '/quiet': shell(at(BIRD, { dx: 0.4, size: 33 })), '/loud': shell(at(CROSS, { dx: 0.4, size: 33 })) },
    only: ['icons']
  })
  assert.deepEqual([...new Set(report.defects.icons.filter((d) => d.what === 'icon-glyph').map((d) => d.route))], ['/loud'], JSON.stringify(report.defects.icons))
})

test('icons (browser): a menu button drawn by bars with a hidden word inside is an icon control, paired by place with the other side\'s', async () => {
  const bars = '<span style="display:block;width:14px;height:2px;background:#fff;margin:5px"></span>'.repeat(3)
  const src = shell(`<header style="padding:8px"><button type="button" class="off-canvas-toggle" style="width:30px;height:30px;background:#d33;border:0">${bars.replaceAll('</span>', '<span class="hidden" style="display:none">bar</span></span>')}</button></header>`)
  const port = shell(`<header style="padding:8px"><button type="button" aria-label="Open the sidebar" style="width:30px;height:30px;background:#d33;border:0">${bars}</button></header>`)
  const report = await sweep({ source: { '/p': src }, port: { '/p': port }, only: ['icons'] })
  assert.equal(report.defects.icons.length, 0, JSON.stringify(report.defects.icons))
  assert.ok(check(report, 'icons').cases >= 1)
})

test('icon glyph (browser): a divider drawn as the control\'s own border is no part of its glyph', async () => {
  const cell = (border) => `<header style="padding:0;background:#1e3a5f"><a href="https://social.test/m" aria-label="Follow" style="display:inline-block;width:60px;height:60px;${border}"><svg viewBox="0 0 24 24" width="20" height="20" style="margin:20px;fill:#fff;display:block">${BIRD}</svg></a></header>`
  const report = await sweep({ source: { '/p': shell(cell('border-left:2px solid #c0cce0;border-right:2px solid #c0cce0')) }, port: { '/p': shell(cell('')) }, only: ['icons'] })
  assert.equal(report.defects.icons.filter((d) => d.what === 'icon-glyph').length, 0, JSON.stringify(report.defects.icons))
})

test('icon glyph (browser): the page showing in the rounded corner of a band that ends at the control is no part of its glyph', async () => {
  const cell = (radius) => `<div style="background:#1e3a5f;border-radius:0 ${radius}px 0 0;width:100px;margin-left:20px"><div><div><div><a href="https://social.test/m" aria-label="Follow" style="display:block;box-sizing:border-box;width:100px;height:60px;padding:20px 40px"><svg viewBox="0 0 24 24" width="20" height="20" style="fill:#fff;display:block">${BIRD}</svg></a></div></div></div></div>`
  const report = await sweep({ source: { '/p': shell(`<header>${cell(40)}</header>`) }, port: { '/p': shell(`<header>${cell(0)}</header>`) }, only: ['icons'] })
  assert.equal(report.defects.icons.filter((d) => d.what === 'icon-glyph').length, 0, JSON.stringify(report.defects.icons))
})

test('icon glyph (browser): a tile on a half pixel next to a dark page is read as its glyph, not as the page showing at its edge', async () => {
  // the tile is blue on a near-black page and sits 0.66 px down: the photograph takes in a row of the dark page, whose colour is within
  // reach of the blue tile — the glyph must not be taken for page
  const cell = (dy) => `<header style="background:#111;padding:20px 0"><div style="padding-top:${dy}px"><a href="https://social.test/m" aria-label="Follow" style="display:inline-block;width:30px;height:30px;background:#3b5998;border-radius:4px;margin-left:20px"><svg viewBox="0 0 24 24" width="16" height="16" style="margin:7px;fill:#fff;display:block">${BIRD}</svg></a></div></header>`
  const report = await sweep({ source: { '/p': shell(cell(0.66)) }, port: { '/p': shell(cell(0)) }, only: ['icons'] })
  assert.equal(report.defects.icons.filter((d) => d.what === 'icon-glyph').length, 0, JSON.stringify(report.defects.icons))
  // and a different glyph on the same tile is still found
  const other = await sweep({ source: { '/p': shell(cell(0.66)) }, port: { '/p': shell(cell(0).replace(BIRD, CROSS).replace('fill:#fff', 'fill:#fff;color:#fff')) }, only: ['icons'] })
  assert.ok(other.defects.icons.some((d) => d.what === 'icon-glyph'), JSON.stringify(other.defects.icons))
})

// ---- round 4: evidence for every pairing, a measured comparison or a named gap for every paired glyph ---------------------

test('icons (judge): synthetic readings — two failed photographs, an absent shape and a glyph with nothing painted are each a named gap, never quiet', () => {
  const ink = (o = {}) => ({ ratio: 0.3, bg: [0, 0, 0], box: { w: 14, h: 14 }, shape: SYN_SHAPE, ...o })
  const ic = (o = {}) => ({ land: 'header', order: 0, key: 'follow', name: 'Follow', href: 'https://social.test/m', tag: 'a', rect: { x: 0, y: 0, w: 24, h: 24 }, mark: {}, reachable: true, ink: ink(), ...o })
  const run = (s, p) => judgeIcons([{ route: '/', width: 1440, scheme: 'light', source: { icons: [s] }, port: { icons: [p] } }])
  const causesOf = (j) => j.notMeasured.map((n) => n.cause)
  assert.deepEqual(causesOf(run(ic({ ink: null }), ic({ ink: null }))), ['icon-not-rasterised'])
  assert.deepEqual(causesOf(run(ic({ ink: ink({ shape: undefined }) }), ic({ ink: ink({ shape: undefined }) }))), ['icon-glyph-not-read'])
  assert.deepEqual(causesOf(run(ic(), ic({ ink: ink({ shape: { w: 6, h: 6, rows: Array(6).fill('000000'), cells: 0 } }) }))), ['icon-glyph-not-read'])
  // a control that draws nothing on either side has no glyph to compare: listed, and not a defect
  const none = run(ic({ ink: ink({ ratio: 0, box: null, shape: undefined }) }), ic({ ink: ink({ ratio: 0, box: null, shape: undefined }) }))
  assert.deepEqual([none.defects.length, none.notMeasured.length, none.listed.map((l) => l.what)], [0, 0, ['icon-no-mark-either']])
})

test('icons (judge): synthetic readings — several controls left on both sides are paired by an exact place or not at all, never by order or by being near', () => {
  const ic = (key, x, o = {}) => ({ land: 'header', order: 0, key, name: key, href: '', role: '', path: '', network: '', tag: 'a', rect: { x, y: 0, w: 24, h: 24 }, reachable: true, ...o })
  // the same row in the same places: paired by position (one control of that size at each place)
  const same = pairIcons([ic('a', 0), ic('b', 40)], [ic('c', 2), ic('d', 42)])
  assert.deepEqual([same.pairs.length, same.pairs.map((p) => p.by), same.unpaired.source.length], [2, ['position', 'position'], 0])
  // a row shifted by 10 px with 20 px between controls: each control is within reach of two on the other side, so order proves nothing
  const near = pairIcons([ic('a', 0), ic('b', 20)], [ic('c', 10), ic('d', 30)])
  assert.deepEqual([near.pairs.length, near.unpaired.source.length, near.unpaired.port.length], [0, 2, 2])
  // one port control at the place of two source controls (10 px apart, the port control 5 px from each): it pairs with neither, and the remaining
  // control on each side is not paired by elimination because of it
  const two = pairIcons([ic('a', 0), ic('b', 10)], [ic('c', 5), ic('d', 300)])
  assert.deepEqual([two.pairs.length, two.unpaired.source.length, two.unpaired.port.length], [0, 2, 2])
  // a single control left on each side is the same control by elimination
  const one = pairIcons([ic('a', 0)], [ic('c', 90)])
  assert.deepEqual([one.pairs.length, one.pairs[0].by], [1, 'elimination'])
  // a row reordered or moved far: nothing says which is which
  const moved = pairIcons([ic('a', 0), ic('b', 40)], [ic('c', 300), ic('d', 340)])
  assert.deepEqual([moved.pairs.length, moved.unpaired.source.length, moved.unpaired.port.length], [0, 2, 2])
  const j = judgeIcons([{ route: '/', width: 1440, scheme: 'light', source: { icons: [ic('a', 0), ic('b', 40)] }, port: { icons: [ic('c', 300), ic('d', 340)] } }])
  assert.deepEqual(j.notMeasured.map((n) => n.cause), ['icons-unpairable'])
})

test('text labels (judge): synthetic readings — a changed label keeps its type finding, pagination numbers are words, a pair is made only by link or visible place', () => {
  const lab = (kind, text, o = {}) => ({ kind, land: kind === 'footer' ? 'footer' : 'header', text, nth: 0, path: '', x: 100, y: 40, size: 16, weight: 400, spacing: 0, transform: 'none', family: 'Arial', ...o })
  const row = (s, p) => ({ route: '/', width: 1440, scheme: 'light', source: { text: { blocks: [], labels: s } }, port: { text: { blocks: [], labels: p } } })
  const j = judgeText([row([lab('button', 'Read more', { size: 14, weight: 400 })], [lab('button', 'Learn more', { size: 16, weight: 700 })])])
  assert.deepEqual([...new Set(j.defects.map((d) => d.what))].sort(), ['label-size', 'label-weight', 'text-label-differs'])
  // pagination: the number is the label
  const page = judgeText([row([lab('pagination', 'Page 2', { path: '/p?page=2' })], [lab('pagination', 'Page 3', { path: '/p?page=2' })])])
  assert.deepEqual(page.defects.map((d) => [d.what, d.source, d.port]), [['text-label-differs', '"Page 2"', '"Page 3"']])
  // a counter in a button or a footer line is not other words, but its type is still compared
  const counter = judgeText([row([lab('footer', 'Hits: 383', { size: 12 })], [lab('footer', 'Hits: 442', { size: 14 })])])
  assert.deepEqual(counter.defects.map((d) => d.what), ['label-size'])
  // two buttons with other words on both sides, standing far from each other's place and with no link: not guessed
  const far = judgeText([row([lab('button', 'Buy', { x: 100 }), lab('button', 'Sell', { x: 400 })], [lab('button', 'Rent', { x: 400 }), lab('button', 'Lease', { x: 100 })])])
  assert.deepEqual(far.defects.map((d) => [d.source, d.port]), [['"Buy"', '"Lease"'], ['"Sell"', '"Rent"']])
  const lost = judgeText([row([lab('button', 'Buy', { x: 100 }), lab('button', 'Sell', { x: 110 })], [lab('button', 'Rent', { x: 105 }), lab('button', 'Lease', { x: 108 })])])
  assert.deepEqual([lost.defects.length, lost.notMeasured.map((n) => n.cause)], [0, ['labels-unpairable']])
  // no place and no link on a reading: no evidence, so no pair
  const blind = judgeText([row([{ ...lab('button', 'Buy'), x: undefined, y: undefined }], [{ ...lab('button', 'Rent'), x: undefined, y: undefined }])])
  assert.deepEqual([blind.defects.length, blind.notMeasured.map((n) => n.cause)], [0, ['labels-unpairable']])
})

test('icons (browser): a topbar before a header that the page draws as a named box (no <header>) is paired with the other side\'s topbar inside its header', async () => {
  const links = social(BIRD, { href: 'https://twitter.test/m', name: 'Twitter', size: 24 })
  const named = shell(`<div class="topbar" style="padding:6px">${links}</div><div id="site-header" style="padding:10px"><a href="/">Morgan</a></div>`).body
  const semantic = shell(`<header><div class="topbar" style="padding:6px">${links}</div><div style="padding:10px"><a href="/">Morgan</a></div></header>`)
  const report = await sweep({ source: { '/p': { body: named } }, port: { '/p': semantic }, only: ['icons'] })
  assert.equal(report.defects.icons.length, 0, JSON.stringify(report.defects.icons))
  assert.equal(check(report, 'icons').notMeasured, 0, JSON.stringify(report.notMeasured))
  assert.ok(check(report, 'icons').cases >= 1)
  // and a different glyph in that topbar is found
  const crossed = shell(`<header><div class="topbar" style="padding:6px">${social(CROSS, { href: 'https://twitter.test/m', name: 'Twitter', size: 24 })}</div></header>`)
  const other = await sweep({ source: { '/p': { body: named } }, port: { '/p': crossed }, only: ['icons'] })
  assert.ok(other.defects.icons.some((d) => d.what === 'icon-glyph'), JSON.stringify(other.defects.icons))
})

test('text labels (browser): a footer line with a link inside it is one line, and its changed words are reported whole; a label that changes its words and its size is both', async () => {
  const page = (line, nav, size) => shell(`<header style="padding:10px"><nav><a href="/news" style="font-size:${size}px">${nav}</a></nav></header>`, { foot: `<p>${line}</p>` })
  const report = await sweep({
    source: { '/p': page('Powered by <a href="/us">us</a>', 'News', 14), '/q': page('Powered by <a href="/us">us</a>', 'News', 14) },
    port: { '/p': page('Built with <a href="/us">them</a>', 'Blog', 18), '/q': page('Powered by us', 'News', 14) },
    only: ['text']
  })
  const p = report.defects.text.filter((d) => d.route === '/p')
  assert.ok(p.some((d) => d.what === 'text-label-differs' && d.source === '"Powered by us"' && d.port === '"Built with them"'), JSON.stringify(p))
  assert.ok(p.some((d) => d.what === 'text-label-differs' && d.source === '"News"' && d.port === '"Blog"'), JSON.stringify(p))
  assert.ok(p.some((d) => d.what === 'label-size'), 'the size of the changed nav label is its own finding')
  // the same line with the link only on one side is the same words
  assert.equal(report.defects.text.filter((d) => d.route === '/q').length, 0, JSON.stringify(report.defects.text.filter((d) => d.route === '/q')))
})

test('text labels (browser): pagination numbers are the label — Page 2 against Page 3 is a finding; a button counter is not', async () => {
  const page = (n, hits) => shell('<header>h</header>', { main: `<nav class="pagination"><a href="/list?page=2">Page ${n}</a></nav><button type="button">Hits: ${hits}</button>` })
  const report = await sweep({ source: { '/p': page(2, 383) }, port: { '/p': page(3, 442) }, only: ['text'] })
  assert.deepEqual(report.defects.text.map((d) => [d.what, d.source, d.port]), [['text-label-differs', '"Page 2"', '"Page 3"']], JSON.stringify(report.defects.text))
})

test('icons (browser): a control the page removes while it is scrolled to is not-measured, not dropped as if the page never had it', async () => {
  const tall = '<div style="height:3000px"></div>'
  const gone = html(`<main>x</main>${tall}<footer>${social(BIRD)}</footer>`, { script: "addEventListener('scroll',()=>document.querySelector('footer a')?.remove())" })
  const kept = shell(`${tall}`, { foot: social(BIRD) })
  const report = await sweep({ source: { '/p': gone }, port: { '/p': kept }, only: ['icons'] })
  assert.deepEqual(report.notMeasured.icons.map((n) => n.cause), ['icon-not-rasterised'], JSON.stringify([report.notMeasured, report.defects.icons]))
  assert.equal(report.defects.icons.filter((d) => /icon-only/.test(d.what)).length, 0)
})

test('icons (browser): a search field collapsed to a tile on one side and a button drawn at the same place on the other are one control, not an icon only the port has', async () => {
  const field = shell('<header><div style="padding:10px"><form class="form-search" style="width:30px;height:30px"><input type="text" aria-label="Search" style="width:30px;height:30px;box-sizing:border-box;padding:0"></form></div></header>')
  const button = shell('<header><div style="padding:10px"><button aria-label="Search" style="width:30px;height:30px;padding:0"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="6" cy="6" r="4" fill="none" stroke="#000" stroke-width="2"/></svg></button></div></header>')
  const report = await sweep({ source: { '/p': field }, port: { '/p': button }, only: ['icons'] })
  assert.deepEqual(report.defects.icons.filter((d) => /^icon-only-/.test(d.what)), [], JSON.stringify(report.defects.icons))
  // a wide field is a search form, not an icon control: it adds no icon-only finding either
  const wide = shell('<header><div style="padding:10px"><form class="form-search"><input type="text" aria-label="Search" style="width:240px;height:30px"></form></div></header>')
  const w = await sweep({ source: { '/p': wide }, port: { '/p': wide }, only: ['icons'] })
  assert.equal(w.defects.icons.length, 0, JSON.stringify(w.defects.icons))
})

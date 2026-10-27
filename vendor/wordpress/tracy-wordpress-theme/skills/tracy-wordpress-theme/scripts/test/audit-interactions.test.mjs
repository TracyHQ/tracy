// Interaction-parity classes (visual/interaction-parity.mjs) on minimal fixtures: for each class a source form, a
// defective site that must be flagged and a corrected site that must pass. Real Chromium, real pointer.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { lazyBrowser } from '../lib/browser.mjs'
import {
  GEOMETRY_PX,
  carouselFindings,
  desktopPanelFindings,
  drawerFindings,
  headerFindings,
  measureCarousels,
  measureDesktopPanels,
  measureDrawer,
  measureForms,
  formFindings,
  HEADER_WIDTHS,
  DRAWER_WIDTHS,
  measureHeader,
  measureToggle,
  measureTouch,
  summarizeInteractions,
  touchFindings,
  toggleFindings
} from '../visual/interaction-parity.mjs'
import { fixtureServer } from './audit-fixture.mjs'

let server
let browser
const handle = lazyBrowser()
before(async () => {
  server = await fixtureServer()
  browser = await handle.get()
})
after(async () => {
  await handle.close()
  await server.close()
})
const side = (page, variant, extra = {}) => ({ url: `${server.origin}/${page}/${variant}`, ...extra })
const DARK = { darkHook: 'attr:data-theme=dark' }
const kinds = (r) => r.findings.map((f) => f.kind)

// ── drawer ────────────────────────────────────────────────────────────────────────────────
test('drawer: every submenu to the third level opens, in light and dark, and a corrected site is clean', async () => {
  for (const theme of ['light', 'dark']) {
    const source = await measureDrawer(browser, side('drawer', 'src', DARK), { theme })
    const good = await measureDrawer(browser, side('drawer', 'good', DARK), { theme })
    assert.equal(source.measured, true)
    const labels = source.states.map((s) => s.labels.join(' > '))
    for (const want of ['', 'Services', 'Services > Apps', 'Services > Apps > Android']) assert.ok(labels.includes(want), `${theme}: state "${want}" measured (${labels.join(' | ')})`)
    assert.equal(Math.max(...source.states.map((s) => s.depth)), 3, 'to the third level')
    const r = drawerFindings({ route: '/', site: good, source, theme })
    assert.deepEqual(r.findings, [], `${theme}: ${JSON.stringify(r.findings)}`)
    assert.ok(r.examined > 10)
  }
})

test('drawer: a child that opens over its siblings is a drawer-overlap finding naming the rows', async () => {
  const source = await measureDrawer(browser, side('drawer', 'src'))
  const bad = await measureDrawer(browser, side('drawer', 'overlap'))
  const r = drawerFindings({ route: '/', site: bad, source, theme: 'light' })
  assert.ok(kinds(r).includes('drawer-overlap'), JSON.stringify(r.findings))
  const f = r.findings.find((x) => x.kind === 'drawer-overlap')
  assert.ok(f.area > 4 && f.rows.length === 2)
  assert.deepEqual(drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'good')), source, theme: 'light' }).findings, [], 'the corrected site has none')
})

test('drawer: drill-down against the source accordion is a drawer-model finding; hidden ancestors are no overlap', async () => {
  const source = await measureDrawer(browser, side('drawer', 'src'))
  const drill = await measureDrawer(browser, side('drawer', 'drill'))
  const services = drill.states.find((s) => s.labels.join('>') === 'Services')
  assert.equal(services.model, 'drill-down')
  assert.equal(services.back, true, 'a back row is shown')
  assert.equal(source.states.find((s) => s.labels.join('>') === 'Services').model, 'accordion')
  const r = drawerFindings({ route: '/', site: drill, source, theme: 'light' })
  assert.ok(kinds(r).includes('drawer-model'), JSON.stringify(r.findings))
  assert.ok(!kinds(r).includes('drawer-overlap'), 'the hidden parent level does not count as an overlap')
  // a drill-down source measured against a drill-down site matches
  assert.deepEqual(drawerFindings({ route: '/', site: drill, source: drill, theme: 'light' }).findings, [])
})

test('contrast: dark text on its real background under 4.5:1 is menu-contrast; light text passes; both measure the opened state', async () => {
  const bad = await measureDrawer(browser, side('drawer', 'contrast', DARK), { theme: 'dark', withContrast: true })
  const good = await measureDrawer(browser, side('drawer', 'good', DARK), { theme: 'dark', withContrast: true })
  const rb = drawerFindings({ route: '/', site: bad, source: null, theme: 'dark' })
  assert.ok(kinds(rb).includes('menu-contrast'), JSON.stringify(rb.findings.slice(0, 2)))
  assert.ok(rb.findings.every((f) => f.min < 4.5))
  const deep = bad.states.find((s) => s.labels.join('>') === 'Services>Apps>Android')
  assert.ok(deep.contrast.failingCount > 0, 'the third-level panel is measured too')
  const rg = drawerFindings({ route: '/', site: good, source: null, theme: 'dark' })
  assert.deepEqual(rg.findings, [])
  assert.ok(rg.examined > 20, 'it read the text it passed')
})

test('contrast: a desktop submenu panel in dark is measured through the pointer', async () => {
  const bad = await measureDesktopPanels(browser, side('touch', 'src', DARK), { theme: 'dark' })
  assert.ok(bad.panels.length >= 1 && bad.panels[0].shown, 'the submenu opened for hover or click')
  // the touch fixture's panel is #eee with default (dark-mode ignorant) link colours: readable
  assert.deepEqual(desktopPanelFindings({ route: '/', site: bad }).findings, [])
})

// ── touch ─────────────────────────────────────────────────────────────────────────────────
for (const width of [1024, 1180]) {
  test(`touch ${width}: a corrected site opens by tap with a ≥24 px control that is what the tap hits`, async () => {
    const source = await measureTouch(browser, side('touch', 'src'), { width })
    const good = await measureTouch(browser, side('touch', 'good'), { width })
    assert.equal(source.controls.length, 1)
    assert.equal(source.controls[0].opened, true, 'the source opens by tap')
    const r = touchFindings({ route: '/', site: good, source })
    assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  })
}

test('touch: a 14 px control, a control under an intercepting link, and a control that follows a link are each flagged', async () => {
  const source = await measureTouch(browser, side('touch', 'src'), { width: 1024 })
  const small = touchFindings({ route: '/', site: await measureTouch(browser, side('touch', 'small'), { width: 1024 }), source })
  assert.ok(kinds(small).includes('touch-target-small'), JSON.stringify(small.findings))
  const cover = touchFindings({ route: '/', site: await measureTouch(browser, side('touch', 'cover'), { width: 1180 }), source })
  assert.ok(kinds(cover).includes('touch-target-obstructed'), JSON.stringify(cover.findings))
  assert.ok(kinds(cover).includes('touch-not-opened'), 'the tap went to the covering link, not the control')
  const link = touchFindings({ route: '/', site: await measureTouch(browser, side('touch', 'link'), { width: 1024 }), source })
  assert.ok(kinds(link).includes('touch-not-opened'), JSON.stringify(link.findings))
})

// ── toggle ────────────────────────────────────────────────────────────────────────────────
test('toggle: the same clicks on both sides; a first click that lands on the current state is toggle-first-click', async () => {
  const source = await measureToggle(browser, side('toggle', 'src'))
  assert.equal(source.initial.theme, 'light')
  assert.deepEqual(source.seq.map((s) => s.theme), ['dark', 'light', 'dark'])
  const bad = await measureToggle(browser, side('toggle', 'stale'))
  assert.deepEqual(bad.seq.map((s) => s.theme), ['light', 'dark', 'light'])
  assert.ok(kinds(toggleFindings({ route: '/', site: bad, source })).includes('toggle-first-click'))
  const good = await measureToggle(browser, side('toggle', 'good'))
  assert.deepEqual(toggleFindings({ route: '/', site: good, source }).findings, [])
  const none = await measureToggle(browser, side('carousel', 'good'))
  assert.equal(none.found, false)
  assert.ok(kinds(toggleFindings({ route: '/', site: none, source })).includes('toggle-missing'))
})

// ── carousel ──────────────────────────────────────────────────────────────────────────────
test('carousel: stacked images, a carousel without controls and one whose controls miss items are each flagged; a working one passes', async () => {
  const source = await measureCarousels(browser, side('carousel', 'src'))
  assert.equal(source.carousels.length, 1)
  assert.equal(source.carousels[0].items, 4)
  assert.equal(source.carousels[0].unreached, 0, 'its dots reach every item')
  assert.deepEqual(carouselFindings({ route: '/', site: await measureCarousels(browser, side('carousel', 'good')), source }).findings, [])
  assert.ok(kinds(carouselFindings({ route: '/', site: await measureCarousels(browser, side('carousel', 'stacked')), source })).includes('carousel-missing'))
  const none = carouselFindings({ route: '/', site: await measureCarousels(browser, side('carousel', 'nocontrols')), source })
  assert.ok(kinds(none).includes('carousel-controls-missing'), JSON.stringify(none.findings))
  const partial = await measureCarousels(browser, side('carousel', 'partial'))
  assert.equal(partial.carousels[0].unreached, 2)
  assert.ok(kinds(carouselFindings({ route: '/', site: partial, source })).includes('carousel-unreachable'))
})

// ── header band ───────────────────────────────────────────────────────────────────────────
test('header: height and control centres compare within 2 px — exactly 2 passes, more is a finding', async () => {
  const width = 1440
  const source = await measureHeader(browser, side('header', 'src'), { width })
  assert.ok(source.header.controls.logo && source.header.controls.primary && source.header.controls.toggle && source.header.controls.search)
  assert.deepEqual(headerFindings({ route: '/', site: await measureHeader(browser, side('header', 'good'), { width }), source }).findings, [])
  const two = headerFindings({ route: '/', site: await measureHeader(browser, side('header', 'tall2'), { width }), source })
  assert.deepEqual(two.findings.filter((f) => f.kind === 'header-height'), [], `+${GEOMETRY_PX} px is the threshold, not over it`)
  const three = headerFindings({ route: '/', site: await measureHeader(browser, side('header', 'tall3'), { width }), source })
  assert.ok(kinds(three).includes('header-height'))
  const shifted = headerFindings({ route: '/', site: await measureHeader(browser, side('header', 'shifted'), { width }), source })
  assert.ok(shifted.findings.some((f) => f.kind === 'header-control-position' && f.control === 'primary' && f.dx > 2), JSON.stringify(shifted.findings))
  const nobutton = headerFindings({ route: '/', site: await measureHeader(browser, side('header', 'nobutton'), { width }), source })
  assert.ok(nobutton.findings.some((f) => f.kind === 'header-control-missing' && f.control === 'primary'))
})

test('header: on desktop the current section is marked in the nav; a site that marks none is nav-current-missing; narrow widths skip it', async () => {
  const source = await measureHeader(browser, side('header', 'src'), { width: 1440 })
  assert.deepEqual(source.nav.current, ['About'])
  const bad = headerFindings({ route: '/', site: await measureHeader(browser, side('header', 'nocurrent'), { width: 1440 }), source })
  assert.ok(kinds(bad).includes('nav-current-missing'), JSON.stringify(bad.findings))
  const narrow = await measureHeader(browser, side('header', 'src'), { width: 390 })
  assert.equal(narrow.nav, null)
})

test('header: every configured width is measured by the run; a header the site lacks is not measured rather than clean; no header on either side is nothing to compare', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const r = await measureInteractions({ browser, pages: [{ id: 'home', route: '/', siteUrl: side('header', 'good').url, sourceUrl: side('header', 'src').url }], checks: ['header'], headerWidths: [390, 1440] })
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings))
  assert.ok(r.examined > 0)
  const lacking = await measureInteractions({ browser, pages: [{ id: 'x', route: '/x', siteUrl: side('carousel', 'good').url, sourceUrl: side('header', 'src').url }], checks: ['header'], headerWidths: [1440] })
  assert.ok(lacking.notMeasured.length >= 1, 'the site has no header while the source has one')
  assert.equal(lacking.blocking, true)
  const neither = await measureInteractions({ browser, pages: [{ id: 'y', route: '/y', siteUrl: side('carousel', 'good').url, sourceUrl: side('carousel', 'src').url }], checks: ['header'], headerWidths: [1440] })
  assert.deepEqual([neither.findings.length, neither.notMeasured.length], [0, 0])
  await assert.rejects(measureInteractions({ browser, pages: [{ id: 'y', route: '/y', siteUrl: 'x', sourceUrl: 'y' }], checks: ['header'], headerWidths: [] }), /headerWidths/)
})

test('coverage: every case the run walks is a row — measured or not, a state past the budget or on a side with no source included — and the origins and tiers are recorded', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const { interactionAttestationProblems } = await import('../visual/interaction-report.mjs')
  const pages = [{ id: 'home', route: '/', siteUrl: side('header', 'good').url, sourceUrl: side('header', 'src').url }]
  const r = await measureInteractions({ browser, pages, checks: ['header'], headerWidths: [390, 1440] })
  assert.deepEqual(r.coverage.map((c) => [c.check, c.route, c.width, c.theme, c.measured]), [['header', '/', 390, null, true], ['header', '/', 1440, null, true]])
  assert.equal(r.origins.site, new URL(pages[0].siteUrl).origin)
  assert.equal(r.origins.source, new URL(pages[0].sourceUrl).origin)
  assert.deepEqual(r.tiers.headerWidths, [390, 1440], 'a narrowed run says so')
  assert.match(interactionAttestationProblems(r).join(), /tiers\.headerWidths is \[390,1440\]/, 'and a consumer refuses it')
  // a run whose budget is gone leaves every case a row with measured false
  const late = await measureInteractions({ browser, pages, checks: ['header'], headerWidths: [1440], budgetMs: -1 })
  assert.deepEqual(late.coverage.map((c) => c.measured), [false])
  assert.equal(late.blocking, true)
  // no source declared: each case is a row, none measured
  const alone = await measureInteractions({ browser, pages: [{ id: 'home', route: '/', siteUrl: side('header', 'good').url, sourceUrl: null }], checks: ['header'], headerWidths: [1440] })
  assert.deepEqual(alone.coverage.map((c) => c.measured), [false])
  assert.equal(alone.origins.source, null)
  // a full run owes the whole grid: chrome checks on the chrome page, forms/carousels/header on every page
  const all = await measureInteractions({ browser, pages, chromePages: ['/'], budgetMs: -1 })
  const { owedCases } = await import('../visual/interaction-page-contract.mjs')
  assert.equal(all.coverage.length, owedCases({ pages: ['/'], chromePages: ['/'] }).length)
  assert.ok(all.coverage.every((c) => !c.measured))
})

test('none reference: source comparisons are explicit N/A while target contrast, touch and toggle defects still surface', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({
    browser,
    pages: [{ id: 'brief', route: '/none', referenceKind: 'none', siteUrl: side('touch', 'small').url, sourceUrl: null }],
    checks: ['contrast', 'touch', 'toggle'], chromePages: ['/none'], headerWidths: [1440]
  })
  assert.equal(record.coverage.filter((c) => c.status === 'not-applicable').every((c) => c.measured), true)
  assert.ok(record.coverage.some((c) => c.check === 'touch' && c.status === 'not-applicable'))
  assert.ok(record.findings.some((f) => f.kind === 'touch-target-small'))
  assert.ok(record.findings.some((f) => f.kind === 'toggle-missing'))
  assert.ok(record.origins.source === null)
  const failedTouch = await measureInteractions({
    browser,
    pages: [{ id: 'brief', route: '/none', referenceKind: 'none', siteUrl: side('touch', 'link').url, sourceUrl: null }],
    checks: ['touch'], chromePages: ['/none']
  })
  assert.ok(failedTouch.findings.some((f) => f.kind === 'touch-not-opened'), JSON.stringify(failedTouch.findings))
  const menu = await measureInteractions({
    browser,
    pages: [{ id: 'brief', route: '/none', referenceKind: 'none', siteUrl: side('drawer', 'contrast', DARK).url, sourceUrl: null }],
    checks: ['contrast'], chromePages: ['/none'], siteHooks: DARK
  })
  assert.ok(menu.findings.some((f) => f.kind === 'menu-contrast'), JSON.stringify(menu.findings))
  assert.ok(menu.coverage.every((c) => c.check === 'contrast' && c.measured && c.status === undefined))
  const noMenu = await measureInteractions({
    browser,
    pages: [{ id: 'brief', route: '/none', referenceKind: 'none', siteUrl: side('carousel', 'good').url, sourceUrl: null }],
    checks: ['drawer'], chromePages: ['/none']
  })
  assert.ok(noMenu.findings.some((f) => f.kind === 'drawer-missing'), JSON.stringify(noMenu.findings))
  const closedSubmenu = await measureInteractions({
    browser,
    pages: [{ id: 'brief', route: '/none', referenceKind: 'none', siteUrl: side('drawer', 'noopen').url, sourceUrl: null }],
    checks: ['drawer'], chromePages: ['/none']
  })
  assert.ok(closedSubmenu.findings.some((f) => f.kind === 'drawer-submenu-not-opened'), JSON.stringify(closedSubmenu.findings))
  const blockedForm = await measureInteractions({
    browser,
    pages: [{ id: 'brief', route: '/none', referenceKind: 'none', siteUrl: side('form', 'customblock').url, sourceUrl: null }],
    checks: ['form']
  })
  assert.ok(blockedForm.findings.some((f) => f.kind === 'form-submit-blocked'), JSON.stringify(blockedForm.findings))
})

test('mixed interaction sites keep source pairing for html routes and N/A only for the bound none route', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({
    browser,
    pages: [
      { id: 'html', route: '/html', referenceKind: 'html', siteUrl: side('header', 'good').url, sourceUrl: side('header', 'src').url },
      { id: 'brief', route: '/brief', referenceKind: 'none', siteUrl: side('header', 'good').url, sourceUrl: null }
    ],
    checks: ['header'], headerWidths: [1440], chromePages: ['/html']
  })
  assert.deepEqual(record.coverage.map((c) => [c.route, c.status ?? 'measured', c.measured]), [
    ['/html', 'measured', true], ['/brief', 'not-applicable', true]
  ])
  assert.equal(record.origins.source, new URL(side('header', 'src').url).origin)
})

test('interaction attestation: no drawer on either side is a complete zero-parent discovery', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const page = { id: 'empty', route: '/', siteUrl: side('carousel', 'good').url, sourceUrl: side('carousel', 'good').url }
  const record = await measureInteractions({ browser, pages: [page], checks: ['drawer'] })
  const discovery = record.discoveries.find((row) => row.check === 'drawer' && row.width === DRAWER_WIDTHS[0] && row.theme === 'light')
  assert.deepEqual({ complete: discovery.complete, count: discovery.count }, { complete: true, count: 0 })
})

test('interaction attestation: when the site drawer is absent, every source parent gets its own finding outcome', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({ browser, pages: [{ id: 'drawer-missing', route: '/', siteUrl: side('carousel', 'good').url, sourceUrl: side('drawer', 'src').url }], checks: ['drawer'] })
  const outcomes = record.obligations.map((row) => record.outcomes.find((outcome) => outcome.id === row.id)?.outcome)
  assert.ok(outcomes.length > 0)
  assert.ok(outcomes.every((outcome) => outcome === 'finding'), JSON.stringify({ outcomes, findings: record.findings }))
})

test('interaction attestation: each form outcome follows only that form id', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({ browser, pages: [{ id: 'forms', route: '/', siteUrl: side('form', 'twiceextra').url, sourceUrl: side('form', 'twice').url }], checks: ['form'] })
  const formOutcomes = record.obligations.filter((row) => row.check === 'form').map((row) => ({ selector: row.selector, outcome: record.outcomes.find((outcome) => outcome.id === row.id)?.outcome }))
  assert.deepEqual(formOutcomes, [{ selector: 'form-0', outcome: 'ok' }, { selector: 'form-1', outcome: 'finding' }], JSON.stringify({ formOutcomes, notMeasured: record.notMeasured, findings: record.findings, discoveries: record.discoveries }))
})

test('interaction attestation: an expandable source parent at the maximum walked depth is not measured as ok', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({ browser, pages: [{ id: 'deep', route: '/', siteUrl: side('drawer', 'good').url, sourceUrl: side('drawer', 'depthdeep').url }], checks: ['drawer'] })
  const obligation = record.obligations.find((row) => row.check === 'drawer' && row.selector === '0>0>0>0')
  assert.ok(obligation, JSON.stringify(record.obligations.map((row) => row.selector)))
  assert.equal(record.outcomes.find((row) => row.id === obligation.id)?.outcome, 'notMeasured')
  assert.equal(record.discoveries.find((row) => row.check === 'drawer' && row.width === obligation.width && row.theme === obligation.theme).complete, false)
})

test('interaction attestation: a site root-state error marks every source drawer parent notMeasured and discovery incomplete', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({ browser, pages: [{ id: 'root-error', route: '/', siteUrl: side('drawer', 'rooterror').url, sourceUrl: side('drawer', 'src').url }], checks: ['drawer'] })
  assert.ok(record.obligations.length > 0)
  assert.ok(record.outcomes.every((outcome) => outcome.outcome === 'notMeasured'), JSON.stringify({ outcomes: record.outcomes, notMeasured: record.notMeasured }))
  assert.ok(record.obligations.every((obligation) => record.notMeasured.some((row) => row.obligationId === obligation.id)), JSON.stringify(record.notMeasured))
  assert.ok(record.discoveries.every((discovery) => !discovery.complete))
})

test('interaction attestation: drawer-submenu-not-opened carries its source parent id and yields finding', async () => {
  const { measureInteractions } = await import('../visual/interaction-parity.mjs')
  const record = await measureInteractions({ browser, pages: [{ id: 'submenu-closed', route: '/', siteUrl: side('drawer', 'noopen').url, sourceUrl: side('drawer', 'src').url }], checks: ['drawer'] })
  const finding = record.findings.find((row) => row.kind === 'drawer-submenu-not-opened')
  assert.ok(finding?.obligationId, JSON.stringify(finding))
  assert.equal(record.outcomes.find((outcome) => outcome.id === finding.obligationId)?.outcome, 'finding')
})

test('summarize: nothing examined is blocking; a clean read is not', () => {
  assert.equal(summarizeInteractions({ pages: ['/'], checks: ['header'], findings: [], notMeasured: [], examined: 0 }).blocking, true)
  assert.equal(summarizeInteractions({ pages: ['/'], checks: ['header'], findings: [], notMeasured: [], examined: 5 }).blocking, false)
  assert.equal(summarizeInteractions({ pages: ['/'], checks: ['header'], findings: [{ kind: 'header-control-extra' }], notMeasured: [], examined: 5 }).blocking, false, 'a finding is advisory')
  assert.equal(summarizeInteractions({ pages: ['/'], checks: ['header'], findings: [], notMeasured: [{ route: '/' }], examined: 5 }).blocking, true)
})

// ═══════════════ amendment 1, class 7: a drawer submenu that never opens ═══════════════════════
test('drawer-submenu: every source-openable parent opens on the site at 390 and 768, light and dark; a corrected site is clean', async () => {
  for (const width of DRAWER_WIDTHS)
    for (const theme of ['light', 'dark']) {
      const source = await measureDrawer(browser, side('drawer', 'src', DARK), { width, theme })
      const good = await measureDrawer(browser, side('drawer', 'good', DARK), { width, theme })
      const r = drawerFindings({ route: '/', site: good, source, theme })
      assert.deepEqual(r.findings, [], `${width}/${theme}: ${JSON.stringify(r.findings)}`)
      const services = good.states.find((s) => s.labels.join('>') === 'Services>Apps>Android')
      assert.ok(services && services.children.length === 2, 'the third level shows its children')
    }
})

test('drawer-submenu: aria-expanded=true with the child list still display:none is drawer-submenu-not-opened, not a pass', async () => {
  const source = await measureDrawer(browser, side('drawer', 'src'))
  const bad = await measureDrawer(browser, side('drawer', 'noopen'))
  const services = bad.states.find((s) => s.labels.join('>') === 'Services')
  assert.equal(services.claims, 'true', 'the control says it is expanded')
  assert.equal(services.children.length, 0, 'and nothing is shown')
  assert.ok(services.declared.length > 0, 'the children exist in the DOM')
  const r = drawerFindings({ route: '/', site: bad, source, theme: 'light' })
  const f = r.findings.filter((x) => x.kind === 'drawer-submenu-not-opened')
  assert.equal(f.length, 1, `one finding for the broken parent, no cascade: ${JSON.stringify(r.findings)}`)
  assert.equal(f[0].claims, 'true')
  assert.match(f[0].detail, /aria-expanded=true/)
})

test('drawer-submenu: zero-size children, a missing parent and a partly missing child list are each a finding', async () => {
  const source = await measureDrawer(browser, side('drawer', 'src'))
  const zero = drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'zero')), source, theme: 'light' })
  assert.ok(kinds(zero).includes('drawer-submenu-not-opened'), JSON.stringify(zero.findings))
  const none = drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'noparent')), source, theme: 'light' })
  const missing = none.findings.filter((x) => x.kind === 'drawer-submenu-missing')
  assert.equal(missing.length, 1, JSON.stringify(none.findings))
  assert.equal(missing[0].state, 'Services')
  const part = drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'partial')), source, theme: 'light' })
  const f = part.findings.find((x) => x.kind === 'drawer-submenu-children-missing')
  assert.ok(f && f.missing.includes('Hybrid') && f.state === 'Services > Apps > Android', JSON.stringify(part.findings))
})

test('drawer-submenu: a source state the site lacks cannot disappear when the traversal is cut short', async () => {
  const source = await measureDrawer(browser, side('drawer', 'src'))
  const cut = await measureDrawer(browser, side('drawer', 'good'), { maxStates: 2 })
  assert.ok(cut.truncated, 'the budget was exhausted')
  const r = drawerFindings({ route: '/', site: cut, source, theme: 'light' })
  assert.ok(r.notMeasured.some((n) => /state cap/.test(n.reason)), 'incomplete coverage is reported, not a clean pass')
  assert.deepEqual(r.findings, [], 'and it is not a false finding either')
})

test('drawer-submenu: every source-openable parent is said — a site state that errored, one never reached and a source state that failed to open are not-measured, never dropped', () => {
  const kid = (index, label, leaves = []) => ({ index, label, shown: true, leaves })
  const root = (kids) => ({ path: [], labels: [], depth: 0, children: kids.map((k) => k.label), kids })
  const state = (path, labels, children) => ({ path, labels, depth: labels.length, children, label: labels.at(-1), kids: children.map((c, i) => kid(i, c)), model: 'accordion', rows: children.length })
  const source = { measured: true, width: 390, states: [root([kid(0, 'Services', ['Web', 'Apps']), kid(1, 'About', ['Team'])]), state(['0'], ['Services'], ['Web', 'Apps']), state(['1'], ['About'], ['Team'])] }
  const siteOk = { measured: true, width: 390, states: [root([kid(0, 'Services', ['Web', 'Apps']), kid(1, 'About', ['Team'])]), state(['0'], ['Services'], ['Web', 'Apps']), state(['1'], ['About'], ['Team'])] }
  const ok = drawerFindings({ route: '/', site: siteOk, source, theme: 'light' })
  assert.deepEqual(ok.findings, [])
  assert.deepEqual(ok.notMeasured, [])
  // the site's state for Services errored while the root paired: no finding, no silence — a not-measured with that state's outcome
  const errored = { ...siteOk, states: [siteOk.states[0], { path: ['0'], labels: ['Services'], depth: 1, error: 'the click opened nothing' }, siteOk.states[2]] }
  const e = drawerFindings({ route: '/', site: errored, source, theme: 'light' })
  assert.ok(e.notMeasured.some((n) => /Services: the site's state could not be opened \(the click opened nothing\)/.test(n.reason)), JSON.stringify(e.notMeasured))
  assert.ok(!e.notMeasured.some((n) => /About/.test(n.reason)), 'the other parent is measured')
  // the site state was never reached (absent from the list): not measured, with its own outcome
  const absent = { ...siteOk, states: [siteOk.states[0], siteOk.states[2]] }
  const a = drawerFindings({ route: '/', site: absent, source, theme: 'light' })
  assert.ok(a.notMeasured.some((n) => /Services: the site state paired with this parent was not measured/.test(n.reason)))
  // a source state that failed to open leaves the comparison as not measured, not as nothing
  const srcErr = { ...source, states: [source.states[0], { path: ['0'], labels: ['Services'], depth: 1, error: 'source click failed' }, source.states[2]] }
  const s = drawerFindings({ route: '/', site: siteOk, source: srcErr, theme: 'light' })
  assert.ok(s.notMeasured.some((n) => /source Services: source click failed/.test(n.reason)), JSON.stringify(s.notMeasured))
  // a parent the site lacks entirely is a finding
  const lacking = { ...siteOk, states: [root([kid(1, 'About', ['Team'])].map((k) => ({ ...k, index: 0 }))), { ...siteOk.states[2], path: ['0'] }] }
  const l = drawerFindings({ route: '/', site: lacking, source, theme: 'light' })
  assert.ok(l.findings.some((f) => f.kind === 'drawer-submenu-missing' && f.state === 'Services'), JSON.stringify(l.findings))
})

// ═══════════════ amendment 1, class 8: responsive visibility and label wrap ═══════════════════
const resp = async (sourceVariant, siteVariant, width) => headerFindings({ route: '/', site: await measureHeader(browser, side('responsive', siteVariant), { width }), source: await measureHeader(browser, side('responsive', sourceVariant), { width }) })

test('responsive: the seven configured tiers are the ones the run measures', () => {
  assert.deepEqual([...HEADER_WIDTHS], [390, 768, 992, 1024, 1180, 1280, 1440])
})

test('responsive: a Donate CTA the source hides below 1200 px but the site shows is a finding at 992, 1024 and 1180; the corrected site is clean at all seven', async () => {
  for (const width of [992, 1024, 1180]) {
    const r = await resp('src', 'shown', width)
    const f = r.findings.find((x) => x.kind === 'responsive-visibility')
    assert.ok(f, `${width}: ${JSON.stringify(r.findings)}`)
    assert.equal(f.control, 'Donate now')
    assert.deepEqual([f.source, f.site], ['hidden', 'shown'])
  }
  for (const width of [1280, 1440]) assert.ok(!kinds(await resp('src', 'shown', width)).includes('responsive-visibility'), `${width}: both show it`)
  for (const width of HEADER_WIDTHS) assert.deepEqual((await resp('src', 'good', width)).findings, [], `${width}: the corrected site hides it as the source does`)
})

test('responsive: a visible button whose label takes more lines than the source is label-wrap even when header height and control centres match', async () => {
  for (const variant of ['wrap', 'wrapnested', 'br']) {
    const r = await resp('srcwide', variant, 1440)
    const f = r.findings.find((x) => x.kind === 'label-wrap')
    assert.ok(f && f.site >= 2 && f.source === 1, `${variant}: ${JSON.stringify(r.findings)}`)
    assert.ok(!kinds(r).includes('header-height'), `${variant}: the header band itself still matches`)
  }
  assert.deepEqual((await resp('wrapsrc', 'wrap', 1440)).findings.filter((x) => x.kind === 'label-wrap'), [], 'a label that wraps on the source too matches')
  assert.deepEqual((await resp('wrapsrc', 'wrapnested', 1440)).findings.filter((x) => x.kind === 'label-wrap'), [], 'nested spans count the same lines')
  assert.deepEqual((await resp('brsrc', 'br', 1440)).findings.filter((x) => x.kind === 'label-wrap'), [], 'an explicit line break on both sides matches')
  assert.deepEqual((await resp('srcwide', 'hiddencopy', 1440)).findings.filter((x) => x.kind === 'label-wrap' || x.kind === 'responsive-visibility'), [], 'a hidden copy is not counted')
})

// ═══════════════ amendment 1, class 9: form semantics ═════════════════════════════════════════
const forms = async (sourceVariant, siteVariant) => {
  const [site, source] = [await measureForms(browser, side('form', siteVariant)), await measureForms(browser, side('form', sourceVariant))]
  return { site, source, ...formFindings({ route: '/contact/', site, source }) }
}

test('forms: the same required set and an enabled submit is clean; nothing is ever submitted', async () => {
  const r = await forms('src', 'good')
  assert.deepEqual(r.findings, [], JSON.stringify(r.findings))
  assert.ok(r.examined >= 10)
  assert.equal(r.site.forms[0].state1.disabled, false)
  assert.deepEqual(server.writes, [], 'no request that writes reached the server')
})

test('forms: an optional source checkbox that is required on the site is form-extra-required (native, and as CF7 acceptance)', async () => {
  const native = await forms('src', 'extra')
  const f = native.findings.find((x) => x.kind === 'form-extra-required')
  assert.ok(f && /copy/i.test(f.control) && f.source === 'optional', JSON.stringify(native.findings))
  const cf7 = await forms('cf7src', 'cf7')
  assert.ok(cf7.findings.some((x) => x.kind === 'form-extra-required' && /copy/i.test(x.control)), JSON.stringify(cf7.findings))
  assert.deepEqual((await forms('cf7src', 'cf7src')).findings, [], 'the optional acceptance on both sides matches')
})

test('forms: a custom submit blocker without a required attribute is form-submit-blocked and names what unlocks it', async () => {
  const r = await forms('src', 'gate-flat')
  const f = r.findings.find((x) => x.kind === 'form-submit-blocked')
  assert.ok(f && /copy/i.test(f.unlockedBy), JSON.stringify(r.findings))
  assert.ok(!kinds(r).includes('form-extra-required'), 'no attribute says it is required: only the behaviour shows it')
})

test('forms (submit observed): an enabled submit whose handler refuses without the optional copy box is form-submit-blocked; an optional text the script makes mandatory is form-extra-required; neither sends anything', async () => {
  const blocked = await forms('src', 'customblock')
  const f = blocked.findings.find((x) => x.kind === 'form-submit-blocked')
  assert.ok(f && f.unlockedBy && /copy/i.test(f.unlockedBy), `a custom blocker with no disabled button and no required attribute: ${JSON.stringify(blocked.findings)}`)
  assert.equal(blocked.site.forms[0].state1.disabled, false, 'the button looks enabled')
  assert.equal(blocked.site.forms[0].attempt.fired, false)
  const phone = await forms('phonesrc', 'phonereq')
  assert.ok(phone.findings.some((x) => x.kind === 'form-extra-required' && /phone/i.test(x.control) && /script/.test(x.site)), JSON.stringify(phone.findings))
  assert.ok(!phone.findings.some((x) => x.kind === 'form-submit-blocked'), 'named as the control, not as a generic block')
  // the corrected forms go through with only what they require
  assert.deepEqual((await forms('src', 'good')).findings, [])
  assert.deepEqual((await forms('phonesrc', 'phonesrc')).findings, [])
  assert.deepEqual(server.writes, [], 'no request that writes reached the server')
})

test('forms (submit attribution): a background write is not the form submitting — a handler that refuses beside an analytics ping is not measured as usable; a ping beside a real submit changes nothing', async () => {
  const hidden = await forms('src', 'bgblock')
  const attempt = hidden.site.forms[0].attempt
  assert.equal(attempt.fired, null, `the ping is not this form's request: ${JSON.stringify(attempt)}`)
  assert.ok(hidden.notMeasured.some((n) => /not this form's|unknown/.test(n.reason)), JSON.stringify(hidden.notMeasured))
  assert.deepEqual((await forms('src', 'bgping')).findings, [], 'a ping next to a form that submits normally is no finding')
  assert.equal((await forms('src', 'bgping')).site.forms[0].attempt.fired, true)
  assert.deepEqual(server.writes, [], 'nothing reached the server')
})

test('forms (submit lifecycle): only this form\'s own submit event or a supported plugin lifecycle proves a submission', async () => {
  const formsOf = async (variant) => (await measureForms(browser, side('form', variant))).forms
  const attemptOf = async (variant) => (await formsOf(variant))[0].attempt
  // a validation request to the form's own action carrying the typed text, beside a handler that refuses: not a submission
  const same = await attemptOf('samepost')
  assert.equal(same.fired, null, JSON.stringify(same))
  assert.match(same.reason, /no supported per-form marker/)
  // a handler that stops the event and sends the request later: asynchronous work no lifecycle explains is unmeasured, not usable
  assert.equal((await attemptOf('delayed')).fired, null)
  // another form's submit event (and its pass) does not make this form's refusal a submission
  const other = await attemptOf('otherform')
  assert.equal(other.fired, false, JSON.stringify(other))
  assert.deepEqual(server.writes, [], 'nothing reached the server')
})

test('forms (explicit per-form marker): Contact Form 7 proves a submission through its own _wpcf7_unit_tag only — endpoint, plugin id, sample text and timing prove nothing', async () => {
  const formsOf = async (variant) => (await measureForms(browser, side('form', variant))).forms
  // multipart and urlencoded bodies, parsed by the platform: the marker and the plugin id are exact fields of the body
  for (const variant of ['cf7life', 'cf7urlenc']) {
    const a = (await formsOf(variant))[0].attempt
    assert.deepEqual([a.fired, a.lifecycle], [true, 'cf7'], `${variant}: ${JSON.stringify(a)}`)
  }
  // two embeds of the same plugin form share the id and the endpoint: each is attributed by its own unit tag
  const twice = await formsOf('cf7twice')
  assert.deepEqual(twice.map((f) => f.attempt.fired), [true, true], JSON.stringify(twice.map((f) => f.attempt)))
  // the same unit tag on two forms is no marker of either
  const same = await formsOf('cf7sameunit')
  assert.deepEqual(same.map((f) => f.attempt.fired), [null, null])
  assert.match(same[0].attempt.reason, /same _wpcf7_unit_tag/)
  // absent, duplicated, foreign and mismatched markers: not measured
  assert.match((await formsOf('cf7nomarker'))[0].attempt.reason, /no single _wpcf7 \/ _wpcf7_unit_tag marker/)
  assert.match((await formsOf('cf7dupmarker'))[0].attempt.reason, /no single _wpcf7 \/ _wpcf7_unit_tag marker/)
  const wrong = (await formsOf('cf7wrong'))[0].attempt
  assert.equal(wrong.fired, null, JSON.stringify(wrong))
  assert.match(wrong.reason, /none of the blocked requests carries this form's own _wpcf7_unit_tag/)
  const otherEndpoint = (await formsOf('cf7other'))[0].attempt
  assert.equal(otherEndpoint.fired, null, JSON.stringify(otherEndpoint))
  assert.match(otherEndpoint.reason, /not a Contact Form 7 feedback request for the form's own id/)
  // a background request to the form's own endpoint, with no marker: unrelated traffic
  const bg = (await formsOf('cf7analytics'))[0].attempt
  assert.equal(bg.fired, null, JSON.stringify(bg))
  // another form's press and another form's request: this form's refusal stays a refusal that was not measured as a submission
  const otherform = (await formsOf('cf7otherform'))[0].attempt
  assert.equal(otherform.fired, null, JSON.stringify(otherform))
  // a response that crosses attempts (the first press's request lands in the second press's window): not attributed to either
  const late = (await formsOf('cf7late'))[0]
  assert.ok([late.attempt, ...late.optionals].some((a) => a.fired === null && /may belong to that press/.test(a.reason ?? '')) || late.optionals.every((o) => o.fired !== true), JSON.stringify(late))
  assert.ok(!late.optionals.some((o) => o.fired === true), 'a late request is never a submission of a later press')
  // the first press also sent an unrelated write (analytics): that does not settle it — its marked request still lands in a later press's window
  const pinged = (await formsOf('cf7latepinged'))[0]
  assert.ok(!pinged.optionals.some((o) => o.fired === true), `an unrelated write beside a refused press does not make the late request a later press's submission: ${JSON.stringify(pinged.optionals)}`)
  assert.ok(pinged.optionals.some((o) => o.fired === null && /may belong to that press/.test(o.reason ?? '')) || pinged.optionals.length === 0, JSON.stringify(pinged.optionals))
  assert.deepEqual(server.writes, [], 'nothing reached the server')
})

test('forms (attribution, pure): an AcyMailing request belongs to the form whose own acyformname it carries, with no submit event (ja-restaurant S-29)', async () => {
  const { attributeWrites } = await import('../visual/interaction-parity.mjs')
  const plugin = { kind: 'acym', id: 'formAcym98711', unit: 'formAcym98711' }
  const url = 'http://x.test/index.php/component/acym/frontusers?ajax=1'
  const multi = async (o, at = url) => {
    const body = new FormData()
    for (const [k, v] of Object.entries(o)) body.append(k, v)
    const req = new Request(at, { method: 'POST', body })
    return { method: 'POST', url: at, type: req.headers.get('content-type'), body: Buffer.from(await req.arrayBuffer()) }
  }
  const ok = { 'user[email]': 'audit@example.com', ctrl: 'frontusers', task: 'subscribe', option: 'com_acym', acyformname: plugin.unit, acysubmode: 'mod_acym' }
  assert.deepEqual(await attributeWrites([await multi(ok)], plugin, 0), { fired: true, lifecycle: 'acym' })
  // another form's marker, the marker twice, two marked requests, another endpoint, a shared marker, a stale press: not attributed
  assert.equal((await attributeWrites([await multi({ ...ok, acyformname: 'formAcym1' })], plugin, 0)).fired, null)
  assert.match((await attributeWrites([await multi(ok), await multi(ok)], plugin, 0)).reason, /2 requests carry/)
  assert.match((await attributeWrites([await multi({ ...ok, ctrl: 'users', option: 'com_users' }, 'http://x.test/index.php/component/users/login')], plugin, 0)).reason, /not an AcyMailing subscribe request/)
  // the controller by query is enough; another task on it, or no task, is not a subscription
  assert.deepEqual(await attributeWrites([await multi(ok, 'http://x.test/index.php?option=com_acym&ctrl=frontusers')], plugin, 0), { fired: true, lifecycle: 'acym' })
  for (const body of [{ ...ok, task: 'delete' }, { ...ok, task: 'unsubscribe' }, { ...ok, task: 'notask' }, (({ task, ...rest }) => rest)(ok)])
    assert.match((await attributeWrites([await multi(body, 'http://x.test/index.php?option=com_acym&task=delete')], plugin, 0)).reason, /not an AcyMailing subscribe request/, JSON.stringify(body))
  assert.match((await attributeWrites([await multi({ ...ok, task: 'delete' })], plugin, 0)).reason, /not an AcyMailing subscribe request/)
  // option=com_acym alone, without the frontusers controller, is not the subscribe endpoint
  assert.match((await attributeWrites([await multi((({ ctrl, ...rest }) => rest)(ok), 'http://x.test/index.php?option=com_acym')], plugin, 0)).reason, /not an AcyMailing subscribe request/)
  assert.match((await attributeWrites([await multi(ok)], { ...plugin, unit: null, why: 'another form on the page carries the same acyformname' }, 0)).reason, /same acyformname/)
  assert.match((await attributeWrites([await multi(ok)], plugin, 0, true)).reason, /may belong to that press/)
  const dup = new FormData()
  for (const [k, v] of Object.entries(ok)) dup.append(k, v)
  dup.append('acyformname', plugin.unit)
  const dreq = new Request(url, { method: 'POST', body: dup })
  assert.match((await attributeWrites([{ method: 'POST', url, type: dreq.headers.get('content-type'), body: Buffer.from(await dreq.arrayBuffer()) }], plugin, 0)).reason, /more than once/)
})

test('forms (attribution, pure): the body is read with standard parsers and the marker must be an exact single field', async () => {
  const { attributeWrites, bodyFields } = await import('../visual/interaction-parity.mjs')
  const plugin = { kind: 'cf7', id: '69', unit: 'wpcf7-f69-p1-o1' }
  const url = 'http://x.test/wp-json/contact-form-7/v1/contact-forms/69/feedback'
  const urlenc = (o) => ({ method: 'POST', url, type: 'application/x-www-form-urlencoded; charset=UTF-8', body: Buffer.from(new URLSearchParams(o).toString()) })
  const ok = { _wpcf7: '69', _wpcf7_unit_tag: plugin.unit, your_name: 'Audit text' }
  assert.deepEqual(await attributeWrites([urlenc(ok)], plugin, 1), { fired: true, lifecycle: 'cf7' })
  const multi = new FormData()
  for (const [k, v] of Object.entries(ok)) multi.set(k, v)
  const req = new Request(url, { method: 'POST', body: multi })
  const asWrite = { method: 'POST', url, type: req.headers.get('content-type'), body: Buffer.from(await req.arrayBuffer()) }
  assert.equal((await attributeWrites([asWrite], plugin, 1)).fired, true)
  assert.equal((await bodyFields(asWrite)).get('_wpcf7_unit_tag')[0], plugin.unit)
  // sample text containing the marker is not the field; a prefix is not the marker; the same marker twice is ambiguous
  assert.equal((await attributeWrites([urlenc({ ...ok, _wpcf7_unit_tag: 'x', note: plugin.unit })], plugin, 1)).fired, null)
  assert.equal((await attributeWrites([urlenc({ ...ok, _wpcf7_unit_tag: `${plugin.unit}9` })], plugin, 1)).fired, null)
  const twice = { ...urlenc(ok), body: Buffer.from(`${new URLSearchParams(ok)}&_wpcf7_unit_tag=${plugin.unit}`) }
  assert.match((await attributeWrites([twice], plugin, 1)).reason, /more than once/)
  assert.match((await attributeWrites([urlenc(ok), urlenc(ok)], plugin, 1)).reason, /2 requests carry/)
  // JSON, garbage and an unparsable multipart body prove nothing
  assert.equal((await attributeWrites([{ method: 'POST', url, type: 'application/json', body: Buffer.from(JSON.stringify(ok)) }], plugin, 1)).fired, null)
  assert.equal((await attributeWrites([{ method: 'POST', url, type: 'multipart/form-data; boundary=zz', body: Buffer.from('not multipart') }], plugin, 1)).fired, null)
  // no submit event of this form, a shared unit tag, no plugin, a stale suspect, no write at all
  assert.match((await attributeWrites([urlenc(ok)], plugin, 0)).reason, /fired no submit event/)
  assert.match((await attributeWrites([urlenc(ok)], { ...plugin, unit: null, why: 'another form on the page carries the same _wpcf7_unit_tag' }, 1)).reason, /same _wpcf7_unit_tag/)
  assert.match((await attributeWrites([urlenc(ok)], null, 1)).reason, /no supported per-form marker/)
  assert.match((await attributeWrites([urlenc(ok)], plugin, 1, true)).reason, /may belong to that press/)
  assert.equal(await attributeWrites([], plugin, 1), null)
  // the endpoint of another form id is not this form's even with the marker
  assert.equal((await attributeWrites([{ ...urlenc(ok), url: url.replace('/69/', '/70/') }], plugin, 1)).fired, null)
})

test('forms: a missing required control and an ambiguous mapping are told apart', async () => {
  const r = await forms('src', 'noreq')
  assert.ok(r.findings.some((x) => x.kind === 'form-missing-required' && /name/i.test(x.control)), JSON.stringify(r.findings))
  const amb = await forms('src', 'ambig')
  assert.ok(amb.notMeasured.some((n) => /same label|ambiguous/.test(n.reason)), JSON.stringify(amb.notMeasured))
})

test('forms: a disabled submit that looks like the enabled one is form-disabled-indistinct; opacity makes it distinct', async () => {
  const flat = await forms('src', 'gate-flat')
  assert.ok(kinds(flat).includes('form-disabled-indistinct'), JSON.stringify(flat.findings))
  assert.equal(flat.site.forms[0].disabledStyle.cursor, 'not-allowed', 'the cursor is recorded; it is not what makes the look')
  const distinct = await forms('src', 'gate')
  assert.ok(!kinds(distinct).includes('form-disabled-indistinct'), JSON.stringify(distinct.findings))
  assert.ok(kinds(distinct).includes('form-submit-blocked'), 'the semantic defect is separate from the appearance one')
  assert.deepEqual(server.writes, [])
})

// ═══════════════ amendment 1, class 10: the current section on a single item ═════════════════
test('nav current: article, event and donation pages need the section the source highlights; markers without a rendered style, a wrong section and a CTA do not count', async () => {
  const routes = ['/blog/an-article', '/events/an-event', '/donations/a-project']
  for (const route of routes) {
    const source = await measureHeader(browser, side('header', 'src'), { width: 1440 })
    const run = async (variant) => headerFindings({ route, site: await measureHeader(browser, side('header', variant), { width: 1440 }), source })
    assert.deepEqual((await run('good')).findings, [], `${route}: the corrected site highlights About`)
    for (const variant of ['nocurrent', 'ctaonly', 'nonav']) {
      const r = await run(variant)
      assert.ok(r.findings.some((f) => f.kind === 'nav-current-missing' && f.route === route), `${route}/${variant}: ${JSON.stringify(r.findings)}`)
    }
    const wrong = await run('wrongsection')
    assert.ok(wrong.findings.some((f) => f.kind === 'nav-current-wrong'), JSON.stringify(wrong.findings))
  }
  // the current section is read on each side by any of its marks — aria-current, the menu system's class, a look the others do not share — and then compared
  const run0 = async (variant) => headerFindings({ route: '/x', site: await measureHeader(browser, side('header', variant), { width: 1440 }), source: await measureHeader(browser, side('header', 'src'), { width: 1440 }) })
  const marked = await measureHeader(browser, side('header', 'markedonly'), { width: 1440 })
  assert.deepEqual(marked.nav.current, ['About'])
  assert.ok(marked.nav.marked.includes('About') && !marked.nav.entries.find((e) => e.label === 'About').styled, 'aria-current and a class mark it with no style at all')
  assert.deepEqual((await run0('markedonly')).findings, [], 'marked by attribute and class on the site, by style on the source: the same section, no finding')
  const styled = await measureHeader(browser, side('header', 'stylesonly'), { width: 1440 })
  assert.ok(styled.nav.entries.find((e) => e.label === 'About').styled, 'a look the others do not share is a mark')
  assert.deepEqual((await run0('stylesonly')).findings, [], 'styled only on the site, marked only by attribute on the source: no finding')
  const cta = await measureHeader(browser, side('header', 'ctaonly'), { width: 1440 })
  assert.deepEqual(cta.nav.current, [], 'a CTA styled apart is not a current section')
})

// ═══════════════ amendment 3: false positives of the live runs on the fixed JA Essence port ═══════════════
test('header (live false positive): body.wp-custom-logo and a "logos-only" social row are neither the site logo nor a reason the Subscribe button is missing', async () => {
  const src = await measureHeader(browser, side('realheader', 'src'), { width: 1440 })
  const wp = await measureHeader(browser, side('realheader', 'wp'), { width: 1440 })
  assert.equal(wp.header.controls.logo.label, 'Brand', 'the site title, not the social-icon row')
  assert.equal(wp.header.controls.primary.label, 'Subscribe', 'the core button inside a wp-custom-logo body is found')
  const r = headerFindings({ route: '/', site: wp, source: src })
  assert.ok(!kinds(r).includes('header-control-missing'), JSON.stringify(r.findings))
})

test('header (live false positive): spacing a wrapper keeps below the painted header is not header height; a really taller header still is', async () => {
  const src = await measureHeader(browser, side('realheader', 'src'), { width: 1440 })
  assert.ok(src.header.box.h - src.header.content.h > 30, `the wrapper is taller than what it paints (${src.header.box.h} vs ${src.header.content.h})`)
  const wp = await measureHeader(browser, side('realheader', 'wp'), { width: 1440 })
  assert.deepEqual(headerFindings({ route: '/', site: wp, source: src }).findings.filter((f) => f.kind === 'header-height'), [])
  const tall = await measureHeader(browser, side('realheader', 'wptall'), { width: 1440 })
  assert.ok(headerFindings({ route: '/', site: tall, source: src }).findings.some((f) => f.kind === 'header-height' && f.delta >= 10), 'a 12 px taller header is a finding')
})

test('drawer (live false positive): a parent whose label is a real link and whose submenu opens from a separate toggle is measured through the toggle', async () => {
  const source = await measureDrawer(browser, side('drawer', 'linkparent'))
  const services = source.states.find((s) => s.labels.join('>') === 'Services')
  assert.ok(services, source.states.map((s) => s.labels.join('>')).join(' | '))
  assert.equal(services.model, 'accordion', 'the click reached the toggle; it did not follow the link and read "none"')
  assert.ok(services.children.includes('Web'))
  const r = drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'good')), source, theme: 'light' })
  assert.ok(!kinds(r).includes('drawer-model'), JSON.stringify(r.findings))
})

test('drawer contrast (live false positive): one failing text that sits in every state is one finding, not one per state', () => {
  const failing = [{ text: 'Sidebar Menu', ratio: 4.23, color: 'rgb(77, 107, 255)', background: 'rgb(17, 21, 31)' }]
  const state = (labels, extra = {}) => ({ path: labels.map(String), labels, depth: labels.length, model: labels.length ? 'accordion' : 'root', rows: 5, back: false, overlaps: [], kids: [], children: [], declared: [], claims: null, contrast: { examined: 8, min: 4.23, failing, failingCount: 1, unmeasured: [], unmeasuredCount: 0 }, ...extra })
  const site = { width: 390, measured: true, states: [state([]), state(['Home']), state(['Pages']), state(['Pages', 'User'], { contrast: { examined: 8, min: 3.1, failing: [...failing, { text: 'User', ratio: 3.1, color: '#444', background: '#111' }], failingCount: 2, unmeasured: [], unmeasuredCount: 0 } })] }
  const r = drawerFindings({ route: '/', site, source: { width: 390, measured: true, states: [] }, theme: 'dark' })
  const found = r.findings.filter((f) => f.kind === 'menu-contrast')
  assert.equal(found.length, 2, JSON.stringify(found))
  assert.equal(found[0].state, 'root')
  assert.deepEqual(found[1].failing.map((f) => f.text), ['User'], 'a text that fails only in a deeper state is its own finding')
})

test('carousel (live false positive): slides that are the children of a scroll-snap list inside an aria carousel are found, counted and reached by the arrows', async () => {
  const site = await measureCarousels(browser, side('trackcarousel', 'track'))
  assert.equal(site.carousels.length, 1)
  assert.equal(site.carousels[0].kind, 'scroller')
  assert.equal(site.carousels[0].items, 4)
  assert.ok(site.carousels[0].arrows >= 2)
  assert.equal(site.carousels[0].unreached, 0, JSON.stringify(site.carousels))
  const source = await measureCarousels(browser, side('carousel', 'src'))
  assert.deepEqual(carouselFindings({ route: '/', site, source }).findings, [], 'the site has the carousel the source has')
  const bare = await measureCarousels(browser, side('trackcarousel', 'trackstatic'))
  assert.ok(carouselFindings({ route: '/', site: bare, source }).findings.some((f) => /carousel-controls-missing|carousel-unreachable/.test(f.kind)), 'without controls it is still a defect')
})

test('carousel (control identity): the arrow that goes forward is found by what it says or by pressing every arrow — a last-arrow guess and autoplay never decide reachability', async () => {
  const source = await measureCarousels(browser, side('carousel', 'src'))
  for (const variant of ['arrowsprevlast', 'arrowsplain', 'arrowsauto']) {
    const site = await measureCarousels(browser, side('carousel', variant))
    assert.equal(site.carousels[0].arrows, 2, `${variant}: both arrows are controls`)
    assert.equal(site.carousels[0].unreached, 0, `${variant}: ${JSON.stringify(site.carousels[0])}`)
    assert.ok(!carouselFindings({ route: '/', site, source }).findings.some((f) => f.kind === 'carousel-unreachable'), variant)
  }
})

test('carousel (causality): a supported per-instance pause isolates autoplay; without one a page timer leaves the carousel unmeasured — autoplay alone never decides reachability', async () => {
  const source = await measureCarousels(browser, side('carousel', 'src'))
  const read = async (variant) => { const site = await measureCarousels(browser, side('carousel', variant)); return { site, c: site.carousels[0], r: carouselFindings({ route: '/', site, source }) } }
  // supported pause (a Swiper-style instance API), a 2 s autoplay: the dead arrows reach nothing, the working ones everything — measured, nothing global was changed
  const dead = await read('inertswiper')
  assert.match(dead.c.causality, /^paused:swiper/, JSON.stringify(dead.c))
  assert.ok(dead.c.unreached > 0 && kinds(dead.r).includes('carousel-unreachable'), JSON.stringify(dead.c))
  const works = await read('arrowsswiper')
  assert.equal(works.c.unreached, 0, JSON.stringify(works.c))
  assert.deepEqual(works.r.findings, [])
  // no supported pause and the page schedules a slow timer (the autoplay, or an unrelated one): not measured, neither passed nor a reachability claim
  // (`inertcss`: a CSS animation that loops forever moves the items with no timer at all — it is an autoplay too)
  for (const variant of ['inertslow', 'inertfast', 'arrowsauto', 'inertlatefree', 'inertcss']) {
    const x = await read(variant)
    assert.equal(x.c.causality, 'uncertain', `${variant}: ${JSON.stringify(x.c)}`)
    assert.ok(x.r.notMeasured.some((n) => /no supported pause/.test(n.reason)), variant)
    assert.ok(!kinds(x.r).includes('carousel-unreachable'), variant)
  }
  // a focus pause the page implements itself, or a quiet period, or an unrelated slow timer, is no supported pause: nothing is credited to a control or to the autoplay
  for (const variant of ['arrowsunrelated', 'inertfocus', 'arrowsfocus']) {
    const x = await read(variant)
    assert.equal(x.c.causality, 'uncertain', `${variant}: ${JSON.stringify(x.c)}`)
    assert.ok(x.r.notMeasured.some((n) => /no supported pause/.test(n.reason)), variant)
    assert.ok(!kinds(x.r).includes('carousel-unreachable'), variant)
  }
  // a carousel with no timer at all and nothing moving by itself is measured without any pause, and an unrelated one-shot timer that has already fired changes nothing
  const quiet = await read('arrowsoneshot')
  assert.equal(quiet.c.causality, 'no-timer', JSON.stringify(quiet.c))
  assert.equal(quiet.c.unreached, 0)
  assert.deepEqual(quiet.r.findings, [])
  // a delayed autoplay (a 4 s one-shot starts a 1 s interval) beside inert arrows: the one-shot is waited for, the interval is on the record, no pause → unmeasured, not credited to an arrow
  const delayedAuto = await read('inertdelayedauto')
  assert.equal(delayedAuto.c.causality, 'uncertain', JSON.stringify(delayedAuto.c))
  assert.ok(!kinds(delayedAuto.r).includes('carousel-unreachable'))
  assert.ok(delayedAuto.r.notMeasured.some((n) => /no supported pause/.test(n.reason)))
  // a one-shot timer too far away to wait for could start an autoplay later: uncertain, never "no timer"
  const farTimer = await read('arrowsfartimer')
  assert.equal(farTimer.c.causality, 'uncertain', JSON.stringify(farTimer.c))
  // identities: an empty slider-like root before the real carousel, and arrows that re-order after every press, change neither the carousel nor the arrow that is pressed
  const ids = await read('arrowsreorder')
  assert.equal(ids.c.unreached, 0, JSON.stringify(ids.c))
  assert.deepEqual(ids.r.findings, [])
  // an autoplay that starts after any baseline (2.5 s): with the instance's pause it is still isolated, and the inert arrows are found out
  const late = await read('inertlatestart')
  assert.match(late.c.causality, /^paused:swiper/)
  assert.ok(kinds(late.r).includes('carousel-unreachable'), JSON.stringify(late.c))
  // a carousel whose controls appear 1.5 s after load is read once it has settled: its arrows work, nothing is reported
  const delayed = await read('arrowslate')
  assert.equal(delayed.c.arrows, 2, JSON.stringify(delayed.c))
  assert.equal(delayed.c.unreached, 0, JSON.stringify(delayed.c))
  assert.deepEqual(delayed.r.findings, [])
  // the page's own timers run as they always do: an initialisation timer of a second and a half completed (the arrows exist), nothing was suppressed
  assert.ok(delayed.c.settled)
})

test('forms (live false positives): a CMS finder form is not a contact form; "Your name" is the source\'s "Name"; the real gaps (Subject, copy box) are findings', async () => {
  const read = async (variant) => measureForms(browser, side('contact', variant))
  const source = await read('src')
  assert.equal(source.forms.length, 1, 'the finder search form is not a form to compare')
  const wp = await read('wp')
  const r = formFindings({ route: '/contact/', site: wp, source })
  assert.ok(!kinds(r).includes('form-missing'), `the contact form is paired: ${JSON.stringify(r.findings)}`)
  assert.ok(r.findings.some((f) => f.kind === 'form-missing-required' && /subject/i.test(f.control)), JSON.stringify(r.findings))
  assert.ok(r.findings.some((f) => f.kind === 'form-control-missing' && /copy/i.test(f.control)), JSON.stringify(r.findings))
  assert.ok(!kinds(r).includes('form-extra-required'))
  assert.deepEqual(formFindings({ route: '/contact/', site: await read('wpfixed'), source }).findings, [], 'the corrected form is clean')
  assert.deepEqual(server.writes, [])
})

// ═══════════════ amendment 3: false positives of the live run on the fixed JA Impact port ═══════════════
test('header (live false positives): the painted logo, the finder search, a submenu toggle that is no menu button and an <a> without href are one control each on both sides', async () => {
  const src = await measureHeader(browser, side('deskheader', 'src'), { width: 1440 })
  const wp = await measureHeader(browser, side('deskheader', 'wp'), { width: 1440 })
  assert.ok(src.header.controls.search, 'a <search> element holding a finder form is the header search')
  assert.ok(wp.header.controls.search)
  assert.equal(wp.header.controls.hamburger, undefined, '"Pages submenu" opens one branch: it is not the menu button')
  assert.equal(src.header.controls.hamburger, undefined)
  assert.equal(wp.header.controls.logo.w, 208, 'the image, not the 240 px figure around it')
  const r = headerFindings({ route: '/', site: wp, source: src })
  assert.deepEqual(r.findings.filter((f) => f.kind !== 'header-height'), [], JSON.stringify(r.findings))
  const pages = (m) => m.inventory.find((x) => x.key === 'pages')
  assert.ok(pages(src).shown && pages(wp).shown, 'an <a> without href that reads "Pages" is inventoried as shown')
})

test('drawer (live false positives): a drill-down level drawn over its parent rows is not an overlap and is not an accordion; the level must have one back row, and it must work', async () => {
  const source = await measureDrawer(browser, side('drawer', 'cover'))
  const services = source.states.find((s) => s.labels.join('>') === 'Services')
  assert.equal(services.model, 'drill-down', 'the parent rows are covered by the open level')
  assert.equal(services.backWorks, true)
  const clean = drawerFindings({ route: '/', site: source, source, theme: 'light' })
  assert.deepEqual(clean.findings, [], JSON.stringify(clean.findings))
  const drill = await measureDrawer(browser, side('drawer', 'drill'))
  assert.deepEqual(drawerFindings({ route: '/', site: source, source: drill, theme: 'light' }).findings.filter((f) => f.kind === 'drawer-overlap' || f.kind === 'drawer-model'), [], 'against a source whose parents slide away')
  // a cover with NO back row stays an overlap (the existing defect fixture)
  const overlap = drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'overlap')), source: await measureDrawer(browser, side('drawer', 'src')), theme: 'light' })
  assert.ok(kinds(overlap).includes('drawer-overlap'))
})

test('drawer (Impact audit item B): a back row that does nothing, and a second back row the source does not show, are findings', async () => {
  const source = await measureDrawer(browser, side('drawer', 'cover'))
  const inert = await measureDrawer(browser, side('drawer', 'coverinert'))
  const a = drawerFindings({ route: '/', site: inert, source, theme: 'light' })
  assert.ok(a.findings.some((f) => f.kind === 'drawer-back-inert'), JSON.stringify(a.findings))
  const double = await measureDrawer(browser, side('drawer', 'coverdouble'))
  const b = drawerFindings({ route: '/', site: double, source, theme: 'light' })
  assert.ok(b.findings.some((f) => f.kind === 'drawer-back-duplicate' && f.rows === 2), JSON.stringify(b.findings))
})

test('nav current (Impact audit item A): lighting a second section the source does not light is nav-current-extra', async () => {
  const source = { header: { box: { h: 80 }, controls: {} }, nav: { links: 4, current: ['Pages'], marked: ['Pages'] }, inventory: [] }
  const site = (current) => ({ width: 1440, header: { box: { h: 80 }, controls: {} }, nav: { links: 4, current, marked: current }, inventory: [] })
  const same = headerFindings({ route: '/blog-detail', site: site(['Pages']), source })
  assert.deepEqual(same.findings, [])
  const two = headerFindings({ route: '/blog-detail', site: site(['Pages', 'Blog']), source })
  const f = two.findings.find((x) => x.kind === 'nav-current-extra')
  assert.deepEqual(f.extra, ['Blog'], JSON.stringify(two.findings))
})

test('forms (live false positive): a consent checkbox whose label the site prefixes ("Privacy Note * By submitting…") is the same control, and its required-ness is compared', () => {
  const field = (key, extra = {}) => ({ i: 0, key, label: key, type: 'checkbox', required: false, nativeRequired: false, shown: true, checked: false, ...extra })
  const form = (fields) => ({ index: 0, action: '/c', fields, submit: { disabled: false, label: 'Send', style: { opacity: 1, color: 'x', background: 'y', border: 'z', cursor: 'pointer', pointerEvents: 'auto', filter: 'none' } }, dupKeys: [], state1: { disabled: false, invalid: [] } })
  const consent = 'by submitting this form you agree to the privacy policy'
  const source = { measured: true, width: 1440, total: 1, forms: [form([field('first name', { type: 'text', required: true }), field(consent)])] }
  const site = { measured: true, width: 1440, total: 1, forms: [form([field('first name', { type: 'text', required: true }), field(`privacy note ${consent}`, { required: true })])] }
  const r = formFindings({ route: '/contact/', site, source })
  const f = r.findings.find((x) => x.kind === 'form-extra-required')
  assert.ok(f && f.source === 'optional', `the control is paired, not "no such control": ${JSON.stringify(r.findings)}`)
  assert.ok(!kinds(r).includes('form-control-missing'))
})

test('header (live Impact false positive): the port\'s dark toggle is not an "extra control" when the source has none; any other extra control still is', () => {
  const box = { x: 0, y: 0, w: 1440, h: 100, cx: 720, cy: 50 }
  const ctl = (label) => ({ x: 1000, y: 40, w: 30, h: 30, label })
  const hdr = (controls) => ({ measured: true, width: 1440, header: { box, content: { h: 100 }, controls }, nav: null, inventory: [] })
  const source = hdr({ logo: ctl('Brand') })
  const t = headerFindings({ route: '/', site: hdr({ logo: ctl('Brand'), toggle: ctl('Switch to dark') }), source })
  assert.deepEqual(t.findings, [], JSON.stringify(t.findings))
  const s = headerFindings({ route: '/', site: hdr({ logo: ctl('Brand'), search: ctl('Search') }), source })
  assert.ok(kinds(s).includes('header-control-extra'), JSON.stringify(s.findings))
  const missing = headerFindings({ route: '/', site: source, source: hdr({ logo: ctl('Brand'), toggle: ctl('Toggle dark mode') }) })
  assert.ok(kinds(missing).includes('header-control-missing'), 'a toggle the source has and the site lacks is still missing')
})

test('forms (live Impact): a long consent label the site prefixes ("Privacy Note * …") and makes required pairs with the optional source box — one form-extra-required, no "missing" twin', async () => {
  const read = async (variant) => measureForms(browser, side('contact', variant))
  const r = formFindings({ route: '/contact/', site: await read('consentwp'), source: await read('consentsrc') })
  const extra = r.findings.filter((f) => f.kind === 'form-extra-required')
  assert.equal(extra.length, 1, JSON.stringify(r.findings))
  assert.equal(extra[0].source, 'optional', 'paired with the source box, not "no such control"')
  assert.ok(!kinds(r).includes('form-control-missing'), JSON.stringify(r.findings))
  assert.deepEqual(formFindings({ route: '/contact/', site: await read('consentsrc'), source: await read('consentsrc') }).findings, [])
})

test('drawer pairing: parents are paired by name or by the rows beneath, not by sibling index — reordered/renamed is clean of cascades, a missing one is missing, an unmatchable pair is not measured', async () => {
  const source = await measureDrawer(browser, side('drawer', 'multisrc'), { theme: 'light' })
  assert.ok(source.states.some((s) => s.labels.join(' > ') === 'Services > Company'), 'the source opens its second parent too')
  const find = async (variant) => drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', variant), { theme: 'light' }), source, theme: 'light' })
  const same = await find('multigood')
  assert.deepEqual(same.findings, [], JSON.stringify(same.findings))
  const re = await find('multireorder')
  assert.ok(!re.findings.some((f) => /missing|not-opened/.test(f.kind)), `an order change is no missing parent: ${JSON.stringify(re.findings)}`)
  assert.ok(re.findings.some((f) => f.kind === 'drawer-labels-differ' && f.source === 'Apps' && f.site === 'Platforms'), 'the rename is named once, against the right parent')
  assert.ok(!re.findings.some((f) => f.kind === 'drawer-labels-differ' && /Company/.test(f.state)), 'Company is not paired with the wrong parent')
  const gone = await find('multimissing')
  assert.ok(gone.findings.some((f) => f.kind === 'drawer-submenu-missing' && /Company/.test(f.state)), JSON.stringify(gone.findings))
  const amb = await find('multiambig')
  assert.ok(amb.notMeasured.some((n) => n.check === 'drawer' && /none shares its name/.test(n.reason)), JSON.stringify(amb.notMeasured))
  assert.ok(!amb.findings.some((f) => /missing/.test(f.kind)), 'ambiguous parents are not reported as missing')
})

test('drawer-submenu (live false positive): a menu the site renamed in the same place is drawer-labels-differ, not "submenu missing" and not a cascade', async () => {
  const source = await measureDrawer(browser, side('drawer', 'src'))
  const renamed = await measureDrawer(browser, side('drawer', 'renamed'))
  const r = drawerFindings({ route: '/', site: renamed, source, theme: 'light' })
  assert.ok(kinds(r).includes('drawer-labels-differ'), JSON.stringify(r.findings))
  assert.ok(!kinds(r).includes('drawer-submenu-missing') && !kinds(r).includes('drawer-submenu-children-missing'), JSON.stringify(r.findings))
  // fewer children than the source is still children-missing, and an absent parent still missing
  const partial = drawerFindings({ route: '/', site: await measureDrawer(browser, side('drawer', 'partial')), source, theme: 'light' })
  assert.ok(kinds(partial).includes('drawer-submenu-children-missing'))
})

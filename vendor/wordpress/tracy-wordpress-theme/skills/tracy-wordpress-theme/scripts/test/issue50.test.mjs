// Issue #50 — Visual QA never captured an open header menu: every header trigger that owns a panel is
// opened on both sides, paired by its words, captured (boxes + picture) at each axis, and compared
// like a page; the finding is deterministic, not pointer noise. Fixture: scripts/test/issue50-fixture.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { PNG } from 'pngjs'
import { RUN_LAUNCH_ARGS, accept, diffProperty, run, settle } from '../visual/visual-qa.mjs'
import { MENU_KINDS, captureMenu, captureSide, compareMenuPanels, comparePanelPictures, inPageMenuHeld, inPageMenuTriggers, measureMenus, menuKey, menuShotName, pairMenus, writeShot } from '../visual/menu-open.mjs'
import { UNMEASURED_KINDS, validateContract } from '../visual/contract.mjs'
import { compareRuns, isPointer, ownerOf, stableCount } from '../visual/rounds.mjs'
import { TOOL_VERSION } from '../visual/page-hash.mjs'
import { fixture, serve, sitePage, sourcePage } from './issue50-fixture.mjs'

const runOn = async (fx, origin, extra = {}) => {
  const out = path.join(fx.root, `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const report = await run({ contract: fx.contractFile, site: origin, out, spec: fx.spec, sourceSite: null, concurrency: 1, stage: 'light-desktop', ...extra })
  return { report, out }
}
const withSite = async (site, source, fn) => {
  const fx = fixture(site, source)
  const srv = await serve(fx.site)
  try {
    return await fn(fx, srv.origin)
  } finally {
    await srv.close()
  }
}
const axisOf = (report, variant) => report.pages[0].axes.find((a) => a.variant === variant)
const menuKinds = (axis) => axis.findings.filter((f) => f.kind.startsWith('menu-open-'))
const row = (axis, label) => axis.menus.menus.find((m) => m.trigger === label)
const pngSize = (file) => {
  const p = PNG.sync.read(readFileSync(file))
  return { w: p.width, h: p.height, px: (x, y) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 3)] }
}

test('issue 50: a mega panel whose open layout differs from the source is a finding by trigger; the same panel written another way is clean', async () => {
  const same = await withSite({}, {}, (fx, origin) => runOn(fx, origin))
  const a = axisOf(same.report, '1440-light')
  assert.deepEqual(a.findings, [], JSON.stringify(a.findings).slice(0, 600))
  assert.equal(same.report.summary.stages['light-desktop'], 'pass')
  // the header's three triggers, found on both sides and paired by words despite another DOM order
  // and other class names; the body's accordion and the footer's disclosure are not header menus
  assert.deepEqual([...a.menus.site.labels].sort(), ['Our Services', 'Search', 'Work & "Cases" / 2026'])
  assert.deepEqual(a.menus.source.labels, ['Search', 'Our Services', 'Work & "Cases" / 2026'], 'the source writes them in another order')
  assert.equal(a.menus.pairs, 3)
  assert.deepEqual(Object.fromEntries(a.menus.menus.map((m) => [m.trigger, [m.site.via, m.source.via]])), { 'Our Services': ['hover', 'hover'], Search: ['click', 'click'], 'Work & "Cases" / 2026': ['hover', 'hover'] })
  const services = row(a, 'Our Services')
  assert.deepEqual(services.site.rect, services.source.rect)
  assert.ok(services.site.items.some((i) => i.kind === 'text' && i.text === 'Consulting' && i.styles['font-size'] === '24px'))
  // every capture is a picture of the OPEN panel, written once a side
  for (const m of a.menus.menus)
    for (const side of ['site', 'source']) {
      assert.match(m[side].screenshot, /^shots\/menus\/en-about--1440-light--[a-z0-9-]+-[0-9a-f]{8}--(site|source)\.png$/, 'no quote or slash of the label in the path')
      // the picture is the panel's box on whole pixels: from the floor of its edge to the ceiling of the other
      const { x, y, w, h } = m[side].rect
      const png = pngSize(path.join(same.out, m[side].screenshot))
      assert.deepEqual([png.w, png.h], [Math.ceil(x + w) - Math.floor(x), Math.ceil(y + h) - Math.floor(y)])
    }
  const icon = pngSize(path.join(same.out, services.site.screenshot)).px(40 + 20, 24 + 20)
  assert.deepEqual(icon, [20, 72, 58], 'the picture shows the open panel, its icon drawn')
  assert.equal(same.report.summary.menus.captured, 3)

  const card = await withSite({ card: true }, {}, (fx, origin) => runOn(fx, origin))
  const b = axisOf(card.report, '1440-light')
  assert.equal(card.report.summary.stages['light-desktop'], 'fail')
  const layout = b.findings.find((f) => f.kind === 'menu-open-layout')
  assert.equal(layout.element, 'header menu "Our Services" › panel')
  assert.equal(layout.trigger, 'Our Services')
  assert.deepEqual(layout.deltas.find((d) => d.property === 'panel-w'), { property: 'panel-w', expected: '1440px', observed: '880px' })
  const h3 = b.findings.find((f) => f.element === 'header menu "Our Services" › h3 "Consulting"')
  assert.deepEqual(h3.deltas.find((d) => d.property === 'font-size'), { property: 'font-size', expected: '24px', observed: '12px' })
  assert.deepEqual(b.findings.find((f) => f.element === 'header menu "Our Services" › icons').deltas, [{ property: 'icons', expected: '3', observed: '0' }])
  assert.ok(menuKinds(b).every((f) => f.trigger === 'Our Services'), 'the other panels are the same on both sides')
  assert.equal(pngSize(path.join(card.out, row(b, 'Our Services').site.screenshot)).w, 880)
  // the evidence: VISUAL.md names the capture, index.json lists both pictures apart from the page shots
  const md = readFileSync(path.join(card.out, 'VISUAL.md'), 'utf8')
  assert.match(md, /## Header menus captured open/)
  assert.match(md, /"Our Services": site hover `shots\/menus\/.*--site\.png` · source hover `shots\/menus\/.*--source\.png` · findings \d+/)
  const index = JSON.parse(readFileSync(path.join(card.out, 'index.json'), 'utf8'))
  assert.equal(index.menuShots.length, 6)
  assert.ok(index.menuShots.every((s) => s.state === 'menu-open' && existsSync(s.file) && path.isAbsolute(s.file)))
  assert.ok(index.shots.every((s) => !s.file.includes(`${path.sep}menus${path.sep}`)), 'a lens taking the page picture never takes a panel')
  const machine = JSON.parse(readFileSync(path.join(card.out, 'notes', 'machine.json'), 'utf8'))
  assert.ok(machine.some((m) => m.lens === 'machine:menu-open-layout' && /880px/.test(m.what)))
})

test('issue 50: at 390 the drawer behind the burger is the trigger, opened by a click; the hidden desktop menus are not counted; a dark axis without a dark source measures none', async () => {
  const { report, out } = await withSite({}, {}, (fx, origin) => runOn(fx, origin, { stage: 'light-responsive,dark-desktop', allStages: true }))
  const dark = axisOf(report, '1440-dark')
  assert.deepEqual(dark.menus, { measured: false, reason: 'the source export has no dark of its own (contract.source.darkHook is null)' })
  assert.equal(report.summary.menus.unmeasuredAxes.length, 1)
  assert.match(readFileSync(path.join(out, 'VISUAL.md'), 'utf8'), /`en-about` 1440-dark — not measured: the source export has no dark of its own/)
  const a = axisOf(report, '390-light')
  assert.deepEqual(a.findings, [])
  assert.deepEqual(a.menus.site.labels, ['Menu'])
  assert.deepEqual(a.menus.source.labels, ['Menu'])
  const m = row(a, 'Menu')
  assert.equal(m.site.via, 'click')
  assert.equal(m.site.rect.w, 390)
  assert.ok(m.site.items.some((i) => i.text === 'About us'))
  assert.ok(existsSync(path.join(out, m.site.screenshot)))
})

test('issue 50: a label on one side only, a label said twice, a panel nobody names, one that does not open and one that does not hold still are named — never clean, never accepted', async () => {
  const site = { dead: true, dupe: true, brokenControls: true, lang: true, jitter: true, extra: true }
  const { report, out } = await withSite(site, { lang: true, extra: true }, (fx, origin) => runOn(fx, origin))
  const a = axisOf(report, '1440-light')
  // a pair captured on one side only: that side's picture is listed, the other listed missing with why
  const index = JSON.parse(readFileSync(path.join(out, 'index.json'), 'utf8'))
  assert.deepEqual(index.menuMissing.map((m) => `${m.trigger} ${m.side}`).sort(), ['Language site', 'Our Services site'])
  assert.deepEqual(index.menuShots.map((m) => `${m.trigger} ${m.side}`).sort(), ['Language source', 'Our Services source'])
  const got = menuKinds(a).map((f) => `${f.kind} ${f.trigger ?? ''} ${f.side}`).sort()
  assert.deepEqual(got, [
    'menu-open-not-measured Language site',
    'menu-open-not-measured Our Services site',
    'menu-open-not-measured Search site',
    'menu-open-not-measured Work & "Cases" / 2026 site',
    'menu-open-unmatched Contact source',
    'menu-open-unmatched Shop site'
  ])
  const reason = (label) => a.findings.find((f) => f.trigger === label).reason
  assert.match(reason('Work & "Cases" / 2026'), /2 triggers on the site header say these words; a pair is never picked by position/)
  assert.match(reason('Search'), /aria-controls names #nowhere/)
  assert.match(reason('Our Services'), /did not show on hover nor on a click/)
  assert.match(reason('Language'), /did not hold still/)
  assert.equal(report.summary.stages['light-desktop'], 'fail')
  assert.equal(report.summary.menus.notMeasured, 4)
  assert.equal(report.summary.menus.unmatched, 2)
  // an exception never accepts a panel nobody captured; the contract refuses one that tries
  assert.ok(UNMEASURED_KINDS.includes('menu-open-not-measured'))
  const c = fixture().contract
  const x = { kind: 'menu-open-not-measured', match: '.*', reason: 'r', decision: 'DECISIONS.md D1' }
  assert.equal(accept({ ...c, design: { ...c.design, exceptions: [x] } }, { kind: 'menu-open-not-measured', element: 'header menu "Search"' }), null)
  assert.ok(validateContract({ ...c, design: { ...c.design, exceptions: [x] } }).some((e) => /menu-open-not-measured: a measurement that was not taken/.test(e)))
  const y = { kind: 'menu-open-unmatched', match: 'Shop', reason: 'the port adds a shop', decision: 'DECISIONS.md D2' }
  assert.ok(accept({ ...c, design: { ...c.design, exceptions: [y] } }, { kind: 'menu-open-unmatched', element: 'header menu "Shop"' }), 'a trigger on one side only can be a decision')
})

test('issue 50: a panel that will not close has its page loaded again, and the next trigger is found again by its words', async () => {
  const { report } = await withSite({ sticky: true }, { sticky: true }, (fx, origin) => runOn(fx, origin))
  const a = axisOf(report, '1440-light')
  assert.deepEqual(a.findings, [])
  const search = row(a, 'Search')
  assert.equal(search.site.closed, 'reload')
  assert.equal(search.source.closed, 'reload')
  assert.equal(row(a, 'Work & "Cases" / 2026').site.via, 'hover', 'captured after the reload')
})

test('issue 50: pairing is by words — order, typesetting and case do not matter; no words, two of the same, one side empty are named', () => {
  const t = (label, extra = {}) => ({ i: 0, label, tag: 'button', how: 'control', clickable: true, problem: null, ...extra })
  assert.equal(menuKey('  Our Services ▾'), 'our services')
  assert.equal(menuKey('Work & “Cases” / 2026'), menuKey('WORK &  "Cases" / 2026'))
  assert.equal(menuKey('Design‑build'), 'design-build')
  const p = pairMenus({ triggers: [t('Our Services'), t('Search'), t(''), t('About'), t('About')] }, { triggers: [t('SEARCH'), t('our services ›'), t('About'), t('Contact'), t('Broken', {})] })
  assert.deepEqual(p.matched.map((m) => [m.key, m.site.label, m.source.label]), [['our services', 'Our Services', 'our services ›'], ['search', 'Search', 'SEARCH']])
  // an icon-only trigger says no words: on its side only, like a label the other side lacks
  assert.deepEqual(p.unmatched.map((u) => [u.label, u.side]), [['', 'site'], ['Broken', 'source'], ['Contact', 'source']])
  assert.deepEqual(p.notMeasured.map((n) => [n.label, n.side]), [['About', 'site']])
  const broken = pairMenus({ triggers: [t('Search', { problem: 'its aria-controls names #x, which is not in the page' })] }, { triggers: [t('Search')] })
  assert.deepEqual([broken.matched.length, broken.notMeasured[0].side], [0, 'site'])
  // a header with no trigger at all on one side: every trigger of the other is unmatched, not "0 to compare"
  const empty = pairMenus({ triggers: [] }, { triggers: [t('Our Services'), t('Search')] })
  assert.deepEqual(empty.unmatched.map((u) => u.side), ['source', 'source'])
  assert.deepEqual(pairMenus({ triggers: [] }, { triggers: [] }), { matched: [], unmatched: [], notMeasured: [] })
})

test('issue 50: a page with no header has no trigger; a body accordion and a footer disclosure are never one', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
    await p.setContent('<main><button aria-expanded="false" aria-controls="a">Open</button><div id="a" hidden><a href="#">x</a></div></main><footer><ul><li><a href="#">More</a><ul style="display:none"><li><a href="#">y</a></li></ul></li></ul></footer>')
    assert.deepEqual(await p.evaluate(inPageMenuTriggers, 16), { headers: 0, openAtRest: 0, overCap: 0, triggers: [] })
    await p.setContent(sitePage({}))
    const c = await p.evaluate(inPageMenuTriggers, 2)
    assert.deepEqual([c.headers, c.triggers.length, c.overCap], [1, 2, 1], 'past the cap is counted, not opened')
    // a panel shown at rest is no closed panel to open
    await p.setContent('<header><ul><li><a href="/a/">Always</a><ul><li><a href="/b/">shown</a></li></ul></li></ul></header>')
    assert.deepEqual(await p.evaluate(inPageMenuTriggers, 16), { headers: 1, openAtRest: 1, overCap: 0, triggers: [] })
  } finally {
    await b.close()
  }
})

test('issue 50: a panel a script keeps moving is not captured as still while another page is newer (the run keeps background pages at full speed)', async () => {
  const { chromium } = await import('playwright')
  assert.ok(RUN_LAUNCH_ARGS.includes('--disable-background-timer-throttling'))
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const out = mkdtempSync(path.join(tmpdir(), 'i50-shot-'))
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await p.setContent(sitePage({ lang: true, jitter: true }))
    await settle(p)
    const t = (await p.evaluate(inPageMenuTriggers, 16)).triggers.find((x) => x.label === 'Language')
    // a newer page in another context, as the source page is while the site waits
    const q = await (await b.newContext()).newPage()
    await q.setContent('<p>newer</p>')
    const cap = await captureMenu(p, t, { out, rel: 'shots/menus/x--site.png', props: ['font-size'] })
    assert.equal(cap.opened, false)
    assert.match(cap.reason, /did not hold still/)
    assert.equal(existsSync(path.join(out, 'shots/menus/x--site.png')), false, 'no picture of a panel caught mid-motion')
  } finally {
    await b.close()
  }
})

test('issue 50: a source that does not load gives no clean pair; a spent budget names what it left', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture()
  const srv = await serve(fx.site)
  try {
    const r = await measureMenus({ browser: b, url: `${srv.origin}/about/`, sourceUrl: 'http://127.0.0.1:9/about/', siteOpts: { viewport: { width: 1440, height: 900 } }, sourceOpts: { viewport: { width: 1440, height: 900 } }, pageId: 'en-about', variantId: '1440-light', out: fx.root, settle, props: ['font-size'], diffProperty })
    assert.equal(r.record.measured, false)
    assert.match(r.record.reason, /the source did not load/)
    assert.deepEqual(r.record.menus, [])
    assert.deepEqual(r.findings.map((f) => [f.kind, f.side]), [['menu-open-not-measured', 'source']])
    const p = await b.newPage()
    await p.goto(`${srv.origin}/about/`)
    const c = await p.evaluate(inPageMenuTriggers, 16)
    const caps = await captureSide(p, new Map(c.triggers.map((t) => [menuKey(t.label), t])), { reload: async () => c, out: fx.root, relOf: (k) => menuShotName('p', 'v', k, 'site'), props: ['font-size'], budgetMs: 0 })
    assert.equal(caps.size, 3)
    assert.ok([...caps.values()].every((x) => !x.opened && /budget of 0 ms for this side ran out/.test(x.reason)))
  } finally {
    await srv.close()
    await b.close()
  }
})

test('issue 50: capture files are named safely and never written through a symlink, into a FIFO, or half', () => {
  const names = ['Work & "Cases" / 2026', "l'été ../../etc", 'été', 'ete'].map((l) => menuShotName('en-about', '1440-light', menuKey(l), 'site')) // language-allow: data: accented menu labels
  for (const n of names) assert.match(n, /^shots\/menus\/en-about--1440-light--[a-z0-9-]+-[0-9a-f]{8}--site\.png$/)
  assert.equal(new Set(names).size, names.length, 'two labels folding to the same ASCII keep two files')
  assert.notEqual(menuShotName('p', '1440-light', 'k', 'site'), menuShotName('p', '390-light', 'k', 'site'))
  assert.notEqual(menuShotName('p', 'v', 'k', 'site'), menuShotName('p', 'v', 'k', 'source'))
  const out = mkdtempSync(path.join(tmpdir(), 'i50-write-'))
  assert.equal(writeShot(out, 'shots/menus/a.png', Buffer.from('png')), 'shots/menus/a.png')
  assert.equal(readFileSync(path.join(out, 'shots/menus/a.png'), 'utf8'), 'png')
  writeShot(out, 'shots/menus/a.png', Buffer.from('png2'))
  assert.equal(readFileSync(path.join(out, 'shots/menus/a.png'), 'utf8'), 'png2', 'a regular file is replaced whole')
  const elsewhere = path.join(out, 'elsewhere.png')
  writeFileSync(elsewhere, 'keep')
  symlinkSync(elsewhere, path.join(out, 'shots/menus/link.png'))
  assert.throws(() => writeShot(out, 'shots/menus/link.png', Buffer.from('x')), /symlink/)
  assert.equal(readFileSync(elsewhere, 'utf8'), 'keep')
  execFileSync('mkfifo', [path.join(out, 'shots/menus/fifo.png')])
  assert.throws(() => writeShot(out, 'shots/menus/fifo.png', Buffer.from('x')), /not a regular file/)
  mkdirSync(path.join(out, 'real'))
  symlinkSync(path.join(out, 'real'), path.join(out, 'shots/linked'))
  assert.throws(() => writeShot(out, 'shots/linked/b.png', Buffer.from('x')), /symlink/)
  assert.equal(existsSync(path.join(out, 'real', 'b.png')), false)
  // a linked directory higher up is refused too: nothing is created or written through it
  const out2 = mkdtempSync(path.join(tmpdir(), 'i50-write-'))
  mkdirSync(path.join(out2, 'away'))
  symlinkSync(path.join(out2, 'away'), path.join(out2, 'shots'))
  assert.throws(() => writeShot(out2, 'shots/menus/c.png', Buffer.from('x')), /^Error: shots is a symlink/)
  assert.equal(existsSync(path.join(out2, 'away', 'menus')), false)
  assert.throws(() => writeShot(out2, '../c.png', Buffer.from('x')), /not a path inside/)
  // the run's directory itself is checked too: a linked `out` carries nothing outside the run
  const real = mkdtempSync(path.join(tmpdir(), 'i50-write-'))
  const linkedOut = path.join(out2, 'linked-out')
  symlinkSync(real, linkedOut)
  assert.throws(() => writeShot(linkedOut, 'shots/menus/e.png', Buffer.from('x')), /linked-out is a symlink/)
  assert.throws(() => writeShot(path.join(out, 'shots/menus/a.png'), 'f.png', Buffer.from('x')), /is not a regular directory/)
  assert.equal(existsSync(path.join(real, 'shots')), false)
  // a capture past its side's deadline writes nothing
  assert.throws(() => writeShot(out, 'shots/menus/late.png', Buffer.from('x'), { deadline: Date.now() - 1 }), /ran past the open-state budget/)
  assert.equal(existsSync(path.join(out, 'shots/menus/late.png')), false)
  // a capture whose axis was given up writes nothing
  const given = new AbortController()
  given.abort()
  assert.throws(() => writeShot(out, 'shots/menus/d.png', Buffer.from('x'), { signal: given.signal }), /given up/)
  assert.equal(existsSync(path.join(out, 'shots/menus/d.png')), false)
})

test('issue 50: an open-panel finding is deterministic — not a pointer kind, not noise, counted in run comparison and the stop count', () => {
  for (const k of MENU_KINDS) {
    assert.equal(isPointer(k), false, k)
    assert.notEqual(ownerOf({ kind: k }, null), 'noise', k)
  }
  assert.equal(ownerOf({ kind: 'menu-open-layout' }, null), 'tokens-css')
  assert.equal(ownerOf({ kind: 'menu-open-unmatched' }, null), 'templates-patterns')
  assert.equal(isPointer('mega-menu'), true, 'the pointer travel into a panel stays a pointer kind')
  const f = (deltas) => ({ kind: 'menu-open-layout', axis: '1440-light', element: 'header menu "Our Services" › panel', trigger: 'Our Services', deltas })
  const before = new Map([['a', { id: 'a', findings: [f([{ property: 'panel-w', expected: '1440px', observed: '880px' }])] }]])
  const after = [{ id: 'a', findings: [f([{ property: 'panel-w', expected: '1440px', observed: '1440px' }])] }]
  const d = compareRuns(before, after)
  assert.deepEqual([d.deterministic.closed, d.deterministic.new, d.pointer.closed, d.pointer.new], [1, 1, 0, 0])
  assert.equal(stableCount(after, new Set(['a'])), 1)
  // the trigger is part of the identity: the same panel box on two triggers is two findings
  const two = [{ id: 'a', findings: [f([]), { ...f([]), element: 'header menu "Search" › panel', trigger: 'Search' }] }]
  assert.equal(compareRuns(new Map([['a', { id: 'a', findings: [f([])] }]]), two).deterministic.new, 1)
})

test('issue 50: compareMenuPanels — words missing on either side, icons by count and size, geometry within the tolerance', () => {
  const base = { rect: { x: 0, y: 64, w: 1440, h: 200 }, surface: null, items: [
    { kind: 'text', tag: 'h3', text: 'Consulting', x: 40, y: 24, w: 120, h: 30, styles: { 'font-size': '24px' } },
    { kind: 'text', tag: 'a', text: 'Audits', x: 40, y: 60, w: 60, h: 22, styles: { 'font-size': '15px' } },
    { kind: 'icon', tag: 'svg', x: 40, y: 0, w: 40, h: 40 }
  ] }
  const opts = { props: ['font-size'], diffProperty, geometry: 1 }
  assert.deepEqual(compareMenuPanels('S', base, structuredClone(base), opts), { findings: [], truncated: 0 })
  const moved = structuredClone(base)
  moved.rect.h = 200.8
  moved.items[0].x = 40.9
  assert.deepEqual(compareMenuPanels('S', base, moved, opts).findings, [], 'within 1 px')
  const other = structuredClone(base)
  other.items = [other.items[0], { ...other.items[1], text: 'Audit plans' }, { ...other.items[2], w: 24, h: 24 }]
  const r = compareMenuPanels('S', base, other, opts).findings
  assert.deepEqual(r.map((x) => [x.element, x.deltas.map((y) => `${y.property}:${y.expected}→${y.observed}`).join(',')]), [
    ['header menu "S" › a "Audits"', 'present:yes→no'],
    ['header menu "S" › a "Audit plans"', 'present:no→yes'],
    ['header menu "S" › icons', 'icon-boxes:40,0 40×40→40,0 24×24']
  ])
  // an icon that moved and kept its size is a change; icons written in another order are not
  const shifted = structuredClone(base)
  shifted.items[2].x = 400
  assert.deepEqual(compareMenuPanels('S', base, shifted, opts).findings.map((x) => x.deltas), [[{ property: 'icon-boxes', expected: '40,0 40×40', observed: '400,0 40×40' }]])
  const two = structuredClone(base)
  two.items.push({ kind: 'icon', tag: 'img', x: 400, y: 0, w: 24, h: 24 })
  const swapped = structuredClone(two)
  swapped.items = [swapped.items[3], swapped.items[0], swapped.items[1], swapped.items[2]]
  assert.deepEqual(compareMenuPanels('S', two, swapped, opts).findings, [])
})

test('issue 50: --reuse takes a clean page with its menu captures (pictures from the earlier run); an axis measured before menus were captured is measured again', async () => {
  assert.notEqual(TOOL_VERSION, 'visual-qa/8', 'evidence that never opened a header menu is not reused')
  await withSite({}, {}, async (fx, origin) => {
    const first = await runOn(fx, origin)
    const second = await runOn(fx, origin, { reuse: [first.out] })
    assert.equal(second.report.summary.reused, 1)
    const index = JSON.parse(readFileSync(path.join(second.out, 'index.json'), 'utf8'))
    assert.equal(index.menuShots.length, 6)
    assert.ok(index.menuShots.every((s) => s.file.startsWith(first.out) && existsSync(s.file) && s.measured === 'reused'))
    // the same clean run, as a run that never captured a menu would have written it
    const v = JSON.parse(readFileSync(path.join(first.out, 'visual.json'), 'utf8'))
    for (const a of v.pages[0].axes) delete a.menus
    writeFileSync(path.join(first.out, 'visual.json'), JSON.stringify(v))
    const third = await runOn(fx, origin, { reuse: [first.out] })
    assert.equal(third.report.summary.reused, 0)
    assert.equal(axisOf(third.report, '1440-light').menus.pairs, 3)
  })
})

test('issue 50: axes measured side by side write their own captures — no picture or record of one variant overwrites another', async () => {
  const { report, out } = await withSite({}, {}, (fx, origin) => runOn(fx, origin, { stage: 'light-desktop,light-responsive', allStages: true, tierConcurrency: 2, concurrency: 2 }))
  const files = report.pages[0].axes.flatMap((a) => a.menus.menus.flatMap((m) => [m.site.screenshot, m.source.screenshot]))
  assert.equal(files.length, 8, '3 pairs at 1440, the drawer at 390')
  assert.equal(new Set(files).size, files.length)
  for (const f of files) assert.ok(existsSync(path.join(out, f)), f)
  assert.ok(axisOf(report, '1440-light').menus.menus.every((m) => m.site.screenshot.includes('--1440-light--')))
  assert.ok(axisOf(report, '390-light').menus.menus.every((m) => m.site.screenshot.includes('--390-light--')))
  assert.equal(pngSize(path.join(out, row(axisOf(report, '390-light'), 'Menu').site.screenshot)).w, 390)
})

test('issue 50: every page run opens its header menus — a run of one page that is not its layout\'s representative too', async () => {
  const fx = fixture({}, {}, { second: true })
  const srv = await serve(fx.site)
  try {
    const team = fx.contract.pages.find((p) => p.path === '/team/')
    const layout = fx.contract.layouts.find((l) => l.id === team.layout)
    assert.notEqual(layout.representative, team.id)
    const { report } = await runOn(fx, srv.origin, { pages: team.id })
    assert.deepEqual(report.pages.map((p) => p.id), [team.id])
    const a = axisOf(report, '1440-light')
    assert.equal(a.menus.pairs, 3)
    assert.ok(a.menus.menus.every((m) => m.site.opened && m.source.opened))
  } finally {
    await srv.close()
  }
})

test('issue 50: a link to another page is never clicked, whatever role it claims; a click that leaves the page has it loaded again before the next trigger', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture()
  writeFileSync(path.join(fx.site, 'about', 'index.html'), sourcePage({ dead: true }))
  const srv = await serve(fx.site)
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    const url = `${srv.origin}/about/`
    const load = async () => {
      await p.goto(url)
      await settle(p)
      return p.evaluate(inPageMenuTriggers, 16)
    }
    const c = await load()
    const services = c.triggers.find((t) => t.label === 'Our Services')
    assert.equal(services.tag, 'a')
    assert.equal(services.clickable, false, '<a href="/services/" role="button"> is a link')
    const quiet = await captureMenu(p, services, { out: fx.root, rel: 'shots/menus/s.png', props: ['font-size'] })
    assert.match(quiet.reason, /did not show on hover and it has no control to click that stays on the page/)
    assert.equal(p.url(), url)
    // were it clicked, the page would leave: the capture says so and the next trigger is captured on the page loaded again
    const search = c.triggers.find((t) => t.label === 'Search')
    const caps = await captureSide(p, new Map([['our services', { ...services, clickable: true }], ['search', search]]), { reload: load, out: fx.root, relOf: (k) => menuShotName('p', 'v', k, 'site'), props: ['font-size'] })
    const s = caps.get('our services')
    assert.equal(s.opened, false)
    assert.match(s.reason, /a click of its control left the page for .*\/services\//)
    assert.equal(s.closed, 'reload')
    assert.equal(caps.get('search').opened, true)
    assert.equal(caps.get('search').via, 'click')
    assert.equal(p.url(), url)
  } finally {
    await srv.close()
    await b.close()
  }
})

test('issue 50: a panel the viewport cuts, or one holding more than the item cap, is named not measured — never clean', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture({ tall: true })
  const srv = await serve(fx.site)
  const sourceFile = path.join(fx.root, 'source.html')
  writeFileSync(sourceFile, sourcePage({}))
  const common = { browser: b, url: `${srv.origin}/about/`, sourceUrl: pathToFileURL(sourceFile).href, siteOpts: { viewport: { width: 1440, height: 900 } }, sourceOpts: { viewport: { width: 1440, height: 900 } }, pageId: 'en-about', variantId: '1440-light', out: fx.root, settle, props: ['font-size'], diffProperty }
  try {
    const tall = await measureMenus(common)
    const cut = tall.findings.filter((f) => f.trigger === 'Our Services')
    assert.deepEqual(cut.map((f) => [f.kind, f.side]), [['menu-open-not-measured', 'site']], 'a picture of part of the panel is not compared')
    assert.match(cut[0].reason, /reaches past the viewport \([\d.]+ px past its edge/)
    const r = tall.record.menus.find((m) => m.trigger === 'Our Services')
    assert.ok(r.site.clipped && !r.source.clipped)
    assert.ok(existsSync(path.join(fx.root, r.site.screenshot)), 'the partial picture is kept as evidence')
    assert.deepEqual(tall.findings.filter((f) => f.trigger !== 'Our Services'), [])
    // the cap on words and icons read from one panel: the rest is named, the words read are still compared
    const few = await measureMenus({ ...common, url: common.sourceUrl, itemCap: 3 })
    const over = few.findings.filter((f) => f.kind === 'menu-open-not-measured')
    assert.deepEqual(over.map((f) => [f.trigger, f.side]), [['Our Services', 'source'], ['Our Services', 'site']])
    assert.match(over[0].reason, /holds \d+ word\(s\) or icon\(s\) past the cap of 3; they were not compared/)
    assert.equal(few.findings.length, 2)
  } finally {
    await srv.close()
    await b.close()
  }
})

test('issue 50: the budget of a side is a deadline every wait is cut to, and a capture given up writes nothing', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const out = mkdtempSync(path.join(tmpdir(), 'i50-deadline-'))
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await p.setContent(sitePage({}))
    await settle(p)
    const c = await p.evaluate(inPageMenuTriggers, 16)
    const services = c.triggers.find((t) => t.label === 'Our Services')
    const opts = { out, rel: 'shots/menus/s.png', props: ['font-size'] }
    // too little left to watch the panel hold still: nothing is waited for past the deadline
    const t0 = Date.now()
    const late = await captureMenu(p, services, { ...opts, deadline: Date.now() + 150 })
    assert.equal(late.opened, false)
    assert.match(late.reason, /budget for this side ran out during the capture/)
    assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`)
    // the axis was given up (its timeout): no capture starts and none is written
    const given = new AbortController()
    given.abort()
    const gone = await captureMenu(p, services, { ...opts, signal: given.signal })
    assert.deepEqual([gone.opened, gone.reason], [false, 'the capture was given up: its axis ran out of time'])
    const side = await captureSide(p, new Map([['our services', services]]), { reload: async () => c, out, relOf: () => 'shots/menus/s.png', props: ['font-size'], signal: given.signal })
    assert.match(side.get('our services').reason, /given up/)
    assert.equal(existsSync(path.join(out, 'shots/menus/s.png')), false)
    // and the same capture with time left is written
    const ok = await captureMenu(p, services, opts)
    assert.equal(ok.opened, true)
    assert.ok(existsSync(path.join(out, 'shots/menus/s.png')))
  } finally {
    await b.close()
  }
})

test('issue 50: the pictures of an open panel are compared — a header that clips it, an icon in another colour or shape are findings where boxes and styles agree', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture()
  const sourceFile = path.join(fx.root, 'source.html')
  writeFileSync(sourceFile, sourcePage({}))
  const siteOf = (o) => {
    const f = path.join(fx.root, `site-${Object.keys(o).join('-') || 'same'}.html`)
    writeFileSync(f, sitePage(o))
    return pathToFileURL(f).href
  }
  const measure = (o) => measureMenus({ browser: b, url: siteOf(o), sourceUrl: pathToFileURL(sourceFile).href, siteOpts: { viewport: { width: 1440, height: 900 } }, sourceOpts: { viewport: { width: 1440, height: 900 } }, pageId: 'en-about', variantId: Object.keys(o).join('-') || 'same', out: fx.root, settle, props: ['font-size', 'color'], diffProperty })
  const pictures = (r) => r.findings.map((f) => [f.kind, f.element, f.deltas])
  try {
    assert.deepEqual((await measure({})).findings, [], 'the same panel drawn by the same browser: no cell differs')
    // the site's header clips everything that hangs below it: every panel opens (its boxes and styles
    // are the source's) and none of it is seen
    const clip = await measure({ clipHeader: true })
    const drawn = [{ property: 'picture', expected: 'the source panel as drawn', observed: 'drawn otherwise' }]
    assert.deepEqual(pictures(clip).sort(), ['Our Services', 'Search', 'Work & "Cases" / 2026'].map((l) => ['menu-open-parity', `header menu "${l}" › picture`, drawn]))
    const row = clip.record.menus.find((m) => m.trigger === 'Our Services')
    assert.deepEqual(row.site.rect, row.source.rect)
    assert.ok(row.picture.differing > 0 && row.picture.differing <= row.picture.cells)
    for (const o of [{ iconColor: true }, { iconShape: true }]) {
      const r = await measure(o)
      assert.deepEqual(pictures(r), [['menu-open-parity', 'header menu "Our Services" › picture', drawn]], JSON.stringify(o))
      const pic = r.record.menus.find((m) => m.trigger === 'Our Services').picture
      assert.ok(pic.region.y >= 24 && pic.region.y + pic.region.h <= 24 + 8 + 40 + 8, `the region is the icons' row: ${JSON.stringify(pic.region)}`)
    }
  } finally {
    await b.close()
  }
})

test('issue 50: comparePanelPictures — same pixels, a shift within the tolerance and another size are no finding; a changed cell is, with its region', () => {
  const img = (w, h, paint = () => [255, 255, 255]) => {
    const data = Buffer.alloc(w * h * 4)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, bl] = paint(x, y)
        data.set([r, g, bl, 255], (y * w + x) * 4)
      }
    return { width: w, height: h, data }
  }
  const glyph = (ox) => (x, y) => (x >= 10 + ox && x < 14 + ox && y >= 10 && y < 20 ? [0, 0, 0] : [255, 255, 255])
  const base = img(64, 32, glyph(0))
  assert.equal(comparePanelPictures('M', base, img(64, 32, glyph(0))), null)
  assert.equal(comparePanelPictures('M', base, img(64, 32, glyph(1))), null, 'a 1 px shift is within the geometry tolerance')
  assert.ok(comparePanelPictures('M', base, img(64, 32, glyph(1)), { geometry: 0 }), 'and not without it')
  assert.equal(comparePanelPictures('M', base, img(80, 32)), null, 'another size is the panel box finding, not this one')
  const red = img(64, 32, (x, y) => (x >= 40 && x < 56 && y >= 8 && y < 24 ? [200, 30, 30] : glyph(0)(x, y)))
  const f = comparePanelPictures('M', base, red)
  assert.equal(f.kind, 'menu-open-parity')
  assert.equal(f.element, 'header menu "M" › picture')
  assert.deepEqual(f.picture, { cell: 8, level: 24, cells: 32, differing: 4, region: { x: 40, y: 8, w: 16, h: 16 } })
  // the identity of the finding carries no count: it holds from run to run while the region moves
  assert.deepEqual(f.deltas, comparePanelPictures('M', base, img(64, 32, () => [0, 0, 0])).deltas)
})

test('issue 50: a picture that arrives after the deadline, an evaluate that never answers and a slow reload are cut at the deadline — nothing written, nothing accepted', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const out = mkdtempSync(path.join(tmpdir(), 'i50-deadline-'))
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  // the page, with one of its operations answering late (or never)
  const late = (p, name, delay) =>
    new Proxy(p, {
      get(target, k) {
        const v = target[k]
        if (typeof v !== 'function') return v
        if (k !== name) return v.bind(target)
        return (...a) => delay(a, () => v.apply(target, a))
      }
    })
  try {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await p.setContent(sitePage({}))
    await settle(p)
    const c = await p.evaluate(inPageMenuTriggers, 16)
    const services = c.triggers.find((t) => t.label === 'Our Services')
    const opts = { rel: 'shots/menus/late.png', props: ['font-size'] }
    // the picture is taken, and handed back 1.5 s after the deadline
    let deadline = Date.now() + 3000
    let t0 = Date.now()
    const shot = await captureMenu(late(p, 'screenshot', async (a, go) => {
      const buf = await go()
      await sleep(deadline - Date.now() + 1500)
      return buf
    }), services, { ...opts, out, deadline })
    assert.deepEqual([shot.opened, shot.reason, shot.closed], [false, 'the open-state budget for this side ran out during the capture', null])
    assert.ok(Date.now() - t0 < 3000 + 500, `returned at the deadline, not with the picture: ${Date.now() - t0} ms`)
    await sleep(2000)
    assert.equal(existsSync(path.join(out, 'shots/menus/late.png')), false, 'the picture that came late is never written')
    // an evaluate that never answers (a page busy for good) is cut too
    // the pointer the cut capture left on the item would show its panel at rest: move it away first
    await p.mouse.move(0, 0)
    await p.setContent(sitePage({}))
    await settle(p)
    const again = (await p.evaluate(inPageMenuTriggers, 16)).triggers.find((t) => t.label === 'Our Services')
    assert.ok(again, 'the trigger is found again once the pointer is away')
    deadline = Date.now() + 2000
    t0 = Date.now()
    const hung = await captureMenu(late(p, 'evaluate', (a, go) => (a[0] === inPageMenuHeld ? new Promise(() => {}) : go())), again, { ...opts, out, deadline })
    assert.equal(hung.opened, false)
    assert.ok(Date.now() - t0 < 2000 + 500, `${Date.now() - t0} ms`)
    // a panel that will not close needs a reload, and the reload does not answer within the budget
    const q = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    await q.setContent(sitePage({ sticky: true }))
    await settle(q)
    const cs = await q.evaluate(inPageMenuTriggers, 16)
    const wanted = new Map(['Search', 'Our Services'].map((l) => [menuKey(l), cs.triggers.find((t) => t.label === l)]))
    t0 = Date.now()
    const caps = await captureSide(q, wanted, { reload: () => new Promise((r) => setTimeout(() => r(cs), 60000).unref()), out, relOf: (k) => `shots/menus/side-${k.replace(/\W/g, '')}.png`, props: ['font-size'], budgetMs: 8000 })
    assert.ok(Date.now() - t0 < 8000 + 1000, `the side ended at its deadline: ${Date.now() - t0} ms`)
    assert.equal(caps.get('search').opened, true, 'captured before the deadline, it stands')
    assert.equal(caps.get('search').closed, null, 'the page was not loaded again')
    assert.match(caps.get('our services').reason, /budget of 8000 ms for this side ran out first/)
  } finally {
    await b.close()
  }
})

test('issue 50: a run whose --out is a symlink is refused before anything is written through it', async () => {
  const fx = fixture()
  const real = path.join(fx.root, 'real-out')
  mkdirSync(real)
  const linked = path.join(fx.root, 'linked-out')
  symlinkSync(real, linked)
  await assert.rejects(run({ contract: fx.contractFile, site: 'http://127.0.0.1:9', out: linked, spec: fx.spec, sourceSite: null, concurrency: 1, stage: 'light-desktop' }), /--out .*linked-out is a symlink/)
  assert.equal(existsSync(path.join(real, 'shots')), false)
  const out = path.join(fx.root, 'out-with-linked-shots')
  mkdirSync(out)
  symlinkSync(real, path.join(out, 'shots'))
  await assert.rejects(run({ contract: fx.contractFile, site: 'http://127.0.0.1:9', out, spec: fx.spec, sourceSite: null, concurrency: 1, stage: 'light-desktop' }), /holds shots\/ as a symlink/)
})

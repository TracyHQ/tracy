// Issue #56 — the open-state axis could not pair an icon-only off-canvas toggle, so the mobile drawer
// was never compared: the T4 burger says no words, the site's says "Open the menu", and pairing by
// words left both unmatched. The sole drawer toggle of each header now pairs by its markup, a pair the
// contract declares by its selectors, and both keep their identity across a reload. Fixture:
// scripts/test/issue56-fixture.mjs.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { RUN_LAUNCH_ARGS, diffProperty, run, settle } from '../visual/visual-qa.mjs'
import { DRAWER_KEY, captureSide, declaredKey, inPageMenuTriggers, measureMenus, menuGroups, menuShotName, pairMenus } from '../visual/menu-open.mjs'
import { validateContract } from '../visual/contract.mjs'
import { pageHash, TOOL_VERSION } from '../visual/page-hash.mjs'
import { fixture, serve, sitePage, sourcePage } from './issue56-fixture.mjs'

const ROOT = mkdtempSync(path.join(tmpdir(), 'i56-test-'))
after(() => rmSync(ROOT, { recursive: true, force: true }))

const runOn = async (fx, origin, extra = {}) => {
  const out = path.join(fx.root, `out-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
  const report = await run({ contract: fx.contractFile, site: origin, out, spec: fx.spec, sourceSite: null, concurrency: 1, stage: 'light-desktop', ...extra })
  return { report, out }
}
const withSite = async (site, source, fn, opts = {}) => {
  const fx = fixture(site, source, { root: ROOT, ...opts })
  const srv = await serve(fx.site)
  try {
    return await fn(fx, srv.origin)
  } finally {
    await srv.close()
  }
}
const axisOf = (report, variant) => report.pages[0].axes.find((a) => a.variant === variant)
const menuKinds = (axis) => axis.findings.filter((f) => f.kind.startsWith('menu-open-'))
const ALL = { stage: 'light-desktop,light-responsive,dark-desktop,dark-responsive', allStages: true }
const t = (label, extra = {}) => ({ i: 0, label, tag: 'button', how: 'control', clickable: true, problem: null, ...extra })

test('issue 56: the sole drawer toggle of each side pairs by its markup — different words or none; words still pair what they can', () => {
  // the case of the issue: an icon-only T4 span against a site button that says "Open the menu"
  const p = pairMenus({ triggers: [t('Open the menu', { drawer: true })] }, { triggers: [t('', { tag: 'span', drawer: true })] })
  assert.deepEqual(p.matched.map((m) => [m.key, m.by, m.site.label, m.source.label, m.labels]), [[DRAWER_KEY, 'structure', 'Open the menu', '', { site: 'Open the menu', source: '' }]])
  assert.deepEqual([p.unmatched, p.notMeasured], [[], []])
  // two drawers that say the same words pair by them, as before (the finding keeps its identity)
  const same = pairMenus({ triggers: [t('Menu', { drawer: true })] }, { triggers: [t('Menu', { drawer: true })] })
  assert.deepEqual(same.matched.map((m) => [m.key, m.by]), [['menu', 'words']])
  // the other triggers still pair by their words beside the drawer pair
  const mixed = pairMenus({ triggers: [t('Search'), t('Open the menu', { drawer: true })] }, { triggers: [t('', { drawer: true }), t('SEARCH')] })
  assert.deepEqual(mixed.matched.map((m) => [m.key, m.by]), [[DRAWER_KEY, 'structure'], ['search', 'words']])
})

test('issue 95: an unlabeled source search trigger pairs by its panel only when one site candidate matches', async () => {
  const panel = { text: 'Search the site Submit', controls: [{ tag: 'input', type: 'search', label: 'Search the site' }, { tag: 'button', type: '', label: 'Submit' }] }
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const html = (label) => `<!doctype html><style>body{margin:0}header{height:64px}.panel{display:none;position:absolute;top:64px}.panel.open{display:block}header button{width:32px;height:32px}</style><header><button aria-expanded="false" aria-controls="search">${label}</button></header><form id="search" class="panel"><label>Search the site <input type="search" placeholder="Search the site"></label><button>Submit</button></form><script>document.querySelector('header button').onclick=()=>document.querySelector('form').classList.toggle('open')</script>`
    const census = async (label) => {
      await page.setContent(html(label))
      return page.evaluate(inPageMenuTriggers, 16)
    }
    const source = await census('<svg width="24" height="24" aria-hidden="true"></svg>')
    const site = await census('Search')
    assert.equal(source.triggers[0].label, '')
    assert.deepEqual(source.triggers[0].panel, panel)
    assert.equal(site.triggers[0].label, 'Search')
    const paired = pairMenus(site, source)
    assert.deepEqual(paired.matched.map((m) => [m.by, m.site.label, m.source.label]), [['panel', 'Search', '']])
    assert.deepEqual([paired.unmatched, paired.notMeasured], [[], []])
    await page.setContent(`<header><button aria-expanded="false"><svg width="24" height="24"></svg></button></header><form id="search" class="panel"><label>Search the site <input type="search" placeholder="Search the site"></label><button>Submit</button></form><script>document.querySelector('header button').onclick=()=>document.querySelector('form').classList.toggle('open')</script><style>.panel{display:none;position:absolute}.panel.open{display:block}</style>`)
    const clickDiscovered = await page.evaluate(inPageMenuTriggers, 16)
    assert.deepEqual(clickDiscovered.triggers[0].panel, panel)
    assert.equal(await page.locator('#search').isVisible(), false, 'the census closes its discovery click before capture')
    assert.equal(pairMenus(site, clickDiscovered).matched[0].by, 'panel')
    for (const label of ['<svg width="24" height="24" aria-hidden="true"></svg>', 'Search']) {
      await page.setContent(html(label))
      await page.locator('header button').click()
      assert.equal(await page.locator('#search').isVisible(), true, 'fixture trigger opens its search panel')
    }
    for (const trigger of [
      '<button aria-expanded="false" data-target="#search">⌕</button>',
      '<a aria-haspopup="true" href="#search"><svg width="24" height="24"></svg></a>'
    ]) {
      await page.setContent(`<header>${trigger}</header><form id="search" style="display:none"><input type="search" placeholder="Search the site"></form>`)
      const referenced = await page.evaluate(inPageMenuTriggers, 16)
      assert.equal(referenced.triggers[0].problem, null)
      assert.equal(referenced.triggers[0].panel.controls[0].label, 'Search the site')
    }

    const sourceTrigger = t('', { panel, region: 'chrome' })
    const candidates = pairMenus(
      { triggers: [t('Search', { panel, region: 'chrome' }), t('Quick search', { panel, region: 'chrome' })] },
      { triggers: [sourceTrigger] }
    )
    assert.deepEqual(candidates.matched, [])
    assert.equal(candidates.unmatched.filter((u) => u.side === 'source').length, 1)
    assert.match(candidates.unmatched[0].reason, /2 site candidates \(Search, Quick search\).*ambiguous/)

    const absent = pairMenus({ triggers: [t('Search', { panel: { ...panel, text: 'Different panel' }, region: 'chrome' })] }, { triggers: [sourceTrigger] })
    assert.deepEqual(absent.matched, [])
    assert.ok(absent.unmatched.some((u) => u.side === 'source'))
    assert.match(absent.unmatched.find((u) => u.side === 'source').reason, /no site candidate has the same panel text and controls/)

    const emptyPanel = { text: '', controls: [] }
    const empty = pairMenus({ triggers: [t('Search', { panel: emptyPanel, region: 'chrome' })] }, { triggers: [t('', { panel: emptyPanel, region: 'chrome' })] })
    assert.deepEqual(empty.matched, [], 'empty panels provide no pairing identity')
    assert.match(empty.unmatched.find((u) => u.side === 'source').reason, /panel has no text or controls to identify it/)

    const claimed = pairMenus(
      { triggers: [t('Search', { panel, region: 'chrome' })] },
      { triggers: [t('', { panel, region: 'chrome' }), t('Search', { panel: { ...panel, text: 'Other panel' }, region: 'chrome' })] }
    )
    assert.deepEqual(claimed.matched.map((m) => [m.by, m.site.label, m.source.label]), [['words', 'Search', 'Search']], 'word pairing claims the site trigger before panel pairing')
    assert.match(claimed.unmatched.find((u) => u.side === 'source').reason, /no site candidate has the same panel text and controls/)
  } finally {
    await browser.close()
  }
})

test('issue 56: no pair is guessed — two drawers on a side, a drawer on one side only, a drawer whose panel is not named, a control that is no drawer', () => {
  // two drawer toggles on the site: neither is picked by position; the icon-only source toggle is named
  const two = pairMenus({ triggers: [t('Open the menu', { drawer: true }), t('Open the search', { drawer: true })] }, { triggers: [t('', { tag: 'span', drawer: true })] })
  assert.deepEqual(two.matched, [])
  assert.deepEqual(two.unmatched.map((u) => [u.key, u.side]), [['', 'source'], ['open the menu', 'site'], ['open the search', 'site']])
  assert.match(two.unmatched[0].reason, /says no words to pair it by .*; a drawer toggle pairs by its markup only when each header has exactly one \(the site has 2, the source 1\)/)
  // a drawer on one side only is unmatched, never paired with a trigger of another kind
  const one = pairMenus({ triggers: [t('Search')] }, { triggers: [t('', { drawer: true })] })
  assert.deepEqual([one.matched.length, one.unmatched.map((u) => u.side).sort()], [0, ['site', 'source']])
  // a toggle whose panel cannot be named is no drawer to pair, however it is marked
  const broken = pairMenus({ triggers: [t('Open the menu', { drawer: true, problem: 'its aria-controls names #x, which is not in the page' })] }, { triggers: [t('', { drawer: true })] })
  assert.deepEqual(broken.matched, [])
  // an icon-only control that is not a drawer toggle is not paired with the other side's drawer
  const anon = pairMenus({ triggers: [t('Open the menu', { drawer: true })] }, { triggers: [t('')] })
  assert.deepEqual(anon.matched, [])
  assert.doesNotMatch(anon.unmatched.find((u) => u.side === 'source').reason, /drawer toggle pairs/)
  // no trigger on either side: a legitimate empty header, nothing unmatched
  assert.deepEqual(pairMenus({ triggers: [] }, { triggers: [] }), { matched: [], unmatched: [], notMeasured: [] })
})

test('issue 56: a pair the contract declares pairs what its selectors name — refused, absent, one-sided and ambiguous selectors are named, never guessed', () => {
  const declared = [{ site: '.a', source: '.b', label: 'Account', reason: 'r', decision: 'D1' }, { site: '.c', source: '.d', reason: 'r', decision: 'D2' }]
  const site = { triggers: [t('Sign in', { declared: [0] }), t('Open the menu', { drawer: true })] }
  const source = { triggers: [t('', { declared: [0], drawer: true }), t('', { tag: 'span', drawer: true })] }
  const p = pairMenus(site, source, { declared })
  // the declared trigger is the declaration's: the remaining drawer of each side is the drawer pair
  assert.deepEqual(p.matched.map((m) => [m.key, m.label, m.by, m.site.label]), [[declaredKey(0), 'Account', 'declared', 'Sign in'], [DRAWER_KEY, DRAWER_KEY, 'structure', 'Open the menu']])
  assert.deepEqual([p.unmatched, p.notMeasured], [[], []], 'a declaration neither header shows at this width is nothing to pair')
  const refused = pairMenus({ ...site, declaredInvalid: [1] }, source, { declared })
  assert.deepEqual(refused.notMeasured.map((n) => [n.key, n.side]), [[declaredKey(1), 'site']])
  assert.match(refused.notMeasured[0].reason, /the declared site selector ".c" is not a selector the page accepts/)
  const oneSided = pairMenus({ triggers: [t('x', { declared: [1] })] }, { triggers: [] }, { declared })
  assert.deepEqual(oneSided.unmatched.map((u) => [u.key, u.label, u.side]), [[declaredKey(1), 'declared pair 2: .d ↔ .c', 'site']])
  const many = pairMenus({ triggers: [t('x', { declared: [0] }), t('y', { declared: [0] })] }, { triggers: [t('z', { declared: [0] })] }, { declared })
  assert.deepEqual([many.matched.length, many.notMeasured.map((n) => [n.side, /names 2 triggers; a pair is never picked by position/.test(n.reason)])], [0, [['site', true]]])
  // a label made of long selectors stays bounded
  const long = pairMenus({ triggers: [t('x', { declared: [0] })] }, { triggers: [] }, { declared: [{ site: `.a${'b'.repeat(400)}`, source: `.c${'d'.repeat(400)}` }] })
  assert.ok(long.unmatched[0].label.length < 160, String(long.unmatched[0].label.length))
  // an index past the declarations the run was given is ignored, not trusted
  assert.deepEqual(menuGroups({ triggers: [t('Search', { declared: [5] })] }, { declared: 2 }).groups.get('search')?.length, 1)
})

test('issue 56: a panel other controls open too, and a trigger two declarations name, belong to no pair — named, never measured (#56 review)', () => {
  const conflict = 'two controls in the header open the same panel #menu; which one owns it cannot be told'
  // the site's sole drawer shares its panel with another control: no structural pair, whatever the source has
  const shared = pairMenus({ triggers: [t('Open the menu', { drawer: true, problem: conflict })] }, { triggers: [t('', { tag: 'span', drawer: true })] })
  assert.deepEqual(shared.matched, [])
  assert.deepEqual(shared.notMeasured, [{ key: DRAWER_KEY, label: DRAWER_KEY, side: 'site', reason: conflict }])
  // it still counts as the side's drawer: a second, clean drawer toggle beside it is never the sole one
  const beside = pairMenus({ triggers: [t('Open the menu', { drawer: true, problem: conflict }), t('', { drawer: true })] }, { triggers: [t('', { tag: 'span', drawer: true })] })
  assert.deepEqual(beside.matched, [])
  assert.equal(menuGroups({ triggers: [t('A', { drawer: true, problem: conflict }), t('', { drawer: true })] }, { structural: true }).groups.has(DRAWER_KEY), false)
  // the same words on both sides pair by them, and the conflict is named there
  const words = pairMenus({ triggers: [t('Menu', { drawer: true, problem: conflict })] }, { triggers: [t('Menu', { drawer: true })] })
  assert.deepEqual([words.matched, words.notMeasured.map((n) => [n.key, n.side, n.reason])], [[], [['menu', 'site', conflict]]])
  // two declared selectors that overlap on one trigger: neither declaration is measured
  const declared = [{ site: '.a', source: '.b', label: 'Account' }, { site: '.a, .c', source: '.d', label: 'Cart' }]
  const overlap = pairMenus({ triggers: [t('Sign in', { declared: [0, 1] })] }, { triggers: [t('x', { declared: [0] }), t('y', { declared: [1] })] }, { declared })
  assert.deepEqual(overlap.matched, [])
  assert.deepEqual(
    overlap.notMeasured.map((n) => [n.key, n.label, n.side, n.reason]),
    [
      [declaredKey(0), 'Account', 'site', 'declared pairs 1, 2 name the same trigger; a trigger belongs to one pair'],
      [declaredKey(1), 'Cart', 'site', 'declared pairs 1, 2 name the same trigger; a trigger belongs to one pair']
    ]
  )
  // an ownership conflict is not measured on every path, before a missing counterpart is looked for:
  // an unmatched finding can be accepted as an intentional omission, a conflict never can
  const oneSided = pairMenus({ triggers: [t('Sign in', { declared: [0, 1] })] }, { triggers: [] }, { declared })
  assert.deepEqual([oneSided.matched, oneSided.unmatched], [[], []])
  assert.deepEqual(oneSided.notMeasured.map((n) => [n.key, n.side]), [[declaredKey(0), 'site'], [declaredKey(1), 'site']])
  const iconOnly = pairMenus({ triggers: [t('Search')] }, { triggers: [t('', { tag: 'span', drawer: true, problem: conflict }), t('Search')] })
  assert.deepEqual([iconOnly.unmatched, iconOnly.notMeasured.map((n) => [n.key, n.side, n.reason])], [[], [['', 'source', conflict]]])
  assert.deepEqual(iconOnly.matched.map((m) => m.key), ['search'])
  const lone = pairMenus({ triggers: [t('Menu', { drawer: true, problem: conflict }), t('', { drawer: true })] }, { triggers: [] })
  assert.deepEqual(lone.notMeasured.map((n) => [n.key, n.side, n.reason]), [['menu', 'site', conflict]])
  assert.deepEqual(lone.unmatched.map((u) => [u.key, u.side]), [['', 'site']], 'a clean trigger beside it is still unmatched')
  const both = pairMenus({ triggers: [t('Menu', { problem: conflict })] }, { triggers: [t('Menu'), t('Menu')] })
  assert.deepEqual(both.notMeasured.map((n) => [n.key, n.side, n.reason]), [['menu', 'site', conflict]])
  // the census object itself is not changed by the grouping
  const one = t('Sign in', { declared: [0, 1] })
  menuGroups({ triggers: [one] }, { declared: 2 })
  assert.equal(one.problem, null)
})

test('issue 56: the contract carries declared pairs from review.config.json, validates them, and hashes them into the page', () => {
  const pairs = [{ site: '.tracy-toggle', source: '.t4-offcanvas-toggle', reason: 'both open the drawer', decision: 'DECISIONS.md D9' }]
  const fx = fixture({}, {}, { root: ROOT, menuPairs: pairs })
  assert.deepEqual(fx.contract.design.menus, { pairs })
  const errors = (menus) => validateContract({ ...fx.contract, design: { ...fx.contract.design, menus } }).filter((e) => e.includes('design.menus'))
  assert.deepEqual(errors({ pairs }), [])
  assert.match(errors({ pairs: 'x' }).join(), /must be a list/)
  assert.match(errors({ pairs: [{ site: '', source: '.b', reason: 'r', decision: 'd' }] }).join(), /needs a site and a source selector/)
  assert.match(errors({ pairs: [{ site: '.a', source: '.b' }] }).join(), /needs a reason and a cited decision/)
  assert.match(errors({ pairs: [{ site: '.a', source: '.b', reason: 'r', decision: 'd', label: 'x'.repeat(121) }] }).join(), /label must be a string/)
  // a declaration changes what the page measures: its hash moves, and version 9 evidence is not reused
  const page = fx.contract.pages[0]
  assert.notEqual(pageHash({ contract: fx.contract, page }).hash, pageHash({ contract: { ...fx.contract, design: { ...fx.contract.design, menus: undefined } }, page }).hash)
  assert.notEqual(TOOL_VERSION, 'visual-qa/9', 'evidence that left an icon-only drawer unmatched is measured again')
  const none = fixture({}, {}, { root: ROOT })
  assert.equal('menus' in none.contract.design, false, 'no declaration, no key')
})

test('issue 56: the census knows a drawer toggle by its markup — T4 before and after js-offcanvas runs, core/navigation — and names what it cannot pair', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } })
    const census = async (html, arg = 16) => {
      await p.setContent(html)
      return p.evaluate(inPageMenuTriggers, arg)
    }
    const drawer = (c) => c.triggers.map((x) => ({ label: x.label, tag: x.tag, drawer: Boolean(x.drawer), clickable: x.clickable, problem: x.problem }))
    assert.deepEqual(drawer(await census(sourcePage())), [{ label: '', tag: 'span', drawer: true, clickable: true, problem: null }], 'the bare span is a control: a click is the only way it opens')
    assert.deepEqual(drawer(await census(sourcePage({ aria: false }))), [{ label: '', tag: 'span', drawer: true, clickable: true, problem: null }], 'no aria yet: the offcanvas attribute names the panel')
    assert.deepEqual(drawer(await census(sitePage())), [{ label: 'Open the menu', tag: 'button', drawer: true, clickable: true, problem: null }])
    // at 1440 neither shows a toggle: no trigger, nothing unmatched
    await p.setViewportSize({ width: 1440, height: 900 })
    assert.deepEqual((await census(sourcePage())).triggers, [])
    await p.setViewportSize({ width: 390, height: 844 })
    // a toggle naming a panel not in the page: a problem, never a drawer
    const gone = drawer(await census('<header><span data-offcanvas-trigger="nowhere"><i style="display:block;width:24px;height:24px"></i></span></header>'))
    assert.deepEqual(gone, [{ label: '', tag: 'span', drawer: false, clickable: false, problem: 'its data-offcanvas-trigger names #nowhere, which is not in the page' }])
    const target = drawer(await census('<header><button data-bs-toggle="offcanvas" data-bs-target=".menu">≡</button></header><div class="menu" style="display:none"><a href="/">x</a></div>'))
    assert.match(target[0].problem, /its data-bs-target ".menu" names no panel by id/)
    // a link to another page is never clicked, drawer or not
    const away = await census('<header><a href="/menu/" data-offcanvas-trigger="m">Menu</a></header><div id="m" style="display:none;position:fixed"><a href="/">x</a></div>')
    assert.deepEqual(drawer(away), [{ label: 'Menu', tag: 'a', drawer: true, clickable: false, problem: null }])
    // other markup that says a drawer: a dialog panel, a panel fixed at rest; a submenu toggle in a list item is none
    const kinds = await census(`<header>
      <div><button aria-expanded="false" aria-controls="d1">One</button><dialog id="d1"><a href="/">a</a></dialog></div>
      <div><button aria-expanded="false" aria-controls="d2">Two</button><div id="d2" style="display:none;position:fixed"><a href="/">b</a></div></div>
      <div><button aria-expanded="false" aria-controls="d3">Three</button><div id="d3" style="display:none;position:absolute"><a href="/">c</a></div></div>
      <ul><li><a href="/x/">Four</a><button aria-expanded="false" aria-controls="d4">▾</button><div id="d4" style="display:none;position:fixed"><a href="/">d</a></div></li></ul></header>`)
    assert.deepEqual(kinds.triggers.map((x) => [x.label, Boolean(x.drawer)]), [['One', true], ['Two', true], ['Three', false], ['Four', false]])
    // two controls outside one item that open the same panel: one trigger, named with the conflict,
    // still a drawer (so never taken for another drawer's sole partner); two controls of one list item
    // (a link and its caret) are one trigger with no conflict (#56 review)
    const twice = await census(`<header>
      <button aria-haspopup="dialog" aria-controls="menu" aria-label="Open the menu"><i style="display:block;width:24px;height:24px"></i></button>
      <span data-offcanvas-trigger="menu" style="display:inline-block;width:24px;height:24px"></span>
      <ul><li><a href="#" aria-haspopup="true">Shop</a><button aria-expanded="false" aria-controls="sub">▾</button><ul id="sub" style="display:none"><li><a href="/a/">A</a></li></ul></li></ul>
      </header><div id="menu" style="display:none;position:fixed"><a href="/">x</a></div>`)
    assert.deepEqual(drawer(twice), [
      { label: 'Open the menu', tag: 'button', drawer: true, clickable: true, problem: '2 controls in the header open the same panel #menu; which one owns it cannot be told' },
      { label: 'Shop', tag: 'a', drawer: false, clickable: true, problem: null }
    ])
    const three = await census(`<header><button aria-haspopup="dialog" aria-controls="m" aria-label="A">≡</button><button aria-haspopup="dialog" aria-controls="m" aria-label="B">≡</button><button aria-haspopup="dialog" aria-controls="m" aria-label="C">≡</button></header><div id="m" style="display:none"><a href="/">x</a></div>`)
    assert.deepEqual(drawer(three).map((x) => x.problem), ['3 controls in the header open the same panel #m; which one owns it cannot be told'])
    // declared selectors: what each names, and a selector the page refuses
    const dec = await census(sitePage({ search: true }), [16, ['.tracy-search-btn', 'a[', '']])
    assert.deepEqual(dec.declaredInvalid, [1, 2])
    assert.deepEqual(dec.triggers.map((x) => [x.label, x.declared ?? []]), [['Open the menu', []], ['Search', [0]]])
  } finally {
    await b.close()
  }
})

test('issue 56: at 390 the icon-only T4 drawer and the site drawer are opened by a click and compared — clean when alike, light and dark; desktop has nothing to open', async () => {
  const { report, out } = await withSite({}, {}, (fx, origin) => runOn(fx, origin, ALL))
  for (const v of ['390-light', '390-dark']) {
    const a = axisOf(report, v)
    assert.deepEqual(a.findings, [], `${v}: ${JSON.stringify(a.findings).slice(0, 600)}`)
    assert.deepEqual([a.menus.site.labels, a.menus.source.labels, a.menus.site.drawers, a.menus.source.drawers, a.menus.pairs], [['Open the menu'], [''], 1, 1, 1])
    const [m] = a.menus.menus
    assert.deepEqual([m.trigger, m.key, m.by, m.labels], [DRAWER_KEY, DRAWER_KEY, 'structure', { site: 'Open the menu', source: '' }])
    assert.deepEqual([m.site.via, m.source.via], ['click', 'click'])
    assert.deepEqual([m.site.rect.w, m.source.rect.w], [300, 300])
    assert.ok(m.source.items.some((i) => i.kind === 'text' && i.text === 'About us'))
    for (const side of ['site', 'source']) {
      assert.equal(m[side].screenshot, menuShotName('en-about', v, DRAWER_KEY, side))
      assert.ok(existsSync(path.join(out, m[side].screenshot)))
    }
    assert.deepEqual(a.menus.unmatched, [])
  }
  for (const v of ['1440-light', '1440-dark']) {
    const a = axisOf(report, v)
    assert.deepEqual([a.menus.pairs, a.menus.site.triggers, a.menus.source.triggers, menuKinds(a)], [0, 0, 0, []])
  }
  assert.equal(report.summary.menus.captured, 2)
})

test('issue 56: a drawer drawn wider, or with its items in another order, is a finding on the drawer pair — no longer two unmatched toggles', async () => {
  const wide = await withSite({ wide: true }, {}, (fx, origin) => runOn(fx, origin, { stage: 'light-responsive', allStages: true }))
  const a = axisOf(wide.report, '390-light')
  const layout = a.findings.find((f) => f.kind === 'menu-open-layout')
  assert.equal(layout.element, `header menu "${DRAWER_KEY}" › panel`)
  assert.deepEqual(layout.deltas.find((d) => d.property === 'panel-w'), { property: 'panel-w', expected: '300px', observed: '343px' })
  assert.deepEqual(layout.deltas.find((d) => d.property === 'panel-x'), { property: 'panel-x', expected: '90px', observed: '47px' })
  assert.equal(a.findings.filter((f) => f.kind === 'menu-open-unmatched').length, 0)
  const order = await withSite({ reorder: true }, {}, (fx, origin) => runOn(fx, origin, { stage: 'light-responsive', allStages: true }))
  const b = axisOf(order.report, '390-light')
  const home = b.findings.find((f) => f.element === `header menu "${DRAWER_KEY}" › a "Home"`)
  assert.deepEqual(home.deltas.find((d) => d.property === 'y'), { property: 'y', expected: '68px', observed: '152px' })
  assert.ok(menuKinds(b).every((f) => f.trigger === DRAWER_KEY))
})

test('issue 56: two drawer toggles on the site, or one naming no panel, leave the drawer unpaired and named — never a clean pair', async () => {
  const second = await withSite({ second: true }, {}, (fx, origin) => runOn(fx, origin, { stage: 'light-responsive', allStages: true }))
  const a = axisOf(second.report, '390-light')
  assert.equal(a.menus.pairs, 0)
  // both site toggles say "Open the menu", which no source trigger says: unmatched by words, as any label on one side
  assert.deepEqual(menuKinds(a).map((f) => `${f.kind} ${f.side} ${f.element}`).sort(), ['menu-open-unmatched site header menu "Open the menu"', 'menu-open-unmatched source header menu (no words)'])
  assert.match(a.menus.unmatched.find((u) => u.side === 'source').reason, /the site has 2, the source 1/)
  const broken = await withSite({ noPanel: true }, {}, (fx, origin) => runOn(fx, origin, { stage: 'light-responsive', allStages: true }))
  const b = axisOf(broken.report, '390-light')
  assert.equal(b.menus.pairs, 0)
  // a site toggle whose panel cannot be named is not measured, never an unmatched trigger a decision could accept
  assert.deepEqual(menuKinds(b).map((f) => `${f.kind} ${f.side}`).sort(), ['menu-open-not-measured site', 'menu-open-unmatched source'])
  assert.equal(second.report.summary.stages['light-responsive'], 'fail')
})

test('issue 56: a declared pair is captured and compared through the run; a declaration whose selector names nothing on one side is unmatched', async () => {
  const pairs = [{ site: '.tracy-search-btn', source: '.jv-search-btn', label: 'Search box', reason: 'the source has no search button', decision: 'D-9' }]
  // the pair cites D-9: the decision exists and names the selector it accepts
  const { report } = await withSite({ search: true }, {}, (fx, origin) => {
    const decisions = path.join(fx.root, 'DECISIONS-i56.md')
    writeFileSync(decisions, '## Decisions\n\n- D-9: the source has no search button; the site keeps `.tracy-search-btn` paired with `.jv-search-btn`.\n')
    return runOn(fx, origin, { stage: 'light-responsive', allStages: true, decisions })
  }, { menuPairs: pairs })
  const a = axisOf(report, '390-light')
  assert.deepEqual(a.menus.menus.map((m) => [m.trigger, m.by]), [[DRAWER_KEY, 'structure']])
  assert.deepEqual(menuKinds(a).map((f) => [f.kind, f.side, f.element]), [['menu-open-unmatched', 'site', 'header menu "Search box"']])
  assert.match(a.menus.unmatched[0].reason, /the source header shows no trigger the declared selector ".jv-search-btn" names/)
})

test('issue 56: after a reload the drawer is found again by its markup; a reload that shows two drawer toggles names it, never picks one', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture({ search: true }, {}, { root: ROOT })
  const srv = await serve(fx.site)
  try {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
    let twice = false
    const load = async () => {
      await p.goto(`${srv.origin}/about/`, { waitUntil: 'networkidle' })
      await settle(p)
      if (twice) await p.evaluate(() => document.querySelector('nav').insertAdjacentHTML('beforeend', '<button class="tracy-toggle" style="right:200px" aria-haspopup="dialog" aria-label="Open more"><span class="tracy-bars"></span></button><div class="tracy-panel"><a href="/">x</a></div>'))
      return p.evaluate(inPageMenuTriggers, 16)
    }
    const c = await load()
    const groups = menuGroups(c, { structural: true }).groups
    const wanted = new Map([['search', groups.get('search')[0]], [DRAWER_KEY, groups.get(DRAWER_KEY)[0]]])
    // the Search panel only a reload closes: the drawer is captured after the reload, found by its markup
    const caps = await captureSide(p, wanted, { reload: load, out: fx.root, relOf: (k) => menuShotName('p', 'v', k, 'site'), props: ['font-size'] })
    assert.equal(caps.get('search').closed, 'reload')
    assert.equal(caps.get(DRAWER_KEY).opened, true, JSON.stringify(caps.get(DRAWER_KEY)))
    assert.equal(caps.get(DRAWER_KEY).via, 'click')
    const again = menuGroups(await load(), { structural: true }).groups
    const second = new Map([['search', again.get('search')[0]], [DRAWER_KEY, again.get(DRAWER_KEY)[0]]])
    twice = true
    const lost = await captureSide(p, second, { reload: load, out: fx.root, relOf: (k) => menuShotName('p', 'w', k, 'site'), props: ['font-size'] })
    assert.equal(lost.get(DRAWER_KEY).opened, false)
    assert.equal(lost.get(DRAWER_KEY).reason, 'after the page was loaded again the header had no single drawer toggle')
  } finally {
    await srv.close()
    await b.close()
  }
})

test('issue 56: a page that answers another status than it owes is not read as a page without menus; a declared error page is (#56 review)', async () => {
  const { chromium } = await import('playwright')
  const b = await chromium.launch({ args: [...RUN_LAUNCH_ARGS] })
  const fx = fixture({}, {}, { root: ROOT })
  const srv = await serve(fx.site)
  try {
    const common = { browser: b, siteOpts: { viewport: { width: 390, height: 844 } }, sourceOpts: { viewport: { width: 390, height: 844 } }, pageId: 'en-about', variantId: '390-light', out: fx.root, settle, props: ['font-size'], diffProperty }
    // the site route is gone: the 404 page has no header, which reads as no triggers — unless its status refuses it
    const gone = await measureMenus({ ...common, url: `${srv.origin}/gone/`, sourceUrl: `${srv.origin}/about/` })
    assert.equal(gone.record.measured, false)
    assert.match(gone.record.reason, /^the site did not load for the open-state capture: http:\/\/127\.0\.0\.1:\d+\/gone\/ answered 404, expected 2xx$/)
    assert.deepEqual(gone.findings.map((f) => [f.kind, f.side]), [['menu-open-not-measured', 'site']])
    const lost = await measureMenus({ ...common, url: `${srv.origin}/about/`, sourceUrl: `${srv.origin}/gone/` })
    assert.deepEqual([lost.record.measured, lost.findings.map((f) => [f.kind, f.side])], [false, [['menu-open-not-measured', 'source']]])
    // a page that owes 404 on both sides and shows no menu is a legitimate empty census
    const owed = await measureMenus({ ...common, url: `${srv.origin}/gone/`, sourceUrl: `${srv.origin}/missing/`, status: { site: 404, source: 404 } })
    assert.deepEqual([owed.record.measured, owed.record.site.triggers, owed.record.source.triggers, owed.findings], [true, 0, 0, []])
    // a page that owes 404 and answers 200 is refused too
    const wrong = await measureMenus({ ...common, url: `${srv.origin}/about/`, sourceUrl: `${srv.origin}/about/`, status: { site: 404 } })
    assert.match(wrong.record.reason, /answered 200, expected 404/)
    // the page's owed status reaches the axis through the run: a clean 200 page still measures
    const ok = await measureMenus({ ...common, url: `${srv.origin}/about/`, sourceUrl: `${srv.origin}/about/`, status: { site: 200, source: 200 } })
    assert.equal(ok.record.measured, true)
  } finally {
    await srv.close()
    await b.close()
  }
})

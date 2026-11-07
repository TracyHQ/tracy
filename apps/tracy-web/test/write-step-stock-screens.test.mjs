// Stock screens every plan drops (`site.stockScreens`) in the write step and the site check: each is a page the write step drops
// (its menu item unpublished unless a kept page needs its path), a link to it in the kit's hidden page link containers is made
// plain text, and the site check counts it among the hidden pages. Every fixture is invented: a made-up travel template whose
// writer list, writer profiles and type sample no customer content fills.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HIDDEN_LINKS_END, HIDDEN_LINKS_START } from '../src/lib/hidden-page-links.js'
import { STOCK_SCREEN_ID } from '../src/lib/stock-screens.js'
import { hiddenPageLinksGroup } from '../src/site-check/hidden-page-links.js'
import { hideHiddenPageLinks, relinkOrders } from '../src/write-step/hidden-page-links-stage.js'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { needsNewSite, readLastReport } from '../src/write-step/last-report.js'

const WHY = 'invented demo writers: their accounts are no contract content'
const CONTAINER = '.trip-author'
const HEAD = '<!-- tracy-brand-head:start -->\n<link rel="icon" href="/x.png">\n<!-- tracy-brand-head:end -->'
const STOCK = [
  { path: '/guides', why: WHY },
  { path: '/guides/author/*', why: WHY },
  { path: '/style-sample', why: 'an invented type sample page left out of the kit' }
]
const ROWS = [
  { id: 101, path: 'home', home: 1, published: 1 },
  { id: 120, path: 'about', published: 1 },
  { id: 130, path: 'guides', published: 1 },
  { id: 140, path: 'style-sample', published: 1 },
  { id: 150, path: 'trips', published: 1 }
]
const kitOf = (stockScreens) => ({
  site: {
    head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } },
    hiddenPageLinks: [{ container: CONTAINER, why: 'the invented article masthead links the author name' }],
    ...(stockScreens ? { stockScreens } : {})
  },
  pages: [
    { id: 'page-home', group: 'group-home', path: '/', blocks: { 1440: ['block-1'] } },
    { id: 'page-about', group: 'group-about', path: '/about', blocks: { 1440: ['block-2'] } },
    { id: 'page-trips', group: 'group-trips', path: '/trips', blocks: { 1440: ['block-3'] } },
    { id: 'page-guides', group: 'group-guides', path: '/guides', blocks: { 1440: ['block-4'] } },
    { id: 'page-guides_ana', group: 'group-trips', path: '/guides/author/ana', blocks: { 1440: ['block-5'] } }
  ],
  blocks: [{ id: 'block-2', source: { entity: 'module-2' } }]
})
const planOf = (aboutLinks = []) => ({
  pageGroups: [
    { id: 'group-home', decision: 'keep' },
    { id: 'group-about', decision: 'keep' },
    { id: 'group-trips', decision: 'keep' },
    { id: 'group-guides', decision: 'drop' }
  ],
  pages: [
    { id: 'page-home', decision: 'keep', blocks: [] },
    {
      id: 'page-about',
      decision: 'keep',
      blocks: [{ block: 'block-2', decision: 'keep', links: aboutLinks }]
    },
    { id: 'page-trips', decision: 'keep', blocks: [] },
    { id: 'page-guides_ana', decision: 'drop', why: 'normalised' }
  ]
})
const KEPT = [
  { id: 'page-home', path: '/' },
  { id: 'page-about', path: '/about' },
  { id: 'page-trips', path: '/trips' }
]
const orders = (kit, plan) =>
  hideOrders({
    plan,
    kit,
    owners: new Map(),
    extras: {},
    reading: { slots: [] },
    changes: {},
    cannotHide: null
  })

test('every stock screen the plan does not keep is a page to drop, a kit page of a dropped group and a path left out of the kit too', () => {
  const pages = orders(kitOf(STOCK), planOf()).pages
  assert.deepEqual(
    pages.map(({ page, depends }) => [page.id, page.path, depends]),
    [
      ['page-guides_ana', '/guides/author/ana', null],
      ['page-guides', '/guides', null],
      [`${STOCK_SCREEN_ID}/style-sample`, '/style-sample', null]
    ]
  )
  // A kit without the field drops what the plan drops, and nothing else.
  assert.deepEqual(
    orders(kitOf(null), planOf()).pages.map(({ page }) => page.id),
    ['page-guides_ana']
  )
})

test('a kept link to a stock screen keeps its menu item published, so the kept page does not lead to a 404', () => {
  const plan = planOf([{ link: 'block-2.link-1', leadsTo: 'page-guides' }])
  const order = orders(kitOf(STOCK), plan)
  const guides = order.pages.find(({ page }) => page.id === 'page-guides')
  assert.match(guides.depends, /the kept link block-2\.link-1/)
  assert.ok(order.noWayOut.some((n) => n.slot === 'page-guides' && /needs its path/.test(n.reason)))
  // A stock screen the plan keeps stays the plan's: the checker refuses that plan before the write step.
  const keeps = planOf()
  keeps.pages.push({ id: 'page-guides', decision: 'keep', blocks: [] })
  assert.ok(!orders(kitOf(STOCK), keeps).pages.some(({ page }) => page.id === 'page-guides'))
})

function door(content = HEAD, rows = ROWS) {
  let held = content
  return {
    held: () => held,
    apply: async ({ action, params }) => {
      if (action === 'content.list') return { ok: true, items: params.offset ? [] : rows }
      if (action === 'content.get') return { ok: true, item: { id: params.id, content: held } }
      held = params.fields.content
      return { ok: true }
    }
  }
}

test('a link to a stock screen in a hidden page link container is made plain text, and an emptied one goes to a living page', async () => {
  const site = door()
  const lines = await hideHiddenPageLinks({
    door: site,
    siteKey: 's',
    kit: kitOf(STOCK),
    plan: planOf(),
    keptPages: KEPT
  })
  assert.equal(lines[0]?.status, 'written', JSON.stringify(lines))
  const block = site.held().slice(HEAD.length + 1)
  assert.ok(block.startsWith(HIDDEN_LINKS_START) && block.endsWith(HIDDEN_LINKS_END))
  for (const href of [
    '/guides',
    '/guides/author/ana',
    '/style-sample',
    'index.php?Itemid=130',
    'index.php?Itemid=140'
  ])
    assert.ok(block.includes(`${CONTAINER} a[href="${href}"]`), href)
  assert.ok(!block.includes('Itemid=120"') && !block.includes('"/about"'))
  // Without the field only the plan's own drop is made inert.
  const plain = door()
  await hideHiddenPageLinks({ door: plain, siteKey: 's', kit: kitOf(null), plan: planOf(), keptPages: KEPT })
  assert.ok(!plain.held().includes('"/guides"'))

  const relinked = relinkOrders({
    reading: { slots: [{ key: 'module-2.4', type: 'url', current: 'index.php?Itemid=130' }] },
    emptySlots: ['module-2.4'],
    kit: kitOf(STOCK),
    plan: planOf(),
    rows: ROWS
  })
  assert.deepEqual(relinked, { 'module-2.4': 'index.php?Itemid=120' })
})

const context = (kit, shownLinks) => ({
  report: {
    site: 'x',
    keptPages: KEPT,
    slots: [
      { slot: 'page-guides', part: 'page-drop', status: 'hidden' },
      // A writer profile opens through its list's item, so no item of its own was unpublished.
      { slot: 'page-guides_ana', part: 'page-drop', status: 'skipped' },
      { slot: `${STOCK_SCREEN_ID}/style-sample`, part: 'page-drop', status: 'hidden' }
    ]
  },
  baseline: null,
  kit,
  read: async (action, params) =>
    action === 'content.list' && params?.kind === 'menuItem'
      ? { ok: true, items: params.offset ? [] : ROWS }
      : { ok: true, pages: [], slots: [] },
  host: async () => ({
    checks: [],
    pageMeasures: [{ path: '/about', width: 1440, shownLinks, shownLinksClickable: true }],
    visited: []
  })
})

test('the site check counts a stock screen among the hidden pages, unless its drop failed', async () => {
  const links = [
    { href: 'http://site.test/guides/author/ana', text: 'Ana', clickable: true },
    { href: 'http://site.test/style-sample', text: 'Type sample', clickable: true },
    { href: 'http://site.test/trips', text: 'Trips', clickable: true }
  ]
  const red = await hiddenPageLinksGroup.run(context(kitOf(STOCK), links))
  assert.deepEqual(
    red.failures.map((f) => f.measured),
    ['Ana', 'Type sample']
  )
  const failed = context(kitOf(STOCK), links)
  failed.report.slots = failed.report.slots.map((l) => ({ ...l, status: 'failed' }))
  assert.deepEqual((await hiddenPageLinksGroup.run(failed)).failures, [])
  // Without the field, a profile skipped for want of its own item and a path no kit page holds are not counted.
  assert.deepEqual((await hiddenPageLinksGroup.run(context(kitOf(null), links))).failures, [])
})

test('a rerun knows a stock screen the last run took off was dropped, and nothing else is let through', () => {
  const last = readLastReport({
    slots: [
      { slot: 'page-guides', part: 'page-drop', status: 'hidden', owner: 'plan', key: null },
      {
        slot: `${STOCK_SCREEN_ID}/style-sample`,
        part: 'page-drop',
        status: 'hidden',
        owner: 'plan',
        key: null
      }
    ]
  })
  const input = (kit) => ({ plan: planOf(), kit, owners: new Map(), extras: {}, changes: {} })
  assert.equal(needsNewSite(last, input(kitOf(STOCK))), null)
  assert.match(
    needsNewSite(last, input(kitOf(null)))?.reason ?? '',
    /page-guides \(a page that was dropped\)/
  )
})

test('a link printed with a run of index.php segments before the path is a hidden page link too, and only the rule passes the guard', async () => {
  const {
    deadTargetsOf,
    hiddenLinkBlockFor,
    hiddenLinkSelectorsFor,
    isDeadHref,
    isHiddenLinkBlock,
    pagePath
  } = await import('../src/lib/hidden-page-links.js')
  assert.equal(pagePath('/index.php/index.php/guides/author/ana'), '/guides/author/ana')
  assert.equal(pagePath('index.php/index.php'), '/')
  const targets = deadTargetsOf({ rows: ROWS, droppedPaths: ['/guides/author/ana'], keptPaths: ['/'] })
  assert.equal(
    isDeadHref('http://site.test/index.php/index.php/guides/author/ana', targets, 'http://site.test'),
    true
  )
  const selectors = hiddenLinkSelectorsFor(targets, [CONTAINER])
  assert.ok(selectors.includes(`${CONTAINER} a[href="/guides/author/ana"]`))
  assert.ok(selectors.includes(`${CONTAINER} a[href$="/index.php/guides/author/ana"]`))
  const block = hiddenLinkBlockFor(selectors)
  assert.equal(isHiddenLinkBlock(block, [CONTAINER]), true)
  assert.equal(isHiddenLinkBlock(block, ['.elsewhere']), false)
  assert.equal(
    isHiddenLinkBlock(block.replace('a[href$="/index.php/guides', 'a[href*="/index.php/guides'), [CONTAINER]),
    false
  )
})

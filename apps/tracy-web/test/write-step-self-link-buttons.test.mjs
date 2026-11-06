// The write step's rule for "more" buttons that lead to the page they sit on (ADR 0044, decision 27, card AF). Every fixture is
// invented: an invented template whose section chrome prints a "more" button under a block, linked to whatever the demo set.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  holdersMatch,
  SELF_LINKS_END,
  SELF_LINKS_SLOT,
  SELF_LINKS_START,
  selfLinkBlockFor,
  selfLinkButtonsOf,
  selfLinkSelectorsFor,
  withSelfLinkBlock
} from '../src/lib/self-link-buttons.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { hideSelfLinkButtons } from '../src/write-step/self-link-buttons-stage.js'
import { PAGE_CHECK_GROUPS } from '../src/site-check/page-groups.js'
import { TEMPLATE_STEP, WRITE_STEP } from '../src/lib/site-build-steps.js'

const CONTAINER = '.more-row'
const WHY = 'the invented section chrome prints its "more" button in div.more-row'
const HEAD =
  '<!-- tracy-brand-head:start -->\n<link rel="icon" href="/images/x.png">\n<!-- tracy-brand-head:end -->'
const ROWS = [
  {
    id: 101,
    path: 'home',
    home: 1,
    published: 1,
    menutype: 'main',
    link: 'index.php?option=com_content&view=featured'
  },
  {
    id: 195,
    path: 'team',
    published: 1,
    menutype: 'main',
    link: 'index.php?option=com_content&view=category&id=8'
  },
  {
    id: 197,
    path: 'team/ana-lima',
    published: 1,
    menutype: 'main',
    link: 'index.php?option=com_content&view=article&id=3'
  },
  // A page the plan dropped: no rule is built for it.
  {
    id: 205,
    path: 'prices',
    published: 1,
    menutype: 'main',
    link: 'index.php?option=com_content&view=article&id=9'
  }
]
const KEPT = [
  { id: 'page-home', path: '/' },
  { id: 'page-team', path: '/team' },
  { id: 'page-ana', path: '/team/ana-lima' }
]

const kitOf = (selfLinkButtons) => ({
  site: {
    head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } },
    ...(selfLinkButtons ? { selfLinkButtons } : {})
  }
})

function door(content = HEAD, { rows = ROWS, refuse = null } = {}) {
  const calls = []
  let held = content
  return {
    calls,
    held: () => held,
    apply: async ({ action, params }) => {
      calls.push({ action, params })
      if (action === 'content.list') return { ok: true, items: params.offset ? [] : rows }
      if (action === 'content.get') return { ok: true, item: { id: params.id, content: held } }
      if (refuse) return { ok: false, error: 'locked', message: refuse }
      held = params.fields.content
      return { ok: true }
    }
  }
}

const team = (container = CONTAINER) =>
  ['/team', '/index.php/team', 'index.php?Itemid=195', '/index.php?Itemid=195'].map(
    (href) => `body.com_content.view-category.item-195 ${container} a[href="${href}"]`
  )

test('each kept page hides the "more" buttons in the kit containers that lead to that page, and only those', () => {
  const selectors = selfLinkSelectorsFor(
    KEPT.map((p) => ({
      path: p.path,
      rows: ROWS.filter((r) => `/${r.path}` === p.path || (p.path === '/' && r.home))
    })),
    [CONTAINER]
  )
  for (const s of team()) assert.ok(selectors.includes(s), s)
  assert.ok(selectors.includes('body.com_content.view-featured.item-101 .more-row a[href="/"]'))
  assert.ok(selectors.includes('body.com_content.view-article.item-197 .more-row a[href="/team/ana-lima"]'))
  // Never a link to another page: each rule is scoped to one page and names that page's own address only.
  for (const s of selectors) {
    const id = /\.item-(\d+) /.exec(s)[1]
    const href = /a\[href="([^"]*)"\]$/.exec(s)[1]
    const row = ROWS.find((r) => String(r.id) === id)
    const own = row.home ? ['/', '/index.php', '/index.php/'] : [`/${row.path}`, `/index.php/${row.path}`]
    assert.ok([...own, `index.php?Itemid=${id}`, `/index.php?Itemid=${id}`].includes(href), s)
  }
  assert.ok(!selectors.some((s) => s.includes('prices') || s.includes('item-205')))
})

test('a row whose view cannot be read gets no rule: its menu item id alone would also match the articles opened under it', () => {
  const selectors = selfLinkSelectorsFor(
    [{ path: '/team', rows: [{ id: 195, path: 'team', link: '' }] }],
    [CONTAINER]
  )
  assert.deepEqual(selectors, [])
})

test('the stage writes the rules after the renames, at the address the page answers now, and reads them back', async () => {
  const site = door()
  const kit = kitOf([{ container: CONTAINER, why: WHY }])
  const lines = await hideSelfLinkButtons({ door: site, siteKey: 's', kit, keptPages: KEPT })
  const writes = site.calls.filter((c) => c.action === 'content.update')
  assert.equal(writes.length, 1)
  const block = writes[0].params.fields.content.slice(HEAD.length + 1)
  assert.ok(block.startsWith(`${SELF_LINKS_START}<style>`))
  assert.ok(block.endsWith(`{display:none!important}</style>${SELF_LINKS_END}`))
  for (const s of team()) assert.ok(block.includes(s), s)
  assert.equal(lines.length, 1)
  assert.deepEqual([lines[0].slot, lines[0].status, lines[0].ordered], [SELF_LINKS_SLOT, 'written', block])
  assert.equal(lines[0].readFrom.type, 'contains')

  // Renamed: the route stage gave the page its plan address, so the rule names that address.
  const renamed = door(HEAD, { rows: ROWS.map((r) => (r.id === 195 ? { ...r, path: 'coaches' } : r)) })
  await hideSelfLinkButtons({
    door: renamed,
    siteKey: 's',
    kit,
    keptPages: KEPT.map((p) => (p.id === 'page-team' ? { ...p, path: '/coaches' } : p))
  })
  assert.ok(renamed.held().includes('.item-195 .more-row a[href="/coaches"]'))
  assert.ok(!renamed.held().includes('a[href="/team"]'))

  // A rerun on the same site sends nothing.
  const again = await hideSelfLinkButtons({ door: site, siteKey: 's', kit, keptPages: KEPT })
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 1)
  assert.equal(again[0].status, 'written')
})

test('a kit without the field is not asked about; an empty list takes an earlier block off', async () => {
  const site = door()
  assert.deepEqual(
    await hideSelfLinkButtons({ door: site, siteKey: 's', kit: kitOf(null), keptPages: KEPT }),
    []
  )
  assert.equal(site.calls.length, 0)
  const held = withSelfLinkBlock(HEAD, selfLinkBlockFor(team()))
  const cleared = door(held)
  assert.deepEqual(
    await hideSelfLinkButtons({ door: cleared, siteKey: 's', kit: kitOf([]), keptPages: KEPT }),
    []
  )
  assert.equal(cleared.held(), HEAD)
})

test('a container that is not one plain compound selector is left out; a refusal is a failed line in the plugin words', async () => {
  for (const bad of ['.a, .b', '.a .b', '.a{}', '.a>b', 'div', '', '.a[href]', '#x:hover'])
    assert.equal(selfLinkButtonsOf(kitOf([{ container: bad, why: WHY }])).containers.length, 0, bad)
  assert.deepEqual(selfLinkButtonsOf(kitOf([{ container: 'div#more.row.x', why: WHY }])).containers, [
    'div#more.row.x'
  ])
  const lines = await hideSelfLinkButtons({
    door: door(HEAD, { refuse: 'the module is checked out' }),
    siteKey: 's',
    kit: kitOf([{ container: CONTAINER, why: WHY }]),
    keptPages: KEPT
  })
  assert.equal(lines[0].status, 'failed')
  assert.match(lines[0].reason, /checked out/)
})

test('the look guard lets the stage put its rules in the head block, and nothing else in that block', async () => {
  const kit = kitOf([{ container: CONTAINER, why: WHY }])
  const guard = lookGuard({ kit })
  await hideSelfLinkButtons({ door: guard.door(door()), siteKey: 's', kit, keptPages: KEPT })
  assert.deepEqual(guard.findings(), [])

  for (const rogue of [
    `${SELF_LINKS_START}<style>.site-header{display:none!important}</style>${SELF_LINKS_END}`,
    `${SELF_LINKS_START}<style>body.item-5 .other-row a[href="/x"]{display:none!important}</style>${SELF_LINKS_END}`,
    `${SELF_LINKS_START}<style>body.item-5 .more-row a[href="/x"]{color:red}</style>${SELF_LINKS_END}`
  ]) {
    const other = lookGuard({ kit })
    const inner = other.door(door())
    await inner.apply({ siteKey: 's', action: 'content.get', params: { kind: 'module', id: 42 } })
    await inner.apply({
      siteKey: 's',
      action: 'content.update',
      params: { apply_id: 'x', kind: 'module', id: 42, fields: { content: withSelfLinkBlock(HEAD, rogue) } }
    })
    assert.equal(other.findings().length, 1, rogue)
    assert.match(other.findings()[0].reason, /self link/)
  }
})

test('a page holder matches a container by tag, id and every class', () => {
  const holders = [
    { tag: 'a', id: null, classes: ['btn'] },
    { tag: 'div', id: 'more', classes: ['more-row', 'wide'] }
  ]
  assert.equal(holdersMatch(holders, ['.more-row']), '.more-row')
  assert.equal(holdersMatch(holders, ['div#more.more-row.wide']), 'div#more.more-row.wide')
  assert.equal(holdersMatch(holders, ['section.more-row']), null)
  assert.equal(holdersMatch(holders, ['.more-row.narrow']), null)
  assert.equal(holdersMatch(undefined, ['.more-row']), null)
})

// ── step 11 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const measure = {
  path: '/team',
  width: 1440,
  selfLinks: [
    {
      selector: 'a.btn',
      text: 'See more',
      href: 'http://site.test/team',
      holders: [{ tag: 'div', id: null, classes: ['more-row'] }]
    }
  ]
}
const context = (kit, read) => ({
  report: { slots: [], site: 'x' },
  baseline: null,
  kit,
  read: read ?? (async () => ({ ok: true, pages: [{ route: '/team', entity: 'menuItem-195' }], slots: [] })),
  host: async () => ({ checks: [], pageMeasures: [measure], visited: [] })
})
const selfLinks = PAGE_CHECK_GROUPS.find((g) => g.name === 'self-links')

test('step 11: a "more" button to its own page inside a container the kit names is the write step’s, else the template’s', async () => {
  const declared = await selfLinks.run(context(kitOf([{ container: CONTAINER, why: WHY }])))
  assert.equal(declared.failures.length, 1)
  assert.equal(declared.failures[0].causingStep, WRITE_STEP)
  assert.equal(declared.failures[0].slot, SELF_LINKS_SLOT)
  const plain = await selfLinks.run(context(null))
  assert.equal(plain.failures[0].causingStep, TEMPLATE_STEP)
})

test('through the entry point: the rules land in the head block once the run is done, with no guard finding', async () => {
  const { runStep, KIT } = await import('./_write-step-run.mjs')
  const kit = KIT()
  kit.doc.site.head = { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } }
  kit.doc.site.selfLinkButtons = [{ container: CONTAINER, why: WHY }]
  kit.doc.pages = [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/team' }
  ]
  const records = [
    { kind: 'module', id: 42, content: HEAD },
    ...ROWS.slice(0, 2).map((r) => ({ kind: 'menuItem', ...r }))
  ]
  const { report, site } = await runStep({}, { records }, { kit })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const content = site.records.get('module-42').content
  assert.ok(content.startsWith(HEAD))
  for (const s of team()) assert.ok(content.includes(s), s)
  assert.deepEqual(report.guard.findings, [])
  assert.equal(report.slots.find((l) => l.slot === SELF_LINKS_SLOT)?.status, 'written')
})

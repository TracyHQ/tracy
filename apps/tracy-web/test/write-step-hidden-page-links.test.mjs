// Links in a kept row that lead to a page the plan hides (ADR 0044, decision 29, third use; card AM). Every fixture is invented:
// an invented template whose team cards link name and photo to a profile page the plan drops.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  deadTargetsOf,
  HIDDEN_LINKS_END,
  HIDDEN_LINKS_SLOT,
  HIDDEN_LINKS_START,
  hiddenLinkSelectorsFor,
  INERT_RULE,
  isDeadHref,
  livingPageFor,
  withHiddenLinkBlock
} from '../src/lib/hidden-page-links.js'
import { writeContract } from '../src/write-step/contract-write.js'
import { hideHiddenPageLinks, relinkOrders } from '../src/write-step/hidden-page-links-stage.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { hiddenPageLinksGroup } from '../src/site-check/hidden-page-links.js'
import { WRITE_STEP } from '../src/lib/site-build-steps.js'
import { addressMoves, movedLinksIn } from '../src/lib/renamed-addresses.js'

const CONTAINER = '.crew-card'
const WHY = 'the invented team layout links each card name and photo to its profile page'
const HEAD =
  '<!-- tracy-brand-head:start -->\n<link rel="icon" href="/images/x.png">\n<!-- tracy-brand-head:end -->'
const ROWS = [
  { id: 101, path: 'home', home: 1, published: 1, link: 'index.php?option=com_content&view=featured' },
  { id: 195, path: 'team', published: 1, link: 'index.php?option=com_content&view=category&id=8' },
  // The profile page the plan drops; the page settings stage unpublishes it later in the run.
  { id: 197, path: 'team/ana-lima', published: 1, link: 'index.php?option=com_content&view=article&id=3' },
  { id: 210, path: 'contact', published: 1, link: 'index.php?option=com_contact&view=contact&id=1' },
  { id: 230, path: 'old-offer', published: 0, link: 'index.php?option=com_content&view=article&id=12' }
]
const KIT_PAGES = [
  { id: 'page-home', path: '/', blocks: { 1440: ['block-30', 'block-31'] } },
  { id: 'page-team', path: '/team', blocks: { 1440: ['block-31'] } },
  { id: 'page-ana', path: '/team/ana-lima', blocks: { 1440: ['block-40'] } },
  { id: 'page-contact', path: '/contact', blocks: { 1440: ['block-50'] } }
]
const PLAN = {
  pages: [
    { id: 'page-home', decision: 'keep' },
    { id: 'page-team', decision: 'keep' },
    { id: 'page-ana', decision: 'drop' },
    { id: 'page-contact', decision: 'keep' }
  ]
}
const kitOf = (hiddenPageLinks) => ({
  site: {
    head: { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } },
    ...(hiddenPageLinks ? { hiddenPageLinks } : {})
  },
  pages: KIT_PAGES,
  blocks: [
    { id: 'block-30', source: { entity: 'module-30' } },
    { id: 'block-31', source: { entity: 'module-31' } }
  ]
})
const KEPT = [
  { id: 'page-home', path: '/' },
  { id: 'page-team', path: '/team' },
  { id: 'page-contact', path: '/contact' }
]

test('a hidden page is one the plan drops or a menu item left unpublished; a living page never is', () => {
  const targets = deadTargetsOf({
    rows: ROWS,
    droppedPaths: ['/team/ana-lima'],
    keptPaths: KEPT.map((p) => p.path)
  })
  assert.deepEqual(targets.itemIds, [197, 230])
  assert.deepEqual(targets.paths, ['/team/ana-lima', '/old-offer'])
  for (const href of [
    'index.php?Itemid=197',
    '/index.php?Itemid=197',
    'http://site.test/index.php?Itemid=230',
    '/team/ana-lima',
    'http://site.test/index.php/team/ana-lima/'
  ])
    assert.equal(isDeadHref(href, targets), true, href)
  for (const href of [
    'index.php?Itemid=195',
    '/team',
    '/contact',
    'http://site.test/',
    'index.php?option=com_content&view=article&id=3&Itemid=195',
    'https://elsewhere.example/team/ana-lima'
  ])
    assert.equal(isDeadHref(href, targets, 'http://site.test'), false, href)
})

test('the inert rule names only hidden pages, in the kit containers', () => {
  const targets = deadTargetsOf({ rows: ROWS, droppedPaths: ['/team/ana-lima'], keptPaths: ['/', '/team'] })
  const selectors = hiddenLinkSelectorsFor(targets, [CONTAINER])
  assert.ok(selectors.includes('.crew-card a[href="index.php?Itemid=197"]'))
  assert.ok(selectors.includes('.crew-card a[href="/index.php/team/ana-lima"]'))
  for (const s of selectors) assert.ok(!/Itemid=(195|101|210)"|"\/team"|"\/contact"/.test(s), s)
  assert.match(INERT_RULE, /pointer-events:none/)
  assert.match(INERT_RULE, /cursor:default/)
})

test('a link to a dropped profile is sent to the kept page that lists it, else the kept page that holds the block', () => {
  const kit = kitOf([])
  assert.equal(
    livingPageFor({ deadPath: '/team/ana-lima', block: 'block-30', kit, plan: PLAN })?.id,
    'page-team'
  )
  assert.equal(livingPageFor({ deadPath: '/old-offer', block: 'block-31', kit, plan: PLAN })?.id, 'page-home')
  assert.equal(livingPageFor({ deadPath: '/old-offer', block: 'block-99', kit, plan: PLAN }), null)
})

test('relink orders: each emptied link slot to a hidden page gets the living page address, nothing else does', () => {
  const reading = {
    slots: [
      { key: 'module-30.8', type: 'url', current: 'index.php?Itemid=197' },
      { key: 'module-30.9', type: 'url', current: '/team/ana-lima' },
      { key: 'module-30.10', type: 'url', current: 'index.php?Itemid=210' },
      { key: 'module-30.4', type: 'text', current: 'Ana Lima' },
      { key: 'module-31.2', type: 'url', current: 'index.php?Itemid=230' }
    ]
  }
  const orders = relinkOrders({
    reading,
    emptySlots: ['module-30.8', 'module-30.9', 'module-30.10', 'module-30.4', 'module-31.2'],
    kit: kitOf([{ container: CONTAINER, why: WHY }]),
    plan: PLAN,
    rows: ROWS
  })
  assert.deepEqual(orders, {
    'module-30.8': 'index.php?Itemid=195',
    'module-30.9': 'index.php?Itemid=195',
    // No kept page lists /old-offer: the kept page that holds block-31 (home comes first in the plan).
    'module-31.2': 'index.php?Itemid=101'
  })
  assert.deepEqual(
    relinkOrders({ reading, emptySlots: ['module-30.8'], kit: kitOf(null), plan: PLAN, rows: ROWS }),
    {}
  )
})

// Cards AM and AD on one slot: AM writes a link its row keeps to a living page before the contract call, and AD, after the route
// stage, rewrites links that still name a moved address. The living address is a menu item id, which a rename does not move, so
// AD leaves it alone even when that living page is the one renamed, and the link still opens it.
test('a relinked address survives the rename of the living page it names: the renamed-link stage leaves it alone', () => {
  const reading = { slots: [{ key: 'module-30.9', type: 'url', current: '/team/ana-lima' }] }
  const orders = relinkOrders({
    reading,
    emptySlots: ['module-30.9'],
    kit: kitOf([{ container: CONTAINER, why: WHY }]),
    plan: PLAN,
    rows: ROWS
  })
  assert.deepEqual(orders, { 'module-30.9': 'index.php?Itemid=195' })
  const moves = addressMoves([
    { pageId: 'page-team', itemId: 195, from: '/team', to: '/coaches', outcome: 'written' }
  ])
  const after = movedLinksIn(orders['module-30.9'], moves, { whole: true })
  assert.equal(after.text, 'index.php?Itemid=195')
  assert.deepEqual(after.moved, [])
  // The same slot written as the living page's path would have followed the rename.
  assert.equal(movedLinksIn('/team', moves, { whole: true }).text, '/coaches')
})

const refusedAnswer = (keys, code = 'SLOT_NOT_HIDEABLE') => {
  const error = new Error('The content contract refused some slots')
  error.errors = keys.map((k) => ({
    code,
    message: `This slot goes only with its row: ${k}`,
    field: { slotKey: k }
  }))
  return error
}

test('the contract call writes the living address in place of an empty a row will not lose, once', async () => {
  const sent = []
  const result = await writeContract({
    applyJoomlaContract: async ({ mapping }) => {
      sent.push(structuredClone({ changes: mapping.changes, emptySlots: mapping.emptySlots }))
      if (mapping.emptySlots.includes('module-30.8')) throw refusedAnswer(['module-30.8'])
    },
    apply: async () => ({ ok: true }),
    siteKey: 's',
    reading: { revision: 'r1' },
    mapping: {
      contract: 'c',
      changes: { 'module-30.4': 'Ana Lima' },
      evidence: {},
      emptySlots: ['module-30.8', 'module-30.12'],
      relink: { 'module-30.8': 'index.php?Itemid=195' }
    },
    isCancelled: async () => false,
    sleep: async () => {}
  })
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[1], {
    changes: { 'module-30.4': 'Ana Lima', 'module-30.8': 'index.php?Itemid=195' },
    emptySlots: ['module-30.12']
  })
  assert.deepEqual(result.emptied, ['module-30.12'])
  assert.ok(result.written.includes('module-30.8'))
  assert.equal(result.refused.has('module-30.8'), false)
  assert.equal(result.relinked.get('module-30.8').address, 'index.php?Itemid=195')

  // The door refuses the address too: a refused line in the plugin's words, naming both refusals.
  const refusing = await writeContract({
    applyJoomlaContract: async ({ mapping }) => {
      if (mapping.emptySlots.includes('module-30.8')) throw refusedAnswer(['module-30.8'])
      if ('module-30.8' in mapping.changes) throw refusedAnswer(['module-30.8'], 'URL_REFUSED')
    },
    apply: async () => ({ ok: true }),
    siteKey: 's',
    reading: { revision: 'r1' },
    mapping: {
      contract: 'c',
      changes: {},
      evidence: {},
      emptySlots: ['module-30.8'],
      relink: { 'module-30.8': 'index.php?Itemid=195' }
    },
    isCancelled: async () => false,
    sleep: async () => {}
  })
  assert.equal(refusing.refused.get('module-30.8').code, 'URL_REFUSED')
  assert.equal(refusing.relinked.has('module-30.8'), false)
})

function door(content = HEAD, rows = ROWS) {
  const calls = []
  let held = content
  return {
    calls,
    held: () => held,
    apply: async ({ action, params }) => {
      calls.push({ action, params })
      if (action === 'content.list') return { ok: true, items: params.offset ? [] : rows }
      if (action === 'content.get') return { ok: true, item: { id: params.id, content: held } }
      held = params.fields.content
      return { ok: true }
    }
  }
}

test('the stage makes links to hidden pages in the kit containers plain text, read back from the head block', async () => {
  const site = door(
    HEAD,
    ROWS.map((r) => (r.id === 197 ? { ...r, published: 0 } : r))
  )
  const kit = kitOf([{ container: CONTAINER, why: WHY }])
  const lines = await hideHiddenPageLinks({ door: site, siteKey: 's', kit, plan: PLAN, keptPages: KEPT })
  const block = site.held().slice(HEAD.length + 1)
  assert.ok(block.startsWith(`${HIDDEN_LINKS_START}<style>`))
  assert.ok(block.endsWith(`${INERT_RULE}</style>${HIDDEN_LINKS_END}`))
  assert.ok(block.includes('.crew-card a[href="index.php?Itemid=197"]'))
  assert.ok(!block.includes('Itemid=195"'))
  assert.deepEqual([lines[0].slot, lines[0].status, lines[0].ordered], [HIDDEN_LINKS_SLOT, 'written', block])
  assert.equal(lines[0].readFrom.type, 'contains')
  assert.deepEqual(
    await hideHiddenPageLinks({ door: door(), siteKey: 's', kit: kitOf(null), plan: PLAN, keptPages: KEPT }),
    []
  )

  // The look guard lets exactly such a block through, and not a rule on another container or with other properties.
  const guard = lookGuard({ kit })
  await hideHiddenPageLinks({ door: guard.door(door()), siteKey: 's', kit, plan: PLAN, keptPages: KEPT })
  assert.deepEqual(guard.findings(), [])
  for (const rogue of [
    `${HIDDEN_LINKS_START}<style>.site-header a[href="/x"]${INERT_RULE}</style>${HIDDEN_LINKS_END}`,
    `${HIDDEN_LINKS_START}<style>.crew-card a[href="/x"]{display:none!important}</style>${HIDDEN_LINKS_END}`
  ]) {
    const other = lookGuard({ kit })
    const inner = other.door(door())
    await inner.apply({ siteKey: 's', action: 'content.get', params: { kind: 'module', id: 42 } })
    await inner.apply({
      siteKey: 's',
      action: 'content.update',
      params: { apply_id: 'x', kind: 'module', id: 42, fields: { content: withHiddenLinkBlock(HEAD, rogue) } }
    })
    assert.equal(other.findings().length, 1, rogue)
    assert.match(other.findings()[0].reason, /hidden page link/)
  }
})

// ── step 11 ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const context = (shownLinks, { flag = true } = {}) => ({
  report: {
    site: 'x',
    keptPages: KEPT,
    slots: [{ slot: 'page-ana', part: 'page-drop', status: 'hidden' }]
  },
  baseline: null,
  kit: kitOf([{ container: CONTAINER, why: WHY }]),
  read: async (action, params) =>
    action === 'content.list' && params?.kind === 'menuItem'
      ? { ok: true, items: params.offset ? [] : ROWS.map((r) => (r.id === 197 ? { ...r, published: 0 } : r)) }
      : { ok: true, pages: [{ route: '/team', entity: 'menuItem-195' }], slots: [] },
  host: async () => ({
    checks: [],
    pageMeasures: [
      { path: '/team', width: 1440, shownLinks, ...(flag ? { shownLinksClickable: true } : {}) }
    ],
    visited: []
  })
})

test('step 11: a shown clickable link to a hidden page blocks on step 9; an inert one or one to a living page does not', async () => {
  const red = await hiddenPageLinksGroup.run(
    context([
      { href: 'http://site.test/index.php?Itemid=197', text: 'Ana Lima', clickable: true },
      { href: 'http://site.test/index.php?Itemid=197', text: 'Ana photo', clickable: false },
      { href: 'http://site.test/team', text: 'Team', clickable: true }
    ])
  )
  assert.equal(red.failures.length, 1)
  assert.equal(red.failures[0].causingStep, WRITE_STEP)
  assert.equal(red.failures[0].measured, 'Ana Lima')
  const green = await hiddenPageLinksGroup.run(
    context([{ href: 'http://site.test/team', text: 'Team', clickable: true }])
  )
  assert.deepEqual(green.failures, [])
  await assert.rejects(hiddenPageLinksGroup.run(context([], { flag: false })), /not measured/)
})

test('through the entry point: a link its row keeps goes to the living page, its line says so, with no guard finding', async () => {
  const { runHide, hideKit } = await import('./_write-step-hide.mjs')
  const kit = hideKit()
  kit.doc.site.head = { injection: { maxBytes: 8000, position: { name: 'foot-1', block: 'block-42' } } }
  kit.doc.site.hiddenPageLinks = [{ container: CONTAINER, why: WHY }]
  const records = [
    { kind: 'module', id: 42, content: HEAD },
    {
      kind: 'menuItem',
      id: 101,
      path: 'home',
      home: 1,
      published: 1,
      link: 'index.php?option=com_content&view=featured'
    },
    {
      kind: 'menuItem',
      id: 50,
      path: 'about-us',
      published: 1,
      link: 'index.php?option=com_content&view=article&id=2'
    },
    {
      kind: 'menuItem',
      id: 60,
      path: 'about-us/old',
      published: 1,
      link: 'index.php?option=com_content&view=article&id=4'
    }
  ]
  const { report, site } = await runHide({
    kit,
    site: {
      records,
      overSlot: (slot) => (slot.key === 'module-2.3' ? { type: 'url', current: 'index.php?Itemid=60' } : {}),
      refuseEmpty: {
        'module-2.3': { code: 'SLOT_NOT_HIDEABLE', message: 'This slot goes only with its row: module-2.3' }
      }
    }
  })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const line = report.slots.find((l) => l.slot === 'block-2.3')
  assert.equal(line.status, 'written', JSON.stringify(line))
  assert.equal(line.ordered, 'index.php?Itemid=50')
  assert.match(line.reason, /SLOT_NOT_HIDEABLE.*living page index\.php\?Itemid=50/)
  assert.equal(site.held['module-2.3'], 'index.php?Itemid=50')
  assert.deepEqual(report.guard.findings, [])
  const css = report.slots.find((l) => l.slot === HIDDEN_LINKS_SLOT)
  assert.equal(css?.status, 'written', JSON.stringify(css))
  assert.ok(site.records.get('module-42').content.includes('.crew-card a[href="index.php?Itemid=60"]'))
})

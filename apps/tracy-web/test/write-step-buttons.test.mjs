// The buttons a visitor can see and no step owns (TracyHQ/tracy#379): the plan's words reach the block's own button, and a button the
// plan says nothing of leaves through the hide routes, whole. Everything is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy, KIT as baseKit, plan as basePlan, runStep } from './_write-step-run.mjs'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { buttonClaims, buttonsOfBlock } from '../src/write-step/kit-buttons.js'
import { linkDoors } from '../src/write-step/link-doors.js'
import { ownerTable } from '../src/write-step/owner-table.js'

const slot = (key, role, sample, over = {}) => ({
  key,
  entity: key.slice(0, key.lastIndexOf('.')),
  column: 'params',
  type: role.endsWith('_url') ? 'url' : 'text',
  role,
  sample,
  current: sample,
  ...over
})
const LABEL = 'editorial.button_label'
const URL = 'editorial.navigation_url'
const CONTENT_MAP = {
  slots: [
    // Two blocks that print the same button, each from HTML of its own.
    slot('module-1.1', URL, 'index.php?Itemid=7', { jsonPath: ['desc'], xpath: '/html/body/div/a/@href' }),
    slot('module-1.2', LABEL, 'read more', { jsonPath: ['desc'], xpath: '/html/body/div/a/text()' }),
    slot('module-2.1', URL, 'index.php?Itemid=7', { jsonPath: ['desc'], xpath: '/html/body/div/a/@href' }),
    slot('module-2.2', LABEL, 'read more', { jsonPath: ['desc'], xpath: '/html/body/div/a/text()' }),
    // The same again as two stored fields of the row.
    slot('module-3.1', LABEL, 'View all', { jsonPath: ['btn-title'] }),
    slot('module-3.2', URL, 'index.php?Itemid=8', { jsonPath: ['btn-link'] }),
    slot('module-4.1', LABEL, 'View all', { jsonPath: ['btn-title'] }),
    slot('module-4.2', URL, 'index.php?Itemid=8', { jsonPath: ['btn-link'] }),
    // A button no link of the block prints: nothing a visitor sees.
    slot('module-5.1', LABEL, 'Never printed', { jsonPath: ['btn-title'] }),
    slot('module-5.2', URL, 'index.php?Itemid=8', { jsonPath: ['btn-link'] })
  ]
}
const block = (n, links) => ({
  id: `block-${n}`,
  visibleAt: ['1440'],
  source: { entity: `module-${n}` },
  links,
  slots: []
})
const KIT = {
  blocks: [
    block(1, [{ id: 'block-1.link-1', label: 'READ MORE', target: '/about', labelId: 'block-1.2' }]),
    // A kit from before the list names the first block's field for the second's button too.
    block(2, [{ id: 'block-2.link-1', label: 'READ MORE', target: '/about', labelId: 'block-1.2' }]),
    block(3, [{ id: 'block-3.link-1', label: 'VIEW ALL', target: '/team', labelId: 'block-3.1' }]),
    block(4, [{ id: 'block-4.link-1', label: 'VIEW ALL', target: '/team', labelId: 'block-3.1' }]),
    block(5, [])
  ],
  pages: []
}
const planOf = (blocks) => ({ sharedBlocks: blocks, pages: [] })
const words = (label) => ({
  slot: label,
  owner: 'plan-label',
  file: 'copy',
  kind: 'text',
  content: '["Our lessons"]'
})

test('the visible buttons come from the kit list when it has one, else from its links and the content map', () => {
  assert.deepEqual(buttonsOfBlock(KIT.blocks[1], CONTENT_MAP), [
    { labelSlot: 'block-2.2', urlSlot: 'block-2.1', label: 'read more', link: 'block-2.link-1' }
  ])
  assert.deepEqual(buttonsOfBlock(KIT.blocks[3], CONTENT_MAP), [
    { labelSlot: 'block-4.1', urlSlot: 'block-4.2', label: 'View all', link: 'block-4.link-1' }
  ])
  assert.deepEqual(buttonsOfBlock(KIT.blocks[4], CONTENT_MAP), [])
  const listed = {
    ...KIT.blocks[1],
    buttons: [{ labelSlot: 'block-2.9', urlSlot: null, label: 'Listed', link: 'x' }]
  }
  assert.equal(buttonsOfBlock(listed, CONTENT_MAP)[0].labelSlot, 'block-2.9')
})

test('a plan label naming the same button of another block is the plan speaking: its words go to this block too', () => {
  const plan = planOf([
    { block: 'block-2', links: [{ link: 'block-2.link-1', leadsTo: 'page-a', labelSlot: 'block-1.2' }] }
  ])
  const { claims, twins } = buttonClaims({
    plan,
    kit: KIT,
    contentMap: CONTENT_MAP,
    claims: [words('block-1.2')],
    file: 'kit'
  })
  assert.deepEqual([...twins], [['block-2.2', 'block-1.2']])
  assert.deepEqual(
    claims.map((c) => [c.slot, c.kind, c.content]),
    [['block-2.2', 'text', '["Our lessons"]']]
  )
  assert.deepEqual(ownerTable([words('block-1.2'), ...claims]).disputes, [])
})

test('such a link is held by its own block, not by the other block whose field the kit names', () => {
  const reading = { slots: CONTENT_MAP.slots }
  const rows = [
    { id: 8, path: 'team' },
    { id: 7, path: 'about' }
  ]
  const doorOf = linkDoors({ kit: KIT, reading, rows, contentMap: CONTENT_MAP })
  assert.deepEqual(doorOf('block-1.link-1').keys, ['module-1.1'])
  assert.deepEqual(doorOf('block-2.link-1').keys, ['module-2.1'])
  assert.deepEqual(doorOf('block-3.link-1').keys, ['module-3.2'])
  assert.deepEqual(doorOf('block-4.link-1').keys, ['module-4.2'])
})

test('a button the plan says nothing of is claimed for hiding, words and address, and one it fills is left', () => {
  const plan = planOf([{ block: 'block-2' }, { block: 'block-1' }, { block: 'block-5' }])
  const { claims, twins } = buttonClaims({
    plan,
    kit: KIT,
    contentMap: CONTENT_MAP,
    claims: [words('block-1.2')],
    file: 'kit'
  })
  assert.equal(twins.size, 0)
  assert.deepEqual(
    claims.map((c) => [c.slot, c.kind, c.owner, c.button]),
    [
      ['block-2.2', 'hide', 'kit', 'block-2.2'],
      ['block-2.1', 'hide', 'kit', 'block-2.2']
    ]
  )
  assert.match(claims[0].why, /read more/)
})

test('a button whose link the plan decides, with no words for it, is not silence: nothing hides it', () => {
  const plan = planOf([
    { block: 'block-2', links: [{ link: 'block-2.link-1', leadsTo: 'page-a', labelSlot: null }] }
  ])
  assert.deepEqual(
    buttonClaims({ plan, kit: KIT, contentMap: CONTENT_MAP, claims: [], file: 'kit' }).claims,
    []
  )
})

const hideInput = (button) => {
  const plan = planOf([{ block: `block-${button}` }])
  const { claims } = buttonClaims({ plan, kit: KIT, contentMap: CONTENT_MAP, claims: [], file: 'kit' })
  return { plan, owners: ownerTable(claims).owners }
}

test('a silent button in HTML leaves through the row door, element and all', () => {
  const { plan, owners } = hideInput(2)
  const reading = { slots: CONTENT_MAP.slots }
  const order = hideOrders({
    plan,
    kit: KIT,
    owners,
    extras: {},
    reading,
    changes: {},
    cannotHide: null,
    rowsRemove: true
  })
  assert.deepEqual(order.removeSlots.sort(), ['module-2.1', 'module-2.2'])
  assert.deepEqual(order.noWayOut, [])
})

test('a silent button whose address no door takes stays whole and says so: never a button with no words', () => {
  const { plan, owners } = hideInput(4)
  const reading = {
    slots: CONTENT_MAP.slots.map((s) => (s.key === 'module-4.1' ? { ...s, canHide: 'unmeasured' } : s))
  }
  const order = hideOrders({
    plan,
    kit: KIT,
    owners,
    extras: {},
    reading,
    changes: {},
    cannotHide: null,
    rowsRemove: true
  })
  assert.deepEqual(order.emptySlots, [])
  assert.deepEqual(order.noWayOut.map((n) => n.slot).sort(), ['block-4.1', 'block-4.2'])
  assert.match(order.noWayOut[0].reason, /cannot leave whole/)
})

test('a silent button both of whose fields may be emptied goes, and a rerun reads it as already off the site', () => {
  const { plan, owners } = hideInput(4)
  const open = (current) => ({
    slots: CONTENT_MAP.slots.map((s) =>
      s.entity === 'module-4' ? { ...s, canHide: 'measured', current } : s
    )
  })
  const base = { plan, kit: KIT, owners, extras: {}, changes: {}, cannotHide: null, rowsRemove: true }
  assert.deepEqual(hideOrders({ ...base, reading: open('x') }).emptySlots.sort(), [
    'module-4.1',
    'module-4.2'
  ])
  const again = hideOrders({ ...base, reading: open('') })
  assert.deepEqual(again.emptySlots, [])
  assert.deepEqual(
    [...again.orders.values()].map((o) => o.via),
    ['empty', 'empty']
  )
  const removed = hideOrders({
    ...base,
    reading: { slots: [], removedSlots: { 'module-4.1': 'removed', 'module-4.2': 'removed' } }
  })
  assert.deepEqual(removed.removeSlots, [])
})

// The same through the entry point: the kit is the invented demo-gym's, and block-2 prints a button its plan may or may not speak of.
const E2E_MAP = {
  slots: [
    slot('module-1.1', LABEL, 'Join'),
    slot('module-2.50', LABEL, 'Join', { jsonPath: ['btn-title'] }),
    slot('module-2.51', URL, 'index.php?Itemid=8', { jsonPath: ['btn-link'] })
  ]
}
function e2eKit() {
  const kit = baseKit()
  const block = kit.doc.blocks.find((b) => b.id === 'block-2')
  block.source = { entity: 'module-2' }
  block.visibleAt = ['1440']
  block.links = [{ id: 'block-2.link-9', label: 'Join', target: '/join', position: 0 }]
  return kit
}
const e2eScript = (current) => ({
  extraKeys: ['module-2.50', 'module-2.51'],
  overSlot: (s) =>
    s.entity === 'module-2' && Number(s.key.split('.')[1]) >= 50
      ? { canHide: 'measured', current: current(s) }
      : {}
})
const e2eRun = (plan, script, last = null) =>
  runStep({ plan, copy: copy() }, script, { kit: e2eKit(), contentMap: E2E_MAP, last })
const held = (site) => site.applies().at(-1)?.params

test('through the write step a button with no plan word is emptied, words and address, and a rerun writes nothing for it', async () => {
  const plan = basePlan()
  const first = await e2eRun(
    plan,
    e2eScript(() => 'demo')
  )
  assert.equal(first.report.status, 'done', JSON.stringify(first.report.cause))
  const order = held(first.site)
  assert.deepEqual([...order.empty_slots].filter((k) => k.startsWith('module-2.5')).sort(), [
    'module-2.50',
    'module-2.51'
  ])
  assert.deepEqual(
    ['block-2.50', 'block-2.51'].map((s) => first.line(s)?.status),
    ['hidden', 'hidden']
  )
  assert.equal(
    first.report.unowned.some((u) => u.slot.startsWith('block-2.5')),
    false
  )
  const again = await e2eRun(
    plan,
    e2eScript(() => ''),
    first.report
  )
  assert.deepEqual(
    again.site
      .applies()
      .flatMap((a) => a.params.empty_slots ?? [])
      .filter((k) => k.startsWith('module-2.5')),
    []
  )
  assert.deepEqual(
    ['block-2.50', 'block-2.51'].map((s) => again.line(s)?.status),
    ['hidden', 'hidden']
  )
})

test('through the write step a plan label of the same button elsewhere writes this block too', async () => {
  const plan = basePlan()
  const decision = plan.pages.flatMap((p) => p.blocks).find((b) => b.block === 'block-2')
  decision.links = [{ link: 'block-2.link-9', leadsTo: 'page-about', labelSlot: 'block-1.1' }]
  const { report, line, site } = await e2eRun(
    plan,
    e2eScript(() => 'demo')
  )
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(line('block-2.50').status, 'written')
  assert.equal(line('block-2.50').ordered, line('block-1.1').ordered)
  assert.equal(site.applies().at(-1).params.changes?.['module-2.50'] !== undefined, true)
})

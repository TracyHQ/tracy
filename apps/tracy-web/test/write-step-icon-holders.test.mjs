// Icons drawn inside a slot of words that holds only them (JA Boxing's trainer cards: module-163.12 holds four
// `<a href="#">` social icons and nothing else) leave with that slot, whatever the plan said of each (icon-holders.js).
// Dev, BXR London 16/11/2026: 36 read-back and 13 unaddressable final-check blocks, every one a trainer's icon the plan
// sent to the business's profiles or hid alone, neither of which any door can do.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { hideOrders } from '../src/write-step/hide-plan.js'
import { linksOnly, withIconHoldersHidden } from '../src/write-step/icon-holders.js'

const dir = new URL(
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/',
  import.meta.url
)
const kit = JSON.parse(readFileSync(new URL('template-kit.json', dir), 'utf8'))
const contentMap = JSON.parse(readFileSync(new URL('content-map.json', dir), 'utf8'))
const card = (over = {}) => ({
  block: 'block-163',
  decision: 'keep',
  copy: [],
  links: [
    { link: 'block-163.link-3', leadsTo: 'social:fact-facebook' },
    { link: 'block-163.link-4', leadsTo: 'page-about-us_contact' }
  ],
  hiddenSlots: [{ slot: 'block-163.link-5', why: 'no Instagram of this trainer' }],
  ...over
})
const planOf = (decision) => ({
  sharedBlocks: [],
  pages: [{ id: 'page-home', decision: 'keep', blocks: [decision] }]
})

test('a slot of links only is told from a slot with words', () => {
  assert.equal(
    linksOnly(
      '((div class="list-social"))\n\t((a href="#"))((i class="fab fa-facebook"))((/i))((/a))\n((/div))'
    ),
    true
  )
  assert.equal(linksOnly('<a href="#"><i class="fab fa-x"></i></a>&nbsp;'), true)
  assert.equal(linksOnly('Call ((a href="tel:1"))us((/a))'), false)
  assert.equal(linksOnly('Head of Combat'), false)
})

test("every icon the plan decides in a slot of icons only is hidden, and the slot with them; the card's other decisions stay", () => {
  const value = planOf(card())
  const { plan, moved } = withIconHoldersHidden(value, { kit, contentMap })
  assert.deepEqual(moved, [
    {
      block: 'block-163',
      holder: 'block-163.12',
      links: ['block-163.link-3', 'block-163.link-4', 'block-163.link-5']
    }
  ])
  const got = plan.pages[0].blocks[0]
  assert.deepEqual(got.links, [])
  assert.deepEqual(
    got.hiddenSlots.map((h) => h.slot).sort(),
    ['block-163.12', 'block-163.link-3', 'block-163.link-4', 'block-163.link-5'].sort()
  )
  assert.equal(
    value.pages[0].blocks[0].links.length,
    2,
    'the plan read from the file is not changed in place'
  )
})

test('a holder the plan writes, a block with no such icon and a dropped page stay as the plan left them', () => {
  const writes = card({ copy: [{ slot: 'block-163.12', text: 'Coach' }] })
  assert.strictEqual(withIconHoldersHidden(planOf(writes), { kit, contentMap }).moved.length, 0)
  const other = { block: 'block-162', decision: 'keep', copy: [], links: [], hiddenSlots: [] }
  const value = planOf(other)
  assert.strictEqual(withIconHoldersHidden(value, { kit, contentMap }).plan, value)
  const dropped = { sharedBlocks: [], pages: [{ id: 'page-home', decision: 'drop', why: 'x' }] }
  assert.strictEqual(withIconHoldersHidden(dropped, { kit, contentMap }).plan, dropped)
  assert.strictEqual(withIconHoldersHidden(value, { kit, contentMap: null }).plan, value)
})

test('the hide stage empties the holder and carries its icons with it, where before each icon had no way out', () => {
  const holderKey = 'module-163.12'
  const reading = {
    slots: contentMap.slots.map((s) => (s.key === holderKey ? { ...s, current: s.sample, canHide: true } : s))
  }
  const owners = (plan) =>
    new Map(
      plan.pages[0].blocks[0].hiddenSlots.map((h) => [h.slot, { slot: h.slot, kind: 'hide', owner: 'plan' }])
    )
  const run = (plan) =>
    hideOrders({ plan, kit, owners: owners(plan), extras: {}, reading, changes: {}, cannotHide: null })
  const before = run(planOf(card({ links: [] })))
  assert.equal(before.orders.get('block-163.link-5').via, 'failed')
  const { plan } = withIconHoldersHidden(planOf(card()), { kit, contentMap })
  const after = run(plan)
  assert.equal(after.orders.get('block-163.12').via, 'slot')
  assert.ok(after.emptySlots.includes(holderKey))
  for (const link of ['block-163.link-3', 'block-163.link-4', 'block-163.link-5'])
    assert.deepEqual([after.orders.get(link).via, after.orders.get(link).key], ['carried', holderKey], link)
})

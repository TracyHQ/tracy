// What happens after approval to a block kept from general knowledge of the trade (#575, `basis: "trade"`): the page
// writer writes its block copy under its own no invention rules, and the write order shows a single block with that
// copy. A repeating trade block has no item of the business to carry its cards, so the write order hides it with its
// recorded reason (`list_below_min`): never a crash, never padded. The invented florist's build, scripted fakes only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-trade.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder } from '../domain/write-order-check.mjs'
import { floristBlockStore, floristPageRecipes } from './fixtures/write-order/florist-store.mjs'
import { floristBuild, floristComposition } from './fixtures/write-order/invented-florist.mjs'

const text = (name, kind, limit, extra = {}) => ({ name, kind, type: 'text', limit, ...extra })
const tradeBlocks = () => [
  {
    id: 'care-steps',
    name: 'How to care for your flowers',
    type: 'services',
    positions: ['body'],
    items: { min: 1, max: 3 },
    noData: { rule: 'hide' },
    itemsLabel: 'Steps',
    fields: [text('heading', 'editorial.heading', 40, { slot: 'module-90.1' })],
    itemFields: [
      text('step', 'editorial.paragraph', 120, { slots: ['module-90.10', 'module-90.11', 'module-90.12'] })
    ]
  },
  {
    id: 'what-to-ask',
    name: 'Before you order',
    type: 'text',
    positions: ['body'],
    items: { min: 1, max: 1 },
    noData: { rule: 'hide' },
    fields: [
      text('heading', 'editorial.heading', 40, { slot: 'module-91.1' }),
      text('body', 'editorial.paragraph', 300, { slot: 'module-91.2' })
    ]
  }
]
const store = () => {
  const s = floristBlockStore()
  s.blocks.push(...tradeBlocks())
  return s
}
const recipes = () => {
  const r = floristPageRecipes()
  const home = r.recipes.find((x) => x.pageType === 'home')
  home.blocks.splice(home.blocks.indexOf('gallery-strip'), 0, 'care-steps', 'what-to-ask')
  return r
}
const trade = (block, label, fact) => ({
  block,
  label,
  data: [],
  reason: 'Buyers know what to expect before they order.',
  basis: 'trade',
  factIds: [fact]
})
const composition = (services, photos) => {
  const c = floristComposition(services, photos)
  const home = c.pages[0].blocks
  home.splice(
    home.findIndex((b) => b.block === 'gallery-strip'),
    0,
    trade('care-steps', 'Flower care', services[0]),
    trade('what-to-ask', 'Before you order', services[0])
  )
  return c
}

const saved = await floristBuild({ blockStore: store(), pageRecipes: recipes(), composition })
const blockOf = (order, id) => order.pages.find((p) => p.id === 'home').blocks.find((b) => b.block === id)

test('the approved plan keeps both trade blocks, and the page writer writes their block copy', () => {
  const blocks = saved.approval.plan.pages[0].blocks.filter((b) => b.basis === 'trade')
  assert.deepEqual(
    blocks.map((b) => b.block),
    ['care-steps', 'what-to-ask']
  )
  const home = saved.writers.find((w) => w.page.id === 'home').page
  const written = home.fields.filter((f) => f.from === 'writer').map((f) => f.key)
  for (const b of blocks)
    assert.ok(
      written.some((key) => key.startsWith(`${b.id}/`)),
      b.id
    )
  // A repeating trade block has no item, so no card field is listed for the writer.
  const steps = blocks.find((b) => b.block === 'care-steps')
  assert.deepEqual(
    written.filter((key) => key.startsWith(`${steps.id}/`)),
    [`${steps.id}/heading`]
  )
})

test('the write order shows the single trade block and hides the repeating one with its reason', () => {
  const order = buildWriteOrder(structuredClone(saved))
  const single = blockOf(order, 'what-to-ask')
  assert.equal(single.state, 'show')
  assert.ok(single.fields.some((f) => typeof f.value === 'string' && f.value !== ''))
  const repeating = blockOf(order, 'care-steps')
  assert.deepEqual([repeating.state, repeating.reason], ['hidden', 'list_below_min'])
  assert.ok(order.hidden.some((h) => h.reason === 'list_below_min' && h.at === repeating.at))
  assert.deepEqual(checkWriteOrder(order), [])
})

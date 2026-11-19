// What happens after approval to a block kept from general knowledge of the trade (#575, `basis: "trade"`): the page
// writer writes its block copy under its own no invention rules, and the write order shows a single block with that
// copy. A repeating trade block has no item of the business, so code gives it as many cards as the block shows at most
// (`trade-cards.mjs`), the writer writes them from the trade (no terms: `trade_terms`), and the write order shows the
// block with its cards. The invented florist's build, scripted fakes only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-write-order-trade.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWriteOrder } from '../domain/write-order.mjs'
import { checkWriteOrder } from '../domain/write-order-check.mjs'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { writePages } from '../domain/page-writer.mjs'
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
      text('step', 'editorial.paragraph', 120, { slots: ['module-90.10', 'module-90.11', 'module-90.12'] }),
      // An icon on every card: the pictures and icons steps read the cards as the writer and the write order do.
      {
        name: 'icon',
        kind: 'editorial.item_icon',
        type: 'icon',
        storage: 'image-file',
        for: ['step'],
        slots: ['module-90.20', 'module-90.21', 'module-90.22'],
        frame: { width: 48, height: 48 }
      }
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
  // A repeating trade block gets its cards: as many as the block shows at most (`items.max`, 3), each card field written.
  const steps = blocks.find((b) => b.block === 'care-steps')
  assert.deepEqual(
    written.filter((key) => key.startsWith(`${steps.id}/`)),
    [
      `${steps.id}/heading`,
      `${steps.id}/trade-${steps.id}-1/step`,
      `${steps.id}/trade-${steps.id}-2/step`,
      `${steps.id}/trade-${steps.id}-3/step`
    ]
  )
})

test('the write order shows both trade blocks, the repeating one with its written cards', () => {
  const order = buildWriteOrder(structuredClone(saved))
  const single = blockOf(order, 'what-to-ask')
  assert.equal(single.state, 'show')
  assert.ok(single.fields.some((f) => typeof f.value === 'string' && f.value !== ''))
  const repeating = blockOf(order, 'care-steps')
  assert.equal(repeating.state, 'show')
  assert.equal(repeating.items.filter((i) => i.state === 'show').length, 3)
  for (const item of repeating.items)
    assert.ok(item.fields.some((f) => f.from === 'writer' && typeof f.value === 'string' && f.value !== ''))
  assert.ok(!order.hidden.some((h) => h.at === repeating.at))
  assert.deepEqual(checkWriteOrder(order), [])
})

test('the icons step reads the trade cards as the writer and the write order do: every card has its icon', () => {
  const steps = saved.approval.plan.pages[0].blocks.find((b) => b.block === 'care-steps')
  const cards = [1, 2, 3].map((n) => `trade-${steps.id}-${n}`)
  const iconed = saved.pictures.icons.map((i) => i.id)
  for (const card of cards)
    assert.ok(
      iconed.some((id) => id.includes(card)),
      card
    )
})

test('a trade card that states a term is sent back, and the writer request names the trade facts', async () => {
  const plan = saved.approval.plan
  const steps = plan.pages[0].blocks.find((b) => b.block === 'care-steps')
  const seen = []
  const CARE = ['Rinse each stem before arranging', 'Trim stems at an angle', 'Change the vase water often']
  const model = async (request) => {
    const user = JSON.parse(request.user)
    seen.push(user)
    const fields = {}
    for (const block of user.blocks)
      for (const field of block.fields) {
        const card = /\/trade-.*-(\d)\//.exec(field.key)
        fields[field.key] = card
          ? user.rewrite
            ? CARE[card[1] - 1]
            : 'Free care for 7 days'
          : `${field.name} kept fresh`.slice(0, field.limit)
      }
    return JSON.stringify({ fields })
  }
  await writePages({
    plan: { ...plan, pages: [plan.pages[0]] },
    profile: saved.approval.profile,
    blockStore: store(),
    library: TRACY_LIBRARY,
    model
  })
  const first = seen.find((u) => u.page.id === 'home' && !u.rewrite)
  const view = first.blocks.find((b) => b.id === steps.id)
  assert.equal(view.basis, 'trade')
  assert.deepEqual(
    view.cards,
    [1, 2, 3].map((n) => `trade-${steps.id}-${n}`)
  )
  assert.ok(view.facts.length > 0)
  const rewrite = seen.find((u) => u.page.id === 'home' && u.rewrite)
  assert.ok(rewrite.rewrite.every((f) => f.key.includes('/trade-')))
  assert.ok(rewrite.rewrite[0].problems.some((p) => /states no terms/.test(p)))
})

// The blocks of a page reached under its list page (ticket #597, `draft-write-under-blocks.mjs`). Such a page has no
// menu item: its modules are assigned to the list page's item and print on the list page too, except at a declared
// detail position. A block a recipe of the page type places (a variant included) never stops the whole plan: one
// record the list page shows anyway is written as placed; a record the list page does not show is not written on
// that page, with its typed reason in the plan; only a block no recipe of the page type places stops the plan. The
// invented florist on the real JA Boxing kit, with an invented recipe variant in a copy of the kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-under-blocks.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { checkUnderBlocks, recipeBlocksOf, UNDER_SKIP } from '../domain/draft-write-under-blocks.mjs'
import { sinkOf } from '../domain/draft-write-sink.mjs'
import { site } from './fixtures/draft-write/guarded.mjs'

// The masthead (one record, assigned to the pages whose recipe places it), at its own position, not a detail one.
const MASTHEAD = 'block-162'

/** A copy of the kit whose class recipe has a variant with the masthead, as a news post recipe has the breadcrumbs. */
function kitWithVariant(variant = true) {
  const aiq = structuredClone(site.aiq)
  const recipe = aiq.pageRecipes.recipes.find((r) => r.pageType === 'class')
  if (variant)
    recipe.variants = [...(recipe.variants ?? []), { blocks: [...recipe.blocks, MASTHEAD], pages: 1 }]
  return aiq
}

/** The order with the classes page's masthead copied onto the first class page (reached under the classes page). */
function orderWithMasthead({ onList = true } = {}) {
  const order = structuredClone(site.order)
  const list = order.pages.find((p) => p.id === 'classes')
  const page = order.pages.find((p) => p.id === 'class')
  const source = list.blocks.find((b) => b.block === MASTHEAD)
  const id = `${page.id}-b9`
  const from = `${list.id}.${source.id}`
  const moved = (x) =>
    JSON.parse(JSON.stringify(x).replaceAll(from, `${page.id}.${id}`).replaceAll(`"${source.id}"`, `"${id}"`))
  page.blocks.push({ ...moved(source), id, at: `${page.id}.${id}`, order: page.blocks.length })
  // Its hidden places and its pictures, as the order lists them for the source block.
  order.hidden = [...(order.hidden ?? []), ...order.hidden.filter((h) => h.at.startsWith(from)).map(moved)]
  order.pictures = [...order.pictures, ...order.pictures.filter((p) => p.frame.startsWith(from)).map(moved)]
  if (!onList) {
    source.state = 'hidden'
    order.hidden = [...(order.hidden ?? []), { at: source.at, reason: 'Left out for the test.' }]
  }
  return { order, id }
}
const outcome = (run) => {
  try {
    return { plan: run() }
  } catch (error) {
    return { code: error.code, details: error.details }
  }
}

test('a one-record block the list page shows anyway is written on the page under it, as placed', () => {
  const { order, id } = orderWithMasthead()
  const { plan, code } = outcome(() => writePlanOf(order, kitWithVariant(), { stored: site.stored }))
  assert.equal(code, undefined)
  assert.deepEqual(plan.underNotWritten, [])
  assert.ok(!plan.skipped.some((s) => s.entry.startsWith(`class.${id}.`) && s.reason === UNDER_SKIP))
})

test('a recipe block the list page does not show is not written there, with its typed reason; the plan goes on', () => {
  const { order, id } = orderWithMasthead({ onList: false })
  const { plan, code } = outcome(() => writePlanOf(order, kitWithVariant(), { stored: site.stored }))
  assert.equal(code, undefined)
  assert.deepEqual(
    plan.underNotWritten.map((r) => [r.page, r.block, r.storeBlock, r.list]),
    [['class', id, MASTHEAD, 'classes']]
  )
  assert.ok(plan.unproven.some((u) => u.code === 'under_page_block_not_written' && u.block === id))
  const skipped = plan.skipped.filter((s) => s.entry.startsWith(`class.${id}.`))
  assert.ok(skipped.length > 0)
  assert.ok(skipped.every((s) => s.reason === UNDER_SKIP))
})

test('a block no recipe of the page type places still stops the plan typed', () => {
  const { order } = orderWithMasthead()
  const { code, details } = outcome(() => writePlanOf(order, kitWithVariant(false), { stored: site.stored }))
  assert.equal(code, 'under_page_position_not_detail')
  assert.equal(details.storeBlock, MASTHEAD)
})

test('a news post under the news page: the breadcrumbs it shares are written, its main-bottom-1 copy is skipped', () => {
  // The kit's detail positions are detail-bottom-1 and main-bottom-2; the news post variant also places the
  // breadcrumbs (block-17, one record the news page places too) and block-158 at main-bottom-1, both printing on the
  // list page as well (measured, K6).
  const mapping = site.aiq.mapping
  const stateOf = () => ({
    kit: { mapping, recipeBlocks: recipeBlocksOf(site.aiq.pageRecipes) },
    sink: sinkOf(),
    dropped: new Set(),
    dropReasons: new Map(),
    underNotWritten: []
  })
  const block = (id, storeBlock, position) => ({
    id,
    block: storeBlock,
    state: 'show',
    source: 'template',
    position: { resolved: position }
  })
  const page = {
    id: 'news-post',
    pageType: 'news-post',
    blocks: [block('np-b1', 'block-17', 'breadcrumbs'), block('np-b2', 'block-158', 'main-bottom-1')]
  }
  const detail = mapping.pages['news-post'].under.detailPositions
  assert.deepEqual(detail.positions, ['detail-bottom-1', 'main-bottom-2'])
  const shown = stateOf()
  checkUnderBlocks(shown, page, { id: 'news', blocks: [{ block: 'block-17', state: 'show' }] }, detail)
  assert.deepEqual(
    shown.underNotWritten.map((r) => [r.storeBlock, r.position]),
    [['block-158', 'main-bottom-1']]
  )
  assert.equal(shown.dropReasons.get('np-b2'), UNDER_SKIP)
  // A list page that does not show the breadcrumbs: they would print there, so they are skipped too.
  const bare = stateOf()
  checkUnderBlocks(bare, page, { id: 'news', blocks: [] }, detail)
  assert.deepEqual(
    bare.underNotWritten.map((r) => r.storeBlock),
    ['block-17', 'block-158']
  )
})

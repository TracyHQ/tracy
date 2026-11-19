// A held block placed without its kit container (#575, live: a plans page with block-167 and no block-184): the write
// plan stopped the whole build with `held_block_without_container`. The build's plan step brings the container along.
// The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-held-containers.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { withHeldContainers } from '../domain/plan-held-containers.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const withoutContainer = (plan) => ({
  pages: plan.pages.map((p) => ({ ...p, blocks: p.blocks.filter((b) => b.block !== 'block-184') }))
})

test('an order made before the repair: the held blocks are left out and listed, the build goes on', async () => {
  const s = await boxingSite({ extend: withoutContainer })
  const plan = writePlanOf(s.order, s.aiq, { stored: s.stored })
  assert.ok(plan.skipped.some((x) => x.reason === 'held_block_without_container'))
  assert.ok(!plan.ops.some((op) => op.key === 'copy:plans.plans-b4'))
  assert.ok(plan.ops.some((op) => op.key === 'menuItem:mainmenu:plans'))
})

test('the build brings the container along, before the first block it holds, and the write plan copies it', async () => {
  let added = []
  const s = await boxingSite({
    extend: (plan, kit) => {
      const held = withHeldContainers(withoutContainer(plan), kit.mapping)
      added = held.added
      return held.plan
    }
  })
  assert.deepEqual(
    added.map((a) => [a.page, a.block, a.held.length]),
    [['plans', 'block-184', 2]]
  )
  const blocks = s.order.pages.find((p) => p.id === 'plans').blocks.map((b) => b.block)
  assert.ok(blocks.indexOf('block-184') < blocks.indexOf('block-167'))
  const plan = writePlanOf(s.order, s.aiq, { stored: s.stored })
  assert.ok(plan.ops.some((op) => op.key === 'copy:plans.plans-holder-block-184'))
})

test('a plan that places the container, or no held block, is returned as it is', () => {
  const mapping = { placements: { zqbox: { holds: { blocks: ['zqtab'] } } } }
  const kept = {
    pages: [
      {
        id: 'zq',
        blocks: [
          { id: 'zq-b1', block: 'zqbox' },
          { id: 'zq-b2', block: 'zqtab' }
        ]
      }
    ]
  }
  assert.equal(withHeldContainers(kept, mapping).plan, kept)
  const none = { pages: [{ id: 'zq', blocks: [{ id: 'zq-b1', block: 'zqother' }] }] }
  assert.equal(withHeldContainers(none, mapping).plan, none)
})

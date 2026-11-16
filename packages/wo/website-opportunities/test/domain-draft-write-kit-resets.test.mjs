// A setting every copy takes as the kit fixes it (#587): a placement reset `{location, from: "kit", value}`. JA Boxing
// lists the class cards of the home page (module 160) and of a class page (module 159) by publish date, newest first,
// as the class list page does, so one list of records reads in one order: the plan's. The invented florist on the
// JA Boxing kit.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-kit-resets.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { plan, site } from './fixtures/draft-write/guarded.mjs'

const valuesAt = (p, entity, key) =>
  p.ops
    .filter((op) => op.kind === 'module.copy' && op.values?.some((v) => v.loc.entity === entity))
    .flatMap((op) => op.values.filter((v) => v.loc.entity === entity && v.loc.jsonPath?.[0] === key))

test('every copy of the home class cards takes the order the kit fixes: publish date, newest first', () => {
  const [order] = valuesAt(plan, 'module-160', 'article_ordering')
  const [direction] = valuesAt(plan, 'module-160', 'article_ordering_direction')
  assert.deepEqual([order?.value, order?.rule], ['publish_up', 'resets.kit'])
  assert.deepEqual([direction?.value, direction?.rule], ['DESC', 'resets.kit'])
})

test('the class cards follow the plan order, the one the write dates the records in', () => {
  const follows = Object.fromEntries(plan.itemOrders.map((o) => [o.block, o.follows]))
  assert.equal(follows['block-160'], 'plan')
  assert.equal(follows['class-list'], 'plan')
})

test('a reset whose source the write does not know stops the plan, typed', () => {
  const aiq = structuredClone(site.aiq)
  aiq.mapping.placements['block-160'].resets[2].from = 'guess'
  assert.throws(
    () => writePlanOf(site.order, aiq, { stored: site.stored }),
    (e) => e.code === 'reset_from_unknown' && e.details.from === 'guess'
  )
})

// No picture is written with an empty or root-only address (#597, gate run 7). A text logo left the footer logo module
// (block-170, an image only, on every page) with the blank site's empty `src`, printed as `<img src="">`. The block
// declares `noData.rule: "hide"`, so the plan does not assign the module to any page and says so; and a picture whose
// uploaded address names no file stops the write typed before it is written anywhere. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-empty-picture.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import {
  blankSite,
  florist,
  floristPlan,
  modulesOfPage,
  openStored,
  pageItemsOf,
  planOf
} from './draft-write-fixtures.mjs'

test('a text logo: the footer logo module hides by its block rule and is assigned to no page', async () => {
  assert.deepEqual(floristPlan.emptyPictures, [
    { record: 'store:module-170', block: 'block-170', slots: ['module-170.1'], rule: 'hide' }
  ])
  assert.ok(!floristPlan.ops.some((op) => op.key === 'assign:store:module-170'))
  assert.ok(floristPlan.unproven.some((u) => u.code === 'picture_place_empty_hidden'))
  const memory = blankSite()
  await runDraftWrite({ plan: floristPlan, doors: memory.doors, record: {}, openStored })
  const home = pageItemsOf(memory).home
  assert.ok(!modulesOfPage(memory, home.id).some((m) => m.id === 170))
})

test('with a logo picture the footer logo module is written and shown', () => {
  const order = structuredClone(florist.order)
  order.look.logo = { kind: 'own' }
  const plan = planOf(order)
  assert.deepEqual(plan.emptyPictures, [])
  assert.ok(plan.ops.some((op) => op.key === 'assign:store:module-170'))
})

test('a picture whose address names no file (the site root) stops the write typed, before it is written', async () => {
  const picture = floristPlan.ops.find((op) => op.kind === 'picture.upload' && !op.slotFit)
  // A run record that holds the root as the picture's uploaded address, as a door answering `/` would leave it.
  const record = { state: { ids: {}, paths: { [picture.key]: '/' }, pending: {}, done: [] } }
  const memory = blankSite()
  await assert.rejects(
    runDraftWrite({ plan: floristPlan, doors: memory.doors, record, openStored }),
    (error) => {
      assert.equal(error.code, 'redo_failed')
      assert.equal(error.details.cause, 'picture_address_empty')
      assert.equal(error.details.ref, picture.key)
      return true
    }
  )
  const sent = [...memory.site.slots.values()].filter((s) => s.current === '/')
  assert.deepEqual(sent, [])
})

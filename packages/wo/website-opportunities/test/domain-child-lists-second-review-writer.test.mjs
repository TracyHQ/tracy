// Child list rows, second review findings on the writer and coverage side (ticket #615): a place emptied by a cut row
// carries the cut's reason, a field the planned row holds a value for must take exactly that value, and a row field
// naming the network of its link (`textOf: "network"`) is data, never copy. The JA Boxing block store read for its
// declaration, the invented pottery template and a scripted fake writer; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-second-review-writer.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePages } from '../domain/page-writer.mjs'
import { blocksOf } from '../domain/picture-step.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { declaredRowFieldsOf, rowFieldAccountOf } from '../domain/plan-row-coverage.mjs'
import { networkNameOf, rowNetworkNameOf } from '../domain/row-network-text.mjs'
import { boxingPlan, boxingStore } from './fixtures/child-lists/boxing-plan.mjs'
import { composeInputs, ODILE, potteryStore } from './fixtures/child-lists/invented-pottery.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

test('a place emptied by a row cut for room carries that reason; a planned value must be written as it is', async () => {
  const store = boxingStore()
  const { plan, profile, data, dropped } = boxingPlan(store)
  const copy = await writePages({
    plan,
    profile,
    blockStore: store,
    model: scriptedWriter(() => 'Calm practice')
  })
  const declared = declaredRowFieldsOf(plan.pages, blocksOf(store), data, dropped)
  const account = rowFieldAccountOf(declared, copy)
  assert.deepEqual(account.unexplained, [])
  const cut = declared.filter((d) => d.cut === 'row_beyond_stored_places')
  assert.ok(cut.length > 0)
  for (const d of cut) assert.equal(account.byId.get(d.id).reason, 'row_beyond_stored_places')
  // The days of a planned session turned into a hidden field, or into the writer's words, are unexplained.
  const days = (c) =>
    c.pages
      .flatMap((p) => p.fields)
      .find((f) => f.row === 'calendar.1' && f.field === 'days' && f.from === 'data')
  const hidden = structuredClone(copy)
  Object.assign(days(hidden), { from: 'no-data', action: 'hide', value: undefined })
  const written = structuredClone(copy)
  Object.assign(days(written), { from: 'writer', value: 'Day 9' })
  for (const changed of [hidden, written])
    assert.equal(rowFieldAccountOf(declared, changed).unexplained.length, 1)
})

/** The pottery template with a label beside each profile link that names the link's network. */
function labelledStore() {
  const store = potteryStore()
  const links = store.blocks.find((b) => b.id === 'team-cards').itemLists[0]
  const slots = [1, 2, 3, 4].map((p) => [1, 2].map((r) => `team-cards.item${p}.link-label-${r}`))
  links.fields.push({
    name: 'label',
    kind: 'editorial.heading',
    type: 'text',
    limit: 20,
    textOf: 'network',
    slots
  })
  return store
}

test('a row field naming the network of its link is data from the link, never sent to the model', async () => {
  const store = labelledStore()
  const { plan, profile } = await composePlan({ ...composeInputs(), blockStore: store })
  const model = scriptedWriter(() => 'Calm practice')
  const copy = await writePages({ plan, profile, blockStore: store, model })
  const labels = copy.pages.flatMap((p) => p.fields).filter((f) => f.item === ODILE && f.field === 'label')
  assert.deepEqual(
    labels.map((f) => [f.from, f.value]),
    [
      ['data', 'Instagram'],
      ['data', 'YouTube']
    ]
  )
  const asked = model.calls.flatMap((c) =>
    JSON.parse(c.user).blocks.flatMap((b) => b.fields.map((f) => f.key))
  )
  assert.ok(asked.length > 0)
  assert.ok(!asked.some((key) => key.endsWith('/label')))
  const declared = declaredRowFieldsOf(plan.pages, blocksOf(store), planDataOf(profile))
  assert.deepEqual(rowFieldAccountOf(declared, copy).unexplained, [])
})

test('the network name follows the icon step: none for a link it cannot place on a network', () => {
  assert.equal(networkNameOf('https://youtube.com/@invented'), 'YouTube')
  assert.equal(networkNameOf('https://bit.ly/invented'), null)
  assert.equal(networkNameOf('https://example.com/invented'), null)
  const fields = [{ name: 'link', kind: 'person.social_url', type: 'link' }]
  assert.equal(rowNetworkNameOf(fields, { 'person.social_url': ['https://tiktok.com/@invented'] }), 'TikTok')
  assert.equal(rowNetworkNameOf(fields, {}), null)
})

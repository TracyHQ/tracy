// Child list rows, review findings on the writer side and Contract B (ticket #615): a row's copy never carries another
// row's data, a data value too long for its field never reaches the writer, every field is written within the smallest
// limit of the stored places it shares, and the plan's lists are held to their shape. An invented pottery studio and a
// scripted fake writer; no real model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-child-lists-review-writer.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { writePages } from '../domain/page-writer.mjs'
import { pageFieldsOf } from '../domain/page-writer-fields.mjs'
import { placeLimitsOf } from '../domain/field-place-limits.mjs'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import {
  composeInputs,
  HAND,
  pottery,
  potteryStore,
  WHEEL
} from './fixtures/child-lists/invented-pottery.mjs'
import { scriptedWriter } from './fixtures/icon-fields/invented-yoga.mjs'

const TIP = (grid) => `${grid}/${WHEEL}/steps.1.tips.1/tip`

test('a row copy field that carries another row data is sent back once, then fails the copy check', async () => {
  const { plan, profile } = await composePlan(composeInputs())
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid').id
  // The tip of the first step names the times of the second session: data of another row.
  const model = scriptedWriter((key) => (key === TIP(grid) ? 'Sat 10:00 to 12:00' : 'Calm practice'))
  await assert.rejects(writePages({ plan, profile, blockStore: potteryStore(), model }), (error) => {
    assert.equal(error.code, 'copy_check_failed')
    const tip = error.details.failing.find((f) => f.key === TIP(grid))
    assert.ok(tip.problems.some((p) => p.code === 'other_row_data'))
    return true
  })
  // Words of its own row are fine.
  const own = scriptedWriter((key) => (key === TIP(grid) ? 'Wedge the clay first' : 'Calm practice'))
  const copy = await writePages({ plan, profile, blockStore: potteryStore(), model: own })
  assert.equal(copy.pages[0].fields.find((f) => f.key === TIP(grid)).value, 'Wedge the clay first')
})

test('a row value too long for its field is left out by the plan, so the writer never stops on it', async () => {
  const { research, reading } = pottery()
  research.sources[0].text += ' Thu, 18:00 to 20:30 with a long cooldown.'
  reading.items[1].rows = [
    {
      fields: { 'offering.schedule': ['Thu', '18:00 to 20:30 with a long cooldown'] },
      evidence: 'Thu, 18:00 to 20:30 with a long cooldown'
    }
  ]
  const profile = needsProfileOf(research, reading)
  const { plan } = await composePlan(composeInputs(profile))
  const copy = await writePages({
    plan,
    profile,
    blockStore: potteryStore(),
    model: scriptedWriter(() => 'Calm')
  })
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid').id
  // The plan holds no session row for Hand building, so its session places stay empty (no writer entry at all).
  assert.deepEqual(
    plan.pages[0].blocks
      .find((b) => b.id === grid)
      .lists.find((l) => l.item === HAND && l.name === 'sessions').rows,
    []
  )
  assert.deepEqual(
    copy.pages[0].fields.filter((f) => f.item === HAND && f.list === 'sessions'),
    []
  )
})

test('block and item fields are written within the smallest limit of a stored place they share, by place', async () => {
  const store = potteryStore()
  const grid = store.blocks.find((b) => b.id === 'services-grid')
  const name = grid.itemFields.find((f) => f.type === 'text')
  // An invented second block writing the same stored places as the card names, with a smaller limit.
  const places = Array.isArray(name.slots) ? name.slots : [name.slot]
  store.blocks.push({
    ...structuredClone(grid),
    id: 'services-mini',
    itemFields: [{ ...name, limit: 12, slots: places }],
    itemLists: undefined
  })
  const limits = placeLimitsOf(store.blocks)
  const { plan, profile } = await composePlan(composeInputs())
  const blocks = new Map(store.blocks.map((b) => [b.id, b]))
  const data = planDataOf(profile)
  const fields = pageFieldsOf(plan.pages[0], { blocks, byId: data.byId, data, placeLimits: limits })
  const card = fields.find((f) => f.item === WHEEL && f.field.name === name.name)
  assert.equal(card.field.limit, Math.min(12, name.limit))
  // Two lists of one block with fields of the same name keep their own limits: places, not names, are shared.
  const steps = fields.find((f) => f.row === 'steps.1' && f.field.name === 'step')
  assert.equal(steps.field.limit, 24)
})

test('Contract B: a list name is length limited and a list item names an item, never a fact', async () => {
  const { plan } = await composePlan(composeInputs())
  const grid = plan.pages[0].blocks.find((b) => b.block === 'services-grid')
  const messages = (p) => checkBuildDocument(p).problems.map((x) => `${x.at}: ${x.message}`)
  const long = structuredClone(plan)
  long.pages[0].blocks.find((b) => b.id === grid.id).lists[0].name = 'x'.repeat(65)
  assert.match(messages(long).join('\n'), /lists\[0\]\.name: at most 64 characters/)
  const fact = structuredClone(plan)
  const block = fact.pages[0].blocks.find((b) => b.id === grid.id)
  block.data.push('contact-phone')
  block.lists[0].item = 'contact-phone'
  assert.match(messages(fact).join('\n'), /lists\[0\]\.item: "contact-phone" is not an item of the plan/)
})

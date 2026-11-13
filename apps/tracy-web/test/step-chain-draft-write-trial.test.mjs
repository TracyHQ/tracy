// The Write step's value for a local trial run (#597): done or failed, the value carries the write order and the write
// plan beside the report, and `keepTrial` receives `{order, plan, report}` (the built site check's `--write-result`);
// what the engine stores of the step (`recordedValue`) never holds them. And a contract apply is read back whole: a
// neighbour slot of the record column it writes that changed on the site stops the write. Invented florist data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-write-trial.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordedValue } from '../src/sites/brief-engines/step-chain-record.js'
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { blankSite, florist, floristPlan, openStored, runOn } from './draft-write-fixtures.mjs'

const inputs = () => ({
  kit: { aiq: florist.aiq },
  plan: { profile: florist.build.approval.profile, plan: florist.build.approval.plan },
  order: { order: structuredClone(florist.order) }
})
function wiringOf(memory, kept) {
  return {
    doors: async () => memory.doors,
    record: async () => ({}),
    stored: async () => florist.stored,
    openStored: (id) => openStored(id),
    blankContract: () => florist.kit.blankContract,
    keepTrial: async (trial) => kept.push(trial)
  }
}
const write = (memory, kept) => createDraftSteps({ draftWrite: wiringOf(memory, kept) }).write
/** A word of the customer's copy the order holds: the stored record must never show it. */
const customerWord = () =>
  florist.order.pages
    .flatMap((p) => p.blocks)
    .flatMap((b) => b.fields ?? [])
    .find((f) => f.type === 'text' && typeof f.value === 'string' && f.value.length > 12).value

test('a done write carries its order and plan; keepTrial gets them; the record keeps neither', async () => {
  const kept = []
  const answer = await write(blankSite(), kept)({ runId: 't1' }, inputs())
  const { value } = answer
  assert.equal(value.report.status, 'done')
  assert.equal(value.order.schema, florist.order.schema)
  assert.equal(value.plan.ops.length, floristPlan.ops.length)
  assert.equal(kept.length, 1)
  assert.deepEqual(Object.keys(kept[0]).sort(), ['order', 'plan', 'report'])
  assert.equal(kept[0].plan, value.plan)
  const stored = JSON.stringify(recordedValue(value))
  assert.ok(!stored.includes(customerWord()))
  assert.ok(!('plan' in recordedValue(value)) && !('order' in recordedValue(value)))
})

test('a failed write carries its order, its plan and the report on error.value; the record keeps none of them', async () => {
  const kept = []
  const error = await write(blankSite({ fail: [30, 31] }), kept)({ runId: 't2' }, inputs()).then(
    () => assert.fail('the step passed'),
    (e) => e
  )
  assert.equal(error.code, 'redo_failed')
  assert.equal(error.value.report.status, 'failed')
  assert.equal(error.value.plan.ops.length, floristPlan.ops.length)
  assert.equal(error.value.order.schema, florist.order.schema)
  assert.equal(kept.length, 1)
  assert.equal(kept[0].report.status, 'failed')
  const stored = recordedValue(error.value)
  assert.deepEqual(Object.keys(stored), ['report'])
  assert.ok(!JSON.stringify(stored).includes(customerWord()))
})

test('a plan the guards refuse: error.value names the order, no plan, no report; nothing is recorded', async () => {
  const kept = []
  const held = inputs()
  held.plan.profile = { ...held.plan.profile, withheld: { names: ['Larkspur Blooms'] } }
  const error = await write(blankSite(), kept)({ runId: 't3' }, held).then(
    () => assert.fail('the step passed'),
    (e) => e
  )
  assert.equal(error.code, 'held_text_in_value')
  assert.equal(error.value.plan, null)
  assert.equal(error.value.report, null)
  assert.ok(error.value.order)
  assert.equal(recordedValue(error.value), null)
  assert.equal(kept.length, 1)
})

test('a contract apply is read back whole: a neighbour slot the apply changed stops the write', async () => {
  // A plan whose contract apply leaves one slot of its column unwritten: that slot is a neighbour it must not move.
  const plan = structuredClone(floristPlan)
  const contract = plan.ops.find((op) => op.kind === 'contract.apply' && op.values.length > 2)
  const left = contract.values.findLast((v) => v.loc.column !== 'title')
  contract.values = contract.values.filter((v) => v !== left)
  const neighbour = left.loc.slot
  assert.ok(contract.whole.includes(neighbour))
  const memory = blankSite()
  const apply = memory.doors.contract
  memory.doors.contract = async (input) => {
    const out = await apply(input)
    if (input.applyId.includes(contract.key)) memory.site.slots.get(neighbour).current += ' changed'
    return out
  }
  const error = await runOn(memory, { plan }).then(
    () => assert.fail('the write passed'),
    (e) => e
  )
  assert.equal(error.code, 'read_back_mismatch')
  assert.equal(error.details.what, 'untouched slot')
  assert.equal(error.details.slot, neighbour)
  // Untampered, the same plan runs to its end.
  assert.equal((await runOn(blankSite(), { plan })).status, 'done')
})

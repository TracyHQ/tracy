// The Write step of a draft run (#597, `step-chain-draft-write-step.js`) as the draft steps call it: with no site doors
// wired it stops at once, typed `write_not_ready_for_draft`; with doors it writes the write order of the order step and
// returns a report `done`; a guard that fails stops it before any door call; a door that fails twice stops it with the
// report of what ran; the run record kept between the frame's attempts lets the second attempt resume.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-write.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { blankSite, florist, floristPlan, openStored, snapshotOf } from './draft-write-fixtures.mjs'

const inputs = () => ({
  kit: { aiq: florist.aiq },
  plan: { profile: florist.build.approval.profile, plan: florist.build.approval.plan },
  order: { order: structuredClone(florist.order) }
})
/** The wiring the server injects, here over a memory site; `record` is kept between the frame's attempts. */
function wiringOf(memory, record = {}) {
  return {
    doors: async () => memory.doors,
    record: async () => record,
    stored: async () => florist.stored,
    openStored: (id) => openStored(id),
    blankContract: () => florist.kit.blankContract
  }
}
const writeOf = (draftWrite) => createDraftSteps({ draftWrite }).write
const failure = (promise) =>
  promise.then(
    () => assert.fail('the step passed'),
    (e) => e
  )

test('with no site doors wired the step stops at once, typed, noRerun', async () => {
  const error = await failure(writeOf(undefined)({ runId: 'r1' }, inputs()))
  assert.equal(error.code, 'write_not_ready_for_draft')
  assert.equal(error.noRerun, true)
  const partial = await failure(writeOf({ record: async () => ({}) })({ runId: 'r1' }, inputs()))
  assert.equal(partial.code, 'write_not_ready_for_draft')
})

test('with doors the step writes the order and its report is done', async () => {
  const memory = blankSite()
  const answer = await writeOf(wiringOf(memory))({ runId: 'r2' }, inputs())
  assert.equal(answer.value.report.status, 'done')
  assert.equal(answer.value.recorded.ops, floristPlan.ops.length)
  assert.equal(answer.value.recorded.ran, floristPlan.ops.length)
  assert.equal(answer.usd, 0)
  const clean = blankSite()
  await writeOf(wiringOf(clean))({ runId: 'r2' }, inputs())
  assert.deepEqual(snapshotOf(memory), snapshotOf(clean))
})

test('a guard that fails stops the step before any door call', async () => {
  const memory = blankSite()
  const held = inputs()
  held.plan.profile = { ...held.plan.profile, withheld: { names: ['Larkspur Blooms'] } }
  const error = await failure(writeOf(wiringOf(memory))({ runId: 'r3' }, held))
  assert.equal(error.code, 'held_text_in_value')
  assert.equal(error.noRerun, true)
  assert.equal(memory.calls, 0)
  const unapproved = inputs()
  unapproved.plan.plan = structuredClone(unapproved.plan.plan)
  unapproved.plan.plan.pages[0].blocks.splice(3, 1)
  assert.equal(
    (await failure(writeOf(wiringOf(memory))({ runId: 'r3' }, unapproved))).code,
    'block_not_approved'
  )
  assert.equal(memory.calls, 0)
})

test('a door that fails twice stops the step with the report of what ran; a later run with the same record resumes', async () => {
  const memory = blankSite({ fail: [30, 31] })
  const record = {}
  const step = writeOf(wiringOf(memory, record))
  const error = await failure(step({ runId: 'r4' }, inputs()))
  assert.equal(error.code, 'redo_failed')
  assert.equal(error.value.report.status, 'failed')
  const ran = error.value.report.ran.length
  assert.ok(ran > 0 && ran < floristPlan.ops.length)
  const again = await step({ runId: 'r4' }, inputs())
  assert.equal(again.value.report.status, 'done')
  const clean = blankSite()
  await writeOf(wiringOf(clean))({ runId: 'r4' }, inputs())
  assert.deepEqual(snapshotOf(memory), snapshotOf(clean))
})

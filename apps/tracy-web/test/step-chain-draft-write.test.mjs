// The Write step of a draft run (#597, `step-chain-draft-write-step.js`) as the draft steps call it: with no site doors
// wired it stops at once, typed `write_not_ready_for_draft`; with doors it writes the write order of the order step and
// returns a report `done`; a guard that fails stops it before any door call; a door that fails twice stops it with the
// report of what ran; the run record kept between the frame's attempts lets the second attempt resume.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-write.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
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
/** The alias of the florist plan's default menu item. */
const floristHomeAlias = () =>
  floristPlan.ops.find((op) => op.kind === 'menuItem.create' && op.fields?.home === 1)?.fields?.alias

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
  // The conflicts in the recorded summary: their count and entry ids, never the words.
  const lost = [...new Set(floristPlan.conflicts.map((c) => c.entry))]
  assert.deepEqual(answer.value.recorded.conflicts, { count: lost.length, entries: lost })
  assert.ok(lost.length > 0)
  assert.equal(answer.usd, 0)
  const clean = blankSite()
  await writeOf(wiringOf(clean))({ runId: 'r2' }, inputs())
  assert.deepEqual(snapshotOf(memory), snapshotOf(clean))
})

test('a value a guard refuses is left out and listed; a problem of the whole plan stops before any door call', async () => {
  // A held name: every value and record holding it is left out (#575), the rest is written, and nothing shows it.
  const memory = blankSite()
  const held = inputs()
  held.plan.profile = { ...held.plan.profile, withheld: { names: ['Larkspur Blooms'] } }
  const done = await writeOf(wiringOf(memory))({ runId: 'r3' }, held)
  assert.equal(done.value.report.status, 'done')
  const skipped = done.value.recorded.skippedItems
  assert.ok(skipped.some((s) => s.code === 'held_text_in_value' && s.at === 'plan'))
  assert.ok(!JSON.stringify(snapshotOf(memory)).includes('Larkspur Blooms'))
  assert.ok(!JSON.stringify(skipped).includes('Larkspur'))
  const untouched = blankSite()
  const unapproved = inputs()
  unapproved.plan.plan = structuredClone(unapproved.plan.plan)
  unapproved.plan.plan.pages[0].blocks.splice(3, 1)
  const error = await failure(writeOf(wiringOf(untouched))({ runId: 'r3' }, unapproved))
  assert.equal(error.code, 'block_not_approved')
  assert.equal(error.noRerun, true)
  assert.equal(untouched.calls, 0)
})

test('an operation the doors fail on twice is left out and listed, the rest is written; a later run writes it', async () => {
  const memory = blankSite({ fail: [30, 31] })
  const record = {}
  const step = writeOf(wiringOf(memory, record))
  const first = await step({ runId: 'r4' }, inputs())
  assert.equal(first.value.report.status, 'done')
  const failed = first.value.recorded.skippedItems
  // The copy the doors failed on, and its assignment, which names the copy: both listed, nothing else lost.
  assert.deepEqual(
    failed.map((f) => [f.code, f.at]),
    [
      ['redo_failed', 'door'],
      ['redo_failed', 'door']
    ]
  )
  assert.equal(first.value.report.ran.length, floristPlan.ops.length - failed.length)
  const again = await step({ runId: 'r4' }, inputs())
  assert.equal(again.value.report.status, 'done')
  assert.deepEqual(again.value.recorded.skippedItems, [])
  assert.equal(again.value.report.ran.length, floristPlan.ops.length)
})

test('the default menu item failing at the door moves to the next page of the main menu: a site never has none', async () => {
  const memory = blankSite()
  const update = memory.doors.update
  memory.doors.update = async (input) => {
    if (input.kind === 'menuItem' && input.fields?.home === 1 && input.fields?.alias === floristHomeAlias())
      throw Object.assign(new Error('refused'), { code: 'scripted_refusal' })
    return update(input)
  }
  const done = await writeOf(wiringOf(memory))({ runId: 'r10' }, inputs())
  const moved = done.value.recorded.skippedItems.find((s) => s.code === 'default_page_moved')
  assert.ok(moved, JSON.stringify(done.value.recorded.skippedItems))
  const homes = [...memory.site.records.menuItem.values()].filter((r) => Number(r.home) === 1)
  assert.equal(homes.length, 1)
})

test('a run whose doors write no page at all stops typed: no site is no site', async () => {
  const memory = blankSite()
  const pages = memory.doors.update
  memory.doors.update = async (input) => {
    if (input.kind === 'menuItem') throw Object.assign(new Error('refused'), { code: 'scripted_refusal' })
    return pages(input)
  }
  const error = await failure(writeOf(wiringOf(memory))({ runId: 'r9' }, inputs()))
  assert.equal(error.code, 'no_page_written')
  assert.equal(error.value.report.status, 'failed')
})

test('an icon picture of the order must be a name of the icon library the icons step chose from', async () => {
  const memory = blankSite()
  const iconic = inputs()
  const icon = iconic.order.order.icons.find((i) => i.storage === 'image-file')
  Object.assign(icon, { source: 'library', icon: { name: 'flower-unknown' } })
  const library = () => ({ set: 'invented', icons: [{ name: 'flower-rose' }] })
  const write = createDraftSteps({ draftWrite: wiringOf(memory), iconLibrary: library }).write
  assert.equal((await failure(write({ runId: 'r5' }, iconic))).code, 'icon_not_in_list')
  assert.equal((await failure(writeOf(wiringOf(memory))({ runId: 'r5' }, iconic))).code, 'icon_not_in_list')
  assert.equal(memory.calls, 0)
})

test('a step with no write order, an operation of no known kind, a reference to no site id: typed stops', async () => {
  const none = inputs()
  none.order = {}
  assert.equal(
    (await failure(writeOf(wiringOf(blankSite()))({ runId: 'r6' }, none))).code,
    'write_order_missing'
  )
  const memory = blankSite()
  const run = (ops) =>
    runDraftWrite({ plan: { ...floristPlan, ops }, doors: memory.doors, record: {}, openStored })
  assert.equal((await failure(run([{ key: 'x', kind: 'menu.reorder', entries: [] }]))).code, 'op_unknown')
  const assignOp = {
    key: 'a',
    kind: 'module.assign',
    record: 'copy:none',
    sourceId: 1,
    menuids: [{ ref: 'page:none', form: 'id' }]
  }
  // A typed stop inside an operation is not redone: the write stops at once, its code kept as the cause.
  const unresolved = await failure(run([assignOp]))
  assert.equal(unresolved.code, 'redo_failed')
  assert.equal(unresolved.details.cause, 'ref_unresolved')
  assert.equal(memory.calls, 0)
})

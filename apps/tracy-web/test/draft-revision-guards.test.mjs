// The engine rules a revision run keeps (#599): the run record of one plan is never resumed by another
// (`write_record_stale`); a build that cannot be revised stops typed before any model call; a failing door is redone
// once, then the run stops typed with its report and resumes to the same site; a held name is gone from every place
// of the site after the revision. Apply ids and the frame: `draft-revision-frame.test.mjs`.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-guards.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { namesHeldInAnyForm } from 'website-opportunities/domain/plan-withheld.mjs'
import { runDraftWrite } from '../src/step-chain-draft-write.js'
import { runRevisionWrite } from '../src/step-chain-draft-write-revision.js'
import { HELD_PERSON, revisedBy, SITE_NAME } from './draft-revision-edits.mjs'
import { blankSite } from './draft-revision-fixtures.mjs'
import { firstBuild, freshBuild, leakOf, revisionRun, sameSite } from './draft-revision-run.mjs'
import { snapshotOf } from './draft-write-fixtures.mjs'

const storedOf = (order) =>
  Object.fromEntries(
    [...order.pictures.map((p) => p.frame), ...order.icons.map((i) => i.id)].map((id) => [
      id,
      { id: `stored-${id}` }
    ])
  )

test('the previous build record never runs another plan; a revision record never runs another revision', async () => {
  const first = await firstBuild()
  const partial = await revisionRun(first, revisedBy('rename a service'))
  const order = partial.run.order.order
  const plan = writePlanOf(order, partial.run.kit.aiq, { stored: storedOf(order) })
  const calls = first.memory.calls
  const old = { state: structuredClone(first.builds.get(first.ref).write.state) }
  const run = (record) =>
    runDraftWrite({ plan, doors: first.memory.doors, record, openStored: async () => ({}) })
  const stale = await run(old).catch((e) => e)
  assert.equal(stale.code, 'write_record_stale')
  assert.deepEqual(stale.report.stale.revision, 1)
  // The revision run's own record, given to a run of revision 3 from the build the site now holds: refused, nothing
  // written.
  const third = revisedBy('rename a page')
  third.plan.revision = 3
  const again = await revisionRun({ ...first, ref: partial.run.write.build.ref }, third, {
    record: structuredClone(partial.record),
    runId: 'run-larkspur-3'
  })
  assert.equal(again.error.code, 'write_record_stale')
  assert.equal(first.memory.calls, calls)
})

test('a write plan that drops an operation of the previous build stops typed before any door', async () => {
  const first = await firstBuild()
  const partial = await revisionRun(first, revisedBy('rename a service'))
  const order = partial.run.order.order
  const plan = writePlanOf(order, partial.run.kit.aiq, { stored: storedOf(order) })
  const gone = plan.ops.find((op) => op.kind === 'article.create')
  const cut = { ...plan, ops: plan.ops.filter((op) => op !== gone) }
  const calls = first.memory.calls
  const out = await runRevisionWrite({
    plan: cut,
    previous: first.builds.get(first.ref).write,
    doors: first.memory.doors,
    record: {},
    runId: 'run-larkspur-cut',
    openStored: async () => ({})
  }).catch((e) => e)
  assert.equal(out.code, 'revision_needs_removal')
  assert.equal(out.noRerun, true)
  assert.equal(first.memory.calls, calls)
})

test('a build that cannot be revised stops typed, noRerun, before any model call or door', async () => {
  const first = await firstBuild()
  const cases = [
    ['previous_build_missing', (b) => b.delete(first.ref)],
    ['previous_build_other_kit', (b) => Object.assign(b.get(first.ref), { kit: 'ja-boxing@1.0.12' })],
    ['previous_build_unfinished', (b) => Object.assign(b.get(first.ref), { status: 'failed' })],
    ['previous_build_not_current', (b) => Object.assign(b, { currentRef: 'run-other:r1:w1' })]
  ]
  for (const [code, spoil] of cases) {
    const builds = new Map([...first.builds].map(([k, v]) => [k, structuredClone(v)]))
    builds.currentRef = first.ref
    spoil(builds)
    const out = await revisionRun({ ...first, builds }, revisedBy('rename a service'))
    assert.equal(out.error?.code, code)
    assert.equal(out.error.noRerun, true)
    assert.deepEqual([out.model.calls.length, out.writes], [0, 0], code)
  }
})

test('a failing door is redone once; twice stops typed with the report, and the same record resumes to the same site', async () => {
  const first = await firstBuild({ memory: blankSite({ fail: [63, 64] }) })
  const revised = revisedBy('rename a service')
  const record = {}
  const failed = await revisionRun(first, revised, { record })
  assert.equal(failed.error.code, 'redo_failed')
  assert.equal(failed.error.noRerun, true)
  assert.equal(failed.error.report.failed.code, 'door_failed')
  const resumed = await revisionRun(first, revised, { record })
  assert.equal(resumed.run.write.report.status, 'done')
  const fresh = await freshBuild(revised)
  assert.ok(sameSite(first.memory, fresh.memory))
  const once = await firstBuild({ memory: blankSite({ fail: [63] }) })
  assert.equal((await revisionRun(once, revised)).run.write.report.status, 'done')
})

test('a name held after the build is gone from every record, slot and identity value of the site', async () => {
  const site1 = await firstBuild({ leak: leakOf(HELD_PERSON) })
  assert.ok(namesHeldInAnyForm([JSON.stringify(site1.snapshot)], [HELD_PERSON]))
  const out = await revisionRun(site1, revisedBy('hold a reviewer'))
  assert.equal(out.run.write.report.status, 'done')
  const shown = snapshotOf(site1.memory)
  assert.ok(!JSON.stringify(shown).includes('Wenna'))
  assert.ok(
    out.run.plan.revision.impact.write.find((w) => w.page === 'contact').reasons.includes('held_text_in_copy')
  )
  const name = await firstBuild()
  const held = await revisionRun(name, revisedBy('hold the business name'))
  assert.equal(held.run.write.report.status, 'done')
  const text = JSON.stringify(snapshotOf(name.memory))
  assert.ok(!namesHeldInAnyForm([text], ['Larkspur Blooms']))
  assert.ok(text.includes(SITE_NAME))
})

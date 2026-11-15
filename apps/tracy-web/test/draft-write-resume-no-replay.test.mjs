// A resumed draft write applies nothing twice although `content.update` keeps no replay (#597, measured on plugin
// 0.24.85: the same apply id sent again is written again). The run record is what prevents it: at every crash
// boundary, after a door call and before it, each record is created by one write only (one step under its create
// apply id), and the resumed site is the site of an uninterrupted run. Without the run record the same resume makes
// records twice: the door does not protect the run, the record does. Invented data (the JA Boxing florist).
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-resume-no-replay.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blankSite, floristPlan, runOn, snapshotOf } from './draft-write-fixtures.mjs'

const clean = blankSite()
await runOn(clean)
const expected = snapshotOf(clean)
const total = clean.calls
const creates = floristPlan.ops
  .filter((op) => op.kind.endsWith('.create'))
  .map((op) => `run-test:${op.key}:create`)

test(`the memory door writes an update again on every call, as measured`, async () => {
  const memory = blankSite()
  const call = { applyId: 'twice', kind: 'category', id: 0, fields: { title: 'Bouquets', alias: 'bouquets' } }
  await memory.doors.update(call)
  await memory.doors.update(call)
  assert.equal(memory.site.records.category.size, 2)
  assert.equal(memory.steps('twice'), 2)
})

test(`at every crash boundary (${total} calls, after and before), a resume creates each record once`, async () => {
  assert.ok(creates.length > 10, `${creates.length} created records`)
  let most = 0
  for (const before of [false, true])
    for (let at = 1; at <= total; at++) {
      const memory = blankSite({ crash: { at, before } })
      const record = {}
      await assert.rejects(runOn(memory, { record }), (error) => error.fatal === true)
      const report = await runOn(memory, { record })
      assert.equal(report.status, 'done', `${before ? 'before' : 'after'} call ${at}`)
      for (const id of creates) assert.ok(memory.steps(id) <= 1, `${id} written twice, crash at ${at}`)
      assert.deepEqual(snapshotOf(memory), expected, `${before ? 'before' : 'after'} call ${at}`)
      most = Math.max(most, memory.calls - total)
    }
  // What a resume sends again is at most the call that died (an assignment, a setting, a contract apply the plugin
  // answers again, or a create the run record had not yet marked done): never a second create of a record.
  assert.ok(most <= 1, `a resume sent ${most} calls again`)
})

test('control: the same resume without its run record makes records twice', async () => {
  const at = Math.ceil(total / 2)
  const memory = blankSite({ crash: { at } })
  await assert.rejects(runOn(memory, { record: {} }), (error) => error.fatal === true)
  await runOn(memory, { record: {} })
  assert.notDeepEqual(snapshotOf(memory), expected)
  assert.ok(creates.some((id) => memory.steps(id) > 1))
})

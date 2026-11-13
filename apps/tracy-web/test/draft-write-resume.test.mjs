// The draft write resumes and redoes (#597): the process dies at every operation boundary (after each mutating door
// call, and before it), and a second run with the same run record ends with the site an uninterrupted run makes,
// nothing made twice. A failing door call is redone once; a second failure stops the write, typed `redo_failed`
// (noRerun), with a report naming the operations that ran and the one that failed. A record the site does not keep
// as written stops it, typed `read_back_mismatch`.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-resume.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blankSite, floristPlan, runOn, snapshotOf } from './draft-write-fixtures.mjs'

const clean = blankSite()
await runOn(clean)
const expected = snapshotOf(clean)
const total = clean.calls

/** Run, die at call `at` (after it acted, or `before` it), then run again with the same record. */
async function crashAndResume(at, before) {
  const memory = blankSite({ crash: { at, before } })
  const record = {}
  await assert.rejects(runOn(memory, { record }), (error) => error.fatal === true)
  const report = await runOn(memory, { record })
  return { memory, report, record }
}

test(`a run that dies after any of its door calls resumes to the same site (${total} boundaries)`, async () => {
  assert.ok(total > 50, `${total} mutating calls`)
  for (let at = 1; at <= total; at++) {
    const { memory, report } = await crashAndResume(at, false)
    assert.equal(report.status, 'done', `after call ${at}`)
    assert.deepEqual(snapshotOf(memory), expected, `after call ${at}`)
  }
})

test('a run that dies before any of its door calls resumes to the same site', async () => {
  for (let at = 1; at <= total; at++) {
    const { memory, report } = await crashAndResume(at, true)
    assert.equal(report.status, 'done', `before call ${at}`)
    assert.deepEqual(snapshotOf(memory), expected, `before call ${at}`)
  }
})

test('a resumed run makes no record twice: one module per copy mark, one menu item per alias', async () => {
  const { memory } = await crashAndResume(Math.ceil(total / 2), false)
  const notes = [...memory.site.records.module.values()]
    .map((r) => r.note)
    .filter((n) => /^(copy|library):/.test(n ?? ''))
  assert.equal(new Set(notes).size, notes.length)
  assert.equal(
    notes.length,
    floristPlan.ops.filter((op) => /^(module\.copy|library\.create)$/.test(op.kind)).length
  )
  const aliases = [...memory.site.records.menuItem.values()].map((r) => `${r.menutype}/${r.alias}`)
  assert.equal(new Set(aliases).size, aliases.length)
})

test('a door call that fails once is redone, and the site is the same', async () => {
  for (const at of [1, 15, Math.ceil(total / 2), total]) {
    const memory = blankSite({ fail: [at] })
    const report = await runOn(memory)
    assert.equal(report.status, 'done', `fail at ${at}`)
    assert.deepEqual(snapshotOf(memory), expected, `fail at ${at}`)
  }
})

test('a door call that fails twice stops the write: redo_failed, noRerun, the report says what ran', async () => {
  const at = 20
  const memory = blankSite({ fail: [at, at + 1] })
  const error = await runOn(memory).then(
    () => assert.fail('the write passed'),
    (e) => e
  )
  assert.equal(error.code, 'redo_failed')
  assert.equal(error.noRerun, true)
  assert.equal(error.report.status, 'failed')
  const failedAt = floristPlan.ops.findIndex((op) => op.key === error.report.failed.op)
  assert.deepEqual(
    error.report.ran,
    floristPlan.ops.slice(0, failedAt).map((op) => op.key)
  )
  assert.equal(error.report.failed.code, 'door_failed')
})

test('a site that keeps another value than the one written stops the write: read_back_mismatch', async () => {
  const memory = blankSite()
  const update = memory.doors.update
  memory.doors.update = (input) =>
    update(
      input.kind === 'module' && input.id === 0
        ? { ...input, fields: { ...input.fields, params: '{}' } }
        : input
    )
  const error = await runOn(memory).then(
    () => assert.fail('the write passed'),
    (e) => e
  )
  assert.equal(error.code, 'read_back_mismatch')
  assert.equal(error.noRerun, true)
  assert.match(error.report.failed.op, /^copy:/)
  assert.doesNotMatch(JSON.stringify(error.details), /Item a|Larkspur/)
})

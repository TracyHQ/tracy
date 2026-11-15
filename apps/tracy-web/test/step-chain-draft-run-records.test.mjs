// The run records of draft writes kept outside the process (#612, `step-chain-draft-run-records.js`): the memory store
// passes the store contract; a revision on the real site wiring saves its record through the store before every door
// call and closes it when done; the saved record of a hold revision never names the held person; and the reader of
// the rebuild wiring (`runRecordOf`) answers only an unfinished run's record. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-run-records.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heldFormsOf, namesAnyIn } from 'website-opportunities/domain/revision-text-forms.mjs'
import { durableRunRecord, memoryRunRecords, runRecordReader } from '../src/step-chain-draft-run-records.js'
import { HELD_PERSON, revisedBy } from './draft-revision-edits.mjs'
import { firstBuild } from './draft-revision-run.mjs'
import { siteRevision, SITE_KEY } from './step-chain-draft-rebuild-run.mjs'
import { runRecordContract } from './step-chain-draft-run-records-contract.mjs'

const CTX = { siteKey: SITE_KEY }

for (const [name, check] of runRecordContract) test(`memory store: ${name}`, () => check(memoryRunRecords()))

/** A store that also lists every state appended, as JSON. */
function watched() {
  const store = memoryRunRecords()
  const appended = []
  return {
    appended,
    store: {
      ...store,
      append: async (runId, state, ctx) => (
        appended.push(JSON.stringify(state)), store.append(runId, state, ctx)
      )
    }
  }
}

test('a revision saves its record through the store before its door calls and closes it when done', async () => {
  const first = await firstBuild()
  const { store, appended } = watched()
  const rev = await siteRevision(first, revisedBy('rename a service'), {
    runId: 'run-larkspur-2',
    runRecords: store
  })
  assert.equal(rev.error, undefined, rev.error?.code)
  assert.equal(rev.run.write.report.status, 'done')
  assert.ok(appended.length > 0)
  const kept = await store.read('run-larkspur-2', CTX)
  assert.equal(kept.closed, true)
  assert.ok(kept.state.undo, 'a revision keeps its undo journal')
  // Every call went out as the owner, under the run's setup id.
  assert.ok(rev.over.calls.every((c) => c.setupRun === 'run-larkspur-2' && c.siteKey === SITE_KEY))
  // A done run is not an unfinished one.
  assert.equal(await runRecordReader(store)('run-larkspur-2', CTX), null)
})

test('the saved record of a hold revision never names the held person, in any form', async () => {
  const first = await firstBuild()
  const { store, appended } = watched()
  const rev = await siteRevision(first, revisedBy('hold a reviewer'), {
    runId: 'run-larkspur-2',
    runRecords: store
  })
  assert.equal(rev.error, undefined, rev.error?.code)
  const forms = heldFormsOf({ people: [HELD_PERSON] })
  assert.ok(appended.length > 0)
  const leaked = appended.filter((json) => namesAnyIn(JSON.parse(json), forms))
  assert.deepEqual(leaked, [])
  // The grep itself sees her where she is: the first build's record named her.
  assert.ok(namesAnyIn(first.run.write, forms), 'the probe finds the held person in the first build')
})

test('the reader answers an unfinished run on its site only, and null without a store', async () => {
  const store = memoryRunRecords()
  await store.append('run-9', { done: ['op-1'] }, CTX)
  const read = runRecordReader(store)
  assert.deepEqual(await read('run-9', CTX), { state: { done: ['op-1'] } })
  assert.equal(await read('run-9', { siteKey: 'other-site.example' }), null)
  assert.equal(await read('run-unknown', CTX), null)
  assert.equal(await runRecordReader(null)('run-9', CTX), null)
  assert.equal(await runRecordReader({ read: store.read })('run-9', CTX), null)
})

test('a record resumes from the last save; a closed run is never written again', async () => {
  const store = memoryRunRecords()
  const fresh = await durableRunRecord(store, 'run-1', CTX)
  assert.equal(fresh.state, undefined)
  await fresh.save({ seq: 1, done: ['op-1'] })
  const revived = await durableRunRecord(store, 'run-1', CTX)
  assert.deepEqual(revived.state, { seq: 1, done: ['op-1'] })
  await store.close('run-1', CTX)
  await assert.rejects(
    revived.save({ seq: 1, done: ['op-1', 'op-2'] }),
    (e) => e.code === 'write_record_stale'
  )
  await assert.rejects(durableRunRecord(store, 'run-1', CTX), (e) => e.code === 'write_record_stale')
})

// A column a revision empties because it no longer writes it (#599, `state.cleared`): the run record does not claim
// it any more (no hash in `state.wrote`), so an owner value set there since is not a mismatch of the record; but it
// stays guarded: a later revision that writes the column again over the owner's value stops `site_changed_outside`,
// and the restore of the revision that emptied it stops `restore_site_changed` rather than write the old value over
// the owner's. Invented data only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-cleared.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { holdsWrote } from '../src/step-chain-draft-wrote.js'
import { revisedBy } from './draft-revision-edits.mjs'
import { MORE_EDITS } from './draft-revision-edits-more.mjs'
import { firstBuild, restoreOf, revisionRun } from './draft-revision-run.mjs'

const OWNER = 'A description of the owner'
const drop = () => revisedBy('drop a block from an article page', MORE_EDITS)
const columnOf = (place) => place.split(':')
const setAt = (memory, place, value) => {
  const [, kind, id, column] = columnOf(place)
  memory.site.records[kind].get(Number(id))[column] = value
}
const valueAt = (memory, place) => {
  const [, kind, id, column] = columnOf(place)
  return memory.site.records[kind].get(Number(id))[column]
}

async function cleared() {
  const first = await firstBuild()
  const two = await revisionRun(first, drop())
  assert.equal(two.error, undefined, two.error?.code)
  const state = first.builds.get(two.run.write.build.ref).write.state
  assert.ok(state.cleared.length > 0, 'the revision emptied a column')
  return { first, two, state, place: state.cleared[0] }
}

test('a cleared column is not in the record of what the site should hold', async () => {
  const { first, state, place } = await cleared()
  assert.equal(valueAt(first.memory, place), '')
  assert.equal(Object.hasOwn(state.wrote, place), false)
  assert.equal(Object.hasOwn(state.shapes, place), false)
  for (const name of Object.keys(state.wrote))
    if (name.startsWith('record:')) {
      const [, kind, id, column] = columnOf(name)
      const row = first.memory.site.records[kind].get(Number(id))
      if (row) assert.ok(holdsWrote(name, row[column] ?? null, state), name)
    }
})

test('a later revision writing a cleared column again over an owner value stops', async () => {
  const { first, two, place } = await cleared()
  setAt(first.memory, place, OWNER)
  const draft = revisedBy('change nothing')
  draft.plan.revision = 3
  const three = await revisionRun(first, draft, { runId: 'run-larkspur-3', from: two.run.write.build.ref })
  assert.equal(three.error?.code, 'site_changed_outside')
  assert.equal(valueAt(first.memory, place), OWNER)
})

test('the restore of the revision that cleared a column stops over an owner value there', async () => {
  const { first, two, place } = await cleared()
  setAt(first.memory, place, OWNER)
  const before = first.memory.calls
  const out = await restoreOf(first, first.builds.get(two.run.write.build.ref)).catch((e) => e)
  assert.equal(out.code, 'restore_site_changed')
  assert.equal(first.memory.calls, before)
  assert.equal(valueAt(first.memory, place), OWNER)
})

test('the restore of the revision that cleared a column puts its value back when the column is still empty', async () => {
  const { first, two, place } = await cleared()
  const out = await restoreOf(first, first.builds.get(two.run.write.build.ref))
  assert.equal(out.status, 'done')
  assert.notEqual(valueAt(first.memory, place), '')
})

// An owner's key inside a row of a JSON list Tracy wrote (#599): a list is written and taken out whole, so such a key
// would be lost. A revision stops (`ownedColumnOf` answers `overOwner`, the journal's `site_changed_outside`) whether
// it still sends the list or no longer does; a restore (`restore_site_changed`) and an abandon (`site_changed_outside`)
// stop in the check that runs before their first write (`checkUnchanged`, `writeBack`). Invented values only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-list-row-owner.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ownedColumnOf, ownerRowKeyUnder, shapeUnion } from '../src/step-chain-draft-owned-keys.js'
import { shapeOf } from '../src/step-chain-draft-place-value.js'
import { checkUnchanged } from '../src/step-chain-draft-restore-plan.js'
import { writeBack } from '../src/step-chain-draft-write-back.js'
import { keepWrote } from '../src/step-chain-draft-wrote.js'

const J = JSON.stringify
const PLACE = 'record:module:1001:params'
const built = { lead: 'Fresh bunches', rows: [{ t: 'Tulips' }, { t: 'Peonies' }] }
const revised = { lead: 'Fresh bunches', rows: [{ t: 'Ranunculus' }, { t: 'Peonies' }] }
const ownerRow = (value) => ({
  ...value,
  rows: [{ ...value.rows[0], note: 'A note of the owner' }, ...value.rows.slice(1)]
})

/** A revision over `now`, the previous build having written `previous`, sending `sent`. */
const revise = (now, sent, previous) => {
  const before = shapeOf(J(previous))
  return ownedColumnOf(J(now), J(sent), shapeUnion(before, shapeOf(J(sent))), before)
}

test('a revision that still sends the list stops over an owner key in a row', () => {
  assert.equal(revise(ownerRow(built), revised, built).overOwner, true)
})

test('a revision that no longer sends the list stops over an owner key in a row', () => {
  assert.equal(revise(ownerRow(built), { lead: 'Fresh bunches' }, built).overOwner, true)
  const nested = { lead: 'x', group: { rows: [{ t: 'Tulips' }] } }
  const nestedNow = { lead: 'x', group: { rows: [{ t: 'Tulips', note: 'A note of the owner' }] } }
  assert.equal(revise(nestedNow, { lead: 'x' }, nested).overOwner, true)
})

test('a list taken out with no owner key, or an owner key beside the list, still goes as before', () => {
  assert.deepEqual(JSON.parse(revise(built, { lead: 'Fresh bunches' }, built).value), {
    lead: 'Fresh bunches'
  })
  const beside = revise({ ...built, own: 'kept' }, { lead: 'Fresh bunches' }, built)
  assert.deepEqual(JSON.parse(beside.value), { lead: 'Fresh bunches', own: 'kept' })
})

test('ownerRowKeyUnder reads rows through owned keys only', () => {
  const shape = shapeOf(J(built))
  assert.equal(ownerRowKeyUnder(J(ownerRow(built)), shape), true)
  assert.equal(ownerRowKeyUnder(J({ ...built, own: 'beside' }), shape), false)
  assert.equal(ownerRowKeyUnder(J(built), shape), false)
})

/** The state of a revision that wrote `revised` over `built` at the place. */
const revisionState = () => {
  const state = { undo: { sent: {} }, done: [] }
  keepWrote(state, PLACE, J(revised))
  return state
}
const placeOf = () => ({
  key: 'record:module:1001',
  type: 'record',
  kind: 'module',
  id: 1001,
  fields: { params: J(built) }
})

for (const code of ['restore_site_changed', 'site_changed_outside'])
  test(`the check before a write back stops ${code} over an owner key in a row`, async () => {
    const doors = { get: async () => ({ params: J(ownerRow(revised)) }) }
    await assert.rejects(checkUnchanged(placeOf(), doors, revisionState(), code), (e) => {
      assert.equal(e.code, code)
      assert.equal(e.details.place, PLACE)
      assert.equal(e.noRerun, true)
      return true
    })
    const clean = { get: async () => ({ params: J(revised) }) }
    await checkUnchanged(placeOf(), clean, revisionState(), code)
  })

test('a write back with an owner key in a row of its last place writes nothing', async () => {
  const rows = new Map([
    [1000, { params: J({ lead: 'Kept' }) }],
    [1001, { params: J(ownerRow(revised)) }]
  ])
  const updates = []
  const doors = {
    get: async ({ id }) => rows.get(id),
    update: async (call) => updates.push(call)
  }
  const state = revisionState()
  keepWrote(state, 'record:module:1000:params', J({ lead: 'Kept' }))
  const first = {
    key: 'record:module:1000',
    type: 'record',
    kind: 'module',
    id: 1000,
    fields: { params: J({ lead: 'Old' }) }
  }
  const record = { state: { done: [] } }
  await assert.rejects(
    writeBack({
      places: [first, placeOf()],
      doors,
      record,
      state,
      applyId: (p) => `restore-1:${p.key}`,
      failed: 'restore_failed',
      changed: 'restore_site_changed'
    }),
    (e) => e.code === 'restore_site_changed'
  )
  assert.deepEqual(updates, [])
})

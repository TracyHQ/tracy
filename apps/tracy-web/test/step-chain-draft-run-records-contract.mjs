// The run record store contract (#612, `step-chain-draft-run-records.js`): every case any store of draft write run
// records must pass, the memory store and a durable one alike. A durable store runs it with its own store:
//
//   import { runRecordContract } from './step-chain-draft-run-records-contract.mjs'
//   for (const [name, check] of runRecordContract) test(name, opts, () => check(makeStore()))
//
// `makeStore()` gives an empty store each time. Invented data only.
import assert from 'node:assert/strict'
import { missingRunRecordMethods } from '../src/step-chain-draft-run-records.js'

const A = { siteKey: 'larkfen-racquets.example' }
const B = { siteKey: 'meadowlight-flowers.example' }
const state = (n) => ({
  mark: 'plan-larkfen:r2',
  seq: 1,
  done: [`op-${n}`],
  undo: { slots: { 'home.title': 'Before' } }
})

export const runRecordContract = [
  ['the store answers the whole interface', (store) => assert.deepEqual(missingRunRecordMethods(store), [])],
  [
    'a run that kept nothing reads null; append then read gives the newest state',
    async (store) => {
      assert.equal(await store.read('run-1', A), null)
      assert.equal(await store.append('run-1', state(1), A), true)
      assert.equal(await store.append('run-1', state(2), A), true)
      assert.deepEqual(await store.read('run-1', A), { state: state(2), closed: false })
    }
  ],
  [
    'what is kept is a copy: changing the object after append changes nothing kept',
    async (store) => {
      const s = state(1)
      await store.append('run-1', s, A)
      s.done.push('op-later')
      s.undo.slots['home.title'] = 'After'
      assert.deepEqual((await store.read('run-1', A)).state, state(1))
      const read = await store.read('run-1', A)
      read.state.done.push('op-reader')
      assert.deepEqual((await store.read('run-1', A)).state, state(1))
    }
  ],
  [
    'a run is read on its own site only',
    async (store) => {
      await store.append('run-1', state(1), A)
      assert.equal(await store.read('run-1', B), null)
      await store.append('run-1', state(9), B)
      assert.deepEqual((await store.read('run-1', A)).state, state(1))
      assert.deepEqual((await store.read('run-1', B)).state, state(9))
    }
  ],
  [
    'close ends the run once: its record stays readable, closed, and no append changes it',
    async (store) => {
      assert.equal(await store.close('run-1', A), false, 'an unknown run is not closed')
      await store.append('run-1', state(1), A)
      assert.equal(await store.close('run-1', A), true)
      assert.equal(await store.close('run-1', A), false, 'closed already')
      assert.equal(await store.append('run-1', state(2), A), false)
      assert.deepEqual(await store.read('run-1', A), { state: state(1), closed: true })
      // Another run of the same site is not closed with it.
      assert.equal(await store.append('run-2', state(3), A), true)
      assert.deepEqual(await store.read('run-2', A), { state: state(3), closed: false })
    }
  ],
  [
    'states of any JSON shape round trip, held stand ins included',
    async (store) => {
      const s = {
        undo: { records: { 'article:3': { kind: 'article', id: 3, fields: { introtext: { held: true } } } } },
        empty: null,
        list: []
      }
      await store.append('run-1', s, A)
      assert.deepEqual((await store.read('run-1', A)).state, s)
    }
  ],
  [
    'a call that names no site is refused, typed',
    async (store) => {
      await assert.rejects(store.append('run-1', state(1), {}), (e) => e.code === 'site_key_missing')
      await assert.rejects(store.read('run-1', { siteKey: ' ' }), (e) => e.code === 'site_key_missing')
      await assert.rejects(store.close('run-1', null), (e) => e.code === 'site_key_missing')
    }
  ]
]

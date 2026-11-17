// One progress block per working step (#575): a `tracy_build` call answered "still running" or "waiting for your
// choice" is carried on by the next call, so its row gives way to that call's row instead of piling up. The fold runs
// over the session log, so a reload draws the same rows.
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { bundleClient } from './bundle-client.mjs'

const { lib, done } = await bundleClient(`
  export { createSupersededCalls, supersedeDefinitionFor, rowAfterSupersede } from './call-supersede'
`)
after(done)

let seq = 0
const call = (callId, action) => ({
  type: 'tool/call',
  seq: ++seq,
  data: { turn: 1, name: 'tracy_build', callId, arguments: JSON.stringify({ action }) }
})
const otherCall = (callId) => ({
  type: 'tool/call',
  seq: ++seq,
  data: { turn: 1, name: 'ask_user_question', callId, arguments: '{}' }
})

/** Fold the events the way dsh does: the first match starts the context, every later one updates it. */
function fold(definition, events) {
  let state
  for (const event of events) {
    const m = definition.match(event)
    if (m === null) continue
    state = state === undefined ? definition.start({}, { event }) : definition.update({ state }, { event })
  }
  return state
}

const LOG = [call('c1', 'research'), otherCall('q1'), call('c2', 'status'), call('c3', 'status')]

test('a later build call supersedes the one before it; the latest and other tools never are', () => {
  const store = lib.createSupersededCalls()
  const seen = []
  store.subscribe(() => seen.push('changed'))
  fold(lib.supersedeDefinitionFor(store), LOG)
  assert.equal(store.has('c1'), true)
  assert.equal(store.has('c2'), true)
  assert.equal(store.has('c3'), false, 'the latest call keeps its row')
  assert.equal(store.has('q1'), false, 'another tool is never touched')
  assert.ok(seen.length >= 1, 'rows are told when a call gives way')
})

test('the definition draws nothing itself: it publishes no turn value', () => {
  const store = lib.createSupersededCalls()
  const definition = lib.supersedeDefinitionFor(store)
  const state = fold(definition, LOG)
  assert.equal(definition.buildLocationData({ state }, 'turn', null), null)
})

test('a reload folds the same log into a new store and gives the same answer', () => {
  const first = lib.createSupersededCalls()
  const second = lib.createSupersededCalls()
  fold(lib.supersedeDefinitionFor(first), LOG)
  fold(lib.supersedeDefinitionFor(second), LOG)
  for (const id of ['c1', 'c2', 'c3']) assert.equal(first.has(id), second.has(id))
})

test('only a row that says work goes on gives way: a finished step keeps its done line', () => {
  const working = { kind: 'working', step: 'research', links: [] }
  const waiting = { kind: 'waiting', links: [] }
  const research = { kind: 'research', sources: 3, business: 'Example Court', links: [] }
  const stopped = { kind: 'stopped' }
  assert.equal(lib.rowAfterSupersede(working, true), null)
  assert.equal(lib.rowAfterSupersede(waiting, true), null)
  assert.equal(lib.rowAfterSupersede(working, false), working)
  assert.equal(lib.rowAfterSupersede(research, true), research)
  assert.equal(lib.rowAfterSupersede(stopped, true), stopped, 'a stop is never hidden')
  assert.equal(lib.rowAfterSupersede(null, true), null)
})

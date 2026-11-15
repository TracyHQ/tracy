// The canonical engine names of a draft run (#597, #610, `build-run-draft-steps.mjs` of website-opportunities) answer
// what the build chat's own mapping (`build-draft/build-progress.js`) answers, line for line and stop for stop; and the
// memory build store (`step-chain-draft-builds.js`) is a whole build store, compare and set per site. Invented data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-run-draft-steps.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DRAFT_RUN_STEPS,
  draftEngineLinesOf,
  draftEngineNamesOf,
  draftRunInputOf,
  contractStepOf
} from 'website-opportunities/domain'
import { engineLinesOf, engineNamesOf } from '../src/build-draft/build-progress.js'
import { BUILD_STORE_METHODS, memoryBuildStore, missingBuildMethods } from '../src/step-chain-draft-builds.js'

const PAGES = [{ id: 'home' }, { id: 'bouquets' }, { id: 'contact' }]

test('every draft step maps as the build chat maps it, and only to Contract B engine names', () => {
  for (const step of [...DRAFT_RUN_STEPS, 'site', 'nothing']) {
    assert.deepEqual(draftEngineNamesOf(step, PAGES), engineNamesOf(step, PAGES), step)
    for (const name of draftEngineNamesOf(step, PAGES)) assert.ok(contractStepOf(name), `${step} -> ${name}`)
  }
  const lines = DRAFT_RUN_STEPS.map((step, n) => ({ step, outcome: 'done', ms: n })).concat({ step: 'site' })
  assert.deepEqual(draftEngineLinesOf(lines, PAGES), engineLinesOf(lines, PAGES))
  assert.deepEqual(
    draftEngineLinesOf(lines, PAGES)
      .filter((l) => l.step.startsWith('writer:'))
      .map((l) => l.step),
    ['writer:home', 'writer:bouquets', 'writer:contact']
  )
})

test('a run input: running names deduplicated, a copy stop on its first page, an unknown stop on the frame', () => {
  const input = draftRunInputOf(
    { steps: [{ step: 'kit' }], running: ['brand', 'plan', 'copy'], stop: null },
    PAGES
  )
  assert.deepEqual(input.running, ['look', 'writer:home', 'writer:bouquets', 'writer:contact'])
  assert.equal(input.stop, null)
  assert.equal(draftRunInputOf({ stop: { step: 'copy', code: 'x' } }, PAGES).stop.step, 'writer:home')
  assert.equal(draftRunInputOf({ stop: { step: 'site', code: 'x' } }, PAGES).stop.step, 'run')
  assert.equal(draftRunInputOf({ stop: { step: 'run', code: 'x' } }, PAGES).stop.step, 'run')
  assert.equal(draftRunInputOf({ stop: { step: 'write', code: 'x' } }, PAGES).stop.step, 'write')
})

test('the memory build store is a whole store: compare and set per site, one unfinished run, forget keeps the reason', async () => {
  const store = memoryBuildStore()
  assert.deepEqual(missingBuildMethods(store), [])
  assert.deepEqual(missingBuildMethods({ read() {} }), BUILD_STORE_METHODS.slice(1))
  const a = { siteKey: 'site-larkspur-1' }
  const b = { siteKey: 'site-hedgerow-2' }
  assert.equal(await store.keep({ ref: 'b1' }, a, { expected: null }), true)
  assert.equal(await store.keep({ ref: 'b2' }, a, { expected: null }), false)
  assert.equal(await store.current(a), 'b1')
  assert.equal(await store.current(b), null)
  assert.equal(await store.keep({ ref: 'b2', previous: 'b1' }, a, { expected: 'b1' }), true)
  assert.deepEqual(await store.read('b2', a), { ref: 'b2', previous: 'b1' })
  assert.equal(await store.read('b2', b), null)
  assert.equal(await store.begin({ runId: 'r1', from: 'b2' }, a), true)
  assert.equal(await store.begin({ runId: 'r1', from: 'b2' }, a), true)
  assert.equal(await store.begin({ runId: 'r2', from: 'b2' }, a), false)
  assert.equal(await store.begin({ runId: 'r2', from: null }, b), true)
  await store.end('r2', a)
  assert.equal((await store.unfinished(a)).runId, 'r1')
  await store.end('r1', a)
  assert.equal(await store.unfinished(a), null)
  await store.forget('b1', a, { reason: 'restore_shows_held_text' })
  assert.equal(await store.read('b1', a), null)
  assert.equal(store.sites.get('site-larkspur-1').forgotten.get('b1'), 'restore_shows_held_text')
})

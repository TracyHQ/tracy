/**
 * The Build workspace turns to the live site when a build it watched ends (David, 24/09/2026), in
 * place and at most once per run — `src/client/auto-preview.mjs` says why each condition exists.
 *
 *   node --test packages/site/tracy-site-build-core/test/auto-preview.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { autoPreview, NO_RUN_SEEN } from '../src/client/auto-preview.mjs'

const SITE = 'ed-vboaum.tracy.site'
const job = (status, extra = {}) => ({
  job: 'build-mueaaa-1',
  runs: 1,
  status,
  targetSiteKey: SITE,
  targetUrl: 'https://ed-vboaum.tracy.site/',
  ...extra
})
const brief = { siteKey: SITE, view: 'brief', chose: false }

/** Feed a sequence of polls through the rule, the way the component does; the `show` of each. */
function watch(polls, tab = brief) {
  let memory = NO_RUN_SEEN
  return polls.map((next) => {
    const step = autoPreview(memory, next, typeof tab === 'function' ? tab() : tab)
    memory = step.memory
    return step.show
  })
}

test('a build the tab saw running turns to the live site when it ends', () => {
  assert.deepEqual(watch([job('running'), job('running'), job('done')]), [false, false, true])
})

test('only once: the next polls of the same finished run leave the customer where they are', () => {
  assert.deepEqual(watch([job('running'), job('done'), job('done'), job('done')]), [
    false,
    true,
    false,
    false
  ])
})

test('a build that was already finished when the tab opened does not move the customer', () => {
  assert.deepEqual(watch([job('done'), job('done')]), [false, false])
})

test('a failed run does not turn; its Retry is a new run, and when that one ends it does', () => {
  assert.deepEqual(
    watch([job('running'), job('failed'), job('running', { runs: 2 }), job('done', { runs: 2 })]),
    [false, false, false, true]
  )
})

test('a stage that waits for the customer, then carries on, still ends in the turn', () => {
  assert.deepEqual(watch([job('running'), job('waiting'), job('running'), job('done')]), [
    false,
    false,
    false,
    true
  ])
})

test('the customer pressed the toggle during the build: their choice stands', () => {
  assert.deepEqual(watch([job('running'), job('done')], { ...brief, chose: true }), [false, false])
})

test('another view holds the customer’s typing: no turn, and none later for the same run', () => {
  // The run ends while the customer is on Changes; walking back to the brief is not a new end.
  const views = ['changes', 'changes', 'brief']
  let i = 0
  const tab = () => ({ ...brief, view: views[i++] })
  assert.deepEqual(watch([job('running'), job('done'), job('done')], tab), [false, false, false])
})

test('a job for another site, or one with no address to show yet, never turns the tab', () => {
  assert.deepEqual(watch([job('running'), job('done', { targetSiteKey: 'other.tracy.site' })]), [
    false,
    false
  ])
  assert.deepEqual(watch([job('running'), job('done', { targetUrl: '' })]), [false, false])
  assert.deepEqual(watch([null, undefined]), [false, false])
})

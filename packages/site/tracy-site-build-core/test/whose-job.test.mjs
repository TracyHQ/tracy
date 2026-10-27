import assert from 'node:assert/strict'
import test from 'node:test'

import { provisionBlocked, staleJob } from '../src/client/whose-job.mjs'

const OPENED = Date.parse('2026-09-08T04:00:00.000Z')
const before = { startedAt: '2026-09-08T03:34:43.000Z' }
const after = { startedAt: '2026-09-08T04:10:00.000Z' }

test("somebody else's finished build is not this tab's, even on the same inspiration", () => {
  // The measured case: a press of Build with WordPress on `airbnb`, and the lane holding a
  // finished `airbnb` build for Joomla. Before 08/09 the inspirations matched and the tab showed
  // that build's result instead of the six questions.
  const job = { ...before, inspiration: 'airbnb', platform: 'joomla', status: 'done' }
  assert.equal(staleJob(job, { id: 'airbnb', platform: 'wordpress' }, OPENED), true)
})

test('a finished build of another inspiration is not this tab’s either', () => {
  const job = { ...before, inspiration: 'clean', platform: 'wordpress', status: 'done' }
  assert.equal(staleJob(job, { id: 'airbnb', platform: 'wordpress' }, OPENED), true)
})

test('the build this tab asked for stands', () => {
  const job = { ...before, inspiration: 'airbnb', platform: 'wordpress', status: 'done' }
  assert.equal(staleJob(job, { id: 'airbnb', platform: 'wordpress' }, OPENED), false)
})

test('a build still running is never stale — it may be this tab’s own press', () => {
  const job = { ...before, inspiration: 'clean', platform: 'joomla', status: 'running' }
  assert.equal(staleJob(job, { id: 'airbnb', platform: 'wordpress' }, OPENED), false)
})

test('a build started after the tab opened belongs to it whatever it says', () => {
  // A restyle from the Tweaks, or a rerun: the meta is the older fact.
  const job = { ...after, inspiration: 'clean', platform: 'joomla', status: 'done' }
  assert.equal(staleJob(job, { id: 'airbnb', platform: 'wordpress' }, OPENED), false)
})

test('a tab opened with no meta shows what is on the site', () => {
  // The + menu, or a plain reload: this tab is asking what the site has, not asking to build.
  const job = { ...before, inspiration: 'clean', platform: 'joomla', status: 'done' }
  assert.equal(staleJob(job, {}, OPENED), false)
})

test('a link that named an inspiration but no platform judges on the inspiration alone', () => {
  const job = { ...before, inspiration: 'airbnb', platform: 'joomla', status: 'done' }
  assert.equal(staleJob(job, { id: 'airbnb' }, OPENED), false)
})

test('no job is not a stale job', () => {
  assert.equal(staleJob(null, { id: 'airbnb', platform: 'wordpress' }, OPENED), false)
})

// ── A site that could not be stood up ────────────────────────────────────────────────────────────

test('provisionBlocked: a failed provision survives the customer leaving the workspace', () => {
  const failed = { provisionFailed: { siteKey: 'site-5big32.tracy.test', message: 'provision' } }
  // The measured case: no build job, because the build never started.
  assert.equal(provisionBlocked(failed, null), true)
  // Nothing recorded, nothing to say — the form screens decide as they always did.
  assert.equal(provisionBlocked({}, null), false)
  assert.equal(provisionBlocked(undefined, null), false)
})

test('provisionBlocked: a real build beats the mark, and an unfetched job says nothing yet', () => {
  const failed = { provisionFailed: { siteKey: 'site-5big32.tracy.test', message: 'provision' } }
  const job = {
    inspiration: 'airbnb',
    platform: 'joomla',
    status: 'running',
    startedAt: '2026-09-19T05:40:00Z'
  }
  // Once a build is running on that site, whatever failed before is history.
  assert.equal(provisionBlocked(failed, job), false)
  // 🔒 `undefined` IS THE GAP BEFORE THE FIRST POLL ANSWERS, not "no job". Treating it as null
  // would flash this screen over a tab that is about to show a perfectly good build.
  assert.equal(provisionBlocked(failed, undefined), false)
})

test('provisionBlocked: a mark with no siteKey is not a site that exists', () => {
  // `BuildForm` only records one when the fleet came back WITH a site key; a refusal before any
  // site existed is an ordinary form error and must not take over the tab on the next visit.
  assert.equal(provisionBlocked({ provisionFailed: { siteKey: '', message: 'x' } }, null), false)
})

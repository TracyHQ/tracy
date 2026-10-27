import assert from 'node:assert/strict'
import test from 'node:test'

import { cardWords, nextReadIn, readsJob } from '../src/client/card-poll.mjs'
import { readJobAt } from '../src/client/job-read.mjs'

const job = { id: 'b1', status: 'running', targetSiteKey: 'em1.tracy.test' }

test('a form-sending call never reads the job: its card is the form line', () => {
  assert.equal(readsJob('ask'), false)
  for (const action of ['start', 'status', 'rerun', 'revise', 'request', 'review', undefined]) {
    assert.equal(readsJob(action), true, String(action))
  }
})

const found = { state: 'job', job }
const none = { state: 'none' }
const unreadable = { state: 'unreadable' }

test('a running call with no job on the site stops after the first read', () => {
  // The measured case (P1 stand, 02/10): the agent's `request site.rebuild` on an EmDash site that
  // was never built through Build. Every action that can be running joins or changes a job that
  // already exists, so "none" on the first read stays "none" for the whole call — polling on asked
  // the host the same question every 1.5 s and logged a 404 each time, ~18 per rebuild.
  assert.equal(nextReadIn({ settled: false, read: none, followed: false }), null)
})

test('a running call with a job keeps following it; a settled one reads once', () => {
  assert.equal(nextReadIn({ settled: false, read: found, followed: true }), 1500)
  assert.equal(nextReadIn({ settled: true, read: found, followed: true }), null)
  assert.equal(nextReadIn({ settled: true, read: none, followed: false }), null)
  // A job already followed that reads as gone for one beat is still followed while the call runs.
  assert.equal(nextReadIn({ settled: false, read: none, followed: true }), 1500)
})

// Review of #1181 (M2): a first read that could not be made (a network drop, a 5xx, a 401 while the
// session re-mints) is not "no job" — the card froze on "Starting the build…" for the whole call.
test('a first read that failed on the network keeps the running card polling, more slowly', () => {
  const delay = nextReadIn({ settled: false, read: unreadable, followed: false })
  assert.ok(typeof delay === 'number' && delay > 1500, `polls again, slower: ${delay}`)
  assert.equal(nextReadIn({ settled: true, read: unreadable, followed: false }), null)
})

test("only the host's NO_JOB answer reads as no job; every other failure is unreadable", async () => {
  const answer = (status, body) => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  assert.deepEqual(await readJobAt('/job', {}, answer(200, job)), { state: 'job', job })
  assert.deepEqual(await readJobAt('/job', {}, answer(404, { code: 'NO_JOB' })), none)
  for (const [status, body] of [
    [404, { code: 'NOT_FOUND' }],
    [401, { code: 'UNAUTHORIZED' }],
    [500, { code: 'INTERNAL' }],
    [503, {}]
  ]) {
    assert.deepEqual(await readJobAt('/job', {}, answer(status, body)), unreadable, String(status))
  }
  const offline = async () => {
    throw new TypeError('fetch failed')
  }
  assert.deepEqual(await readJobAt('/job', {}, offline), unreadable)
  const notJson = async () => new Response('<html>', { status: 404 })
  assert.deepEqual(await readJobAt('/job', {}, notJson), unreadable)
})

test('a running site request with no build reads as an update, not as a build starting', () => {
  assert.equal(cardWords({ action: 'request', settled: false }), 'card.updating')
  assert.equal(cardWords({ action: 'rerun', settled: false }), 'card.updating')
  assert.equal(cardWords({ action: 'start', settled: false }), 'card.starting')
  assert.equal(cardWords({ action: undefined, settled: false }), 'card.starting')
  assert.equal(cardWords({ action: 'request', settled: true }), 'card.noBuild')
})

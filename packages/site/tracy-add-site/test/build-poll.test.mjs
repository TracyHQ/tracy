#!/usr/bin/env node
/**
 * How a build's job answer is read, and when the background poll stops asking (#362).
 *
 * #362: after a build failed and its site was deleted, the Add site tab kept asking
 * `GET /api/sites/<key>/jobs/<id>` — every answer a 403 — for the rest of the session (~70 min).
 * The first place actual differed from expected: `pollJob` read 403/404 as `unknown` ("ask again"),
 * and nothing ever settled the job. These tests run the REAL `pollJob` against a stubbed `fetch`,
 * and the REAL background round against a fake store, counting requests over several rounds.
 */
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'

import { backgroundPoller } from '../src/client/background-poll.mjs'
import { jobSettled, pollJob } from '../src/client/create.ts'
import { allPending, backgroundKey, clearJob, PENDING_KEY, writePending } from '../src/client/resume.mjs'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Answer every fetch with `answer()`, counting calls. */
function stubFetch(answer) {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return answer(String(url))
  }
  return calls
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('403 and 404 read as gone, even when the body is not JSON', async () => {
  for (const response of [
    () => json(403, { code: 'SEAT_NOT_AUTHORIZED' }),
    () => json(404, { code: 'JOB_UNKNOWN' }),
    () => new Response('<html>Forbidden</html>', { status: 403 }),
    () => new Response('', { status: 404 })
  ]) {
    stubFetch(response)
    const job = await pollJob('dead.tracy.ai', 'job-1')
    assert.equal(job.state, 'gone')
    assert.equal(jobSettled(job.state), true)
  }
})

test('401 preserves that sign-in ended without claiming the build is gone', async () => {
  stubFetch(() => new Response('Sign in again', { status: 401 }))
  const job = await pollJob('a.tracy.ai', 'j')
  assert.equal(job.state, 'unknown')
  assert.equal(job.pollIssue, 'signed_out')
})

test('a job-door signature refusal stays unknown so a reserved site is not forgotten', async () => {
  stubFetch(() => json(403, { error: 'BAD_SIGNATURE' }))
  assert.equal((await pollJob('a.tracy.ai', 'j')).state, 'unknown')
})

test('a network error, a 5xx, or an unreadable body stays unknown — not proof the site is gone', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('network')
  }
  assert.equal((await pollJob('a.tracy.ai', 'j')).state, 'unknown')
  stubFetch(() => json(502, { code: 'HOST_UNAVAILABLE' }))
  assert.equal((await pollJob('a.tracy.ai', 'j')).state, 'unknown')
  stubFetch(() => new Response('not json', { status: 200 }))
  assert.equal((await pollJob('a.tracy.ai', 'j')).state, 'unknown')
  assert.equal(jobSettled('unknown'), false)
  assert.equal(jobSettled('running'), false)
  assert.equal(jobSettled('queued'), false)
})

test('failed keeps the host detail and output; ready reads as done', async () => {
  stubFetch(() =>
    json(200, {
      state: 'failed',
      step: 'provision',
      detail: 'see /var/log/provision-dead.log',
      output: '!! no tracy/emdash image on this host\nbuild it first'
    })
  )
  const failed = await pollJob('dead.tracy.ai', 'job-1')
  assert.equal(failed.state, 'failed')
  assert.equal(failed.detail, 'see /var/log/provision-dead.log')
  assert.match(failed.output, /no tracy\/emdash image/)
  assert.equal(jobSettled(failed.state), true)

  stubFetch(() => json(200, { state: 'ready', step: 'ready' }))
  assert.equal((await pollJob('a.tracy.ai', 'j')).state, 'done')
})

/** localStorage stand-in with the parts `resume.mjs` walks (`length`, `key`). */
function fakeStore() {
  const data = new Map()
  return {
    get length() {
      return data.size
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: (key) => void data.delete(key),
    keys: () => [...data.keys()]
  }
}

const settle = () => new Promise((resolve) => setImmediate(resolve))

/** A background poller over `store`, whose job door answers `answers[jobId]()`. */
function poller(store, answers, onScreen = new Set()) {
  const asked = []
  const round = backgroundPoller({
    store: () => store,
    poll: async (siteKey, jobId) => {
      asked.push(jobId)
      return answers[jobId]()
    },
    allPending,
    clearJob,
    onScreen
  })
  return { asked, round }
}

test('background: a gone build is asked once, its pointers are cleared, and it is never asked again', async () => {
  const store = fakeStore()
  const pointer = { siteKey: 'dead.tracy.ai', jobId: 'job-dead', platform: 'wordpress' }
  writePending(store, pointer, 'session-1')
  writePending(store, pointer, backgroundKey('job-dead'))
  const { asked, round } = poller(store, { 'job-dead': () => ({ state: 'gone' }) })
  for (let i = 0; i < 5; i++) {
    round()
    await settle()
  }
  assert.deepEqual(asked, ['job-dead'], 'one ask, then none')
  assert.deepEqual(
    store.keys().filter((key) => key.startsWith(PENDING_KEY)),
    [],
    'every pointer at the gone build is forgotten'
  )
})

test('background: a failed build is asked once and keeps its pointer; a running one keeps being asked', async () => {
  const store = fakeStore()
  writePending(store, { siteKey: 'bad.tracy.ai', jobId: 'job-failed', platform: 'joomla' }, 's1')
  writePending(store, { siteKey: 'live.tracy.ai', jobId: 'job-live', platform: 'joomla' }, 's2')
  const { asked, round } = poller(store, {
    'job-failed': () => ({ state: 'failed' }),
    'job-live': () => ({ state: 'running' })
  })
  for (let i = 0; i < 4; i++) {
    round()
    await settle()
  }
  assert.equal(asked.filter((id) => id === 'job-failed').length, 1, 'failed: one ask')
  assert.equal(
    asked.filter((id) => id === 'job-live').length,
    4,
    'another build still under way is not stopped'
  )
  assert.equal(allPending(store).length, 2, 'the failed pointer stays for its failure screen')
})

test('background: unknown (5xx) is asked again; a slow answer is never stacked; on-screen builds are left to the wizard', async () => {
  const store = fakeStore()
  writePending(store, { siteKey: 'a.tracy.ai', jobId: 'job-flaky', platform: 'wordpress' }, 's1')
  writePending(store, { siteKey: 'b.tracy.ai', jobId: 'job-slow', platform: 'wordpress' }, 's2')
  writePending(store, { siteKey: 'c.tracy.ai', jobId: 'job-shown', platform: 'wordpress' }, 's3')
  let release
  const slow = new Promise((resolve) => (release = resolve))
  const { asked, round } = poller(
    store,
    {
      'job-flaky': () => ({ state: 'unknown' }),
      'job-slow': () => slow,
      'job-shown': () => ({ state: 'running' })
    },
    new Set(['job-shown'])
  )
  for (let i = 0; i < 3; i++) {
    round()
    await settle()
  }
  assert.equal(asked.filter((id) => id === 'job-flaky').length, 3)
  assert.equal(asked.filter((id) => id === 'job-slow').length, 1, 'no second ask while the first is out')
  assert.equal(asked.filter((id) => id === 'job-shown').length, 0)
  release({ state: 'done' })
  await settle()
  round()
  await settle()
  assert.equal(asked.filter((id) => id === 'job-slow').length, 1, 'done: never asked again')
  assert.equal(
    allPending(store).some((pending) => pending.jobId === 'job-slow'),
    false,
    'a done build nobody watches is forgotten'
  )
})

test('background: an ended session stops polling after one answer and retains the pending build', async () => {
  const store = fakeStore()
  const pointer = { siteKey: 'a.tracy.ai', jobId: 'signed-out', platform: 'wordpress' }
  writePending(store, pointer, 'session')
  const { asked, round } = poller(store, {
    'signed-out': () => ({ state: 'unknown', pollIssue: 'signed_out' })
  })
  for (let index = 0; index < 4; index++) {
    round()
    await settle()
  }
  assert.deepEqual(asked, ['signed-out'])
  assert.equal(allPending(store).length, 1)
  assert.equal(allPending(store)[0].jobId, pointer.jobId)
})

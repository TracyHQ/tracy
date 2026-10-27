#!/usr/bin/env node
/**
 * The import wizard's watch on the read of the old site and the handover after it (#166): the
 * handover runs once, the wizard leaves the spinner for its terminal step, a refused handover is
 * reported with its keys. (That "Import another site" re-arms the latch is wiring, not logic: it is
 * covered by the browser smoke test in test/e2e.) Fake clock, fake doors.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

import { handoverOutcome, HOST_HANDOVER_WAIT_MS, POLL_MS, watchImport } from '../src/client/import-watch.mjs'

const RESULT = { webrootKey: 'wr-key', dbKey: 'db-key', liveSite: 'https://oldsite.example' }
const RUNNING = { state: 'running', step: 'reading_files' }
const DONE = { state: 'done', step: 'handing_over', result: RESULT }

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }))
afterEach(() => mock.timers.reset())

const flush = () => new Promise((resolve) => setImmediate(resolve))
async function tick(times = 1) {
  for (let i = 0; i < times; i++) {
    mock.timers.tick(POLL_MS)
    await flush()
  }
}

/** A watch over a scripted status door; `provisions` are answered in order (the last repeats). */
function watch({ answers, provisions = [{ jobId: 'job-1' }], latch = { current: false }, hold } = {}) {
  const log = { polls: 0, provisioned: [], events: [] }
  const stop = watchImport({
    runId: 'run-1',
    poll: async () => answers[Math.min(log.polls++, answers.length - 1)],
    provision: async (result) => {
      log.provisioned.push(result)
      if (hold) await hold
      return provisions[Math.min(log.provisioned.length - 1, provisions.length - 1)]
    },
    latch,
    effects: {
      lost: () => log.events.push(['lost']),
      failed: (run) => log.events.push(['failed', run.error]),
      progress: (run) => log.events.push(['progress', run.step]),
      handedOver: (jobId) => log.events.push(['handedOver', jobId]),
      handoverFailed: (code, result) => log.events.push(['handoverFailed', code, result])
    }
  })
  return { log, stop, latch }
}

test('a running read is shown as progress on every poll period', async () => {
  const { log, stop } = watch({ answers: [RUNNING] })
  await tick(3)
  assert.deepEqual(log.events, [
    ['progress', 'reading_files'],
    ['progress', 'reading_files'],
    ['progress', 'reading_files']
  ])
  stop()
})

test('a finished read is handed over exactly once, then the wizard leaves the spinner', async () => {
  const { log } = watch({ answers: [RUNNING, DONE] })
  await tick(6)
  assert.deepEqual(log.provisioned, [RESULT])
  assert.deepEqual(log.events, [
    ['progress', 'reading_files'],
    ['handedOver', 'job-1']
  ])
  assert.equal(log.polls, 2, 'the poll stops with the handover')
})

test('two polls in flight that both read done provision once — the latch, not the interval, guards it', async () => {
  const answers = []
  const log = { provisioned: 0, events: [] }
  watchImport({
    runId: 'run-1',
    poll: () => new Promise((resolve) => answers.push(resolve)),
    provision: async () => {
      log.provisioned += 1
      return { jobId: 'job-1' }
    },
    latch: { current: false },
    effects: { handedOver: (jobId) => log.events.push(jobId) }
  })
  await tick(2) // two asks are out before either is answered
  assert.equal(answers.length, 2)
  for (const answer of answers) answer(DONE)
  await flush()
  assert.equal(log.provisioned, 1)
  assert.deepEqual(log.events, ['job-1'])
})

test('a latch already taken (a manual retry is out) blocks the automatic handover', async () => {
  const { log } = watch({ answers: [DONE], latch: { current: true } })
  await tick(3)
  assert.deepEqual(log.provisioned, [])
  assert.deepEqual(log.events, [])
})

test('a refused handover is reported with its code and the keys, so the retry can reuse them', async () => {
  const { log } = watch({ answers: [DONE], provisions: [{ code: 'store_refused' }] })
  await tick(2)
  assert.deepEqual(log.events, [['handoverFailed', 'store_refused', RESULT]])
})

test('a watch stopped while the handover is out drops its answer', async () => {
  let release
  const hold = new Promise((resolve) => (release = resolve))
  const { log, stop } = watch({ answers: [DONE], hold })
  await tick(1)
  stop()
  release()
  await flush()
  assert.deepEqual(log.events, [])
})

test('a run the host forgot, or one that errored, ends the watch on the connect step', async () => {
  const lost = watch({ answers: ['lost'] })
  await tick(1)
  assert.deepEqual(lost.log.events, [['lost']])
  const errored = watch({ answers: [{ state: 'error', error: 'wrong_credentials' }] })
  await tick(1)
  assert.deepEqual(errored.log.events, [['failed', 'wrong_credentials']])
})

test('a missed poll is not news: nothing is reported and the next period asks again', async () => {
  const { log, stop } = watch({ answers: [null, RUNNING] })
  await tick(2)
  assert.deepEqual(log.events, [['progress', 'reading_files']])
  stop()
})

// #1652: the host hands a finished read over itself; the wizard follows that build, never a second one.
const PENDING = { ...DONE, handover: { state: 'pending' } }
const FILED = { ...DONE, handover: { state: 'filed', jobId: 'host-job' } }

test('#1652 tab open: the wizard waits for the host and follows the job it filed, filing none', async () => {
  const { log } = watch({ answers: [RUNNING, PENDING, PENDING, FILED] })
  await tick(6)
  assert.deepEqual(log.provisioned, [], 'the wizard filed no build of its own')
  assert.deepEqual(log.events, [
    ['progress', 'reading_files'],
    ['progress', 'handing_over'],
    ['progress', 'handing_over'],
    ['handedOver', 'host-job']
  ])
  assert.equal(log.polls, 4, 'the poll stops with the handover')
})

test('#1652 tab reopened mid-build: the first poll already names the host job, and it is followed', async () => {
  const { log } = watch({ answers: [FILED] })
  await tick(3)
  assert.deepEqual(log.provisioned, [])
  assert.deepEqual(log.events, [['handedOver', 'host-job']])
})

test('#1652 a host that never reaches tracy-web: the open tab hands over itself after the wait', async () => {
  const { log } = watch({ answers: [PENDING] })
  const waits = HOST_HANDOVER_WAIT_MS / POLL_MS
  await tick(waits)
  assert.deepEqual(log.provisioned, [], 'still waiting for the host')
  await tick(1)
  assert.deepEqual(log.provisioned, [RESULT])
  assert.deepEqual(log.events.at(-1), ['handedOver', 'job-1'])
})

test('#1652 a host that refused, or a run with no host handover: the wizard hands over at once', async () => {
  for (const answer of [{ ...DONE, handover: { state: 'refused', code: 'NOT_SIGNED_IN' } }, DONE]) {
    const { log } = watch({ answers: [answer] })
    await tick(1)
    assert.deepEqual(log.provisioned, [RESULT])
    assert.deepEqual(log.events, [['handedOver', 'job-1']])
  }
})

test("#1652 the wizard's request meets the host's in flight (TAKEN): the run is asked again, one build", async () => {
  const { log } = watch({ answers: [DONE, FILED], provisions: [{ code: 'TAKEN' }] })
  await tick(3)
  assert.equal(log.provisioned.length, 1, 'no second build request')
  assert.deepEqual(log.events, [['handedOver', 'host-job']])
})

test('#1652 a TAKEN that is not the host: asked once more, and the answer is believed', async () => {
  const { log } = watch({ answers: [DONE], provisions: [{ code: 'TAKEN' }] })
  await tick(3)
  assert.equal(log.provisioned.length, 2)
  assert.deepEqual(log.events, [['handoverFailed', 'TAKEN', RESULT]])
})

// After the wait the wizard asks itself; a `TAKEN` while the host's request is still pending is the
// host building, never a failure: the wizard goes back to following the host.
const REFUSED = { ...DONE, handover: { state: 'refused', code: 'TAKEN' } }
const pastTheWait = (...after) => [...Array(HOST_HANDOVER_WAIT_MS / POLL_MS + 1).fill(PENDING), ...after]

test('#1652 TAKEN after the wait while the host is pending: the wizard follows the host, no failure', async () => {
  const { log, stop } = watch({
    answers: pastTheWait(PENDING, PENDING, PENDING, FILED),
    provisions: [{ code: 'TAKEN' }]
  })
  await tick(HOST_HANDOVER_WAIT_MS / POLL_MS + 1)
  assert.equal(log.provisioned.length, 1)
  await tick(6)
  assert.equal(log.provisioned.length, 1, 'no second request while the host is building')
  assert.ok(!log.events.some(([e]) => e === 'handoverFailed'), JSON.stringify(log.events.at(-1)))
  assert.deepEqual(log.events.at(-1), ['handedOver', 'host-job'])
  const polls = log.polls
  await tick(3)
  assert.equal(log.polls, polls, 'the poll stops with the handover')
  stop()
})

test('#1652 a host still pending long after a TAKEN is followed, never reported as failed', async () => {
  const { log, stop } = watch({ answers: [PENDING], provisions: [{ code: 'TAKEN' }] })
  await tick(HOST_HANDOVER_WAIT_MS / POLL_MS + 40)
  assert.equal(log.provisioned.length, 1)
  assert.ok(!log.events.some(([e]) => e === 'handoverFailed'))
  assert.deepEqual(log.events.at(-1), ['progress', 'handing_over'])
  stop()
})

test('#1652 the host followed after a TAKEN refuses in the end: the wizard asks once more and believes it', async () => {
  const { log } = watch({
    answers: pastTheWait(PENDING, PENDING, REFUSED),
    provisions: [{ code: 'TAKEN' }, { jobId: 'job-2', reused: true }]
  })
  await tick(HOST_HANDOVER_WAIT_MS / POLL_MS + 8)
  assert.equal(log.provisioned.length, 2)
  assert.deepEqual(log.events.at(-1), ['handedOver', 'job-2'])
})

const OUTCOMES = [
  {
    name: 'a job → handed over',
    provisioned: { jobId: 'job-9' },
    outcome: { at: 'handed_over', jobId: 'job-9' }
  },
  {
    name: 'a code → handover failed',
    provisioned: { code: 'ALREADY_PROVISIONED' },
    outcome: { at: 'handover_failed', code: 'ALREADY_PROVISIONED' }
  }
]
for (const { name, provisioned, outcome } of OUTCOMES) {
  test(`handover outcome: ${name}`, () => {
    assert.deepEqual(handoverOutcome(provisioned), outcome)
  })
}

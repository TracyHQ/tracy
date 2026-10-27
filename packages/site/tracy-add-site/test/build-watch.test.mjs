#!/usr/bin/env node
/**
 * The wizard's watch on a started build: when it stops asking, what it does with each answer, and
 * how the agent press and the wait for the agent count time (#362). Fake clock, fake job door.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'

import { START_PATIENCE_MS } from '../src/client/agent-start.mjs'
import {
  agentWaitVerdict,
  buildLanding,
  pressAgent,
  UNREACHABLE_SAY_MS,
  watchBuild
} from '../src/client/build-watch.mjs'

const POLL = 2000
const RUNNING = { state: 'running', step: 'provision', output: '' }
const FAILED = { state: 'failed', step: 'provision', detail: 'see log', output: '!! no image' }
const DONE = { state: 'done', step: 'done', liveUrl: 'https://dead.tracy.ai' }

beforeEach(() => mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] }))
afterEach(() => mock.timers.reset())

/** Let pending promise callbacks run; timers are fake, so this waits for nothing. */
const flush = () => new Promise((resolve) => setImmediate(resolve))

/** Advance the fake clock `ms`, letting each answer land before the next tick. */
async function advance(ms) {
  for (let left = ms; left > 0; left -= POLL) {
    mock.timers.tick(Math.min(POLL, left))
    await flush()
  }
}

/** A watch over a scripted door: `answers` are used in order, the last one repeats. */
function watch(answers, stage = {}) {
  const state = {
    stage: {
      at: 'building',
      siteKey: 'dead.tracy.ai',
      jobId: 'job-dead',
      platform: 'wordpress',
      seen: '',
      ...stage
    },
    asked: 0,
    forgotten: [],
    remembered: [],
    formShown: 0,
    formNotes: [],
    agentBases: [],
    shown: []
  }
  const stop = watchBuild({
    siteKey: 'dead.tracy.ai',
    jobId: 'job-dead',
    ask: async () => answers[Math.min(state.asked++, answers.length - 1)],
    getStage: () => state.stage,
    effects: {
      forget: (id) => state.forgotten.push(id),
      showForm: (note) => {
        state.formShown += 1
        state.formNotes.push(note)
        state.stage = { at: 'form' }
      },
      startAgent: (base) => state.agentBases.push(base),
      remember: (id, seen) => state.remembered.push([id, seen]),
      show: (next) => {
        state.shown.push(next)
        state.stage = next
      }
    }
  })
  return { state, stop }
}

test('watch: the first ask comes one poll period after the start, not at once', async () => {
  const { state, stop } = watch([RUNNING])
  await advance(POLL - 1)
  assert.equal(state.asked, 0)
  await advance(1)
  assert.equal(state.asked, 1)
  stop()
})

// One row per way a build ends: how many asks it took, and what was left behind.
const ENDINGS = [
  { name: 'failed', answers: [RUNNING, FAILED], asks: 2, forgotten: [], form: 0, agent: 0 },
  {
    name: 'gone (403)',
    answers: [RUNNING, { state: 'gone' }],
    asks: 2,
    forgotten: ['job-dead'],
    form: 1,
    agent: 0
  },
  {
    name: 'failed on the very first ask (dead build after a reload)',
    answers: [FAILED],
    asks: 1,
    forgotten: [],
    form: 0,
    agent: 0
  },
  {
    name: 'gone on the very first ask',
    answers: [{ state: 'gone' }],
    asks: 1,
    forgotten: ['job-dead'],
    form: 1,
    agent: 0
  },
  { name: 'done', answers: [RUNNING, DONE], asks: 2, forgotten: [], form: 0, agent: 1 }
]
for (const row of ENDINGS) {
  test(`watch: a build that ends ${row.name} is asked ${row.asks}x and never again`, async () => {
    const { state } = watch(row.answers)
    await advance(POLL * 10)
    assert.equal(state.asked, row.asks)
    assert.deepEqual(state.forgotten, row.forgotten)
    assert.equal(state.formShown, row.form)
    assert.equal(state.agentBases.length, row.agent)
  })
}

test('watch: a build that is gone says so on the form, never a silent return to it', async () => {
  const { state } = watch([RUNNING, { state: 'gone' }])
  await advance(POLL * 3)
  assert.deepEqual(state.formNotes, ['gone'])
})

test('watch: an ended session stops asking and keeps the build and its last milestones', async () => {
  const { state } = watch([RUNNING, { state: 'unknown', pollIssue: 'signed_out' }])
  await advance(POLL * 10)
  assert.equal(state.asked, 2)
  assert.equal(state.stage.signedOut, true)
  assert.equal(state.stage.job.state, 'unknown')
  assert.equal(state.stage.job.step, 'provision')
  assert.equal(state.stage.seen, '\nprovision')
  assert.deepEqual(state.forgotten, [])
})

test('watch: the first missed answer replaces the running state and retains its last detail', async () => {
  const { state, stop } = watch([
    { ...RUNNING, detail: 'Preparing content' },
    { state: 'unknown', detail: '' }
  ])
  await advance(POLL * 2)
  assert.equal(state.stage.job.state, 'unknown')
  assert.equal(state.stage.job.detail, 'Preparing content')
  assert.equal(state.stage.seen, '\nprovision')
  assert.equal(state.stage.slow, false)
  stop()
})

test('watch: known queued and running builds become slow after two minutes and still finish', async () => {
  const answers = [...Array(60).fill({ state: 'queued' }), RUNNING, DONE]
  const { state } = watch(answers)
  await advance(UNREACHABLE_SAY_MS - POLL)
  assert.equal(state.stage.slow, false)
  await advance(POLL)
  assert.equal(state.stage.slow, true)
  await advance(POLL * 2)
  assert.equal(state.agentBases.length, 1)
  assert.equal(state.agentBases[0].job.state, 'done')
})

test('watch: a slow build becomes only its terminal failure when it fails', async () => {
  const { state } = watch([...Array(60).fill(RUNNING), FAILED])
  await advance(UNREACHABLE_SAY_MS)
  assert.equal(state.stage.slow, true)
  await advance(POLL)
  assert.equal(state.stage.job.state, 'failed')
  assert.equal(state.stage.slow, false)
  assert.equal(state.stage.unreachable, false)
})

test('watch: a resumed build with no job yet shows an unknown first answer immediately', async () => {
  const { state, stop } = watch([{ state: 'unknown' }], { job: null, seen: 'last milestone' })
  await advance(POLL)
  assert.equal(state.stage.job.state, 'unknown')
  assert.equal(state.stage.seen, 'last milestone')
  stop()
})

test('watch: two minutes of unanswered asks are said on the console, it keeps asking, and an answer clears it', async () => {
  // 16/10/2026: a host answering 5xx (read as `unknown`) left the spinner turning with no word at all.
  const UNKNOWN = { state: 'unknown' }
  const answers = [...Array(70).fill(UNKNOWN), RUNNING]
  const { state, stop } = watch(answers)
  await advance(UNREACHABLE_SAY_MS - POLL)
  assert.equal(state.stage.unreachable, false, 'not yet: one bad stretch is not news')
  await advance(POLL * 2)
  assert.equal(state.stage.unreachable, true)
  assert.equal(state.stage.job.state, 'unknown')
  assert.equal(state.stage.slow, false, 'an unreachable build does not become a slow build')
  const asked = state.asked
  await advance(POLL * 3)
  assert.ok(state.asked > asked, 'it keeps asking')
  await advance(POLL * 20)
  assert.equal(state.stage.unreachable, false, 'an answer clears it')
  stop()
})

test('watch: a failed build shows the host detail and output and keeps its pointer', async () => {
  const { state } = watch([FAILED])
  await advance(POLL)
  assert.equal(state.stage.job.detail, 'see log')
  assert.equal(state.stage.job.output, '!! no image')
  assert.deepEqual(state.forgotten, [], 'the pointer stays until "Try again"')
})

test('watch: a done build hands the press its job, platform and milestones, and shows nothing itself', async () => {
  const { state } = watch([DONE], { seen: 'a\nb', forkUrl: 'https://f.example' })
  await advance(POLL)
  assert.deepEqual(state.agentBases, [
    {
      siteKey: 'dead.tracy.ai',
      jobId: 'job-dead',
      platform: 'wordpress',
      job: DONE,
      seen: 'a\nb',
      forkUrl: 'https://f.example'
    }
  ])
  assert.deepEqual(state.shown, [])
  assert.deepEqual(state.forgotten, [], 'the pointer outlives done: the agent is still to come up')
})

test('watch: running and unknown answers keep asking, one ask per period', async () => {
  const { state, stop } = watch([RUNNING, { state: 'unknown' }, RUNNING])
  await advance(POLL * 6)
  assert.equal(state.asked, 6)
  stop()
})

test('watch: milestones accumulate, and a repeated step is not added twice', async () => {
  const step = (s) => ({ state: 'running', step: s })
  const { state, stop } = watch([step('a'), step('a'), step('b')])
  await advance(POLL * 3)
  assert.equal(state.stage.seen, '\na\nb')
  assert.deepEqual(state.remembered, [
    ['job-dead', '\na'],
    ['job-dead', '\na\nb']
  ])
  stop()
})

test('watch: stopping cancels the next ask, and an answer that lands afterwards changes nothing', async () => {
  const { state, stop } = watch([RUNNING, RUNNING])
  await advance(POLL)
  stop()
  await advance(POLL * 5)
  assert.equal(state.asked, 1)

  const late = watch([{ state: 'gone' }])
  mock.timers.tick(POLL)
  late.stop() // the answer is still in flight
  await flush()
  assert.deepEqual(late.state.forgotten, [])
  assert.equal(late.state.formShown, 0)
})

test('watch: an answer for a job no longer on screen is dropped', async () => {
  const { state } = watch([{ state: 'gone' }], { jobId: 'another-job' })
  await advance(POLL)
  assert.deepEqual(state.forgotten, [])
  assert.equal(state.formShown, 0)
})

// The agent press ------------------------------------------------------------------------------

/** A press the test releases by hand. */
function heldPress() {
  let release
  const promise = new Promise((resolve) => (release = resolve))
  return { press: () => promise, release }
}

function pressing({ press, mounted = () => true }) {
  const state = { stage: { at: 'building' }, shown: [] }
  const base = { siteKey: 'dead.tracy.ai', jobId: 'job-dead', platform: 'wordpress', job: DONE, seen: '' }
  const done = pressAgent({
    base,
    press,
    getStage: () => state.stage,
    show: (next) => {
      state.shown.push(next)
      state.stage = next
    },
    isMounted: mounted
  })
  return { state, base, done }
}

test('press: the screen leaves the build at once, while the press is still out', async () => {
  const held = heldPress()
  const { state } = pressing(held)
  assert.equal(state.stage.at, 'starting')
  assert.equal(state.stage.posting, true)
  held.release(true)
})

test('press: an accepted press starts the patience clock from the ANSWER', async () => {
  const held = heldPress()
  const { state, done } = pressing(held)
  const pressedAt = state.stage.since
  mock.timers.tick(START_PATIENCE_MS + 60_000) // held open past the patience window
  held.release(true)
  await done
  assert.equal(state.stage.at, 'starting')
  assert.equal(state.stage.posting, false)
  assert.equal(state.stage.since - pressedAt, START_PATIENCE_MS + 60_000)
})

test('press: a refused press ends on the handover with the agent failed, once', async () => {
  const { state, base, done } = pressing({ press: async () => false })
  await done
  assert.deepEqual(state.stage, { at: 'ready', ...base, agent: 'failed' })
  assert.equal(state.shown.length, 2, 'starting, then the refusal')
})

test('press: a door that throws reads as refused', async () => {
  const { state, done } = pressing({
    press: async () => {
      throw new Error('network')
    }
  })
  await done
  assert.equal(state.stage.agent, 'failed')
})

test('press: a late answer never brings back a screen the person has left', async () => {
  const held = heldPress()
  const { state, done } = pressing(held)
  state.stage = { at: 'form' }
  held.release(false)
  await done
  assert.deepEqual(state.stage, { at: 'form' })
})

test('press: a late answer sets nothing once the wizard is gone', async () => {
  const held = heldPress()
  let mounted = true
  const { state, done } = pressing({ press: held.press, mounted: () => mounted })
  mounted = false
  held.release(false)
  await done
  assert.equal(state.shown.length, 1, 'only the initial move to starting')
})

// The wait for the agent -----------------------------------------------------------------------

const waiting = (over = {}) => ({ siteKey: 'dead.tracy.ai', since: Date.now(), posting: false, ...over })
const rows = (agent) => [{ siteKey: 'dead.tracy.ai', agent }]

test('wait: while the press is out, only an agent that is up ends the wait', () => {
  const stage = waiting({ posting: true })
  mock.timers.tick(START_PATIENCE_MS + 60_000)
  assert.equal(agentWaitVerdict({ rows: rows(null), stage, now: Date.now() }), null)
  assert.equal(agentWaitVerdict({ rows: rows('lane-dead'), stage, now: Date.now() }), 'up')
})

test('wait: patience is measured from the answer — still waiting just before it, failed at it', () => {
  const stage = waiting()
  mock.timers.tick(START_PATIENCE_MS - 30_000)
  assert.equal(agentWaitVerdict({ rows: rows(null), stage, now: Date.now() }), null)
  mock.timers.tick(30_000)
  assert.equal(agentWaitVerdict({ rows: rows(null), stage, now: Date.now() }), 'failed')
})

// Where a started build shows -------------------------------------------------------------------

const LANDINGS = [
  { from: 'create', inSite: false, landing: 'console' },
  { from: 'create', inSite: true, landing: 'console' },
  { from: 'import', inSite: false, landing: 'console' },
  { from: 'import', inSite: true, landing: 'background' }
]
for (const { from, inSite, landing } of LANDINGS) {
  test(`landing: ${from} pressed ${inSite ? 'inside a site' : 'in the creation workspace'} → ${landing}`, () => {
    assert.equal(buildLanding({ from, inSite }), landing)
  })
}

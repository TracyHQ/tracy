// The build chat's progress as data (#608): the task list in plain words, its counts, the timer and the outcome,
// drawn from the Contract B progress stream and outcome. A stopped build carries no technical detail to the owner.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cancelledOf, clockOf, progressOf, stoppedOf } from '../src/build-chat/index.mjs'
import { SCENARIOS, STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const stage = (name) => stageDocuments(STAGES.find((s) => s.name === name)).scenario

test('while building: the last progress event ticks the list, the clock runs, no outcome yet', () => {
  const p = progressOf(stage('building').runs.at(-1))
  assert.equal(p.running, true)
  assert.equal(p.result, null)
  assert.equal(p.kind, 'build')
  assert.equal(p.elapsedSeconds, 38)
  assert.deepEqual(p.counts, { done: 1, running: 5, pending: 3, failed: 0 })
  assert.equal(p.items[0].state, 'done')
  assert.equal(p.items[1].state, 'running')
})

test('the list has no site check step: it ends with the write step, and done follows it', () => {
  const p = progressOf(stage('done').runs.at(-1))
  assert.equal(p.result, 'done')
  assert.equal(p.running, false)
  assert.equal(p.items.at(-1).label, 'Put your pages on the site')
  assert.ok(p.items.every((i) => !/check|verify/i.test(i.label)))
  assert.deepEqual(p.counts, { done: 9, running: 0, pending: 0, failed: 0 })
  assert.equal(p.elapsedSeconds, 448)
})

test('a step of a kind the list does not know (a site check) never reaches the owner', () => {
  const run = structuredClone(stage('done').runs.at(-1))
  run.outcome.steps.splice(-1, 0, {
    id: 'site-check',
    kind: 'site-check',
    label: 'Check the site',
    state: 'done'
  })
  assert.ok(progressOf(run).items.every((i) => i.id !== 'site-check'))
})

test('a stopped build is never done: the failed step says so, what never ran says not started', () => {
  const p = progressOf(stage('could-not-finish').runs.at(-1))
  assert.equal(p.result, 'stopped')
  assert.equal(p.running, false)
  assert.deepEqual(p.counts, { done: 7, running: 0, pending: 1, failed: 1 })
  const failed = p.items.find((i) => i.state === 'failed')
  assert.equal(failed.label, 'Draw 2 pictures for empty spots')
  assert.equal(failed.note, 'failed-twice')
  assert.equal(p.items.at(-1).note, 'not-started')
  assert.equal(p.elapsedSeconds, 372)
})

test('the stopped notice keeps the work and carries no technical detail', () => {
  const run = stage('could-not-finish').runs.at(-1)
  const s = stoppedOf(run.outcome)
  assert.deepEqual(s, {
    step: 'Draw 2 pictures for empty spots',
    twice: true,
    writtenPages: 5,
    siteUnchanged: true,
    teamNotified: true
  })
  assert.ok(!JSON.stringify(s).includes(run.outcome.stopped.reason), 'the fault reason stays with the team')
  assert.equal(stoppedOf(SCENARIOS.done.runs[0].outcome), null, 'a done build has no stopped notice')
})

test('a step that failed once and was not run again says failed, not failed twice', () => {
  const run = stage('stopped-without-rerun').runs.at(-1)
  const p = progressOf(run)
  assert.equal(p.result, 'stopped')
  assert.equal(p.items.find((i) => i.state === 'failed').note, 'failed')
  assert.equal(stoppedOf(run.outcome).twice, false)
  // Without noRerun, a failed step failed on its second run.
  const twice = structuredClone(run)
  for (const s of twice.outcome.steps.filter((x) => x.state === 'failed')) {
    s.attempt = 2
    delete s.noRerun
  }
  assert.equal(progressOf(twice).items.find((i) => i.state === 'failed').note, 'failed-twice')
  assert.equal(stoppedOf(twice.outcome).twice, true)
})

test('a cancelled build is neither done nor failed: finished steps completed, the rest not started, clock stopped', () => {
  const run = stage('cancelled').runs.at(-1)
  const p = progressOf(run)
  assert.equal(p.result, 'cancelled')
  assert.equal(p.running, false)
  assert.deepEqual(p.counts, { done: 7, running: 0, pending: 2, failed: 0 })
  assert.ok(p.items.every((i) => i.state !== 'failed'))
  assert.deepEqual(
    p.items.slice(-2).map((i) => i.note),
    ['not-started', 'not-started']
  )
  assert.equal(p.elapsedSeconds, 372)
  assert.equal(stoppedOf(run.outcome), null, 'a cancel is not a stop')
})

test('the cancelled notice keeps the plan, leaves the site, and never says the team was told', () => {
  const run = stage('cancelled').runs.at(-1)
  assert.deepEqual(cancelledOf(run.outcome), { siteUnchanged: true, teamNotified: false })
  assert.equal(cancelledOf(stage('stopped-without-rerun').runs.at(-1).outcome), null)
  assert.equal(cancelledOf(SCENARIOS.done.runs[0].outcome), null)
})

test('an unknown future result is not done: it stays running, no step is invented as finished', () => {
  const run = structuredClone(stage('cancelled').runs.at(-1))
  run.outcome.result = 'paused'
  delete run.outcome.cancelled
  const p = progressOf(run)
  assert.equal(p.result, null)
  assert.equal(p.running, true)
  assert.equal(stoppedOf(run.outcome), null)
  assert.equal(cancelledOf(run.outcome), null)
  assert.ok(p.items.slice(-2).every((i) => i.state === 'pending' && i.note === null))
})

test('the clock reads minutes and seconds', () => {
  assert.equal(clockOf(0), '0:00')
  assert.equal(clockOf(7), '0:07')
  assert.equal(clockOf(372), '6:12')
  assert.equal(clockOf(448), '7:28')
  assert.equal(clockOf(3725), '62:05')
})

// The build chat's progress as data (#608): the task list in plain words, its counts, the timer and the outcome,
// drawn from the Contract B progress stream and outcome. A stopped build carries no technical detail to the owner.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clockOf, progressOf, stoppedOf } from '../src/build-chat/index.mjs'
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

test('the clock reads minutes and seconds', () => {
  assert.equal(clockOf(0), '0:00')
  assert.equal(clockOf(7), '0:07')
  assert.equal(clockOf(372), '6:12')
  assert.equal(clockOf(448), '7:28')
  assert.equal(clockOf(3725), '62:05')
})

/**
 * A My opportunities row, option A (#537): Step n of 3 with three segments, the state of the current step and its one
 * action, read from the SAME stepper view the Details band draws (`stepperView`), so the list and Details agree.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-row-step.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createTranslate } from '@tracy/wo-views/strings'
import { rowStepOf } from '../src/client/row-step-model.ts'
import { stepperView } from '../src/client/stepper-model.ts'
import { en } from '../src/client/strings.ts'

const t = createTranslate(en)
const RESEARCHED = { state: 'done', researchedAt: '2026-11-09T11:00:00Z', done: true }
const BRIEF = { id: 'b-1', n: 1, createdAt: '2026-11-09T12:00:00Z' }
const FACTS_OK = { profile: 'approved', profileApprovedAt: '2026-11-09T11:30:00Z' }

/** The row as the seller reads it: kicker, segments, state line, tone and the action's words and look. */
function read(input) {
  const row = rowStepOf(stepperView(input))
  return {
    kicker: t(row.kickerKey, row.kickerParams),
    segments: row.segments.join(' '),
    state: t(row.stateKey),
    tone: row.tone,
    action: row.action === null ? null : `${row.action.kind} | ${t(row.action.labelKey)} | ${row.action.look}`
  }
}

test('not started: step 1, Not started, primary Research business facts', () => {
  assert.deepEqual(
    read({
      research: { state: 'not_started', researchedAt: null, done: false },
      researchJob: null,
      demo: 'none'
    }),
    {
      kicker: 'Step 1 of 3',
      segments: 'current future future',
      state: 'Not started',
      tone: 'mute',
      action: 'start-research | Research business facts | primary'
    }
  )
})

test('researching: running state with a quiet Open', () => {
  const r = read({
    research: { state: 'running', researchedAt: null, done: false },
    researchJob: { state: 'running' },
    demo: 'none'
  })
  assert.equal(r.kicker, 'Step 1 of 3')
  assert.equal(r.state, 'Researching business facts…')
  assert.equal(r.tone, 'run')
  assert.equal(r.action, 'open | Open › | quiet')
})

test('research failed: Research failed with Try again', () => {
  const r = read({
    research: { state: 'failed', researchedAt: null, done: false },
    researchJob: { state: 'failed' },
    demo: 'none'
  })
  assert.equal(r.state, 'Research failed')
  assert.equal(r.tone, 'error')
  assert.equal(r.action, 'resume-research | Try again | primary')
})

test('facts need review: amber line and primary Review business facts, the header chip words', () => {
  const r = read({ research: RESEARCHED, demo: 'none', approval: { profile: 'needed' } })
  assert.equal(r.kicker, 'Step 1 of 3')
  assert.equal(r.state, 'Business facts need review')
  assert.equal(r.tone, 'warn')
  assert.equal(r.action, 'review-profile | Review business facts › | primary')
})

test('writing brief: step 2 running, Writing site content brief with Open', () => {
  const r = read({
    research: RESEARCHED,
    briefJob: { state: 'running', step: 'labelling' },
    demo: 'none',
    approval: FACTS_OK
  })
  assert.equal(r.kicker, 'Step 2 of 3')
  assert.equal(r.segments, 'done current future')
  assert.equal(r.state, 'Writing the site content brief…')
  assert.equal(r.action, 'open | Open › | quiet')
})

test('brief failed: the brief equivalent of Research failed, with Try again', () => {
  const r = read({
    research: RESEARCHED,
    briefJob: { state: 'failed', step: 'labelling', error: { code: 'VISION_TIMEOUT' } },
    demo: 'none',
    approval: FACTS_OK
  })
  assert.equal(r.state, 'Site content brief failed')
  assert.equal(r.tone, 'error')
  assert.equal(r.action, 'retry-brief | Try again | primary')
})

test('brief needs review: Site content brief needs review with primary Review site content brief', () => {
  const r = read({
    research: RESEARCHED,
    brief: BRIEF,
    demo: 'none',
    approval: { ...FACTS_OK, brief: 'needed' }
  })
  assert.equal(r.kicker, 'Step 2 of 3')
  assert.equal(r.state, 'Site content brief needs review')
  assert.equal(r.tone, 'warn')
  assert.equal(r.action, 'review-brief | Review site content brief › | primary')
})

test('building: step 3 running, Building your site with Open', () => {
  const r = read({
    research: RESEARCHED,
    brief: BRIEF,
    demo: 'building',
    approval: { ...FACTS_OK, brief: 'approved' }
  })
  assert.equal(r.kicker, 'Step 3 of 3')
  assert.equal(r.segments, 'done done current')
  assert.equal(r.state, 'Building your site…')
  assert.equal(r.tone, 'run')
  assert.equal(r.action, 'open | Open › | quiet')
})

test('build failed: Build failed with Try again', () => {
  const r = read({ research: RESEARCHED, brief: BRIEF, demo: 'failed' })
  assert.equal(r.state, 'Build failed')
  assert.equal(r.action, 'retry-build | Try again | primary')
})

test('done: All steps done, three done segments, Site ready, outlined Open your site', () => {
  assert.deepEqual(read({ research: RESEARCHED, brief: BRIEF, demo: 'ready' }), {
    kicker: 'All steps done',
    segments: 'done done done',
    state: 'Site ready',
    tone: 'ok',
    action: 'open-site | Open your site › | outline'
  })
})

test('the row and the band show the same step and the same action key', () => {
  const input = {
    research: RESEARCHED,
    brief: BRIEF,
    demo: 'none',
    approval: { ...FACTS_OK, brief: 'needed' }
  }
  const view = stepperView(input)
  const row = rowStepOf(view)
  assert.equal(row.at, view.steps.findIndex((s) => s.id === view.current) + 1)
  assert.equal(row.action?.kind, view.action?.kind)
  assert.equal(row.action?.labelKey, view.action?.labelKey)
})

test('no on-screen word of the row carries a long dash', () => {
  for (const key of [
    'row.researching',
    'row.failed.research',
    'row.failed.brief',
    'row.open',
    'row.openSite'
  ])
    assert.doesNotMatch(en[key], /[–—]/)
})

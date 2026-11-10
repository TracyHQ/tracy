/**
 * The seller's approvals on the three steps (#537): the Profile is reviewed and approved before the Content brief,
 * the brief before the build; an edit after approval asks for review again and marks the brief stale; a source added
 * after research asks for research again. Also the header chip and the Progress band's sub-steps from the server.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-approval-steps.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bandSubSteps, reviewChipOf, stepperView } from '../src/client/stepper-model.ts'
import { en } from '../src/client/strings.ts'

const RESEARCHED = { state: 'done', researchedAt: '2026-11-09T11:22:00Z', done: true }
const BRIEF = { id: 'b-1', n: 1, createdAt: '2026-11-09T12:00:00Z' }
const OK = { research: 'ok', profile: 'approved', profileApprovedAt: '2026-11-09T11:40:00Z' }
const states = (view) => view.steps.map((s) => s.state).join(' ')
const view = (over) =>
  stepperView({ research: RESEARCHED, researchJob: { state: 'completed' }, demo: 'none', ...over })

test('research done, Profile not approved: Research needs review, the brief is locked', () => {
  const v = view({ approval: { research: 'ok', profile: 'needed', brief: 'none' } })
  assert.equal(states(v), 'current future future')
  assert.equal(v.review, true)
  assert.deepEqual(v.action, { kind: 'review-profile', labelKey: 'stepper.reviewProfile' })
  assert.equal(v.steps[0].status.key, 'stepper.needsReview')
  assert.equal(v.steps[1].lockKey, 'stepper.lock.profile')
  assert.equal(reviewChipOf(v).key, 'chip.profileReview')
})

test('Profile approved, no brief: Make content brief, Research reads Approved on its date', () => {
  const v = view({ approval: { ...OK, brief: 'none' } })
  assert.equal(states(v), 'done current future')
  assert.equal(v.lineKey, 'stepper.brief.readyApproved')
  assert.equal(v.action.kind, 'make-brief')
  assert.deepEqual(v.steps[0].status, {
    key: 'stepper.approvedOn',
    params: { date: '2026-11-09T11:40:00Z' },
    tone: 'ok'
  })
  assert.equal(reviewChipOf(v).key, 'chip.profileApproved')
})

test('brief made, not approved: the brief needs review, Build is locked', () => {
  const v = view({ brief: BRIEF, approval: { ...OK, brief: 'needed' } })
  assert.equal(states(v), 'done current future')
  assert.deepEqual(v.action, { kind: 'review-brief', labelKey: 'stepper.reviewBrief' })
  assert.equal(v.steps[2].lockKey, 'stepper.lock.brief')
  assert.equal(reviewChipOf(v).key, 'chip.briefReview')
})

test('brief approved: Build your site', () => {
  const v = view({
    brief: BRIEF,
    approval: { ...OK, brief: 'approved', briefApprovedAt: '2026-11-09T12:10:00Z' }
  })
  assert.equal(states(v), 'done done current')
  assert.equal(v.action.kind, 'build')
  assert.equal(en[v.action.labelKey], 'Build your site')
  assert.equal(v.lineKey, 'stepper.build.readyApproved')
  assert.equal(reviewChipOf(v).key, 'chip.briefApproved')
})

test('a Profile edit after approval: review again, the brief reads Made from an older profile, Build locked', () => {
  const v = view({
    brief: BRIEF,
    approval: { research: 'ok', profile: 'needed', brief: 'stale', briefStale: 'profile' }
  })
  assert.equal(v.current, 'research')
  assert.equal(v.action.kind, 'review-profile')
  assert.equal(v.steps[1].staleKey, 'brief.chip.olderProfile')
  assert.equal(v.steps[1].lockKey, 'stepper.lock.profileAgain')
  assert.equal(v.steps[2].lockKey, 'stepper.lock.both')
  assert.equal(en['brief.chip.olderProfile'], 'Made from an older profile')
})

test('a source added after research: Research again, the brief made from older sources', () => {
  const v = view({
    brief: BRIEF,
    approval: { research: 'sources_changed', profile: 'none', brief: 'stale', briefStale: 'sources' }
  })
  assert.equal(v.current, 'research')
  assert.equal(v.lineKey, 'stepper.research.sourcesChanged')
  assert.deepEqual(v.action, { kind: 'research-again', labelKey: 'details.researchAgain' })
  assert.equal(v.steps[0].status.key, 'stepper.sourcesChanged')
  assert.equal(v.steps[1].staleKey, 'brief.chip.olderSources')
  assert.equal(reviewChipOf(v).key, 'chip.sourcesChanged')
  assert.equal(en['stepper.research.sourcesChanged'], 'Sources changed. Run research again.')
})

test('an approved stale brief is made again before the build', () => {
  const v = view({ brief: BRIEF, approval: { ...OK, brief: 'stale', briefStale: 'profile' } })
  assert.equal(v.current, 'brief')
  assert.deepEqual(v.action, { kind: 'make-brief', labelKey: 'brief.makeAgain' })
})

test('without approval (an older server) the steps read as before', () => {
  const v = view({ brief: BRIEF })
  assert.equal(states(v), 'done done current')
  assert.equal(v.lineKey, 'stepper.build.ready')
  assert.equal(v.review, false)
})

test('stepProgress: only the sub-steps of the asked step, with a known state', () => {
  const progress = {
    step: 'research',
    items: [
      { key: 'site', label: 'Website', state: 'done' },
      { key: 'social', label: 'Social pages', state: 'running' },
      { key: 'bad', label: 'Odd', state: 'exploded' },
      { key: 'none', state: 'waiting' }
    ]
  }
  assert.deepEqual(
    bandSubSteps(progress, 'research').map((s) => `${s.key}:${s.state}`),
    ['site:done', 'social:running']
  )
  assert.deepEqual(bandSubSteps(progress, 'brief'), [])
  assert.deepEqual(bandSubSteps(null, 'research'), [])
})

test('every string of the review steps is plain: no dash characters', () => {
  const keys = Object.keys(en).filter((k) =>
    /^(stepper|band|chip|approve|gate|source\.add|media\.(add|error|strip)|site\.(notYet|building))/.test(k)
  )
  assert.ok(keys.length > 40)
  for (const k of keys) assert.doesNotMatch(en[k], /[–—]/, k)
})

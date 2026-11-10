/**
 * The seller's approvals on the three steps (#537): the Profile is reviewed and approved before the Content brief,
 * the brief before the build; an edit after approval asks for review again; a source added after research asks for
 * research again. A reset upstream clears everything after it on screen (nothing old is shown, no chips). Also the header chip and the Progress band's sub-steps from the server.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-approval-steps.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bandSubSteps, effectiveOf, reviewChipOf, stepperView } from '../src/client/stepper-model.ts'
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
  assert.equal(v.estimateKey, 'stepper.estimate.brief')
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
  assert.equal(v.estimateKey, 'stepper.estimate.build')
  assert.equal(reviewChipOf(v).key, 'chip.briefApproved')
})

test('a Profile edit after approval: review again, the brief and the build read as not made and locked', () => {
  const v = view({
    brief: BRIEF,
    demo: 'ready',
    approval: { research: 'ok', profile: 'needed', brief: 'stale', briefStale: 'profile' }
  })
  assert.equal(v.current, 'research')
  assert.equal(v.action.kind, 'review-profile')
  assert.equal(v.steps[1].lockKey, 'stepper.lock.profile')
  assert.equal(v.steps[2].lockKey, 'stepper.lock.both')
  assert.equal(v.steps[2].state, 'future')
  assert.equal('staleKey' in v.steps[1], false)
})

test('sources are fixed once research starts: no step asks for research again because of sources', () => {
  const v = view({ brief: BRIEF, demo: 'ready', approval: { research: 'ok', profile: 'none' } })
  assert.equal(v.current, 'research')
  assert.equal(v.action.kind, 'review-profile')
  for (const key of ['stepper.research.sourcesChanged', 'stepper.sourcesChanged', 'chip.sourcesChanged'])
    assert.equal(en[key], undefined, key)
})

test('an approved stale brief reads as not made: Make the site content brief', () => {
  const v = view({ brief: BRIEF, approval: { ...OK, brief: 'stale', briefStale: 'profile' } })
  assert.equal(v.current, 'brief')
  assert.deepEqual(v.action, { kind: 'make-brief', labelKey: 'brief.make' })
  assert.equal(v.steps[2].lockKey, 'stepper.lock.brief')
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

test('a brief made before the Profile was approved reads as not made, step 2 locked', () => {
  const v = view({ brief: BRIEF, approval: { research: 'ok', profile: 'needed', brief: 'needed' } })
  assert.equal(v.current, 'research')
  assert.equal(v.steps[1].lockKey, 'stepper.lock.profile')
})

test('once the Profile is approved after that brief: Make the site content brief', () => {
  const approval = {
    research: 'ok',
    profile: 'approved',
    profileApprovedAt: '2026-11-10T08:00:00Z',
    brief: 'needed'
  }
  const v = view({ brief: BRIEF, approval })
  assert.equal(v.current, 'brief')
  assert.deepEqual(v.action, { kind: 'make-brief', labelKey: 'brief.make' })
})

// The cascade in one table: what on screen still counts as made (brief, demo) for each state of the approvals.
const BUILT = '2026-11-09T13:00:00Z'
const CASCADE = [
  [
    'all approved, built after the approvals',
    { ...OK, brief: 'approved', briefApprovedAt: '2026-11-09T12:10:00Z' },
    'ready',
    BUILT,
    {},
    true,
    true
  ],
  [
    'brief approved after the site was built',
    { ...OK, brief: 'approved', briefApprovedAt: '2026-11-09T14:00:00Z' },
    'ready',
    BUILT,
    {},
    true,
    false
  ],
  ['brief not approved', { ...OK, brief: 'needed' }, 'ready', BUILT, {}, true, false],
  [
    'facts lost approval',
    { research: 'ok', profile: 'needed', brief: 'needed' },
    'ready',
    BUILT,
    {},
    false,
    false
  ],
  [
    'facts approved after the brief was made',
    { ...OK, profileApprovedAt: '2026-11-10T08:00:00Z', brief: 'needed' },
    'ready',
    BUILT,
    {},
    false,
    false
  ],
  ['brief marked stale', { ...OK, brief: 'stale', briefStale: 'profile' }, 'ready', BUILT, {}, false, false],
  [
    'research runs again',
    { ...OK, brief: 'approved', briefApprovedAt: '2026-11-09T12:10:00Z' },
    'ready',
    BUILT,
    { researchJob: { state: 'running' } },
    false,
    false
  ],
  ['no approvals from the server', null, 'ready', BUILT, {}, true, true]
]
for (const [name, approval, demo, demoAt, over, brief, built] of CASCADE) {
  test(`cascade: ${name}`, () => {
    const eff = effectiveOf({
      research: RESEARCHED,
      researchJob: { state: 'completed' },
      brief: BRIEF,
      demo,
      demoAt,
      approval,
      ...over
    })
    assert.equal(eff.brief != null, brief, 'brief counts as made')
    assert.equal(eff.demo === 'ready', built, 'site counts as built')
    if (!brief) assert.equal(eff.demo, 'none')
  })
}

test('the seller reads Business facts, never Profile, in the review copy', () => {
  assert.equal(en['details.section.profile'], 'Business facts')
  assert.equal(en['chip.profileReview'], 'Business facts need review')
  assert.equal(en['stepper.reviewProfile'], 'Review business facts ›')
  assert.equal(en['approve.profile'], 'Approve business facts and continue')
  const keys = Object.keys(en).filter((k) =>
    /^(stepper|band|chip|approve|gate|site\.notYet|brief\.chip)/.test(k)
  )
  for (const k of keys) assert.doesNotMatch(en[k], /\bprofile\b/i, k)
})

test('step 1 reads Research business facts, its first press too; Research again stays', () => {
  assert.equal(en['step.research'], 'Research business facts')
  assert.equal(en['job.start'], 'Research business facts')
  assert.equal(en['details.researchAgain'], 'Research again')
  assert.equal(en['stepper.lock.profile'], 'Approve the business facts first')
})

test('the steps read Research business facts, Write site content brief, Build your site', () => {
  assert.deepEqual(
    ['step.research', 'step.brief', 'step.build'].map((k) => en[k]),
    ['Research business facts', 'Write site content brief', 'Build your site']
  )
  assert.equal(en['details.section.brief'], 'Site content brief')
  assert.equal(en['chip.briefReview'], 'Site content brief needs review')
  assert.equal(en['brief.make'], 'Make site content brief')
  assert.equal(en['brief.refresh'], 'Refresh')
  assert.equal(en['stepper.lock.brief'], 'Approve the site content brief first')
  assert.equal(
    en['site.notYet.brief'],
    'Not available yet. Approve the site content brief, then build the site.'
  )
})

// "In progress" is only for a step that moves: a step that waits to be started reads Ready to start (real payload
// shape of a new place: research not_started, no job, no brief job).
const NOT_STARTED = { state: 'not_started', researchedAt: null, done: false }
const STATUS_CASES = [
  [
    'new place: research not started, no job',
    { research: NOT_STARTED, researchJob: null },
    0,
    'stepper.ready',
    'start-research'
  ],
  [
    'research job queued',
    { research: NOT_STARTED, researchJob: { state: 'queued' } },
    0,
    'stepper.running',
    null
  ],
  [
    'research job running',
    { research: { ...NOT_STARTED, state: 'running' }, researchJob: { state: 'running' } },
    0,
    'stepper.running',
    null
  ],
  [
    'research paused',
    { research: NOT_STARTED, researchJob: { state: 'paused' } },
    0,
    'stepper.paused',
    'resume-research'
  ],
  [
    'brief ready to make, no brief job',
    { approval: { ...OK, brief: 'none' }, briefJob: null },
    1,
    'stepper.ready',
    'make-brief'
  ],
  [
    'brief job running',
    { approval: { ...OK, brief: 'none' }, briefJob: { state: 'running', steps: [] } },
    1,
    'stepper.running',
    null
  ],
  [
    'build ready, no demo',
    {
      brief: BRIEF,
      approval: { ...OK, brief: 'approved', briefApprovedAt: '2026-11-09T12:10:00Z' },
      demo: 'none'
    },
    2,
    'stepper.ready',
    'build'
  ],
  [
    'build running',
    {
      brief: BRIEF,
      approval: { ...OK, brief: 'approved', briefApprovedAt: '2026-11-09T12:10:00Z' },
      demo: 'building'
    },
    2,
    'stepper.running',
    null
  ]
]
for (const [name, over, at, key, action] of STATUS_CASES)
  test(`status line: ${name}`, () => {
    const research = over.research ?? RESEARCHED
    const v = stepperView({ research, researchJob: { state: 'completed' }, demo: 'none', ...over })
    assert.equal(v.steps[at].state, 'current')
    assert.equal(v.steps[at].status.key, key)
    assert.equal(v.action?.kind ?? null, action)
  })

test('a new place reads Ready to start with the plain sentence and the Research business facts button', () => {
  const v = stepperView({ research: NOT_STARTED, researchJob: null, demo: 'none' })
  assert.equal(v.lineKey, 'stepper.research.notStarted')
  assert.equal(
    en['stepper.research.notStarted'],
    'Tracy reads the links you added and collects this business’s details.'
  )
  assert.equal(v.estimateKey, 'stepper.estimate.research')
  assert.equal(en['stepper.estimate.research'], 'Est. 2 to 4 min')
  assert.equal(en['stepper.estimate.brief'], 'Est. 2 min')
  assert.equal(en['stepper.estimate.build'], 'Est. 20+ min')
  assert.doesNotMatch(
    Object.values(en)
      .filter((x) => /^(Tracy reads|Reading the website|Business facts approved|Brief approved)/.test(x))
      .join(' '),
    /minutes/
  )
  assert.equal(en['stepper.ready'], 'Ready to start')
  assert.equal(en[v.action.labelKey], 'Research business facts')
})

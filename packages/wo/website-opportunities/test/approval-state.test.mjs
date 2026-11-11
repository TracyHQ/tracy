// The seller's approvals and the Progress card's sub steps of one opportunity (#537), as pure functions: table-driven
// cases of `approvalOf`, its two gates, and `stepProgressOf`.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { approvalOf, briefGateOf, buildGateOf } from '../src/approval.js'
import { stepProgressOf } from '../src/step-progress.js'

const T = (minute) => new Date(Date.UTC(2026, 10, 1, 10, minute)).toISOString()

const CASES = [
  {
    name: 'never researched: nothing to approve',
    opp: {},
    researchedAt: null,
    briefAt: null,
    want: { profile: 'none', brief: 'none', briefStale: null },
    gates: { brief: 'PROFILE_NOT_APPROVED', build: 'PROFILE_NOT_APPROVED' }
  },
  {
    name: 'researched, not approved',
    opp: {},
    researchedAt: T(1),
    briefAt: null,
    want: { profile: 'needed', brief: 'none', briefStale: null },
    gates: { brief: 'PROFILE_NOT_APPROVED', build: 'PROFILE_NOT_APPROVED' }
  },
  {
    name: 'Profile approved, no brief',
    opp: { profile_approved_at: T(2) },
    researchedAt: T(1),
    briefAt: null,
    want: { profile: 'approved', brief: 'none', briefStale: null },
    gates: { brief: null, build: 'BRIEF_NOT_APPROVED' }
  },
  {
    name: 'brief made, not approved',
    opp: { profile_approved_at: T(2) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'approved', brief: 'needed', briefStale: null },
    gates: { brief: null, build: 'BRIEF_NOT_APPROVED' }
  },
  {
    name: 'brief approved',
    opp: { profile_approved_at: T(2), brief_approved_at: T(4) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'approved', brief: 'approved', briefStale: null },
    gates: { brief: null, build: null }
  },
  {
    name: 'a newer brief than the approved one needs its own approval',
    opp: { profile_approved_at: T(2), brief_approved_at: T(4) },
    researchedAt: T(1),
    briefAt: T(5),
    want: { profile: 'approved', brief: 'needed', briefStale: null },
    gates: { build: 'BRIEF_NOT_APPROVED' }
  },
  {
    name: 'a Profile edit after the brief: Profile needed, brief stale (stale wins over approved)',
    opp: { profile_approved_at: null, brief_approved_at: T(4), profile_changed_at: T(6) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'needed', brief: 'stale', briefStale: 'profile' },
    gates: { brief: 'PROFILE_NOT_APPROVED', build: 'PROFILE_NOT_APPROVED' }
  },
  {
    name: 'Profile approved again after an edit: the brief stays stale until it is made again',
    opp: { profile_approved_at: T(7), brief_approved_at: T(4), profile_changed_at: T(6) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'approved', brief: 'stale', briefStale: 'profile' },
    gates: { brief: null, build: 'BRIEF_NOT_APPROVED' }
  },
  {
    name: 'a brief made before the Profile was approved reads stale, and the build waits',
    opp: { profile_approved_at: T(4) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'approved', brief: 'stale', briefStale: 'profile' },
    gates: { brief: null, build: 'BRIEF_NOT_APPROVED' }
  },
  {
    name: 'a brief made before the Profile approval stays stale even when the brief was approved',
    opp: { profile_approved_at: T(5), brief_approved_at: T(4) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'approved', brief: 'stale', briefStale: 'profile' },
    gates: { build: 'BRIEF_NOT_APPROVED' }
  },
  {
    name: 'a brief made before the Profile was approved, Profile not approved: brief needed, not stale',
    opp: {},
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'needed', brief: 'needed', briefStale: null },
    gates: { brief: 'PROFILE_NOT_APPROVED', build: 'PROFILE_NOT_APPROVED' }
  },
  {
    name: 'the brief made again after the Profile approval: needed, then approved',
    opp: { profile_approved_at: T(4), brief_approved_at: T(6) },
    researchedAt: T(1),
    briefAt: T(5),
    want: { profile: 'approved', brief: 'approved', briefStale: null },
    gates: { brief: null, build: null }
  },
  {
    name: 'a stored sources_changed_at (written before sources were fixed) changes nothing',
    opp: { sources_changed_at: T(6), profile_approved_at: T(2), brief_approved_at: T(4) },
    researchedAt: T(1),
    briefAt: T(3),
    want: { profile: 'approved', brief: 'approved', briefStale: null },
    gates: { brief: null, build: null }
  }
]

for (const c of CASES)
  test(`approvalOf: ${c.name}`, () => {
    const got = approvalOf({
      opportunity: c.opp,
      research: c.researchedAt
        ? { state: 'done', researchedAt: c.researchedAt }
        : { state: 'none', researchedAt: null },
      latestBriefAt: c.briefAt
    })
    for (const [k, v] of Object.entries(c.want)) assert.equal(got[k], v, k)
    if ('brief' in c.gates) assert.equal(briefGateOf(got), c.gates.brief, 'brief gate')
    if ('build' in c.gates) assert.equal(buildGateOf(got), c.gates.build, 'build gate')
  })

test('approvalOf answers ISO times, from Date or string', () => {
  const got = approvalOf({
    opportunity: { profile_approved_at: new Date(T(2)), sources_changed_at: T(1) },
    research: { researchedAt: T(1) },
    latestBriefAt: null
  })
  assert.equal(got.profileApprovedAt, T(2))
  assert.equal(got.briefApprovedAt, null)
  // Sources are fixed once research starts: the approval carries no research or sources state.
  assert.equal('research' in got, false)
  assert.equal('sourcesChangedAt' in got, false)
})

const chain = (states, state = 'queued') => ({
  state,
  acceptedAt: T(1),
  run: { steps: states.map((s, i) => ({ id: `s${i}`, label: `Step ${i}`, state: s })) }
})

const PROGRESS = [
  { name: 'nothing runs', input: {}, step: null, items: [] },
  {
    name: 'research runs: no finer data',
    input: { research: { state: 'running' } },
    step: 'research',
    items: []
  },
  {
    name: 'brief job labelling',
    input: { briefJob: { state: 'running', step: 'labelling', startedAt: T(1), updatedAt: T(2) } },
    step: 'brief',
    items: [
      ['reading', 'done', null],
      ['labelling', 'running', T(2)],
      ['writing', 'waiting', null]
    ]
  },
  {
    name: 'brief job failed while writing',
    input: { briefJob: { state: 'failed', step: 'writing', startedAt: T(1), updatedAt: T(3) } },
    step: 'brief',
    items: [
      ['reading', 'done', null],
      ['labelling', 'done', null],
      ['writing', 'failed', T(3)]
    ]
  },
  {
    name: 'a finished brief job is not a running step',
    input: { briefJob: { state: 'done', step: 'writing', startedAt: T(1), updatedAt: T(3) } },
    step: null,
    items: []
  },
  {
    name: 'chain build running',
    input: { demoAction: chain(['done', 'current', 'upcoming']), research: { state: 'running' } },
    step: 'build',
    items: [
      ['s0', 'done', null],
      ['s1', 'running', null],
      ['s2', 'waiting', null]
    ]
  },
  {
    name: 'chain build failed: the first step not done stopped',
    input: { demoAction: chain(['done', 'upcoming', 'upcoming'], 'failed') },
    step: 'build',
    items: [
      ['s0', 'done', null],
      ['s1', 'failed', null],
      ['s2', 'waiting', null]
    ]
  },
  {
    name: 'a build of another workflow records no chain',
    input: { demoAction: { state: 'queued', acceptedAt: T(1) } },
    step: 'build',
    items: []
  },
  {
    name: 'a completed build is not a running step',
    input: { demoAction: chain(['done', 'done', 'done'], 'completed') },
    step: null,
    items: []
  }
]

for (const c of PROGRESS)
  test(`stepProgressOf: ${c.name}`, () => {
    const got = stepProgressOf(c.input)
    assert.equal(got.step, c.step)
    assert.deepEqual(
      got.items.map((i) => [i.key, i.state, i.at]),
      c.items
    )
    for (const i of got.items) assert.equal(typeof i.label, 'string')
  })

/**
 * The Workspace card of Details (#537, option D): four sections in a fixed order, the current one open, finished ones
 * folded to a summary, reviews open with their chip, and locked or running ones a muted row with what they wait for.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-workspace-model.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { effectiveOf, stepperView } from '../src/client/stepper-model.ts'
import { en as STRINGS } from '../src/client/strings.ts'
import { readOpened, WORKSPACE_IDS, workspaceSections } from '../src/client/workspace-model.ts'

const NOT_STARTED = { state: 'not_started', researchedAt: null, done: false }
const RESEARCHED = { state: 'done', researchedAt: '2026-11-10T08:00:00Z', done: true }
const RERUNNING = { state: 'running', researchedAt: '2026-11-10T08:00:00Z', done: true }
const BRIEF = { id: 'b-4', n: 4, createdAt: '2026-11-10T10:00:00Z' }
const OLD_BRIEF = { id: 'b-4', n: 4, createdAt: '2026-11-09T10:00:00Z' }
const APPROVED = {
  profile: 'approved',
  profileApprovedAt: '2026-11-10T09:00:00Z',
  brief: 'approved',
  briefApprovedAt: '2026-11-10T11:00:00Z'
}

/** One place as Details reads it: the stepper inputs plus the counts of the card. */
function sectionsOf({
  research = RESEARCHED,
  job = { state: 'completed' },
  brief = null,
  briefJob = null,
  approval = { profile: 'none', brief: 'none' },
  demo = 'none',
  demoAt = null,
  opened = {},
  sources = null
}) {
  const input = { research, researchJob: job, briefJob, brief, demo, demoAt, approval }
  const stepper = stepperView(input)
  const effective = effectiveOf(input)
  const moving = research.state === 'running' || job?.state === 'running' || job?.state === 'queued'
  const briefEmpty = briefJob?.state === 'running' ? 'running' : null
  return workspaceSections({
    stepper,
    researchDone: research.done,
    researchMoving: moving,
    researchedAt: research.researchedAt,
    // The row states of the Sources table: three waiting links before research, two read and one not after it.
    sources:
      sources ??
      (research.done && !moving ? ['collected', 'collected', 'failed'] : ['waiting', 'waiting', 'waiting']),
    fields: 6,
    brief: effective.brief == null ? null : { n: brief.n },
    briefEmpty,
    demo: effective.demo,
    demoHost: effective.demo === 'ready' ? 'tennis-padel-coach.tracy.test' : null,
    opened,
    locale: 'en-US'
  })
}

/** A section in one short line: id, state, open or folded, and the summary as the row draws it. */
function line(s) {
  const text = s.summary
    .map((p) =>
      'text' in p ? p.text : STRINGS[p.key].replace(/\{(\w+)\}/g, (_, n) => String(p.params?.[n] ?? `{${n}}`))
    )
    .join(' · ')
  const chip = s.chipKey === null ? '' : ` [${STRINGS[s.chipKey]}]`
  return `${s.id} ${s.state}${s.expanded ? ' +' : ''}: ${text}${chip}`
}

const CASES = [
  {
    name: 'new place: Sources open with the pasted links, the rest locked',
    input: { research: NOT_STARTED, job: null },
    want: [
      'sources open +: 0 of 3 read · research not run yet',
      'profile locked: Available after research',
      'brief locked: Available after research',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'researching: Business facts is the muted waiting row, nothing partial',
    input: { research: { ...NOT_STARTED, state: 'running' }, job: { state: 'running' } },
    want: [
      'sources open +: 0 of 3 read · research running',
      'profile locked: Being researched. Progress is shown above.',
      'brief locked: Available after research',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'business facts to review: open with its chip, Sources folded',
    input: {},
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile review: 6 fields [Needs your review]',
      'brief locked: Approve the business facts first',
      'demo locked: Approve the business facts and the brief first'
    ]
  },
  {
    name: 'an old brief made before approval is not shown: locked rows, no chip',
    input: { brief: OLD_BRIEF },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile review: 6 fields [Needs your review]',
      'brief locked: Approve the business facts first',
      'demo locked: Approve the business facts and the brief first'
    ]
  },
  {
    name: 'business facts approved: facts open, the brief ready to write',
    input: { approval: { ...APPROVED, brief: 'none', briefApprovedAt: null } },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile open: 6 fields · approved Nov 10',
      'brief locked: Ready to write. Start it in Progress above.',
      'demo locked: Approve the site content brief first'
    ]
  },
  {
    name: 'brief being written: the brief is the muted waiting row',
    input: {
      approval: { ...APPROVED, brief: 'none', briefApprovedAt: null },
      briefJob: { state: 'running', step: 'writing' }
    },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile open: 6 fields · approved Nov 10',
      'brief locked: The site content brief is being written. Progress is shown above.',
      'demo locked: Approve the site content brief first'
    ]
  },
  {
    name: 'brief to review: open with its chip, the site waits for it',
    input: { brief: BRIEF, approval: { ...APPROVED, brief: 'needed', briefApprovedAt: null } },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief review: Brief 4 [Needs your review]',
      'demo locked: Approve the site content brief first'
    ]
  },
  {
    name: 'brief approved: the brief open, the site ready to build',
    input: { brief: BRIEF, approval: APPROVED },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief open: Brief 4 · approved Nov 10',
      'demo locked: Ready to build. Start it in Progress above.'
    ]
  },
  {
    name: 'building: Your site is the muted waiting row',
    input: { brief: BRIEF, approval: APPROVED, demo: 'building' },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief open: Brief 4 · approved Nov 10',
      'demo locked: Not available yet. The build is shown in Progress above.'
    ]
  },
  {
    name: 'built: Your site open, everything else folded',
    input: { brief: BRIEF, approval: APPROVED, demo: 'ready', demoAt: '2026-11-10T13:00:00Z' },
    want: [
      'sources done: 2 of 3 read · Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief done: Brief 4 · approved Nov 10',
      'demo open +: tennis-padel-coach.tracy.test · built Nov 10'
    ]
  },
  {
    name: 'research again pressed: the old output is reset to waiting rows',
    input: { research: RERUNNING, job: { state: 'running' }, brief: BRIEF },
    want: [
      'sources open +: 0 of 3 read · research running',
      'profile locked: Being researched. Progress is shown above.',
      'brief locked: Available after research',
      'demo locked: Approve the business facts and the brief first'
    ]
  },
  {
    name: 'the seller opens a finished Sources; a stored choice for the brief changes nothing',
    input: { brief: BRIEF, approval: APPROVED, opened: { brief: false, sources: true, demo: true } },
    want: [
      'sources done +: 2 of 3 read · Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief open: Brief 4 · approved Nov 10',
      'demo locked: Ready to build. Start it in Progress above.'
    ]
  }
]

for (const c of CASES) {
  test(`workspace: ${c.name}`, () => {
    const sections = sectionsOf(c.input)
    assert.deepEqual(
      sections.map((s) => s.id),
      WORKSPACE_IDS
    )
    assert.deepEqual(sections.map(line), c.want)
  })
}

test('workspace: locked rows never open and have no pill link (the card draws a lock), Business facts included', () => {
  const sections = sectionsOf({ research: NOT_STARTED, job: null, opened: { brief: true, demo: true } })
  const by = Object.fromEntries(sections.map((s) => [s.id, s]))
  assert.equal(by.brief.expanded, false)
  assert.equal(by.brief.expandable, false)
  assert.equal(by.brief.linkKey, null)
  assert.equal(by.demo.linkKey, null)
  assert.equal(by.profile.state, 'locked')
  assert.equal(by.profile.linkKey, null)
})

test('workspace: the pill reads Review on a review, Open on a complete row, never on Sources', () => {
  const review = Object.fromEntries(sectionsOf({}).map((s) => [s.id, s.linkKey]))
  assert.equal(review.profile, 'section.review')
  assert.equal(review.sources, null)
  const built = Object.fromEntries(
    sectionsOf({ brief: BRIEF, approval: APPROVED, opened: { brief: true } }).map((s) => [s.id, s.linkKey])
  )
  assert.equal(built.brief, 'section.open')
  assert.equal(built.demo, null)
  const before = Object.fromEntries(
    sectionsOf({ research: NOT_STARTED, job: null }).map((s) => [s.id, [s.state, s.linkKey]])
  )
  assert.deepEqual(before.sources, ['open', null])
})

test('workspace: the stored open/closed choices keep only booleans of known sections', () => {
  assert.deepEqual(readOpened(null), {})
  assert.deepEqual(readOpened('not json'), {})
  // Business facts and the brief never open in place, so their choices are not kept.
  assert.deepEqual(readOpened('{"brief":true,"profile":true,"demo":"yes","other":false,"sources":false}'), {
    sources: false
  })
})

test('workspace: Business facts and the brief are link rows that never expand, Sources and Your site expand', () => {
  const sections = sectionsOf({ brief: BRIEF, approval: APPROVED, opened: { profile: true, brief: true } })
  const by = Object.fromEntries(sections.map((s) => [s.id, s]))
  for (const id of ['profile', 'brief']) {
    assert.equal(by[id].kind, 'link', id)
    assert.equal(by[id].expandable, false, id)
    assert.equal(by[id].expanded, false, id)
    assert.equal(by[id].linkKey, 'section.open', id)
  }
  assert.equal(by.sources.kind, 'expand')
  assert.equal(by.sources.expandable, true)
  assert.equal(by.demo.kind, 'expand')
})

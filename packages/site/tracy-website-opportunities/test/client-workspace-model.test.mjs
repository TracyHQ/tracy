/**
 * The Workspace card of Details (#537, option D): four sections in a fixed order, the current one open, finished ones
 * folded to a summary, reviews open with their chip, and locked or running ones a muted row with what they wait for.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-workspace-model.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { stepperView } from '../src/client/stepper-model.ts'
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
  held = null,
  opened = {}
}) {
  const stepper = stepperView({ research, researchJob: job, briefJob, brief, demo, demoAt, approval })
  const moving = research.state === 'running' || job?.state === 'running' || job?.state === 'queued'
  const briefEmpty = briefJob?.state === 'running' ? 'running' : null
  return workspaceSections({
    stepper,
    researchDone: research.done,
    researchMoving: moving,
    researchedAt: research.researchedAt,
    sources: 3,
    fields: 6,
    brief: brief === null ? null : { n: brief.n },
    briefEmpty,
    held,
    demo,
    demoHost: demo === 'ready' ? 'tennis-padel-coach.tracy.test' : null,
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
      'sources open +: 3 links · not collected yet',
      'profile locked: Available after research',
      'brief locked: Available after research',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'researching: Business facts is the muted waiting row, nothing partial',
    input: { research: { ...NOT_STARTED, state: 'running' }, job: { state: 'running' } },
    want: [
      'sources open +: 3 links · not collected yet',
      'profile locked: Being researched. Progress is shown above.',
      'brief locked: Available after research',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'business facts to review: open with its chip, Sources folded',
    input: {},
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile review +: 6 fields [Needs your review]',
      'brief locked: Approve the business facts to unlock',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'an old brief made before approval is held, open with its line',
    input: { brief: OLD_BRIEF, held: 'profile' },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile review +: 6 fields [Needs your review]',
      'brief held +: Brief 4 [Made from older business facts]',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'business facts approved: facts open, the brief ready to write',
    input: { approval: { ...APPROVED, brief: 'none', briefApprovedAt: null } },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile open +: 6 fields · approved Nov 10',
      'brief locked: Ready to write. Start it in Progress above.',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'brief being written: the brief is the muted waiting row',
    input: {
      approval: { ...APPROVED, brief: 'none', briefApprovedAt: null },
      briefJob: { state: 'running', step: 'writing' }
    },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile open +: 6 fields · approved Nov 10',
      'brief locked: The site content brief is being written. Progress is shown above.',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'brief to review: open with its chip, the site waits for it',
    input: { brief: BRIEF, approval: { ...APPROVED, brief: 'needed', briefApprovedAt: null } },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief review +: Brief 4 [Needs your review]',
      'demo locked: Approve the site content brief to unlock'
    ]
  },
  {
    name: 'brief approved: the brief open, the site ready to build',
    input: { brief: BRIEF, approval: APPROVED },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief open +: Brief 4 · approved Nov 10',
      'demo locked: Ready to build. Start it in Progress above.'
    ]
  },
  {
    name: 'building: Your site is the muted waiting row',
    input: { brief: BRIEF, approval: APPROVED, demo: 'building' },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief open +: Brief 4 · approved Nov 10',
      'demo locked: Not available yet. The build is shown in Progress above.'
    ]
  },
  {
    name: 'built: Your site open, everything else folded',
    input: { brief: BRIEF, approval: APPROVED, demo: 'ready', demoAt: '2026-11-10T13:00:00Z' },
    want: [
      'sources done: 3 links · collected Nov 10',
      'profile done: 6 fields · approved Nov 10',
      'brief done: Brief 4 · approved Nov 10',
      'demo open +: tennis-padel-coach.tracy.test · built Nov 10'
    ]
  },
  {
    name: 'sources changed: Sources open, the old facts and brief held',
    input: {
      brief: BRIEF,
      approval: { research: 'sources_changed', profile: 'none', brief: 'stale', briefStale: 'sources' },
      held: 'sources'
    },
    want: [
      'sources open +: 3 links · collected Nov 10',
      'profile held: 6 fields [Made from older sources]',
      'brief held +: Brief 4 [Made from older sources]',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'research again pressed: the old output is reset to waiting rows',
    input: { research: RERUNNING, job: { state: 'running' }, brief: BRIEF, held: 'sources' },
    want: [
      'sources open +: 3 links · not collected yet',
      'profile locked: Being researched. Progress is shown above.',
      'brief locked: Available after research',
      'demo locked: After the site content brief'
    ]
  },
  {
    name: 'the seller folds the current section and opens a finished one',
    input: { brief: BRIEF, approval: APPROVED, opened: { brief: false, sources: true, demo: true } },
    want: [
      'sources done +: 3 links · collected Nov 10',
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

test('workspace: locked rows never open and have no link, except Business facts before research', () => {
  const sections = sectionsOf({ research: NOT_STARTED, job: null, opened: { brief: true, demo: true } })
  const by = Object.fromEntries(sections.map((s) => [s.id, s]))
  assert.equal(by.brief.expanded, false)
  assert.equal(by.brief.expandable, false)
  assert.equal(by.brief.linkKey, null)
  assert.equal(by.demo.linkKey, null)
  // Its sub-page takes the seller's own photos before research.
  assert.equal(by.profile.linkKey, 'section.open')
})

test('workspace: the links read Review on a review, Open full brief on the open brief, Open elsewhere', () => {
  const review = Object.fromEntries(sectionsOf({}).map((s) => [s.id, s.linkKey]))
  assert.equal(review.profile, 'section.review')
  assert.equal(review.sources, 'section.open')
  const built = Object.fromEntries(
    sectionsOf({ brief: BRIEF, approval: APPROVED, opened: { brief: true } }).map((s) => [s.id, s.linkKey])
  )
  assert.equal(built.brief, 'section.openBrief')
  assert.equal(built.demo, null)
})

test('workspace: the stored open/closed choices keep only booleans of known sections', () => {
  assert.deepEqual(readOpened(null), {})
  assert.deepEqual(readOpened('not json'), {})
  assert.deepEqual(readOpened('{"brief":true,"demo":"yes","other":false,"sources":false}'), {
    brief: true,
    sources: false
  })
})

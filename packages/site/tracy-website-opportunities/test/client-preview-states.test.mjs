/**
 * [TAM] Temporary developer preview, never ships: remove with preview-states.ts.
 *
 * Each preview state, made from one real Details answer, drives the stepper and the section cards the way Details reads them.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-preview-states.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoStateOf } from '@tracy/wo-views/demo-state'
import { demoFacts, rowFromDetail } from '../src/client/inspector-model.ts'
import { PREVIEW_STATES, applyPreview, previewFlag } from '../src/client/preview-states.ts'
import { sectionMetas, sourceCounts } from '../src/client/section-model.ts'
import { researchOf } from '../src/client/research-gate-model.ts'
import { sourcesToShow } from '../src/client/source-links-model.ts'
import { sourceStateOf } from '../src/client/source-table-model.ts'
import { stepperView } from '../src/client/stepper-model.ts'

const NOW = Date.parse('2026-11-09T12:00:00Z')
/** An invented, fully researched place with a brief and no demo. */
const REAL = {
  opportunity: {
    id: 'o-1',
    name: 'Harbour Lane Bakery',
    createdAt: '2026-11-01T10:00:00Z',
    candidate: { category: 'Bakery', address: '1 Harbour Lane' }
  },
  research: { state: 'done', researchedAt: '2026-11-08T10:00:00Z' },
  jobs: [{ id: 'j-1', kind: 'research', state: 'completed', createdAt: '2026-11-08T09:58:00Z' }],
  profile: { name: 'Harbour Lane Bakery', phone: '+1 555 0100' },
  sources: [
    { source: 'website', status: 'complete', shared: true },
    { source: 'instagram', status: 'complete', shared: true },
    { source: 'facebook', status: 'failed', shared: true },
    { source: 'google-places', status: 'complete', shared: true },
    { source: 'listing', status: 'complete', shared: false },
    { source: 'tripadvisor', status: 'skipped', shared: true }
  ],
  media: [{ id: 'm-1', kind: 'image', url: '/m/1.jpg' }],
  brief: { id: 'b-4', n: 4, createdAt: '2026-11-08T11:00:00Z', current: false },
  briefJob: { id: 'bj-1', state: 'done', step: 'writing' },
  revisions: [{ id: 'b-4', n: 4, createdAt: '2026-11-08T11:00:00Z' }],
  demo: null,
  demoAction: null,
  builds: [],
  usage: { used: 0, limit: 20 }
}

/** The stepper and the section cards exactly as Details computes them from an answer. */
function draw(body) {
  const row = rowFromDetail(body)
  const demo = demoStateOf(row.demo ? row : { ...row, demo: demoFacts(row, body) })
  const research = researchOf(body)
  const brief = body.brief ?? null
  const stepper = stepperView({
    research,
    researchJob: row.job,
    briefJob: body.briefJob,
    brief,
    demo,
    demoAt: demo === 'ready' ? (row.demoAction?.updatedAt ?? null) : null,
    approval: body.approval ?? null
  })
  const metas = sectionMetas({
    research,
    researchJob: row.job,
    profile: { filled: body.profile ? 2 : 0, total: 8 },
    sources: sourceCounts(sourcesToShow(body.sources, body.opportunity)),
    briefJob: body.briefJob,
    brief,
    media: { photos: body.media.length, videos: 0 },
    demo
  })
  const tones = Object.fromEntries(metas.map((e) => [e.id, `${e.tone}${e.locked ? ':locked' : ''}`]))
  return { row, demo, stepper, tones }
}

const EXPECTED = {
  new: {
    current: 'research',
    running: false,
    action: 'start-research',
    tones: {
      profile: 'mute',
      sources: 'mute',
      brief: 'mute:locked',
      media: 'mute:locked',
      demo: 'mute:locked'
    }
  },
  researching: {
    current: 'research',
    running: true,
    action: null,
    tones: { profile: 'mute', sources: 'mute', brief: 'mute:locked', media: 'mute', demo: 'mute:locked' }
  },
  'profile-review': {
    current: 'research',
    running: false,
    action: 'review-profile',
    tones: { profile: 'ok', sources: 'ok', brief: 'mute', media: 'ok', demo: 'mute:locked' }
  },
  'profile-approved': {
    current: 'brief',
    running: false,
    action: 'make-brief',
    tones: { profile: 'ok', sources: 'ok', brief: 'mute', media: 'ok', demo: 'mute:locked' }
  },
  'brief-running': {
    current: 'brief',
    running: true,
    action: null,
    tones: { profile: 'ok', sources: 'ok', brief: 'mute', media: 'ok', demo: 'mute:locked' }
  },
  'brief-failed': {
    current: 'brief',
    running: false,
    action: 'retry-brief',
    tones: { profile: 'ok', sources: 'ok', brief: 'mute', media: 'ok', demo: 'mute:locked' }
  },
  'brief-review': {
    current: 'brief',
    running: false,
    action: 'review-brief',
    tones: { profile: 'ok', sources: 'ok', brief: 'ok', media: 'ok', demo: 'mute' }
  },
  'edited-after-approval': {
    current: 'research',
    running: false,
    action: 'review-profile',
    tones: { profile: 'ok', sources: 'ok', brief: 'ok', media: 'ok', demo: 'mute' }
  },
  'old-brief-profile-review': {
    current: 'research',
    running: false,
    action: 'review-profile',
    tones: { profile: 'ok', sources: 'ok', brief: 'ok', media: 'ok', demo: 'mute' }
  },
  'brief-approved': {
    current: 'build',
    running: false,
    action: 'build',
    tones: { profile: 'ok', sources: 'ok', brief: 'ok', media: 'ok', demo: 'mute' }
  },
  building: {
    current: 'build',
    running: true,
    action: null,
    tones: { profile: 'ok', sources: 'ok', brief: 'ok', media: 'ok', demo: 'mute' }
  },
  built: {
    current: null,
    running: false,
    action: null,
    tones: { profile: 'ok', sources: 'ok', brief: 'ok', media: 'ok', demo: 'ok' }
  }
}

test('Real data is the answer itself', () => {
  assert.equal(applyPreview(REAL, 'real', NOW), REAL)
  assert.equal(applyPreview(null, 'researching', NOW), null)
})

for (const id of PREVIEW_STATES.filter((s) => s !== 'real')) {
  test(`${id}: stepper current step and section statuses`, () => {
    const body = applyPreview(REAL, id, NOW)
    const { row, stepper, tones } = draw(body)
    const want = EXPECTED[id]
    assert.equal(stepper.current, want.current)
    assert.equal(stepper.running, want.running)
    assert.equal(stepper.action?.kind ?? null, want.action)
    assert.deepEqual(tones, want.tones)
    // The place stays the real one.
    assert.equal(row.name, 'Harbour Lane Bakery')
    assert.deepEqual(row.candidate, REAL.opportunity.candidate)
  })
}

test('the failed brief reads a plain sentence; researching marks sources done, reading and queued', () => {
  assert.equal(
    draw(applyPreview(REAL, 'brief-failed', NOW)).stepper.errorKey,
    'brief.job.error.brief_interrupted'
  )
  const statuses = applyPreview(REAL, 'researching', NOW).sources.map((s) => s.status)
  assert.deepEqual(statuses, ['complete', 'complete', 'partial', 'partial', null, null])
})

test('after research every pasted link of a card never researched reads as a collected source row', () => {
  // An invented card added by two links and never researched: no source row of its own yet.
  const fresh = {
    ...REAL,
    opportunity: {
      ...REAL.opportunity,
      provider: 'url',
      candidate: {
        ...REAL.opportunity.candidate,
        pastedLinks: [
          { url: 'https://www.instagram.com/sample_court_club', source: 'instagram' },
          { url: 'https://sample-court.example/', source: 'website' }
        ]
      }
    },
    research: { state: 'not_started', researchedAt: null },
    sources: []
  }
  assert.equal(PREVIEW_STATES.includes('sources-changed'), false)
  const after = PREVIEW_STATES.filter((s) => !['real', 'new', 'researching'].includes(s))
  for (const id of after) {
    const body = applyPreview(fresh, id, NOW)
    const shown = sourcesToShow(body.sources, body.opportunity)
    assert.deepEqual(
      shown.map((r) => [r.source, r.pastedLink, r.status, sourceStateOf(r, 'en-US').state]),
      [
        ['instagram', 'https://www.instagram.com/sample_court_club', 'complete', 'collected'],
        ['website', 'https://sample-court.example/', 'complete', 'collected']
      ],
      id
    )
    for (const r of shown) assert.equal(typeof r.collectedAt, 'string', id)
  }
  // A pasted link a real row already covers gets no second row.
  const covered = { ...fresh, sources: [{ source: 'instagram', status: 'complete', shared: true }] }
  const body = applyPreview(covered, 'profile-review', NOW)
  assert.deepEqual(
    body.sources.map((r) => r.source),
    ['instagram', 'website']
  )
})

test('the demo states: building has a progress run, ready has a demo address', () => {
  const building = applyPreview(REAL, 'building', NOW)
  assert.equal(building.demoAction.run.current, 'pictures')
  // Each step carries its time and cost as the server sends them (#537): spend once done, an estimate while waiting.
  const steps = Object.fromEntries(building.demoAction.run.steps.map((s) => [s.id, s]))
  assert.equal(steps.plan.usd, 0.08)
  assert.equal(steps.copy.minutes, 3)
  assert.equal(steps.copy.usd, null)
  assert.deepEqual(steps.write.estimate, { minutes: 4, usd: 0.3 })
  assert.equal(draw(building).demo, 'building')
  const ready = applyPreview(REAL, 'built', NOW)
  assert.match(ready.demo.url, /^https:\/\/harbour-lane-bakery\.example\.test\/$/)
  assert.equal(draw(ready).demo, 'ready')
})

test('the Built state reads built on the Progress band: the site was made after the brief was approved', () => {
  const ready = applyPreview(REAL, 'built', NOW)
  const { stepper } = draw(ready)
  assert.equal(stepper.current, null, 'no step is current once the build is done')
  assert.deepEqual(
    stepper.steps.map((s) => s.state),
    ['done', 'done', 'done']
  )
  assert.ok(Date.parse(ready.approval.briefApprovedAt) < Date.parse(ready.demoAction.updatedAt))
})

test('the flag is read from the query string or the hash', () => {
  assert.equal(previewFlag('?tab=tracy:website-opportunities&wo-preview=1'), true)
  assert.equal(previewFlag('', '#wo-preview=1'), true)
  assert.equal(previewFlag('', '#/x?wo-preview=1'), true)
  assert.equal(previewFlag('?wo-preview=0', ''), false)
  assert.equal(previewFlag('', ''), false)
})

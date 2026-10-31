/**
 * The brief's photograph labelling runs beside the request (#250): pressing build in Build from my business held
 * `chat/prepare` 113 s while every photograph was labelled. The run starts once, the brief answers pending while it
 * still labels (never a half-labelled brief), takes the run's settled labels once it is done, and a run that never
 * settles is an honest failed labelling, never a wait.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import {
  createPictureLabelRuns,
  PICTURE_LABELS_OVERDUE_MS,
  pictureLabelKey
} from '../src/opportunities-build/picture-label-runs.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'

const at = Date.parse('2026-10-31T08:00:00.000Z')
const sha = (n) => String(n).repeat(64).slice(0, 64)

/** A labelling the test settles by hand, counting how often it was asked. */
function heldLabelling() {
  const asked = []
  /** @type {(answer: any) => void} */
  let settle = () => {}
  const answered = new Promise((resolve) => {
    settle = resolve
  })
  const label = (input) => {
    asked.push(input)
    return answered
  }
  return { asked, label, settle: (answer) => settle(answer) }
}

const labelled = () => ({
  labels: new Map([
    ['pool', { key: 'm|p3', model: 'm', labels: { content: 'venue-exterior', caption: 'The pool' } }]
  ]),
  note: { status: 'labelled', asked: 2, labelled: 1, cached: 0, max: 60 }
})

const input = (extra = {}) => ({
  accountId: 'acc-1',
  media: [{ id: 'pool', origin: 'place', kind: 'image', sha256: sha(1), width: 2000, height: 1200 }],
  brand: null,
  trade: 'fitness',
  closedList: null,
  businessName: 'Harbour Sport Club',
  ...extra
})

test('one run per input: pending while it labels, its settled answer after, asked once (#250)', async () => {
  const held = heldLabelling()
  let clock = at
  const runs = createPictureLabelRuns({ label: held.label, now: () => clock })
  runs.start(input())
  const first = runs.answer(input())
  assert.equal(first.pending, true)
  assert.equal(first.retryAt > clock, true)
  held.settle(labelled())
  await runs.idle()
  clock += 1_000
  const done = runs.answer(input())
  assert.equal(done.labelling.note.status, 'labelled')
  assert.equal(done.labelling.labels.get('pool').labels.content, 'venue-exterior')
  assert.equal(held.asked.length, 1, 'the warm start and the brief share one run')
})

test('the run is keyed by what it reads: labels a picture already carries never start another, a new closed list does', () => {
  const a = pictureLabelKey(input())
  const withLabel = input({
    media: [{ ...input().media[0], labels: { vision: { key: 'm|p3', labels: { content: 'food' } } } }]
  })
  assert.equal(pictureLabelKey(withLabel), a)
  assert.notEqual(pictureLabelKey(input({ closedList: { offerings: [{ name: 'Swim lessons' }] } })), a)
  assert.notEqual(pictureLabelKey(input({ accountId: 'acc-2' })), a)
})

test('a run still out past its bound is an honest failed labelling, never a longer wait', async () => {
  const held = heldLabelling()
  let clock = at
  const runs = createPictureLabelRuns({ label: held.label, now: () => clock })
  assert.equal(runs.answer(input()).pending, true)
  clock += PICTURE_LABELS_OVERDUE_MS
  const late = runs.answer(input())
  assert.equal(late.pending, undefined)
  assert.equal(late.labelling.labels.size, 0, 'no label is invented')
  assert.deepEqual(late.labelling.note, {
    status: 'failed',
    asked: 0,
    labelled: 0,
    cached: 0,
    reason: 'labelling_overdue'
  })
  held.settle(labelled())
  await runs.idle()
})

test('a labelling that throws settles as failed, so the brief is still made', async () => {
  const runs = createPictureLabelRuns({
    label: async () => {
      throw new Error('boom')
    },
    log: { warn() {} }
  })
  runs.start(input())
  await runs.idle()
  assert.equal(runs.answer(input()).labelling.note.reason, 'vision_failed')
})

/** A frozen research read of the fictional Harbour Sport Club with two photographs. */
const frozenRead = () => ({
  opportunity: { name: 'Harbour Sport Club', branch: null, candidate: { trade: 'fitness' } },
  placeSnapshotId: null,
  profile: { name: 'Harbour Sport Club', phone: '+971 50 000 1234', address: 'Harbour Lane, Dubai' },
  brand: null,
  sources: [{ id: 'src-web', source: 'website', ref: 'https://harboursport.example', status: 'complete' }],
  rawSources: [],
  posts: [],
  media: [
    {
      id: 'pool',
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: sha(1),
      width: 2000,
      height: 1200
    },
    {
      id: 'court',
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: sha(2),
      width: 1600,
      height: 2133
    }
  ],
  socialStats: []
})

/** A database answering what `revisionForAction` and `createRevision` send for an action whose build chose already. */
function fakeDb() {
  const inserted = []
  const opp = {
    id: 'opp-1',
    account_id: 'acc-1',
    name: 'Harbour Sport Club',
    provider: 'google',
    candidate: {}
  }
  const query = async (sql, params = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()
    if (/^(begin|commit|rollback)$/.test(s)) return { rows: [] }
    if (s.startsWith('select choice from wo_build'))
      return {
        rows: [{ choice: { cms: 'wordpress', cmsSource: 'account', resolvedAt: new Date(at).toISOString() } }]
      }
    if (s.startsWith('select * from wo_opportunity')) return { rows: [opp] }
    if (s.startsWith('select * from wo_revision')) return { rows: [] }
    if (s.startsWith('insert into wo_revision')) {
      const cols = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',')
      const values = [...params]
      const row = {}
      for (const col of cols) row[col] = col === 'n' ? 1 : values.shift()
      for (const key of Object.keys(row))
        if (typeof row[key] === 'string' && /^[[{n]/.test(row[key]) && key !== 'brief_md')
          row[key] = JSON.parse(row[key])
      inserted.push(row)
      return { rows: [row] }
    }
    throw new Error(`unexpected statement: ${s}`)
  }
  return { inserted, query, connect: async () => ({ query, release() {} }) }
}

const action = {
  id: 'act-1',
  account_id: 'acc-1',
  opportunity_id: 'opp-1',
  revision_id: 'rev-1',
  build_request_id: 'req-1',
  selection: { ownSite: true, researchInput: frozenRead(), snapshotAt: new Date(at).toISOString() }
}

test('revisionForAction answers pending and makes no brief while the photographs are labelled, then briefs them', async () => {
  const db = fakeDb()
  const held = heldLabelling()
  const runs = createPictureLabelRuns({ label: held.label, now: () => at })
  const ask = () =>
    revisionForAction(db, {
      action,
      domain,
      templates: async () => [],
      ops: {},
      now: () => at,
      pictureLabelRuns: runs
    })
  const started = Date.now()
  const pending = await ask()
  assert.ok(Date.now() - started < 1_000, 'the request never waits for the labelling')
  assert.equal(pending.pending, true)
  assert.equal(pending.waitingFor, 'pictures')
  assert.equal(db.inserted.length, 0, 'no brief is frozen with labels still being made')
  assert.deepEqual(
    held.asked[0].media.map((m) => m.id),
    ['pool', 'court']
  )
  held.settle(labelled())
  await runs.idle()
  const made = await ask()
  assert.ok(made.revision, JSON.stringify(made))
  assert.equal(db.inserted.length, 1)
  const byId = new Map(made.revision.brief.assets.map((a) => [a.id, a]))
  assert.equal(byId.get('pool').content, 'venue-exterior')
  assert.equal(byId.get('court').content, 'unlabelled')
  assert.equal(made.revision.brief.assetLabelling.status, 'labelled')
  assert.equal(held.asked.length, 1)
})

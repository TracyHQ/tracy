/**
 * What the Inspector reads out of `GET /opportunities/:id` (`src/client/inspector-model.ts`): the
 * Research rollup, the demo site worth showing, and the photo preview.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { demoFacts, demoSite, mediaPreview, researchRollup } from '../src/client/inspector-model.ts'
import { en } from '../src/client/strings.ts'

test('researchRollup: one word and tone per job state; partial or failed never reads as complete', () => {
  assert.deepEqual(researchRollup(null), { key: 'job.none', tone: 'idle' })
  assert.deepEqual(researchRollup({ state: 'queued' }), { key: 'job.state.queued', tone: 'idle' })
  assert.deepEqual(researchRollup({ state: 'running' }), { key: 'job.state.running', tone: 'run' })
  assert.deepEqual(researchRollup({ state: 'paused' }), { key: 'job.state.paused', tone: 'paused' })
  assert.deepEqual(researchRollup({ state: 'blocked' }), { key: 'job.state.blocked', tone: 'bad' })
  assert.deepEqual(researchRollup({ state: 'failed' }), { key: 'job.state.failed', tone: 'bad' })
  assert.deepEqual(researchRollup({ state: 'cancelled' }), { key: 'job.state.cancelled', tone: 'idle' })
  assert.deepEqual(researchRollup({ state: 'completed' }), { key: 'source.status.complete', tone: 'ok' })
  for (const state of [null, 'queued', 'running', 'paused', 'blocked', 'failed', 'cancelled', 'completed'])
    assert.equal(typeof en[researchRollup(state === null ? null : { state }).key], 'string')
})

const build = (id, state, over = {}) => ({
  id,
  state,
  revisionId: 'r1',
  siteKey: null,
  createdAt: '2026-10-10T00:00:00Z',
  ...over
})

test('demoSite: the newest ready build with a site wins, with its CMS from its brief', () => {
  const body = {
    revisions: [{ id: 'r1', n: 1, cms: 'wordpress' }],
    builds: [
      build('b1', 'completed', { siteKey: 'old-site', createdAt: '2026-10-01T00:00:00Z' }),
      build('b2', 'completed', { siteKey: 'the-farm', createdAt: '2026-10-05T00:00:00Z' }),
      build('b3', 'failed', { createdAt: '2026-10-09T00:00:00Z' })
    ]
  }
  assert.deepEqual(demoSite(body), {
    phase: 'done',
    links: { workspace: '/the-farm/', live: null },
    cms: 'wordpress',
    reasonKey: null
  })
})

test('demoSite: without a ready site, the newest build says whether it is running or why it stopped', () => {
  assert.equal(demoSite({ builds: [] }), null)
  assert.equal(demoSite({}), null)
  assert.deepEqual(demoSite({ builds: [build('b1', 'running')] }), {
    phase: 'running',
    links: null,
    cms: null,
    reasonKey: null
  })
  assert.deepEqual(
    demoSite({ builds: [build('b1', 'failed', { receipt: { body: { code: 'TEMPLATE_UNAVAILABLE' } } })] }),
    {
      phase: 'failed',
      links: null,
      cms: null,
      reasonKey: 'reason.template_unavailable'
    }
  )
})

test('demoSite: a deleted demo is not offered as a site to open', () => {
  const body = {
    builds: [build('b1', 'deleted', { siteKey: 'the-farm', demo: { deletedAt: '2026-10-19T00:00:00Z' } })]
  }
  assert.deepEqual(demoSite(body), { phase: 'deleted', links: null, cms: null, reasonKey: null })
})

test('mediaPreview: the first five stored photos to draw, and how many items there are in all', () => {
  const media = [
    { id: 'm1', kind: 'image', status: 'stored' },
    { id: 'm2', kind: 'video', status: 'stored' },
    { id: 'm3', kind: 'image', status: 'download_failed', sourceUrl: 'https://x.vn/a.jpg' },
    ...['m4', 'm5', 'm6', 'm7', 'm8'].map((id) => ({ id, kind: 'image' })),
    { kind: 'image' }
  ]
  const preview = mediaPreview(media)
  assert.equal(preview.total, 8)
  assert.deepEqual(
    preview.tiles.map((t) => t.id),
    ['m1', 'm4', 'm5', 'm6', 'm7']
  )
  assert.deepEqual(mediaPreview(undefined), { total: 0, tiles: [] })
})

test('rowFromDetail: the Details page reads the same row the list draws, from the detail answer', async () => {
  const { rowFromDetail } = await import('../src/client/inspector-model.ts')
  const { nextAction, stageOf } = await import('../src/client/opportunity-row.ts')
  const body = {
    opportunity: {
      id: 'o1',
      name: 'Pho Hoa',
      branch: null,
      candidate: { website: 'https://pho.example' },
      createdAt: '2026-10-01T00:00:00Z'
    },
    jobs: [
      { id: 'j1', state: 'cancelled', createdAt: '2026-10-01T01:00:00Z' },
      { id: 'j2', state: 'completed', createdAt: '2026-10-02T01:00:00Z' }
    ],
    revisions: [
      { id: 'r1', n: 1, cms: 'wordpress', createdAt: '2026-10-03T00:00:00Z' },
      { id: 'r2', n: 2, cms: 'joomla', createdAt: '2026-10-04T00:00:00Z' }
    ],
    builds: []
  }
  const row = rowFromDetail(body)
  assert.equal(row.id, 'o1')
  assert.equal(row.job.id, 'j2')
  assert.equal(row.latestRevision.id, 'r2')
  assert.equal(stageOf(row), 'demo')
  assert.equal(nextAction(row), 'build')

  const built = rowFromDetail({
    ...body,
    builds: [
      {
        id: 'b1',
        revisionId: 'r2',
        siteKey: 'pho.tracy.site',
        state: 'completed',
        createdAt: '2026-10-05T00:00:00Z'
      }
    ]
  })
  assert.equal(stageOf(built), 'demo')
  assert.equal(nextAction(built), 'open-site')
  assert.deepEqual(built.sites, ['pho.tracy.site'])

  const started = rowFromDetail({
    ...body,
    builds: [
      {
        id: 'b2',
        revisionId: 'r2',
        siteKey: 'pho.tracy.site',
        state: 'requesting',
        createdAt: '2026-10-05T00:00:00Z'
      }
    ]
  })
  assert.equal(stageOf(started), 'demo')
  assert.equal(started.latestBuild.id, 'b2')
})

test('rowFromDetail: a body without an opportunity is no row', async () => {
  const { rowFromDetail } = await import('../src/client/inspector-model.ts')
  assert.equal(rowFromDetail(null), null)
  assert.equal(rowFromDetail({ opportunity: {} }), null)
})

test('demoFacts: the list row’s demo when it has one, else the newest built site of the detail answer', () => {
  const listed = {
    siteKey: 'a.tracy.site',
    url: 'https://a.tracy.site',
    expiresAt: 'x',
    frozenAt: null,
    deletedAt: null,
    qa: null,
    build: { status: 'done', startedAt: null }
  }
  assert.equal(demoFacts({ id: 'o1', demo: listed }, null), listed)
  const body = {
    builds: [
      build('b1', 'provisioning', {
        siteKey: 'the-farm',
        createdAt: '2026-10-05T00:00:00Z',
        qa: { state: 'passed' },
        demo: {
          siteKey: 'the-farm',
          expiresAt: '2026-11-01T00:00:00Z',
          touchedAt: null,
          frozenAt: '2026-10-19T00:00:00Z',
          deletedAt: null
        }
      }),
      build('b0', 'refused', { createdAt: '2026-10-01T00:00:00Z' })
    ]
  }
  assert.deepEqual(demoFacts({ id: 'o1' }, body), {
    siteKey: 'the-farm',
    url: null,
    expiresAt: '2026-11-01T00:00:00Z',
    frozenAt: '2026-10-19T00:00:00Z',
    deletedAt: null,
    deletesAt: null,
    qa: 'passed',
    build: { status: 'building', startedAt: '2026-10-05T00:00:00Z' }
  })
  assert.equal(demoFacts({ id: 'o1' }, { builds: [build('b0', 'refused')] }), null)
  assert.equal(demoFacts({ id: 'o1' }, null), null)
})

test('rowFromDetail: done counts collected sources, not found ones are counted apart and never as done', async () => {
  const { rowFromDetail } = await import('../src/client/inspector-model.ts')
  const row = rowFromDetail({
    opportunity: { id: 'o1', name: 'Cafe Vela' },
    jobs: [{ id: 'j1', state: 'completed' }],
    sources: [
      { source: 'website', status: 'complete' },
      { source: 'facebook', status: 'blocked', reason: 'credential_invalid' },
      { source: 'instagram', status: 'partial' },
      { source: 'google-places', status: 'complete' },
      { source: 'google-maps', status: 'failed', reason: 'error' },
      { source: 'tripadvisor', status: 'skipped', reason: 'not_found' },
      { source: 'tiktok', status: 'blocked', reason: 'private_or_empty' }
    ]
  })
  assert.deepEqual(row.sourceCounts, { done: 3, notFound: 2, total: 7 })
})

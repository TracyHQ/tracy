import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterWoRows, sortWoRows, woProgressPercent } from '../src/wo-api.ts'
import { customerStatus, journeySql } from 'website-opportunities/src/wo-journey.js'
import { statusView } from '../../../../packages/site/tracy-website-opportunities/src/client/opportunity-row.ts'
import { en } from '../../../../packages/site/tracy-website-opportunities/src/client/strings.ts'

const NOW = Date.parse('2026-10-18T12:00:00Z')

test('operator status labels agree with customer statusView across journey and stopped states', () => {
  for (const stage of ['research', 'demo', 'outreach', 'cancelled']) {
    for (const jobState of [
      undefined,
      'queued',
      'running',
      'failed',
      'paused',
      'blocked',
      'cancelled',
      'completed'
    ]) {
      for (const actionState of [undefined, 'queued', 'failed', 'completed']) {
        for (const build of [
          undefined,
          { state: 'provisioning' },
          { state: 'failed' },
          { state: 'refused' },
          { state: 'deleted' },
          { state: 'completed', done: true },
          { state: 'completed', done: true, qa: 'pending' },
          { state: 'completed', done: true, qa: 'failed' },
          { state: 'completed', done: true, qa: 'passed' }
        ]) {
          const row = {
            stage,
            job: jobState ? { state: jobState } : null,
            demoAction: actionState ? { state: actionState } : null,
            latestBuild: build
          }
          const status = customerStatus({ stage, jobState, actionState, build })
          assert.equal(status.key, statusView(row).key, JSON.stringify(row))
          assert.equal(status.label, en[status.key])
        }
      }
    }
  }
  assert.throws(() => journeySql(), /explicit account scope/)
  assert.throws(() => journeySql({ accountSql: 'o.account_id' }), /explicit account scope/)
})

test('operator status reads the quality protocol’s raw action statuses as the customer row does', () => {
  const build = { state: 'completed', done: true, qa: 'passed' }
  for (const [raw, state] of [
    ['quality-queued-v1', 'queued'],
    ['quality-failed-v1', 'failed'],
    ['quality-completed-v1', 'completed']
  ])
    for (const stage of ['demo', 'outreach'])
      assert.equal(
        customerStatus({ stage, actionState: raw, build }).key,
        statusView({ stage, demoAction: { state }, latestBuild: build }).key,
        `${stage} ${raw}`
      )
})

test('customer milestone tabs exclude Attention while All retains every loaded row', () => {
  const rows = ['research', 'demo', 'outreach', 'cancelled'].flatMap((stage) =>
    [false, true].map((attention) => ({
      ...SAMPLE_ROWS[0],
      id: `${stage}-${attention}`,
      customerStage: stage,
      customerAttention: attention
    }))
  )
  assert.equal(filterWoRows(rows, { dateRange: 'any' }).length, 8)
  assert.equal(filterWoRows(rows, { stageFilter: 'attention', dateRange: 'any' }).length, 4)
  for (const stage of ['research', 'demo', 'outreach', 'cancelled']) {
    assert.deepEqual(
      filterWoRows(rows, { stageFilter: stage, dateRange: 'any' }).map((r) => r.id),
      [`${stage}-false`]
    )
  }
})

const SAMPLE_ROWS = [
  {
    id: 'wo-1',
    number: 101,
    shortId: 'wo-101',
    slug: 'riverside-kitchen',
    name: 'Riverside Kitchen',
    city: 'Da Nang',
    area: 'Hai Chau',
    branch: 'Hai Chau, Da Nang',
    placeId: 'place-1',
    websiteUrl: 'https://riversidekitchen.example',
    cms: 'joomla',
    template: 'ja_restora',
    stage: '3-researching',
    stepNum: 3,
    needsAttention: true,
    attentionReason: 'Daily Apify cap reached',
    attentionCommand: 'Investigate Riverside Kitchen',
    researchRollup: 'paused',
    currentStep: 'Stopped at instagram',
    worker: 'web-worker-1',
    durationSec: 42,
    user: { accountId: 'acc-1', login: 'lee', name: 'Lee', email: 'lee@example.com' },
    revId: '—',
    revisionNumber: 0,
    demoSite: null,
    demoUrl: null,
    demoStatus: 'none',
    queueState: 'PAUSED',
    statusText: 'Paused (quota)',
    notes: 'Daily Apify cap reached',
    read: false,
    createdAt: '2026-10-18T10:00:00Z',
    updatedAt: '2026-10-18T11:30:00Z',
    builtAt: null,
    collectors: [],
    execution: null
  },
  {
    id: 'wo-2',
    number: 102,
    shortId: 'wo-102',
    slug: 'kestrel-saigon',
    name: 'Kestrel Saigon',
    city: 'Ho Chi Minh City',
    area: 'District 1',
    branch: 'District 1, Ho Chi Minh City',
    placeId: 'place-2',
    websiteUrl: 'https://kestrelsaigon.example',
    cms: 'wordpress',
    template: 'flavor-bistro',
    stage: '7-live',
    stepNum: 7,
    needsAttention: false,
    attentionReason: null,
    attentionCommand: null,
    researchRollup: 'success',
    currentStep: 'All collectors & demo build complete',
    worker: '—',
    durationSec: 68,
    user: { accountId: 'acc-2', login: 'sarah', name: 'Sarah', email: 'sarah@example.com' },
    revId: 'rev-8899aa',
    revisionNumber: 2,
    demoSite: 'kestrel-saigon.tracy.site',
    demoUrl: 'https://kestrel-saigon.tracy.site',
    demoStatus: 'live',
    queueState: 'DONE',
    statusText: 'Demo site live',
    notes: '24/28 photos · 4.7★ (940)',
    read: true,
    createdAt: '2026-10-17T09:00:00Z',
    updatedAt: '2026-10-18T11:50:00Z',
    builtAt: '2026-10-18T11:50:00Z',
    collectors: [],
    execution: null
  }
]

test('filterWoRows filters by user, city, CMS, lifecycle stage, attention, and search query', () => {
  assert.equal(filterWoRows(SAMPLE_ROWS, { nowMs: NOW }).length, 2)
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { userFilter: 'lee', nowMs: NOW }).map((r) => r.id),
    ['wo-1']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { cityFilter: 'Da Nang', nowMs: NOW }).map((r) => r.id),
    ['wo-1']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { cityFilter: 'Ho Chi Minh City', nowMs: NOW }).map((r) => r.id),
    ['wo-2']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { cmsScope: 'wordpress', nowMs: NOW }).map((r) => r.id),
    ['wo-2']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { stageFilter: 'attention', nowMs: NOW }).map((r) => r.id),
    ['wo-1']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { stageFilter: '7-live', nowMs: NOW }).map((r) => r.id),
    ['wo-2']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { dateField: 'built', nowMs: NOW }).map((r) => r.id),
    ['wo-2']
  )
  assert.deepEqual(
    filterWoRows(SAMPLE_ROWS, { search: 'kestrel-saigon', nowMs: NOW }).map((r) => r.id),
    ['wo-2']
  )
})

test('sortWoRows sorts by number, step, duration, and time in both directions', () => {
  assert.deepEqual(
    sortWoRows(SAMPLE_ROWS, 'number', 'asc').map((r) => r.number),
    [101, 102]
  )
  assert.deepEqual(
    sortWoRows(SAMPLE_ROWS, 'number', 'desc').map((r) => r.number),
    [102, 101]
  )
  assert.deepEqual(
    sortWoRows(SAMPLE_ROWS, 'step', 'desc').map((r) => r.stepNum),
    [7, 3]
  )
  assert.equal(woProgressPercent(SAMPLE_ROWS[0]), 52)
  assert.equal(woProgressPercent(SAMPLE_ROWS[1]), 100)
})

test('socialCapRows: one row per provider budget, in chain order, with the cap the settings hold', async () => {
  const { socialCapRows } = await import('../src/wo-api.ts')
  const { en } = await import('../src/i18n/ns/wo.ts')
  const rows = socialCapRows({
    'facebook-scraper3': 3,
    'instagram-looter2': 4,
    'instagram-stable': 0,
    'tiktok-api23': 30,
    'yt-api': 9,
    'youtube-official': 500
  })
  assert.deepEqual(
    rows.map((r) => [r.id, r.network, r.cap]),
    [
      ['facebook-scraper3', 'facebook', 3],
      ['facebook-apify', 'facebook', 0],
      ['facebook-scrapecreators', 'facebook', 0],
      ['instagram-looter2', 'instagram', 4],
      ['instagram-stable', 'instagram', 0],
      ['instagram-apify', 'instagram', 0],
      ['instagram-scrapecreators', 'instagram', 0],
      ['tiktok-api23', 'tiktok', 30],
      ['tiktok-apify', 'tiktok', 0],
      ['tiktok-scrapecreators', 'tiktok', 0],
      ['youtube-official', 'youtube', 500],
      ['yt-api', 'youtube', 9]
    ]
  )
  assert.ok(
    rows.every((r) =>
      r.id.endsWith('-apify')
        ? r.unit === 'runs' && en[r.pricing.key].includes('maximum per run')
        : typeof en[r.freeTier?.key] === 'string'
    )
  )
  assert.equal(socialCapRows(undefined)[0].cap, 0, 'missing settings read as off')
})

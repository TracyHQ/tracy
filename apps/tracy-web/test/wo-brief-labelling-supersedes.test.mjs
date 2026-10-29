/**
 * A brief made while the photo labelling was still running is not the last word on its research: once the labels move on,
 * the next Refresh (`POST /revisions`) makes a new brief from them instead of answering the old one, the Details page
 * offers that Refresh, and a build that holds the old brief makes the new one itself (R10 pilot, Brief 10 stuck blocked).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import {
  createRevision,
  labellingUnsettled,
  revisionForAction
} from '../src/opportunities-build/revisions.js'

const at = '2026-10-27T08:00:00.000Z'
const sha = (n) => String(n).repeat(64).slice(0, 64)

/** The stored media rows of the fictional Cedar Lane Bakery: three photographs of its own, no store labels. */
const mediaRows = () =>
  ['oven', 'counter', 'loaves'].map((id, i) => ({
    id,
    kind: 'image',
    category: 'other',
    sha256: sha(i + 1),
    mime: 'image/jpeg',
    width: 2000,
    height: 1400,
    source: 'website',
    source_url: `https://cedarlane.example/${id}.jpg`,
    post_id: null,
    posted_at: null,
    status: 'stored',
    labels: null,
    caption: null,
    alt: null,
    bytes: 400000,
    dhash: null
  }))

/** A pool that keeps its revisions and honours the unique `(opportunity_id, research_hash)` index. */
function memoryPool() {
  const opp = {
    id: 'opp-1',
    account_id: 'acc-1',
    name: 'Cedar Lane Bakery',
    provider: 'google',
    candidate: {}
  }
  const revisions = []
  const actions = new Map()
  const client = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(begin|commit|rollback)$/.test(s)) return { rows: [] }
      if (s.startsWith('select * from wo_opportunity')) return { rows: [opp] }
      if (s.startsWith('select choice from wo_build')) return { rows: [] }
      if (s.startsWith('select cms from wo_preference')) return { rows: [] }
      // The live read of an opportunity with no place (`fromOpportunity`), as `POST /revisions` makes it.
      if (s.startsWith('select source, ref, status')) return { rows: [] }
      if (s.startsWith('select id, kind, category, sha256')) return { rows: mediaRows() }
      if (s.startsWith('select profile, brand from wo_profile'))
        return {
          rows: [
            {
              profile: {
                name: 'Cedar Lane Bakery',
                phone: '+971 50 000 4321',
                address: 'Cedar Lane, Sharjah'
              },
              brand: null
            }
          ]
        }
      if (s.startsWith('select s.source, p.post')) return { rows: [] }
      if (s.startsWith('select * from wo_revision where id'))
        return { rows: revisions.filter((r) => r.id === params[0]) }
      if (s.startsWith('select * from wo_revision where opportunity_id'))
        return { rows: revisions.filter((r) => r.research_hash === params[1]) }
      if (s.startsWith('update wo_revision set research_hash = null')) {
        for (const r of revisions) if (r.id === params[0]) r.research_hash = null
        return { rows: [] }
      }
      if (s.startsWith('update wo_demo_action set revision_id')) {
        actions.set(params[0], params[2])
        return { rows: [] }
      }
      if (s.startsWith('update wo_demo_action set selection')) return { rows: [] }
      if (s.startsWith('insert into wo_revision')) {
        const cols = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',')
        const values = [...params]
        const row = {}
        for (const col of cols) row[col] = col === 'n' ? revisions.length + 1 : values.shift()
        for (const key of Object.keys(row))
          if (typeof row[key] === 'string' && /^[[{n]/.test(row[key]) && key !== 'brief_md')
            row[key] = JSON.parse(row[key])
        if (row.research_hash && revisions.some((r) => r.research_hash === row.research_hash))
          throw Object.assign(new Error('duplicate key wo_revision_research'), { code: '23505' })
        revisions.push(row)
        return { rows: [row] }
      }
      throw new Error(`unexpected statement: ${s}`)
    },
    release() {}
  }
  return { pool: { connect: async () => client, query: client.query }, revisions, actions }
}

const label = (id) => [
  id,
  { key: 'm|p6', model: 'm', labels: { content: 'venue-interior', caption: `The ${id}` } }
]
/** The labelling while it still runs (nothing labelled yet) and once it is done (every photo labelled). */
const running = async () => ({
  labels: new Map(),
  note: { status: 'labelling', asked: 3, labelled: 0, cached: 0, max: 300, waiting: 3 }
})
const done = async () => ({
  labels: new Map(['oven', 'counter', 'loaves'].map(label)),
  note: { status: 'labelled', asked: 3, labelled: 3, cached: 3, max: 300 }
})

const refresh = (pool, pictureLabels) =>
  createRevision(pool, {
    accountId: 'acc-1',
    opportunityId: 'opp-1',
    domain,
    now: () => Date.parse(at),
    pictureLabels
  })

test('a Refresh after the labelling finished makes a new brief instead of answering the one made while it ran', async () => {
  const { pool, revisions } = memoryPool()
  const first = await refresh(pool, running)
  assert.equal(first.revision.brief.assetLabelling.status, 'labelling')
  assert.equal(labellingUnsettled(first.revision.brief), true)
  const firstKey = first.revision.research_hash
  assert.ok(firstKey)
  const second = await refresh(pool, done)
  assert.notEqual(second.revision.id, first.revision.id, 'the stale brief was answered again')
  assert.equal(second.reused, undefined)
  assert.equal(second.revision.brief.assetLabelling.status, 'labelled')
  assert.equal(labellingUnsettled(second.revision.brief), false)
  assert.ok(second.revision.brief.assets.some((a) => a.content === 'venue-interior'))
  // The research did not change: the new brief takes the research key, the old one keeps its content but leaves the key.
  assert.equal(second.revision.research_hash, firstKey)
  assert.equal(revisions.find((r) => r.id === first.revision.id).research_hash, null)
  // Nothing moved since: the next Refresh answers the new brief.
  const third = await refresh(pool, done)
  assert.equal(third.revision.id, second.revision.id)
  assert.equal(third.reused, true)
})

test('a Refresh while the labelling has not moved answers the same brief', async () => {
  const { pool, revisions } = memoryPool()
  const first = await refresh(pool, running)
  const again = await refresh(pool, running)
  assert.equal(again.revision.id, first.revision.id)
  assert.equal(again.reused, true)
  assert.equal(revisions.length, 1)
})

test('a build that holds a brief made while the labelling ran makes the brief of the finished labels and builds from it', async () => {
  const { pool, actions } = memoryPool()
  const stale = (await refresh(pool, running)).revision
  const action = {
    id: 'act-1',
    account_id: 'acc-1',
    opportunity_id: 'opp-1',
    revision_id: stale.id,
    build_request_id: 'req-1',
    selection: null
  }
  const photoLabelling = {
    gate: async () => ({
      ready: true,
      progress: { state: 'done', total: 3, looked: 3, failed: 0, linked: 3 }
    })
  }
  const made = await revisionForAction(pool, {
    action,
    domain,
    templates: async () => [],
    now: () => Date.parse(at),
    historical: true,
    pictureLabels: done,
    photoLabelling
  })
  // No template card is offered in this fake, so the choice is refused; the brief it chose is what this test reads.
  assert.ok(actions.get('act-1'), JSON.stringify(made))
  assert.notEqual(actions.get('act-1'), stale.id)
  assert.equal(action.revision_id, actions.get('act-1'))
})

test('a build waits while the labelling of its held brief still runs', async () => {
  const { pool } = memoryPool()
  const stale = (await refresh(pool, running)).revision
  const action = {
    id: 'act-2',
    account_id: 'acc-1',
    opportunity_id: 'opp-1',
    revision_id: stale.id,
    build_request_id: 'req-2',
    selection: null
  }
  const photoLabelling = {
    gate: async () => ({
      pending: true,
      retryAt: Date.parse(at) + 5000,
      progress: { state: 'running', total: 3, looked: 1, failed: 0, linked: 1 }
    })
  }
  const made = await revisionForAction(pool, {
    action,
    domain,
    templates: async () => [],
    now: () => Date.parse(at),
    historical: true,
    pictureLabels: running,
    photoLabelling
  })
  assert.equal(made.pending, true)
})

test('the Details page reads a brief as settled only when its labelling ended (a brief from before labelling is settled)', () => {
  assert.equal(labellingUnsettled({ assetLabelling: { status: 'labelling' } }), true)
  assert.equal(labellingUnsettled({ assetLabelling: { status: 'stalled' } }), true)
  for (const status of ['labelled', 'partial', 'failed', 'off', 'none', undefined, null])
    assert.equal(labellingUnsettled({ assetLabelling: { status } }), false, String(status))
  assert.equal(labellingUnsettled(null), false)
})

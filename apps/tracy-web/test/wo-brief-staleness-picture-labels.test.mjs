/**
 * A brief made from the latest research is current right after it is made: the staleness check of the Details page
 * (`route.js briefStatus`) hashes the live research read, which never carries the vision labels the brief step adds to
 * place photographs (they live in the shared analysis cache, not on the media rows). The research key leaves those
 * labels out, so the brief's own hash and the live one agree, and the header never says "the research changed since
 * this brief" about a brief made a minute ago.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import { createRevision, researchKey } from '../src/opportunities-build/revisions.js'

const at = '2026-10-27T08:00:00.000Z'
const sha = (n) => String(n).repeat(64).slice(0, 64)

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
      height: 1200,
      // As a live read holds it (`brief-research.js mediaOfBrief`): no labels is null.
      labels: null
    },
    {
      id: 'court',
      origin: 'place',
      kind: 'image',
      category: 'other',
      sha256: sha(2),
      width: 1600,
      height: 2133,
      labels: null
    }
  ],
  socialStats: []
})

/** A pool that answers the statements `createRevision` sends for an opportunity with no place. */
function fakePool() {
  const opp = {
    id: 'opp-1',
    account_id: 'acc-1',
    name: 'Harbour Sport Club',
    provider: 'google',
    candidate: {}
  }
  const client = {
    async query(sql, params = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(begin|commit|rollback)$/.test(s)) return { rows: [] }
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
        return { rows: [row] }
      }
      throw new Error(`unexpected statement: ${s}`)
    },
    release() {}
  }
  return { connect: async () => client }
}

const labelled = async () => ({
  labels: new Map([
    ['pool', { key: 'm|p3', model: 'm', labels: { content: 'venue-exterior', caption: 'The outdoor pool' } }]
  ]),
  note: { status: 'labelled', asked: 2, labelled: 1, cached: 0, max: 24 }
})

test('a brief made with labelled photographs hashes the same research the Details page reads', async () => {
  const made = await createRevision(fakePool(), {
    accountId: 'acc-1',
    opportunityId: 'opp-1',
    revisionId: 'rev-1',
    domain,
    frozenResearchRead: frozenRead(),
    researchSnapshotAt: at,
    now: () => Date.parse(at),
    pictureLabels: labelled
  })
  assert.ok(made.revision, JSON.stringify(made))
  assert.equal(made.revision.brief.assets.find((a) => a.id === 'pool').content, 'venue-exterior')
  // What `currentResearchKey` hashes: the same read, as the store holds it (no vision labels on place media).
  const live = researchKey(domain, frozenRead())
  assert.equal(made.revision.research_hash, live, 'the brief is current right after it is made')
})

test('labels the store keeps on a picture (not vision) still count as research', () => {
  const read = frozenRead()
  const withOwn = {
    ...read,
    media: read.media.map((m, i) => (i ? m : { ...m, labels: { category: 'menu' } }))
  }
  assert.notEqual(researchKey(domain, withOwn), researchKey(domain, read))
})

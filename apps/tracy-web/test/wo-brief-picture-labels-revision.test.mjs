/**
 * The first brief of a place already says what its photographs show (F08): the brief step labels them before the brief
 * is made (injected, so no network here), and a labelling that failed leaves them unlabelled with a note in the brief.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import { createRevision } from '../src/opportunities-build/revisions.js'

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

const revise = (pictureLabels) =>
  createRevision(fakePool(), {
    accountId: 'acc-1',
    opportunityId: 'opp-1',
    revisionId: 'rev-1',
    domain,
    frozenResearchRead: frozenRead(),
    researchSnapshotAt: at,
    now: () => Date.parse(at),
    pictureLabels
  })

test('the brief step labels the photographs first, so the first brief names what each shows', async () => {
  const asked = []
  const made = await revise(async (input) => {
    asked.push(input)
    return {
      labels: new Map([
        [
          'pool',
          { key: 'm|p3', model: 'm', labels: { content: 'venue-exterior', caption: 'The outdoor pool' } }
        ]
      ]),
      note: { status: 'labelled', asked: 2, labelled: 1, cached: 0, max: 24 }
    }
  })
  assert.ok(made.revision, JSON.stringify(made))
  assert.equal(asked.length, 1)
  assert.deepEqual(
    asked[0].media.map((m) => m.id),
    ['pool', 'court']
  )
  assert.equal(asked[0].accountId, 'acc-1')
  assert.equal(asked[0].trade, 'fitness')
  const brief = made.revision.brief
  const byId = new Map(brief.assets.map((a) => [a.id, a]))
  assert.equal(byId.get('pool').content, 'venue-exterior')
  assert.equal(byId.get('pool').caption, 'The outdoor pool')
  assert.equal(byId.get('court').content, 'unlabelled')
  assert.deepEqual(brief.assetLabelling, { status: 'labelled', asked: 2, labelled: 1, cached: 0, max: 24 })
  assert.match(
    made.revision.brief_md,
    /- Labels: labelled by a vision model \(1 of 2 asked, 0 cached, at most 24\)/
  )
})

test('a labelling that failed leaves the photographs unlabelled and the brief says why', async () => {
  const made = await revise(async () => {
    throw new Error('unexpected')
  })
  assert.ok(made.revision, JSON.stringify(made))
  const brief = made.revision.brief
  assert.ok(brief.assets.every((a) => a.content === 'unlabelled'))
  assert.equal(brief.assetLabelling.status, 'failed')
  assert.deepEqual(domain.validateBrief(brief).errors, [])
  assert.match(
    made.revision.brief_md,
    /- Labels: the vision model failed \(vision_failed\); pictures are unlabelled/
  )
})

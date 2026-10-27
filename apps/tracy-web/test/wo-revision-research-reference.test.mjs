/**
 * A revision references its frozen research and place profile by hash instead of embedding a copy in the brief
 * (#1791 V2): the agent demo, the QA gate and the brief engines resolve the same data through `researchOfRevision`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as domain from 'website-opportunities/domain'
import { createRevision } from '../src/opportunities-build/revisions.js'
import {
  AGENT_DEMO,
  checkedResearch,
  freezeAgentResearch,
  researchHash
} from '../src/opportunities-build/agent-demo.js'
import { researchOfRevision, briefWithResearch } from '../src/opportunities-build/revision-research.js'
import { briefOf } from '../src/opportunities-build/demo-qa.js'

const at = '2026-10-27T08:00:00.000Z'
const TRACKED = 'https://www.instagram.com/harbour.sportclub?igsh=ZmFrZXNoYXJlMDE'

/** A frozen research read, as `freezeDemoResearchInput` holds it on a demo action. */
const frozenRead = () => ({
  opportunity: { name: 'Harbour Sport Club', branch: null, candidate: {} },
  placeSnapshotId: null,
  profile: {
    name: 'Harbour Sport Club',
    phone: '+971 50 123 4567',
    address: 'Al Quoz, Dubai',
    links: [TRACKED]
  },
  brand: null,
  sources: [
    {
      id: 'src-web',
      source: 'website',
      ref: 'https://harboursportclub.example',
      status: 'complete',
      shared: true
    }
  ],
  rawSources: [
    {
      id: 'src-web',
      source: 'website',
      ref: 'https://harboursportclub.example',
      collected: {
        pages: [{ url: 'https://harboursportclub.example', text: 'European coaches for all ages.' }]
      }
    }
  ],
  posts: [{ text: 'Sessions across Dubai', url: 'https://harboursportclub.example/news' }],
  media: [],
  socialStats: []
})

/**
 * A pool that answers exactly the statements `createRevision` sends for an opportunity with no place, and keeps
 * the inserted row as Postgres would return it (through JSON, as jsonb does).
 */
function fakePool() {
  const rows = []
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
      if (s.startsWith('select * from wo_revision where id')) return { rows: [] }
      if (s.startsWith('select * from wo_revision where opportunity_id')) return { rows: [] }
      if (s.startsWith('insert into wo_revision')) {
        const cols = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',')
        const values = [...params]
        const row = {}
        for (const col of cols) row[col] = col === 'n' ? rows.length + 1 : values.shift()
        for (const key of Object.keys(row))
          if (typeof row[key] === 'string' && /^[[{n]/.test(row[key]) && key !== 'brief_md')
            row[key] = JSON.parse(row[key])
        rows.push(row)
        return { rows: [row] }
      }
      throw new Error(`unexpected statement: ${s}`)
    },
    release() {}
  }
  return { rows, connect: async () => client }
}

async function newRevision() {
  const pool = fakePool()
  const made = await createRevision(pool, {
    accountId: 'acc-1',
    opportunityId: 'opp-1',
    revisionId: 'rev-1',
    domain,
    frozenResearchRead: frozenRead(),
    researchSnapshotAt: at,
    now: () => Date.parse(at)
  })
  assert.ok(made.revision, JSON.stringify(made))
  return { ...made.revision, brief: { ...made.revision.brief, quickstartWorkflow: AGENT_DEMO } }
}

test('a new revision stores a reference and no embedded copy; the agent demo receives the frozen research', async () => {
  const revision = await newRevision()
  assert.equal(revision.brief.agentDemoSnapshot, undefined, 'the brief holds no second copy')
  const ref = revision.brief.agentDemoResearch
  assert.equal(ref.revisionId, 'rev-1')
  assert.equal(ref.placeProfileHash, revision.place_profile.profileHash)
  assert.equal(ref.researchHash, researchHash(revision.research))

  const bundle = checkedResearch(revision)
  // What the embedded snapshot would have held, made from the same frozen research.
  const embedded = freezeAgentResearch({
    read: frozenRead(),
    accountId: 'acc-1',
    opportunityId: 'opp-1',
    revisionId: 'rev-1',
    at
  })
  const { hash: _a, ...got } = bundle
  const { hash: _b, ...want } = embedded
  assert.deepEqual(got, JSON.parse(JSON.stringify(want)))
  assert.equal(bundle.hash, ref.hash, 'the bundle is named by its reference, stable across reads')
  assert.equal(bundle.sources[0].data.collected.pages[0].text, 'European coaches for all ages.')
  assert.equal(JSON.stringify(bundle).includes('igsh'), false, 'links are clean in the one source')

  const resolved = researchOfRevision(revision)
  assert.equal(resolved.placeProfile.profileHash, revision.place_profile.profileHash)
  assert.deepEqual(resolved.reference, ref)
})

test('the QA gate reads its evidence through the same reference', async () => {
  const revision = await newRevision()
  const seen = briefOf(revision)
  assert.equal(seen.researchHash, revision.brief.agentDemoResearch.hash)
  assert.ok(seen.briefText.includes('European coaches for all ages.'))
  assert.equal(seen.briefProse.includes('agentDemoResearch'), false, 'the reference is no brief fact')
  const tampered = structuredClone(revision)
  tampered.place_profile.profile.business.name.value = 'Dubai Gym'
  assert.throws(() => briefOf(tampered), /AGENT_DEMO_SNAPSHOT_CHANGED/)
})

test('the brief markdown made with the revision still reads the referenced research', async () => {
  const revision = await newRevision()
  const brief = briefWithResearch(revision)
  assert.equal(brief.agentDemoSnapshot.hash, revision.brief.agentDemoResearch.hash)
  assert.equal(revision.brief.agentDemoSnapshot, undefined, 'the stored brief is not changed')
})

test('a tampered referenced place profile fails with the changed-data error', async () => {
  const revision = await newRevision()
  const tampered = structuredClone(revision)
  tampered.place_profile.profile.business.name.value = 'Dubai Gym'
  assert.throws(() => checkedResearch(tampered), /AGENT_DEMO_SNAPSHOT_CHANGED/)
  const swapped = structuredClone(revision)
  swapped.place_profile = { ...swapped.place_profile, profileHash: 'f'.repeat(64) }
  assert.throws(() => checkedResearch(swapped), /AGENT_DEMO_SNAPSHOT_CHANGED/)
})

test('tampered referenced research, a moved reference or a missing research column fail loudly', async () => {
  const revision = await newRevision()
  const research = structuredClone(revision)
  research.research.profile.name = 'Dubai Gym'
  assert.throws(() => checkedResearch(research), /AGENT_DEMO_SNAPSHOT_CHANGED/)
  const moved = structuredClone(revision)
  moved.id = 'rev-2'
  assert.throws(() => checkedResearch(moved), /AGENT_DEMO_SNAPSHOT_CHANGED/)
  const forged = structuredClone(revision)
  forged.brief.agentDemoResearch.at = '2020-01-01T00:00:00.000Z'
  assert.throws(() => checkedResearch(forged), /AGENT_DEMO_SNAPSHOT_CHANGED/)
  const { research: _r, ...unloaded } = revision
  assert.throws(() => checkedResearch(unloaded), /AGENT_DEMO_SNAPSHOT_MISSING/)
})

test('an old revision with its embedded snapshot still resolves and passes its hash check', () => {
  const bundle = freezeAgentResearch({
    read: frozenRead(),
    accountId: 'acc-1',
    opportunityId: 'opp-1',
    revisionId: 'rev-old',
    at
  })
  const old = {
    id: 'rev-old',
    account_id: 'acc-1',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle }
  }
  assert.equal(checkedResearch(old).hash, bundle.hash)
  assert.equal(researchOfRevision(old).reference, null)
  assert.equal(briefWithResearch(old), old.brief, 'an old brief renders as stored')
  const changed = structuredClone(old)
  changed.brief.agentDemoSnapshot.profile.name = 'Changed'
  assert.throws(() => checkedResearch(changed), /AGENT_DEMO_SNAPSHOT_CHANGED/)
})

test('a reader that can do without research gets none from a brief that froze none', () => {
  assert.equal(researchOfRevision({ id: 'r', account_id: 'a', brief: {} }, { optional: true }), null)
  assert.throws(() => researchOfRevision({ id: 'r', account_id: 'a', brief: {} }), /SNAPSHOT_MISSING/)
})

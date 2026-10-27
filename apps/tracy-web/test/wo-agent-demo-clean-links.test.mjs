/** The demo agent's frozen source snapshot carries links without share tracking (#1780 item 10). */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_DEMO,
  checkedResearch,
  freezeAgentResearch,
  researchHash
} from '../src/opportunities-build/agent-demo.js'

const TRACKED = 'https://www.instagram.com/harbour.sportclub?igsh=ZmFrZXNoYXJlMDE&utm_source=qr'
const CLEAN = 'https://www.instagram.com/harbour.sportclub/'
const PLAIN = 'https://www.instagram.com/p/HSCpost0001/?img_index=1'

const read = {
  profile: { name: 'Place', links: [TRACKED] },
  rawSources: [{ id: 's1', source: 'instagram', ref: TRACKED, collected: { posts: [{ url: PLAIN }] } }]
}
const freeze = () =>
  freezeAgentResearch({
    read,
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-27T00:00:00Z'
  })

test('freezing keeps tracking out of every source link and leaves clean links byte-identical', () => {
  const bundle = freeze()
  assert.equal(bundle.sources[0].data.ref, CLEAN)
  assert.equal(bundle.profile.links[0], CLEAN)
  assert.equal(bundle.sources[0].data.collected.posts[0].url, PLAIN)
  assert.equal(JSON.stringify(bundle).includes('igsh'), false)
  assert.equal(JSON.stringify(bundle).includes('utm_'), false)
})

test('a snapshot frozen before the clean-up reads clean for the demo agent, under its own hash', () => {
  const data = {
    version: AGENT_DEMO,
    accountId: 'a',
    revisionId: 'r',
    sources: [{ id: 's1', data: { ref: TRACKED, other: PLAIN } }]
  }
  const stored = { ...data, hash: researchHash(data) }
  const revision = {
    id: 'r',
    account_id: 'a',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: stored }
  }
  const read = checkedResearch(revision)
  assert.equal(read.sources[0].data.ref, CLEAN)
  assert.equal(read.sources[0].data.other, PLAIN)
  assert.equal(read.hash, stored.hash)
  assert.equal(stored.sources[0].data.ref, TRACKED, 'the stored row is not rewritten')
})

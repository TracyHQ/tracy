// The research's logo reaches the host's `header-brand` (`agentDemoCollected`): the header must show it, and a file
// imported from it is the logo (`$logo`), never a photo of the place. No logo collected → none is asked for.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_DEMO, agentDemoCollected, freezeAgentResearch } from '../src/opportunities-build/agent-demo.js'

function revisionWith(brand) {
  const media = ['logo-1', 'photo-1'].map((id) => ({
    id,
    sha256: 'a'.repeat(64),
    kind: 'image',
    mime: 'image/png',
    source: 'facebook',
    sourceUrl: `https://example.test/${id}`
  }))
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-24T00:00:00Z',
    read: { profile: { name: 'Tin Lantern Saigon' }, media, rawSources: [], posts: [], brand }
  })
  return {
    id: 'revision',
    account_id: 'account',
    cms: 'wordpress',
    brief: {
      quickstartWorkflow: AGENT_DEMO,
      agentDemoSnapshot: bundle,
      business: { name: 'Tin Lantern Saigon' }
    }
  }
}
const build = {
  content: {
    agentDemo: {
      imports: {
        a: { state: 'written', assetId: 'logo-1', path: '/wp-content/uploads/tracy-content/logo.png' },
        b: { state: 'written', assetId: 'photo-1', path: '/wp-content/uploads/tracy-content/photo.jpg' }
      }
    }
  }
}

test('collected for the final check: the research’s logo, and the file placed from it marked as the logo', () => {
  const { collected, placedSources } = agentDemoCollected(revisionWith({ logo: 'logo-1' }), build)
  assert.equal(collected.logo, 'logo-1')
  assert.deepEqual(placedSources, {
    'wp-content/uploads/tracy-content/logo.png': '$logo',
    'wp-content/uploads/tracy-content/photo.jpg': 'photo-1'
  })
})

test('collected for the final check: no logo collected asks for none', () => {
  assert.equal(agentDemoCollected(revisionWith(null), build).collected.logo, null)
})

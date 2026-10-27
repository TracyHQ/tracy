// The brief reaches the host's QA twice: `briefText` with the frozen research (facts a build copied from the
// business's own pages are held), `briefProse` without it (template text is judged against the brief alone: with
// the research's vocabulary, 25 of 30 agency blocks read as the brief's — QuillHaus, 24/10/2026).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AGENT_DEMO, freezeAgentResearch } from '../src/opportunities-build/agent-demo.js'
import { briefOf } from '../src/opportunities-build/demo-qa.js'

test('briefOf: an agent demo sends the research with its facts and leaves it out of its prose', () => {
  const bundle = freezeAgentResearch({
    accountId: 'account',
    opportunityId: 'opp',
    revisionId: 'revision',
    at: '2026-10-24T00:00:00Z',
    read: {
      profile: { name: 'QuillHaus', bio: 'We may send you updates about this website.' },
      media: [],
      rawSources: [],
      posts: []
    }
  })
  const brief = briefOf({
    id: 'revision',
    account_id: 'account',
    brief_md: '# QuillHaus Al Barari',
    brief: { quickstartWorkflow: AGENT_DEMO, agentDemoSnapshot: bundle, business: { name: 'QuillHaus' } }
  })
  assert.match(brief.briefText, /send you updates about this website/)
  assert.match(brief.briefProse, /# QuillHaus Al Barari/)
  assert.doesNotMatch(brief.briefProse, /send you updates/)
})

test('briefOf: a brief with no research sends the same text twice', () => {
  const brief = briefOf({ brief_md: '# Pho Ba', brief: { business: { name: 'Pho Ba' } } })
  assert.equal(brief.briefProse, brief.briefText)
})

// 🔒 No filler (plan §7, 26/10/2026): the host is told every site language's fillers and approved neutral words.
test('briefOf: sends the domain fillers and neutral words of every site language to the host', async () => {
  const { forbiddenFillers, neutralWords } = await import('website-opportunities/domain')
  const sent = briefOf({ brief: { business: { name: 'Pho Hanoi' } }, brief_md: '' })
  assert.deepEqual(sent.fillers, forbiddenFillers())
  assert.deepEqual(sent.neutralWords, neutralWords())
  assert.ok(sent.fillers.includes('Coming soon'))
  assert.ok(sent.neutralWords.includes('Menu item'))
  assert.ok(sent.fillers.length > forbiddenFillers('en').length, 'other languages travel too')
})

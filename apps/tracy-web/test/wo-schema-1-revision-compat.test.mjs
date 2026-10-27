// A revision stored before #1791 (brief schema 1, its research embedded in `agentDemoSnapshot`, no frozen place
// profile) still builds: its build choice, the hand-off's research read and prompt, and the QA gate read it as stored,
// its own flags (WhatsApp `verified`, a team member's `onSite`, the `missing` list) deciding as they did. The fixture is
// Harbour Sport Club's brief as origin/develop 31193bcc9e made it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import { AGENT_DEMO, agentDemoPrompt, checkedResearch } from '../src/opportunities-build/agent-demo.js'
import { makeBuildChoice, withBuildChoice } from '../src/opportunities-build/build-choice.js'
import { briefOf } from '../src/opportunities-build/demo-qa.js'
import { siteWhatsAppOf } from '../src/opportunities-build/brand-on-site.js'
import { briefWithResearch } from '../src/opportunities-build/revision-research.js'

const { revision: stored } = JSON.parse(
  readFileSync(new URL('./fixtures/wo-revision-schema-1-hsc.json', import.meta.url), 'utf8')
)
const TEMPLATE = {
  platform: 'joomla',
  quickstart: 'tracy-business/joomla-1.x',
  design: 'tracy-business',
  version: '1.0.0',
  designSystem: { id: 'apple', source: 'catalog', name: 'Apple' }
}

test('a schema 1 revision with its embedded research goes through the build choice, hand-off and QA as stored', async () => {
  const domain = await websiteOpportunitiesDomain()
  assert.equal(stored.brief.schemaVersion, 1)
  assert.deepEqual(domain.validateBrief(stored.brief), { ok: true, errors: [] })

  const choice = makeBuildChoice({
    domain,
    revision: stored,
    cms: 'joomla',
    cmsSource: 'account',
    resolvedAt: '2026-10-27T09:00:00.000Z',
    template: TEMPLATE,
    workflow: AGENT_DEMO,
    ops: {}
  })
  const built = withBuildChoice(stored, choice)
  assert.equal(built.brief.quickstartWorkflow, AGENT_DEMO)
  assert.match(choice.briefMd, /schemaVersion 1/)
  assert.doesNotMatch(choice.briefMd, /## Facts and where they show|## Key messages/)

  // The hand-off reads the embedded research and checks it against the hash it was frozen under.
  const research = checkedResearch(built)
  assert.equal(research.hash, stored.brief.agentDemoSnapshot.hash)
  assert.equal(research.profile.name, 'Harbour Sport Club')
  assert.match(agentDemoPrompt(built), new RegExp(`frozen research ${research.hash}`))
  const prompt = domain.renderAgentPrompt({
    revision: { ...built, briefMarkdown: renderBriefWithReviews(domain, briefWithResearch(built)) }
  })
  // Its own flags decide: the inferred WhatsApp is said to be inferred, a reviews-only coach stays off the site.
  assert.match(prompt, /wa\.me\/971500001234/)
  assert.match(prompt, /Alex[^\n]*off the site/)
  assert.deepEqual(siteWhatsAppOf(built.brief), {
    ...siteWhatsAppOf(built.brief),
    href: 'https://wa.me/971500001234',
    verified: false
  })

  // QA judges against the same brief and research, and knows what it withholds.
  const qa = briefOf(built)
  assert.equal(qa.researchHash, stored.brief.agentDemoSnapshot.hash)
  assert.deepEqual(qa.whatsappLinks, ['https://wa.me/971500001234'])
  assert.deepEqual(qa.withheld.map((w) => w.field).sort(), ['googleRating', 'team'])
  assert.ok(qa.withheld.find((w) => w.field === 'team').values.includes('Alex'))

  // Tampered research fails loudly, as before.
  const changed = structuredClone(built)
  changed.brief.agentDemoSnapshot.profile.name = 'Changed'
  assert.throws(() => checkedResearch(changed), /AGENT_DEMO_SNAPSHOT_CHANGED/)
})

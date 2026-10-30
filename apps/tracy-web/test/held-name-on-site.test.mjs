// While a brief holds the business name off the site (#1791, `name-differs-from-own-marks`), the agent demo reads no
// name from the research brand (neither the held name nor a social handle) and the demo QA asks for no name on the
// page. Every name here is fictional (Harbour Sport Club fixture).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AGENT_DEMO,
  agentDemoCollected,
  agentPlanSources,
  bundlePart,
  checkedResearch,
  freezeAgentResearch
} from '../src/opportunities-build/agent-demo.js'

const HELD = 'Padel & Tennis Coach'
const nameFact = (onSite) => ({
  id: 'fact_name',
  field: 'name',
  value: HELD,
  confidence: 'corroborated',
  onSite,
  decidedBy: 'rule',
  reasons: onSite ? ['research-evidence'] : ['name-differs-from-own-marks']
})

function revisionWith(onSite) {
  const bundle = freezeAgentResearch({
    accountId: 'a',
    opportunityId: 'o',
    revisionId: 'r',
    at: '2026-10-27',
    read: {
      profile: { name: HELD },
      brand: {
        origin: 'social',
        colors: [{ hex: '#042515', role: 'primary' }],
        logo: 'logo-1',
        social: { name: 'harbour.sportclub', colors: [], origin: 'social' }
      },
      media: [{ id: 'logo-1', kind: 'image' }],
      rawSources: [],
      posts: []
    }
  })
  return {
    id: 'r',
    account_id: 'a',
    brief: {
      quickstartWorkflow: AGENT_DEMO,
      agentDemoSnapshot: bundle,
      business: { name: HELD },
      facts: [nameFact(onSite)]
    }
  }
}

test('a held business name: the research brand the agent reads names nobody, and QA asks for no name', () => {
  const revision = revisionWith(false)
  const research = checkedResearch(revision)
  const brand = bundlePart(research, 'brand').value
  assert.equal(brand.logo, 'logo-1', 'the logo stays')
  assert.ok(!JSON.stringify(brand).includes('harbour.sportclub'), JSON.stringify(brand))
  assert.ok(!JSON.stringify(brand).includes(HELD), JSON.stringify(brand))
  const ref = agentPlanSources(research).find((s) => s.part === 'brand')
  assert.ok(ref, 'the brand part is still a plan source')
  const { collected } = agentDemoCollected(revision, null)
  assert.equal(collected.name, null)
  assert.equal(collected.logo, 'logo-1')
})

test("a held business name: the research bundle says so in the brief's own shape, {missing, reasons}", () => {
  assert.deepEqual(checkedResearch(revisionWith(false)).nameHeld, {
    missing: 'name',
    reasons: ['name-differs-from-own-marks']
  })
  // Counter-case: a name on the site carries no nameHeld at all.
  assert.equal('nameHeld' in checkedResearch(revisionWith(true)), false)
})

test('a business name on the site: the agent reads the brand as it was collected, and QA asks for the name', () => {
  const revision = revisionWith(true)
  const brand = bundlePart(checkedResearch(revision), 'brand').value
  assert.equal(brand.social.name, 'harbour.sportclub')
  assert.equal(agentDemoCollected(revision, null).collected.name, HELD)
})

// Scratch G: the quickstart builders read the business through one seam (`siteBuildOf`), which lays the site's view of
// the business over the brief: while the name is held, the site title, pins and copy take the brief's neutral identity.
const NEUTRAL = 'Coaching team in Dubai'
const heldBrief = () => ({
  quickstartWorkflow: 'quickstart-first/1',
  business: { name: HELD, phone: '+971 50 000 1234', hours: ['Monday: 9:00 AM – 5:00 PM'] },
  facts: [nameFact(false)],
  sitemap: [
    {
      slug: 'home',
      title: 'Home',
      sections: [],
      seo: { title: NEUTRAL, description: 'A coaching team in Dubai.' }
    }
  ],
  missing: []
})
const fakePool = (brief) => ({
  query: async (sql) => {
    if (/from site_creation/.test(sql)) return { rows: [{ account_id: 'acc', build_id: 'b1' }] }
    if (/from account/.test(sql)) return { rows: [{ id: 'acc' }] }
    return {
      rows: [{ id: 'b1', account_id: 'acc', revision_id: 'r', brief, profile_effective: {}, choice: null }]
    }
  }
})

test('G. the quickstart source names the site by the neutral identity: sources, pins, site title and about', async () => {
  const brief = heldBrief()
  const { siteBuildOf } = await import('../src/opportunities-build/site-build.js')
  const build = await siteBuildOf(fakePool(brief), 'site', 'owner@example.test')
  assert.equal(build.brief.business.name, NEUTRAL)
  assert.equal(build.brief.business.phone, '+971 50 000 1234')
  const { quickstartSources, quickstartFactCopy } = await import(
    '../src/sites/brief-engines/quickstart-first.js'
  )
  const sources = quickstartSources({ ...build, profile_effective: {} }, { researchOf: () => null })
  assert.equal(sources.find((s) => s.type === 'name')?.text, NEUTRAL)
  assert.ok(!JSON.stringify(sources).includes(HELD))
  const pins = quickstartFactCopy(
    { key: 'site', bindings: [{ key: 'blogname', path: ['blogname'], role: 'name' }] },
    build.brief.business
  )
  assert.equal(pins.blogname, NEUTRAL)
  // The site title itself: what the identity step writes and reads back.
  const { quickstartIdentity } = await import('../src/sites/brief-engines/quickstart-identity.js')
  let title = 'Demo Company'
  const adapter = {
    call: async (op, args) => {
      if (op === 'content.update') title = args.fields.value
      return { item: { value: title } }
    }
  }
  const receipt = await quickstartIdentity({
    adapter,
    ctx: { platform: 'wordpress', runId: 'run' },
    name: build.brief.business.name,
    write: true
  })
  assert.equal(title, NEUTRAL)
  assert.equal(receipt.actual, NEUTRAL)
  const { quickstartVisitCards } = await import('../src/sites/brief-engines/quickstart-review-fallback.js')
  assert.ok(!JSON.stringify(quickstartVisitCards(build.brief.business)).includes(HELD))
  // The build's own name for the site and its about line, read from the revision outside the seam.
  const { aboutOf } = await import('../src/opportunities-build/builds.js')
  assert.ok(!aboutOf({ brief }).includes(HELD), aboutOf({ brief }))
  assert.ok(aboutOf({ brief }).startsWith(NEUTRAL))
  const { placeDossier } = await import('../src/opportunities-build/editorial.js')
  assert.equal(
    placeDossier({ revision: { account_id: 'acc', brief }, accountId: 'acc' }).business.name,
    NEUTRAL
  )
})

test('G. the agent demo asks QA for the neutral identity, never the held name', () => {
  const revision = revisionWith(false)
  revision.brief.sitemap = heldBrief().sitemap
  assert.equal(agentDemoCollected(revision, null).collected.name, NEUTRAL)
})

test('G. a name on the site still names the site', async () => {
  const brief = { ...heldBrief(), facts: [nameFact(true)] }
  const { siteBuildOf } = await import('../src/opportunities-build/site-build.js')
  const build = await siteBuildOf(fakePool(brief), 'site', 'owner@example.test')
  assert.equal(build.brief.business.name, HELD)
})

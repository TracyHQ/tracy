// What the owner keeps off the site, past the team (#593 review): a held person named in a service, a review, a post or
// a row is held with them; a held business name goes by the brief's neutral identity, so the header, the footer, the
// text logo and the home title still show a name; no question or assumption carries the held name. Invented club and
// people; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-withheld-kinds.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { researchOf } from '../domain/needs-research.mjs'
import { composerContextOf, planComposerRequest } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { withWithheld } from '../domain/plan-withheld.mjs'
import { lookOf } from '../domain/write-order-look.mjs'
import { seoOf } from '../domain/write-order-pages.mjs'
import {
  COACH,
  blockStore,
  brand,
  clubProfile,
  clubResearch,
  goodComposition,
  library,
  pageRecipes,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const HELD = 'Brindlewick Tennis Club'
const NEUTRAL = 'Tennis coaching in Ambermoor'
const contextOf = (profile, withheld) =>
  composerContextOf({
    profile: withWithheld(profile, { withheld }),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const row = (id, text) => ({ id, fields: { 'step.text': { value: text } }, sources: ['site'] })

test('a held person named in a service, a post or a row is held with them; a first name alone is not matched', () => {
  const profile = clubProfile()
  const [service] = profile.items.service
  service.fields['offering.description'] = { value: 'Private lessons with Ilse Varrow.', sources: ['site'] }
  profile.items.post = [
    {
      id: 'post-a-new-season',
      kind: 'post',
      fields: { 'post.title': { value: 'Ilse Varrow on a new season', sources: ['site'] } },
      sources: ['site']
    }
  ]
  profile.rows = [row('row-camp', 'Ilse Varrow runs the junior camp'), row('row-courts', 'Six clay courts')]
  profile.items.service[1].rows = [row('row-coach', 'Taught by Ilse Varrow'), row('row-hour', 'One hour')]
  const context = contextOf(profile, { people: ['Ilse Varrow'] })
  const held = [...context.data.withheld]
  for (const id of [COACH, service.id, 'post-a-new-season']) assert.ok(held.includes(id), `${id} not held`)
  assert.deepEqual(
    context.profile.rows.map((r) => r.id),
    ['row-courts']
  )
  assert.deepEqual(
    context.profile.items.service[1].rows.map((r) => r.id),
    ['row-hour']
  )
  assert.equal(JSON.stringify(JSON.parse(planComposerRequest(context).user)).includes('Varrow'), false)
  // Open product question: a held full name does not hold a text that names the person by first name only.
  profile.items.service[2].fields['offering.description'] = {
    value: 'Ilse coaches juniors.',
    sources: ['site']
  }
  assert.equal(
    contextOf(profile, { people: ['Ilse Varrow'] }).data.withheld.has(profile.items.service[2].id),
    false
  )
})

test('a held name with a neutral identity: header, footer, text logo and home title show the neutral name', () => {
  const brief = {
    facts: [{ id: 'f-name', field: 'name', value: HELD, onSite: false, evidence: [] }],
    sitemap: [{ slug: 'home', seo: { title: NEUTRAL } }]
  }
  const { withheld } = researchOf(brief)
  assert.deepEqual(withheld, { name: true, siteName: NEUTRAL })
  const result = gatePlan(goodComposition(), contextOf(clubProfile(), withheld))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const { plan } = result
  assert.deepEqual(
    plan.facts.filter((f) => f.kind === 'business.name').map((f) => f.value),
    [NEUTRAL]
  )
  const home = plan.pages[0]
  assert.deepEqual(
    home.blocks.filter((b) => b.data.includes('business-name')).map((b) => b.block),
    ['hero-home', 'footer-main']
  )
  assert.equal(seoOf(home, { home: true, facts: plan.facts, pictures: [] }).title, NEUTRAL)
  assert.equal(lookOf({ logo: { kind: 'text' } }, plan, plan.facts).logo.text, NEUTRAL)
  assert.equal(JSON.stringify(plan).includes(HELD), false)
})

test('a held name with no neutral identity is left out under a neutral what; no question or assumption names it', () => {
  // A real name conflict: the map listing spells the name another way, so the profile asks and assumes about it.
  const club = clubResearch()
  club.research.sources[1].fields['business.name'] = 'Brindlewick TC'
  club.reading.facts.push({
    source: 'gmaps',
    kind: 'business.name',
    value: 'Brindlewick TC',
    evidence: 'Brindlewick TC'
  })
  const profile = needsProfileOf(club.research, club.reading)
  const nameQuestion = 'fact-conflict.facts.business.name'
  assert.ok(profile.questions.some((q) => q.id === nameQuestion))
  assert.match(JSON.stringify(contextOf(profile, undefined).assumptions), /Brindlewick TC/)
  for (const withheld of [{ name: true }, { name: true, siteName: NEUTRAL }]) {
    const held = contextOf(profile, withheld)
    assert.equal(
      held.profile.questions.some((q) => q.id === nameQuestion),
      false
    )
    assert.equal(
      JSON.stringify([held.assumptions, held.profile.conflicts, held.profile.questions]).includes(
        'Brindlewick'
      ),
      false
    )
  }
  const context = contextOf(profile, { name: true })
  const c = goodComposition()
  for (const b of c.pages.flatMap((p) => p.blocks)) b.data = b.data.filter((id) => id !== 'business-name')
  c.pages[0].blocks = c.pages[0].blocks.filter((b) => b.data.length > 0)
  const result = gatePlan(c, context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.ok(result.plan.leftOut.some((e) => e.what === 'Your business name'))
  assert.equal(JSON.stringify(result.plan).includes('Brindlewick'), false)
})

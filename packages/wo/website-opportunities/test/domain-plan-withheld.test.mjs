// What the owner keeps off the site (locked planner rule P2, brief decision 21c): the old brief shape (a `name` fact
// decided off, `missing[]` team values) rides on the research and the needs profile as `withheld`, and the plan never
// shows it. Invented club and people; no model is called here.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-withheld.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { researchOf } from '../domain/needs-research.mjs'
import { composePlan, composerContextOf, planComposerRequest } from '../domain/plan-composer.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { WITHHELD_REASON, withWithheld } from '../domain/plan-withheld.mjs'
import {
  COACH,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const contextOf = (withheld) =>
  composerContextOf({
    profile: withWithheld(clubProfile(), { withheld }),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const withoutTeam = () => {
  const c = goodComposition()
  c.pages.splice(1, 1)
  c.assumptions = []
  return c
}

test('the research carries the brief held name and held people as they are; nothing held, no key', () => {
  const brief = {
    facts: [{ id: 'f-name', field: 'name', value: 'Brindlewick Tennis Club', onSite: false, evidence: [] }],
    missing: [{ field: 'team', withheld: [{ values: ['Ilse Varrow'] }] }]
  }
  const research = researchOf(brief)
  assert.deepEqual(research.withheld, { name: true, people: ['Ilse Varrow'] })
  assert.ok(research.setAside.some((s) => s.id === 'f-name' && s.reason === 'kept off the site'))
  assert.equal('withheld' in researchOf({ facts: [] }), false)
  assert.deepEqual(withWithheld({ facts: {} }, research).withheld, research.withheld)
})

test('a held person is never shown: the gate refuses it, the model never reads it, the plan leaves it out', () => {
  const context = contextOf({ people: ['Ilse Varrow'] })
  const user = JSON.parse(planComposerRequest(context).user)
  assert.equal(
    user.business.items.some((i) => i.id === COACH),
    false
  )
  const shown = gatePlan(goodComposition(), context)
  assert.deepEqual(
    shown.problems.map((p) => [p.code, p.at]),
    [['withheld_shown', 'pages[1].blocks[0].data[0]']]
  )
  const result = gatePlan(withoutTeam(), context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(
    result.plan.items.some((i) => i.id === COACH),
    false
  )
  assert.deepEqual(
    result.plan.leftOut.filter((e) => e.reason === WITHHELD_REASON),
    [{ what: 'A team member you keep private', kind: 'item', reason: WITHHELD_REASON }]
  )
  assert.equal(
    result.plan.pages.some((p) => p.blocks.some((b) => b.data.includes(COACH))),
    false
  )
})

test('a held business name is never shown, and a review naming a held person goes with them', () => {
  const context = contextOf({ name: true })
  assert.deepEqual(
    gatePlan(goodComposition(), context).problems.map((p) => p.code),
    ['withheld_shown', 'withheld_shown']
  )
  const c = goodComposition()
  c.pages[0].blocks[1].data = ['contact-hours']
  c.pages[0].blocks[5].data = ['contact-phone']
  const result = gatePlan(c, context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(
    result.plan.facts.some((f) => f.kind === 'business.name'),
    false
  )
  // A review written under a held name is held with that person (the old `held-reviews.mjs` match, whole words).
  assert.deepEqual(
    [...contextOf({ people: ['Osric Vale'] }).data.withheld],
    ['quote-my-two-kids-love-the-junior-coaching']
  )
  assert.deepEqual(
    [...contextOf({ people: ['Osric'] }).data.withheld],
    ['quote-my-two-kids-love-the-junior-coaching']
  )
  assert.deepEqual([...contextOf({ people: ['Osr'] }).data.withheld], [])
})

test('the profile composePlan hands the page writer holds nothing the owner keeps off the site', async () => {
  const c = withoutTeam()
  c.pages[0].blocks[1].data = ['contact-hours']
  c.pages[0].blocks[5].data = ['contact-phone']
  const { profile } = await composePlan({
    profile: withWithheld(clubProfile(), { withheld: { name: true, people: ['Ilse Varrow', 'Osric Vale'] } }),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    model: scriptedModel(JSON.stringify(c))
  })
  // The writer builds its data from this profile (`writePages`: `planDataOf(profile)`).
  const ids = [...planDataOf(profile).byId.keys()]
  assert.equal(ids.includes(COACH), false)
  assert.equal(ids.includes('quote-my-two-kids-love-the-junior-coaching'), false)
  assert.equal('business.name' in profile.facts, false)
  assert.ok(
    ids.includes('contact-phone') && ids.includes('quote-friendly-coaches-and-the-courts-are-always-swept')
  )
})

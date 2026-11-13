// D43 (was P6): a person never disappears because a team block needs more people. On the real JA Boxing recipes an
// invented florist with one person shows that person in a block that holds one; with none, no team block; with two,
// as before. A template whose every team block needs two leaves the one person out with the reason. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-people.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
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
import {
  boxingComposition,
  boxingProfile,
  boxingRecipes,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'
import { ANSWERED_LABEL } from './fixtures/write-order/invented-florist.mjs'

const person = (name) => ({
  id: `person-${name.toLowerCase().replace(/\s+/g, '-')}`,
  kind: 'person',
  fields: { 'person.name': { value: name, sources: ['site'] } },
  sources: ['site']
})
const florist = (...names) => {
  const profile = boxingProfile()
  if (names.length) profile.items.person = names.map(person)
  return profile
}
const boxing = (profile) => composerContextOf(boxingInput(profile))
const showing = (plan, id) =>
  plan.pages.flatMap((p) => p.blocks.filter((b) => b.data.includes(id)).map((b) => `${p.id}/${b.block}`))
const teamBlocks = (plan) =>
  plan.pages.flatMap((p) => p.blocks.filter((b) => b.type === 'team').map((b) => b.block))
const block = (id, data) => ({ block: id, label: 'Part', data, reason: 'It fits your shop.' })

test('JA Boxing, one person: shown in a block that holds one, on the page or by the gate', async () => {
  const profile = florist('Tamsin Reed')
  const id = 'person-tamsin-reed'
  // The model shows nobody: the gate places the person in the home team block, whose minimum is one.
  const { plan, attempts } = await composePlan({
    ...boxingInput(profile),
    model: scriptedModel(JSON.stringify(boxingComposition(profile)))
  })
  assert.deepEqual(attempts, [{ problems: [] }])
  assert.deepEqual(showing(plan, id), ['home/block-163'])
  // A trainer page whose one trainer block shows the person passes as it is.
  const trainer = boxingComposition(profile)
  trainer.pages.push({ pageType: 'trainer', name: 'Tamsin Reed', blocks: [block('block-180', [id])] })
  const kept = gatePlan(trainer, boxing(profile))
  assert.equal(kept.ok, true, JSON.stringify(kept.problems))
  assert.deepEqual(showing(kept.plan, id), ['trainer/block-180'])
  // Leaving the person out while that block fits is refused.
  const dropped = boxingComposition(profile)
  dropped.leftOut.push({ item: id, reason: 'The team section needs more people.' })
  assert.deepEqual(
    gatePlan(dropped, boxing(profile)).problems.map((p) => [p.code, p.at]),
    [['person_dropped_block_fits', 'leftOut[0].item']]
  )
})

test('JA Boxing, no person: no team block; two people: as before', () => {
  const none = gatePlan(boxingComposition(florist()), boxing(florist()))
  assert.equal(none.ok, true, JSON.stringify(none.problems))
  assert.deepEqual(teamBlocks(none.plan), [])
  const two = florist('Tamsin Reed', 'Odile Brask')
  const c = boxingComposition(two)
  c.pages.push({
    pageType: 'trainers',
    name: 'Our florists',
    blocks: [block('block-178', ['person-tamsin-reed', 'person-odile-brask'])]
  })
  const result = gatePlan(c, boxing(two))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(teamBlocks(result.plan), ['block-178'])
})

test('a template whose every team block needs two leaves the one person out, with the reason', () => {
  const store = blockStore()
  store.blocks.find((b) => b.id === 'team-cards').items.min = 2
  const context = composerContextOf({
    profile: clubProfile(),
    blockStore: store,
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  const c = goodComposition()
  c.pages.splice(1, 1)
  c.assumptions = []
  const result = gatePlan(c, context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(
    result.plan.leftOut.find((e) => e.what === 'Ilse Varrow'),
    {
      what: 'Ilse Varrow',
      kind: 'item',
      reason:
        'Every section of the template for your team members shows at least 2, and you have 1; nobody is made up to fill it.'
    }
  )
  // The model may leave the person out itself: no block fits, so it is no problem.
  c.leftOut.push({ item: COACH, reason: 'Our team section needs two people.' })
  assert.equal(gatePlan(c, context).ok, true)
})

function boxingInput(profile) {
  return {
    profile,
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: ANSWERED_LABEL }],
    blockStore: boxingStore,
    pageRecipes: boxingRecipes,
    library: TRACY_LIBRARY,
    template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true
  }
}

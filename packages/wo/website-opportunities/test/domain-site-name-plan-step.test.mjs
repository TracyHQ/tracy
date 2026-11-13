// The plan step with a site nothing may name (#593 G4): answers that name it let the step proceed, a function that
// asks the profile's questions sees the site name question, and answers without it stop before any model call with
// the question to ask. The invented club; scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-site-name-plan-step.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPlanStep } from '../domain/plan-step.mjs'
import {
  blockStore,
  brand,
  clubResearch,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const NAME = 'Riverside Courts'
const answer = (text) => ({ schema: 'tracy-build-answer/v1', question: 'site-name', text })
const held = () => {
  const club = clubResearch()
  club.research.withheld = { name: true }
  return club
}
const step = (club, model, answers) =>
  buildPlanStep({
    research: club.research,
    model,
    brand: brand(),
    answers,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    planId: 'plan-club'
  })

test('4: a function that asks the questions sees the site name question first, and its answer lets the step proceed', async () => {
  const club = held()
  const model = scriptedModel(JSON.stringify(club.reading), JSON.stringify(goodComposition()))
  let asked
  const result = await step(club, model, (profile) => {
    asked = profile.questions.map((q) => q.topic)
    return [answer(NAME)]
  })
  assert.equal(asked[0], 'site-name')
  assert.equal(model.calls.length, 2)
  assert.equal(result.plan.facts.find((f) => f.kind === 'business.name').value, NAME)
  assert.equal(result.needsProfile.withheld.name, true)
})

test('4: answers given as a list that name the site let the step proceed', async () => {
  const club = held()
  const model = scriptedModel(JSON.stringify(club.reading), JSON.stringify(goodComposition()))
  const result = await step(club, model, [answer(NAME)])
  assert.equal(result.plan.facts.find((f) => f.kind === 'business.name').value, NAME)
})

test('4: answers that leave the site name open stop with site_name_missing before any model call', async () => {
  for (const answers of [[], [{ ...answer(NAME), text: undefined, skipped: true }]]) {
    const model = scriptedModel()
    await assert.rejects(step(held(), model, answers), (e) => {
      assert.equal(e.code, 'site_name_missing')
      assert.equal(e.noRerun, true)
      assert.equal(e.details.question.topic, 'site-name')
      return true
    })
    assert.equal(model.calls.length, 0)
  }
})

test('4: a function that leaves the site name unanswered stops with site_name_missing before the plan call', async () => {
  const club = held()
  const model = scriptedModel(JSON.stringify(club.reading))
  await assert.rejects(
    step(club, model, () => []),
    (e) => e.code === 'site_name_missing'
  )
  assert.equal(model.calls.length, 1)
})

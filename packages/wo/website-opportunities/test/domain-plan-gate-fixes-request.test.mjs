// What the plan composer offers the model is what its gate accepts (#614): every block a recipe of the request lists,
// and every library block, passes the gate's own recipe check on that page type. And a counted claim the gate's own
// length rule made untrue loses its number instead of failing the plan. Invented florist and pottery studio on the
// real JA Boxing store and the invented club; scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-fixes-request.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composePlan, composerContextOf, planComposerRequest } from '../domain/plan-composer.mjs'
import { fitsRecipe } from '../domain/plan-placement-pages.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'
import { composeInputs, pottery, potteryComposition } from './fixtures/child-lists/invented-pottery.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { contextOf } from './fixtures/write-order/boxing-gate.mjs'

/** Every (page type, block) the request offers, checked the way the gate checks a placed block. */
function offeredRefusals(context) {
  const user = JSON.parse(planComposerRequest(context).user)
  const offered = new Set(user.blocks.map((x) => x.id))
  const refused = []
  for (const recipe of user.recipes) {
    const gateRecipe = context.recipes.get(recipe.pageType)
    if (!gateRecipe) refused.push(`${recipe.pageType}: no such recipe in the gate`)
    for (const id of [recipe.mainBlock, ...recipe.blocks]) {
      if (!offered.has(id)) refused.push(`${recipe.pageType}: ${id} is not offered`)
      else if (!fitsRecipe(context.blocks.get(id), gateRecipe)) refused.push(`${recipe.pageType}: ${id}`)
    }
    for (const block of user.blocks.filter((x) => x.source === 'library'))
      if (!fitsRecipe(context.blocks.get(block.id), gateRecipe))
        refused.push(`${recipe.pageType}: ${block.id}`)
  }
  return { refused, user }
}

test('JA Boxing: every block a recipe of the request lists, and every library block, passes the gate on that page', () => {
  const { refused, user } = offeredRefusals(contextOf(boxingProfile()))
  assert.ok(user.recipes.length > 10 && user.blocks.length > 40, 'the real store is read')
  assert.deepEqual(refused, [])
})

test('the invented club: the same holds for its store, recipes and library', () => {
  const context = composerContextOf({
    profile: Club.clubProfile(),
    blockStore: Club.blockStore(),
    pageRecipes: Club.pageRecipes(),
    library: Club.library(),
    template: Club.template(),
    brand: Club.brand(),
    planId: 'plan-club'
  })
  const { refused, user } = offeredRefusals(context)
  assert.ok(user.recipes.length > 0 && user.blocks.some((x) => x.source === 'library'))
  assert.deepEqual(refused, [])
})

const NAME = 'Evening wheel basics for absolute beginners'
function profileWithLongName() {
  const { research, reading } = pottery()
  research.sources[0].text += ` ${NAME}: Mon.`
  reading.items.push({ source: 'site', kind: 'service', fields: { 'offering.name': NAME }, evidence: NAME })
  const profile = needsProfileOf(research, reading)
  return { profile, long: profile.items.service.find((i) => i.fields['offering.name'].value === NAME).id }
}

test('a counted claim the length rule made untrue loses its number on the first attempt, recorded', async () => {
  const { profile, long } = profileWithLongName()
  const first = potteryComposition()
  first.pages[0].blocks[1].data.push(long)
  first.pages[0].blocks[1].reason = 'The four classes you teach, with their times.'
  const model = Club.scriptedModel(JSON.stringify(first))
  const { plan, attempts, fixes } = await composePlan({ ...composeInputs(profile), model })
  assert.equal(attempts.length, 1)
  assert.equal(plan.pages[0].blocks[1].reason, 'The classes you teach, with their times.')
  assert.deepEqual(
    fixes.map(({ code, at, was }) => ({ code, at, was })),
    [
      {
        code: 'reason_count_mismatch',
        at: 'pages[0].blocks[1].reason',
        was: 'The four classes you teach, with their times.'
      }
    ]
  )
  assert.ok(
    plan.leftOut.some((e) => e.kind === 'item'),
    'the long class is reported as left out'
  )
})

test('a claim of the whole that no longer holds still goes back to the model: without its number it says every one', async () => {
  const { profile, long } = profileWithLongName()
  const first = potteryComposition()
  first.pages[0].blocks[1].data.push(long)
  first.pages[0].blocks[1].reason = 'All four classes you teach, with their times.'
  const model = Club.scriptedModel(JSON.stringify(first), JSON.stringify(potteryComposition()))
  const { attempts, fixes } = await composePlan({ ...composeInputs(profile), model })
  assert.equal(attempts.length, 2)
  assert.deepEqual(
    attempts[0].problems.map((p) => p.code),
    ['reason_count_mismatch']
  )
  assert.deepEqual(fixes, [])
})

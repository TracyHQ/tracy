// A held business name (#593 review G3, G4): its words are matched in every value of every kind, as a held person's
// are, so a review or a summary naming it never reaches the model or the plan; and a site nothing may name stops
// early with `site_name_missing` instead of building a nameless site. The invented florist on the real JA Boxing
// store; scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-withheld-name.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { TRACY_LIBRARY } from '../domain/library.mjs'
import { composePlan, composerContextOf, planComposerRequest } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { buildPlanStep } from '../domain/plan-step.mjs'
import { withWithheld, withoutWithheld } from '../domain/plan-withheld.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import {
  boxingComposition,
  boxingProfile,
  boxingRecipes,
  boxingStore
} from './fixtures/write-order/boxing-florist.mjs'

const NEUTRAL = 'Flowers in Ambermoor'
const INPUT = {
  answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: 'Order a bouquet today' }],
  blockStore: boxingStore,
  pageRecipes: boxingRecipes,
  library: TRACY_LIBRARY,
  template: { slug: 'ja-boxing', name: 'JA Boxing', version: '1.0.11', accent: '#c00000' },
  brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
  allowTemplateLook: true,
  planId: 'p'
}

/** The florist whose name is held, with a review and a summary that write it. */
function heldProfile() {
  const profile = boxingProfile()
  const held = profile.facts['business.name'][0].value
  profile.items.quote[0].fields['quote.text'].value = `${held} made our wedding.`
  profile.facts['business.summary'] = [
    { value: `${held} ties meadow bouquets.`, sources: ['site'], confidence: 'single-source' }
  ]
  return { profile, held }
}

test('G3: a value naming the held business name is withheld, in the request, the plan and the writer profile', () => {
  const { profile, held } = heldProfile()
  const settled = withWithheld(profile, { withheld: { name: true, siteName: NEUTRAL } })
  const context = composerContextOf({ ...INPUT, profile: settled })
  const quote = profile.items.quote[0].id
  assert.deepEqual([...context.data.withheld].sort(), ['business-summary', quote].sort())
  assert.equal(planComposerRequest(context).user.includes(held), false)
  const gated = gatePlan(boxingComposition(profile), context)
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  assert.equal(JSON.stringify(gated.plan).includes(held), false)
  assert.equal(
    gated.plan.leftOut.filter((e) => e.what === 'Something that shows the business name you keep private')
      .length,
    2
  )
  assert.deepEqual(
    gated.plan.facts.filter((f) => f.kind === 'business.name').map((f) => f.value),
    [NEUTRAL]
  )
  const writer = withoutWithheld(context.profile)
  assert.equal('business.summary' in writer.facts, false)
  assert.equal(
    writer.items.quote.some((q) => q.id === quote),
    false
  )
})

test('G3: a name held as whole words only: a longer word that contains it is no match', () => {
  const profile = boxingProfile()
  profile.facts['business.name'] = [{ value: 'Bloom', sources: ['site'], confidence: 'single-source' }]
  profile.items.quote[0].fields['quote.text'].value = 'Everything was in full blooming colour.'
  const context = composerContextOf({
    ...INPUT,
    profile: withWithheld(profile, { withheld: { name: true, siteName: NEUTRAL } })
  })
  assert.deepEqual([...context.data.withheld], [])
})

test('G4: a held name with no neutral identity stops early with site_name_missing, before any model call', async () => {
  const { profile } = heldProfile()
  const model = scriptedModel()
  await assert.rejects(
    composePlan({ ...INPUT, profile: withWithheld(profile, { withheld: { name: true } }), model }),
    (error) => {
      assert.equal(error.code, 'site_name_missing')
      assert.equal(error.noRerun, true)
      assert.match(error.message, /ask the customer for a name the site may show/)
      return true
    }
  )
  assert.equal(model.calls.length, 0)
  const brandStep = async () => {
    throw new Error('the brand step is never reached')
  }
  await assert.rejects(
    buildPlanStep({ ...INPUT, research: { withheld: { name: true } }, model, brandStep }),
    (error) => error.code === 'site_name_missing' && error.noRerun === true
  )
  assert.equal(model.calls.length, 0)
})

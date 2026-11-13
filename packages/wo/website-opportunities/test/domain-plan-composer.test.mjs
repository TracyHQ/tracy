// The plan composer (ticket #593): one call to a scripted fake build model composes the plan, the rules gate checks it,
// a failing plan is composed once more with the gate's problems, a second failure stops with a typed error. The brand
// step runs in parallel with the needs profile and has finished before the plan exists. No test calls a real model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { NEEDS_PROFILE_PROMPT } from '../domain/needs-profile.mjs'
import {
  PLAN_COMPOSER_PROMPT,
  PlanComposerError,
  buildPlanStep,
  composePlan
} from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  clubResearch,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const DEMO = 'Welcome to the demo club of the template'
const inputs = (model, overrides = {}) => ({
  profile: clubProfile(),
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club',
  model,
  ...overrides
})
const inventing = () => {
  const c = goodComposition()
  c.pages[0].blocks[2].data.push('service-padel-nights')
  return c
}
const targetingDesign = () => {
  const c = goodComposition()
  c.pages[0].blocks[1].targets = ['background']
  return c
}

test('one model call composes the plan; its input holds the needs profile and the block list, no demo content', async () => {
  const store = blockStore()
  // A block store is emptied of demo content by contract; even a stray demo string never reaches the model.
  store.blocks[1].demo = { heading: DEMO }
  store.blocks[1].fields[0].example = DEMO
  const model = scriptedModel(JSON.stringify(goodComposition()))
  const { plan, attempts, prompt } = await composePlan(inputs(model, { blockStore: store }))
  assert.equal(model.calls.length, 1)
  assert.equal(attempts.length, 1)
  assert.equal(model.calls[0].system, PLAN_COMPOSER_PROMPT)
  assert.match(model.calls[0].system, /DRAFT, not approved/)
  assert.equal(prompt.file, 'plan-composer-prompt.md')
  assert.ok(!model.calls[0].user.includes(DEMO))
  assert.doesNotMatch(model.calls[0].user, /"(demo|example)"/)
  const sent = JSON.parse(model.calls[0].user)
  assert.deepEqual(Object.keys(sent).sort(), ['blocks', 'business', 'language', 'recipes'])
  assert.ok(sent.business.items.some((i) => i.id === 'service-cardio-tennis'))
  assert.ok(sent.business.facts.some((f) => f.id === 'contact-phone'))
  assert.deepEqual(
    sent.blocks.map((b) => b.id),
    [...blockStore().blocks.map((b) => b.id), 'tracy-reviews']
  )
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
})

test('a plan that fails the gate is composed again once, with the problems, and the second plan is kept', async () => {
  const model = scriptedModel(JSON.stringify(inventing()), JSON.stringify(goodComposition()))
  const { plan, attempts } = await composePlan(inputs(model))
  assert.equal(model.calls.length, 2)
  assert.deepEqual(
    attempts.map((a) => a.problems.map((p) => p.code)),
    [['invented_item'], []]
  )
  const second = JSON.parse(model.calls[1].user)
  assert.deepEqual(second.problems, [
    {
      at: 'pages[0].blocks[2].data[4]',
      message:
        '"service-padel-nights" is not a fact or item of the needs profile: take it out of this block, and leave the block out when it then shows nothing'
    }
  ])
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('a second failure stops with a typed error that keeps every problem, after exactly two calls', async () => {
  const model = scriptedModel(JSON.stringify(inventing()), JSON.stringify(targetingDesign()))
  await assert.rejects(composePlan(inputs(model)), (error) => {
    assert.ok(error instanceof PlanComposerError)
    assert.equal(error.code, 'plan_gate_failed')
    assert.deepEqual(
      error.details.attempts.map((a) => a.problems.map((p) => p.code)),
      [['invented_item'], ['design_field']]
    )
    assert.deepEqual(
      error.details.problems.map((p) => p.code),
      ['design_field']
    )
    return true
  })
  assert.equal(model.calls.length, 2)
})

test('a model that keeps inventing a service never gets a plan through', async () => {
  const model = scriptedModel(JSON.stringify(inventing()), inventing())
  await assert.rejects(
    composePlan(inputs(model)),
    (e) => e.code === 'plan_gate_failed' && e.details.problems.every((p) => p.code === 'invented_item')
  )
})

test('an unreadable reply counts as a failed attempt and is composed again', async () => {
  const model = scriptedModel('not json', `\`\`\`json\n${JSON.stringify(goodComposition())}\n\`\`\``)
  const { attempts } = await composePlan(inputs(model))
  assert.deepEqual(
    attempts.map((a) => a.problems.map((p) => p.code)),
    [['reply_unreadable'], []]
  )
  await assert.rejects(composePlan(inputs(scriptedModel('[]', 'nope'))), (e) => e.code === 'plan_gate_failed')
  await assert.rejects(composePlan(inputs(undefined)), (e) => e.code === 'model_missing')
})

test('without a brand record no plan is composed; the template fallback lives behind a test flag', async () => {
  let calls = 0
  const model = async () => {
    calls += 1
    return JSON.stringify(goodComposition())
  }
  await assert.rejects(
    composePlan(inputs(model, { brand: null })),
    (e) => e instanceof PlanComposerError && e.code === 'brand_missing' && e.noRerun === true
  )
  assert.equal(calls, 0)
  const { plan } = await composePlan(inputs(model, { brand: null, allowTemplateLook: true }))
  assert.equal(plan.look.accent, '#225588')
  assert.deepEqual(plan.look.logo, { kind: 'text' })
  assert.deepEqual(
    plan.assumptions.filter((a) => a.field.startsWith('look.')).map((a) => a.field),
    ['look.accent', 'look.logo']
  )
  assert.equal(checkBuildDocument(plan).ok, true)
})

test('after research the brand record is settled before the needs profile is asked, then the plan is composed', async () => {
  const club = clubResearch()
  const seen = []
  const brandStep = async () => {
    seen.push('brand step ran')
    return brand()
  }
  const model = scriptedModel(
    (request) => {
      assert.equal(request.system, NEEDS_PROFILE_PROMPT)
      seen.push('needs profile called')
      return JSON.stringify(club.reading)
    },
    (request) => {
      assert.equal(request.system, PLAN_COMPOSER_PROMPT)
      seen.push('plan composed')
      return JSON.stringify(goodComposition())
    }
  )
  const result = await buildPlanStep({
    research: club.research,
    model,
    brandStep,
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    planId: 'plan-club'
  })
  assert.deepEqual(seen, ['brand step ran', 'needs profile called', 'plan composed'])
  assert.equal(result.plan.look.accent, '#1f7a4d')
  assert.equal(result.profile.schema, 'tracy-needs-profile/v1')
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

test('a plan step with no brand record stops with brand_missing before any model call', async () => {
  const club = clubResearch()
  for (const input of [{ brandStep: async () => null }, { brand: null }, { brand: { kind: 'brand-file' } }]) {
    let calls = 0
    const model = async () => {
      calls += 1
      return JSON.stringify(club.reading)
    }
    await assert.rejects(
      buildPlanStep({
        research: club.research,
        model,
        ...input,
        blockStore: blockStore(),
        pageRecipes: pageRecipes(),
        template: template()
      }),
      (e) => e instanceof PlanComposerError && e.code === 'brand_missing' && e.noRerun === true
    )
    assert.equal(calls, 0)
  }
})

test('a brand record given to the plan step is used as it is, with no brand step', async () => {
  const club = clubResearch()
  const model = scriptedModel(JSON.stringify(club.reading), JSON.stringify(goodComposition()))
  const result = await buildPlanStep({
    research: club.research,
    model,
    brand: brand(),
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    planId: 'plan-club'
  })
  assert.equal(result.plan.look.accent, '#1f7a4d')
})

test('a failing brand step stops the plan step with a typed error', async () => {
  const club = clubResearch()
  const model = scriptedModel(JSON.stringify(club.reading))
  await assert.rejects(
    buildPlanStep({
      research: club.research,
      model,
      brandStep: async () => {
        throw new Error('logo pictures could not be read')
      },
      blockStore: blockStore(),
      pageRecipes: pageRecipes(),
      template: template()
    }),
    (e) => e instanceof PlanComposerError && e.code === 'brand_step_failed'
  )
  // A brand step the customer stopped keeps its own code: a stop is no failure (second review 13/11).
  await assert.rejects(
    buildPlanStep({
      research: club.research,
      model: scriptedModel(JSON.stringify(club.reading)),
      brandStep: async () => {
        throw Object.assign(new Error('stop pressed'), { code: 'brand_step_stopped', noRerun: true })
      },
      blockStore: blockStore(),
      pageRecipes: pageRecipes(),
      template: template()
    }),
    (e) => e instanceof PlanComposerError && e.code === 'brand_step_stopped' && e.noRerun === true
  )
})

test('the plan step asks the profile questions through an answers function and composes with the answers', async () => {
  const club = clubResearch()
  const model = scriptedModel(JSON.stringify(club.reading), JSON.stringify(goodComposition()))
  const asked = []
  const result = await buildPlanStep({
    research: club.research,
    model,
    brandStep: async () => brand(),
    answers: (profile) => {
      asked.push(...profile.questions.map((q) => q.id))
      return [
        { schema: 'tracy-build-answer/v1', question: 'fact-conflict.facts.contact.phone', choice: 'value-2' }
      ]
    },
    blockStore: blockStore(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    planId: 'plan-club'
  })
  assert.deepEqual(asked, ['fact-conflict.facts.contact.phone', 'main-button'])
  assert.equal(result.plan.facts.find((f) => f.id === 'contact-phone').value, '+1 555 0142 779')
  assert.equal(result.needsProfile.facts['contact.phone'][0].value, '+1 555 0142 778')
  assert.equal(result.profile.facts['contact.phone'][0].value, '+1 555 0142 779')
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

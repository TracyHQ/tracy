// A malformed reply never crashes the plan step (ticket #593): every part of the model's reply is shape checked before
// any rule reads it, so a malformed reply goes through the one retry and then stops as `plan_gate_failed`, a
// `PlanComposerError` and nothing else. Scripted fake model only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { PlanComposerError, composePlan, composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import {
  SERVICES,
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const mutate = (change) => {
  const c = goodComposition()
  change(c)
  return c
}
const MALFORMED = {
  'a null left out entry': mutate((c) => c.leftOut.push(null)),
  'a null assumption': mutate((c) => c.assumptions.push(null)),
  'a null page': mutate((c) => c.pages.push(null)),
  'a null block': mutate((c) => c.pages[0].blocks.push(null)),
  'a null id in data': mutate((c) => c.pages[0].blocks[2].data.push(null)),
  'a number as an id': mutate((c) => c.pages[0].blocks[2].data.push(7)),
  'an object as an id': mutate((c) => c.pages[0].blocks[2].data.push({ id: SERVICES[0] })),
  'data as an object': mutate((c) => (c.pages[0].blocks[2].data = { 0: SERVICES[0] })),
  'data as a text': mutate((c) => (c.pages[0].blocks[2].data = SERVICES[0])),
  'blocks as an object': mutate((c) => (c.pages[0].blocks = { hero: c.pages[0].blocks[1] })),
  'pages as an object': mutate((c) => (c.pages = { home: c.pages[0] })),
  'a page as a list': mutate((c) => (c.pages[0] = [c.pages[0]])),
  'a block as a list': mutate((c) => (c.pages[0].blocks[0] = ['header-main'])),
  'pageType as a number': mutate((c) => (c.pages[0].pageType = 1)),
  'a block id as an object': mutate((c) => (c.pages[0].blocks[0].block = { id: 'header-main' })),
  'a label as a list': mutate((c) => (c.pages[0].blocks[0].label = ['Top bar'])),
  'a reason as a number': mutate((c) => (c.pages[0].blocks[0].reason = 3)),
  'targets as a text': mutate((c) => (c.pages[0].blocks[1].targets = 'heading')),
  'a target as an object': mutate((c) => (c.pages[0].blocks[1].targets = [{ name: 'heading' }])),
  'a duplicate id in data': mutate((c) => c.pages[0].blocks[2].data.push(SERVICES[0])),
  'a duplicate left out item': mutate((c) =>
    c.leftOut.push({ item: 'person-ilse-varrow', reason: 'a' }, { item: 'person-ilse-varrow', reason: 'b' })
  ),
  'an unknown key on the reply': mutate((c) => (c.copy = { heading: 'Welcome to the club' })),
  'an unknown key on a page': mutate((c) => (c.pages[0].title = 'Welcome')),
  'an unknown key on a block': mutate((c) => (c.pages[0].blocks[1].heading = 'Welcome')),
  'a fields key on a block, aimed at a design field': mutate(
    (c) => (c.pages[0].blocks[1].fields = { background: 'red' })
  ),
  'an unknown key on an assumption': mutate((c) => (c.assumptions[0].value = 'x')),
  'a left out entry without what or item': mutate((c) => c.leftOut.push({ reason: 'x' })),
  'a left out kind outside the list': mutate((c) =>
    c.leftOut.push({ what: 'x', kind: 'section', reason: 'y' })
  ),
  'assumptions as an object': mutate((c) => (c.assumptions = { language: 'en' })),
  'leftOut as a text': mutate((c) => (c.leftOut = 'nothing')),
  'a field path as a number': mutate((c) => (c.assumptions[0].field = 42)),
  'no pages key': { assumptions: [] },
  'an empty object': {}
}

const inputs = (model) => ({
  profile: clubProfile(),
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand(),
  planId: 'plan-club',
  model
})

test(`a table of ${Object.keys(MALFORMED).length} malformed replies: the gate reports reply_shape, never throws`, () => {
  assert.ok(Object.keys(MALFORMED).length >= 20)
  const context = composerContextOf(inputs())
  for (const [name, reply] of Object.entries(MALFORMED)) {
    const result = gatePlan(reply, context)
    assert.equal(result.ok, false, name)
    assert.ok(
      result.problems.some((p) => p.code === 'reply_shape'),
      `${name}: ${JSON.stringify(result.problems)}`
    )
  }
})

test('every malformed reply goes through the one retry, then stops as plan_gate_failed and nothing else', async () => {
  for (const [name, reply] of Object.entries(MALFORMED)) {
    const model = scriptedModel(JSON.stringify(reply), reply)
    await assert.rejects(
      composePlan(inputs(model)),
      (e) => e instanceof PlanComposerError && e.code === 'plan_gate_failed',
      name
    )
    assert.equal(model.calls.length, 2, name)
  }
})

test('a malformed first reply and a good second one give a plan', async () => {
  const model = scriptedModel(
    JSON.stringify(MALFORMED['a null left out entry']),
    JSON.stringify(goodComposition())
  )
  const { attempts } = await composePlan(inputs(model))
  assert.deepEqual(
    attempts.map((a) => [...new Set(a.problems.map((p) => p.code))]),
    [['reply_shape'], []]
  )
})

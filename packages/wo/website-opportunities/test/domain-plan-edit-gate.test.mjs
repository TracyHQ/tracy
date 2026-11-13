// A customer's plan edit is held to the rules gate (ticket #593, for the partial re-run #599): block minimums and
// maximums, kinds, facts in item blocks, the pictures summary counted again, problems in the customer's words.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { checkPlanEdit } from '../domain/build-contract-plan-edit.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import {
  PHOTOS,
  SERVICES,
  blockStore,
  brand,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

/** The conflicted club with five more invented services, so a block can be given more than its maximum. */
function biggerProfile() {
  const profile = conflictedClubProfile()
  const [first] = profile.items.service
  for (const name of ['Ball machine', 'Night league', 'Doubles clinic', 'Racket stringing', 'Summer camp'])
    profile.items.service.push({
      ...structuredClone(first),
      id: `service-${name.toLowerCase().replace(/ /g, '-')}`,
      fields: { 'offering.name': { value: name, sources: ['site'], confidence: 'single-source' } }
    })
  return profile
}
const store = () => {
  const s = blockStore()
  s.blocks.find((b) => b.id === 'gallery-strip').items.min = 1
  return s
}

async function composed() {
  const inputs = {
    blockStore: store(),
    pageRecipes: pageRecipes(),
    library: library(),
    template: template(),
    brand: brand()
  }
  const { plan, profile } = await composePlan({
    ...inputs,
    profile: biggerProfile(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  const block = (type) => plan.pages[0].blocks.find((b) => b.type === type)
  const edit = (...changes) => ({
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-1',
    plan: { id: plan.id, revision: plan.revision },
    changes: changes.map(([field, value]) => ({ field, value }))
  })
  const gate = (e) => gateEditedPlan({ plan, edit: e, profile, ...inputs })
  return { plan, profile, block, edit, gate }
}

test('an edit to one service where the block shows at least two is refused, in the customer words', async () => {
  const { block, edit, gate } = await composed()
  const e = edit([`pages[home].blocks[${block('services').id}].data`, [SERVICES[0]]])
  assert.equal(checkPlanEdit(e, (await composed()).plan).ok, true, 'Contract B alone lets it through')
  const result = gate(e)
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => p.code),
    ['too_few_items']
  )
  assert.equal(
    result.problems[0].message,
    'The Services section shows at least 2 services; this change leaves 1.'
  )
})

test('an edit to nine services where the block shows at most four is refused', async () => {
  const { block, edit, gate, plan } = await composed()
  const nine = plan.items.filter((i) => i.kind === 'service').map((i) => i.id)
  assert.equal(nine.length, 9)
  const result = gate(edit([`pages[home].blocks[${block('services').id}].data`, nine]))
  assert.deepEqual(
    result.problems.map((p) => p.code),
    ['too_many_items']
  )
  assert.equal(
    result.problems[0].message,
    'The Services section shows at most 4 services; this change gives it 9.'
  )
})

test('an edit that leaves only facts in an item block is refused', async () => {
  const { block, edit, gate } = await composed()
  const result = gate(edit([`pages[home].blocks[${block('services').id}].data`, ['contact-phone']]))
  assert.deepEqual(
    result.problems.map((p) => p.code),
    ['too_few_items', 'fact_without_field']
  )
  assert.match(result.problems[1].message, /The Services section has no place for Phone\./)
})

test('editing the gallery data counts the pictures summary again', async () => {
  const { block, edit, gate, plan } = await composed()
  const result = gate(edit([`pages[home].blocks[${block('gallery').id}].data`, [PHOTOS[0]]]))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(result.plan.revision, 2)
  assert.notDeepEqual(result.plan.pictures, plan.pictures)
  console.log('pictures before', JSON.stringify(plan.pictures), 'after', JSON.stringify(result.plan.pictures))
  assert.equal(checkBuildDocument(result.plan).ok, true)
})

test('an edited item field value reaches the profile the page writer reads', async () => {
  const { edit, gate } = await composed()
  const result = gate(edit(['facts[service-adult-group-lessons-offering-price].value', '$27 per session']))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const lessons = result.profile.items.service.find((i) => i.id === 'service-adult-group-lessons')
  assert.equal(lessons.fields['offering.price'].value, '$27 per session')
  assert.equal(
    result.profile.conflicts.find((c) => c.at.endsWith('offering.price')).chosen,
    '$27 per session'
  )
})

test('a Contract B problem of the edit is reported, worded for the customer', async () => {
  const { edit, gate } = await composed()
  const result = gate(edit(['pages[home].blocks[home-b1].reason', 'Nope']))
  assert.equal(result.ok, false)
  assert.equal(result.problems[0].code, 'edit_invalid')
  assert.match(result.problems[0].message, /^This change cannot be saved: /)
})

// An item renamed on the plan card reaches the needs profile and every writer request (#612, the rule in the edit
// gate's `profileAfterEdit`): a service and a team member renamed through `gateEditedPlan`, every named item kind
// through the rule itself, and the kinds whose label is not their name left alone. Invented club only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { namingRoleOf, renameItems } from '../domain/plan-edit-item-names.mjs'
import { ANSWER_SOURCE } from '../domain/plan-answers.mjs'
import { writerContextOf, writerRequestsOf } from '../domain/page-writer-context.mjs'
import {
  blockStore,
  brand,
  conflictedClubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const inputs = () => ({
  blockStore: blockStore(),
  pageRecipes: pageRecipes(),
  library: library(),
  template: template(),
  brand: brand()
})

async function composed() {
  const { plan, profile } = await composePlan({
    ...inputs(),
    profile: conflictedClubProfile(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(goodComposition()))
  })
  const edit = (...changes) => ({
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-rename',
    plan: { id: plan.id, revision: plan.revision },
    changes: changes.map(([field, value]) => ({ field, value }))
  })
  return { plan, profile, edit, gate: (e) => gateEditedPlan({ plan, edit: e, profile, ...inputs() }) }
}

const writerAsked = (plan, profile) =>
  JSON.stringify([
    ...writerRequestsOf(
      plan,
      writerContextOf({ profile, blockStore: blockStore(), library: library() })
    ).values()
  ])

test('a service renamed on the card is the name in the profile and in every writer request', async () => {
  const { edit, gate, plan, profile } = await composed()
  const shown = plan.items.find((i) => i.id === 'service-court-hire')
  assert.ok(shown, 'the plan shows the court hire service')
  assert.match(writerAsked(plan, profile), /Court hire/i)
  const result = gate(edit(['items[service-court-hire].label', '  Lantern court rental ']))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const item = result.profile.items.service.find((i) => i.id === 'service-court-hire')
  assert.equal(item.fields['offering.name'].value, 'Lantern court rental')
  assert.deepEqual(item.fields['offering.name'].sources, [ANSWER_SOURCE])
  assert.ok(result.profile.sources.some((s) => s.id === ANSWER_SOURCE))
  const asked = writerAsked(result.plan, result.profile)
  assert.match(asked, /Lantern court rental/)
  assert.doesNotMatch(asked, /Court hire/i)
  // The profile given to the gate is not changed.
  assert.notEqual(
    profile.items.service.find((i) => i.id === 'service-court-hire').fields['offering.name'].value,
    'Lantern court rental'
  )
})

test('a team member renamed on the card is the person name in the profile', async () => {
  const { edit, gate } = await composed()
  const result = gate(edit(['items[person-ilse-varrow].label', 'Ilse Marrow']))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(result.profile.items.person[0].fields['person.name'].value, 'Ilse Marrow')
})

test('a review or a photo label edit leaves the profile items as they were', async () => {
  const { edit, gate, profile } = await composed()
  const quote = profile.items.quote[0].id
  const result = gate(edit([`items[${quote}].label`, 'Review by Someone Else']))
  if (result.ok) assert.deepEqual(result.profile.items.quote, profile.items.quote)
})

test('every item kind with a naming field is renamed by its first required role; the others are not', () => {
  const named = {
    service: 'offering.name',
    menu_item: 'offering.name',
    package: 'package.name',
    person: 'person.name',
    step: 'step.title',
    event: 'event.title',
    faq: 'faq.question',
    stat_item: 'stat.value'
  }
  for (const [kind, role] of Object.entries(named)) {
    assert.equal(namingRoleOf(kind), role, kind)
    const item = {
      id: `${kind}-1`,
      fields: { [role]: { value: 'Old', sources: ['site'], confidence: 'single-source' } }
    }
    const data = { byId: new Map([[item.id, { what: 'item', kind, source: item }]]) }
    assert.equal(renameItems(data, [{ field: `items[${kind}-1].label`, value: 'New' }]), true, kind)
    assert.deepEqual(item.fields[role], {
      value: 'New',
      sources: [ANSWER_SOURCE],
      confidence: 'single-source'
    })
  }
  for (const kind of ['quote', 'gallery', 'claim', 'post']) {
    assert.equal(namingRoleOf(kind), null, kind)
    const item = { id: 'x', fields: {} }
    const data = { byId: new Map([['x', { what: 'item', kind, source: item }]]) }
    assert.equal(renameItems(data, [{ field: 'items[x].label', value: 'New' }]), false, kind)
    assert.deepEqual(item.fields, {})
  }
  // A fact, a blank value or another field is not a rename.
  const fact = { value: 'v' }
  const data = { byId: new Map([['f', { what: 'fact', kind: 'contact.phone', source: fact }]]) }
  assert.equal(renameItems(data, [{ field: 'items[f].label', value: 'New' }]), false)
  assert.equal(renameItems(data, [{ field: 'facts[f].value', value: 'New' }]), false)
})

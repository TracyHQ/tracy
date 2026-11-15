// Opening hours on the plan (#609, sixth real run): the card showed the structured value (`Mo-Fr 06:00-21:00; Sa
// 08:00-16:00`), and right after the owner asked to show the hours the plan only said, among the left out entries,
// that the design has no place for them. The hours fact now carries a display form code writes from the structure,
// with a code and parameters for the day names (`plan-hours-display.mjs`), and an owner value the design cannot show
// is a not done line of the request with its reason. The invented florist on the JA Boxing block store (which has no
// hours field); scripted fake model only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-hours-display.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { PLAN_EDIT_SCHEMA } from '../domain/build-contract-plan-edit.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { hoursDisplayOf } from '../domain/plan-hours-display.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { answer, requestFor } from './fixtures/plan-composer/plan-request.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { INPUT, composition, contactPage, homeOf } from './fixtures/write-order/boxing-gate.mjs'
import { composePlan } from '../domain/plan-composer.mjs'

const hoursOf = (plan) => plan.facts.find((f) => f.kind === 'contact.hours')

test('the display form of hours is written from their structure, with a code and the days as parameters', () => {
  assert.deepEqual(hoursDisplayOf('Mo-Fr 06:00-21:00; Sa 08:00-16:00'), {
    display: 'Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00',
    code: 'opening_hours',
    params: {
      groups: 2,
      from1: 'mo',
      to1: 'fr',
      hours1: '06:00-21:00',
      from2: 'sa',
      to2: 'sa',
      hours2: '08:00-16:00'
    }
  })
  assert.equal(
    hoursDisplayOf('Mo-We 09:00-12:00; Th-Fr 09:00-12:00').display,
    'Monday to Friday, 9:00 to 12:00'
  )
  assert.equal(hoursDisplayOf('Su closed').params.hours1, 'closed')
  assert.equal(hoursDisplayOf('By appointment only'), null)
})

test('the plan carries the hours as their value and their display form, and a card edit writes it again', async () => {
  const given = boxingProfile()
  const model = scriptedModel(JSON.stringify(composition([homeOf(given), contactPage()])))
  const result = await composePlan({ ...INPUT, profile: given, model })
  const profile = result.profile
  const hours = hoursOf(result.plan)
  assert.equal(hours.value, 'Tu-Sa 09:00-18:00')
  assert.equal(hours.display, 'Tuesday to Saturday, 9:00 to 18:00')
  assert.equal(hours.code, 'opening_hours')
  assert.equal(checkBuildDocument(result.plan).ok, true)
  const edit = (value) => ({
    schema: PLAN_EDIT_SCHEMA,
    id: 'edit-hours',
    plan: { id: result.plan.id, revision: result.plan.revision },
    changes: [{ field: `facts[${hours.id}].value`, value }]
  })
  const kit = { blockStore: INPUT.blockStore, pageRecipes: INPUT.pageRecipes, library: INPUT.library }
  const edited = gateEditedPlan({ ...kit, plan: result.plan, profile, edit: edit('Mo-Fr 07:00-19:00') })
  assert.equal(edited.ok, true, JSON.stringify(edited.problems))
  assert.equal(hoursOf(edited.plan).display, 'Monday to Friday, 7:00 to 19:00')
  const typed = gateEditedPlan({ ...kit, plan: result.plan, profile, edit: edit('Most days, ask us') })
  assert.equal(typed.ok, true, JSON.stringify(typed.problems))
  assert.equal(hoursOf(typed.plan).display, undefined)
  assert.equal(hoursOf(typed.plan).code, undefined)
})

test('hours the owner asks to show, which the design has no place for, are a not done line with the reason', async () => {
  const profile = boxingProfile()
  delete profile.facts['contact.hours']
  const model = scriptedModel(JSON.stringify(composition([homeOf(profile), contactPage()])))
  const composed = await composePlan({ ...INPUT, profile, model })
  const plan = composed.plan
  const text = 'Please show our opening hours on the site: Monday to Friday 6am to 9pm, Saturday 8am to 4pm.'
  const revised = await revisePlan({
    ...INPUT,
    plan,
    profile: composed.profile,
    request: requestFor(plan, text),
    model: scriptedModel(answer())
  })
  assert.equal(hoursOf(revised.plan).display, 'Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00')
  const saved = revised.codes.changed.indexOf('owner_value_saved')
  assert.equal(
    revised.changed[saved],
    'Your answer is saved: Opening hours, Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00.'
  )
  const at = revised.codes.notDone.indexOf('owner_value_not_shown')
  assert.ok(at >= 0, JSON.stringify(revised.codes))
  assert.deepEqual(revised.notDone[at], {
    what: 'Show your opening hours on the site',
    reason: 'no_recipe',
    why: 'Your answer is saved, but your design has no place that shows it.'
  })
  assert.deepEqual(revised.codes.notDoneParams[at], {
    kind: 'contact.hours',
    label: 'Opening hours',
    because: 'no_place_in_design'
  })
  assert.equal(checkBuildDocument(revised.revision).ok, true)
})

test('a later request carries the code of a left out entry code wrote, never model_reason', async () => {
  const profile = boxingProfile()
  delete profile.facts['contact.hours']
  const model = scriptedModel(JSON.stringify(composition([homeOf(profile), contactPage()])))
  const composed = await composePlan({ ...INPUT, profile, model })
  const ask = (plan, prof, text) =>
    revisePlan({
      ...INPUT,
      plan,
      profile: prof,
      request: requestFor(plan, text),
      model: scriptedModel(answer())
    })
  const first = await ask(
    composed.plan,
    composed.profile,
    'Please show our opening hours: Monday to Friday 6am to 9pm.'
  )
  const entry = (plan) => plan.leftOut.find((e) => e.item === 'contact-hours')
  assert.equal(entry(first.plan).code, 'no_place_in_design')
  const home = first.plan.pages[0]
  const gallery = home.blocks.find((x) => x.block === 'block-166')
  const fewer = {
    op: 'set_block_data',
    page: home.id,
    block: gallery.id,
    data: gallery.data.slice(0, 3),
    request: 'one photo fewer'
  }
  const second = await revisePlan({
    ...INPUT,
    plan: first.plan,
    profile: first.profile,
    request: requestFor(first.plan, 'Please show one photo fewer on the home page.', 'request-2'),
    model: scriptedModel(answer([fewer]))
  })
  assert.equal(second.unchanged, false)
  assert.equal(entry(second.plan).code, 'no_place_in_design')
})

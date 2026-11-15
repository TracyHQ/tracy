// What a change request asks that no op of the model can do (#609 over #617), done by code: an owner's typed value
// enters the profile as the owner's answer and the plan shows it; a rename in words takes the plan card's edit path; an
// item no page shows, named for removal, is left out as asked. The scripted fake model refuses each as a real run did,
// and the customer is never told what is not true. Invented club, scripted fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { REQUESTED_OFF_REASON } from '../domain/plan-request-taken-off.mjs'
import { goodComposition, SERVICES, clubProfile } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, revision } from './fixtures/plan-composer/plan-request.mjs'

const refusal = (what, reason, why) => answer([], [{ what, reason, why }])

/** The invented club with no opening hours anywhere, as a business whose sources never gave them. */
async function planWithoutHours() {
  const composition = goodComposition()
  for (const page of composition.pages)
    for (const b of page.blocks) b.data = b.data.filter((id) => id !== 'contact-hours')
  const profile = clubProfile()
  delete profile.facts['contact.hours']
  return firstPlan(composition, profile)
}

test('opening hours typed in a change request enter the profile as the owner answer and the plan shows them', async () => {
  const first = await planWithoutHours()
  assert.ok(!first.plan.facts.some((f) => f.kind === 'contact.hours'))
  const { input } = revision(
    first,
    'We are open Monday to Friday from 7 am to 8 pm. Show these opening hours on the site.',
    refusal(
      'You want your opening hours shown on the site.',
      'no_data',
      'The plan has no opening-hours data to display.'
    )
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false)
  const hours = result.plan.facts.find((f) => f.kind === 'contact.hours')
  assert.equal(hours.value, 'Mo-Fr 07:00-20:00')
  assert.deepEqual(hours.sources, [{ kind: 'answer', name: 'Your answer' }])
  assert.deepEqual(result.profile.facts['contact.hours'][0].sources, ['owner-statement'])
  // The draft keeps this profile: one composed again from the profile sent would lose the owner's value.
  assert.equal(result.draftProfile.facts['contact.hours'][0].value, 'Mo-Fr 07:00-20:00')
  const shown = result.plan.pages.some((p) => p.blocks.some((b) => b.data.includes(hours.id)))
  assert.ok(shown)
  assert.ok(!result.notDone.some((e) => /hours/i.test(`${e.what} ${e.why}`)))
  assert.ok(checkBuildDocument(result.revision).ok)
})

for (const text of [
  'Rename the service "Court hire" to "Court rental".',
  'Please call the service court hire Court rental instead.'
])
  test(`a rename asked in words takes the plan card's edit path: ${text}`, async () => {
    const first = await firstPlan()
    const { input } = revision(
      first,
      text,
      refusal('Rename the service.', 'outside_plan', 'You can’t change service details on the plan card.')
    )
    const result = await revisePlan(input)
    assert.equal(result.unchanged, false)
    assert.equal(result.plan.items.find((i) => i.id === 'service-court-hire').label, 'Court rental')
    const item = result.profile.items.service.find((i) => i.id === 'service-court-hire')
    assert.equal(item.fields['offering.name'].value, 'Court rental')
    const kept = result.draftProfile.items.service.find((i) => i.id === 'service-court-hire')
    assert.equal(kept.fields['offering.name'].value, 'Court rental')
    assert.deepEqual(result.changed, ['Court hire is now called Court rental.'])
    assert.deepEqual(result.codes.changed, ['item_renamed'])
    assert.deepEqual(result.notDone, [])
    assert.equal(result.plan.revision, first.plan.revision + 1)
    assert.ok(checkBuildDocument(result.plan).ok)
  })

/** The invented club's first plan with one service on no page: the card lists it, the plan leaves it out. */
async function planWithServiceOnNoPage() {
  const composition = goodComposition()
  composition.pages[0].blocks[2].data = SERVICES.filter((id) => id !== 'service-cardio-tennis')
  composition.leftOut.push({
    item: 'service-cardio-tennis',
    reason: 'This is longer than the section can show, so it is not shown there.'
  })
  return firstPlan(composition)
}

test('an item the card lists but no page shows, named for removal, is left out as asked', async () => {
  const first = await planWithServiceOnNoPage()
  const shownBefore = first.plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data))
  assert.ok(!shownBefore.includes('service-cardio-tennis'))
  assert.ok(first.plan.items.some((i) => i.id === 'service-cardio-tennis'))
  const { input } = revision(
    first,
    'Remove the service "Cardio tennis". It is the same class as another one.',
    refusal(
      'Remove the service you mentioned',
      'outside_plan',
      'That service is not shown in your current plan.'
    )
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false)
  assert.deepEqual(result.changed, ['Cardio tennis stays off your site, as you asked.'])
  assert.deepEqual(result.codes.changed, ['item_taken_off'])
  assert.deepEqual(result.notDone, [])
  const entries = result.plan.leftOut.filter((e) => e.what === 'Cardio tennis')
  assert.deepEqual(
    entries.map((e) => e.reason),
    [REQUESTED_OFF_REASON]
  )
  assert.ok(!result.plan.pages.some((p) => p.blocks.some((b) => b.data.includes('service-cardio-tennis'))))
})

test('a shown item named for removal is left to the model, and an unrelated refusal of the model is kept', async () => {
  const first = await firstPlan()
  const { input, model } = revision(
    first,
    'Remove the service "Cardio tennis" and add an awards page.',
    answer(
      [
        {
          op: 'set_block_data',
          page: 'home',
          block: 'home-b3',
          data: SERVICES.filter((id) => id !== 'service-cardio-tennis'),
          request: 'Remove the service "Cardio tennis"'
        }
      ],
      [{ what: 'An awards page', reason: 'fact_missing', why: 'No source mentions an award.' }]
    )
  )
  const result = await revisePlan(input)
  assert.equal(model.calls.length, 1)
  assert.ok(result.changed.some((l) => /Services section of the Home page now shows/.test(l)))
  assert.deepEqual(result.notDone, [
    { what: 'An awards page', reason: 'fact_missing', why: 'No source mentions an award.' }
  ])
  assert.deepEqual(result.codes.notDone, [null])
})

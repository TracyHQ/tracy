// An empty or blank address (run 7 of the release gate). A value of only white space is no value, everywhere: the plan
// lists no such fact. A business with no address is a business with no premises to visit: the plan is composed
// without it and the places of an address stay unwritten; nothing stops. Only a composition that still names the
// absent fact fails the gate (`invented_item`), as it would for any fact the profile does not hold.
// Invented club, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-empty-address.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import {
  blockStore,
  brand,
  clubProfile,
  goodComposition,
  library,
  pageRecipes,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'

const BLANKS = ['', ' ', ' \t ']

/** The club with `kind` set to `value`, and the composition without the fact `id`. */
function inputs(kind, id, value) {
  const profile = clubProfile()
  profile.facts[kind][0].value = value
  const composition = goodComposition()
  for (const page of composition.pages) {
    for (const block of page.blocks) block.data = block.data.filter((d) => d !== id)
    page.blocks = page.blocks.filter((b) => b.data.length > 0)
  }
  const model = scriptedModel(JSON.stringify(composition))
  return {
    model,
    input: {
      profile,
      blockStore: blockStore(),
      pageRecipes: pageRecipes(),
      library: library(),
      template: template(),
      brand: brand(),
      planId: 'plan-club',
      model
    }
  }
}

for (const blank of BLANKS)
  test(`an address of ${JSON.stringify(blank)} is no address: the plan is composed without it`, async () => {
    const { model, input } = inputs('contact.address', 'contact-address', blank)
    const { plan } = await composePlan(input)
    assert.equal(model.calls.length, 1)
    assert.equal(
      plan.facts.some((f) => f.kind === 'contact.address'),
      false
    )
    assert.ok(plan.facts.some((f) => f.kind === 'business.name'))
    const contact = plan.pages.find((p) => p.blocks.some((b) => b.block === 'contact-strip'))
    assert.ok(contact, 'the contact section stays with the phone and the hours')
  })

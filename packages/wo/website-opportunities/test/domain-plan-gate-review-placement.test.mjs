// Placement and assumptions of the plan gate after the #593 review (G5, G7): list rows count as places for a fact, a
// social link never fills a review listing link, and a model assumption naming a held person is dropped. The invented
// florist on the real JA Boxing store; no model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-review-placement.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { gatePlan } from '../domain/plan-gate.mjs'
import { withWithheld } from '../domain/plan-withheld.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import {
  SOCIAL,
  b,
  composition,
  contactPage,
  contextOf,
  homeOf,
  person
} from './fixtures/write-order/boxing-gate.mjs'

const src = ['site']

test('G5: six social links: the four places of block-171 are counted, and no review listing link takes one', () => {
  const profile = boxingProfile()
  profile.facts['contact.social_url'] = [1, 2, 3, 4, 5, 6].map((n) => ({
    value: `https://social.example/larkspur-${n}`,
    sources: src,
    confidence: 'single-source'
  }))
  const context = contextOf(profile)
  const pages = [
    homeOf(profile, [
      b(
        'tracy-reviews',
        profile.items.quote.map((q) => q.id)
      )
    ]),
    contactPage([...SOCIAL, 'contact-social-url-4'])
  ]
  const gated = gatePlan(composition(pages), context)
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  const reviews = gated.plan.pages.flatMap((p) => p.blocks).filter((x) => x.block === 'tracy-reviews')
  for (const block of reviews)
    assert.equal(
      block.data.some((id) => id.startsWith('contact-social-url')),
      false
    )
  const social = gated.plan.leftOut.filter((e) => e.what === 'Social link')
  assert.equal(social.length, 2)
  for (const e of social) assert.match(e.reason, /^Every place the template has for your social link/)
})

test('G7: a model assumption naming a held person is dropped from the plan', () => {
  const profile = boxingProfile()
  profile.items.person = [person(1, 'Maren Holt')]
  const context = contextOf(withWithheld(profile, { withheld: { people: ['Maren Holt'] } }))
  const said = [
    { field: 'pages[home].name', said: 'Maren Holt leads the team.' },
    { field: 'pages[home].name', said: 'The home page opens with your bouquets.' }
  ]
  const gated = gatePlan(composition([homeOf(profile), contactPage()], said), context)
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  const lines = gated.plan.assumptions.map((a) => a.said)
  assert.equal(lines.includes('Maren Holt leads the team.'), false)
  assert.ok(lines.includes('The home page opens with your bouquets.'))
})

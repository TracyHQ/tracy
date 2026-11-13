// The plan gate's messages lead to a plan the gate accepts (#593 review G1, G2): a block the gate empties is left
// out, and a message that asks for an id to go is followed literally on the second attempt and that plan passes. The invented florist on the real JA Boxing block store; scripted fake models only.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-gate-literal-fix.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { composePlan } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { EMPTIED_BLOCK_REASON } from '../domain/plan-emptied-blocks.mjs'
import { withWithheld } from '../domain/plan-withheld.mjs'
import { scriptedModel } from './fixtures/plan-composer/invented-club.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import {
  INPUT,
  SHARED,
  SOCIAL,
  b,
  composition,
  contactPage,
  contextOf,
  homeOf,
  person
} from './fixtures/write-order/boxing-gate.mjs'

/** The codes whose message asks for an id to go out of a block. */
const REMOVALS = new Set([
  'item_repeated_on_page',
  'withheld_shown',
  'invented_item',
  'wrong_item_kind',
  'fact_without_field'
])
/** The composition corrected literally: each id a removal message names taken out of its block, nothing else. */
function literally(composed, problems) {
  const out = structuredClone(composed)
  const marks = problems
    .filter((p) => REMOVALS.has(p.code ?? p.codeOf))
    .map((p) => /^pages\[(\d+)\]\.blocks\[(\d+)\]\.data\[(\d+)\]$/.exec(p.at))
    .filter(Boolean)
    .map((m) => m.slice(1).map(Number))
  for (const [i, j, k] of marks) out.pages[i].blocks[j].data[k] = null
  for (const page of out.pages)
    for (const block of page.blocks) block.data = block.data.filter((id) => id !== null)
  return out
}

test('G1: an over long business name empties the page title hero, which leaves the plan with the reason', () => {
  const profile = boxingProfile()
  const context = contextOf(profile)
  const name = context.data.byId.get('business-name').entry.value
  assert.ok([...name].length > 20, 'the invented name is longer than the 20 characters block-162 holds')
  const services = profile.items.service.map((s) => s.id)
  const classes = {
    pageType: 'classes',
    name: 'All bouquets',
    blocks: [...SHARED(), b('block-162', ['business-name']), b('class-list', services.slice(0, 2))]
  }
  const gated = gatePlan(composition([homeOf(profile), classes, contactPage()]), context)
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  const page = gated.plan.pages.find((p) => p.id === 'classes')
  assert.deepEqual(
    page.blocks.map((x) => x.block),
    ['header', 'block-176', 'class-list']
  )
  assert.ok(gated.plan.leftOut.some((e) => e.what === 'block-162' && e.reason === EMPTIED_BLOCK_REASON))
  assert.ok(gated.rows.some((r) => r.block === 'classes-b3' && r.code === 'data_over_limit'))
})

test('G1: a main block the gate empties is data_over_limit at the composition position, with the field and limit', () => {
  const profile = boxingProfile()
  profile.facts['contact.email'][0].value = 'bouquets-and-orders@larkspur-florist.example'
  // The email is the contact page's only channel: once it is too long, its main block has nothing left.
  delete profile.facts['contact.phone']
  delete profile.facts['contact.address']
  const context = contextOf(profile)
  const contact = {
    pageType: 'contact',
    name: 'Contact',
    blocks: [...SHARED(), b('contact-details', ['contact-email']), b('block-171', SOCIAL)]
  }
  const gated = gatePlan(composition([homeOf(profile), contact]), context)
  const over = gated.problems.filter((p) => p.code === 'data_over_limit')
  assert.equal(gated.ok, false)
  assert.deepEqual(
    over.map((p) => p.at),
    ['pages[1].blocks[2].data']
  )
  assert.match(
    over[0].message,
    /"contact-email" has 44 characters; the field \S+ of block contact-details, the main block of this page, holds \d+/
  )
})

test('G2: every removal message, followed literally, gives a plan the gate accepts on the second attempt', async () => {
  const profile = boxingProfile()
  profile.items.person = [person(1, 'Maren Holt'), person(2, 'Tobin Ashgrove')]
  const services = profile.items.service.map((s) => s.id)
  const quote = profile.items.quote[0].id
  const sloppy = composition([
    {
      ...homeOf(profile),
      blocks: homeOf(profile, [
        b('block-157', [services[0]]),
        b('block-163', ['person-p1', 'person-p2'])
      ]).blocks.map((x) =>
        x.block === 'block-160' ? b('block-160', [services[0], 'contact-phone', quote]) : x
      )
    },
    { pageType: 'trainer', name: 'Maren', blocks: [...SHARED(), b('block-180', ['person-p1'])] },
    {
      pageType: 'classes',
      name: 'All',
      blocks: [...SHARED(), b('block-162', ['business-tagline']), b('class-list', services.slice(0, 2))]
    },
    contactPage()
  ])
  const model = scriptedModel(JSON.stringify(sloppy), (request) =>
    JSON.stringify(
      literally(
        sloppy,
        JSON.parse(request.user).problems.map((p) => ({ ...p, codeOf: codeOf(p) }))
      )
    )
  )
  const codes = new Set()
  const codeOf = (p) => {
    const code = [...REMOVALS].find((c) => MESSAGE_OF[c].test(p.message))
    if (code) codes.add(code)
    return code
  }
  const result = await composePlan({
    ...INPUT,
    profile: withWithheld(profile, { withheld: { people: ['Maren Holt'] } }),
    model
  })
  assert.equal(result.attempts.length, 2)
  assert.deepEqual([...codes].sort(), [...REMOVALS].sort())
  for (const p of result.attempts[0].problems)
    if (REMOVALS.has(p.code)) assert.match(p.message, /leave the block out when it then shows nothing/)
  const ids = result.plan.pages.map((p) => p.id)
  assert.equal(
    ids.includes('trainer'),
    false,
    'the trainer page lost its only person: it is dropped, not failed'
  )
  assert.ok(result.plan.pages.every((p) => p.blocks.every((x) => x.data.length > 0)))
})

/** How the second attempt tells which rule a message is: by its words, as the model reads them. */
const MESSAGE_OF = {
  item_repeated_on_page: /an item appears in one block of a page/,
  withheld_shown: /kept off the site at the owner's request/,
  invented_item: /is not a fact or item of the needs profile/,
  wrong_item_kind: /block cannot show/,
  fact_without_field: /has no field for/
}

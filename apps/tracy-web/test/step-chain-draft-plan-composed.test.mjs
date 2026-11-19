// A plan the composer's gate accepted is accepted, as it is, by the build's input check (#575 stand: the first real
// approval stopped two seconds in with `draft_plan_profile_mismatch` on `contact-whatsapp`). The composer adds parts the
// needs profile does not hold (brief channels, item field facts); the build must read the plan against the same plan
// data the gate held it to (`planDataOfPlan`). Every composed plan of the domain's tests, one after card operations and
// one after a change request. Invented club, scripted fake model.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-plan-composed.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gateOperatedPlan } from 'website-opportunities/domain/plan-edit-gate.mjs'
import { revisePlan } from 'website-opportunities/domain/plan-request.mjs'
import {
  COMPOSED_PLANS,
  composedWithChannels
} from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/composed-plans.mjs'
import {
  answer,
  firstPlan,
  revision
} from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/plan-request.mjs'
import { planWithoutWithheld, unknownPlanIdsOf } from '../src/step-chain-draft-plan.js'

/** The plan as the build source reads it: no id unknown, and nothing taken off when the owner holds nothing. */
function assertBuilds({ plan, profile }, name) {
  assert.deepEqual(unknownPlanIdsOf(plan, profile), [], name)
  assert.deepEqual(planWithoutWithheld(plan, profile), plan, name)
}

test('every plan the composer accepts passes the build input check unchanged', async () => {
  for (const [name, make] of Object.entries(COMPOSED_PLANS)) assertBuilds(await make(), name)
})

test('a plan after card operations passes the build input check unchanged', async () => {
  const start = await composedWithChannels()
  let s = { plan: start.plan, profile: start.profile, review: { base: start, removals: [] } }
  const reviews = s.plan.pages[0].blocks.find((b) => b.source === 'library' || b.type === 'reviews')
  const operations = [
    ...(reviews ? [{ op: 'remove-block', page: s.plan.pages[0].id, block: reviews.id }] : []),
    { op: 'remove-key-message', message: s.plan.keyMessages[0].id }
  ]
  for (const [i, operation] of operations.entries()) {
    const out = gateOperatedPlan({
      plan: s.plan,
      profile: s.profile,
      edit: {
        schema: 'tracy-build-plan-edit/v1',
        id: `op-${i}`,
        plan: { id: s.plan.id, revision: s.plan.revision },
        operation
      },
      review: s.review,
      removal: `removal-${i}`,
      ...start.kit
    })
    assert.equal(out.ok, true, JSON.stringify(out.problems))
    s = {
      plan: out.plan,
      profile: out.profile,
      review: { ...s.review, removals: [...s.review.removals, out.removal] }
    }
  }
  assert.ok(s.plan.pages.some((p) => p.blocks.some((b) => b.data.includes('contact-whatsapp'))))
  assertBuilds(s, 'after operations')
})

test('a plan after a change request passes the build input check unchanged', async () => {
  const first = await firstPlan()
  const reviews = first.plan.pages[0].blocks.find((b) => b.type === 'reviews' || b.block === 'reviews-strip')
  const { input } = revision(
    first,
    'Remove the reviews.',
    answer([{ op: 'remove_block', page: 'home', block: reviews.id, request: 'Remove the reviews' }])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false, JSON.stringify(result.problems ?? result.notDone))
  assertBuilds({ plan: result.plan, profile: result.profile }, 'after a change request')
})

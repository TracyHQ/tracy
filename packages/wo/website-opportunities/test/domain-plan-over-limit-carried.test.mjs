// An item the gate took off because its name is too long for the section stays left out with that reason after a plan
// edit that changes something else (#617 review, 2026-11-14): the edit used to drop the entry, and the next change
// request then told the customer they had asked to take the item off. The invented pottery studio; scripted models.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-over-limit-carried.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { needsProfileOf } from '../domain/needs-profile.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { DATA_OVER_LIMIT_REASON } from '../domain/plan-data-limits.mjs'
import { planDataOf } from '../domain/plan-data.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { REQUESTED_OFF_REASON, customerTakenOffOf } from '../domain/plan-request-taken-off.mjs'
import * as Club from './fixtures/plan-composer/invented-club.mjs'
import {
  composeInputs,
  pottery,
  potteryComposition,
  potteryStore
} from './fixtures/child-lists/invented-pottery.mjs'

const NAME = 'Evening wheel basics for absolute beginners'

async function composedWithLongName() {
  const { research, reading } = pottery()
  research.sources[0].text += ` ${NAME}: Mon.`
  reading.items.push({ source: 'site', kind: 'service', fields: { 'offering.name': NAME }, evidence: NAME })
  const profile = needsProfileOf(research, reading)
  const long = profile.items.service.find((i) => i.fields['offering.name'].value === NAME).id
  const composition = potteryComposition()
  composition.pages[0].blocks[1].data.push(long)
  const inputs = { ...composeInputs(profile), model: Club.scriptedModel(JSON.stringify(composition)) }
  const composed = await composePlan(inputs)
  return { ...composed, long }
}

test('a plan edit of another fact keeps the over limit entry of an item no section shows', async () => {
  const { plan, profile, long } = await composedWithLongName()
  const entry = (p) => p.leftOut.find((e) => e.what === NAME)
  assert.equal(entry(plan)?.reason, DATA_OVER_LIMIT_REASON)
  const gated = gateEditedPlan({
    plan,
    edit: {
      schema: 'tracy-build-plan-edit/v1',
      id: 'edit-phone',
      plan: { id: plan.id, revision: plan.revision },
      changes: [{ field: 'facts[contact-phone].value', value: '0161 555 0199' }]
    },
    profile,
    blockStore: potteryStore(),
    pageRecipes: Club.pageRecipes(),
    library: Club.library()
  })
  assert.equal(gated.ok, true, JSON.stringify(gated.problems))
  assert.equal(entry(gated.plan)?.reason, DATA_OVER_LIMIT_REASON)
  assert.equal(gated.plan.leftOut.filter((e) => e.what === NAME).length, 1)
  // The next change request reads no gap there: the customer never took the class off.
  const data = planDataOf(gated.profile)
  assert.equal(customerTakenOffOf(gated.plan, data).has(long), false)
  assert.ok(!gated.plan.leftOut.some((e) => e.what === NAME && e.reason === REQUESTED_OFF_REASON))
})

// A plan edit for a field the plan does not have says so (#617 review, 2026-11-14): `{field: "main colour"}` read
// "That part of your plan cannot be changed that way.", and an accent that is no colour code read as a plan that
// could not be built. The accent takes any #rrggbb colour the customer chooses: no contrast rule refuses it here.
// The invented club, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-edit-unknown-field.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { firstPlan, kit } from './fixtures/plan-composer/plan-request.mjs'

async function edited(field, value) {
  const { plan, profile } = await firstPlan()
  const { blockStore, pageRecipes, library } = kit()
  const edit = {
    schema: 'tracy-build-plan-edit/v1',
    id: 'edit-1',
    plan: { id: plan.id, revision: plan.revision },
    changes: [{ field, value }]
  }
  return gateEditedPlan({ plan, edit, profile, blockStore, pageRecipes, library })
}

test('a field the plan does not have is named, and the customer is told the plan has no such part', async () => {
  const result = await edited('main colour', 'blue')
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => p.message),
    ['This change cannot be saved: your plan has no part called "main colour".']
  )
})

test('an accent that is no colour code is refused in words about the colour', async () => {
  const result = await edited('look.accent', 'blue')
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.problems.map((p) => p.message),
    ['This change cannot be saved: the accent colour must be a colour code such as #1f6feb.']
  )
})

test('any colour code is taken as the accent, a light one included', async () => {
  for (const accent of ['#1f6feb', '#fafafa']) {
    const result = await edited('look.accent', accent)
    assert.equal(result.ok, true, JSON.stringify(result.problems))
    assert.equal(result.plan.look.accent, accent)
  }
})

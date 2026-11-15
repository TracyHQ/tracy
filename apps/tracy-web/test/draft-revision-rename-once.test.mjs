// An item renamed on the plan card is renamed once (#612): the edit gate's `profileAfterEdit` now writes the new name
// into the profile item, and the build chat's own patch (`build-draft/edit-item-names.js profileWithItemNames`), run
// after it as `editPlan` does, changes nothing more: no double rename, the same profile. Invented club only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-revision-rename-once.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import { gateEditedPlan } from 'website-opportunities/domain/plan-edit-gate.mjs'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { profileWithItemNames } from '../src/build-draft/edit-item-names.js'

const inputs = () => ({
  blockStore: club.blockStore(),
  pageRecipes: club.pageRecipes(),
  library: club.library(),
  template: club.template(),
  brand: club.brand()
})

for (const [id, value] of [
  ['service-court-hire', 'Lantern court rental'],
  ['person-ilse-varrow', 'Ilse Marrow']
])
  test(`renaming ${id} on the card: the gate renames it, the build chat patch after it is a no-op`, async () => {
    const { plan, profile } = await composePlan({
      ...inputs(),
      profile: club.conflictedClubProfile(),
      planId: 'plan-club',
      model: club.scriptedModel(JSON.stringify(club.goodComposition()))
    })
    const edit = {
      schema: 'tracy-build-plan-edit/v1',
      id: 'edit-rename',
      plan: { id: plan.id, revision: plan.revision },
      changes: [{ field: `items[${id}].label`, value }]
    }
    const gated = gateEditedPlan({ plan, edit, profile, ...inputs() })
    assert.equal(gated.ok, true, JSON.stringify(gated.problems))
    const item = Object.values(gated.profile.items)
      .flat()
      .find((i) => i.id === id)
    assert.ok(
      Object.values(item.fields).some((f) => f.value === value),
      'the gate renamed it'
    )
    assert.deepEqual(profileWithItemNames(gated.profile, edit), gated.profile)
  })

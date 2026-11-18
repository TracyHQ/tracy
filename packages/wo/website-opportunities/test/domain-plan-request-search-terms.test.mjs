// The search terms the owner added and took off on the plan card (#575) stay through a change request: the revision
// makes the terms again from the data, and keeps the owner's marks (`seo.ownerAdded`, `seo.ownerRemoved`) as an edit
// does (`plan-intent-seo.mjs`). Invented club, scripted fake model: no real model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-request-search-terms.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { gateEditedPlan } from '../domain/plan-edit-gate.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { goodComposition, withIntentNotes } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, kit, revision } from './fixtures/plan-composer/plan-request.mjs'

const editOf = (plan, changes) => ({
  schema: 'tracy-build-plan-edit/v1',
  id: 'edit-terms',
  plan: { id: plan.id, revision: plan.revision },
  changes: changes.map(([field, value]) => ({ field, value }))
})

test('a change request keeps the search terms the owner added and took off', async () => {
  const first = await firstPlan(withIntentNotes(goodComposition()))
  const home = first.plan.pages[0]
  assert.ok(home.seo?.searchTerms?.length > 1, 'the home page has search terms')
  const typed = [...home.seo.searchTerms.slice(1), 'tennis lessons for kids']
  const k = kit()
  const edited = gateEditedPlan({
    plan: first.plan,
    profile: first.profile,
    edit: editOf(first.plan, [['pages[home].seo.searchTerms', typed]]),
    blockStore: k.blockStore,
    pageRecipes: k.pageRecipes,
    library: k.library
  })
  assert.equal(edited.ok, true, JSON.stringify(edited.problems))
  const removed = home.seo.searchTerms[0]
  // An unrelated change: the reviews section of the home page comes off.
  const reviews = edited.plan.pages[0].blocks.find((b) => b.block === 'reviews-strip' || b.type === 'reviews')
  assert.ok(reviews, 'the home page has a reviews section')
  const { input } = revision(
    { plan: edited.plan, profile: edited.profile },
    'Remove the reviews.',
    answer([{ op: 'remove_block', page: 'home', block: reviews.id, request: 'Remove the reviews' }])
  )
  const result = await revisePlan(input)
  assert.equal(result.unchanged, false, JSON.stringify(result.problems ?? result.notDone))
  const seo = result.plan.pages.find((p) => p.id === 'home').seo
  assert.ok(seo.searchTerms.includes('tennis lessons for kids'), JSON.stringify(seo))
  assert.equal(seo.searchTerms.includes(removed), false, JSON.stringify(seo))
  assert.deepEqual(seo.ownerAdded, ['tennis lessons for kids'])
  assert.deepEqual(seo.ownerRemoved, [removed])
  assert.ok(checkBuildDocument(result.plan).ok)
})

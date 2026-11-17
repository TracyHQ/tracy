// A left out reason that points at a page the change request removed is not carried as it was (#617 review,
// 2026-11-14): "Your details are on the contact page" stays on the plan after the contact page is gone. The invented
// club, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-request-stale-reasons.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { revisePlan } from '../domain/plan-request.mjs'
import { STALE_PAGE_REASON } from '../domain/plan-request-settled.mjs'
import { goodComposition } from './fixtures/plan-composer/invented-club.mjs'
import { answer, firstPlan, revision } from './fixtures/plan-composer/plan-request.mjs'

const REMOVE_CONTACT = answer([
  {
    op: 'remove_page',
    page: 'contact',
    request: 'Remove the contact page',
    said: 'The Contact page is removed.'
  }
])

// Sections left out: the pages the plan does not keep are listed by code, never carried from the model (#575 walk).
async function planWithSectionsLeftOut() {
  const composition = goodComposition()
  composition.leftOut = [
    ...(composition.leftOut ?? []),
    { kind: 'block', what: 'Location map', reason: 'Your address is shown on the Contact page.' },
    { kind: 'block', what: 'Blog posts', reason: 'No posts were supplied.' }
  ]
  return firstPlan(composition)
}

test('a left out reason naming a page the request removed is replaced; one naming no removed page stays', async () => {
  const first = await planWithSectionsLeftOut()
  assert.ok(first.plan.leftOut.some((e) => e.reason === 'Your address is shown on the Contact page.'))
  const { input } = revision(first, 'Remove the contact page.', REMOVE_CONTACT)
  const result = await revisePlan(input)
  const reasonOf = (what) => result.plan.leftOut.find((e) => e.what === what)?.reason
  assert.equal(reasonOf('Location map'), STALE_PAGE_REASON)
  assert.equal(reasonOf('Blog posts'), 'No posts were supplied.')
  assert.ok(!result.plan.leftOut.some((e) => /contact page/i.test(e.reason) && e.what !== 'Contact'))
})

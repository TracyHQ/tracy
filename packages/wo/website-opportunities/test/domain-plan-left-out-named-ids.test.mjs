// A left out entry the model names by a fact's id (#575 walk: `{what: "contact-cta-label"}` failed the plan three times
// on the build word "cta"): the gate reads it as the entry of that id, so it never costs the owner a retry. A build word
// it cannot fix goes back to the model with the entry and the word named. The invented florist on the JA Boxing block
// store. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-left-out-named-ids.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { gatePlan } from '../domain/plan-gate.mjs'
import { boxingProfile } from './fixtures/write-order/boxing-florist.mjs'
import { composition, contactPage, contextOf, homeOf } from './fixtures/write-order/boxing-gate.mjs'

const CTA_LABEL = 'contact-cta-label'
/** The florist's plan with the given left out entries; `withoutLabel`: no block shows the main button label. */
function gated(leftOut, { withoutLabel = false } = {}) {
  const profile = boxingProfile()
  const pages = [homeOf(profile), contactPage()]
  if (withoutLabel)
    for (const block of pages.flatMap((p) => p.blocks))
      block.data = block.data.filter((id) => id !== CTA_LABEL)
  const c = composition(pages)
  c.leftOut = leftOut
  return gatePlan(c, contextOf(profile))
}
const REASON = 'Your sources do not give this button a destination.'

test('an entry naming a shown fact by its id is dropped, not a problem', () => {
  const result = gated([{ what: CTA_LABEL, kind: 'feature', reason: REASON }])
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(
    result.plan.leftOut.some((e) => /cta/i.test(e.what)),
    false
  )
  assert.ok(result.fixes.some((f) => f.code === 'left_out_internal_name' && f.now === CTA_LABEL))
})

test('an entry naming a fact no block shows by its id reports that fact, named by its label', () => {
  const result = gated([{ what: CTA_LABEL, kind: 'feature', reason: REASON }], { withoutLabel: true })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const entry = result.plan.leftOut.find((e) => e.item === CTA_LABEL)
  assert.ok(entry, JSON.stringify(result.plan.leftOut))
  assert.doesNotMatch(entry.what, /cta|-/i)
  assert.equal(result.plan.leftOut.filter((e) => e.item === CTA_LABEL).length, 1)
})

test('a build word code cannot fix goes back to the model with the entry and the word', () => {
  const result = gated([{ what: 'CTA strip', kind: 'block', reason: 'Nothing to show.' }])
  assert.equal(result.ok, false)
  const [problem] = result.problems
  assert.equal(problem.code, 'left_out_internal_wording')
  assert.match(problem.message, /"CTA strip"/)
  assert.match(problem.message, /build word "CTA"/)
  assert.match(problem.message, /"item"/)
})

test('code made entries never trip the wording rule, whatever words they hold', () => {
  const profile = boxingProfile()
  const context = {
    ...contextOf(profile),
    leftOut: [{ what: 'CTA url field', kind: 'feature', reason: 'A field id.', code: 'stated' }]
  }
  const result = gatePlan(composition([homeOf(profile), contactPage()]), context)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
})

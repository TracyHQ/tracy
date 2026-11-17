// Opening hours on the plan do not depend on the model's choice (#575 walk, fourth round): on one walk the model put the
// hours into the contact block of a template with no hours field and the card said they were on the site; on the next
// walk of the same business it left them out and the card lost its Opening hours row. Now the hours are a protected
// fact (the model never leaves them out), a block with no hours field never holds them, and whether a page shows them
// is read from the block store: the JA Boxing kit declares no hours field, so the plan says, in code's words, that the
// design has no place for them. The invented florist on the JA Boxing block store. No model is called.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-hours-kept.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { FACT_LEFT_OUT } from '../domain/plan-placement-facts.mjs'
import { hasFieldOfKind } from '../domain/plan-field-only-facts.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { boxingProfile, boxingStore } from './fixtures/write-order/boxing-florist.mjs'
import { composition, contactPage, contextOf, homeOf } from './fixtures/write-order/boxing-gate.mjs'

const HOURS = 'contact-hours'
const shown = (plan) => new Set(plan.pages.flatMap((p) => p.blocks.flatMap((x) => x.data)))
const hoursEntries = (plan) => plan.leftOut.filter((e) => e.item === HOURS)

/** The florist's plan: `contact` is the contact page; `leftOut` the model's entries. */
function gated({ contact = contactPage(), leftOut = [], store } = {}) {
  const profile = boxingProfile()
  const c = composition([homeOf(profile), contact])
  c.leftOut = leftOut
  const context = contextOf(profile)
  return gatePlan(c, store ? { ...context, blocks: store } : context)
}
/** The contact page with the hours in its contact block, as the walk's second run had it. */
const contactWithHours = () => {
  const page = contactPage()
  page.blocks.find((x) => x.block === 'contact-details').data.unshift(HOURS)
  return page
}

test('the JA Boxing kit declares no field of kind contact.hours in any block', () => {
  assert.equal(
    boxingStore.blocks.some((d) => hasFieldOfKind(d, 'contact.hours')),
    false
  )
})

test('hours in a block with no hours field leave it: the plan says the design has no place for them', () => {
  const result = gated({ contact: contactWithHours() })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(shown(result.plan).has(HOURS), false)
  assert.ok(result.fixes.some((f) => f.code === 'fact_without_place' && f.was === HOURS))
  assert.deepEqual(hoursEntries(result.plan), [
    {
      item: HOURS,
      what: 'Opening hours',
      kind: 'feature',
      reason: FACT_LEFT_OUT.no_place_in_design.reason,
      code: 'no_place_in_design'
    }
  ])
  // The plan still lists the hours fact: the card keeps its row and says the site does not show it.
  assert.ok(result.plan.facts.some((f) => f.id === HOURS))
})

test('the model leaving the hours out, by id with its own reason, gives the same plan as placing them', () => {
  const placed = gated({ contact: contactWithHours() })
  const left = gated({ leftOut: [{ item: HOURS, kind: 'item', reason: 'Zorvel mira tolvan.' }] })
  const silent = gated()
  for (const result of [left, silent]) {
    assert.equal(result.ok, true, JSON.stringify(result.problems))
    assert.deepEqual(result.plan.leftOut, placed.plan.leftOut)
    assert.deepEqual(result.plan.pages, placed.plan.pages)
  }
  assert.ok(left.fixes.some((f) => f.code === 'left_out_protected_fact' && f.now === HOURS))
})

test('a block store with an hours field shows the hours, and no left out line says otherwise', () => {
  const store = new Map(boxingStore.blocks.map((d) => [d.id, structuredClone(d)]))
  store.get('contact-details').fields.push({ name: 'hours', kind: 'contact.hours', type: 'text', limit: 120 })
  const context = contextOf(boxingProfile())
  // The model put the hours nowhere: placement finds the block with a field for them.
  const result = gated({ store: new Map([...context.blocks, ...store]) })
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(shown(result.plan).has(HOURS), true)
  assert.deepEqual(hoursEntries(result.plan), [])
})

// The plan card always lists the facts that say who the business is and how to reach it, and any fact the owner
// answered, among its business facts (#575 walk, fourth round: the opening hours the owner kept were missing from the
// card on one walk and shown on the next). A left out entry of such a fact says the site does not show it; the row
// stays, with the owner's answer as its source when the owner confirmed it. Every business here is invented.
//
//   node --test --test-concurrency=1 packages/core/tracy-core/test/build-chat-plan-kept-facts.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const plan = () => stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
const NO_PLACE = 'Your design has no place that shows this.'

/** The plan with `ids` on no page and a left out entry of each, as the plan step writes it. */
function leftOutPlan(ids, edit = () => {}) {
  const p = plan()
  edit(p)
  for (const page of p.pages)
    for (const b of page.blocks) b.data = (b.data ?? []).filter((id) => !ids.includes(id))
  p.leftOut = ids.map((id) => {
    const fact = p.facts.find((f) => f.id === id)
    return {
      what: fact.label ?? fact.kind,
      kind: 'feature',
      item: id,
      reason: NO_PLACE,
      code: 'no_place_in_design'
    }
  })
  return p
}

test('opening hours the design has no place for keep their row, with the owner answer as source, and a left out line', () => {
  const p = leftOutPlan(['hours'], (plan) => {
    const hours = plan.facts.find((f) => f.id === 'hours')
    hours.sources = [
      { kind: 'answer', name: 'Your answer' },
      { kind: 'google', name: 'Google Maps' }
    ]
  })
  const card = planCardOf(p)
  const row = card.facts.find((f) => f.id === 'hours')
  assert.ok(row, 'the opening hours row stays')
  assert.equal(row.kind, 'contact.hours')
  assert.equal(row.sourceKind, 'answer')
  assert.deepEqual(
    card.leftOut.map((l) => [l.factKind, l.code]),
    [['contact.hours', 'no_place_in_design']]
  )
})

test('the name, phone, address and main button keep their rows; another fact left out is said under Left out only', () => {
  const ids = ['name', 'phone', 'address', 'button', 'email']
  const card = planCardOf(leftOutPlan(ids))
  const rows = card.facts.map((f) => f.id)
  for (const id of ['name', 'phone', 'address', 'button']) assert.ok(rows.includes(id), id)
  assert.equal(rows.includes('email'), false)
  assert.equal(card.leftOut.length, ids.length)
})

test('a fact the owner answered keeps its row whatever its kind', () => {
  const card = planCardOf(
    leftOutPlan(['tagline'], (plan) => {
      plan.facts.find((f) => f.id === 'tagline').sources = [{ kind: 'answer', name: 'Your answer' }]
    })
  )
  assert.ok(card.facts.some((f) => f.id === 'tagline'))
})

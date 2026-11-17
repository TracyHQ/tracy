// The legal and not-found pages of a plan (#575, Contract B `legalPages` and `notFound`) on the plan card: the draft
// write builds neither yet, so the card shows neither. A created Privacy page is no page of the card, no main menu
// entry and no left out line; the not-found words are never shown (the plan card mock has no such line).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../../../wo/website-opportunities/domain/build-contract.mjs'
import { planCardOf, planReviewRequestOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

const SAYS = 'Who runs the studio and how to reach it.'
const NOT_FOUND = 'This page is not here; lead back to the home page.'

function legalPlan() {
  const plan = stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
  const name = plan.facts.find((f) => f.kind === 'business.name')
  plan.legalPages = [{ kind: 'privacy', use: 'create', id: 'legal:privacy', says: SAYS, factIds: [name.id] }]
  plan.notFound = { says: NOT_FOUND, leadsTo: [plan.pages[0].id] }
  return plan
}

test('a plan with a created Privacy page and a not-found page passes the contract', () => {
  assert.deepEqual(checkBuildDocument(legalPlan()), { ok: true, problems: [] })
})

test('the card shows neither page: the same pages, counts and left out lines as without them', () => {
  const plan = legalPlan()
  const card = planCardOf(plan)
  const without = structuredClone(plan)
  delete without.legalPages
  delete without.notFound
  assert.deepEqual(card, planCardOf(without))
  assert.equal(
    card.pages.some((p) => p.id === 'legal:privacy'),
    false
  )
  const words = JSON.stringify(card)
  for (const hidden of ['legal:privacy', SAYS, NOT_FOUND]) assert.equal(words.includes(hidden), false, hidden)
  assert.deepEqual(planReviewRequestOf(plan), planReviewRequestOf(without))
})

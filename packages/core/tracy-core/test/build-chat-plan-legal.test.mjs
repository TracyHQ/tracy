// The legal and not-found pages of a plan (#575, Contract B `legalPages` and `notFound`) on the plan card. A created
// Privacy page is no page of the card, no main menu entry and no left out line: the card says both standard pages in
// its own words (`standard`: the facts the privacy page is written from, the pages the not-found page leads to), and
// never shows the plan's sentences for the writer (`says`).
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

test('the card lists the standard pages apart: the same pages, counts and left out lines as without them', () => {
  const plan = legalPlan()
  const card = planCardOf(plan)
  const without = structuredClone(plan)
  delete without.legalPages
  delete without.notFound
  const bare = planCardOf(without)
  for (const key of ['pages', 'counts', 'leftOut', 'facts', 'services'])
    assert.deepEqual(card[key], bare[key], key)
  assert.equal(
    card.pages.some((p) => p.id === 'legal:privacy'),
    false
  )
  const name = plan.facts.find((f) => f.kind === 'business.name')
  assert.deepEqual(
    card.standard.privacy?.facts.map((f) => f.id),
    [name.id]
  )
  assert.equal(card.standard.privacy?.page, null)
  assert.deepEqual(card.standard.notFound, { leadsTo: [plan.pages[0].name] })
  assert.equal(card.site.privacyLink, true)
  assert.deepEqual(bare.standard, { privacy: null, notFound: null })
  const words = JSON.stringify(card)
  for (const hidden of ['legal:privacy', SAYS, NOT_FOUND]) assert.equal(words.includes(hidden), false, hidden)
  assert.deepEqual(planReviewRequestOf(plan), planReviewRequestOf(without))
})

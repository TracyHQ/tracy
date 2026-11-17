// A block kept from general knowledge of the owner's trade (#575, Contract B `basis: "trade"`) on the plan card: it is
// shown as kept and marked, so the card can say it is written from the trade and can be removed with Change the plan.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuildDocument } from '../../../wo/website-opportunities/domain/build-contract.mjs'
import { planCardOf } from '../src/build-chat/index.mjs'
import { STAGES, stageDocuments } from './fixtures/build-chat/stages.mjs'

function tradePlan() {
  const plan = stageDocuments(STAGES.find((s) => s.name === 'plan')).scenario.plan
  const home = plan.pages[0]
  const activity = plan.items[0].id
  home.blocks.splice(1, 0, {
    id: 'home-trade',
    type: 'text',
    block: 'what-to-bring',
    source: 'template',
    label: 'What to bring',
    data: [],
    reason: 'New players know what to bring to a first lesson.',
    basis: 'trade',
    factIds: [activity]
  })
  return plan
}

test('a trade block passes the contract and is kept on the card, marked as written from the trade', () => {
  const plan = tradePlan()
  assert.deepEqual(checkBuildDocument(plan), { ok: true, problems: [] })
  const blocks = planCardOf(plan).pages[0].blocks
  const trade = blocks.find((b) => b.id === 'home-trade')
  assert.equal(trade.trade, true)
  assert.equal(trade.reason, 'New players know what to bring to a first lesson.')
  assert.deepEqual(trade.holds, { facts: [], factKinds: [], counts: [] })
  assert.ok(blocks.filter((b) => b.id !== 'home-trade').every((b) => b.trade === undefined))
})

test('a trade block cites a fact or item of the plan, at least one', () => {
  const plan = tradePlan()
  plan.pages[0].blocks[1].factIds = []
  assert.equal(checkBuildDocument(plan).ok, false)
  plan.pages[0].blocks[1].factIds = ['no-such-id']
  assert.equal(checkBuildDocument(plan).ok, false)
  delete plan.pages[0].blocks[1].basis
  assert.equal(checkBuildDocument(plan).ok, false)
})

// A block kept from trade knowledge (#575, `plan-gate-trade.mjs`) through a change request: it stays a trade block
// when the request does not touch it, and the owner can remove it. Invented club, invented template, fake model.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composePlan } from '../domain/plan-composer.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import {
  brand,
  clubProfile,
  library,
  scriptedModel,
  template
} from './fixtures/plan-composer/invented-club.mjs'
import { answer, requestFor } from './fixtures/plan-composer/plan-request.mjs'
import {
  TRADE_BLOCKS,
  tradeComposition,
  tradeRecipes,
  tradeStore
} from './fixtures/plan-composer/trade-blocks.mjs'

const kit = () => ({
  blockStore: tradeStore(),
  pageRecipes: tradeRecipes(),
  library: library(),
  template: template(),
  brand: brand()
})
const tradeOf = (plan) => plan.pages.flatMap((p) => p.blocks).filter((b) => b.basis === 'trade')

async function first() {
  const composed = await composePlan({
    ...kit(),
    profile: clubProfile(),
    planId: 'plan-club',
    model: scriptedModel(JSON.stringify(tradeComposition()))
  })
  return { plan: composed.plan, profile: composed.profile }
}
const revise = ({ plan, profile }, text, reply) =>
  revisePlan({ ...kit(), plan, profile, request: requestFor(plan, text), model: scriptedModel(reply) })

test('a request that does not touch a trade block keeps it with its basis and the facts it cites', async () => {
  const start = await first()
  const [kept] = tradeOf(start.plan)
  const change = {
    op: 'rename_page',
    page: 'team',
    name: 'Our coaches',
    request: 'coaches page Our coaches',
    said: 'Renamed.'
  }
  const result = await revise(start, 'Call the coaches page Our coaches.', answer([change]))
  assert.ok(result.plan, JSON.stringify(result))
  assert.deepEqual(tradeOf(result.plan), [kept])
  assert.deepEqual(checkBuildDocument(result.plan), { ok: true, problems: [] })
})

test('the owner removes a trade block with a change request', async () => {
  const start = await first()
  const [kept] = tradeOf(start.plan)
  assert.equal(kept.block, TRADE_BLOCKS.firstVisit)
  const change = {
    op: 'remove_block',
    page: 'home',
    block: kept.id,
    request: 'first lesson section off',
    said: 'Removed.'
  }
  const result = await revise(start, 'Take the first lesson section off.', answer([change]))
  assert.ok(result.plan, JSON.stringify(result))
  assert.deepEqual(tradeOf(result.plan), [])
})

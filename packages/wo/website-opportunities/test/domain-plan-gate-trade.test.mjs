// Trade knowledge in the plan composer's rules gate (#575): the step chain keeps a block that shows how the trade
// generally works when a fact shows the business does that activity (planner prompt "Trade knowledge", R10f, R21).
// The build chat inherits that: a kept block may carry `basis: "trade"` with the activity's fact. Invented data only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { checkBuildDocument } from '../domain/build-contract.mjs'
import { composerContextOf } from '../domain/plan-composer.mjs'
import { gatePlan } from '../domain/plan-gate.mjs'
import { brand, clubProfile, library, template } from './fixtures/plan-composer/invented-club.mjs'
import {
  TRADE_BLOCKS,
  tradeBlock,
  tradeComposition,
  tradeRecipes,
  tradeStore
} from './fixtures/plan-composer/trade-blocks.mjs'

const ACTIVITY = 'service-adult-group-lessons'
const context = () =>
  composerContextOf({
    profile: clubProfile(),
    blockStore: tradeStore(),
    pageRecipes: tradeRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
const gate = (composition) => gatePlan(composition, context())
const codes = (result) => result.problems.map((p) => p.code)
const tradeOf = (plan) => plan.pages.flatMap((p) => p.blocks).filter((b) => b.basis === 'trade')

test('a block of written copy kept on trade basis stays on the plan with the fact it cites', () => {
  const result = gate(tradeComposition())
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  const [kept] = tradeOf(result.plan)
  assert.equal(kept.block, TRADE_BLOCKS.firstVisit)
  assert.deepEqual(kept.data, [])
  assert.deepEqual(kept.factIds, [ACTIVITY])
  assert.deepEqual(checkBuildDocument(result.plan), { ok: true, problems: [] })
})

test('the gate places no data of the business in a trade block', () => {
  const result = gate(tradeComposition())
  assert.deepEqual(tradeOf(result.plan)[0].data, [])
  assert.ok(!result.placed.some((p) => p.block === TRADE_BLOCKS.firstVisit))
})

test('an item no block shows is never placed in a trade block of its type', () => {
  const store = tradeStore()
  store.blocks.find((b) => b.id === 'services-grid').items.max = 3
  const c = tradeComposition()
  c.pages[0].blocks.find((b) => b.block === 'services-grid').data.pop()
  const result = gatePlan(
    c,
    composerContextOf({
      profile: clubProfile(),
      blockStore: store,
      pageRecipes: tradeRecipes(),
      library: library(),
      template: template(),
      brand: brand(),
      planId: 'plan-club'
    })
  )
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.deepEqual(tradeOf(result.plan)[0].data, [])
})

test('a single block of written copy is kept on trade basis too', () => {
  const block = tradeBlock(TRADE_BLOCKS.whatToBring, [ACTIVITY], { label: 'What to bring' })
  const result = gate(tradeComposition(block))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
  assert.equal(tradeOf(result.plan)[0].block, TRADE_BLOCKS.whatToBring)
})

test('trade basis cites a fact or item of the business', () => {
  const none = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.firstVisit, [])))
  assert.deepEqual(codes(none), ['trade_fact_missing'])
  const made = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.firstVisit, ['service-padel-nights'])))
  assert.deepEqual(codes(made), ['trade_fact_missing'])
  assert.match(made.problems[0].at, /factIds\[0\]$/)
})

test('facts cited without trade basis, and any other basis, are reply shape problems', () => {
  const c = tradeComposition()
  const block = c.pages[0].blocks.find((b) => b.basis)
  delete block.basis
  assert.deepEqual(codes(gate(c)), ['reply_shape'])
  const other = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.firstVisit, [ACTIVITY], { basis: 'brief' })))
  assert.ok(other.problems.some((p) => p.at.endsWith('.basis')))
  assert.ok(codes(other).every((c) => c === 'reply_shape'))
})

test('a block with a field for a fact of the business is never kept on trade basis without that fact', () => {
  const result = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.story, [ACTIVITY], { label: 'Our story' })))
  assert.deepEqual(codes(result), ['trade_fact_field'])
  assert.match(result.problems[0].message, /quote\.text/)
})

test('a block the kit gives no name is never kept on trade basis, nor sent back when left out', () => {
  const store = tradeStore()
  delete store.blocks.find((b) => b.id === TRADE_BLOCKS.firstVisit).name
  const withStore = (c) =>
    gatePlan(
      c,
      composerContextOf({
        profile: clubProfile(),
        blockStore: store,
        pageRecipes: tradeRecipes(),
        library: library(),
        template: template(),
        brand: brand(),
        planId: 'plan-club'
      })
    )
  assert.deepEqual(codes(withStore(tradeComposition())), ['trade_block_unnamed'])
  const c = tradeComposition({ ...tradeBlock(TRADE_BLOCKS.whatToBring, [ACTIVITY]), label: 'What to bring' })
  c.leftOut.push({
    kind: 'block',
    block: TRADE_BLOCKS.firstVisit,
    what: 'Lesson',
    reason: 'Nothing to show.'
  })
  assert.equal(withStore(c).ok, true)
})

test('a block of a type that shows data of the business is never kept on trade basis, nor sent back', () => {
  const store = tradeStore()
  store.blocks.find((b) => b.id === TRADE_BLOCKS.whatToBring).type = 'pricing'
  const context = composerContextOf({
    profile: clubProfile(),
    blockStore: store,
    pageRecipes: tradeRecipes(),
    library: library(),
    template: template(),
    brand: brand(),
    planId: 'plan-club'
  })
  const kept = gatePlan(tradeComposition(tradeBlock(TRADE_BLOCKS.whatToBring, [ACTIVITY])), context)
  assert.deepEqual(codes(kept), ['trade_block_type'])
  const c = tradeComposition()
  c.leftOut.push({ kind: 'block', block: TRADE_BLOCKS.whatToBring, what: 'Prices', reason: 'No prices yet.' })
  assert.equal(gatePlan(c, context).ok, true)
})

test('a trade block states no terms in its label or reason: number, free, discount, schedule, guarantee', () => {
  for (const reason of [
    'Your first 2 lessons are explained step by step.',
    'New players learn that the first lesson is free.',
    'New players see how a lesson runs every Saturday.',
    'New players see the discount for a first lesson.',
    'New players see that results are guaranteed.'
  ]) {
    const result = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.firstVisit, [ACTIVITY], { reason })))
    assert.deepEqual(codes(result), ['trade_terms'], reason)
  }
  const label = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.firstVisit, [ACTIVITY], { label: '3 steps' })))
  assert.deepEqual(codes(label), ['trade_terms'])
})

test('"free" that is not about a price passes, as in the step chain rule', () => {
  const reason = 'New players see why the warm up uses free weights.'
  const result = gate(tradeComposition(tradeBlock(TRADE_BLOCKS.firstVisit, [ACTIVITY], { reason })))
  assert.equal(result.ok, true, JSON.stringify(result.problems))
})

test('a block of written copy left out for want of facts on a kept page is sent back (R21 adapted)', () => {
  const c = tradeComposition({ ...tradeBlock(TRADE_BLOCKS.whatToBring, [ACTIVITY]), label: 'What to bring' })
  c.leftOut.push({
    kind: 'block',
    block: TRADE_BLOCKS.firstVisit,
    what: 'Your first lesson',
    reason: 'You gave nothing for this section to show.'
  })
  const result = gate(c)
  assert.deepEqual(codes(result), ['trade_block_left_out'])
  assert.equal(result.problems[0].at, 'leftOut[1]')
})

test('a written copy block left out naming the fact that shows the activity is absent passes', () => {
  const c = tradeComposition({ ...tradeBlock(TRADE_BLOCKS.whatToBring, [ACTIVITY]), label: 'What to bring' })
  c.leftOut.push({
    kind: 'block',
    block: TRADE_BLOCKS.firstVisit,
    what: 'Your first lesson',
    reason: 'Your club hires out courts and runs no lessons for beginners.',
    factIds: ['service-court-hire']
  })
  const result = gate(c)
  assert.equal(result.ok, true, JSON.stringify(result.problems))
})

test('a left out block with a field for a fact of the business, or not on a kept page, is not sent back', () => {
  const c = tradeComposition()
  c.leftOut.push({ kind: 'block', block: TRADE_BLOCKS.story, what: 'Our story', reason: 'No quote yet.' })
  assert.equal(gate(c).ok, true, JSON.stringify(gate(c).problems))
})

test('a left out entry names a block of the list', () => {
  const c = tradeComposition()
  c.leftOut.push({ kind: 'block', block: 'block-404', what: 'Somewhere', reason: 'Nothing to show.' })
  assert.deepEqual(codes(gate(c)), ['unknown_block'])
})

/**
 * The copy-plan stage's invariants, one test each (spec TracyHQ/tracy#189, R12 stage diff). Fictional businesses: a bakery
 * and a bicycle repair shop. The golden stage test on a real contract is `page-one-pass.test.mjs`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  lostBatchParts,
  mergeAnswer,
  planJoomlaContract
} from '../../../packages/cms/tracy-seeder/src/plan-joomla-contract.mjs'
import { planConcurrently } from '../src/sites/brief-engines/shared.js'
import { COPY_BUDGET, copyBudgetMs, p95Of } from '../src/sites/brief-engines/copy-plan-budget.js'
import { keepUnwritten, pendingByKind } from '../src/sites/brief-engines/copy-plan-stage.js'
import { checkCopyLines } from '../src/opportunities-build/copy-lines-check.js'

const state = (slots) => ({ contract: 'test/v1', revision: 'before', slots })
const SLOTS = [
  { key: 'card.0', entity: 'module-1', sample: 'Demo card one text', maxCharacters: 80 },
  { key: 'card.1', entity: 'module-1', sample: 'Demo card two text', maxCharacters: 80 },
  { key: 'head.0', entity: 'module-2', sample: 'Demo heading', maxCharacters: 80 }
]
const GOOD = { 'card.0': 'Fresh bread every morning', 'card.1': 'Cakes!', 'head.0': 'Our bakery' }
const complain = (slots, values) =>
  values?.['card.1'] === 'Cakes!'
    ? { message: 'card.1 breaks its shape', keys: { 'card.1': 'sibling' } }
    : null

test('1: a send-back that fails keeps the first answer; one that answers replaces only the keys it was sent for', async () => {
  for (const retry of ['throws', 'empty', 'rewrites-all']) {
    const model = async (call) => {
      if (!call.input?.fix) return JSON.stringify({ values: GOOD, pending: [] })
      if (retry === 'throws') throw new Error('the model did not answer')
      if (retry === 'empty') return JSON.stringify({ values: {}, pending: ['card.0', 'card.1', 'head.0'] })
      return JSON.stringify({
        values: { 'card.0': 'Other words', 'card.1': 'Cakes baked to order.', 'head.0': '' },
        pending: []
      })
    }
    const out = await planConcurrently(
      (generate) =>
        planJoomlaContract({
          state: state(SLOTS),
          site: { name: 'Rye Hill Bakery' },
          generate,
          hints: {},
          complain
        }),
      model
    )
    const want = retry === 'rewrites-all' ? { ...GOOD, 'card.1': 'Cakes baked to order.' } : GOOD
    assert.deepEqual(out.result.changes, want, retry)
    assert.deepEqual(out.result.pending, [], retry)
  }
})

test('1: mergeAnswer never lets an empty or pended retry value replace written words', () => {
  const known = new Set(['a', 'b', 'c'])
  const prev = { values: { a: 'Bread', b: 'Rolls' }, pending: ['c'], invented: [] }
  const next = { values: { a: '', c: 'Cakes', x: 'stray' }, pending: ['b'], invented: ['c'] }
  assert.deepEqual(mergeAnswer(prev, next, known), {
    values: { a: 'Bread', b: 'Rolls', c: 'Cakes' },
    pending: [],
    invented: ['c']
  })
  assert.deepEqual(mergeAnswer(prev, next, known, new Set(['a'])).values, { a: 'Bread', b: 'Rolls' })
})

test('2: the send-backs of every batch go out together, as one concurrent round', async () => {
  // Two pages of 30 cards: two batches, so two send-backs.
  const slots = Array.from({ length: 60 }, (_, i) => ({
    key: `card.${i}`,
    entity: `module-${i < 30 ? 0 : 1}`,
    sample: `Demo card ${i} text`,
    maxCharacters: 80
  }))
  let inFlight = 0
  let most = 0
  const model = async (call) => {
    inFlight += 1
    most = Math.max(most, inFlight)
    await new Promise((r) => setTimeout(r, 20))
    inFlight -= 1
    const values = Object.fromEntries(
      call.input.slots.map((s) => [s.key, call.input.fix ? `Fixed ${s.key}` : 'Short!'])
    )
    return JSON.stringify({ values, pending: [] })
  }
  const shout = (batch, values) => {
    const keys = Object.fromEntries(
      batch.filter((s) => values?.[s.key] === 'Short!').map((s) => [s.key, 'sibling'])
    )
    return Object.keys(keys).length ? { message: 'too short', keys } : null
  }
  const out = await planConcurrently(
    (generate) =>
      planJoomlaContract({
        state: {
          ...state(slots),
          pages: [
            { id: 'p0', entities: ['module-0'] },
            { id: 'p1', entities: ['module-1'] }
          ]
        },
        site: { name: 'Spoke and Chain Repairs' },
        generate,
        byPage: true,
        hints: {},
        complain: shout
      }),
    model
  )
  assert.equal(out.rounds, 2, 'the send-backs are one round')
  assert.ok(Object.values(out.result.changes).every((v) => v.startsWith('Fixed')))
  assert.equal(out.calls, 4, 'two answers, two send-backs')
  assert.equal(most, 2, 'both send-backs in flight at once, never one after the other')
})

test('3: a round the budget has no room for is not sent; its calls are recorded as cut by the deadline', async () => {
  let now = 0
  const model = async (call) => {
    now += 10_000
    return JSON.stringify({ values: GOOD, pending: [], ...(call.input?.fix ? {} : {}) })
  }
  const out = await planConcurrently(
    (generate) =>
      planJoomlaContract({
        state: state(SLOTS),
        site: { name: 'Rye Hill Bakery' },
        generate,
        hints: {},
        complain
      }),
    model,
    { now: () => now, deadlineAt: 15_000 }
  )
  assert.equal(out.cut, 1, 'the send-back is cut')
  assert.deepEqual(out.result.changes, GOOD, 'the first answer stands')
  assert.deepEqual(out.callMs, [10_000], 'each answered call is timed')
})

test('3: the budget is sized by the work, from the measured p95, under a ceiling', () => {
  assert.equal(p95Of([]), null)
  assert.equal(p95Of([1, 2, 3, 4, 100]), 100)
  const small = copyBudgetMs({ calls: 4, p95Ms: 20_000 })
  const large = copyBudgetMs({ calls: 40, p95Ms: 20_000 })
  assert.equal(small, COPY_BUDGET.baseMs + 2 * 20_000, 'one wave and the second round')
  assert.ok(large > small, 'more batches, more time')
  assert.equal(copyBudgetMs({ calls: 400, p95Ms: 90_000 }), COPY_BUDGET.ceilingMs)
  assert.equal(copyBudgetMs({ calls: 4 }), COPY_BUDGET.baseMs + 2 * COPY_BUDGET.perCallMs)
})

test('4: a lost batch is retried split, per page then per section; only a part that still fails waits', async () => {
  const slots = [
    { key: 'a.0', entity: 'article-1', sample: 'Demo class one', maxCharacters: 80 },
    { key: 'b.0', entity: 'article-2', sample: 'Demo class two', maxCharacters: 80 },
    { key: 'c.0', entity: 'article-3', sample: 'Demo class three', maxCharacters: 80 }
  ]
  const pages = slots.map((s, i) => ({ id: `p${i}`, entities: [s.entity] }))
  assert.equal(lostBatchParts(slots, () => [], true).length, 2, 'no pages: halves')
  const model = async (call) => {
    const keys = call.input.slots.map((s) => s.key)
    if (keys.length === 3 || keys.includes('c.0')) throw new Error('the model did not answer')
    return JSON.stringify({ values: Object.fromEntries(keys.map((k) => [k, `Written ${k}`])), pending: [] })
  }
  const out = await planConcurrently(
    (generate) =>
      planJoomlaContract({
        state: { ...state(slots), pages },
        site: { name: 'Rye Hill Bakery' },
        generate,
        byPage: true
      }),
    model
  )
  assert.deepEqual(out.result.changes, { 'a.0': 'Written a.0', 'b.0': 'Written b.0' })
  assert.deepEqual(out.result.pending, ['c.0'])
  assert.equal(out.result.reasons['c.0'], 'model-failed', 'the receipt says why it waits')
})

test('5: pending keys by kind, and a lost visible line is never blanked: it is unwritten, with its rule', () => {
  const plan = {
    pending: ['a', 'b', 'c'],
    reasons: { a: 'model-failed', b: 'deadline', c: 'model-pended' },
    owners: { d: 'sibling', e: 'page-copy' }
  }
  assert.deepEqual(pendingByKind(plan), {
    truncated: [],
    unreadable: [],
    'model-failed': ['a'],
    deadline: ['b'],
    refused: ['c'],
    'complaint-unmet': ['d']
  })
  const out = keepUnwritten({
    blanks: [{ key: 'a' }, { key: 'b' }, { key: 'c' }],
    plan,
    hints: { a: { shape: { sentences: [2, 2], characters: [80, 120] } } }
  })
  assert.deepEqual(
    out.blanks.map((s) => s.key),
    ['c'],
    'a line the model refused is still tidied'
  )
  assert.deepEqual(
    out.unwritten.map((u) => [u.key, u.reason]),
    [
      ['a', 'model-failed'],
      ['b', 'deadline']
    ]
  )
  assert.match(out.unwritten[0].rule, /2-2 sentence/)
})

test('6: a demo line the build left empty or unwritten is a finding, never clean', () => {
  assert.deepEqual(checkCopyLines({ copyLines: null }), [])
  const found = checkCopyLines({
    copyLines: { unwritten: [{ key: 'a', reason: 'deadline', rule: 'its shape' }], blanked: ['b', 'a'] }
  })
  assert.deepEqual(
    found.map((f) => [f.kind, f.key, f.severity]),
    [
      ['unwritten', 'a', 'major'],
      ['blanked', 'b', 'major']
    ]
  )
  assert.equal(found[0].writeAs, 'its shape')
})

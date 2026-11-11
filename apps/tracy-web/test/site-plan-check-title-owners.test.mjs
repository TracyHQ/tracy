// Invented masthead fixtures reproduce the Diner name-owner and undeclared-title contradictions without site writes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPlan, CHECKER_VERSION } from '../src/site-planner/plan-check/check-plan.js'
import { runBenchRun } from '../src/lib/bench-run-loop.js'

function fixture() {
  return {
    kit: {
      pageGroups: [{ id: 'group-pages' }],
      pages: [
        {
          id: 'page-contact',
          group: 'group-pages',
          path: '/contact',
          titleSlot: 'block-7.3',
          blocks: { 1440: ['block-7'] }
        },
        {
          id: 'page-booking',
          group: 'group-pages',
          path: '/booking',
          titleSlot: 'block-7.11',
          blocks: { 1440: ['block-7'] }
        }
      ],
      blocks: [
        {
          id: 'block-7',
          shared: true,
          slots: [],
          lists: [],
          frames: [],
          demoOwned: [{ id: 'block-7.3', type: 'text', role: 'business.name', sample: 'Sample Dining' }]
        }
      ],
      site: { nameSlots: [{ kind: 'slot', id: 'block-7.3', block: 'block-7' }] },
      storedFields: [
        { slot: 'block-7.11', listedIn: 'block-7', field: 'params.titles.8', type: 'text', sample: 'Booking' }
      ]
    },
    plan: {
      pageGroups: [{ id: 'group-pages', decision: 'keep' }],
      pages: [
        { id: 'page-contact', decision: 'keep', blocks: [] },
        { id: 'page-booking', decision: 'keep', blocks: [] }
      ],
      sharedBlocks: [{ block: 'block-7', decision: 'keep', copy: [], hiddenSlots: [] }]
    },
    brief: { facts: [] }
  }
}
const rule = (input, id = 'R20') => checkPlan(input).rules.find((r) => r.id === id)
const omitBooking = (input) => {
  input.plan.pages[1].decision = 'drop'
  return input
}

test('a declared brand-owned title is delegated on its kept applicable block; an undeclared title remains a kit failure', () => {
  const input = fixture()
  const result = rule(input)
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].where, 'page-booking')
  assert.equal(result.failures[0].cause, 'kit')
  assert.match(result.failures[0].detail, /block-7\.11.*(?:writable|write).*kit/i)
  assert.match(result.notes.join(' '), /page-contact.*brand/)
  assert.equal(rule(input, 'R07').status, 'pass')
  const copied = structuredClone(input)
  copied.plan.sharedBlocks[0].copy.push({ slot: 'block-7.11', says: 'the booking page title' })
  assert.equal(rule(copied).failures[0].cause, 'kit')
  assert.ok(rule(copied, 'R01').failures.some((f) => f.detail.includes('slot id not in the kit')))
})

test('brand delegation never excuses a hidden title, dropped block, wrong block or unknown name-slot ID', () => {
  for (const scenario of ['hidden', 'dropped', 'wrong-block', 'unknown-name', 'unwritable']) {
    const input = omitBooking(fixture())
    if (scenario === 'hidden')
      input.plan.sharedBlocks[0].hiddenSlots.push({ slot: 'block-7.3', why: 'hidden' })
    if (scenario === 'dropped') input.plan.sharedBlocks[0].decision = 'hide'
    if (scenario === 'wrong-block') input.kit.site.nameSlots[0].block = 'block-other'
    if (scenario === 'unknown-name') input.kit.blocks[0].demoOwned = []
    if (scenario === 'unwritable') input.kit.blocks[0].demoOwned[0].writable = false
    assert.equal(rule(input).status, 'fail', scenario)
  }
})

test('ordinary declared title copy and candidates still count; null title metadata and dropped pages remain unscored', () => {
  const input = omitBooking(fixture())
  input.kit.site.nameSlots = []
  input.kit.blocks[0].demoOwned[0].role = 'editorial.heading'
  assert.equal(rule(input).failures[0].cause, 'page-title')
  input.plan.sharedBlocks[0].copy.push({ slot: 'block-7.3', says: 'the page title' })
  assert.equal(rule(input).status, 'pass')
  input.kit.pages[0].titleSlot = null
  input.kit.pages[0].titleCandidates = ['block-unknown.8', 'block-7.3']
  assert.equal(rule(input).status, 'pass')
  input.kit.pages[0].titleCandidates = []
  assert.equal(rule(input).status, 'skip')
  input.plan.pages[0].decision = 'drop'
  assert.equal(rule(input).failures.length, 0)
})

test('a paid run frozen on checker 5 cannot resume under the new title semantics or call a provider', async () => {
  const prompt = { text: 'A frozen planner prompt.', sha256: 'a'.repeat(64) }
  const row = { id: 'paid-frozen-run', checker_version: 'site-plan-check/5', prompt_sha256: prompt.sha256 }
  const finishes = []
  let preparations = 0
  const step = {
    codePrefix: 'SITE_PLANNER',
    prompt: () => prompt,
    checker: { version: CHECKER_VERSION },
    prepare: async () => {
      preparations++
      throw Error('must not prepare a mismatched run')
    }
  }
  await runBenchRun(
    step,
    {
      pool: {
        query: () => {
          throw Error('must not touch saved paid data')
        }
      },
      fetchImpl: () => {
        throw Error('must not call a provider')
      }
    },
    row,
    {
      token: 'frozen',
      finish: async (result) => {
        finishes.push(result)
        return true
      }
    }
  )
  assert.equal(preparations, 0)
  assert.equal(finishes[0].status, 'failed')
  assert.match(finishes[0].error, /^SITE_PLANNER_CHECKER_CHANGED:/)
  assert.match(finishes[0].error, /site-plan-check\/5/)
  assert.equal(row.checker_version, 'site-plan-check/5')
})

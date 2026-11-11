import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { SITE_PLANNER_STEP } from '../src/site-planner/bench-worker.js'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { brief, kit as fixtureKit, keepHidingAll, plan } from './_site-plan-check.mjs'

const published = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
      import.meta.url
    )
  )
)
const social = published.blocks.find((block) => block.id === 'block-171')
const normalize = (value, kit) => SITE_PLANNER_STEP.readAnswer(value, { ready: { kit: { doc: kit } } })
const missing = 'block-171.6'
function input() {
  const kit = fixtureKit()
  kit.blocks[kit.blocks.findIndex((block) => block.id === social.id)] = structuredClone(social)
  const value = plan()
  const decision = keepHidingAll(kit, social.id)
  decision.hiddenSlots = [...new Map(decision.hiddenSlots.map((entry) => [entry.slot, entry])).values()]
  decision.hiddenSlots = decision.hiddenSlots.filter((entry) => entry.slot !== missing)
  value.sharedBlocks[value.sharedBlocks.findIndex((block) => block.block === social.id)] = decision
  return { kit, value, decision }
}
const rule = (value, kit) =>
  checkPlan({ plan: value, kit, brief: brief() }).rules.find((entry) => entry.id === 'R10b')
const hidden = (value) =>
  value.sharedBlocks.find((block) => block.block === social.id).hiddenSlots.map((entry) => entry.slot)

test('a hidden social parent closes its missing child link without a model round', () => {
  const { kit, value } = input()
  const before = structuredClone(value)
  assert.equal(rule(value, kit).status, 'fail')
  const result = normalize(value, kit)
  assert.equal(rule(result, kit).status, 'pass')
  assert.equal(checkPlan({ plan: result, kit, brief: brief() }).summary.fail, 0)
  assert.ok(hidden(result).includes(missing))
  assert.deepEqual(value, before)
  assert.strictEqual(normalize(result, kit), result)
})

test('a visible undecided child link remains a checker failure', () => {
  const { kit, value, decision } = input()
  decision.hiddenSlots = decision.hiddenSlots.filter((entry) => entry.slot !== 'block-171.social')
  decision.lists = [{ list: 'block-171.social', rows: 4, items: [] }]
  assert.strictEqual(normalize(value, kit), value)
  assert.equal(rule(value, kit).status, 'fail')
})

test('trimmed social rows close missing links but preserve explicitly named non-leading rows', () => {
  const { kit, value, decision } = input()
  decision.hiddenSlots = []
  decision.lists = [
    {
      list: 'block-171.social',
      rows: 1,
      items: [{ copy: [{ slot: 'block-171.3', says: 'a verified profile' }] }]
    }
  ]
  const result = normalize(value, kit)
  assert.deepEqual(hidden(result).sort(), ['block-171.4', 'block-171.5', 'block-171.6'])
  assert.ok(!hidden(result).includes('block-171.7'))
})

test('explicit links and row content remain intact even when a row count is smaller', () => {
  const { kit, value, decision } = input()
  decision.hiddenSlots = []
  decision.links = [{ link: missing, labelSlot: 'block-171.2', leadsTo: 'https://example.com/verified' }]
  decision.copy = [{ slot: 'block-171.3', says: 'a verified profile' }]
  decision.lists = [{ list: 'block-171.social', rows: 1, items: [] }]
  const result = normalize(value, kit)
  const got = result.sharedBlocks.find((block) => block.block === social.id)
  assert.deepEqual(got.links, decision.links)
  assert.deepEqual(got.copy, decision.copy)
  assert.ok(!hidden(result).includes(missing))
  assert.ok(!hidden(result).includes('block-171.7'))
})

test('negative or fractional row counts never imply hiding links', () => {
  for (const rows of [-1, 1.5]) {
    const { kit, value, decision } = input()
    decision.hiddenSlots = []
    decision.lists = [{ list: 'block-171.social', rows, items: [] }]
    assert.strictEqual(normalize(value, kit), value)
  }
})

test('a fix-round change receives the same hidden-parent closure', () => {
  const { kit, value, decision } = input()
  decision.hiddenSlots = decision.hiddenSlots.filter((entry) => entry.slot !== 'block-171.social')
  const result = SITE_PLANNER_STEP.changes.applyValidChanges(
    value,
    {
      changes: [
        {
          block: social.id,
          add: 'hiddenSlots',
          with: { slot: 'block-171.social', why: 'no verified profiles' }
        }
      ]
    },
    { ready: { kit: { doc: kit } } }
  )
  assert.equal(result.ok, true)
  assert.equal(rule(result.doc, kit).status, 'pass')
})

test('ambiguous row ownership and contradictory parent decisions stay unresolved', () => {
  for (const kind of ['ambiguous', 'contradictory']) {
    const { kit, value, decision } = input()
    if (kind === 'ambiguous') {
      const block = kit.blocks.find((entry) => entry.id === social.id)
      block.lists.push({ ...structuredClone(block.lists[0]), id: 'another-list' })
    } else {
      decision.lists = [{ list: 'block-171.social', rows: 4, items: [] }]
    }
    assert.strictEqual(normalize(value, kit), value)
    assert.equal(rule(value, kit).status, 'fail')
  }
})

test('a page-local kept block closes its hidden row, while dropped pages remain untouched', () => {
  for (const pageDecision of ['keep', 'drop']) {
    const { kit, value, decision } = input()
    value.sharedBlocks = value.sharedBlocks.filter((entry) => entry.block !== social.id)
    value.pages = [{ id: 'page-home', decision: pageDecision, blocks: [decision] }]
    const result = normalize(value, kit)
    const slots = result.pages[0].blocks[0].hiddenSlots.map((entry) => entry.slot)
    assert.equal(slots.includes(missing), pageDecision === 'keep')
  }
})

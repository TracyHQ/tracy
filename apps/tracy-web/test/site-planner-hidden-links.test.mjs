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
// The kit label slot of the missing link. keepHidingAll hides it with every demo slot; a test of the row closure alone
// leaves it undecided, since a hidden label closes its link on its own (the label rule below).
const missingLabel = 'block-171.2'
const leaveLabelUndecided = (decision) => {
  decision.hiddenSlots = decision.hiddenSlots.filter((entry) => entry.slot !== missingLabel)
}
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
  leaveLabelUndecided(decision)
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
  // With the kit's limit already copied, so the comparison below sees only what the link closure does.
  decision.copy = [{ slot: 'block-171.3', says: 'a verified profile', maxCharacters: 40 }]
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
    leaveLabelUndecided(decision)
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

// A label slot the plan hides takes its undecided link with it (the spec: "hide its label slot, and the link with it").
const contactBlock = 'body-about-us_contact'
const mapButton = 'body-about-us_contact.button-1'
const mapLabel = 'languageString-30910664.0'
function contactWithHiddenLabel() {
  const kit = fixtureKit()
  const value = plan()
  const decision = value.pages.flatMap((page) => page.blocks).find((block) => block.block === contactBlock)
  decision.copy = decision.copy.filter((entry) => entry.slot !== mapLabel)
  decision.links = decision.links.filter((entry) => entry.link !== mapButton)
  decision.hiddenSlots.push({ slot: mapLabel, why: 'no map to open' })
  return { kit, value, decision }
}
const ruleOn = (id, value, kit) =>
  checkPlan({ plan: value, kit, brief: brief() }).rules.find((entry) => entry.id === id)
const r10bWhere = (value, kit) => ruleOn('R10b', value, kit).failures.map((f) => f.where)

test('a link whose label slot the decision hides is hidden with it', () => {
  const { kit, value } = contactWithHiddenLabel()
  const before = structuredClone(value)
  assert.ok(r10bWhere(value, kit).some((where) => where.endsWith(`link ${mapButton}`)))
  const result = normalize(value, kit)
  const got = result.pages.flatMap((page) => page.blocks).find((block) => block.block === contactBlock)
  assert.deepEqual(got.hiddenSlots.at(-1), {
    slot: mapButton,
    why: `its label slot ${mapLabel} is hidden by the plan`
  })
  assert.equal(ruleOn('R10b', result, kit).status, 'pass')
  assert.equal(ruleOn('R24', result, kit).failures.length, 0)
  assert.deepEqual(value, before)
  assert.strictEqual(normalize(result, kit), result)
})

test('a written label, a label other blocks print and a link the plan decided stay with the planner', () => {
  {
    const { kit, value, decision } = contactWithHiddenLabel()
    decision.copy.push({
      slot: mapLabel,
      says: 'map button',
      text: 'Open map',
      basis: 'trade',
      maxCharacters: 26
    })
    assert.strictEqual(normalize(value, kit), value)
  }
  {
    // block-176.1 is printed by the header and by block-176: R24 wants it written, so hiding the link settles nothing.
    const kit = fixtureKit()
    const value = plan()
    const call = value.sharedBlocks.find((block) => block.block === 'block-176')
    call.copy = []
    call.links = []
    call.hiddenSlots = [{ slot: 'block-176.1', why: 'no phone' }]
    const result = normalize(value, kit)
    assert.ok(
      !result.sharedBlocks
        .find((block) => block.block === 'block-176')
        .hiddenSlots.some((h) => h.slot === 'block-176.link-1')
    )
    assert.ok(r10bWhere(result, kit).some((where) => where.endsWith('link block-176.link-1')))
  }
  {
    const { kit, value, decision } = contactWithHiddenLabel()
    decision.links.push({ link: mapButton, labelSlot: mapLabel, leadsTo: 'map:f-address' })
    const result = normalize(value, kit)
    const got = result.pages.flatMap((page) => page.blocks).find((block) => block.block === contactBlock)
    assert.ok(!got.hiddenSlots.some((h) => h.slot === mapButton))
  }
})

test('a menu item label printed by the header and the mobile menu still takes the header link with it', () => {
  const kit = fixtureKit()
  const value = plan()
  const header = keepHidingAll(kit, 'header')
  header.hiddenSlots = header.hiddenSlots.filter((h) => h.slot !== 'header.link-5')
  if (!header.hiddenSlots.some((h) => h.slot === 'menuItem-169.0'))
    header.hiddenSlots.push({ slot: 'menuItem-169.0', why: 'no plans page' })
  const at = value.sharedBlocks.findIndex((block) => block.block === 'header')
  if (at >= 0) value.sharedBlocks[at] = header
  else value.sharedBlocks.push(header)
  assert.ok(r10bWhere(value, kit).some((where) => where.endsWith('link header.link-5')))
  const result = normalize(value, kit)
  assert.ok(!r10bWhere(result, kit).some((where) => where.endsWith('link header.link-5')))
})

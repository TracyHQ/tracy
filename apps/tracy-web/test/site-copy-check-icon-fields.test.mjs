import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { brief, copy } from './_site-copy-check.mjs'

// The actual released kit exposes CMS icon classes as text fields, alongside explicit icon.field declarations.
const frozenKit = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/template-kit.json',
      import.meta.url
    )
  )
)
function grade(slots, kit = frozenKit) {
  const c = copy()
  c.slots = slots.map(([slot, text]) => ({ slot, text, owner: 'writer', factIds: [] }))
  c.pages = []
  c.seo = []
  c.alts = []
  return checkCopy({ copy: c, kit, plan: {}, brief: brief() }).rules
}
const rule = (rules, id) => rules.find((r) => r.id === id)

test('released JA Boxing icon backing fields retain their declared Facebook and Instagram classes', () => {
  const rules = grade([
    ['block-171.8', 'fa fa-facebook'],
    ['block-171.9', 'fa fa-instagram'],
    ['block-180.12', 'fa fa-facebook']
  ])
  assert.notEqual(rule(rules, 'W07').status, 'fail')
  assert.notEqual(rule(rules, 'W06').status, 'fail')
  for (const slot of ['block-171.8', 'block-171.9'])
    assert.equal(
      rule(rules, 'W03').failures.some((f) => f.where === slot),
      false
    )
})

test('an icon backing field cannot replace its technical class with prose or an undeclared class', () => {
  for (const value of ['A friendly studio', 'fa fa-invented-network', 'What to bring']) {
    const rules = grade([['block-171.8', value]])
    assert.ok(rule(rules, 'W03').failures.some((f) => f.where === 'block-171.8' && f.cause === 'icon-field'))
  }
})

test('three-word demo headings remain forbidden even though valid technical classes are excluded', () => {
  const rules = grade([['article-2.16', 'What to bring']])
  assert.ok(
    rule(rules, 'W07').failures.some((f) => f.where === 'article-2.16' && f.cause === 'demo-sentence')
  )
})

test('CSS-looking text without an explicit icon.field declaration remains demo prose', () => {
  const kit = structuredClone(frozenKit)
  for (const block of kit.blocks)
    for (const list of block.lists ?? [])
      for (const row of list.rows ?? []) row.slots = row.slots.filter((s) => s.type !== 'icon')
  const rules = grade([['block-171.8', 'fa fa-facebook']], kit)
  assert.ok(rule(rules, 'W07').failures.some((f) => f.where === 'block-171.8'))
})

test('an icon class printed in an ordinary prose slot is still checked as prose', () => {
  const kit = structuredClone(frozenKit)
  kit.blocks.push({ id: 'unmapped', slots: [{ id: 'unmapped.1', type: 'text', sample: 'fa fa-facebook' }] })
  const rules = grade([['unmapped.1', 'fa fa-facebook']], kit)
  assert.ok(rule(rules, 'W07').failures.some((f) => f.where === 'unmapped.1'))
})

function socialGrade(
  network,
  iconClass,
  { hidden = false, kept = true, field = 'block-171.10', link = 'block-171.6', kit = frozenKit } = {}
) {
  const c = copy()
  c.slots = [{ slot: field, text: iconClass, owner: 'writer', factIds: [] }]
  c.pages = []
  c.seo = []
  c.alts = []
  const plan = {
    sharedBlocks: [
      {
        block: 'block-171',
        decision: kept ? 'keep' : 'hide',
        copy: [{ slot: field, says: 'The profile icon', factIds: [] }],
        links: [{ link, leadsTo: 'social:profile' }],
        hiddenSlots: hidden ? [{ slot: link }] : []
      }
    ]
  }
  const b = brief()
  b.facts = [
    { id: 'profile', field: 'socials', value: { kind: network, url: `https://${network}.com/studio` } }
  ]
  return checkCopy({ copy: c, kit, plan, brief: b }).rules
}

test('a declared social glyph cannot pass for a different planned profile network', () => {
  const result = rule(socialGrade('tiktok', 'fa fa-twitter'), 'W03')
  assert.equal(result.status, 'fail')
  assert.ok(result.failures.some((f) => f.where === 'block-171.10' && f.cause === 'icon-network'))
  assert.match(result.failures.find((f) => f.cause === 'icon-network').detail, /return.*planner/i)
  const youtube = rule(
    socialGrade('youtube', 'fa fa-telegram', { field: 'block-171.11', link: 'block-171.7' }),
    'W03'
  )
  assert.ok(youtube.failures.some((f) => f.where === 'block-171.11' && f.cause === 'icon-network'))
})

test('social network checking preserves matching declared icons and hidden or omitted links', () => {
  for (const rules of [
    socialGrade('twitter', 'fa fa-twitter'),
    socialGrade('x', 'fa fa-twitter'),
    socialGrade('tiktok', 'fa fa-twitter', { hidden: true }),
    socialGrade('tiktok', 'fa fa-twitter', { kept: false })
  ])
    assert.equal(
      rule(rules, 'W03').failures.some((f) => f.cause === 'icon-network'),
      false
    )
})

test('an unavailable matching social class still cannot bypass kit icon constraints', () => {
  const result = rule(socialGrade('tiktok', 'fa fa-tiktok'), 'W03')
  assert.ok(result.failures.some((f) => f.cause === 'icon-field'))
})

test('YouTube copy uses the same evidenced font family as the link writer', () => {
  const rules = socialGrade('youtube', 'fa fa-youtube')
  for (const id of ['W03', 'W06', 'W07'])
    assert.equal(
      rule(rules, id).failures.some((f) => f.where === 'block-171.10'),
      false
    )
})

test('a supported replacement glyph still has to match the planned network', () => {
  const rules = socialGrade('youtube', 'fa fa-facebook')
  assert.ok(rule(rules, 'W03').failures.some((f) => f.cause === 'icon-network'))
})

test('the copy fix names the supported target class instead of returning a usable YouTube row to planner', () => {
  const result = rule(socialGrade('youtube', 'fa fa-twitter'), 'W03')
  const failure = result.failures.find((f) => f.cause === 'icon-network')
  assert.match(failure.detail, /use fa fa-youtube/)
  assert.doesNotMatch(failure.detail, /return.*planner/)
})

test('a copy cannot substitute a different font family or infer a glyph from mixed families', () => {
  for (const value of ['fab fa-youtube', 'fa-brands fa-youtube'])
    assert.ok(rule(socialGrade('youtube', value), 'W03').failures.some((f) => f.cause === 'icon-field'))
  const mixed = structuredClone(frozenKit)
  for (const block of mixed.blocks)
    for (const list of block.lists ?? [])
      for (const row of list.rows ?? [])
        for (const slot of row.slots ?? [])
          if (slot.type === 'icon' && slot.network === 'instagram') slot.fieldValue = 'fab fa-instagram'
  assert.ok(
    rule(socialGrade('youtube', 'fa fa-youtube', { kit: mixed }), 'W03').failures.some(
      (f) => f.cause === 'icon-field'
    )
  )
})

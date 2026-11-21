// A chain build's draft copy, written on the plan's first checked draft, is matched to the final plan before the copy
// run checks it (site-writer/base-copy-align.js): a slot the final plan hides or no longer decides keeps no words, and a
// plan label the final plan rewrote takes its words. What needs writing stays for the fix round. The copy check's own
// passing plan and copy (_site-copy-check.mjs); no model, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignBaseCopy } from '../src/site-writer/base-copy-align.js'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { brief, copy, kit, plan } from './_site-copy-check.mjs'

const decisionOf = (p, block) =>
  [...p.sharedBlocks, ...p.pages.flatMap((page) => page.blocks ?? [])].find((d) => d.block === block)
const w02 = (c, p) =>
  checkCopy({ copy: c, plan: p, kit: kit(), brief: brief() }).rules.find((r) => r.id === 'W02')
const align = (c, p) => alignBaseCopy(c, { plan: p, kit: kit(), brief: brief() })

test('a draft that still matches the final plan comes back as the same object', () => {
  const c = copy()
  const out = align(c, plan())
  assert.equal(out.copy, c)
  assert.deepEqual([out.left, out.relabelled], [[], []])
})

test('a slot the final plan hides after the draft was written keeps no words, so W02 has nothing to send back', () => {
  const final = plan()
  const d = decisionOf(final, 'block-2')
  d.copy = d.copy.filter((e) => e.slot !== 'block-2.2')
  d.hiddenSlots.push({ slot: 'block-2.2', why: 'the hours are not known' })
  const draft = copy()
  assert.ok(w02(draft, final).failures.some((f) => /block-2\.2: hidden slot has text/.test(f.detail)))
  const out = align(draft, final)
  assert.deepEqual(out.left, ['block-2.2'])
  assert.equal(
    out.copy.slots.some((s) => s.slot === 'block-2.2'),
    false
  )
  assert.equal(w02(out.copy, final).status, 'pass')
  // The draft given is not changed.
  assert.ok(draft.slots.some((s) => s.slot === 'block-2.2'))
})

test("a plan label the final plan rewrote takes the final plan's words; a slot the draft never wrote stays missing", () => {
  const final = plan()
  decisionOf(final, 'block-1').copy[0].text = 'Book a class'
  const kept = decisionOf(final, 'block-2')
  kept.hiddenSlots = kept.hiddenSlots.filter((h) => h.slot !== 'block-2.3')
  kept.copy.push({ slot: 'block-2.3', says: 'what to bring', basis: 'trade', maxCharacters: 80 })
  const out = align(copy(), final)
  assert.deepEqual(out.relabelled, ['block-1.1'])
  assert.equal(out.copy.slots.find((s) => s.slot === 'block-1.1').text, 'Book a class')
  // Words for a slot the draft never wrote are the writer's: left for the fix round, never invented.
  assert.deepEqual(
    w02(out.copy, final).failures.map((f) => f.detail),
    ['block-2.3: slot is missing']
  )
})

// The writer is given, per text slot, the length window the copy check's W03 holds the text to (`characters`), from the same
// kit slot, plan limit and arithmetic (lib/site-copy/slot-shape.js lengthWindow, partWindows). A text at the window's edges
// passes W03; one character outside fails it. Fixtures are the invented Quay Fitness Studio of _site-copy-check.mjs.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { LENGTH_WINDOW_NOTE, writerInput } from '../src/site-writer/writer-input.js'
import { fixedPart } from '../src/site-writer/writer-turns.js'
import { brief, copy, kit, plan, slotOf } from './_site-copy-check.mjs'

/** A text of exactly n characters with no sentence break inside it. */
const chars = (n) =>
  'train hard with friends '
    .repeat(Math.ceil(n / 24) + 1)
    .slice(0, n)
    .replace(/\s$/, 'x')

/** The kit with block-2.2 changed: `changes` are merged into the slot. */
function kitWith(changes) {
  const k = kit()
  Object.assign(k.blocks.find((b) => b.id === 'block-2').slots.find((s) => s.id === 'block-2.2'), changes)
  return k
}
const windowOf = (k, p, id = 'block-2.2') =>
  writerInput({ plan: p, brief: brief(), kit: k })
    .blocks.flatMap((b) => b.slots)
    .find((s) => s.id === id)?.characters
const w03Failures = (k, p, text) => {
  const c = copy()
  slotOf(c, 'block-2.2').text = text
  return checkCopy({ copy: c, plan: p, kit: k, brief: brief() })
    .rules.find((r) => r.id === 'W03')
    .failures.filter((f) => f.where === 'block-2.2')
}
const w03 = (k, p, text) => w03Failures(k, p, text).map((f) => f.cause)

test('a slot is given the window W03 applies: its edges pass and one character outside fails', () => {
  const k = kitWith({ demoChars: { total: 150, lead: null, bullets: [] } })
  const window = windowOf(k, plan())
  assert.deepEqual(window, { min: 120, max: 153 })
  assert.deepEqual(w03(k, plan(), chars(window.min)), [])
  assert.deepEqual(w03(k, plan(), chars(window.max)), [])
  assert.deepEqual(w03(k, plan(), chars(window.min - 1)), ['under'])
  assert.deepEqual(w03(k, plan(), chars(window.max + 1)), ['over-demo'])
})

test("the plan's smaller maxCharacters narrows the window the same way it narrows W03", () => {
  const k = kitWith({ demoChars: { total: 150, lead: null, bullets: [] } })
  const p = plan()
  p.pages[0].blocks[0].copy.find((c) => c.slot === 'block-2.2').maxCharacters = 130
  const window = windowOf(k, p)
  assert.deepEqual(window, { min: 120, max: 130 })
  assert.deepEqual(w03(k, p, chars(130)), [])
  assert.deepEqual(w03(k, p, chars(131)), ['over'])
})

test('a lead and points slot is given its lead and average point windows, as W03 judges them', () => {
  const k = kitWith({
    sample: 'cut…',
    bullets: 5,
    demoChars: { total: 150, lead: 90, bullets: [9, 28, 10, 15, 7] }
  })
  const window = windowOf(k, plan())
  assert.deepEqual(window, {
    min: 120,
    max: 153,
    lead: { min: 72, max: 93 },
    point: { min: 12, max: 17 }
  })
  const points = (n) => Array.from({ length: 5 }, () => chars(n))
  const details = (text) => w03Failures(k, plan(), text).map((f) => f.detail)
  // Each edge is tried with the other parts inside their windows and the whole inside min and max.
  assert.deepEqual(details([chars(window.lead.min), ...points(14)]), [])
  assert.deepEqual(details([chars(window.lead.min - 1), ...points(14)]), [
    'block-2.2: lead paragraph 71 characters, floor 72 (80% of the 90 character demo lead)'
  ])
  assert.deepEqual(details([chars(80), ...points(window.point.min)]), [])
  assert.deepEqual(details([chars(80), ...points(window.point.min - 1)]), [
    'block-2.2: points average 11 characters, floor 12 (80% of the 14 character average demo point)'
  ])
})

test('a short demo the plan does not narrow gets no window; an article lead gets no floor', () => {
  assert.equal(windowOf(kit(), plan(), 'block-2.1'), undefined)
  const k = kitWith({ role: 'article.lead', demoChars: { total: 150, lead: null, bullets: [] } })
  assert.deepEqual(windowOf(k, plan()), { max: 153 })
})

test('the fixed part says how to read the windows', () => {
  const text = fixedPart(writerInput({ plan: plan(), brief: brief(), kit: kit() }))
  assert.ok(text.includes(`## The kit: how long each text slot is written\n\n${JSON.stringify(LENGTH_WINDOW_NOTE)}\n`))
})

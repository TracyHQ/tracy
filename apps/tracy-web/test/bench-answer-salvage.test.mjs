// A fix round's change list that is not valid JSON as a whole keeps the changes that are (lib/bench-answer.js
// salvagedChangeList), with how many were kept and lost; a whole document is read exactly as before, and two lists in
// one answer are refused. Pure, no model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { objectOf, salvagedChangeList } from '../src/lib/bench-answer.js'

const read = (text) => objectOf(text, { codePrefix: 'SITE_PLANNER' })
const a = { slot: 'block-12.3', field: 'says', with: 'the opening hours' }
const c = { slot: 'block-12.4', remove: true }

test('a valid change list is read as it always was, with nothing marked repaired', () => {
  const out = read(JSON.stringify({ changes: [a, c] }))
  assert.deepEqual(out, { ok: true, value: { changes: [a, c] }, droppedText: false })
})

test('one broken edit in the middle of a list costs only that edit', () => {
  const text = `{"changes": [${JSON.stringify(a)}, {"slot": "block-12.5", "with": the hours}, ${JSON.stringify(c)}]}`
  const out = read(text)
  assert.equal(out.ok, true)
  assert.deepEqual(out.value, { changes: [a, c] })
  assert.deepEqual(out.repaired, { kept: 2, lost: 1 })
})

test('a list cut off in the middle keeps its whole edits; brackets and quotes inside values never end an edit', () => {
  const tricky = { slot: 'block-1.2', field: 'says', with: 'prices ] and } a "quoted" word, a \\ backslash' }
  const text = `Here are the edits:\n\`\`\`json\n{"changes": [${JSON.stringify(tricky)},\n  ${JSON.stringify(a)}, {"slot": "block-9.1", "field": "says", "with": "unfinis`
  const out = read(text)
  assert.deepEqual(out.value, { changes: [tricky, a] })
  assert.deepEqual(out.repaired, { kept: 2, lost: 1 })
  assert.equal(out.droppedText, true)
})

test('a whole document that is not JSON, two lists, or a list with no whole edit stay unread', () => {
  const plan = { version: 'site-plan/3', pages: [] }
  for (const text of [
    `Here is the plan: ${JSON.stringify(plan)}`,
    `${JSON.stringify({ changes: [a] })}\n${JSON.stringify({ changes: [c] })}`,
    '{"changes": [{"slot": "block-1", "with": oops}'
  ]) {
    const out = read(text)
    assert.equal(out.ok, false, text.slice(0, 40))
    assert.match(out.error, /^SITE_PLANNER_ANSWER_NOT_JSON/)
  }
  assert.equal(salvagedChangeList('no list here'), null)
})

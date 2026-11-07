import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RULE_TITLES } from '../src/site-writer/copy-check/rule-set.js'
import { WRITER_PROMPT_FILE, writerPrompt } from '../src/site-writer/writer-prompt.js'

// The owner approved this prompt on 2026-11-03 after reading real output on dev (#334), and ruled the plan label rule
// in on 2026-11-04 (a plan label is a suggestion the writer keeps or rewrites, a created page title is its on-page
// heading, a created privacy page is a complete policy), and on 2026-11-04 ruled that a text follows the demo's length
// part by part, between 80% and 100% of it, in the demo's lead and points shape, and that a slot whose demo draws
// words in the accent colour names its own as `emphasis`, and on 2026-11-07 that the emphasis marks the strongest
// words of the text, never a filler, wherever the demo put its own; its bytes change only with a new
// approval from the owner, recorded in ADR 0042.
const APPROVED_SHA256 = '79658a692fcf4a3b33d7e32a9f295b4af05e40bba7f5911924bef9d77902e32c'

test('the shipped writer prompt is the approved one, byte for byte', () => {
  const bytes = readFileSync(WRITER_PROMPT_FILE)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), APPROVED_SHA256)
  assert.equal(writerPrompt().sha256, APPROVED_SHA256)
})

test('the loader exposes the text and the sha256 of the bytes it read', () => {
  const p = writerPrompt()
  const bytes = readFileSync(WRITER_PROMPT_FILE)
  assert.equal(p.text, bytes.toString('utf8'))
  assert.match(p.sha256, /^[0-9a-f]{64}$/)
  assert.equal(p.sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.match(p.text, /# Site writer\n/)
})

test('the loader reads the file once and hands back the same frozen object', () => {
  assert.equal(writerPrompt(), writerPrompt())
  assert.ok(Object.isFrozen(writerPrompt()))
})

test('the prompt states the copy file contract and the writer turn', () => {
  const { text } = writerPrompt()
  for (const s of ['site-copy/1', '"slots"', '"alts"', '"seo"', '"notebook"', '"returns"', 'plan-label'])
    assert.ok(text.includes(s), `prompt mentions ${s}`)
  assert.match(text, /You never change the plan\./)
  assert.match(text, /carries the copy notebook so far/)
})

test('the prompt has an instruction for every copy check rule and its thresholds', () => {
  const { text } = writerPrompt()
  for (const [, id] of RULE_TITLES)
    assert.match(text, new RegExp(`^- ${id}: `, 'm'), `self-check names ${id}`)
  for (const s of [
    '125 characters',
    'at most 60',
    'at most 160',
    '80%',
    '100%',
    '40 characters',
    'demoChars',
    'five words'
  ])
    assert.ok(text.includes(s), `prompt mentions ${s}`)
  assert.match(text, /word for word/)
  assert.match(text, /this section shows/)
})

test("the prompt says where footer headings go, how pages entries work and that labels are not the writer's", () => {
  const { text } = writerPrompt()
  for (const s of ['"pages"', 'footerMenu', 'titleSlot', 'legal:privacy', 'notFound', 'planner label'])
    assert.ok(text.includes(s), `prompt mentions ${s}`)
  assert.match(text, /`text` on a label slot is a suggestion, not the final text/)
  assert.match(text, /Rewrite it when the demo `sample`/)
  assert.match(text, /`title` is the heading printed on that page/)
  assert.match(text, /A created privacy page\*\* is a complete policy for this kind of business/)
  assert.match(text, /body.*non-empty list/s)
})

test('the prompt holds no long dash', () => {
  // Built from code points so this file holds no long dash itself.
  const longDash = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
  assert.doesNotMatch(writerPrompt().text, longDash)
})

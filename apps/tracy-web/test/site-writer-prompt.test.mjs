import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { RULE_TITLES } from '../src/site-writer/copy-check/rule-set.js'
import { WRITER_PROMPT_FILE, writerPrompt } from '../src/site-writer/writer-prompt.js'

// The writer prompt is a draft (#332): no hash pin until the owner approves real output (#334).

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
  for (const s of ['125 characters', 'at most 60', 'at most 160', '60%', '40 characters', 'five words'])
    assert.ok(text.includes(s), `prompt mentions ${s}`)
  assert.match(text, /word for word/)
  assert.match(text, /this section shows/)
})

test('the prompt holds no long dash', () => {
  // Built from code points so this file holds no long dash itself.
  const longDash = new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
  assert.doesNotMatch(writerPrompt().text, longDash)
})

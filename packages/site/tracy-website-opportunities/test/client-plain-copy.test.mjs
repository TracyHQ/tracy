/**
 * The English string table speaks plain language (#521): no dash, no exclamation mark, no raw error
 * code or field key, none of Tracy's internal phrases and none of the four old step names as a label.
 * A new string that slips one of these in turns this test red.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { en } from '../src/client/strings.ts'

const entries = Object.entries(en)

/** The text a person reads, without its `{placeholders}`. */
const readable = (text) => text.replace(/\{\w+\}/g, '')

const BANNED = [
  /single[ -]source/i,
  /corroborated/i,
  /left off by rule/i,
  /hand(?:ed)? (?:it )?(?:over )?to the agent/i,
  /handing over/i,
  /that did not go through/i,
  /passed by review/i,
  /passed its checks/i,
  /\bQA\b/,
  /\brevision\b/i,
  /\bsnapshot\b/i,
  /\bslot\b/i,
  /\bkit\b/i,
  /\bplanner\b/i,
  /\bwriter\b/i
]
const OLD_STEP_NAMES = new Set(['Brief', 'Build', 'Fill', 'Check'])

test('the table is not empty', () => {
  assert.ok(entries.length > 500)
})

test('no user-facing string holds a dash', () => {
  const bad = entries.filter(([, text]) => /[—–]/.test(text)).map(([key]) => key)
  assert.deepEqual(bad, [])
})

test('no user-facing string holds an exclamation mark', () => {
  const bad = entries.filter(([, text]) => text.includes('!')).map(([key]) => key)
  assert.deepEqual(bad, [])
})

test('no string shows a raw error code or a snake_case field key', () => {
  const bad = entries
    .filter(
      ([, text]) =>
        /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/.test(readable(text)) || /\b[a-z]+(?:_[a-z]+)+\b/.test(readable(text))
    )
    .map(([key]) => key)
  assert.deepEqual(bad, [])
})

test('no string uses an internal phrase or jargon word', () => {
  const bad = entries
    .filter(([, text]) => BANNED.some((pattern) => pattern.test(text)))
    .map(([key, text]) => `${key}: ${text}`)
  assert.deepEqual(bad, [])
})

test('the old step names Brief, Build, Fill and Check are not step labels', () => {
  const bad = entries
    .filter(
      ([key, text]) =>
        /^(v3\.step\.|progress\.step\.|demo\.step\.)/.test(key) && OLD_STEP_NAMES.has(text.trim())
    )
    .map(([key]) => key)
  assert.deepEqual(bad, [])
})

test('the chain steps use the plain words of the progress card', () => {
  // test-quality: contract plain labels the owner approved (#522)
  assert.equal(en['progress.step.kit'], 'Template')
  // test-quality: contract plain labels the owner approved (#522)
  assert.equal(en['action.failed'], 'That did not work. Try again.')
  // test-quality: contract plain labels the owner approved (#522)
  assert.equal(en['cell.demo.qaPassed'], 'Checked')
})

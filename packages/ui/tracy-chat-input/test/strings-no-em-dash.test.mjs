/**
 * Brian (PO, 30/09/2026): no em-dash in any on-screen text. Every value in `strings.ts` is a string
 * the page shows, so none may carry one; the Vietnamese catalogue for this namespace neither.
 * Code comments are not on screen and are not checked here.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { en } from '../src/client/strings.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const vi = JSON.parse(
  readFileSync(
    path.resolve(here, '..', '..', '..', 'locale', 'tracy-locale-vi', 'vi', 'tracy-chat-input.json'),
    'utf8'
  )
)

const withDash = (/** @type {Record<string, unknown>} */ table) =>
  Object.entries(table)
    .filter(([, v]) => typeof v === 'string' && v.includes('—'))
    .map(([k]) => k)

test('no UI string in strings.ts carries an em-dash', () => {
  assert.ok(Object.keys(en).length > 0)
  assert.deepEqual(withDash(en), [])
})

test('no Vietnamese string of the namespace carries an em-dash', () => {
  assert.deepEqual(withDash(vi), [])
})

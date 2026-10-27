/**
 * Stage-6 acceptance e2e v4 (thread, V4-7, 30/09/2026); ages since the Comments list redesign A
 * (Akemi 01/10/2026, the approved mock): the row says "now · 2m · 3h · 1d" and the full date is its
 * tooltip (the thread card keeps its own longer words).
 * - Two people with one display name are told apart by the start of their e-mail ("Sam Tester
 *   (e2e3-thread-a)"); the tab row cut that very part ("Sam Tester (e2e3-thr…"). The display name is cut
 *   first and the part in brackets stays whole.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { en } from '../src/client/strings.ts'
import { authorParts, shortAge } from '../src/client/comment-view.mjs'

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)
const MIN = 60_000
const say = (/** @type {{ key: string, count?: number, date?: string }} */ r) =>
  en[/** @type {keyof typeof en} */ (r.key)]
    .replace('{count}', String(r.count ?? ''))
    .replace('{date}', r.date ?? '')

test('redesign A: the row’s ages are short, in the namespace’s words', () => {
  assert.equal(say(shortAge(NOW - 30_000, NOW)), 'now')
  assert.equal(say(shortAge(NOW - 2 * MIN, NOW)), '2m')
  assert.equal(say(shortAge(NOW - 3 * 60 * MIN, NOW)), '3h')
  assert.equal(say(shortAge(NOW - 30 * 60 * MIN, NOW)), '1d')
})

test('V4-7: a namesake’s e-mail part is its own piece, kept whole; the display name is what gets cut', () => {
  assert.deepEqual(authorParts('Sam Tester (e2e3-thread-a)'), { name: 'Sam Tester', tag: '(e2e3-thread-a)' })
  assert.deepEqual(authorParts('Lee'), { name: 'Lee', tag: '' })
  assert.deepEqual(authorParts('Ana (Marketing) Lopez'), { name: 'Ana (Marketing) Lopez', tag: '' })
  assert.deepEqual(authorParts(''), { name: '', tag: '' })
})

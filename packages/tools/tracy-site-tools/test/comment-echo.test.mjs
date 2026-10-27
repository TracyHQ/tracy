/**
 * `takeComment` — the number of the person's comment a call is for (comment-echo.mjs).
 *
 *   node --test packages/tools/tracy-site-tools/test/comment-echo.test.mjs
 *
 * F3 (round 7 follow-up, 30/09/2026). Measured, before: a chat run sent `comment:"1"` (a digit STRING) on
 * a create and was refused BAD_COMMENT — the whole write came back and cost one more model step, for a
 * number that was unambiguous. A string that is only digits is that number; anything else stays refused.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { takeComment } from '../src/host/comment-echo.mjs'

/** @param {unknown} comment */
const take = (comment) => takeComment({ action: 'content.get', params: { kind: 'page', id: 7 }, comment })

test('a digit string is the number it spells — taken off the call, echoed as a number', () => {
  for (const [sent, expected] of /** @type {const} */ ([
    ['1', 1],
    ['3', 3],
    [' 7 ', 7],
    ['07', 7],
    ['99', 99],
    // Past 99 is a number like any other (stage 6: one sequence per site, no cap).
    ['100', 100],
    ['4000', 4000]
  ])) {
    const got = /** @type {any} */ (take(sent))
    assert.equal(got.ok, true, JSON.stringify(sent))
    assert.equal(got.comment, expected, JSON.stringify(sent))
    assert.equal(Object.hasOwn(got.args, 'comment'), false, 'comment comes off the call')
    assert.deepEqual(got.args, { action: 'content.get', params: { kind: 'page', id: 7 } })
  }
})

test('a list may hold digit strings too: each is its number, and the list is still whole numbers, different, 1 or more', () => {
  const got = /** @type {any} */ (take(['1', 2, ' 3 ']))
  assert.equal(got.ok, true)
  assert.deepEqual(got.comment, [1, 2, 3])
  // One entry reads as that number, as it always did.
  assert.equal(/** @type {any} */ (take(['4'])).comment, 4)
  // Different is judged AFTER reading the strings: "1" and 1 are the same comment.
  const twice = /** @type {any} */ (take(['1', 1]))
  assert.equal(twice.ok, false)
  assert.equal(twice.answer.code, 'BAD_COMMENT')
})

test('anything that is not a whole number of 1 or more in digits stays refused BAD_COMMENT, with the same next', () => {
  for (const comment of [
    '0',
    '2147483648',
    '',
    ' ',
    '2.5',
    '-1',
    '+3',
    '1e1',
    '3rd',
    'one',
    '٣', // an Arabic-Indic digit is not an ASCII one
    '9'.repeat(400),
    0,
    2 ** 31,
    2.5,
    -1,
    true,
    {},
    [],
    ['1', 'x'],
    [1, '0'],
    Array.from({ length: 13 }, (_, i) => String(i + 1))
  ]) {
    const got = /** @type {any} */ (take(comment))
    assert.equal(got.ok, false, JSON.stringify(comment)?.slice(0, 40))
    assert.equal(got.answer.code, 'BAD_COMMENT')
    assert.match(got.answer.next, /\[1, 2\]/)
  }
})

test('unchanged: no comment, null and undefined mean none; a whole number passes as before', () => {
  assert.deepEqual(takeComment({ action: 'content.get' }), {
    ok: true,
    args: { action: 'content.get' },
    comment: null
  })
  assert.equal(/** @type {any} */ (take(null)).comment, null)
  assert.equal(/** @type {any} */ (take(undefined)).comment, null)
  assert.equal(/** @type {any} */ (take(12)).comment, 12)
  assert.deepEqual(/** @type {any} */ (take([1, 2])).comment, [1, 2])
  assert.equal(/** @type {any} */ (takeComment('not an object')).comment, null)
})

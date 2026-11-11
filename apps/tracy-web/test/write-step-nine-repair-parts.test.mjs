import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCommentTurn } from '../src/lib/comment-turn.js'
import { pageTurn } from '../src/write-step/repair-pass/repair-items.js'
import { turnParts } from '../src/write-step/repair-pass/repair-parts.js'

const item = (text, id) => ({
  text,
  url: 'https://example.test/',
  element: {
    url: 'https://example.test/',
    selector: `#target-${id}`,
    label: `Target${id}`,
    text: `Target${id}`,
    marks: [],
    tag: 'p',
    image: null
  },
  locate: { status: 'unchecked', levels: [] }
})
const build = (items) =>
  pageTurn(
    buildCommentTurn,
    items,
    items.map((_, i) => 999_999 - i)
  )

test('a later short comment can make a refused prefix fit the real builder budget', () => {
  const items = [item('a'.repeat(496), 1), item('b'.repeat(496), 2), item('Fix.', 3)]
  assert.throws(() => build(items.slice(0, 2)), { code: 'too-long' })
  const whole = build(items)
  assert.match(whole, /automated site build/)
  assert.match(whole, /CONFIRM_FIRST/)
  assert.deepEqual(turnParts(buildCommentTurn, items), { parts: [[0, 1, 2]], tooLong: [] })
  assert.equal(build(items), whole, 'packing leaves the original items and prompt unchanged')
})

test('an item refused alone is retained when a group containing it fits', () => {
  const grouped = ({ items }) => {
    if (items.length !== 2) throw Object.assign(new Error('needs both comments'), { code: 'too-long' })
    return 'Both original comments'
  }
  assert.deepEqual(turnParts(grouped, [item('First', 1), item('Second', 2)]), {
    parts: [[0, 1]],
    tooLong: []
  })
})

test('packing minimizes turns across feasible suffixes and keeps original order', () => {
  const allowed = new Set(['0', '1', '2', '3', '4', '0,1', '0,1,2', '2,3,4'])
  const builder = ({ items }) => {
    if (!allowed.has(items.map((one) => one.text).join(',')))
      throw Object.assign(new Error('over budget'), { code: 'too-long' })
    return 'Original comments'
  }
  assert.deepEqual(
    turnParts(
      builder,
      [0, 1, 2, 3, 4].map((n) => item(String(n), n))
    ),
    {
      parts: [
        [0, 1],
        [2, 3, 4]
      ],
      tooLong: []
    }
  )
})

test('only items without any usable covering turn are omitted', () => {
  const builder = ({ items }) => {
    if (items.some((one) => one.text === 'Unusable'))
      throw Object.assign(new Error('over budget'), { code: 'too-long' })
    return 'Original comments'
  }
  assert.deepEqual(turnParts(builder, [item('First', 1), item('Unusable', 2), item('Last', 3)]), {
    parts: [[0], [2]],
    tooLong: [1]
  })
  assert.deepEqual(turnParts(builder, []), { parts: [], tooLong: [] })
})

test('invalid comment errors still propagate from the real builder', () => {
  assert.throws(() => turnParts(buildCommentTurn, [{ text: 'Invalid', element: undefined }]), RangeError)
})

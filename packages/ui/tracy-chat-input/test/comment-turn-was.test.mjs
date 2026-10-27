/**
 * F16 (stage-5 acceptance, 29/09): a reply's block said `text: Established 2004` and its chip quoted
 * it, while the page already read "EST. ALPHA" — the words from pick time. The block's `text:` is the
 * `find` of `content.replace`, so it must be what the page shows NOW. When the Browser tab can say
 * both, it sends `element.text` = the words now and `element.was` = the words when picked; the block
 * then prints `was:` right after `text:`, and the hint says what that line is. Without `was` (every
 * sender today: the page runtime reports no words after the pick, only a box) nothing changes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCommentTurn, chipLabel, parseCommentTurn } from '../src/client/comment-turn.mjs'

const ELEMENT = {
  url: 'http://capiwl1643.tracy.test:8080/',
  selector: 'p',
  label: '',
  text: 'EST. ALPHA',
  was: 'Established 2004'
}
const REPLY = {
  n: 46,
  text: 'I still want EST. ALPHA, keep it',
  element: ELEMENT,
  locate: null,
  replyTo: 43,
  thread: [{ author: 'capi-e2e-owner', at: 0, text: 'Change this label to: EST. ALPHA', status: 'done' }]
}
const WAS_CLAUSE = 'The was line is what it said when picked; its text line is what the page shows now.'

test('F16: a reply sent with the words now and the words then prints both, now first', () => {
  const turn = buildCommentTurn({ items: [REPLY], now: 60_000 })
  const lines = turn.split('\n')
  const at = lines.indexOf('text: EST. ALPHA')
  assert.ok(at > 0, turn)
  assert.equal(lines[at + 1], 'was: Established 2004')
  assert.ok(lines.at(-1)?.includes(WAS_CLAUSE))
  // The chip quotes the page as it reads now.
  const parsed = parseCommentTurn(turn)
  assert.equal(parsed?.items[0].element?.text, 'EST. ALPHA')
  assert.equal(chipLabel(/** @type {any} */ (parsed?.items[0].element), { many: true }), '"EST. ALPHA"')
})

test('F16: a one-comment turn prints it too; the same words, or none, print no was line and no clause', () => {
  const one = buildCommentTurn({ text: 'Make it bold', element: ELEMENT, locate: null })
  assert.match(one, /\ntext: EST\. ALPHA\nwas: Established 2004\n/)
  assert.ok(one.endsWith(WAS_CLAUSE) || one.includes(` ${WAS_CLAUSE} `))
  for (const was of [undefined, '', 'EST. ALPHA', '  EST.   ALPHA ']) {
    const same = buildCommentTurn({ text: 'Make it bold', element: { ...ELEMENT, was }, locate: null })
    assert.doesNotMatch(same, /\nwas: /)
    assert.ok(!same.includes(WAS_CLAUSE))
    assert.equal(
      same,
      buildCommentTurn({ text: 'Make it bold', element: { ...ELEMENT, was: undefined }, locate: null })
    )
  }
})

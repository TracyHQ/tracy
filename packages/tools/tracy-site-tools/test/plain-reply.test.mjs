/**
 * V4S-3 and V4S-8 (acceptance v4, 30/09, `tasks/evidence/comment-people/e2e-v4/send.md`).
 *
 *   node --test packages/tools/tracy-site-tools/test/plain-reply.test.mjs
 *
 * V4S-3: a change typed in a new conversation was answered "Undo any time: `apply.revert { apply_id:
 * "replace-munhcp0n-aaff70" }`" — the plain-words rule rode only page-sent turns, and the replace
 * receipt's `next` asked for "how to undo it". V4S-8: a thread turn with one block `n="38"` was told
 * it "lists 1 numbered request" with the example `comment: [1, 2]`, and Tracy passed `comment: 1`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EMDASH_RECEIPT_NEXT } from '../src/host/emdash.mjs'
import {
  COMMENT_LOOK_SCOPE,
  COMMENT_WRITES_ONLY,
  commentItemsRule,
  commentNumbers,
  PLAIN_REPLY,
  PLAIN_REPLY_PLUGIN,
  plainReplyRule
} from '../src/host/prompter.mjs'
import { REPLACE_NEXT } from '../src/host/replace.mjs'
import { WRITE_RECEIPT_NEXT } from '../src/host/site-call.mjs'

/** One comment block as `comment-turn.mjs` writes it (head only matters here). */
const block = (head, words = 'Earthworks, internal roads') =>
  [
    '```tracy-element',
    `<mentioned-element ${head} url="http://s.test/" lang="en">`,
    `text: ${words}`,
    '</mentioned-element>',
    '```'
  ].join('\n')

test('V4S-3: a typed turn gets the plain-words rule; a comment turn keeps it inside its own rule', () => {
  const rule = plainReplyRule(
    'On the home page, change the heading "Maintenance and upgrades" to "Maintenance and retrofit".'
  )
  assert.ok(rule !== null)
  assert.equal(rule.text, PLAIN_REPLY)
  assert.match(rule.text, /never a selector, id, mark, tool or action name, error code or receipt id/)
  assert.match(rule.text, /not `apply\.revert`/)
  assert.match(rule.text, /undone by asking you/)
  // A typed turn never earns a look undo id (`lookFiles` copies a look write only in a comment turn),
  // so the typed turn's rule names no `look.revert`: told "a look change ends with its Undo: look.revert
  // <id>", agents hunted for an id that does not exist (bench flow D 05/10/2026: a grep through the site
  // folder and a `look.revert {}` call, on two Joomla look cases).
  assert.doesNotMatch(rule.text, /look\.revert/)
  // The comment turn no longer ends a look change with `Undo: look.revert <id>` (Rule 7 / S10, 29/09):
  // customers saw that line as it was, eight replies in the beta week 16–23/10/2026; the id stays the agent's.
  assert.doesNotMatch(COMMENT_WRITES_ONLY, /look\.revert/)
  assert.doesNotMatch(COMMENT_LOOK_SCOPE, /Undo: look\.revert/)
  assert.equal(PLAIN_REPLY_PLUGIN, 'tracy-site-tools:plain-reply')
  // A comment turn is told by its comment rule — said once, not twice.
  assert.equal(plainReplyRule(`change this\n${block('n="81" status="resolved"')}`), null)
  assert.equal(plainReplyRule(''), null)
  assert.equal(plainReplyRule(undefined), null)
})

test('V4S-3: no receipt next asks the agent to tell the customer how to undo, or names the call', () => {
  const nexts = [
    WRITE_RECEIPT_NEXT,
    EMDASH_RECEIPT_NEXT,
    REPLACE_NEXT.receipt,
    REPLACE_NEXT.receiptAlsoIn,
    REPLACE_NEXT.receiptStillHolds
  ]
  for (const next of nexts) {
    assert.doesNotMatch(next, /how to undo/i, next)
    assert.doesNotMatch(next, /tell (?:the customer|them)[^.;]*apply\.revert/i, next)
    assert.match(next, /plain words/, next)
    assert.ok(next.length <= 200, `T10: ${next.length} chars`)
  }
})

test('V4S-8: the numbers of each block are read — n, then also-n', () => {
  const text = [
    'agreed',
    block('n="38" reply-to="36" status="resolved"'),
    block('n="40" also-n="41" status="resolved"'),
    '```tracy-page\n<page n="7" url="http://s.test/about" path="/about">\n</page>\n```'
  ].join('\n')
  assert.deepEqual(commentNumbers(text), [[38], [40, 41], [7]])
  assert.deepEqual(commentNumbers('no blocks'), [])
})

test('V4S-8: a one-block thread turn names its own number, never an example 1', () => {
  const text = [
    'E4S-S02 A: agreed, change this heading',
    block('n="38" status="resolved" author="e2e3-send-a"').replace(
      'text:',
      'thread: e2e3-send-a (now): agreed\ntext:'
    )
  ].join('\n')
  const rule = commentItemsRule(text)
  assert.ok(rule !== null)
  assert.ok(rule.text.includes('`comment: 38`'), rule.text)
  assert.ok(!rule.text.includes('`comment: [1, 2]`'), 'the example numbers are gone')
  assert.match(rule.text, /not a count or a place in the message/)
})

test('V4S-8: grouped blocks pass all their numbers; the multi-write example uses real ones', () => {
  const text = ['two headings', block('n="40" also-n="41"'), block('n="42" also-n="43"')].join('\n')
  const rule = commentItemsRule(text)
  assert.ok(rule !== null)
  assert.ok(rule.text.includes('`comment: [40, 41]`, `comment: [42, 43]`'), rule.text)
  assert.ok(rule.text.includes('carries `comment: [40, 41]`.'), rule.text)
})

test('V4S-8: a lone comment names its number too', () => {
  const rule = commentItemsRule(`make it bigger\n${block('n="81" status="resolved"')}`)
  assert.ok(rule !== null)
  assert.match(
    rule.text,
    /^The person's message carries one request from the page\. Every call for it carries `comment: 81`/
  )
})

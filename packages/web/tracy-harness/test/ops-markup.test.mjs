/**
 * The tag syntax `<Trans>` reads in a dictionary value: `<b>…</b>`, `<a>…</a>`, `<br/>`, nested,
 * with `{placeholders}` filled in text only (a value can never smuggle in a tag). Malformed markup
 * reads as plain text, never a crash.
 *
 *   node --test packages/web/tracy-harness/test/ops-markup.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseMarkup } from '../src/i18n/markup.ts'

test('tags become elements, text between them stays text, placeholders are filled', () => {
  assert.deepEqual(parseMarkup('Read <a>the guide</a> for {name}.', { name: 'Ana' }), [
    'Read ',
    { tag: 'a', children: ['the guide'] },
    ' for Ana.'
  ])
})

test('tags nest, and a self-closing tag has no children', () => {
  assert.deepEqual(parseMarkup('<b>Bold <a>link</a></b><br/>end'), [
    { tag: 'b', children: ['Bold ', { tag: 'a', children: ['link'] }] },
    { tag: 'br', children: [] },
    'end'
  ])
})

test('a value holding a tag is text, not markup', () => {
  assert.deepEqual(parseMarkup('Hi <b>{name}</b>', { name: '<a>x</a>' }), [
    'Hi ',
    { tag: 'b', children: ['<a>x</a>'] }
  ])
})

test('unbalanced or crossed tags read as the plain text', () => {
  assert.deepEqual(parseMarkup('a <b>bold'), ['a <b>bold'])
  assert.deepEqual(parseMarkup('<b>x<a>y</b></a>'), ['<b>x<a>y</b></a>'])
  assert.deepEqual(parseMarkup('a < b and c > d'), ['a < b and c > d'])
})

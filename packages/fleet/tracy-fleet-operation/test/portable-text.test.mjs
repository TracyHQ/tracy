#!/usr/bin/env node
/**
 * Portable Text ⇄ Markdown for the emdash adapter.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/portable-text.test.mjs
 *
 * The tests are weighted towards what must NOT happen. Rendering a paragraph is easy and visible;
 * dropping a link target is easy and invisible, and it is invisible in the direction that reaches
 * the public site. So most of what is pinned here is refusal: constructs kept verbatim rather than
 * approximated, and edits that fail the round-trip rather than applying half of themselves.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromMarkdown, roundTrips, toMarkdown } from '../scripts/tools/emdash/portableText.mjs'

/** A block as emdash actually stores one — shape measured on `tchemdash1`, 02/09. */
const para = (text, key = 'k0') => ({
  _type: 'block',
  style: 'normal',
  _key: key,
  children: [{ _type: 'span', text, _key: `${key}s` }]
})

test('the shape emdash really stores renders as plain Markdown', () => {
  const blocks = [
    { _type: 'block', style: 'h2', _key: 'k0', children: [{ _type: 'span', text: 'Heading', _key: 'k1' }] },
    para('Body text.', 'k2')
  ]
  assert.equal(toMarkdown(blocks), '## Heading\n\nBody text.')
})

test('every heading level, quotes and both list markers survive a round trip', () => {
  const source = [
    '# One',
    '',
    '###### Six',
    '',
    '> Quoted.',
    '',
    '- bullet',
    '',
    '  - nested bullet',
    '',
    '1. numbered',
    '',
    'A plain paragraph.'
  ].join('\n')
  assert.ok(roundTrips(source), toMarkdown(fromMarkdown(source)))
})

test('marks and links survive both directions', () => {
  const source = 'Plain **bold** and _italic_ and `code` and ~~gone~~ and [a link](https://example.com/x).'
  assert.ok(roundTrips(source), toMarkdown(fromMarkdown(source)))
  const blocks = fromMarkdown(source)
  const link = blocks[0].markDefs?.[0]
  assert.equal(link?._type, 'link')
  assert.equal(link?.href, 'https://example.com/x', 'the target is the whole point of a link')
  assert.ok(blocks[0].children.some((c) => c.marks?.includes(link._key)))
})

test('a block type Markdown cannot express is kept verbatim, never dropped', () => {
  // An embedded image is the realistic case: it has no Markdown spelling that carries its asset
  // reference, and approximating it would delete the picture from the post.
  const image = { _type: 'image', _key: 'img1', asset: { _ref: 'image-abc' }, alt: 'A photo' }
  const rendered = toMarkdown([para('Before.'), image, para('After.', 'k9')])
  assert.match(rendered, /```portable-text/)
  assert.match(rendered, /image-abc/, 'the asset reference must still be in the file')

  const back = fromMarkdown(rendered)
  assert.deepEqual(back[1], image, 'a verbatim block must come back byte-identical')
})

test('a mark with no Markdown spelling makes the whole block verbatim', () => {
  // `underline` has no Markdown syntax. Rendering it as plain text would apply cleanly and quietly
  // strip the formatting; rendering it as `_x_` would change it to italic. Both are wrong.
  const block = {
    _type: 'block',
    style: 'normal',
    _key: 'k0',
    children: [{ _type: 'span', text: 'underlined', _key: 'k1', marks: ['underline'] }]
  }
  assert.match(toMarkdown([block]), /```portable-text/)
  assert.deepEqual(fromMarkdown(toMarkdown([block]))[0], block)
})

test('an annotation that is not a link keeps its target instead of becoming bare text', () => {
  const block = {
    _type: 'block',
    style: 'normal',
    _key: 'k0',
    markDefs: [{ _type: 'footnote', _key: 'f1', note: 'see page 12' }],
    children: [{ _type: 'span', text: 'claim', _key: 'k1', marks: ['f1'] }]
  }
  assert.match(toMarkdown([block]), /see page 12/)
  assert.deepEqual(fromMarkdown(toMarkdown([block]))[0], block)
})

test('a property we have never seen makes the block verbatim — failing closed', () => {
  // The property might be the one that matters. Assuming it does not is how a quiet loss starts.
  const block = { ...para('Text.'), somethingNew: { alignment: 'center' } }
  assert.match(toMarkdown([block]), /```portable-text/)
  assert.deepEqual(fromMarkdown(toMarkdown([block]))[0], block)
})

test('Markdown syntax inside a post is escaped, so it comes back as the text it was', () => {
  const blocks = [para('Cost: 5 * 3, a_b, and `tick`, and [brackets].')]
  const md = toMarkdown(blocks)
  assert.deepEqual(fromMarkdown(md)[0].children[0].text, 'Cost: 5 * 3, a_b, and `tick`, and [brackets].')
})

test('a paragraph that starts like a heading stays a paragraph', () => {
  const blocks = [para('# not a heading, just a hash')]
  const md = toMarkdown(blocks)
  const back = fromMarkdown(md)[0]
  assert.equal(back.style, 'normal')
  assert.equal(back.children[0].text, '# not a heading, just a hash')
})

test('keys are carried over from the stored version, not reminted', () => {
  // Reminting every key on every apply produces a diff the size of the document for a one-word
  // edit, and emdash uses those keys for revisions.
  const stored = [
    {
      _type: 'block',
      style: 'normal',
      _key: 'original',
      children: [{ _type: 'span', text: 'one', _key: 'sp' }]
    }
  ]
  const edited = fromMarkdown('one word', stored)
  assert.equal(edited[0]._key, 'original')
  assert.equal(edited[0].children[0]._key, 'sp')
})

test('a block the author added gets a key of its own, without colliding', () => {
  const stored = [para('kept', 'original')]
  const blocks = fromMarkdown('kept\n\nbrand new paragraph', stored)
  assert.equal(blocks[0]._key, 'original')
  assert.ok(blocks[1]._key)
  assert.notEqual(blocks[1]._key, blocks[0]._key)
})

test('a hand-broken verbatim block fails the round trip instead of applying', () => {
  // This is the guard the writer leans on: whatever this file gets wrong costs a refusal, not an
  // edit to a live site.
  const broken = '```portable-text\n{ this is not json\n```'
  assert.equal(roundTrips(broken), false)
})

test('an empty body is empty, not a block containing nothing', () => {
  assert.equal(toMarkdown([]), '')
  assert.deepEqual(fromMarkdown(''), [])
})

test('content that is not an array at all renders as empty rather than throwing', () => {
  // The column is `json` and nothing enforces its shape; a null or an object must not crash a Sync.
  for (const value of [null, undefined, {}, 'text', 42]) assert.equal(toMarkdown(value), '')
})

test('layout is not content: extra blank lines and trailing spaces do not fail the check', () => {
  // Measured 02/09: appending a paragraph to a file that already ended in a newline left two blank
  // lines, and a byte-exact check refused a perfectly good edit. A guard that cries wolf on
  // ordinary typing is one people learn to route around.
  assert.ok(roundTrips('One paragraph.\n\n\n\nTwo paragraphs.   \n'))
})

test('but the text itself gets no latitude at all', () => {
  // The mirror of the test above. If this ever passes, the guard has stopped guarding.
  const stored = [para('Hello.')]
  assert.equal(roundTrips('Hello.', stored), true)
  assert.equal(roundTrips('```portable-text\n{ "unclosed": \n```', stored), false)
})

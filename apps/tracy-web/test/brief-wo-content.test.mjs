/**
 * The pure half of writing a restaurant's own posts into its demo site: which pages get which items, the body in each
 * CMS's own shape (escaped), and which demo records are written and which hidden.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  bodyHtml,
  excerptOf,
  pagesToWrite,
  portableText,
  splitTargets,
  wpBlocks
} from '../src/sites/brief-engines/wo-content.js'

const ITEMS = [
  {
    id: 'a',
    title: 'Eggs Benedict',
    body: 'Poached eggs & ham.\nOn a muffin.\n\nAll day <b>long</b>.',
    kinds: ['dish']
  },
  { id: 'b', title: 'Magic Blend', body: 'Our coffee.', kinds: ['product'] },
  { id: 'c', title: 'Jazz night', body: 'Every Thursday.', kinds: ['event'] }
]
const PLAN = {
  pages: [
    { id: 'blog', role: 'blog', keep: true, fill: 'sourced', items: ['a', 'b'] },
    { id: 'events', role: 'events', keep: true, fill: 'sourced', items: ['c'] },
    { id: 'menu', role: 'menu', keep: true, fill: 'link', items: ['a'] },
    { id: 'offers', role: 'offers', keep: true, fill: 'none', items: [] },
    { id: 'news', role: 'blog', keep: false, why: 'variant' }
  ]
}

test('only kept pages of the asked roles that the plan filled from posts are written, with their items in order', () => {
  assert.deepEqual(
    pagesToWrite({ items: ITEMS, pagePlan: PLAN }, ['blog', 'events', 'offers']).map((p) => [
      p.pageId,
      p.items.map((i) => i.id)
    ]),
    [
      ['blog', ['a', 'b']],
      ['events', ['c']]
    ]
  )
  assert.deepEqual(
    pagesToWrite({ items: ITEMS, pagePlan: PLAN }, ['blog']).map((p) => p.pageId),
    ['blog']
  )
  assert.deepEqual(pagesToWrite(null, ['blog']), [])
})

test('a body keeps its paragraphs and line breaks and escapes what a post typed', () => {
  assert.equal(
    bodyHtml(ITEMS[0].body),
    '<p>Poached eggs &amp; ham.<br>On a muffin.</p>\n<p>All day &lt;b&gt;long&lt;/b&gt;.</p>'
  )
  assert.equal(
    wpBlocks(ITEMS[0].body),
    '<!-- wp:paragraph -->\n<p>Poached eggs &amp; ham.<br>On a muffin.</p>\n<!-- /wp:paragraph -->\n\n<!-- wp:paragraph -->\n<p>All day &lt;b&gt;long&lt;/b&gt;.</p>\n<!-- /wp:paragraph -->'
  )
  const blocks = portableText(ITEMS[0].body)
  assert.equal(blocks.length, 2)
  assert.deepEqual(
    blocks[0].children.map((c) => c.text),
    ['Poached eggs & ham.\nOn a muffin.']
  )
  assert.equal(blocks[0]._type, 'block')
  assert.notEqual(blocks[0]._key, blocks[1]._key)
})

test('an excerpt is the first sentences up to the limit, cut at a word', () => {
  assert.equal(excerptOf('Short one. Second sentence here.', 20), 'Short one.')
  assert.equal(excerptOf('A very long sentence without any stop in it at all', 20), 'A very long sentence')
})

test('the first demo records as the page shows them are written, one per item; the rest of that page are hidden', () => {
  assert.deepEqual(splitTargets(['x', 'y', 'z'], 2), { write: ['x', 'y'], hide: ['z'] })
  assert.deepEqual(splitTargets(['x'], 3), { write: ['x'], hide: [] })
  assert.deepEqual(splitTargets(['x', 'y'], 0), { write: [], hide: [] })
})

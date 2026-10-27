/**
 * The host's DOM half of the seeder: the same numbering and own-text rule as the client's
 * `applyFill`, plus links and fragment slot maps.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyFill, fragmentSlots, stripBlocks } from '../src/host/seed-dom.mjs'

const DOC =
  '<!doctype html><html><body><nav><a href="#">Old</a><a href="#">Two</a></nav>' +
  '<h1>Head <em>em</em></h1><p>lead</p><p>second <code>code</code> tail</p><a class="btn" href="#">Go</a></body></html>'

test('applyFill: own text replaced, children kept for chrome roles, whole text for prose roles', () => {
  const out = applyFill(DOC, [
    { id: 'a.0', text: 'Design', role: 'nav' },
    { id: 'h1.0', text: 'New head', role: 'headline' },
    { id: 'p.1', text: 'New second', role: 'paragraph' }
  ])
  assert.match(out, /<a href="#">Design<\/a><a href="#">Two<\/a>/)
  assert.match(out, /<h1>New head<\/h1>/)
  assert.match(out, /<p>New second<\/p>/)
  assert.match(out, /^<!doctype html><html>/)
})

test('applyFill: an href lands on the link, with or without a text', () => {
  const out = applyFill(DOC, [
    { id: 'a.0', text: 'Design', href: '/design/' },
    { id: 'a.2', href: '/pricing/' }
  ])
  assert.match(out, /<a href="\/design\/">Design<\/a>/)
  assert.match(out, /<a class="btn" href="\/pricing\/">Go<\/a>/)
})

test('applyFill on a fragment: parsed in its own body, handed back as inner HTML', () => {
  const out = applyFill('<section><p>a</p><p>b</p></section>', [{ id: 'p.1', text: 'B', role: 'paragraph' }])
  assert.equal(out, '<section><p>a</p><p>B</p></section>')
})

test('fragmentSlots numbers a fragment the way applyFill finds it', () => {
  const frag =
    '<section><p class="tracy-eyebrow">Eyebrow</p><h2>Title here</h2><p>Body of the section, a sentence long enough.</p></section>'
  const slots = fragmentSlots(frag)
  assert.deepEqual(
    slots.map((s) => s.id),
    ['p.0', 'h2.0', 'p.1']
  )
  const out = applyFill(frag, [{ id: slots[1].id, text: 'New title', role: slots[1].role }])
  assert.match(out, /<h2>New title<\/h2>/)
})

test('stripBlocks removes WordPress block comments and nothing else', () => {
  const s =
    '<!-- wp:group {"className":"x"} -->\n<div class="x"><!-- wp:paragraph -->\n<p>Hi <!-- a plain comment --></p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->'
  assert.equal(stripBlocks(s), '<div class="x"><p>Hi <!-- a plain comment --></p>\n</div>\n')
})

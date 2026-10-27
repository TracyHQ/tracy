#!/usr/bin/env node
/**
 * A mentioned element or page said in words — `src/mention/index.mjs`.
 *
 *   node --test packages/core/tracy-core/test/mention.test.mjs
 *
 * One rule for every reader of a request: the chip's words for a `tracy-element` block, the page's
 * path for a `tracy-page` block, `[element]` / `[page]` when nothing names it — wherever the block
 * sits (its own lines, mid-line, squeezed onto one line, cut off).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decodeEntities, replaceMentions, UNNAMED_ELEMENT, UNNAMED_PAGE } from '../src/mention/index.mjs'

const label = (text) => replaceMentions(text, (words) => words)
const element = (attrs, body = '') =>
  `\`\`\`tracy-element\n<mentioned-element url="http://site.test/" selector="#a &gt; div" status="resolved" ${attrs}>\n${body}</mentioned-element>\n\`\`\``

test('an element block: the chip’s words, wherever it sits', () => {
  // On its own lines, with Tracy's hint line after it.
  assert.equal(
    label(
      `Make it red\n\n${element('incomplete="true"', 'text: Buy now\n')}\nUse \`tracy_site\` to find it.`
    ),
    'Make it red\n\n"Buy now"'
  )
  // Mid-line, then more words of the person's.
  assert.equal(
    label(`Swap ${element('name="Menu item &quot;Services&quot;"')} for Pricing`),
    'Swap Menu item "Services" for Pricing'
  )
  // Squeezed onto one line by a stored title, hint included.
  assert.equal(
    label(
      'thay ảnh ```tracy-element <mentioned-element url="u" selector="#a &gt; b" status="resolved" name="page &quot;Home&quot;" label="hero.jpg"> </mentioned-element> ``` Use `tracy_site` now.'
    ),
    'thay ảnh hero.jpg'
  )
})

test('nothing names it, or the block was cut off: [element]', () => {
  assert.equal(label(`Fix ${element('')}`), `Fix ${UNNAMED_ELEMENT}`)
  assert.equal(
    label(
      'thay ảnh này bằng … ```tracy-element <mentioned-element url="http://site.test/" selector="#wp &gt; div:n…'
    ),
    `thay ảnh này bằng … ${UNNAMED_ELEMENT}`
  )
})

test('a page block: the path its chip shows, else [page]', () => {
  assert.equal(
    label(
      'Tidy this page\n\n```tracy-page\n<page n="1" url="http://site.test/about" path="/about">\n</page>\n```'
    ),
    'Tidy this page\n\n/about'
  )
  assert.equal(label('Tidy ```tracy-page <page n="2" url="" path=""> </page> ```'), `Tidy ${UNNAMED_PAGE}`)
})

test('removing instead of naming; text without a block is returned as it is', () => {
  assert.equal(
    replaceMentions(`Swap ${element('name="X"')} for Pricing`, () => ''),
    'Swap  for Pricing'
  )
  const code = 'Put this in the footer:\n```html\n<p>Hi</p>\n```'
  assert.equal(label(code), code)
})

test('entities: &gt; &quot; &amp; &#39; &#x27; decoded, unknown ones kept', () => {
  assert.equal(
    decodeEntities('a &gt; b &quot;c&quot; &amp; d&#39;s &#x27;e&#x27; &bogus;'),
    "a > b \"c\" & d's 'e' &bogus;"
  )
})

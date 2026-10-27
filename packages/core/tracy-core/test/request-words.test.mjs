#!/usr/bin/env node
/**
 * A recorded request read by a person — `readableRequest` in `src/site-tabs/activity-v2.ts`.
 *
 *   node --test packages/core/tracy-core/test/request-words.test.mjs
 *
 * Quiet failure guarded here: a request that mentioned an element in the chat carries the element's
 * fenced `tracy-element` block, and a stored request squeezed to one line kept it — the backup notes
 * then read "```tracy-element <mentioned-element url=… selector="#a &gt; div"…" (03/10).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readableRequest } from '../src/site-tabs/activity-v2.ts'

const head = (attrs) =>
  `<mentioned-element url="http://site.test/" selector="#wp--skip-link--target &gt; div:nth-child(2) &gt; img" status="resolved" ${attrs}>`

test('a one-line block becomes the chip’s words: the element’s own text, quoted', () => {
  const text = `thay ảnh này bằng ảnh khác \`\`\`tracy-element ${head('incomplete="true" kind="image" name="page &quot;Home&quot;"')} text: Baked fresh   since 1998 </mentioned-element> \`\`\` Use \`tracy_site\` to find it.`
  assert.equal(readableRequest(text), 'thay ảnh này bằng ảnh khác "Baked fresh since 1998"')
})

test('the Browser tab’s own label names an element whose record is only its page', () => {
  const text = `Replace this ${'```'}tracy-element\n${head('name="page &quot;Home&quot;" label="northgate-logo.svg"')}\n</mentioned-element>\n${'```'}\nplease`
  assert.equal(readableRequest(text), 'Replace this northgate-logo.svg\nplease')
})

test('a sure record names the element by its record name', () => {
  const text = `Rename ${'```'}tracy-element ${head('name="Menu item &quot;Services&quot;"')} text: Services </mentioned-element> ${'```'}`
  assert.equal(readableRequest(text), 'Rename Menu item "Services"')
})

test('nothing to name it by, or a block cut off mid-way: [element]; entities decoded, spaces collapsed', () => {
  assert.equal(
    readableRequest(`Fix   this &amp; that ${'```'}tracy-element ${head('')} </mentioned-element> ${'```'}`),
    'Fix this & that [element]'
  )
  assert.equal(
    readableRequest(
      'thay ảnh này bằng … ```tracy-element <mentioned-element url="http://site.test/" selector="#wp--skip-link--target &gt; div:n…'
    ),
    'thay ảnh này bằng … [element]'
  )
})

test('two mentions in one request, each by its own words; a request without one is left as it was', () => {
  const one = `${'```'}tracy-element ${head('')} text: Hero </mentioned-element> ${'```'}`
  const two = `${'```'}tracy-element ${head('')} text: Footer </mentioned-element> ${'```'}`
  assert.equal(readableRequest(`Swap ${one} and ${two}`), 'Swap "Hero" and "Footer"')
  assert.equal(readableRequest('Make the heading red'), 'Make the heading red')
})

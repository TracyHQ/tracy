// The library block of the draft write (ticket #597): its rendered HTML is the only way its order fields reach the
// site, so the plan holds that HTML to the order (every shown field present), to safe markup, and to the held texts.
// Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-library.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { codeOf, guarded, plan, site } from './fixtures/draft-write/guarded.mjs'

const libraryOp = (p) => p.ops.find((op) => op.kind === 'library.create')
const libraryBlock = (order) => order.pages.flatMap((p) => p.blocks).find((b) => b.source === 'library')

test('the library operation names every shown field of its block and items, as the HTML shows it', () => {
  const op = libraryOp(plan)
  const entries = op.expects.map((x) => x.entry)
  const block = libraryBlock(site.order)
  for (const e of block.fields) assert.ok(entries.includes(e.place), e.place)
  for (const item of block.items) for (const e of item.fields) assert.ok(entries.includes(e.place), e.place)
  assert.ok(
    op.expects.some((x) => x.shown === 'Pellam O.'),
    'the author as the block names them'
  )
  assert.ok(
    op.expects.some((x) => x.shown.includes('&amp;')),
    'the listing address escaped'
  )
  assert.equal(
    guarded(() => {}),
    'passed'
  )
})

test('guard library_html_stale: an order field the library HTML does not show', () => {
  const order = structuredClone(site.order)
  libraryBlock(order).fields.find((e) => e.field === 'heading').value = 'Kind words'
  assert.equal(
    codeOf(() => writePlanOf(order, site.aiq, { stored: site.stored })),
    'library_html_stale'
  )
  // A data value of the order cannot change without the order check refusing it, so the HTML is changed instead.
  assert.equal(
    guarded((p) => {
      libraryOp(p).html = libraryOp(p).html.replace('Pellam O.', 'Pellam Q.')
    }),
    'library_html_stale'
  )
  assert.equal(
    guarded((p) => {
      libraryOp(p).html = ''
    }),
    'library_html_stale'
  )
})

test('guard library_html_unsafe: markup that runs code never reaches the site', () => {
  for (const bad of ['<script>x()</script>', '<a href="javascript:x()">a</a>', '<p onclick="x()">a</p>'])
    assert.equal(
      guarded((p) => {
        libraryOp(p).html += bad
      }),
      'library_html_unsafe',
      bad
    )
})

test('guard held_text_in_value: a held name inside the library HTML', () => {
  const withheld = { names: ['Marigold Thorne'] }
  assert.equal(
    guarded(
      (p) => {
        libraryOp(p).html = libraryOp(p).html.replace('</section>', '<p>Marigold Thorne</p></section>')
      },
      { withheld }
    ),
    'held_text_in_value'
  )
})

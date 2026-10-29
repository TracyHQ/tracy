// Repeated frames whose texts were all emptied are found by structure and hidden by the head block (spec TracyHQ/tracy#189).
// Two invented trades: a bakery's opening-hours rows and a dental clinic's treatment cards.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leftoverHeadBlock } from '../../../packages/wo/website-opportunities/domain/outside-map.mjs'
import { emptyFrameSelectors, emptyFrames } from '../src/sites/brief-engines/empty-frames.js'

const bakery = `<html><body><div id="hours"><ul class="rows">
<li class="row"><i class="fa fa-clock"></i><span>Mon to Fri 7 to 3</span></li>
<li class="row"><i class="fa fa-clock"></i><span></span></li>
<li class="row"><i class="fa fa-clock"></i><span> </span></li>
</ul></div></body></html>`

const clinic = `<html><body><section id="care"><div class="grid">
<div class="card"><div class="box"><svg></svg></div></div>
<div class="card"><div class="box"><svg></svg></div></div>
</div><ol class="carousel-indicators"><li class="dot"><b></b></li><li class="dot"><b></b></li></ol></section></body></html>`

test('bakery: the emptied rows are found, the filled one is not', () => {
  const found = emptyFrameSelectors(bakery)
  assert.equal(found.length, 2)
  assert.ok(found.every((s) => s.startsWith('#hours > ul.rows')))
  assert.ok(found.some((s) => s.endsWith('li.row:nth-child(2)')))
  assert.ok(!found.some((s) => s.endsWith(':nth-child(1)')))
})

test('clinic: cards that are all empty are found; carousel dots are left alone', () => {
  const found = emptyFrameSelectors(clinic)
  assert.equal(found.length, 2)
  assert.ok(found.every((s) => s.includes('div.card')))
})

test('a list with one item, and a page with no repeated frame, give nothing', () => {
  assert.deepEqual(emptyFrameSelectors('<body><ul><li><i></i></li></ul></body>'), [])
  assert.deepEqual(emptyFrameSelectors(''), [])
})

test('the head block hides the frames once, across pages', () => {
  const frames = emptyFrames([bakery, bakery, clinic])
  const block = leftoverHeadBlock({ frames })
  assert.match(block, /display:none !important/)
  assert.equal(block.split('li.row:nth-child(2)').length, 2)
})

// Spec TracyHQ/tracy#189, item 26 (COO rule of 30/10/2026): a part the build takes off for lack of brief content leaves
// no hole. The records door takes a picture off with the `hidden` attribute and empties the words beside it, so the
// wrapper around them (with its margins and the line height of an emptied text) still printed as a blank band between
// a paragraph and its button. A taken-off element is no content: its wrapper goes with it.
// Two invented trades on two invented template shapes: a florist intro with a customer-faces row, a yoga studio intro
// with a badge picture and a list of class cards. All names and files are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyFrameSelectors } from '../src/sites/brief-engines/empty-frames.js'

const picture = (c) => `/images/tracy-content/${c.repeat(64)}.png`

/** A florist intro: the faces row was taken off (picture hidden, its words emptied), the button stays. */
const floristIntro = `<html><body><div id="Mod41"><div class="title-wrap"><div class="top-desc lead">Fresh bouquets tied by hand every morning in our little shop on Willow Lane.<div class="mt-3 mt-md-5">
\t<img hidden src="${picture('a')}" class="me-3">
\t<div class="d-block d-xl-inline"> <span class="text-primary"> </span> </div>
</div><div class="bottom-actions"><a class="btn" href="/shop">See our flowers</a></div></div></div></div></body></html>`

/** A yoga studio intro: a lone badge wrapper whose only picture was taken off, and class cards, one taken off. */
const yogaIntro = `<html><body><section id="intro"><p>Slow, friendly classes for every body at Lotus Loft.</p>
<div class="badge-wrap mt-4"><img hidden src="${picture('b')}" alt=""></div>
<div class="cards"><div class="card-item"><img src="${picture('c')}" alt=""><h3>Morning flow</h3></div>
<div class="card-item"><img hidden src="${picture('d')}" alt=""><h3> </h3></div>
<div class="card-item"><img src="${picture('e')}" alt=""><h3>Evening calm</h3></div></div>
<a class="btn" href="/classes">Book a class</a></section></body></html>`

test('florist: the wrapper of a taken-off faces row is hidden, so the button sits under the paragraph', () => {
  const found = emptyFrameSelectors(floristIntro)
  // Named by its taken-off picture from the nearest id, not by its path: the template's script may move the intro block
  // into a sticky side column after load, and a child path read from the served HTML would then match nothing.
  assert.deepEqual(found, [`#Mod41 div.mt-3.mt-md-5:has(img[hidden][src="${picture('a')}"])`])
})

test('yoga studio: a lone wrapper of a taken-off picture and a taken-off card both go', () => {
  const found = emptyFrameSelectors(yogaIntro)
  assert.ok(
    found.includes(`#intro div.badge-wrap.mt-4:has(img[hidden][src="${picture('b')}"])`),
    found.join('\n')
  )
  assert.ok(found.includes(`#intro div.card-item:has(img[hidden][src="${picture('d')}"])`), found.join('\n'))
  assert.equal(found.length, 2)
})

test('a wrapper keeping visible words or a visible picture beside a taken-off one stays', () => {
  assert.deepEqual(
    emptyFrameSelectors(
      `<body><div id="x"><p>Words</p><div class="mt-3"><img hidden src="${picture('f')}"><div class="d-inline">Since <span>2019</span></div></div></div></body>`
    ),
    []
  )
  assert.deepEqual(
    emptyFrameSelectors(
      `<body><div id="x"><p>Words</p><div class="mt-3"><img hidden src="${picture('f')}"><img src="${picture('g')}"></div></div></body>`
    ),
    []
  )
})

test('a hidden element a page script reveals is never taken for a taken-off part', () => {
  assert.deepEqual(
    emptyFrameSelectors(
      '<body><div id="x"><p>Words</p><div class="notice"><div id="reveal-later" hidden><p>Thanks</p></div></div></div></body>'
    ),
    []
  )
})

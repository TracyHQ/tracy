// A card row that lost demo cards keeps the template's columns and card size, and the cards kept are centred in it
// (spec TracyHQ/tracy#189). Three invented trades: a dental clinic's team (T4, flex row), a bakery's offerings (T3,
// floated columns) and a yoga studio's quotes; a list that is not a row of columns is never centred.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leftoverHeadBlock } from '../../../packages/wo/website-opportunities/domain/outside-map.mjs'
import { centredRows, emptyFramesOf } from '../src/sites/brief-engines/empty-frames.js'

const card = (cls, body) =>
  `<div class="${cls}"><div class="team-item"><div class="team-inner">${body}</div></div></div>`
const clinic = `<html><body><div id="acm-team-41" class="acm-team"><div class="row g-0">
${card('item col-12 col-md-6 col-xl-3', '<img src="/images/a.jpg"><h4>Mira</h4><span>Dentist</span>')}
${card('item col-12 col-md-6 col-xl-3', '<img src="/images/b.jpg"><h4>Teo</h4><span>Hygienist</span>')}
${card('item col-12 col-md-6 col-xl-3', '')}
${card('item col-12 col-md-6 col-xl-3', '')}
</div></div></body></html>`

const bakery = `<html><body><section id="breads"><div class="row">
<div class="col-sm-6 col-md-4"><div class="box"><h3>Rye loaf</h3></div></div>
<div class="col-sm-6 col-md-4"><div class="box"><h3></h3></div></div>
<div class="col-sm-6 col-md-4"><div class="box"><h3></h3></div></div>
</div></section></body></html>`

const studio = `<html><body><div id="quotes"><div class="row">
<div class="span4"><blockquote><p>Calm and kind</p></blockquote></div>
<div class="span4"><blockquote><p></p></blockquote></div>
<div class="span4"><blockquote><p></p></blockquote></div>
</div></div></body></html>`

const hours = `<html><body><div id="hours"><ul class="rows">
<li class="row"><i class="fa fa-clock"></i><span>Mon to Fri 7 to 3</span></li>
<li class="row"><i class="fa fa-clock"></i><span></span></li>
</ul></div></body></html>`

const whole = `<html><body><div id="menu"><div class="row">
<div class="col-md-6"><div class="box"><h3>Tea</h3></div></div>
<div class="col-md-6"><div class="box"><h3>Cake</h3></div></div>
</div></div></body></html>`

test('clinic (T4): the row of the team list is centred, scoped to the list, the emptied cards still hidden', () => {
  const { hide, centre } = emptyFramesOf(clinic)
  assert.deepEqual(centre, ['#acm-team-41 > div.row.g-0:nth-child(1)'])
  assert.equal(hide.length, 2)
})

test('bakery (T3 floated columns) and studio (span columns): the row is centred', () => {
  assert.deepEqual(emptyFramesOf(bakery).centre, ['#breads > div.row:nth-child(1)'])
  assert.deepEqual(emptyFramesOf(studio).centre, ['#quotes > div.row:nth-child(1)'])
})

test('a list that is not a row of columns, and a row that lost nothing, are never centred', () => {
  assert.deepEqual(emptyFramesOf(hours).centre, [])
  assert.deepEqual(emptyFramesOf(whole).centre, [])
})

test('across pages each row once; the head block centres it and keeps the column widths', () => {
  const rows = centredRows([clinic, clinic, bakery, hours])
  assert.equal(rows.length, 2)
  const block = leftoverHeadBlock({ centre: rows })
  assert.match(
    block,
    /#acm-team-41 > div\.row\.g-0:nth-child\(1\),\n#breads > div\.row:nth-child\(1\)\{display:flex !important;flex-wrap:wrap !important;justify-content:center !important\}/
  )
  assert.doesNotMatch(block, /width|flex-basis|grid-template/)
  assert.equal(leftoverHeadBlock({ centre: [] }), '')
})

// The markup of a written value (ticket #597): the order check holds each tag to its field's `inline` declaration,
// its attributes and its form (redoable, the writer can still change it), and the write guard holds every value
// written as HTML to the rules of markup that runs code (noRerun, the last line before a door). Held names hidden
// behind entities, accents or zero width characters are caught too. Invented data.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-markup.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeEntities, plainOf } from '../domain/draft-write-entities.mjs'
import { guardPlan } from '../domain/draft-write-guards.mjs'
import { runsCodeIn } from '../domain/draft-write-markup.mjs'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { checkWriteOrder } from '../domain/write-order-check.mjs'
import { markupNotDeclared } from '../domain/write-order-check-entries.mjs'
import { fieldEntry, kit, plan, site, valueWhere } from './fixtures/draft-write/guarded.mjs'

const HTML_HEADING = 'home.home-b4.heading'
const CODES_HEADING = 'home.home-b3.heading'
const orderWith = (place, value) => {
  const order = structuredClone(site.order)
  fieldEntry(order, place).value = value
  return order
}
const reason = (place, value) => markupNotDeclared(fieldEntry(orderWith(place, value), place))
const orderCodes = (order) => checkWriteOrder(order).map((p) => p.code)

test('order check: an attribute an emphasis part does not declare goes back to the writer', () => {
  assert.equal(reason(HTML_HEADING, 'Go<br>any <span>day</span>'), null)
  assert.equal(reason(HTML_HEADING, 'Go<br/>any day'), null)
  for (const value of [
    'Go<br onclick=x>any day',
    'Go<BR/OnClick=x>any day',
    'Go<br>any <span class="x">day</span>',
    'Go<br>any <span style="color:red">day</span>'
  ]) {
    assert.equal(reason(HTML_HEADING, value), 'attribute', value)
    assert.ok(orderCodes(orderWith(HTML_HEADING, value)).includes('markup_forbidden'), value)
  }
  assert.equal(reason(CODES_HEADING, '((span onclick=x))Go((/span)) any day'), 'attribute')
  assert.equal(reason(HTML_HEADING, 'Go<b>any</b> day'), 'tag')
})

test('order check: a tag in the other form than the field writes goes back to the writer', () => {
  assert.equal(reason(CODES_HEADING, '((span))Go((/span)) any day'), null)
  assert.equal(reason(CODES_HEADING, '<span>Go</span> any day'), 'form')
  assert.equal(reason(HTML_HEADING, 'Go((br/))any day'), 'form')
  for (const [place, value] of [
    [CODES_HEADING, '<span>Go</span> any day'],
    [HTML_HEADING, 'Go((br/))any day']
  ])
    assert.ok(orderCodes(orderWith(place, value)).includes('markup_forbidden'), value)
})

/** Every guard problem code of a plan whose value at `entry` is changed. */
function problemCodes(entry, value, { op } = {}) {
  const p = structuredClone(plan)
  valueWhere(p, (o, v) => v.entry === entry && (!op || o.kind === op)).value = value
  try {
    guardPlan(p, { order: site.order, kit })
  } catch (error) {
    assert.equal(error.noRerun, true)
    return error.details.problems.map((x) => x.code)
  }
  return []
}

test('guard markup_runs_code: every value written as HTML, whatever hides the code', () => {
  for (const value of [
    'Go<br onclick=x>day',
    'Go<BR/OnClick=x>day',
    'Go<img src=x onerror=y>',
    '<a href="jav&#x09;ascript:x">Go</a>',
    '<a href="javascript&colon;x">Go</a>',
    '<a href="&#106;avascript:x">Go</a>',
    '<span style="x:url(javascript:a)">Go</span>',
    '<ScRiPt>x</ScRiPt>',
    '<svg><a>Go</a></svg>'
  ])
    assert.ok(problemCodes(HTML_HEADING, value).includes('markup_runs_code'), value)
  assert.ok(problemCodes(CODES_HEADING, '((span onmouseover=x))Go((/span))').includes('markup_runs_code'))
  assert.deepEqual(problemCodes(HTML_HEADING, 'Go<br>any <span>day</span>'), [])
})

test('guard markup_runs_code: an address that runs code, in any value or record column', () => {
  const p = structuredClone(plan)
  const made = p.ops.find((o) => o.kind === 'menuItem.create' && o.fields)
  made.fields.link = ' JaVa\tScRiPt:alert(1)'
  assert.throws(
    () => guardPlan(p, { order: site.order, kit }),
    (error) => error.details.problems.some((x) => x.code === 'markup_runs_code' && x.column === 'link')
  )
  assert.deepEqual(runsCodeIn('Learn the basics: on time, every day'), [])
  assert.deepEqual(runsCodeIn('<a href="https://example.test/a">Go</a>'), [])
})

test('held names reach no value as entities, accents, zero width or spaced forms', () => {
  assert.equal(decodeEntities('O&#39;Brien &amp; Zo&euml; &#x45;&#235;'), "O'Brien & Zoë Eë")
  assert.equal(plainOf('Kim&nbsp;​Lee'), 'Kim Lee')
  const aiq = site.aiq
  const library = (order) => order.pages.flatMap((p) => p.blocks).find((b) => b.source === 'library')
  for (const [name, written] of [
    ["Rory O'Brien", 'Rory O&#39;Brien'],
    ["Rory O'Brien", 'Rory O&#x27;Brien'],
    ['Ana & Bo Ltd', 'Ana &amp; Bo Ltd'],
    ['Zoë Hart', 'Zo&euml; Hart'],
    ['Zoë Hart', 'Zo&#235; Hart'],
    ['Zoë Hart', 'Zoë Hart'],
    ['Kim Lee', 'Kim&nbsp;Lee'],
    ['Kim Lee', 'Kim  \n Lee'],
    ['Kim Lee', 'Ki​m Lee'],
    ['Kim Lee', 'Kim<br>Lee']
  ]) {
    const order = structuredClone(site.order)
    library(order).library.html += `<p>${written}</p>`
    assert.throws(
      () => writePlanOf(order, aiq, { stored: site.stored, withheld: { names: [name] } }),
      (error) => error.code === 'held_text_in_value',
      JSON.stringify(written)
    )
  }
})

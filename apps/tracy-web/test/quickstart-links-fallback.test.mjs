import assert from 'node:assert/strict'
import test from 'node:test'
import { quickstartLinks } from '../src/sites/brief-engines/quickstart-links.js'
import {
  quickstartTextRanges,
  quickstartEditorialInventory,
  applyQuickstartEditorial
} from '../src/sites/brief-engines/quickstart-editorial.js'
const business = { website: 'https://actual.example/' }
const options = { base: 'https://site.example/', navigationFallback: true }

test('WO repurposes a plain outbound CTA with a source-bound label and stable occurrence', () => {
  const html =
    '<a href="/menu">Menu</a><a href="https://old.example/video" title="Play video" aria-label="Play video">Play video</a>'
  assert.equal(quickstartLinks({ html }, business, { base: options.base }).unresolved.length, 1)
  const result = quickstartLinks({ html }, business, options)
  assert.equal(result.unresolved.length, 0)
  assert.equal(
    result.data.html,
    '<a href="/menu">Menu</a><a href="https://actual.example/" title="actual.example" aria-label="actual.example">actual.example</a>'
  )
  assert.equal(result.receipts[0].sourceId, 'business.website')
  assert.deepEqual(result.receipts[0].occurrence, ['html', '@anchor', 1])
  assert.equal(quickstartLinks({ html }, {}, options).unresolved.length, 1)
})

test('editorial cannot restore a booking claim on a repurposed CTA', () => {
  const records = [{ key: 'home', copy: { html: '<a href="https://demo.example/">Play video</a>' } }]
  const { slots } = quickstartEditorialInventory(records)
  const edited = applyQuickstartEditorial(
    records,
    slots,
    slots.map((s) => ({ key: s.key, value: 'Donate now' }))
  )
  assert.match(edited[0].copy.html, /https:\/\/demo.example/)
  const bound = quickstartLinks(edited[0].copy, business, options)
  assert.doesNotMatch(bound.data.html, /Donate|Play video/)
  assert.match(bound.data.html, />actual.example<\/a>/)
})

test('a core button JSON destination and label stay synchronized without changing style values', () => {
  const html =
    '<!-- wp:button {"url":"https://demo.example/","text":"Play video","style":{"color":{"text":"#fff"}}} --><div class="wp-block-button"><a class="wp-block-button__link" href="https://demo.example/">Play video</a></div><!-- /wp:button -->'
  const result = quickstartLinks({ html }, business, options)
  assert.equal(result.unresolved.length, 0)
  assert.doesNotMatch(result.data.html, /demo.example|Play video/)
  assert.match(result.data.html, /"text":"actual.example"/)
  assert.match(result.data.html, /"color":\{"text":"#fff"\}/)
})

test('forms, downloads, handlers, widget actions, icon-only social and unsafe protocols cannot become a website CTA', () => {
  for (const html of [
    '<form action="https://old.example/"></form>',
    '<a href="https://old.example/" download>Download</a>',
    '<a aria-labelledby="booking-label" href="https://old.example/">Book</a>',
    '<a href="https://old.example/" onclick="pay()">Pay</a>',
    '<a href="https://old.example/" data-action="book">Book</a>',
    '<a href="https://old.example/"><svg></svg></a>',
    '<a href="javascript:pay()">Pay</a>',
    '<a href=" javascript:pay()">Pay</a>',
    '<a href="java&#x09;script:pay()">Pay</a>',
    '<a role="button" aria-controls="modal" href="https://old.example/">Donate</a>',
    '<a href="https://old.example/">Unclosed'
  ]) {
    const result = quickstartLinks({ html }, business, options)
    assert.ok(result.unresolved.length, html)
    assert.equal(result.receipts.length, 0, html)
  }
})

test('explicit software licensing remains truthful publisher attribution and is not sent for business editorial', () => {
  const html =
    '<p><a href="https://wordpress.org">WordPress</a> is free software released under the <a href="https://www.gnu.org/licenses/gpl-2.0.html">GNU General Public License.</a></p><p>Our story</p>'
  const result = quickstartLinks({ html }, business, options)
  assert.equal(result.unresolved.length, 0)
  assert.equal(result.data.html, html)
  assert.deepEqual(
    quickstartTextRanges(html).map((r) => r.sample),
    ['Our story']
  )
  assert.ok(quickstartTextRanges('<p>Our restaurant</p>').length)
  assert.equal(
    quickstartLinks(
      { html: '<a data-tracy-role="attribution" href="https://author.example/">Author</a>' },
      business,
      options
    ).unresolved.length,
    0
  )
})

test('an ancestor widget or unidentified attribution cannot be silently retargeted', () => {
  for (const html of [
    '<form action="/checkout"><a href="https://old.example/">Book</a></form>',
    '<div data-action="payment"><a href="https://old.example/">Pay</a></div>',
    '<p>Designed by <a href="https://author.example/">Author</a></p>'
  ]) {
    const result = quickstartLinks({ html }, business, options)
    assert.ok(result.unresolved.length, html)
    assert.equal(result.receipts.length, 0)
  }
})

test('mixed licensing prose stays editable and explicit attribution text stays locked', () => {
  const html =
    '<p>Demo Diner founded in 1998. <a href="https://wordpress.org">WordPress</a> is free software released under the <a href="https://gnu.org/">GNU General Public License.</a></p>'
  assert.ok(quickstartTextRanges(html).some((r) => r.sample.includes('1998')))
  assert.ok(quickstartLinks({ html }, business, options).unresolved.length)
  for (const marker of ['data-tracy-role="attribution"', 'rel="license"']) {
    assert.deepEqual(
      quickstartTextRanges(`<a ${marker} title="Author" href="https://author.example/">Author</a>`),
      []
    )
  }
})

test('leading URL whitespace cannot retain a demo destination', () => {
  const r = quickstartLinks({ html: '<a href=" https://old.example/video">Play</a>' }, business, options)
  assert.equal(r.unresolved.length, 0)
  assert.doesNotMatch(r.data.html, /old.example/)
})

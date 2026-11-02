// A text slot of several paragraphs: the read pass records every paragraph, whatever its length, a reused capture
// takes the current reading, and the kit checks the paragraphs it read against the paragraphs the page shows.
// Fabricated studio: a quote of two paragraphs, the second one long.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import { paragraphChecks, shownParagraphs } from '../template-kit/lib/orphan-text.mjs'
import { refreshDetails } from '../template-kit/lib/read-pass.mjs'
import { readDetails } from '../template-kit/lib/read-details.js'

const FIRST = 'Ten rounds split between skill work and conditioning, closed with a calm cooldown.'
const SECOND =
  'We opened the Harbour Studio in 2011 with a method that brings the benefits of the sport to everyday people in a ' +
  'welcoming place. Our coaches teach the basics first, then the footwork, the guard and the combinations, and every ' +
  'class ends with stretching so that beginners and regulars alike leave the floor feeling stronger than they came.'

test('the read pass records a long paragraph, and every shown paragraph whole', async (t) => {
  assert.ok(SECOND.length > 300)
  const html = `<div data-kit-block="quote-1"><h2>Our <span>story</span></h2>
    <div class="description"><p>${FIRST}</p><p>${SECOND}</p><p style="display:none">Hidden words here</p></div>
    <ul><li>Warm <b>up</b></li><li>Footwork</li><li style="display:none">Hidden step</li></ul></div>`
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage()
    await page.setContent(html)
    const d = (await page.evaluate(readDetails))['quote-1']
    assert.ok(d.texts.includes(SECOND), 'a paragraph longer than 300 characters is read')
    assert.deepEqual(d.paragraphs, [FIRST, SECOND], 'shown paragraphs only, each whole')
    assert.deepEqual(d.bullets, ['Warm up', 'Footwork'], 'shown bullets only, each whole')
  } finally {
    await browser.close()
  }
})

test('a reused capture takes the current reading of every block, its shots untouched', () => {
  const capture = {
    blocks: {
      'quote-1': {
        id: 'quote-1',
        widths: { 1440: { pages: ['about'], image: 'images/quote-1-1440.png', details: { texts: [FIRST] } } }
      },
      gone: { id: 'gone', widths: { 1440: { pages: ['about'], details: { texts: ['x'] } } } }
    }
  }
  const fresh = {
    'quote-1': { widths: { 1440: { details: { texts: [FIRST, SECOND], paragraphs: [FIRST, SECOND] } } } }
  }
  const n = refreshDetails(capture, fresh)
  assert.equal(n, 1)
  const at = capture.blocks['quote-1'].widths[1440]
  assert.deepEqual(at.details.paragraphs, [FIRST, SECOND])
  assert.equal(at.image, 'images/quote-1-1440.png', 'the shot stays')
  assert.deepEqual(
    capture.blocks.gone.widths[1440].details.texts,
    ['x'],
    'a block not read again keeps its reading'
  )
})

test('every paragraph of a multi-paragraph slot the page shows is one the kit read', () => {
  const block = (texts) => ({
    id: 'quote-1',
    paragraphsShown: [
      { slot: 'quote-1.2', paragraph: FIRST, read: texts.includes(FIRST) },
      { slot: 'quote-1.2', paragraph: SECOND, read: texts.includes(SECOND) },
      { slot: 'quote-1.5', paragraph: 'A single paragraph slot', read: false }
    ]
  })
  let errors = []
  assert.equal(paragraphChecks({ blocks: [block([FIRST])], errors }), 1, 'the long paragraph was not read')
  assert.equal(errors[0].kind, 'paragraphs-missing')
  assert.match(errors[0].reason, /quote-1\.2.*2 paragraphs.*1/)
  errors = []
  assert.equal(paragraphChecks({ blocks: [block([FIRST, SECOND])], errors }), 0)
  assert.deepEqual(errors, [], 'a one-paragraph slot is not this check')
})

test('a paragraph counts for every multi-paragraph slot that holds it, even when another slot holds it alone', () => {
  const slots = [
    { key: 'module-7.1', type: 'text', sample: FIRST },
    { key: 'module-7.2', type: 'text', sample: `((p))${FIRST}((/p))((p))${SECOND}((/p))` }
  ]
  const shown = shownParagraphs({
    paragraphs: [FIRST, SECOND],
    texts: [FIRST],
    slots,
    matchOf: () => ({ slot: slots[0] }),
    keyOf: (k) => k.replace('module-', 'block-')
  })
  const of2 = shown.filter((p) => p.slot === 'block-7.2')
  assert.equal(of2.length, 2, 'both paragraphs belong to the two-paragraph slot')
  assert.deepEqual(
    of2.map((p) => p.read),
    [true, false]
  )
  const errors = []
  assert.equal(paragraphChecks({ blocks: [{ id: 'quote-7', paragraphsShown: shown }], errors }), 1)
})

test('a short shown word inside a long paragraph does not hide that the paragraph was read whole', () => {
  const shown = shownParagraphs({
    paragraphs: [SECOND],
    texts: ['Our', 'the', SECOND],
    slots: [],
    matchOf: () => null,
    keyOf: (k) => k
  })
  assert.equal(shown[0].read, true)
})

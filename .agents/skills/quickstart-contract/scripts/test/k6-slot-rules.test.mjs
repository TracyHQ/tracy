import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectiveLimit, pickNewText, wholeTextMatches } from '../k6-slot-rules.mjs'

test('whole-text match ignores the same words inside longer text', () => {
  const html = '<nav><a>Other Pages</a></nav><h2>Other</h2><p>Another thing</p>'
  assert.equal(wholeTextMatches(html, 'Other').count, 1)
  assert.equal(wholeTextMatches('<a>Other Pages</a>', 'Other').count, 0)
})

test('whole-text match trims node whitespace and reports the end index', () => {
  const html = '<h2>\n  Fresh Weekly Menu \n</h2><span>tail</span>'
  const found = wholeTextMatches(html, 'Fresh Weekly Menu')
  assert.equal(found.count, 1)
  assert.equal(html.slice(found.end, found.end + 3), ' \n<')
  assert.deepEqual(wholeTextMatches(html, 'Missing words'), { count: 0, end: -1 })
})

test('limit is maxCharacters without a fit', () => {
  assert.equal(effectiveLimit({ maxCharacters: 42 }), 42)
  assert.equal(effectiveLimit({ maxCharacters: 42, fit: { measured: false, maxCharacters: 11 } }), 42)
  assert.equal(effectiveLimit({ maxCharacters: 42, fit: ['a', 'b'] }), 42)
})

test('limit follows the measured fit like the plugin', () => {
  assert.equal(effectiveLimit({ maxCharacters: 42, fit: { measured: true, maxCharacters: 11 } }), 11)
  assert.equal(
    effectiveLimit({ maxCharacters: 42, fit: { measured: true, maxChars: { desktop: 30, phone: 24 } } }),
    24
  )
  assert.equal(
    effectiveLimit({
      maxCharacters: 42,
      fit: { measured: true, maxCharacters: 30, maxChars: { phone: 20 } }
    }),
    30
  )
  assert.equal(effectiveLimit({ maxCharacters: 20, fit: { measured: true, maxCharacters: 50 } }), 20)
})

test('new text respects the limit', () => {
  assert.equal(pickNewText('2611041234', 42), 'K6 edit 041234'.replace('041234', '041234'))
  assert.equal(pickNewText('2611041234', 11), 'K6 041234')
  assert.equal(pickNewText('2611041234', 8), null)
})

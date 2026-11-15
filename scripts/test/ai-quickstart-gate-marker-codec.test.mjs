// The markers of the release gate's marker test (ticket #585): every code reads back to its number, every marker
// survives the plugin's content checks and the template's code notation, and a page text is read for its codes.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CODE_SPACE,
  codeOf,
  codesIn,
  emailMarker,
  hasMarker,
  linkMarker,
  markerShare,
  numberOf,
  phoneMarker,
  pictureMarker,
  socialMarker,
  textMarker
} from '../ai-quickstart/gate/marker-codec.mjs'

test('every code reads back to its number, and none is reused', () => {
  const seen = new Set()
  for (const n of [0, 1, 25, 26, 675, 676, 9999, CODE_SPACE - 1]) {
    const code = codeOf(n)
    assert.match(code, /^[A-Z]{3}$/)
    assert.equal(numberOf(code), n)
    assert.ok(!seen.has(code))
    seen.add(code)
  }
  assert.throws(() => codeOf(CODE_SPACE), RangeError)
  assert.throws(() => codeOf(-1), RangeError)
  assert.equal(numberOf('A1B'), null)
})

test('a marker holds no character the plugin, the template code notation or HTML would read', () => {
  const code = codeOf(1234)
  const all = [
    textMarker(code),
    textMarker(code, { length: 40 }),
    linkMarker(code),
    emailMarker(code),
    phoneMarker(code),
    socialMarker('instagram.com', code),
    pictureMarker(code, { theme: 'dark' })
  ]
  for (const marker of all) assert.doesNotMatch(marker, /[()<>"'&‒-―−]/, marker)
})

test('a padded text marker keeps its code and its length', () => {
  const code = codeOf(42)
  for (const length of [5, 6, 11, 17, 32]) {
    const marker = textMarker(code, { length })
    assert.ok(marker.length <= length, `${marker} fits ${length}`)
    assert.deepEqual(codesIn(marker), [code])
  }
})

test('every kind of marker is read back from a page text, in any case', () => {
  const [a, b, c, d, e] = [10, 200, 3000, 4500, 17000].map(codeOf)
  const text = `${textMarker(a).toUpperCase()} call ${phoneMarker(b)} or ${emailMarker(c)} at ${linkMarker(d)} ${socialMarker('x.com', e)}`
  assert.deepEqual(codesIn(text).sort(), [a, b, c, d, e].sort())
  assert.ok(hasMarker(text))
  assert.equal(hasMarker('A demo heading'), false)
})

test('a text is a marker, mixed or none', () => {
  const code = codeOf(7)
  assert.equal(markerShare(`${textMarker(code, { length: 17 })}.`).kind, 'marker')
  assert.deepEqual(markerShare(`Join ${textMarker(code)} today`), { kind: 'mixed', rest: 'Join today' })
  assert.equal(markerShare('Read more').kind, 'none')
})

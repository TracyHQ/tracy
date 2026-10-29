import assert from 'node:assert/strict'
import test from 'node:test'
import { SCRIPT_LETTER_WIDTH, scriptSignature } from '../domain/neutral-signature.mjs'

// A signature slot as capture measures it: a wide, short picture under a founder's quote (fictional template).
const signatureFit = {
  measured: true,
  kind: 'signature',
  replace: 'keep',
  transparent: true,
  source: { width: 360, height: 120, format: 'png' },
  boxes: { desktop: { width: 180, height: 60 }, phone: { width: 150, height: 50 } },
  aspect: 3,
  crop: 'none'
}

test('a signature slot with no brief signature shows the name in a script font in the slot shape', () => {
  const got = scriptSignature({ name: 'Wren Example', fit: signatureFit })
  assert.equal(got.state, 'neutral')
  assert.equal(got.reason, 'no-brief-signature')
  assert.equal(got.text, 'Wren Example')
  // The picture keeps the demo file's own size, so the frame keeps its shape.
  assert.equal(got.width, 360)
  assert.equal(got.height, 120)
  assert.match(got.svg, /^<svg [^>]*width="360" height="120"/)
  assert.match(got.svg, />Wren Example<\/text>/)
  assert.match(got.font.family, /cursive$/)
  // The written name fits inside the picture.
  assert.ok(got.font.size <= 120)
  assert.ok(got.font.size * SCRIPT_LETTER_WIDTH * 'Wren Example'.length <= 360)
})

test('a long name is set smaller so it still fits the slot', () => {
  const short = scriptSignature({ name: 'Wren Example', fit: signatureFit })
  const long = scriptSignature({ name: 'Wilhelmina Ottoline Featherstonehaugh', fit: signatureFit })
  assert.ok(long.font.size < short.font.size)
  assert.ok(long.font.size * SCRIPT_LETTER_WIDTH * long.text.length <= 360)
})

test('a name is escaped inside the picture', () => {
  const got = scriptSignature({ name: 'Ada & <Co>', fit: signatureFit })
  assert.match(got.svg, />Ada &amp; &lt;Co&gt;<\/text>/)
})

test('the owner is the signer when the slot names no person', () => {
  const people = [
    { id: 'p1', value: { name: 'Quill Sample', relationship: 'coach' } },
    { id: 'p2', value: { name: 'Wren Example', relationship: 'owner' } }
  ]
  const got = scriptSignature({ people, fit: signatureFit })
  assert.equal(got.text, 'Wren Example')
  assert.deepEqual(got.factRefs, ['p2'])
})

test('the slot person is the signer before the owner', () => {
  const people = [{ id: 'p2', value: { name: 'Wren Example', relationship: 'founder' } }]
  const person = { id: 'p1', value: { name: 'Quill Sample', relationship: 'coach' } }
  const got = scriptSignature({ person, people, fit: signatureFit })
  assert.equal(got.text, 'Quill Sample')
  assert.deepEqual(got.factRefs, ['p1'])
})

test('with no name to sign the slot empties, never keeping the demo hand', () => {
  const got = scriptSignature({ people: [], fit: signatureFit })
  assert.deepEqual(got, { state: 'empty', reason: 'no-signer-name' })
})

test('a text signature slot gets the name as text within its characters', () => {
  const textFit = { measured: true, boxes: { desktop: { width: 200, height: 40 } }, maxCharacters: 10 }
  const got = scriptSignature({ name: 'Wren Example', fit: textFit })
  assert.equal(got.state, 'neutral')
  assert.equal(got.text, 'Wren')
  assert.equal(got.svg, undefined)
  assert.match(got.font.family, /cursive$/)
})

test('a slot with no measured box is not drawn', () => {
  const got = scriptSignature({ name: 'Wren Example', fit: { measured: false } })
  assert.deepEqual(got, { state: 'empty', reason: 'no-slot-box' })
})

test('a former owner never signs', () => {
  const people = [
    { id: 'p1', value: { name: 'Quill Sample', relationship: 'former owner' } },
    { id: 'p2', value: { name: 'Wren Example', relationship: 'ownership desk' } }
  ]
  assert.deepEqual(scriptSignature({ people, fit: signatureFit }), {
    state: 'empty',
    reason: 'no-signer-name'
  })
})

test('a measured box with fractional pixels is still drawn, at whole pixels', () => {
  const fit = { kind: 'signature', boxes: { phone: { width: 150.5, height: 49.6 } } }
  const got = scriptSignature({ name: 'Wren Example', fit })
  assert.equal(got.width, 151)
  assert.equal(got.height, 50)
})

test('the name is inked in a real colour, so a rasterised file shows it', () => {
  const got = scriptSignature({ name: 'Wren Example', fit: signatureFit, ink: '#336699' })
  assert.match(got.svg, /fill="#336699"/)
  assert.doesNotMatch(scriptSignature({ name: 'Wren Example', fit: signatureFit }).svg, /currentColor/)
})

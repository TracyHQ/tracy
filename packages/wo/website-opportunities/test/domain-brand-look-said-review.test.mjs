// The template look words of a plan line (ticket #616, second review 13/11): a business sentence that uses the kit's short name
// or the word "palette" as an ordinary word is not the template's look; the template's colour words, its demo look, the
// theme colours, a curly possessive, "came with the template", hsl() and a three digit hex of the accent are. The kit
// is invented; the lines are invented.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-brand-look-said-review.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'
import { templateLookWordsOf } from '../domain/brand-look-said.mjs'

const KIT = { name: 'Ridge', slug: 'ex-ridge', accent: '#d9302c' }
const says = templateLookWordsOf(KIT)
const named = (line) => ({ value: says.value(line), colour: says.colour(line), logo: says.logo(line) })
const NONE = { value: false, colour: false, logo: false }

test('ordinary business sentences are not the template look', () => {
  for (const line of [
    'The default palette knife is not sold.',
    'Ridge logo shirts are listed as a product.',
    'Your Ridge colours class is listed under services.',
    'Palette knife painting classes are listed.',
    'We teach colour theory with the template of the colour wheel.',
    'Your order number 1d9302c2 is kept.',
    'Kept the colour #d32.'
  ])
    assert.deepEqual(named(line), NONE, line)
})

test('the full kit name, or the short name beside template, theme or demo, names the look', () => {
  for (const line of [
    'Ex Ridge colours are used.',
    'EX RIDGE’S colours are used.',
    "Ex-Ridge's palette stays."
  ])
    assert.equal(says.colour(line), true, line)
  assert.equal(says.logo('The Ex Ridge logo is shown.'), true)
  assert.equal(says.colour('The Ridge colours of the template stay.'), true)
  assert.equal(says.logo('The Ridge theme logo stays.'), true)
})

test("the template's colour words, its demo look and the theme colours are caught", () => {
  for (const line of [
    "The template's red is kept.",
    'The template’s blue stays on buttons.',
    'The demo look is kept.',
    'The theme colours stay as they are.',
    'The theme colour stays.',
    'The colours of this theme are kept.',
    'The template’s colours are kept.',
    'Kept the colours that came with the template.'
  ])
    assert.equal(says.colour(line), true, line)
  assert.equal(says.logo('Kept the logo that came with the template.'), true)
  assert.equal(says.colour('Kept the logo that came with the template.'), false)
})

test('hsl() and hsla() of the accent and a three digit hex that expands to it are the accent value', () => {
  for (const line of [
    'Kept the colour hsl(1, 70%, 51%).',
    'Kept hsla(1,70%,51%,0.8).',
    'Kept hsl(1deg 70% 51%).'
  ])
    assert.equal(says.value(line), true, line)
  assert.equal(says.value('Kept hsl(200, 70%, 51%).'), false)
  const short = templateLookWordsOf({ ...KIT, accent: '#dd3322' })
  for (const line of ['Kept the colour #d32.', 'Kept the colour #D32 for now.'])
    assert.equal(short.value(line), true, line)
  assert.equal(short.value('Kept the colour #d33.'), false)
  assert.equal(short.value('Room d32 is booked.'), false, 'without a # a three digit word is no colour')
})

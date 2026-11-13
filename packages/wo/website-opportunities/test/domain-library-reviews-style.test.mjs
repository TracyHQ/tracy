// The Tracy reviews block is styled only through the template's design variables (ticket #596): its stylesheet and
// its markup carry no colour of their own. The check reads every declaration value and allows only template design
// variables, the block's own bound variables and a short list of layout words, so a hex, a colour function or a
// colour name anywhere fails it. Invented reviews only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { tracyLibraryBlock } from '../domain/library.mjs'
import { renderReviewsBlock, reviewsBlockCss } from '../domain/library-reviews-render.mjs'

const BLOCK = tracyLibraryBlock('tracy-reviews')
const CONTENT = {
  heading: 'What members say',
  listingUrl: 'https://www.google.com/maps/search/?api=1&query=Example&query_place_id=invented-place-0001',
  reviews: [
    { author: 'Mara Telling', text: 'Friendly coaches and the courts are always swept.', rating: 5 },
    { author: 'Osric Vale', text: 'My two kids love the junior coaching.', rating: 4 }
  ]
}

// Words a layout declaration may use. A colour name is not one of them, nor are `transparent` and `currentColor`.
const LAYOUT_WORDS = new Set(
  'grid flex column none solid underline auto auto-fill repeat minmax min fr pre-line 1fr inherit'.split(' ')
)
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\s*\(/i
const HEX = /#[0-9a-f]{3,8}\b/i

/** Every colour literal of a stylesheet, as `property: token`. Empty when the sheet carries none. */
function colourLiterals(css) {
  const found = []
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, prop, value] of body.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)) {
    if (HEX.test(value) || COLOUR_FUNCTION.test(value)) {
      found.push(`${prop}: ${value.trim()}`)
      continue
    }
    const words = value
      .replace(/var\(\s*--[\w-]+/g, ' ')
      .replace(/[(),]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    for (const word of words) {
      if (/^-?\d*\.?\d+(?:px|rem|em|%|fr)?$/.test(word) || LAYOUT_WORDS.has(word)) continue
      found.push(`${prop}: ${word}`)
    }
  }
  return found
}

test('the block stylesheet carries no colour literal', () => {
  assert.deepEqual(colourLiterals(reviewsBlockCss(BLOCK)), [])
})

test('the colour check fails on every kind of colour literal', () => {
  const sheet = (value) => `.tracy-reviews { color: ${value}; }`
  for (const value of [
    '#f44141',
    '#fff',
    'rgb(0 0 0)',
    'rgba(0,0,0,.5)',
    'hsl(0 0% 0%)',
    'oklch(0.5 0.1 20)'
  ])
    assert.ok(colourLiterals(sheet(value)).length > 0, value)
  for (const value of ['red', 'white', 'transparent', 'currentColor', 'var(--color-primary, black)'])
    assert.ok(colourLiterals(sheet(value)).length > 0, value)
  assert.deepEqual(colourLiterals(sheet('var(--color-primary, var(--body-text-color))')), [])
})

test('the markup carries no style, no colour attribute and no colour value', () => {
  const { html } = renderReviewsBlock(BLOCK, CONTENT)
  assert.doesNotMatch(html, /\sstyle=|<style|\s(?:color|bgcolor|fill|stroke)=/i)
  assert.doesNotMatch(html.replace(/href="[^"]*"/g, ''), HEX)
  assert.doesNotMatch(html, COLOUR_FUNCTION)
})

test('every block variable the layout reads is bound to template design variables of the declaration', () => {
  const css = reviewsBlockCss(BLOCK)
  const used = new Set([...css.matchAll(/var\(--tracy-reviews-([\w]+)\)/g)].map((m) => m[1]))
  assert.ok(used.size > 0)
  for (const role of used) assert.ok(BLOCK.designVariables[role], `role ${role} is not bound`)
  const templateVariables = new Set(Object.values(BLOCK.designVariables).flatMap((b) => b.variables))
  const binding = css.slice(0, css.indexOf('}'))
  for (const [, name] of binding.matchAll(/var\((--[\w-]+)/g)) assert.ok(templateVariables.has(name), name)
})

test('the colour roles of the declaration name template variables only, with no fallback of their own', () => {
  for (const role of ['accent', 'text', 'heading', 'link', 'linkHover', 'surface', 'border'])
    assert.equal(BLOCK.designVariables[role].fallback, undefined, role)
})

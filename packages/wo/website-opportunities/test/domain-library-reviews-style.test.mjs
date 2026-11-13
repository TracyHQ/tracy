// The Tracy reviews block is styled only through the template's design variables (ticket #596): its stylesheet and
// its markup carry no colour of their own. The check reads every declaration value and allows only template design
// variables, the block's own bound variables and a short list of layout words, so a hex, a colour function or a
// colour name anywhere fails it. Invented reviews only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { tracyLibraryBlock } from '../domain/library.mjs'
import { renderReviewsBlock, reviewsBlockCss } from '../domain/library-reviews-render.mjs'
import { COLOUR_FUNCTION, HEX, colourLiterals } from '../domain/library-style-check.mjs'

const BLOCK = tracyLibraryBlock('tracy-reviews')
const CONTENT = {
  heading: 'What members say',
  listingUrl: 'https://www.google.com/maps/search/?api=1&query=Example&query_place_id=invented-place-0001',
  reviews: [
    {
      author: 'Mara Telling',
      text: 'Friendly coaches and the courts are always swept.',
      rating: 5,
      origin: 'google'
    },
    { author: 'Osric Vale', text: 'My two kids love the junior coaching.', rating: 4, origin: 'google' }
  ]
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

test('the colour check also reads a last declaration with no semicolon and declarations inside at-rules', () => {
  for (const css of [
    '.a{color:red}',
    '.a{border:1px solid red}',
    '.a{color:var(--x,red)}',
    '@media (min-width:1px){.a{color:white}}',
    '@supports (display:grid){.a{background:#000}}',
    '.a{color:red !important}',
    '.a{fill:red;}'
  ])
    assert.ok(colourLiterals(css).length > 0, css)
  assert.deepEqual(colourLiterals('@media (min-width:1px){.a{color:var(--x)}}'), [])
  assert.deepEqual(colourLiterals('.a{margin:0 auto}\n.b{display:grid}'), [])
})

test('links prefer the template accent text variable, then the current link binding, with no colour literal', () => {
  assert.deepEqual(BLOCK.designVariables.link.variables, [
    '--ds-c-accent-text',
    '--body-link-color',
    '--color-primary'
  ])
  assert.match(
    reviewsBlockCss(BLOCK),
    /--tracy-reviews-link: var\(--ds-c-accent-text, var\(--body-link-color, var\(--color-primary\)\)\);/
  )
  assert.equal(BLOCK.designVariables.linkHover.variables[0], '--ds-c-accent-text-hover')
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

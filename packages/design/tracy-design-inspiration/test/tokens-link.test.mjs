/**
 * `srcDoc` cannot follow a relative `<link>`: the three token previews must arrive with their tokens
 * inside. The regex is tested against the exact tag the vendored files carry (all 456 of them,
 * counted 06/09), the attribute orders a regenerated file could carry, and a page without the link.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inlineTokens } from '../src/client/tokens-link.mjs'

const TOKENS = ':root{--bg:#fdf3ec;--fg:#1a1a1a}'

test('the vendored link form becomes an inline style block', () => {
  const html = '<head><link rel="stylesheet" href="../tokens.css" /><style>body{}</style></head>'
  const out = inlineTokens(html, TOKENS)
  assert.equal(out, `<head><style data-tracy-tokens>${TOKENS}</style><style>body{}</style></head>`)
})

test('attribute order and quoting do not matter; other links are left alone', () => {
  assert.equal(
    inlineTokens('<link href=\'../tokens.css\' rel="stylesheet">', TOKENS),
    `<style data-tracy-tokens>${TOKENS}</style>`
  )
  const other = '<link rel="icon" href="../favicon.svg" />'
  assert.equal(inlineTokens(other, TOKENS), other)
})

test('a page without the link is returned as is', () => {
  const html = '<head><style>:root{--bg:#fff}</style></head>'
  assert.equal(inlineTokens(html, TOKENS), html)
})

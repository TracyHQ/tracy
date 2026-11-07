import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blockThemesOf, refusalsOf } from '../scope.mjs'

const BLOCK = {
  stylesheet: 'wp-example-cafe',
  template: 'wp-example-cafe',
  plugins: ['contact-form-7/wp-contact-form-7.php'],
  blockThemes: ['wp-example-cafe'],
  postTypes: ['page', 'post', 'wp_navigation'],
  languages: 0
}

const codes = (facts) => refusalsOf(facts).map((r) => r.code)

test('a block theme with no builder, shop or second language is in scope', () => {
  assert.deepEqual(refusalsOf(BLOCK), [])
})

test('a child theme of a block theme is a block theme', () => {
  assert.deepEqual(codes({ ...BLOCK, stylesheet: 'example-child', blockThemes: ['wp-example-cafe'] }), [])
})

test('a classic theme is refused', () => {
  assert.deepEqual(codes({ ...BLOCK, blockThemes: [] }), ['not-block-theme'])
})

test('a page builder plugin or theme is refused', () => {
  assert.deepEqual(codes({ ...BLOCK, plugins: ['elementor/elementor.php'] }), ['page-builder'])
  assert.deepEqual(codes({ ...BLOCK, stylesheet: 'Divi', template: 'Divi', blockThemes: ['Divi'] }), [
    'page-builder'
  ])
})

test('WooCommerce is refused, active or left as products in the dump', () => {
  assert.deepEqual(codes({ ...BLOCK, plugins: ['woocommerce/woocommerce.php'] }), ['woocommerce'])
  assert.deepEqual(codes({ ...BLOCK, postTypes: ['page', 'product'] }), ['woocommerce'])
})

test('content in several languages is refused', () => {
  assert.deepEqual(codes({ ...BLOCK, languages: 2 }), ['several-languages'])
})

test('the block themes of a webroot listing are the ones with a template index', () => {
  assert.deepEqual(
    blockThemesOf([
      'wp-content/themes/wp-example-cafe/templates/index.html',
      './wp-content/themes/old-classic/index.php',
      'site/wp-content/themes/other/block-templates/index.html',
      'wp-content/themes/partial/templates/page.html'
    ]),
    ['wp-example-cafe', 'other']
  )
})

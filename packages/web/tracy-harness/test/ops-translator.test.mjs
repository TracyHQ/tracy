/**
 * What a /ops screen reads for a key: the picked language, English where it has no text, the key
 * itself only when English has none either; a numeric `count` picks the plural form by the
 * language's own rules (`Intl.PluralRules`), not by `count === 1`.
 *
 *   node --test packages/web/tracy-harness/test/ops-translator.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { translate } from '../src/i18n/translator.ts'

const en = {
  'demo.hello': 'Hello {name}',
  'demo.only': 'Only in English',
  'demo.sites_one': '{count} site',
  'demo.sites_other': '{count} sites',
  'demo.plain': 'Plain {count}'
}

test('the picked language first, English for a key it lacks, the key only when English lacks it too', () => {
  const de = { 'demo.hello': 'Hallo {name}', 'demo.only': '' }
  assert.equal(translate('de', de, en, 'demo.hello', { name: 'Ana' }), 'Hallo Ana')
  assert.equal(translate('de', de, en, 'demo.only'), 'Only in English', 'empty text is no text')
  assert.equal(translate('de', de, en, 'demo.none'), 'demo.none')
  assert.equal(translate('de', de, en, '__proto__'), '__proto__')
})

test('placeholders are filled; one the caller did not give stays as written', () => {
  assert.equal(translate('en', {}, en, 'demo.hello', {}), 'Hello {name}')
  assert.equal(translate('en', {}, en, 'demo.hello', { name: 3 }), 'Hello 3')
})

test('a numeric count picks the plural form by the language: French says one for 0, English other', () => {
  const fr = { 'demo.sites_one': '{count} site', 'demo.sites_other': '{count} sites' }
  assert.equal(translate('en', {}, en, 'demo.sites', { count: 0 }), '0 sites')
  assert.equal(translate('en', {}, en, 'demo.sites', { count: 1 }), '1 site')
  assert.equal(translate('fr', fr, en, 'demo.sites', { count: 0 }), '0 site')
  assert.equal(translate('fr', fr, en, 'demo.sites', { count: 2 }), '2 sites')
})

test('a category the dictionary lacks reads _other, then the bare key; no text in the language reads English', () => {
  // French has a "many" category for 1,000,000; the dictionary writes only one and other.
  const fr = { 'demo.sites_one': '{count} site', 'demo.sites_other': '{count} sites (fr)' }
  assert.equal(translate('fr', fr, en, 'demo.sites', { count: 1000000 }), '1000000 sites (fr)')
  assert.equal(translate('zh', {}, en, 'demo.sites', { count: 1 }), '1 site')
  assert.equal(
    translate('zh', { 'demo.sites_other': '{count} 个站点' }, en, 'demo.sites', { count: 1 }),
    '1 个站点'
  )
  assert.equal(
    translate('de', {}, en, 'demo.plain', { count: 4 }),
    'Plain 4',
    'no plural forms: the key itself'
  )
  assert.equal(
    translate('en', {}, en, 'demo.sites', { count: '2' }),
    'demo.sites',
    'a string count is no count'
  )
})

test('extra parameters reach a plural form next to the count', () => {
  const words = { 'demo.of_one': '{count} of {total}', 'demo.of_other': '{count} of {total}' }
  assert.equal(translate('en', {}, words, 'demo.of', { count: 2, total: 9 }), '2 of 9')
})

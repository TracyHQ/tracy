/**
 * The dev-only pseudo language: every English value comes back wrapped in «…», so an unwrapped
 * word on a screen is a string that never went through the dictionary. Pure functions, no browser.
 *
 *   node --test packages/web/tracy-harness/test/ops-pseudo-locale.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createLanguageStore } from '../src/i18n/language-store.ts'
import { isPseudo, PSEUDO_LANGUAGE, pseudoize, pseudoTable } from '../src/i18n/pseudo-locale.ts'
import { translate } from '../src/i18n/translator.ts'

test('wraps the whole value and leaves placeholders and tags untouched', () => {
  assert.equal(pseudoize('Save'), '«Save»')
  assert.equal(pseudoize('{count} sites on <b>{name}</b>'), '«{count} sites on <b>{name}</b>»')
})

test('maps every key, plural suffixes included', () => {
  const table = pseudoTable({ 'a.b': 'One', 'a.n_one': '{count} site', 'a.n_other': '{count} sites' })
  assert.deepEqual(table, { 'a.b': '«One»', 'a.n_one': '«{count} site»', 'a.n_other': '«{count} sites»' })
})

test('the pseudo table reads through the translator like any language', () => {
  const en = { 'a.n_one': '{count} site', 'a.n_other': '{count} sites' }
  const table = pseudoTable(en)
  assert.equal(translate(PSEUDO_LANGUAGE, table, en, 'a.n', { count: 1 }), '«1 site»')
  assert.equal(translate(PSEUDO_LANGUAGE, table, en, 'a.n', { count: 3 }), '«3 sites»')
})

test('isPseudo recognises only the pseudo id', () => {
  assert.equal(isPseudo('pseudo'), true)
  assert.equal(isPseudo(' Pseudo '), true)
  for (const other of ['en', 'de', '', null, undefined, 'pseudo-x']) assert.equal(isPseudo(other), false)
})

test('a plain node run has no dev flag: the store never accepts pseudo', async () => {
  const store = createLanguageStore({ initial: 'pseudo', load: () => Promise.resolve({ k: 'v' }) })
  await store.ready
  assert.equal(store.get().lang, 'en')
})

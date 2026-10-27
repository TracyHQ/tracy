/**
 * The shell's own words in eight languages (src/shell-strings.js): the `interface-languages` gate does
 * not see them, so this test holds every language to every English key and to its placeholders.
 *
 *   node --test packages/desktop/tracy-desktop/test/shell-strings.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { INTERFACE_LANGUAGES as CORE_LANGUAGES } from '../../../core/tracy-core/src/interface-languages/index.mjs'

const require = createRequire(import.meta.url)
const { STRINGS, LANGUAGES, shellLanguage, shellWords } = require('../src/shell-strings.js')

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

test('the eight interface languages, no more, no less', () => {
  // The shell's own copy of @tracy/core/interface-languages, held to it.
  assert.deepEqual([...LANGUAGES].sort(), CORE_LANGUAGES.map((language) => language.id).sort())
})

for (const language of LANGUAGES)
  test(`${language}: every key, each with the English placeholders, none left in English`, () => {
    assert.deepEqual(Object.keys(STRINGS[language]).sort(), Object.keys(STRINGS.en).sort())
    for (const [key, english] of Object.entries(STRINGS.en)) {
      assert.deepEqual(placeholders(STRINGS[language][key]), placeholders(english), `${language} ${key}`)
      if (language !== 'en' && english.replace(/\{\w+\}/g, '').trim().length > 0)
        assert.notEqual(STRINGS[language][key], english, `${language} ${key} is still English`)
    }
  })

test('the language is the first preferred one the shell speaks, else English', () => {
  assert.equal(shellLanguage(['vi-VN', 'en-US']), 'vi')
  assert.equal(shellLanguage(['ja-JP', 'zh-Hans-CN']), 'zh')
  assert.equal(shellLanguage(['ja-JP']), 'en')
  assert.equal(shellLanguage(undefined), 'en')
})

test('placeholders are filled; a missing one stays visible', () => {
  const t = shellWords('en')
  assert.equal(
    t('blocked.installing', { version: '0.6.0', app: 'Tracy Cowork' }),
    'Installing 0.6.0. Tracy Cowork reopens by itself.'
  )
  assert.equal(t('blocked.failed', {}), 'The update didn’t work: {reason}')
})

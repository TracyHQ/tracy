// The language the app's own pages speak (src/interface-language.js): the first operating-system
// language that is one of the eight interface languages, else English — the same matching as
// tracy-web's `matchLanguage` (apps/tracy-web/src/lib/i18n/index.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INTERFACE_LANGUAGES as CORE_LANGUAGES } from '../../../core/tracy-core/src/interface-languages/index.mjs'
import lang from '../src/interface-language.js'

const { pickInterfaceLanguage, INTERFACE_LANGUAGES } = lang

test('the eight languages, in the order of @tracy/core/interface-languages', () => {
  // The app's copy cannot import the workspace package (src/interface-language.js says why), so it is
  // held to that package's own list here.
  assert.deepEqual(
    INTERFACE_LANGUAGES,
    CORE_LANGUAGES.map((language) => language.id)
  )
})

test('first OS language that matches wins: exact id, then primary subtag', () => {
  assert.equal(pickInterfaceLanguage(['de-AT', 'en-US']), 'de')
  assert.equal(pickInterfaceLanguage(['ja-JP', 'fr-CA', 'en']), 'fr')
  assert.equal(pickInterfaceLanguage(['vi']), 'vi')
  assert.equal(pickInterfaceLanguage(['zh-Hans-CN']), 'zh')
  assert.equal(pickInterfaceLanguage(['pt_BR', 'es_419']), 'es')
})

test('Traditional Chinese never lands on Simplified: it falls through to the next tag', () => {
  assert.equal(pickInterfaceLanguage(['zh-TW', 'nl-NL']), 'nl')
  assert.equal(pickInterfaceLanguage(['zh-Hant-HK']), 'en')
})

test('nothing usable reads as English', () => {
  assert.equal(pickInterfaceLanguage(['ja-JP', 'ko']), 'en')
  assert.equal(pickInterfaceLanguage([]), 'en')
  assert.equal(pickInterfaceLanguage(undefined), 'en')
  assert.equal(pickInterfaceLanguage([42, null, '']), 'en')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AmbiguousLocaleError,
  normaliseLocale,
  normaliseLocales,
  SOURCE_LOCALE,
  sefOf,
  sourceVariant
} from '../src/locales.mjs'

/** `assert.throws` does not hand back the error, and these tests are about what it CARRIES. */
function thrown(fn) {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

test('the two-letter answers the Build form has always sent resolve to Joomla tags', () => {
  assert.equal(normaliseLocale('en'), 'en-GB')
  assert.equal(normaliseLocale('fr'), 'fr-FR')
  assert.equal(normaliseLocale('vi'), 'vi-VN')
})

test('a full tag is accepted in any casing and underscore spelling', () => {
  assert.equal(normaliseLocale('zh-cn'), 'zh-CN')
  assert.equal(normaliseLocale('ZH-CN'), 'zh-CN')
  assert.equal(normaliseLocale('zh_CN'), 'zh-CN')
  assert.equal(normaliseLocale('  fr-FR  '), 'fr-FR')
})

test('a language with two written forms is a QUESTION, never a default', () => {
  // The whole point: picking one silently ships a finished site in the wrong Chinese, which
  // reads as success to everyone until a customer opens it.
  const error = thrown(() => normaliseLocale('zh'))
  assert.ok(error instanceof AmbiguousLocaleError)
  assert.deepEqual(error.choices, ['zh-CN', 'zh-TW'])
  assert.match(error.message, /Simplified/)
  assert.match(error.message, /Traditional/)
  assert.deepEqual(thrown(() => normaliseLocale('pt')).choices, ['pt-PT', 'pt-BR'])
})

test('a BCP-47 script subtag is the same question, not a lookup that fails later', () => {
  // `zh-Hans` is well formed and Joomla files nothing under it; resolving it to a tag would turn
  // a spelling problem into "no pack exists", which sends the reader looking in the wrong place.
  for (const spelling of ['zh-Hans', 'zh-hant']) {
    const error = thrown(() => normaliseLocale(spelling))
    assert.ok(error instanceof AmbiguousLocaleError, spelling)
    assert.deepEqual(error.choices, ['zh-CN', 'zh-TW'])
  }
})

test('a string that is not a language tag says so', () => {
  for (const value of ['', '   ', 'english', 'x', 'fr-', '../etc', 'fr FR'])
    assert.throws(() => normaliseLocale(value), /required|not a Joomla language tag/)
  for (const value of [null, undefined, 42, ['fr']]) assert.throws(() => normaliseLocale(value), /required/)
})

test('a list collapses the two spellings of one language and always leads with the source', () => {
  assert.deepEqual(normaliseLocales(['en', 'en-GB', 'fr']), ['en-GB', 'fr-FR'])
  assert.deepEqual(normaliseLocales(['zh-CN']), ['en-GB', 'zh-CN'])
  assert.deepEqual(normaliseLocales([]), [SOURCE_LOCALE])
  assert.deepEqual(normaliseLocales(undefined), [SOURCE_LOCALE])
  // Order of the extra languages is the caller's; only the source is pinned to the front.
  assert.deepEqual(normaliseLocales(['fr-FR', 'zh-CN', 'en']), ['en-GB', 'fr-FR', 'zh-CN'])
})

test('the URL prefix is derived, never a second thing to keep in step', () => {
  assert.equal(sefOf('zh-CN'), 'zh')
  assert.equal(sefOf('fr-FR'), 'fr')
  assert.equal(sefOf('en-GB'), 'en')
})

// Lee, 23/09/2026: en-US beside an en-GB source is English, not a language to add — a copy of English
// into English, and one that loses the main menu because the archive ships no `tb-main-en-us`.
test('a variant of the source language is the source language', () => {
  assert.deepEqual(normaliseLocales(['en-us', 'vi-vn']), ['en-GB', 'vi-VN'])
  assert.deepEqual(normaliseLocales(['en-AU', 'en-GB']), ['en-GB'])
})

test('the source variant is the first English answer that is not the published tag', () => {
  assert.equal(sourceVariant(['en-us', 'vi-vn']), 'en-US')
  assert.equal(sourceVariant(['vi', 'en-AU', 'en-US']), 'en-AU')
  assert.equal(sourceVariant(['en', 'vi']), null)
  assert.equal(sourceVariant(['en-GB', 'en-US']), null)
  assert.equal(sourceVariant(['vi-VN']), null)
  assert.equal(sourceVariant(undefined), null)
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  CODES,
  defaultLanguage,
  defaultLanguages,
  languageLabel,
  languageName,
  resolve,
  rowsFor
} from '../src/client/languages.mjs'

describe('defaultLanguages — English, plus the person’s language when it is another one on offer', () => {
  it('an English page starts with English alone', () => {
    assert.deepEqual(defaultLanguages('en', undefined), ['en'])
    assert.deepEqual(defaultLanguages('en-GB', ['en', 'ru']), ['en'])
  })
  it('a Vietnamese page starts with English and Vietnamese when the build takes any language', () => {
    assert.deepEqual(defaultLanguages('vi', undefined), ['en', 'vi'])
    assert.deepEqual(defaultLanguages('zh-TW', undefined), ['en', 'zh-TW'])
  })
  it('a language the build cannot honour is not promised: the template ships en and ru', () => {
    assert.deepEqual(defaultLanguages('vi', ['en', 'ru']), ['en'])
    assert.deepEqual(defaultLanguages('ru', ['en', 'ru']), ['en', 'ru'])
  })
  it('a regional tag falls back to its base when only the base is offered', () => {
    assert.deepEqual(defaultLanguages('pt-BR', ['en', 'pt']), ['en', 'pt'])
  })
  it('a build without English still starts with something it can build', () => {
    assert.deepEqual(defaultLanguages('vi', ['ru']), ['ru'])
    assert.deepEqual(defaultLanguages(undefined, undefined), ['en'])
  })
})

describe('an offer written as Joomla tags — the questionnaire of a build with language packs', () => {
  const OFFER = ['en-gb', 'de-de', 'vi-vn', 'zh-cn', 'zh-tw', 'pt-br', 'pt-pt']
  it('English is found under its tag', () => {
    assert.deepEqual(defaultLanguages(undefined, OFFER), ['en-gb'])
    assert.deepEqual(defaultLanguages('en-GB', OFFER), ['en-gb'])
  })
  it('a two-letter interface language lands on the tag with that base', () => {
    assert.deepEqual(defaultLanguages('vi', OFFER), ['en-gb', 'vi-vn'])
    assert.deepEqual(defaultLanguages('de', OFFER), ['en-gb', 'de-de'])
  })
  it('a regional interface language picks its OWN region, never a sibling', () => {
    // Traditional Chinese must not become Simplified because both share the base.
    assert.deepEqual(defaultLanguages('zh-TW', OFFER), ['en-gb', 'zh-tw'])
    assert.deepEqual(defaultLanguages('pt-BR', OFFER), ['en-gb', 'pt-br'])
  })
  it('a language the build cannot honour is not preselected', () => {
    assert.deepEqual(defaultLanguages('th', OFFER), ['en-gb'])
  })
  it('resolve: exact beats base, base beats nothing, and no offer means anything', () => {
    assert.equal(resolve('zh-TW', OFFER), 'zh-tw')
    assert.equal(resolve('zh', OFFER), 'zh-cn', 'the first tag with that base — the form then shows both')
    assert.equal(resolve('th', OFFER), undefined)
    assert.equal(resolve('th', undefined), 'th')
    assert.equal(resolve('ru', ['en', 'ru']), 'ru')
  })
})

describe('rowsFor — what the picker offers, in shortlist order, named by the browser', () => {
  it('no offer means the two-letter list, English first', () => {
    const rows = rowsFor(undefined)
    assert.equal(rows.length, CODES.length)
    assert.equal(rows[0].code, 'en')
  })
  it('a two-letter offer is a subset of that list in the same order', () => {
    assert.deepEqual(
      rowsFor(['ru', 'en']).map((r) => r.code),
      ['en', 'ru']
    )
  })
  it('every two-letter code offered is a row, the ones the shortlist does not know after the rest', () => {
    // Tracy Business ships `be`, `ka` and `nb`; filtered through CODES the box drew 37 of its 40.
    assert.deepEqual(
      rowsFor(['en', 'ru', 'be', 'ka', 'nb', 'vi']).map((r) => r.code),
      ['en', 'ru', 'vi', 'be', 'ka', 'nb']
    )
    assert.equal(rowsFor(['en', 'en', 'be']).length, 2, 'an offer listed twice is one row')
  })
  it('a tag offer is its own rows, ordered by the base language of each tag', () => {
    const rows = rowsFor(['zh-tw', 'vi-vn', 'en-gb', 'zh-cn', 'de-de']).map((r) => r.code)
    // en first, zh before de (CODES order), the two Chineses side by side and stable
    assert.deepEqual(rows, ['en-gb', 'zh-cn', 'zh-tw', 'de-de', 'vi-vn'])
  })
  it('the chip reads the English name of the language alone — no native name, no region', () => {
    // 24/09/2026: "just English, Vietnamese, Spanish is enough".
    assert.equal(languageLabel('vi-vn'), 'Vietnamese')
    assert.equal(languageLabel('es-es'), 'Spanish')
    assert.equal(languageLabel('en-us'), 'English')
    assert.equal(languageLabel('en'), 'English')
    assert.equal(languageLabel('pt-br'), languageLabel('pt-pt'))
  })
  it('the two Chineses stay apart, by script', () => {
    assert.equal(languageLabel('zh-cn'), 'Simplified Chinese')
    assert.equal(languageLabel('zh-tw'), 'Traditional Chinese')
    assert.equal(languageLabel('zh-hk'), 'Traditional Chinese')
  })
  it('a language offered in several regions is ONE row', () => {
    const OFFER = [
      'en-gb',
      'en-au',
      'en-ca',
      'en-nz',
      'en-us',
      'es-mx',
      'es-es',
      'zh-cn',
      'zh-tw',
      'zh-hk',
      'vi-vn'
    ]
    assert.deepEqual(
      rowsFor(OFFER).map((r) => r.code),
      ['en-us', 'zh-cn', 'zh-tw', 'es-es', 'vi-vn']
    )
    assert.deepEqual(
      rowsFor(OFFER).map((r) => r.label),
      ['English', 'Simplified Chinese', 'Traditional Chinese', 'Spanish', 'Vietnamese']
    )
  })
  it('the row stands for the tag already picked, so the English the form started with is not offered twice', () => {
    const rows = rowsFor(['en-gb', 'en-au', 'en-us', 'vi-vn'], ['en-au'])
    assert.deepEqual(
      rows.map((r) => r.code),
      ['en-au', 'vi-vn']
    )
  })
  it('the search still knows the native name and the code', () => {
    const vi = rowsFor(['en-us', 'vi-vn']).find((r) => r.code === 'vi-vn')
    assert.ok(vi?.search.includes('tiếng việt'))
    assert.ok(vi?.search.includes('vi-vn'))
  })
  it('a code the browser cannot name comes back as itself, not as a throw', () => {
    // Intl decorates an unknown region ("xx (Unknown Region)") unless told not to; the code is honest.
    assert.equal(languageLabel('xx-zz'), 'xx-ZZ')
  })
})

it('the name spoken to the agent is English only — no script that would reread the session', () => {
  assert.equal(languageName('zh-cn'), 'Chinese (China)')
  assert.equal(languageName('vi-vn'), 'Vietnamese (Vietnam)')
  assert.equal(languageName('xx-zz'), 'xx-ZZ')
  for (const code of ['zh-cn', 'zh-tw', 'ja-jp', 'vi-vn', 'ru-ru'])
    assert.ok(!/[一-鿿ăđạ-ỹЀ-ӿ]/i.test(languageName(code)), code)
  assert.equal(languageLabel('zh-cn'), 'Simplified Chinese')
})

// A quickstart with no second edition (ja-kinetic) is built in ONE language, so the form offers one:
// the person's own when it is on offer, English otherwise — never two preselected.
it('one-language default: the person’s language when offered, else English, else the first offered', () => {
  assert.deepEqual(defaultLanguage('vi', ['en-gb', 'vi-vn', 'fr-fr']), 'vi-vn')
  assert.deepEqual(defaultLanguage('de', ['en-gb', 'vi-vn']), 'en-gb')
  assert.deepEqual(defaultLanguage('vi', ['fr-fr', 'de-de']), 'fr-fr')
  assert.deepEqual(defaultLanguage('vi', undefined), 'vi')
})

// Lee, 24/09/2026: a Joomla build offers five Englishes (the source en-GB, and en-US, en-AU, en-CA,
// en-NZ that relabel it). The form starts with the English the person's browser writes in, and with
// American English when the browser says no English at all — not with whichever came first.
describe('which English a build starts with, when it offers more than one', () => {
  const OFFER = ['en-gb', 'af-za', 'en-au', 'en-ca', 'en-nz', 'en-us', 'vi-vn']
  it('the browser’s own English wins', () => {
    assert.deepEqual(defaultLanguages('en', OFFER, ['en-GB', 'en']), ['en-gb'])
    assert.deepEqual(defaultLanguages('en', OFFER, ['en-AU']), ['en-au'])
    assert.deepEqual(defaultLanguages('en', OFFER, ['vi-VN', 'en-CA']), ['en-ca'])
  })
  it('a browser that names no English region starts with American English', () => {
    assert.deepEqual(defaultLanguages('en', OFFER, ['en']), ['en-us'])
    assert.deepEqual(defaultLanguages('vi', OFFER, ['vi-VN']), ['en-us', 'vi-vn'])
    assert.deepEqual(defaultLanguages('en', OFFER), ['en-us'])
  })
  it('an English region not on offer falls back to American English, not to the first listed', () => {
    assert.deepEqual(defaultLanguages('en', OFFER, ['en-IE']), ['en-us'])
  })
  it('an offer with one English keeps it', () => {
    assert.deepEqual(defaultLanguages('en', ['en-gb', 'vi-vn'], ['en-US']), ['en-gb'])
    assert.deepEqual(defaultLanguages('en', ['en', 'ru'], ['en-US']), ['en'])
  })
  it('a one-language build takes the same English', () => {
    assert.equal(defaultLanguage('en', OFFER, ['en-GB']), 'en-gb')
    assert.equal(defaultLanguage('en', OFFER, ['en']), 'en-us')
    assert.equal(defaultLanguage('vi', OFFER, ['vi-VN']), 'vi-vn')
  })
})

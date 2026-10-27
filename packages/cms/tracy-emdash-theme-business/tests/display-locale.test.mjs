// The display tag of a stored locale (src/lib/display-locale.ts): a well-formed tag for a shipped locale,
// including another language for a root written in it; a broken or hostile file prints nothing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDisplayLocales, switcherOptionOf } from '../src/lib/display-locale.ts'

const LOCALES = ['en', 'vi', 'ru']

test('a regional English is shown for en; the stored locale and the URLs stay en', () => {
  assert.deepEqual(parseDisplayLocales({ en: 'en-US' }, LOCALES), { en: 'en-US' })
  assert.deepEqual(parseDisplayLocales({ en: 'en-GB', vi: 'vi-VN' }, LOCALES), { en: 'en-GB', vi: 'vi-VN' })
})

test('a root written in another language shows that language (TCH #1013, D10)', () => {
  assert.deepEqual(parseDisplayLocales({ en: 'vi-VN' }, LOCALES), { en: 'vi-VN' })
  assert.deepEqual(
    parseDisplayLocales({ en: 'vi' }, LOCALES),
    { en: 'vi' },
    'a language named without a region'
  )
  assert.deepEqual(parseDisplayLocales({ en: 'zh-TW' }, LOCALES), { en: 'zh-TW' })
})

test('a locale the template does not ship, or anything that is not a language tag, is ignored', () => {
  assert.deepEqual(parseDisplayLocales({ de: 'de-DE' }, LOCALES), {})
  assert.deepEqual(
    parseDisplayLocales({ en: 'en-us' }, LOCALES),
    {},
    'region upper-case, as BCP 47 prints it'
  )
  assert.deepEqual(parseDisplayLocales({ en: '<script>' }, LOCALES), {})
  assert.deepEqual(parseDisplayLocales({ en: 'VI' }, LOCALES), {})
  assert.deepEqual(parseDisplayLocales({ en: 'vi-VN" onload="x' }, LOCALES), {})
  assert.deepEqual(parseDisplayLocales(null, LOCALES), {})
  assert.deepEqual(parseDisplayLocales(['en-US'], LOCALES), {})
})

test('the switcher names the language the page is shown in, not the stored locale (TCH #1013, LANG-2, g60)', () => {
  const names = { en: 'English', vi: 'Tiếng Việt' }
  assert.deepEqual(
    switcherOptionOf('en', 'vi-VN', (l) => names[l]),
    { code: 'vi-VN', name: 'Tiếng Việt' },
    'a root stored as en and written in Vietnamese is never "English" with a US flag'
  )
  assert.deepEqual(
    switcherOptionOf('en', 'en', (l) => names[l]),
    { code: 'en', name: 'English' }
  )
  assert.deepEqual(
    switcherOptionOf('en', 'en-US', (l) => names[l]),
    { code: 'en-US', name: 'English' }
  )
  assert.deepEqual(
    switcherOptionOf('en', 'vi-VN'),
    { code: 'vi-VN', name: 'Tiếng Việt' },
    'a template with no words for that language names it in itself'
  )
})

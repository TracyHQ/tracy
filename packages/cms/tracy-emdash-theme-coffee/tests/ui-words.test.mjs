// The words the template says itself, in every language a customer can pick (src/lib/ui-words.ts, TCH #1013 T25b).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LABEL_FIELDS, localizeLabels } from '../src/lib/chrome-labels.ts'
import { UI_WORDS, fillWords, uiCount, uiDate, uiWords } from '../src/lib/ui-words.ts'

// The cleaned site-language list of the seven default questions (packages/site/tracy-site-build-emdash/questions.json).
const LANGUAGES = [
  'en-us',
  'af-za',
  'be-by',
  'bg-bg',
  'ca-es',
  'cs-cz',
  'cy-gb',
  'da-dk',
  'de-de',
  'el-gr',
  'en-gb',
  'es-es',
  'et-ee',
  'fi-fi',
  'fr-fr',
  'hr-hr',
  'hu-hu',
  'it-it',
  'ja-jp',
  'ka-ge',
  'lo-la',
  'lt-lt',
  'lv-lv',
  'ms-my',
  'nb-no',
  'nl-nl',
  'pl-pl',
  'pt-br',
  'pt-pt',
  'ro-ro',
  'ru-ru',
  'sk-sk',
  'sl-si',
  'sr-rs',
  'sv-se',
  'ta-in',
  'th-th',
  'tr-tr',
  'uk-ua',
  'vi-vn',
  'zh-cn',
  'zh-tw'
]
const KEYS = Object.keys(UI_WORDS.en)
const placeholders = (m) =>
  [...String(typeof m === 'string' ? m : m.other).matchAll(/\{(\w+)\}/g)]
    .map((x) => x[1])
    .sort()
    .join()

test('every language of the list has its own table, complete', () => {
  assert.equal(LANGUAGES.length, 42)
  for (const tag of LANGUAGES) {
    const language = tag.split('-')[0]
    if (language === 'en') continue
    assert.ok(UI_WORDS[language], `${tag}: no table for ${language}`)
    for (const key of KEYS) assert.ok(key in UI_WORDS[language], `${language}: ${key} missing`)
  }
})

test('a translation keeps the placeholders of the English word', () => {
  for (const [language, table] of Object.entries(UI_WORDS))
    for (const [key, value] of Object.entries(table))
      assert.equal(placeholders(value), placeholders(UI_WORDS.en[key]), `${language}.${key}`)
})

test('the display tag picks the words: exact tag, then its language, then English', () => {
  assert.equal(uiWords('vi-VN').readMore, 'Đọc tiếp')
  assert.equal(uiWords('de').readMore, 'Weiterlesen')
  assert.equal(uiWords('zh-TW').home, '首頁', 'Traditional Chinese has its own table')
  assert.equal(uiWords('zh-CN').home, '首页')
  assert.equal(uiWords('pt-PT').next, 'Seguinte', 'a regional table says only what differs')
  assert.equal(uiWords('pt-PT').home, 'Início')
  assert.equal(uiWords('en-US').home, 'Home')
  assert.equal(uiWords('xx-YY').home, 'Home', 'an unknown language reads as English, never blank')
  assert.equal(uiWords(null).home, 'Home')
})

test('a message with placeholders fills them; an unknown one is left as written', () => {
  assert.equal(fillWords(uiWords('fr').pageOf, { page: 2, pages: 5 }), 'Page 2 sur 5')
  assert.equal(fillWords('{count} x {other}', { count: 3 }), '3 x {other}')
  assert.equal(uiCount('en', { one: '{count} item', other: '{count} items' }, 2), '2 items')
})

test('an interface label still at its English default follows the site language; a changed one is kept', () => {
  const seed = {
    read_more: 'Read more',
    prev_label: 'Previous',
    page_meta: 'Page {page} of {pages}',
    brand_name: 'Acme',
    contact_label: 'Kontaktieren Sie uns'
  }
  const de = localizeLabels(seed, 'de-DE')
  assert.equal(de.read_more, 'Weiterlesen')
  assert.equal(de.prev_label, 'Zurück')
  assert.equal(de.page_meta, 'Seite {page} von {pages}')
  assert.equal(de.brand_name, 'Acme', 'business words are not interface labels')
  assert.equal(de.contact_label, 'Kontaktieren Sie uns', 'a label someone rewrote is theirs')
  assert.equal(localizeLabels(seed, 'en-US'), seed, 'English leaves the entry as it is')
  for (const key of Object.values(LABEL_FIELDS)) assert.ok(key in UI_WORDS.en, key)
})

test('dates are the language own, Gregorian, from the stored UTC day', () => {
  const d = new Date('2026-07-08T00:00:00Z')
  assert.equal(uiDate('de-DE', d, { day: 'numeric', month: 'long', year: 'numeric' }), '8. Juli 2026')
  assert.match(uiDate('th-TH', d, { month: 'long', year: 'numeric' }), /2026/, 'never the Buddhist year')
  assert.equal(uiDate('fr', null, { month: 'long' }), '')
})

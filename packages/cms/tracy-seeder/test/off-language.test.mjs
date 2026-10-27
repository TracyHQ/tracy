// Which values the model wrote in another language than their slot's.
//
// The planners name each slot's language, and the model still wrote whole batches in the language
// the brief was typed in (measured 23/09/2026 with `--dry` on `wp-g4bjus`: one run in three, 11
// Vietnamese values in one batch of 35 of the English edition). These pin what the letter test
// catches — and, as deliberately, what it lets through.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alphabetsOf, languageComplaint, offLanguage } from '../src/off-language.mjs'

const languageOf = (slot) => slot.language
const edition = (language, samples) =>
  samples.map((sample, i) => ({ key: `${language}.${i}`, language, sample }))
const alphabets = alphabetsOf(
  [
    ...edition('en-GB', ['Built for the way you drive', 'Book a service today']),
    ...edition('de-DE', ['Für Sie gebaut', 'Über uns — größer denken']),
    ...edition('zh-CN', ['为您打造', '联系我们']),
    { key: 'shared', language: '*', sample: 'Ignored' }
  ],
  languageOf
)
const check = (value, language, extra = {}) =>
  offLanguage({ s: value }, [{ key: 's', language, ...extra }], {
    languageOf,
    alphabets,
    keep: extra.keep ?? []
  }).has('s')

test('Vietnamese in the English edition is caught, a sentence or a short label', () => {
  assert.equal(check('Đại lý xe Toyota chính hãng tại Hà Nội', 'en-GB'), true)
  assert.equal(check('Chúng tôi cung cấp dịch vụ bảo dưỡng xe chuyên nghiệp', 'en-GB'), true)
  assert.equal(check('Trang chủ', 'en-GB'), true, 'a navigation label')
  assert.equal(check('Đặt lịch hẹn', 'en-GB'), true)
})

test('🔒 names keep their spelling: capitalised words and the brief’s own name are not evidence', () => {
  assert.equal(check('The best Toyota dealer in Hà Nội', 'en-GB'), false, 'a place')
  assert.equal(check('Ask for Nguyễn Văn An', 'en-GB'), false, 'a person')
  // The name alone in a heading slot: its one lower-case word is Vietnamese, so only taking the
  // brief's own name out first keeps it.
  assert.equal(check('Tiệm bánh Cô Ba', 'en-GB', { keep: ['Tiệm bánh Cô Ba'] }), false, 'the name, taken out')
  assert.equal(check('Tiệm bánh Cô Ba', 'en-GB'), true, '…and caught without it')
})

test('an English value that mentions a local street is not refused for it', () => {
  // One foreign word out of four lower-case ones. An address with as many Vietnamese words as
  // English ones is refused, and keeps the demo words: the cheaper of the two mistakes.
  assert.equal(check('Visit our showroom at 123 đường Láng', 'en-GB'), false)
  assert.equal(check('Bán xe mới', 'en-GB'), true, 'one ASCII word does not make a Vietnamese label English')
})

test('each edition keeps its own letters: umlauts in German, Han characters the samples never used', () => {
  assert.equal(check('Wir bauen größere Häuser für Familien', 'de-DE'), false)
  assert.equal(
    check('我们提供专业的汽车维修服务', 'zh-CN'),
    false,
    'a script is compared, not every character'
  )
  assert.equal(check('Đại lý xe chính hãng', 'zh-CN'), true, 'Vietnamese in the Chinese edition')
  assert.equal(check('我们提供专业的汽车维修服务', 'en-GB'), true, 'Chinese in the English edition')
})

test('what cannot be told is let through, on purpose', () => {
  assert.equal(check('Dai ly xe chinh hang tai Ha Noi', 'en-GB'), false, 'Vietnamese typed without accents')
  assert.equal(check('Đại lý xe chính hãng', '*'), false, 'content for every language')
  assert.equal(check('Đại lý xe chính hãng', undefined), false, 'no language on the slot')
  assert.equal(check('Đại lý xe chính hãng', 'fr-FR'), false, 'an edition with no samples to learn from')
  assert.equal(check('https://xe.vn/đặt-lịch', 'en-GB', { type: 'url' }), false, 'a url slot')
  assert.equal(
    check('Dịch vụ tận tâm, giá tốt', 'en-GB', { requiresEvidence: true }),
    false,
    'an evidence-required value is a verbatim excerpt of the brief'
  )
})

test('an answer that is not an object has nothing to judge', () => {
  const slots = [{ key: 's', language: 'en-GB' }]
  assert.equal(offLanguage(null, slots, { languageOf, alphabets }).size, 0)
  assert.equal(offLanguage(['x'], slots, { languageOf, alphabets }).size, 0)
})

test('the complaint names the slots and the language to write in', () => {
  assert.equal(
    languageComplaint(new Set(['home.hero', 'home.intro']), ['en']),
    "Your previous answer wrote 2 value(s) in another language than their slot names: home.hero, home.intro. Write every value in its slot's language (en), whatever language the brief is written in. Names keep their spelling."
  )
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { localeCase, localeRefusal } from '../src/sites/route.js'

test('content.read locale is sent in BCP 47 case: the HTML lang the agent reads becomes the listed tag', () => {
  // Measured 25/09/2026 on dev (fj1823): `page.text` said lang "en-gb", site.locales says "en-GB",
  // and the Claude Cowork plugin refused the lower-case one with a bare "Invalid content query".
  for (const [given, sent] of [
    ['en-gb', 'en-GB'],
    ['EN-GB', 'en-GB'],
    ['en-GB', 'en-GB'],
    ['vi', 'vi'],
    ['VI', 'vi'],
    ['zh-hant-tw', 'zh-Hant-TW'],
    ['es-419', 'es-419'],
    ['sr-latn', 'sr-Latn']
  ]) {
    assert.equal(localeCase(given), sent, given)
  }
  // Only case: a legacy tag a site may list verbatim is not rewritten, and a non-string passes through.
  assert.equal(localeCase('iw'), 'iw')
  assert.equal(localeCase(undefined), undefined)
  assert.equal(localeCase(3), 3)
})

test('an unknown content.read locale is refused BY NAME, with the site tag that shares its language', () => {
  // Measured 25/09/2026 on dev (fj1823, cbc047b5e): `{type:"page", locale:"en"}` came back as a bare
  // "Invalid content query", and the turn fell back to contract inspects (118 s).
  const site = ['en-GB', 'ru-RU']
  assert.equal(
    localeRefusal('en', site),
    `locale "en" is not one of this site's locales: en-GB, ru-RU; use "en-GB"`
  )
  // Listed → no refusal of ours (the Claude Cowork plugin's own answer stands); no list → nothing to say.
  assert.equal(localeRefusal('en-GB', site), null)
  assert.equal(localeRefusal('en', undefined), null)
  assert.equal(localeRefusal(undefined, site), null)
  // Two tags share the language: both are listed, none is picked.
  assert.equal(
    localeRefusal('pt', ['pt-BR', 'pt-PT', 'en-US']),
    `locale "pt" is not one of this site's locales: pt-BR, pt-PT, en-US`
  )
  // A long list is cut, and says how long it was.
  const many = Array.from({ length: 41 }, (_, i) => `x${i}`)
  assert.match(localeRefusal('zz', many), /… \(41\)$/)
})

// `localeOfLink` (src/sites/content-pages.js): which language a pasted link names, so view=pages walks one
// language instead of all of them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localeOfLink } from '../src/sites/content-pages.js'

const locales = ['en', 'es', 'de', 'pt-br', 'zh']

test('a language prefix names the language; no prefix is the default language', () => {
  const site = 'https://gf1410.tracy.site'
  assert.equal(localeOfLink('https://gf1410.tracy.site/es/investors', locales, 'en', site), 'es')
  assert.equal(localeOfLink('gf1410.tracy.site/de/', locales, 'en', site), 'de')
  assert.equal(localeOfLink('/pt-BR/about', locales, 'en', site), 'pt-br')
  assert.equal(localeOfLink('/about-us', locales, 'en', site), 'en')
  assert.equal(localeOfLink('/', locales, 'en', site), 'en')
})

test('a prefix that is a region-less form of a full tag still names it; anything unsure names none', () => {
  // Joomla's SEF prefix is the short code; its locales are full tags.
  assert.equal(localeOfLink('/ru/projects', ['en-GB', 'ru-RU'], 'en-GB', null), 'ru-RU')
  // Two tags share the short code: unsure, so no filter (the caller walks every language).
  assert.equal(localeOfLink('/pt/x', ['pt-BR', 'pt-PT'], 'en', null), null)
  // No locale list, or no default for an unprefixed link: no filter.
  assert.equal(localeOfLink('/es/x', [], null, null), null)
  assert.equal(localeOfLink('/about', ['en', 'es'], null, null), null)
})

/**
 * The public Find picks its language by tracy-web's own rule (copied, since that module reads files
 * with `node:fs`) and speaks the plugin's dictionaries, English where a key has no translation.
 *
 *   node --test packages/web/tracy-wo-find-page/test/public-locale.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  WEB_LANGUAGES,
  matchLanguage as webMatchLanguage,
  resolveLanguage as webResolveLanguage
} from '../../../../apps/tracy-web/src/lib/i18n/index.js'
import { PAGE_LANGUAGES, matchLanguage, resolveLanguage, translatorFor } from '../src/locale.ts'

test('the page and tracy-web pick the same language for the same tags', () => {
  assert.deepEqual([...PAGE_LANGUAGES], [...WEB_LANGUAGES])
  for (const tag of [
    'vi',
    'vi-VN',
    'de-AT',
    'zh',
    'zh-CN',
    'zh-TW',
    'zh-Hant-HK',
    'pt-BR',
    'EN_us',
    '',
    null,
    42,
    'x'.repeat(40)
  ])
    assert.equal(matchLanguage(tag), webMatchLanguage(tag), String(tag))
  const cases = [
    { query: 'fr', cookie: 'vi', browser: ['de'] },
    { query: 'xx', cookie: 'vi', browser: ['de'] },
    { query: null, cookie: null, browser: ['zh-TW', 'nl'] },
    { query: null, cookie: null, browser: [] }
  ]
  for (const c of cases)
    assert.equal(
      resolveLanguage(c),
      webResolveLanguage({ query: c.query, cookie: c.cookie, acceptLanguage: c.browser.join(',') })
    )
})

test('the public words exist in every language and fall back to English', () => {
  for (const lang of PAGE_LANGUAGES) {
    const t = translatorFor(lang)
    assert.notEqual(t('public.title'), 'public.title', lang)
    assert.match(t('public.continue.other', { count: 4 }), /4/, lang)
  }
  assert.equal(translatorFor('vi')('public.title'), 'Tìm nhà hàng quanh bạn')
  assert.equal(translatorFor('en')('public.title'), 'Find restaurants near you')
})

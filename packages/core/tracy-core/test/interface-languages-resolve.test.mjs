/**
 * The browser-side language rule every page outside dsh shares (`/ops`, the public Design templates
 * page): which interface language a tag, a cookie or the browser's list means, and the text a
 * dictionary gives for a key. Compared tag for tag with tracy-web's own rule, which reads files with
 * `node:fs` and so cannot be the browser's copy.
 *
 *   node --test packages/core/tracy-core/test/interface-languages-resolve.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  matchLanguage as webMatchLanguage,
  resolveLanguage as webResolveLanguage
} from '../../../../apps/tracy-web/src/lib/i18n/index.js'
import {
  cookieValue,
  firstLanguage,
  htmlLang,
  interpolate,
  matchLanguage,
  resolveLanguage,
  textOf,
  translate
} from '../src/interface-languages/resolve.mjs'

test('a tag means the language tracy-web says it means, Traditional Chinese never Simplified', () => {
  for (const tag of [
    'de-AT',
    'EN_us',
    'zh',
    'zh-CN',
    'zh-Hans',
    'zh-SG',
    'zh-TW',
    'zh-HK',
    'zh-MO',
    'zh-Hant',
    'zh-hant-hk',
    'pt-BR',
    '',
    ' de ',
    'x'.repeat(36),
    null,
    7,
    {}
  ])
    assert.equal(matchLanguage(tag), webMatchLanguage(tag), JSON.stringify(tag))
  assert.equal(matchLanguage('zh-TW'), null)
  assert.equal(matchLanguage('zh-Hant-TW'), null)
  assert.equal(matchLanguage('zh-Hans-CN'), 'zh')
  assert.equal(matchLanguage('nl-BE'), 'nl')
})

test('the first tag that names a language wins; junk, unknown and Traditional Chinese are skipped', () => {
  assert.equal(firstLanguage(['klingon', null, 'zh-TW', 'fr-CA', 'de']), 'fr')
  assert.equal(firstLanguage(['ja', 'pt-BR']), null)
  assert.equal(firstLanguage('de'), null, 'a string is not a list')
  assert.equal(firstLanguage(undefined), null)
})

test('`?lang=`, then the remembered pick, then the browser, then English, as tracy-web orders them', () => {
  for (const [query, cookie, browser, accept] of [
    ['de', 'fr', ['es'], 'es'],
    ['xx', 'fr', ['es'], 'es'],
    [null, 'klingon', ['es-ES'], 'es-ES'],
    [null, null, ['zh-TW', 'de'], 'zh-TW,de;q=0.5'],
    [null, null, [], '']
  ])
    assert.equal(
      resolveLanguage({ query, cookie, browser }),
      webResolveLanguage({ query, cookie, acceptLanguage: accept }),
      JSON.stringify({ query, cookie, browser })
    )
  assert.equal(resolveLanguage(), 'en')
  assert.equal(resolveLanguage({ browser: 'de' }), 'en')
})

test('a cookie is read by its exact name, and an undecodable one reads as none', () => {
  assert.equal(cookieValue('a=1; tracy_lang=fr ; b=2', 'tracy_lang'), 'fr')
  assert.equal(cookieValue('xtracy_lang=de', 'tracy_lang'), null)
  assert.equal(cookieValue('tracy_lang=%E0%A4%A', 'tracy_lang'), null)
  assert.equal(cookieValue(undefined, 'tracy_lang'), null)
})

test('`<html lang>` writes Chinese as zh-CN, the way dsh writes it', () => {
  assert.equal(htmlLang('zh'), 'zh-CN')
  assert.equal(htmlLang('de'), 'de')
})

test('a key reads in the first dictionary that has non-empty text for it, its placeholders filled', () => {
  const de = { 'a.hello': 'Hallo {name}', 'a.empty': '' }
  const en = { 'a.hello': 'Hello {name}', 'a.empty': 'Empty', 'a.only': 'Only English' }
  assert.equal(translate([de, en], 'a.hello', { name: 'Ana' }), 'Hallo Ana')
  assert.equal(translate([de, en], 'a.empty'), 'Empty', 'empty text falls through')
  assert.equal(translate([de, en], 'a.only'), 'Only English')
  assert.equal(translate([undefined, en], 'a.only'), 'Only English')
  assert.equal(translate([de, en], 'a.none'), 'a.none', 'nothing anywhere: the key, never a crash')
  assert.equal(translate([de, en], '__proto__'), '__proto__')
  assert.equal(textOf(en, 'toString'), null)
  assert.equal(interpolate('{n} of {total}', { n: 2 }), '2 of {total}', 'an unknown placeholder stays')
})

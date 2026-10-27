import assert from 'node:assert/strict'
import { test } from 'node:test'
import { siteLanguageTwins } from '../src/release-site-language.mjs'

test("an overlaid template language file also replaces the site's installed copy", () => {
  // JA Fresco 1.0.3: Joomla reads language/en-GB/en-GB.tpl_ja_fresco.ini first, so a key added to the
  // template's file alone showed raw
  const site = new Set([
    'language/en-GB/en-GB.tpl_ja_fresco.ini',
    'language/en-GB/en-GB.tpl_ja_fresco.sys.ini'
  ])
  const twins = siteLanguageTwins(
    [
      'templates/ja_fresco/language/en-GB/en-GB.tpl_ja_fresco.ini',
      'templates/ja_fresco/language/en-GB/en-GB.tpl_ja_fresco.sys.ini',
      'templates/ja_fresco/css/template.css'
    ],
    (p) => site.has(p)
  )
  assert.deepEqual(twins, [
    {
      from: 'templates/ja_fresco/language/en-GB/en-GB.tpl_ja_fresco.ini',
      to: 'language/en-GB/en-GB.tpl_ja_fresco.ini'
    },
    {
      from: 'templates/ja_fresco/language/en-GB/en-GB.tpl_ja_fresco.sys.ini',
      to: 'language/en-GB/en-GB.tpl_ja_fresco.sys.ini'
    }
  ])
})

test('no installed copy, or one the overlay brings itself, is left alone', () => {
  const from = 'templates/ja_x/language/vi-VN/vi-VN.tpl_ja_x.ini'
  assert.deepEqual(
    siteLanguageTwins([from], () => false),
    []
  )
  assert.deepEqual(
    siteLanguageTwins([from, 'language/vi-VN/vi-VN.tpl_ja_x.ini'], () => true),
    []
  )
  // a language file deeper in the template (an ACM block's) is not the template's own
  assert.deepEqual(
    siteLanguageTwins(['templates/ja_x/acm/hero/language/en-GB/en-GB.ini'], () => true),
    []
  )
})

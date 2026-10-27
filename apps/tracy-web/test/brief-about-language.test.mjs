/**
 * A description stands as typed only on a site of its own language (`aboutInLanguage`, `brief-engines/shared.js`). Measured
 * 13/10/2026 on the local stand: About typed in Vietnamese, Languages left blank (the site stays English), and JA Impact WP's
 * <title> read "JA Impact - Tiệm bánh gia đình ở Dubai": the tagline slot took the description's first clause as typed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { aboutInLanguage } from '../src/sites/brief-engines/shared.js'

test('a Vietnamese description does not stand as typed on an English site, and does on a Vietnamese one', () => {
  const vi = 'Tiệm bánh gia đình ở Dubai, nướng bánh mì sourdough mỗi sáng.'
  assert.equal(aboutInLanguage(vi, 'en-us'), false)
  assert.equal(aboutInLanguage(vi, 'vi-vn'), true)
  assert.equal(aboutInLanguage(vi, 'vi'), true)
})

test('other scripts the same way; plain Latin text, or nothing, stands anywhere', () => {
  assert.equal(aboutInLanguage('我们是上海的家庭面包坊。', 'en-us'), false)
  assert.equal(aboutInLanguage('我们是上海的家庭面包坊。', 'zh-cn'), true)
  assert.equal(
    aboutInLanguage('A family bakery in Hanoi.', 'vi-vn'),
    false,
    'English typed for a Vietnamese site is translated, not put up'
  )
  assert.equal(aboutInLanguage('A family bakery in Hanoi.', 'en-us'), true)
  assert.equal(
    aboutInLanguage('Eine Familienbäckerei in Hanoi.', 'de-de'),
    true,
    'a language with no letters of its own takes Latin text'
  )
  assert.equal(aboutInLanguage('', 'en-us'), true)
  assert.equal(aboutInLanguage(undefined, undefined), true)
})

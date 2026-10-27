// A language the customer did not choose is hidden, and its URLs go to the same page in the default
// locale. `personalize` unpublishes the language's entries (as Joomla retires them, PR #267); the
// redirect is what keeps `/ru/about` from answering in English under `lang="ru"`, which EmDash does
// on its own when the Russian entry is unpublished (measured on the E2E site, 22–23/09/2026).

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hiddenLocaleRedirect, prefixedLocale } from '../src/lib/locale-gate.ts'

const gate = { locales: ['en', 'ru', 'vi', 'zh'], defaultLocale: 'en', served: ['en', 'vi'] }

test('a hidden locale goes to the same page in the default locale, query kept', () => {
  assert.equal(hiddenLocaleRedirect('/ru/about', '', gate), '/about')
  assert.equal(hiddenLocaleRedirect('/ru/news/some-post', '?page=2', gate), '/news/some-post?page=2')
  assert.equal(hiddenLocaleRedirect('/ru', '', gate), '/', 'the locale home goes to the root')
  assert.equal(hiddenLocaleRedirect('/zh/', '', gate), '/')
})

test('a served locale, the default locale and everything that is not a locale stay where they are', () => {
  assert.equal(hiddenLocaleRedirect('/vi/about', '', gate), null, 'a chosen language is served')
  assert.equal(hiddenLocaleRedirect('/about', '', gate), null, 'the default locale is never prefixed')
  assert.equal(hiddenLocaleRedirect('/en/about', '', gate), null, 'nor moved by this gate')
  assert.equal(hiddenLocaleRedirect('/', '', gate), null)
  assert.equal(hiddenLocaleRedirect('/_emdash/admin', '', gate), null, 'the admin owns its URLs')
  assert.equal(hiddenLocaleRedirect('/ruby-on-rails', '', gate), null, 'a prefix is a whole segment')
  assert.equal(hiddenLocaleRedirect('/xx/about', '', gate), null, 'a locale the template does not ship')
})

test('only the prefix of a shipped, non-default locale is one the gate can move', () => {
  assert.equal(prefixedLocale('/ru/about', gate), 'ru')
  assert.equal(prefixedLocale('/en/about', gate), null)
  assert.equal(prefixedLocale('/about', gate), null)
  assert.equal(prefixedLocale('/', gate), null)
})

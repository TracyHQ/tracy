/**
 * The Settings › Language picker offers exactly the languages Tracy supports (spec #730, ticket #731).
 *
 * The picker lists every language registered with dsh's locale service, so what decides the list is
 * who registers what: dsh's built-ins (en, zh), `dsh-locale-vi` (vi), the Tracy fork of
 * better-locale (its `BUNDLED_LANGUAGES`) and `@tracy/dsh-tracy-locales` (its `languages.json`). Pinned here against `@tracy/core/interface-languages`:
 *
 *   - built-ins + vi + better-locale = the shown languages, no more, no fewer;
 *   - a language still being translated (`shown: false`) is registered by nobody;
 *   - every bundle that loads better-locale also loads dsh-locale-vi, so vi is never missing where
 *     the four European languages are offered;
 *   - better-locale's labels match the list's.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { BUNDLED_LANGUAGES } from '../../../../vendor/tracy/dsh-better-locale/src/client/languages.ts'
import { INTERFACE_LANGUAGES, SHOWN_LANGUAGE_IDS } from '../src/interface-languages/index.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const DSH_BUILT_IN = ['en', 'zh']
const DSH_LOCALE_VI = ['vi']
/** Languages `@tracy/dsh-tracy-locales` adds itself (es). */
const TRACY_OWNED = JSON.parse(
  readFileSync(path.join(root, 'packages/locale/tracy-locales/languages.json'), 'utf8')
).map((l) => l.id)
const BUNDLES = [
  'packages/bundle/tracy-native/cordis.patch.yml',
  'packages/bundle/tracy-cowork/cordis.patch.yml'
]

test('the registered languages are exactly the shown ones', () => {
  const registered = [
    ...DSH_BUILT_IN,
    ...DSH_LOCALE_VI,
    ...TRACY_OWNED,
    ...BUNDLED_LANGUAGES.map((l) => l.id)
  ]
  assert.deepEqual([...registered].sort(), [...SHOWN_LANGUAGE_IDS].sort())
})

test('a language still being translated is registered by nobody', () => {
  const registered = new Set([
    ...DSH_BUILT_IN,
    ...DSH_LOCALE_VI,
    ...TRACY_OWNED,
    ...BUNDLED_LANGUAGES.map((l) => l.id)
  ])
  for (const language of INTERFACE_LANGUAGES.filter((l) => !l.shown)) {
    assert.equal(registered.has(language.id), false, `${language.id} is not shown yet but is registered`)
  }
})

test('every bundle loading better-locale also loads dsh-locale-vi', () => {
  for (const file of BUNDLES) {
    const text = readFileSync(path.join(root, file), 'utf8')
    assert.match(text, /- id: dsh-plugin-better-locale\b/, `${file} no longer loads better-locale`)
    assert.match(text, /- id: dsh-locale-vi\b/, `${file} loads better-locale without dsh-locale-vi`)
  }
})

test("better-locale's labels match the supported list", () => {
  const labels = new Map(INTERFACE_LANGUAGES.map((l) => [l.id, l.label]))
  for (const language of BUNDLED_LANGUAGES) {
    assert.equal(language.label, labels.get(language.id), `label of ${language.id}`)
  }
})

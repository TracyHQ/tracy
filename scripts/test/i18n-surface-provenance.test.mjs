/**
 * Where the translations added for #797 came from, checked against the catalogues they were
 * taken from (`fixtures/i18n-surface-provenance.json`).
 *
 * The rule of that change: a surface that had no translation takes the sentence an existing
 * catalogue already holds for the same English, word for word, and where no catalogue has it the
 * string reads in English and is LISTED. This test keeps both halves honest:
 *   - a listed source must exist, hold the same English, and hold exactly the shipped translation;
 *   - a string that reads in English must be on the list, and a listed one that has since been
 *     translated must be struck from it (so the list never claims more debt than there is, and
 *     never hides any).
 * A catalogue that does not parse, or holds something that is not a string, fails here by name.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { SAME_IN } from '../check-web-languages.mjs'
import { fileURLToPath } from 'node:url'
import { en as webEnglish } from '../../apps/tracy-web/src/lib/i18n/strings.js'
import { tsImport } from 'tsx/esm/api'
import { OWNED } from '../lib/tracy-owned-namespaces.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// The fork's sources import each other without file extensions (as upstream does, and tsc/esbuild
// resolve), which plain `node` cannot follow: load them through tsx, the way the fork's own tests run.
const door = (path) => tsImport(`../../vendor/tracy/dsh-passwords/src/${path}`, import.meta.url)
const { en: doorEnglish } = await door('client/locales.ts')
const { TRACY_STRINGS, t: gatewayText } = await door('tracy/i18n/index.ts')
const read = (path) => {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(join(ROOT, path), 'utf8'))
  } catch (error) {
    assert.fail(`${path}: cannot be read as JSON (${error.message})`)
  }
  assert.ok(
    parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed),
    `${path}: not a dictionary`
  )
  return parsed
}
const provenance = read('scripts/test/fixtures/i18n-surface-provenance.json')
// The keys a gateway page shows: upstream's `err.`/`gw.` strings (its dictionary is not exported,
// so they are read from its source) plus Tracy's own table, which adds the `tracy.` door.
const PAGE_KEY = /^(?:err|gw|tracy)\./
const upstreamGatewaySource = readFileSync(join(ROOT, 'vendor/tracy/dsh-passwords/src/i18n.ts'), 'utf8')
const GATEWAY_PAGE_KEYS = [
  ...new Set([
    ...[...upstreamGatewaySource.matchAll(/^\s*'((?:err|gw|tracy)\.[\w.]+)':/gm)].map((m) => m[1]),
    ...Object.keys(TRACY_STRINGS.en).filter((key) => PAGE_KEY.test(key))
  ])
]
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

/** A value by dotted path, for the nested catalogues of `@tracy/i18n`; a flat key is tried first. */
const valueAt = (dict, key) =>
  key in dict ? dict[key] : key.split('.').reduce((node, part) => node?.[part], dict)

/** The English a catalogue file translates, by where the file lives. */
function englishOf(file) {
  if (file.startsWith('apps/tracy-web/src/lib/i18n/locales/')) return webEnglish
  if (file.startsWith('packages/locale/tracy-i18n/src/locales/'))
    return read('packages/locale/tracy-i18n/src/locales/en-us.json')
  const ns = file
    .split('/')
    .pop()
    .replace(/\.json$/, '')
  if (ns === 'dshpw') return doorEnglish
  assert.ok(ns in OWNED, `${file}: no English source known for this catalogue`)
  return OWNED[ns]
}

/** A listed source: the same English as `english`, and the translation it holds. */
function sourced(reference, english, where) {
  const [file, key] = reference.split('#')
  assert.ok(file && key, `${where}: "${reference}" is not <file>#<key>`)
  assert.equal(
    valueAt(englishOf(file), key),
    english,
    `${where}: ${reference} translates a different English sentence`
  )
  const value = valueAt(read(file), key)
  assert.equal(typeof value, 'string', `${where}: ${reference} does not exist`)
  return value
}

test('gateway: every shipped translation is the sentence of the catalogue it names', () => {
  const { sources, own = {} } = provenance.gateway
  assert.deepEqual(Object.keys(sources).sort(), ['de', 'es', 'fr', 'it', 'nl', 'vi'])
  for (const [lang, rows] of Object.entries(sources)) {
    const file = `vendor/tracy/dsh-passwords/src/tracy/i18n/locales/${lang}.json`
    const shipped = read(file)
    // `own`: Tracy's own translation, with the reason it has no catalogue to copy from.
    const owned = own[lang] ?? {}
    for (const key of Object.keys(owned)) {
      assert.ok(!(key in rows), `${file}#${key}: both sourced and Tracy's own`)
      assert.ok(String(owned[key]).trim().length > 10, `${file}#${key}: Tracy's own needs a reason`)
    }
    assert.deepEqual(
      Object.keys(shipped).sort(),
      [...Object.keys(rows), ...Object.keys(owned)].sort(),
      `${file}: keys without a source, or sources without a key`
    )
    for (const [key, value] of Object.entries(shipped)) {
      assert.equal(typeof value, 'string', `${file}#${key}: not a string`)
      assert.ok(GATEWAY_PAGE_KEYS.includes(key), `${file}#${key}: not a key a gateway page shows`)
      const english = gatewayText('en', key)
      if (key in owned) assert.notEqual(value, english, `${file}#${key}: Tracy's own reads in English`)
      else
        assert.equal(
          value,
          sourced(rows[key], english, `${file}#${key}`),
          `${file}#${key}: differs from its source`
        )
      assert.deepEqual(placeholders(value), placeholders(english), `${file}#${key}: placeholders`)
      assert.notEqual(value, '', `${file}#${key}: empty`)
    }
  }
})

test('gateway: what reads in English is exactly the listed keys, in every language that has them', () => {
  const { languages, keys } = provenance.gateway.englishFallback
  for (const lang of languages) {
    const shipped = read(`vendor/tracy/dsh-passwords/src/tracy/i18n/locales/${lang}.json`)
    const untranslated = GATEWAY_PAGE_KEYS.filter((key) => !(key in shipped)).sort()
    assert.deepEqual(untranslated, keys, `${lang}: the list of English fallbacks is out of date`)
    for (const key of keys) assert.equal(gatewayText(lang, key), gatewayText('en', key), `${lang} ${key}`)
  }
  // zh is written out in full: nothing of it falls back.
  for (const key of GATEWAY_PAGE_KEYS) assert.notEqual(gatewayText('zh', key), key, key)
})

test('confirmation mail: every sentence is translated in every language (04/10/2026)', () => {
  const { languages } = provenance.confirmationMail
  const keys = Object.keys(webEnglish).filter((key) => key.startsWith('mail.confirmation'))
  assert.ok(keys.length > 0)
  for (const lang of languages) {
    const dict = read(`apps/tracy-web/src/lib/i18n/locales/${lang}.json`)
    const english = keys.filter(
      (key) => dict[key] === webEnglish[key] && !(SAME_IN[key] ?? []).includes(lang)
    )
    assert.deepEqual(english, [], `${lang}: still English`)
  }
})

test('My Sites: the failure line comes from the catalogue named, with only the listed word swapped', () => {
  const { sources, substitutions, englishFallback } = provenance.mySites
  const english = OWNED['tracy-my-sites']['state.failed']
  const fileOf = (lang) =>
    `${lang === 'vi' ? 'packages/locale/tracy-locale-vi/vi' : `packages/locale/tracy-locales/${lang}`}/tracy-my-sites.json`
  for (const [lang, rows] of Object.entries(sources)) {
    for (const [key, reference] of Object.entries(rows)) {
      let expected = sourced(reference, english, `${lang} ${key}`)
      const swap = substitutions[lang]?.[key]
      if (swap) {
        assert.ok(expected.includes(swap[0]), `${lang} ${key}: the source no longer holds "${swap[0]}"`)
        expected = expected.split(swap[0]).join(swap[1])
      }
      assert.equal(read(fileOf(lang))[key], expected, `${lang} ${key}`)
    }
  }
  for (const lang of ['vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']) {
    const isEnglish = read(fileOf(lang))['state.failed'] === english
    assert.equal(
      isEnglish,
      englishFallback.languages.includes(lang),
      `${lang}: the list of English fallbacks is out of date`
    )
    assert.equal(
      lang in sources || englishFallback.languages.includes(lang),
      true,
      `${lang}: neither sourced nor listed`
    )
  }
  assert.deepEqual(englishFallback.keys, ['state.failed'])
})

test('a source that is missing, or translates other English, fails by name', () => {
  assert.throws(
    () => sourced('packages/locale/tracy-locales/de/tracy-my-sites.json#no.such.key', 'Sign in', 'fixture'),
    /translates a different English/
  )
  assert.throws(
    () =>
      sourced(
        'packages/locale/tracy-locales/de/tracy-my-sites.json#action.signIn',
        'Something else',
        'fixture'
      ),
    /translates a different English/
  )
  assert.throws(() => sourced('no-hash', 'x', 'fixture'), /is not <file>#<key>/)
  assert.throws(() => read('scripts/test/fixtures/does-not-exist.json'), /cannot be read as JSON/)
})

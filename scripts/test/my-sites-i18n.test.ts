/**
 * My Sites speaks to the customer in the customer's words (#797, F-S3-022).
 *
 * "Could not read the seat book" and "Reading your seats…" were on the screen: "seat" and "seat
 * book" are Tracy's names for its own records, and `docs/references/vocabulary.md` has no entry
 * that teaches them to a customer. The failure line is now the sentence the product already used
 * for the same event, and the reading line is the word the tab's loading bar already announces.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { en } from '../../packages/site/tracy-my-sites/src/client/strings.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const strings = en as Record<string, string>
const catalogue = (lang: string): Record<string, string> =>
  JSON.parse(
    readFileSync(
      join(
        ROOT,
        lang === 'vi' ? 'packages/locale/tracy-locale-vi/vi' : `packages/locale/tracy-locales/${lang}`,
        'tracy-my-sites.json'
      ),
      'utf8'
    )
  )
const LANGS = ['vi', 'de', 'it', 'fr', 'nl', 'zh', 'es']

test('the two reported lines no longer say "seat book" or "your seats"', () => {
  // A vocabulary rule, not a copy pin: both lines may be reworded, never back to "seat".
  assert.equal('state.loading' in strings, false, 'the line "Reading your seats…" is gone')
  for (const key of ['state.failed', 'loading.label']) {
    assert.ok(strings[key], key)
    assert.doesNotMatch(strings[key], /seat/i, key)
  }
})

test('the screen shows the kept key where it showed the removed one', () => {
  const client = readFileSync(join(ROOT, 'packages/site/tracy-my-sites/src/client/index.tsx'), 'utf8')
  assert.doesNotMatch(client, /state\.loading/)
  assert.equal(client.match(/<Note>\{t\('loading\.label'\)\}<\/Note>/g)?.length, 2, 'both Settings sections')
  assert.match(client, /\{t\('state\.failed'\)\}/)
  // What the customer's browser loads is the committed bundle, not the source.
  const bundle = readFileSync(join(ROOT, 'packages/site/tracy-my-sites/lib/client.js'), 'utf8')
  assert.ok(bundle.includes('Could not load your sites.'), 'lib/client.js was rebuilt')
  assert.ok(!bundle.includes('Could not read the seat book'), 'lib/client.js still holds the old line')
  assert.ok(!bundle.includes('Reading your seats'), 'lib/client.js still holds the old line')
})

test('every language has the failure line and the loading word, and none keeps the removed key', () => {
  for (const lang of LANGS) {
    const dict = catalogue(lang)
    assert.equal(typeof dict['state.failed'], 'string', lang)
    assert.notEqual(dict['state.failed'], '', lang)
    assert.equal('state.loading' in dict, false, `${lang}: state.loading is still in the catalogue`)
    assert.notEqual(dict['loading.label'], 'Loading', `${lang}: the loading word is translated`)
  }
})

test('no translation of the failure line still describes the old sentence', () => {
  // The old line had two sentences (… "Try again shortly."); a catalogue that kept its old
  // translation under the new source would still have two.
  for (const lang of LANGS) {
    const value = catalogue(lang)['state.failed']
    assert.equal(value.split(/[.。]/).filter((part) => part.trim() !== '').length, 1, `${lang}: ${value}`)
  }
  assert.equal(catalogue('vi')['state.failed'], 'Không tải được danh sách site.')
})

test('the built locale bundles carry the same lines as the catalogues', () => {
  const viBundle = readFileSync(join(ROOT, 'packages/locale/tracy-locale-vi/lib/client.js'), 'utf8')
  assert.ok(viBundle.includes('Không tải được danh sách site.'))
  assert.ok(!viBundle.includes('Đang đọc ghế của bạn'))
  const others = readFileSync(join(ROOT, 'packages/locale/tracy-locales/lib/client.js'), 'utf8')
  assert.ok(others.includes('无法加载你的 site。'))
  assert.ok(!others.includes('Ihre Plätze werden gelesen'))
})

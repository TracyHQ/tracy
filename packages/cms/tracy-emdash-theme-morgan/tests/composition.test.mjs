// The page composition is code (DECISIONS D5): every section entry a view names must exist in the seed, in the collection
// `src/lib/page-layout.json` says, and every view file the router imports must exist.
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const seed = JSON.parse(read('seed/seed.json'))
const layout = JSON.parse(read('src/lib/page-layout.json'))

test('every section of page-layout.json is a published seed entry of its collection', () => {
  for (const [slug, info] of Object.entries(layout)) {
    const entry = (seed.content[info.type] ?? []).find((e) => e.slug === slug)
    assert.ok(entry, `${info.type}/${slug} is missing from the seed`)
    assert.equal(entry.status, 'published')
  }
})

test('the router imports views that exist', () => {
  const router = read('src/pages/[...path].astro')
  for (const m of router.matchAll(/from '@\/views\/(\w+)\.astro'/g))
    assert.ok(existsSync(new URL(`src/views/${m[1]}.astro`, root)), m[1])
})

test('the favicon exists (the demo logo is a text lockup of the chrome entry, not a file)', () => {
  assert.ok(existsSync(new URL('public/favicon.svg', root)))
})

test('every shipped font has a licence notice and the Vietnamese range (LANG-2)', () => {
  const fonts = JSON.parse(read('src/fonts.json'))
  for (const f of fonts) {
    assert.equal(f.provider, 'local')
    // PT Root UI ships no notice in the quickstart (DECISIONS D8); the Vietnamese face is Be Vietnam Pro, whose OFL notice ships
    assert.ok(existsSync(new URL('src/fonts/be-vietnam-pro-OFL.txt', root)), 'Be Vietnam Pro notice')
    assert.ok(
      f.variants.some((v) => (v.unicodeRange ?? []).includes('U+1EA0-1EF9')),
      `${f.name} has no Vietnamese face`
    )
    for (const v of f.variants)
      for (const src of v.src) assert.ok(existsSync(new URL(src.replace('./', ''), root)), src)
  }
})

test('the chrome entry carries every word the header and footer print', () => {
  const chrome = seed.content.chrome[0].data
  for (const k of [
    'brand_name',
    'menu_label',
    'close_label',
    'theme_label',
    'copyright',
    'topbar_address',
    'topbar_phone',
    'read_more',
    'not_found_title',
    'search_label'
  ])
    assert.ok(String(chrome[k] ?? '').length > 0, k)
})

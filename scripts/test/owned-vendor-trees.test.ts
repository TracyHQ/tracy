/**
 * Pass seven of the language gate: which `vendor/` files are Tracy's, and what Vietnamese in them is refused.
 *
 *   node --import tsx --test scripts/test/owned-vendor-trees.test.ts
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import { OWNED_VENDOR_TREES, ownedVendorPath, vendorLanguageHits } from '../lib/owned-vendor-trees.ts'

const ROOT = resolve(import.meta.dirname, '../..')
const kinds = (rel: string, src: string, strings: Array<{ line: number; text: string }> = []) =>
  vendorLanguageHits(rel, src, strings).map((hit) => [hit.line, hit.kind])

test('every listed tree exists and says why it is ours', () => {
  for (const tree of OWNED_VENDOR_TREES) {
    assert.ok(existsSync(join(ROOT, tree.path)), tree.path)
    assert.ok(tree.why.length > 10, tree.path)
  }
})

test('scope: owned trees are read, third-party trees and exempt paths are not', () => {
  for (const [rel, inside] of [
    ['vendor/tracy/dsh-passwords/src/tracy/gate.ts', true],
    ['vendor/tracy/dsh-better-sidebar/TRACY-FORK.md', true],
    ['vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/SKILL.md', true],
    ['vendor/tracy/od-design-system/scripts/build-catalog.mjs', true],
    ['vendor/tracy/dsh-locale-vi/tools/build-client.mjs', true],
    // third-party trees
    ['vendor/emdash/emdash/packages/admin/src/a.ts', false],
    ['vendor/tracy/od-skill/skills/x/SKILL.md', false],
    ['vendor/tracy/refero/systems/a/DESIGN.md', false],
    ['vendor/php/scssphp/src/a.php', false],
    ['vendor/tracy/dsh-passwords-old/a.ts', false],
    // i18n data, upstream data and built output inside owned trees
    ['vendor/tracy/dsh-better-sidebar/src/client/locales-vi.ts', false],
    ['vendor/tracy/dsh-better-locale/src/client/dictionaries/vi.ts', false],
    ['vendor/tracy/dsh-better-locale/TRANSLATION.md', false],
    ['vendor/tracy/dsh-better-locale/lib/client.js', false],
    ['vendor/tracy/dsh-locale-vi/locales/vi.json', false],
    ['vendor/tracy/dsh-locale-vi/README.md', false],
    ['vendor/tracy/dsh-passwords/src/tracy/i18n/locales/vi.json', false],
    ['vendor/tracy/dsh-passwords/package.json', false],
    ['vendor/tracy/od-design-system/systems/airbnb/DESIGN-vi.md', false],
    ['vendor/emdash/emdash-theme-bravada/node_modules/x/a.js', false],
    ['vendor/tracy/dsh-better-sidebar/tests/fixtures/x/lib/index.js', false],
    ['packages/site/x/a.ts', false]
  ] as const)
    assert.equal(ownedVendorPath(rel) !== null, inside, rel)
})

test('Markdown: every Vietnamese line is a hit; quoted data and language-allow are not', () => {
  const md = '# Build\nDựng site.\nThe label `Lưu` stays.\n<!-- language-allow -->\nVí dụ khách gõ.\nPlain.\n'
  assert.deepEqual(kinds('vendor/emdash/tracy-emdash-skill/SKILL.md', md), [[2, 'prose']])
})

test('code: strings and comments are judged; test strings are not; regex literals are not strings', () => {
  const rel = 'vendor/tracy/dsh-better-sidebar/src/client/a.ts'
  const src =
    "// gửi bình luận\nconst a = 'Lưu'\nconst fold = (s: string) => s.replace(/đ/g, 'd') // fold \"Đặng\"\n"
  assert.deepEqual(kinds(rel, src, [{ line: 2, text: 'Lưu' }]), [
    [2, 'string'],
    [1, 'comment']
  ])
  assert.deepEqual(
    kinds('vendor/tracy/dsh-better-sidebar/tests/a.spec.ts', src, [{ line: 2, text: 'Lưu' }]),
    [[1, 'comment']]
  )
})

test('only Vietnamese letters count: upstream Chinese, French and Portuguese are theirs', () => {
  const src = '// 保存设置\n// déjà vu, Português, naïve\n'
  assert.deepEqual(kinds('vendor/tracy/dsh-passwords/src/a.ts', src), [])
  assert.deepEqual(kinds('vendor/tracy/dsh-passwords/README.md', '安装 · Español · Ñandú\n'), [])
})

test('the language name written in itself is not prose', () => {
  assert.deepEqual(
    kinds('vendor/tracy/dsh-better-locale/README.md', '| Vietnamese | `vi` | Tiếng Việt |\n'),
    []
  )
  assert.deepEqual(
    kinds('vendor/tracy/dsh-locale-vi/tools/a.mjs', 'const l = \'label: "Tiếng Việt"; Lưu\'\n', [
      { line: 1, text: 'label: "Tiếng Việt"; Lưu' }
    ]),
    [[1, 'string']]
  )
})

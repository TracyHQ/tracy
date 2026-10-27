/**
 * The comment half of the language gate: which comments `check-language.ts` refuses, tested on
 * inline sources with no filesystem.
 *
 *   node --import tsx --test scripts/test/comment-language.test.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { foreignComments, inCommentScope, ledgerVerdict, strikeLedger } from '../lib/comment-language.ts'

const lines = (rel: string, src: string) => foreignComments(rel, src).map((hit) => hit.line)

test('a JS comment with a letter outside a-z is a hit, on its own line; English is not', () => {
  const src = 'const a = 1\n// tính tổng\nconst b = 2 // add the two\n'
  const hits = foreignComments('apps/x/src/a.js', src)
  assert.deepEqual(
    hits.map((h) => [h.line, h.letter]),
    [[2, 'í']]
  )
})

test('strings are not comments: only comments are judged here', () => {
  assert.deepEqual(lines('packages/a/b.ts', "const s = 'Xin chào // không phải comment'\n"), [])
  assert.deepEqual(lines('packages/a/b.ts', 'const t = `/* Đây */ ${1}`\n'), [])
})

test('a span in backticks is quoted data and is skipped', () => {
  assert.deepEqual(lines('apps/a.ts', '// the product `Módulo PagSeguro` is kept verbatim\n'), [])
  assert.deepEqual(lines('apps/a.ts', '// the label `Lưu` comes from the vi table, café\n'), [1])
})

test('a quoted span is quoted data too: "…", \'…\' and «…»; curly quotes and apostrophes are prose', () => {
  assert.deepEqual(
    lines('apps/a.ts', '// the menu said "Giới thiệu" and \'Về chúng tôi\' and «Норткейт»\n'),
    []
  )
  assert.deepEqual(lines('apps/a.ts', '// it wrote “Giới thiệu”\n'), [1])
  assert.deepEqual(lines('apps/a.ts', "// don't say café's\n"), [1])
  assert.deepEqual(lines('apps/a.ts', '// "unclosed Giới\n'), [1])
})

test('every line of a block comment is judged with its own line number', () => {
  const src = '/**\n * First line.\n * Dòng hai.\n */\nexport const x = 1\n'
  assert.deepEqual(lines('packages/a/x.ts', src), [3])
})

test('a JSX comment is a comment; JSX text that looks like one is not', () => {
  const src = 'export const A = () => (\n  <div>\n    {/* nút lưu */}\n    <p>// Lưu</p>\n  </div>\n)\n'
  assert.deepEqual(lines('packages/a/A.tsx', src), [3])
})

test('symbols, punctuation and emoji are not letters', () => {
  assert.deepEqual(lines('apps/a.ts', '// a → b — c × d · “quoted” ✓ 🔒 §5 ²\n'), [])
})

test('shell: # starts a comment, but not inside quotes, not $#, not the shebang', () => {
  const src = '#!/bin/bash\n# chạy lại\necho "# không phải"\nn=$#\nx=1 # đếm\necho ${#arr}\n'
  assert.deepEqual(lines('scripts/a.sh', src), [2, 5])
})

test('YAML and Python use #; a Python docstring is prose too', () => {
  assert.deepEqual(lines('.github/workflows/a.yml', "name: 'a # b'\n# bước một\nrun: x # ok\n"), [2])
  assert.deepEqual(lines('packages/a/x.py', '"""Mô tả."""\nx = "# chữ"  # ghi chú\n'), [1, 2])
})

test('PHP: //, # and /* */ comments, while a URL in a string is not a comment', () => {
  const src = "<?php\n$u = 'https://ví.dụ';\n// chú thích\n# khác\n/* khối */\n#[Attribute]\n"
  assert.deepEqual(lines('packages/cms/a.php', src), [3, 4, 5])
})

test('CSS block comments, HTML comments and SQL -- comments', () => {
  assert.deepEqual(lines('packages/a/x.css', 'a { content: "/* é */"; }\n/* màu chính */\n'), [2])
  assert.deepEqual(lines('apps/a/x.html', '<p>Xin chào</p>\n<!-- phần đầu -->\n'), [2])
  assert.deepEqual(lines('apps/a/x.sql', "select 'é -- x';\n-- bảng khách\n"), [2])
})

test('scope: code under the six roots; not docs, vendor, i18n data or unknown file types', () => {
  for (const [rel, inside] of [
    ['apps/tracy-web/src/a.js', true],
    ['packages/site/x/src/a.tsx', true],
    ['scripts/check-x.ts', true],
    ['deploy/compose.yml', true],
    ['.github/workflows/a.yml', true],
    ['tests/regression/run.mjs', true],
    ['packages/site/x/test/a.test.mjs', true],
    ['docs/x.md', false],
    ['packages/a/README.md', false],
    ['vendor/tracy/x/a.js', false],
    ['packages/locale/tracy-locale-vi/src/a.ts', false],
    ['apps/tracy-web/src/lib/i18n/vi.js', false],
    ['packages/core/tracy-core/src/interface-languages/index.ts', false],
    ['packages/a/src/locales/vi.ts', false],
    ['packages/a/lib/client.js', false],
    ['packages/a/test/fixtures/page.html', false],
    ['packages/a/data.json', false],
    ['CLAUDE.md', false]
  ] as const)
    assert.equal(inCommentScope(rel), inside, rel)
})

test('ledger: a file over its count (or new) fails; one under it must be struck; equal is quiet', () => {
  const verdict = ledgerVerdict({ 'a.js': 3, 'b.js': 1, 'new.js': 1 }, { 'a.js': 3, 'b.js': 2, 'gone.js': 4 })
  assert.deepEqual(verdict.over, [{ file: 'new.js', measured: 1, allowed: 0 }])
  assert.deepEqual(verdict.paid, [
    { file: 'b.js', measured: 1, allowed: 2 },
    { file: 'gone.js', measured: 0, allowed: 4 }
  ])
  assert.deepEqual(ledgerVerdict({ 'a.js': 4 }, { 'a.js': 3 }).over, [
    { file: 'a.js', measured: 4, allowed: 3 }
  ])
})

test('ledger: striking only lowers counts and drops paid files; it never raises or adds', () => {
  assert.deepEqual(
    strikeLedger({ 'a.js': 5, 'b.js': 1, 'new.js': 2 }, { 'a.js': 3, 'b.js': 2, 'gone.js': 4 }),
    {
      'a.js': 3,
      'b.js': 1
    }
  )
})

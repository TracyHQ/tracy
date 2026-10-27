// The example words inside a theme string are words a visitor reads (LANG-2, TCH #1013, g63). On g62-ess-wp-full (WP Essence
// 1.0.14, Vietnamese) the smart-search tips read "Nhập this and that vào ô tìm kiếm … chứa cả "this" và "that"": the
// sentence was translated in every language file of the theme, but the examples in <strong> and in quotes were copied over
// in English. A translation keeps no English example word of its source, in every overlay and every language it ships.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OVERLAYS = path.join(ROOT, 'overlays')

/** The `'source' => 'translation'` pairs of one `.l10n.php` file (single-quoted PHP strings). */
function pairsOf(file) {
  const text = readFileSync(file, 'utf8')
  const str = String.raw`'((?:[^'\\]|\\.)*)'`
  return [...text.matchAll(new RegExp(`${str}\\s*=>\\s*${str}`, 'g'))].map((m) => [
    m[1].replace(/\\'/g, "'"),
    m[2].replace(/\\'/g, "'")
  ])
}

/** The example words of a string: what it shows in <strong> and in double quotes, with at least one Latin letter. */
const examplesOf = (s) =>
  [...s.matchAll(/<strong>(.*?)<\/strong>|"([^"<>]+)"/g)]
    .map((m) => (m[1] ?? m[2]).replace(/^"|"$/g, '').trim())
    .filter((w) => /[A-Za-z]{2,}/.test(w))

test('a theme translation keeps no English example word of its source', () => {
  const left = []
  for (const overlay of readdirSync(OVERLAYS)) {
    const dir = path.join(OVERLAYS, overlay, 'languages')
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.l10n.php'))) {
      if (/^en[_.]/.test(name)) continue
      for (const [source, translation] of pairsOf(path.join(dir, name))) {
        const shown = new Set(examplesOf(translation))
        for (const example of examplesOf(source))
          if (shown.has(example)) left.push(`${overlay}/${name}: "${example}" in ${translation.slice(0, 60)}`)
      }
    }
  }
  assert.deepEqual(left, [])
})

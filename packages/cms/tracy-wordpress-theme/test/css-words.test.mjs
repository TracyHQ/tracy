/**
 * 🔒 A STYLE SHEET CARRIES NO VISITOR WORD (LANG-2, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12,
 * Vietnamese): every post card read "By Woodrow Ortega" because `je-detail.css` printed "By" in `content:`, which no
 * translation reaches; JA Vega and JA Nova did the same. The words now come from PHP in the site's language, as CSS variables.
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const here = new URL('..', import.meta.url)
const read = (rel) => readFileSync(new URL(rel, here), 'utf8')

/** The `content:` strings of a style sheet that hold a word: letters once icon escapes (`\f0ac`) are set aside. */
export function cssWords(css) {
  return [...css.matchAll(/content\s*:\s*(['"])((?:(?!\1).)*)\1/g)]
    .filter((m) => /\p{L}{2}/u.test(m[2].replace(/\\[0-9a-f]{1,6}\s?/gi, '')))
    .map((m) => m[0])
}

test('no style sheet of any WordPress theme, source or built, prints a visitor word in `content:`', () => {
  assert.deepEqual(
    cssWords(`a::before { content: "By"; } b::before { content: '\\f0ac'; } c::after { content: '–'; }`),
    ['content: "By"']
  )
  const offenders = []
  const walk = (rel) => {
    for (const name of readdirSync(new URL(rel, here))) {
      const sub = `${rel}${name}`
      if (statSync(new URL(sub, here)).isDirectory()) walk(`${sub}/`)
      else if (name.endsWith('.css'))
        for (const word of cssWords(read(sub))) offenders.push(`${sub}: ${word}`)
    }
  }
  for (const base of ['overlays', 'src'])
    for (const theme of readdirSync(new URL(`${base}/`, here)))
      if (statSync(new URL(`${base}/${theme}`, here)).isDirectory()) walk(`${base}/${theme}/`)
  assert.deepEqual(offenders, [])
})

const PHP_SKIP = phpSupport().skip

/** A function of a theme's PHP file, run alone with WordPress's translation stubbed by `messages`. */
const PROBE = String.raw`
$in = json_decode(stream_get_contents(STDIN), true);
$GLOBALS['styles'] = '';
function add_action() {} function wp_add_inline_style($handle, $css) { $GLOBALS['styles'] .= "$handle|$css"; }
function _x($text, $context, $domain) { return $GLOBALS['in']['messages']["$context\004$text"] ?? $text; }
eval($in['code']);
($in['fn'])();
echo $GLOBALS['styles'];
`

for (const [slug, prefix] of [
  ['wp-ja-vega', 'vega'],
  ['wp-ja-nova', 'nova']
])
  test(`${slug}: the word before an author is WordPress's own "By %s" in the site's language, set as a CSS variable`, {
    skip: PHP_SKIP
  }, () => {
    const php = startPhp({ files: { cwd: fileURLToPath(here), paths: [] } })
    try {
      for (const base of ['overlays', 'src']) {
        const source = read(`${base}/${slug}/inc/extra.php`)
        const fn = `wp_ja_${prefix}_css_words`
        const code = new RegExp(`function ${fn}\\(\\): void \\{[\\s\\S]*?\\n\\}`).exec(source)?.[0]
        assert.ok(code, `${base}: ${fn}`)
        assert.match(
          read(`${base}/${slug}/assets/css/${slug}.css`),
          new RegExp(`content: var\\(--wp-ja-${prefix}-by\\)`)
        )
        for (const [messages, want] of [
          [{ 'theme author\u0004By %s': 'Bởi %s' }, `:root{--wp-ja-${prefix}-by:"Bởi ";}`],
          [{}, `:root{--wp-ja-${prefix}-by:"By ";}`],
          [{ 'theme author\u0004By %s': 'De "x" %s' }, `:root{--wp-ja-${prefix}-by:"De  x ";}`]
        ]) {
          const [out] = php.run([{ args: ['-r', PROBE], input: JSON.stringify({ code, fn, messages }) }])
          assert.equal(out.status, 0, `${base}: ${out.stderr}${out.stdout}`)
          assert.equal(out.stdout, `wp-ja-${slug.slice('wp-ja-'.length)}|${want}`, base)
        }
      }
    } finally {
      php.stop?.()
    }
  })

/**
 * #228: the primary colour reads at WCAG AA both ways it is used — the label on a primary button
 * (`--primary-foreground` on `--primary`) and terracotta words on white — in `tokens.css` and in the
 * copy server-rendered pages redeclare (`page-shell.js`, docs/references/page-shell-tokens.md). The
 * brand mark keeps #bf5b3d; at that lightness the label read 4.21:1.
 *
 *   node --test scripts/test/primary-contrast.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const ROOT = new URL('../../', import.meta.url)
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8')

/** `oklch(L C h)` → linear sRGB, clipped to the gamut (CSS Color 4 matrices). */
function oklchToLinear(text) {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/.exec(text)
  assert.ok(m, `not an oklch value: ${text}`)
  const [L, C, h] = m.slice(1).map(Number)
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s
  ].map((c) => Math.min(1, Math.max(0, c)))
}
const luminance = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
const contrast = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)

/** The first declaration of `name` in a stylesheet text. */
function token(css, name) {
  const m = new RegExp(`${name}:\\s*(oklch\\([^)]*\\))`).exec(css)
  assert.ok(m, `${name} is not declared`)
  return m[1]
}

for (const [where, css] of [
  ['tokens.css', read('packages/ui/tracy-ui/src/tokens.css')],
  ['page-shell.js', read('apps/tracy-web/src/lib/page-shell.js')]
])
  test(`${where}: a label on the primary colour and the primary colour on white both read at AA (#228)`, () => {
    const primary = luminance(oklchToLinear(token(css, '--primary')))
    const label = luminance(oklchToLinear(token(css, '--primary-foreground')))
    assert.ok(contrast(primary, label) >= 4.5, `label on primary ${contrast(primary, label).toFixed(2)}:1`)
    assert.ok(contrast(primary, 1) >= 4.5, `primary on white ${contrast(primary, 1).toFixed(2)}:1`)
  })

test('page-shell.js redeclares the same primary as tokens.css', () => {
  assert.equal(
    token(read('apps/tracy-web/src/lib/page-shell.js'), '--primary'),
    token(read('packages/ui/tracy-ui/src/tokens.css'), '--primary').replace(/\s+/g, ' ')
  )
})

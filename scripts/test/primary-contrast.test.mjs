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

/** `#rrggbb` → linear sRGB. */
const hexToLinear = (input) => {
  const hex =
    input.length === 4
      ? '#' +
        input
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : input
  return [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
}
const toHex = (linear) =>
  `#${linear
    .map((c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

test('the tracy-brand theme layer paints the same AA primary over tokens.css, the mark and rings kept (#228)', async () => {
  // The layer is written inline on <body> by dsh's theme service, after tokens.css: its default is
  // what every primary button shows.
  const { primaryTokens } = await import(
    new URL('packages/brand/tracy-brand/src/shared/theme.mjs', ROOT).href
  )
  const { DEFAULT_PRIMARY } = await import(
    new URL('packages/brand/tracy-brand/src/shared/settings.mjs', ROOT).href
  )
  const layer = primaryTokens('')
  const tokensPrimary = toHex(oklchToLinear(token(read('packages/ui/tracy-ui/src/tokens.css'), '--primary')))
  const label = luminance(
    oklchToLinear(token(read('packages/ui/tracy-ui/src/tokens.css'), '--primary-foreground'))
  )
  for (const name of ['--primary', '--dsw-alias-button-primary-fill']) {
    for (const mode of ['light', 'dark']) {
      const value = layer[name][mode]
      assert.equal(value, tokensPrimary, `${name} (${mode}) is tokens.css --primary`)
      const fill = luminance(hexToLinear(value))
      assert.ok(contrast(fill, label) >= 4.5, `${name}: label on it ${contrast(fill, label).toFixed(2)}:1`)
      assert.ok(contrast(fill, 1) >= 4.5, `${name}: it on white ${contrast(fill, 1).toFixed(2)}:1`)
    }
  }
  assert.equal(layer['--ring'].light, DEFAULT_PRIMARY)
  assert.equal(layer['--dsw-alias-brand-primary'].light, DEFAULT_PRIMARY)
})

test('page-shell.js redeclares the same primary as tokens.css', () => {
  assert.equal(
    token(read('apps/tracy-web/src/lib/page-shell.js'), '--primary'),
    token(read('packages/ui/tracy-ui/src/tokens.css'), '--primary').replace(/\s+/g, ' ')
  )
})

test('every accepted accent derives AA fills and words, and visible focus strokes (#316)', async () => {
  const { primaryTokens } = await import(
    new URL('packages/brand/tracy-brand/src/shared/theme.mjs', ROOT).href
  )
  for (const color of [
    '',
    '#5b8def',
    '#00b96b',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#ffd400',
    '#fff',
    '#000'
  ]) {
    const t = primaryTokens(color)
    for (const mode of ['light', 'dark']) {
      const fill = luminance(hexToLinear(t['--primary'][mode]))
      assert.ok(contrast(fill, luminance(hexToLinear('#fafafa'))) >= 4.5, `${color} ${mode} fill`)
      const background = mode === 'light' ? 1 : luminance(hexToLinear('#262626'))
      assert.ok(
        contrast(luminance(hexToLinear(t['--dsw-alias-brand-text'][mode])), background) >= 4.5,
        `${color} ${mode} words`
      )
      assert.ok(
        contrast(luminance(hexToLinear(t['--ring'][mode])), background) >= 3,
        `${color} ${mode} focus`
      )
    }
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { presetInlineColors, paletteFromContract, paletteFromThemeJson } from '../lib/inline-colors.mjs'

const palette = [
  { slug: 'bg', color: '#f5f3ee' },
  { slug: 'surface-warm', color: '#eceae4' },
  { slug: 'fg', color: '#14171a' },
  { slug: 'accent', color: '#14483a' }
]

test('inline-colors: an exact literal, one inside the tolerance and one outside', () => {
  const html =
    '<section style="background: rgb(245, 243, 238); color: rgb(20,23,26)">' +
    '<div style="background-color: #EDEAE2; border: 1px solid #ff0000">x</div></section>'
  const { markup, replaced, kept } = presetInlineColors(html, palette)
  assert.equal(
    markup,
    '<section style="background: var(--wp--preset--color--bg); color: var(--wp--preset--color--fg)">' +
      '<div style="background-color: var(--wp--preset--color--surface-warm); border: 1px solid #ff0000">x</div></section>'
  )
  assert.equal(replaced, 3)
  assert.equal(kept, 1)
})

test('inline-colors: a translucent rgba is kept; alpha 1, the export\'s 0.996 and a 3-digit hex are matched', () => {
  const html =
    '<p style="color: rgba(20, 23, 26, 0.6); background: rgba(20,72,58,1); border-color: #fff; outline-color: rgba(245, 243, 238, 0.996)">x</p>'
  const { markup, replaced, kept } = presetInlineColors(html, [...palette, { slug: 'surface', color: '#ffffff' }])
  assert.equal(
    markup,
    '<p style="color: rgba(20, 23, 26, 0.6); background: var(--wp--preset--color--accent); border-color: var(--wp--preset--color--surface); outline-color: var(--wp--preset--color--bg)">x</p>'
  )
  assert.equal(replaced, 3)
  assert.equal(kept, 1)
})

test('inline-colors: literals outside a style attribute are not touched, and a second pass changes nothing', () => {
  const html = '<a href="#f5f3ee" data-c="rgb(20,23,26)" style="color: #14171a">ink</a>'
  const once = presetInlineColors(html, palette)
  assert.equal(once.markup, '<a href="#f5f3ee" data-c="rgb(20,23,26)" style="color: var(--wp--preset--color--fg)">ink</a>')
  const twice = presetInlineColors(once.markup, palette)
  assert.equal(twice.markup, once.markup)
  assert.deepEqual([twice.replaced, twice.kept], [0, 0])
})

test('inline-colors: a palette from the contract (measured colours) and from theme.json presets', () => {
  const contract = {
    variants: [{ id: 'desktop-light', mode: 'light', width: 1440 }],
    tokens: { 'desktop-light': { '--bg': '#f5f3ee', '--fg': 'rgb(20, 23, 26)', '--text-base': '16px' } },
    rules: []
  }
  assert.deepEqual(paletteFromContract(contract), [
    { slug: 'bg', color: '#f5f3ee' },
    { slug: 'fg', color: '#14171a' }
  ])
  const themeJson = { settings: { color: { palette: [{ slug: 'surface-warm', color: '#ECEAE4' }, { slug: 'x', color: 'none' }] } } }
  assert.deepEqual(paletteFromThemeJson(themeJson), [{ slug: 'surface-warm', color: '#eceae4' }])
})

test('a background in the text colour maps to the brand ink custom, never to the fg preset', () => {
  const palette = [
    { slug: 'fg', color: '#14171a' },
    { slug: 'bg', color: '#f5f3ee' },
    { slug: 'brand-ink', color: '#14171a', roles: ['surface'], var: 'var(--wp--custom--tracy--brand--ink)' }
  ]
  const r = presetInlineColors('<div style="background: rgb(20,23,26); color: rgb(20,23,26); border-top: 1px solid rgb(20,23,26)">x</div>', palette)
  assert.equal(
    r.markup,
    '<div style="background: var(--wp--custom--tracy--brand--ink); color: var(--wp--preset--color--fg); border-top: 1px solid var(--wp--preset--color--fg)">x</div>'
  )
  assert.deepEqual([r.replaced, r.kept], [3, 0])
})

test('paletteFromThemeJson adds the brand customs as surface-role entries', () => {
  const pal = paletteFromThemeJson({
    settings: {
      color: { palette: [{ slug: 'fg', color: '#14171a' }, { slug: 'accent', color: '#14483a' }] },
      custom: { tracy: { brand: { ink: '#14171a', green: '#14483a', paper: '#fff' } } }
    }
  })
  assert.deepEqual(pal.map((p) => p.slug), ['brand-ink', 'brand-green', 'fg', 'accent'])
  assert.equal(pal[0].var, 'var(--wp--custom--tracy--brand--ink)')
  const r = presetInlineColors('<a style="background: #14483a; color: #fff">x</a>', pal)
  assert.equal(r.markup, '<a style="background: var(--wp--custom--tracy--brand--green); color: #fff">x</a>')
  // The merged palette lists the presets first; the custom still wins the tie.
  const r2 = presetInlineColors('<a style="background: #14483a">x</a>', [...pal].reverse())
  assert.equal(r2.markup, '<a style="background: var(--wp--custom--tracy--brand--green)">x</a>')
})

test('a neutral literal matches a neutral token within the wider tolerance — text, surface and the line with no role; a hue does not', () => {
  const palette = [
    { slug: 'muted', color: '#4a5055' },
    { slug: 'surface-warm', color: '#eceae4' },
    { slug: 'accent', color: '#14483a' }
  ]
  const r = presetInlineColors('<p style="color: rgb(90,89,82); background: #e4dfd6; border-color: #e4dfd6; color: #2a6a50">x</p>', palette)
  assert.equal(
    r.markup,
    '<p style="color: var(--wp--preset--color--muted); background: var(--wp--preset--color--surface-warm); border-color: var(--wp--preset--color--surface-warm); color: #2a6a50">x</p>'
  )
  // The hairline the export bakes: neutral, 40 from the line token, no role — it must find the
  // token, or it stays a pale rule on a near-black page in dark (16 bright-border findings, 15/09).
  const line = presetInlineColors('<div style="border-bottom: 1px solid rgb(220,215,204)">x</div>', [
    { slug: 'border', color: '#dcd7cc' },
    { slug: 'fg', color: '#14171a' }
  ])
  assert.equal(line.markup, '<div style="border-bottom: 1px solid var(--wp--preset--color--border)">x</div>')
})

test('a pale tint keeps its literal: a hue the token does not share, or a chroma the token does not have (G-W20)', () => {
  const palette = [
    { slug: 'bg', color: '#f5f3ee' },
    { slug: 'surface', color: '#ffffff' },
    { slug: 'surface-warm', color: '#eceae4' },
    { slug: 'accent', color: '#14483a' },
    { slug: 'brand-header', color: '#f5f3ee', roles: ['surface'], var: 'var(--wp--custom--tracy--brand--header)' }
  ]
  // The source's info callout (pale green), success (pale mint), warning (pale amber) and error
  // (pale pink) tints: each sits within 16 of a warm paper preset, none is that preset.
  const html =
    '<div style="background: rgb(232, 240, 235)"></div><div style="background: rgb(233, 242, 233)"></div>' +
    '<div style="background: rgb(251, 242, 226)"></div><div style="background: rgb(252, 243, 242)"></div>'
  const r = presetInlineColors(html, palette)
  assert.equal(r.markup, html)
  assert.deepEqual([r.replaced, r.kept], [0, 4])
  // The warm neutrals still map within the wider tolerance: the panel beige, the muted green text.
  const ok = presetInlineColors('<p style="background: #e4dfd6; color: #22453a; background: rgb(224,219,209)">x</p>', palette)
  assert.equal(
    ok.markup,
    '<p style="background: var(--wp--preset--color--surface-warm); color: var(--wp--preset--color--accent); background: var(--wp--preset--color--surface-warm)">x</p>'
  )
})

test('a background in the line colour maps to the border preset, not to the nearest paper', () => {
  const palette = [
    { slug: 'surface-warm', color: '#eceae4' },
    { slug: 'border', color: '#dcd7cc' }
  ]
  const r = presetInlineColors('<div style="background: rgb(220, 215, 204); height: 1px"></div>', palette)
  assert.equal(r.markup, '<div style="background: var(--wp--preset--color--border); height: 1px"></div>')
})

// A colour the copy names is a swatch: the style guide's palette boxes are painted with the very
// hex printed beside them, and mapped to a preset they flip with dark mode — Paper drawn ink, Ink
// drawn deep green (colour lens, 15/09). A hex that appears as text in the markup keeps its literal.
test('a hex the markup names in its copy keeps its literal — a palette swatch is not a theme colour', () => {
  const palette = [
    { slug: 'bg', color: '#f5f3ee' },
    { slug: 'fg', color: '#14171a' }
  ]
  const html =
    '<div><div style="background: rgb(245, 243, 238)"></div><span>Paper</span><code>#F5F3EE</code></div>' +
    '<div><div style="background: rgb(20, 23, 26)"></div><span>Ink</span><code>#14171A</code></div>' +
    '<p style="color: rgb(20, 23, 26)">Body copy set in the ink the page also names</p>'
  const r = presetInlineColors(html, palette)
  assert.match(r.markup, /background: rgb\(245, 243, 238\)/, 'the paper swatch keeps its literal')
  assert.match(r.markup, /background: rgb\(20, 23, 26\)/, 'the ink swatch keeps its literal')
  // only the FILL is a swatch: text in a named colour is still text and maps (ink on ink in dark otherwise)
  assert.match(r.markup, /color: var\(--wp--preset--color--fg\)/, 'the text colour still maps')
  assert.equal(r.kept, 2)
})

test('paletteFromThemeJson adds the brand prose as a text-role entry: body copy in it maps there, not to fg; a surface in it does not', () => {
  const pal = paletteFromThemeJson({
    settings: {
      color: { palette: [{ slug: 'fg', color: '#14171a' }, { slug: 'bg', color: '#f5f3ee' }] },
      custom: { tracy: { brand: { ink: '#14171a', prose: '#242830' } } }
    }
  })
  assert.deepEqual(pal.map((p) => p.slug), ['brand-ink', 'brand-prose', 'fg', 'bg'])
  assert.deepEqual(pal[1].roles, ['text'])
  const r = presetInlineColors('<p style="color: rgb(36, 40, 48)">Body</p><div style="background: rgb(36, 40, 48)">x</div>', pal)
  assert.equal(r.markup, '<p style="color: var(--wp--custom--tracy--brand--prose)">Body</p><div style="background: var(--wp--custom--tracy--brand--ink)">x</div>')
})

#!/usr/bin/env node
/**
 * A JA Joomla template's own colours and faces, read off its released folder, as a slot contract draft:
 *
 *   node scripts/joomla-palette.mjs <templates/ja_x dir>
 *
 * T3 (a `less/` folder, no T4 theme file): the palette is its LESS variables — the page
 * (`@wrap-bg`, else `@body-bg`), `@text-color`, `@headings-color`, `@brand-*`, `@link-hover-color`
 * (`darken()`/`lighten()` computed), the greys — references followed, other functions skipped.
 *
 * T4 stores the theme a site starts with in etc/theme/default.json (light keys and `*_dark` keys) and
 * its faces in etc/site/default.json. Two roles T4 has no key for are measured from the stylesheets:
 * the line colour (the hex painted most often in border properties) and the muted text (the most
 * painted low-saturation mid-grey in `color`). Prints the contract keys `baseTokens`, `darkTokens`,
 * `baseNote` — a draft a person checks against the page.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normHex } from '../src/tokenize.mjs'

const dir = process.argv[2]
const T3 = dir && !existsSync(join(dir, 'etc/theme/default.json')) && existsSync(join(dir, 'less'))
if (!dir || (!T3 && !existsSync(join(dir, 'etc/theme/default.json')))) {
  console.error(
    'usage: joomla-palette.mjs <templates/ja_x dir>  (a T4 etc/theme/default.json or a T3 less/ folder)'
  )
  process.exit(1)
}
const theme = T3 ? t3Theme(dir) : JSON.parse(readFileSync(join(dir, 'etc/theme/default.json'), 'utf8'))
const site = T3
  ? { heading_font_family: theme._headFace, body_font_family: theme._bodyFace }
  : existsSync(join(dir, 'etc/site/default.json'))
    ? JSON.parse(readFileSync(join(dir, 'etc/site/default.json'), 'utf8'))
    : {}
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim()) ? normHex(v.trim()) : null)

const light = {}
const dark = {}
const put = (o, role, v) => {
  const h = hex(v)
  if (h && !o[role]) o[role] = h
}
put(light, 'bg', theme.body_bg_color)
put(light, 'fg', theme.body_text_color)
put(light, 'fg-2', theme.color_dark)
put(light, 'accent', theme.color_primary)
put(light, 'accent', theme.body_link_color)
put(light, 'accent-hover', theme.body_link_hover_color)
put(light, 'surface', theme.color_light)
put(light, 'surface-warm', theme.footer_bg_color)
put(light, 'meta', theme.footer_text_color)
put(light, 'success', theme.color_success)
put(light, 'warn', theme.color_warning)
put(light, 'danger', theme.color_danger)
put(dark, 'bg', theme.body_bg_color_dark)
put(dark, 'fg', theme.body_text_color_dark)
put(dark, 'accent', theme.body_link_color_dark)
put(dark, 'accent-hover', theme.body_link_hover_color_dark)
put(dark, 'surface-warm', theme.footer_bg_color_dark)
put(dark, 'meta', theme.footer_text_color_dark)

// the two roles T4 has no key for, by what the stylesheets paint most
const css = readdirSync(join(dir, 'css'), { recursive: true })
  .filter((f) => String(f).endsWith('.css') && !String(f).includes('rtl') && !String(f).includes('themes/'))
  .map((f) => readFileSync(join(dir, 'css', String(f)), 'utf8'))
  .join('\n')
const BOOTSTRAP = new Set([
  '#dee2e6',
  '#e9ecef',
  '#ced4da',
  '#adb5bd',
  '#6c757d',
  '#495057',
  '#212529',
  '#f8f9fa',
  '#000000',
  '#ffffff'
])
const tally = { line: {}, text: {} }
for (const m of css.matchAll(/(border[\w-]*|outline[\w-]*|color)\s*:\s*([^;{}]+)/g)) {
  const kind = m[1] === 'color' ? 'text' : 'line'
  for (const h of m[2].match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
    const n = normHex(h)
    if (n && !BOOTSTRAP.has(n)) tally[kind][n] = (tally[kind][n] ?? 0) + 1
  }
}
const rgb = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
const lum = (h) => rgb(h).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0) / 255
const sat = (h) => Math.max(...rgb(h)) - Math.min(...rgb(h))
const taken = new Set([...Object.values(light), ...Object.values(dark)])
const top = (o, ok) =>
  Object.entries(o)
    .filter(([h]) => !taken.has(h) && ok(h))
    .sort((a, b) => b[1] - a[1])[0]?.[0]
const lightBg = light.bg ? lum(light.bg) > 0.5 : true
put(
  light,
  'border',
  top(tally.line, (h) => sat(h) < 40 && (lightBg ? lum(h) > 0.7 : lum(h) < 0.3))
)
put(
  light,
  'muted',
  top(tally.text, (h) => sat(h) < 50 && lum(h) > 0.3 && lum(h) < 0.65)
)
if (!light.surface && light.bg) light.surface = light.bg

const face = (f) => (f && typeof f === 'string' ? `"${f.replace(/["\\]/g, '')}"` : null)
const T = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [`--${k}`, v]))
const out = {
  baseTokens: {
    ...T(light),
    ...(face(site.heading_font_family) && {
      '--font-display': `${face(site.heading_font_family)}, sans-serif`
    }),
    ...(face(site.body_font_family) && { '--font-body': `${face(site.body_font_family)}, sans-serif` })
  },
  darkTokens: T(dark),
  baseNote: `read off the release: ${T3 ? 'T3 less/variables*.less' : 'etc/theme/default.json (light + *_dark keys), etc/site/default.json'} (colours and faces); border and muted measured as the most painted line / grey text in css/*.css (${Object.keys(tally.line).length} line colours, ${Object.keys(tally.text).length} text colours seen)`
}
console.log(JSON.stringify(out, null, 2))

/**
 * A T3 template's LESS variables as the T4 theme keys the reader above takes. `@x: @y` references are
 * followed; `darken(@x, n%)` / `lighten(@x, n%)` computed in HSL as LESS does; anything else skipped.
 */
function t3Theme(root) {
  const files = readdirSync(join(root, 'less'), { recursive: true })
    .map(String)
    .filter((f) => /(^|\/)(variables|vars)[\w-]*\.less$/.test(f) && !f.includes('themes/'))
    .sort((a, b) => a.length - b.length)
  const vars = {}
  for (const f of files)
    for (const m of readFileSync(join(root, 'less', f), 'utf8').matchAll(/^@([\w-]+)\s*:\s*([^;]+);/gm))
      vars[m[1]] = m[2].replace(/\/\/.*$/, '').trim()
  const hsl = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      l = (mx + mn) / 2,
      d = mx - mn
    if (!d) return [0, 0, l]
    const s2 = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    return [hh / 6, s2, l]
  }
  const hex = ([h, s2, l]) => {
    const f = (n) => {
      const k = (n + h * 12) % 12
      const a = s2 * Math.min(l, 1 - l)
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
        .toString(16)
        .padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`
  }
  const resolve = (v, depth = 0) => {
    if (!v || depth > 8) return null
    v = v.trim()
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return normHex(v)
    if (/^@[\w-]+$/.test(v)) return resolve(vars[v.slice(1)], depth + 1)
    const fn = /^(darken|lighten)\(\s*(@?[\w#-]+)\s*,\s*([\d.]+)%\s*\)$/i.exec(v)
    if (fn) {
      const c = resolve(fn[2], depth + 1)
      if (!c) return null
      const [h, s2, l] = hsl(c)
      const d = Number(fn[3]) / 100
      return hex([h, s2, Math.max(0, Math.min(1, fn[1].toLowerCase() === 'darken' ? l - d : l + d))])
    }
    return null
  }
  const face = (v, depth = 0) => {
    if (!v || depth > 8) return null
    if (/^@[\w-]+$/.test(v.trim())) return face(vars[v.trim().slice(1)], depth + 1)
    return (
      v
        .split(',')[0]
        .trim()
        .replace(/^["']|["']$/g, '') || null
    )
  }
  const pick = (...names) => names.map((n) => resolve(vars[n])).find(Boolean) ?? null
  // the Bootstrap 2 names GavickPro's Gavern framework (gk_*) declares in less/variables.less
  // (`@bodyBackground`, `@textColor`, `@primary_color` …) stand behind the T3 (Bootstrap 3) ones
  return {
    body_bg_color: pick('wrap-bg', 'body-bg', 'bodyBackground'),
    body_text_color: pick('text-color', 'textColor'),
    color_dark: pick('headings-color', 'headingsColor', 'gray-darker'),
    color_primary: pick('brand-primary', 'primary_color'),
    body_link_color: pick('link-color', 'linkColor'),
    body_link_hover_color: pick('link-hover-color', 'linkColorHover'),
    color_light: pick('gray-lightest', 'gray-lighter'),
    footer_text_color: pick('gray-light', 'grayLight'),
    color_success: pick('brand-success'),
    color_warning: pick('brand-warning'),
    color_danger: pick('brand-danger'),
    _headFace:
      face(vars['headings-font-family']) ??
      face(vars.headingsFontFamily) ??
      face(vars['font-family-base']) ??
      face(vars.baseFontFamily),
    _bodyFace: face(vars['font-family-base']) ?? face(vars.baseFontFamily)
  }
}

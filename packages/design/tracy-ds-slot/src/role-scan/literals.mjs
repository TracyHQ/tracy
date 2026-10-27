/**
 * The literal visual values inside one declaration value: colours (hex, rgb/rgba, hsl/hsla, a few
 * names), radii and font stacks, each with its offset in the value. PURE. A literal that already
 * sits in a role read (`var(--ds-c-accent-on, #fff)`) is not a finding: it is the fallback of a role
 * the template declares, and it is returned in `declared` instead.
 */
import { parseColour } from './colour-literal.mjs'

export { parseColour }

/** What a property paints: text, a ground, a line, a glyph, a shadow, a mask, or a custom property. */
export function kindOf(prop) {
  const p = prop.toLowerCase()
  if (p.startsWith('--') || p.startsWith('$') || p.startsWith('@')) return 'custom'
  if (/^(color|caret-color|-webkit-text-fill-color|-webkit-text-stroke-color|placeholder-color)$/.test(p))
    return 'text'
  if (/^(background|background-color|background-image)$/.test(p)) return 'fill'
  if (/^(border|outline|column-rule|text-decoration|text-emphasis)(-|$)/.test(p)) return 'line'
  if (/^(fill|stroke|stop-color|flood-color|lighting-color)$/.test(p)) return 'glyph'
  if (/shadow|^filter$|^backdrop-filter$/.test(p)) return 'shadow'
  if (/^(-webkit-)?mask/.test(p)) return 'mask'
  if (/^accent-color$|^scrollbar-color$/.test(p)) return 'fill'
  return null
}

// a colour name counts only as a standalone value token: `-`, `$`, `@` and `.` are part of an
// identifier (`--t4-white-rgb`, `var(--color-white)`, `$gray-700`, `@gray-light`), never a boundary
const COLOUR =
  /#[0-9a-f]{3,8}\b|(?<![\w$@.-])(?:rgba?|hsla?)\([^()]*\)|(?<![\w$@.#-])(?:white|black|gr[ae]y|silver|red|green|blue|orange|yellow|purple|navy|teal|maroon)(?![\w-])/gi

/**
 * Spans of a value that are NOT literals of the template: a role read with its fallback, a url(), a
 * string. Returns `[start, end, what]` triples.
 */
function shieldedSpans(value) {
  const spans = []
  // `var:preset|color|white` (theme.json) names a preset, it is not the colour white
  const re = /var\(\s*(--ds-[\w-]+)|url\(|(["'])|(var:(?:preset|custom)\|[\w|-]+)/gi
  for (let m = re.exec(value); m; m = re.exec(value)) {
    const what = m[1] ? 'ds' : m[2] ? 'string' : m[3] ? 'ref' : 'url'
    let i = m.index + m[0].length
    if (what === 'ref') {
      // the whole name is the span
    } else if (what === 'string') {
      const close = value.indexOf(m[2], i)
      i = close === -1 ? value.length : close + 1
    } else {
      for (let d = 1; i < value.length && d; i++) d += value[i] === '(' ? 1 : value[i] === ')' ? -1 : 0
    }
    spans.push([m.index, i, what, m[1] ?? null])
    re.lastIndex = i
  }
  return spans
}

/**
 * @param {string} value
 * @param {string} kind what the property paints (`kindOf`)
 * @returns {{ colours: { index: number, text: string, hex: string, alpha: number, inUrl: boolean, arm: 'light' | 'dark' | null }[], declared: string[] }}
 */
export function coloursIn(value, kind) {
  const spans = shieldedSpans(value)
  const declared = spans.filter((s) => s[2] === 'ds').map((s) => s[3])
  const colours = []
  const named = kind && kind !== 'custom' ? true : /^(white|black)$/i.test(value.trim())
  for (const m of value.matchAll(COLOUR)) {
    if (!m[0].startsWith('#') && !/\(/.test(m[0]) && !named) continue
    if (m[0].startsWith('#') && /[\w&-]/.test(value[m.index - 1] ?? '')) continue
    const span = spans.find((s) => m.index >= s[0] && m.index < s[1])
    if (span && span[2] !== 'url') continue
    const c = parseColour(m[0])
    if (!c) continue
    // a colour mixed into another (`color-mix(in srgb, #a3e635 13%, transparent)`) paints only its share
    const mix = mixShare(value, m.index, m[0].length)
    if (mix !== null) c.alpha *= mix
    colours.push({ index: m.index, text: m[0], ...c, inUrl: !!span, arm: lightDarkArm(value, m.index) })
  }
  // the template's own colour behind a role read (`var(--ds-c-bg, #fbfcfa)`): palette evidence that
  // reads the same before and after --write
  const wrapped = []
  for (const sp of spans.filter((x) => x[2] === 'ds')) {
    const inner = value.slice(sp[0], sp[1])
    const comma = inner.indexOf(',')
    if (comma === -1) continue
    for (const m of inner.slice(comma + 1).matchAll(COLOUR)) {
      const c = parseColour(m[0])
      if (c) wrapped.push({ text: m[0], ...c })
    }
  }
  return { colours, declared, wrapped }
}

/** The share (0..1) a colour at `at` takes in the `color-mix()` around it, or null outside one. */
function mixShare(value, at, len) {
  const open = value.lastIndexOf('color-mix(', at)
  if (open === -1) return null
  let d = 0
  for (let i = open + 'color-mix('.length; i < at; i++) {
    if (value[i] === '(') d++
    else if (value[i] === ')' && --d < 0) return null
  }
  if (d) return null
  const pct = /^\s+(\d+(?:\.\d+)?)%/.exec(value.slice(at + len))
  return pct ? Math.min(1, Number(pct[1]) / 100) : 0.5
}

/** Which arm of a `light-dark(a, b)` the offset sits in, or null outside one. */
function lightDarkArm(value, at) {
  const ld = value.lastIndexOf('light-dark(', at)
  if (ld === -1) return null
  let d = 0
  let arm = 'light'
  for (let i = ld + 'light-dark('.length; i < value.length; i++) {
    if (i === at) return arm
    if (value[i] === '(') d++
    else if (value[i] === ',' && d === 0) arm = 'dark'
    else if (value[i] === ')') {
      if (d === 0) return null
      d--
    }
  }
  return null
}

/** The property sets a corner radius (CSS, a radius custom property, a preprocessor variable). */
export const isRadiusProp = (prop) =>
  /(^|-)radius(-|$)/i.test(prop.replace(/^[$@]/, '-')) && !prop.startsWith('--tw-')

/** The value is a literal radius (lengths only, no variable, no calc of a variable). */
export const isRadiusLiteral = (value) =>
  /^(?:-?(?:\d*\.)?\d+(?:px|rem|em|%)?|none)(?:\s+(?:-?(?:\d*\.)?\d+(?:px|rem|em|%)?))*(?:\s*!important)?$/i.test(
    value.trim()
  )

/** The property sets a font stack (not a size, weight or line height). */
export const isFontProp = (prop) =>
  prop === 'font-family' ||
  /^(--|\$|@)([\w-]*-)?(font|family|face|typeface)(-(?![\w-]*(size|weight|height|style|feature|variation|width|spacing|display))[\w-]*)?$/i.test(
    prop
  )

/** A font stack that names a family of its own (a name, or a variable the template's loader sets). */
export const isFontLiteral = (prop, value) => {
  const v = value.trim()
  if (/^(inherit|initial|unset|revert)$/i.test(v) || /var\(\s*--ds-/i.test(v)) return false
  // theme.json names a preset (`var:preset|font-family|inter`): the preset's definition is the literal
  if (/^var:(preset|custom)\|/i.test(v)) return false
  // a lone reference to the template's own stack variable is not a literal; that variable's definition is
  if (prop === 'font-family') return !/^(var\(\s*--[\w-]+\s*\)|[$@][\w-]+)(\s*!important)?$/i.test(v)
  // a preprocessor variable that only renames another (`$input-btn-font-family: $font-family-base`)
  if (/^[$@][\w-]+$/.test(v)) return false
  return true
}

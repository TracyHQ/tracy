/**
 * A Tailwind 3 template's own theme, read STATICALLY from its `tailwind.config.(js|cjs|mjs|ts)` (the
 * file is never run: a template's config is untrusted code). Only literal values are read: an
 * imported palette (`colors.slate`), a function or a spread is left out, and a class that uses it
 * stays flagged for lack of an original value. PURE apart from reading the file.
 *
 *   readTailwindConfig(root) → { colours: Map<name, value>, radius: Map<size, value>, file } | null
 * Colour names are flattened the way Tailwind names classes (`brand: { DEFAULT, 500 }` → `brand`,
 * `brand-500`). Radius sizes merge over the Tailwind 3 default scale unless `theme.borderRadius`
 * replaces it; `DEFAULT` is the bare `rounded` class.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Tailwind 3 default border radius scale. */
export const RADIUS_V3 = {
  none: '0px',
  sm: '0.125rem',
  DEFAULT: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  '3xl': '1.5rem',
  full: '9999px'
}
const UNKNOWN = Symbol('unknown')

/** @param {string} root */
export function readTailwindConfig(root) {
  const file = [
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'tailwind.config.ts'
  ].find((f) => existsSync(join(root, f)))
  if (!file) return null
  return { file, ...tailwindTheme(readFileSync(join(root, file), 'utf8')) }
}

/** The theme of a config's source text. @param {string} src */
export function tailwindTheme(src) {
  const text = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:"'\\])\/\/[^\n]*/g, '$1')
  const at = /\btheme\s*:\s*\{/.exec(text)
  const theme = at ? objectAt(text, at.index + at[0].length - 1).value : {}
  const ext = theme.extend && typeof theme.extend === 'object' ? theme.extend : {}
  const colours = new Map()
  const flatten = (obj, prefix) => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
      const name = k === 'DEFAULT' ? prefix : prefix ? `${prefix}-${k}` : k
      if (typeof v === 'string' && name) colours.set(name, v)
      else if (v && typeof v === 'object') flatten(v, name)
    }
  }
  flatten(theme.colors, '')
  flatten(ext.colors, '')
  const radius = new Map(
    Object.entries(theme.borderRadius && typeof theme.borderRadius === 'object' ? {} : RADIUS_V3)
  )
  for (const src2 of [theme.borderRadius, ext.borderRadius])
    if (src2 && typeof src2 === 'object')
      for (const [k, v] of Object.entries(src2)) if (typeof v === 'string') radius.set(k, v)
  return { colours, radius }
}

/** A JS object literal at `i` (`{`) as a plain object; values that are not literals are left out. */
function objectAt(s, i) {
  const out = {}
  i++
  while (i < s.length) {
    i = skip(s, i)
    if (s[i] === '}') return { value: out, end: i + 1 }
    if (s[i] === ',') {
      i++
      continue
    }
    if (s.startsWith('...', i)) {
      i = valueAt(s, i + 3).end
      continue
    }
    const key = /^(?:(["'`])((?:(?!\1)[^\\]|\\.)*)\1|([\w$-]+))/.exec(s.slice(i, i + 200))
    if (!key) return { value: out, end: skipValue(s, i) }
    i = skip(s, i + key[0].length)
    if (s[i] !== ':') {
      i = skipValue(s, i)
      continue
    }
    const v = valueAt(s, skip(s, i + 1))
    if (v.value !== UNKNOWN) out[key[2] ?? key[3]] = v.value
    i = v.end
  }
  return { value: out, end: i }
}

function valueAt(s, i) {
  if (s[i] === '{') return objectAt(s, i)
  const str = /^(["'`])((?:(?!\1)[^\\]|\\.)*)\1/.exec(s.slice(i, i + 2000))
  if (str && !(str[1] === '`' && str[2].includes('${'))) {
    const end = skip(s, i + str[0].length)
    // a string followed by an operator is an expression, not a literal
    if (/[,}\n]/.test(s[end] ?? '}') || s[end] === undefined) return { value: str[2], end }
  }
  const num = /^-?\d+(\.\d+)?/.exec(s.slice(i, i + 40))
  if (num && /[\s,}]/.test(s[i + num[0].length] ?? '}')) return { value: num[0], end: i + num[0].length }
  return { value: UNKNOWN, end: skipValue(s, i) }
}

/** Offset after a value of any shape: up to the next `,` or `}` at its own depth. */
function skipValue(s, i) {
  let d = 0
  let quote = ''
  for (; i < s.length; i++) {
    const c = s[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'" || c === '`') quote = c
    else if ('([{'.includes(c)) d++
    else if (')]}'.includes(c)) {
      if (d === 0) return i
      d--
    } else if (c === ',' && d === 0) return i
  }
  return i
}

const skip = (s, i) => {
  while (i < s.length && /\s/.test(s[i])) i++
  return i
}

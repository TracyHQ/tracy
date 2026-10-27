/**
 * The page ground of each side (light, dark), read from what the template's body, html or :root
 * PAINTS (JA Kinetic dry run, 15/10/2026: the first variable whose name ended in `-bg` was taken, a
 * code panel's `--split-code-bg: #0d1110` became the light page). PURE.
 *
 * The last `background` of a plain body/html/:root rule wins (the cascade); a variable it reads is
 * resolved on the side asked, through the last definition of a plain root rule of that side (T4's
 * `:root` and `html.t4-dark`; a `[data-style=blueprint]` preset is a variant, not the default), then
 * through `light-dark(a, b)`. A role read `var(--ds-c-bg, #fbfcfa)` reads as its fallback, so a page
 * already converted gives the same ground as the original.
 */
import { isDarkPrelude } from './css-lexer.mjs'
import { parseColour } from './literals.mjs'

const DARK_HOOK =
  /\[data-(?:bs-)?(?:theme|color-scheme|color-mode|mode)\s*=\s*["']?dark["']?\s*\]|\.(?:dark|t4-dark|theme-dark|dark-mode|dark-theme|is-dark-theme|mode-dark)(?![\w-])/gi

/** One part of a selector list is the page root itself: html, body, :root, optionally on the dark side. */
export const isPlainRoot = (part) => {
  const rest = part
    .replace(DARK_HOOK, '')
    .replace(/\s*>\s*/g, ' ')
    .trim()
  // `.dark { … }` alone is the root on the dark side (Tailwind's class hook)
  if (!rest) return rest !== part.trim()
  return /^((html|body|:root)\s*)+$/i.test(rest)
}

const rootish = (selector) => (selector ?? '').split(',').some(isPlainRoot)
const preset = (v) =>
  v.replace(/var:(preset|custom)\|([\w|-]+)/g, (_, k, p) => `var(--wp--${k}--${p.split('|').join('--')})`)

/**
 * @param {{ prop: string, value: string, selector: string, scheme: string }[]} decls every declaration,
 *   in file order
 * @returns {{ light: string | null, dark: string | null }} null: no root ground found
 */
export function rootGrounds(decls) {
  const defs = new Map()
  const grounds = []
  for (const d of decls) {
    if (!rootish(d.selector)) continue
    const dark = d.scheme === 'dark' || isDarkPrelude(d.selector)
    if (d.prop.startsWith('--')) {
      if (!defs.has(d.prop)) defs.set(d.prop, [])
      defs.get(d.prop).push({ value: preset(d.value), dark })
    } else if (/^(background|background-color)$/.test(d.prop)) grounds.push({ value: preset(d.value), dark })
  }
  const side = (list, dark) => {
    const own = list.filter((x) => x.dark === dark)
    return own.length || !dark ? own : list
  }
  const resolve = (value, dark, depth = 0) => {
    if (depth > 10) return null
    const v = value.replace(/\s*!important\s*$/i, '').trim()
    const ds = /^var\(\s*--ds-[\w-]+\s*,\s*(.+)\)$/s.exec(v)
    if (ds) return resolve(ds[1], dark, depth + 1)
    const ref = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/s.exec(v)
    if (ref) {
      for (const d of side(defs.get(ref[1]) ?? [], dark).reverse()) {
        const hex = resolve(d.value, dark, depth + 1)
        if (hex) return hex
      }
      return ref[2] ? resolve(ref[2], dark, depth + 1) : null
    }
    const ld = /^light-dark\(\s*((?:[^(),]|\([^()]*\))+)\s*,\s*((?:[^(),]|\([^()]*\))+)\s*\)$/.exec(v)
    if (ld) return resolve(dark ? ld[2] : ld[1], dark, depth + 1)
    // `background: #fff url(…)` and other shorthands: the colour in it
    const lit = parseColour(v) ?? parseColour(v.split(/\s+(?![^(]*\))/)[0] ?? '')
    return lit && lit.alpha >= 0.9 ? lit.hex : null
  }
  const pick = (dark) => {
    for (const g of side(grounds, dark).reverse()) {
      const hex = resolve(g.value, dark)
      if (hex) return hex
    }
    return null
  }
  return { light: pick(false), dark: pick(true) }
}

/** A variable that names the page ground itself (`--bg`, `--color-paper`, `--t4-body-bg`), not a part's. */
export const isPageGroundName = (name) =>
  name
    .toLowerCase()
    .replace(/^[-$@]+/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .every((w) =>
      /^(color|colour|clr|bg|background|page|body|site|main|base|canvas|paper|default|ds|tw|wp|bs|t4|preset|theme|[a-z]{1,2}\d?)$/.test(
        w
      )
    )

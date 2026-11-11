// The sides of a template, read from its stylesheets: the page as it opens (`base`) and every mode it can switch to,
// named by its marker (`.light-active`, `[data-bs-theme=dark]`, `@media (prefers-color-scheme: dark)`), each with the
// variables it declares and the page grounds it paints. Measured, never named: no template or class is named here; a
// dark template's light mode is a side like any other.
import { chromaOf, coloursIn, hexOf, luminanceOf, rgbOf } from './colour-maths.mjs'

const MODE =
  /\[data-(?:bs-)?(?:theme|color-scheme|mode)\s*=\s*["']?(?:dark|light)["']?\s*\]|html\.(?:dark|light)\b|\.(?:dark|light)-(?:mode|theme|active)\b|\.theme-(?:dark|light)\b/i
const MEDIA_MODE = /prefers-color-scheme\s*:\s*(dark|light)/i
const ROOTISH = /^(?::root|html|body)?$/
const GROUND = /^(?:html|body|\.t4-wrapper|\.t4-content|\.t3-wrapper|#t3-mainbody|\.t3-mainbody)$/

export const itemsOf = (selector) => selector.split(',').map((s) => s.trim())

/** Whether a rule sits in no condition at all but a cascade layer (Tailwind v4 prints every rule inside `@layer`). */
const unconditional = (at = []) => at.every((a) => /^@layer\b/i.test(a))

/** The side one selector item belongs to, and the item without its marker. */
export function sideOfItem(item, at = []) {
  const m = MODE.exec(item)
  if (m) return { side: m[0], rest: item.replace(m[0], ' ').replace(/\s+/g, ' ').trim() }
  const media = at.map((a) => MEDIA_MODE.exec(a)).find(Boolean)
  return { side: media ? `@media (prefers-color-scheme: ${media[1].toLowerCase()})` : 'base', rest: item }
}

/** The side of a rule: its first item's that names one, else its media's, else `base`. */
export const sideOfRule = (rule) =>
  itemsOf(rule.selector)
    .map((s) => sideOfItem(s, rule.at).side)
    .find((s) => s !== 'base') ?? 'base'

/** `value` with every `var(--x, fallback)` it can resolve resolved; one it cannot is left as written. */
export function resolveVars(value, vars, depth = 0) {
  if (depth > 8 || !value.includes('var(')) return value
  let out = ''
  let i = 0
  while (i < value.length) {
    const at = value.indexOf('var(', i)
    if (at < 0) return out + value.slice(i)
    out += value.slice(i, at)
    let d = 0
    let j = at + 4
    let comma = -1
    for (; j < value.length; j += 1) {
      const ch = value[j]
      if (ch === '(') d += 1
      else if (ch === ')') {
        if (d === 0) break
        d -= 1
      } else if (ch === ',' && d === 0 && comma < 0) comma = j
    }
    const name = value.slice(at + 4, comma < 0 ? j : comma).trim()
    const fallback = comma < 0 ? undefined : value.slice(comma + 1, j).trim()
    const got = vars.get(name) ?? fallback
    out += got === undefined ? value.slice(at, j + 1) : resolveVars(got, vars, depth + 1)
    i = j + 1
  }
  return out
}

/**
 * The template's sides: `base` first, then each mode marker, each with its variables (laid over the base's), where
 * each variable was declared (`from`: the stylesheet the rule came from), and its page grounds (`#rrggbb`, opaque).
 * @param {Array<{at: string[], selector: string, decls: Array<{prop: string, value: string}>, from?: string}>} rules
 * @returns {Map<string, {vars: Map<string, string>, own: Map<string, {value: string, from: string|null}>, grounds: string[], panels: string[]}>}
 */
export function sidesOf(rules) {
  const declared = new Map([['base', new Map()]])
  const grounds = []
  const panels = []
  for (const r of rules)
    for (const item of itemsOf(r.selector)) {
      const { side, rest } = sideOfItem(item, r.at)
      if (!declared.has(side)) declared.set(side, new Map())
      if (ROOTISH.test(rest) && (side !== 'base' || unconditional(r.at)))
        for (const d of r.decls)
          if (d.prop.startsWith('--'))
            declared.get(side)?.set(d.prop, { value: d.value, from: r.from ?? null })
      for (const d of r.decls) {
        if (!/^background(-color)?$/.test(d.prop)) continue
        if (GROUND.test(rest)) grounds.push({ side, rest, value: d.value })
        else panels.push({ side, value: d.value })
      }
    }
  const valuesOf = (m) => new Map([...m].map(([k, v]) => [k, v.value]))
  const out = new Map()
  for (const [side, own] of declared) {
    const vars =
      side === 'base' ? valuesOf(own) : new Map([...valuesOf(declared.get('base')), ...valuesOf(own)])
    const at = new Map()
    for (const g of grounds) {
      if (g.side !== 'base' && g.side !== side) continue
      const c = coloursIn(resolveVars(g.value, vars)).find((x) => (x.a ?? 1) >= 0.9)
      if (c) at.set(g.rest, hexOf(c))
    }
    const list = [...new Set(at.values())]
    const ground = list.length ? list : ['#ffffff']
    // Neutral surfaces of the same kind as the page (a dark card on a dark page, a pale band on a light one).
    const dark = luminanceOf(/** @type {any} */ (rgbOf(ground[0]))) < 0.18
    const near = new Set()
    for (const g of panels) {
      if (g.side !== 'base' && g.side !== side) continue
      const c = coloursIn(resolveVars(g.value, vars)).find((x) => (x.a ?? 1) >= 0.9)
      if (!c || chromaOf(c) >= 0.04) continue
      const l = luminanceOf(c)
      if (dark ? l < 0.06 : l > 0.6) near.add(hexOf(c))
    }
    out.set(side, {
      vars,
      own,
      grounds: ground,
      groundMeasured: list.length > 0,
      panels: [...near].filter((x) => !ground.includes(x))
    })
  }
  return out
}

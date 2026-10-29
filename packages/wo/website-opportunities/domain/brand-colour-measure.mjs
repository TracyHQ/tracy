// What a template paints its brand with, measured in the stylesheets a site serves (spec TracyHQ/tracy#189, ADR 0023
// amended 29/10/2026), for `brand-colour-css.mjs`:
//
//   sides                 the template's sides: the page as it opens (`base`) and each mode it can switch to, named by its
//                         marker (`.light-active`, `[data-bs-theme=dark]`, `@media (prefers-color-scheme: dark)`), each
//                         with the variables it declares and the page grounds it paints
//   templateBrandColours  the brand colour: the colour the framework role rules resolve to (links, the primary button,
//                         `.text-primary`, `.bg-primary`, the primary/link/accent theme variables), voted; a secondary from
//                         the secondary roles; the status colours that are never brand; the words written on the brand
//
// 🔒 MEASURED, NEVER NAMED: no template, file or colour value is named here. A T4 template paints through its theme
// variables (`:root{--color-primary:...}` read by `var()`), a T3 one through literal colours its LESS compiled; both resolve
// to the same colour, so one measure covers both. Which side a page opens on is the template's: a dark template's light
// mode is a side like any other.
import { chromaOf, hexOf, hueGapOf, luminanceOf, rgbOf } from './brand-colour-maths.mjs'
import { cssRules } from './brand-colour-css-rules.mjs'

const MODE =
  /\[data-(?:bs-)?(?:theme|color-scheme|mode)\s*=\s*["']?(?:dark|light)["']?\s*\]|html\.(?:dark|light)\b|\.(?:dark|light)-(?:mode|theme|active)\b|\.theme-(?:dark|light)\b/i
const MEDIA_MODE = /prefers-color-scheme\s*:\s*(dark|light)/i
const ROOTISH = /^(?::root|html|body)?$/
const GROUND = /^(?:html|body|\.t4-wrapper|\.t4-content|\.t3-wrapper|#t3-mainbody|\.t3-mainbody)$/
/** Status colours of the frameworks (`.text-danger`, `.alert-error`, `--color-warning`, `.btn-info`): never brand. */
export const STATUS =
  /(?:danger|error|invalid|warning|success)\b|(?:^|[^\w-])(?:text|bg|btn|btn-outline|alert|badge|border|link)-info\b|^--(?:[a-z0-9]+-)*info(?:-|$)/i
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^()]*\)/gi

/** Role rules of the frameworks: [selector, properties, kind]. */
const ROLE_RULES = [
  [/^a(?::hover)?$/, ['color'], 'primary'],
  [/^(?:\.btn)?\.btn-primary$/, ['background-color', 'background'], 'primary'],
  [/^\.text-primary$/, ['color'], 'primary'],
  [/^\.bg-primary$/, ['background-color', 'background'], 'primary'],
  [/^(?:\.btn)?\.btn-secondary$/, ['background-color', 'background'], 'secondary'],
  [/^\.(?:text|bg)-secondary$/, ['color', 'background-color', 'background'], 'secondary']
]
const PRIMARY_VAR =
  /^--(?!ds-)(?:[a-z0-9]+-)*(?:(?:primary|brand|accent)(?:-colou?r)?|link(?:-hover|-active)?-colou?r)$/
const SECONDARY_VAR = /^--(?!ds-)(?:[a-z0-9]+-)*secondary(?:-colou?r)?$/

export const itemsOf = (selector) => selector.split(',').map((s) => s.trim())
export const strong = (c) => Boolean(c) && chromaOf(c) >= 0.25 && (c.a ?? 1) > 0.5
export const same = (c, t) => Boolean(c && t) && c.r === t.r && c.g === t.g && c.b === t.b
export const coloursIn = (value) =>
  [...String(value).matchAll(COLOUR)].map((m) => rgbOf(m[0])).filter(Boolean)

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
 * The template's sides: `base` first, then each mode marker, each with its variables (laid over the base's) and its page
 * grounds (`#rrggbb`, opaque).
 * @param {ReturnType<typeof cssRules>} rules
 * @returns {Map<string, {vars: Map<string, string>, grounds: string[], panels: string[]}>}
 */
export function sidesOf(rules) {
  const declared = new Map([['base', new Map()]])
  const grounds = []
  const panels = []
  for (const r of rules)
    for (const item of itemsOf(r.selector)) {
      const { side, rest } = sideOfItem(item, r.at)
      if (!declared.has(side)) declared.set(side, new Map())
      if (ROOTISH.test(rest) && (side !== 'base' || r.at.length === 0))
        for (const d of r.decls) if (d.prop.startsWith('--')) declared.get(side)?.set(d.prop, d.value)
      for (const d of r.decls) {
        if (!/^background(-color)?$/.test(d.prop)) continue
        if (GROUND.test(rest)) grounds.push({ side, rest, value: d.value })
        else panels.push({ side, value: d.value })
      }
    }
  const out = new Map()
  for (const [side, own] of declared) {
    const vars = side === 'base' ? own : new Map([...declared.get('base'), ...own])
    const at = new Map()
    for (const g of grounds) {
      if (g.side !== 'base' && g.side !== side) continue
      const c = coloursIn(resolveVars(g.value, vars)).find((x) => (x.a ?? 1) >= 0.9)
      if (c) at.set(g.rest, hexOf(c))
    }
    const list = [...new Set(at.values())]
    const ground = list.length ? list : ['#ffffff']
    // The template's own neutral surfaces of the same kind as the page (a dark card or tab bar on a dark page, a pale band
    // on a light one): words in the brand colour must read on them too.
    const dark = luminanceOf(/** @type {any} */ (rgbOf(ground[0]))) < 0.18
    const near = new Set()
    for (const g of panels) {
      if (g.side !== 'base' && g.side !== side) continue
      const c = coloursIn(resolveVars(g.value, vars)).find((x) => (x.a ?? 1) >= 0.9)
      if (!c || chromaOf(c) >= 0.04) continue
      const l = luminanceOf(c)
      if (dark ? l < 0.06 : l > 0.6) near.add(hexOf(c))
    }
    out.set(side, { vars, grounds: ground, panels: [...near].filter((x) => !ground.includes(x)) })
  }
  return out
}

/**
 * @param {Array<{css: string}>} styles
 */
export function templateBrandColours(styles) {
  const rules = styles.flatMap((s) => cssRules(s?.css ?? ''))
  const sides = sidesOf(rules)
  const base = /** @type {{vars: Map<string, string>, grounds: string[]}} */ (sides.get('base'))
  const status = new Set()
  const addStatus = (value) => {
    for (const c of coloursIn(resolveVars(value, base.vars))) status.add(hexOf(c))
  }
  const last = new Map()
  for (const r of rules) {
    for (const d of r.decls) if (STATUS.test(d.prop)) addStatus(d.value)
    for (const s of itemsOf(r.selector)) {
      if (STATUS.test(s)) for (const d of r.decls) addStatus(d.value)
      if (sideOfItem(s, r.at).side !== 'base') continue
      ROLE_RULES.forEach(([re, props, kind], n) => {
        if (!re.test(s)) return
        for (const d of r.decls) if (props.includes(d.prop)) last.set(`${n}:${s}`, { kind, value: d.value })
      })
    }
  }
  const votes = { primary: new Map(), secondary: new Map() }
  const vote = (kind, value, weight) => {
    const c = coloursIn(resolveVars(value, base.vars)).find(strong)
    if (c && !status.has(hexOf(c))) votes[kind].set(hexOf(c), (votes[kind].get(hexOf(c)) ?? 0) + weight)
  }
  // The rules a visitor sees weigh three times a variable the template may never read.
  for (const { kind, value } of last.values()) vote(kind, value, 3)
  for (const [name, value] of base.vars) {
    if (PRIMARY_VAR.test(name)) vote('primary', value, 1)
    else if (SECONDARY_VAR.test(name)) vote('secondary', value, 1)
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const primary = top(votes.primary)
  for (const hex of votes.secondary.keys())
    if (!primary || hueGapOf(/** @type {any} */ (rgbOf(hex)), /** @type {any} */ (rgbOf(primary))) < 20)
      votes.secondary.delete(hex)
  const ons = primary ? wordsOn(rules, base.vars, /** @type {any} */ (rgbOf(primary))) : []
  return {
    primary,
    secondary: primary ? top(votes.secondary) : null,
    grounds: Object.fromEntries([...sides].map(([side, s]) => [side, s.grounds])),
    on: ons[0] ?? null,
    ons,
    status,
    rules,
    sides
  }
}

/**
 * The words the template writes on its brand colour: every neutral colour a rule with that background declares, or a rule
 * of the same part declares beside it (`.btn.btn-primary{color:#000}` next to its background rule), most used first.
 */
function wordsOn(rules, vars, t) {
  const count = new Map()
  const add = (value) => {
    const c = coloursIn(resolveVars(value, vars))[0]
    if (c && chromaOf(c) < 0.1) count.set(hexOf(c), (count.get(hexOf(c)) ?? 0) + 1)
  }
  const filledItems = new Set()
  for (const r of rules) {
    if (sideOfRule(r) !== 'base') continue
    const filled = r.decls.some(
      (d) => d.prop.startsWith('background') && coloursIn(resolveVars(d.value, vars)).some((c) => same(c, t))
    )
    if (!filled) continue
    for (const s of itemsOf(r.selector)) filledItems.add(s)
    const color = r.decls.find((d) => d.prop === 'color')
    if (color) add(color.value)
  }
  for (const r of rules) {
    if (sideOfRule(r) !== 'base' || !itemsOf(r.selector).some((s) => filledItems.has(s))) continue
    if (r.decls.some((d) => d.prop.startsWith('background'))) continue
    const color = r.decls.findLast((d) => d.prop === 'color')
    if (color) add(color.value)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex)
}

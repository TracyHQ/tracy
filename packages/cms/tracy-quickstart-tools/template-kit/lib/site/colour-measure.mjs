// What a template paints its brand with, measured in the stylesheets a site serves:
//
//   primary    the colour the framework role rules resolve to (links, the primary button, `.text-primary`, `.bg-primary`,
//              the primary/link/accent theme variables), voted; with every role it was found in
//   secondary  the same from the secondary roles, kept only when its hue stands apart from the primary
//   status     the status colours (danger, warning, success, info), never brand
//   on         the words the template writes on the primary colour, most used first
//
// Measured, never named: no template, file or colour value is named here. A template that paints through theme
// variables (`:root{--color-primary:...}` read by `var()`) and one that paints literal compiled colours both resolve
// to the same colour, so one measure covers both.
import { chromaOf, coloursIn, hexOf, hueGapOf, rgbOf } from './colour-maths.mjs'
import { cssRules } from './css-rules.mjs'
import { itemsOf, resolveVars, sideOfItem, sideOfRule, sidesOf } from './colour-sides.mjs'

/** Status colours of the frameworks (`.text-danger`, `.alert-error`, `--color-warning`, `.btn-info`): never brand. */
export const STATUS =
  /(?:danger|error|invalid|warning|success)\b|(?:^|[^\w-])(?:text|bg|btn|btn-outline|alert|badge|border|link)-info\b|^--(?:[a-z0-9]+-)*info(?:-|$)/i

/** Role rules of the frameworks: [selector, properties, kind, role name]. */
const ROLE_RULES = [
  [/^a(?::hover)?$/, ['color'], 'primary', 'link'],
  [/^(?:\.btn)?\.btn-primary$/, ['background-color', 'background'], 'primary', 'button-fill'],
  [/^\.text-primary$/, ['color'], 'primary', 'text'],
  [/^\.bg-primary$/, ['background-color', 'background'], 'primary', 'fill'],
  [/^(?:\.btn)?\.btn-secondary$/, ['background-color', 'background'], 'secondary', 'button-fill'],
  [/^\.(?:text|bg)-secondary$/, ['color', 'background-color', 'background'], 'secondary', 'text-or-fill']
]
const PRIMARY_VAR =
  /^--(?!ds-)(?:[a-z0-9]+-)*(?:(?:primary|brand|accent)(?:-colou?r)?|link(?:-hover|-active)?-colou?r)$/
const SECONDARY_VAR = /^--(?!ds-)(?:[a-z0-9]+-)*secondary(?:-colou?r)?$/

/** A colour strong enough to be a brand colour: coloured and mostly opaque. */
export const strong = (c) => Boolean(c) && chromaOf(c) >= 0.25 && (c.a ?? 1) > 0.5
const same = (c, t) => Boolean(c && t) && c.r === t.r && c.g === t.g && c.b === t.b

/**
 * Every style rule of the stylesheets, each marked with the stylesheet it came from.
 * @param {Array<{css: string, from?: string}>} styles
 */
export const rulesOf = (styles) =>
  styles.flatMap((s) => cssRules(s?.css ?? '').map((r) => ({ ...r, from: s?.from ?? null })))

/**
 * @param {Array<{css: string, from?: string}>} styles
 */
export function measureBrandColours(styles) {
  const rules = rulesOf(styles)
  const sides = sidesOf(rules)
  const base = /** @type {{vars: Map<string, string>}} */ (sides.get('base'))
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
      ROLE_RULES.forEach(([re, props, kind, role], n) => {
        if (!re.test(s)) return
        for (const d of r.decls)
          if (props.includes(d.prop)) last.set(`${n}:${s}`, { kind, role, value: d.value })
      })
    }
  }
  const votes = { primary: new Map(), secondary: new Map() }
  const roles = { primary: new Map(), secondary: new Map() }
  const vote = (kind, value, weight, role) => {
    const c = coloursIn(resolveVars(value, base.vars)).find(strong)
    if (!c || status.has(hexOf(c))) return
    const hex = hexOf(c)
    votes[kind].set(hex, (votes[kind].get(hex) ?? 0) + weight)
    if (!roles[kind].has(hex)) roles[kind].set(hex, new Set())
    roles[kind].get(hex).add(role)
  }
  // The rules a visitor sees weigh three times a variable the template may never read.
  for (const { kind, value, role } of last.values()) vote(kind, value, 3, role)
  for (const [name, value] of base.vars) {
    if (PRIMARY_VAR.test(name)) vote('primary', value, 1, `variable ${name}`)
    else if (SECONDARY_VAR.test(name)) vote('secondary', value, 1, `variable ${name}`)
  }
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const primary = top(votes.primary)
  for (const hex of votes.secondary.keys())
    if (!primary || hueGapOf(/** @type {any} */ (rgbOf(hex)), /** @type {any} */ (rgbOf(primary))) < 20)
      votes.secondary.delete(hex)
  const secondary = primary ? top(votes.secondary) : null
  return {
    primary,
    primaryRoles: primary ? [...roles.primary.get(primary)].sort() : [],
    secondary,
    secondaryRoles: secondary ? [...roles.secondary.get(secondary)].sort() : [],
    on: primary ? wordsOn(rules, base.vars, /** @type {any} */ (rgbOf(primary))) : [],
    status: [...status].sort(),
    rules,
    sides
  }
}

/**
 * The words the template writes on its brand colour: every neutral colour a rule with that background declares, or a
 * rule of the same part declares beside it, most used first.
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

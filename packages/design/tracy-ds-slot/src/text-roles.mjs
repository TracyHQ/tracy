/**
 * Text painted with a ground role: a direct `color` (or `-webkit-text-fill-color`) whose value reads a
 * fill role of the slot (`--ds-c-accent`, `--ds-c-bg`, `--ds-c-surface`, `--ds-c-ink`, a status fill…)
 * where a text role exists for it. PURE.
 *
 * A fill role is only held to contrast as a ground: the accent fill may be a pale blue that dark words
 * read on, and the readable accent as words is `--ds-c-accent-text`; the page colour as words reads only
 * on the band or fill it was meant for, whose words have their own role (`--ds-c-on-ink`,
 * `--ds-c-accent-on`). A code review of JA Restaurant (20/10/2026) found a text `color` reading
 * `var(--ds-c-accent)` in the joomlart-products sources: under a system with a light accent its words faded
 * into the page. Read by the Template Design System Readiness rule TEXT-1.
 *
 * The role judged is the one the value paints under a system, its outermost slot read
 * (`paintedRoles`): a text role in a fallback does not excuse a ground role read first.
 * Not judged: a value that also paints a text role (a mix of the text with the page), an inverted pair (words in a ground role on a fill in that ground's own
 * words role: the accent on `--ds-c-accent-on`, the page on `--ds-c-accent-text`; contrast is the same
 * both ways, so it reads as the pair does), outline lettering whose fill is the page on purpose (a rule
 * that also sets `-webkit-text-stroke`), and icon `fill` (an SVG glyph may be a shape on its ground).
 * Out of scope (Hano, 20/10/2026): a template property that holds a text colour, such as Bootstrap's
 * contextual table and button variables (`--t4-table-color`, `--t4-btn-hover-color`); only the
 * declaration that paints the words is judged.
 */
import { declarationsOf, lineIndex } from './role-scan/css-lexer.mjs'

/** The fill roles: a ground, never words. */
export const GROUND_ROLES = Object.freeze([
  'bg',
  'surface',
  'surface-warm',
  'surface-hover',
  'ink',
  'accent',
  'accent-hover',
  'accent-active',
  'accent-band',
  'disabled-bg',
  ...['success', 'warn', 'danger', 'info'].flatMap((s) => [s, `${s}-bg`])
])

/** The words roles: a value reading one of them is judged as text already. */
const TEXT_ROLE =
  /^(fg|fg-2|heading|muted|meta|accent-text|accent-text-hover|on-ink|accent-on|accent-on-ink|on-accent-band|disabled-fg|(success|warn|danger|info)-text)$/

const TEXT_PROPS = new Set(['color', '-webkit-text-fill-color'])

/** The words a fill under them take: the rule's own background, when it reads a slot fill. */
const WORDS_ON = /** @type {Record<string, string>} */ ({
  ink: 'on-ink',
  accent: 'accent-on',
  'accent-hover': 'accent-on',
  'accent-active': 'accent-on',
  'accent-band': 'on-accent-band'
})

/**
 * The text role a ground role read as words should be.
 * @param {string} role  the ground role the words read
 * @param {string | null} under  the slot fill the same rule paints, if any
 */
export function textRoleFor(role, under) {
  if (under && WORDS_ON[under] && PAGE_GROUNDS.includes(role)) return WORDS_ON[under]
  const status = /^(success|warn|danger|info)(?:-bg)?$/.exec(role)?.[1]
  if (status) return `${status}-text`
  if (role === 'accent' || role === 'accent-band') return 'accent-text'
  if (role === 'accent-hover' || role === 'accent-active') return 'accent-text-hover'
  if (role === 'disabled-bg') return 'disabled-fg'
  if (role === 'ink') return 'heading or fg'
  // the page or a card colour as words: the words of the band or fill they sit on
  return 'on-ink or accent-on'
}

/**
 * The slot roles a value paints: each outermost `var(--ds-c-…)` read, never its fallback, which shows
 * only while no system is worn (`var(--ds-c-accent, var(--ds-c-fg))` paints the accent). A template
 * property read first (`var(--brand, var(--ds-c-accent))`) hands over to the roles of its fallback, and
 * every read inside a function (`light-dark()`, `color-mix()`) is painted.
 * @param {string} value
 * @returns {string[]}
 */
export function paintedRoles(value) {
  const out = []
  for (let i = value.indexOf('var('); i !== -1; ) {
    const { inner, end } = bracketed(value, i + 3)
    const comma = topComma(inner)
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim()
    if (name.startsWith('--ds-c-')) out.push(name.slice('--ds-c-'.length))
    else if (comma !== -1) out.push(...paintedRoles(inner.slice(comma + 1)))
    i = value.indexOf('var(', end)
  }
  return out
}

const PAGE_GROUNDS = ['bg', 'surface', 'surface-warm', 'surface-hover']
/** The words roles that read on each ground by construction (role-values.mjs): its inverted pair. */
const PAIRS = /** @type {Record<string, RegExp>} */ ({
  ...Object.fromEntries(
    PAGE_GROUNDS.map((g) => [
      g,
      /^(fg|fg-2|heading|muted|accent-text|accent-text-hover|(success|warn|danger|info)-text)$/
    ])
  ),
  ink: /^(on-ink|accent-on-ink)$/,
  accent: /^accent-on$/,
  'accent-hover': /^accent-on$/,
  'accent-active': /^accent-on$/,
  'accent-band': /^on-accent-band$/,
  'disabled-bg': /^disabled-fg$/,
  ...Object.fromEntries(
    ['success', 'warn', 'danger', 'info'].map((s) => [`${s}-bg`, new RegExp(`^${s}-text$`)])
  )
})

/** The text after `open` (an opening bracket) up to its own closing bracket, and where that is. */
function bracketed(/** @type {string} */ s, /** @type {number} */ open) {
  let depth = 0
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1
    else if (s[i] === ')' && --depth === 0) return { inner: s.slice(open + 1, i), end: i }
  }
  return { inner: s.slice(open + 1), end: s.length }
}

/** The first comma of `s` outside brackets, or -1. */
function topComma(/** @type {string} */ s) {
  for (let i = 0, d = 0; i < s.length; i += 1) {
    if (s[i] === '(') d += 1
    else if (s[i] === ')') d -= 1
    else if (s[i] === ',' && d === 0) return i
  }
  return -1
}

/**
 * A value as each side of light paints it: every `light-dark(a, b)` taken as `a`, then as `b` (one value
 * when it has none). A `color-mix()` stays whole: its colours are painted together.
 * @param {string} value
 * @returns {string[]}
 */
export function sidesOf(value) {
  const at = value.indexOf('light-dark(')
  if (at === -1) return [value]
  const { inner, end } = bracketed(value, at + 'light-dark'.length)
  const comma = topComma(inner)
  if (comma === -1) return [value]
  const [before, after] = [value.slice(0, at), value.slice(end + 1)]
  return [inner.slice(0, comma), inner.slice(comma + 1)].flatMap((arm) => sidesOf(before + arm + after))
}

/**
 * Every text colour of the stylesheets that reads a ground role.
 * @param {[string, string][]} sheets  [file, text]
 * @returns {{ file: string, line: number, selector: string, property: string, role: string, use: string }[]}
 */
export function groundRolesAsText(sheets) {
  // the slot roles each template property is declared with, so a fill read through one is known
  // (`--tas-submit: var(--ds-c-accent-on)` read by `background: var(--tas-submit, …)`)
  /** @type {Map<string, string>} */
  const declared = new Map()
  for (const [file, text] of sheets)
    for (const d of declarationsOf(text, { lineComments: /\.(scss|less)$/i.test(file) })) {
      const r = paintedRoles(d.value)[0]
      if (d.prop.startsWith('--') && !d.prop.startsWith('--ds-') && r && !declared.has(d.prop.toLowerCase()))
        declared.set(d.prop.toLowerCase(), r)
    }
  /** The first slot role a fill reads, directly or through a template property. */
  const fillRole = (/** @type {string} */ value) => {
    for (const m of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
      const n = m[1].toLowerCase()
      if (n.startsWith('--ds-c-')) return n.slice('--ds-c-'.length)
      if (declared.has(n)) return /** @type {string} */ (declared.get(n))
    }
    return null
  }
  const out = []
  for (const [file, text] of sheets) {
    const decls = declarationsOf(text, { lineComments: /\.(scss|less)$/i.test(file) })
    const lineOf = lineIndex(text)
    /** @type {Map<number, typeof decls>} */
    const byRule = new Map()
    for (const d of decls) byRule.set(d.rule, [...(byRule.get(d.rule) ?? []), d])
    for (const d of decls) {
      const prop = d.prop.toLowerCase()
      if (!TEXT_PROPS.has(prop)) continue
      const rule = byRule.get(d.rule) ?? []
      if (
        prop === '-webkit-text-fill-color' &&
        rule.some((x) => x.prop.toLowerCase().startsWith('-webkit-text-stroke'))
      )
        continue
      // the fill the words sit on: the rule's own background, side by side with the words
      const fill = rule.find((x) => /^background(-color)?$/i.test(x.prop))
      const words = sidesOf(d.value)
      const fills = fill ? sidesOf(fill.value) : []
      // each side of a light-dark() is painted alone: a text role in one half does not excuse the other,
      // and the words of one half sit on the same half of the fill
      const hit = words
        .map((side, i) => {
          const roles = paintedRoles(side)
          if (roles.some((r) => TEXT_ROLE.test(r))) return null
          const ground = roles.find((r) => GROUND_ROLES.includes(r))
          if (!ground) return null
          // the halves of the fill these words sit on: the same half, or every half when only one side splits
          const unders = (fills.length === words.length ? [fills[i]] : fills).map(fillRole)
          const paired = unders.length > 0 && unders.every((u) => u !== null && PAIRS[ground]?.test(u))
          return paired ? null : { ground, under: unders[0] ?? null }
        })
        .find(Boolean)
      if (!hit) continue
      const { ground, under } = hit
      out.push({
        file,
        line: lineOf(d.start),
        selector: d.selector.replace(/\s+/g, ' ').trim().slice(0, 120),
        property: d.prop,
        role: ground,
        use: textRoleFor(ground, under)
      })
    }
  }
  return out
}

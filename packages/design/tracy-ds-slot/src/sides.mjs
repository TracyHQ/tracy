/**
 * The two sides of a template with a light/dark switch (contract `modes: true`, #1315; ported from
 * EmDash to Joomla and WordPress after Akemi's ruling of 13/10/2026 that hiding the switch is a bug).
 * PURE. A Joomla or WordPress sheet is written once per side, each from its own profile (the system's
 * own and the one derive.mjs builds for the other side), and every rule of a side is then scoped to
 * the template's mode it belongs to: `data-theme` on the root element, the hook every two-mode Tracy
 * theme sets (Joomla tracy-base / tracy_business darkmode.js, the WordPress overlays' *-dark.js).
 *
 * A theme with an "auto" state leaves the attribute off and follows the OS; there the light side
 * applies, and a copy of the dark side under `@media (prefers-color-scheme: dark)` takes over when
 * the OS is dark, as the theme's own stylesheets do.
 */
import { derive, modeOf } from './derive.mjs'
import { mergeSides } from './side-merge.mjs'

/**
 * The condition each side is scoped by, appended to the root element's compound inside :where(), so
 * every rule keeps the specificity the one-look sheet gave it: the contracts were tuned against the
 * template's own rules at those weights. Measured 14/10/2026 on JA Vega WP: with the bare attribute
 * the side's link colour (:root :where(a), WordPress's own weight 0,1,0) rose to 0,2,0 and beat the
 * theme's white header links (.jv-mega__link), 3.66:1 on its dark hero.
 */
export const SIDE = { light: ':where(:not([data-theme="dark"]))', dark: ':where([data-theme="dark"])' }
const AUTO = ':where(:not([data-theme]))'

/**
 * A condition on the root element: attributes and classes the root carries together (`[data-theme="dark"].t4-dark`:
 * JA Kinetic WordPress marks its dark side with both, and a press that set one left the other, 18/10/2026), or a
 * `:has()` reaching the body (no braces, commas).
 */
const HOOK =
  /^(?:(?:\[[\w-]+(?:="[\w-]+")?\]|\.[\w-]+)+|:has\(>\s*body(?:\.[\w-]+|\[[\w-]+(?:="[\w-]+")?\])+\))$/

/**
 * The two sides of one template: Tracy's own themes mark the dark side with `data-theme="dark"` on the root
 * and leave it off for "auto" (follow the OS); the JA templates mark it with a class on the body
 * (`body.dark-active`, set by their own switch and cookie), and a page without it is light whatever the OS
 * says. A contract names its hook (`modeHook`, a condition on the root: `:has(> body.dark-active)`) and
 * whether the template has an "auto" state (`modesAuto`, true unless false: a template whose own resolver always sets its mark before paint, JA Kinetic Joomla, or a JA body class) (15/10/2026: JA Podcast, Blockk,
 * Boxing and Titan hid their switch under every system, which ADR 0031 decision 3 calls a bug).
 * @param {{ modeHook?: unknown, modesAuto?: unknown }} [contract]
 */
export function sidesOf(contract = {}) {
  const hook = typeof contract.modeHook === 'string' ? contract.modeHook.trim() : ''
  if (hook === '' || !HOOK.test(hook)) return { ...SIDE, auto: contract.modesAuto === false ? null : AUTO }
  return { light: `:where(:not(${hook}))`, dark: `:where(${hook})`, auto: null }
}

/** Split at top-level commas (outside parentheses, brackets and quotes). */
function splitList(s) {
  const out = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out
}

/** The end of the first compound selector: the first top-level space or combinator. */
function compoundEnd(s) {
  let depth = 0
  let quote = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && /[\s>+~]/.test(ch)) return i
  }
  return s.length
}

/** One selector on one side: the attribute joins the root's compound, or the root is put in front. */
function scopeSelector(sel, attr) {
  const lead = /^\s*/.exec(sel)[0]
  const s = sel.slice(lead.length).trimEnd()
  if (/^(:root|html)(?![\w-])/.test(s)) {
    const end = compoundEnd(s)
    return `${lead}${s.slice(0, end)}${attr}${s.slice(end)}`
  }
  return `${lead}:root${attr} ${s}`
}

/** The index of the brace closing the block opened at `open`, skipping quoted text. */
function closing(css, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < css.length; i++) {
    const ch = css[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i
  }
  return css.length - 1
}

/**
 * Every style rule of `css` scoped to the root element carrying `attr`; @media blocks are kept and
 * their rules scoped, comments and whitespace kept as they are.
 * @param {string} css
 * @param {string} attr  e.g. `[data-theme="dark"]`
 */
export function scopeCss(css, attr) {
  let out = ''
  let i = 0
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      out += css[i++]
      continue
    }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      const stop = end < 0 ? css.length : end + 2
      out += css.slice(i, stop)
      i = stop
      continue
    }
    const open = css.indexOf('{', i)
    if (open < 0) {
      out += css.slice(i)
      break
    }
    const prelude = css.slice(i, open)
    const close = closing(css, open)
    const body = css.slice(open + 1, close)
    out += /^\s*@(media|supports|container|layer)\b/.test(prelude)
      ? `${prelude}{${scopeCss(body, attr)}}`
      : `${splitList(prelude)
          .map((x) => scopeSelector(x, attr))
          .join(',')}{${body}}`
    i = close + 1
  }
  return out
}

/**
 * The sheet of a two-mode template: `write(profile)` is the emitter's own sheet for one profile
 * (no header line, no hidden switch), called for the system's own side and for the derived side.
 * @param {any} profile
 * @param {(p: any) => { css: string, adjusted?: string[] }} write
 * @param {{ modeHook?: unknown, modesAuto?: unknown }} [contract]  how the template marks its dark side (`sidesOf`)
 * @param {{ shared?: boolean }} [opts]  shared: also return `shared`, the same sheet with a rule both sides write
 *   alike written once (side-merge.mjs): the same page in fewer bytes, for a Joomla module's capped content
 * @returns {{ css: string, shared?: string, mode: 'light' | 'dark', own: any, derived: any, derivedProfile: any }}
 */
export function twoSides(profile, write, contract = {}, opts = {}) {
  const sides = sidesOf(contract)
  const mode = modeOf(profile)
  const other = mode === 'dark' ? 'light' : 'dark'
  const derivedProfile = derive(profile, other).profile
  const own = write(profile)
  const derived = write(derivedProfile)
  const by = { [mode]: own.css, [other]: derived.css }
  const sheet = (/** @type {string[]} */ body) =>
    [
      `/* mode: ${mode} */`,
      ...body,
      // no attribute (a theme's "auto") under a dark OS: the template's dark mode; a template with no "auto"
      // (a JA body class) is light without its mark, whatever the OS says
      ...(sides.auto ? [`@media (prefers-color-scheme: dark){${scopeCss(by.dark, sides.auto)}}`] : [])
    ].join('\n')
  const css = sheet([scopeCss(by.light, sides.light), scopeCss(by.dark, sides.dark)])
  if (opts.shared) {
    const shared = sheet([mergeSides(by.light, by.dark, sides)])
    return { css, shared, mode, own, derived, derivedProfile }
  }
  return { css, mode, own, derived, derivedProfile }
}

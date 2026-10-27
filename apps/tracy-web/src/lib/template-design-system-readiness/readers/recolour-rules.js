/**
 * The rules that recolour a picture while a design system is worn, and whether one reaches a given
 * picture (rule PIC-1). A picture in the brand colour is fine when something already takes its hue
 * away or replaces it under a system:
 *
 * - a rule of the slot contract (any selector block of `packages/design/tracy-ds-slot/templates/*.json`,
 *   whatever key holds it: `rules`, `pictureRules` … on both sides of light; `sideRules.light` /
 *   `sideRules.dark` only on that side, so a picture they fix on one side still fails on the other), or
 * - a rule of the template's own stylesheets that applies only while a system is worn (worn scope,
 *   `:has(#tracy-ds-slot)`),
 * that sets a `filter` taking the hue out (`brightness(0)`, `grayscale(1)`, `saturate(0)`: JA Smallbiz's
 * feature icons turned ink) or an SVG filter of the page (`url(#…)`, a flood painted with the slot's
 * accent: JA Trip's feature icons), a `mask` (the picture becomes a shape the system paints), a new
 * `background`/`background-image`/`content`, or hides it. A filter that keeps the hue (`invert(1)
 * hue-rotate(180deg)`) does not recolour.
 *
 * Selectors are matched without a DOM: the last compound against the picture (an `<img>` and its
 * attributes, or a CSS rule's own selector), each earlier compound against some element of the chain
 * around it, in order. Pseudo-classes and `:has()` gates are dropped before matching.
 */
import { selectorGated } from './worn-scope.js'

const HUE_OUT =
  /url\(\s*['"]?#|brightness\(\s*0(\.0+)?%?\s*\)|grayscale\(\s*(1|100%|0?\.9\d*)\s*\)|saturate\(\s*0(\.0+)?%?\s*\)/i
const REPLACES = /^(-webkit-)?mask(-image)?$|^background(-image)?$|^content$/i

/** Whether a declaration block recolours a picture. @param {Record<string, string>} decls */
export function recolours(decls) {
  for (const [prop, raw] of Object.entries(decls)) {
    const value = String(raw)
    if (/^filter$/i.test(prop) && HUE_OUT.test(value)) return true
    if (REPLACES.test(prop) && !/^\s*(initial|inherit|unset)\s*$/i.test(value)) return true
    if (/^(display)$/i.test(prop) && /none/i.test(value)) return true
    if (/^(visibility)$/i.test(prop) && /hidden/i.test(value)) return true
  }
  return false
}

/**
 * Whether a picture's own `style` attribute recolours it (`<img style="filter: url(#ja-trip-accent-tint)">`).
 * @param {string} attrs the attributes of the tag
 */
export function inlineRecolours(attrs) {
  const style = /\bstyle\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs)
  if (!style) return false
  /** @type {Record<string, string>} */
  const decls = {}
  for (const d of (style[2] ?? style[3]).split(';')) {
    const c = d.indexOf(':')
    if (c > 0) decls[d.slice(0, c).trim()] = d.slice(c + 1).trim()
  }
  // a picture's own inline `background` is the picture itself, not a recolour of it
  return recolours(Object.fromEntries(Object.entries(decls).filter(([k]) => !/^background/i.test(k))))
}

/** The two sides of light a worn system may put the page on. */
export const SIDES = Object.freeze(['light', 'dark'])

/**
 * Every selector block a contract carries: an object key whose value is an object of string values,
 * with the sides of light it applies on. A block under `sideRules.light` / `sideRules.dark` is written
 * only when the worn page is on that side (joomla.mjs, wordpress.mjs), so it recolours a picture on
 * that side alone; every other block (`rules`, `pictureRules`, `followRules` …) applies on both.
 * @param {unknown} node
 * @param {readonly string[]} [sides] the sides the enclosing key applies on
 * @returns {{ selector: string, decls: Record<string, string>, sides: string[] }[]}
 */
export function contractBlocks(node, sides = SIDES) {
  const out = []
  if (!node || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    const entries = Object.entries(value)
    if (entries.length && entries.every(([, v]) => typeof v === 'string'))
      out.push({ selector: key, decls: /** @type {Record<string, string>} */ (value), sides: [...sides] })
    else if (key === 'sideRules')
      for (const [side, rules] of entries)
        out.push(...contractBlocks(rules, SIDES.includes(side) ? sides.filter((s) => s === side) : sides))
    else out.push(...contractBlocks(value, sides))
  }
  return out
}

/**
 * The worn-scope rules of the template's stylesheets as blocks.
 * @param {[string, string][]} sheets
 */
export function wornBlocks(sheets) {
  const out = []
  for (const [, css] of sheets)
    for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim()
      if (selector.startsWith('@') || !selectorGated(selector)) continue
      /** @type {Record<string, string>} */
      const decls = {}
      for (const d of m[2].split(';')) {
        const c = d.indexOf(':')
        if (c > 0) decls[d.slice(0, c).trim()] = d.slice(c + 1).trim()
      }
      out.push({ selector, decls })
    }
  return out
}

/** Split at a top-level character. @param {string} s @param {string} ch */
function split(s, ch) {
  const parts = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(' || s[i] === '[') depth += 1
    else if (s[i] === ')' || s[i] === ']') depth -= 1
    else if (s[i] === ch && depth === 0) {
      parts.push(s.slice(from, i))
      from = i + 1
    }
  }
  parts.push(s.slice(from))
  return parts
}

/** One complex selector as its compounds, pseudo-classes and slot gates dropped. @param {string} sel */
export function compoundsOf(sel) {
  const bare = sel
    .replace(/:(has|not|is|where)\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/::?[a-z-]+(\([^)]*\))?/gi, '')
    .replace(/\s*[>+~]\s*/g, ' ')
  return bare.trim().split(/\s+/).filter(Boolean)
}

/** The class names of an attribute text. @param {string} attrs */
const classesOf = (attrs) =>
  (/\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? '').split(/\s+/).filter(Boolean)

/**
 * Whether one compound (`img.icon[src$=".svg"]`, `.features-item`, `html`) can match an element.
 * @param {string} compound @param {{ tag: string, attrs: string }} el
 */
export function compoundMatches(compound, el) {
  const tag = /^[a-z][\w-]*/i.exec(compound)?.[0]
  if (tag && tag !== '*' && tag.toLowerCase() !== el.tag) return false
  const classes = classesOf(el.attrs)
  // classes and ids outside attribute selectors: the `.svg` of `[src$="icon-code.svg"]` is no class
  const plain = compound.replace(/\[[^\]]*\]/g, '')
  for (const m of plain.matchAll(/\.([\w-]+)/g)) if (!classes.includes(m[1])) return false
  for (const m of plain.matchAll(/#([\w-]+)/g))
    if (!new RegExp(`\\bid\\s*=\\s*["']${m[1]}["']`).test(el.attrs)) return false
  for (const m of compound.matchAll(/\[\s*([\w-]+)\s*(([$^*~|]?)=\s*["']?([^"'\]]*)["']?)?\s*\]/g)) {
    const value = new RegExp(`\\b${m[1]}\\s*=\\s*["']([^"']*)["']`, 'i').exec(el.attrs)?.[1]
    if (value === undefined) return false
    const want = m[4] ?? ''
    if (!m[2]) continue
    const op = m[3]
    const ok =
      op === '$'
        ? value.endsWith(want)
        : op === '^'
          ? value.startsWith(want)
          : op === '*'
            ? value.includes(want)
            : op === '~'
              ? value.split(/\s+/).includes(want)
              : value === want
    if (!ok) return false
  }
  return true
}

/**
 * Whether a selector list reaches the last element of `chain` (outermost first).
 * @param {string} selectorList @param {{ tag: string, attrs: string }[]} chain
 */
export function selectorReaches(selectorList, chain) {
  if (!chain.length) return false
  const target = chain[chain.length - 1]
  return split(selectorList, ',').some((sel) => {
    const parts = compoundsOf(sel)
    const last = parts.pop()
    if (!last || !compoundMatches(last, target)) return false
    let at = chain.length - 2
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      while (at >= 0 && !compoundMatches(parts[i], chain[at])) at -= 1
      if (at < 0) return /^(html|body|:root)$/i.test(parts[i])
      at -= 1
    }
    return true
  })
}

/**
 * One complex selector as a comparable key for `selectorCovers`: the worn-scope gate and root prefixes
 * dropped (`:where(:root:has(#tracy-ds-slot))`, `html.t4-dark` stays), each compound's parts deduplicated
 * and sorted (`.a.a` is `.a`), state pseudo-classes KEPT: a rule for `.x` does not cover `.x:focus`,
 * which the template may paint later in its sheet (JA Impact's search field, 20/10/2026).
 * @param {string} sel
 */
function coverKey(sel) {
  const bare = sel
    .replace(/:(where|is)\(\s*:root:has\(\s*#tracy-ds-slot\s*\)\s*\)/g, '')
    .replace(/:root:has\(\s*#tracy-ds-slot\s*\)|:has\(\s*#tracy-ds-slot\s*\)/g, '')
    .replace(/\s*[>+~]\s*/g, ' ')
    .trim()
  return bare
    .split(/\s+/)
    .filter((c) => c && !/^(:root|html|body)$/i.test(c))
    .map((c) =>
      [
        ...new Set(
          c.match(/::?[\w-]+(\((?:[^()]|\([^()]*\))*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]|^[a-z*][\w-]*/gi) ?? [c]
        )
      ]
        .sort()
        .join('')
    )
    .join(' ')
}

/** A first compound on the root or body with qualifiers (`html.t4-dark`, `body.item-222`, `:root[data-theme]`). */
const ROOT_LEAD =
  /^\s*(html|body|:root)(?=[.#[:])(?:\.[\w-]+|#[\w-]+|\[[^\]]*\]|:(?!has\b|where\b|is\b)[\w-]+(\((?:[^()]|\([^()]*\))*\))?)+\s+/i

/**
 * Whether a selector list covers a CSS rule's own selector: each selector of the rule is one of the
 * list's (as `coverKey` reads them), or the end of one with more context before it.
 *
 * `outranksRoot`: the list is a slot contract's, which the slot writes under six `:root`s (joomla.mjs
 * `HI`); a rule of the template that differs only by a qualified root or body before it (the dark twin
 * `html.t4-dark .x:not(.collapsed)::after` of `.x:not(.collapsed)::after`, JA Voyara's itinerary, 20/10/2026)
 * weighs less and is covered too.
 * @param {string} selectorList @param {string} ruleSelector @param {{ outranksRoot?: boolean }} [options]
 */
export function selectorCovers(selectorList, ruleSelector, options = {}) {
  const theirs = split(selectorList, ',').map(coverKey).filter(Boolean)
  return split(ruleSelector, ',')
    .map((sel) => (options.outranksRoot ? sel.replace(ROOT_LEAD, '') : sel))
    .map(coverKey)
    .filter(Boolean)
    .every((mine) => theirs.some((t) => t === mine || t.endsWith(` ${mine}`)))
}

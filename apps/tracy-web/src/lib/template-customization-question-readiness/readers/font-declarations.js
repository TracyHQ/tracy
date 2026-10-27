/**
 * Where a template sets its text fonts, for the LANG-2 fonts part (spec final rule 6: the font a page
 * of a language actually uses must draw that language):
 *
 *   fontDeclarations('css/template.css', css)
 *   // [{ file, selector: 'h1', prop: 'font-family', stack: ['var(--heading-font-family)', 'sans-serif'], lang: null, pictogram: false },
 *   //  { file, selector: ':root', prop: '--heading-font-family', stack: ['"Be Vietnam Pro"', 'sans-serif'], lang: 'vi', pictogram: false }]
 *
 * One entry per `font-family` or font custom property (`--*font*`) declaration of a style rule, with
 * the page language its selector is keyed on (`:root:lang(vi)`, `html:lang(vi) h1`), or null. The
 * selector is given without that key and without a leading `html`, `:root` or `body` scope, so a
 * scoped rule and the rule it replaces read alike (`html:lang(vi) h1` and `h1` are both `h1`).
 * `pictogram` says the rule draws an icon, not the words of an element: its selector ends in a
 * `::before`/`::after` box (the icon sets' `[class^="icon-"]:before`), or it is kept from screen
 * readers (`speak: none|never`, which every icon set's stylesheet writes).
 * `effectiveFamilies` then follows a stack the way a browser picks the family it draws with, and
 * `namedFamilies` gives every family a stack can reach.
 */
import { familyKey } from '../../font-glyphs.js'
import { cssRules } from './css-rules.js'

/** A font property of a declaration: `font-family`, or a custom property naming a font. */
const FONT_PROPERTY = /^(font-family|--[\w-]*font[\w-]*)$/i
/** Generic families and system faces: the end of a stack, never the template's to check. */
export const GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|-apple-system|blinkmacsystemfont|segoe ui|helvetica|helvetica neue|arial|georgia|times|times new roman|verdana|tahoma|trebuchet ms|courier|courier new|inherit|initial|unset|revert)$/

/** Split a value on its top-level commas (`var(--a, "B"), sans-serif` is two items). */
export function stackOf(/** @type {string} */ value) {
  const out = []
  let depth = 0
  let from = 0
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '(') depth += 1
    else if (value[i] === ')') depth -= 1
    else if (value[i] === ',' && depth === 0) {
      out.push(value.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(value.slice(from).trim())
  return out.map((s) => s.replace(/\s*!important$/i, '')).filter(Boolean)
}

/** One selector part without its language key and leading page scope. */
const bareSelector = (/** @type {string} */ part) =>
  part
    .replace(/:lang\(\s*['"]?[a-z]{2,3}[^)]*\)/gi, '')
    .trim()
    // Every leading scope, not only the first: `:root:lang(vi) body` is `body` once the key is out.
    .replace(/^((html|:root|body)(?=$|\s|[>+~])\s*[>+~]?\s*)+/i, '')
    .trim()

/** A selector part that styles a generated box (`.icon-home:before`, `[class^="pi-"]::after`), not an element's words. */
const GENERATED_BOX = /::?(before|after)\s*$/i
/** A rule kept from screen readers: what an icon set writes for the pictures it draws (`speak: never`). */
const UNSPOKEN = /(?:^|;)\s*speak\s*:\s*(none|never)\b/i

/**
 * @param {string} file
 * @param {string} css
 * @returns {{ file: string, selector: string, prop: string, stack: string[], lang: string | null, pictogram: boolean }[]}
 */
export function fontDeclarations(file, css) {
  const out = []
  for (const rule of cssRules(css)) {
    if (/@font-face/i.test(rule.selector)) continue
    const body = rule.body.replace(/\{[^{}]*\}/g, ' ')
    const unspoken = UNSPOKEN.test(body)
    for (const part of rule.selector.split(',')) {
      const lang = /:lang\(\s*['"]?([a-z]{2,3})/i.exec(part)?.[1]?.toLowerCase() ?? null
      const selector = bareSelector(part)
      const pictogram = unspoken || GENERATED_BOX.test(part.trim())
      for (const d of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g))
        if (FONT_PROPERTY.test(d[1]))
          out.push({ file, selector, prop: d[1].toLowerCase(), stack: stackOf(d[2]), lang, pictogram })
    }
  }
  return out
}

/** The key `effectiveFamilies` gives when a stack ends in a generic or system family. */
export const SYSTEM_FONT = '\u0000system'

/**
 * The families a page of `lang` draws a stack with: the first family the template loads (a family
 * named but never loaded is skipped, the browser skips it too), through custom properties
 * (`var(--x, fallback)` reads the declarations of `--x`, a rule keyed on `lang` winning over one
 * keyed on no language, and is read in place, so a value that loads nothing falls through to the
 * rest of the stack). A generic or system family ends the stack as `SYSTEM_FONT`: the system draws
 * it. Several declarations of one custom property give several families, any of which may be in use.
 * @param {string[]} stack
 * @param {string | null} lang
 * @param {{ prop: string, stack: string[], lang: string | null }[]} declarations
 * @param {(key: string) => boolean} loaded
 * @returns {Set<string>} family keys
 */
export function effectiveFamilies(stack, lang, declarations, loaded, depth = 0) {
  const items = [...stack]
  for (let i = 0; i < items.length && depth <= 8; i += 1) {
    const item = items[i]
    const v = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/i.exec(item)
    if (v) {
      const prop = v[1].toLowerCase()
      const own = lang === null ? [] : declarations.filter((d) => d.prop === prop && d.lang === lang)
      const set = own.length ? own : declarations.filter((d) => d.prop === prop && d.lang === null)
      if (set.length) {
        const out = new Set()
        for (const d of set)
          for (const key of effectiveFamilies(d.stack, lang, declarations, loaded, depth + 1)) out.add(key)
        if (out.size) return out
      } else if (v[2]) items.splice(i + 1, 0, ...stackOf(v[2]))
      continue
    }
    const key = familyKey(item)
    if (!key) continue
    if (GENERIC.test(key)) return new Set([SYSTEM_FONT])
    if (loaded(key)) return new Set([key])
  }
  return new Set()
}

/**
 * Every family a stack names, as `familyKey`s, through custom properties: each declaration of a
 * `var()`'s property, in any language, and its fallback. Generic and system families are left out.
 * Unlike `effectiveFamilies` it does not stop at the first family loaded: it says which families a
 * rule may draw with at all.
 * @param {string[]} stack
 * @param {{ prop: string, stack: string[] }[]} declarations
 * @returns {Set<string>}
 */
export function namedFamilies(stack, declarations, depth = 0) {
  const out = new Set()
  for (const item of stack) {
    const v = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]*))?\)$/i.exec(item)
    if (v) {
      if (depth >= 8) continue
      const prop = v[1].toLowerCase()
      for (const d of declarations)
        if (d.prop === prop) for (const key of namedFamilies(d.stack, declarations, depth + 1)) out.add(key)
      if (v[2]) for (const key of namedFamilies(stackOf(v[2]), declarations, depth + 1)) out.add(key)
      continue
    }
    const key = familyKey(item)
    if (key && !GENERIC.test(key)) out.add(key)
  }
  return out
}

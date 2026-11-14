/**
 * Where a release's own stylesheets paint the template's ACCENT inside a band the slot contract keeps
 * (`keepScopes`), as a literal the slot cannot repaint by variable: what brand mode (`@tracy/ds-slot`
 * `src/brand.mjs`) leaves in the template's colour.
 *
 * In brand mode a kept band takes the customer's accent through the slot's accent variables (a tokenized
 * `var(--ds-c-accent, #f44141)`) and through the template variables the contract gives back
 * (`keepDefaults`). The tokenizer leaves kept bands' rules literal on purpose (`keepScopes` is one of its
 * options), so a rule such as `.t4-hero .hero-title span { color: #f44141 }` keeps the red under any
 * brand. Each such paint is one of two kinds:
 *
 *   paintable  a colour property the contract can repaint by role inside the band (`bands.<band>.paint`
 *              `{ "<selector>": { "<property>": "accent" } }`, or `bands.<band>.vars` for a custom
 *              property set on the band): BRAND-1, fixed in the contract;
 *   locked     a colour inside a gradient, a shadow or an inline picture (`url(data:…%23f44141…)`), which
 *              no role paint reaches: BRAND-2, fixed by releasing the template with that colour read
 *              through the slot (`var(--ds-c-accent, #f44141)`).
 *
 * Bands kept whole (`keepWhole`, with a reason) are the template's by agreement and not read. Stylesheets
 * in scope are the ones the tokenizer reads (`tokenized.js` `templateSheets`), less right-to-left mirrors.
 * PURE apart from the reads.
 */
import { hexOf, templateSheets } from './tokenized.js'
import { slotOf } from './slot.js'

/** The colour properties a band `paint` can set (`@tracy/ds-slot` `src/bands.mjs` PROPS). */
const PAINTABLE = new Set([
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-bottom-color',
  'border-left-color',
  'border-right-color',
  'outline-color',
  'fill',
  'stroke',
  'text-decoration-color'
])
/** Shorthands whose colour a paint replaces only when the value is that colour alone (`background: #f44141`). */
const SHORTHAND = new Set([
  'background',
  'border',
  'border-top',
  'border-bottom',
  'border-left',
  'border-right',
  'outline'
])

/** A selector list split at its top-level commas. */
const topLevel = (/** @type {string} */ s) => {
  const out = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth--
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(from, i))
      from = i + 1
    }
  }
  out.push(s.slice(from))
  return out.map((x) => x.trim()).filter(Boolean)
}

/** Whether `selector` reaches into the kept band `scope` (`.t4-hero`, `.t4-hero .x`, `#a .t4-hero span`). */
export const inBand = (/** @type {string} */ selector, /** @type {string} */ scope) =>
  new RegExp(`${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(selector)

/** The part of `selector` after the band (`.t4-hero .hero-title span` → `.hero-title span`; the band itself → `&`). */
const insideOf = (/** @type {string} */ selector, /** @type {string} */ scope) => {
  const at = selector.search(new RegExp(`${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`))
  const rest = selector.slice(at + scope.length).trim()
  return rest === '' ? '&' : rest.replace(/^>\s*/, '')
}

/**
 * The hexes a value paints as literals: a slot read's fallback (`var(--ds-c-accent, #f44141)`) is not one, nor
 * the fallback of a template variable that aliases the slot (`--vds-accent: var(--ds-c-accent)` declared in the
 * template's own sheets, read as `var(--vds-accent, #5e48db)`), which brand mode reaches the same way.
 */
const literalHexes = (/** @type {string} */ value, /** @type {Set<string>} */ aliases) =>
  [
    ...value
      .replace(/var\(\s*(--[\w-]+)\s*,[^()]*(\([^()]*\))?[^()]*\)/g, (read, name) =>
        name.startsWith('--ds-') || aliases.has(name) ? '' : read
      )
      .matchAll(/#[0-9a-f]{3,8}\b|%23[0-9a-f]{6}\b|rgba?\([^)]*\)/gi)
  ].map((m) => hexOf(m[0].replace(/^%23/, '#')))

/** Custom properties the sheets set to a slot read (`--vds-accent: var(--ds-c-accent)`), in any rule. */
const slotAliases = (/** @type {[string, string][]} */ sheets) =>
  new Set(
    sheets.flatMap(([, css]) =>
      [...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]*)/g)]
        .filter((m) => /var\(\s*--ds-/.test(m[2]) && !literalHexes(m[2], new Set()).length)
        .map((m) => m[1])
    )
  )

/**
 * @typedef {{ band: string, file: string, selector: string, inside: string, property: string, colour: string, kind: 'paintable' | 'locked', covered: boolean }} KeptAccent
 */

/**
 * Every literal template accent painted inside a kept band, with its kind and whether the contract
 * already repaints it in brand mode (`covered`: a `bands.<band>.paint` selector or `vars` name for it).
 * Null when the template has no contract, no kept band or no stylesheet the tokenizer reads.
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ bands: string[], accents: string[], found: KeptAccent[] } | null>}
 */
export async function keptBandAccents(context) {
  const slot = await slotOf(context)
  const c = slot.contract
  if (!c) return null
  const whole = c.keepWhole && typeof c.keepWhole === 'object' ? c.keepWhole : {}
  const bands = /** @type {unknown[]} */ (c.keepScopes ?? [])
    .filter((s) => typeof s === 'string' && /^[.#][\w-]/.test(s))
    .map((s) => String(s).trim())
    .filter((s) => !(typeof whole[s] === 'string' && whole[s].trim() !== ''))
  if (!bands.length) return { bands, accents: [], found: [] }
  const accents = [
    ...new Set(
      slot.palettes
        .flatMap((p) => [p.accent, p['accent-hover'], p['accent-active']])
        .map((v) => (typeof v === 'string' ? hexOf(v.trim()) : null))
        .filter(/** @returns {h is string} */ (h) => h !== null)
    )
  ]
  const sheets = await templateSheets(context)
  if (!sheets) return null
  const aliases = slotAliases(sheets)
  /** @type {KeptAccent[]} */
  const found = []
  for (const [file, raw] of sheets) {
    // a right-to-left mirror (acm/<block>/css/rtl/) repeats its left-to-right sheet: counted once
    if (/(^|\/)rtl\//i.test(file)) continue
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = topLevel(m[1].replace(/^[\s\S]*;/, ''))
      for (const decl of m[2].split(';')) {
        const i = decl.indexOf(':')
        if (i < 1) continue
        const property = decl.slice(0, i).trim().toLowerCase()
        const value = decl.slice(i + 1).trim()
        const hit = literalHexes(value, aliases).find((h) => h && accents.includes(h))
        if (!hit) continue
        const alone = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\))(\s*!important)?$/i.test(value)
        const custom = property.startsWith('--')
        const kind =
          (PAINTABLE.has(property) && !/gradient|url\(/i.test(value)) ||
          (SHORTHAND.has(property) && (alone || !/gradient|url\(/i.test(value))) ||
          (custom && alone)
            ? 'paintable'
            : 'locked'
        for (const selector of selectors)
          for (const band of bands) {
            if (!inBand(selector, band)) continue
            const inside = insideOf(selector, band)
            const spec = c.bands?.[band]
            const paints = Object.keys(spec?.paint ?? {}).flatMap(topLevel)
            const covered = custom
              ? inside === '&' && Object.hasOwn(spec?.vars ?? {}, property)
              : paints.includes(inside)
            found.push({ band, file, selector, inside, property, colour: hit, kind, covered })
          }
      }
    }
  }
  return { bands, accents, found }
}

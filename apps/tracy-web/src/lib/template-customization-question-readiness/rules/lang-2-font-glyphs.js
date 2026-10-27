/**
 * LANG-2, the fonts: a font the template loads draws every letter of each language the customer may choose (TCH #1013).
 *
 * Measured 10/10/2026 on dev g60-ess-wp-full and g60-ess-j-full (JA Essence, vi): the heading font Jost has no Vietnamese
 * letters anywhere (Google serves cyrillic, latin, latin-ext only), so "đề" was drawn as "đê" with a loose grave; JA Essence
 * WordPress also ships Noto Serif cut to latin. Tracy now draws the missing letters from a look-alike at Apply
 * (`font-glyphs.js`, `glyph-fallback.js`), which is a different hand beside the template's; the template's own fix is a
 * family that has them. This part names, before any site is built:
 * - a face the template ships (its CSS `@font-face` or theme.json `fontFace`) whose file maps none or only some of the
 *   letters (`fontCovers` on the file's character map), unless another face of the family covers them;
 * - a family the template asks of Google Fonts (an address in its files, a T4 `*_font_family` setting) that Google serves
 *   with no subset of that language, asked through the `fetchText` the caller passes (`checkRelease` options); without one
 *   the Google families are listed as not checked.
 * A family that lacks the letters passes when the template replaces it on pages of that language with one that has them
 * (spec final rule 6; JA Essence WordPress 1.0.16 and Joomla 1.3.4 draw Vietnamese headings in Be Vietnam Pro); it is then
 * a note, not a problem. Judged rule by rule, on the font the page actually draws with (12/10/2026): for every
 * `font-family` rule of the stylesheets (and the one each T4 font setting stands for), the family a page of that language
 * reaches, through custom properties and a rule keyed on `:lang(<tag>)` for the same selector, is the first family of the
 * stack the template loads (`readers/font-declarations.js`). A replacement for the headings does not cover a button set
 * in the old family by name, a replacement written after the old family in a stack is never reached, and a family named
 * but never loaded is skipped as the browser skips it.
 * An icon font (Font Awesome, swiper-icons, Material Symbols, icomoon…) draws pictures, never the site's words: it is not
 * judged, by its name, its faces or the rules that set it (`icons` of `readers/template-fonts.js`, 14/10/2026).
 * The languages are those the customer may choose (the platform's standard Languages question) that `LANGUAGE_RANGES`
 * knows the letters of.
 */
import { BROWSER_UA, fontCovers, fontFaces, LANGUAGE_RANGES } from '../../font-glyphs.js'
import { loadStandardQuestions } from '../../build-questions.js'
import { listed } from '../readers/rule-findings.js'
import { effectiveFamilies, SYSTEM_FONT } from '../readers/font-declarations.js'
import { templateFonts } from '../readers/template-fonts.js'

/** @type {Record<string, any> | null} */
let standard = null

/** The languages a customer of `platform` may choose that `LANGUAGE_RANGES` knows the letters of, by primary tag. */
export function offeredScripts(/** @type {string} */ platform) {
  standard ??= loadStandardQuestions()
  const question = (standard[platform]?.questions ?? []).find((/** @type {any} */ q) =>
    (q.feeds ?? []).includes('site.languages')
  )
  const tags = new Set(
    (question?.options ?? []).map((/** @type {unknown} */ o) => String(o).toLowerCase().split(/[-_]/)[0])
  )
  return Object.keys(LANGUAGE_RANGES).filter((tag) => tags.has(tag))
}

/** Every code point of a language's own letters. */
const letters = (/** @type {string} */ tag) =>
  LANGUAGE_RANGES[tag].ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i))

const inRanges = (/** @type {number} */ cp, /** @type {Array<[number, number]>} */ ranges) =>
  ranges.some(([a, b]) => cp >= a && cp <= b)

/** Google Fonts answers by family, the same for every release: asked once per process. */
const GOOGLE = new Map()

/**
 * Whether Google Fonts serves `family` with the letters of `subset`: true, false, or null when it cannot be told.
 * @param {string} family @param {string} subset @param {number[]} need
 * @param {(url: string, headers?: Record<string, string>) => Promise<string>} fetchText
 */
async function googleHas(family, subset, need, fetchText) {
  const key = `${family}\u0000${subset}`
  if (!GOOGLE.has(key))
    GOOGLE.set(
      key,
      (async () => {
        const css = await fetchText(
          `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}`,
          { 'user-agent': BROWSER_UA }
        )
        const faces = fontFaces(css, 'https://fonts.googleapis.com/')
        if (faces.length === 0) return null
        return faces.some(
          (f) =>
            f.subset === subset || (f.ranges !== null && need.every((cp) => inRanges(cp, f.ranges ?? [])))
        )
      })().catch(() => null)
    )
  return GOOGLE.get(key)
}

/**
 * @param {import('../index.js').RuleContext & { fetchText?: (url: string, headers?: Record<string, string>) => Promise<string> }} context
 * @param {ReturnType<typeof import('../readers/rule-findings.js').findings>} f
 */
export async function fontGlyphs(context, f) {
  const tags = offeredScripts(context.release.platform)
  if (tags.length === 0) return
  const { local, google, used, icons, declarations } = await templateFonts(context)
  const hits = []
  /** @type {string[]} */
  const replaced = []
  /** @type {string[]} */
  const unchecked = []
  for (const tag of tags) {
    const { subset } = LANGUAGE_RANGES[tag]
    const need = letters(tag)
    /** @type {Map<string, { family: string, covered: Set<number>, unknown: boolean, where: string[], google: boolean }>} */
    const families = new Map()
    const entry = (/** @type {string} */ key, /** @type {string} */ family) => {
      if (!families.has(key))
        families.set(key, { family, covered: new Set(), unknown: false, where: [], google: false })
      return /** @type {any} */ (families.get(key))
    }
    for (const face of local) {
      if (!used.has(face.key) || face.icon || icons.has(face.key)) continue
      const e = entry(face.key, face.family)
      e.where.push(face.file)
      const wanted = face.ranges ? need.filter((cp) => inRanges(cp, face.ranges ?? [])) : need
      if (wanted.length === 0) continue
      const got = face.bytes ? fontCovers(new Uint8Array(face.bytes), wanted) : null
      if (!got) e.unknown = true
      else for (const cp of got) e.covered.add(cp)
    }
    for (const g of google) {
      if (icons.has(g.key)) continue
      const e = entry(g.key, g.family)
      e.where.push(`Google Fonts, ${g.where}`)
      e.google = true
      if (!context.fetchText) {
        e.unknown = true
        continue
      }
      // eslint-disable-next-line no-await-in-loop -- one answer per family, kept for the next release.
      const has = await googleHas(g.family, subset, need, context.fetchText)
      if (has === null) e.unknown = true
      else if (has) for (const cp of need) e.covered.add(cp)
    }
    const loaded = (/** @type {string} */ key) => families.has(key)
    const short = (/** @type {string} */ key) => {
      const e = families.get(key)
      return e && !e.unknown ? need.filter((cp) => !e.covered.has(cp)) : []
    }
    const drawn = (/** @type {Set<string>} */ keys) => [...keys].filter((k) => k !== SYSTEM_FONT)
    /** Families a page of this language draws text in that cannot draw it, with where; and the ones replaced. */
    const failing = new Map()
    const swapped = new Map()
    const reached = new Set()
    const where = (/** @type {any} */ d) => (d.selector ? `${d.file} ${d.selector}` : d.file)
    for (const d of declarations.filter((x) => x.prop === 'font-family' && x.lang === null)) {
      const base = effectiveFamilies(d.stack, null, declarations, loaded)
      // A rule keyed on this language for the same selector replaces the stack itself.
      const own = declarations.filter(
        (x) => x.prop === 'font-family' && x.lang === tag && x.selector === d.selector
      )
      const onPage = new Set()
      for (const x of own.length ? own : [d])
        for (const key of effectiveFamilies(x.stack, tag, declarations, loaded)) onPage.add(key)
      for (const key of drawn(base)) reached.add(key)
      for (const key of drawn(onPage)) {
        reached.add(key)
        if (short(key).length) failing.set(key, [...(failing.get(key) ?? []), where(d)])
      }
      const replacements = drawn(onPage).filter((k) => !short(k).length && !families.get(k)?.unknown)
      for (const key of drawn(base))
        if (short(key).length && !onPage.has(key)) {
          if (replacements.length) swapped.set(key, replacements)
          else
            failing.set(key, [
              ...(failing.get(key) ?? []),
              `${where(d)}, on ${tag} pages no font the template loads`
            ])
        }
    }
    for (const [key, e] of families) {
      const missing = need.filter((cp) => !e.covered.has(cp))
      if (missing.length === 0) continue
      if (e.unknown) {
        unchecked.push(`'${e.family}' (${tag})`)
        continue
      }
      // A family no stylesheet rule draws with (a Google address, a theme.json face): judged on its own.
      if (!reached.has(key) && !e.google && !used.has(key)) continue
      if (!failing.has(key) && reached.has(key)) {
        if (swapped.has(key))
          replaced.push(
            `'${e.family}' (${missing.length} letters missing) replaced on ${tag} pages by ${swapped
              .get(key)
              .map((k) => `'${families.get(k)?.family}'`)
              .join(', ')}`
          )
        continue
      }
      const rules = failing.get(key) ?? []
      hits.push(
        `'${e.family}' cannot draw ${missing.length} of the ${need.length} ${subset} letters (${missing
          .slice(0, 6)
          .map((cp) => String.fromCodePoint(cp))
          .join(' ')}…; ${listed([...new Set([...e.where, ...rules])], 2)})`
      )
    }
  }
  if (hits.length)
    f.problem(
      `fonts: ${listed(hits, 6)}; a site written in that language draws those letters from another font, or with loose accents`
    )
  if (replaced.length)
    f.note(
      `fonts the template replaces for a language they cannot draw (spec rule 6): ${listed(replaced, 6)}`
    )
  if (unchecked.length)
    f.note(
      `fonts not checked for the letters of a language the customer may choose (no font file in the release, or Google Fonts not asked): ${listed(unchecked, 6)}`
    )
}

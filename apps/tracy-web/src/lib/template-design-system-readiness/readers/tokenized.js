/**
 * How far a release's own stylesheets read the slot, judged with the tokenizer that made them
 * (`@tracy/ds-slot` `tokenizeCss`, the options `scripts/tokenize.mjs` and `release-joomla.mjs` pass).
 *
 * The tokenizer leaves a value that already reads `var(--ds-c-…)` alone, so running it again on a
 * released stylesheet adds reads exactly where the release still paints a palette colour as a
 * literal: none on a stylesheet tokenized with this contract, many on one rebuilt from untokenized
 * source (README `maxVersion`: another line re-released ja-spa / ja-voyara from the old source,
 * 11/10/2026). What is counted is the reads the second pass ADDS, per role, never the tokenizer's own
 * `replaced`: that counter also counts a swap the same pass undoes (a text kept literal because its
 * rule's fill stays literal) and a swap to identical bytes, so on JA Essence 1.0.7 it said 6 for a
 * pass that changed no byte (12/10/2026).
 *
 * In scope, as the release scripts tokenize them: Joomla `css/`, `acm/`, `local/` under the template
 * folder; WordPress `assets/css/` of the theme. EmDash themes read the slot's variables natively.
 */
import { dsSlotModule } from '../../ds-slot.js'
import { releaseFiles, stylesheetsOf } from './release-files.js'
import { slotOf } from './slot.js'

/** The stylesheets of each CMS the check reads: what the template paints the page with. */
const IN_SCOPE = /** @type {Record<string, RegExp>} */ ({
  joomla: /^(css|acm|local)\/.+\.css$/i,
  wordpress: /^assets\/css\/.+\.css$/i
})

/**
 * Stylesheets in scope that are deliberately NOT the template's look: a WordPress theme's design pages
 * (`assets/css/fixtures/<system>.css`, `assets/css/artifacts/<kind>/<system>.css`, `fixture-page.css`)
 * load only on a design system's own preview page, which `functions.php` fences off from every other
 * sheet so it shows that system pixel for pixel; tokenizing them would repaint a vendored look.
 */
const NOT_THE_TEMPLATE = /^assets\/css\/(fixtures\/|artifacts\/|fixture-page\.css$)/i

/**
 * Joomla sheets no customer page loads with a worn system: T4's right-to-left mirror (`css/rtl/`) and
 * its colour presets (`css/themes/<name>.css`, one of which the style picks; the slot repaints the
 * page over it). Counting their literals held CSS-2 red on templates whose pages were clean (#1313).
 */
const NOT_LOADED_JOOMLA = /^css\/(rtl|themes)\//i

/**
 * Tailwind's own custom properties (`--tw-ring-offset-color: #fff`): framework defaults a focus ring
 * reads, not a colour the template paints. Left out of the count (JA Morgan WordPress, 13/10/2026).
 */
const withoutTailwindVars = (/** @type {string} */ css) => css.replace(/--tw-[\w-]+\s*:[^;{}]*/g, '')

/**
 * Whether the release scripts tokenize this stylesheet (`own`): every Joomla one in scope
 * (`release-joomla.mjs`); on WordPress only the theme's own `assets/css/<stylesheet>.css`
 * (`pass-wordpress.mjs`), the theme's other sheets being shared Tracy parts the contract never
 * tokenized. CSS-1 holds the own ones; CSS-2 counts leftovers in every sheet in scope.
 */
const ownSheet = (
  /** @type {string} */ platform,
  /** @type {string} */ file,
  /** @type {string | null} */ stylesheet
) =>
  platform === 'joomla' ||
  (!!stylesheet && file.toLowerCase() === `assets/css/${stylesheet.toLowerCase()}.css`)

/** A read of the slot's colours (`var(--ds-c-<role>, …)`, `var(--ds-a-<role>-NN, …)`). */
export const SLOT_READ = /var\(\s*--ds-[ca]-/g

/**
 * Every slot colour read of a stylesheet that stands for a PALETTE colour of the template, counted by
 * role: its fallback is a hex (or an rgba of one) the template's palette holds, or a T4 placeholder
 * (`__primary`), which are palette colours by construction. Not counted:
 *   - a read whose fallback is another variable: `color: var(--wp--preset--color--accent)` already
 *     follows the worn system through the style variation, and the tokenizer's `accentVars` only wraps
 *     it in the readable accent text. Counted, it read Tracy Business and JA Vega WordPress as "8 and 4
 *     palette colours painted as literals" when none was (13/10/2026);
 *   - a colour the palette does not hold, which `classifyText` maps to a text role by its contrast
 *     (JA Podcast's yellow `#FED90F`): a judgement the tokenizer of the day makes, revised over the
 *     re-measure rounds, not a palette colour left behind (13/10/2026).
 * @param {string} css @param {Set<string>} palette normalised hexes (`#aabbcc`)
 */
function readsByRole(css, palette) {
  /** @type {Record<string, number>} */
  const out = {}
  const re =
    /var\(\s*--ds-(?:c-([\w-]+)|a-([\w-]+?)-\d{1,3})\s*,\s*(#[0-9a-fA-F]{3,8}|__[0-9a-z_]+|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}[^)]*\))\s*\)/gi
  for (const m of css.matchAll(re)) {
    const fallback = m[3]
    if (!fallback.startsWith('__') && !palette.has(hexOf(fallback) ?? '')) continue
    const role = m[1] ?? m[2]
    out[role] = (out[role] ?? 0) + 1
  }
  return out
}

/** `#abc`, `#aabbcc`, `#aabbccff`, `rgb(…)`, `rgba(…)` → `#aabbcc`; anything else → null. */
export function hexOf(/** @type {string} */ value) {
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(value)
  if (rgb)
    return `#${rgb
      .slice(1, 4)
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')}`
  let x = value.replace(/^#/, '').toLowerCase()
  if (x.length === 3) x = [...x].map((c) => c + c).join('')
  else if (x.length === 8 && x.endsWith('ff')) x = x.slice(0, 6)
  return /^[0-9a-f]{6}$/.test(x) ? `#${x}` : null
}

/**
 * The reads of a palette colour a second tokenizer pass adds, per role, and in all.
 * @param {string} before @param {string} after @param {Set<string>} palette normalised hexes
 */
export function addedReads(before, after, palette) {
  if (before === after) return { left: 0, leftByRole: {} }
  const was = readsByRole(before, palette)
  const now = readsByRole(after, palette)
  /** @type {Record<string, number>} */
  const leftByRole = {}
  let left = 0
  for (const [role, n] of Object.entries(now)) {
    const more = n - (was[role] ?? 0)
    if (more > 0) {
      leftByRole[role] = more
      left += more
    }
  }
  return { left, leftByRole }
}

/**
 * @typedef {{ file: string, own: boolean, reads: number, left: number, leftByRole: Record<string, number> }} SheetResult
 * @typedef {{ sheets: SheetResult[] } | null} Tokenized
 */

/** @type {WeakMap<object, Promise<Tokenized>>} */
const memo = new WeakMap()

/**
 * Every in-scope stylesheet with its slot reads and the palette literals it still paints; null when
 * the template has no contract or reads the slot natively (nothing to tokenize).
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<Tokenized>}
 */
export function tokenizedSheets(context) {
  if (!memo.has(context)) memo.set(context, read(context))
  return /** @type {Promise<Tokenized>} */ (memo.get(context))
}

/** @param {import('../index.js').RuleContext} context @returns {Promise<Tokenized>} */
async function read(context) {
  const scope = IN_SCOPE[context.release.platform]
  if (!scope) return null
  const slot = await slotOf(context)
  if (!slot.contract || slot.palettes.length === 0) return null
  const { paletteForFile, tokenizeCss } = await dsSlotModule('tokenize')
  const c = slot.contract
  const palette = new Set(
    slot.palettes
      .flatMap((set) => Object.values(set).map((v) => hexOf(String(v ?? '').trim())))
      .filter(/** @returns {h is string} */ (h) => h !== null)
  )
  const sheets = []
  const files = await releaseFiles(context)
  for (const [file, css] of stylesheetsOf(files)) {
    if (!scope.test(file) || NOT_THE_TEMPLATE.test(file)) continue
    if (context.release.platform === 'joomla' && NOT_LOADED_JOOMLA.test(file)) continue
    const r = tokenizeCss(css, paletteForFile(slot.palettes, c, file), {
      accentVars: c.accentVars,
      keepScopes: c.keepScopes,
      classifyText: c.classifyText,
      varRoles: c.varRoles,
      t4Placeholders: c.t4Placeholders,
      alphaText: c.alphaText,
      pairVarFill: c.pairVarFill,
      reRole: c.reRole
    })
    sheets.push({
      file,
      own: ownSheet(context.release.platform, file, files.stylesheet),
      reads: (css.match(SLOT_READ) ?? []).length,
      ...addedReads(withoutTailwindVars(css), withoutTailwindVars(r.css), palette)
    })
  }
  return { sheets: sheets.sort((a, b) => a.file.localeCompare(b.file)) }
}

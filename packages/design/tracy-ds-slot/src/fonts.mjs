/**
 * Which font a profile can actually load. Google Fonts is the only source (nothing proprietary is
 * self-hosted: no licence). The lookup is the real family list (1,950 families, fetched 08/10/2026,
 * `google-fonts.json`), so "on Google Fonts" is a fact and not a guess from a name.
 */
import { readFileSync } from 'node:fs'

const DOC = JSON.parse(readFileSync(new URL('./google-fonts.json', import.meta.url), 'utf8'))
/** @type {Record<string, { c: string, r?: number[], w?: number[] }>} */
const FAMILIES = DOC.fonts
// A family with no upright weight (only italics, e.g. Molle) cannot be asked for as `wght@…` — the
// request answers 400 and takes every other family in the same link down with it. Not loadable.
const BY_LOWER = new Map(
  Object.entries(FAMILIES)
    .filter(([, f]) => f.r || (f.w ?? []).length > 0)
    .map(([k]) => [k.toLowerCase(), k])
)

/** System stacks and generics: loadable without a request. */
const SYSTEM = new Set([
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
  'arial',
  'helvetica',
  'georgia',
  'times new roman',
  'courier new'
])

/** What kind of face each system stack is. */
const SYSTEM_KIND = {
  'system-ui': 'sans-serif',
  'sans-serif': 'sans-serif',
  arial: 'sans-serif',
  helvetica: 'sans-serif',
  serif: 'serif',
  georgia: 'serif',
  'times new roman': 'serif',
  monospace: 'monospace',
  'courier new': 'monospace'
}

/**
 * What a family is for, from Google's own category: `handwriting` and `display` (faces for a
 * headline, a wordmark or an accent, never for running text), else its generic (`sans-serif`,
 * `serif`, `monospace`). A system font is a text face of its generic. Unknown → null.
 */
export function kindOf(name) {
  const g = googleFamily(name)
  if (g) return FAMILIES[g].k ?? FAMILIES[g].c
  return (
    SYSTEM_KIND[
      String(name ?? '')
        .trim()
        .toLowerCase()
    ] ?? null
  )
}

/** The kinds a role may never be set in: body is running text; headings may be display, never script. */
export const REFUSED_KINDS = Object.freeze({
  body: Object.freeze(['handwriting', 'display']),
  display: Object.freeze(['handwriting'])
})

/** Canonical Google family for a name, or null. */
export function googleFamily(name) {
  return (
    BY_LOWER.get(
      String(name ?? '')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .toLowerCase()
    ) ?? null
  )
}

/** The generic fallback Google gives a family (`serif`, `sans-serif`, `monospace`, `cursive`). */
export function genericOf(family) {
  return FAMILIES[family]?.c ?? 'sans-serif'
}

/** Every plain family name in a free-text substitute ("'Source Serif 4' or 'Libre Caslon' at weight 300, fallback Georgia"). */
export function candidates(text) {
  const s = String(text ?? '')
  const out = []
  const quoted = [...s.matchAll(/['"]([^'"]{2,40})['"]/g)].map((m) => m[1])
  for (const q of quoted) out.push(q)
  // a note in brackets is not part of the name ("Inter Tight (variable, weight 300/400)" is Inter
  // Tight: read whole, the bracket split the name at its comma and Stripe lost every face, 13/10/2026)
  // — and what the brackets hold is read after it ("Segoe UI (system stack: …, Roboto, sans-serif)")
  const plain = s.replace(/\([^()]*\)/g, ' ')
  for (const text of [plain, s])
    for (const part of text.split(/,|\bor\b|\band\b|\/|\bat weight\b|\bwith\b|\bfallback\b/i)) {
      const t = part
        .replace(/\bweight\b.*$/i, '')
        .replace(/[0-9]+/g, (n) => n)
        .trim()
      if (t && !/^\d+$/.test(t) && !out.includes(t)) out.push(t)
    }
  return out
}

/** Clamp a wanted weight into what the family offers: the nearest real weight, never a fake one. */
export function nearestWeight(family, want) {
  const f = FAMILIES[family]
  if (!f) return null
  if (f.r) return Math.max(f.r[0], Math.min(f.r[1], Math.round(want)))
  const ws = f.w ?? [400]
  return ws.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), ws[0])
}

/** The weights a family offers, as a list the loader asks for. */
export function weightsOf(family, wanted) {
  const f = FAMILIES[family]
  if (!f) return []
  const set = new Set()
  for (const w of wanted) {
    const n = nearestWeight(family, w)
    if (n !== null) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * Resolve the font a system names to something loadable.
 *  - on Google Fonts            → `stated`
 *  - a Google substitute named  → `substituted` (the family it replaces is kept for the record)
 *  - a system font              → `system`
 *  - nothing                    → `empty` (the template keeps its own font)
 * `refuse` lists kinds ({@link kindOf}) the role cannot wear: a named family of such a kind gives
 * way to the first substitute that is not (`sofia` lands on Google's script Sofia; the source's
 * "Inter, Manrope, or DM Sans" is what it means), and when none is, the answer is `refused: <kind>`.
 * @param {string} family
 * @param {string | null | undefined} substitute
 * @param {readonly string[]} [refuse]
 */
export function resolveFont(family, substitute, refuse = []) {
  const named = String(family).trim()
  const ok = (f) => !refuse.includes(kindOf(f))
  // the variable cut of a Google family is that family ("Inter Variable" is Inter: Linear, 13/10/2026)
  const direct = googleFamily(family) ?? googleFamily(named.replace(/[\s-]+(variable|var|vf)$/i, ''))
  const system = SYSTEM.has(named.toLowerCase())
  if (direct && ok(direct)) return { family: direct, status: 'stated', source: 'google' }
  if (!direct && system) return { family: named, status: 'stated', source: 'system' }
  for (const c of candidates(substitute)) {
    const g = googleFamily(c)
    if (g && ok(g)) return { family: g, status: 'substituted', source: 'google', substituteOf: named }
  }
  if (direct)
    return { family: null, status: 'empty', source: null, substituteOf: named, refused: kindOf(direct) }
  for (const c of candidates(substitute)) {
    const g = googleFamily(c)
    if (g) return { family: null, status: 'empty', source: null, substituteOf: named, refused: kindOf(g) }
  }
  return { family: null, status: 'empty', source: null, substituteOf: named }
}

const GENERIC_WORDS =
  /^(-apple-system|blinkmacsystemfont|system-ui|ui-[a-z-]+|sans-serif|serif|monospace|cursive|fantasy)$/i

/** The comma-separated families of a CSS stack, unquoted. */
export function familiesOf(stack) {
  return String(stack ?? '')
    .split(',')
    .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

/**
 * A font stack a system ships as-is (OpenDesign `--font-body: "Inter", system-ui, sans-serif`),
 * reproduced verbatim. Every Google family inside it is loaded, so a stack like
 * `Waldenburg, Inter, sans-serif` really lands on Inter instead of whatever the visitor has.
 *  - first named family on Google, or only generics → `stated`
 *  - first named family is not on Google but a later one is → `substituted`
 */
export function fromStack(stack, wanted = [400, 500, 600, 700]) {
  const fams = familiesOf(stack)
  if (fams.length === 0) return { v: null, s: 'empty', load: [], named: null }
  const named = fams.filter((f) => !GENERIC_WORDS.test(f))
  const google = named.map((f) => googleFamily(f)).filter(Boolean)
  const load = [...new Set(google)].map((family) => ({ family, weights: weightsOf(family, wanted) }))
  const first = named[0]
  const s = first && !googleFamily(first) && google.length > 0 ? 'substituted' : 'stated'
  return {
    v: String(stack).trim(),
    s,
    load,
    named: first ?? null,
    substituteOf: s === 'substituted' ? first : null
  }
}

/** A single family as a stack: `"Family", <generic>`. */
export function stackOf(family) {
  return `"${family}", ${genericOf(family)}`
}

export const GOOGLE_FAMILY_COUNT = Object.keys(FAMILIES).length

// How wide each face sets a line of words: the average advance of a lowercase Latin letter in em at each
// upright weight (`font-widths.json`, capsize's xWidthAvg; scripts/font-widths.mjs)
const WIDTHS = JSON.parse(readFileSync(new URL('./font-widths.json', import.meta.url), 'utf8')).fonts
const WIDTH_BY_LOWER = new Map(Object.keys(WIDTHS).map((k) => [k.toLowerCase(), k]))

/**
 * The average advance of a letter of `family` at `weight`, in em, or null when the table does not know the
 * face. A stack answers with its first family the table knows (a system's `Waldenburg, Inter` sets Inter:
 * only Google families load); a weight the table lacks takes the nearest one it has.
 */
export function advanceOf(family, weight = 400) {
  const key = familiesOf(family)
    .filter((f) => !GENERIC_WORDS.test(f))
    .map((f) => WIDTH_BY_LOWER.get(f.toLowerCase()))
    .find(Boolean)
  if (!key) return null
  const at = WIDTHS[key]
  const want = Number(weight) || 400
  const near = Object.keys(at)
    .map(Number)
    .reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best))
  return at[near]
}

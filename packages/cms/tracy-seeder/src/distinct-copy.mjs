/**
 * Two slots of one section never carry the same sentence (spec TracyHQ/tracy#189, item 17).
 *
 * Measured 30/10/2026 on a local brief build of a boxing-gym template: the About module wrote the same 192
 * character introduction into its `top-desc` slot and into its hero paragraph. The template's own demo had done the
 * same (both slots hold one sample), so the planner treated them as two independent replacements and nothing
 * compared the answers. The rule is by slot role and section, never by template:
 *  1. slots of one section whose demo says the same thing are told apart before the writer answers (`copyJobs`: a
 *     job each, and the keys of the neighbours they must not repeat);
 *  2. an answer that repeats a sentence inside one section, or verbatim on one page, is refused and rewritten
 *     (`duplicateComplaint`), and what is still a duplicate afterwards is pended, never written (`duplicates`);
 *  3. the rendered pages are checked for the same thing (`repeatedSentences`; across pages `repeated-copy-check.js`).
 * Round 9 (class F) widened the ledger from one section to the site: a sentence of a value is compared on its own, near
 * copies on one page and the same sentence on two pages are refused.
 */

/** Shortest text that counts as a sentence worth comparing: a label or a figure may repeat. */
const MIN_CHARS = 25
/** Word overlap above which two texts are the same copy reworded. */
const NEAR = 0.8

/** @param {unknown} value */
export const normalizedCopy = (value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const words = (text) => new Set(text.split(' ').filter((w) => w.length > 2))

/**
 * The sentences of a normalized text worth comparing. Sentence ends are gone after normalising, so the text is cut on
 * the raw value's sentence marks before (`sentenceMarks`) and kept whole when it has none.
 * @param {string} text
 */
const sentencesOf = (text) => text.split(' \u0001 ').filter((s) => s.length >= MIN_CHARS)

/** A text normalized with its sentence ends kept as a separator `sentencesOf` cuts on. */
const withSentenceMarks = (value) =>
  String(value ?? '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizedCopy)
    .filter(Boolean)
    .join(' \u0001 ')

/**
 * Is one sentence another one reworded: nearly every word of the shorter (at least eight words: a card's short line inside an introduction is not a copy of it) in the longer one. "At
 * <name> we offer coaching in <city>: tennis and swimming" inside "<name> offers coaching in <city>: tennis, swimming
 * and fitness, for all ages" is the same line; two sentences that only share a subject are not.
 */
export function containedCopy(a, b) {
  if (a.length < MIN_CHARS || b.length < MIN_CHARS) return false
  if (a === b) return true
  const [x, y] = [words(a), words(b)]
  if (Math.min(x.size, y.size) < 8) return false
  let shared = 0
  const [small, large] = x.size <= y.size ? [x, y] : [y, x]
  for (const w of small) if (large.has(w) || [...large].some((l) => sameStem(l, w))) shared += 1
  return shared / small.size >= NEAR
}

/** Two spellings of one word (personalised, personalized; offer, offers). */
const sameStem = (a, b) => a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5)

/** Are two normalized texts one sentence, verbatim or nearly (word overlap of the shorter one)? */
export function sameCopy(a, b) {
  if (a.length < MIN_CHARS || b.length < MIN_CHARS) return false
  if (a === b) return true
  const [x, y] = [words(a), words(b)]
  if (x.size < 4 || y.size < 4) return false
  let shared = 0
  for (const w of x) if (y.has(w)) shared += 1
  return shared / Math.min(x.size, y.size) >= NEAR && shared / Math.max(x.size, y.size) >= NEAR - 0.1
}

const JOBS = {
  'editorial.heading': ['headline', 'subheading', 'kicker'],
  'editorial.paragraph': ['lead', 'body', 'supporting line', 'closing line']
}

/** Does this slot carry prose a visitor reads (not a link, a picture, a label or a figure)? */
const isCopy = (slot) =>
  slot?.type !== 'url' && slot?.type !== 'image' && normalizedCopy(slot?.sample).length >= MIN_CHARS

/**
 * The jobs of the slots of one section whose demo says the same thing. 🔒 BY DECLARED ROLE AND SECTION: a slot is told
 * which part of the section it is (lead, body...) and which neighbours it must not repeat.
 * @param {any[]} slots
 * @returns {Map<string, { job: string, distinctFrom: string[] }>}
 */
export function copyJobs(slots) {
  /** @type {Map<string, any[]>} */
  const groups = new Map()
  for (const slot of slots) {
    if (!isCopy(slot) || !slot.entity) continue
    const id = `${slot.entity}\u0000${normalizedCopy(slot.sample)}`
    groups.set(id, [...(groups.get(id) ?? []), slot])
  }
  const out = new Map()
  for (const same of groups.values()) {
    if (same.length < 2) continue
    same.forEach((slot, i) => {
      const names = JOBS[slot.role] ?? []
      out.set(slot.key, {
        job: names[i] ?? `${names[0] ?? 'text'} ${i + 1}`,
        distinctFrom: same.filter((o) => o !== slot).map((o) => o.key)
      })
    })
  }
  return out
}

/**
 * The page(s) each entity sits on, from the content map's pages: the page's own entity and the modules assigned to it
 * by name. A module shown on every page is not "on a page": its repeat across pages is the template's design.
 * @param {any[] | undefined} pages @returns {(entity: string) => string[]}
 */
export function pagesOfEntities(pages) {
  /** @type {Map<string, string[]>} */
  const map = new Map()
  const add = (entity, page) => {
    if (entity) map.set(entity, [...(map.get(entity) ?? []), page])
  }
  for (const page of Array.isArray(pages) ? pages : []) {
    add(page?.entity, page?.entity)
    for (const m of page?.assignedModules ?? [])
      if (m?.assignmentMode === 'include') add(m.entity, page.entity)
  }
  return (entity) => map.get(entity) ?? []
}

/**
 * Keeps what has been written so far and says which new values repeat it.
 * @param {{ pageOf?: (entity: string) => string[] }} [options]
 */
export function copyLedger({ pageOf = () => [] } = {}) {
  /** @type {Map<string, Array<{ key: string, text: string }>>} scope -> written copy */
  const scopes = new Map()
  const scopesOf = (slot) => {
    const pages = pageOf(slot.entity)
    // A slot on a page is also on the site: a sentence said on one page is not said again on another (round 9, class F).
    return [`entity:${slot.entity}`, ...pages.map((p) => `page:${p}`), ...(pages.length ? ['site'] : [])]
  }
  return {
    /** The first slot already written (or earlier in `batch`) whose copy this one repeats, or null. */
    repeats(slot, value, batch = []) {
      const text = normalizedCopy(value)
      const marked = withSentenceMarks(value)
      if (text.length < MIN_CHARS) return null
      for (const scope of scopesOf(slot)) {
        const seen = [...(scopes.get(scope) ?? []), ...batch.filter((b) => scopesOf(b.slot).includes(scope))]
        // Inside one section any near copy counts; across a page, or between two items of a repeated card row (which
        // share a framing sentence by design), only a verbatim repeat does.
        for (const other of seen) {
          if (other.key === slot.key) continue
          const cards =
            Boolean(slot.group?.id) && Boolean(other.group?.id) && slot.group.id !== other.group.id
          if (scope.startsWith('entity:') && !cards ? sameCopy(text, other.text) : text === other.text)
            return other.key
          // 🔒 ONE SENTENCE, ONE PLACE (round 9, class F): a sentence of a longer value is compared too. On one page a
          // near copy counts (the brief's line reworded in a second section); across pages only the same sentence does.
          if (cards) continue
          const near = scope.startsWith('page:')
          if (scope === 'site' || near)
            for (const mine of sentencesOf(marked))
              for (const theirs of sentencesOf(other.marked ?? other.text))
                if (near ? containedCopy(mine, theirs) : mine === theirs) return other.key
        }
      }
      return null
    },
    /** Remember a value that was written. */
    record(slot, value) {
      const text = normalizedCopy(value)
      if (text.length < MIN_CHARS) return
      for (const scope of scopesOf(slot))
        scopes.set(scope, [
          ...(scopes.get(scope) ?? []),
          { key: slot.key, text, marked: withSentenceMarks(value), group: slot.group }
        ])
    }
  }
}

/**
 * The slots of an answer that repeat a sentence of their section or page, in slot order (the first stays, the later
 * ones are the repeats): `{ key, of }` pairs.
 * @param {any[]} slots @param {Record<string, unknown>} values
 * @param {ReturnType<typeof copyLedger>} ledger
 * @returns {Array<{ key: string, of: string }>}
 */
export function duplicates(slots, values, ledger) {
  const batch = []
  const out = []
  for (const slot of slots) {
    const value = values?.[slot.key]
    if (typeof value !== 'string') continue
    const of = ledger.repeats(slot, value, batch)
    if (of !== null) out.push({ key: slot.key, of })
    else
      batch.push({
        key: slot.key,
        slot,
        group: slot.group,
        text: normalizedCopy(value),
        marked: withSentenceMarks(value)
      })
  }
  return out
}

/** The sentence shown to the model when its answer repeats itself. */
export const duplicateComplaint = (found) =>
  `Your previous answer repeats a sentence already written in its section, on its page or on another page of the site: ${found
    .slice(0, 6)
    .map((d) => `${d.key} says what ${d.of} says`)
    .join(
      '; '
    )}. Give each slot its own job (lead, body, quote, detail) and write different words for each; never copy one slot's sentence into another, and never say again on one page what another page already says.`

/**
 * Repeated sentences in the text of one rendered section: the sentences (of at least `MIN_CHARS`) that occur twice.
 * @param {string} text @returns {string[]}
 */
export function repeatedSentences(text) {
  const seen = new Set()
  const out = new Set()
  for (const raw of String(text ?? '').split(/(?<=[.!?])\s+|\n+/)) {
    const s = normalizedCopy(raw)
    if (s.length < MIN_CHARS) continue
    if (seen.has(s)) out.add(raw.trim())
    seen.add(s)
  }
  return [...out]
}

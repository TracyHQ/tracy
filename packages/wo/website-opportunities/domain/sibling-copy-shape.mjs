// One shape for the sibling texts of one list (spec TracyHQ/tracy#189, COO rule of 30/10/2026). Cards of one repeated
// list (offerings, people, features, items, testimonials) look broken when one card holds three lines and the next one
// line, or when one of four item cards carries a body and the other three none. Each slot was judged alone, so a mix
// passed. Pure and deterministic: no model, no site, no CMS.
//
// 🔒 SIBLINGS: the text slots of one role at one position in the groups of one list. A list is a collection of numbered
// groups (`module-9.item.0`, `module-9.item.1`) or the same group of sibling entities (`post-3.offering`,
// `post-4.offering`: a blog list of offering posts). A list of 150 dishes follows the same rule as a list of four.
// 🔒 THE BAND COMES FROM THE TEMPLATE: the demo text of the siblings (the content map's samples) says how many sentences
// and how many characters a sibling holds. A list whose demo holds no text has no band and is left alone.
// 🔒 THE TEMPLATE'S LINE LAYOUT IS KEPT (COO correction 30/10/2026): every sibling is written to its demo text's length
// (sentences, characters, and the lines the demo takes in that box per viewport), and every sibling of one list takes the
// same line count. Reaching the band is always possible: editorial words are free, only hard facts (prices, phones,
// addresses, hours, names, years, guarantees) come from sources. Never shortened to fit a short sibling, never a sparse
// slot beside a full one; a sibling the writer could not bring into the band is reported, not cut.
// 🔒 NO EXCLAMATION MARK in body copy (formal voice), whoever wrote the words.
// 🔒 RULES BY ROLE AND GROUP, never by template, trade or business.

/** The body roles whose siblings share one shape. Record roles (a guest's quote, a fact) are never rewritten. */
export const SIBLING_BODY_ROLES = new Set([
  'offering.description',
  'offering.summary',
  'editorial.paragraph',
  'person.bio',
  'step.description',
  'event.description'
])

/** The roles that title a card: the name its body is about. */
const TITLE_ROLES = [
  'offering.name',
  'package.name',
  'person.name',
  'step.title',
  'event.title',
  'editorial.heading'
]

/** Groups whose bodies are about their own title word for word (an item, a feature), not about an offering or a person. */
const ITEM_KINDS = new Set(['business', 'claim', 'step'])

/**
 * How far sibling texts may drift apart on a served page before the list reads broken: one sentence, and a length ratio
 * that keeps siblings within about one line of each other (a page carries no box widths to count lines by).
 */
export const SHAPE_LIMITS = Object.freeze({ sentenceSpread: 1, lengthRatio: 1.6 })

/** The band's give around the demo's own lengths. */
const BAND_GIVE = Object.freeze({ low: 0.8, high: 1.2 })

/** Plain words of a value: HTML (and the content map's `((tag))` form) and entities out, spaces folded. */
export function plainText(value) {
  return String(value ?? '')
    .replace(/\(\(\/?[a-z][^)]*\)\)/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#xa0);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&rsquo;|&#8217;/gi, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The sentences of a text: a run ending in `.`, `!` or `?` followed by a space or the end. */
export function sentencesOf(value) {
  const text = plainText(value)
  if (!text) return []
  return text
    .split(/(?<=[.!?])\s+(?=\S)/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s))
}

/** @param {unknown} value @returns {{sentences: number, characters: number}} */
export function shapeOf(value) {
  const text = plainText(value)
  return { sentences: sentencesOf(text).length, characters: [...text].length }
}

/** The characters one line of a measured box holds, per viewport (`fit.maxChars` over `fit.lines`). */
function perLineOf(slot) {
  const fit = slot?.fit
  if (fit?.measured !== true || !fit.lines || !fit.maxChars) return {}
  const out = {}
  for (const [view, lines] of Object.entries(fit.lines))
    if (Number.isInteger(lines) && lines > 0 && Number(fit.maxChars[view]) > 0)
      out[view] = Number(fit.maxChars[view]) / lines
  return out
}

/** The lines a text takes in a box that holds `perLine` characters a line. */
const linesAt = (characters, perLine) => Math.max(1, Math.ceil(characters / perLine))

/** The fewest characters a sentence takes, so a band never asks for more sentences than its characters hold. */
const MIN_SENTENCE_CHARS = 20

/** The characters that take exactly `n` lines at `perLine` characters a line: `[least, most]`. */
const charsForLines = (n, perLine) => [Math.floor((n - 1) * perLine) + 1, Math.floor(n * perLine)]

/** The intersection of the character spans that take each view's line count (`[1, Infinity]` with no measured view). */
function lineSpan(lines) {
  let low = 1
  let high = Infinity
  for (const { lines: n, perLine } of Object.values(lines)) {
    const [l, h] = charsForLines(n, perLine)
    low = Math.max(low, l)
    high = Math.min(high, h)
  }
  return [low, high]
}

/**
 * Why a band no text can meet is empty (its least above its most, or no length in its characters taking its line count
 * on every measured viewport), or null when some text can meet it.
 * @param {{sentences: [number, number], characters: [number, number], lines: Record<string, {lines: number, perLine: number}>}} band
 */
export function emptyBandReason(band) {
  const [sLow, sHigh] = band.sentences
  const [low, high] = band.characters
  if (sLow > sHigh) return `sentences ${sLow}-${sHigh}`
  if (!(low >= 1 && low <= high)) return `characters ${low}-${high}`
  const [lineLow, lineHigh] = lineSpan(band.lines)
  if (Math.max(low, lineLow) > Math.min(high, lineHigh))
    return `characters ${low}-${high} meet no length taking lines ${JSON.stringify(band.lines)}`
  return null
}

/**
 * The band the template's demo text gives a list. Every measure comes from the same demo samples and the slots' real
 * boxes, and the band is their intersection: the demo's fewest to most sentences, its shortest to longest length with a
 * little give capped by the smallest box (`limit`), and, where the boxes were measured, the line count per viewport the
 * longest demo text renders, read at the narrowest sibling box. 🔒 ALWAYS SATISFIABLE: when the demo's lengths and its
 * line count exclude each other, the demo's rendered line count is kept and the characters follow from the box; when the
 * box cannot hold that line count, the line count follows from the most the box holds. Never a least above a most.
 * Null when the demo holds no text there.
 * @param {Array<unknown | {sample?: unknown, fit?: any}>} samples - demo texts, or the slots holding them
 * @param {number} [limit]
 * @returns {{sentences: [number, number], characters: [number, number],
 *   lines: Record<string, {lines: number, perLine: number}>, notes?: string[]} | null}
 */
export function bandOf(samples, limit = Infinity) {
  const slots = samples.map((s) => (s && typeof s === 'object' ? s : { sample: s }))
  const shapes = slots
    .map((slot) => ({ slot, ...shapeOf(/** @type {any} */ (slot).sample) }))
    .filter((s) => s.characters > 0 && s.sentences > 0)
  if (shapes.length === 0) return null
  const chars = shapes.map((s) => s.characters)
  const cap = Number(limit) >= 1 ? Number(limit) : Infinity
  const high = Math.max(1, Math.min(Math.round(Math.max(...chars) * BAND_GIVE.high), cap))
  const low = Math.max(1, Math.min(Math.round(Math.min(...chars) * BAND_GIVE.low), high))
  // The demo's rendered line count per viewport (the most lines a demo text takes in its own box), read at the narrowest
  // sibling box of that viewport, since the band holds one count per viewport for every sibling.
  /** @type {Record<string, {lines: number, perLine: number}>} */
  const demoLines = {}
  for (const s of shapes)
    for (const [view, perLine] of Object.entries(perLineOf(s.slot))) {
      const at = demoLines[view]
      const taken = linesAt(s.characters, perLine)
      demoLines[view] = {
        lines: Math.max(at?.lines ?? 0, taken),
        perLine: Math.min(at?.perLine ?? Infinity, perLine)
      }
    }
  const [lineLow, lineHigh] = lineSpan(demoLines)
  /** @type {[number, number]} */
  let characters
  let lines = demoLines
  if (Math.max(low, lineLow) <= Math.min(high, lineHigh))
    characters = [Math.max(low, lineLow), Math.min(high, lineHigh)]
  else if (lineLow <= lineHigh && Math.max(1, lineLow) <= Math.min(cap, lineHigh))
    characters = [lineLow, Math.min(cap, lineHigh)]
  else {
    // The box cannot hold the demo's line count on every viewport at once: one length the demo span allows (the one
    // nearest the demo's line count) sets the line count, and the characters are those that take it.
    const target = Math.min(high, Math.max(low, lineHigh < low ? lineHigh : lineLow))
    lines = {}
    for (const [view, { perLine }] of Object.entries(demoLines))
      lines[view] = { lines: linesAt(target, perLine), perLine }
    const [l, h] = lineSpan(lines)
    characters = [Math.max(low, l), Math.min(high, h)]
  }
  const sentenceCounts = shapes.map((s) => s.sentences)
  const sHigh = Math.max(
    1,
    Math.min(Math.max(...sentenceCounts), Math.floor(characters[1] / MIN_SENTENCE_CHARS))
  )
  const band = {
    sentences: /** @type {[number, number]} */ ([Math.min(Math.min(...sentenceCounts), sHigh), sHigh]),
    characters,
    lines
  }
  const empty = emptyBandReason(band)
  if (empty) {
    // A guard, not a path: under a test it fails loud; in production the band carries the note for the build receipt.
    if (process.env.NODE_TEST_CONTEXT) throw new Error(`bandOf: empty band (${empty})`)
    return { ...band, notes: [`empty-band: ${empty}`] }
  }
  return band
}

/** The lines a text takes per measured viewport of a band, or {} when its boxes were not measured. */
export function linesOf(value, band) {
  const characters = shapeOf(value).characters
  const out = {}
  for (const [view, { perLine }] of Object.entries(band?.lines ?? {}))
    out[view] = linesAt(characters, perLine)
  return out
}

/** Whether a text sits in a band, and says nothing with an exclamation mark. */
export function fitsBand(value, band) {
  const text = plainText(value)
  if (!text || text.includes('!')) return false
  if (!band) return true
  const { sentences, characters } = shapeOf(text)
  for (const [view, n] of Object.entries(linesOf(text, band))) if (n !== band.lines[view].lines) return false
  return (
    sentences >= band.sentences[0] &&
    sentences <= band.sentences[1] &&
    characters >= band.characters[0] &&
    characters <= band.characters[1]
  )
}

const stems = (value) =>
  plainText(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => [...w].length >= 4)
    .map((w) => [...w].slice(0, 5).join(''))

/** Whether a body speaks of its own title: it shares a word stem with it (no title: nothing to judge). */
export function aboutTitle(body, title) {
  const own = new Set(stems(title))
  if (own.size === 0) return true
  return stems(body).some((s) => own.has(s))
}

/**
 * How far a list's sibling texts drift apart: a mix of empty and written bodies, sentence counts more than one apart,
 * lengths more than `lengthRatio` apart, an exclamation mark, and (item lists) a body about something other than its own
 * title while its siblings speak of theirs.
 * @param {Array<{title?: string, body: string}>} cards
 * @param {{items?: boolean}} [options] - `items`: a list of things whose bodies name their own title (an item list)
 * @returns {Array<{reason: 'mixed-empty' | 'sentence-spread' | 'length-spread' | 'exclamation' | 'off-title', found: string}>}
 */
export function shapeDrift(cards, { items = false } = {}) {
  const out = []
  const written = cards.filter((c) => plainText(c.body))
  if (written.length === 0) return out
  const label = (c) => plainText(c.title) || plainText(c.body).slice(0, 30)
  if (written.length < cards.length)
    out.push({
      reason: 'mixed-empty',
      found: `${written.length} of ${cards.length} cards have body text: ${written.map(label).join(', ')}`
    })
  const shapes = written.map((c) => ({ c, ...shapeOf(c.body) }))
  const sentences = shapes.map((s) => s.sentences)
  if (Math.max(...sentences) - Math.min(...sentences) > SHAPE_LIMITS.sentenceSpread)
    out.push({
      reason: 'sentence-spread',
      found: shapes.map((s) => `${label(s.c)}: ${s.sentences}`).join('; ')
    })
  const chars = shapes.map((s) => s.characters)
  if (Math.max(...chars) > Math.min(...chars) * SHAPE_LIMITS.lengthRatio)
    out.push({
      reason: 'length-spread',
      found: shapes.map((s) => `${label(s.c)}: ${s.characters}`).join('; ')
    })
  for (const c of written)
    if (plainText(c.body).includes('!')) out.push({ reason: 'exclamation', found: plainText(c.body) })
  if (items) {
    const titled = written.filter((c) => plainText(c.title))
    const off = titled.filter((c) => !aboutTitle(c.body, c.title))
    // One body about something else while the others speak of their own titles; a single item card speaks for itself.
    if (off.length > 0 && (titled.length - off.length >= 1 || written.length < cards.length))
      for (const c of off) out.push({ reason: 'off-title', found: `${label(c)}: ${plainText(c.body)}` })
  }
  return out
}

/** The list a slot belongs to: its numbered collection, else its group's suffix shared by sibling entities. */
function listKeyOf(slot) {
  const id = String(slot?.group?.id ?? '')
  if (!id) return null
  const numbered = /^(.+)\.(\d+)$/.exec(id)
  if (numbered) return { list: numbered[1], card: id }
  const entity = String(slot.entity ?? '')
  if (!entity || !id.startsWith(`${entity}.`)) return null
  const kind = entity.replace(/-\d+$/, '')
  return { list: `${kind}:*${id.slice(entity.length)}`, card: id }
}

/**
 * The sibling lists of a set of slots: for each list and body role and position, its siblings (one per card, in order),
 * each with its card's title slot, and the band the demo gives them.
 * @param {any[]} slots - content map slots (key, entity, role, type, group, sample, fit)
 * @returns {Array<{id: string, role: string, kind: string, items: boolean, band: ReturnType<typeof bandOf>,
 *   siblings: Array<{slot: any, title: any | null}>}>}
 */
export function siblingLists(slots) {
  /** @type {Map<string, {card: string, slots: any[]}[]>} */
  const cardsOf = new Map()
  for (const slot of slots ?? []) {
    if (slot?.type !== 'text') continue
    const at = listKeyOf(slot)
    if (!at) continue
    const cards = cardsOf.get(at.list) ?? []
    let card = cards.find((c) => c.card === at.card)
    if (!card) cards.push((card = { card: at.card, slots: [] }))
    card.slots.push(slot)
    cardsOf.set(at.list, cards)
  }
  const out = []
  for (const [list, cards] of cardsOf) {
    if (cards.length < 2) continue
    // 🔒 A LIST OF PAGES IS NO ROW OF CARDS: groups named by a menu label (a per-page masthead, one shown on each page)
    // never stand side by side.
    if (cards.some((c) => c.slots.some((s) => s.role === 'editorial.menu_label'))) continue
    const kind = String(cards[0].slots[0]?.group?.kind ?? '')
    const titleOf = (card) => {
      for (const role of TITLE_ROLES) {
        const hit = card.slots.find((s) => s.role === role)
        if (hit) return hit
      }
      return null
    }
    for (const role of SIBLING_BODY_ROLES) {
      // A card holding the role more than once is a list of its own (an outline's lines), not one body per card.
      if (cards.some((c) => c.slots.filter((s) => s.role === role).length > 1)) continue
      const siblings = cards
        .map((card) => {
          const slot = card.slots.find((s) => s.role === role)
          const title = titleOf(card)
          return slot ? { slot, title: title && title !== slot ? title : null } : null
        })
        .filter(Boolean)
      if (siblings.length < 2) continue
      const limit = Math.min(...siblings.map(({ slot }) => limitOf(slot)))
      const band = bandOf(
        siblings.map(({ slot }) => slot),
        limit
      )
      if (!band) continue
      out.push({
        id: `${list}|${role}`,
        role,
        kind,
        items: ITEM_KINDS.has(kind),
        band,
        siblings: /** @type {Array<{slot: any, title: any | null}>} */ (siblings)
      })
    }
  }
  return out
}

/** The character limit a slot's measured box gives (none: no limit). */
export function limitOf(slot) {
  return Math.min(
    Number.isInteger(slot?.maxCharacters) ? slot.maxCharacters : Infinity,
    Number.isInteger(slot?.fit?.maxCharacters) ? slot.fit.maxCharacters : Infinity
  )
}

/** Words of a hard fact a rewrite may only state when its sources do. */
const FACT_WORDS =
  /\b(?:ages?|aged|levels?|beginners?|kids?|children|adults?|years?|since|founded|established|price[ds]?|free|discounts?|guarantee[ds]?|certified|award(?:s|ed)?|licensed|accredited|best|first|only|number one|#1)\b/gi

const folded = (value) =>
  ` ${plainText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

/** The names a text states: capitalised words that do not open a sentence ("Dubai", "Marina"). */
function namesIn(value) {
  const out = new Set()
  for (const sentence of sentencesOf(value)) {
    const words = sentence.split(/\s+/).slice(1)
    for (const w of words) {
      const word = w.replace(/^[^\p{L}]+|[^\p{L}\p{N}]+$/gu, '')
      if (/^\p{Lu}[\p{Ll}\p{N}]/u.test(word)) out.add(word.toLowerCase())
    }
  }
  return out
}

/**
 * Whether a rewrite of a sibling may stand: in the band, no exclamation mark, every figure and name of the words it
 * rewrites kept, no figure, name or fact word that neither those words nor the business's sources hold, and (item lists)
 * about its own title.
 * @param {unknown} line
 * @param {{original?: string, sourceText?: string, band: any, title?: string, items?: boolean}} context
 */
export function acceptsSiblingRewrite(
  line,
  { original = '', sourceText = '', band, title = '', items = false }
) {
  if (typeof line !== 'string' || line.includes('\n')) return false
  const text = plainText(line)
  if (!fitsBand(text, band)) return false
  const sources = `${original} ${sourceText} ${title}`
  const digits = ` ${sources.replace(/\D+/g, ' ')} `
  for (const n of text.match(/\d+/g) ?? []) if (!digits.includes(` ${n} `)) return false
  for (const n of plainText(original).match(/\d+/g) ?? [])
    if (!` ${text.replace(/\D+/g, ' ')} `.includes(` ${n} `)) return false
  const known = folded(sources)
  for (const m of text.matchAll(FACT_WORDS)) if (!known.includes(folded(m[0]))) return false
  for (const name of namesIn(text)) if (!known.includes(` ${name} `)) return false
  for (const name of namesIn(original)) if (!folded(text).includes(` ${name} `)) return false
  if (items && title && !aboutTitle(text, title)) return false
  return true
}

/**
 * The spelling key of a word: one form for its British and American spellings (-ise/-ize, -isation/-ization, -our/-or,
 * -tre/-ter), so "Personalised" and "Personalized" read as one word spelt two ways.
 */
export function spellingKey(word) {
  return String(word ?? '')
    .toLowerCase()
    .replace(/is(e|ed|es|ing|ation|ations|er|ers)$/u, 'iz$1')
    .replace(/our(s|ed|ing|ite|ites|able)?$/u, 'or$1')
    .replace(/tre(s)?$/u, 'ter$1')
}

const WORD = /\p{L}[\p{L}'’]*/gu

/**
 * A text with every word the reference spells otherwise (a British or American variant of the same word) spelt as the
 * reference spells it, its capitals kept. One spelling per site: a card follows its own title.
 * @param {unknown} value
 * @param {unknown} reference - the words whose spelling wins (the record's title)
 */
export function alignSpelling(value, reference) {
  const own = new Map()
  for (const w of String(reference ?? '').match(WORD) ?? [])
    if ([...w].length >= 5) own.set(spellingKey(w), w.toLowerCase())
  if (own.size === 0) return String(value ?? '')
  return String(value ?? '').replace(WORD, (w) => {
    const lower = w.toLowerCase()
    const target = own.get(spellingKey(w))
    if (!target || target === lower) return w
    if (w === w.toUpperCase()) return target.toUpperCase()
    return /^\p{Lu}/u.test(w) ? target[0].toUpperCase() + target.slice(1) : target
  })
}

/**
 * Words a site spells two ways: for each spelling key with more than one form among `texts`, the forms.
 * @param {string[]} texts
 * @returns {Array<string[]>}
 */
export function spellingVariants(texts) {
  /** @type {Map<string, Set<string>>} */
  const forms = new Map()
  for (const t of texts)
    for (const w of plainText(t).match(WORD) ?? []) {
      if ([...w].length < 5) continue
      const key = spellingKey(w)
      forms.set(key, (forms.get(key) ?? new Set()).add(w.toLowerCase()))
    }
  return [...forms.values()].filter((s) => s.size > 1).map((s) => [...s].sort())
}

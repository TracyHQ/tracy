// The text a brief build's writer left in the demo's words, and what stands in for it (spec TracyHQ/tracy#189: leftover
// kinds C03 and C09). After the writer, the guard and the rename of the demo company, a text slot the site plan gives the copy
// writer (`text-by-copy`) can still hold the template's words: the writer pended it, never answered it, wrote a line the site
// would refuse or a guard dropped, or the demo company's name was only swapped inside the demo's sentence ("We opened <the
// owner's name> in 2008"). Measured 29/10/2026 on the local stand (a Joomla T4 template, a coaching club brief): class card
// intros in lorem ipsum, four step descriptions of the demo's sport, and offering pages whose every paragraph was the demo's.
//
// 🔒 NEVER THE DEMO'S WORDS, NEVER AN INVENTION. Each such slot takes, in this order: the site plan's own fallback (a quote of
// the brief for that card), the neutral words of its role in the site's language (`neutralFor`: "Service", "Step",
// "Contact"), the business's own description for a free paragraph (once per record), else nothing: the slot is emptied.
// Rules by slot role and by the words of the demo's sample, never by template, trade or business. Pure and deterministic.
import { neutralFor } from './neutral-copy.mjs'
import { demoWordsOf, wordsOf } from './honest-written.mjs'

/** Free paragraphs: a business's own description reads right in any of them. */
const PARAGRAPH_ROLES = new Set(['editorial.paragraph', 'business.summary', 'business.long_description'])
/** A line the writer echoed is trusted when it is this short (a label, "Basic"): the model judged it fits. */
const ECHO_TRUSTED_WORDS = 3
/** A changed line that holds only the demo's words and the owner's is the demo's once it has this many of the demo's words. */
const RENAMED_MIN_WORDS = 3
const LOREM = /\blorem ipsum\b|\bdolor sit amet\b/i
/** A site token the page fills in itself (`{site.name}`): such a line is never the demo's words. */
const TOKEN = /\{[a-z][\w.-]*\}/i

const sameWords = (a, b) => wordsOf(a).join(' ') === wordsOf(b).join(' ')

/** Whether a line fits its slot. */
const fits = (slot, text) =>
  typeof text === 'string' &&
  text.trim() !== '' &&
  (!Number.isInteger(slot.maxCharacters) || [...text].length <= slot.maxCharacters)

/**
 * The records a visitor reads on the template's pages: each page's own record, the modules it carries, the article a menu
 * entry opens (`view=article&id=N`), and the offering articles (ADR 0040 `offering.*` lines) of a category a page lists
 * (`view=category&id=N`), as the Joomla planner's page surface reads them. Null when the map has no pages (every record is
 * then read).
 * @param {Array<{entity?: string, link?: string, assignedModules?: Array<{entity?: string}>}>} pages
 * @param {{entities?: any[], slots?: any[]}} [map] - the map's entities (an article's `identityReferences.catid`) and slots
 */
export function pageRecords(pages, { entities = [], slots = [] } = {}) {
  if (!Array.isArray(pages) || pages.length === 0) return null
  const out = new Set()
  const listed = new Set()
  for (const page of pages) {
    if (page?.entity) out.add(page.entity)
    for (const module of page?.assignedModules ?? []) if (module?.entity) out.add(module.entity)
    const link = String(page?.link ?? '')
    const id = /[?&]view=article(?:&|$)/.test(link) ? /[?&]id=(\d+)/.exec(link)?.[1] : null
    if (id) out.add(`article-${id}`)
    const category = /[?&]view=category(?:&|$)/.test(link) ? /[?&]id=(\d+)/.exec(link)?.[1] : null
    if (category) listed.add(`category-${category}`)
  }
  const offerings = new Set(
    slots.filter((s) => String(s?.role ?? '').startsWith('offering.')).map((s) => s.entity)
  )
  for (const entity of entities)
    if (
      entity?.kind === 'article' &&
      offerings.has(entity.key) &&
      listed.has(entity.identityReferences?.catid)
    )
      out.add(entity.key)
  return out
}

/**
 * Whether a slot still shows the demo's words once `value` is written (undefined: nothing is written, the sample stays).
 * @param {{key: string, sample?: string}} slot
 * @param {string | undefined} value
 * @param {Set<string>} ownWords - every word the owner gave
 * @param {Set<string>} held - the keys the writer did not answer (pended, refused, unreadable, dropped by a guard)
 */
export function isDemoLeft(slot, value, ownWords, held) {
  const sample = String(slot.sample ?? '')
  if (TOKEN.test(sample)) return false
  const demo = demoWordsOf(sample, ownWords)
  if (demo.length === 0) return false
  if (typeof value === 'string' && LOREM.test(value)) return true
  if (typeof value === 'string' && !sameWords(value, sample)) {
    // A new line, unless it is the demo's sentence with only the owner's words put in (a renamed company).
    const fresh = wordsOf(value).filter((w) => !ownWords.has(w))
    const sampleWords = new Set(wordsOf(sample))
    return fresh.length >= RENAMED_MIN_WORDS && fresh.every((w) => sampleWords.has(w))
  }
  if (LOREM.test(sample) || held.has(slot.key)) return true
  // Echoed by the writer: a short label it judged fitting stays, a sentence of the demo's does not.
  return demo.length > ECHO_TRUSTED_WORDS
}

/**
 * @param {object} input
 * @param {any[]} input.slots - the content map's slots a visitor reads, with their box limits (`maxCharacters`)
 * @param {Record<string, string>} input.written - the words about to be written, by slot key
 * @param {Iterable<string>} input.asked - the keys the site plan gives the copy writer (`text-by-copy`)
 * @param {Iterable<string>} [input.held] - the keys the writer did not answer
 * @param {string} input.ownText - every word the owner gave
 * @param {{values?: Record<string, any>, blanks?: Array<{key: string}>, fallbacks?: Record<string, {value: string}>,
 *   records?: any[]} | null} [input.honesty] - the site plan's
 * @param {string} [input.locale]
 * @param {{phone?: string, email?: string, contactPage?: string}} [input.business]
 * @param {string} [input.description] - the business's own description (the site plan's brand), or empty
 * @param {any[]} [input.pages] - the map's pages: only the records they show are judged
 * @param {any[]} [input.entities] - the map's entities: the offering articles a category page lists
 * @returns {{values: Record<string, string>, blanks: string[], counts: {fallbacks: number, neutral: number,
 *   described: number, blanked: number}}}
 */
export function leftDemoText({
  slots,
  written,
  asked,
  held = [],
  ownText,
  honesty = null,
  locale = 'en',
  business = {},
  description = '',
  pages = [],
  entities = []
}) {
  const wanted = new Set(asked)
  const unanswered = new Set(held)
  const ownWords = new Set(wordsOf(ownText))
  const shown = pageRecords(pages, { entities, slots })
  const blanked = new Set((honesty?.blanks ?? []).map((b) => b.key))
  const hiddenGroups = new Set(
    (honesty?.records ?? []).filter((r) => r.decision === 'hide').map((r) => r.group)
  )
  const values = {}
  const blanks = []
  const counts = { fallbacks: 0, neutral: 0, described: 0, blanked: 0 }
  const describedIn = new Set()
  const about = String(description ?? '').trim()
  for (const slot of slots) {
    const key = slot.key
    if (!wanted.has(key) || slot.type !== 'text') continue
    if (shown && !shown.has(slot.entity)) continue
    // What the site plan decides is the plan's: a value, an emptied fact, a hidden card.
    if (honesty?.values?.[key] || blanked.has(key) || hiddenGroups.has(slot.group?.id)) continue
    if (!isDemoLeft(slot, written[key], ownWords, unanswered)) continue
    const fallback = honesty?.fallbacks?.[key]?.value
    if (fits(slot, fallback)) {
      values[key] = fallback
      counts.fallbacks += 1
      continue
    }
    const neutral = neutralFor({
      role: slot.role,
      kind: slot.group?.kind,
      index: slot.group?.item,
      locale,
      business
    })
    if (neutral.state === 'neutral' && fits(slot, neutral.text)) {
      values[key] = neutral.text
      counts.neutral += 1
      continue
    }
    if (PARAGRAPH_ROLES.has(slot.role) && about && !describedIn.has(slot.entity) && fits(slot, about)) {
      values[key] = about
      describedIn.add(slot.entity)
      counts.described += 1
      continue
    }
    blanks.push(key)
    counts.blanked += 1
  }
  return { values, blanks, counts }
}

/**
 * 🔒 ONE AUTHOR WRITES THE PAGES OF AN ACCEPTED SITE PLAN (spec TracyHQ/tracy#231, ticket #235). When a brief build has an
 * accepted site plan, the page writer (`plan-joomla-contract.mjs`, option `author`) is that plan's author: each call writes
 * one page and carries the rulebook (its instructions), this page's plan (purpose, lead, facts, items, the sections the
 * plan hid on it), the shared glossary and the text of the pages already written. The parts here are the ones the planner
 * reads per call; the order of the pages and the build record are the engine's (`page-author.js` of tracy-web).
 * CMS-neutral: no template, module or business is named.
 */

import { factsNotIn, specificFacts } from './fact-sources.mjs'

/** Said to the author on every page call, after its rulebook. */
export const AUTHOR_RULE =
  '\n\n# Writing one page of the plan\n\nYou wrote the site plan; now you write its pages, one page per call, in the ' +
  'plan\'s writing order. "plan.page" is this page\'s plan: lead with "lead", serve "purpose", state the "facts" it ' +
  'assigns and name its "items". "plan.hiddenSections" are taken off the site: never refer to them. "glossary" holds ' +
  'the shared items (offerings, people): write each name exactly as the glossary spells it, and where a slot describes ' +
  'that item use its description word for word. A slot\'s "offering" names the glossary item it shows. "writtenPages" holds the pages already written: a page that summarises them reuses their ' +
  'names and descriptions, never contradicts them, and never repeats their other sentences.\n\n'

/** The most lines of one written page the next pages are told, and the longest line kept: a compact view. */
export const WRITTEN_LINES_MAX = 40
export const WRITTEN_LINE_CHARS = 160

/**
 * The text of a page already written, compact: its lines in slot order, markup taken out, each cut short.
 * @param {string} page
 * @param {Array<string>} values
 */
export function compactPage(page, values) {
  const lines = []
  for (const value of values) {
    const line = String(value ?? '')
      .replace(/\[\[br\]\]/g, ' ')
      .replace(/\[\[|\]\]/g, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!line) continue
    lines.push(line.length > WRITTEN_LINE_CHARS ? `${line.slice(0, WRITTEN_LINE_CHARS - 1)}…` : line)
    if (lines.length >= WRITTEN_LINES_MAX) break
  }
  return { page, lines }
}

/**
 * The part of a page call's input the author is given beside the slots.
 * @param {{page?: any, hiddenSections?: string[], glossary?: any[], writtenPages?: any[]}} author
 */
export function authorInput(author) {
  return {
    plan: { page: author.page ?? null, hiddenSections: author.hiddenSections ?? [] },
    glossary: Array.isArray(author.glossary) ? author.glossary : [],
    writtenPages: Array.isArray(author.writtenPages) ? author.writtenPages : []
  }
}

const escape = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The values with every glossary name and description taken out: shared items are said the same on every page by
 * design, so they are no repeat for the duplicate check (`distinct-copy.mjs`).
 * @param {Record<string, unknown>} values
 * @param {any[]} glossary
 */
export function withoutGlossary(values, glossary) {
  const phrases = (Array.isArray(glossary) ? glossary : [])
    .flatMap((g) => [g?.description, g?.name])
    .filter((p) => typeof p === 'string' && p.trim().length >= 4)
    .sort((a, b) => b.length - a.length)
  if (!phrases.length || !values || typeof values !== 'object') return values
  const re = new RegExp(phrases.map((p) => escape(p.trim().replace(/[.!?]+$/, ''))).join('|'), 'gi')
  return Object.fromEntries(
    Object.entries(values).map(([key, v]) => [key, typeof v === 'string' ? v.replace(re, ' ') : v])
  )
}

/**
 * The lines of an answer over their slot's limit, as the sentence the author is sent back with, or null.
 * @param {Array<{key: string, maxCharacters: number}>} slots
 * @param {Record<string, unknown>} values
 * @param {(value: string) => string} plain - the words a visitor reads (style marks out)
 */
export function lengthComplaint(slots, values, plain) {
  const long = slots.filter(
    (s) => typeof values?.[s.key] === 'string' && [...plain(String(values[s.key]))].length > s.maxCharacters
  )
  if (!long.length) return null
  return `These lines are longer than their box holds: ${long
    .slice(0, 8)
    .map(
      (s) =>
        `${s.key} (at most ${s.maxCharacters} characters, ${[...plain(String(values[s.key]))].length} written)`
    )
    .join('; ')}. Rewrite each within its limit, about the length of its sample.`
}

// 🔒 PEOPLE ARE GLOSSARY ITEMS LIKE OFFERINGS (ticket #237): a coach's or team member's name is spelt as the glossary spells it on
// every page, and the short line under it (their role) is its glossary description where it fits.
const NAME_ROLES = new Set(['offering.name', 'package.name', 'person.name'])
const DESCRIPTION_ROLES = new Set(['offering.description', 'offering.summary', 'person.role'])
// A card the plan bound to a glossary item whose own words are a plain heading and paragraph (a feature row the plan uses to
// show its offerings): its heading is the item's name and its paragraph carries the item's description.
const CARD_NAME_ROLES = new Set(['editorial.heading'])
const CARD_DESCRIPTION_ROLES = new Set(['editorial.paragraph'])

/** Whether a slot names its glossary item, or describes it. */
const namesItem = (/** @type {any} */ slot) =>
  NAME_ROLES.has(slot?.role) || (CARD_NAME_ROLES.has(slot?.role) && !!slot?.group)
const describesItem = (/** @type {any} */ slot) =>
  DESCRIPTION_ROLES.has(slot?.role) || (CARD_DESCRIPTION_ROLES.has(slot?.role) && !!slot?.group)

/** The words a visitor reads, for comparing: markup out, case and end punctuation ignored. */
const said = (/** @type {unknown} */ v) =>
  String(v ?? '')
    .replace(/\[\[br\]\]/g, ' ')
    .replace(/\[\[|\]\]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?,;:]+$/, '')
    .trim()
    .toLowerCase()

/** Whether a phrase of the plan (a lead, a fact without a figure) is carried by a text: most of its main words are in it. */
function carries(/** @type {string} */ text, /** @type {string} */ phrase, share) {
  const words = [...new Set(said(phrase).match(/[\p{L}]{4,}/gu) ?? [])]
  if (words.length === 0) return true
  const have = words.filter((w) => text.includes(w.slice(0, 5))).length
  return have >= Math.ceil(words.length * share)
}

/**
 * 🔒 THE PLAN AXIS OF THE PAGE CHECK (spec TracyHQ/tracy#231, ticket #236): pure code. What a page the author wrote must
 * still hold to the plan: it writes nothing into a section the plan hid, it names a glossary item as the glossary spells it
 * (and says its description where the slot is that item's description and the description fits), and, once its last slot is
 * written, it carries the lead and every fact the plan assigned to it.
 * @param {{slots: any[], values: Record<string, unknown>, written?: Record<string, unknown>, author: any,
 *   offeringOf: (slot: any) => string | null, entityOf: (key: string) => string | undefined, last?: boolean, site?: any}} input
 *   `values`: this call's answer as it stands; `written`: the lines of this page already settled by earlier batches
 * @returns {{lines: Record<string, string>, hidden: Record<string, string>, page: string[]}}
 */
export function planConformance({
  slots,
  values,
  written = {},
  author,
  offeringOf,
  entityOf,
  last = true,
  site = null
}) {
  const lines = {}
  const hidden = {}
  const page = []
  const off = new Set((author?.hiddenSections ?? []).map((id) => String(id).replace(/^[a-z-]+:/, '')))
  for (const [key, value] of Object.entries(values ?? {})) {
    const entity = entityOf(key)
    if (typeof value === 'string' && said(value) && entity && off.has(entity))
      hidden[key] = `${key} is in a section the plan hid (${entity}); write nothing there`
  }
  const glossary = Array.isArray(author?.glossary) ? author.glossary : []
  const entryOf = (/** @type {string | null} */ name) =>
    name ? glossary.find((g) => said(g?.name) === said(name)) : undefined
  for (const slot of slots) {
    const value = values?.[slot.key]
    if (typeof value !== 'string' || !said(value)) continue
    const entry = entryOf(offeringOf(slot))
    if (!entry) continue
    if (namesItem(slot) && entry.name.length <= slot.maxCharacters && said(value) !== said(entry.name))
      lines[slot.key] =
        `${slot.key} must be named exactly "${entry.name}" as the glossary spells it (you wrote "${said(value)}")`
    else if (
      describesItem(slot) &&
      said(entry.description) &&
      entry.description.length <= slot.maxCharacters &&
      !said(value).includes(said(entry.description))
    )
      lines[slot.key] =
        `${slot.key} must use the glossary description of "${entry.name}" word for word: "${entry.description}"`
  }
  if (last && author?.page) {
    const text = said(Object.values({ ...written, ...values }).join(' '))
    if (author.page.lead && !carries(text, author.page.lead, 0.5))
      page.push(`the page must lead with the plan's message: "${author.page.lead}"`)
    for (const fact of Array.isArray(author.page.facts) ? author.page.facts : []) {
      const figures = specificFacts(String(fact), { site }).length > 0
      const missing = figures
        ? factsNotIn(String(fact), text, site).length > 0
        : !carries(text, String(fact), 0.6)
      if (missing) page.push(`the page must carry the fact the plan assigned to it: "${fact}"`)
    }
  }
  return { lines, hidden, page }
}

/** The sentence the author is sent back with for its plan conformance failures, or null. */
export function conformanceComplaint(/** @type {ReturnType<typeof planConformance> | null} */ issues) {
  if (!issues) return null
  const all = [...Object.values(issues.lines), ...Object.values(issues.hidden), ...issues.page]
  return all.length
    ? `Your answer does not follow the site plan: ${all.slice(0, 10).join('; ')}. Fix only these, every other line as it was.`
    : null
}

/**
 * The offering binding of the site (`offeringBinding`) with the names the plan gave the cards of a collection as its
 * fallback: card N of a collection (its group id without the card number) is plan item N, so a card is written from, and checked against, its
 * own glossary item. `recordItems` binds the record pages the same way: every slot of a record page's entity is that
 * record's item (ticket #237), so an offering's own page is written from, and checked against, its glossary entry.
 * @param {(slot: any) => string | null} base @param {Record<string, string[]> | undefined} cardItems
 * @param {Record<string, string> | undefined} [recordItems] - the item of each record page, by its entity
 * @returns {(slot: any) => string | null}
 */
export function withCardItems(base, cardItems, recordItems) {
  const cards = cardItems && Object.keys(cardItems).length > 0 ? cardItems : null
  const records = recordItems && Object.keys(recordItems).length > 0 ? recordItems : null
  if (!cards && !records) return base
  return (slot) =>
    base(slot) ??
    cards?.[String(slot?.group?.id ?? '').replace(/\.\d+$/, '')]?.[slot?.group?.item] ??
    records?.[String(slot?.entity ?? '')] ??
    null
}

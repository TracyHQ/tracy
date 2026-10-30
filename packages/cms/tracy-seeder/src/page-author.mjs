/**
 * 🔒 ONE AUTHOR WRITES THE PAGES OF AN ACCEPTED SITE PLAN (spec TracyHQ/tracy#231, ticket #235). When a brief build has an
 * accepted site plan, the page writer (`plan-joomla-contract.mjs`, option `author`) is that plan's author: each call writes
 * one page and carries the rulebook (its instructions), this page's plan (purpose, lead, facts, items, the sections the
 * plan hid on it), the shared glossary and the text of the pages already written. The parts here are the ones the planner
 * reads per call; the order of the pages and the build record are the engine's (`page-author.js` of tracy-web).
 * CMS-neutral: no template, module or business is named.
 */

/** Said to the author on every page call, after its rulebook. */
export const AUTHOR_RULE =
  '\n\n# Writing one page of the plan\n\nYou wrote the site plan; now you write its pages, one page per call, in the ' +
  'plan\'s writing order. "plan.page" is this page\'s plan: lead with "lead", serve "purpose", state the "facts" it ' +
  'assigns and name its "items". "plan.hiddenSections" are taken off the site: never refer to them. "glossary" holds ' +
  'the shared items: write each name exactly as the glossary spells it, and where a slot describes that item use its ' +
  'description word for word. "writtenPages" holds the pages already written: a page that summarises them reuses their ' +
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

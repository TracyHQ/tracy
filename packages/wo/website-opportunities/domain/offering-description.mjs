// The words an offering's description or summary takes (spec TracyHQ/tracy#189, COO rules of 30/10/2026): every kept offering
// card describes its offering, and a line under an offering's name that says nothing but the name ("Padel" under "Padel")
// is never shown. Pure and deterministic: no model, no site.
//
// 🔒 THE ORDER: (1) the business's own words about that offering (its quote, a line quoted under it, a line of its own post
// about it); (2) else the copy writer writes one line about that offering from the trade (`acceptsWrittenDescription`:
// editorial words only, no fact the brief does not hold, never the name again); (3) only when the writer gives nothing
// usable is the line taken off.
//
// 🔒 A DESCRIPTION SAYS MORE THAN THE NAME. A line whose every word is a word of the offering's names (its brief label, the
// shorter form its card shows) only repeats the name, whatever its casing, spelling of spaces or HTML.
// 🔒 ONLY THE BUSINESS'S OWN WORDS ABOUT THAT OFFERING: its quote, else a post or page line quoted under it, never a guest
// review (a guest's words are no description of the business), never a line that names another offering of the brief.
// 🔒 A FALLBACK PASSES THE SITE'S VOICE (`inSiteVoice`) and is never a social post's line copied as it stands; siblings
// of one list fall back as one unit (`site-plan-honesty.mjs`): every card from the business's words, or none.
// 🔒 RULES BY ROLE AND SOURCE KIND, never by template, trade or business.

import { inSiteVoice } from './site-style-sheet.mjs'

/**
 * Source kinds a fallback never copies: a guest's words (no description of the business), and a social post's line, which
 * speaks in a post's voice ("Join us in Dubai!"), not a card's (COO criterion 1.3, R12).
 */
const GUEST_SOURCES = new Set(['review', 'post', 'social', 'instagram', 'facebook', 'tiktok', 'twitter', 'x'])

const folded = (value) =>
  ` ${String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160|#xa0);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `
const wordsOf = (value) => folded(value).trim().split(' ').filter(Boolean)

/** Words of a hard fact a written description may only state when the brief does: ages, levels, years, prices, promises. */
const FACT_WORDS =
  /\b(?:ages?|aged|levels?|beginners?|kids?|children|adults?|years?|since|founded|established|price[ds]?|free|discounts?|guarantee[ds]?|certified|award(?:s|ed)?|licensed|accredited|best|first|only|number one|#1)\b/i

/**
 * Lines of the business's own posts about one offering (`brief.content.items`, authored by the page): the post the offering
 * was read from (`source.ref`), or one naming it and no other offering. Its title first, then its lines naming one of the
 * offering's own words.
 * @param {any} brief
 * @param {{id: string, label: string, source?: {ref?: string} | null}} service - a reading service of the brief
 * @param {Array<{id: string, label: string}>} services - every offering the site shows
 * @returns {string[]}
 */
export function ownPostLinesOf(brief, service, services) {
  const words = wordsOf(service.label).filter((w) => [...w].length >= 4)
  const out = []
  for (const item of brief?.content?.items ?? []) {
    if (item?.authorship && item.authorship !== 'page') continue
    const all = `${item?.title ?? ''}\n${item?.body ?? ''}`
    const own = item?.id && item.id === service.source?.ref
    if (!own && (!folded(all).includes(folded(service.label)) || namesOther(all, service, services))) continue
    const lines = [item?.title, ...String(item?.body ?? '').split(/\n+/)]
      .map((l) => String(l ?? '').trim())
      .filter((l) => wordsOf(l).length >= 3 && [...l].length <= 240)
    const [title, ...body] = lines
    if (title) out.push(title)
    for (const line of body) if (words.some((w) => wordsOf(line).includes(w))) out.push(line)
  }
  return out.filter((line, i) => out.findIndex((o) => folded(o) === folded(line)) === i)
}

/**
 * Whether a line the copy writer wrote may describe an offering on its card: one line, says more than the offering's
 * names, names no other offering, and states no hard fact (a figure, an age or level, a year, a price, a promise) the
 * business's own words do not hold. Editorial words about the trade are free (COO rule).
 * @param {unknown} line
 * @param {{assigned: {id: string, label: string}, offerings: Array<{id: string, label: string}>, names?: string[],
 *   sourceText?: string, limit?: number}} context - `sourceText`: every word the business gave
 */
export function acceptsWrittenDescription(
  line,
  { assigned, offerings, names = [], sourceText = '', limit = Infinity }
) {
  if (typeof line !== 'string') return false
  const text = line.trim()
  if (!text || text.includes('\n') || [...text].length > limit) return false
  if (onlyNamesOffering(text, [assigned.label, ...names]) || namesOther(text, assigned, offerings))
    return false
  const source = folded(sourceText)
  const digits = String(sourceText).replace(/\D+/g, ' ')
  for (const n of text.match(/\d+/g) ?? []) if (!` ${digits} `.includes(` ${n} `)) return false
  for (const m of text.matchAll(new RegExp(FACT_WORDS.source, 'gi')))
    if (!source.includes(folded(m[0]))) return false
  return true
}

/**
 * Whether a line only repeats an offering's name: it has words, and every one of them is a word of `names`.
 * @param {unknown} value - plain text or HTML
 * @param {Array<string | null | undefined>} names - the offering's brief label and any shorter form its card shows
 */
export function onlyNamesOffering(value, names) {
  const said = wordsOf(value)
  if (said.length === 0) return false
  const own = new Set(names.flatMap((n) => wordsOf(n)))
  return own.size > 0 && said.every((w) => own.has(w))
}

/** Whether a line names an offering of the brief other than `assigned` (and not one whose name is part of its own). */
function namesOther(line, assigned, offerings) {
  const said = folded(line)
  const mine = folded(assigned.label)
  return offerings.some(
    (o) =>
      o.id !== assigned.id &&
      folded(o.label).trim() &&
      !mine.includes(folded(o.label)) &&
      said.includes(folded(o.label))
  )
}

/**
 * The business's own words an offering's description or summary falls back to, in order: its quote, then the lines of its
 * posts and pages quoted under it. Each says more than the offering's names, names no other offering and passes `fits`;
 * a line in `taken` (one another line of the same card already shows) is never given twice.
 * @param {{id: string, label: string, quote?: string | null, mentions?: Array<{quote: string, kind?: string | null}>}} assigned
 * @param {Array<{id: string, label: string}>} offerings - every offering the site shows
 * @param {{fits?: (value: string) => boolean, names?: string[], taken?: Set<string>}} [options] - `names`: shorter forms
 *   the card shows
 * @returns {{value: string, reason: 'brief-offering-quote' | 'brief-offering-mention'} | null}
 */
export function offeringDescriptionOf(
  assigned,
  offerings,
  { fits = () => true, names = [], taken = new Set() } = {}
) {
  const all = [assigned.label, ...names]
  const usable = (line) =>
    typeof line === 'string' &&
    line.trim() !== '' &&
    !onlyNamesOffering(line, all) &&
    !namesOther(line, assigned, offerings) &&
    ![...taken].some((t) => folded(t) === folded(line)) &&
    // The same voice filter as written copy: no exclamation mark, no Title Case slogan.
    inSiteVoice(line, { names: [...all, ...offerings.map((o) => o.label)] }) &&
    fits(line.trim())
  if (usable(assigned.quote)) return { value: String(assigned.quote).trim(), reason: 'brief-offering-quote' }
  for (const mention of assigned.mentions ?? [])
    if (!GUEST_SOURCES.has(String(mention?.kind ?? '')) && usable(mention?.quote))
      return { value: mention.quote.trim(), reason: 'brief-offering-mention' }
  return null
}

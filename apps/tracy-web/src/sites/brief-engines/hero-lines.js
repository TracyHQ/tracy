/**
 * The first-screen lines of a brief build's site plan (`website-opportunities/domain/hero-first-screen.mjs` and
 * `page-intros.mjs`, spec TracyHQ/tracy#189, COO rule 29/10/2026): the home subline that names what the business offers and
 * where, the main button's label and link, the intro of each offering page, and a card button's action words in place of a
 * bare "Contact" (`contact-buttons.mjs`). They win over the copy writer's words for
 * the same slots, and a line the left-demo sweep would empty is not emptied.
 *
 * Decided at write time, against the words each heading will really hold (`current`), not its sample:
 *   - the place is said once: a line with a `short` form drops the place when its heading already names it
 *   - an intro (`when: 'missing'`) is written only when the copy writer's line fails: it names none of the page's
 *     offerings, none of the people they serve (`who`), or the place is in neither it nor the heading
 *   - the headline (`hero-why`, else `hero-what`) says what sets the business apart and where, from the brief's USP
 *     (`hero-usp.mjs`); the template's style is put back by position (`joomla-inline-styles.js`)
 *
 * 🔒 ONLY IN THE LANGUAGE THEY WERE MADE IN: the plan writes them from the brief in English; a site written in another
 * language leaves them to the copy writer, which writes in the site's language.
 */

import { introRoleProblem, placeIntroRole } from 'website-opportunities/domain/page-intro-role.mjs'

const REASONS = new Set([
  'hero-what',
  'hero-why',
  'hero-when',
  'hero-contact',
  'intro-what',
  'intro-where',
  'intro-role',
  'cta-action',
  'button-action'
])
/** A button's words that name no action (`contact-buttons.mjs` decides the words that replace them). */
const BARE_CONTACT = /^(?:contact|contact us|get in touch|reach us|enquire|inquire)$/i

/** The words of a line as a visitor reads them: style marks and tags taken off. */
const plainOf = (value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]*>|\[\[|\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The words of a line as a visitor reads them, lower case: style marks and tags taken off. */
const wordsOf = (value) =>
  String(value ?? '')
    .replace(/\(\([^)]*\)\)|<[^>]*>|\[\[|\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/**
 * @param {any} sitePlan - the build's site plan (`receipt.sitePlan`)
 * @param {string} [locale] - the language the site is written in
 * @param {(key: string) => string | undefined} [current] - the words a slot will hold once written (the copy writer's, else
 *   the template's)
 * @returns {Record<string, string>} slot key -> value
 */
export function heroSlotValues(sitePlan, locale = 'en', current = () => undefined) {
  const english = String(locale ?? 'en')
    .toLowerCase()
    .startsWith('en')
  /** @type {Record<string, string>} */
  const out = {}
  for (const s of sitePlan?.slots ?? []) {
    if (!english && !(s.reason === 'button-action' && s.valueType === 'url')) continue
    if (s?.decision !== 'value' || !REASONS.has(s.reason)) continue
    if (typeof s.value !== 'string' || s.value.trim() === '') continue
    // Where the business is based (`intro-where`): kept when the copy writer's line names the district, else said after
    // that line when both fit the box, else in its place.
    if (s.reason === 'intro-role') {
      if (introRoleProblem(plainOf(current(s.key)), s.pageRole, s.offerings)) out[s.key] = s.value
      continue
    }
    if (s.reason === 'intro-where') {
      if (s.pageRole && !placeIntroRole(s.pageRole)) continue
      const written = plainOf(current(s.key))
      const own = s.pageRole && introRoleProblem(written, s.pageRole) ? '' : written
      if (typeof s.district === 'string' && own.toLowerCase().includes(s.district.toLowerCase())) continue
      const both = own ? `${own.replace(/[\s.!]*$/, '.')} ${s.value}` : s.value
      out[s.key] = Number.isInteger(s.max) && [...both].length <= s.max ? both : s.value
      continue
    }
    const place = typeof s.place === 'string' ? s.place.toLowerCase() : ''
    const heading = s.heading ? wordsOf(current(s.heading)) : ''
    const headingHasPlace = place !== '' && heading.includes(place)
    // A button's action words (`cta-action`) replace only a bare "Contact" the writer left.
    if (s.when === 'bare-contact' && !BARE_CONTACT.test(wordsOf(current(s.key)).replace(/[.!]+$/, '')))
      continue
    if (s.when === 'missing') {
      const now = wordsOf(current(s.key))
      const named = (s.offerings ?? []).some((o) => now.includes(String(o).toLowerCase()))
      // Who the offerings serve ("kids and adults"): one of its words in the line is enough.
      const whoWords = String(s.who ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length >= 4)
      const serves = whoWords.length === 0 || whoWords.some((w) => now.includes(w))
      if (
        named &&
        serves &&
        (place === '' || now.includes(place) || headingHasPlace) &&
        (!s.pageRole || !introRoleProblem(now, s.pageRole, s.offerings))
      )
        continue
    }
    // A headline with its key words marked (`[[whole family]]`) gives the marked words: the write takes the marks apart.
    const value = typeof s.marked === 'string' && s.marked !== '' ? s.marked : s.value
    out[s.key] = headingHasPlace && typeof s.short === 'string' && s.short !== '' ? s.short : value
  }
  return out
}

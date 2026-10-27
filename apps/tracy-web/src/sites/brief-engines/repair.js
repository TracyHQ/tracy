/**
 * A second chance for the lines of the template that came back without words.
 *
 * 🔒 A LINE THE FIRST PASS COULD NOT WRITE IS STILL THE TEMPLATE'S COMPANY ON THE CUSTOMER'S PAGE. The planner puts a
 * slot "pending" when the model says no honest line exists, and a pending slot keeps its sample: "Request a quote or
 * book a site survey. Our sales team replies within 24 working hours." on a bakery's contact page, a counter team
 * under the name of a Russian site manager. Asked once more with nothing to hide behind — write a line that states
 * no fact, or say plainly there is none — the model writes most of them (a plain label, a quality taken from the
 * description), and what it will not write is exactly what must not stay: those blocks are taken off the page
 * (`wp-residue.js` `editBlocks`) instead of left wearing another company's name.
 *
 * Only lines worth the question are asked: a "01", a "View all →", a "Contact" is the template's own interface and
 * is no company's.
 */

import { seeder } from '../../lib/seeder.js'
import { plain } from './wp-blocks.js'

/** Whether a sample is the template's interface (a number, an arrow, a one-word label) and no company's words. */
export function isInterface(sample) {
  const text = String(sample).replace(/\s+/g, ' ').trim()
  if (text.length <= 3) return true
  if (/^[\d\s.,:+–—\-→←↑↓/%]+$/.test(text)) return true
  // An arrow or a plus sign is not a word: "View all →" is one label of two words.
  const words = text.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word))
  return words.length <= 2 && text.length <= 14 && !/\p{Lu}.*\p{Lu}/u.test(text)
}

/**
 * `text` cut back to a sentence that ends within `max` characters, or null when no sentence does.
 * @param {string} text
 * @param {number} max
 */
export function fit(text, max) {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const end = Math.max(
    flat.lastIndexOf('. ', max - 1),
    flat.lastIndexOf('! ', max - 1),
    flat.lastIndexOf('? ', max - 1)
  )
  // A sentence of a few letters is a fragment, not an answer.
  return end >= 8 ? flat.slice(0, end + 1) : null
}

const SYSTEM =
  'You finish the words of a website made from a template for a small business. Each line below still holds the ' +
  "template's sample text, written for a large industrial company, because the first pass could not replace it. " +
  'For each line write a replacement for THIS business that follows from the business description alone and states ' +
  'no fact the description does not give: no number, year, price, person, address, award, certificate, client or ' +
  "project. Keep the line's role (a heading stays a short heading, an intro stays a sentence or two) and keep it " +
  'within its maxCharacters characters, in the language named in "language" (a BCP 47 tag), whatever language the ' +
  'description is written in. That language is binding: never infer or switch it from a place, city or country the ' +
  'description names, or from the tone. If the line only makes sense with facts you ' +
  "were not given (a person's name or title, a price, a figure, a certificate), answer null for it. " +
  'Answer with JSON only: {"values": {"<key>": "<text>" or null}}.'

/**
 * The one language the second chance writes in: the language the site is written in (`sourceLanguage`, D10), else its
 * single language, else English, the source edition's (`SOURCE_LOCALE` of the seeder). Always named: "the language of the
 * site" beside a business "in Dubai" was read as Arabic on `tamq-7q-tone-wb` (TCH #1013, 08/10/2026).
 * @param {Record<string, unknown>} site
 * @returns {string}
 */
export function writingLanguage(site) {
  const named = (/** @type {unknown} */ l) => typeof l === 'string' && l !== '' && l !== '*'
  if (named(site?.sourceLanguage)) return /** @type {string} */ (site.sourceLanguage)
  const chosen = (Array.isArray(site?.languages) ? site.languages : []).filter(named)
  if (chosen.length === 1) return /** @type {string} */ (chosen[0])
  return /** @type {string} */ (chosen.find((l) => /^en(?:-|$)/i.test(String(l))) ?? 'en')
}

/**
 * @param {object} input
 * @param {(call: { system: string, input: unknown }) => Promise<string>} input.generate
 * @param {Record<string, unknown>} input.site - the business, as the planners are shown it
 * @param {Array<{ key: string, label?: string, sample: string, maxCharacters: number }>} input.slots
 * @param {boolean} [input.askAll] - ask for lines that look like the template's interface too (a number that is a fact)
 * @returns {Promise<{ texts: Record<string, string>, nulls: Set<string> }>} only keys of `slots`
 */
export async function repairSlots({ generate, site, slots, askAll = false }) {
  // A line the template ships empty has nothing to be replaced; a site refuses words in it.
  const worth = slots.filter((slot) => String(slot.sample ?? '').trim() !== '')
  const asked = askAll ? worth : worth.filter((slot) => !isInterface(slot.sample))
  /** @type {Record<string, string>} */
  const texts = {}
  const nulls = new Set()
  if (asked.length === 0) return { texts, nulls }
  // The customer's tone binds the second pass as it binds the first (`tone.mjs` of the seeder, TCH #1013).
  const { toneRule } = await seeder('tone')
  const answer = await generate({
    system: `${SYSTEM}${toneRule(site?.tone)}`,
    input: {
      language: writingLanguage(site),
      site,
      lines: asked.map((s) => ({
        key: s.key,
        role: s.label ?? '',
        // As a visitor reads it: a sample's "&amp;" teaches the model to write one, and the site escapes it again.
        sample: plain(String(s.sample)),
        maxCharacters: s.maxCharacters
      }))
    }
  })
  const found = /\{[\s\S]*\}/.exec(String(answer))
  if (!found) return { texts, nulls }
  /** @type {any} */
  let parsed
  try {
    parsed = JSON.parse(found[0])
  } catch {
    return { texts, nulls }
  }
  const values = parsed?.values && typeof parsed.values === 'object' ? parsed.values : {}
  for (const slot of asked) {
    if (!(slot.key in values)) continue
    const value = values[slot.key]
    // The word "null" is the model saying null (tamq-7q-bizwp4, 08/10/2026: the footer printed "null" for the hours).
    if (value === null || (typeof value === 'string' && /^(?:null|undefined)$/i.test(value.trim())))
      nulls.add(slot.key)
    else if (typeof value === 'string' && value.trim() !== '') {
      // Plain text: an entity the model wrote is the character it stands for, never an escape to write again.
      const fitted = fit(plain(value), slot.maxCharacters)
      // A line that cannot be made to fit is no line: the block goes rather than keep the template's words.
      if (fitted) texts[slot.key] = fitted
      else nulls.add(slot.key)
    }
  }
  return { texts, nulls }
}

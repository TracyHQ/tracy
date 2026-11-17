// What the plan composer reads of the content brief beside the needs profile (gap audit of the plan stage, 17/11/2026):
// the inputs the step chain's site planner reads in its brief and the build chat's composer did not get. Pure.
//
// - `briefContextOf`: the brief as the composer's model reads it (`brief` of the user message): the key messages the
//   business leads with, who it serves, its voice, and what it keeps off the site with the reason (`missing`). None
//   of it is data the plan may show: the model orders data, chooses blocks and words its labels and reasons by it.
//   A reason that could carry a held value (the held business name, held people) is replaced by a neutral one, and a
//   reason holding any value the brief keeps off the site is too, so no held value reaches the model.
// - `briefLeftOutOf`: what the brief holds that no data kind of the needs profile can carry, so no block of the
//   template form can show it (a WhatsApp number, a second phone, Google's rating; `needs-research.mjs` NO_KIND). The
//   step chain placed these elsewhere on the site; the build chat places WhatsApp and a second phone where the
//   template has a field for them (`plan-composer-channels.mjs`), and the plan card says what still has no place in its
//   left out list instead of losing it in silence. Values are never repeated in the entry.

import { keyMessagesOf } from './plan-composer-intent.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The reason the model reads for a held field whose own reason may name what is held. */
export const NEUTRAL_HELD_REASON = 'Kept off the site until the owner confirms it.'
/** Held fields whose reason names what is held (`whyOf` in `brief-facts.mjs`). */
const NAMING_FIELDS = new Set(['name', 'team'])

/**
 * The left out entries this module writes, each with its own stable code (#575 walk: one shared code kept them in
 * English on a card in another language): the plan card names and says each by its code.
 */
export const BRIEF_LEFT_OUT = Object.freeze({
  whatsapp: {
    what: 'WhatsApp',
    reason: 'This design has no place for a WhatsApp link, so your site does not show it.',
    code: 'no_place_for_whatsapp'
  },
  otherPhones: {
    what: 'Other phone numbers',
    reason: 'This design shows one phone number, so your site shows your main one.',
    code: 'no_place_for_other_phones'
  },
  googleRating: {
    what: 'Google rating',
    reason: 'This design has no place for your Google rating, so your site does not show it.',
    code: 'no_place_for_google_rating'
  }
})
/**
 * Opening hours the brief holds until the owner confirms them (#575 walk: seven hours lines were read and the card said
 * nothing of them): one source alone says open 24 hours every day, or the sources disagree. Never their values.
 */
export const HELD_HOURS_LEFT_OUT = Object.freeze({
  unconfirmed: {
    what: 'Opening hours',
    reason:
      'Only one source gives your opening hours, as open 24 hours every day, so they stay off your site until you confirm them.',
    code: 'hours_unconfirmed'
  },
  disagree: {
    what: 'Opening hours',
    reason: 'Your sources give different opening hours, so they stay off your site until you confirm them.',
    code: 'hours_sources_disagree'
  }
})

/** The held hours entry of the brief, or null when it holds none waiting for the owner. */
export function heldHoursOf(brief) {
  const held = list(brief?.missing).find((m) => m?.field === 'hours')
  if (!held) return null
  if (held.conflicting) return HELD_HOURS_LEFT_OUT.disagree
  const fact = list(brief?.facts).find((f) => f?.field === 'hours')
  return list(fact?.reasons).includes('implausible-all-week-hours') ? HELD_HOURS_LEFT_OUT.unconfirmed : null
}

/** Every value the brief keeps off the site, as text: no reason the model reads may hold one. */
function heldValuesOf(brief) {
  const texts = []
  const add = (v) => {
    if (isText(v)) texts.push(v.trim().toLowerCase())
    else if (v && typeof v === 'object') for (const w of [v.name, v.text, v.url, v.phone]) add(w)
  }
  for (const entry of list(brief?.missing)) {
    for (const v of [...list(entry?.values), ...list(entry?.hours), ...list(entry?.otherNames)]) add(v)
  }
  for (const fact of list(brief?.facts)) if (fact?.onSite === false) add(fact.value)
  return texts.filter((t) => t.length >= 3)
}

function heldOf(brief) {
  const values = heldValuesOf(brief)
  return list(brief?.missing)
    .filter((entry) => isText(entry?.field))
    .map(({ field, why }) => {
      const plain =
        isText(why) && !NAMING_FIELDS.has(field) && !values.some((v) => why.toLowerCase().includes(v))
      return { field, why: plain ? why.trim() : NEUTRAL_HELD_REASON }
    })
}

/**
 * The brief as the composer's model reads it, or null when the brief gives nothing of it.
 * @param {object | null | undefined} brief the content brief the research stored (`wo_revision.brief`)
 * @returns {{keyMessages?: Array<{id: string, label: string}>, audience?: string[], voice?: string, held?: Array<{field: string,
 *   why: string}>} | null}
 */
export function briefContextOf(brief) {
  if (!brief || typeof brief !== 'object') return null
  // Each key message keeps its id (#575): a block names the key messages it carries by id (`plan-intent.mjs`).
  const keyMessages = keyMessagesOf(brief).forModel
  const audience = list(brief.reading?.audience)
    .map((a) => (isText(a) ? a : a?.label))
    .filter(isText)
    .map((a) => a.trim())
  const voice = isText(brief.brand?.voice) ? brief.brand.voice.trim() : null
  const held = heldOf(brief)
  const context = {
    ...(keyMessages.length ? { keyMessages } : {}),
    ...(audience.length ? { audience } : {}),
    ...(voice ? { voice } : {}),
    ...(held.length ? { held } : {})
  }
  return Object.keys(context).length ? context : null
}

/**
 * The left out entries of what the brief holds and no block can show, in the plan's left out shape.
 * @param {object | null | undefined} brief
 * @param {Set<string>} [placed] the brief entries the plan holds as facts already (`plan-composer-channels.mjs`)
 * @returns {Array<{what: string, kind: 'feature', reason: string, code: string}>} with held opening hours last
 */
export function briefLeftOutOf(brief, placed = new Set()) {
  if (!brief || typeof brief !== 'object') return []
  const has = {
    whatsapp:
      !placed.has('whatsapp') &&
      (isText(brief.contact?.whatsapp?.number) || isText(brief.contact?.whatsapp?.href)),
    otherPhones:
      !placed.has('otherPhones') && list(brief.business?.otherPhones).some((p) => isText(p?.phone)),
    googleRating: Number.isFinite(brief.googlePlace?.rating)
  }
  const hours = heldHoursOf(brief)
  return [
    ...Object.entries(BRIEF_LEFT_OUT).filter(([key]) => has[key]),
    ...(hours ? [['hours', hours]] : [])
  ].map(([, entry]) => ({ ...entry, kind: 'feature' }))
}

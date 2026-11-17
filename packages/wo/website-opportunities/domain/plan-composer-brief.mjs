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
//   step chain placed these elsewhere on the site; the build chat cannot yet, so the plan card says so in its left out
//   list instead of losing them in silence. Values are never repeated in the entry.

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** The reason the model reads for a held field whose own reason may name what is held. */
export const NEUTRAL_HELD_REASON = 'Kept off the site until the owner confirms it.'
/** Held fields whose reason names what is held (`whyOf` in `brief-facts.mjs`). */
const NAMING_FIELDS = new Set(['name', 'team'])

/** The code of a left out entry this module writes: a sentence of its own, kept as written by the card. */
export const BRIEF_LEFT_OUT_CODE = 'stated'
export const BRIEF_LEFT_OUT = Object.freeze({
  whatsapp: {
    what: 'WhatsApp',
    reason: 'This design has no place for a WhatsApp link, so your site does not show it.'
  },
  otherPhones: {
    what: 'Other phone numbers',
    reason: 'This design shows one phone number, so your site shows your main one.'
  },
  googleRating: {
    what: 'Google rating',
    reason: 'This design has no place for your Google rating, so your site does not show it.'
  }
})

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
 * @returns {{keyMessages?: string[], audience?: string[], voice?: string, held?: Array<{field: string,
 *   why: string}>} | null}
 */
export function briefContextOf(brief) {
  if (!brief || typeof brief !== 'object') return null
  const keyMessages = list(brief.keyMessages)
    .filter((m) => isText(m?.label))
    .map((m) => (m.basis === 'praise' ? `Customers praise: ${m.label.trim()}` : m.label.trim()))
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
 * @returns {Array<{what: string, kind: 'feature', reason: string, code: string}>}
 */
export function briefLeftOutOf(brief) {
  if (!brief || typeof brief !== 'object') return []
  const has = {
    whatsapp: isText(brief.contact?.whatsapp?.number) || isText(brief.contact?.whatsapp?.href),
    otherPhones: list(brief.business?.otherPhones).some((p) => isText(p?.phone)),
    googleRating: Number.isFinite(brief.googlePlace?.rating)
  }
  return Object.entries(BRIEF_LEFT_OUT)
    .filter(([key]) => has[key])
    .map(([, entry]) => ({ ...entry, kind: 'feature', code: BRIEF_LEFT_OUT_CODE }))
}

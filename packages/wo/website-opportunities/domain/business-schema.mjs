// The site's one LocalBusiness record for search engines (spec TracyHQ/tracy#189, criterion 8.5, R12 group G). Pure and CMS
// neutral; facts of the brief only.
//
// 🔒 WRITTEN ONCE FOR THE WHOLE SITE, FROM BRIEF FACTS ONLY. `place-seo.mjs` gives the name, phone, address and area served;
// this adds what a search engine reads beside them:
//
//   @type         the trade's schema.org subtype (a gym is an ExerciseGym, a dentist a Dentist), else LocalBusiness
//   openingHours  the brief's hours as schema.org day ranges ("Mo 09:00-17:00"); a line that cannot be read is left out,
//                 never guessed
//   sameAs        the business's own profile links the brief holds (its socials, its own website)
//   url           the site's own address, given by the writer that knows it (`withSiteUrl`)
//
// No field the brief does not hold is written: no rating, no price range, no geo point.

/** The schema.org subtype of each trade, and of a sub-trade when it is more exact. */
const TRADE_TYPES = Object.freeze({
  food: 'Restaurant',
  beauty: 'BeautySalon',
  health: 'MedicalBusiness',
  fitness: 'SportsActivityLocation',
  hospitality: 'LodgingBusiness',
  travel: 'TravelAgency',
  professional: 'ProfessionalService',
  retail: 'Store',
  auto: 'AutomotiveBusiness',
  home: 'HomeAndConstructionBusiness'
})
const SUB_TRADE_TYPES = Object.freeze({
  'fitness/gym': 'ExerciseGym',
  'fitness/studio': 'ExerciseGym',
  'beauty/spa': 'DaySpa',
  'beauty/barber': 'HairSalon',
  'beauty/salon': 'BeautySalon',
  'health/dentist': 'Dentist',
  'health/clinic': 'MedicalClinic',
  'health/vet': 'VeterinaryCare',
  'health/pharmacy': 'Pharmacy'
})

const DAYS = Object.freeze({
  monday: 'Mo',
  tuesday: 'Tu',
  wednesday: 'We',
  thursday: 'Th',
  friday: 'Fr',
  saturday: 'Sa',
  sunday: 'Su'
})

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''

/** The schema.org type of a business: its sub-trade's, else its trade's, else LocalBusiness. */
export function schemaTypeOf(business) {
  const trade = String(business?.trade ?? '')
  const subTrade = String(business?.subTrade?.id ?? '')
  return SUB_TRADE_TYPES[`${trade}/${subTrade}`] ?? TRADE_TYPES[trade] ?? 'LocalBusiness'
}

/** "9:00 AM" or "21:30" as "09:00" / "21:30"; null when it is no time. */
function clock(text) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(
    String(text)
      .trim()
      .replace(/\u202f|\u00a0/g, ' ')
  )
  if (!m) return null
  let hour = Number(m[1])
  const minute = Number(m[2] ?? 0)
  const half = m[3]?.toLowerCase()
  if (half === 'pm' && hour < 12) hour += 12
  if (half === 'am' && hour === 12) hour = 0
  if (hour > 24 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * One hours line ("Monday: 9:00 AM – 5:00 PM, 6:00 PM – 9:00 PM", "Sunday: Closed", "Friday: Open 24 hours") as
 * schema.org day ranges; [] for a closed day or a line that cannot be read.
 * @param {string} line
 * @returns {string[]}
 */
export function openingHoursOf(line) {
  const m = /^\s*([A-Za-z]+)\s*:\s*(.+)$/.exec(String(line ?? ''))
  const day = m ? DAYS[m[1].toLowerCase()] : null
  if (!day) return []
  const said = m[2].trim()
  if (/^open 24 hours$/i.test(said)) return [`${day} 00:00-23:59`]
  const out = []
  for (const range of said.split(/\s*,\s*/)) {
    const parts = range.split(/\s*[\u2013\u2014-]\s*|\s+to\s+/i)
    if (parts.length !== 2) return []
    // "1:00 – 5:00 PM": the first time takes the second's half of the day when it says none, unless that puts it after the
    // end ("9:00 – 1:00 PM" is a morning start).
    const half = /\b(am|pm)\s*$/i.exec(parts[1])?.[1] ?? ''
    const to = clock(parts[1])
    let from = clock(/\b(am|pm)\s*$/i.test(parts[0]) ? parts[0] : `${parts[0]} ${half}`.trim())
    if (from && to && from > to && !/\b(am|pm)\s*$/i.test(parts[0])) from = clock(parts[0])
    if (!from || !to) return []
    out.push(`${day} ${from}-${to}`)
  }
  return out
}

/** The business's own profile links: its socials and its own website, each an absolute http(s) address, once. */
export function sameAsOf(business) {
  const links = [...Object.values(business?.socials ?? {}), business?.website]
  return [...new Set(links.filter((l) => nonEmpty(l) && /^https?:\/\//i.test(l.trim())).map((l) => l.trim()))]
}

/**
 * The site's LocalBusiness record: the place record of `place-seo.mjs` with the trade's type, the opening hours and the
 * owner's profile links.
 * @param {any} brief
 * @param {Record<string, any> | null} place - `placeSeoOf(...).schema`
 * @returns {Record<string, any> | null}
 */
export function businessSchemaOf(brief, place) {
  if (!place) return null
  const business = brief?.business ?? {}
  const hours = (Array.isArray(business.hours) ? business.hours : []).flatMap(openingHoursOf)
  const sameAs = sameAsOf(business)
  return {
    ...place,
    '@type': schemaTypeOf(business),
    ...(hours.length > 0 ? { openingHours: hours } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {})
  }
}

/**
 * The record as the site prints it: its own address as `url`, when the writer knows it.
 * @param {Record<string, any> | null} schema
 * @param {string | null} origin - the site's public address
 */
export function withSiteUrl(schema, origin) {
  if (!schema) return null
  const url = nonEmpty(origin) ? `${origin.trim().replace(/\/+$/, '')}/` : null
  return url ? { ...schema, url } : { ...schema }
}

/** The record as one JSON-LD script, its `<` escaped so no value closes the script. */
export function schemaScript(schema) {
  return `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`
}

// A dated event is not a service, but a dated offer is (#609, a real run): a monthly show listed with its next date and
// a certificate clinic of a past year both became services of the plan. The business reading's prompt says so too, but
// a prompt is a request and this is the rule. Pure: a service or package is dropped from the needs profile with a
// typed reason (the profile has no item kind for events or news) when
//   - `past`: a date or a year its words carry is before the research was made (`research.madeAt`), except a year the
//     business started in ("since 2001", "established in 1998");
//   - `event_section`: its name holds an event word (show, performance, event, recap, fight night, gala, tournament)
//     and it was read from a page of a news, blog or events section;
//   - `one_off`: its words carry a date ("November 21", "March 3, 2027") and no word of an offer (course, class,
//     programme, workshop, series, membership, ...): one dated occurrence.
// A course, class, programme or membership that names when it starts ("starts March 3", "next intake May 2027",
// "from 12 January") and is not in the past stays a service, as does one that only says how long it runs. A date
// written without a year is taken as its next occurrence, so it is never in the past.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DAY = '([12]\\d|3[01]|0?[1-9])(?:st|nd|rd|th)?'
const RANGE = `(?:\\s*-\\s*(?:[12]\\d|3[01]|0?[1-9]))?`
const YEAR_AFTER = '(?:,?\\s+((?:19|20)\\d{2}))?'
/** Date patterns, each giving `{year, month, day}` from its match (a missing part is null). */
const DATES = [
  [new RegExp(`\\b${MONTH}\\.?\\s+${DAY}${RANGE}\\b${YEAR_AFTER}`, 'giu'), (m) => [m[3], m[1], m[2]]],
  [new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH}\\b${YEAR_AFTER}`, 'giu'), (m) => [m[3], m[2], m[1]]],
  [new RegExp(`\\b${MONTH}\\.?,?\\s+((?:19|20)\\d{2})\\b`, 'giu'), (m) => [m[2], m[1], null]],
  [/\b((?:19|20)\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/gu, (m) => [m[1], m[2], m[3]]],
  [/\b(0?[1-9]|[12]\d|3[01])[/.](0?[1-9]|1[0-2])[/.]((?:19|20)\d{2})\b/gu, (m) => [m[3], m[2], m[1]]]
]
const YEAR = /\b(?:19|20)\d{2}\b/gu
/** Words before a year that make it the year the business started, not the date of an event. */
const STARTED = /\b(?:since|established|est\.?|founded|opened)\s+(?:in\s+)?$/iu
const EVENT_WORDS = /\b(?:shows?|performances?|events?|recaps?|fight\s+nights?|galas?|tournaments?)\b/iu
const EVENT_SECTION = /\/(?:events?|news|blog|posts?|recaps?)(?:-\d+)?(?:\/|$)/iu
const OFFER_WORDS =
  /\b(?:courses?|class(?:es)?|programmes?|programs?|workshops?|series|memberships?|lessons?|sessions?|training|camps?|clinics?|coaching|packages?|plans?|subscriptions?|intakes?|terms?)\b/iu

export const DATED_EVENT_CODE = 'service_is_dated_event'
export const DATED_EVENT_REASONS = Object.freeze({
  past: 'a dated event, not a service: its date or year is before the research was made',
  event_section: 'an event, not a service: an event word in its name, read from a news, blog or events page',
  one_off: 'a dated event, not a service: one dated occurrence, with no word of a course, class or membership'
})

/** When the research was made (`research.madeAt`), in milliseconds, or null when unknown. */
export function researchTimeOf(research) {
  const at = Date.parse(String(research?.madeAt ?? ''))
  return Number.isFinite(at) ? at : null
}

const monthIndex = (word) =>
  /^\d+$/.test(word) ? Number(word) - 1 : MONTHS.indexOf(word.slice(0, 3).toLowerCase())

/** The dates `text` writes, each `{end}`: the first moment after it (null when it has no year), and where it stands. */
function datesIn(text) {
  const found = []
  for (const [pattern, parts] of DATES)
    for (const m of text.matchAll(pattern)) {
      if (found.some((f) => m.index < f.to && f.from < m.index + m[0].length)) continue
      const [year, month, day] = parts(m)
      const y = year ? Number(year) : null
      const mo = monthIndex(month)
      const end = y === null ? null : day ? Date.UTC(y, mo, Number(day) + 1) : Date.UTC(y, mo + 1, 1)
      found.push({ end, from: m.index, to: m.index + m[0].length })
    }
  return found
}

/** Whether `text` holds a year before `at`, outside the dates already read and not the year the business started. */
function pastYearIn(text, dates, at) {
  for (const m of text.matchAll(YEAR)) {
    if (dates.some((d) => m.index >= d.from && m.index < d.to)) continue
    if (Date.UTC(Number(m[0]) + 1, 0, 1) <= at && !STARTED.test(text.slice(0, m.index))) return true
  }
  return false
}

/** The page path of a link, lower case, or ''. */
const pathOf = (page) => {
  try {
    return new URL(String(page)).pathname.toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Why an offer is a dated event (a key of `DATED_EVENT_REASONS`), or null when it is not one.
 * @param {{name?: string, evidence?: string, page?: string | null}} offer its name, its quote and the page it was read on
 * @param {{at?: number | null}} [made] when the research was made, in milliseconds (`researchTimeOf`)
 */
export function datedEventOf({ name = '', evidence = '', page = null } = {}, { at = null } = {}) {
  const words = [name, evidence].filter((w) => typeof w === 'string' && w.trim() !== '').join('\n')
  const dates = datesIn(words)
  if (
    Number.isFinite(at) &&
    (dates.some((d) => d.end !== null && d.end <= at) || pastYearIn(words, dates, at))
  )
    return 'past'
  if (EVENT_WORDS.test(String(name)) && EVENT_SECTION.test(pathOf(page))) return 'event_section'
  if (dates.length && !OFFER_WORDS.test(words)) return 'one_off'
  return null
}

/** The drop record of a dated event. */
export const datedEventDrop = (why, what) => ({
  ...what,
  code: DATED_EVENT_CODE,
  reason: DATED_EVENT_REASONS[why],
  scope: 'observation'
})

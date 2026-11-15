// The opening hours of the plan as the customer reads them (#609, sixth real run): the hours fact keeps its value in
// the structured form the hours reader writes (`Mo-Fr 06:00-21:00; Sa 08:00-16:00`, `owner-hours.mjs`), and the plan
// card showed that machine form. Code now writes a display form from the structure, with a stable code and parameters
// so the card can say the day names in the customer's language:
//   display "Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00"
//   code    opening_hours
//   params  {groups: 2, from1: 'mo', to1: 'fr', hours1: '06:00-21:00', from2: 'sa', to2: 'sa', hours2: '08:00-16:00'}
// `hoursN` is `closed` for a day said to be closed, and two ranges of one day are joined by a comma. The structure is
// read by the hours reader the value is written for (`opening-hours.mjs weekOf`). The strict splitter of #615
// (`schedule-parts.mjs splitOnePart`) is not used: it reads a lone two letter day (`Sa 08:00-16:00`) as no day, by
// design for schedule rows. A value that does not read as a week gets no display form: the card shows it as it is. Pure.
import { weekOf } from './opening-hours.mjs'

/** The code of the display form of opening hours. */
export const OPENING_HOURS_CODE = 'opening_hours'
/** The data kind whose facts get a display form. */
export const HOURS_KIND = 'contact.hours'

const DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
const DAY_NAMES = Object.freeze({
  mo: 'Monday',
  tu: 'Tuesday',
  we: 'Wednesday',
  th: 'Thursday',
  fr: 'Friday',
  sa: 'Saturday',
  su: 'Sunday'
})

const clock = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
/** `360-1260,1320-1380` -> `06:00-21:00,22:00-23:00`; `closed` stays. */
const hoursOf = (value) =>
  value === 'closed'
    ? 'closed'
    : value
        .split(',')
        .map((range) => range.split('-').map(Number).map(clock).join('-'))
        .join(',')
const spoken = (time) => time.replace(/^0(\d)/, '$1')
const hoursWords = (hours) =>
  hours === 'closed'
    ? 'closed'
    : hours
        .split(',')
        .map((range) => range.split('-').map(spoken).join(' to '))
        .join(' and ')

/**
 * The groups of following days with the same hours, in week order: `[{from, to, hours}]`, or null when the value does
 * not read as a week.
 * @param {string} value the fact's value, lines joined by `; `
 */
export function hoursGroupsOf(value) {
  if (typeof value !== 'string') return null
  const week = weekOf(value.split(/\s*;\s*/).filter(Boolean))
  if (!week || week.size === 0) return null
  const groups = []
  for (const day of DAYS) {
    if (!week.has(day)) continue
    const hours = hoursOf(week.get(day))
    const last = groups.at(-1)
    if (last && last.hours === hours && DAYS.indexOf(last.to) === DAYS.indexOf(day) - 1) last.to = day
    else groups.push({ from: day, to: day, hours })
  }
  return groups
}

/** The display form of an hours value with its code and parameters, or null when the value does not read. */
export function hoursDisplayOf(value) {
  const groups = hoursGroupsOf(value)
  if (!groups) return null
  const params = { groups: groups.length }
  const parts = groups.map(({ from, to, hours }, i) => {
    Object.assign(params, { [`from${i + 1}`]: from, [`to${i + 1}`]: to, [`hours${i + 1}`]: hours })
    const days = from === to ? DAY_NAMES[from] : `${DAY_NAMES[from]} to ${DAY_NAMES[to]}`
    return `${days}, ${hoursWords(hours)}`
  })
  return { display: parts.join('; '), code: OPENING_HOURS_CODE, params }
}

/**
 * A plan fact with the display form of its value when it is opening hours that read, else the fact without one (a
 * value changed on the plan card is shown again from its new value, or as typed).
 */
export function withHoursDisplay(fact) {
  if (fact?.kind !== HOURS_KIND) return fact
  const { display: _display, code: _code, params: _params, ...rest } = fact
  const shown = hoursDisplayOf(fact.value)
  return shown ? { ...rest, ...shown } : rest
}

// Which field of a schedule row each part fills (ticket #615). A list row with two schedule fields shows the days in
// the first and the times in the second (the needs profile prompt asks the parts in that order). One detector tells
// each part day like, time like, mixed or neither, and every step uses it: the plan's fit (`plan-rows-fit.mjs`), the
// page writer (`page-writer-rows.mjs`), the coverage (`plan-row-coverage.mjs`), and the test of the prompt's examples.
// A time is never written into the days field and a day never into the times field. Pure.
//
// - Day like: a day name or a span of days in English, French, German, Spanish, Italian or Portuguese (`Mon`, `Tue and
//   Thu`, `Lundi`, `Montag`), `daily`, `weekends`.
// - Time like: `18:00`, `7.30`, `18h30`, `20h`, `6 pm`, `18 Uhr`, `noon`, `midnight`, `9 to 5`.
// - A row of one part that is time like fills the times and leaves the days to their no-data rule; one that is mixed
//   is split when the days come first and the times after (`Mon to Fri 9:00 to 17:00`), else the row is not shown
//   (`row_parts_order`). A row of two parts must be days then times.

export const SCHEDULE_KINDS = Object.freeze(['offering.schedule'])

const DAY_WORDS = [
  'mon(?:day)?s?',
  'tue(?:s|sday)?s?',
  'wed(?:nesday)?s?',
  'thu(?:r|rs|rsday)?s?',
  'fri(?:day)?s?',
  'sat(?:urday)?s?',
  'sun(?:day)?s?',
  'weekdays?',
  'weekends?',
  'daily',
  'every ?day',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
  'montag',
  'dienstag',
  'mittwoch',
  'donnerstag',
  'freitag',
  'samstag',
  'sonntag',
  'lunes',
  'martes',
  'mi[eé]rcoles',
  'jueves',
  'viernes',
  's[aá]bado',
  'domingo',
  'luned[iì]',
  'marted[iì]',
  'mercoled[iì]',
  'gioved[iì]',
  'venerd[iì]',
  'sabato',
  'domenica',
  'segunda',
  'ter[cç]a',
  'quarta',
  'quinta',
  'sexta'
]
const DAY = new RegExp(`(?<!\\p{L})(?:${DAY_WORDS.join('|')})(?!\\p{L})`, 'iu')
const TIME_FORMS = [
  '\\d{1,2}[:.h]\\d{2}(?!\\d)',
  '\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)(?!\\p{L})',
  '\\d{1,2}\\s*h(?!\\p{L})',
  '\\d{1,2}\\s*uhr(?!\\p{L})',
  '(?<!\\p{L})(?:noon|midnight|midi|minuit|mittag|mitternacht)(?!\\p{L})',
  '(?<![\\d.,])\\d{1,2}\\s*(?:-|to|until|till|\\u00e0|bis|a)\\s*\\d{1,2}(?![\\d.,:]|\\s*(?:%|\\p{L}))'
]
const TIME = new RegExp(TIME_FORMS.join('|'), 'iu')

/** What a part of a schedule row holds: `'day'`, `'time'`, `'mixed'` (both) or `'other'`. */
export function partKindOf(part) {
  const day = DAY.test(String(part))
  const time = TIME.test(String(part))
  return day && time ? 'mixed' : day ? 'day' : time ? 'time' : 'other'
}

/** A mixed part split into its days and its times when the days come first and the times after, else null. */
export function splitMixedPart(part) {
  const text = String(part)
  const at = TIME.exec(text)?.index
  if (at === undefined || at === 0) return null
  const days = text.slice(0, at).replace(/[\s,;:]+$/u, '')
  const times = text.slice(at).trim()
  return partKindOf(days) === 'day' && partKindOf(times) === 'time' ? [days, times] : null
}

/**
 * The parts of a schedule row placed for a list with two schedule fields: `[days, times]`, either one undefined when
 * the row lacks it, or null when the parts cannot be placed without a day in the times or a time in the days.
 */
export function daysAndTimesOf(parts) {
  if (parts.length === 1) {
    const kind = partKindOf(parts[0])
    if (kind === 'time') return [undefined, parts[0]]
    if (kind === 'mixed') return splitMixedPart(parts[0])
    return [parts[0]]
  }
  if (parts.length !== 2) return parts
  const [first, second] = parts.map(partKindOf)
  return ['day', 'other'].includes(first) && ['time', 'other'].includes(second) ? parts : null
}

/**
 * The parts of `kind` a row fills its fields of that kind with, in field order: a schedule kind with two fields is
 * placed by `daysAndTimesOf`; any other kind keeps its parts. Null when a schedule row cannot be placed.
 * @param {string} kind a data kind
 * @param {string[]} parts the row's parts of that kind
 * @param {object[]} fields the list's fields (those of `kind` that hold a part are counted, a `textOf` field is not)
 */
export function rowPartsOf(kind, parts, fields) {
  const own = fields.filter((f) => f?.kind === kind && f?.textOf === undefined && f?.type !== 'design')
  if (!SCHEDULE_KINDS.includes(kind) || own.length !== 2 || !Array.isArray(parts)) return parts
  return daysAndTimesOf(parts)
}

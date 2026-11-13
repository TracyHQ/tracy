// Which field of a schedule row each part fills (ticket #615). A list row with two schedule fields shows the days in
// the first and the times in the second (the needs profile prompt asks the parts in that order). One detector tells
// each part day like, time like, mixed or neither, and every step uses it: the plan's fit (`plan-rows-fit.mjs`), the
// page writer (`page-writer-rows.mjs`), the coverage (`plan-row-coverage.mjs`), and the test of the prompt's examples.
// A time is never written into the days field and a day never into the times field. Pure.
//
// - Day like: a day name or a span of days in English, French, German, Spanish, Italian or Portuguese (`Mon`, `Tue and
//   Thu`, `Lundi`, `Montag`), its three letter form (`Lun-Ven`, `Gio`, `Seg`), `daily`, `weekends`; two letter and one
//   letter forms only in a group joined by a hyphen, a slash, an ampersand, a comma or a word such as `and`
//   (`Mo-Fr`, `Tu & Th`, `M/W/F`, `Di, Do`).
// - Time like: `18:00`, `7.30`, `18h30`, `20h`, `6 pm`, `18 Uhr`, `noon`, `midnight`, `9 to 5`, `10-12` (hyphen or en
//   dash). An age range (`Kids 6 to 12`, `ages 6 to 12`) is not a time.
// - A row of one part that is time like fills the times and leaves the days to their no-data rule; one that is day
//   like fills the days; one that is mixed is split when the days come first and the times after (`Mon to Fri 9:00
//   to 17:00`); a mixed part whose times come first is not shown (`row_parts_order`), and a part the detector cannot
//   read as days or times, or a mixed one it cannot split, is never guessed into a field (`row_part_unclear`). A row
//   of two parts must be days then times.

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
// Three letter forms of the languages above that the full names do not already cover (`mon`, `tue` and so on do).
const SHORT_DAYS = [
  'lun',
  'mar',
  'mer',
  'mi[eé]',
  'jeu',
  'jue',
  'gio',
  'ven',
  'vie',
  'sam',
  's[aá]b',
  'dim',
  'dom'
]
const PT_SHORT_DAYS = ['seg', 'ter', 'qua', 'qui', 'sex']
// Two and one letter forms (English, German): a day only in a group of days.
const GROUP_ONLY_DAYS = [
  'mo',
  'tu',
  'we',
  'th',
  'fr',
  'sa',
  'su',
  'di',
  'mi',
  'do',
  'so',
  'm',
  't',
  'w',
  'r',
  'f',
  's'
]
const ONE_DAY = [...DAY_WORDS, ...SHORT_DAYS, ...PT_SHORT_DAYS].join('|')
const ANY_DAY = `(?:${[ONE_DAY, ...GROUP_ONLY_DAYS].join('|')})\\.?(?!\\p{L})`
const GROUP_JOIN = '\\s*(?:[-/&+,\\u2013]|and|to|et|und|bis|au)\\s*'
const DAY = new RegExp(`(?<!\\p{L})(?:(?:${ONE_DAY})(?!\\p{L})|${ANY_DAY}(?:${GROUP_JOIN}${ANY_DAY})+)`, 'iu')
// A number range right after one of these words is an age range, not a time.
const AGE_WORDS =
  'kids|ages?|aged|child(?:ren)?|juniors?|teens?|years?|yrs|enfants|kinder|ni[nñ]os|bambini|crian[cç]as'
const TIME_FORMS = [
  '\\d{1,2}[:.h]\\d{2}(?!\\d)',
  '\\d{1,2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?)(?!\\p{L})',
  '\\d{1,2}\\s*h(?!\\p{L})',
  '\\d{1,2}\\s*uhr(?!\\p{L})',
  '(?<!\\p{L})(?:noon|midnight|midi|minuit|mittag|mitternacht)(?!\\p{L})',
  `(?<!(?:${AGE_WORDS})\\s*)(?<![\\d.,])\\d{1,2}\\s*(?:-|\\u2013|to|until|till|\\u00e0|bis|a)\\s*\\d{1,2}(?![\\d.,:]|\\s*(?:%|\\p{L}))`
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
 * the row lacks it, or null when the parts cannot be placed without a day in the times, a time in the days or a
 * guess (`unplacedCodeOf` says why).
 */
export function daysAndTimesOf(parts) {
  if (parts.length === 1) {
    const kind = partKindOf(parts[0])
    if (kind === 'time') return [undefined, parts[0]]
    if (kind === 'day') return [parts[0]]
    if (kind === 'mixed') return splitMixedPart(parts[0])
    return null
  }
  if (parts.length !== 2) return parts
  const [first, second] = parts.map(partKindOf)
  return ['day', 'other'].includes(first) && ['time', 'other'].includes(second) ? parts : null
}

/**
 * Why `daysAndTimesOf` placed no parts: `row_parts_order` when a time comes before the days, `row_part_unclear` when
 * a single part reads as neither days nor times, or as both in a way that cannot be split.
 */
export function unplacedCodeOf(parts) {
  if (parts.length !== 1) return 'row_parts_order'
  const text = String(parts[0])
  return partKindOf(text) === 'mixed' && TIME.exec(text)?.index === 0 ? 'row_parts_order' : 'row_part_unclear'
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

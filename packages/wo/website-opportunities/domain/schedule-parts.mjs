// Which field of a schedule row each part fills (ticket #615): days first, times second, for the plan's fit, the page
// writer and the coverage. A ONE PART row is split only when the WHOLE text is DAYS, one separator (space, colon, comma
// or spaced dash), then TIMES: DAYS is one day group (`isDayGroup`, `schedule-days.mjs`), TIMES one clock time or one
// range of two, with its units and an optional leading word kept with it (`Mo-Fr ab 18 Uhr`, `Sat 9 - noon`). The cut
// is then checked: no digit or time word in the days, no day, comma or `and` in the times. Anything else stays whole
// and unchanged: in the times when it holds a digit, else in the days (`Mon-Fri 9-5, Sat 10-2`, `By appointment`).
// Only a value over its field's limit drops the row. A TWO PART row must be days then times (`row_parts_order`).
import { hasDays, isDayGroup } from './schedule-days.mjs'

export const SCHEDULE_KINDS = Object.freeze(['offering.schedule'])

// A number range right after one of these words is an age range, not a time.
const AGE_WORDS =
  'kids|ages?|aged|child(?:ren)?|juniors?|teens?|years?|yrs|enfants|kinder|ni[n\\u00f1]os|bambini|crian[c\\u00e7]as'
const UNIT = '\\s*(?:a\\.?m\\.?|p\\.?m\\.?|uhr|h)(?!\\p{L})'
// An hour with minutes or a unit (`9:00`, `7.30 pm`, `18h30`, `9h`, `22 Uhr`).
const TIMED = `(?:\\d{1,2}[:.h]\\d{2}(?:${UNIT})?|\\d{1,2}${UNIT})`
const BARE = '\\d{1,2}(?![\\d:.])'
const SEP = '\\s*(?:-|\\u2013|(?:until|till|thru|through|to|bis|\\u00e0s|\\u00e0|alle|al|as|a)(?!\\p{L}))\\s*'
const TIME_FORMS = [
  // A range with a unit or minutes on either end, as one expression.
  `(?<![\\d.,:])(?:${TIMED}${SEP}(?:${TIMED}|${BARE})|${BARE}${SEP}${TIMED})`,
  // A bare number range, not after an age word and not followed by a word or a percent.
  `(?<!(?:${AGE_WORDS})\\s*)(?<![\\d.,:])\\d{1,2}${SEP}\\d{1,2}(?![\\d.,:]|\\s*(?:%|\\p{L}))`,
  `(?<![\\d.,:])${TIMED}`,
  '(?<!\\p{L})(?:noon|midnight|midi|minuit|mittag|mitternacht)(?!\\p{L})'
]
const TIME = new RegExp(TIME_FORMS.join('|'), 'iu')
/** What a part of a schedule row holds: `'day'`, `'time'`, `'mixed'` (both) or `'other'`. */
export function partKindOf(part) {
  const day = hasDays(part)
  const time = TIME.test(String(part))
  return day && time ? 'mixed' : day ? 'day' : time ? 'time' : 'other'
}

// The strict grammar of a one part row: DAYS, one separator, TIMES, nothing else (see the header).
const HOUR = '(?:[01]?\\d|2[0-4])'
const MIN = '[0-5]\\d'
const UNITS = 'a\\.?\\s?m\\.?|p\\.?\\s?m\\.?|uhr|hrs?|h|noon|midnight'
const CLOCK_WORDS =
  'noon|midnight|midi|minuit|mittag|mitternacht|mediod[i\\u00ed]a|medianoche|mezzogiorno|mezzanotte|meio-dia|meia-noite'
const CLOCK = `(?:(?:${HOUR}(?:[:.]${MIN}|\\s?h\\s?${MIN})?|(?:[01]\\d|2[0-4])${MIN})(?:\\s*(?:${UNITS}))?|${CLOCK_WORDS})`
const RANGE = '\\s*[-\\u2013]\\s*|\\s+(?:to|till|until|thru|through|bis|\\u00e0|\\u00e0s|as|a|ao|al|alle)\\s+'
const LINK = [
  "from|at|until|till|after|before|ab|bis|um|von|\\u00e0 partir de|d\\u00e8s|jusqu['\\u2019]\\u00e0|de|des|das|da",
  'desde(?: las)?|hasta(?: las)?|a partir de(?: las)?|de las|a partir das|at\\u00e9|dalle(?: ore)?|alle(?: ore)?|ore',
  'fino alle'
].join('|')
const TIMES = new RegExp(`^(?:(?:${LINK})\\s+)?${CLOCK}(?:(?:${RANGE})${CLOCK})?$`, 'iu')
const CUT = /\s*[:,]\s*|\s+[-\u2013]\s+|\s+/gu
const TIME_WORD = new RegExp(`(?<!\\p{L})(?:${CLOCK_WORDS}|a\\.?m|p\\.?m|uhr)(?!\\p{L})`, 'iu')
const LONE_TWO_LETTER_DAY = /(?<!\p{L})(?:mo|tu|we|th|fr|sa|su|di|mi|do|so)\.?(?!\p{L})/iu
const JOINER = /[,;&+]|\s(?:and|und|et|y|e|plus)\s/iu

/** Whether a cut passes the check made after it: days without a time, times without a day or a second time. */
const cutHolds = (days, times) =>
  isDayGroup(days) &&
  !/\d/u.test(days) &&
  !TIME_WORD.test(days) &&
  !hasDays(times) &&
  !LONE_TWO_LETTER_DAY.test(times) &&
  !JOINER.test(times)

/** A one part row split by the strict grammar into `[days, times]`, else null (the row is then kept whole). */
export function splitOnePart(part) {
  const text = String(part).trim()
  for (const sep of text.matchAll(CUT)) {
    const days = text.slice(0, sep.index)
    const times = text.slice(sep.index + sep[0].length)
    if (days && TIMES.test(times) && cutHolds(days, times)) return [days, times]
  }
  return null
}

/**
 * The parts of a schedule row placed for a list with two schedule fields: `[days, times]`, either one undefined when
 * the row lacks it. A row of one part is always placed (split cleanly, or kept whole in one field); a row of two
 * parts is null when its times come before its days (`row_parts_order`).
 */
export function daysAndTimesOf(parts) {
  if (parts.length === 1) {
    const split = splitOnePart(parts[0])
    if (split) return split
    return /\d/u.test(String(parts[0])) ? [undefined, parts[0]] : [parts[0]]
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

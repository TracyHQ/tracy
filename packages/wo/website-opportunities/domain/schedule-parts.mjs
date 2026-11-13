// Which field of a schedule row each part fills (ticket #615). A list row with two schedule fields shows the days in
// the first and the times in the second (the needs profile prompt asks the parts in that order). One detector tells
// each part day like, time like, mixed or neither, and every step uses it: the plan's fit (`plan-rows-fit.mjs`), the
// page writer (`page-writer-rows.mjs`), the coverage (`plan-row-coverage.mjs`), and the test of the prompt's examples.
//
// The rule: NEVER LOSE A REAL SCHEDULE AND NEVER CUT INSIDE A RANGE.
//
// - Day like: `schedule-days.mjs` (day names and spans, daily, weekday and weekend words, short forms in groups).
// - Time like: one time expression, `18:00`, `7.30`, `18h30`, `20h`, `6 pm`, `18 Uhr`, `noon`, `midnight`, or an hour
//   range with its unit, read as ONE expression: `9 to 5`, `10-12`, `7 bis 22 Uhr`, `9-18h`, `9-5 pm`, `6 - 7.30 pm`,
//   `9 a 13 h`, `9h-18h` (hyphen or en dash). An age range (`Kids 6 to 12`, `ages 6 to 12`) is not a time.
// - A row of one part is split into days and times only when the cut is clean: the text before the first whole time
//   expression reads as days and the text from it on reads as times (`Mo-Fr 7 bis 22 Uhr`, `Tue & Thu 6 - 7.30 pm`).
//   A connecting word left at the end of the days (`de`, `from`, `von`) goes with the times.
// - A row of one part that cannot be split cleanly is kept whole: in the times field when it holds a time expression
//   (`Do 18 Uhr`, `18:00 Mon`), else in the days field (`By appointment`, `24/7`, a lone `Do`). Only a value longer
//   than its field drops the row (`row_value_over_limit`, `plan-rows-fit.mjs`).
// - A row of two parts must be days then times; times before days is not shown (`row_parts_order`).
import { hasDays } from './schedule-days.mjs'

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
// A connecting word between the days and the times, moved to the times on a split.
const LEAD_WORD = new RegExp('\\s+(?:from|von|ab|de|des|d\\u00e8s|desde|dalle|dalle ore|das|da)$', 'iu')

/** What a part of a schedule row holds: `'day'`, `'time'`, `'mixed'` (both) or `'other'`. */
export function partKindOf(part) {
  const day = hasDays(part)
  const time = TIME.test(String(part))
  return day && time ? 'mixed' : day ? 'day' : time ? 'time' : 'other'
}

/** A mixed part cut cleanly into its days and its times (days before the whole first time expression), else null. */
export function splitMixedPart(part) {
  const text = String(part)
  const at = TIME.exec(text)?.index
  if (at === undefined || at === 0) return null
  let days = text.slice(0, at).replace(/[\s,;:]+$/u, '')
  let times = text.slice(at).trim()
  const lead = LEAD_WORD.exec(days)
  if (lead) {
    days = days.slice(0, lead.index).replace(/[\s,;:]+$/u, '')
    times = `${lead[0].trim()} ${times}`
  }
  return partKindOf(days) === 'day' && partKindOf(times) === 'time' ? [days, times] : null
}

/**
 * The parts of a schedule row placed for a list with two schedule fields: `[days, times]`, either one undefined when
 * the row lacks it. A row of one part is always placed (split cleanly, or kept whole in one field); a row of two
 * parts is null when its times come before its days (`row_parts_order`).
 */
export function daysAndTimesOf(parts) {
  if (parts.length === 1) {
    const kind = partKindOf(parts[0])
    if (kind === 'time') return [undefined, parts[0]]
    if (kind === 'mixed') return splitMixedPart(parts[0]) ?? [undefined, parts[0]]
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

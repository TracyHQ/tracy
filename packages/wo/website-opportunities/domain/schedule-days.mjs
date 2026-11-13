// What reads as days in a schedule part (ticket #615), in English, French, German, Spanish, Italian and Portuguese.
// Used by `schedule-parts.mjs` to place a schedule row into a days field and a times field. Pure.
//
// - A day name, a span of days (`Mon`, `Tue and Thu`, `Lundi`, `Montag`) or its three letter form (`Lun-Ven`, `Gio`,
//   `Seg`) is a day on its own, and so is a daily, weekday or weekend word of every language above (`Daily`,
//   `Weekdays`, `Weekends`, `Täglich`, `Werktags`, `Tous les jours`, `Week-end`, `Todos los dias`, `Fines de semana`,
//   `Tutti i giorni`, `Todos os dias`, `Fim de semana`).
// - Two letter forms are days only in a group joined by a hyphen, a slash, an ampersand, a plus, a comma or a word such
//   as `and` (`Mo-Fr`, `Tu & Th`, `Di, Do`, `Sa + So`): a lone `Do` or `So` is ordinary text.
// - A whole day group (`isDayGroup`): day words joined by range or list connectors, with an optional opener (`De lunes
//   a viernes`, `Du lundi au vendredi`, `Mo bis Fr`), or a letter group as below; nothing else in the text.
// - Single letters are days only in a group joined by slashes whose letters are all day letters of one language in
//   week order (`M/W/F`, `T/Th`, `L/X/V`), or in a range of two such letters (`M-F`). `S, M, L` (sizes) and `W/R/F`
//   are not days.

const DAY_WORDS = [
  'mon(?:day)?s?',
  'tue(?:s|sday)?s?',
  'wed(?:nesday)?s?',
  'thu(?:r|rs|rsday)?s?',
  'fri(?:day)?s?',
  'sat(?:urday)?s?',
  'sun(?:day)?s?',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
  'montags?',
  'dienstags?',
  'mittwochs?',
  'donnerstags?',
  'freitags?',
  'samstags?',
  'sonntags?',
  'lunes',
  'martes',
  'mi[e\\u00e9]rcoles',
  'jueves',
  'viernes',
  's[a\\u00e1]bado',
  'domingo',
  'luned[i\\u00ec]',
  'marted[i\\u00ec]',
  'mercoled[i\\u00ec]',
  'gioved[i\\u00ec]',
  'venerd[i\\u00ec]',
  'sabato',
  'domenica',
  'segunda',
  'ter[c\\u00e7]a',
  'quarta',
  'quinta',
  'sexta'
]
// Daily, weekday and weekend words.
const EVERY_WORDS = [
  'daily',
  'every ?day',
  'weekdays?',
  'week-?ends?',
  't[a\\u00e4]glich',
  'jeden tag',
  'werktags?',
  'werktage',
  'wochentags?',
  'wochentage',
  'wochenenden?',
  'tous les jours',
  'chaque jour',
  'quotidiennement',
  'en semaine',
  'todos los d[i\\u00ed]as',
  'cada d[i\\u00ed]a',
  'a diario',
  'diariamente',
  'entre semana',
  'd[i\\u00ed]as laborables',
  'fi[nm]e?s? de semana',
  'tutti i giorni',
  'ogni giorno',
  'giornalmente',
  'feriali',
  'fine ?settimana',
  'todos os dias',
  'dias [u\\u00fa]teis'
]
// Three letter forms of the languages above that the full names do not already cover (`mon`, `tue` and so on do).
const SHORT_DAYS = [
  'lun',
  'mar',
  'mer',
  'mi[e\\u00e9]',
  'jeu',
  'jue',
  'gio',
  'ven',
  'vie',
  'sam',
  's[a\\u00e1]b',
  'dim',
  'dom'
]
const PT_SHORT_DAYS = ['seg', 'ter', 'qua', 'qui', 'sex']
// Two letter forms (English, German): a day only in a group of days.
const TWO_LETTER_DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su', 'di', 'mi', 'do', 'so']

const ONE_DAY = [...DAY_WORDS, ...EVERY_WORDS, ...SHORT_DAYS, ...PT_SHORT_DAYS].join('|')
const ANY_DAY = `(?:${[ONE_DAY, ...TWO_LETTER_DAYS].join('|')})\\.?(?!\\p{L})`
const GROUP_JOIN = '\\s*(?:[-/&+,\\u2013]|and|to|et|und|bis|au)\\s*'
const DAY = new RegExp(`(?<!\\p{L})(?:(?:${ONE_DAY})(?!\\p{L})|${ANY_DAY}(?:${GROUP_JOIN}${ANY_DAY})+)`, 'iu')

// The day letters of each language, Monday first; a day may have several (`t` and `tu`).
const WEEK_LETTERS = [
  [['m', 'mo'], ['t', 'tu'], ['w', 'we'], ['th'], ['f', 'fr'], ['s', 'sa'], ['s', 'su']],
  [
    ['m', 'mo'],
    ['d', 'di'],
    ['m', 'mi'],
    ['d', 'do'],
    ['f', 'fr'],
    ['s', 'sa'],
    ['s', 'so']
  ],
  [['l'], ['m'], ['x', 'm'], ['j'], ['v'], ['s'], ['d']],
  [['l'], ['m'], ['m'], ['g'], ['v'], ['s'], ['d']],
  [['s'], ['t'], ['q'], ['q'], ['s'], ['s'], ['d']]
]
/** Whether the letters name days of one language, each later in the week than the one before. */
function inWeekOrder(letters) {
  return WEEK_LETTERS.some((week) => {
    let at = -1
    for (const letter of letters) {
      at = week.findIndex((names, day) => day > at && names.includes(letter))
      if (at === -1) return false
    }
    return true
  })
}
const LETTER_SLASHES = /(?<![\p{L}/])\p{L}{1,2}\.?(?:\s*\/\s*\p{L}{1,2}\.?)+(?![\p{L}/])/gu
const LETTER_RANGE = /(?<!\p{L})(\p{L})\s*[-\u2013]\s*(\p{L})(?!\p{L})/gu
const lettersOf = (group) =>
  group
    .toLowerCase()
    .split('/')
    .map((l) => l.replace(/[\s.]/gu, ''))

/** Whether a text holds days: a day word, a group of two letter forms, or a group of single letters in week order. */
export function hasDays(text) {
  const value = String(text)
  if (DAY.test(value)) return true
  for (const [group] of value.matchAll(LETTER_SLASHES)) if (inWeekOrder(lettersOf(group))) return true
  for (const [, from, to] of value.matchAll(LETTER_RANGE))
    if (inWeekOrder([from.toLowerCase(), to.toLowerCase()])) return true
  return false
}

// A whole day group: an optional opener, then day words joined by connectors, and nothing else.
const ITEM = `(?:${ONE_DAY}|${TWO_LETTER_DAYS.join('|')})\\.?`
const ITEM_JOIN =
  '\\s*[-/&+,\\u2013]\\s*|\\s+(?:and|to|thru|through|till|until|et|au|\\u00e0|und|bis|a|al|y|e)\\s+'
const GROUP = new RegExp(
  `^(?:(?:from|de|du|von|dal|desde|da)\\s+)?(${ITEM}(?:(?:${ITEM_JOIN})${ITEM})*)$`,
  'iu'
)
const SPLIT_JOIN = new RegExp(ITEM_JOIN, 'giu')
const TWO_LETTER = new RegExp(`^(?:${TWO_LETTER_DAYS.join('|')})$`, 'iu')
const WHOLE_SLASHES = /^\p{L}{1,2}\.?(?:\s*\/\s*\p{L}{1,2}\.?)+$/u
const WHOLE_RANGE = /^(\p{L})\s*[-\u2013]\s*(\p{L})$/u

/** Whether the whole text is one day group (a two letter form only with other days, letters only in week order). */
export function isDayGroup(text) {
  const value = String(text).trim()
  const group = GROUP.exec(value)?.[1]
  if (group !== undefined) {
    const items = group.split(SPLIT_JOIN).map((item) => item.replace(/\.$/u, ''))
    return items.length > 1 || !TWO_LETTER.test(items[0])
  }
  if (WHOLE_SLASHES.test(value)) return inWeekOrder(lettersOf(value))
  const range = WHOLE_RANGE.exec(value)
  return range !== null && inWeekOrder([range[1].toLowerCase(), range[2].toLowerCase()])
}

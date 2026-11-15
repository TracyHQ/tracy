// Opening hours the owner types in the build chat, read in code (decision D46 as amended, #609): "We are open Monday to
// Friday 9am to 5pm and Saturday 10:00 to 14:00" gives `Mo-Fr 09:00-17:00; Sa 10:00-14:00`. A sentence is read only
// when it says it gives opening hours (`open`, `hours`, `closed`); every range must have a stated day and two stated
// times, and the lines must read as one week by the hours check's own reader (`opening-hours.mjs weekOf`). Anything
// else is unreadable: never a guess (no "9 to 5" turned into 17:00, no day assumed). Pure.
import { weekOf } from './opening-hours.mjs'

/** The en dash a range may be typed with (built from its code so no source line holds the mark itself). */
const EN = String.fromCharCode(0x2013)

const DAY = String.raw`(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)s?`
const SPAN = String.raw`${DAY}(?:\s*(?:-|${EN}|to|through|thru|until|till)\s*${DAY}|(?:\s*(?:,|and|&)\s*${DAY})+)?`
const WORDS = String.raw`weekdays|weekends|daily|every\s+day|seven\s+days\s+a\s+week|7\s+days\s+a\s+week`
const DAYS = `(?:${SPAN}|${WORDS})`
const TIME = String.raw`(?:\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|noon|midnight)`
const TO = String.raw`\s*(?:-|${EN}|to|until|till)\s*`
const RANGE = `(${TIME})${TO}(${TIME})`
const DAY_FIRST = new RegExp(String.raw`(${DAYS})\s*(?:,|:)?\s*(?:from\s+|between\s+)?${RANGE}`, 'giu')
const TIME_FIRST = new RegExp(String.raw`(?:from\s+)?${RANGE}\s*(?:,|on)?\s*(${DAYS})`, 'giu')
const CLOSED = new RegExp(String.raw`(${DAYS})\s*(?:is\s+|are\s+|we\s+are\s+|:\s*)?closed`, 'giu')
const CUE = /\b(?:open|opening|hours|closed)\b/iu
const ANY_DAY = new RegExp(String.raw`\b(?:${DAYS})\b`, 'iu')
const ANY_TIME =
  /\b\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|\b\d{1,2}[:.]\d{2}\b|\bnoon\b|\bmidnight\b/iu
const ORDER = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su']
const WORD_DAYS = { weekdays: 'Mo-Fr', weekends: 'Sa-Su' }

/** `Monday`, `tues`, `Sat` -> its two letter code, or null. */
const codeOf = (word) => {
  const w = word.toLowerCase().replace(/s$/u, '')
  const code = ORDER.find((c) => w.startsWith(c))
  return code ? code[0].toUpperCase() + code[1] : null
}

/** A day phrase as a day spec of `weekOf` (`Mo-Fr`, `Sa,Su`), or null. */
function daysOf(phrase) {
  const p = phrase.toLowerCase().replace(/\s+/gu, ' ').trim()
  if (WORD_DAYS[p]) return WORD_DAYS[p]
  if (/^(?:daily|every day|seven days a week|7 days a week)$/u.test(p)) return 'Mo-Su'
  const names = p.match(new RegExp(DAY, 'giu')) ?? []
  const codes = names.map(codeOf)
  if (!codes.length || codes.some((c) => !c)) return null
  return new RegExp(`(?:-|${EN}|to|through|thru|until|till)`, 'u').test(p.replace(/,/gu, ' ')) &&
    codes.length === 2
    ? `${codes[0]}-${codes[1]}`
    : codes.join(',')
}

/** A stated clock as `{minutes, half}` (half: 'am' | 'pm' | null), or null. */
function clockOf(text) {
  const t = text.toLowerCase().replace(/\./gu, (c, i, s) => (/\d/u.test(s[i - 1] ?? '') ? ':' : ''))
  if (t.trim() === 'noon') return { minutes: 720, half: 'set' }
  if (t.trim() === 'midnight') return { minutes: 1440, half: 'set' }
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/u.exec(t.trim())
  if (!m) return null
  const [h, min] = [Number(m[1]), Number(m[2] ?? 0)]
  if (min > 59 || h > 24 || (m[3] && (h < 1 || h > 12))) return null
  return { hour: h, min, half: m[3] ?? null }
}

const minutesOf = ({ hour, min }, half) => ((hour % 12) + (half === 'pm' ? 12 : 0)) * 60 + min
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** A stated range as `HH:MM-HH:MM`, or null: both ends stated, a missing am/pm only taken from the other end. */
function rangeOf(a, b) {
  const [x, y] = [clockOf(a), clockOf(b)]
  if (!x || !y) return null
  const end = y.half === 'set' ? y.minutes : y.half ? minutesOf(y, y.half) : y.hour * 60 + y.min
  let start
  if (x.half === 'set') start = x.minutes
  else if (x.half) start = minutesOf(x, x.half)
  else if (y.half === 'pm' || y.half === 'am') {
    // "9-5pm": the start takes am when pm would come after the end, as it is read aloud.
    const pm = minutesOf(x, 'pm')
    start = y.half === 'pm' && pm < end ? pm : minutesOf(x, 'am')
  } else start = x.hour * 60 + x.min
  // A range that runs backwards ("9 to 5", neither end saying am or pm): unreadable, never a guess.
  if (end <= start && end !== 1440) return null
  return `${hhmm(start)}-${hhmm(end === 1440 ? 1439 : end)}`
}

/**
 * The opening hours one sentence states, as `weekOf` lines, or why none were read.
 * @returns {{lines: string[]} | {unreadable: true} | null} null: the sentence gives no opening hours at all
 */
export function hoursOfSentence(sentence) {
  const s = String(sentence)
  if (!CUE.test(s) || !(ANY_DAY.test(s) || ANY_TIME.test(s))) return null
  const lines = []
  const taken = []
  const add = (days, range, at, length) => {
    if (taken.some(([a, b]) => at < b && at + length > a)) return
    const spec = daysOf(days)
    if (!spec || !range) return lines.push(null)
    taken.push([at, at + length])
    lines.push(`${spec} ${range}`)
  }
  for (const m of s.matchAll(DAY_FIRST)) add(m[1], rangeOf(m[2], m[3]), m.index, m[0].length)
  for (const m of s.matchAll(TIME_FIRST)) add(m[3], rangeOf(m[1], m[2]), m.index, m[0].length)
  for (const m of s.matchAll(CLOSED)) add(m[1], 'closed', m.index, m[0].length)
  const kept = lines.filter(Boolean)
  if (!kept.length || kept.length !== lines.length) return { unreadable: true }
  const week = weekOf(kept.map((l) => l.replace(/ closed$/u, ' closed')))
  return week ? { lines: kept } : { unreadable: true }
}

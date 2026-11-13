// The guard that keeps business data out of written copy (ticket #594). A copy field (a heading, an intro, a button
// label) is written by the model; the business's own values (a phone number, an email address, a link, a price, its
// opening hours) are data fields, copied in code. So a written copy value may only repeat such a value when the plan
// data holds it. Invented, and the field fails:
//   - a phone number, an email address or a URL the plan data does not hold;
//   - a price no known PRICE proves: same amount and currency, compared as the needs profile compares an item's price
//     (`priceIn`, `price-in.mjs`), never proven by a bare number, a time, a year or a count;
//   - a clock time (`7am`, `18:30`, read by `timesOf` of the needs profile grounding) no known value states, and "open
//     24 hours" or "24/7" when no known value says so;
//   - a year (`since 1998`) or any other number (`500+ members`) no known value holds;
//   - an award or a certification (`award-winning`, `certified`, `champion`) no known value names.
// The award words are English: copy in another language is held to its numbers, times and links only.
//
// Pure: a written value and the plan data's values in, the invented values out.
import { TIME_PATTERN, timesOf } from './needs-profile-grounding.mjs'
import { MONEY, priceIn, withoutMoney } from './price-in.mjs'

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const URL_WITH_SCHEME = /\b(?:https?:\/\/|www\.)[^\s,;)]+/giu
const TLDS =
  'com|net|org|info|biz|io|co|app|dev|shop|site|online|club|store|uk|de|fr|nl|es|it|at|ch|be|au|ca|us|eu|ae|vn|example'
const BARE_DOMAIN = new RegExp(
  `\\b[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${TLDS})\\b(?:/[^\\s,;)]*)?`,
  'giu'
)
// A run of digits with phone separators (space, dot, dash, slash, brackets) holding at least seven digits.
const PHONE = /\+?\(?\d[\d\s().\-/]{5,}\d/g
const ALL_DAY = /\b24\s*\/\s*7\b|\b24[\s-]*hours?\b/gi
const NUMBER = /\d+(?:[.,]\d+)*/g
const AWARD =
  /\b(?:award(?:s|ed)?|award-winning|winners?|certified|certificat(?:e|es|ion|ions)|accredit(?:ed|ation)|licensed|champions?|championships?|medal(?:s|ist|ists)?|olympi(?:c|an|ans))\b/giu

const digits = (text) => text.replace(/\D/g, '')
const linkForm = (text) =>
  text
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '')
/** A number as one form: thousands commas out, so `1,200` and `1200` compare equal. */
const numberForm = (text) => text.replace(/,(?=\d{3}\b)/g, '')
const isYear = (text) => /^(?:1[89]\d\d|20\d\d)$/.test(text)
/** A word of the award list as a stem, so `certified` is named by a known `certification`. */
const stem = (word) => word.toLowerCase().slice(0, 5)

/** `text` with every match of `pattern` replaced by a space, each match given to `take`. */
const cut = (text, pattern, take = () => {}) =>
  text.replace(pattern, (match, ...rest) => {
    take(match, ...rest)
    return ' '
  })

/**
 * The invented business values of `value`: phone numbers, email addresses, URLs, prices, hours, years, counts and
 * awards the plan data does not hold.
 * @param {string} value a written copy value
 * @param {string[]} known every value of the plan data (facts and item fields), as text
 * @returns {Array<{what: 'phone' | 'email' | 'url' | 'price' | 'hours' | 'year' | 'number' | 'award', text: string}>}
 */
export function inventedDataOf(value, known = []) {
  const data = known.filter((k) => typeof k === 'string')
  const lower = data.map((k) => k.toLowerCase())
  const found = []
  let rest = cut(String(value), EMAIL, (email) => {
    if (!lower.some((k) => k.includes(email.toLowerCase()))) found.push({ what: 'email', text: email })
  })
  const links = new Set()
  rest = cut(rest, URL_WITH_SCHEME, (link) => links.add(linkForm(link)))
  rest = cut(rest, BARE_DOMAIN, (link) => links.add(linkForm(link)))
  const knownLinks = lower.map(linkForm)
  for (const link of links)
    if (!knownLinks.some((k) => k.includes(link))) found.push({ what: 'url', text: link })
  const knownDigits = data.map(digits).filter(Boolean)
  rest = cut(rest, PHONE, (phone) => {
    if (digits(phone).length >= 7 && !knownDigits.some((k) => k.includes(digits(phone))))
      found.push({ what: 'phone', text: phone.trim() })
  })
  rest = cut(rest, MONEY, (price) => {
    if (!data.some((k) => priceIn(price, k))) found.push({ what: 'price', text: price.trim() })
  })
  const knownTimes = new Set(data.flatMap(timesOf))
  rest = rest.replace(TIME_PATTERN, (match) => {
    const [minutes] = timesOf(match)
    if (minutes === undefined) return match
    if (!knownTimes.has(minutes)) found.push({ what: 'hours', text: match.trim() })
    return ' '
  })
  const allDay = data.some((k) => new RegExp(ALL_DAY.source, 'i').test(k))
  rest = cut(rest, ALL_DAY, (match) => {
    if (!allDay) found.push({ what: 'hours', text: match })
  })
  // Numbers of the data, links and emails aside: a price amount or a time is a number too.
  const knownNumbers = new Set(
    data.flatMap((k) => (withoutMoney(k).replace(EMAIL, ' ').match(NUMBER) ?? []).map(numberForm))
  )
  for (const money of data.flatMap((k) => [...k.matchAll(MONEY)]))
    knownNumbers.add(numberForm(money[1] ?? money[2]))
  for (const number of rest.match(NUMBER) ?? [])
    if (!knownNumbers.has(numberForm(number)))
      found.push({ what: isYear(number) ? 'year' : 'number', text: number })
  const knownStems = new Set(lower.flatMap((k) => (k.match(AWARD) ?? []).map(stem)))
  for (const award of rest.match(AWARD) ?? [])
    if (!knownStems.has(stem(award))) found.push({ what: 'award', text: award })
  return found
}

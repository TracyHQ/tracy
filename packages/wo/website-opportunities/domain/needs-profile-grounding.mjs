// Whether a quote proves the value a model reported from it (ticket #592). Finding the quote in the source is not
// enough: the value itself must be inside the quote, compared the way the merge compares values.
//
// The rule, per field:
// - LITERAL fields must be found inside the quote: every business fact (name, founded year, phone, email, address,
//   hours, links) and, for an item, its name, its price, a quote's text and author, and any field not listed below.
//   Text compares on letters and digits only, whole words (a number with its separators is one word), case and
//   spacing aside; an address compares on letters and digits, whole words, its punctuation aside; a price compares by
//   amount against the amounts the quote writes as money (`$20` is `$20.00`, `€15` is `15,00 €`, never `$120`, never
//   the 20 of "a 20 minute class"), its currency signs and words inside the quote too; any other literal ignores the
//   amounts written as money (a year is never proven by `$2010`);
//   a phone compares as a number
//   (`samePhone`); an email or a link compares as written, case aside. Hours may be rewritten as days and times
//   (`Mo-Fr 07:00-22:00` for "Monday to Friday 7am to 10pm"): then every time in the value must be a time of the quote.
// - SUMMARY fields (`SUMMARY_ROLES`: a description, a duration or period, a role, a bio) may reword the quote, but
//   every number, currency sign, capitalised word after the first and email or link they carry must be in the quote,
//   so a summary cannot carry an invented name, number or price.
// - A quote is at least `MIN_EVIDENCE_CHARS` letters and digits long.
import { textKey, urlKey } from './needs-profile-merge.mjs'
import { phonesIn, samePhone } from './needs-profile-phone.mjs'
import { currencies, priceIn, tokenKey, withoutMoney } from './price-in.mjs'

export { tokenKey } from './price-in.mjs'

export const MIN_EVIDENCE_CHARS = 4
/** Item fields the model may word itself, under the summary guard. */
export const SUMMARY_ROLES = Object.freeze([
  'offering.description',
  'offering.duration_or_unit',
  'package.period',
  'person.role',
  'person.bio'
])
const PRICE_ROLES = new Set(['offering.price', 'package.price'])

const lower = (value) => String(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
const linkless = (value) =>
  lower(value)
    .replace(/https?:\/\//g, '')
    .replace(/\bwww\./g, '')
const numbers = (value) => String(value).match(/\d+/g) ?? []
const wordsOf = (value) => new Set(textKey(value).split(' '))
/** Whether the words of `value` stand, whole and in order, inside the words of `evidence`. */
export const tokensIn = (value, evidence) => {
  const key = tokenKey(value)
  return key !== '' && ` ${tokenKey(evidence)} `.includes(` ${key} `)
}

/** A clock time candidate: hours, then minutes or am/pm (a bare number is not a time; `timesOf` skips it). */
export const TIME_PATTERN = /\b(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/gi

/** The times written in `text`, in minutes after midnight: `07:00`, `7.30`, `7am`, `10 pm`. Shared with the copy guard. */
export function timesOf(text) {
  const times = []
  for (const m of String(text).matchAll(TIME_PATTERN)) {
    const [, h, min, half] = m
    if (min === undefined && !half) continue
    let hour = Number(h) % (half ? 12 : 24)
    if (half && /^p/i.test(half)) hour += 12
    times.push(hour * 60 + Number(min ?? 0))
  }
  return times
}

/** Whether the literal `value` of data kind `role` is inside `evidence`. */
function literalIn(role, value, evidence) {
  if (role === 'contact.phone') return phonesIn(evidence).some((p) => samePhone(p, value))
  if (role === 'contact.email') return lower(evidence).includes(lower(value))
  if (role.endsWith('_url')) return linkless(evidence).includes(urlKey(value))
  if (PRICE_ROLES.has(role)) return priceIn(value, evidence)
  // Any other literal is never proven by an amount the quote writes as money (`2010` by "$2010").
  const quote = withoutMoney(evidence)
  if (role === 'contact.address')
    return ` ${textKey(quote)} `.includes(` ${textKey(value)} `) && textKey(value) !== ''
  const words = tokensIn(value, quote)
  if (role === 'contact.hours' && !words) {
    const [said, quoted] = [timesOf(value), new Set(timesOf(quote))]
    return said.length > 0 && said.every((t) => quoted.has(t))
  }
  return words
}

/** Whether a summary `value` carries nothing the quote lacks: numbers, currency signs, names, emails, links. */
function summaryIn(value, evidence) {
  const quoted = new Set(numbers(evidence))
  if (!numbers(value).every((n) => quoted.has(n))) return false
  if (!currencies(value).every((c) => evidence.includes(c))) return false
  const words = wordsOf(evidence)
  const named = String(value)
    .split(/\s+/)
    .slice(1)
    .filter((w) => /^\p{Lu}/u.test(w))
  if (
    !named.every((w) =>
      textKey(w)
        .split(' ')
        .every((part) => words.has(part))
    )
  )
    return false
  const links = String(value).match(/\S*(?:@|https?:\/\/|www\.)\S*/gi) ?? []
  return links.every((l) => linkless(evidence).includes(linkless(l).replace(/[.,;]+$/, '')))
}

/** Whether `evidence` is long enough to prove anything. */
export const evidenceLongEnough = (evidence) =>
  textKey(evidence).replace(/ /g, '').length >= MIN_EVIDENCE_CHARS

/**
 * Whether `evidence` proves one part of a row value (ticket #615): a row's quote is the row itself, so every part of
 * every data kind, a summary kind's included, must stand inside it, whole tokens in order (a phone, an email, a link
 * and a price as for any fact: a row price is an amount the quote writes as money).
 */
export function rowProvenBy(role, value, evidence) {
  if (PRICE_ROLES.has(role) || role === 'contact.phone' || role === 'contact.email' || role.endsWith('_url'))
    return literalIn(role, value, evidence)
  return tokensIn(value, evidence)
}

/** Whether `evidence` proves `value` for field or fact kind `role` (rules above). */
export function provenBy(role, value, evidence) {
  return SUMMARY_ROLES.includes(role) ? summaryIn(value, evidence) : literalIn(role, value, evidence)
}

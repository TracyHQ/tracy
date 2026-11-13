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
const currencies = (value) => String(value).match(/\p{Sc}/gu) ?? []
const numbers = (value) => String(value).match(/\d+/g) ?? []
const wordsOf = (value) => new Set(textKey(value).split(' '))
/**
 * The words of a text as whole tokens: a number keeps its separators (`18:00`, `7.30`, `1,200`), so part of a number is
 * never a token of its own (`00 to 20` is not inside `18:00 to 20:00`). Case, accents and other punctuation aside.
 */
export const tokenKey = (value) =>
  (
    String(value)
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .match(/\p{N}+(?:[:.,]\p{N}+)*|\p{L}+/gu) ?? []
  ).join(' ')
/** Whether the words of `value` stand, whole and in order, inside the words of `evidence`. */
export const tokensIn = (value, evidence) => {
  const key = tokenKey(value)
  return key !== '' && ` ${tokenKey(evidence)} `.includes(` ${key} `)
}

const NUMBER = String.raw`\d+(?:[.,']\d+)*`
const CURRENCY = String.raw`\p{Sc}|(?<!\p{L})(?:USD|EUR|GBP|AUD|CAD|CHF|JPY|AED|SGD|NZD|HKD|INR|VND|SEK|NOK|DKK|PLN|CZK|BRL|MXN|ZAR)(?!\p{L})`
const CURRENCY_WORD = String.raw`(?:dollars?|euros?|pounds?|dirhams?|francs?|yen|rupees?|kronor|kroner|reais|dong)(?!\p{L})`
/** An amount written as money: a currency sign or code before or after it, or a currency word after it. */
const MONEY = new RegExp(
  String.raw`(?:${CURRENCY})\s?(${NUMBER})|(${NUMBER})\s?(?:${CURRENCY}|${CURRENCY_WORD})`,
  'giu'
)

/**
 * The value of one written number: one or two digits after the last separator are the decimals (`20.5`, `15,00`); a
 * group of exactly three digits after a separator groups thousands (`1,200`, `1.200`). Any other grouping (`1,2345`)
 * is no amount (NaN), so it proves nothing.
 */
function amountOf(written) {
  const groups = written.split(/[.,']/)
  if (groups.length === 1) return Number(written)
  const last = groups.at(-1)
  const decimals = last.length <= 2
  const whole = decimals ? groups.slice(0, -1) : groups
  const grouped = whole.length === 1 || (whole[0].length <= 3 && whole.slice(1).every((g) => g.length === 3))
  if (!grouped || (!decimals && last.length !== 3)) return Number.NaN
  return Number(whole.join('')) + (decimals ? Number(last) / 10 ** last.length : 0)
}

/** Every number written in `text`, as an amount. */
const amountsOf = (text) => (String(text).match(new RegExp(NUMBER, 'g')) ?? []).map(amountOf)
/** The amounts `text` writes as money only (`$35`, `15,00 €`, `20 EUR`, `20 dollars`). */
const moneyIn = (text) => [...String(text).matchAll(MONEY)].map((m) => amountOf(m[1] ?? m[2]))
/** `text` with every amount written as money taken out: a year or a name is never proven by a price. */
const withoutMoney = (text) => String(text).replace(MONEY, ' ')

/**
 * Whether a price `value` is in `evidence`: each of its amounts written as MONEY in the quote (never an equal number
 * that is not a price, `20` in "a 20 minute class"), its currency signs and its words.
 */
function priceIn(value, evidence) {
  const amounts = amountsOf(value)
  const quoted = new Set(moneyIn(evidence))
  const words = tokenKey(evidence).split(' ')
  const ownWords = tokenKey(value).match(/\p{L}+/gu) ?? []
  return (
    amounts.length > 0 &&
    amounts.every((a) => quoted.has(a)) &&
    currencies(value).every((c) => evidence.includes(c)) &&
    ownWords.every((w) => words.includes(w))
  )
}

/** The times written in `text`, in minutes after midnight: `07:00`, `7.30`, `7am`, `10 pm`. */
function timesOf(text) {
  const times = []
  for (const m of String(text).matchAll(/\b(\d{1,2})(?:[:.h](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/gi)) {
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
 * every data kind, a summary kind's included, must stand inside it, whole tokens in order (a phone, an email and a
 * link as for any fact).
 */
export function rowProvenBy(role, value, evidence) {
  if (role === 'contact.phone' || role === 'contact.email' || role.endsWith('_url'))
    return literalIn(role, value, evidence)
  return tokensIn(value, evidence)
}

/** Whether `evidence` proves `value` for field or fact kind `role` (rules above). */
export function provenBy(role, value, evidence) {
  return SUMMARY_ROLES.includes(role) ? summaryIn(value, evidence) : literalIn(role, value, evidence)
}

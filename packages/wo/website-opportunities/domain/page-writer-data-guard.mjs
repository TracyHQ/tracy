// The guard that keeps business data out of written copy (ticket #594). A copy field (a heading, an intro, a button
// label) is written by the model; the business's own values (a phone number, an email address, a link, a price, its
// opening hours) are data fields, copied in code. So a written copy value may only repeat such a value when the plan
// data holds it. Invented, and the field fails:
//   - a phone number (`phonesIn`, at least seven digits) that is no known phone (`samePhone`: a trunk 0, brackets and
//     spaces aside), nor the end of one dialled locally (`7946 0123` of `+44 20 7946 0123`);
//   - an email address or a URL the plan data does not hold;
//   - money (`moneyOf`: an amount with its own currency, a sign, its code and its word one currency) no known money
//     is: the same amount in the same currency;
//   - a claim of hours, every day, a year, a count or an award the plan data does not hold (`copy-claims.mjs`). Any
//     other bare number passes: when the guard cannot tell, it lets the copy through.
// The known numbers and hours come only from values that are no phone, link, address or price: a phone holds no count,
// an address no year.
//
// Pure: a written value and the plan data's values in, the invented values out.
import { KNOWN_ALL_DAY, KNOWN_EVERY_DAY, claimsOf, knownHoursOf, numbersOf } from './copy-claims.mjs'
import { phonesIn, samePhone } from './needs-profile-phone.mjs'
import { moneyOf, sameMoney, withoutMoney } from './price-in.mjs'

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu
const URL_WITH_SCHEME = /\b(?:https?:\/\/|www\.)[^\s,;)]+/giu
const TLDS =
  'com|net|org|info|biz|io|co|app|dev|shop|site|online|club|store|uk|de|fr|nl|es|it|at|ch|be|au|ca|us|eu|ae|vn|example'
const BARE_DOMAIN = new RegExp(
  `\\b[\\p{L}\\p{N}-]+(?:\\.[\\p{L}\\p{N}-]+)*\\.(?:${TLDS})\\b(?:/[^\\s,;)]*)?`,
  'giu'
)
const YEAR_RANGE = /^\s*(?:1[89]|20)\d\d\s*[-\u2013/]\s*(?:1[89]|20)\d\d\s*$/
/** Kinds of the plan data whose numbers count nothing: a phone, a link, an address, a price. */
const NO_COUNT_KINDS =
  /^(?:contact\.(?:phone|email|address|social_url|cta_url)|.*\.cta_url|.*\.price|claim\.entity_url)$/
/** A known value with no kind is read as an address by a street or postcode word. */
const ADDRESS_WORD =
  /\b(?:lane|road|street|avenue|boulevard|straße|strasse|weg|platz|gasse|rue|calle|avenida|plaza|via|viale|piazza|rua|travessa|postcode|zip|plz)\b/iu

const digits = (text) => text.replace(/\D/g, '')
const linkForm = (text) =>
  text
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '')
const isPhone = (text) => digits(text).length >= 7 && !YEAR_RANGE.test(text)
const phonesOf = (text) => phonesIn(text).filter(isPhone)

/** `text` with every match of `pattern` replaced by a space, each match given to `take`. */
const cut = (text, pattern, take = () => {}) =>
  text.replace(pattern, (match) => {
    take(match)
    return ' '
  })
/** `text` with its emails, links, phones and money taken out. */
const plainOf = (text) => {
  let rest = cut(cut(cut(text, EMAIL), URL_WITH_SCHEME), BARE_DOMAIN)
  for (const phone of phonesOf(rest)) rest = rest.replace(phone, ' ')
  return withoutMoney(rest)
}

/** What the plan data holds, for `claimsOf`: its numbers, hours, every day, 24 hours, its address count. */
function factsOf(entries) {
  const counting = entries.filter((e) => !(e.kind ? NO_COUNT_KINDS.test(e.kind) : ADDRESS_WORD.test(e.value)))
  const plain = counting.map((e) => plainOf(e.value))
  return {
    numbers: new Set(plain.flatMap(numbersOf)),
    hours: new Set(plain.flatMap(knownHoursOf)),
    everyDay: plain.some((t) => KNOWN_EVERY_DAY.test(t)),
    allDay: plain.some((t) => KNOWN_ALL_DAY.test(t)),
    addresses: entries.filter((e) => (e.kind ? e.kind === 'contact.address' : ADDRESS_WORD.test(e.value)))
      .length,
    text: entries.map((e) => e.value).join(' \n ')
  }
}

/**
 * The invented business values of `value`: phone numbers, email addresses, URLs, prices and the claims of hours,
 * years, counts and awards the plan data does not hold.
 * @param {string} value a written copy value
 * @param {Array<string | {kind: string | null, value: string}>} known every value of the plan data (facts and item
 *   fields), each with its data kind when known (`knownEntriesOf`)
 * @returns {Array<{what: 'phone' | 'email' | 'url' | 'price' | 'hours' | 'year' | 'number' | 'award', text: string}>}
 */
export function inventedDataOf(value, known = []) {
  const entries = known
    .map((k) => (typeof k === 'string' ? { kind: null, value: k } : k))
    .filter((e) => typeof e?.value === 'string')
  const data = entries.map((e) => e.value)
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
  const knownPhones = data.flatMap(phonesOf)
  for (const phone of phonesOf(rest)) {
    const local = !/^\s*(?:\+|00|0)/.test(phone)
    const same = (k) => samePhone(phone, k) || (local && digits(k).endsWith(digits(phone)))
    if (!knownPhones.some(same)) found.push({ what: 'phone', text: phone.trim() })
    rest = rest.replace(phone, ' ')
  }
  const knownMoney = data.flatMap(moneyOf)
  for (const money of moneyOf(rest))
    if (!knownMoney.some((k) => sameMoney(money, k))) found.push({ what: 'price', text: money.text.trim() })
  return [...found, ...claimsOf(withoutMoney(rest), factsOf(entries))]
}

// The guard that keeps business data out of written copy (ticket #594). A copy field (a heading, an intro, a button
// label) is written by the model; the business's own values (a phone number, an email address, a link, a price) are
// data fields, copied in code. So a written copy value may only repeat such a value when the plan data holds it: any
// phone number, email address, URL or price the plan data does not hold is invented, and the field fails.
//
// Pure: a written value and the plan data's values in, the invented values out.

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
const CURRENCY = '[$€£¥₹₫]'
const CODES = 'USD|EUR|GBP|AED|CHF|AUD|CAD|VND|dollars?|euros?|pounds?'
const PRICE = new RegExp(
  `${CURRENCY}\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?${CURRENCY}|\\b\\d[\\d.,]*\\s?(?:${CODES})\\b|\\b(?:${CODES})\\s?\\d[\\d.,]*`,
  'giu'
)

const digits = (text) => text.replace(/\D/g, '')
const linkForm = (text) =>
  text
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '')
/** The amount of a price as plain digits and one decimal point: `$1,200.00` gives `1200`. */
const amount = (text) => {
  const number = text
    .replace(/[^\d.,]/g, '')
    .replace(/,(?=\d{3}\b)/g, '')
    .replace(',', '.')
  return number.replace(/\.0+$/, '').replace(/^0+(?=\d)/, '')
}

/**
 * The phone numbers, email addresses, URLs and prices of `value` that the plan data does not hold.
 * @param {string} value a written copy value
 * @param {string[]} known every value of the plan data (facts and item fields), as text
 * @returns {Array<{what: 'phone' | 'email' | 'url' | 'price', text: string}>}
 */
export function inventedDataOf(value, known = []) {
  const text = String(value)
  const data = known.filter((k) => typeof k === 'string')
  const lower = data.map((k) => k.toLowerCase())
  const found = []
  const emails = text.match(EMAIL) ?? []
  for (const email of emails)
    if (!lower.some((k) => k.includes(email.toLowerCase()))) found.push({ what: 'email', text: email })
  const withoutEmails = emails.reduce((rest, email) => rest.replace(email, ' '), text)
  const links = [...(withoutEmails.match(URL_WITH_SCHEME) ?? []), ...(withoutEmails.match(BARE_DOMAIN) ?? [])]
  const knownLinks = lower.map(linkForm)
  for (const link of new Set(links.map(linkForm)))
    if (!knownLinks.some((k) => k.includes(link))) found.push({ what: 'url', text: link })
  const knownDigits = data.map(digits).filter(Boolean)
  for (const phone of text.match(PHONE) ?? [])
    if (digits(phone).length >= 7 && !knownDigits.some((k) => k.includes(digits(phone))))
      found.push({ what: 'phone', text: phone.trim() })
  const knownAmounts = new Set(data.flatMap((k) => (k.match(/\d[\d.,]*/g) ?? []).map(amount)))
  for (const price of text.match(PRICE) ?? [])
    if (!knownAmounts.has(amount(price))) found.push({ what: 'price', text: price.trim() })
  return found
}

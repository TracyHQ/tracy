// Does a sample read like a fact about a business: a phone, an email, an address, a price or opening hours? Used by the
// mechanical label rules R2 (a fact-like sample needs a contact or price role) and R9 (a fact-like hole blocks).
// Deliberately conservative: a match must look like the fact, so a number in prose ("since 2008") is not one.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const PRICE = /(?:[$€£¥]\s?\d)|(?:\d[\d.,]*\s?(?:[$€£¥]|USD|EUR|GBP|AUD|CAD)(?![A-Za-z]))/
const TIME = String.raw`\d{1,2}(?::\d{2})?\s?(?:am|pm)?`
const HOURS = new RegExp(
  String.raw`\b${TIME}\s?(?:-|to|until)\s?${TIME}\b(?=.*\b(?:am|pm)\b)|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b[^.]{0,40}\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b`,
  'i'
)
const ADDRESS =
  /\b\d{1,5}\s+(?:[A-Z][\w.'-]*\s+){0,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl|Square|Sq)\b\.?/
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g

const stripTags = (s) =>
  String(s ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')

function hasPhone(text) {
  for (const run of text.replace(ISO_DATE, ' ').match(/[+(]?\d[\d\s().-]{5,}\d/g) ?? []) {
    if (run.replace(/\D/g, '').length >= 7) return true
  }
  return false
}

/**
 * The kinds of fact a sample looks like (any of `phone`, `email`, `address`, `price`, `hours`); empty for none.
 * @param {unknown} sample text or html
 * @returns {string[]}
 */
export function factKindsOf(sample) {
  const text = stripTags(sample)
  const kinds = []
  if (EMAIL.test(text)) kinds.push('email')
  if (hasPhone(text)) kinds.push('phone')
  if (ADDRESS.test(text)) kinds.push('address')
  if (PRICE.test(text)) kinds.push('price')
  if (HOURS.test(text)) kinds.push('hours')
  return kinds
}

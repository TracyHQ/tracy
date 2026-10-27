// The machine checks of a WO demo page against its place profile (tasks/plan-wo-place-profile-code.md §4, §7).
// Each takes what the page showed (text, CTAs, images, layout read by `page-probe.mjs`) and the profile's facts
// (`profile-facts.mjs`), and returns what is wrong — an empty list is a pass. Pure, so the fixtures test them.

import { amountKey } from './profile-facts.mjs'

/** Words the neutral-copy policy forbids as filler (plan §7, banned fillers); only sourced content may print them. */
export const BANNED_FILLERS = Object.freeze([
  'Coming soon',
  "Chef's selection",
  'Seasonal special',
  'House favourite',
  'Market price'
])

const norm = (s) =>
  String(s ?? '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** @param {string} text */
export function bannedFillers(text) {
  const t = norm(text).toLowerCase()
  return BANNED_FILLERS.filter((w) => new RegExp(`\\b${esc(w.toLowerCase())}\\b`).test(t))
}

/** Words that make a page read as a restaurant; on any other trade each one is a leftover. */
const RESTAURANT_WORDS = Object.freeze([
  'book a table',
  'reserve a table',
  'menu',
  'dish',
  'dishes',
  'chef',
  'cuisine',
  'restaurant',
  'dining',
  'appetizers',
  'desserts',
  'wine list',
  'our kitchen'
])

/**
 * @param {string} text - the page's visible text, navigation toggles excluded by the probe
 * @param {string | null} trade - the profile's `tracy-trade` code
 */
export function restaurantWords(text, trade) {
  if (trade === 'food' || trade === 'hospitality') return []
  const t = norm(text).toLowerCase()
  return RESTAURANT_WORDS.filter((w) => new RegExp(`\\b${esc(w)}(?:'s)?\\b`).test(t))
}

const CURRENCY = '[$€£¥₫]'
const CODE = '(?:USD|EUR|GBP|VND|AUD|CAD|đ)'
const PRICE_RE = new RegExp(`(${CURRENCY}\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?(?:${CURRENCY}|${CODE}\\b))`, 'g')

/** Every printed price on the page. */
export function pricesIn(text) {
  return [...norm(text).matchAll(PRICE_RE)].map((m) => m[1].trim())
}

/** Every printed price on the page whose amount the profile never printed. */
export function unsourcedPrices(text, facts) {
  return pricesIn(text).filter((p) => {
    const key = amountKey(p)
    return key && !facts.priceDigits.has(key)
  })
}

/** A currency sign, a billing period or a dangling "from" with no amount beside it. */
export function orphanCurrency(text) {
  const t = norm(text)
  const out = []
  for (const m of t.matchAll(new RegExp(`(?:^|[\\s(])(${CURRENCY})(?!\\s?\\d)`, 'g'))) out.push(m[1])
  for (const m of t.matchAll(/(?<!\d\s?)(\/\s?(?:month|mo|year|hour|session|class))\b/gi)) out.push(m[1])
  // Only a "from" that ends its line: "from 9 am" or "Come from afar" are words, not a price.
  if (
    String(text ?? '')
      .split('\n')
      .some((line) => /\bfrom\s*(?:[|·]\s*)?$/i.test(line))
  )
    out.push('from')
  return [...new Set(out)]
}

/** A statistic shown as zero while the profile holds none: `—` must stay `—`, never become `0`. */
export function zeroedStats(statTexts, facts) {
  if (facts.statistics.length > 0) return []
  return statTexts.filter((s) => /^\s*0\s*[%+kKmM]?\s*$/.test(String(s ?? '')))
}

const digits = (s) => String(s ?? '').replace(/\D/g, '')
const BOOKING = /\b(book a table|reserve a table|reserve|book now|reservation)\b/i
const TABLE = /\b(book a table|reserve a table)\b/i

/**
 * CTAs that do nothing real: `href="#"`, a `tel:` that is not the profile's number, a `mailto:` the profile does not
 * hold, a booking the business does not offer, and a table booking on a business that is not a restaurant.
 * @param {{ text: string, href: string | null }[]} ctas
 */
export function ctaProblems(ctas, facts) {
  const out = []
  for (const cta of ctas) {
    const href = String(cta.href ?? '').trim()
    const text = norm(cta.text).trim()
    if (!href || href === '#' || /^javascript:/i.test(href)) {
      out.push({ code: 'dead-link', text, href })
      continue
    }
    if (/^tel:/i.test(href)) {
      const want = facts.phoneDigits
      const got = digits(href)
      if (!want) out.push({ code: 'tel-unsourced', text, href })
      else if (!(got.endsWith(want) || want.endsWith(got)) || got.length < 6)
        out.push({ code: 'tel-mismatch', text, href })
      continue
    }
    if (/^mailto:/i.test(href)) {
      const to = href.slice(7).split('?')[0].toLowerCase()
      if (!facts.email || to !== String(facts.email).toLowerCase())
        out.push({ code: 'mailto-unsourced', text, href })
      continue
    }
    if (BOOKING.test(text) && !facts.hasBooking) out.push({ code: 'booking-unsourced', text, href })
    if (TABLE.test(text) && facts.trade !== 'food' && facts.trade !== 'hospitality')
      out.push({ code: 'restaurant-cta', text, href })
  }
  return out
}

/**
 * Visible image frames whose picture did not load (no source, or loaded with no pixels).
 * @param {{ src: string, complete: boolean, naturalWidth: number, width: number, height: number }[]} images
 */
export function brokenImages(images) {
  return images.filter(
    (i) => i.width >= 24 && i.height >= 24 && (!i.src || (i.complete && i.naturalWidth === 0))
  )
}

/** Roles whose template sample is a fact about the template's fictional business, never the customer's. */
const FACT_ROLES =
  /^(offering\.(name|price|description)|package\.(name|price)|person\.(name|role|bio)|stat\.(value|label)|quote\.(text|author_name|author_context)|faq\.(question|answer)|claim\.(award_or_cert|entity_name)|event\.(title|description))$/

/**
 * Template sample values of fact roles still printed on the page, unless the profile holds the same value.
 * @param {string} text
 * @param {{ slotKey: string, role: string, sample: string }[]} samples - from `baseline.mjs` `factSamples`
 */
export function templateLeftovers(text, samples, facts) {
  const t = norm(text).toLowerCase()
  return samples.filter((s) => {
    const v = norm(s.sample).trim().toLowerCase()
    if (!FACT_ROLES.test(s.role) || v.length < 4 || facts.values.has(v)) return false
    const key = amountKey(v)
    if (/^[\s$€£¥₫\d.,%+]+$/.test(v) && key && facts.priceDigits.has(key)) return false
    return t.includes(v)
  })
}

/**
 * Sections and cards against the template's own layout: every section of the baseline is there, with at least as
 * many cards. More is allowed (a CMS may repeat a module); fewer is the loss §4 forbids.
 * @param {{ sections: { id: string, cards: number }[] }} baseline
 * @param {{ sections: { id: string, cards: number }[] }} measured
 */
export function layoutAgainst(baseline, measured) {
  const got = new Map(measured.sections.map((s) => [s.id, s.cards]))
  const out = []
  for (const s of baseline.sections) {
    if (!got.has(s.id)) out.push({ id: s.id, want: s.cards, got: 0, code: 'section-lost' })
    else if (got.get(s.id) < s.cards)
      out.push({ id: s.id, want: s.cards, got: got.get(s.id), code: 'cards-lost' })
  }
  return out
}

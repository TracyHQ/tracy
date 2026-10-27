// Every phone number a business lists about itself, and the one its site shows first. Pure.
//
// Measured on dev 26/10/2026 (Harbour Sport Club): its Instagram bio lists +971 50 000 5678 and +971 50 000 1234, the
// profile kept one field, and an opportunity made from the Instagram link alone had no phone at all. The other side,
// measured the same day: the magicpin listing linked magicpin's own Facebook page, whose number (+91 124 555 0121) is
// magicpin's support line. Numbers are taken only from the business's own sources (its Google place, its website,
// its own social pages, its listing page's business node), never from a directory's own page or bio.

import { LISTING_HOSTS, linkKind } from './link-kinds.mjs'

// ITU calling codes by ISO country: enough to read a number written the national way ("050 000 5678") in the place's
// country. A country not listed is read from numbers written with "+" only.
const CALLING_CODES = Object.freeze({
  AE: '971',
  SA: '966',
  QA: '974',
  KW: '965',
  BH: '973',
  OM: '968',
  JO: '962',
  LB: '961',
  EG: '20',
  MA: '212',
  TR: '90',
  IL: '972',
  IN: '91',
  PK: '92',
  BD: '880',
  LK: '94',
  NP: '977',
  VN: '84',
  TH: '66',
  MY: '60',
  SG: '65',
  ID: '62',
  PH: '63',
  CN: '86',
  HK: '852',
  TW: '886',
  JP: '81',
  KR: '82',
  AU: '61',
  NZ: '64',
  US: '1',
  CA: '1',
  MX: '52',
  BR: '55',
  AR: '54',
  CL: '56',
  CO: '57',
  PE: '51',
  GB: '44',
  IE: '353',
  FR: '33',
  DE: '49',
  NL: '31',
  BE: '32',
  LU: '352',
  CH: '41',
  AT: '43',
  IT: '39',
  ES: '34',
  PT: '351',
  GR: '30',
  CY: '357',
  MT: '356',
  DK: '45',
  SE: '46',
  NO: '47',
  FI: '358',
  IS: '354',
  PL: '48',
  CZ: '420',
  SK: '421',
  HU: '36',
  RO: '40',
  BG: '359',
  HR: '385',
  SI: '386',
  RS: '381',
  UA: '380',
  EE: '372',
  LV: '371',
  LT: '370',
  RU: '7',
  KZ: '7',
  ZA: '27',
  NG: '234',
  KE: '254',
  GH: '233',
  TZ: '255',
  ET: '251'
})
const CODES = [...new Set(Object.values(CALLING_CODES))].sort((a, b) => b.length - a.length)
// Italy keeps its leading 0 after the country code (+39 06 …); everywhere else listed it is the trunk prefix.
const KEEP_ZERO = new Set(['39'])
const MIN_DIGITS = 8
const MAX_DIGITS = 15
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''
const digitsOf = (s) => String(s).replace(/\D/g, '')

/** The calling code an E.164 number starts with, among the codes known here; null when none matches. */
export function callingCodeOf(e164) {
  if (typeof e164 !== 'string' || !e164.startsWith('+')) return null
  const d = e164.slice(1)
  return CODES.find((c) => d.startsWith(c)) ?? null
}

/** The calling code of an ISO country code (`AE` → `971`), or null. */
export const callingCodeOfCountry = (country) =>
  typeof country === 'string' ? (CALLING_CODES[country.trim().toUpperCase()] ?? null) : null

/**
 * One number as E.164 (`+971500005678`), or null when it cannot be read as one. Written with `+` or `00` it stands
 * alone; written the national way it needs the place's calling code: a leading trunk 0 is dropped (kept in Italy),
 * and in the +1 area ten digits are a full number. `bare` also reads a national number with no 0 (a profile's phone
 * field, never free text).
 * @param {string} raw @param {{ callingCode?: string | null, bare?: boolean }} [opts]
 */
export function normalizePhone(raw, { callingCode = null, bare = false } = {}) {
  if (!nonEmpty(raw)) return null
  const s = raw.trim()
  const ok = (d) => (d.length >= MIN_DIGITS && d.length <= MAX_DIGITS ? `+${d}` : null)
  if (/^(?:\+|00)/.test(s)) return ok(digitsOf(s.replace(/^00/, '')))
  const d = digitsOf(s)
  if (!callingCode) return null
  if (callingCode === '1') {
    if (d.length === 10 && !/^[01]/.test(d)) return ok(`1${d}`)
    if (d.length === 11 && d.startsWith('1')) return ok(d)
    return null
  }
  if (d.startsWith('0') && !d.startsWith('00'))
    return ok(`${callingCode}${KEEP_ZERO.has(callingCode) ? d : d.slice(1)}`)
  if (bare && d.length >= 7 && d.length <= 11) return ok(`${callingCode}${d}`)
  return null
}

// A run of digits a person writes a phone with: an optional + or 00, then digits with spaces, dots, dashes or
// brackets between them, on one line.
const PHONE_RUN = /(?:\+|\b00|\b0|\b)\d(?:[\d()\-.]|[^\S\r\n]){5,}\d\b/g
const WA_LINK = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?(\d{8,15})/gi
const WHATSAPP_WORD = /whats\s*app|\bwa\b/i

/**
 * The numbers a text (a bio, a page's description) lists, each once, in the order written:
 * `{phone: as written, e164, whatsapp}`. `whatsapp` when "WhatsApp" is written just before it on its line, or the
 * number is a wa.me link.
 * @param {string} text @param {{ callingCode?: string | null }} [opts]
 */
export function phonesInText(text, { callingCode = null } = {}) {
  if (!nonEmpty(text)) return []
  const out = []
  const add = (phone, e164, whatsapp) => {
    const held = out.find((p) => p.e164 === e164)
    if (held) held.whatsapp ||= whatsapp
    else out.push({ phone, e164, whatsapp })
  }
  let rest = String(text)
  for (const m of rest.matchAll(WA_LINK)) add(`+${m[1]}`, `+${m[1]}`, true)
  rest = rest.replace(WA_LINK, ' ')
  let last = 0
  for (const m of rest.matchAll(PHONE_RUN)) {
    const e164 = normalizePhone(m[0], { callingCode })
    if (!e164) continue
    const lineStart = rest.lastIndexOf('\n', m.index) + 1
    const before = rest.slice(Math.max(last, lineStart), m.index)
    add(m[0].trim(), e164, WHATSAPP_WORD.test(before))
    last = m.index + m[0].length
  }
  return out
}

// A directory's own page: a social handle that carries a listing site's name ("mymagicpin").
const LISTING_LABELS = Object.values(LISTING_HOSTS).map((l) => l.toLowerCase().replace(/[^a-z0-9]/g, ''))
const isDirectoryPage = (url) => {
  const handle = typeof url === 'string' ? linkKind(url)?.handle : null
  const key = typeof handle === 'string' ? handle.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  return key !== '' && LISTING_LABELS.some((l) => l.length >= 4 && key.includes(l))
}
const isListingUrl = (url) => typeof url === 'string' && linkKind(url)?.kind === 'listing'

/**
 * @typedef {{ phone: string, e164: string, sources: string[], whatsapp?: boolean }} PhoneEntry
 * @typedef {{ main: PhoneEntry | null, others: PhoneEntry[] }} PhoneDecision
 */

/**
 * Every number the business's own sources state about it (`profile.evidence.phone` and the phones written in each
 * source's `profile.evidence.bio`, plus Google's), and the main one: Google's when Google has one, else the number the
 * most sources state, else the first. A directory's own social page and a listing site's description are never read.
 * @param {{ profile?: any, opportunity?: any }} input
 * @returns {PhoneDecision}
 */
export function decidePhones({ profile = {}, opportunity = null } = {}) {
  const p = profile && typeof profile === 'object' ? profile : {}
  const g = p.googlePlace && typeof p.googlePlace === 'object' ? p.googlePlace : {}
  const evidence = p.evidence && typeof p.evidence === 'object' ? p.evidence : {}
  const socials = p.socials && typeof p.socials === 'object' ? p.socials : {}
  const googleProvider = opportunity?.provider === 'google-places'
  const sourceOf = (s) => (s === 'google-places' ? 'google' : s)
  // A source the business does not own: a directory's social page, or (for its description) a listing site.
  const foreign = (source, { bio = false } = {}) =>
    isDirectoryPage(socials[source]) ||
    (bio && (source === 'listing' || (source === 'website' && isListingUrl(p.website))))
  const googleRaw = [g.internationalPhoneNumber, g.nationalPhoneNumber].find(nonEmpty) ?? null
  const country = (Array.isArray(g.addressComponents) ? g.addressComponents : []).find((c) =>
    (c?.types ?? []).includes('country')
  )
  const fieldClaims = (Array.isArray(evidence.phone) ? evidence.phone : []).filter((e) => nonEmpty(e?.value))
  const plus = [googleRaw, ...fieldClaims.map((e) => e.value)].find((v) => nonEmpty(v) && /^\s*\+/.test(v))
  const callingCode =
    callingCodeOfCountry(country?.shortText ?? country?.short_name) ??
    callingCodeOf(plus ? normalizePhone(plus) : null) ??
    callingCodeOfCountry(opportunity?.candidate?.country)
  /** @type {PhoneEntry[]} */
  const entries = []
  const claim = (raw, e164, source, whatsapp = false) => {
    if (!e164) return
    let held = entries.find((x) => x.e164 === e164)
    if (!held) entries.push((held = { phone: raw.trim(), e164, sources: [] }))
    if (!held.sources.includes(source)) held.sources.push(source)
    if (whatsapp) held.whatsapp = true
  }
  const google = googleRaw ? normalizePhone(googleRaw, { callingCode, bare: true }) : null
  if (google) claim(g.internationalPhoneNumber ?? googleRaw, google, 'google')
  for (const e of fieldClaims)
    for (const source of Array.isArray(e.sources) ? e.sources : []) {
      if (typeof source !== 'string' || foreign(source)) continue
      claim(e.value, normalizePhone(e.value, { callingCode, bare: true }), sourceOf(source))
    }
  for (const e of Array.isArray(evidence.bio) ? evidence.bio : [])
    for (const source of Array.isArray(e?.sources) ? e.sources : []) {
      if (typeof source !== 'string' || foreign(source, { bio: true })) continue
      for (const found of phonesInText(e.value, { callingCode }))
        claim(found.phone, found.e164, sourceOf(source), found.whatsapp)
    }
  const fromGoogle =
    google ?? (googleProvider ? (entries.find((x) => x.sources.includes('google'))?.e164 ?? null) : null)
  let main = fromGoogle ? entries.find((x) => x.e164 === fromGoogle) : null
  if (!main) for (const x of entries) if (!main || x.sources.length > main.sources.length) main = x
  return { main: main ?? null, others: entries.filter((x) => x !== main) }
}

/** The WhatsApp link of a number: its digits after wa.me, as the outreach contacts build it (`outreach.js`). */
export const whatsappLinkOf = (number) => `https://wa.me/${digitsOf(number)}`

// A UAE mobile number: +971 5x (50, 52, 54, 55, 56, 58), then seven digits.
const UAE_MOBILE = /^\+9715\d{8}$/

/**
 * The business's WhatsApp number as a brief carries it (#1780 item 16), or null:
 * - a number its source labels WhatsApp ("WhatsApp" before it, a wa.me link: `phonesInText`), the main number first,
 *   then another, then a wa.me link of the map listing (`contacts.whatsapp`): `verified: true, basis: 'source'`;
 * - else the main number (`decidePhones`: Google's first, else the most stated) when it is a UAE mobile:
 *   `verified: false, basis: 'uae-mobile'`. Only UAE mobiles are inferred; other countries need their own rule.
 * @param {{phone?: string | null, phoneWhatsapp?: boolean, otherPhones?: {phone: string, whatsapp?: boolean}[],
 *   contacts?: Record<string, string>, callingCode?: string | null}} input
 * @returns {{number: string, href: string, verified: boolean, basis: 'source' | 'uae-mobile'} | null}
 */
export function whatsappOf({
  phone = null,
  phoneWhatsapp = false,
  otherPhones = [],
  contacts = {},
  callingCode = null
}) {
  const entry = (number, verified, basis) => ({
    number,
    href: whatsappLinkOf(normalizePhone(number, { callingCode, bare: true }) ?? number),
    verified,
    basis
  })
  if (nonEmpty(phone) && phoneWhatsapp === true) return entry(phone.trim(), true, 'source')
  const other = (Array.isArray(otherPhones) ? otherPhones : []).find(
    (p) => p?.whatsapp === true && nonEmpty(p.phone)
  )
  if (other) return entry(other.phone.trim(), true, 'source')
  const link = [...String(contacts?.whatsapp ?? '').matchAll(WA_LINK)][0]
  if (link) return entry(`+${link[1]}`, true, 'source')
  if (!nonEmpty(phone)) return null
  const e164 = normalizePhone(phone, { callingCode, bare: true })
  return e164 && UAE_MOBILE.test(e164) ? entry(phone.trim(), false, 'uae-mobile') : null
}

/**
 * The WhatsApp number of stored research, as the brief and the place profile both read it (`whatsappOf`): the main phone
 * (the profile's, else the candidate's), the other numbers, the listing's chat links, and the country's calling code
 * from Google's address, else the candidate's country, else the number itself.
 * @param {{profile?: any, candidate?: any, googlePlace?: any}} input `candidate` as read (`candidate-as-read.mjs`)
 */
export function researchWhatsappOf({ profile = {}, candidate = {}, googlePlace = null } = {}) {
  const text = (v) => (typeof v === 'string' && v.trim() ? v : null)
  const phone = text(profile?.phone) ?? text(candidate?.phone)
  const otherPhones = (Array.isArray(profile?.otherPhones) ? profile.otherPhones : [])
    .filter((p) => text(p?.phone) && p.phone !== phone)
    .map((p) => ({ phone: p.phone.trim(), ...(p.whatsapp === true ? { whatsapp: true } : {}) }))
  const country = (googlePlace?.addressComponents ?? []).find((c) => (c?.types ?? []).includes('country'))
  return whatsappOf({
    phone,
    phoneWhatsapp: profile?.phoneWhatsapp === true,
    otherPhones,
    contacts: candidate?.contacts,
    callingCode:
      callingCodeOfCountry(country?.shortText ?? country?.short_name) ??
      callingCodeOfCountry(candidate?.country) ??
      callingCodeOf(normalizePhone(phone))
  })
}

// The contact values the owner types in the build chat (decision D46 as amended, #609): a phone, an email, opening
// hours or a booking link is a VALUE, not prose. It is read in code from the owner's passage (after every sentence
// naming a held text is taken out, `owner-statement.mjs ownerPassageOf`), taken exactly as typed, normalised only by the
// existing rules (`business-phones.mjs withoutStrayPlus`, the hours reader `owner-hours.mjs` over `weekOf`, the URL
// guard's scheme, credential and address rules), never reworded and never held to the echo guard. A value that is not
// one (too few digits, no domain, an unsafe scheme, hours that do not read) is dropped with a reason, never shown; a
// second value of a kind is dropped too (the needs profile holds one). The record never carries a dropped text. Pure.
import { withoutStrayPlus } from './business-phones.mjs'
import { hoursOfSentence } from './owner-hours.mjs'
import { isBlockedAddress } from './url-guard.mjs'

/** The data kinds an owner's value is read as. */
export const OWNER_VALUE_KINDS = Object.freeze([
  'contact.phone',
  'contact.email',
  'contact.hours',
  'contact.cta_url'
])
/** Why a value the owner typed is not used. */
export const OWNER_VALUE_REASONS = Object.freeze({
  not_a_phone: 'not a phone number: fewer than 8 or more than 15 digits',
  not_an_email: 'not an email address',
  unsafe_link:
    'not a safe public web link (a scheme other than http or https, credentials, or a private address)',
  link_not_booking:
    'a link the owner does not name as a booking link: the needs profile reads no other owner link',
  hours_unreadable: 'opening hours that do not read as days and times',
  hours_too_long: 'opening hours longer than a fact value holds',
  second_value: 'a second value of this kind: the needs profile holds one'
})
const HOURS_LIMIT = 200
const PHONE_CUE = /\b(?:call|phone|tel|telephone|ring|text|mobile|cell|whats\s*app|number)\b/iu
const PHONE_RUN = /(?:\+|\b)\d[\d\s().-]{4,}\d/gu
const EMAIL_RUN = /[^\s@<>()"',;:]+@[^\s@<>()"',;]+/gu
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/u
const LINK_RUN = /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.|javascript:|data:|vbscript:|file:)\S+/giu
const BOOKING_CUE =
  /\b(?:book|booking|bookings|reserve|reservation|reservations|appointment|appointments|schedule)\b/iu

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const trailing = (s) => s.replace(/[.,;:!?)\]]+$/u, '')
const sentencesOf = (text) =>
  String(text)
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean)

/** A link the owner typed, as the site would open it, or why it is not one. */
function linkOf(written) {
  const raw = trailing(written)
  if (!/^(?:https?:\/\/|www\.)/iu.test(raw)) return { reason: 'unsafe_link' }
  let url
  try {
    url = new URL(/^www\./iu.test(raw) ? `https://${raw}` : raw)
  } catch {
    return { reason: 'unsafe_link' }
  }
  const host = url.hostname.replace(/^\[|\]$/gu, '')
  const ip = /^[\d.]+$/u.test(host) || host.includes(':')
  if (url.username || url.password || !host.includes('.') || (ip && isBlockedAddress(host)) || ip)
    return { reason: 'unsafe_link' }
  return { value: /^www\./iu.test(raw) ? `https://${raw}` : raw }
}

/**
 * The owner's contact values in a passage of the owner's statement (rules above).
 * @param {string | null | undefined} text the owner's passage (`ownerPassageOf(...).passage.text`)
 * @returns {{values: Array<{kind: string, value: string}>, dropped: Array<{kind: string, reason: string}>} | null}
 *   null when the passage holds no value at all
 */
export function ownerValuesOf(text) {
  if (!isText(text)) return null
  const values = []
  const dropped = []
  const drop = (kind, code) => dropped.push({ kind, code, reason: OWNER_VALUE_REASONS[code] })
  const add = (kind, value) => {
    const held = values.find((v) => v.kind === kind)
    if (!held) values.push({ kind, value })
    else if (held.value !== value) drop(kind, 'second_value')
  }
  const hours = []
  for (const sentence of sentencesOf(text)) {
    let rest = sentence
    for (const m of sentence.matchAll(LINK_RUN)) {
      const link = linkOf(m[0])
      if (link.reason) drop('contact.cta_url', link.reason)
      else if (BOOKING_CUE.test(sentence)) add('contact.cta_url', link.value)
      else drop('contact.cta_url', 'link_not_booking')
      rest = rest.replace(m[0], ' ')
    }
    for (const m of rest.matchAll(EMAIL_RUN)) {
      const email = trailing(m[0])
      if (EMAIL.test(email)) add('contact.email', email)
      else drop('contact.email', 'not_an_email')
      rest = rest.replace(m[0], ' ')
    }
    const read = hoursOfSentence(rest)
    if (read?.lines) hours.push(...read.lines)
    else if (read?.unreadable) drop('contact.hours', 'hours_unreadable')
    for (const m of rest.matchAll(PHONE_RUN)) {
      const written = withoutStrayPlus(m[0].trim())
      if (!written.startsWith('+') && !PHONE_CUE.test(sentence)) continue
      const digits = written.replace(/\D/gu, '').length
      if (digits >= 8 && digits <= 15) add('contact.phone', written)
      else drop('contact.phone', 'not_a_phone')
    }
  }
  if (hours.length) {
    const joined = hours.join('; ')
    if ([...joined].length <= HOURS_LIMIT) values.push({ kind: 'contact.hours', value: joined })
    else drop('contact.hours', 'hours_too_long')
  }
  return values.length || dropped.length ? { values, dropped } : null
}

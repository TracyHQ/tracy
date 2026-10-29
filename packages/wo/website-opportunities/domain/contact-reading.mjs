// The ONE reader of a brief's contact facts (spec TracyHQ/tracy#189, COO rule 29/10/2026). Every contact writer of a brief
// build (the contact record, the contact modules, the footer, the head) reads the facts through `readContact` (or through the
// plan made from it), never from a brief field directly: a place the brief can hold a fact in is listed here, once.
//
// Facts only: a value that is not in the brief is not here. Nothing is invented, rephrased or completed; a chat app on a
// mobile is inferred only by the country table (`messaging-apps.mjs`) and says so.

import { callingCodeOfCountry } from './business-phones.mjs'
import { MESSAGING_LINKS, inferredMessagingAppOf } from './messaging-apps.mjs'

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== ''
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v) => (nonEmpty(v) ? v.trim() : '')

/** The first string among candidates (a plain string, or an object holding one under `keys`). */
function firstText(candidates, keys = ['value', 'text', 'formatted', 'formattedAddress']) {
  for (const c of candidates) {
    if (nonEmpty(c)) return c.trim()
    if (isObj(c)) for (const k of keys) if (nonEmpty(c[k])) return c[k].trim()
  }
  return ''
}

/** An address split in components (street, city, region, postcode, country) joined in reading order, or ''. */
function fromComponents(parts) {
  if (!isObj(parts)) return ''
  const order = [
    'street',
    'streetAddress',
    'address',
    'suburb',
    'locality',
    'city',
    'state',
    'region',
    'postcode',
    'postalCode',
    'country'
  ]
  return order
    .map((k) => text(parts[k]))
    .filter(Boolean)
    .join(', ')
}

/** The coordinates a brief holds for the business (a `{lat, lng|lon}` object), or null. */
function coordinatesOf(brief) {
  const b = brief?.business ?? {}
  for (const c of [b.location, b.coordinates, brief?.googlePlace?.location, brief?.location]) {
    if (!isObj(c)) continue
    const lat = Number(c.lat ?? c.latitude)
    const lon = Number(c.lng ?? c.lon ?? c.longitude)
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
      return { lat, lon }
  }
  return null
}

/** Where the street address is held, in the order they win. Returns `{value, source}` or null. */
function addressOf(brief) {
  const b = brief?.business ?? {}
  const places = [
    ['business.address', firstText([b.address])],
    ['business.location', firstText([b.location])],
    ['business.addressComponents', fromComponents(b.addressComponents)],
    [
      'googlePlace.formattedAddress',
      firstText([brief?.googlePlace?.formattedAddress, brief?.googlePlace?.address])
    ],
    ['contact.address', firstText([brief?.contact?.address])]
  ]
  const hit = places.find(([, v]) => v !== '')
  return hit ? { value: hit[1], source: hit[0] } : null
}

/**
 * The link of the exact pin on Google Maps: Google's own link for the place when the brief holds it, else the place id,
 * else the coordinates, else a search for the full address. Null when the brief holds none of them.
 * @param {any} brief
 * @param {string} [address] - the address as read
 * @returns {{ value: string, via: 'maps-uri' | 'place-id' | 'coordinates' | 'address-search' } | null}
 */
export function mapsLinkOf(brief, address = addressOf(brief)?.value ?? '') {
  const uri = text(brief?.googlePlace?.googleMapsUri)
  if (
    /^https:\/\/(?:www\.)?(?:maps\.google\.[a-z.]+|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(
      uri
    )
  )
    return { value: uri, via: 'maps-uri' }
  const placeId = text(brief?.googlePlace?.placeId)
  if (/^[A-Za-z0-9_-]{4,200}$/.test(placeId)) {
    // The documented keyless form: the search text shows the place's name beside the pin, the id selects it.
    const q = address || text(brief?.business?.name) || 'place'
    return {
      value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}&query_place_id=${encodeURIComponent(placeId)}`,
      via: 'place-id'
    }
  }
  const at = coordinatesOf(brief)
  if (at)
    return {
      value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${at.lat},${at.lon}`)}`,
      via: 'coordinates'
    }
  if (address)
    return {
      value: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      via: 'address-search'
    }
  return null
}

/** The areas the business serves, each as sourced, once. */
export function serviceAreasOf(brief) {
  const list = Array.isArray(brief?.business?.serviceAreas) ? brief.business.serviceAreas : []
  return [...new Set(list.map((a) => (typeof a === 'string' ? a.trim() : text(a?.text))).filter(Boolean))]
}

/**
 * Every contact fact of a brief, each with the brief field it came from. `hoursOf` is the caller's reading of the opening
 * hours (the brief decided them already: sources that disagree leave none), so this module never second-guesses it.
 * @param {any} brief
 * @param {{ hours?: string[] }} [options]
 * @returns {Record<string, {value: string, source: string}>} only the facts the brief holds
 */
export function readContact(brief, { hours = [] } = {}) {
  const b = brief?.business ?? {}
  const c = brief?.contact ?? {}
  const out = {}
  const phone = firstText([b.phone, c.phone])
  if (phone) out.phone = { value: phone, source: nonEmpty(b.phone) ? 'business.phone' : 'contact.phone' }
  const email = firstText([b.email, c.email])
  if (email) out.email = { value: email, source: nonEmpty(b.email) ? 'business.email' : 'contact.email' }
  const address = addressOf(brief)
  if (address) out.address = address
  if (hours.length) out.hours = { value: hours.join('; '), source: 'business.hours' }
  const whatsapp = c?.whatsapp?.number
  if (nonEmpty(whatsapp) && /^\+?\d{8,15}$/.test(whatsapp.replace(/[\s().-]/g, '')))
    out.whatsapp = { value: whatsapp.trim(), source: 'contact.whatsapp' }
  const areas = serviceAreasOf(brief)
  if (areas.length) out.serviceArea = { value: areas.join('; '), source: 'business.serviceAreas' }
  return out
}

const SEPARATOR = /\s+[-–—]\s+|\s*,\s*|\s*\n+\s*/

/** An address cut where the brief itself separates it: each part with the separator written after it. */
function addressParts(value) {
  /** @type {Array<{ text: string, tail: string }>} */
  const parts = []
  let rest = value
  for (;;) {
    const m = SEPARATOR.exec(rest)
    if (!m || m.index === 0) {
      parts.push({ text: rest, tail: '' })
      break
    }
    parts.push({ text: rest.slice(0, m.index), tail: m[0] })
    rest = rest.slice(m.index + m[0].length)
    if (rest === '') break
  }
  return parts
}

/** The city the brief names for the business (its own field, else its address components), or null. */
export function cityOf(brief) {
  const b = brief?.business ?? {}
  const parts = isObj(b.addressComponents) ? b.addressComponents : {}
  return firstText([b.city, parts.city, parts.locality]) || null
}

/**
 * An address that fits a box of `max` characters, cut by whole parts from its most general end (COO rule 29/10/2026):
 * the country first, then the state or emirate, while the street part and the city stay (at least two parts, and never
 * the `city` when it is known). Never inside a word. Null when it cannot fit so: the caller keeps the whole address.
 * The whole address stays the contact fact (the contact record, the schema); only a short box takes this.
 * @param {string} address
 * @param {number} max
 * @param {{ city?: string | null }} [options]
 * @returns {string | null}
 */
export function addressThatFits(address, max, { city = null } = {}) {
  const value = String(address ?? '').trim()
  if (value === '' || !(max > 0) || [...value].length <= max) return value === '' ? null : value
  const parts = addressParts(value)
  const same = (a, b) =>
    String(a).trim().toLowerCase() ===
    String(b ?? '')
      .trim()
      .toLowerCase()
  for (let keep = parts.length - 1; keep >= Math.max(2, parts.length - 2); keep -= 1) {
    if (city && same(parts[keep].text, city)) return null
    const cut = parts
      .slice(0, keep)
      .map((p, i) => p.text + (i < keep - 1 ? p.tail : ''))
      .join('')
    if ([...cut].length <= max) return cut
  }
  return null
}

/**
 * An address split into the lines a template shows it on: the first part on the first line, the rest, in the brief's own
 * words and separators, on the last. The words are never changed, only cut where the brief itself separates them.
 * @param {string} address
 * @param {number} lines - how many lines the template has for it (at least 1)
 * @returns {string[]}
 */
export function addressLines(address, lines) {
  const value = String(address ?? '').trim()
  const count = Math.max(1, Math.floor(lines) || 1)
  if (value === '') return []
  if (count === 1) return [value]
  const parts = addressParts(value)
  if (parts.length <= 1) return [value]
  const out = parts.slice(0, count - 1).map((p) => p.text)
  const last = parts.slice(count - 1)
  // The tail of the last cut part carries the separator the brief used there ("12 Mill Lane, Bakerton" keeps ", ").
  out.push(last.map((p, i) => p.text + (i < last.length - 1 ? p.tail : '')).join(''))
  return out
}

// --- Every channel a visitor can reach the business on (COO rule 29/10/2026) -------------------------------------------
//
// 🔒 EVERY REAL CHANNEL THE BRIEF HOLDS IS SHOWN AND CLICKABLE: each phone (its own `tel:` line), WhatsApp or Zalo on a
// number a source ties to the app, else only as the country table infers it (`messaging-apps.mjs`, marked `inferred`), and
// the official direct-message link of each social network the brief really has. The order is the contact order a writer
// with too little room keeps: call, a chat app, a direct message.

const digitsOf = (v) => String(v ?? '').replace(/\D+/g, '')
const telOf = (v) => (/^\s*\(?\+/.test(String(v)) ? `tel:+${digitsOf(v)}` : `tel:${digitsOf(v)}`)
/** First path segments of a social site that are no account (a post, a reel, a share door). */
const NOT_A_HANDLE =
  /^(?:p|reel|reels|tv|explore|stories|share|sharer|sharer\.php|groups|events|watch|hashtag|login|pages)$/i

/** The account a social page link names, or null. */
function handleOf(network, url) {
  let u
  try {
    u = new URL(String(url ?? '').trim())
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, '')
  const first = u.pathname.split('/').filter(Boolean)[0] ?? ''
  if (network === 'instagram' && host === 'instagram.com')
    return /^[A-Za-z0-9._]{1,30}$/.test(first) && !NOT_A_HANDLE.test(first) ? first : null
  if (network === 'facebook' && /^(?:facebook\.com|fb\.com)$/.test(host)) {
    if (first === 'profile.php')
      return /^\d+$/.test(u.searchParams.get('id') ?? '') ? u.searchParams.get('id') : null
    return /^[A-Za-z0-9.-]{2,80}$/.test(first) && !NOT_A_HANDLE.test(first) ? first : null
  }
  if (network === 'tiktok' && host === 'tiktok.com')
    return /^@[A-Za-z0-9._]{2,24}$/.test(first) ? first : null
  return null
}

/** The label of a chat app line: "WhatsApp us", "Zalo us"; with its number when the app has two. */
const APP_NAMES = Object.freeze({ whatsapp: 'WhatsApp', zalo: 'Zalo' })

/** Whether the brief's own WhatsApp number is an inference (`contact.whatsapp` schema 1 `verified: false`, or its fact). */
function whatsappInferred(brief) {
  const w = brief?.contact?.whatsapp
  if (w?.verified === false) return true
  const fact = Array.isArray(brief?.facts) ? brief.facts.find((f) => f?.id && f.id === w?.factId) : null
  return fact?.confidence === 'inferred'
}

/**
 * The chat app channels of a brief (WhatsApp, Zalo): each number a source ties to an app first; then, for an app with no
 * sourced number, the first phone that is a mobile of a country `MESSAGING_APP_BY_COUNTRY` lists for it, marked
 * `inferred` (a landline and a country not listed never are).
 */
function messagingChannelsOf(brief, phones) {
  const b = brief?.business ?? {}
  const c = brief?.contact ?? {}
  const others = Array.isArray(b.otherPhones) ? b.otherPhones : []
  const callingCode = callingCodeOfCountry(b.country)
  /** @type {Array<{app: 'whatsapp' | 'zalo', value: string, digits: string, source: string, inferred: boolean,
   *   country?: string}>} */
  const found = []
  const seen = new Set()
  const add = (app, value, source, inferred, country, digits = digitsOf(value)) => {
    const d = digits
    if (!/^\d{8,15}$/.test(d) || seen.has(`${app}:${d}`)) return
    seen.add(`${app}:${d}`)
    found.push({ app, value: value.trim(), digits: d, source, inferred, ...(country ? { country } : {}) })
  }
  // Sourced: a number the brief ties to the app (an upstream inference of the brief itself keeps its mark).
  if (nonEmpty(c?.whatsapp?.number))
    add('whatsapp', c.whatsapp.number, 'contact.whatsapp', whatsappInferred(brief))
  if (nonEmpty(c?.zalo?.number)) add('zalo', c.zalo.number, 'contact.zalo', false)
  for (const p of others) {
    if (p?.whatsapp === true && nonEmpty(p.phone)) add('whatsapp', p.phone, 'business.otherPhones', false)
    if (p?.zalo === true && nonEmpty(p.phone)) add('zalo', p.phone, 'business.otherPhones', false)
  }
  // A sourced number of an app wins: the app's inferred ones go.
  for (const app of Object.keys(APP_NAMES))
    if (found.some((f) => f.app === app && !f.inferred))
      for (let i = found.length - 1; i >= 0; i -= 1)
        if (found[i].app === app && found[i].inferred) found.splice(i, 1)
  // Inferred: the first mobile of a listed country, for an app the brief has no number for.
  for (const phone of phones) {
    const guess = inferredMessagingAppOf(phone.value, { callingCode })
    if (!guess || found.some((f) => f.app === guess.app)) continue
    add(guess.app, phone.value, phone.source, true, guess.country, guess.digits)
  }
  const order = Object.keys(APP_NAMES)
  found.sort((x, y) => order.indexOf(x.app) - order.indexOf(y.app))
  return found.map((f) => {
    const twice = found.filter((g) => g.app === f.app).length > 1
    return {
      kind: f.app,
      value: f.value,
      href: MESSAGING_LINKS[f.app](f.digits),
      label: twice ? `${APP_NAMES[f.app]} ${f.value}` : `${APP_NAMES[f.app]} us`,
      source: f.source,
      ...(f.inferred ? { inferred: true } : {}),
      ...(f.country ? { country: f.country } : {})
    }
  })
}

/**
 * The channels of a brief in the contact order: each phone, each chat app number (WhatsApp, Zalo: `messagingChannelsOf`),
 * each direct message.
 * @param {any} brief
 * @returns {Array<{kind: 'phone' | 'whatsapp' | 'zalo' | 'message', value: string, href: string, label: string, source: string,
 *   network?: string, inferred?: true, country?: string}>}
 */
export function contactChannelsOf(brief) {
  const b = brief?.business ?? {}
  const c = brief?.contact ?? {}
  const phones = []
  const seen = new Set()
  const addPhone = (value, source) => {
    const d = digitsOf(value)
    if (d.length < 6 || seen.has(d)) return
    seen.add(d)
    phones.push({
      kind: 'phone',
      value: value.trim(),
      href: telOf(value),
      label: `Call ${value.trim()}`,
      source
    })
  }
  const main = firstText([b.phone, c.phone])
  if (main) addPhone(main, nonEmpty(b.phone) ? 'business.phone' : 'contact.phone')
  const others = Array.isArray(b.otherPhones) ? b.otherPhones : []
  for (const p of others) if (nonEmpty(p?.phone)) addPhone(p.phone, 'business.otherPhones')

  const chats = messagingChannelsOf(brief, phones)
  const socials = isObj(b.socials) ? b.socials : {}
  const messages = []
  const ig = handleOf('instagram', socials.instagram)
  if (ig)
    messages.push({
      kind: 'message',
      network: 'instagram',
      value: 'instagram',
      href: `https://ig.me/m/${ig}`,
      label: 'Message us on Instagram',
      source: 'business.socials.instagram'
    })
  const fb = handleOf('facebook', socials.facebook)
  if (fb)
    messages.push({
      kind: 'message',
      network: 'facebook',
      value: 'facebook',
      href: `https://m.me/${fb}`,
      label: 'Message us on Facebook',
      source: 'business.socials.facebook'
    })
  // TikTok gives no link that opens a message: its profile, only when no network above gives one.
  const tt = messages.length === 0 ? handleOf('tiktok', socials.tiktok) : null
  if (tt)
    messages.push({
      kind: 'message',
      network: 'tiktok',
      value: 'tiktok',
      href: `https://www.tiktok.com/${tt}`,
      label: 'Find us on TikTok',
      source: 'business.socials.tiktok'
    })
  return [...phones, ...chats, ...messages]
}

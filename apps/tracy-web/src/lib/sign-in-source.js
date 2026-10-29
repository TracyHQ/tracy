/**
 * Where a first sign-in came from: the four `utm_*` parameters a link carried, kept on the
 * admission (`otp_code.admission` → `/verify` → `account.beta_admission`) and on the
 * `account.first_sign_in` operation signal (`./ops-signal.js`).
 *
 * The values come from an address anybody can type, and they end up in the database and in a
 * Telegram message, so every door that reads them reads them through `signInSource` and nothing
 * else: a value that is not a string is dropped, accents are folded, everything outside
 * `a-z 0-9 - _ .` is removed, and what is left is cut to 64 characters. `medium` is further held
 * to a closed set, because the daily summary counts by it: an open set would let any typed value
 * open a new line in that message.
 *
 * Nothing is stored on the visitor's browser. A source travels on the address only: on `/login`'s
 * own query, or inside its `next` when a guarded page sent the visitor there (`sourceFromNext`).
 */
import { safePath } from './safe-path.js'

export const SOURCE_KEYS = Object.freeze(['source', 'medium', 'campaign', 'content'])
export const MEDIUMS = Object.freeze([
  'email',
  'blog',
  'demo',
  'site',
  'forum',
  'product-page',
  'helpdesk',
  'social',
  'video',
  'owned'
])
const MAX_LENGTH = 64

/** One value, cleaned, or `null` when nothing usable is left. */
export function cleanSourceValue(value) {
  if (typeof value !== 'string') return null
  const cleaned = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, MAX_LENGTH)
  return cleaned === '' ? null : cleaned
}

/**
 * The source carried by `params` (a `URLSearchParams`, or a plain object such as a parsed form
 * or JSON body), or `null` when it carries none. Only `utm_source`, `utm_medium`, `utm_campaign`
 * and `utm_content` are read.
 */
export function signInSource(params) {
  if (!params || typeof params !== 'object') return null
  const read = (key) =>
    typeof params.get === 'function' && !(params instanceof Map)
      ? params.get(`utm_${key}`)
      : params[`utm_${key}`]
  const source = {}
  for (const key of SOURCE_KEYS) {
    const value = cleanSourceValue(read(key))
    if (value === null) continue
    source[key] = key === 'medium' && !MEDIUMS.includes(value) ? 'other' : value
  }
  return Object.keys(source).length ? source : null
}

/**
 * The host of the page that linked to `/login` (`params.referrer`, sent by the page's own script),
 * cleaned like a source value, or `null`. A host only: the script never sends a path or query, and
 * a value carrying either is refused rather than trimmed, so nothing past the host is ever kept.
 */
export function visitReferrer(params) {
  if (!params || typeof params !== 'object' || typeof params.referrer !== 'string') return null
  if (/[/?#@:]/.test(params.referrer)) return null
  return cleanSourceValue(params.referrer)
}

/** The source inside a `next` value, read only once `safePath` has kept it on this origin. */
export function sourceFromNext(next, origin) {
  if (typeof next !== 'string' || next === '') return null
  try {
    return signInSource(new URL(safePath(next, origin)).searchParams)
  } catch {
    return null
  }
}

/** The source a request names: its own parameters first, then the ones inside its `next`. */
export function requestSource(params, next, origin) {
  return signInSource(params) ?? sourceFromNext(next, origin)
}

/** `admission` with `source` on it, or `admission` untouched when there is no source. */
export function withSource(admission, source) {
  return source ? { ...admission, source } : admission
}

/** The source as a query string (`utm_source=…&…`), empty when there is none. */
export function sourceQuery(source) {
  if (!source) return ''
  const params = new URLSearchParams()
  for (const key of SOURCE_KEYS) if (source[key]) params.set(`utm_${key}`, source[key])
  return params.toString()
}

/** One line for a message: `joomlart · email · tracy-beta-2026-10 · members-cta`, or `''`. */
export function sourceText(source) {
  if (!source || typeof source !== 'object') return ''
  return SOURCE_KEYS.map((key) => cleanSourceValue(source[key]))
    .filter(Boolean)
    .join(' · ')
}

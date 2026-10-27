/**
 * The contribution contract `wo-contribution/v1` (ADR 0036 Phase 3). A contribution names one subject (a business by
 * an identity of a source) and carries 1 to 50 typed observations. The field list is CLOSED and each field has its own
 * value check; nothing else is accepted, and a seller's private pipeline (deal status, notes, brief, demo, outreach)
 * is refused wherever it appears. Each observation is accepted for verification or rejected on its own.
 *
 * `source` and `observedAtClaimed` are the contributor's claims, kept to compare against what the hub reads itself.
 */

export const CONTRIBUTION_SCHEMA = 'wo-contribution/v1'
export const POLICY_VERSION = 'hub-intake/1'
export const MAX_OBSERVATIONS = 50
/** A claimed observation time may run ahead of the hub's clock by at most this much. */
const FUTURE_SLACK_MS = 24 * 60 * 60_000

const ENVELOPE_KEYS = new Set(['schema', 'subject', 'observations'])
const OBSERVATION_KEYS = new Set(['field', 'value', 'source', 'observedAtClaimed'])
const NAMESPACE_RE = /^[a-z][a-z0-9_]{1,31}$/
const SOCIAL_NETWORKS = new Set(['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'pinterest'])
// Key fragments of a seller's own pipeline; compared on the key lower-cased with only letters and digits kept.
const PRIVATE_FRAGMENTS = [
  'deal',
  'pipeline',
  'note',
  'brief',
  'demo',
  'outreach',
  'draft',
  'private',
  'assignee'
]

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v, max) => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const exactKeys = (v, required, optional = []) =>
  isObject(v) &&
  required.every((k) => k in v) &&
  Object.keys(v).every((k) => required.includes(k) || optional.includes(k))
const isPrivateKey = (key) => {
  const k = String(key)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return PRIVATE_FRAGMENTS.some((f) => k.includes(f))
}

/** The dotted path of the first private key anywhere inside `value`, or null. */
export function findPrivateField(value, path = '') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findPrivateField(value[i], `${path}[${i}]`)
      if (hit) return hit
    }
    return null
  }
  if (!isObject(value)) return null
  for (const [key, inner] of Object.entries(value)) {
    const at = path ? `${path}.${key}` : key
    if (isPrivateKey(key)) return at
    const hit = findPrivateField(inner, at)
    if (hit) return hit
  }
  return null
}

function httpUrl(v) {
  const s = text(v, 2048)
  if (!s) return null
  let url
  try {
    url = new URL(s)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  url.hash = ''
  return url.href
}

const weekTime = (t) =>
  exactKeys(t, ['day', 'hour', 'minute']) &&
  [t.day, t.hour, t.minute].every(Number.isInteger) &&
  t.day >= 0 &&
  t.day <= 6 &&
  t.hour >= 0 &&
  t.hour <= 24 &&
  t.minute >= 0 &&
  t.minute <= 59
const weekTimeKey = (t) => `${t.day}:${String(t.hour).padStart(2, '0')}${String(t.minute).padStart(2, '0')}`

/**
 * Google-style weekly periods (`{open: {day, hour, minute}, close?}`, day 0 = Sunday) as sorted, de-duplicated
 * `"D:HHMM-D:HHMM"` keys (`"D:HHMM-"` when open with no close), so two readings of one week compare equal.
 * Undefined when the list is not a valid week.
 */
export function weeklyPeriods(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 28) return undefined
  const keys = []
  for (const p of list) {
    if (!exactKeys(p, ['open'], ['close']) || !weekTime(p.open)) return undefined
    if (p.close !== undefined && !weekTime(p.close)) return undefined
    keys.push(`${weekTimeKey(p.open)}-${p.close ? weekTimeKey(p.close) : ''}`)
  }
  return [...new Set(keys)].sort()
}

const finite = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

/** Each field's value check: the normalized value, or undefined when it is not a valid value of that field. */
export const HUB_FIELDS = Object.freeze({
  identity: (v) =>
    exactKeys(v, ['namespace', 'externalId']) && NAMESPACE_RE.test(v.namespace) && text(v.externalId, 512)
      ? { namespace: v.namespace, externalId: v.externalId.trim() }
      : undefined,
  name: (v) => text(v, 300) ?? undefined,
  website: (v) => httpUrl(v) ?? undefined,
  phone: (v) => {
    const s = text(v, 40)
    if (!s || !/^\+?[0-9 ()./-]+$/.test(s)) return undefined
    const digits = s.replace(/\D/g, '')
    if (digits.length < 6 || digits.length > 15) return undefined
    return s.startsWith('+') ? `+${digits}` : digits
  },
  email: (v) => {
    const s = text(v, 254)
    return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : undefined
  },
  address: (v) => text(v, 500) ?? undefined,
  location: (v) =>
    exactKeys(v, ['latitude', 'longitude'], ['accuracyMeters']) &&
    finite(v.latitude, -90, 90) &&
    finite(v.longitude, -180, 180) &&
    (v.accuracyMeters === undefined || finite(v.accuracyMeters, 0, 100_000))
      ? {
          latitude: v.latitude,
          longitude: v.longitude,
          ...(v.accuracyMeters !== undefined ? { accuracyMeters: v.accuracyMeters } : {})
        }
      : undefined,
  rating: (v) =>
    exactKeys(v, ['rating', 'reviewCount']) &&
    finite(v.rating, 0, 5) &&
    Number.isInteger(v.reviewCount) &&
    v.reviewCount >= 0
      ? { rating: v.rating, reviewCount: v.reviewCount }
      : undefined,
  social_profile: (v) =>
    exactKeys(v, ['network', 'url']) && SOCIAL_NETWORKS.has(v.network) && httpUrl(v.url)
      ? { network: v.network, url: httpUrl(v.url) }
      : undefined,
  opening_hours: (v) => {
    if (!exactKeys(v, [], ['weekdayText', 'periods'])) return undefined
    const weekdayText =
      Array.isArray(v.weekdayText) &&
      v.weekdayText.length >= 1 &&
      v.weekdayText.length <= 7 &&
      v.weekdayText.every((d) => text(d, 200))
        ? v.weekdayText.map((d) => d.trim())
        : undefined
    const periods = v.periods === undefined ? undefined : weeklyPeriods(v.periods)
    if ((v.weekdayText !== undefined && !weekdayText) || (v.periods !== undefined && !periods))
      return undefined
    if (!weekdayText && !periods) return undefined
    return { ...(weekdayText ? { weekdayText } : {}), ...(periods ? { periods } : {}) }
  },
  category: (v) => text(v, 100) ?? undefined,
  // A reference only: the hub fetches the picture itself, never takes uploaded bytes.
  photo_ref: (v) => (exactKeys(v, ['url']) && httpUrl(v.url) ? { url: httpUrl(v.url) } : undefined)
})

function source(v) {
  return exactKeys(v, ['family', 'objectId']) && NAMESPACE_RE.test(v.family) && text(v.objectId, 512)
    ? { family: v.family, objectId: v.objectId.trim() }
    : null
}

function observation(raw, ordinal, now) {
  const rejected = (reason) => ({
    ordinal,
    field: typeof raw?.field === 'string' ? raw.field.slice(0, 64) : '',
    value: null,
    source: null,
    observedAtClaimed: null,
    status: 'rejected',
    reason
  })
  if (!isObject(raw)) return rejected('invalid_observation')
  if (findPrivateField(raw) || (typeof raw.field === 'string' && isPrivateKey(raw.field)))
    return rejected('private_field')
  if (Object.keys(raw).some((k) => !OBSERVATION_KEYS.has(k))) return rejected('unknown_key')
  const check = Object.hasOwn(HUB_FIELDS, raw.field) ? HUB_FIELDS[raw.field] : null
  if (!check) return rejected('field_not_allowed')
  const value = check(raw.value)
  if (value === undefined) return rejected('invalid_value')
  const src = source(raw.source)
  if (!src) return rejected('invalid_source')
  let observedAtClaimed = null
  if (raw.observedAtClaimed !== undefined) {
    const at = typeof raw.observedAtClaimed === 'string' ? Date.parse(raw.observedAtClaimed) : NaN
    if (!Number.isFinite(at) || at > now + FUTURE_SLACK_MS) return rejected('invalid_observed_at')
    observedAtClaimed = new Date(at).toISOString()
  }
  return { ordinal, field: raw.field, value, source: src, observedAtClaimed, status: 'pending', reason: null }
}

/**
 * @param {unknown} body the parsed request body
 * @param {{ now?: number }} [options]
 * @returns {{ ok: true, subject: {namespace: string, externalId: string}, observations: object[] }
 *   | { ok: false, code: string, path?: string }}
 */
export function parseContribution(body, { now = Date.now() } = {}) {
  if (!isObject(body)) return { ok: false, code: 'invalid_contribution' }
  const { observations: list, ...envelope } = body
  const leak = findPrivateField(envelope)
  if (leak) return { ok: false, code: 'private_field', path: leak }
  if (Object.keys(body).some((k) => !ENVELOPE_KEYS.has(k))) return { ok: false, code: 'unknown_key' }
  if (body.schema !== CONTRIBUTION_SCHEMA) return { ok: false, code: 'unsupported_schema' }
  const identity = exactKeys(body.subject, ['identity'])
    ? HUB_FIELDS.identity(body.subject.identity)
    : undefined
  if (!identity) return { ok: false, code: 'invalid_subject' }
  if (!Array.isArray(list) || list.length === 0) return { ok: false, code: 'no_observations' }
  if (list.length > MAX_OBSERVATIONS) return { ok: false, code: 'too_many_observations' }
  return { ok: true, subject: identity, observations: list.map((raw, i) => observation(raw, i, now)) }
}

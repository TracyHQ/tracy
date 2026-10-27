import { confidenceOf, conflictIdsOf, derivationCode, INFERRED_METHOD } from './fact-confidence.mjs'

// v2 (#1791): every item also carries `confidence`, `onSite`, `decidedBy` and `reasons`.
const POLICY_VERSION = 'demo-evidence/2'
// Match domain/brief.mjs: exactly 365 days is still current.
const STALE_AFTER_MS = 365 * 24 * 3600 * 1000
const IDENTITY = new Set([
  'name',
  'branch',
  'address',
  'addressComponents',
  'location',
  'phone',
  'email',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'hours'
])
// Google and Tripadvisor reviews, ratings and reviewer avatars may show on a demo, kept verbatim.
const REVIEW_PLATFORMS = new Set(['google-maps', 'google-places', 'tripadvisor'])
// Counts a platform published: true of the day they were read, never a claim about the place today.
const RECORD_STATISTICS = new Set(['rating', 'reviewCount', 'followers', 'likes', 'subscribers', 'posts'])
/**
 * The inferred kinds a demo may show (closed list, ADR 0037 amendment of 26/10/2026): the WhatsApp button inferred from
 * a UAE mobile number. Any other inferred fact stays off the site until the owner switches it on.
 */
export const ALLOWED_INFERRED_KINDS = Object.freeze(new Set(['whatsapp-uae-mobile']))
// Reasons to doubt a fact the profile names in its derivation (`"<code>: <why>"`): such a fact is withheld.
const WITHHELD_DERIVATION_CODES = new Set([
  'implausible-all-week-hours',
  'few-reviews',
  'review-only-person',
  'owner-left-off'
])
// Any of these keeps a fact off the site by rule.
const OFF_SITE_REASONS = new Set([
  'stale',
  'not-on-demo',
  'evidence-not-found',
  'sender-sensitive-fact',
  'inferred-kind-not-allowed',
  ...WITHHELD_DERIVATION_CODES
])
const CONTACT_LINKS = new Set([
  'website',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'contact',
  'email',
  'phone',
  'menu'
])

/** The kind id of an inferred fact the allowed list names, or the derivation's code (`fact-confidence.mjs`). */
function inferredKindOf(fact, path) {
  const code = derivationCode(fact)
  if (code === 'whatsapp-uae-mobile')
    return path[0] === 'links' && fact.value?.kind === 'whatsapp' ? code : null
  return code
}

/** The owner's choice for one fact id: `{onSite: boolean}` (the stored shape) or a bare boolean; anything else is none. */
function ownerChoice(overrides, factId) {
  const held = overrides instanceof Map ? overrides.get(factId) : overrides?.[factId]
  const onSite = typeof held === 'boolean' ? held : held?.onSite
  return typeof onSite === 'boolean' ? onSite : null
}

/**
 * Which facts of a place profile a demo may show. The origin comes from the host's write path, never from a sender's
 * declared source kind; `at: null` judges no age (a deterministic read with no clock).
 *
 * Each item: `{factId, status, reasonCodes, policyVersion, confidence, onSite, decidedBy, reasons}` (#1791). `onSite`
 * is the one answer to "may this go on the site": the rule's (accepted and no reason to doubt; an inferred fact only
 * for an allowed kind), unless the owner chose otherwise for that fact id in `overrides`
 * (`{[factId]: {onSite}}`, as kept on the opportunity's candidate as `factOverrides`). An override naming no fact of
 * this profile is inert.
 */
export function assessProfile(
  profile,
  { origin, at = new Date().toISOString(), seenAt = {}, overrides = null } = {}
) {
  const sources = new Map(profile.sources.map((s) => [s.id, s]))
  const evidence = new Map(profile.evidence.map((e) => [e.id, e]))
  const conflictIds = conflictIdsOf(profile)
  const assessed = []
  const time = at === null ? Number.NaN : Date.parse(at)
  function assess(fact, path) {
    const confidence = confidenceOf(fact, { profile, path, conflictIds })
    const code = derivationCode(fact)
    const doubted = code && WITHHELD_DERIVATION_CODES.has(code) ? code : null
    const inferredKind =
      confidence === 'inferred' && fact.derivation?.method === INFERRED_METHOD
        ? inferredKindOf(fact, path)
        : null
    const disallowedInference =
      fact.derivation?.method === INFERRED_METHOD && !ALLOWED_INFERRED_KINDS.has(inferredKind)
    const refs = fact.evidenceRefs.map((id) => evidence.get(id))
    const from = refs.map((ref) => sources.get(ref?.sourceId))
    const restricted =
      Array.isArray(fact.value?.restrictions) && fact.value.restrictions.includes('not-on-demo')
    // A review or score a platform published, cited to its page: a sender may pass it on, never author it.
    const platformCited =
      refs.length > 0 &&
      from.every((s) => REVIEW_PLATFORMS.has(s?.kind) && /^https:\/\//i.test(s?.ref ?? '')) &&
      ((path[0] === 'quotes' && fact.value?.kind === 'review') ||
        (path[0] === 'claims' && path[1] === 'statistics'))
    const reasonCodes = restricted ? ['not-on-demo'] : []
    // A review, a published count or a guest's photo stays true however old; the age rule is for present-state facts.
    const record =
      (path[0] === 'quotes' && ['review', 'testimonial'].includes(fact.value?.kind)) ||
      (path[0] === 'claims' && path[1] === 'statistics' && RECORD_STATISTICS.has(fact.value?.label)) ||
      (path[0] === 'media' && from.length > 0 && from.every((s) => REVIEW_PLATFORMS.has(s?.kind)))
    const stale =
      !record &&
      [seenAt[fact.id], fact.value?.publishedAt, fact.value?.asOf, ...from.map((s) => s?.collectedAt)].some(
        (date) =>
          typeof date === 'string' &&
          Number.isFinite(Date.parse(date)) &&
          time - Date.parse(date) > STALE_AFTER_MS
      )
    if (stale) reasonCodes.push('stale')
    if (doubted) reasonCodes.push(doubted)
    if (disallowedInference) reasonCodes.push('inferred-kind-not-allowed')
    let status
    if (refs.some((ref) => !ref) || from.some((source) => !source)) {
      status = 'rejected'
      reasonCodes.push('evidence-not-found')
    } else if (restricted || doubted || disallowedInference) {
      status = 'withheld'
    } else if (stale) {
      status = 'stale'
    } else if (!refs.length) {
      status = 'unassessed'
      reasonCodes.push('no-evidence')
    } else if (origin !== 'research' && origin !== 'sender') {
      status = 'unassessed'
      reasonCodes.push('unknown-origin')
    } else if (origin === 'sender' || from.some((s) => s.kind === 'sender-statement')) {
      if (platformCited) {
        status = 'accepted'
        reasonCodes.push('platform-cited')
      } else if (
        path[0] === 'people' ||
        path[0] === 'claims' ||
        (path[0] === 'quotes' && ['testimonial', 'review'].includes(fact.value.kind))
      ) {
        status = 'withheld'
        reasonCodes.push('sender-sensitive-fact')
      } else if (
        (path[0] === 'business' && IDENTITY.has(path[1])) ||
        path[0] === 'classification' ||
        path[0] === 'offerings' ||
        (path[0] === 'links' && CONTACT_LINKS.has(fact.value.kind))
      ) {
        status = 'accepted'
        reasonCodes.push('sender-statement')
      } else {
        status = 'unassessed'
        reasonCodes.push('sender-unsupported-fact')
      }
    } else {
      status = 'accepted'
      reasonCodes.push('research-evidence')
    }
    const allowedInference = ALLOWED_INFERRED_KINDS.has(inferredKind)
    if (allowedInference) reasonCodes.push('allowed-inferred-kind')
    const ruleOnSite =
      !reasonCodes.some((r) => OFF_SITE_REASONS.has(r)) &&
      (status === 'accepted' || (allowedInference && status === 'unassessed'))
    const owner = ownerChoice(overrides, fact.id)
    assessed.push({
      factId: fact.id,
      status,
      reasonCodes,
      policyVersion: POLICY_VERSION,
      confidence,
      onSite: owner ?? ruleOnSite,
      decidedBy: owner === null ? 'rule' : 'owner',
      reasons: owner === null ? [...reasonCodes] : [...reasonCodes, 'owner-override']
    })
  }
  function walk(value, path) {
    if (!value || typeof value !== 'object') return
    if (Object.hasOwn(value, 'value') && Array.isArray(value.evidenceRefs)) {
      assess(value, path)
      return // Provider data inside a fact's value is not another fact.
    }
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key])
  }
  for (const key of [
    'business',
    'classification',
    'offerings',
    'people',
    'claims',
    'faqs',
    'quotes',
    'events',
    'media',
    'brand',
    'links',
    'conflicts',
    'extensions'
  ])
    walk(profile[key], [key])
  return assessed
}

/**
 * The on-site decision of every fact of a profile (#1791): `Map<factId, {confidence, onSite, decidedBy, reasons}>`.
 * Research origin and the profile's own `madeAt` by default, so the read is deterministic.
 */
export function factDecisions(
  profile,
  { overrides = null, origin = 'research', at = profile?.madeAt ?? null, seenAt = {} } = {}
) {
  const out = new Map()
  if (!profile) return out
  for (const row of assessProfile(profile, { origin, at, seenAt, overrides }))
    out.set(row.factId, {
      confidence: row.confidence,
      onSite: row.onSite,
      decidedBy: row.decidedBy,
      reasons: row.reasons
    })
  return out
}

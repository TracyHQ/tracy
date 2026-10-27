/** Server-only synthetic source contract; none of these facts authorize real sending. */
export const SOURCE_NAMES = Object.freeze(['membership', 'marketingBasis', 'amember', 'sendy', 'tracy'])
export const SOURCE_NAMESPACE = 'synthetic:invitations:v1'
export const SOURCE_COVERAGE_KEY = 'foundation-v1'
export const SOURCE_POLICY = Object.freeze({
  version: 'synthetic:readiness-v1',
  maxAgeMs: 600000,
  requiredSendyCoverage: Object.freeze(['synthetic:list-a'])
})
export const PERSONALIZATION_FIELDS = Object.freeze([
  'first_name',
  'plan',
  'last_template',
  'cms',
  'company',
  'website',
  'basis_evidence_ref'
])

/** @typedef {'membership'|'marketingBasis'|'amember'|'sendy'|'tracy'} Source */
/** @typedef {{status:'known'|'unknown',value:object|string|null,sourceVersion:string,evidenceRefs:string[],memberIds:string[],asOf:string,checkedAt:string,validUntil:string}} Fact */
/** @typedef {{source:Source,subjectKey:string,sourceVersion:number,operation:'upsert'|'delete',identities:string[],destination:string|null,fact:Fact|null,personalization:Record<string,string|null>,evidenceRef:string}} Observation */
/** @typedef {{schemaVersion:'1.0',namespace:string,coverageKey:string,phase:'snapshot'|'changes',fenceCursor:string,inputToken:string|null,nextToken:string|null,complete:boolean,coverage:Source[],observations:Observation[]}} SourcePage */

export function sourceError(code, status = 400) {
  return Object.assign(new Error(code), { code, status })
}
const fail = (code) => {
  throw sourceError(code)
}
const object = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))
const keys = (value, allowed) =>
  object(value) &&
  Reflect.ownKeys(value).every(
    (key) =>
      typeof key === 'string' &&
      allowed.includes(key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')
  )
const string = (value) => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 16384
export const safeSourceVersion = (value) => Number.isSafeInteger(value) && value >= 1
export const syntheticMember = (value) =>
  typeof value === 'string' && /^sandbox-[a-zA-Z0-9_-]{1,120}$/.test(value)
export const syntheticDestination = (value) =>
  typeof value === 'string' &&
  value === value.toLowerCase() &&
  value.length <= 254 &&
  /^[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:test|invalid)$/.test(
    value
  )
export function sourceTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const number = Date.parse(value)
  return Number.isFinite(number) && new Date(number).toISOString() === value
}

// Count before serialization, rejecting getters/cycles and bounding traversal/allocation.
function bound(value, seen = new Set(), depth = 0, budget = { bytes: 0 }) {
  if (depth > 12) fail('source_page_limit')
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > 16384) fail('source_page_limit')
    budget.bytes += 2
    for (const point of value)
      budget.bytes += /["\\]/.test(point) ? 2 : point.charCodeAt(0) < 32 ? 6 : Buffer.byteLength(point)
  } else if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    budget.bytes += 24
  else if (Array.isArray(value) || object(value)) {
    if (seen.has(value)) fail('source_schema_invalid')
    seen.add(value)
    const names = Reflect.ownKeys(value).filter((key) => !(Array.isArray(value) && key === 'length'))
    if (names.length > 200) fail('source_page_limit')
    for (const name of names) {
      if (typeof name !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(name))
        fail('source_schema_invalid')
      const descriptor = Object.getOwnPropertyDescriptor(value, name)
      if (!Object.hasOwn(descriptor, 'value')) fail('source_schema_invalid')
      bound(name, seen, depth + 1, budget)
      bound(descriptor.value, seen, depth + 1, budget)
      budget.bytes += 2
      if (budget.bytes > 1024 * 1024) fail('source_page_limit')
    }
    seen.delete(value)
    budget.bytes += 2
  } else fail('source_schema_invalid')
  if (budget.bytes > 1024 * 1024) fail('source_page_limit')
}

function validValue(source, value) {
  switch (source) {
    case 'membership':
      return (
        keys(value, ['eligible', 'lifetime', 'expiresAt']) &&
        typeof value.eligible === 'boolean' &&
        typeof value.lifetime === 'boolean' &&
        (value.expiresAt === null ? value.lifetime || !value.eligible : sourceTimestamp(value.expiresAt))
      )
    case 'marketingBasis':
      return ['allowed', 'denied'].includes(value)
    case 'amember':
      return keys(value, ['globalUnsubscribed']) && typeof value.globalUnsubscribed === 'boolean'
    case 'sendy':
      return (
        keys(value, ['state', 'coverage']) &&
        ['clear', 'unsubscribed', 'bounced', 'complained'].includes(value.state) &&
        Array.isArray(value.coverage) &&
        value.coverage.every((id) => string(id) && id.startsWith('synthetic:'))
      )
    case 'tracy':
      return keys(value, ['suppressed']) && typeof value.suppressed === 'boolean'
    default:
      return false
  }
}

/** Validate a bounded source page without preserving unknown nested fields. */
export function validateSourcePage(page) {
  bound(page)
  if (
    !keys(page, [
      'schemaVersion',
      'namespace',
      'coverageKey',
      'phase',
      'fenceCursor',
      'inputToken',
      'nextToken',
      'complete',
      'coverage',
      'observations'
    ]) ||
    page.schemaVersion !== '1.0' ||
    page.namespace !== SOURCE_NAMESPACE ||
    page.coverageKey !== SOURCE_COVERAGE_KEY ||
    !['snapshot', 'changes'].includes(page.phase) ||
    !string(page.fenceCursor) ||
    ![page.inputToken, page.nextToken].every((token) => token === null || string(token)) ||
    typeof page.complete !== 'boolean' ||
    !Array.isArray(page.coverage) ||
    page.coverage.some((source) => !SOURCE_NAMES.includes(source)) ||
    new Set(page.coverage).size !== page.coverage.length ||
    !Array.isArray(page.observations)
  )
    fail('source_schema_invalid')
  if (page.observations.length > 200) fail('source_page_limit')
  for (const observation of page.observations) {
    if (
      !keys(observation, [
        'source',
        'subjectKey',
        'sourceVersion',
        'operation',
        'identities',
        'destination',
        'fact',
        'personalization',
        'evidenceRef'
      ]) ||
      !SOURCE_NAMES.includes(observation.source) ||
      !['upsert', 'delete'].includes(observation.operation) ||
      !string(observation.evidenceRef) ||
      !observation.evidenceRef.startsWith('synthetic:')
    )
      fail('source_schema_invalid')
    if (!safeSourceVersion(observation.sourceVersion)) fail('source_version_invalid')
    if (!Array.isArray(observation.identities)) fail('source_identity_invalid')
    if (observation.identities.length > 32) fail('source_page_limit')
    if (
      !syntheticMember(observation.subjectKey) ||
      (observation.destination !== null && !syntheticDestination(observation.destination)) ||
      !observation.identities.length ||
      new Set(observation.identities).size !== observation.identities.length ||
      !observation.identities.includes(`member:${observation.subjectKey}`) ||
      (observation.destination !== null &&
        !observation.identities.includes(`email:${observation.destination}`)) ||
      !observation.identities.every(
        (id) =>
          typeof id === 'string' &&
          (id.startsWith('member:')
            ? syntheticMember(id.slice(7))
            : id.startsWith('email:') && syntheticDestination(id.slice(6)))
      )
    )
      fail('source_identity_invalid')
    if (
      !keys(observation.personalization, PERSONALIZATION_FIELDS) ||
      !Object.values(observation.personalization).every(
        (value) => value === null || typeof value === 'string'
      )
    )
      fail('source_fact_invalid')
    const fact = observation.fact
    if (observation.operation === 'delete') {
      if (fact !== null) fail('source_fact_invalid')
      continue
    }
    if (
      !keys(fact, [
        'status',
        'value',
        'sourceVersion',
        'evidenceRefs',
        'memberIds',
        'asOf',
        'checkedAt',
        'validUntil'
      ]) ||
      !['known', 'unknown'].includes(fact.status) ||
      fact.sourceVersion !== String(observation.sourceVersion) ||
      !Array.isArray(fact.evidenceRefs) ||
      !fact.evidenceRefs.length ||
      !fact.evidenceRefs.every((ref) => string(ref) && ref.startsWith('synthetic:')) ||
      !Array.isArray(fact.memberIds) ||
      !fact.memberIds.includes(observation.subjectKey) ||
      !fact.memberIds.every(syntheticMember) ||
      ![fact.asOf, fact.checkedAt, fact.validUntil].every(sourceTimestamp) ||
      (fact.status === 'known' ? !validValue(observation.source, fact.value) : fact.value !== null)
    )
      fail('source_fact_invalid')
  }
  return page
}

/** Project the aMember document into synthetic-only observations; consent is NOT Sendy. */
export function normalizeAmemberFixture({ document, meta, datePolicy } = {}) {
  if (!object(meta) || meta.schema_version !== '1.0' || !sourceTimestamp(meta.generated_at))
    fail('source_schema_invalid')
  if (
    !object(document) ||
    !safeSourceVersion(document.user_id) ||
    document.customer_id !== `amember:${document.user_id}`
  )
    fail('source_identity_invalid')
  if (!safeSourceVersion(document.record_version)) fail('source_version_invalid')
  const destination = typeof document.email === 'string' ? document.email.trim().toLowerCase() : null
  if (!syntheticDestination(destination)) fail('source_identity_invalid')
  if (
    !object(document.membership) ||
    typeof document.membership.has_active_membership !== 'boolean' ||
    !object(document.consent) ||
    document.consent.scope !== 'amember_only' ||
    document.consent.sendy_included !== false ||
    ![true, false, null].includes(document.consent.globally_unsubscribed)
  )
    fail('source_fact_invalid')
  const subjectKey = `sandbox-amember-${document.user_id}`
  const evidenceRef = `synthetic:amember:${document.user_id}:${document.record_version}`
  const fact = (status, value) => ({
    status,
    value,
    sourceVersion: String(document.record_version),
    memberIds: [subjectKey],
    evidenceRefs: [evidenceRef],
    asOf: meta.generated_at,
    checkedAt: meta.generated_at,
    validUntil: new Date(Date.parse(meta.generated_at) + SOURCE_POLICY.maxAgeMs).toISOString()
  })
  let membership = fact('unknown', null)
  const expiry = document.membership.furthest_expires_on
  if (
    datePolicy?.timeZone === 'UTC' &&
    datePolicy.expiry === 'exclusive-next-day' &&
    meta.source_timezone === 'UTC' &&
    typeof expiry === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(expiry) &&
    sourceTimestamp(`${expiry}T00:00:00.000Z`)
  ) {
    membership = fact('known', {
      eligible: document.membership.has_active_membership,
      lifetime: false,
      expiresAt: new Date(Date.parse(`${expiry}T00:00:00.000Z`) + 86400000).toISOString()
    })
  }
  const personalization = {
    first_name: document.name?.first ?? null,
    company: document.profile?.company ?? null,
    last_template: document.downloads?.templates?.latest?.title ?? null
  }
  const observations = [
    { source: 'membership', fact: membership },
    {
      source: 'amember',
      fact:
        document.consent.globally_unsubscribed === null
          ? fact('unknown', null)
          : fact('known', { globalUnsubscribed: document.consent.globally_unsubscribed })
    }
  ].map((entry) => ({
    ...entry,
    subjectKey,
    sourceVersion: document.record_version,
    operation: 'upsert',
    identities: [`member:${subjectKey}`, `email:${destination}`],
    destination,
    personalization,
    evidenceRef
  }))
  validateSourcePage({
    schemaVersion: '1.0',
    namespace: SOURCE_NAMESPACE,
    coverageKey: SOURCE_COVERAGE_KEY,
    phase: 'snapshot',
    fenceCursor: 'synthetic:fence',
    inputToken: null,
    nextToken: null,
    complete: true,
    coverage: ['membership', 'amember'],
    observations
  })
  return observations
}

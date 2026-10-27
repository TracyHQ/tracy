const SOURCES = ['membership', 'marketingBasis', 'amember', 'sendy', 'tracy']
const SOURCE_CODES = {
  membership: 'MEMBERSHIP',
  marketingBasis: 'MARKETING_BASIS',
  amember: 'AMEMBER',
  sendy: 'SENDY',
  tracy: 'TRACY'
}
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isId = (value) => typeof value === 'string' && value.trim().length > 0
const isIds = (value) => Array.isArray(value) && [...value].every(isId)

/** Reject calendar rollover and offsets, rather than trusting Date.parse alone. */
function timestamp(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
  if (!match) return null
  const time = Date.parse(value)
  const canonical = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? time : null
}

function invalidConfiguration(code) {
  throw Object.assign(new Error(code), { code })
}

function validEmail(value) {
  if (
    typeof value !== 'string' ||
    value.length > 254 ||
    /[^\x21-\x7e]/.test(value) ||
    value !== value.trim().toLowerCase()
  )
    return false
  const parts = value.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  const labels = domain.split('.')
  return (
    local.length > 0 &&
    local.length <= 64 &&
    /^[a-z0-9!#$%&'*+\-/=?^_`{|}~.]+$/.test(local) &&
    !local.startsWith('.') &&
    !local.endsWith('.') &&
    !local.includes('..') &&
    labels.length >= 2 &&
    labels.every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
    /^[a-z][a-z0-9-]*[a-z0-9]$/.test(labels.at(-1))
  )
}

function validCandidate(candidate) {
  return (
    isObject(candidate) &&
    validEmail(candidate.normalizedEmail) &&
    Array.isArray(candidate.identities) &&
    candidate.identities.length > 0 &&
    [...candidate.identities].every(
      (identity) => isObject(identity) && identity.source === 'amember' && isId(identity.memberId)
    ) &&
    (candidate.sourceGroup === null || isId(candidate.sourceGroup)) &&
    candidate.suggestedGroup === null &&
    ['recheck', 'conflict', 'suppressed'].includes(candidate.state) &&
    isObject(candidate.negativeAssertions) &&
    typeof candidate.negativeAssertions.globalUnsubscribed === 'boolean' &&
    typeof candidate.negativeAssertions.internal === 'boolean' &&
    (candidate.needsReview === undefined || typeof candidate.needsReview === 'boolean')
  )
}

function validValue(source, value) {
  switch (source) {
    case 'membership':
      return (
        isObject(value) &&
        typeof value.eligible === 'boolean' &&
        typeof value.lifetime === 'boolean' &&
        (value.expiresAt === null ? value.lifetime : timestamp(value.expiresAt) !== null)
      )
    case 'marketingBasis':
      return value === 'allowed' || value === 'denied'
    case 'amember':
      return isObject(value) && typeof value.globalUnsubscribed === 'boolean'
    case 'sendy':
      return (
        isObject(value) &&
        ['clear', 'unsubscribed', 'bounced', 'complained'].includes(value.state) &&
        isIds(value.coverage)
      )
    case 'tracy':
      return isObject(value) && typeof value.suppressed === 'boolean'
    default:
      return false
  }
}

/** Pure eligibility at one caller-supplied clock; readiness is never send authorization. */
export function evaluateEligibility({ candidate, currentFacts, knownSuppressions, policy, now } = {}) {
  if (
    !isObject(policy) ||
    !isId(policy.version) ||
    !Number.isFinite(policy.maxAgeMs) ||
    policy.maxAgeMs <= 0 ||
    !isIds(policy.requiredSendyCoverage) ||
    policy.requiredSendyCoverage.length === 0 ||
    new Set(policy.requiredSendyCoverage).size !== policy.requiredSendyCoverage.length
  ) {
    invalidConfiguration('INVALID_POLICY')
  }
  const clock = timestamp(now)
  if (clock === null) invalidConfiguration('INVALID_CLOCK')

  const suppressions = new Set()
  const ineligible = new Set()
  const rechecks = new Set()
  const sourceVersions = {}
  const evidenceRefs = new Set()
  const deadlines = []
  const facts = isObject(currentFacts) ? currentFacts : {}
  const candidateValid = validCandidate(candidate)
  const memberIds = candidateValid ? candidate.identities.map((identity) => identity.memberId) : []
  if (!candidateValid) rechecks.add('CANDIDATE_INVALID')
  if (candidate?.sourceGroup === null) rechecks.add('CANDIDATE_GROUP_MISSING')
  if (candidate?.state === 'conflict') rechecks.add('CANDIDATE_CONFLICT')
  if (candidate?.state === 'suppressed') suppressions.add('CANDIDATE_SUPPRESSED')
  if (candidate?.needsReview === true) rechecks.add('CANDIDATE_REVIEW_REQUIRED')
  if (candidate?.negativeAssertions?.globalUnsubscribed === true) {
    suppressions.add('PREVIEW_GLOBAL_UNSUBSCRIBED')
  }
  if (candidate?.negativeAssertions?.internal === true) suppressions.add('PREVIEW_INTERNAL')

  if (!Array.isArray(knownSuppressions)) rechecks.add('KNOWN_SUPPRESSIONS_INVALID')
  else
    for (const suppression of knownSuppressions) {
      if (!isObject(suppression) || !isId(suppression.reason)) {
        rechecks.add('KNOWN_SUPPRESSIONS_INVALID')
        continue
      }
      // An already-known negative is retained even if its evidence reference is incomplete.
      suppressions.add('KNOWN_SUPPRESSION')
      if (isId(suppression.evidenceRef)) evidenceRefs.add(suppression.evidenceRef)
      else rechecks.add('KNOWN_SUPPRESSIONS_INVALID')
    }

  for (const source of SOURCES) {
    const fact = facts[source]
    const code = SOURCE_CODES[source]
    if (!isObject(fact)) {
      rechecks.add(`${code}_MISSING`)
      continue
    }
    if (isId(fact.sourceVersion)) sourceVersions[source] = fact.sourceVersion
    if (isIds(fact.evidenceRefs)) fact.evidenceRefs.forEach((ref) => evidenceRefs.add(ref))
    if (fact.status !== 'known') {
      rechecks.add(fact.status === 'unknown' ? `${code}_UNKNOWN` : `${code}_INVALID`)
      continue
    }

    // Recipient-scoped negatives win before freshness, metadata and coverage validation.
    const value = fact.value
    if (source === 'marketingBasis' && value === 'denied') suppressions.add('MARKETING_BASIS_DENIED')
    if (source === 'amember' && value?.globalUnsubscribed === true) {
      suppressions.add('AMEMBER_GLOBAL_UNSUBSCRIBED')
    }
    if (source === 'sendy' && ['unsubscribed', 'bounced', 'complained'].includes(value?.state)) {
      suppressions.add(`SENDY_${value.state.toUpperCase()}`)
    }
    if (source === 'tracy' && value?.suppressed === true) suppressions.add('TRACY_SUPPRESSED')
    if (source === 'membership') {
      if (value?.eligible === false) ineligible.add('MEMBERSHIP_INELIGIBLE')
      const expiry = timestamp(value?.expiresAt)
      if (expiry !== null && expiry <= clock) ineligible.add('MEMBERSHIP_EXPIRED')
      if (expiry !== null) deadlines.push(expiry)
    }

    if (
      !validValue(source, value) ||
      !isId(fact.sourceVersion) ||
      !isIds(fact.evidenceRefs) ||
      fact.evidenceRefs.length === 0
    )
      rechecks.add(`${code}_INVALID`)
    if (!isIds(fact.memberIds) || !memberIds.every((id) => fact.memberIds.includes(id))) {
      rechecks.add(`${code}_MEMBER_COVERAGE_INCOMPLETE`)
    }
    if (
      source === 'sendy' &&
      (!isIds(value?.coverage) || !policy.requiredSendyCoverage.every((id) => value.coverage.includes(id)))
    ) {
      rechecks.add('SENDY_COVERAGE_INCOMPLETE')
    }

    const asOf = timestamp(fact.asOf)
    const checkedAt = timestamp(fact.checkedAt)
    const validUntil = timestamp(fact.validUntil)
    if (asOf === null || checkedAt === null || validUntil === null || asOf > checkedAt) {
      rechecks.add(`${code}_INVALID_TIME`)
      continue
    }
    if (asOf > clock || checkedAt > clock) rechecks.add(`${code}_FUTURE`)
    if (validUntil <= clock || asOf + policy.maxAgeMs <= clock || checkedAt + policy.maxAgeMs <= clock)
      rechecks.add(`${code}_STALE`)
    deadlines.push(validUntil, asOf + policy.maxAgeMs, checkedAt + policy.maxAgeMs)
  }

  // ISO timestamps serialize milliseconds, so a fractional window can already be expired.
  const earliestDeadline = new Date(Math.min(...deadlines)).getTime()
  if (earliestDeadline <= clock) rechecks.add('VALIDITY_WINDOW_EXPIRED')
  const state = suppressions.size
    ? 'suppressed'
    : ineligible.size
      ? 'ineligible'
      : rechecks.size
        ? 'recheck'
        : 'ready'
  return {
    state,
    reasons: [...new Set([...suppressions, ...ineligible, ...rechecks])].sort(),
    policyVersion: policy.version,
    sourceVersions,
    checkedAt: new Date(clock).toISOString(),
    validUntil: state === 'ready' ? new Date(earliestDeadline).toISOString() : null,
    evidenceRefs: [...evidenceRefs].sort()
  }
}

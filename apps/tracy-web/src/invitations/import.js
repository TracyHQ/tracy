import { createHash } from 'node:crypto'

const PARSER_VERSION = 'rows-v1'
const CORE_VERSION = 'preview-v1'
const MAX_EXPANDED_REFERENCES = 100000
// Combined serialized preview + canonical hash payload, not a heap/RSS guarantee.
// 16 MiB keeps both copies bounded near the future 10 MiB upload ceiling while
// preserving 16 KiB opaque fields and the existing 100,000-reference boundary.
const MAX_PROJECTED_BYTES = 16 * 1024 * 1024

function jsonBytes(value, depth = 0, limit = MAX_PROJECTED_BYTES) {
  if (depth > 64) refuse('preview_byte_limit')
  if (typeof value === 'string') {
    // Count JSON's UTF-8 representation without constructing escaped text.
    let bytes = 2
    if (bytes > limit) refuse('preview_byte_limit')
    for (let index = 0; index < value.length; index++) {
      const code = value.charCodeAt(index)
      if (code === 34 || code === 92) bytes += 2
      else if (code < 32)
        bytes += code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 2 : 6
      else if (code < 128) bytes++
      else if (code < 2048) bytes += 2
      else if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(index + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          bytes += 4
          index++
        } else bytes += 6
      } else bytes += code >= 0xdc00 && code <= 0xdfff ? 6 : 3
      if (bytes > limit) refuse('preview_byte_limit')
    }
    return bytes
  }
  if (!value || typeof value !== 'object') {
    const encoded = JSON.stringify(value)
    // Legacy canonical object values interpolate undefined as nine literal bytes.
    // Arrays omit those values; charging nine there is conservative as well.
    const bytes = encoded === undefined ? 9 : Buffer.byteLength(encoded, 'utf8')
    if (bytes > limit) refuse('preview_byte_limit')
    return bytes
  }
  let bytes = 2
  if (bytes > limit) refuse('preview_byte_limit')
  if (Array.isArray(value)) {
    for (const entry of value) {
      bytes += jsonBytes(entry, depth + 1, limit - bytes - 1) + 1
    }
  } else {
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      bytes += jsonBytes(key, depth + 1, limit - bytes - 2) + 2
      bytes += jsonBytes(value[key], depth + 1, limit - bytes)
    }
  }
  // The extra trailing comma charge intentionally overestimates by one byte.
  return bytes
}
const PERSONALIZATION_FIELDS = [
  'first_name',
  'plan',
  'last_template',
  'company',
  'website',
  'basis_evidence_ref'
]
const REQUIRED_FIELDS = ['email', 'source_member_id', 'group_key']
const TARGETS = new Set([...REQUIRED_FIELDS, ...PERSONALIZATION_FIELDS, 'global_unsubscribed', 'internal'])
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function refuse(code) {
  throw new TypeError(code)
}

function plainRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
    Reflect.ownKeys(value).every(
      (key) =>
        typeof key === 'string' &&
        !PROTOTYPE_KEYS.has(key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')
    )
  )
}

function field(value) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 16384
}

function validate(input) {
  if (!plainRecord(input)) refuse('invalid_input')
  const { headers, rows, mapping, sourceChecksum, schemaVersion, groupCatalogue } = input
  if (
    !Array.isArray(headers) ||
    headers.length === 0 ||
    headers.length > 100 ||
    Object.keys(headers).length !== headers.length ||
    !headers.every((value) => field(value) && value.length > 0 && !PROTOTYPE_KEYS.has(value)) ||
    new Set(headers).size !== headers.length
  )
    refuse('invalid_headers')
  if (!Array.isArray(rows) || rows.length > 10000) refuse('invalid_rows')
  for (const record of rows) {
    if (
      !Array.isArray(record) ||
      record.length !== headers.length ||
      !record.every(field) ||
      Object.keys(record).length !== record.length
    )
      refuse('invalid_row_shape')
  }
  if (
    !plainRecord(mapping) ||
    Reflect.ownKeys(mapping).some((key) => !Object.getOwnPropertyDescriptor(mapping, key).enumerable)
  )
    refuse('invalid_mapping')
  const targets = Object.values(mapping)
  if (
    Object.keys(mapping).some((header) => !headers.includes(header)) ||
    targets.some((target) => !TARGETS.has(target)) ||
    new Set(targets).size !== targets.length ||
    REQUIRED_FIELDS.some((target) => !targets.includes(target))
  )
    refuse('invalid_mapping')
  if (schemaVersion !== 'invitations-v1') refuse('invalid_schema_version')
  if (typeof sourceChecksum !== 'string' || !/^[a-fA-F0-9]{64}$/.test(sourceChecksum))
    refuse('invalid_source_checksum')
  if (
    !plainRecord(groupCatalogue) ||
    typeof groupCatalogue.version !== 'string' ||
    !groupCatalogue.version.trim() ||
    !Array.isArray(groupCatalogue.keys) ||
    groupCatalogue.keys.length !== 5 ||
    Object.keys(groupCatalogue.keys).length !== 5 ||
    !groupCatalogue.keys.every((key) => typeof key === 'string' && key.trim()) ||
    new Set(groupCatalogue.keys).size !== 5
  )
    refuse('invalid_group_catalogue')
}

function normalizeEmail(original) {
  // Reject control characters before trimming so they cannot disguise an invalid address.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(original)) return null
  const email = original.trim().toLowerCase()
  if (email.length > 254 || /[^\x21-\x7e]/.test(email)) return null
  const parts = email.split('@')
  if (parts.length !== 2) return null
  const [local, domain] = parts
  if (
    !local ||
    local.length > 64 ||
    !domain ||
    domain.length > 253 ||
    !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(local)
  )
    return null
  const labels = domain.split('.')
  if (
    labels.length < 2 ||
    labels.some((label) => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) ||
    !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(labels.at(-1))
  )
    return null
  return email
}

function assertion(value) {
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes'].includes(normalized)) return { negative: true, invalid: false }
  if (['0', 'false', 'no', ''].includes(normalized)) return { negative: false, invalid: false }
  return { negative: false, invalid: true }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

/** Preview caller-parsed records only; no mailbox verification, upload, persistence, or send. */
export function previewRows(input) {
  validate(input)
  const { headers, rows, mapping, schemaVersion, groupCatalogue } = input
  const sourceChecksum = input.sourceChecksum.toLowerCase()
  // Metadata is part of the digest even when there are no candidates. Check it
  // before the per-row variant canonicalization, without building a JSON payload.
  const metadataBytes = jsonBytes({
    sourceChecksum,
    headers,
    mapping,
    schemaVersion,
    groupCatalogue,
    parserVersion: PARSER_VERSION,
    coreVersion: CORE_VERSION
  })
  let projectedBytes = metadataBytes + 4096
  if (projectedBytes > MAX_PROJECTED_BYTES) refuse('preview_byte_limit')
  const columnTargets = headers.map((header) => (Object.hasOwn(mapping, header) ? mapping[header] : null))
  const groups = new Set(groupCatalogue.keys)
  const issues = []
  const byEmail = new Map()
  const variantsByEmail = new Map()
  const memberEmails = new Map()
  const parents = new Map()
  const records = []
  let rejectedRows = 0
  let variantBytes = 0

  function root(key) {
    if (!parents.has(key)) parents.set(key, key)
    let current = key
    while (parents.get(current) !== current) current = parents.get(current)
    while (parents.get(key) !== key) {
      const next = parents.get(key)
      parents.set(key, current)
      key = next
    }
    return current
  }

  for (let index = 0; index < rows.length; index++) {
    const sourceRow = index + 2
    const values = Object.create(null)
    columnTargets.forEach((target, column) => {
      if (target) values[target] = rows[index][column]
    })
    const normalizedEmail = normalizeEmail(values.email)
    const memberId = values.source_member_id.trim()
    const sourceGroup = values.group_key.trim()
    const globalUnsubscribed = assertion(values.global_unsubscribed ?? '')
    const internal = assertion(values.internal ?? '')
    const emailKey = normalizedEmail ? `email:${normalizedEmail}` : null
    const memberKey = memberId ? `member:${memberId}` : null
    if (emailKey) root(emailKey)
    if (memberKey) root(memberKey)
    if (emailKey && memberKey) {
      parents.set(root(memberKey), root(emailKey))
      if (!memberEmails.has(memberId)) memberEmails.set(memberId, new Set())
      memberEmails.get(memberId).add(normalizedEmail)
    }
    records.push({
      emailKey,
      memberKey,
      normalizedEmail,
      originalEmail: values.email,
      memberId,
      sourceRow,
      globalUnsubscribed,
      internal
    })
    const rowCodes = []
    if (!normalizedEmail) rowCodes.push('invalid_email')
    if (!memberId) rowCodes.push('invalid_member_id')
    if (!groups.has(sourceGroup)) rowCodes.push('unknown_group')
    if (globalUnsubscribed.invalid) issues.push({ row: sourceRow, code: 'invalid_global_unsubscribed' })
    if (internal.invalid) issues.push({ row: sourceRow, code: 'invalid_internal' })
    rowCodes.forEach((code) => issues.push({ row: sourceRow, code }))
    if (rowCodes.length) {
      rejectedRows++
      continue
    }

    const personalization = Object.fromEntries(
      PERSONALIZATION_FIELDS.map((name) => [name, (values[name] ?? '').trim()])
    )
    let candidate = byEmail.get(normalizedEmail)
    if (!candidate) {
      candidate = {
        normalizedEmail,
        identities: [],
        originalEmails: [],
        sourceRows: [],
        sourceGroup,
        suggestedGroup: null,
        personalization,
        variants: [],
        conflicts: [],
        negativeAssertions: { globalUnsubscribed: false, internal: false },
        needsReview: false,
        state: 'recheck'
      }
      byEmail.set(normalizedEmail, candidate)
      variantsByEmail.set(normalizedEmail, new Map())
    }
    // A single variant is field-bounded; the accumulated unexpanded variants
    // must also stay within the budget before component projection can run.
    const variantValue = { sourceGroup, personalization }
    const variantSize = jsonBytes(variantValue)
    if (2 * variantSize + metadataBytes + 4096 > MAX_PROJECTED_BYTES) refuse('preview_byte_limit')
    const variantKey = canonical(variantValue)
    const variants = variantsByEmail.get(normalizedEmail)
    let variant = variants.get(variantKey)
    if (!variant) {
      variantBytes += 2 * variantSize
      if (variantBytes + metadataBytes + 4096 > MAX_PROJECTED_BYTES) refuse('preview_byte_limit')
      variant = { sourceGroup, personalization, sourceRows: [] }
      candidate.variants.push(variant)
      variants.set(variantKey, variant)
    }
    variant.sourceRows.push(sourceRow)
  }

  // Rejected content cannot erase known identities, row provenance, opt-outs, or uncertainty.
  const components = new Map()
  const originalEmails = new Map()
  for (const record of records) {
    const key = record.emailKey ?? record.memberKey
    if (!key) continue
    const component = root(key)
    const aggregate = components.get(component) ?? {
      globalUnsubscribed: false,
      internal: false,
      needsReview: false,
      memberIds: new Set(),
      sourceRows: []
    }
    if (record.memberId) aggregate.memberIds.add(record.memberId)
    aggregate.sourceRows.push(record.sourceRow)
    if (record.normalizedEmail) {
      if (!originalEmails.has(record.normalizedEmail)) originalEmails.set(record.normalizedEmail, new Set())
      originalEmails.get(record.normalizedEmail).add(record.originalEmail)
    }
    aggregate.globalUnsubscribed ||= record.globalUnsubscribed.negative
    aggregate.internal ||= record.internal.negative
    aggregate.needsReview ||= record.globalUnsubscribed.invalid || record.internal.invalid
    components.set(component, aggregate)
  }

  const candidates = [...byEmail.values()]
  // Bound component expansion before copying provenance, adding conflicts, or hashing the preview.
  let expandedReferences = 0
  for (const candidate of candidates) {
    const aggregate = components.get(root(`email:${candidate.normalizedEmail}`))
    expandedReferences += aggregate.memberIds.size + aggregate.sourceRows.length
    if (expandedReferences > MAX_EXPANDED_REFERENCES) refuse('preview_expansion_limit')
  }
  // Size component arrays once, then charge their repetition in every candidate.
  // No expanded identity/source-row arrays or canonical preview exist yet.
  const componentBytes = new Map()
  for (const [key, aggregate] of components) {
    let bytes = jsonBytes(aggregate.sourceRows) + 2
    for (const memberId of aggregate.memberIds) bytes += jsonBytes({ source: 'amember', memberId }) + 1
    componentBytes.set(key, bytes)
  }
  // Every source row can contribute at most two distinct conflict issues, globally.
  projectedBytes += 2 * (jsonBytes(issues) + 128 * rows.length)
  if (projectedBytes > MAX_PROJECTED_BYTES) refuse('preview_byte_limit')
  for (const candidate of candidates) {
    const key = root(`email:${candidate.normalizedEmail}`)
    let emailBytes = 2
    for (const email of originalEmails.get(candidate.normalizedEmail)) emailBytes += jsonBytes(email) + 1
    // Existing skeleton includes both personalization and every variant. Conflict
    // merging replaces differing strings with null. The global 128 bytes/row
    // allowance covers two row/code objects (row <= 10001); 128/candidate
    // covers longer conflict/state strings and array separators. Both payloads
    // contain candidates/issues, so charge twice. 4096 above covers both envelopes,
    // digest, counts (<=10000), and their fixed keys/values.
    projectedBytes += 2 * (jsonBytes(candidate) + componentBytes.get(key) + emailBytes + 128)
    if (projectedBytes > MAX_PROJECTED_BYTES) refuse('preview_byte_limit')
  }
  const identityConflictEmails = new Set()
  for (const emails of memberEmails.values()) {
    if (emails.size > 1) for (const email of emails) identityConflictEmails.add(email)
  }
  const conflictIssueKeys = new Set()
  for (const candidate of candidates) {
    const aggregate = components.get(root(`email:${candidate.normalizedEmail}`))
    candidate.identities = [...aggregate.memberIds].map((memberId) => ({ source: 'amember', memberId }))
    candidate.sourceRows = [...aggregate.sourceRows]
    candidate.originalEmails = [...originalEmails.get(candidate.normalizedEmail)]
    candidate.negativeAssertions = {
      globalUnsubscribed: aggregate.globalUnsubscribed,
      internal: aggregate.internal
    }
    candidate.needsReview = aggregate.needsReview
    if (candidate.variants.length > 1) {
      candidate.conflicts.push('content_conflict')
      if (new Set(candidate.variants.map((variant) => variant.sourceGroup)).size > 1)
        candidate.sourceGroup = null
      candidate.personalization = Object.fromEntries(
        PERSONALIZATION_FIELDS.map((name) => {
          const values = new Set(candidate.variants.map((variant) => variant.personalization[name]))
          return [name, values.size === 1 ? values.values().next().value : null]
        })
      )
    }
    if (identityConflictEmails.has(candidate.normalizedEmail)) {
      candidate.conflicts.push('identity_conflict')
    }
    for (const code of candidate.conflicts) {
      candidate.sourceRows.forEach((row) => {
        const key = `${row}:${code}`
        if (!conflictIssueKeys.has(key)) issues.push({ row, code })
        conflictIssueKeys.add(key)
      })
    }
    candidate.state =
      aggregate.globalUnsubscribed || aggregate.internal
        ? 'suppressed'
        : candidate.conflicts.length
          ? 'conflict'
          : 'recheck'
  }
  issues.sort((left, right) => left.row - right.row || left.code.localeCompare(right.code, 'en'))
  const counts = {
    inputRows: rows.length,
    uniqueCandidates: candidates.length,
    rejectedRows,
    conflictCandidates: candidates.filter((candidate) => candidate.state === 'conflict').length,
    suppressedCandidates: candidates.filter((candidate) => candidate.state === 'suppressed').length,
    recheckCandidates: candidates.filter((candidate) => candidate.state === 'recheck').length
  }
  const previewDigest = createHash('sha256')
    .update(
      canonical({
        sourceChecksum,
        headers,
        mapping,
        schemaVersion,
        groupCatalogue,
        parserVersion: PARSER_VERSION,
        coreVersion: CORE_VERSION,
        candidates,
        issues
      })
    )
    .digest('hex')
  return {
    sourceChecksum,
    previewDigest,
    schemaVersion,
    parserVersion: PARSER_VERSION,
    candidates,
    issues,
    counts
  }
}

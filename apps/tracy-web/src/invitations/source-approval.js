import { createHash, randomUUID } from 'node:crypto'
import { evaluateEligibility } from './eligibility.js'
import { SOURCE_NAMES, sourceError } from './source-contract.js'
import { readSourceState, linkedSourceKeys, sourceDigest } from './source-store.js'

const contentHash = (draft) =>
  createHash('sha256')
    .update(JSON.stringify({ subject: draft.subject, bodyText: draft.bodyText }))
    .digest('hex')

export function candidateFromRecipient(recipient) {
  const original = recipient.sourceCandidate
  return {
    normalizedEmail: recipient.email,
    identities: recipient.identities,
    sourceGroup: recipient.group,
    suggestedGroup: null,
    state: original?.state ?? 'recheck',
    needsReview: original?.needsReview ?? true,
    negativeAssertions: original?.negativeAssertions ?? { internal: false, globalUnsubscribed: false }
  }
}

/** Presence, hidden conditions, destination and graph are dependencies, not observation clocks. */
export function dependencyFingerprint({ fields, personalization, destination, identities, policyVersion }) {
  return sourceDigest({
    fields: [...new Set(fields)]
      .sort()
      .map((field) => [field, Object.hasOwn(personalization, field), personalization[field] ?? null]),
    destination,
    identities: [...new Set(identities)].sort(),
    policyVersion
  })
}

function aggregateFacts(source, observations, memberIds) {
  const entries = memberIds.map((id) => observations.find((o) => o.subjectKey === id && o.source === source))
  if (entries.some((o) => !o || o.operation === 'delete')) return null
  const facts = entries.map((o) => o.fact)
  const known = facts.every((fact) => fact?.status === 'known')
  const values = facts.map((fact) => fact?.value)
  let value = null
  if (known) {
    if (source === 'membership')
      value = {
        eligible: values.every((v) => v.eligible),
        lifetime: values.every((v) => v.lifetime),
        expiresAt:
          values
            .map((v) => v.expiresAt)
            .filter(Boolean)
            .sort()[0] ?? null
      }
    else if (source === 'marketingBasis') value = values.includes('denied') ? 'denied' : 'allowed'
    else if (source === 'amember') value = { globalUnsubscribed: values.some((v) => v.globalUnsubscribed) }
    else if (source === 'sendy')
      value = {
        state: values.find((v) => v.state !== 'clear')?.state ?? 'clear',
        coverage: values[0].coverage.filter((id) => values.every((v) => v.coverage.includes(id)))
      }
    else value = { suppressed: values.some((v) => v.suppressed) }
  }
  return {
    status: known ? 'known' : 'unknown',
    value,
    sourceVersion: entries
      .map((o) => `${o.subjectKey}:${o.sourceVersion}`)
      .sort()
      .join('|'),
    memberIds: [...new Set(facts.flatMap((f) => f.memberIds))],
    evidenceRefs: [...new Set(facts.flatMap((f) => f.evidenceRefs))],
    asOf: facts.map((f) => f.asOf).sort()[0],
    checkedAt: facts.map((f) => f.checkedAt).sort()[0],
    validUntil: facts.map((f) => f.validUntil).sort()[0]
  }
}

export async function evaluateSourceRecipient({ db, scopeId, recipient, policy, now }) {
  const identities = await linkedSourceKeys(db, [
    `email:${recipient.email}`,
    ...recipient.identities.map((id) => `member:${id.memberId}`)
  ])
  const memberIds = identities.filter((id) => id.startsWith('member:')).map((id) => id.slice(7))
  const state = await readSourceState(db, scopeId, memberIds)
  const suppressions = (
    await db.query('select identity from invitations_sandbox_suppression where identity=any($1::text[])', [
      identities
    ])
  ).rows.map(() => ({ reason: 'synthetic_suppression', evidenceRef: 'synthetic:suppression' }))
  const facts = Object.fromEntries(
    SOURCE_NAMES.map((source) => [source, aggregateFacts(source, state.current, memberIds)])
  )
  const candidate = candidateFromRecipient(recipient)
  candidate.identities = memberIds.map((memberId) => ({ source: 'amember', memberId }))
  const evaluated = evaluateEligibility({
    candidate,
    currentFacts: facts,
    knownSuppressions: suppressions,
    policy,
    now
  })
  const reasons = [...evaluated.reasons]
  const fields = recipient.draft?.dependencyFields ?? []
  const personalizations = state.current
    .filter((o) => o.source === 'amember' && o.operation === 'upsert')
    .map((o) => o.personalization)
  const personalization = { group: recipient.group }
  for (const field of new Set(personalizations.flatMap((p) => Object.keys(p)))) {
    const values = [
      ...new Set(
        personalizations.map((p) => (Object.hasOwn(p, field) ? JSON.stringify(p[field]) : undefined))
      )
    ]
    if (values.length === 1 && values[0] !== undefined) personalization[field] = JSON.parse(values[0])
    else if (fields.includes(field)) reasons.push('SOURCE_PERSONALIZATION_CONFLICT')
  }
  if (
    state.current.some(
      (o) => o.operation === 'upsert' && o.destination !== null && o.destination !== recipient.email
    )
  )
    reasons.push('SOURCE_DESTINATION_CHANGED')
  const substantiveReasons = [...new Set(reasons)].sort()
  if (state.scope.status !== 'ready')
    reasons.push(state.scope.status === 'failed' ? 'SOURCE_FAILED' : 'SOURCE_PENDING')
  const readinessState = evaluated.state === 'ready' && reasons.length ? 'recheck' : evaluated.state
  return {
    ...evaluated,
    state: readinessState,
    reasons: [...new Set(reasons)].sort(),
    factsRevision: state.factsRevision,
    identityRevision: sourceDigest(identities),
    dependencyFingerprint: dependencyFingerprint({
      fields,
      personalization,
      destination: recipient.email,
      identities,
      policyVersion: policy.version
    }),
    trackingBasis: 'unknown',
    personalization,
    sourceStatus: state.scope.status,
    eligibilityState: evaluated.state,
    substantiveReasons,
    sourceCompletedAt: state.scope.completedAt
  }
}

export function bindSourceApproval({ draft, readiness, destination, actor, now }) {
  if (
    readiness.state !== 'ready' ||
    !readiness.validUntil ||
    Date.parse(readiness.validUntil) <= Date.parse(now)
  )
    throw sourceError('source_recipient_blocked', 409)
  if (contentHash(draft) !== draft.contentHash) throw sourceError('stale_draft', 409)
  return {
    revision: draft.revision,
    contentHash: draft.contentHash,
    destination,
    identityRevision: readiness.identityRevision,
    dependencyFingerprint: readiness.dependencyFingerprint,
    policyVersion: readiness.policyVersion,
    factsRevision: readiness.factsRevision,
    validatedThrough: readiness.validUntil,
    actor,
    createdAt: now
  }
}

export function approvalStatus({ draft, readiness, destination, now }) {
  const reasons = []
  const binding = draft?.approval
  if (!draft?.approved || !binding || draft.approvalInvalidation) reasons.push('APPROVAL_REQUIRED')
  if (binding) {
    if (
      binding.revision !== draft.revision ||
      binding.contentHash !== draft.contentHash ||
      contentHash(draft) !== draft.contentHash
    )
      reasons.push('APPROVAL_CONTENT_CHANGED')
    if (binding.destination !== destination) reasons.push('APPROVAL_DESTINATION_CHANGED')
    if (binding.identityRevision !== readiness.identityRevision) reasons.push('APPROVAL_IDENTITY_CHANGED')
    if (binding.dependencyFingerprint !== readiness.dependencyFingerprint)
      reasons.push('APPROVAL_DEPENDENCIES_CHANGED')
    if (binding.policyVersion !== readiness.policyVersion) reasons.push('APPROVAL_POLICY_CHANGED')
    if (
      !Number.isFinite(Date.parse(binding.validatedThrough)) ||
      Date.parse(binding.validatedThrough) <= Date.parse(now)
    )
      reasons.push('APPROVAL_VALIDATION_GAP')
  }
  if (readiness.state !== 'ready') reasons.push(...readiness.reasons, 'SOURCE_RECIPIENT_BLOCKED')
  return { effective: reasons.length === 0, reasons: [...new Set(reasons)].sort() }
}

/** Store decisions/invalidation in the caller's page transaction, without rewriting draft content. */
export async function invalidateSourceApprovals({ db, scopeId, affectedCampaigns, now }) {
  const policy = (await db.query('select policy from invitations_source_scope where id=$1', [scopeId]))
    .rows[0].policy
  for (const campaign of affectedCampaigns) {
    for (const recipient of campaign.data.recipients) {
      const readiness = await evaluateSourceRecipient({ db, scopeId, recipient, policy, now })
      await db.query(
        'insert into invitations_source_decision(id,scope_id,campaign_id,recipient_id,facts_revision,policy_version,checked_at,payload) values($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          randomUUID(),
          scopeId,
          campaign.id,
          recipient.id,
          readiness.factsRevision,
          policy.version,
          now,
          {
            state: readiness.state,
            reasons: readiness.reasons,
            validUntil: readiness.validUntil,
            trackingBasis: readiness.trackingBasis
          }
        ]
      )
      const draft = recipient.draft
      if (!draft?.approved || !draft.approval) continue
      // A pending refresh hides effective approval, but cannot by itself destroy an
      // unexpired continuously validated binding. Negatives/dependency changes still do.
      const checking =
        readiness.sourceStatus === 'pending' &&
        readiness.sourceCompletedAt &&
        readiness.substantiveReasons.length === 0
          ? { ...readiness, state: readiness.eligibilityState, reasons: [] }
          : readiness
      const status = approvalStatus({ draft, readiness: checking, destination: recipient.email, now })
      if (!status.effective) {
        draft.approved = false
        draft.approvalInvalidation = {
          reasons: status.reasons,
          createdAt: now,
          factsRevision: readiness.factsRevision
        }
        await db.query(
          'insert into invitations_source_invalidation(id,scope_id,campaign_id,recipient_id,draft_revision,reasons,created_at) values($1,$2,$3,$4,$5,$6,$7)',
          [
            randomUUID(),
            scopeId,
            campaign.id,
            recipient.id,
            draft.revision,
            JSON.stringify(status.reasons),
            now
          ]
        )
      } else if (readiness.sourceStatus === 'ready') {
        draft.approval.validatedThrough = readiness.validUntil
        draft.approval.factsRevision = readiness.factsRevision
      }
    }
  }
}

/** A read projection never turns a stale stored approval into an effective one. */
export async function projectSourceCampaign(db, row, now) {
  if (!row.data.sourceCheck) return row
  const projected = structuredClone(row)
  const scopeId = row.data.sourceCheck.scopeId
  const policy = (await db.query('select policy from invitations_source_scope where id=$1', [scopeId]))
    .rows[0].policy
  for (const recipient of projected.data.recipients) {
    recipient.readiness = await evaluateSourceRecipient({ db, scopeId, recipient, policy, now })
    recipient.approvalStatus = approvalStatus({
      draft: recipient.draft,
      readiness: recipient.readiness,
      destination: recipient.email,
      now
    })
    if (recipient.draft) recipient.draft.approved = recipient.approvalStatus.effective
    if (recipient.state !== 'suppressed' && !recipient.attempts.length && recipient.state !== 'duplicate') {
      recipient.state =
        recipient.readiness.state === 'ready'
          ? recipient.draft
            ? 'draft'
            : 'ready'
          : recipient.readiness.state
    }
  }
  return projected
}

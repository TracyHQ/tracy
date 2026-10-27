/** Frozen, account-scoped evidence for WO editing. Source text is data, never instructions. */
import { sourceSpan } from 'website-opportunities/domain/source-span.mjs'
import { qualityHash } from '../lib/quality-hash.js'
export { qualityHash } from '../lib/quality-hash.js'

export const QUALITY_POLICY = 'wo-quality/3'

const TYPES = new Set([
  'name',
  'address',
  'phone',
  'email',
  'website',
  'opening-hours',
  'promotion',
  'story',
  'menu',
  'booking'
])
const UNTRUSTED =
  /(?:ignore (?:all |previous )?instructions|system prompt|api[_ -]?key|<\/?(?:system|assistant)>)/i
const PROMOTION = /\b(?:happy\s*hour|discount|offer|promotion|%\s*off)\b/i
const OPENING = /\b(?:open(?:ing)?|operating)\s*(?:hours?|daily|from|at)?\b/i
const TIME = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi
const CONDITIONAL = /\b(?:if|unless|except|only|subject to|until|valid|weekends?|weekdays?)\b/i

/** Paragraph offsets refer to the immutable raw source; never split a condition off its sentence. */
export function sourceSpans(source) {
  const out = []
  for (const m of String(source.body ?? '').matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)) {
    const text = m[0].trim()
    if (!text) continue
    const start = m.index + m[0].indexOf(text)
    out.push({ id: `${source.id}:${start}`, sourceId: source.id, start, end: start + text.length, text })
    // Two independently labelled sentences can coexist in one paragraph. Keep the complete
    // paragraph too; never split a paragraph that carries a date or a qualifying condition.
    if (OPENING.test(text) && PROMOTION.test(text) && !CONDITIONAL.test(text)) {
      for (const part of text.matchAll(/[^.!?\n]+[.!?](?=\s|$)|[^.!?\n]+$/g)) {
        const sentence = part[0].trim()
        if (!sentence || sentence === text || (OPENING.test(sentence) && PROMOTION.test(sentence))) continue
        const offset = start + part.index + part[0].indexOf(sentence)
        out.push({
          id: `${source.id}:${offset}:sentence`,
          sourceId: source.id,
          start: offset,
          end: offset + sentence.length,
          text: sentence
        })
      }
    }
  }
  return out
}

const iso = (v) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null
const normalized = (type, v) =>
  type === 'phone' ? String(v).replace(/[^\d+]/g, '') : String(v).trim().toLowerCase()

function hasEventDate(references, value, zone, edge) {
  if (!value || !zone) return false
  let parts
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat('en', { timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric' })
        .formatToParts(new Date(value))
        .map((p) => [p.type, p.value])
    )
  } catch {
    return false
  }
  const month = Number(parts.month),
    day = Number(parts.day),
    year = parts.year
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]
  const name = `(?:${names[month - 1]}|${names[month - 1].slice(0, 3)}\\.?)`
  const date = `(?:${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}|${name}\\s+${day}(?:st|nd|rd|th)?[,]?\\s+${year}|${day}\\s+${name}[,]?\\s+${year})`
  const predicate =
    edge === 'end' ? '(?:until|through|ends?|expires?|valid to)' : '(?:from|starts?|begins?|valid from)'
  const pattern = new RegExp(`${predicate}\\s+(?:on\\s+)?${date}\\b`, 'i')
  return references.some((r) => pattern.test(r.quote))
}

/** Only exact spans can support proposals. A model's confidence never resolves a conflict. */
export function validateFact(proposal, sources, at) {
  const errors = []
  if (
    !proposal ||
    Object.keys(proposal).some(
      (k) =>
        ![
          'type',
          'value',
          'branch',
          'sourceRefs',
          'observedAt',
          'validFrom',
          'validUntil',
          'timeZone'
        ].includes(k)
    )
  )
    errors.push('FACT_UNKNOWN_KEY')
  if (!TYPES.has(proposal?.type)) errors.push('FACT_TYPE')
  if (typeof proposal?.value !== 'string' || !proposal.value.trim()) errors.push('FACT_VALUE')
  if (typeof proposal?.branch !== 'string' || !proposal.branch) errors.push('FACT_BRANCH')
  if (['website', 'booking'].includes(proposal?.type)) {
    try {
      const u = new URL(proposal.value)
      if (u.protocol !== 'https:' || u.username || u.password) errors.push('FACT_URL')
    } catch {
      errors.push('FACT_URL')
    }
  }
  if (!Array.isArray(proposal?.sourceRefs) || !proposal.sourceRefs.length) errors.push('FACT_SOURCE')
  const references = []
  for (const ref of proposal?.sourceRefs ?? []) {
    const span = sourceSpan(ref, sources)
    if (!span.ok) {
      errors.push('FACT_SPAN')
      continue
    }
    const source = span.source
    references.push({ source, quote: ref.quote })
    if (!sourceSpans(source).some((s) => s.start === ref.start && s.end === ref.end))
      errors.push('FACT_CONTEXT_INCOMPLETE')
    if (
      !['official-website', 'own-post', 'account-overlay', 'business-listing', 'collected-profile'].includes(
        source.kind
      )
    )
      errors.push('FACT_AUTHORSHIP')
    if (
      ['business-listing', 'collected-profile'].includes(source.kind) &&
      !source.structuredFacts?.some((f) => f.type === proposal.type && f.value === proposal.value)
    )
      errors.push('FACT_LISTING_NOT_TYPED')
    if (UNTRUSTED.test(ref.quote)) errors.push('FACT_SOURCE_INSTRUCTIONS')
    if (!ref.quote.includes(proposal.value ?? '')) errors.push('FACT_VALUE_NOT_EXACT')
    if ((source.branch ?? 'unspecified') !== proposal.branch) errors.push('FACT_BRANCH_MISMATCH')
    if (proposal.type === 'opening-hours' && (!OPENING.test(ref.quote) || PROMOTION.test(ref.quote)))
      errors.push('FACT_HOURS_PREDICATE')
    if (proposal.type === 'promotion' && !PROMOTION.test(ref.quote)) errors.push('FACT_PROMOTION_PREDICATE')
  }
  const validFrom = iso(proposal?.validFrom),
    validUntil = iso(proposal?.validUntil)
  if ((proposal?.validFrom && !validFrom) || (proposal?.validUntil && !validUntil))
    errors.push('FACT_TIME_INVALID')
  if (validFrom && validUntil && validUntil < validFrom) errors.push('FACT_TIME_ORDER')
  if (proposal?.timeZone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: proposal.timeZone }).format(0)
    } catch {
      errors.push('FACT_TIME_ZONE')
    }
  }
  if (
    proposal?.type === 'promotion' &&
    ((validFrom && !hasEventDate(references, validFrom, proposal.timeZone, 'start')) ||
      (validUntil && !hasEventDate(references, validUntil, proposal.timeZone, 'end')))
  )
    errors.push('FACT_EVENT_DATE_UNSOURCED')
  const timeUnclear = proposal?.type === 'promotion' && (!validUntil || !proposal.timeZone)
  const stale = validUntil && validUntil < at
  const future = validFrom && validFrom > at
  // Recency alone cannot turn a social offer without an event date into a current offer.
  const profilePending = references.some((r) => r.source.kind === 'collected-profile')
  const status =
    errors.length || profilePending || timeUnclear || future ? 'unknown' : stale ? 'stale' : 'supported'
  return {
    ok: !errors.length,
    errors,
    fact: {
      ...proposal,
      observedAt:
        references
          .map((r) => iso(r.source.observedAt))
          .filter(Boolean)
          .sort()
          .at(-1) ?? null,
      validFrom,
      validUntil,
      status,
      reason:
        errors[0] ??
        (profilePending
          ? 'PROFILE_PROVENANCE_PENDING'
          : timeUnclear
            ? 'PROMOTION_VALIDITY_UNKNOWN'
            : future
              ? 'NOT_YET_VALID'
              : stale
                ? 'EXPIRED'
                : null)
    }
  }
}

/** Build from the existing place view/revision and raw website/post evidence, never a second profile. */
export function buildQualityDossier({
  accountId,
  snapshotId,
  overlay = {},
  business = {},
  sources = [],
  proposals = [],
  at
}) {
  if (!accountId || !iso(at)) throw new Error('QUALITY_DOSSIER_IDENTITY')
  const ownSources = sources.map((s) => {
    if (!s.id || typeof s.body !== 'string' || (s.accountId && s.accountId !== accountId))
      throw new Error('QUALITY_SOURCE_SCOPE')
    return { ...structuredClone(s), observedAt: iso(s.observedAt), contentHash: qualityHash(s.body) }
  })
  if (new Set(ownSources.map((s) => s.id)).size !== ownSources.length)
    throw new Error('QUALITY_SOURCE_DUPLICATE')
  const spans = ownSources.flatMap(sourceSpans)
  const facts = [...new Map(proposals.map((p) => [qualityHash(p), p])).values()].map((p) => {
    const checked = validateFact(p, ownSources, new Date(at).toISOString())
    return { ...checked.fact, id: `claim:${qualityHash(p).slice(0, 24)}` }
  })
  const conflicts = []
  const contactCandidate = (f) => f.status === 'supported' || f.reason === 'PROFILE_PROVENANCE_PENDING'
  for (const type of ['phone', 'email', 'address', 'opening-hours', 'booking']) {
    const branches = new Set(facts.filter((f) => f.type === type && contactCandidate(f)).map((f) => f.branch))
    for (const branch of branches) {
      const group = facts.filter((f) => f.type === type && f.branch === branch && contactCandidate(f))
      if (new Set(group.map((f) => normalized(type, f.value))).size < 2) continue
      const id = `conflict:${qualityHash({ type, branch, ids: group.map((f) => f.id) }).slice(0, 24)}`
      conflicts.push({
        id,
        type,
        branch,
        claimRefs: group.map((f) => f.id),
        policy: 'withhold-until-source-branch-time-adjudication'
      })
      for (const f of group) {
        f.status = 'conflicted'
        f.reason = id
      }
    }
  }
  const input = {
    schemaVersion: 'tracy-wo-dossier/v1',
    policyVersion: QUALITY_POLICY,
    accountId,
    snapshotId: snapshotId ?? null,
    overlay: structuredClone(overlay),
    business: structuredClone(business),
    at: new Date(at).toISOString(),
    sources: ownSources,
    spans,
    facts,
    conflicts,
    missing: ['phone', 'opening-hours', 'booking'].filter(
      (t) => !facts.some((f) => f.type === t && f.status === 'supported')
    ),
    coverage: { sources: ownSources.length, spans: spans.length },
    validation: { state: 'validated' }
  }
  return { ...input, inputHash: qualityHash(input) }
}

/** Deterministic proposals cover unambiguous typed values; difficult prose belongs to role A. */
export function deterministicFacts(sources) {
  const facts = []
  for (const source of sources)
    for (const span of sourceSpans(source)) {
      const add = (type, value) =>
        facts.push({
          type,
          value,
          branch: source.branch ?? 'unspecified',
          observedAt: source.observedAt ?? null,
          validFrom: null,
          validUntil: null,
          sourceRefs: [{ sourceId: source.id, start: span.start, end: span.end, quote: span.text }]
        })
      if (UNTRUSTED.test(span.text)) continue
      for (const fact of source.structuredFacts ?? [])
        if (TYPES.has(fact.type) && span.text.includes(fact.value)) add(fact.type, fact.value)
      for (const m of span.text.matchAll(/(?:\+\d[\d ()-]{6,}\d|\b0\d[\d ()-]{7,}\d)\b/g)) add('phone', m[0])
      for (const m of span.text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)) add('email', m[0])
      const times = [...span.text.matchAll(TIME)]
      if (times.length >= 2 && !(OPENING.test(span.text) && PROMOTION.test(span.text))) {
        const value = span.text.slice(times[0].index, times.at(-1).index + times.at(-1)[0].length)
        if (PROMOTION.test(span.text)) add('promotion', value)
        else if (OPENING.test(span.text)) add('opening-hours', value)
      }
    }
  return facts
}

export { checkClaimRefs } from '../lib/claim-refs.js'

export function dossierMarkdown(d) {
  const cell = (v) =>
    String(v ?? '')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ')
  return [
    `# Place dossier`,
    ``,
    `Input: ${d.inputHash}`,
    ``,
    '| Claim | Predicate | Branch | Status | Value | Source |',
    '|---|---|---|---|---|---|',
    ...d.facts.map(
      (f) =>
        `| ${f.id} | ${f.type} | ${cell(f.branch)} | ${f.status} | ${cell(f.value)} | ${f.sourceRefs.map((r) => `${r.sourceId}:${r.start}-${r.end}`).join(', ')} |`
    ),
    ``,
    ...d.conflicts.map((c) => `- ${c.id}: ${c.policy}`),
    ``
  ].join('\n')
}

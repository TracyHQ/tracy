/** A reviewer reports evidence and never receives CMS authority or the planner's verdict. */
import { QUALITY_POLICY, qualityHash } from './quality-dossier.js'

const SEVERITY = new Set(['critical', 'major', 'minor'])
const DIMENSIONS = new Set(['facts', 'identity', 'coherence', 'pictures', 'cta', 'mobile'])

export function blindReviewInput({
  dossier,
  observations,
  content,
  render,
  contentHash = qualityHash(content)
}) {
  return {
    schemaVersion: 'tracy-wo-blind-review-input/v1',
    policyVersion: QUALITY_POLICY,
    accountId: dossier.accountId,
    dossier,
    observations,
    content,
    render,
    contentHash,
    renderHash: render.hash
  }
}

/** Missing/broken captures and a stale content hash mean attention, even if the model says pass. */
export function validateQualityReview(
  report,
  input,
  { requiredRoutes = [], requiredImages = [], fields = [] } = {}
) {
  const errors = [],
    findings = Array.isArray(report?.findings) ? report.findings : [],
    reportedCoverage = Array.isArray(report?.coverage) ? report.coverage : []
  if (
    report?.schemaVersion !== 'tracy-wo-review/v1' ||
    report?.contentHash !== input.contentHash ||
    report?.renderHash !== input.renderHash
  )
    errors.push('REVIEW_STALE')
  if (!Array.isArray(report?.findings) || !Array.isArray(report?.coverage)) errors.push('REVIEW_SCHEMA')
  if (!['pass', 'needs-attention'].includes(report?.verdict) || report?.findings?.length > 50)
    errors.push('REVIEW_SCHEMA')
  if (
    Object.keys(report ?? {}).some(
      (k) => !['schemaVersion', 'contentHash', 'renderHash', 'findings', 'coverage', 'verdict'].includes(k)
    )
  )
    errors.push('REVIEW_UNKNOWN_KEY')
  const captures = input.render.captures ?? []
  const evidenceImages =
    input.render.reviewImages ??
    captures.map((c) => ({
      route: c.route,
      width: c.width,
      imageHash: c.imageHash
    }))
  const expected = requiredImages.length ? requiredImages : []
  const coveredKeys = new Set()
  for (const c of reportedCoverage) {
    if (!c || typeof c !== 'object') {
      errors.push('REVIEW_COVERAGE_UNKNOWN_OR_DUPLICATE')
      continue
    }
    const key = `${c.route}@${c.width}:${c.imageHash}:${c.imageId ?? ''}`
    if (
      coveredKeys.has(key) ||
      Object.keys(c).some((key) => !['route', 'width', 'imageHash', 'imageId'].includes(key)) ||
      !evidenceImages.some(
        (i) =>
          i.route === c.route &&
          i.width === c.width &&
          i.imageHash === c.imageHash &&
          (!i.imageId || i.imageId === c.imageId)
      )
    )
      errors.push('REVIEW_COVERAGE_UNKNOWN_OR_DUPLICATE')
    coveredKeys.add(key)
  }
  for (const c of expected)
    if (!coveredKeys.has(`${c.route}@${c.width}:${c.imageHash}:${c.imageId ?? ''}`))
      errors.push(`REVIEW_PIXEL_COVERAGE_MISSING:${c.route}@${c.width}:${c.imageHash}`)
  for (const route of requiredRoutes)
    for (const width of [1440, 390]) {
      const c = captures.find((c) => c.route === route && c.width === width)
      if (
        !c ||
        c.error ||
        c.status !== 200 ||
        !c.imageHash ||
        !c.textHash ||
        c.captureComplete !== true ||
        c.contentHash !== input.contentHash
      )
        errors.push(`REVIEW_CAPTURE_MISSING:${route}@${width}`)
      if (
        !reportedCoverage.some(
          (covered) =>
            covered?.route === route && covered.width === width && covered.imageHash === c?.imageHash
        )
      )
        errors.push(`REVIEW_COVERAGE_MISSING:${route}@${width}`)
    }
  const ids = new Set()
  for (const f of findings) {
    if (!f || typeof f !== 'object') {
      errors.push('REVIEW_FINDING_SCHEMA')
      continue
    }
    if (
      !f.id ||
      typeof f.id !== 'string' ||
      f.id.length > 100 ||
      ids.has(f.id) ||
      !SEVERITY.has(f.severity) ||
      !DIMENSIONS.has(f.dimension) ||
      typeof f.message !== 'string' ||
      !f.message.trim() ||
      f.message.length > 1000
    )
      errors.push('REVIEW_FINDING_SCHEMA')
    ids.add(f.id)
    const c = evidenceImages.find(
      (c) =>
        c.route === f.route &&
        c.width === f.width &&
        c.imageHash === f.imageHash &&
        (!c.imageId || c.imageId === f.imageId)
    )
    if (
      !c ||
      typeof f.evidence !== 'string' ||
      !f.evidence.trim() ||
      f.evidence.length > 2000 ||
      (!f.selector && !f.field) ||
      (f.selector && (typeof f.selector !== 'string' || f.selector.length > 500)) ||
      (f.field && (typeof f.field !== 'string' || f.field.length > 250))
    )
      errors.push('REVIEW_FINDING_EVIDENCE')
    if (f.field && fields.length && !fields.includes(f.field)) errors.push('REVIEW_FINDING_FIELD')
    // An invented booking or phone can have no matching claim. Require the explicit empty list,
    // rather than forcing the reviewer to invent an evidence ID to report missing evidence.
    if (['facts', 'cta'].includes(f.dimension) && !Array.isArray(f.claimRefs))
      errors.push('REVIEW_FINDING_CLAIMS')
    if (
      (f.claimRefs && (!Array.isArray(f.claimRefs) || f.claimRefs.length > 30)) ||
      (Array.isArray(f.claimRefs) && f.claimRefs.some((id) => !input.dossier.facts?.some((c) => c.id === id)))
    )
      errors.push('REVIEW_FINDING_CLAIM_UNKNOWN')
    if (
      Object.keys(f).some(
        (k) =>
          ![
            'id',
            'severity',
            'dimension',
            'message',
            'route',
            'width',
            'imageHash',
            'imageId',
            'evidence',
            'selector',
            'field',
            'claimRefs'
          ].includes(k)
      )
    )
      errors.push('REVIEW_FINDING_AUTHORITY')
  }
  const critical = findings.filter((f) => ['critical', 'major'].includes(f?.severity)).length
  const state =
    errors.length || critical || report?.verdict !== 'pass' ? 'needs-attention' : 'ready-for-human'
  const artifact = {
    schemaVersion: 'tracy-wo-review/v1',
    policyVersion: input.policyVersion ?? QUALITY_POLICY,
    inputHash: qualityHash(input),
    accountId: input.accountId,
    contentHash: input.contentHash,
    renderHash: input.renderHash,
    findings,
    coverage: reportedCoverage,
    state,
    validation: { state: errors.length ? 'invalid' : 'validated', errors }
  }
  return { ok: !errors.length, errors, artifact: { ...artifact, hash: qualityHash(artifact) } }
}

export function qualityGate({ mechanical, semantic, currentContentHash, requiredCoverageBlocked = false }) {
  if (
    requiredCoverageBlocked ||
    mechanical?.pass !== true ||
    !mechanical.complete ||
    semantic?.state !== 'ready-for-human' ||
    semantic?.contentHash !== currentContentHash ||
    semantic?.validation?.state !== 'validated'
  )
    return { state: 'needs-attention', outreach: false }
  return { state: 'ready-for-human', outreach: false, humanAcceptance: 'pending' }
}

export const QUALITY_REVIEW_SYSTEM = `Review the actual rendered website of this business independently. You have the frozen evidence dossier, image observations, current CMS content and real screenshots. You have no writer verdict or permission to edit.
Find false or ambiguous facts, unsupported contacts/hours/prices/booking claims, industrial sample content, incoherent groups, misleading images and unusable desktop/mobile crops or CTAs.
Opening hours are not happy hour. Red wine or a dining board is not evidence of whisky. Source captions do not establish image identity. A missing or unreadable screenshot is missing evidence, not proof the product is broken.
Return JSON only {"schemaVersion":"tracy-wo-review/v1","contentHash":"...","renderHash":"...","coverage":[{"route":"/","width":1440,"imageHash":"...","imageId":"exact supplied reviewImages.imageId"}],"findings":[{"id":"...","severity":"critical|major|minor","dimension":"facts|identity|coherence|pictures|cta|mobile","message":"...","route":"...","width":390,"imageHash":"...","imageId":"exact supplied reviewImages.imageId","evidence":"visible text or crop coordinates and the conflicting source","selector":"...","field":"known field if identifiable","claimRefs":["claim ids"]}],"verdict":"pass|needs-attention"}.
For a factual claim or CTA absent from the dossier, use claimRefs:[] and identify both the visible unsupported statement and the missing predicate in evidence. Never invent an evidence ID.
Cover every supplied route and viewport. Missing evidence or any unresolved major/critical finding means needs-attention. Do not output a patch, SQL, commands, API requests, credentials or hidden reasoning.`

/** Execution limits are immutable revision data, independent of the root's monetary allowance. */
import { qualityHash } from './quality-dossier.js'

const fail = (code) => Object.assign(new Error(code), { code })
const profiles = {
  'quickstart-first-v1': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'quickstart-first-v1',
    maxFieldCalls: 64,
    fieldConcurrency: 2,
    automaticReview: false,
    initialSchemaRepair: true,
    repairRounds: 0,
    providerTimeoutMs: 600000,
    attemptLeaseMs: 660000,
    fields: { maxInputTokens: 100000, maxTokens: 32000, maxImages: 0 },
    observations: { maxInputTokens: 100000, maxTokens: 12000, maxImages: 8 }
  },
  'legacy-v1': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'legacy-v1',
    maxFieldCalls: 11,
    maxLocalReviewCalls: 9,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 54,
    maxCaptures: 24,
    repairRounds: 2,
    localReview: { maxInputTokens: 20000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 20000, maxTokens: 3000, maxImages: 6 }
  },
  'bounded-v2': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'bounded-v2',
    maxFieldCalls: 8,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    repairRounds: 2,
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  },
  'bounded-v3': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'bounded-v3',
    maxFieldCalls: 8,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    repairRounds: 2,
    facts: { maxInputTokens: 70000, maxTokens: 12000, maxImages: 0 },
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  },
  'manual-review-v1': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'manual-review-v1',
    maxFieldCalls: 8,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    automaticReview: false,
    repairRounds: 0,
    initialSchemaRepair: true,
    providerTimeoutMs: 600000,
    attemptLeaseMs: 660000,
    facts: { maxInputTokens: 70000, maxTokens: 32000, maxImages: 0 },
    outline: { maxInputTokens: 70000, maxTokens: 32000, maxImages: 0 },
    fields: { maxInputTokens: 40000, maxTokens: 22000, maxImages: 0 },
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  },
  'manual-review-v2': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'manual-review-v2',
    maxFieldCalls: 8,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    automaticReview: false,
    repairRounds: 0,
    initialSchemaRepair: false,
    providerTimeoutMs: 600000,
    attemptLeaseMs: 660000,
    facts: { maxInputTokens: 70000, maxTokens: 32000, maxImages: 0 },
    observations: { maxInputTokens: 20000, maxTokens: 32000, maxImages: 6 },
    outline: { maxInputTokens: 200000, maxTokens: 32000, maxImages: 0 },
    fields: { maxInputTokens: 40000, maxTokens: 22000, maxImages: 0 },
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  },
  'manual-review-v3': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'manual-review-v3',
    maxFieldCalls: 8,
    fieldConcurrency: 2,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    automaticReview: false,
    repairRounds: 0,
    initialSchemaRepair: true,
    providerTimeoutMs: 600000,
    attemptLeaseMs: 660000,
    facts: { maxInputTokens: 70000, maxTokens: 32000, maxImages: 0 },
    observations: { maxInputTokens: 20000, maxTokens: 32000, maxImages: 6 },
    outline: { maxInputTokens: 200000, maxTokens: 32000, maxImages: 0 },
    fields: { maxInputTokens: 40000, maxTokens: 22000, maxImages: 0 },
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  },
  'manual-review-v4': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'manual-review-v4',
    maxFieldCalls: 8,
    fieldConcurrency: 2,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    automaticReview: false,
    repairRounds: 0,
    initialSchemaRepair: false,
    providerTimeoutMs: 600000,
    attemptLeaseMs: 660000,
    facts: { maxInputTokens: 70000, maxTokens: 32000, maxImages: 0 },
    observations: { maxInputTokens: 20000, maxTokens: 32000, maxImages: 6 },
    outline: { maxInputTokens: 200000, maxTokens: 32000, maxImages: 0 },
    fields: { maxInputTokens: 40000, maxTokens: 22000, maxImages: 0 },
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  },
  'manual-review-v5': {
    schemaVersion: 'tracy-wo-execution-profile/v1',
    id: 'manual-review-v5',
    maxFieldCalls: 8,
    maxFieldCorrections: 4,
    fieldConcurrency: 2,
    maxLocalReviewCalls: 8,
    maxDetailPages: 4,
    maxEstimatedTokensPerFieldBatch: 6000,
    maxCaptureSlices: 48,
    maxCaptures: 24,
    automaticReview: false,
    repairRounds: 0,
    initialSchemaRepair: false,
    providerTimeoutMs: 600000,
    attemptLeaseMs: 660000,
    facts: { maxInputTokens: 70000, maxTokens: 32000, maxImages: 0 },
    observations: { maxInputTokens: 20000, maxTokens: 32000, maxImages: 6 },
    outline: { maxInputTokens: 200000, maxTokens: 32000, maxImages: 0 },
    fields: { maxInputTokens: 40000, maxTokens: 22000, maxImages: 0 },
    localReview: { maxInputTokens: 54000, maxTokens: 3000, maxImages: 6 },
    globalReview: { maxInputTokens: 120000, maxTokens: 3000, maxImages: 6 }
  }
}

export function qualityExecutionProfile(id = 'bounded-v3') {
  const body = profiles[id]
  if (!body) throw fail('QUALITY_EXECUTION_PROFILE_UNKNOWN')
  return { ...structuredClone(body), hash: qualityHash(body) }
}

export function validateQualityExecutionProfile(profile) {
  if (!profile || !profiles[profile.id]) throw fail('QUALITY_EXECUTION_PROFILE_UNKNOWN')
  const canonical = qualityExecutionProfile(profile.id)
  if (qualityHash(profile) !== qualityHash(canonical)) throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
  return canonical
}

/** Preflight and dispatch share one idempotent wire input; legacy tasks retain their exact bytes. */
export function qualityExecutionInput(input, profile = null) {
  if (!profile) return input
  const checked = validateQualityExecutionProfile(profile)
  const reference = { id: checked.id, hash: checked.hash }
  if (Object.hasOwn(input, 'executionProfile')) {
    if (qualityHash(input.executionProfile) !== qualityHash(reference))
      throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
    return input
  }
  return { ...input, executionProfile: reference }
}

export function qualityExecutionBudget(budget, profile = null) {
  if (!profile) return budget
  const checked = validateQualityExecutionProfile(profile)
  if (budget.executionProfileHash && budget.executionProfileHash !== checked.hash)
    throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
  const limits = {}
  for (const key of ['providerTimeoutMs', 'attemptLeaseMs']) {
    if (checked[key] === undefined) continue
    if (budget[key] !== undefined && budget[key] !== checked[key])
      throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
    limits[key] = checked[key]
  }
  return { ...budget, executionProfileHash: checked.hash, ...limits }
}

export function qualityExecutionModel(config, profile) {
  const checked = validateQualityExecutionProfile(profile)
  const { hash: _hash, executionProfile: existing, ...body } = config
  if (existing && qualityHash(existing) !== qualityHash(checked))
    throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
  const value = { ...body, executionProfile: checked }
  return { ...value, hash: qualityHash(value) }
}

/** Missing profile means the original limits and original model hashes, including on resume. */
export function qualityExecutionOf(input) {
  if (!input.executionProfile) {
    if (Object.values(input.models ?? {}).some((model) => model.executionProfile))
      throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
    return qualityExecutionProfile('legacy-v1')
  }
  const profile = validateQualityExecutionProfile(input.executionProfile)
  for (const model of Object.values(input.models ?? {})) {
    if (!model.executionProfile || qualityHash(model.executionProfile) !== qualityHash(profile))
      throw fail('QUALITY_EXECUTION_PROFILE_CHANGED')
    if (qualityExecutionModel(model, profile).hash !== model.hash)
      throw fail('QUALITY_EXECUTION_MODEL_CHANGED')
  }
  return profile
}

export function qualityExecutionLimits(profile, stage) {
  const checked = validateQualityExecutionProfile(profile)
  if (stage === 'a-facts')
    return checked.facts ? { ...checked.facts } : { maxTokens: 4000, maxInputTokens: 70000, maxImages: 0 }
  if (/^b-pictures-[1-4]$/.test(stage))
    return checked.observations
      ? { ...checked.observations }
      : { maxTokens: 4000, maxInputTokens: 20000, maxImages: 6 }
  if (stage === 'c1-outline' || (stage === 'c-schema-repair' && checked.initialSchemaRepair !== false))
    return checked.outline
      ? { ...checked.outline }
      : { maxTokens: 12000, maxInputTokens: 70000, maxImages: 0 }
  if (/^c2-[1-9][0-9]*$/.test(stage) && Number(stage.slice(3)) <= checked.maxFieldCalls)
    return checked.fields ? { ...checked.fields } : { maxTokens: 8000, maxInputTokens: 40000, maxImages: 0 }
  const correction = /^c-fields-fix-([1-9][0-9]*)$/.exec(stage)
  if (correction && Number(correction[1]) <= (checked.maxFieldCorrections ?? 0)) return { ...checked.fields }
  if (checked.automaticReview === false) throw fail('QUALITY_UNPLANNED_CALL')
  if (/^patch-[12]$/.test(stage)) return { maxTokens: 8000, maxInputTokens: 40000, maxImages: 0 }
  const review = /^d-r([0-2])-([1-9][0-9]*)$/.exec(stage)
  if (review) {
    const batch = Number(review[2])
    if (batch <= checked.maxLocalReviewCalls) return { ...checked.localReview }
    if (batch === checked.maxLocalReviewCalls + 1) return { ...checked.globalReview }
  }
  throw fail('QUALITY_UNPLANNED_CALL')
}

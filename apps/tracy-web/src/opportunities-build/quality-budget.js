/** Reserve forecast room for review and both repair rounds; a forecast never claims money is held. */
import { qualityHash } from './quality-dossier.js'
import {
  qualityExecutionLimits,
  qualityExecutionOf,
  validateQualityExecutionProfile
} from './quality-execution-profile.js'

const fail = (code) => Object.assign(new Error(code), { code })
const ceiling = (config, input, output) =>
  Math.ceil((input * config.price.inputCentsPerM + output * config.price.outputCentsPerM) / 1000000)

export function qualityBudgetSlots({
  models,
  observationBatches,
  maxFieldCalls,
  reviewCalls,
  executionProfile
}) {
  const profile = executionProfile ? validateQualityExecutionProfile(executionProfile) : null,
    automaticReview = profile?.automaticReview !== false,
    repairRounds = profile?.repairRounds ?? 2
  maxFieldCalls ??= profile?.maxFieldCalls ?? 11
  reviewCalls ??= automaticReview ? (profile ? profile.maxLocalReviewCalls + 1 : 10) : 0
  if (
    !Number.isInteger(observationBatches) ||
    observationBatches < 0 ||
    observationBatches > 4 ||
    !Number.isInteger(maxFieldCalls) ||
    maxFieldCalls < 1 ||
    maxFieldCalls > 11 ||
    !Number.isInteger(reviewCalls) ||
    reviewCalls < (automaticReview ? 1 : 0) ||
    reviewCalls > 10 ||
    (profile &&
      (maxFieldCalls !== profile.maxFieldCalls ||
        (automaticReview
          ? reviewCalls !== profile.maxLocalReviewCalls + 1
          : ![0, profile.maxLocalReviewCalls + 1].includes(reviewCalls))))
  )
    throw fail('QUALITY_FORECAST_POLICY')
  const facts = profile
      ? qualityExecutionLimits(profile, 'a-facts')
      : { maxInputTokens: 70000, maxTokens: 4000 },
    outline = profile
      ? qualityExecutionLimits(profile, 'c1-outline')
      : { maxInputTokens: 70000, maxTokens: 12000 },
    fields = profile ? qualityExecutionLimits(profile, 'c2-1') : { maxInputTokens: 40000, maxTokens: 8000 },
    observations = profile
      ? qualityExecutionLimits(profile, 'b-pictures-1')
      : { maxInputTokens: 20000, maxTokens: 4000 }
  if (!automaticReview) reviewCalls = 0
  const slots = [
    {
      stage: 'a-facts',
      role: 'facts',
      ceilingCents: ceiling(models.facts, facts.maxInputTokens, facts.maxTokens)
    },
    {
      stage: 'c1-outline',
      role: 'plan',
      ceilingCents: ceiling(models.plan, outline.maxInputTokens, outline.maxTokens)
    }
  ]
  if (profile?.initialSchemaRepair !== false)
    slots.push({
      stage: 'c-schema-repair',
      role: 'plan',
      ceilingCents: ceiling(models.plan, outline.maxInputTokens, outline.maxTokens)
    })
  for (let i = 1; i <= observationBatches; i++)
    slots.push({
      stage: `b-pictures-${i}`,
      role: 'observations',
      ceilingCents: ceiling(models.observations, observations.maxInputTokens, observations.maxTokens)
    })
  for (let i = 1; i <= maxFieldCalls; i++)
    slots.push({
      stage: `c2-${i}`,
      role: 'plan',
      ceilingCents: ceiling(models.plan, fields.maxInputTokens, fields.maxTokens)
    })
  for (let i = 1; i <= (profile?.maxFieldCorrections ?? 0); i++)
    slots.push({
      stage: `c-fields-fix-${i}`,
      role: 'plan',
      ceilingCents: ceiling(models.plan, fields.maxInputTokens, fields.maxTokens)
    })
  for (let round = 0; automaticReview && round <= repairRounds; round++)
    for (let batch = 1; batch <= reviewCalls; batch++)
      slots.push({
        stage: `d-r${round}-${batch}`,
        role: 'review',
        ceilingCents: ceiling(
          models.review,
          profile
            ? (batch === reviewCalls ? profile.globalReview : profile.localReview).maxInputTokens
            : 20000,
          profile ? (batch === reviewCalls ? profile.globalReview : profile.localReview).maxTokens : 3000
        )
      })
  for (let round = 1; automaticReview && round <= repairRounds; round++)
    slots.push({ stage: `patch-${round}`, role: 'plan', ceilingCents: ceiling(models.plan, 40000, 8000) })
  return {
    schemaVersion: 'tracy-wo-call-forecast/v1',
    ...(profile ? { executionProfileHash: profile.hash } : {}),
    slots,
    totalCalls: slots.length,
    ceilingCents: slots.reduce((n, s) => n + s.ceilingCents, 0),
    assumptions: {
      maxFieldCalls,
      observationBatches,
      reviewCalls,
      repairRounds,
      reviewIncludesGlobalCoherence: automaticReview,
      reviewMaxInputTokens: automaticReview ? (profile?.localReview.maxInputTokens ?? 20000) : 0,
      ...(profile
        ? { globalReviewMaxInputTokens: automaticReview ? profile.globalReview.maxInputTokens : 0 }
        : {}),
      reviewMaxOutputTokens: automaticReview ? 3000 : 0,
      maxImagesPerCall: 6
    }
  }
}

export function createQualityHeadroom({ pool, ledger, store, verifyReuse = null }) {
  if (verifyReuse !== null && typeof verifyReuse !== 'function') throw fail('QUALITY_FORECAST_POLICY')
  return async ({
    run,
    models,
    maxFieldCalls,
    reviewCalls,
    stage = null,
    budget = null,
    observationBatches
  }) => {
    const profile = qualityExecutionOf(run.input)
    const forecast = qualityBudgetSlots({
      models,
      maxFieldCalls,
      reviewCalls,
      observationBatches,
      ...(run.input.executionProfile ? { executionProfile: profile } : {})
    })
    if (forecast.totalCalls > run.policy.maxAttempts) throw fail('QUALITY_CALL_HEADROOM')
    if (stage && !forecast.slots.some((s) => s.stage === stage)) throw fail('QUALITY_UNPLANNED_CALL')
    const remaining = async (db) => {
      const held = (
        await db.query('select artifacts from wo_quality_run where id=$1 and account_id=$2', [
          run.id,
          run.account_id
        ])
      ).rows[0]
      if (!held) throw fail('QUALITY_RUN_NOT_FOUND')
      const attempts = (
        await db.query(
          `select a.id,a.stage,a.state,a.model_config,a.receipt,l.state as ledger_state
        from wo_quality_attempt a left join wo_cost_ledger l on l.id=a.reservation_id
          or l.request_key='quality:'||a.id::text||':'||a.lease_token::text
        where a.intent_id=$1`,
          [run.intent_id]
        )
      ).rows
      if (attempts.some((a) => a.state === 'uncertain' || a.ledger_state === 'unreconciled'))
        throw fail('QUALITY_ATTEMPT_UNCERTAIN')
      let cents = 0
      for (const slot of forecast.slots) {
        const hash = models[slot.role].hash
        if (
          (await verifyReuse?.({
            db,
            run,
            slot,
            modelConfigHash: hash,
            artifacts: held.artifacts
          })) === true
        )
          continue
        if (slot.stage === stage) continue
        const paid = held.artifacts[`paid-slot:${slot.stage}`]
        const matching = attempts.filter((a) => a.stage === slot.stage && a.model_config.hash === hash)
        if (
          paid?.modelConfigHash === hash &&
          matching.some(
            (a) =>
              a.id === paid.attemptId &&
              ['succeeded', 'failed'].includes(a.state) &&
              Number.isFinite(a.receipt?.costCents) &&
              a.ledger_state === 'settled'
          )
        )
          continue
        // An in-flight slot already counts in the ledger's committed sum. Do not count it twice.
        if (matching.some((a) => a.ledger_state === 'reserved')) continue
        cents += slot.ceilingCents
      }
      return cents
    }
    const balance = await ledger.headroom({
      jobId: run.intent_id,
      accountId: run.account_id,
      accountDailyCapCents: run.policy.accountDailyCapCents,
      jobCapCents: run.policy.jobCapCents
    })
    const minRemainingCents = await remaining(pool)
    if (stage && minRemainingCents + budget.maxCents > balance.availableCents)
      throw fail('QUALITY_REMAINING_WORK_BUDGET')
    const value = { ...forecast, hash: qualityHash(forecast) }
    if (!stage) await store.artifact(run.id, run.account_id, 'call-forecast', value)
    return {
      forecast: value,
      remainingCeilingCents: minRemainingCents + (stage ? budget.maxCents : 0),
      balance,
      // reserve invokes this calculation again under its monetary lock, with fresh DB state.
      minRemainingCents: remaining
    }
  }
}

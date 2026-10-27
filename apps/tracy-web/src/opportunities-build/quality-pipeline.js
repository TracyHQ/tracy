/** Compose the finite path behind an explicit deployment adapter and account allowlist. */

import { createQualityHeadroom } from './quality-budget.js'
import { createQualityEditorial } from './quality-editorial.js'
import { createQualityFill } from './quality-fill.js'
import { qualityModelFor } from './quality-model.js'
import { loadQualityPreparation } from './quality-preparation.js'
import { qualityRunStore } from './quality-runs.js'
import { createQualitySiteReview } from './quality-site-review.js'
import { qualityExecutionOf } from './quality-execution-profile.js'
import { qualityHash } from './quality-dossier.js'

const fail = (code) => Object.assign(new Error(code), { code })
export function createQualityPipeline({
  pool,
  secret,
  ledger,
  accountIds,
  checkAllowed,
  modelFor = qualityModelFor,
  editorial: editorialDeps,
  fill: fillDeps,
  review: reviewDeps,
  now = Date.now
}) {
  if (!accountIds?.length || typeof checkAllowed !== 'function')
    throw fail('QUALITY_DEPLOYMENT_ADAPTER_REQUIRED')
  const allowed = async (context) => {
    if (!accountIds.includes(context.action?.account_id)) throw fail('QUALITY_ACCOUNT_SCOPE')
    await checkAllowed(context)
    const row = (
      await pool.query(
        `select r.state,i.state as intent_state,i.deadline,
      exists(select 1 from wo_quality_attempt a where a.intent_id=r.intent_id and a.state='uncertain') as uncertain
      from wo_quality_run r join wo_quality_intent i on i.id=r.intent_id
      where r.account_id=$1 and r.revision_id=$2`,
        [context.action.account_id, context.action.revision_id]
      )
    ).rows[0]
    if (
      row &&
      (['cancelled', 'failed'].includes(row.state) ||
        ['cancelled', 'failed'].includes(row.intent_state) ||
        new Date(row.deadline).getTime() <= now())
    )
      throw fail('QUALITY_RUN_CLOSED')
    if (row?.uncertain) throw fail('QUALITY_ATTEMPT_UNCERTAIN')
  }
  const guarded = (context) => ({
    ...context,
    checkAllowed: async () => {
      const mode = await context.checkAllowed()
      await allowed(context)
      return mode
    }
  })
  const store = qualityRunStore({ pool, now })
  const editorial = createQualityEditorial({
    pool,
    secret,
    ledger,
    now,
    headroom: createQualityHeadroom({ pool, ledger, store }),
    loadModel: modelFor,
    ...editorialDeps
  })
  const fill = createQualityFill({ pool, ...fillDeps })
  const loadContext = async (context) => {
    const run = await loadQualityPreparation(pool, {
      accountId: context.action.account_id,
      opportunityId: context.action.opportunity_id,
      revisionId: context.revision.id
    })
    if (
      !run ||
      context.revision.brief?.editorial?.runId !== run.id ||
      context.revision.brief.editorial.frozenHash !== run.input.frozenHash ||
      context.revision.brief.editorial.planHash !== run.artifacts.plan?.hash
    )
      throw fail('QUALITY_REVIEW_RUN_NOT_FOUND')
    return {
      run,
      frozen: run.input.frozen,
      plan: run.artifacts.plan,
      manifest: run.input.manifest,
      dossier: run.artifacts.dossier,
      observations: run.artifacts.observations,
      checkAllowed: () => allowed(context)
    }
  }
  const review = createQualitySiteReview({
    pool,
    loadContext,
    paidFor: editorial.paidFor,
    applyPatch: (context, { plan, repair, basePlan, baseContentHash, baseContent }) =>
      fill.applyPlan(context, {
        plan,
        basePlan,
        baseContentHash,
        baseContent,
        version: `repair-${repair.n}`
      }),
    ...reviewDeps
  })
  return {
    accountIds,
    available: async (accountId) => {
      if (!accountIds.includes(accountId)) return false
      try {
        for (const role of ['facts', 'observations', 'plan', 'review'])
          await modelFor({ pool, secret, role, now })
        return true
      } catch {
        return false
      }
    },
    checkAllowed: allowed,
    ...editorial,
    editorialFor: (context) => editorial.editorialFor(guarded(context)),
    adopt: (context) => editorial.adopt(guarded(context)),
    fill: (context) => fill.fill(guarded(context)),
    review: async (context) => {
      const run = await loadQualityPreparation(pool, {
        accountId: context.action.account_id,
        opportunityId: context.action.opportunity_id,
        revisionId: context.revision.id
      })
      if (!run) throw fail('QUALITY_REVIEW_RUN_NOT_FOUND')
      await allowed(context)
      const manual = qualityExecutionOf(run.input).automaticReview === false
      const fillReceipt =
        manual &&
        Object.values(run.artifacts).find(
          (value) =>
            value?.schemaVersion === 'tracy-wo-quality-fill/v1' &&
            value.state === 'succeeded' &&
            value.runId === run.id &&
            value.buildId === context.build.id &&
            value.planHash === run.artifacts.plan?.hash
        )
      if (manual && !fillReceipt) throw fail('QUALITY_FILL_RECEIPT_REQUIRED')
      const result = manual
        ? {
            state: 'needs-attention',
            error: 'AWAITING_HUMAN_REVIEW',
            readyForHuman: true,
            automatedReview: false,
            humanAccepted: false,
            runId: run.id,
            planHash: run.artifacts.plan?.hash,
            requestedBy: 'operator',
            contentHash: fillReceipt.contentHash,
            fillReceiptHash: qualityHash(fillReceipt)
          }
        : await review(guarded(context))
      await allowed(context)
      if (manual) {
        await store.artifact(run.id, run.account_id, 'awaiting-human-review', result)
        await pool.query('update wo_build set qa=$3::jsonb,updated_at=$4 where id=$1 and account_id=$2', [
          context.build.id,
          run.account_id,
          { state: 'quality-awaiting-human-v1', protocol: 'quality-v1', runId: run.id, humanAccepted: false },
          new Date(now())
        ])
      }
      await store.artifact(run.id, run.account_id, 'final-result', result)
      await pool.query(
        `update wo_quality_run set state=$3,error=$4,updated_at=$5
        where id=$1 and account_id=$2 and state not in ('cancelled','failed')`,
        [
          run.id,
          run.account_id,
          result.state === 'succeeded' ? 'succeeded' : 'needs-attention',
          result.error ?? null,
          new Date(now())
        ]
      )
      if (result.state === 'succeeded') {
        await pool.query(`update wo_build set qa=$3::jsonb,updated_at=$4 where id=$1 and account_id=$2`, [
          context.build.id,
          run.account_id,
          {
            state: 'passed',
            protocol: 'quality-v1',
            gate: result.gate,
            reportHash: result.report?.hash,
            runId: run.id,
            checkedAt: new Date(now()).toISOString(),
            humanAccepted: false
          },
          new Date(now())
        ])
        await pool.query(
          "update site_brief set state='quality-ready-v1',updated_at=$2 where site_key=$1 and state='quality-pending-v1'",
          [context.build.site_key, new Date(now())]
        )
      }
      return result
    }
  }
}

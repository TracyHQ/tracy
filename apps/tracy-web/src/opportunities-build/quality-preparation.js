/** Reserve one immutable revision envelope before any model work; retries read it, not live sources. */
import { QUALITY_POLICY, qualityHash } from './quality-dossier.js'
import { acceptQualityIntentIn } from './quality-intents.js'
import { qualityRunStore } from './quality-runs.js'
import { qualityComparisonArm } from './quality-comparison.js'
import { qualityExecutionOf } from './quality-execution-profile.js'

const fail = (code) => Object.assign(new Error(code), { code })

export async function loadQualityPreparation(pool, { accountId, opportunityId, revisionId }) {
  if (!revisionId) return null
  const row = (
    await pool.query(
      "select * from wo_quality_run where revision_id=$1 and account_id=$2 and input->>'schemaVersion'='tracy-wo-input/v1'",
      [revisionId, accountId]
    )
  ).rows[0]
  if (!row) return null
  if (
    row.opportunity_id !== opportunityId ||
    row.input?.frozen?.id !== revisionId ||
    row.input.frozen.account_id !== accountId ||
    row.input.frozen.opportunity_id !== opportunityId ||
    qualityHash(row.input) !== row.input_hash ||
    qualityHash(row.input.frozen) !== row.input.frozenHash
  )
    throw fail('QUALITY_PREPARATION_SCOPE')
  qualityExecutionOf(row.input)
  return row
}

export async function prepareQualityRun(
  pool,
  {
    frozen,
    actionId = null,
    semanticInput,
    manifest,
    questions,
    models,
    executionProfile = null,
    assets = null,
    sources = null,
    policy,
    mode,
    comparison = null,
    expectedIntentId = null,
    parentRunId = null,
    now = Date.now
  }
) {
  if (
    !['shadow', 'apply'].includes(mode) ||
    !frozen?.id ||
    !frozen.account_id ||
    !frozen.opportunity_id ||
    !manifest?.hash ||
    !questions ||
    !models
  )
    throw fail('QUALITY_PREPARATION_INPUT')
  const input = {
    schemaVersion: 'tracy-wo-input/v1',
    policyVersion: QUALITY_POLICY,
    mode,
    ...(comparison ? { comparison: structuredClone(comparison) } : {}),
    frozen: structuredClone(frozen),
    frozenHash: qualityHash(frozen),
    manifest: structuredClone(manifest),
    questions: structuredClone(questions),
    models: structuredClone(models),
    ...(executionProfile ? { executionProfile: structuredClone(executionProfile) } : {}),
    ...(assets ? { assets: structuredClone(assets) } : {}),
    ...(sources ? { sources: structuredClone(sources) } : {})
  }
  qualityExecutionOf(input)
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      `quality-revision:${frozen.account_id}:${frozen.id}`
    ])
    const held = await loadQualityPreparation(db, {
      accountId: frozen.account_id,
      opportunityId: frozen.opportunity_id,
      revisionId: frozen.id
    })
    if (held) {
      if (held.input_hash !== qualityHash(input) || held.action_id !== actionId)
        throw fail('QUALITY_PREPARATION_CHANGED')
      await db.query('commit')
      return held
    }
    if (comparison && comparison.variant !== 'candidate') throw fail('QUALITY_COMPARISON_SCOPE')
    const intent = comparison
      ? await qualityComparisonArm(db, {
          ...comparison,
          accountId: frozen.account_id,
          opportunityId: frozen.opportunity_id
        })
      : await acceptQualityIntentIn(db, {
          accountId: frozen.account_id,
          opportunityId: frozen.opportunity_id,
          semanticInput,
          policy,
          expectedIntentId,
          now
        })
    const run = await qualityRunStore({ pool: db, now }).prepare({
      accountId: frozen.account_id,
      opportunityId: frozen.opportunity_id,
      revisionId: frozen.id,
      actionId,
      intentId: intent.id,
      parentRunId,
      input,
      policy: intent.policy
    })
    await db.query('commit')
    return run
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

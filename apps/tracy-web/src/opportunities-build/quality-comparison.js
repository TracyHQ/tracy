/** Two accepted comparison arms are not repeated user edits and cannot mint fresh retry allowances. */
import { qualityHash } from './quality-dossier.js'
import { acceptQualityIntentIn } from './quality-intents.js'
const fail = (code) => Object.assign(new Error(code), { code })

export async function acceptQualityComparison(
  pool,
  { id, accountId, opportunityId, input, policy, now = Date.now }
) {
  if (!id || !input || input.accountId !== accountId || input.opportunityId !== opportunityId)
    throw fail('QUALITY_COMPARISON_SCOPE')
  const db = await pool.connect()
  try {
    await db.query('begin')
    await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
      `quality-intent:${accountId}:${opportunityId}`
    ])
    await db.query(
      `insert into wo_quality_comparison(id,account_id,opportunity_id,input_hash,input)
      values($1,$2,$3,$4,$5) on conflict(id) do nothing`,
      [id, accountId, opportunityId, qualityHash(input), input]
    )
    const held = (await db.query('select * from wo_quality_comparison where id=$1 for update', [id])).rows[0]
    if (
      !held ||
      held.account_id !== accountId ||
      held.opportunity_id !== opportunityId ||
      held.input_hash !== qualityHash(input)
    )
      throw fail('QUALITY_COMPARISON_INPUT_CHANGED')
    const arms = {}
    for (const variant of ['baseline', 'candidate']) {
      let root = (
        await db.query(
          `select i.* from wo_quality_comparison_arm a join wo_quality_intent i on i.id=a.intent_id
        where a.comparison_id=$1 and a.variant=$2`,
          [id, variant]
        )
      ).rows[0]
      if (!root) {
        root = await acceptQualityIntentIn(db, {
          accountId,
          opportunityId,
          semanticInput: {
            comparisonId: id,
            variant,
            inputHash: held.input_hash,
            base: input,
            asOf: new Date(held.created_at).toISOString()
          },
          policy,
          now,
          detached: true
        })
        await db.query(
          `insert into wo_quality_comparison_arm(comparison_id,variant,account_id,opportunity_id,intent_id)
          values($1,$2,$3,$4,$5)`,
          [id, variant, accountId, opportunityId, root.id]
        )
      }
      arms[variant] = root
    }
    await db.query('commit')
    return { comparison: held, arms }
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

/** The server names a previously accepted arm; callers cannot allocate a new root here. */
export async function qualityComparisonArm(
  pool,
  { comparisonId, variant, accountId, opportunityId, inputHash }
) {
  const row = (
    await pool.query(
      `select i.*,c.input_hash as comparison_input_hash,c.input as comparison_input
    from wo_quality_comparison_arm a join wo_quality_intent i on i.id=a.intent_id
    join wo_quality_comparison c on c.id=a.comparison_id
    where a.comparison_id=$1 and a.variant=$2 and a.account_id=$3 and a.opportunity_id=$4`,
      [comparisonId, variant, accountId, opportunityId]
    )
  ).rows[0]
  if (!row || row.comparison_input_hash !== inputHash) throw fail('QUALITY_COMPARISON_SCOPE')
  return row
}

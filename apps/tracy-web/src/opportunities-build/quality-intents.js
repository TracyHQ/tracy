/** User input, not a model assignment or a build press, owns the shared repair and cost limits. */
import { qualityHash } from './quality-dossier.js'

const fail = (code) => Object.assign(new Error(code), { code })

/** Call only when accepting a frozen semantic input, never when retrying an existing revision. */
export async function acceptQualityIntent(pool, args) {
  const db = await pool.connect()
  try {
    await db.query('begin')
    const intent = await acceptQualityIntentIn(db, args)
    await db.query('commit')
    return intent
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

/** The caller owns a short transaction containing both the intent and its frozen revision link. */
export async function acceptQualityIntentIn(
  db,
  {
    accountId,
    opportunityId,
    semanticInput,
    policy,
    expectedIntentId = null,
    now = Date.now,
    detached = false
  }
) {
  if (
    !semanticInput ||
    !Number.isInteger(policy?.maxAttempts) ||
    policy.maxAttempts < 1 ||
    policy.maxAttempts > 64 ||
    !Number.isInteger(policy?.accountDailyCapCents) ||
    policy.accountDailyCapCents < 0 ||
    !Number.isFinite(policy?.maxRunMs) ||
    policy.maxRunMs <= 0 ||
    policy.maxRunMs > 172_800_000
  )
    throw fail('QUALITY_POLICY_INVALID')
  await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [
    `quality-intent:${accountId}:${opportunityId}`
  ])
  const current = (
    await db.query(
      `select i.* from wo_quality_current_intent c join wo_quality_intent i on i.id=c.intent_id
       where c.account_id=$1 and c.opportunity_id=$2 for update of c`,
      [accountId, opportunityId]
    )
  ).rows[0]
  const hash = qualityHash(semanticInput)
  if (!detached && current && current.semantic_hash === hash) {
    // A changed provider, key or policy cannot mint a fresh allowance for identical input.
    return current
  }
  if (!detached && (current?.id ?? null) !== expectedIntentId) throw fail('QUALITY_INTENT_CHANGED')
  const generation = (
    await db.query(
      'select coalesce(max(generation),0)+1 as n from wo_quality_intent where account_id=$1 and opportunity_id=$2',
      [accountId, opportunityId]
    )
  ).rows[0].n
  const intent = (
    await db.query(
      `insert into wo_quality_intent
       (account_id,opportunity_id,generation,semantic_hash,semantic_input,policy,deadline,created_at)
       values($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) returning *`,
      [
        accountId,
        opportunityId,
        generation,
        hash,
        JSON.stringify(semanticInput),
        JSON.stringify(policy),
        new Date(now() + policy.maxRunMs),
        new Date(now())
      ]
    )
  ).rows[0]
  if (!detached)
    await db.query(
      `insert into wo_quality_current_intent(account_id,opportunity_id,intent_id) values($1,$2,$3)
       on conflict(account_id,opportunity_id) do update set intent_id=excluded.intent_id`,
      [accountId, opportunityId, intent.id]
    )
  return intent
}

/**
 * Contributions to the hub (ADR 0036 Phase 3): store a parsed `wo-contribution/v1`, answer its receipt, withdraw it.
 *
 * Idempotency: the same account, idempotency key and payload hash is the same contribution and the same receipt; the
 * same key with another payload is a conflict. Quota is charged in the transaction that stores the contribution, so a
 * retry never charges twice and a refusal stores nothing. The hub records who sent it and when it arrived.
 */
import { createHash } from 'node:crypto'
import { canonicalJson } from '../canonical-json.js'
import { POLICY_VERSION, parseContribution } from './observations.js'
import { PILOT_PENDING_PLACES_DEFAULT } from './quota.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,200}$/

export const payloadHash = (body) => createHash('sha256').update(canonicalJson(body)).digest('hex')

/**
 * @param {{ pool: import('pg').Pool, quota: ReturnType<typeof import('./quota.js').createHubQuota>,
 *   pendingPlacesLimit?: number, now?: () => number }} deps
 */
export function createHubContributions({
  pool,
  quota,
  pendingPlacesLimit = PILOT_PENDING_PLACES_DEFAULT,
  now = Date.now
}) {
  async function inTransaction(fn) {
    const client = await pool.connect()
    try {
      await client.query('begin')
      const out = await fn(client)
      await client.query(out?.rollback ? 'rollback' : 'commit')
      return out
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * @param {{ accountId: string, idempotencyKey: string, body: unknown, bytes: number }} input
   * @returns {Promise<{ kind: 'created' | 'replayed', receipt: object } | { kind: 'conflict' }
   *   | { kind: 'invalid', code: string, path?: string } | { kind: 'quota', refusal: object }
   *   | { kind: 'pending_limit', limit: number }>}
   */
  async function submit({ accountId, idempotencyKey, body, bytes }) {
    const hash = payloadHash(body)
    const existing = await findByKey(pool, accountId, idempotencyKey)
    if (existing) return existing.payload_hash === hash ? replay(existing.id) : { kind: 'conflict' }
    const parsed = parseContribution(body, { now: now() })
    if (!parsed.ok)
      return { kind: 'invalid', code: parsed.code, ...(parsed.path ? { path: parsed.path } : {}) }

    const out = await inTransaction(async (db) => {
      const at = new Date(now()).toISOString()
      const anyPending = parsed.observations.some((o) => o.status === 'pending')
      const inserted = await db.query(
        `insert into wo_hub_contribution
           (account_id, idempotency_key, payload_hash, schema_version, payload_bytes, received_at, status)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (account_id, idempotency_key) do nothing returning id`,
        [accountId, idempotencyKey, hash, body.schema, bytes, at, anyPending ? 'pending' : 'decided']
      )
      // A concurrent request with the same key stored it first: answer as a retry would.
      if (!inserted.rowCount) return { rollback: true, raced: true }
      const id = inserted.rows[0].id
      const charged = await quota.charge(accountId, 'observations', parsed.observations.length, { db })
      if (!charged.ok) return { rollback: true, result: { kind: 'quota', refusal: charged } }
      if (anyPending) {
        // Serialise this account's admissions so the pending-places count holds.
        await db.query('select 1 from wo_hub_account where id = $1 for update', [accountId])
        const { rows } = await db.query(
          `select count(distinct (o.subject_namespace, o.subject_external_id))::int as n
           from wo_hub_observation o join wo_hub_contribution c on c.id = o.contribution_id
           where c.account_id = $1 and o.status = 'pending'
             and (o.subject_namespace, o.subject_external_id) <> ($2, $3)`,
          [accountId, parsed.subject.namespace, parsed.subject.externalId]
        )
        if (rows[0].n >= pendingPlacesLimit)
          return { rollback: true, result: { kind: 'pending_limit', limit: pendingPlacesLimit } }
      }
      for (const o of parsed.observations) {
        await db.query(
          `insert into wo_hub_observation
             (contribution_id, ordinal, subject_namespace, subject_external_id, field, value,
              claimed_source_family, claimed_source_object_id, observed_at_claimed, status, reason, decided_at,
              policy_version)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13)`,
          [
            id,
            o.ordinal,
            parsed.subject.namespace,
            parsed.subject.externalId,
            o.field,
            o.value === null ? null : JSON.stringify(o.value),
            o.source?.family ?? null,
            o.source?.objectId ?? null,
            o.observedAtClaimed,
            o.status,
            o.reason,
            o.status === 'pending' ? null : at,
            POLICY_VERSION
          ]
        )
      }
      return { id }
    })
    if (out.raced) {
      const row = await findByKey(pool, accountId, idempotencyKey)
      return row && row.payload_hash === hash ? replay(row.id) : { kind: 'conflict' }
    }
    if (out.result) return out.result
    return { kind: 'created', receipt: await receiptOf(pool, out.id) }
  }

  async function replay(id) {
    return { kind: 'replayed', receipt: await receiptOf(pool, id) }
  }

  /** The receipt of one of the account's contributions; null when it is not theirs or does not exist. */
  async function receipt(accountId, id) {
    if (!UUID_RE.test(String(id))) return null
    const owned = await pool.query('select 1 from wo_hub_contribution where id = $1 and account_id = $2', [
      id,
      accountId
    ])
    return owned.rowCount ? receiptOf(pool, id) : null
  }

  /**
   * Withdraws one of the account's contributions: every observation not already rejected becomes `withdrawn`, so
   * publishing recomputes without it. Running it again answers the same receipt. Null when it is not theirs.
   */
  async function withdraw(accountId, id) {
    if (!UUID_RE.test(String(id))) return null
    const done = await inTransaction(async (db) => {
      const at = new Date(now()).toISOString()
      const { rowCount } = await db.query(
        'select 1 from wo_hub_contribution where id = $1 and account_id = $2 for update',
        [id, accountId]
      )
      if (!rowCount) return { rollback: true, missing: true }
      await db.query(
        `update wo_hub_contribution set status = 'withdrawn', withdrawn_at = coalesce(withdrawn_at, $2)
         where id = $1`,
        [id, at]
      )
      await db.query(
        `update wo_hub_observation set status = 'withdrawn', reason = 'withdrawn_by_contributor', decided_at = $2
         where contribution_id = $1 and status in ('pending', 'accepted')`,
        [id, at]
      )
      return {}
    })
    return done.missing ? null : receiptOf(pool, id)
  }

  return { submit, receipt, withdraw }
}

async function findByKey(db, accountId, key) {
  const { rows } = await db.query(
    'select id, payload_hash from wo_hub_contribution where account_id = $1 and idempotency_key = $2',
    [accountId, key]
  )
  return rows[0] ?? null
}

/** The receipt: what the hub received and how each observation stands. */
export async function receiptOf(db, id) {
  const c = (
    await db.query(
      `select id, idempotency_key, schema_version, received_at, status, withdrawn_at from wo_hub_contribution
       where id = $1`,
      [id]
    )
  ).rows[0]
  if (!c) return null
  const { rows } = await db.query(
    `select ordinal, subject_namespace, subject_external_id, field, status, reason, decided_at
     from wo_hub_observation where contribution_id = $1 order by ordinal`,
    [id]
  )
  return {
    id: c.id,
    schema: c.schema_version,
    idempotencyKey: c.idempotency_key,
    status: c.status,
    receivedAt: c.received_at.toISOString(),
    withdrawnAt: c.withdrawn_at?.toISOString() ?? null,
    subject: rows[0]
      ? { namespace: rows[0].subject_namespace, externalId: rows[0].subject_external_id }
      : null,
    observations: rows.map((o) => ({
      ordinal: o.ordinal,
      field: o.field,
      status: o.status,
      reason: o.reason,
      decidedAt: o.decided_at?.toISOString() ?? null
    }))
  }
}

/** After verification decided observations: a contribution with none pending is `decided` (unless withdrawn). */
export async function settleContributionStatus(db, ids) {
  if (!ids.length) return
  await db.query(
    `update wo_hub_contribution c set status = 'decided'
     where c.id = any($1::uuid[]) and c.status = 'pending'
       and not exists (select 1 from wo_hub_observation o where o.contribution_id = c.id and o.status = 'pending')`,
    [ids]
  )
}

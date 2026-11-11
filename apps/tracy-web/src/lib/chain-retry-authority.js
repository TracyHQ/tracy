import { CURRENT_BRIEF, LOST_PLACING } from './site-brief-row.js'
import { STEP_CHAIN_WORKFLOW } from './step-chain-switch.js'

// PostgreSQL hashes its own JSON representation, preserving timestamp precision across acceptance and restart.
export const CHAIN_RETRY_BRIEF_HASH = `md5(jsonb_build_object(
  'brief',b.brief,'normalized',b.normalized,'timings',b.timings,'state',b.state,
  'stage',b.stage,'error',b.error,'createdAt',b.created_at,'updatedAt',b.updated_at,
  'siteCreatedAt',s.created_at)::text)`

// A historical completion never grants authority over a replacement site or another active writer.
// `applied` also records a chain's terminal soft failure. Only its latest failed write, with no running steps,
// can authorize a fresh full-chain attempt; a successful fallback or incomplete measurement cannot.
export const CHAIN_RETRY_STATE = `(b.state='failed' or (
  b.state='applied' and b.timings#>>'{chain,ending}'='soft-failure'
  and coalesce(b.timings#>'{chain,running}','null'::jsonb) in ('null'::jsonb,'[]'::jsonb)
  and (select entry.value->>'outcome'
    from jsonb_array_elements(case when jsonb_typeof(b.timings#>'{chain,steps}')='array'
      then b.timings#>'{chain,steps}' else '[]'::jsonb end) with ordinality entry(value,position)
    where entry.value->>'step'='write' order by entry.position desc limit 1)='failed'
))`

export const CHAIN_RETRY_SAFE = `${CURRENT_BRIEF}
  and ${CHAIN_RETRY_STATE} and b.account_id=w.account_id and b.site_key=w.site_key
  and w.state='done' and w.demo_deleted_at is null
  and (w.qa_lease_until is null or w.qa_lease_until<=clock_timestamp())
  and w.receipt->>'workflow'='${STEP_CHAIN_WORKFLOW}'
  and b.brief->>'workflow'='${STEP_CHAIN_WORKFLOW}'
  and b.brief->>'researchRevisionId'=w.revision_id::text
  and coalesce(b.timings->>'lostFrom','')<>'applying'
  and b.error is distinct from '${LOST_PLACING.replaceAll("'", "''")}'
  and exists(select 1 from seat se where se.site_key=s.site_key and se.account_id=w.account_id
    and se.role='owner' and se.accepted_at is not null and se.revoked_at is null and se.declined_at is null)
  and not exists(select 1 from site_turn t where t.site_key=s.site_key and t.state='open')
  and not exists(select 1 from site_write_lease l where l.site_key=s.site_key and l.holder_session is not null
    and l.wrote_at >= clock_timestamp()-interval '90 seconds')`

/** Read only the exact owned failed chain generation, including a terminal failed write recorded as applied. */
export async function failedChainRetryBrief(db, build, { lock = false } = {}) {
  if (!build?.id || !build.account_id || !build.revision_id || !build.site_key) return null
  const { rows } = await db.query(
    `select b.*, ${CHAIN_RETRY_BRIEF_HASH} as retry_hash
     from wo_build w join site s on s.site_key=w.site_key join site_brief b on b.site_key=s.site_key
     where w.id=$1 and w.account_id=$2 and w.revision_id=$3 and ${CHAIN_RETRY_SAFE}
     ${lock ? 'for update of b,s' : ''}`,
    [build.id, build.account_id, build.revision_id]
  )
  return rows[0] ?? null
}

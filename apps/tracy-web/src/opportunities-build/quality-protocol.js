/** Ownership is inferred from server rows, never a caller's quality boolean. */
import { qualityHash } from './quality-dossier.js'
import { withBuildChoice } from './build-choice.js'
export const QUALITY_PROTOCOL = 'quality-v1'
export const QUALITY_QUEUED = 'quality-queued-v1'
export const QUALITY_FAILED = 'quality-failed-v1'
export const QUALITY_COMPLETED = 'quality-completed-v1'
const fail = (code) => Object.assign(new Error(code), { code })

export async function qualityModeOf(pool, accountId, { available = async () => false } = {}) {
  const mode =
    (await pool.query('select quality_mode from wo_preference where account_id=$1', [accountId])).rows[0]
      ?.quality_mode ?? 'off'
  if (!['off', 'shadow', 'apply'].includes(mode)) throw fail('QUALITY_MODE_INVALID')
  if (mode !== 'off' && !(await available(accountId))) throw fail('QUALITY_UNAVAILABLE')
  return mode
}

export async function bindQualityAction(pool, { action, run, lease, now = Date.now }) {
  const current = (
    await pool.query(
      `select * from wo_demo_action where id=$1 and account_id=$2 and protocol=$3
    and status=$4 and lease_token=$5 and lease_until>$6`,
      [action.id, run.account_id, QUALITY_PROTOCOL, QUALITY_QUEUED, lease.token, new Date(now())]
    )
  ).rows[0]
  if (!current || current.opportunity_id !== run.opportunity_id || current.revision_id !== run.revision_id)
    throw fail('QUALITY_ACTION_FENCE')
  await pool.query(
    `insert into wo_quality_action_link(action_id,run_id,account_id,opportunity_id,revision_id)
    values($1,$2,$3,$4,$5) on conflict(action_id) do nothing`,
    [current.id, run.id, run.account_id, run.opportunity_id, run.revision_id]
  )
  const held = (await pool.query('select * from wo_quality_action_link where action_id=$1', [current.id]))
    .rows[0]
  if (held?.run_id !== run.id) throw fail('QUALITY_ACTION_LINK_CHANGED')
  return held
}

/** Call before a create door can claim a label, return an idempotent receipt, or start a normalizer. */
export async function qualityCreateContext(
  pool,
  { accountId, buildId, actionId, token, body, install, available, now = Date.now }
) {
  if (!buildId) return null
  const found = (
    await pool.query(
      `select b.*,r.brief,q.id as quality_run_id,q.input as quality_input,q.input_hash as quality_input_hash,
    q.state as quality_state,i.state as intent_state,i.deadline as intent_deadline,
    exists(select 1 from wo_demo_action a where a.account_id=b.account_id and a.build_request_id=b.request_id and a.protocol=$3) as quality_action
    from wo_build b left join wo_revision r on r.id=b.revision_id and r.account_id=b.account_id
    left join wo_quality_run q on q.revision_id=b.revision_id and q.account_id=b.account_id
      and q.input->>'schemaVersion'='tracy-wo-input/v1'
    left join wo_quality_intent i on i.id=q.intent_id
    where b.account_id=$1 and b.build_id=$2`,
      [accountId, buildId, QUALITY_PROTOCOL]
    )
  ).rows[0]
  if (!found) return null
  const build = withBuildChoice(found, found.choice)
  const reference = build.brief?.editorial
  if (!build.quality_action && !build.quality_run_id && reference?.protocol !== QUALITY_PROTOCOL) return null
  if (
    !build.quality_run_id ||
    reference?.protocol !== QUALITY_PROTOCOL ||
    reference.runId !== build.quality_run_id ||
    reference.frozenHash !== build.quality_input?.frozenHash ||
    qualityHash(build.quality_input) !== build.quality_input_hash
  )
    throw fail('QUALITY_CREATE_LINK_MISSING')
  if (
    ['cancelled', 'failed'].includes(build.quality_state) ||
    ['cancelled', 'failed'].includes(build.intent_state) ||
    new Date(build.intent_deadline).getTime() <= now()
  )
    throw fail('QUALITY_RUN_CLOSED')
  if (
    (await qualityModeOf(pool, accountId, { available })) !== 'apply' ||
    build.quality_input.mode !== 'apply'
  )
    throw fail('QUALITY_APPLY_DISABLED')
  const action = (
    await pool.query(
      `select a.* from wo_demo_action a join wo_quality_action_link l on l.action_id=a.id
    where a.id=$1 and a.account_id=$2 and a.revision_id=$3 and a.build_request_id=$4 and l.run_id=$5
      and a.protocol=$6 and a.status=$7 and a.lease_token::text=$8 and a.lease_until>$9`,
      [
        actionId ?? null,
        accountId,
        build.revision_id,
        build.request_id,
        build.quality_run_id,
        QUALITY_PROTOCOL,
        QUALITY_QUEUED,
        String(token ?? ''),
        new Date(now())
      ]
    )
  ).rows[0]
  if (!action) throw fail('QUALITY_ACTION_FENCE')
  const expected = build.quality_input.manifest?.release
  if (
    !expected ||
    typeof expected.tag !== 'string' ||
    typeof expected.version !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expected.archiveSha256 ?? '') ||
    body.platform !== build.cms ||
    body.design !== build.template?.design ||
    body.quickstart !== expected.tag ||
    body.label !== build.label ||
    Object.keys(body).some((k) => !['platform', 'design', 'quickstart', 'label', 'buildId'].includes(k))
  )
    throw fail('QUALITY_CREATE_PAYLOAD')
  if (install?.version !== expected.version || install?.state?.sha256 !== expected.archiveSha256)
    throw fail('QUALITY_CREATE_RELEASE_CHANGED')
  return {
    protocol: QUALITY_PROTOCOL,
    runId: build.quality_run_id,
    buildId: build.id,
    revisionId: build.revision_id,
    accountId,
    actionId: action.id,
    planHash: reference.planHash,
    frozenHash: reference.frozenHash,
    release: expected
  }
}

/** Persist the private protocol marker before provisioning; legacy workers never see a queued row. */
export async function putQualityBrief(pool, { siteKey, context, platform, quickstart }) {
  const occupied = (
    await pool.query(
      `select s.site_key from site s where s.site_key=$1 and not exists
    (select 1 from site_creation c join wo_build b on b.build_id::text=c.build_id and b.account_id=c.account_id
     where c.site_key=s.site_key and b.id=$2)`,
      [siteKey, context.buildId]
    )
  ).rows[0]
  if (occupied) throw fail('QUALITY_SITE_OCCUPIED')
  const brief = { editorial: context }
  const { rows } = await pool.query(
    `insert into site_brief as b(site_key,account_id,platform,quickstart,brief,state)
    values($1,$2,$3,$4,$5::jsonb,'quality-pending-v1') on conflict(site_key) do update set
      account_id=excluded.account_id,platform=excluded.platform,quickstart=excluded.quickstart,brief=excluded.brief,
      state='quality-pending-v1',stage=null,error=null,normalized=null,timings='{}',created_at=now(),updated_at=now()
    where b.created_at<(select created_at from site where site_key=b.site_key)
      and b.brief#>>'{editorial,buildId}' is distinct from $6 returning *`,
    [siteKey, context.accountId, platform, quickstart, JSON.stringify(brief), context.buildId]
  )
  const held = rows[0] ?? (await pool.query('select * from site_brief where site_key=$1', [siteKey])).rows[0]
  if (
    held?.brief?.editorial?.runId !== context.runId ||
    held.brief.editorial.buildId !== context.buildId ||
    !held.state.startsWith('quality-')
  )
    throw fail('QUALITY_BRIEF_PROTOCOL_CONFLICT')
  return held
}

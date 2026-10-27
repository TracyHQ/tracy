/** Explicit Retry grants time, never a new intent, spend allowance or attempt history. */
export async function quickstartRetryWindow({ pool, source, run, actionId, now = Date.now }) {
  if (!actionId || !source.request_id || !source.opportunity_id || !source.id) return null
  const latest = async (db) =>
    (
      await db.query(
        `select a.*,p.status as parent_status,p.account_id as parent_account_id,
       p.opportunity_id as parent_opportunity_id,p.revision_id as parent_revision_id,
       p.build_request_id as parent_request_id
       from wo_demo_action a left join wo_demo_action p on p.id=a.retry_of
       where a.account_id=$1 and a.build_request_id=$2
       order by a.accepted_at desc,a.id desc limit 1`,
        [source.account_id, source.request_id]
      )
    ).rows[0]
  const pinned = await latest(pool)
  if (!pinned?.retry_of || pinned.id !== actionId) return null
  let activated = false
  const resolve = async ({ db = pool, root, attempt = null }) => {
    const action = await latest(db)
    const duration = root.policy?.maxRunMs
    if (
      !action ||
      action.id !== actionId ||
      (attempt && attempt.action_id !== actionId) ||
      action.status !== 'queued' ||
      action.protocol !== 'legacy' ||
      action.revision_id !== source.revision_id ||
      action.opportunity_id !== source.opportunity_id ||
      action.parent_account_id !== source.account_id ||
      action.parent_opportunity_id !== source.opportunity_id ||
      action.parent_revision_id !== source.revision_id ||
      action.parent_request_id !== source.request_id ||
      !['failed', 'quality-failed-v1'].includes(action.parent_status) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 25 * 60_000 ||
      ['cancelled', 'failed'].includes(root.state)
    )
      return null
    const accepted = new Date(action.accepted_at).getTime()
    const deadline = accepted + duration
    if (!(deadline > new Date(root.deadline).getTime()) || accepted > now() || deadline <= now()) return null
    const unknown = (
      await db.query(
        `select id from wo_quality_attempt where intent_id=$1 and state in ('running','uncertain')
       and ($2::uuid is null or id<>$2::uuid)
       and (state='uncertain' or not $3::boolean or action_id is distinct from $4::uuid
         or lease_until is null or lease_until<=$5) limit 1`,
        [run.intent_id, attempt?.id ?? null, activated, actionId, new Date(now())]
      )
    ).rows.length
    if (unknown)
      throw Object.assign(new Error('QUALITY_ATTEMPT_UNCERTAIN'), { code: 'QUALITY_ATTEMPT_UNCERTAIN' })
    return {
      actionId,
      deadline: new Date(deadline).toISOString(),
      originalDeadline: root.deadline
    }
  }
  resolve.activate = () => {
    activated = true
  }
  resolve.actionId = actionId
  return resolve
}

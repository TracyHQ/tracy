/** SELECT-only customer build snapshot. Never poll a host or finish a handover. */
const safeAddress = (value) => {
  try {
    const u = new URL(value)
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password && !u.hash ? u.href : null
  } catch {
    return null
  }
}
const iso = (value) => {
  const time = value ? new Date(value).getTime() : NaN
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}
export async function inspectOwnJob(pool, { siteKey, jobId, accountId, now = Date.now() }) {
  const { rows } = await pool.query(
    `select c.account_id, c.state as creation_state,
      j.state as job_state, s.site_key, s.address,
      b.state as brief_state, d.state as design_state,
      greatest(j.updated_at,c.updated_at,b.updated_at,d.updated_at,s.created_at) as recorded_at
    from site_creation c join job j on j.id=c.job_id and j.site_key=c.site_key
    left join site s on s.site_key=c.site_key and j.created_at >= s.created_at
    left join site_brief b on b.site_key=s.site_key and b.created_at >= s.created_at
    left join site_create_design_system d on d.site_key=s.site_key and d.created_at >= s.created_at
    where c.account_id=$1::uuid and c.site_key=$2 and c.job_id=$3`,
    [accountId, siteKey, jobId]
  )
  const row = rows[0]
  if (!row) return { status: 403, body: { code: 'JOB_NOT_YOURS' } }
  if (!row.site_key) return { status: 404, body: { code: 'SITE_UNKNOWN' } }
  const brief = ['queued', 'preparing', 'ready', 'applying', 'applied', 'failed'].includes(row.brief_state)
    ? row.brief_state
    : null
  const design = ['queued', 'applying', 'applied', 'skipped', 'failed'].includes(row.design_state)
    ? row.design_state
    : null
  const open =
    ['queued', 'preparing', 'ready', 'applying'].includes(brief) || ['queued', 'applying'].includes(design)
  const failed = row.job_state === 'failed' || ['failed', 'refused'].includes(row.creation_state)
  const known =
    ['claiming', 'claimed', 'provisioning', 'refused', 'done', 'failed'].includes(row.creation_state) &&
    ['queued', 'pending', 'running', 'done', 'failed'].includes(row.job_state) &&
    (row.brief_state == null || brief !== null) &&
    (row.design_state == null || design !== null)
  const state = !known
    ? 'unavailable'
    : failed
      ? 'failed'
      : row.creation_state === 'done' && row.job_state === 'done' && !open
        ? 'done'
        : row.creation_state === 'claiming' || row.job_state === 'pending' || row.job_state === 'queued'
          ? 'pending'
          : ['queued', 'running', 'done'].includes(row.job_state) &&
              ['claimed', 'provisioning', 'done'].includes(row.creation_state)
            ? 'running'
            : 'unavailable'
  return {
    status: 200,
    body: {
      schema: 'widget-build-status/v1',
      state,
      step: state === 'done' ? 'ready' : state,
      completion: { siteReady: state === 'done', briefState: brief, designSystemState: design },
      links:
        state === 'done'
          ? {
              openWebsite: safeAddress(row.address),
              continueTracy: '/' + encodeURIComponent(siteKey) + '/'
            }
          : null,
      freshness: {
        source: 'persisted',
        recordedAt: iso(row.recorded_at),
        checkedAt: new Date(now).toISOString()
      }
    }
  }
}

/**
 * Research state of ONE opportunity, read from its own research jobs (`wo_job`, kind research). The shared place store
 * may already hold a profile from another card's research; what this card shows depends only on whether THIS card's
 * research ran. A deleted card takes its jobs with it, so the same place saved again starts as `not_started`.
 *
 * - `running`: a job of this card is queued, running or paused.
 * - `done`: a job of this card completed; `researchedAt` is when the latest one did, never the shared snapshot's date.
 * - `failed`: the latest finished job failed or was blocked, and none ever completed.
 * - `not_started`: no job, or only cancelled ones.
 */

/** Columns `research_running`, `researched_at` and `research_failed` for the opportunity aliased `o`. */
export const RESEARCH_STATE_COLUMNS = `
  exists (select 1 from wo_job rj where rj.opportunity_id = o.id and rj.kind = 'research'
    and rj.state in ('queued', 'running', 'paused')) as research_running,
  (select max(rj.updated_at) from wo_job rj where rj.opportunity_id = o.id and rj.kind = 'research'
    and rj.state = 'completed') as researched_at,
  coalesce((select rj.state in ('failed', 'blocked') from wo_job rj where rj.opportunity_id = o.id
    and rj.kind = 'research' and rj.state <> 'cancelled' order by rj.created_at desc limit 1), false) as research_failed`

/** `{ state, researchedAt }` of a row carrying `RESEARCH_STATE_COLUMNS`. */
export function researchStateShape(row) {
  const researchedAt = row?.researched_at ? new Date(row.researched_at).toISOString() : null
  const state = row?.research_running
    ? 'running'
    : researchedAt
      ? 'done'
      : row?.research_failed
        ? 'failed'
        : 'not_started'
  return { state, researchedAt }
}

/** The research state of one opportunity. */
export async function researchStateOf(db, opportunityId) {
  const { rows } = await db.query(`select ${RESEARCH_STATE_COLUMNS} from wo_opportunity o where o.id = $1`, [
    opportunityId
  ])
  return researchStateShape(rows[0])
}

/** Whether a card may show research results (Profile, photos, menu, shared source rows): its own research finished. */
export const researched = (state) => Boolean(state?.researchedAt)

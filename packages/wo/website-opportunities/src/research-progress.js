/**
 * The sub steps of a running Research of one opportunity (#537), for the Progress card's right pane. A card's research
 * request is served by the shared place job (`place-jobs.js`): the request's own `wo_job` row stays at `discovery`
 * until the place job answers, so the sub steps are read from the PLACE JOB and its preparing snapshot, never from a
 * timer:
 *
 * - One item per source the run's snapshot lists (in the Sources card's order, `SHOWN_SOURCES`), labelled as that card
 *   names it. A row the run tried (`attempted_at` at or after the snapshot was made, at the claim) reads done, or
 *   failed when it failed or was blocked; the source the job is collecting now (`progress.collecting`, during
 *   discovery and collection only, since the key outlives the source it named) reads running; one carried over from
 *   the last research and not tried yet reads waiting while sources are still being collected, done once collection
 *   is over (it was current, so the run kept it).
 * - A final `profile` item, "Writing the business facts", from the job's stage: waiting before `profile`, running in
 *   it, done after, failed when the job failed there.
 *
 * Left out, because nothing is recorded for them: a queued place job (no snapshot yet, so no source is known to be in
 * the run), and a card researched by the per-account executor (its `wo_source` rows keep no attempt time).
 */
import { SHOWN_SOURCES } from './sources.js'

/** The source names the Sources card shows (`cms-label.ts sourceLabel`, English). */
const SOURCE_LABELS = Object.freeze({
  website: 'Website',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  'facebook-search': 'Facebook search',
  'instagram-search': 'Instagram search',
  'google-places': 'Google Places',
  'google-maps': 'Google Maps',
  tripadvisor: 'TripAdvisor',
  'menu-file': 'Menu file',
  'menu-photos': 'Menu photos'
})

export const PROFILE_ITEM = Object.freeze({ key: 'profile', label: 'Writing the business facts' })

/** The place job's stages in run order (`executor.js STAGES`). */
const STAGE_ORDER = ['discovery', 'collection', 'media', 'profile', 'brand', 'done']
const COLLECTING_STAGES = new Set(['discovery', 'collection'])
const FAILED = new Set(['failed', 'blocked'])

const time = (v) => {
  if (!v) return null
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v))
  return Number.isNaN(t) ? null : t
}
const iso = (v) => {
  const t = time(v)
  return t === null ? null : new Date(t).toISOString()
}

/**
 * @param {{ job: { state: string, stage: string, progress?: object, updated_at?: string | Date } | null,
 *   snapshotCreatedAt?: string | Date | null, sources?: object[] } | null} run the place job serving the card's
 *   request, when its preparing snapshot was made, and that snapshot's `wo_place_snapshot_source` rows
 * @returns {Array<{ key: string, label: string, state: 'done' | 'running' | 'waiting' | 'failed', at: string | null }>}
 */
export function researchItemsOf(run) {
  const job = run?.job
  const since = time(run?.snapshotCreatedAt)
  if (!job || since === null) return []
  const stageAt = Math.max(0, STAGE_ORDER.indexOf(job.stage))
  const collecting = COLLECTING_STAGES.has(job.stage) ? (job.progress?.collecting ?? null) : null
  const jobFailed = FAILED.has(job.state)
  const collectionOver = stageAt > STAGE_ORDER.indexOf('collection')
  const rank = (s) => SHOWN_SOURCES.indexOf(s.source)
  const shown = (run.sources ?? []).filter((s) => rank(s) >= 0).sort((a, b) => rank(a) - rank(b))
  const items = shown.map((raw) => {
    const attempted = time(raw.attempted_at)
    const triedNow = attempted !== null && attempted >= since
    // A source collected page by page keeps `partial` with a cursor while it is still being read.
    const stillReading = raw.source === collecting && raw.status === 'partial' && Boolean(raw.cursor)
    let state
    let at = null
    // The job stopped on this source: it failed when the job did (the job's own time).
    if (raw.source === collecting && (!triedNow || stillReading)) {
      state = jobFailed ? 'failed' : 'running'
      if (jobFailed) at = iso(job.updated_at)
    } else if (triedNow) {
      state = FAILED.has(raw.status) ? 'failed' : 'done'
      at = iso(raw.attempted_at)
    } else if (collectionOver) {
      state = 'done'
      at = iso(raw.attempted_at)
    } else state = 'waiting'
    return { key: raw.source, label: SOURCE_LABELS[raw.source] ?? raw.source, state, at }
  })
  const profileAt = STAGE_ORDER.indexOf('profile')
  const profileState =
    stageAt > profileAt || job.state === 'completed'
      ? 'done'
      : stageAt === profileAt
        ? jobFailed
          ? 'failed'
          : 'running'
        : 'waiting'
  items.push({
    ...PROFILE_ITEM,
    state: profileState,
    at: profileState === 'running' || profileState === 'failed' ? iso(job.updated_at) : null
  })
  return items
}

/**
 * The place job serving this card's latest research request, with its snapshot's sources, or null (no request, a
 * request without a place job, or a place job not claimed yet).
 */
export async function researchRunOf(db, opportunityId) {
  const { rows } = await db.query(
    `select pj.state, pj.stage, pj.progress, pj.updated_at, pj.snapshot_id, s.created_at as snapshot_created_at
       from wo_job rj
       join wo_place_job pj on pj.id = rj.place_job_id
       left join wo_place_snapshot s on s.id = pj.snapshot_id
      where rj.opportunity_id = $1 and rj.kind = 'research' and rj.state <> 'cancelled'
      order by rj.created_at desc limit 1`,
    [opportunityId]
  )
  const job = rows[0]
  if (!job?.snapshot_id) return null
  const sources = (
    await db.query(
      `select source, ref, status, reason, cursor, coverage, collected_at, attempted_at
         from wo_place_snapshot_source where snapshot_id = $1`,
      [job.snapshot_id]
    )
  ).rows
  return { job, snapshotCreatedAt: job.snapshot_created_at, sources }
}

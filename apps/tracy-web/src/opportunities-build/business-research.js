/**
 * ONE BUSINESS RESEARCHED FOR ITS OWNER (#575): the steps of Build from my business (`own-site.js`) that save the
 * owner's business and research it, shared with the build chat's research (`build-draft/place-research.js`), so both
 * run the step chain's own research and make its own content brief:
 *
 *   links judged (`link-fields.js`) -> a private opportunity of the account marked `ownSite` (never listed among
 *   Website Opportunities) and its listing pages' row -> the shared place research (`startResearch`, a `wo_place` job:
 *   every stage of `place-executor.js`, its ledger, receipts, daily counts and job cap) -> resumed by itself when it
 *   paused, at most `OWN_SITE_RESUMES` times -> the content brief (`createRevision`, a `wo_revision`).
 *
 * Every helper is the Website Opportunities router's or the builder's own (`route.js` passes them), so nothing here is a
 * second copy of the research.
 */
import { resumeRequest } from 'website-opportunities/src/place-requests.js'
import { reviewSourcesRequired } from 'website-opportunities/src/tripadvisor-research.js'

/**
 * How many times a business's research that paused (a source's time or page budget ran out, its cursor kept) is
 * resumed by itself. A customer has no Resume button here (Website Opportunities has one): measured 24/10/2026, a
 * shop's crawl paused on its budget and the page said "researching" for ever.
 */
export const OWN_SITE_RESUMES = 3
const RESEARCH_RUNNING = new Set(['queued', 'running'])

/**
 * The research request of an opportunity, read through its place run: its queued row alone cannot say whether research
 * stopped.
 */
export async function researchJobOf(h, opportunityId) {
  const job = (await h.jobsOfOpportunity(h.pool, opportunityId))[0] ?? null
  if (!job?.place_job_id || job.result_snapshot_id || !RESEARCH_RUNNING.has(job.state)) return job
  const place = (
    await h.pool.query('select state, last_error from wo_place_job where id = $1', [job.place_job_id])
  ).rows[0]
  return place && place.state !== 'completed'
    ? { ...job, state: place.state, last_error: place.last_error }
    : job
}

/** Whether the research's resumes are spent, or its place run gave up recovering. */
const resumesSpent = (own, job) =>
  job?.last_error?.code === 'RESEARCH_RECOVERY_LIMIT' || Number(own?.resumes ?? 0) >= OWN_SITE_RESUMES

/**
 * Resume a paused research, serialised per business, counting only a resume that queued its research. Answers
 * `{phase: 'research', job?}` (no `job` key when another poll holds the business) or `{phase: 'failed', code, job}`.
 */
export async function resumeOwnResearch(h, accountId, opportunityId) {
  const { pool, config, now } = h
  const lock = await pool.connect()
  const key = `own-site-research:${opportunityId}`
  let held = false
  try {
    held = (await lock.query('select pg_try_advisory_lock(hashtextextended($1,0)) as held', [key])).rows[0]
      ?.held
    if (!held) return { phase: 'research' }
    const own = (
      await pool.query('select candidate from wo_opportunity where id = $1 and account_id = $2', [
        opportunityId,
        accountId
      ])
    ).rows[0]?.candidate?.ownSite
    const job = await researchJobOf(h, opportunityId)
    if (!own || job?.state !== 'paused') return { phase: 'research', job }
    const resumes = Number(own.resumes ?? 0)
    if (resumesSpent(own, job)) return { phase: 'failed', code: job.last_error?.code ?? 'SOURCE_PAUSED', job }
    const resumed = await resumeRequest(pool, accountId, job.id, {
      shared: config.woSharedResearch !== false,
      now,
      requiredSources: reviewSourcesRequired(await h.runtime())
    })
    if (resumed)
      await pool.query(
        `update wo_opportunity set candidate = jsonb_set(candidate, '{ownSite,resumes}', to_jsonb($3::int))
         where id = $1 and account_id = $2`,
        [opportunityId, accountId, resumes + 1]
      )
    return { phase: 'research', job: resumed ?? (await researchJobOf(h, opportunityId)) }
  } finally {
    if (held) await lock.query('select pg_advisory_unlock(hashtextextended($1,0))', [key]).catch(() => {})
    lock.release()
  }
}

/** Whether a paused research has spent its resumes: then it failed, whatever its row says. */
export const pausedForGood = (opp, job) =>
  job?.state === 'paused' && resumesSpent(opp?.candidate?.ownSite, job)

/**
 * Save the owner's business as a private opportunity of the account and start its research, as the Build from my
 * business door does: the opportunity (or the one saved before for the same place, made the owner's own now), its
 * listing pages' row, and the research under `<requestId>:research`.
 * @param {object} h the router's and builder's helpers
 * @param {{accountId: string, fields: object, listings?: object[] | null, own: object}} input `own`: the `ownSite`
 *   marker (`requestId`, `at`, and whatever the caller keeps on it)
 * @returns {Promise<{opp: object, started: {job?: object, refusal?: object}}>}
 */
export async function saveOwnBusiness(h, { accountId, fields, listings = null, own }) {
  const { pool } = h
  const { row } = await h.insertOpportunity(pool, accountId, {
    ...fields,
    candidate: { ...fields.candidate, ownSite: own }
  })
  if (listings) await h.saveListingSource(pool, row.id, listings)
  const trade = fields.candidate?.trade ?? 'other'
  // The customer's own business, saved before (as theirs or as an opportunity): now theirs, this press.
  const opp =
    row.candidate?.ownSite?.requestId === own.requestId
      ? row
      : (
          await pool.query(
            `update wo_opportunity set candidate = candidate || jsonb_build_object('ownSite', $3::jsonb,
               'trade', coalesce(candidate->>'trade', $4)) where id = $1 and account_id = $2 returning *`,
            [row.id, accountId, JSON.stringify(own), trade]
          )
        ).rows[0]
  const started = await h.startResearch({ accountId, opp, requestId: `${own.requestId}:research` })
  return { opp, started }
}

/** The source rows a research request reads: its place run's snapshot, else the opportunity's own rows. */
async function sourceRowsOf(pool, job, opportunityId) {
  if (job?.place_job_id || job?.result_snapshot_id) {
    const { rows } = await pool.query(
      `select s.source, s.ref, s.status, s.reason from wo_place_snapshot_source s
       where s.snapshot_id = coalesce($1::uuid, (select snapshot_id from wo_place_job where id = $2::uuid))
       order by s.source`,
      [job.result_snapshot_id ?? null, job.place_job_id ?? null]
    )
    return rows
  }
  const { rows } = await pool.query(
    'select source, ref, status, reason from wo_source where opportunity_id = $1 order by source',
    [opportunityId]
  )
  return rows
}

/**
 * The research service the build chat calls: the same helpers, one account's business at a time.
 * @param {object} h `pool`, `config`, `now`, `runtime`, `loadDomain`, `linkFields`, `insertOpportunity`,
 *   `saveListingSource`, `startResearch`, `jobsOfOpportunity`, `opportunityOf`, `makeBrief`
 */
export function createBusinessResearch(h) {
  return {
    linkFields: h.linkFields,
    loadDomain: h.loadDomain,
    runtime: h.runtime,
    /** The account's saved business, or null. */
    opportunity: (accountId, opportunityId) => h.opportunityOf(h.pool, accountId, opportunityId),
    /** Save the business and start its research: `{opportunityId, placeId, jobId}` or `{refusal}`. */
    async start({ accountId, fields, listings, own }) {
      const { opp, started } = await saveOwnBusiness(h, { accountId, fields, listings, own })
      if (started.refusal) return { refusal: started.refusal }
      // The research links the opportunity to its shared place as it starts: read the place it names now.
      const placeId = (await h.pool.query('select place_id from wo_opportunity where id = $1', [opp.id]))
        .rows[0]?.place_id
      return { opportunityId: opp.id, placeId: placeId ?? null, jobId: started.job?.id ?? null }
    },
    /**
     * Where the research stands, a paused one resumed first: `{state: 'running' | 'done' | 'failed', code?, sources}`,
     * `sources` each `{source, ref, status, reason}` as the place run recorded it so far.
     */
    async progress({ accountId, opportunityId }) {
      const resumed = await resumeOwnResearch(h, accountId, opportunityId)
      const job = resumed.job === undefined ? await researchJobOf(h, opportunityId) : resumed.job
      const sources = await sourceRowsOf(h.pool, job, opportunityId)
      if (resumed.phase === 'failed') return { state: 'failed', code: resumed.code, sources }
      if (!job || RESEARCH_RUNNING.has(job.state) || job.state === 'paused')
        return { state: 'running', sources }
      if (job.state === 'completed') return { state: 'done', sources }
      return { state: 'failed', code: job.last_error?.code ?? 'RESEARCH_FAILED', sources }
    },
    /** The step chain's content brief of the researched business (`createRevision`): `{revision}` or `{error}`. */
    brief: ({ accountId, opportunityId }) => h.makeBrief({ accountId, opportunityId })
  }
}

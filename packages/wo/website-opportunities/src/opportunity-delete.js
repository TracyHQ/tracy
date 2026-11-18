/**
 * Deleting a saved opportunity: My opportunities' Delete, for one row (`DELETE /api/website-opportunities/:id`) or
 * many (`POST /api/website-opportunities/jobs/bulk` with `action: "delete"`). In this order:
 *
 *   0. a demo still being built (the builder's `demoBuildRunning`) refuses the delete (`DEMO_BUILD_RUNNING`) before
 *      anything changes: its site could otherwise be made after the row is gone. The build is not cancelled;
 *   1. a research job still live (queued, running, paused, blocked) is cancelled through the cancel door's own path
 *      (`cancelRequest`), so a place job it shared is released;
 *   2. the builder (`deps.builder.prepareDelete`, Tracy's demo builder) tears its live demo sites down through the
 *      demo retention sweep's teardown and drops what would hold the row back; a teardown that cannot start
 *      refuses the delete (`DEMO_TEARDOWN_FAILED`) and the row stays;
 *   3. the row goes, and its own rows with it (`store.js` `deleteOpportunity`).
 *
 * The shared place research the row read (`wo_place*`) stays: other accounts read the same place. Stored picture
 * bytes stay too: the object store offers no delete here, and a legacy picture's key may be the one its place's
 * own media points at (`place-backfill.js`). A customer's own site (Build from my business, `candidate.ownSite`) is
 * not an opportunity of the list and answers NOT_FOUND.
 */
import { cancelRequest } from './place-requests.js'
import { deleteOpportunity, jobsOfOpportunity, opportunityOf } from './store.js'

const LIVE_JOB = new Set(['queued', 'running', 'paused', 'blocked'])
/** Bulk delete answers that count as skipped, not failed: the row was already gone. */
const DELETE_SKIPPED = new Set(['NOT_FOUND'])

const isOwnSite = (opp) =>
  opp.candidate !== null && typeof opp.candidate === 'object' && 'ownSite' in opp.candidate

/**
 * Delete one opportunity of the account.
 * @param {import('pg').Pool} pool
 * @param {string} accountId
 * @param {string} id
 * @param {{ builder?: { prepareDelete?: Function, demoBuildRunning?: Function } | null,
 *   log?: Pick<Console, 'warn'> }} deps
 * @returns {Promise<{ ok: true, id: string, siteRemoved: boolean } | { ok: false, code: string }>}
 */
export async function deleteOpportunityOf(pool, accountId, id, { builder = null, log = console } = {}) {
  const opp = await opportunityOf(pool, accountId, id)
  if (!opp || isOwnSite(opp)) return { ok: false, code: 'NOT_FOUND' }
  if (typeof builder?.demoBuildRunning === 'function' && (await builder.demoBuildRunning(opp, accountId)))
    return { ok: false, code: 'DEMO_BUILD_RUNNING' }
  for (const job of await jobsOfOpportunity(pool, opp.id))
    if (LIVE_JOB.has(job.state)) await cancelRequest(pool, accountId, job.id)
  let siteRemoved = false
  if (typeof builder?.prepareDelete === 'function') {
    let prepared
    try {
      prepared = await builder.prepareDelete(opp, accountId)
    } catch (error) {
      log.warn?.(`[website-opportunities] demo teardown of ${opp.id} failed: ${error?.message ?? error}`)
      prepared = { ok: false }
    }
    if (!prepared?.ok) return { ok: false, code: 'DEMO_TEARDOWN_FAILED' }
    siteRemoved = prepared.siteRemoved === true
  }
  if (!(await deleteOpportunity(pool, accountId, opp.id))) return { ok: false, code: 'NOT_FOUND' }
  return { ok: true, id: opp.id, siteRemoved }
}

/**
 * The bulk delete's selection: `opportunityIds`, never `jobIds` or `filter` (a row without a job has no job id,
 * and a filter names jobs). `{opportunityIds}` or a refusal `{status, error, next}`.
 */
export function deleteSelection(b, { max, uuid }) {
  const bad = {
    status: 400,
    error: 'INVALID_SELECTION',
    next: 'Send opportunityIds (opportunity ids) for a bulk delete; jobIds and filter are not accepted.'
  }
  if (b.jobIds !== undefined || b.filter !== undefined) return bad
  const ids = b.opportunityIds
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'string' && uuid.test(id)))
    return bad
  const opportunityIds = [...new Set(ids)]
  if (opportunityIds.length > max)
    return {
      status: 422,
      error: 'TOO_MANY',
      next: `Narrow the selection: one bulk action takes at most ${max} opportunities.`
    }
  return { opportunityIds }
}

/**
 * Run a bulk delete one row at a time, each through the single door's path.
 * @returns {Promise<{ results: object[], done: number, skipped: number, failed: number, deleted: number,
 *   sitesRemoved: number }>}
 */
export async function bulkDelete(pool, accountId, opportunityIds, deps) {
  const results = []
  for (const opportunityId of opportunityIds) {
    try {
      const one = await deleteOpportunityOf(pool, accountId, opportunityId, deps)
      results.push(
        one.ok
          ? { opportunityId, ok: true, siteRemoved: one.siteRemoved }
          : { opportunityId, ok: false, code: one.code }
      )
    } catch (error) {
      deps?.log?.warn?.(
        `[website-opportunities] bulk delete of ${opportunityId} failed: ${error?.message ?? error}`
      )
      results.push({ opportunityId, ok: false, code: 'ERROR' })
    }
  }
  return bulkDeleteAnswer(results)
}

/** The bulk answer's counts over its results (also the answer for an account with no rows yet). */
export function bulkDeleteAnswer(results) {
  const deleted = results.filter((r) => r.ok).length
  return {
    results,
    done: deleted,
    skipped: results.filter((r) => !r.ok && DELETE_SKIPPED.has(r.code)).length,
    failed: results.filter((r) => !r.ok && !DELETE_SKIPPED.has(r.code)).length,
    deleted,
    sitesRemoved: results.filter((r) => r.ok && r.siteRemoved).length
  }
}

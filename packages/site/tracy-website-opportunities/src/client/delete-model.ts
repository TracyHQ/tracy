/**
 * Delete on My opportunities without the screen: which rows a press deletes, how many of them have a live demo
 * site the confirmation names, the press itself (one row through `DELETE …/:id`, several through the bulk door
 * with `action: "delete"`), and the rows left on screen after it.
 */
import type { Api } from './api.ts'
import type { OpportunityListRow } from './opportunity-row.ts'
import type { RequestIds } from './request-ids.ts'

/** What the confirmation asks about: the rows, how many have a live demo site, and the name when there is one row. */
export interface DeleteAsk {
  ids: string[]
  withSite: number
  name: string | null
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v !== ''

/** A demo site still up: the Demo column's site not deleted, else the latest build's site not deleted. */
export function hasLiveDemo(row: OpportunityListRow): boolean {
  if (row.demo) return nonEmpty(row.demo.siteKey) && !row.demo.deletedAt
  return nonEmpty(row.latestBuild?.siteKey) && row.latestBuild?.state !== 'deleted'
}

/** The confirmation's question for the picked rows on screen (in screen order); null when none is picked. */
export function deleteAsk(
  rows: readonly OpportunityListRow[],
  picked: ReadonlySet<string>
): DeleteAsk | null {
  const chosen = rows.filter((r) => picked.has(r.id))
  if (chosen.length === 0) return null
  return {
    ids: chosen.map((r) => r.id),
    withSite: chosen.filter(hasLiveDemo).length,
    name: chosen.length === 1 ? (chosen[0].name ?? null) : null
  }
}

/** The rows on screen without the deleted ones. */
export function withoutRows<T extends { id: string }>(rows: readonly T[], deleted: readonly string[]): T[] {
  const gone = new Set(deleted)
  return rows.filter((r) => !gone.has(r.id))
}

export type DeleteOutcome =
  | { ok: true; deleted: string[]; failed: number; sitesRemoved: number }
  | { ok: false; code: string }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Delete the rows: one through its own door, several through the bulk door with one request id for the press. */
export async function deleteOpportunities(
  api: Pick<Api, 'remove' | 'bulk'>,
  requestIds: RequestIds,
  ids: readonly string[]
): Promise<DeleteOutcome> {
  if (ids.length === 0) return { ok: true, deleted: [], failed: 0, sitesRemoved: 0 }
  if (ids.length === 1) {
    const answer = await api.remove(ids[0])
    if (!answer.ok) return answer.code === 'NOT_FOUND' ? gone(ids) : { ok: false, code: answer.code }
    return { ok: true, deleted: [ids[0]], failed: 0, sitesRemoved: answer.body?.deleted?.siteRemoved ? 1 : 0 }
  }
  const key = `bulk:delete:${ids.join(',')}`
  const { id: requestId } = requestIds.begin(key)
  const answer = await api.bulk('delete', requestId, { opportunityIds: [...ids] })
  if (!answer.ok) {
    requestIds.fail(key)
    return { ok: false, code: answer.code }
  }
  requestIds.succeed(key)
  const results = Array.isArray(answer.body?.results) ? answer.body.results.filter(isRecord) : []
  // A row already gone (NOT_FOUND) leaves the screen too: it is not there to delete.
  const deleted = results
    .filter((r) => r.ok === true || r.code === 'NOT_FOUND')
    .map((r) => r.opportunityId)
    .filter(nonEmpty)
  const count = (v: unknown): number => (typeof v === 'number' && v >= 0 ? v : 0)
  return {
    ok: true,
    deleted,
    failed: count(answer.body?.failed),
    sitesRemoved: count(answer.body?.sitesRemoved)
  }
}

const gone = (ids: readonly string[]): DeleteOutcome => ({
  ok: true,
  deleted: [...ids],
  failed: 0,
  sitesRemoved: 0
})

/** The key of the note a failed press shows: a busy demo site has its own words. */
export const deleteFailedKey = (code: string): string =>
  code === 'DEMO_TEARDOWN_FAILED' ? 'delete.siteBusy' : 'action.failed'

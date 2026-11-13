/**
 * The plan card's two draft doors (tracy-web, #603): send a structured plan edit (`POST /api/build-draft/plan-edits`)
 * and take the last one back (`POST /api/build-draft/plan-undo`, one step). The doors are tracy-web's own, not dsh's,
 * so the paths are absolute and not passed through dsh's site prefix. Both answer the draft, and the card follows
 * its plan, its last edit and whether an undo is still offered.
 */
import type { PlanDraft, PlanEdit } from '@tracy/core/build-chat'

export const BUILD_DRAFT_PLAN_EDITS_PATH = '/api/build-draft/plan-edits'
export const BUILD_DRAFT_PLAN_UNDO_PATH = '/api/build-draft/plan-undo'

async function post(path: string, body: unknown, fetchImpl: typeof fetch): Promise<PlanDraft> {
  const response = await fetchImpl(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  const answer = await response.json().catch(() => null)
  if (!response.ok || !answer?.draft?.plan) throw new Error(String(answer?.code ?? response.status))
  const { plan, lastEdit = null, canUndo = false } = answer.draft
  return { plan, lastEdit, canUndo }
}

/**
 * @param edit - a Contract B plan edit (`planEditOf`)
 * @param fetchImpl - the page's `fetch`; a test passes its own
 * @returns the draft tracy-web answered with, the edit applied; throws when the door refused (stale 409, invalid 422)
 */
export function savePlanEdit(edit: PlanEdit, fetchImpl: typeof fetch = fetch): Promise<PlanDraft> {
  return post(BUILD_DRAFT_PLAN_EDITS_PATH, { edit }, fetchImpl)
}

/**
 * @param fetchImpl - the page's `fetch`; a test passes its own
 * @returns the draft with the last edit taken back; throws when there was nothing to undo (409)
 */
export function undoPlanEdit(fetchImpl: typeof fetch = fetch): Promise<PlanDraft> {
  return post(BUILD_DRAFT_PLAN_UNDO_PATH, {}, fetchImpl)
}

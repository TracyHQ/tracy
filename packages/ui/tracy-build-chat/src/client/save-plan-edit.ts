/**
 * Send a structured plan edit to the account's build draft (`POST /api/build-draft/plan-edits`, tracy-web, #603). The
 * door is tracy-web's own, not dsh's, so the path is absolute and not passed through dsh's site prefix.
 */
import type { PlanEdit } from '@tracy/core/build-chat'

export const BUILD_DRAFT_PLAN_EDITS_PATH = '/api/build-draft/plan-edits'

/**
 * @param edit - a Contract B plan edit (`planEditOf`)
 * @param fetchImpl - the page's `fetch`; a test passes its own
 * @returns the plan tracy-web answered with, the edit applied; throws when the door refused
 */
export async function savePlanEdit(edit: PlanEdit, fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const response = await fetchImpl(BUILD_DRAFT_PLAN_EDITS_PATH, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ edit })
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body?.draft?.plan) throw new Error(String(body?.code ?? response.status))
  return body.draft.plan
}

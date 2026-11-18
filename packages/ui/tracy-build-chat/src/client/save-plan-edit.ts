/**
 * The plan card's two draft doors (tracy-web, #603): send a structured plan edit (`POST /api/build-draft/plan-edits`)
 * and take the last one back (`POST /api/build-draft/plan-undo`, one step). The doors are tracy-web's own, not dsh's,
 * so the paths are absolute and not passed through dsh's site prefix. Both answer the draft, and the card follows
 * its plan, its last edit and whether an undo is still offered.
 */
import type { PlanDraft, PlanEdit } from '@tracy/core/build-chat'
import { en, type StringKey } from './strings'

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
  if (!response.ok || !answer?.draft?.plan) {
    const refusal = new Error(String(answer?.code ?? response.status)) as Error & {
      code?: string
      problems?: unknown[]
    }
    if (typeof answer?.code === 'string') refusal.code = answer.code
    if (Array.isArray(answer?.problems)) refusal.problems = answer.problems
    throw refusal
  }
  const { plan, lastEdit = null, canUndo = false, lookSources = null, review = null } = answer.draft
  return { plan, lastEdit, canUndo, lookSources, review }
}

/** A refusal of the plan operation gate the card can say in its own words: a code of `plan.refused.*`. */
function operationRefusalOf(
  error: unknown
): { key: StringKey; vars: Record<string, string | number> } | null {
  const problems = (error as { problems?: unknown } | null)?.problems
  if (!Array.isArray(problems)) return null
  for (const p of problems as { code?: unknown; params?: Record<string, unknown> }[]) {
    const key = `plan.refused.${String(p?.code)}`
    if (typeof p?.code !== 'string' || !Object.hasOwn(en, key)) continue
    const vars: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(p.params ?? {}))
      if (typeof v === 'string' || typeof v === 'number') vars[k] = v
    return { key: key as StringKey, vars }
  }
  return null
}

/**
 * What the card says about a refused edit, in its own translated words (never the door's English sentence), and
 * whether the draft is read again: while the site is built the plan is locked; while a build chat step works on the
 * plan (`ENGINE_BUSY`, whose `say` is the same sentence in English) it cannot change yet; a body past the door's bound
 * (`BODY_TOO_LARGE`) is too long to save; a plan that moved meanwhile (another tab, a change request) is read again so
 * the owner sees the latest one; a part the plan operation gate keeps (`INVALID_EDIT` with a known problem code, #575)
 * is said by that code with its parameters; anything else is a plain retry. The card keeps the plan it shows.
 * @param error - what `savePlanEdit` or `undoPlanEdit` threw
 */
export function refusalOf(error: unknown): {
  key: StringKey
  reload: boolean
  vars?: Record<string, string | number>
} {
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'INVALID_EDIT') {
    const said = operationRefusalOf(error)
    if (said) return { key: said.key, reload: false, vars: said.vars }
  }
  if (code === 'BUILD_RUNNING') return { key: 'plan.locked', reload: false }
  if (code === 'ENGINE_BUSY') return { key: 'plan.busy', reload: false }
  if (code === 'BODY_TOO_LARGE') return { key: 'plan.tooLarge', reload: false }
  if (code === 'STALE_EDIT') return { key: 'plan.stale', reload: true }
  return { key: 'plan.saveFailed', reload: false }
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

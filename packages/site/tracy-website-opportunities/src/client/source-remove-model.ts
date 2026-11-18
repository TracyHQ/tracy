/**
 * Remove a pasted source from the Sources table of Details (#537). A row the owner pasted (it carries `pastedLink`)
 * can be removed; rows research found by itself cannot, and only before the research or after it failed. The trash
 * control asks first in a dialog, then calls `DELETE …/sources` with that link. Each refusal has its own line in the
 * dialog; anything else, and an older server that has no such door (404 or 405 without a known code), reads the
 * generic error.
 * Pure: no DOM. `removeSource` only calls the door it is given.
 */
import type { Api } from './api.ts'
import { pastedLinkOf } from './source-groups.ts'
import type { ResearchState } from './research-gate-model.ts'
import type { SourceInput } from './status.ts'

/**
 * A source can be removed only before the research or after it failed: once research runs or ran, the server answers
 * `RESEARCH_STARTED`, so the row draws no control at all.
 */
export function removeAllowedIn(state: ResearchState | undefined): boolean {
  return state === 'not_started' || state === 'failed'
}

/**
 * The link a row is removed by, or null for a row the owner did not paste. The Google place of the opportunity names
 * the business itself and stays (the door answers `GOOGLE_LINK_NOT_REMOVED`), so its row has no remove control.
 */
export function removableLinkOf(source: SourceInput): string | null {
  if (source.source === 'google-places') return null
  return pastedLinkOf(source)
}

/**
 * The source the dialog asks about (`confirm`) or removes now (`pending`), with the name and short link its lead
 * names, and the refusal of the last press (`error`, a string key) shown in the dialog; null: the dialog is closed.
 */
export type RemoveStep = {
  url: string
  name: string
  link: string
  phase: 'confirm' | 'pending'
  error: string | null
} | null

/** The line left on the table after a press that reloaded Details (Already gone). */
export interface RemoveNotice {
  url: string
  key: string
}

export const REMOVE_GONE_KEY = 'source.remove.error.NOT_FOUND'
const REFUSAL_KEYS: Readonly<Record<string, string>> = {
  LAST_SOURCE: 'source.remove.error.LAST_SOURCE',
  RESEARCH_STARTED: 'source.remove.error.RESEARCH_STARTED',
  NOT_FOUND: REMOVE_GONE_KEY,
  GOOGLE_LINK_NOT_REMOVED: 'source.remove.error.GOOGLE_LINK_NOT_REMOVED'
}
export const REMOVE_FAILED_KEY = 'action.failed'

export interface RemoveOutcome {
  /** Details reloads: the source went, or it was already gone. */
  refresh: boolean
  /** The refusal's line; null once it went. */
  noticeKey: string | null
}

/** The refusal's line: a known code by its own words, anything else (`INVALID_URL` too) the generic error. */
export function removeRefusalKey(code: string, status: number): string {
  // A 405, or a 404 with no code of ours, is an older server without the door.
  if (status === 405) return REMOVE_FAILED_KEY
  return REFUSAL_KEYS[code] ?? REMOVE_FAILED_KEY
}

export async function removeSource(
  api: Pick<Api, 'removeSource'>,
  opportunityId: string,
  url: string
): Promise<RemoveOutcome> {
  let answer: Awaited<ReturnType<Api['removeSource']>>
  try {
    answer = await api.removeSource(opportunityId, url)
  } catch {
    return { refresh: false, noticeKey: REMOVE_FAILED_KEY }
  }
  if (answer.ok) return { refresh: true, noticeKey: null }
  const key = removeRefusalKey(answer.code, answer.status)
  return { refresh: key === REMOVE_GONE_KEY, noticeKey: key }
}

/**
 * The line drawn for a notice: Already gone stays only while the row is gone after the reload; a row still there
 * means the server did not know the door, so it reads the generic error.
 */
export function noticeLineKey(notice: RemoveNotice, rowStillThere: boolean): string {
  return notice.key === REMOVE_GONE_KEY && rowStillThere ? REMOVE_FAILED_KEY : notice.key
}

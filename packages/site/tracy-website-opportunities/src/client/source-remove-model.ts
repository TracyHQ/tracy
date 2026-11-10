/**
 * Remove a pasted source from the Sources table of Details (#537). A row the owner pasted (it carries `pastedLink`)
 * can be removed; rows research found by itself cannot. The press asks first on the row itself, then calls
 * `DELETE …/sources` with that link. Each refusal has its own line under the row; anything else, and an older server
 * that has no such door (404 or 405 without a known code), reads the generic error.
 * Pure: no DOM. `removeSource` only calls the door it is given.
 */
import type { Api } from './api.ts'
import { pastedLinkOf } from './source-groups.ts'
import type { SourceInput } from './status.ts'

/**
 * The link a row is removed by, or null for a row the owner did not paste. The Google place of the opportunity names
 * the business itself and stays (the door answers `GOOGLE_LINK_NOT_REMOVED`), so its row has no remove control.
 */
export function removableLinkOf(source: SourceInput): string | null {
  if (source.source === 'google-places') return null
  return pastedLinkOf(source)
}

/** The row being asked about (`confirm`) or removed now (`pending`); null: no row is. */
export type RemoveStep = { url: string; phase: 'confirm' | 'pending' } | null

/** The line under a row after a press that did not remove it. */
export interface RemoveNotice {
  url: string
  key: string
}

export const REMOVE_GONE_KEY = 'source.remove.error.NOT_FOUND'
const REFUSAL_KEYS: Readonly<Record<string, string>> = {
  LAST_SOURCE: 'source.remove.error.LAST_SOURCE',
  JOB_ACTIVE: 'source.remove.error.JOB_ACTIVE',
  NOT_FOUND: REMOVE_GONE_KEY,
  GOOGLE_LINK_NOT_REMOVED: 'source.remove.error.GOOGLE_LINK_NOT_REMOVED'
}
export const REMOVE_FAILED_KEY = 'action.failed'

export interface RemoveOutcome {
  /** Details reloads: the source went, or it was already gone. */
  refresh: boolean
  /** The line under the row; null once it went. */
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

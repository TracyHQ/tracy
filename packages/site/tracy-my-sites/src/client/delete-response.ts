/**
 * What `DELETE /api/sites/:key` answered, read part by part (#801).
 *
 * The door takes the site off its host FIRST, and only when the host said the site is gone does it
 * take the row off the book and report beside it what else went
 * (`apps/tracy-web/src/sites/route.js`):
 *
 *   { removed: true, host, hostReason?, repo, sessions, sessionsReason?, seats }
 *
 * A host that could not finish is a refusal (`409 TEARDOWN_FAILED`: the site is still there, whole
 * in the book), and one that has not finished yet is a `202` (`pending`).
 *
 * - `host`: whether the site's stack on its host went. True whenever the row is removed; read all
 *   the same, for an answer from a door older than that rule.
 * - `repo`: true = deleted; false = the site had no repository; 'kept' = a repository Tracy did not
 *   create, left untouched on purpose; 'failed' = GitHub did not confirm the delete
 *   (`deleteRepoFor`, `apps/tracy-web/src/github/route.js`). The door sends no reason for it.
 * - `sessions`: whether the agent put the site's sessions away (`sessionsReason` when not).
 * - `seats`: whether the agent confirmed every seat of the site revoked.
 *
 * 🔒 `res.ok` IS NOT "DELETED". The row is already gone when this answer is written, so a part that
 * did not go cannot be asked for again from the list. Anything short of every part confirmed is
 * told apart here, and an answer nobody can read is `unknown`, never success and never "nothing
 * was changed".
 *
 * A plain function of its input, so `test/delete-response.test.mjs` pins every rule.
 */

/** The parts of a delete the door reports on, in the order they are shown. */
export type CleanupPart = 'host' | 'repo' | 'sessions' | 'seats'

/** `failed`: the door said the part was not confirmed gone. `unknown`: the door did not say. */
export type CleanupState = 'failed' | 'unknown'

export interface CleanupIssue {
  part: CleanupPart
  state: CleanupState
  /** The door's own reason, as text; null when it sent none (never invented here). */
  reason: string | null
}

export type DeleteOutcome =
  | { kind: 'complete' }
  /** The row is gone; `issues` are the parts that were not confirmed gone with it. */
  | { kind: 'partial'; issues: CleanupIssue[] }
  /** No readable answer: the site may be deleted, partly deleted or untouched. */
  | { kind: 'unknown' }

/**
 * `refused`: the door did not delete the site (a 4xx); `code` is its name for why, if it sent one —
 * before doing anything, or (`409 TEARDOWN_FAILED`) because the host could not take the site off it,
 * in which case nothing else was removed and the delete can be asked for again.
 * `pending`: the door took the delete and the host has not finished (a 202): the site is still
 * there, and goes when the host says it is gone.
 */
export type DeleteAnswer =
  | DeleteOutcome
  | { kind: 'refused'; status: number; code: string | undefined }
  | { kind: 'pending' }

/** A reason is the host's own words and can run to a whole log line; the notice shows this much. */
export const REASON_MAX = 300

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reasonOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '') return null
  return text.length > REASON_MAX ? `${text.slice(0, REASON_MAX)}…` : text
}

/** `true` when the part went, else how it is reported. */
function stateOf(part: CleanupPart, value: unknown): true | CleanupState {
  if (value === true) return true
  if (part === 'repo') {
    // No repository, and one kept on purpose, are outcomes the dialog already announced.
    if (value === false || value === 'kept') return true
    return value === 'failed' ? 'failed' : 'unknown'
  }
  return value === false ? 'failed' : 'unknown'
}

/** Where the door puts each part's reason; the repository and the seats have none. */
const REASON_FIELD: Record<CleanupPart, string | null> = {
  host: 'hostReason',
  repo: null,
  sessions: 'sessionsReason',
  seats: null
}

const PARTS: readonly CleanupPart[] = ['host', 'repo', 'sessions', 'seats']

/**
 * Classify the body of a successful answer.
 * @param body - the parsed JSON, whatever it turned out to be.
 * @returns `complete` only when the row is removed and every part is confirmed.
 */
export function deleteOutcomeOf(body: unknown): DeleteOutcome {
  if (!isRecord(body) || body.removed !== true) return { kind: 'unknown' }
  const issues: CleanupIssue[] = []
  for (const part of PARTS) {
    const state = stateOf(part, body[part])
    if (state === true) continue
    const field = REASON_FIELD[part]
    // A reason belongs to a part the door reported as failed; beside anything else it explains nothing.
    issues.push({ part, state, reason: state === 'failed' && field !== null ? reasonOf(body[field]) : null })
  }
  return issues.length === 0 ? { kind: 'complete' } : { kind: 'partial', issues }
}

/** The part of a `Response` this reads; narrowed so a test can hand in a fake. */
export interface DeleteResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

/**
 * Read the door's answer to a delete.
 *
 * A 4xx is a refusal: the door checks the seat and the site before it touches anything. Any other
 * failure status (a 500 from the door mid-teardown, a gateway's 502/504) says nothing about how
 * far the delete got, so it is `unknown` like a success with no readable body.
 * @param res - the response of `DELETE /api/sites/:key`.
 */
export async function readDeleteAnswer(res: DeleteResponse): Promise<DeleteAnswer> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = undefined
  }
  // Before the 2xx rule below: a 202 is "taken, not finished", never an answer about the parts.
  if (res.status === 202) return { kind: 'pending' }
  if (res.ok) return deleteOutcomeOf(body)
  // The one 5xx that is the door's own word that nothing was removed: an unfinished import whose host
  // could not confirm no read is going (`import-remove.js`). Any other 5xx claims no outcome.
  const unchanged =
    res.status === 503 &&
    isRecord(body) &&
    (body.code === 'HOST_UNAVAILABLE' || body.code === 'REMOVE_INCOMPLETE')
  if ((res.status >= 400 && res.status < 500) || unchanged) {
    const code = isRecord(body) && typeof body.code === 'string' ? body.code : undefined
    return { kind: 'refused', status: res.status, code }
  }
  return { kind: 'unknown' }
}

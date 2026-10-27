/**
 * What the Team start card says about the site's people — pure, so a node test holds it.
 *
 * The card reads the same book the Team tab reads (`GET /api/team`, every site the viewer holds a
 * seat on) and says it the way the My Sites row does: `clusterOf` of `@tracy/core/team/face`, one
 * rule for both (contract `tasks/evidence/team-badge-count/contract.md` §4). Nothing here is
 * invented: a book that could not be read, a site the answer does not list, or a seat not accepted
 * yet (`seats: null`) is no number at all, never a guess.
 *
 * Read again when the Team tab wrote a seat of this site: it sends `TEAM_CHANGED_EVENT`
 * `{ siteKey }` on `window`.
 */
import { clusterOf, TEAM_CHANGED_EVENT } from '@tracy/core/team/face'

export { TEAM_CHANGED_EVENT }

/** The door, root-absolute on purpose: the host's own (`dsh-url.ts`), never the lane's. */
export const TEAM_DOOR = '/api/team'

/**
 * @typedef {{ id: string, email: string | null, initial: string, color: string, avatarUrl?: string | null,
 *   status: 'active' | 'invited' | 'revoked' | 'declined', requestedAt: string | null }} TeamSeat
 * @typedef {{ count: number, faces: TeamSeat[], onlyYou: boolean }} TeamCard
 */

/**
 * The card's count, faces and "only you" for one site, from a `GET /api/team` answer.
 * @param {unknown} body - the answer's JSON; anything else is no card.
 * @param {string} siteKey - the site whose workspace this is.
 * @param {string | null | undefined} viewerEmail - the signed-in person (`/auth/me`), or nothing yet.
 * @returns {TeamCard | null}
 */
export function teamCardOf(body, siteKey, viewerEmail) {
  const sites =
    body !== null && typeof body === 'object' ? /** @type {{ sites?: unknown }} */ (body).sites : null
  if (!Array.isArray(sites)) return null
  const site = sites.find(
    (s) => s !== null && typeof s === 'object' && /** @type {{ siteKey?: unknown }} */ (s).siteKey === siteKey
  )
  if (site === undefined) return null
  const seats = /** @type {{ seats?: unknown }} */ (site).seats
  if (!Array.isArray(seats)) return null
  const rows = /** @type {TeamSeat[]} */ (seats.filter((s) => s !== null && typeof s === 'object'))
  return clusterOf(rows, viewerEmail ?? null)
}

/**
 * Ask the door once. The answer's JSON, or null for anything that is not one: signed out (401), a
 * refusal, a dropped connection — the card then draws nothing.
 * @param {(input: string, init?: RequestInit) => Promise<Response>} fetchFn
 * @returns {Promise<unknown>}
 */
export async function readTeam(fetchFn) {
  try {
    const res = await fetchFn(TEAM_DOOR, {
      headers: { accept: 'application/json' },
      credentials: 'same-origin'
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

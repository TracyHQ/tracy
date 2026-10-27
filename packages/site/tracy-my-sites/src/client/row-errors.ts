/**
 * The seat book's refusal of a row action in My Sites, as the key of a sentence (#796).
 *
 * Pure, so the mapping can be pinned without mounting the tab. A session that ended while the tab
 * stood open used to read "The seat book could not complete that" — true, and no help: the next
 * step is to sign in, and the sentence has to say so. A code nobody named gets `error.refused` (a
 * 4xx) or `error.failed`, never the code itself.
 */

/**
 * A code is read ONLY on the status its door sends it with (`apps/tracy-web/src/seats/route.js`,
 * `sites/route.js`). Any other pairing — `404 NOT_SIGNED_IN`, `401 CANNOT_REVOKE_LAST_OWNER` —
 * is not an answer of these doors (a layer in front of them wrote it, or the body is not theirs),
 * so it is read by its status alone and the code decides nothing.
 */
type Pairs = Readonly<Record<number, Readonly<Record<string, string>>>>

function named(pairs: Pairs, status: number, code: unknown): string | null {
  if (typeof code !== 'string' || !Object.hasOwn(pairs, status)) return null
  const codes = pairs[status]
  return Object.hasOwn(codes, code) ? codes[code] : null
}

/**
 * An answer no pair names, read by its status. A 401 and a 429 each mean one thing whatever they
 * carry. Every other 4xx — a 403 included — is still the door's considered "no": nothing was
 * changed, and the sentence says so (#801), but it names NO reason. A 403 has several (no seat, a
 * role too low, the last Owner), and without the door's own code this screen cannot tell which, so
 * it does not guess one. Anything else — a 5xx, which may have written before it failed, no answer
 * at all, an odd status — claims no outcome and asks for a reload before a retry.
 */
function byStatus(status: number): string {
  if (status === 401) return 'error.signedOut'
  if (status === 429) return 'error.rateLimited'
  return status >= 400 && status < 500 ? 'error.refused' : 'error.failed'
}

/**
 * `POST /api/sites/:key/leave` and `DELETE /api/sites/:key`. `NOT_REPO_OWNER` is the delete
 * door's refusal from before the repository became a reported part of the delete (#801); no door
 * sends it today, and it stays bound to the 403 it came with.
 */
const ROW_REFUSALS: Pairs = {
  401: { NOT_SIGNED_IN: 'error.signedOut' },
  403: {
    NOT_SITE_OWNER: 'error.notSiteOwner',
    NOT_REPO_OWNER: 'error.notRepoOwner',
    CANNOT_REVOKE_LAST_OWNER: 'error.lastOwner',
    // No seat at all any more (revoked since the list was read): not a question of role.
    SEAT_NOT_AUTHORIZED: 'error.noSeat'
  },
  // The delete door: the host could not take the site off it, so nothing else was removed either.
  // On an unfinished import it removes through `import-remove.js` and answers that path's refusals:
  // a read still going, or a provision or another removal holding the site.
  409: {
    TEARDOWN_FAILED: 'error.deleteHostFailed',
    IMPORT_RUNNING: 'removeImport.running',
    IMPORT_BUSY: 'removeImport.later',
    IMPORT_REMOVING: 'removeImport.later'
  },
  429: { RATE_LIMITED: 'error.rateLimited' },
  // The host that ran the import's read could not say none is going: nothing was removed.
  // `REMOVE_INCOMPLETE`: its transaction was rolled back, so nothing was removed either.
  503: { HOST_UNAVAILABLE: 'removeImport.later', REMOVE_INCOMPLETE: 'removeImport.later' }
}

/** Leave, delete and the other writes on a row the viewer holds. */
export function rowErrorKey(status: number, code: unknown): string {
  return named(ROW_REFUSALS, status, code) ?? byStatus(status)
}

/** `POST /api/sites/:key/accept`. */
const ACCEPT_REFUSALS: Pairs = {
  401: { NOT_SIGNED_IN: 'error.signedOut' },
  403: { SEAT_NOT_AUTHORIZED: 'error.acceptGone' },
  409: { JOIN_REQUEST_PENDING: 'error.acceptRequested' },
  429: { RATE_LIMITED: 'error.rateLimited' }
}

/**
 * The same book, refusing a different question. `SEAT_NOT_AUTHORIZED` on a leave or a delete
 * means the viewer's seat is gone; on an accept it means the invitation itself is gone — revoked,
 * declined, or never there — and telling that reader they lack a role would send them looking for
 * a permission problem they do not have. Only that exact pair says so: a 403 with no code, or with
 * another one, is not read as a gone invitation.
 */
export function acceptErrorKey(status: number, code: unknown): string {
  return named(ACCEPT_REFUSALS, status, code) ?? byStatus(status)
}

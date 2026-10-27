/**
 * Seat-door client — the Worker's half of the contract that vendor/tracy/dsh-passwords/src/tracy/seat.ts
 * guards.
 *
 * NOT A WORKER. Like mail/, this is a package another Worker bundles in: cowork-web mints a
 * session for someone who just arrived, seat-registry revokes a session for someone who just
 * lost their seat. It has no wrangler.toml and is not declared in scripts/services.mjs as a
 * service — it only shows up in the watches of those two Workers.
 *
 * WHY ONE CALL REPLACES SIX. The earlier version built a session by driving the sign-in form
 * like a human: fetch the login page, scrape the CSRF token, POST the master password, create a
 * subuser, re-read the entire user list to find the id, grant folders, sign in again. Six
 * requests, one master credential living in the Worker, and a chain that broke the day the login
 * page renamed a field.
 *
 * THE SIGNING STRING MUST MATCH BYTE FOR BYTE with canonical() on the other side:
 *
 *     <timestamp>\n<nonce>\n<METHOD>\n<path>\n<sha256hex(body)>
 *
 * One character off and every call answers 403 `signature` — not broken here, broken on the
 * lane. That is why scripts/test/seat-door-interop.test.ts exists at the repo root: it runs this
 * file's signature through the gateway's REAL verifier, instead of each side checking itself with
 * its own algorithm.
 */
import { hmacHex, sha256Hex } from '../lib/hmac.js'

/**
 * Sign one seat-door call.
 *
 * @param {object} input - secret, path, and the already-serialized body.
 * @returns {Promise<Record<string, string>>} headers to attach to the request.
 */
export async function signSeatCall({ secret, path, body, now = Date.now(), nonce }) {
  const timestamp = String(now)
  // One-use nonce: the gateway remembers it for 120 seconds, so a captured request can't be replayed.
  const stamp = nonce ?? crypto.randomUUID().replaceAll('-', '')
  // Method fixed to `POST`: all three seat-door routes are POST, including `whoami` (the
  // signature covers the path but not the query string, so identity has to live in the signed body).
  const signature = await hmacHex(secret, `${timestamp}\n${stamp}\nPOST\n${path}\n${await sha256Hex(body)}`)
  return {
    'x-seat-timestamp': timestamp,
    'x-seat-nonce': stamp,
    'x-seat-signature': signature
  }
}

/**
 * Call one seat-door route.
 *
 * 🔒 A REDIRECT IS A REFUSAL, AND SO IS AN ANSWER THAT IS NOT JSON. A gateway that does not know a
 * seat route sends the caller to its sign-in page (302); followed, that page answered 200 and a
 * revoke or a forget read as done while nothing happened (found 28/09/2026 with a dsh image older
 * than the archive door). Every seat route answers JSON, so only a 2xx with a JSON body is `ok`.
 *
 * @param {object} input - lane origin, secret, path, payload, any headers to carry along (Access token),
 *   and an optional `signal` that ends the call.
 * @returns {Promise<{ok: boolean, status: number, body: any}>} the parsed response.
 */
export async function callSeatDoor({
  origin,
  secret,
  path,
  payload,
  headers = {},
  fetchImpl = fetch,
  signal
}) {
  const body = JSON.stringify(payload)
  const signed = await signSeatCall({ secret, path, body })
  const response = await fetchImpl(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...signed, ...headers },
    body,
    redirect: 'manual',
    ...(signal ? { signal } : {})
  })
  let parsed = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  return { ok: response.ok && parsed !== null, status: response.status, body: parsed }
}

/**
 * Mint a lane session for a seat (or for a walk-in guest).
 *
 * Returns the session token for the caller to plant as the `dsh_gateway_token` cookie in the
 * browser, or null when the lane refuses — the caller MUST handle null: a session that fails to
 * mint is a 502, not a blank page.
 *
 * @param {object} input - lane, secret, and the grant.
 * @returns {Promise<string|null>} the session token, or null.
 */
export async function mintSeatSession({ origin, secret, grant, headers, fetchImpl }) {
  const answer = await callSeatDoor({
    origin,
    secret,
    path: '/gateway/seat/session',
    payload: grant,
    headers,
    fetchImpl
  })
  return answer.ok && typeof answer.body?.token === 'string' ? answer.body.token : null
}

/**
 * Revoke a seat from one lane: the rights row goes empty, `credential_version` ticks, the
 * session cache is cleared.
 *
 * The caller usually has MULTIPLE lanes to revoke (guest and member are different gateways,
 * different secrets), so this function revokes ONE lane and returns its result — gathering
 * multiple lanes is the caller's job, and it needs to see which lane slipped.
 *
 * @param {object} input - lane, secret, who is being revoked, and (only for a single host's dsh) which site.
 * @returns {Promise<{ok: boolean, revoked: number|null}>} that lane's result.
 */
export async function revokeSeatAtDoor({ origin, secret, email, site = null, headers, fetchImpl }) {
  const answer = await callSeatDoor({
    origin,
    secret,
    path: '/gateway/seat/revoke',
    // `site` NARROWS the revoke to exactly one seat, and should only be sent when the caller
    // knows the other door keeps one account per (person, site) — that is, a single host's dsh.
    // Sending it to a per-site lane names an account that lane never created (its accounts don't
    // carry any site), so the revoke hits no one while still answering `ok`. Omitting `site` =
    // the whole person, exactly the right meaning for a single lane and exactly the right
    // meaning for the workspace door everywhere else.
    payload: site ? { email, site } : { email },
    headers,
    fetchImpl
  })
  return { ok: answer.ok, revoked: answer.ok ? (answer.body?.revoked ?? null) : null }
}

/**
 * Make a host's dsh forget a site folder that is about to be torn down: its sessions are archived
 * and its workspace registration removed.
 *
 * A site's folder is `/site/<label>`, and the label is derived from the domain — so a site deleted
 * and added again gets the same folder, and dsh (which indexes sessions by folder) showed the new
 * site the old site's conversations (measured 14/09). Call it BEFORE the teardown: dsh can only
 * name the sessions through a folder that still exists.
 *
 * It also asks dsh to stop the folder's running turns (#561); whether they ENDED is not this door's
 * answer but `archiveSessionsAtDoor`'s, which asks dsh right before the session folder moves.
 *
 * 🔒 `ok` IS EVERY PART CONFIRMED, NOT A 200 (#561). The door answers 200 with the sessions it hid
 * and whether the registration went (`deleted`). A body that lacks either, or says `deleted: false`,
 * is not confirmed: the caller then keeps the site's session folder in place.
 *
 * @param {object} input - the host dsh's origin and seat secret, the folder as dsh sees it, and an
 *   optional `signal` that ends the call.
 * @returns {Promise<{ok: boolean, archived: number}>} whether dsh confirmed all of it, and how many
 *   sessions it hid.
 */
export async function forgetWorkspaceAtDoor({ origin, secret, path, headers, fetchImpl, signal }) {
  const answer = await callSeatDoor({
    origin,
    secret,
    path: '/gateway/seat/forget-workspace',
    payload: { path },
    headers,
    fetchImpl,
    signal
  })
  const body = answer.ok ? answer.body : null
  const archivedList =
    Array.isArray(body?.archived) && body.archived.every((id) => typeof id === 'string')
      ? body.archived
      : null
  return {
    ok: body?.ok === true && archivedList !== null && body.deleted === true,
    archived: archivedList?.length ?? 0
  }
}

/**
 * Make a host's dsh move a deleted site's session folder out of its live store, into
 * `$DSH_HOME/sessions-archive/` (`vendor/tracy/dsh-passwords/src/tracy/session-archive.ts`).
 *
 * `forgetWorkspaceAtDoor` hides the sessions from every list, but their files stay in the store,
 * and dsh reads the header of every session in it on each page load, whoever asks (measured 28/09:
 * 1,190 of 1,202 sessions on the local stand belonged to deleted sites). Call it AFTER the
 * teardown: dsh refuses while `/site/<label>` still exists, and refuses whenever it cannot prove
 * the folder is that site's alone. Nothing is deleted; the folder is renamed whole.
 *
 * @param {object} input - the host dsh's origin and seat secret, the site folder as dsh sees it, and
 *   an optional `signal` that ends the call.
 * @returns {Promise<{ok: boolean, reason: string|null, sessions: number}>} whether the folder moved;
 *   when it did not, the door's reason (`SITE_STILL_EXISTS`, `NO_SESSION_FOLDER`, `SESSION_ACTIVE`…),
 *   or `DSH_ANSWERED_<status>` for an answer without one — a dsh image older than the door says 404.
 */
export async function archiveSessionsAtDoor({ origin, secret, path, headers, fetchImpl, signal }) {
  const answer = await callSeatDoor({
    origin,
    secret,
    path: '/gateway/seat/archive-sessions',
    payload: { path },
    headers,
    fetchImpl,
    signal
  })
  if (answer.ok && answer.body?.ok === true) {
    return { ok: true, reason: null, sessions: Number(answer.body.sessions) || 0 }
  }
  const reason =
    typeof answer.body?.reason === 'string' && /^[A-Z_]{1,40}$/.test(answer.body.reason)
      ? answer.body.reason
      : `DSH_ANSWERED_${answer.status}`
  return { ok: false, reason, sessions: 0 }
}

/**
 * Two page facts the chat's turn cards read (`TurnUndoCard.tsx`, `CommentReportCard.tsx`): whether
 * dsh closed a turn as interrupted, and which site the page stands in. Kept free of React so
 * `test/interrupted.test.mjs` can hold them (#295).
 *
 * Until 06/10/2026 this file also held the "Undo all" card's rules (the apply trail of one turn,
 * revertAll, the refusal sentences). That card is gone: the turn card undoes through the server's
 * turns door (`turn-undo.mjs`), which does the same tri-state reading on the server side.
 *
 * WHY THE CARD EXISTS. A dsh deploy that has to cut a chat turn leaves the writes that turn already
 * made on the customer's site, and nothing in the chat said so: measured 24/09 on dev, a
 * "Change all content to Vietnamese" turn died after six writes and the site answered `/` with a
 * redirect to `/vi/` while the chat showed only "Ran for 14m 40s". dsh closes such a turn with
 * `turn/end {reason: {kind: 'interrupted'}}` when the session is next opened
 * (`@deepseek-ai/dsh-session` `repair.ts`), and the turn card under it says what the turn left on
 * the site, with Undo and Continue.
 */

/** A site key in the page path: the workspace of one site is served at `/<siteKey>/`. */
const SITE_IN_PATH = /^\/([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?:\/|$)/

/**
 * @param {unknown} turn - the `TurnLocation` a `conversation.chat.turnTail` occupant receives.
 * @returns {boolean} whether dsh closed this turn as interrupted (the process died mid-turn).
 */
export function isInterruptedTurn(turn) {
  const t = /** @type {{ end?: { data?: { reason?: { kind?: unknown } } } } | null | undefined} */ (turn)
  return t?.end?.data?.reason?.kind === 'interrupted'
}

/**
 * The site this workspace stands in, read from the page path only.
 *
 * 🔒 NOT THE `tracy_site` COOKIE. `tracy-site-tabs` falls back to it, which is right for a tab the
 * viewer points at a site. Here it would be wrong: the creation workspace (`/new/`) carries the
 * cookie of whatever site was opened last, and its sessions wrote to no site at all, so the card
 * would ask that other site about this session and say "nothing was changed" with confidence.
 * @param {string} pathname - `location.pathname`.
 * @returns {string | null}
 */
export function siteKeyFromPath(pathname) {
  const m = SITE_IN_PATH.exec(pathname)
  return m ? /** @type {string} */ (m[1]) : null
}

/**
 * What interrupted a turn dsh closed as interrupted (#1403 item 11): `update` when a deploy cut a
 * running turn of this conversation while this one ran — its start before the cut, its end (dsh
 * writes it when the session is next opened) after it — and `restart` otherwise: Tracy stopped on
 * its own (a crash, a host reboot), or nothing says it was a deploy. Both are true of an update, so
 * `restart` is the safe sentence when the record cannot be read.
 * @param {unknown} turn - the `TurnLocation` the card receives.
 * @param {readonly number[]} cutAt - epoch ms of the deploys that cut a turn of this conversation
 *   (`tracy-site-tools` `/held` with `cut: true`).
 * @returns {'update' | 'restart'}
 */
export function interruptCause(turn, cutAt) {
  const t = /** @type {{ start?: { time?: unknown }, end?: { time?: unknown } } | null | undefined} */ (turn)
  const start = typeof t?.start?.time === 'number' ? t.start.time : null
  if (start === null) return 'restart'
  const end = typeof t?.end?.time === 'number' ? t.end.time : Number.POSITIVE_INFINITY
  // The deploy writes its time to the second: a cut in the turn's first second still counts.
  return cutAt.some((at) => at + 1000 >= start && at <= end) ? 'update' : 'restart'
}

/**
 * When deploys cut a running turn of `sessionId`, from the host half; empty when it cannot say.
 * @param {string} sessionId
 * @param {{ dshUrl: (path: string) => string, fetchImpl?: typeof fetch }} deps
 * @returns {Promise<number[]>}
 */
export async function readCutTimes(sessionId, { dshUrl, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(dshUrl('/api/tracy-site-tools/held'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, cut: true })
    })
    if (!res.ok) return []
    const body = await res.json().catch(() => null)
    const cutAt = body?.ok === true ? body.cutAt : null
    return Array.isArray(cutAt) ? cutAt.filter((n) => Number.isFinite(n)) : []
  } catch {
    return []
  }
}

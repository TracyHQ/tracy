// Wiring: Tracy's site agent as step 9b reaches it on the write step bench (#448). BENCH ONLY, for a site this bench made.
// It acts as the site owner, the bench account that created the site (its owner seat is checked, never granted here):
//   open    a session for the site, made the way a claimed site's build makes one (lib/site-session-ahead.js
//           `siteSessionAhead`: workspace, then session, on a seat minted for the owner);
//   request the comment requests, through the requests door a preview's "Send to Tracy" calls (bench-site-door.js
//           `requests`); a rate limit waits its `retryAfter` once;
//   prompt  the comment turn, queued into that session through the site session prompt path demo QA uses
//           (`promptSiteSession`);
//   turns   the site turn records of the prompts (state, and the writes each made), as demo QA reads them;
//   undo    one whole turn, through the turn undo door Site changes calls (bench-site-door.js `undoTurn`).
// Every repair is so a Tracy turn of that session: it shows in Site changes and can be undone like any other.
import { randomUUID } from 'node:crypto'
import { promptSiteSession, siteSessionAhead } from './lib/site-session-ahead.js'
import { accountByEmail, grantFor } from './seats/store.js'
import { siteByKey } from './sites/store.js'

/**
 * @param {{ pool: import('pg').Pool, config: any, seatDoor: { mintSeatSession?: Function }, door: object,
 *   siteKey: string, email: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void> }} input `door` is the
 *   bench's site door (bench-site-door.js), signed in as `email`
 */
export function benchRepairAgent({ pool, config, seatDoor, door, siteKey, email, fetchImpl = fetch, sleep }) {
  let site = null
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  return {
    async open() {
      site = await siteByKey(pool, siteKey)
      if (!site) return { reason: `no site ${siteKey}` }
      const account = await accountByEmail(pool, email)
      const grant = account ? await grantFor(pool, account.id, siteKey) : null
      if (grant?.role !== 'owner') return { reason: `the bench account holds no owner seat on ${siteKey}` }
      const sessionId = await siteSessionAhead({ config, seatDoor, fetchImpl, site, email })
      return sessionId
        ? { sessionId }
        : { reason: 'no session could be made for the site (no seat door, or its dsh refused)' }
    },
    async request({ sessionId, requestId, items }) {
      const body = {
        sessionId,
        requestId,
        items: items.map(({ url, element, text }) => ({ url, element, text }))
      }
      let answer = await door.requests(siteKey, body)
      if (!answer.ok && answer.code === 'COMMENT_RATE_LIMIT') {
        await wait((answer.retryAfter ?? 60) * 1000)
        answer = await door.requests(siteKey, body)
      }
      if (!answer.ok) throw new Error(`the comment requests door refused: ${answer.code}`)
      return { numbers: answer.requests.map((r) => r.n) }
    },
    prompt: ({ sessionId, requestId, text }) =>
      promptSiteSession({ config, seatDoor, fetchImpl, site, email, sessionId, requestId, text }),
    async turns({ sessionId, requestIds }) {
      const { rows } = await pool.query(
        `select turn_id, rpc_id, state, token_usage from site_turn
          where site_key = $1 and session_id = $2 and rpc_id = any($3::text[]) order by opened_at`,
        [siteKey, sessionId, requestIds]
      )
      if (!rows.length) return []
      const { rows: writes } = await pool.query(
        `select turn_id, action, outcome, target, via from site_write
          where turn_id = any($1::text[]) and outcome <> 'refused' order by at`,
        [rows.map((r) => r.turn_id)]
      )
      return rows.map((r) => ({
        turnId: r.turn_id,
        rpcId: r.rpc_id,
        state: r.state,
        changes: writes
          .filter((w) => w.turn_id === r.turn_id)
          .map((w) => ({ action: w.action, outcome: w.outcome, target: w.target, via: w.via })),
        costUsd: typeof r.token_usage?.costUsd === 'number' ? r.token_usage.costUsd : null,
        usage: r.token_usage ?? null
      }))
    },
    undo: ({ sessionId, turnId }) =>
      door.undoTurn(siteKey, {
        session: sessionId,
        turnId,
        scope: 'turn',
        idemKey: `step9b-${randomUUID()}`
      }),
    // A bench site is Joomla with rewriting off: a page other than home answers on the front controller.
    pageUrl: (page) => `https://${siteKey}${page === '/' ? '/' : `/index.php${page}`}`
  }
}

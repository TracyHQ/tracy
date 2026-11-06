// Wiring: Tracy's site agent as step 9b reaches it on the write step bench (#448). BENCH ONLY, for a site this bench made.
// It acts as the site owner, the bench account that created the site (its owner seat is checked, never granted here):
//   open    a session for the site, made the way a claimed site's build makes one (lib/site-session-ahead.js
//           `siteSessionAhead`: workspace, then session, on a seat minted for the owner);
//   request the comment requests, through the requests door a preview's "Send to Tracy" calls (bench-site-door.js
//           `requests`); a rate limit waits its `retryAfter` once, and only when the step has that much time left;
//   locate  `content.locate` through the Apply door, the call the popover makes for the element a person picks;
//   prompt  the comment turn, queued into that session through the site session prompt path demo QA uses
//           (`promptSiteSession`);
//   turns   the site turn records of the prompts (state, the writes each made, and the files its Git moments committed),
//           as demo QA and the turn undo read them;
//   undo    one whole turn, through the turn undo door Site changes calls (bench-site-door.js `undoTurn`);
//   cancel  the session's work (`session/cancel` on the site's dsh, the Stop of the chat), for a turn still open at the
//           step's return;
//   pageUrl a page's address as the preview frame names it: the site's public address and the path the site serves.
// Every repair is so a Tracy turn of that session: it shows in Site changes and can be undone like any other.
import { randomUUID } from 'node:crypto'
import { promptSiteSession, siteSeatRpc, siteSessionAhead } from './lib/site-session-ahead.js'
import { accountByEmail, grantFor } from './seats/store.js'
import { designSystemSiteReaders } from './sites/design-system-site-readers.js'
import { siteByKey } from './sites/store.js'

/**
 * A page's address as the preview frame of a bench site names it (the popover sends the frame's own address, origin and
 * path, tracy-cms-preview `pageAddress`): a bench site is Joomla with rewriting off, so a page other than home answers on
 * the front controller (lib/quickstart-releases.js `joomlaAddresses`).
 * @param {string | null} origin the site's public origin, known once the session is open
 * @param {string} page a kept page's path
 */
export function benchPageUrl(origin, page) {
  if (!origin) throw new Error('no page address before the session is open')
  const served = page === '/' || /^\/index\.php(?=[/?]|$)/.test(page) ? page : `/index.php${page}`
  return new URL(served, origin).href
}

/**
 * @param {{ pool: import('pg').Pool, config: any, seatDoor: { mintSeatSession?: Function }, door: object,
 *   siteKey: string, email: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void> }} input `door` is the
 *   bench's site door (bench-site-door.js), signed in as `email`
 */
export function benchRepairAgent({ pool, config, seatDoor, door, siteKey, email, fetchImpl = fetch, sleep }) {
  let site = null
  let origin = null
  const wait = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  return {
    async open() {
      site = await siteByKey(pool, siteKey)
      if (!site) return { reason: `no site ${siteKey}` }
      const account = await accountByEmail(pool, email)
      const grant = account ? await grantFor(pool, account.id, siteKey) : null
      if (grant?.role !== 'owner') return { reason: `the bench account holds no owner seat on ${siteKey}` }
      origin = new URL(designSystemSiteReaders({ config, fetchImpl }).publicOf(site)).origin
      const sessionId = await siteSessionAhead({ config, seatDoor, fetchImpl, site, email })
      return sessionId
        ? { sessionId }
        : { reason: 'no session could be made for the site (no seat door, or its dsh refused)' }
    },
    async request({ sessionId, requestId, items, timeLeftMs = Infinity }) {
      const body = {
        sessionId,
        requestId,
        items: items.map(({ url, element, text }) => ({ url, element, text }))
      }
      let answer = await door.requests(siteKey, body)
      if (!answer.ok && answer.code === 'COMMENT_RATE_LIMIT') {
        const ms = (answer.retryAfter ?? 60) * 1000
        if (ms >= timeLeftMs)
          throw new Error(
            `the comment requests door refused: COMMENT_RATE_LIMIT, and its ${ms / 1000} s wait is past the time left`
          )
        await wait(ms)
        answer = await door.requests(siteKey, body)
      }
      if (!answer.ok) throw new Error(`the comment requests door refused: ${answer.code}`)
      return { numbers: answer.requests.map((r) => r.n) }
    },
    prompt: ({ sessionId, requestId, text }) =>
      promptSiteSession({ config, seatDoor, fetchImpl, site, email, sessionId, requestId, text }),
    async turns({ sessionId, requestIds }) {
      const { rows } = await pool.query(
        `select turn_id, rpc_id, state, token_usage, files, head_sha from site_turn
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
        changes: [
          ...writes
            .filter((w) => w.turn_id === r.turn_id)
            .map((w) => ({ action: w.action, outcome: w.outcome, target: w.target, via: w.via })),
          // Files the turn committed (its Git moments: a look change in the template's CSS, say) write no database
          // row; they count as a change of their own, which no page record places (repair-judge.js: every page).
          ...(Number(r.files) > 0
            ? [
                {
                  action: 'files',
                  outcome: 'ok',
                  target: null,
                  via: 'files',
                  files: Number(r.files),
                  headSha: r.head_sha ?? null
                }
              ]
            : [])
        ],
        costUsd: typeof r.token_usage?.costUsd === 'number' ? r.token_usage.costUsd : null,
        usage: r.token_usage ?? null
      }))
    },
    locate: (params) => door.apply({ siteKey, action: 'content.locate', params }),
    async cancel({ sessionId }) {
      const rpc = site ? await siteSeatRpc({ config, seatDoor, fetchImpl, site, email }) : null
      if (!rpc) return { ok: false, code: 'NO_SEAT_RPC' }
      const answer = await rpc('session/cancel', { sessionId }).catch((error) => ({
        error: String(error?.message ?? error)
      }))
      return answer?.accepted === true ? { ok: true } : { ok: false, code: answer?.error ?? 'NOT_ACCEPTED' }
    },
    undo: ({ sessionId, turnId }) =>
      door.undoTurn(siteKey, {
        session: sessionId,
        turnId,
        scope: 'turn',
        idemKey: `step9b-${randomUUID()}`
      }),
    pageUrl: (page) => benchPageUrl(origin, page)
  }
}

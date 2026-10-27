/**
 * The master's half of the adopt round (docs/sre/2026-10-15-shard-beta-design.md §4.2, §4.3;
 * docs/sre/hop-dong-cua-shard.md §4): ask a shard to hold this person and hand back a one-time
 * ticket, which the browser carries to `https://<shard>/handoff?t=<ticket>` while the nonce rides in
 * the `tracy_handoff` cookie. The shard gets only the nonce's hash, and the `next` it should open
 * (kept in its ticket row, never in the URL); neither the ticket nor the nonce is ever logged.
 *
 * One more shard is tried after a refusal — `SHARD_FULL` included — and only for somebody who lives
 * nowhere yet; a refusal for good (`NOT_A_SHARD`, `MIRROR_CONFLICT`, contract §6, and `BAD_BODY`) ends the round at
 * once, marks nothing and is told as `shard.adopt_failed`. Somebody who already lives on a shard is
 * never moved (spec §10): when it does not answer they are told so. Nobody taking a new person is `none` (spec §4.1, §13 S40): no row is
 * written and the caller refuses them with `503 NO_SHARD_ACCEPTING`; this master is never where
 * they land. A master with no shard in its table has no shard model: everybody is `master` there.
 */
import { randomBytes } from 'node:crypto'
import { sha256Hex } from '../lib/hmac.js'
import { signShardRequest } from '../lib/shard-channel.js'
import { MASTER_SHARD, TICKET } from '../lib/shard-shapes.js'
import { destinationOf, placesOf, recordHome } from './directory.js'
import { SILENT_AFTER_MS, accepts, eligible, pickShard } from './pick.js'
import { markDegraded } from './store.js'

export const ADOPT_PATH = '/_shard/adopt'
const ADOPT_TIMEOUT_MS = 5_000
/** `shard.none` is told once per quarter hour (spec §13 S40), whatever the reason of each refusal. */
export const NONE_ALERT_WINDOW_MS = 15 * 60_000
/**
 * A shard's answers that end the round for good (contract §6): no retry, no degraded mark, one alert.
 * `BAD_BODY` is this master's body being off the shard's shape — the shard is healthy and another one
 * would answer the same, so it is no reason to pass the shard over.
 */
const FATAL_ADOPT = new Map([
  [400, 'BAD_BODY'],
  [404, 'NOT_A_SHARD'],
  [409, 'MIRROR_CONFLICT']
])

/**
 * What every `shard.none` is recorded with: the reason, and the key that folds a quarter hour of
 * refused sign-ups into one line on the ops topic. Every caller (sign-in, `/new/?fresh=1`) uses this.
 * @param {'NO_ELIGIBLE_SHARD' | 'ADOPT_FAILED'} reason
 * @param {number} nowMs
 */
export function noneAlert(reason, nowMs) {
  return { data: { reason }, dedupeKey: `none:${Math.floor(nowMs / NONE_ALERT_WINDOW_MS)}` }
}

/** One signed `POST /_shard/adopt`. Never throws: no answer is `{ok: false, status: 0}`. */
export async function adoptAt(
  shard,
  payload,
  { fetchImpl = fetch, timeoutMs = ADOPT_TIMEOUT_MS, now = Date.now } = {}
) {
  const body = JSON.stringify(payload)
  const headers = await signShardRequest({
    secret: shard.secret,
    method: 'POST',
    path: ADOPT_PATH,
    body,
    now: now()
  })
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const response = await fetchImpl(`${shard.origin}${ADOPT_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      redirect: 'error',
      signal
    })
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
  } catch {
    return { ok: false, status: 0, body: null, ...(signal.aborted ? { timedOut: true } : {}) }
  }
}

/**
 * Where the browser goes with its ticket: the ticket and nothing else (contract §4 step 4). The page
 * it lands on is the `next` the shard stored with the ticket.
 */
export function handoffUrl(shard, ticket) {
  const url = new URL('/handoff', shard.origin)
  url.searchParams.set('t', ticket)
  return url.toString()
}

export function createHandoff({ pool, book, config, signal = null, fetchImpl = fetch, now = Date.now }) {
  /**
   * A ticket from `shard`; or `full` (it takes nobody new — try another, nothing marked); or `fatal`
   * (NOT_A_SHARD, MIRROR_CONFLICT, BAD_BODY: the round ends here, nothing marked, `shard.adopt_failed` told);
   * or a refusal that marks it degraded and tells the ops topic.
   */
  async function ticketFrom(shard, account, email, nextPath) {
    if (!shard?.secret) return { ok: false }
    // 16 random bytes as 32 hex: the cookie value; only its hash leaves this process (contract §3, §4).
    const nonce = randomBytes(16).toString('hex')
    const answer = await adoptAt(
      shard,
      {
        email,
        // A person may have neither a name nor a language: the keys are left out, never sent as null.
        ...(account.display_name ? { displayName: account.display_name } : {}),
        ...(account.language ? { locale: account.language } : {}),
        source: 'master',
        idempotencyKey: account.id,
        nonceHash: await sha256Hex(nonce),
        ...(nextPath ? { next: nextPath } : {})
      },
      { fetchImpl, now }
    )
    const ticket = answer.body?.handoff
    if (answer.ok && typeof ticket === 'string' && TICKET.test(ticket)) return { ok: true, ticket, nonce }
    if (answer.status === 503 && answer.body?.code === 'SHARD_FULL') {
      book.invalidate()
      return { ok: false, full: true }
    }
    const code = FATAL_ADOPT.get(answer.status)
    if (code && answer.body?.code === code) {
      // Refused for good (contract §6): the shard is not broken, so nothing is marked; the ops topic
      // hears which shard and which code, never the address. The caller asks no other shard.
      await signal?.record('shard.adopt_failed', {
        data: { shard: shard.name, code },
        dedupeKey: `adopt_failed:${shard.name}:${code}:${Math.floor(now() / 600_000)}`
      })
      return { ok: false, fatal: true }
    }
    await markDegraded(pool, shard.name, new Date(now() + SILENT_AFTER_MS))
    book.invalidate()
    await signal?.record('shard.degraded', {
      data: { shard: shard.name, status: answer.status },
      dedupeKey: `degraded:${shard.name}:${Math.floor(now() / 600_000)}`
    })
    return { ok: false }
  }

  async function handed(shard, email, got) {
    await recordHome(pool, email, shard.name)
    return { kind: 'handoff', shard, nonce: got.nonce, url: handoffUrl(shard, got.ticket) }
  }

  /**
   * @param {{email: string, wanted?: string | null, nextPath?: string | null, country?: string | null,
   *   fresh?: boolean}} input - `wanted`: the shard a pointer or a `next` named; honoured for somebody
   *   who lives there, and as the first choice for a new person while it may still take people.
   *   `fresh`: the person's shard sent them to `/new/?fresh=1` because it takes nobody new (contract
   *   §12) — when it indeed does not, they start on another shard and keep every place they had.
   */
  async function handoffFor({ email, wanted = null, nextPath = null, country = null, fresh = false }) {
    const account = (
      await pool.query('select id, display_name, language from account where email = $1', [email])
    ).rows[0]
    if (!account) return { kind: 'master' }
    const shards = await book.all()
    const places = await placesOf(pool, email)
    const lives =
      wanted && places.some((place) => place.shard === wanted)
        ? wanted
        : await destinationOf({ pool, email, allow: config.shardAdoptAllow })
    if (lives === MASTER_SHARD) return { kind: 'master' }
    const home = lives ? (shards.get(lives) ?? null) : null
    const movingOn = Boolean(fresh && lives && home && !accepts(home))
    // A `next` names a page of the shard that was asked for (contract §4 1a): on any other shard it is
    // a path that shard does not have, so the person lands on `/new/` there.
    const landing = (name) => (wanted && name !== wanted ? '/new/' : nextPath)
    if (lives && !movingOn) {
      const got = await ticketFrom(home, account, email, landing(home?.name))
      return got.ok ? handed(home, email, got) : { kind: 'unavailable', shard: lives }
    }
    const all = [...shards.values()]
    // No shard in the table is a master without the shard model: nothing changes for anybody.
    if (all.length === 0) return { kind: 'master' }
    // Moving on: never a shard they already live on (`email → [s2, s3]`, contract §12).
    const lived = movingOn ? places.map((place) => place.shard) : []
    const tried = []
    const nextShard = () => pickShard(all, { now: now(), country, exclude: [...lived, ...tried] })
    let shard =
      all.find((s) => s.name === wanted && !lived.includes(s.name) && eligible(s, now())) ?? nextShard()
    while (shard && tried.length < 2) {
      tried.push(shard.name)
      const got = await ticketFrom(shard, account, email, landing(shard.name))
      if (got.ok) return handed(shard, email, got)
      // Refused for good (contract §6): no other shard is asked.
      if (got.fatal) break
      shard = nextShard()
    }
    // Nobody took them (spec §4.1, S40) — new, or moving on from a full shard with nowhere else to
    // go: no row is written (a mover keeps the places they had), and the caller refuses them.
    await signal?.record(
      'shard.none',
      noneAlert(tried.length > 0 ? 'ADOPT_FAILED' : 'NO_ELIGIBLE_SHARD', now())
    )
    return { kind: 'none' }
  }

  return { handoffFor }
}

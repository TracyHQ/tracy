// THE BOOK HALF OF PUBLISHING A SITE (`069-site-publish-op.sql`, `070-site-own-domain.sql`): one
// operation per site at a time, and the `published` flag only once the host said its job is done.
// An operation is a publish (`live`), a back-to-draft (`draft`), one of the site's own domains
// taken out (`drop-domain`), or the whole site taken off its host before its row goes (`delete`);
// all four share the row, the key and the rule for letting go.
//
//   reserveUnderNames the door's way in: under the site's names lock (the one every address change
//                     takes), choose the domains the operation carries and take the row. So a domain
//                     cannot be removed, saved again or proven again between "it is proven" and "it
//                     is reserved for this operation".
//   reservePublishOp  takes the site's one row for a new operation, or answers null when an earlier
//                     one still holds it. One statement, so two presses in two tabs, or on two
//                     replicas, cannot both take it. Going back to draft, the flag is lowered in
//                     the same transaction: the operation is never seen without it. A cleanup that
//                     failed (`draft`, `drop-domain`) and is asked for again is taken back under
//                     its OWN ref, with the next `attempt` — never a second key for the same work.
//   adoptJob          the host named a job for the operation: the job's `job` row, what the door
//                     owes it (`site_job_follow_up`, door `go-live`) and the operation's row, in one
//                     transaction. Also how an operation takes its job back after the host lost it.
//   failPublishOp     the host refused in its own words (`HOST_REFUSALS`) and said it never took
//                     the operation's key: the operation ended. Never once a job was named.
//   leaveUnconfirmed  no answer from the host that says how the operation went — none at all, or
//                     "still busy". The row keeps the site until the host says what became of it
//                     (`publish.js` asks again under the same job key); time alone never frees it.
//   settleGoLive      the job ended: flip the flag (going live only) and close the operation, inside
//                     the caller's transaction. Whoever hears of the ending first does it — a poll of
//                     the state, or the follow-up sweep — and a second hearing finds nothing to do.
//
// The two directions keep their opposite order (`publish.js`): going live flips the flag LAST, here;
// going back to draft flips it FIRST, with the reservation, and nothing here ever puts it back up.
import { randomBytes, randomUUID } from 'node:crypto'
import { opsFor } from '../lib/ops-signal.js'
import { DELETE_BRIEF_OF_GONE } from '../lib/site-brief-row.js'
import { audit } from './store.js'

/** The most of the host's last lines kept on the row. */
const DETAIL_MAX = 2000

/** Why an operation failed or is unconfirmed — the only words about it a customer's screen is sent. */
export const PUBLISH_CODES = Object.freeze({
  /** The host has no tunnel configuration: publishing is not set up on this server. */
  notConfigured: 'NOT_CONFIGURED',
  /** Closed by an operator's own hand after reconciling the host (the journal's procedure): no
   * door writes it. */
  refused: 'FLEET_REFUSED',
  /** The host gave no answer; it may still have taken the job. */
  unreachable: 'HOST_UNREACHABLE',
  /** The host ran the job and it failed. */
  jobFailed: 'JOB_FAILED',
  /** The host's record of the job says nothing about what its script did — gone, marked failed by
   * a restart, written without the script's exit code, or ended because the site was held by an
   * earlier run. Only ever on a held row. */
  silent: 'HOST_SILENT',
  /** The site's row was gone when the job ended. */
  siteGone: 'SITE_UNKNOWN',
  /** The job ended `done` without the script's own closing line for this direction. */
  noResult: 'JOB_NO_RESULT',
  /** The site went live, but the host did not say it added one of the own domains. */
  domainNotRouted: 'DOMAIN_NOT_ROUTED',
  /** A draft or a domain removal ended, and the host did not say every own domain is out of its
   * ingress: one may still open the site. The operation can be asked for again under its own key. */
  domainStillRouted: 'DOMAIN_STILL_ROUTED',
  /** Never a failure: the mark a `delete` carries once the host's script said the site is off the
   * host (its closing line). The operation goes on holding the site until the book has let the row
   * go; whoever looks at it next does that (`publish.js` `refresh`), without asking the host again. */
  tornDown: 'TORN_DOWN'
})

/** The operations that take the site's own domains out of the host's ingress. */
const CLEANUPS = ['draft', 'drop-domain']
/** The operations that take things away. One that failed is asked for again under its own ref. */
const RETAKEN = [...CLEANUPS, 'delete']

/**
 * The line `go-live.sh` prints once `ingress_api.py` shows the domain's rule leading to tracy-web
 * (step 4 of the script). 🔒 THE WORD `tracy-web` IS PART OF IT: a host still running the script
 * from before #1037 prints `→ 127.0.0.1:<site port>` — a rule straight to the site, past this app —
 * and that line is not this one. Such a domain is reported not routed, never counted as installed.
 */
const routedLine = (domain) => `\n==> ingress: ${domain} → tracy-web `
/** The line it prints once the rule is removed. */
const removedLine = (domain) => `\n==> ingress: removed ${domain}\n`
/** The line it prints when the name's rule is not this site's: nothing of this site answers there. */
const notOursLine = (domain) => `\n==> ingress: ${domain} is not routed to this site\n`

/** The domains an operation's row carries, as a list of strings whatever the column holds. */
export const carriedDomains = (op) =>
  Array.isArray(op?.domains) ? op.domains.filter((domain) => typeof domain === 'string') : []

/**
 * The script's closing line for a direction AND a site, printed only when every step before it went
 * through: `TRACY_RESULT go_live=<op> label=<label> …`. A line for another direction or another
 * site's label is not this operation's ending, whatever job carried it.
 */
const resultLine = (op, label) => `\nTRACY_RESULT go_live=${op} label=${label} `
/** `teardown.sh`'s closing line, printed only when nothing of the site is left on the host. */
const tornDownLine = (label) => `\nTRACY_RESULT torn_down=1 label=${label}\n`

// 🔒 A RESERVATION IS NAMED BY ITS `ref`, AND BY NOTHING ELSE. Every write a door makes about "its"
// operation is conditional on the ref it was handed when it took the row — never on the time the row
// was taken: two reservations inside one millisecond would then be one name, and the late answer
// about the first could write its job over the second.

/** How long after it was reserved the background sweep first looks at an operation: the door that
 * reserved it is still talking to the host for that long (`publish.js` `GO_LIVE_ASK_MS`). */
const SWEEP_FIRST_LOOK = "interval '30 seconds'"

const RESERVE = `insert into site_publish_op as o
       (site_key, op, state, ref, actor, actor_account, domains, target, attempt, sweep_at, sweep_tries)
     select s.site_key, $2, 'starting', $3, $4, $5, $6::jsonb, $7, 0, now() + ${SWEEP_FIRST_LOOK}, 0
       from site s where s.site_key = $1
     on conflict (site_key) do update
       set op = excluded.op, state = 'starting', ref = excluded.ref, job_id = null,
           actor = excluded.actor, actor_account = excluded.actor_account,
           domains = excluded.domains, target = excluded.target, attempt = 0,
           sweep_at = excluded.sweep_at, sweep_tries = 0,
           code = null, detail = null, started_at = now(), updated_at = now()
       where o.state not in ('starting', 'running')
     returning *`

// 🔒 A CLEANUP THAT FAILED IS TAKEN BACK UNDER ITS OWN REF. A `draft` or a `drop-domain` whose job
// ended failed left something on the host (a rule still in the tunnel, a name still on the site's
// record). Asked for again — the same direction, for a removal the same domain — it is the SAME
// operation: its ref stays, so the host is asked under the same job key, and `attempt` goes up by
// one, which is what makes the host run a failed job again instead of answering the failure it has
// (`tracy-host` `hasOutcomeFor`). The script does what is still left: each step looks before it
// acts. One statement, conditional on the row still being that failed cleanup, so two presses, or
// two replicas, take it back once. A `live` that failed is never taken back: its next press is a
// new operation.
const RETAKE = `update site_publish_op
        set state = 'starting', job_id = null, attempt = attempt + 1, actor = $3, actor_account = $4,
            domains = case when op = 'draft' then $5::jsonb else domains end,
            sweep_at = now() + ${SWEEP_FIRST_LOOK}, sweep_tries = 0,
            code = null, detail = null, started_at = now(), updated_at = now()
      where site_key = $1 and op = $2 and state = 'failed' and job_id is not null
        and op = any($6::text[]) and (op = 'draft' or domains = $5::jsonb)
      returning *`

/** The advisory lock every change to a site's names takes, and an operation takes to reserve. */
const namesLock = (siteKey) => `site-address:${siteKey}`

/**
 * Run `work` in a transaction that holds the site's names lock, or answer `{ busy: true }` at once
 * when another change holds it (never a wait: the holder may be talking to the host). The lock is
 * the same one `PUT /address` holds for a rename, so saving, proving and removing a domain and
 * reserving an operation happen one at a time for a site.
 * @template T
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {(db: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<{ busy: true } | { busy: false, value: T }>}
 */
export async function withSiteNames(pool, siteKey, work) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query('select pg_try_advisory_xact_lock(hashtext($1)) as locked', [
      namesLock(siteKey)
    ])
    if (!rows[0].locked) {
      await client.query('rollback')
      return { busy: true }
    }
    const value = await work(client)
    await client.query('commit')
    return { busy: false, value }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * What holds the site, read under the names lock by every door that changes its names: `'publish'`
 * (an operation reserved or running — it may be handing those very names to the host), `'gone'`
 * (the row is not there any more), or null.
 * @returns {Promise<'gone' | 'publish' | null>}
 */
export async function lifecycleHolds(db, siteKey) {
  const { rows } = await db.query(
    `select exists(select 1 from site_publish_op o
                    where o.site_key = s.site_key and o.state in ('starting', 'running')) as publish
       from site s where s.site_key = $1`,
    [siteKey]
  )
  if (!rows[0]) return 'gone'
  return rows[0].publish === true ? 'publish' : null
}

/**
 * The own domains of a site the host may have a rule for: connected, or handed to a host job whose
 * answer about them was never heard (`carried_at`). Read under the names lock by whoever is about
 * to let them go.
 */
export async function maybeRouted(db, siteKey) {
  const { rows } = await db.query(
    `select * from site_name
      where site_key = $1 and kind = 'custom'
        and (state = 'active' or (state = 'pending' and carried_at is not null))
      order by created_at, name`,
    [siteKey]
  )
  return rows
}

/**
 * Take the site's row for a new operation. Null when another one holds it: `running`, or `starting`
 * — confirmed by the host or not — and when the site is not there.
 *
 * 🔒 GOING BACK TO DRAFT, THE RESERVATION AND THE LOWERED FLAG ARE ONE COMMIT. Every read of the
 * site hands a `starting` operation to the host (`publish.js` `refresh`), and an ending may close
 * it. Were the row committed before the flag came down, a read in between would send the host its
 * job for a site still reading `published`, and the operation could end with the flag never
 * lowered. So nobody sees the `draft` operation before the flag is down. (The site cannot go in
 * between: the new row's foreign key holds it until the commit.)
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, op: 'live' | 'draft', actor?: string | null, actorAccount?: string | null }} input
 */
export async function reservePublishOp(
  pool,
  { siteKey, op, actor = null, actorAccount = null, domains = [], target = null }
) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const row = await reserveIn(client, { siteKey, op, actor, actorAccount, domains, target })
    if (!row) {
      await client.query('rollback')
      return null
    }
    await client.query('commit')
    return row
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * {@link reservePublishOp} on the caller's own transaction: the row taken (or taken back, for a
 * failed cleanup asked for again), the flag lowered for a `draft`, and every domain a `live` hands
 * to the host marked as possibly in its ingress from this moment — all committed together, or none.
 * Null when another operation holds the site or the site is not there; the caller then rolls back.
 * @param {{ query: Function }} db - a client inside a transaction
 */
async function reserveIn(db, { siteKey, op, actor, actorAccount, domains, target }) {
  const carried = JSON.stringify(domains)
  let row = null
  if (RETAKEN.includes(op))
    row = (await db.query(RETAKE, [siteKey, op, actor, actorAccount, carried, RETAKEN])).rows[0] ?? null
  if (!row) {
    const ref = randomUUID().replaceAll('-', '')
    row = (await db.query(RESERVE, [siteKey, op, ref, actor, actorAccount, carried, target])).rows[0] ?? null
  }
  if (!row) return null
  // 🔒 EVERY RUN OF AN OPERATION WRITES OR REMOVES ROUTES UNDER A GENERATION OF ITS OWN, from one
  // sequence for the whole deployment. The host keeps it beside each own-domain route, so of two
  // runs that reach the host out of order the older never removes, or replaces, the newer's route —
  // whichever site each belongs to (`ingress_api.py`).
  row =
    (
      await db.query(
        `update site_publish_op set route_gen = nextval('site_route_gen')
          where site_key = $1 and ref = $2 returning *`,
        [siteKey, row.ref]
      )
    ).rows[0] ?? row
  // The door that deletes waits on the host itself for longer than the sweep's first look
  // (`route.js` `TEARDOWN_WAIT_MS`); the sweep comes after it, for a door that died meanwhile.
  if (op === 'delete')
    await db.query(
      `update site_publish_op set sweep_at = now() + interval '2 minutes' where site_key = $1 and ref = $2`,
      [siteKey, row.ref]
    )
  if (op === 'draft') {
    const lowered = await db.query(
      `update site set publish = 'draft' where site_key = $1 returning site_key`,
      [siteKey]
    )
    if (!lowered.rowCount) return null
  }
  // 🔒 FROM HERE THE HOST MAY HAVE THE DOMAIN'S RULE, WHATEVER IS HEARD LATER. The ask that adds it
  // goes out right after this commit; if its answer never arrives the domain stays `pending` in the
  // book while its rule may stand on the host. The mark is what makes a later removal go through
  // the host, and only the host saying "gone" clears it (`settleGoLive`).
  //
  // 🔒 AND EVERY HAND-OVER IS A NEW CONNECTION ATTEMPT, WITH A SECRET OF ITS OWN. Whether the domain
  // then opens this site is asked of the domain itself (`domain-probe.js`), and only an answer made
  // with this attempt's secret counts: what an earlier attempt proved, or left answering somewhere,
  // proves nothing for this one.
  //
  // 🔒 SO WHAT THE EARLIER ATTEMPT LEFT ON THE ROW GOES WITH ITS SECRET: the host's word that the
  // route is installed (`routed_at`) and the domain's own proof (`connected_at`) are both of ONE
  // attempt, and both are cleared here. Kept, they made a name read "connected" through a publish
  // whose host job failed, or whose probe found the domain no longer opening the site — on the
  // strength of an answer given to another attempt. The name goes on being SERVED (`state` is not
  // touched: its visitors are there), and it reads pending until this attempt's route is in and
  // this attempt's probe was answered. An attempt the host never confirms is taken up again by the
  // route sweep (`cron.js` `sweepLegacyOwnDomains`: an active name with no installed route).
  if (op === 'live')
    for (const name of domains)
      await db.query(
        `update site_name
            set carried_at = now(), probe_secret = $3, probe_reading = null, probed_at = null,
                probe_tries = 0, probe_next_at = null, routed_at = null, connected_at = null
          where site_key = $1 and kind = 'custom' and name = $2`,
        [siteKey, name, randomBytes(32).toString('hex')]
      )
  // 🔒 A NAME BEING TAKEN OUT STOPS OPENING THE SITE HERE, WITH THE RESERVATION — before the host is
  // asked for anything. Its requests reach this app (the host's rule leads here), and this app
  // serves only a connected name: back to `pending`, with no attempt to prove, it serves none and
  // no late probe can connect it again. `carried_at` stays: the host may still have its rule, and
  // only the host saying it is out lets the row go (`settleGoLive`).
  if (CLEANUPS.includes(op) && domains.length > 0)
    await db.query(
      `update site_name
          set state = 'pending', routed_at = null, connected_at = null, probe_secret = null,
              probe_next_at = null, carried_at = coalesce(carried_at, now()), updated_at = now()
        where site_key = $1 and kind = 'custom' and state in ('active', 'pending')
          and name = any($2::text[])`,
      [siteKey, domains]
    )
  return row
}

/**
 * Reserve under the site's names lock. `choose(db)` runs inside it and answers the domains the
 * operation carries (`{ domains, target? }`) or why there is no operation (`{ refusal }`).
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, op: 'live' | 'draft' | 'drop-domain', actor?: string | null,
 *   actorAccount?: string | null, choose: (db: import('pg').PoolClient) =>
 *     Promise<{ domains: string[], target?: string | null } | { refusal: unknown }> }} input
 * @returns {Promise<{ row: Record<string, any> } | { busy: 'names' | 'publish' | 'gone' }
 *   | { refusal: unknown }>}
 */
export async function reserveUnderNames(pool, { siteKey, op, actor = null, actorAccount = null, choose }) {
  /** Thrown to leave the transaction with nothing written when the row could not be taken. */
  class NotTaken extends Error {}
  try {
    const held = await withSiteNames(pool, siteKey, async (db) => {
      // Before `choose`: what it writes about the domains belongs to the operation that takes the row.
      const holds = await lifecycleHolds(db, siteKey)
      if (holds) return { busy: holds }
      const chosen = await choose(db)
      if ('refusal' in chosen) return chosen
      const row = await reserveIn(db, {
        siteKey,
        op,
        actor,
        actorAccount,
        domains: chosen.domains,
        target: chosen.target ?? null
      })
      if (!row) throw new NotTaken()
      return { row }
    })
    return held.busy ? { busy: 'names' } : held.value
  } catch (error) {
    if (error instanceof NotTaken) return { busy: 'publish' }
    throw error
  }
}

/**
 * The host named a job for the operation `ref`: write the job, what is owed to it and the
 * operation's state together. For a `starting` row this is the host taking the work; for a
 * `running` one, the host running it again after its record of the first run said nothing (the same
 * key names the same job id, so the `job` row is put back to "not ended"). Null when the row is no
 * longer this operation's — nothing is written then.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, ref: string, host: string, jobId: string }} input - `ref`: the
 *   reservation's own name (`reservePublishOp`)
 */
export async function adoptJob(pool, { siteKey, ref, host, jobId }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const { rows } = await client.query(
      `update site_publish_op set state = 'running', job_id = $2, code = null, updated_at = now()
        where site_key = $1 and ref = $3 and state in ('starting', 'running')
        returning *`,
      [siteKey, jobId, ref]
    )
    if (rows[0]) {
      await client.query(
        `insert into job (id, site_key, host, kind) values ($1, $2, $3, 'go-live')
         on conflict (id) do update set state = 'queued', step = null, detail = null, updated_at = now()`,
        [jobId, siteKey, host]
      )
      await client.query(
        `insert into site_job_follow_up (job_id, site_key, door) values ($1, $2, 'go-live')
         on conflict (job_id) do nothing`,
        [jobId, siteKey]
      )
    }
    await client.query('commit')
    return rows[0] ?? null
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/**
 * The refusals `tracy-host`'s `POST /_host/go-live` defines (`goLiveRoute`), each with the status it
 * answers it on.
 *
 * 🔒 A REFUSAL ENDS AN OPERATION ONLY WHEN THE HOST ALSO SAYS IT NEVER TOOK THE KEY. The site's
 * folder and the host's configuration can change after a job was taken, so "no such site" now says
 * nothing about a job started earlier whose answer never arrived. The host looks the operation's
 * key up before it checks anything else and says what it found beside every refusal:
 * `accepted: false` — no job and no record under the key, no script ever ran for it. That, and
 * nothing this side knows (a row without a job id is only an answer that did not arrive), is what
 * {@link hostRefusal} reads. `GO_LIVE_BUSY` is not here: it says a job is at work. Neither is
 * anything the host's sign-in check or a proxy in between may answer.
 */
export const HOST_REFUSALS = Object.freeze({
  /** The request is not one the host takes (`why` says which part). */
  BAD_REQUEST: 400,
  /** The host has no folder for this site's label. */
  NOT_FOUND: 404,
  /** The ask names a domain and the host has no tunnel configuration to route one through. */
  NOT_CONFIGURED: 501,
  /** The domains were measured to point at a tunnel this host no longer writes to. */
  ROUTING_TARGET_CHANGED: 409
})

/**
 * The host's own refusal of a key it never took, or null: a JSON object whose `code` is one of
 * {@link HOST_REFUSALS}, on that code's status, carrying `accepted: false`. An HTML page, an empty
 * body, an unknown code, a known code on another status, and a refusal that does not say the key
 * was never taken (no `accepted`, `true`, or anything but the boolean `false`) are all null.
 * @param {{ status: number, body: unknown }} answer - `hostCall`'s answer
 * @returns {keyof typeof HOST_REFUSALS | null}
 */
export function hostRefusal(answer) {
  const body = answer?.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { code, accepted } = /** @type {Record<string, unknown>} */ (body)
  if (accepted !== false) return null
  if (typeof code !== 'string' || !Object.hasOwn(HOST_REFUSALS, code)) return null
  return HOST_REFUSALS[code] === answer.status ? /** @type {keyof typeof HOST_REFUSALS} */ (code) : null
}

/**
 * The operation `ref` ended before the host named a job for it: the host refused it
 * ({@link hostRefusal}), or the site went. Null, and nothing written, once the row has a job — the
 * script behind a job may be at work, and only its outcome ends the operation then.
 */
export async function failPublishOp(db, { siteKey, ref, code, detail = null }) {
  const { rows } = await db.query(
    `update site_publish_op set state = 'failed', code = $3, detail = $4, updated_at = now()
      where site_key = $1 and ref = $2 and state in ('starting', 'running') and job_id is null
      returning *`,
    [siteKey, ref, code, bounded(detail)]
  )
  return rows[0] ?? null
}

/**
 * Nothing the host said tells how the operation `ref` went: the row stays as it is — `starting` or
 * `running` — saying why, and goes on holding the site.
 * @param {{ query: Function }} db
 * @param {{ siteKey: string, ref: string, code?: string }} input
 */
export async function leaveUnconfirmed(db, { siteKey, ref, code = PUBLISH_CODES.unreachable }) {
  await db.query(
    `update site_publish_op set code = $3, updated_at = now()
      where site_key = $1 and ref = $2 and state in ('starting', 'running')
        and code is distinct from '${PUBLISH_CODES.tornDown}'`,
    [siteKey, ref, code]
  )
}

/** The site's operation as it stands. */
export async function currentPublishOp(db, siteKey) {
  const { rows } = await db.query('select * from site_publish_op where site_key = $1', [siteKey])
  return rows[0] ?? null
}

/**
 * Let the row of a deleted site go — and with it everything that hangs on it, its operation
 * included — only as the `delete` operation `ref` the host has finished (`PUBLISH_CODES.tornDown`).
 * One statement, so a site whose delete failed, was taken back, or was closed by somebody else a
 * moment ago is not touched.
 *
 * 🔒 THE SITE'S JOBS STILL OPEN ARE ENDED IN THE SAME STATEMENT. `job` rows outlive their site on
 * purpose (they are its history), but one still `queued`/`running` would stay so forever: the host
 * that ran it has just taken the site off itself, and `teardown.sh` drops that label's finished job
 * records, so the sweep (`settleQuietJobs`) only ever hears 404 for it. Measured 04/10/2026 on dev
 * (#888 item 3): a site deleted while it was still being built left its provision row `running`.
 * Ended as `failed` — every reader already knows that word, and none of them knows another — with
 * `step: 'site-deleted'` and `detail.code: 'SITE_DELETED'`, keeping the last thing the host said
 * under `detail.last`. A job that had already ended keeps its ending.
 * @param {{ query: Function }} db
 * @param {{ siteKey: string, ref: string }} input
 * @returns {Promise<boolean>} whether this call removed the row
 */
export async function deleteTornDownSite(db, { siteKey, ref }) {
  const { rows } = await db.query(
    `with gone as (
       delete from site s using site_publish_op o
        where s.site_key = $1 and o.site_key = s.site_key and o.ref = $2
          and o.op = 'delete' and o.state = 'running' and o.code = $3
        returning s.site_key
     ), ended as (
       update job j set
         state = 'failed',
         step = 'site-deleted',
         detail = jsonb_build_object('code', 'SITE_DELETED', 'last', j.detail),
         updated_at = now()
       from gone
        where j.site_key = gone.site_key and j.state not in ('done', 'failed')
       returning j.id
     ), brief as (${DELETE_BRIEF_OF_GONE})
     select (select count(*) from gone)::int as removed`,
    [siteKey, ref, PUBLISH_CODES.tornDown]
  )
  return rows[0].removed > 0
}

/** `go-live.sh`'s exit code for "another go-live of this site holds its lock": it changed nothing. */
const GO_LIVE_BUSY_EXIT = 75

/**
 * What a host's job record says its SCRIPT did, or null when it says nothing of the kind.
 *
 * 🔒 ONLY A RECORD THAT CARRIES THE SCRIPT'S OWN EXIT CODE IS AN OUTCOME. `done` counts with exit
 * code 0; `failed` counts with the script's non-zero exit code. A record without one was written by
 * something other than the script ending: the host restarted under the job (`orphanedAt`), the run
 * or the write of its ending could not be observed (no exit code — the script may still be at
 * work), or the script found the site held by an earlier run and changed nothing (`busy`, exit 75).
 * None of those is how the operation went, and none frees the site.
 * @param {unknown} record - the body of `GET /_host/jobs/:id`
 * @returns {'done' | 'failed' | null}
 */
export function scriptOutcome(record) {
  if (!record || typeof record !== 'object') return null
  const job = /** @type {Record<string, unknown>} */ (record)
  if (job.orphanedAt != null || job.busy === true || job.unobserved === true) return null
  if (job.state === 'done') return job.exitCode === 0 ? 'done' : null
  if (job.state !== 'failed') return null
  return Number.isInteger(job.exitCode) && job.exitCode !== 0 && job.exitCode !== GO_LIVE_BUSY_EXIT
    ? 'failed'
    : null
}

/**
 * Whether a host's job record has ENDED without being an outcome ({@link scriptOutcome}): the
 * host will say nothing more about it, so the operation is asked for again under its own key.
 * @param {unknown} record - the body of `GET /_host/jobs/:id`
 */
export function noOutcome(record) {
  if (!record || typeof record !== 'object') return false
  const state = /** @type {Record<string, unknown>} */ (record).state
  return (state === 'done' || state === 'failed') && scriptOutcome(record) === null
}

/**
 * The job `jobId` ended (`done` · `failed`): close the operation it belongs to, and for a finished
 * `live` raise the flag. Runs on the caller's transaction client. Null when the job is not the
 * site's running operation any more — a late or repeated answer changes nothing — and when the
 * answer is no outcome.
 * @param {{ query: Function }} db - a client inside a transaction
 * @param {{ siteKey: string, jobId: string, answer: { state: string, output?: unknown,
 *   outcome?: 'done' | 'failed' | null } }} input - `outcome`: what the host's record says the
 *   script did ({@link scriptOutcome}); an answer that names none ends nothing
 * @returns {Promise<Record<string, any> | null>} the operation's row as it ended; null when it did
 *   not end here
 */
export async function settleGoLive(db, { siteKey, jobId, answer }) {
  const { rows } = await db.query(
    `select * from site_publish_op where site_key = $1 and job_id = $2 and state = 'running' for update`,
    [siteKey, jobId]
  )
  const op = rows[0]
  if (!op) return null
  // Heard already: the host said the site is off it, and nothing it says later takes that back.
  if (op.op === 'delete' && op.code === PUBLISH_CODES.tornDown) return null
  // 🔒 ONLY THE SCRIPT'S OWN ENDING ENDS THE OPERATION. A record a restart marked failed, one that
  // ended on the site's lock, or one with no exit code does not say the script behind the job has
  // stopped, let alone what it did. The operation goes on holding its site, marked as unheard, and
  // the host is asked again for the same operation (`publish.js` `refresh`). The outcome has to be
  // named by the caller from the record itself: an answer without one is not believed.
  if (answer.outcome !== 'done' && answer.outcome !== 'failed') {
    await leaveUnconfirmed(db, { siteKey, ref: op.ref, code: PUBLISH_CODES.silent })
    return null
  }
  const end = async (state, code = null, detail = null) =>
    (
      await db.query(
        `update site_publish_op set state = $2, code = $3, detail = $4, updated_at = now()
          where site_key = $1 and ref = $5 returning *`,
        [siteKey, state, code, bounded(detail), op.ref]
      )
    ).rows[0]
  // A newline at both ends, so the first and the last line read like every line between them, and
  // a line is only ever matched from its first character.
  const said = `\n${typeof answer.output === 'string' ? answer.output : ''}\n`
  const carried = carriedDomains(op)

  /**
   * The own domains the script SAID are out of the ingress (removed, or not this site's rule) are
   * written as such, whatever else the job did: the half of a cleanup that finished is on record
   * when the other half failed, and asking again does only what is left. Answers the names that may
   * still be routed. `forget`: the removal the customer asked for takes the row away as well.
   */
  const takeOut = async (forget) => {
    const held = await maybeRouted(db, siteKey)
    const gone = held
      .map((row) => row.name)
      .filter((domain) => said.includes(removedLine(domain)) || said.includes(notOursLine(domain)))
    const back = gone.filter((domain) => !forget.includes(domain))
    if (back.length > 0)
      await db.query(
        `update site_name
            set state = 'pending', carried_at = null, routed_at = null, connected_at = null,
                probe_secret = null, probe_next_at = null, updated_at = now()
          where site_key = $1 and kind = 'custom' and state in ('active', 'pending')
            and name = any($2::text[])`,
        [siteKey, back]
      )
    const dropped = gone.filter((domain) => forget.includes(domain))
    for (const name of dropped) {
      await db.query("delete from site_name where site_key = $1 and kind = 'custom' and name = $2", [
        siteKey,
        name
      ])
      // Let go: answered with the refusal page for as long as its DNS still points here.
      await db.query(
        'insert into site_name_released(name) values($1) on conflict (name) do update set released_at = now()',
        [name]
      )
      await audit(db, { actor: op.actor, action: 'site.domain.remove', siteKey, detail: { name, jobId } })
    }
    return held.map((row) => row.name).filter((domain) => !gone.includes(domain))
  }

  if (op.op === 'delete' && answer.outcome === 'done') {
    // 🔒 "DONE" FOR A DELETE IS THE HOST'S HALF ONLY, AND IT IS WRITTEN DOWN, NOT ACTED ON HERE. The
    // row of the site — with its seats and everything that hangs on it — goes only after the host
    // said the site is off it, and letting it go reaches outside this transaction (the repository,
    // the agent's seats and sessions). So the operation is MARKED and keeps holding the site; the
    // book is closed by whoever looks next (`publish.js` `refresh`), and a process that dies in
    // between leaves the mark for the sweep. Without the script's closing line nothing is believed.
    const { rows: sites } = await db.query('select label from site where site_key = $1', [siteKey])
    if (!sites[0]) return end('failed', PUBLISH_CODES.siteGone)
    if (!said.includes(tornDownLine(sites[0].label)))
      return end('failed', PUBLISH_CODES.noResult, said.trim())
    await db.query(
      `update site_publish_op set code = $2, detail = null, updated_at = now()
        where site_key = $1 and ref = $3`,
      [siteKey, PUBLISH_CODES.tornDown, op.ref]
    )
    return null
  }
  if (answer.outcome === 'failed') {
    const output = typeof answer.output === 'string' ? answer.output : null
    if (!CLEANUPS.includes(op.op)) return end('failed', PUBLISH_CODES.jobFailed, output)
    // 🔒 A CLEANUP THAT FAILED IS RECORDED AS HALF DONE, NOT AS NOTHING DONE. `go-live.sh` goes
    // through every domain before it ends non-zero for the ones it could not take out.
    const left = await takeOut(op.op === 'drop-domain' ? carried : [])
    const mine = op.op === 'drop-domain' ? left.filter((domain) => carried.includes(domain)) : left
    return end('failed', mine.length > 0 ? PUBLISH_CODES.domainStillRouted : PUBLISH_CODES.jobFailed, output)
  }
  // 🔒 `done` IS BELIEVED ONLY WITH THE SCRIPT'S CLOSING LINE. `go-live.sh` prints it after every
  // step went through; a job recorded `done` without it (an older script, a wrapper that ate the
  // exit code) proves nothing about mail, noindex or the ingress, and the flag is not raised on it.
  const { rows: sites } = await db.query('select label from site where site_key = $1', [siteKey])
  if (!sites[0]) return end('failed', PUBLISH_CODES.siteGone)
  if (!said.includes(resultLine(op.op, sites[0].label)))
    return end('failed', PUBLISH_CODES.noResult, said.trim())
  let unconfirmed = []
  if (op.op === 'live') {
    const flipped = await db.query(
      `update site set publish = 'published' where site_key = $1 returning site_key`,
      [siteKey]
    )
    if (flipped.rowCount === 0) return end('failed', PUBLISH_CODES.siteGone)
    // 🔒 THE SCRIPT'S LINE SAYS THE ROUTE IS INSTALLED — AND NOTHING MORE (#1037). `go-live.sh`
    // keeps going when one ingress call fails and still exits 0 (the site IS live at its Tracy
    // address), so "the job is done" is not "the rule is in": only a domain with its own
    // `==> ingress:` line is. And a rule in the tunnel is not a domain that opens the site: its DNS
    // may point elsewhere, or nothing may hold a certificate for it. So the line only marks the
    // route as installed and makes the domain due for its probe; `active` — connected — is written
    // by the probe's own proof and by nothing else (`address.js` `confirmOwnDomains`).
    const routed = carried.filter((domain) => said.includes(routedLine(domain)))
    unconfirmed = carried.filter((domain) => !routed.includes(domain))
    if (routed.length > 0)
      await db.query(
        `update site_name set routed_at = now(), probe_next_at = now(), updated_at = now()
          where site_key = $1 and kind = 'custom' and state in ('pending', 'active')
            and probe_secret is not null and name = any($2::text[])`,
        [siteKey, routed]
      )
  } else if (op.op === 'draft') {
    // Back to draft: the host takes out the domains it is given and the ones its last go-live
    // recorded. Each one it says is gone is no longer connected (it stays the site's, to be
    // published again); one it did not say so about may still be answering, and stays as it is.
    unconfirmed = await takeOut([])
  } else {
    // One own domain removed: its row goes only when the host said its rule is out.
    unconfirmed = (await takeOut(carried)).filter((domain) => carried.includes(domain))
  }
  await audit(db, {
    actor: op.actor,
    action: 'site.go-live',
    siteKey,
    detail: { op: op.op, domains: carried, jobId, ...(unconfirmed.length ? { unconfirmed } : {}) }
  })
  if (unconfirmed.length > 0)
    return end('failed', op.op === 'live' ? PUBLISH_CODES.domainNotRouted : PUBLISH_CODES.domainStillRouted)
  return end('done')
}

function bounded(text) {
  return typeof text === 'string' && text !== '' ? text.slice(-DETAIL_MAX) : null
}

/**
 * What a screen is told about a site's publishing: the flag, the operation that is running or that
 * failed last, and what this seat may press. The operation is a publish (`live`), a back-to-draft
 * (`draft`) or one own domain being removed (`drop-domain`). `starting` reads as `running` — to the person it is one
 * thing, the wait — with `confirmed: false` while the host has not said it has the job. `liveSince`
 * is when the publish that made the site live ended.
 * @param {Record<string, any>} site
 * @param {Record<string, any> | null} op - `currentPublishOp`'s row
 * @param {{ mayPublish: boolean }} seat
 */
export function publishView(site, op, { mayPublish }) {
  const waiting = op && (op.state === 'starting' || op.state === 'running')
  const failed = op?.state === 'failed'
  const published = site.publish === 'published'
  return {
    publish: published ? 'published' : 'draft',
    mayPublish,
    // Known only when the last operation is the publish that made it live; a site opened another
    // way (an import) has no such moment on record, and none is made up.
    ...(published && op?.state === 'done' && op.op === 'live'
      ? { liveSince: new Date(op.updated_at).toISOString() }
      : {}),
    operation:
      waiting || failed
        ? {
            op: op.op,
            // The own domains the operation carries; left out when it carries none.
            ...(carriedDomains(op).length > 0 ? { domains: carriedDomains(op) } : {}),
            state: waiting ? 'running' : 'failed',
            // Not confirmed: the host has named no job yet, or what it last said about the job it
            // named is not how the job went. (A delete the host has finished is confirmed: what is
            // left is this side's.)
            ...(waiting
              ? {
                  confirmed:
                    op.state === 'running' && (op.code === null || op.code === PUBLISH_CODES.tornDown)
                }
              : {}),
            jobId: op.job_id ?? null,
            startedAt: new Date(op.started_at).toISOString(),
            ...(failed
              ? {
                  code: op.code ?? PUBLISH_CODES.jobFailed,
                  endedAt: new Date(op.updated_at).toISOString(),
                  // A cleanup that failed after the host took it: pressing again asks for the SAME
                  // operation, which does what is still left.
                  ...(RETAKEN.includes(op.op) && op.job_id ? { retry: true } : {})
                }
              : {})
          }
        : null
  }
}

/**
 * What the door owes a go-live job once it has ended, for the follow-up book
 * (`door-follow-up.js` `WORK`): the flag and the operation, then — outside what may fail the
 * transaction — the operator's signal that a site went live.
 * @param {{ query: Function }} db - the follow-up's transaction client
 * @param {{ site_key: string, job_id: string }} owed
 * @param {{ state: string, output?: unknown, outcome?: 'done' | 'failed' | null }} answer
 * @param {import('pg').Pool} pool
 */
export async function endGoLive(db, owed, answer, pool) {
  // 🔒 THE SWEEP GIVING UP IS NOT AN ENDING. `expired` is the follow-up book saying "a day, and the
  // host never said" — a clock, not the host. The operation goes on holding its site, as it was;
  // the next read of the state asks the host again. Only the book's own row is gone.
  if (answer.state === 'expired') return
  const ended = await settleGoLive(db, { siteKey: owed.site_key, jobId: owed.job_id, answer })
  if (ended?.state !== 'done' || ended.op !== 'live') return
  // A signal that cannot be written must not undo the publish it reports.
  await db.query('savepoint ops_signal')
  try {
    await opsFor(pool).record(
      'site.go_live',
      {
        email: ended.actor,
        accountId: ended.actor_account,
        siteKey: owed.site_key,
        data: { domain: carriedDomains(ended).join(', ') }
      },
      db
    )
    // Also what finds a failure the recorder kept to itself: an aborted transaction refuses this.
    await db.query('release savepoint ops_signal')
  } catch {
    await db.query('rollback to savepoint ops_signal')
  }
}

/**
 * End the operation of job `jobId` on the host's own answer, with nothing owed in the follow-up book
 * (the sweep gave the job up, or already heard a record that was no outcome): `endGoLive` in a
 * transaction of its own. A job that is not the site's running operation any more changes nothing.
 * @param {import('pg').Pool} pool
 * @param {{ siteKey: string, jobId: string, answer: { state: string, output?: unknown, outcome?: 'done' | 'failed' | null } }} input
 */
export async function settleOnAnswer(pool, { siteKey, jobId, answer }) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await endGoLive(client, { site_key: siteKey, job_id: jobId }, answer, pool)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

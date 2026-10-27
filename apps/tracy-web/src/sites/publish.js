// ── The Publish cluster: read the state, flip the state, and go live ─────────────────────────────
//
// Ported from `handlePublish` (`workers/seat-registry/src/index.js:473`), the three branches of it
// this app has any use for: `state-read`, `state` and `go-live`. Not carried: `access/*` and
// `try-on/*` (Cloudflare Access and proposals, neither of which this migration keeps) and
// `proposals-list` (same reason).
//
// 🔒 WHO MAY DECIDE, AND WHY IT IS NOT THE SAME BAR AS THE REST OF THE SITE DOORS. Every other door
// asks only for a live seat. These two WRITES ask for Owner/Admin, and the Worker's own comment
// says why in one line: putting a site on the public internet is the site runner's call, not every
// member's (ADR 0086 §2). Reading the state stays open to any live seat — the screen has to be able
// to draw itself before it can refuse you — and says what that seat may press (`mayPublish`).
//
// 🔒 ONE OPERATION PER SITE, AND THE FLAG ONLY AFTER THE HOST SAID DONE (`069-site-publish-op.sql`,
// `publish-store.js`). The host answers a go-live with a job id at once and runs the job afterwards,
// so "the host took it" is not "the site is open": the door reserves the site, hands the job to the
// follow-up book, and answers 202. The job's ending is heard by whoever asks first — a read of the
// state here, or the follow-up sweep with nobody on the screen.
//
// 🔒 AN OPERATION WITHOUT AN OUTCOME IS ASKED FOR AGAIN ON EVERY READ, NEVER TIMED OUT. Every
// operation has its own name (`ref`), sent to the host as the job key: the host answers the same job
// for the same key and starts nothing beside one that is waiting, running or ended by its script
// (`tracy-host` `goLiveRoute`). So asking is always safe, and every read of the site's publish state
// — `GET /state`, `GET /settings`, a poll of the job, the next press — goes through `refresh`, which
// first hears the job's outcome when the host has one and otherwise hands the SAME key to the host
// again. Whatever the row looks like: `starting` a second ago or a month ago, a job the host shows
// `queued` or `running` (a record can stay that way with nothing running behind it, when the host
// could not write the next one), one a restart orphaned, one that ended on the site's lock, one the
// host no longer has. No clock and no "it looks busy" decides anything. The same asking is
// done in the background for an operation nobody is reading (`sweepHeld`, below).
//
// 🔒 ONLY TWO THINGS END AN OPERATION AND FREE ITS SITE. (1) The job's record carrying its script's
// own exit code (`publish-store.js` `scriptOutcome`). (2) A refusal in the host's own words — a JSON
// body whose `code` is one `goLiveRoute` defines, on the status it defines it for (`HOST_REFUSALS`)
// — that also says the host NEVER TOOK this operation's key (`accepted: false`; the host looks the
// key up before it checks the site's folder or its own configuration). That this side has no job id
// for the operation proves nothing: the host's 202 may simply not have arrived. Any other answer —
// no answer, an HTML page, an empty body, a code this list does not have, a refusal without that
// word, a 403/404 from something in between, "still busy", a host this process cannot sign for —
// leaves the operation unconfirmed and holding.
//
// 🔒 NO DOMAIN IS NAMED THROUGH THIS DOOR. A request that carries `domains` is refused by name
// (`DOMAINS_NOT_SUPPORTED`), whatever the field holds: nothing a caller types here reaches the
// host's ingress. What a publish carries is decided on this side — the site's own domains
// (`address.js`) whose DNS, READ AGAIN for this publish, proves both that the site owns the name and
// that the name points at this host. A domain that is not proven by that reading is not carried, and
// the publish goes ahead at the Tracy address without it.
//
// 🔒 AND NOBODY HAS TO BE LOOKING. `sweepHeld` (run by `cron.js`) does for every operation that is
// not ended what a read of its site does: `refresh`, the same function, under the same key. So an
// operation whose door died after reserving it (`starting`, no job, nothing owed in the follow-up
// book), one whose host lost its record, and one the follow-up book stopped asking about all reach
// their real outcome with the tab closed. The sweep only ever asks; it ends nothing by age.
//
// 🔒 DELETING A SITE IS ONE OF THESE OPERATIONS (`delete`), AND ITS ROW GOES LAST. The delete door
// used to look whether an operation held the site and then tear it down — two steps, so a publish
// could start in between, find the host's lock taken by the teardown or take it first, and the
// row was erased either way: a site left on the host that the book no longer had, nothing to ask
// again from. Now the delete TAKES the site's one row like every other operation (nothing else
// starts once it has), the host runs `teardown.sh` under the operation's key, and the site's row —
// seats, names, everything — stays until that script's own closing line says the site is off the
// host. A teardown that failed is on record as failed, and asking again takes it up where it
// stopped. Closing the book afterwards is `closeDeleted`, handed in by the door that owns the
// pieces (`route.js`), run by whoever looks at the marked operation first: that door, a read of
// the site, or the sweep.
import { json, normalizeSiteKey } from '../lib/http.js'
import { followThrough } from './door-follow-up.js'
import {
  PUBLISH_CODES,
  adoptJob,
  carriedDomains,
  currentPublishOp,
  failPublishOp,
  hostRefusal,
  leaveUnconfirmed,
  maybeRouted,
  publishView,
  reserveUnderNames,
  scriptOutcome,
  settleOnAnswer
} from './publish-store.js'
import { audit, setPublishState, siteByKey, updateJob } from './store.js'

/** How long the door waits for the host to take a go-live. The host answers with a job id before it
 * runs anything, so a host that needs longer is not answering. */
const GO_LIVE_ASK_MS = 20_000
/** How long a read of the state waits for the host to say how a job stands, or to take it again. */
const JOB_ASK_MS = 5_000
/** How long a read of the state waits for an own domain's HTTPS probe before answering without it. */
const PROBE_WAIT_MS = 1_500
/** A job id as `tracy-host` mints them (`jobId()`), and nothing that could be a path. */
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
/** The most own domains one operation carries — the host's own bound (`tracy-host` `goLiveRoute`). */
const GO_LIVE_MAX_DOMAINS = 10
/** The names lock is taken without waiting; whoever holds it for an instant is usually another
 * press on the same site, so it is asked for a few times before it counts as held. */
const LOCK_TRIES = 5
const LOCK_WAIT_MS = 40
/** How many held operations one run of the sweep takes, and how long it keeps the others' hands off
 * them (far longer than a run needs: each host is asked for at most {@link JOB_ASK_MS} twice). */
const SWEEP_BATCH = 20
const SWEEP_HOLD = "interval '2 minutes'"
/** An operation the sweep found no outcome for is looked at again after 15 s, doubling to 10 min. */
const SWEEP_BACKOFF = "least(interval '10 minutes', interval '15 seconds' * power(2, least(sweep_tries, 6)))"

/**
 * The half of publishing that talks to the host, shared by the doors and the background sweep:
 * `deliver` hands an operation to the host under its own key, `refresh` hears what became of it.
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config
 * @param {{ hostCall: Function, hostJob: Function }} deps.host
 * @param {typeof fetch} deps.fetchImpl
 */
export function createPublisher({ pool, config, host, fetchImpl, closeDeleted = null }) {
  /**
   * The host said a deleted site is off it (`PUBLISH_CODES.tornDown` on the held row): let the row
   * go. Failing, or with nobody to do it in this process, the operation simply goes on holding the
   * site with its mark — the next look tries again; nothing is asked of the host for it.
   */
  async function close(site, op) {
    if (typeof closeDeleted !== 'function') return
    try {
      await closeDeleted(site, op)
    } catch (error) {
      console.warn(
        `[publish] ${site.site_key}: the deleted site's row could not be closed`,
        error?.message ?? error
      )
    }
  }

  /**
   * Hand the operation `op` (a held row, as just read) to the host under its own job key, and write
   * what the host said: the job it runs, a refusal that ends it, or nothing that tells (the row goes
   * on holding). Asking twice is safe: the same key names the same job on the host.
   * @returns {Promise<{ running: Record<string, any> } | { lost: true } | { unconfirmed: true }
   *   | { failed: string, status: number }>}
   */
  async function deliver(site, op, timeoutMs) {
    const mine = { siteKey: site.site_key, ref: op.ref }
    let answer
    try {
      answer = await host.hostCall(
        config,
        site.host,
        '/go-live',
        {
          label: site.label,
          // The host's name for taking a whole site off it.
          op: op.op === 'delete' ? 'teardown' : op.op,
          jobKey: `publish:${op.ref}`,
          // The own domains this operation carries. With none, the field is left out: the host adds
          // none and, going back to draft, removes only what its own record of an earlier go-live
          // names.
          ...(carriedDomains(op).length > 0 ? { domains: carriedDomains(op) } : {}),
          // What the carried domains were measured to point at. The host refuses when that is not
          // its tunnel (`ROUTING_TARGET_CHANGED`): the proof was of another one.
          ...(op.op === 'live' && carriedDomains(op).length > 0 && typeof op.target === 'string'
            ? { routingTarget: op.target }
            : {}),
          // The generation of the own-domain routes this run writes or removes (`reserveIn`); it
          // goes with the domains it is about. An ask that names none (a publish at the Tracy
          // address, a teardown) removes only what the site's own record on the host names, by the
          // site's label.
          ...(carriedDomains(op).length > 0 &&
          op.route_gen != null &&
          Number.isSafeInteger(Number(op.route_gen))
            ? { routeGen: Number(op.route_gen) }
            : {}),
          // A cleanup asked for again: the host runs a failed job again only for a higher attempt.
          ...(Number.isInteger(op.attempt) && op.attempt > 0 ? { attempt: op.attempt } : {})
        },
        { fetchImpl, timeoutMs }
      )
    } catch {
      answer = { ok: false, status: 0, body: null }
    }
    const jobId = answer.ok ? answer.body?.jobId : null
    if (typeof jobId === 'string' && JOB_ID.test(jobId)) {
      // The job this row already runs, still kept by the host and with nothing to take back: no
      // write. Anything else — a first job, a job started again, an "unheard" mark to lift — is.
      if (answer.body.reused === true && op.state === 'running' && op.job_id === jobId && op.code === null)
        return { running: op }
      const running = await adoptJob(pool, { ...mine, host: site.host, jobId })
      return running ? { running } : { lost: true }
    }
    // 🔒 A REFUSAL ENDS THE OPERATION ONLY WHEN THE HOST SAYS IT NEVER TOOK THE KEY (`hostRefusal`).
    // The row having no job id is not that: a 202 that never arrived leaves the same row.
    // `failPublishOp` still writes nothing once the row has a job — a second lock, not the proof.
    const refused = op.job_id ? null : hostRefusal(answer)
    if (refused) {
      const failed = await failPublishOp(pool, {
        ...mine,
        code: refused,
        detail: typeof answer.body.why === 'string' ? answer.body.why : null
      })
      if (failed) return { failed: refused, status: answer.status }
      // Not written: the row has a job by now, or is another operation's.
      const row = await currentPublishOp(pool, site.site_key)
      if (row?.ref !== op.ref || (row.state !== 'starting' && row.state !== 'running')) return { lost: true }
      return row.state === 'running' ? { running: row } : { unconfirmed: true }
    }
    await leaveUnconfirmed(pool, {
      ...mine,
      code: op.state === 'running' ? PUBLISH_CODES.silent : PUBLISH_CODES.unreachable
    })
    return { unconfirmed: true }
  }

  /**
   * The site's operation, after asking the host about it. A job the host has ended by its script is
   * followed through here (flag, audit, the operation closed) unless the sweep already did; every
   * other held operation is handed to the host again under the same key — whatever its age, and
   * whatever the host's record of its job reads.
   */
  async function refresh(site) {
    const op = await currentPublishOp(pool, site.site_key)
    if (op?.state !== 'starting' && op?.state !== 'running') return op
    // The host already said this deleted site is off it: only the book is left to close.
    if (op.op === 'delete' && op.code === PUBLISH_CODES.tornDown) {
      await close(site, op)
      return currentPublishOp(pool, site.site_key)
    }
    if (op.job_id) {
      let polled
      try {
        polled = await host.hostJob(config, site.host, op.job_id, { fetchImpl, timeoutMs: JOB_ASK_MS })
      } catch {
        polled = { ok: false, status: 0, body: null }
      }
      const outcome = polled.ok ? scriptOutcome(polled.body) : null
      if (outcome) {
        const state = polled.body.state
        await updateJob(pool, op.job_id, { state, step: polled.body.step, detail: polled.body })
        const answer = { state, output: polled.body.output ?? polled.body.detail, outcome }
        // Through the follow-up book when it still owes this job; straight to the row when it does
        // not (the sweep gave the job up, or heard a record that was no outcome).
        const owed = await followThrough(pool, op.job_id, 'go-live', answer)
        if (!owed) await settleOnAnswer(pool, { siteKey: site.site_key, jobId: op.job_id, answer })
        const heard = await currentPublishOp(pool, site.site_key)
        if (heard?.ref === op.ref && heard.op === 'delete' && heard.code === PUBLISH_CODES.tornDown) {
          await close(site, heard)
          return currentPublishOp(pool, site.site_key)
        }
        return heard
      }
    }
    // 🔒 NO OUTCOME, SO THE HOST IS ASKED FOR THE SAME OPERATION AGAIN — not only when its record is
    // gone or reads as an ending that is none. A record that reads `queued` or `running` is asked
    // for too: the host keeps such a record when it could not write the next one, with nothing
    // running behind it, and only the host can tell that from a job at work (it answers the job it
    // is running, or starts the key again).
    await deliver(site, op, JOB_ASK_MS)
    return currentPublishOp(pool, site.site_key)
  }

  return { deliver, refresh }
}

/**
 * @param {import('hono').Hono} app
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config
 * @param {Function} deps.requireGrant
 * @param {(grant: unknown) => boolean} deps.actingEditor - who may publish: an owner or an editor
 *   (ADR 0028); a viewer reads the state and presses nothing.
 * @param {{ hostCall: Function, hostJob: Function }} deps.host
 * @param {typeof fetch} deps.fetchImpl
 * @param {Record<string, unknown>} deps.plans - the plan book `GET /state` carries.
 * @param {(site: Record<string, any>, op: Record<string, any>) => Promise<unknown>} [deps.closeDeleted]
 *   - lets the row of a site go once the host said the site is off it (`createPublisher`).
 * @param {object} [deps.domains] - the site's own domains (`address.js`): `measure(site)` reads DNS
 *   now for each of them, against the routing target the host names now; `record(db, siteKey,
 *   measured)` writes that reading under the names lock and answers the ones it proves — the only
 *   ones a `live` hands to the host. Left out, a publish carries no domain.
 */
export function mountSitePublish(
  app,
  {
    pool,
    config,
    requireGrant,
    actingEditor,
    host,
    fetchImpl,
    plans,
    domains: ownDomains = null,
    closeDeleted = null
  }
) {
  const { deliver, refresh } = createPublisher({ pool, config, host, fetchImpl, closeDeleted })

  /**
   * The publish part of a snapshot as it stands in `db`, asking the host nothing. A caller that
   * reads other things beside it (the site's address) reads them all on one `db` — one transaction
   * — so no ending is written between the parts.
   */
  async function view(db, site, grant) {
    const op = await currentPublishOp(db, site.site_key)
    const current = (await siteByKey(db, site.site_key)) ?? site
    return publishView(current, op, { mayPublish: actingEditor(grant) })
  }

  /** What the screen is told, read after any ending was written: flag, operation, what the seat may do. */
  async function snapshot(site, grant) {
    await refresh(site)
    // An own domain whose route the host installed is asked whether it opens the site, when its
    // next look is due: what makes it connected (`address.js` `confirmOwnDomains`). Waited for only
    // briefly: a domain that answers does so in a moment and this very read shows it connected; one
    // that does not answer takes seconds, and the screen's read is not held for it — the probe goes
    // on and the next read shows what it found. A probe that cannot be made changes nothing; the
    // background sweep asks again.
    if (ownDomains?.confirm) {
      const probing = Promise.resolve()
        .then(() => ownDomains.confirm(site))
        .catch((error) =>
          console.warn(`[publish] ${site.site_key}: own-domain probe failed`, error?.message ?? error)
        )
      let timer
      await Promise.race([
        probing,
        new Promise((resolve) => {
          timer = setTimeout(resolve, PROBE_WAIT_MS)
          timer.unref?.()
        })
      ])
      clearTimeout(timer)
    }
    return view(pool, site, grant)
  }

  app.get('/api/sites/:key/state', async (c) => {
    c.header('cache-control', 'private, no-store')
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    // Same normalisation the Worker's `readSiteState` applies to a KV row it may never have
    // written: anything that is not the one known value reads as the safe one. A site whose
    // `publish` column is null has never been published, and that is `draft`.
    return json(c, {
      origin: site.origin === 'fleet_born' ? 'fleet_born' : 'fleet_import',
      plan: site.plan in plans ? site.plan : 'standard',
      plans,
      ...(await snapshot(site, auth.grant))
    })
  })

  // 🔒 THIS DOOR DOES NOT MOVE THE PUBLISH FLAG. It used to (`{publish}`), and that was a way round
  // everything `go-live` does: the site opened with mail still closed and noindex still on, or
  // covered again with mail still open, and no operation on record. A body that names `publish` is
  // refused by name, whatever else it carries.
  app.post('/api/sites/:key/state', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    if (!actingEditor(auth.grant)) return json(c, { code: 'NOT_SITE_EDITOR' }, 403)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    if (Object.hasOwn(body, 'publish')) return json(c, { code: 'PUBLISH_BY_GO_LIVE' }, 409)
    // Every key is read before anything is written: a body that carries a field this door does not
    // have is refused whole, the plan beside it included. Writing the part that was understood and
    // answering "fine" would tell the caller the rest was taken too.
    for (const key of Object.keys(body))
      if (key !== 'plan')
        return json(c, { code: 'INVALID_REQUEST', reason: `unknown field: ${key.slice(0, 40)}` }, 400)
    const plan = typeof body.plan === 'string' && Object.hasOwn(plans, body.plan) ? body.plan : undefined
    // No readable field means the caller asked for nothing — and a write door that answers "fine"
    // to a request it did not understand is how a typo becomes a silent no-op.
    if (!plan) return json(c, { code: 'INVALID_REQUEST' }, 400)
    const done = await setPublishState(pool, siteKey, { plan })
    if (!done) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    await audit(pool, { actor: auth.email, action: 'site.state', siteKey, detail: { plan } })
    return json(c, { ok: true, plan })
  })

  /**
   * `POST /api/sites/:key/go-live` `{op: 'live' | 'draft'}` — makes the copy worth the traffic:
   * mail opened, noindex lifted, the site's own PROVEN domains into the host's ingress, and only
   * then the `publish` flag set, which changes the badge the bar draws on the copy (`badge.js`:
   * `draft` → `managed`). Answers 202 with the job the host
   * started; the ending is read from `GET /state`. Going back to draft takes every own domain the
   * host may have a rule for out again.
   *
   * ⚠ NO GATE IS RAISED OR LOWERED HERE. `bar/route.js` serves a draft copy to anyone who knows
   * its hostname (16/09/2026, "NO GATE STANDS HERE"): the flag decides the badge the bar
   * draws on the copy, and nothing about who may open it. What keeps a draft out of sight is the
   * fleet's noindex and the bar's robots answer — a request to crawlers, not a lock.
   *
   * 🔒 THE TWO DIRECTIONS RUN IN OPPOSITE ORDER, AND THAT IS THE WHOLE POINT OF THIS HANDLER.
   *
   *   Going live — FLEET FIRST. `publish: published` is what tells `bar/route.js` to draw the
   *   site as published (the `managed` badge instead of the draft one), and what every screen reads
   *   as Live. Flip it first and
   *   there is a window where the site says it is live while it is still noindexed and still
   *   cannot send mail. So it is flipped when the host's job has ENDED `done` (`settleGoLive`),
   *   never when the host merely took the job.
   *
   *   Going back to draft — FLAG FIRST. The site reads Draft, with its badge, before mail is
   *   closed and noindex turned on, so nothing calls it live for the seconds the fleet takes to
   *   withdraw it.
   *
   * 🔒 AND THE DRAFT DIRECTION NEVER PUTS THE FLAG BACK. If the fleet then refuses, or its job
   * fails, the site is left reading Draft — which is the SAFER of the two wrong states — and the
   * refusal says so (`publishFlipped`) instead of quietly undoing itself into the one that says Live.
   */
  app.post('/api/sites/:key/go-live', async (c) => {
    const siteKey = normalizeSiteKey(c.req.param('key'))
    const auth = await requireGrant(c, siteKey)
    if (auth.error) return auth.error
    if (!actingEditor(auth.grant)) return json(c, { code: 'NOT_SITE_EDITOR' }, 403)
    const site = await siteByKey(pool, siteKey)
    if (!site) return json(c, { code: 'SITE_UNKNOWN' }, 404)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    // Refused on the field being there at all — an empty list and `null` included: a caller that
    // sends it expects a domain to be connected, and nothing here would do that.
    if (Object.hasOwn(body, 'domains')) return json(c, { code: 'DOMAINS_NOT_SUPPORTED' }, 400)
    // Shape BEFORE availability, the Worker's own ordering: a mistyped `op` is wrong whether or
    // not the fleet is alive, and answering `FLEET_UNAVAILABLE` to it sends the caller looking at
    // a server for a mistake sitting in the line they just typed.
    const op = body.op === 'live' || body.op === 'draft' ? body.op : undefined
    if (!op) return json(c, { code: 'INVALID_REQUEST', reason: 'need op: live or draft' }, 400)
    for (const key of Object.keys(body))
      if (key !== 'op')
        return json(c, { code: 'INVALID_REQUEST', reason: `unknown field: ${key.slice(0, 40)}` }, 400)

    // An earlier operation the host has ended, or never confirmed, is settled before this one asks.
    await refresh(site)
    // 🔒 DNS IS READ AGAIN, NOW, FOR EVERY OWN DOMAIN — outside the lock (it is slow); what was read is
    // written, and chosen from, inside it. A record taken away since the last check carries
    // nothing, and a reading that could not be made (no answer, no routing target from the host)
    // proves nothing: that domain is left out and the site is published without it.
    const measured =
      op === 'live' && ownDomains ? await ownDomains.measure(site) : { target: null, readings: [] }
    const taken = await reserve(siteKey, op, auth, async (db) => {
      if (op === 'live') {
        const proven = ownDomains ? await ownDomains.record(db, siteKey, measured) : []
        // The target named to the host: none when the domains point at Cloudflare for SaaS
        // (`address.js` `ownDomainReader`), whose `connect.<zone>` is not the host's tunnel.
        const target = 'hostTarget' in measured ? measured.hostTarget : measured.target
        return { domains: proven.slice(0, GO_LIVE_MAX_DOMAINS), target }
      }
      // A draft takes out every domain the host may have a rule for: none may go on answering.
      return {
        domains: (await maybeRouted(db, siteKey)).map((row) => row.name).slice(0, GO_LIVE_MAX_DOMAINS)
      }
    })
    if (taken.busy === 'gone') return json(c, { code: 'SITE_UNKNOWN' }, 404)
    if (taken.busy === 'names') return json(c, { code: 'ADDRESS_CHANGE_BUSY' }, 409)
    if (taken.busy) return json(c, { code: 'PUBLISH_BUSY', ...(await view(pool, site, auth.grant)) }, 409)
    const reserved = taken.row
    // Going back to draft, the flag came down in the reservation's own transaction.
    const flipped = op === 'draft' ? { publishFlipped: true } : {}

    const outcome = await deliver(site, reserved, GO_LIVE_ASK_MS)
    if ('running' in outcome) {
      // What was just written, not a fresh look at the host: the job was taken this instant.
      const current = (await siteByKey(pool, siteKey)) ?? site
      const seen = publishView(current, outcome.running, { mayPublish: true })
      return json(c, { jobId: outcome.running.job_id, op, state: 'running', ...seen, ...flipped }, 202)
    }
    if ('lost' in outcome) return json(c, { code: 'PUBLISH_BUSY', ...flipped }, 409)
    if ('unconfirmed' in outcome) return json(c, { code: PUBLISH_CODES.unreachable, ...flipped }, 504)
    return json(c, { code: outcome.failed, ...flipped }, outcome.status)
  })

  /**
   * Take the site's row for an operation under its names lock (`reserveUnderNames`), asking for the
   * lock a few times: whoever holds it for an instant is usually another press on this same site.
   */
  async function reserve(siteKey, op, auth, choose) {
    const ask = () =>
      reserveUnderNames(pool, {
        siteKey,
        op,
        actor: auth.email ?? null,
        actorAccount: auth.account?.id ?? null,
        choose
      })
    let taken = await ask()
    for (let tries = 1; taken.busy === 'names' && tries < LOCK_TRIES; tries++) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_MS))
      taken = await ask()
    }
    return taken
  }

  /**
   * Take one own domain of the site out of the host's ingress (`address.js`, the removal door): the
   * same reservation, the same keyed job and the same release rule as a publish, with `op:
   * 'drop-domain'`. `choose(db)` runs under the names lock and answers `{ domains: [name] }` or
   * `{ refusal }`. Asked again after a removal that failed, it is that removal taken back under its
   * own key (`publish-store.js` `RETAKE`).
   * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
   */
  async function dropDomain(site, auth, choose) {
    await refresh(site)
    const taken = await reserve(site.site_key, 'drop-domain', auth, choose)
    if ('refusal' in taken) return taken.refusal
    if (taken.busy === 'gone') return { status: 404, body: { code: 'SITE_UNKNOWN' } }
    if (taken.busy === 'names') return { status: 409, body: { code: 'ADDRESS_CHANGE_BUSY' } }
    if (taken.busy)
      return { status: 409, body: { code: 'PUBLISH_BUSY', ...(await view(pool, site, auth.grant)) } }
    const outcome = await deliver(site, taken.row, GO_LIVE_ASK_MS)
    if ('running' in outcome) {
      const current = (await siteByKey(pool, site.site_key)) ?? site
      const seen = publishView(current, outcome.running, { mayPublish: actingEditor(auth.grant) })
      return {
        status: 202,
        body: { jobId: outcome.running.job_id, op: 'drop-domain', state: 'running', ...seen }
      }
    }
    if ('lost' in outcome) return { status: 409, body: { code: 'PUBLISH_BUSY' } }
    if ('unconfirmed' in outcome) return { status: 504, body: { code: PUBLISH_CODES.unreachable } }
    return { status: outcome.status, body: { code: outcome.failed } }
  }

  /**
   * Take the site for its deletion and hand the teardown to the host (`DELETE /api/sites/:key`).
   * `before(row)` runs once the site is reserved and before the host is asked — what must stop
   * before a stack goes (the agent's turns). Answers what holds the site instead (`busy`), or the
   * reserved row with what the host said to being asked: `running` (it named the job), `failed` (it
   * refused, never having taken the key: the operation ended failed), or neither — no word from
   * the host, the operation holding the site until there is one.
   * @returns {Promise<{ busy: 'gone' | 'names' | 'publish' }
   *   | { row: Record<string, any>, outcome: Awaited<ReturnType<typeof deliver>> }>}
   */
  async function deleteSite(site, auth, before = async () => {}) {
    const taken = await reserve(site.site_key, 'delete', auth, async () => ({ domains: [] }))
    if (taken.busy) return { busy: taken.busy }
    await before(taken.row)
    return { row: taken.row, outcome: await deliver(site, taken.row, GO_LIVE_ASK_MS) }
  }

  return {
    /** The site taken for its deletion, and the teardown handed to the host (`route.js`). */
    deleteSite,
    /** One own domain out of the host's ingress, as an operation (`address.js`). */
    dropDomain,
    /** The site's operation after asking the host about it. */
    refresh,
    /** The publish part of a screen's snapshot (`GET /state`). */
    snapshot,
    /** The same, read on the caller's `db` with nothing asked of the host (`GET /settings`). */
    view
  }
}

/**
 * The background half (`cron.js` `sweepPublishOps`): every operation that is not ended and is due
 * for a look gets what a read of its site gives it — `refresh`, under the operation's own key.
 *
 * 🔒 THE SWEEP ASKS; IT NEVER DECIDES. It ends nothing, frees nothing and drops nothing by age: an
 * operation a month old is asked about exactly like one a minute old, and stays held until the host
 * says what became of it (`publish-store.js` `settleGoLive`, `failPublishOp`). What it bounds is its
 * own work: at most {@link SWEEP_BATCH} operations a run, each host asked with a time limit, and an
 * operation that gave no outcome looked at again after a growing wait that stops at ten minutes.
 *
 * 🔒 REPLICAS SHARE THE WORK THROUGH THE ROWS, ON THE DATABASE'S OWN CLOCK. The due rows are taken
 * in one statement (`for update skip locked`) that pushes their next look out, so a second replica
 * sweeping at the same moment takes other rows or none. Two that did reach the host for one
 * operation would ask under one key and be told one job: asking twice is what the key is for.
 * @param {import('pg').Pool} pool
 * @param {{ refresh: (site: Record<string, any>) => Promise<unknown>, limit?: number,
 *   log?: Pick<Console, 'info' | 'warn'> }} deps
 * @returns {Promise<{ taken: number, ended: number, held: number, failed: number }>}
 */
export async function sweepHeld(pool, { refresh, limit = SWEEP_BATCH, log = console }) {
  const { rows: taken } = await pool.query(
    `with due as (
       select site_key from site_publish_op
        where state in ('starting', 'running') and sweep_at <= now()
        order by sweep_at
        limit $1
        for update skip locked)
     update site_publish_op o set sweep_at = now() + ${SWEEP_HOLD}
       from due where o.site_key = due.site_key
     returning o.site_key, o.ref`,
    [limit]
  )
  let ended = 0
  let held = 0
  let failed = 0
  for (const { site_key: siteKey, ref } of taken) {
    try {
      const site = await siteByKey(pool, siteKey)
      if (site) await refresh(site)
    } catch (error) {
      failed++
      log.warn?.(`[publish-sweep] ${siteKey}: ${error?.message ?? error}`)
    }
    // Still this operation, still not ended: looked at again later. Conditional on the ref, so an
    // operation reserved meanwhile keeps the first look it was given.
    const again = await pool
      .query(
        `update site_publish_op
            set sweep_tries = sweep_tries + 1, sweep_at = now() + ${SWEEP_BACKOFF}
          where site_key = $1 and ref = $2 and state in ('starting', 'running')`,
        [siteKey, ref]
      )
      .catch(() => ({ rowCount: 1 }))
    if (again.rowCount) held++
    else ended++
  }
  if (ended > 0)
    log.info?.(`[publish-sweep] ${ended} operation(s) reached their outcome with nobody on the screen`)
  return { taken: taken.length, ended, held, failed }
}

/**
 * The two periodic jobs this app owns — top-level, not a domain, so it may reach into any of them
 * (same standing as `app.js`/`server.js`; `test/module-graph.test.mjs` exempts every file directly
 * under `src/`).
 *
 * Ported from `workers/cowork-web/src/worker.js`'s `scheduled()` (:321), which calls exactly one
 * thing, `gcGuestVisitors` (:899-960): sign into every configured host's dsh with the seat door's
 * own secret and call `/gateway/seat/sweep`. That is `sweepHosts` below, unchanged in shape
 * (`callSeatDoor`, `Promise.allSettled` so one dead host never cancels the others, log the door
 * NAME on failure and never the key or the body).
 *
 * `sweepExpired` has no Worker equivalent — it sweeps SQL tables this app has that the Worker
 * never did: `otp_code`/`oauth_state` rows past their `expires_at`, and `rate_bucket`, which grows
 * one row per bucket-hour with nothing to ever delete one (flagged in Task 2's own review, and left
 * for whoever built cron — this task).
 *
 * BOTH JOBS RUN UNDER THE SAME ADVISORY LOCK (7_243_002, distinct from `db/index.js`'s migration
 * lock 7_243_001) so that N replicas of this process never all fire the same job in the same tick.
 * `pg_try_advisory_lock` (non-blocking), not `pg_advisory_lock`: a replica that loses the race skips
 * this tick entirely rather than queuing up behind the one that is already running it — the next
 * tick is close enough, and a pile of blocked connections is not.
 */

import * as hostClient from './host/client.js'
import { sweepRealCampaigns } from './invitations/real-retention.js'
import { sweepRealSends } from './invitations/real-send.js'
import { runRealQueues } from './invitations/real-queue.js'
import { hostJob, signedHosts } from './host/client.js'
import {
  advanceInstances,
  RECONCILE_MS,
  reconcilePools,
  runRefills,
  settleDrains
} from './inventory/reconcile.js'
import { readSweep, recordSweepEnd, recordSweepStart } from './inventory/store.js'
import { startBuildAtDoor } from './lib/build-door.js'
import { DELETE_BRIEF_OF_GONE } from './lib/site-brief-row.js'
import { kickReadiness, startReadinessJob } from './lib/customize-readiness.js'
import { kickBlurbTranslations, startBlurbTranslationJob } from './lib/template-blurb-translations.js'
import { kickDsReadiness, startDsReadinessJob } from './lib/design-system-readiness.js'
import { sweepDemos } from './lib/demo-sites.js'
import { settleEndedBuilds } from './opportunities-build/builds.js'
import { readReleases, refreshReleases, releasesToken, resolveInstall } from './lib/quickstart-releases.js'
import { bornSiteAddress } from './lib/site-address.js'
import { releaseAbandonedDomains } from './mail/site-mail/domains.js'
import { resendDomains } from './mail/site-mail/resend-domains.js'
import { dueSeatSyncs, revokeAllGrants, settleSeatSync } from './seats/store.js'
import { importRemover, REMOVE_MARK_STALE_MS } from './sites/import-remove.js'
import { staleWhere } from './sites/turns.js'
import { ABANDONED_IMPORT_MS, importPendingSql } from './lib/import-pending.js'
import {
  confirmOwnDomains,
  ownDomainDns,
  ownDomainProber,
  ownDomainReader,
  releaseLapsed
} from './sites/address.js'
import { createBackupExports } from './sites/backup-export.js'
import { sweepCmsLogs } from './sites/cms-log.js'
import { liveSync } from './sites/live-sync.js'
import { settleFollowUps } from './sites/door-follow-up.js'
import { createPublisher, sweepHeld } from './sites/publish.js'
import { reserveUnderNames } from './sites/publish-store.js'
import { connectTarget, hostnamesFromConfig, reconcileHostnames } from './sites/site-domain-provider.js'
import { hostnameBroker } from './shard/master-link.js'
import { pruneNotifications } from './notifications/store.js'
import { COMPONENT_DOORS, pairComponent } from './sites/pair-component.js'
import {
  claimBuildStart,
  createSite,
  jobAgeMs,
  jobById,
  putJob,
  quietJobs,
  releaseBuildStart,
  setAddress,
  setAttached,
  setPort,
  settleCreationByJob,
  siteByKey,
  stuckProvisions,
  touchJob,
  unstartedBuilds,
  updateJob
} from './sites/store.js'
import { CLEANUP_BATCH, conversationStore } from './widget/store.js'
import { callSeatDoor, mintSeatSession, revokeSeatAtDoor } from './workspace/seat-door.js'

const LOCK_ID = 7_243_002
const OPPORTUNITY_TICK_MS = 5_000
const SITE_CHECKS_TICK_MS = 3_000
const HOURLY_MS = 60 * 60 * 1000
/** The demo retention sweep's first run after boot. develop restarts its web ~34 times a day, so
 * an hourly interval alone never fired there (dev round 19/10); one early pass makes the sweep
 * reach a deployment that never lives a whole hour. */
export const DEMO_RETENTION_FIRST_MS = 2 * 60 * 1000
/** How often the seat-sync outbox is drained. A minute: the window a revoked seat may keep a
 * host's permission row after its host missed the first call, when that host is back. */
const SEAT_SYNC_MS = 60 * 1000
/** How often owed notification emails are retried or released (spec #809). */
const NOTIFICATION_MAIL_MS = 30_000
/** How often expired widget conversations are deleted, and how many batches one pass may delete. */
const WIDGET_SWEEP_MS = 10 * 60 * 1000
const WIDGET_SWEEP_BATCHES = 20

/** How long a build may sit on `provisioning` with nobody polling before the sweep asks the fleet
 * itself. A minute is longer than the gap between a tab's own polls, so a watched build is settled
 * by its watcher and this only picks up the abandoned ones. */
const PROVISION_STALE_MS = 60 * 1000
/**
 * A build still running this long after its job was made is called failed by the sweep (16/10/2026):
 * the host stops a provision at 60 minutes in all, or 15 without a line (`tracy-host` `provision.js`),
 * so a row still `running` past this is one whose host never wrote its end — a restart that lost it, a
 * host on an older image. Left alone it kept the customer's spinner turning for good.
 */
export const PROVISION_GIVE_UP_MS = 75 * 60_000
/** A build whose host has not answered for this long since its job was made is called failed too. */
export const PROVISION_UNREACHABLE_GIVE_UP_MS = 2 * 60 * 60_000
/** How long a job row may go unwritten before the sweep asks its host how the job went. A caller
 * still waiting writes the row each time a poll of it is answered (`runSiteJob`: under a second
 * apart), so a minute of silence almost always means nobody is waiting any more — and when it does
 * not (the caller's polls are failing too), the sweep's write is pinned and cannot go over theirs. */
const JOB_STALE_MS = 60 * 1000
/** What one look at a host's job may take in that sweep: a host that stops answering must not hold
 * the tick for the socket's own minutes. */
const JOB_LOOK_MS = 10_000
/** An ending the host wrote longer ago than this is written down without announcing it to ops: a
 * backlog found days late is not a customer stuck now. */
const OLD_ENDING_MS = 24 * 60 * 60 * 1000
/**
 * How often the quickstart list is re-read from GitHub (ADR 0017).
 *
 * Ten minutes is the wait a person accepts between publishing a release and seeing it on /ops —
 * the webhook makes it instant when it is wired, and this is what keeps the list true when a
 * webhook was missed, which is the case a webhook alone cannot cover.
 */
const RELEASES_MS = 10 * 60 * 1000
/** How often a shard sends its outbox to the master and reports invited accounts (shard beta). */
const SHARD_PUMP_MS = 15_000
/**
 * How often the jobs a door stopped waiting for are looked at (`settleDoorFollowUps`, ledger L31).
 * Each row keeps its own next look (`site_job_follow_up.next_at`, backing off while the host works),
 * so a tick with nothing due is one indexed read. Every 15 s, a turn is closed at most about 15 s
 * after the host ends its moment job.
 */
const FOLLOW_UP_TICK_MS = 15_000
/** The most one call to a host about such a job may take (asking about it, or asking for a busy
 * site's moment again): a host that stops answering does not hold the tick. */
const FOLLOW_UP_ASK_MS = 10_000
/** How often a demo's job is looked at without anyone on the screen — a provision takes ~1 min, so 20 s keeps "public" within a breath of "ready". */
const DEMO_SWEEP_MS = 20_000
const DAILY_HOUR = 3
const DAILY_MINUTE = 17
const RATE_BUCKET_MAX_AGE = "interval '2 days'"

/** Run `fn(client)` holding `LOCK_ID` on ITS OWN connection — advisory locks are session-scoped in
 * Postgres, so this has to be one dedicated client, never a `pool.query` (which may hand out a
 * different connection per call). Returns whether `fn` actually ran. */
async function withLock(pool, fn) {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [LOCK_ID])
    if (!rows[0].got) return false
    try {
      await fn(client)
    } finally {
      await client.query('select pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {})
    }
    return true
  } finally {
    client.release()
  }
}

/**
 * Delete every otp_code / oauth_state row past its own expiry, and every rate_bucket row more
 * than two days old; let every own-domain reservation that lapsed unproven go, with the notice for
 * its site (`sites/address.js` `releaseLapsed` — the reserve door does the same for the one name
 * it is asked, so this sweep is never what decides whether a name is free). Guarded by the advisory
 * lock; returns `{ran: boolean, realSweepError, realKeyErrors}`: `false` means another replica was already mid-sweep and this
 * tick did nothing.
 */
export async function sweepExpired(pool, { invitationsRealKeys = null } = {}) {
  let ran = false,
    realSweepError = null,
    realKeyErrors = []
  await withLock(pool, async (client) => {
    await client.query('delete from otp_code where expires_at < now()')
    await client.query('delete from oauth_state where expires_at < now()')
    await client.query('delete from beta_login_job where expires_at < now()')
    await client.query('delete from beta_access_cache where expires_at < now()')
    // Task 2's own review flagged this: one row per bucket-hour, forever, with nothing sweeping
    // it before this cron existed.
    await client.query(`delete from rate_bucket where window_start < now() - ${RATE_BUCKET_MAX_AGE}`)
    // A turn left open past its limit is marked stale here too; it used to be marked only when the next
    // turn opened on the same site, so a quiet site kept an `open` turn for ever.
    await client
      .query(
        `update site_turn set state = 'stale' where state = 'open' and ${staleWhere("now() - interval '30 minutes'", "now() - interval '2 hours'")}`
      )
      .catch(() => {})
    // The Inbox keeps 90 days (spec #809); older rows are neither listed nor counted already.
    await pruneNotifications(client)
    await releaseLapsed(client)
    // A failing real-campaign sweep must not hide the other sweeps' errors, nor leak campaign data
    // into logs: it is reported by code only.
    if (invitationsRealKeys)
      await sweepRealCampaigns({ pool, keys: invitationsRealKeys, limit: 20 })
        .then((r) => {
          realKeyErrors = r.keyErrors ?? []
        })
        .catch((error) => {
          realSweepError = error?.code?.startsWith?.('REAL_') ? error.code : 'REAL_SWEEP_FAILED'
        })
    ran = true
  })
  return { ran, realSweepError, realKeyErrors }
}

/**
 * Delete widget conversations past their expiry (`widget_conversation`: 24 hours after the last write;
 * a ready native mapping never expires), `CLEANUP_BATCH` at a time through the expiry index and at most
 * `batches` batches a pass, so one pass never holds the table for long: what is left goes next pass.
 * Until 19/10/2026 nothing called `cleanup`, and every visitor's row stayed for good (council
 * 19/10/2026). Returns how many rows were deleted.
 */
export async function sweepWidgetConversations(
  pool,
  config,
  { batches = WIDGET_SWEEP_BATCHES, now = Date.now() } = {}
) {
  const store = conversationStore(pool, config.sessionSecret)
  let deleted = 0
  for (let i = 0; i < batches; i++) {
    const { rowCount } = await store.cleanup(now)
    deleted += rowCount ?? 0
    if (!(rowCount >= CLEANUP_BATCH)) break
  }
  return deleted
}

/** Whether a `settleQuietJobs` run is in progress in this process — the next tick skips rather
 * than ask the same hosts about the same rows a second time while the first is still waiting. */
let settling = false

/**
 * Write down how a job ended when the caller that filed it stopped asking first.
 *
 * 🔒 A JOB ROW IS ONLY AS TRUE AS ITS LAST POLL, AND MOST CALLERS STOP POLLING. `runSiteJob`
 * (`sites/route.js`) writes the host's answer onto the row until its own deadline — 45 s for a
 * moment, 15 s for the seal at a turn's start — and then answers its door; the host's job goes on
 * (behind another webroot job on the same site, say) and ends with nobody listening. Measured
 * 05/10/2026 on the local stand: 192 `webroot-moment` and 32 `webroot-seal-outside` rows still
 * `running`, nearly every one last written 45 s or 15 s after it was filed, the oldest a week old —
 * and the host's own record of every one said `done` or `failed`. A tracy-web restart mid-poll
 * leaves the same behind, and so did an import whose wizard was closed (this sweep began as that
 * one case).
 *
 * So every row nobody has written for `staleMs` is asked about once more, and the host's answer is
 * written as a poll writes it. Nothing here decides an ending: a job the host still runs stays
 * `running`. Every write is pinned to the reading it answers (`updateJob`'s `ifUpdatedAt`), so a
 * caller still polling, or a second replica, that wrote in the meantime keeps its newer write, and
 * an ended row is never moved back — that pin, not a lock, is what makes two runs safe.
 *
 * A row it gets no answer for — a 404 (the host no longer has the job's file) or no reply — says
 * what it said and goes to the back of the queue (`touchJob`), so twenty of them cannot hold the
 * window shut on the rows behind; a host that gives no reply is asked once per run, the rest of its
 * rows only touched. Rows on a host this process can no longer sign for are never listed.
 *
 * It puts the ROW right and nothing more. What the door would have done with the answer had it
 * still been waiting — `closeTurn` and the audit line for `/moment`, recording the outside commits
 * a seal reported (`recordOutside`), taking the `unsealedStart` the door marked off again when the
 * seal proves the turn's start — is the follow-up sweep's (`settleDoorFollowUps` below, ledger L31).
 *
 * The deploy drain does not read these rows (it lists the host's own job files,
 * `deploy-tracy-stack.sh` §3b), so a stale row never held a deploy.
 *
 * @returns {Promise<{ran: boolean, settled: number}>} `ran: false` when a run was already going;
 *   `settled`, how many rows were written down as ended.
 */
export async function settleQuietJobs(
  pool,
  config,
  { fetchImpl = fetch, log = console, staleMs = JOB_STALE_MS } = {}
) {
  if (settling) return { ran: false, settled: 0 }
  settling = true
  try {
    const unreachable = new Set()
    let settled = 0
    for (const row of await quietJobs(pool, staleMs, signedHosts(config))) {
      const polled = unreachable.has(row.host)
        ? null
        : await hostJob(config, row.host, row.id, { fetchImpl, timeoutMs: JOB_LOOK_MS })
      if (!polled?.ok || !polled.body) {
        if (polled?.status === 0) unreachable.add(row.host)
        await touchJob(pool, row.id, row.seen)
        continue
      }
      const { state, step, updatedAt } = polled.body
      const endedLongAgo = Number.isFinite(updatedAt) && Date.now() - updatedAt > OLD_ENDING_MS
      const job = await updateJob(pool, row.id, {
        state,
        step,
        detail: polled.body,
        ifUpdatedAt: row.seen,
        opsSignal: !endedLongAgo
      })
      if (job?.state === 'done' || job?.state === 'failed') settled++
    }
    if (settled > 0) log.info?.(`[cron] settled ${settled} job(s) nobody was waiting for`)
    return { ran: true, settled }
  } finally {
    settling = false
  }
}

/**
 * Do what a door owes a host job it stopped waiting for (`sites/door-follow-up.js`, ledger L31).
 *
 * `POST /moment` and `POST /turn` wait for their webroot job only as long as the dsh calling them
 * waits; the host may take minutes, and goes on. Measured 05/10/2026 on the local stand: turns read
 * `stale` although the host had committed their moment, and no seal that outlived the wait had its
 * outside commits kept. This asks the host about every job still owed and, once it has ended, does
 * the door's work — the audit line and the turn's close, or the seal's outside commits — exactly once,
 * from the host's own answer; a moment that failed only because the site was busy is asked for again
 * (at most twice). Lives here, not in the domain: a domain may not import `host/`
 * (`test/module-graph.test.mjs`).
 * @returns {Promise<{ ran: boolean, settled: number, expired: number }>}
 */
export async function settleDoorFollowUps(
  pool,
  config,
  { fetchImpl = fetch, log = console, now = Date.now } = {}
) {
  return settleFollowUps(pool, {
    pollJob: ({ host, jobId }) => hostJob(config, host, jobId, { fetchImpl, timeoutMs: FOLLOW_UP_ASK_MS }),
    startJob: ({ host, input }) =>
      hostClient.hostCall(config, host, '/site', input, { fetchImpl, timeoutMs: FOLLOW_UP_ASK_MS }),
    now,
    log
  })
}

/**
 * Every publish operation that is not ended (`site_publish_op` in `starting` or `running`) and is
 * due for a look is asked about on its host, under its own key — the same `refresh` a read of the
 * site's state runs (`sites/publish.js` `createPublisher`, `sweepHeld`). What it is for: an
 * operation whose door died after reserving it (no job, nothing owed in the follow-up book), one
 * whose host lost the record, one the customer closed the tab on. It ends nothing by age.
 * Lives here, not in the domain: a domain may not import `host/` (`test/module-graph.test.mjs`).
 * @returns {Promise<{ taken: number, ended: number, held: number, failed: number }>}
 */
export async function sweepPublishOps(
  pool,
  config,
  { fetchImpl = fetch, log = console, limit, closeDeleted = null } = {}
) {
  // `closeDeleted`: lets the row of a deleted site go once its host said the site is off it — the
  // sites router's own function (`app.closeDeletedSite`), so the sweep closes the book exactly as
  // the delete door does. Without it a marked delete stays held until a door looks at it.
  const { refresh } = createPublisher({ pool, config, host: hostClient, fetchImpl, closeDeleted })
  return sweepHeld(pool, { refresh, log, ...(limit === undefined ? {} : { limit }) })
}

/**
 * Own domains whose route the host installed and that are not connected yet: each one that is due
 * is asked, over HTTPS, whether it opens its site, and connected on its own proof
 * (`sites/address.js` `confirmOwnDomains`). What it is for: a customer who set DNS and closed the
 * tab, and a process that restarted between the host's answer and the probe — the due rows are in
 * the database, so whichever replica runs next goes on. It gives nothing up by age.
 * @returns {Promise<{ asked: number, connected: string[] }>}
 */
export async function sweepOwnDomainProbes(
  pool,
  config,
  {
    probe = ownDomainProber(config),
    limit,
    hostnames = hostnamesFromConfig(config, fetch, hostnameBroker(config))
  } = {}
) {
  return confirmOwnDomains(pool, {
    probe,
    ...(limit === undefined ? {} : { limit }),
    // With Cloudflare for SaaS, a name is asked only once its hostname and certificate are active,
    // read from Cloudflare just before (`site-domain-provider.js` `hostnameGate`).
    hostname: hostnames
      ? { refresh: (name) => reconcileHostnames(pool, { hostnames, name, force: true, limit: 1 }) }
      : null
  })
}

/**
 * Every custom hostname at Cloudflare for SaaS brought up to date with what the book says
 * (`sites/site-domain-provider.js` `reconcileHostnames`): one created for each proven reservation,
 * each one not ready read again when due, and each one whose reservation is gone — removed, lapsed,
 * its site deleted — deleted there. A call that fails is tried again later; nothing is given up by
 * age. Nothing to do on a server without Cloudflare for SaaS.
 * @returns {Promise<{ taken: number, ready: string[], deleted: string[] } | null>}
 */
export async function sweepCustomHostnames(
  pool,
  config,
  {
    fetchImpl = fetch,
    log = console,
    hostnames = hostnamesFromConfig(config, fetchImpl, hostnameBroker(config, fetchImpl)),
    limit
  } = {}
) {
  if (!hostnames) return null
  return reconcileHostnames(pool, { hostnames, log, ...(limit === undefined ? {} : { limit }) })
}

/** How often a published site's own domain that is not connected has its DNS read again. */
const START_AGAIN = "case when n.carried_at is null then interval '2 minutes' else interval '10 minutes' end"
/** How long the host is given to take the job (the publish door's own wait). */
const START_ASK_MS = 20_000

/**
 * 🔒 A PUBLISHED SITE CONNECTS ITS OWN DOMAIN BY ITSELF ONCE THE RECORDS ARE RIGHT — nobody presses
 * Check again or Publish on the domain, and nobody has to keep the tab open (#1037, slice 2).
 *
 * Every own domain of a published site that is not routed yet (`pending`, no `routed_at`) is due
 * every two minutes — ten once a publish already carried it and the host did not install its route.
 * Its DNS is read as the publish door reads it (`address.js` `ownDomainReader`), and a domain whose
 * `_tracy` TXT record is found is carried by a `live` operation of its site, through the normal
 * publish path: the host writes its route, the HTTPS probe asks it (`sweepOwnDomainProbes`), and it
 * connects on that proof alone. A draft is never published by this.
 *
 * Only with Cloudflare for SaaS: without it no new own domain is started at all.
 * @returns {Promise<{ sites: number, started: number, held: number, failed: number } | null>}
 */
export async function sweepOwnDomainStarts(
  pool,
  config,
  {
    fetchImpl = fetch,
    log = console,
    limit = 5,
    dns = ownDomainDns(config),
    saas = config.customHostnames
  } = {}
) {
  if (!saas) return null
  const reader = ownDomainReader({
    pool,
    ...dns,
    routingTarget: async () => connectTarget(config),
    saas: true
  })
  const { deliver, refresh } = createPublisher({ pool, config, host: hostClient, fetchImpl })
  const { rows } = await pool.query(
    `with due as (
       select n.name from site_name n join site s on s.site_key = n.site_key
        where n.kind = 'custom' and n.state = 'pending' and n.routed_at is null
          and s.publish = 'published'
          and (n.dns_next_at is null or n.dns_next_at <= clock_timestamp())
        order by n.dns_next_at nulls first, n.name
        limit $1
        for update of n skip locked)
     update site_name n set dns_next_at = clock_timestamp() + ${START_AGAIN}
       from due where n.name = due.name
     returning n.site_key`,
    [limit]
  )
  const counts = { sites: 0, started: 0, held: 0, failed: 0 }
  for (const siteKey of new Set(rows.map((row) => row.site_key))) {
    counts.sites++
    try {
      const site = await siteByKey(pool, siteKey)
      if (!site || site.publish !== 'published') continue
      await refresh(site)
      const measured = await reader.measure(site)
      const taken = await reserveUnderNames(pool, {
        siteKey,
        op: 'live',
        choose: async (db) => {
          // Read again under the names lock: still a published site, and proven by THIS reading.
          const still = await db.query("select 1 from site where site_key = $1 and publish = 'published'", [
            siteKey
          ])
          if (still.rows.length === 0) return { refusal: { status: 200, body: { code: 'NOT_PUBLISHED' } } }
          const proven = await reader.record(db, siteKey, measured)
          if (proven.length === 0) return { refusal: { status: 200, body: { code: 'NOT_PROVEN' } } }
          return { domains: proven, target: measured.hostTarget }
        }
      })
      if ('refusal' in taken) continue
      if (taken.busy) {
        counts.held++
        continue
      }
      const outcome = await deliver(site, taken.row, START_ASK_MS)
      if ('running' in outcome) counts.started++
      else if ('failed' in outcome) {
        counts.failed++
        log.warn(`[cron] ${siteKey}: its host refused to connect its own domain (${outcome.failed})`)
      } else counts.held++
    } catch (error) {
      counts.failed++
      log.error(`[cron] ${siteKey}: connecting its own domain failed`, error?.message ?? error)
    }
  }
  return counts
}

/** How long a site whose old route could not be replaced waits before its host is asked again. */
const LEGACY_ROUTE_RETRY = "interval '10 minutes'"
/** How long the host is given to take the job (the publish door's own wait). */
const LEGACY_ROUTE_ASK_MS = 20_000

/**
 * 🔒 THE ROLLOUT OF #1037 FOR DOMAINS THAT WERE ALREADY CONNECTED — NOBODY HAS TO PRESS ANYTHING.
 * A domain connected before own domains went through tracy-web has, on its host, a rule that leads
 * straight to the site's port: its requests pass no proxy, so a client-sent `x-tracy-*` header
 * reaches the CMS, and it was called connected without ever being asked. Leaving that until each
 * Owner happens to publish again would leave the hole open for as long as they do not.
 *
 * The same reading — `active`, `routed_at` null — is also a name published again whose host never
 * confirmed the route of that attempt (the job failed, or its line was missing): it is being served
 * and reads `pending`, and this sweep takes it up the same way.
 *
 * So every such name (`active`, `routed_at` null) of a published site is taken through the NORMAL
 * publish path, by this sweep, as soon as this version runs: the site's `live` operation is reserved
 * with the name (a new connection attempt, a route generation of its own), handed to the host —
 * whose script replaces the site's own old rule by the route to tracy-web (`go-live.sh`,
 * `--takeover-port`) — and from there it is any publish: the host's line marks the route installed,
 * and the HTTPS probe of the real domain writes what it found. Until then the name reads `pending`
 * on its card (`address.js` `shownConnected`) and goes on being served.
 *
 *   claimed  in one statement that pushes the next try out, so replicas never take one site twice
 *   skipped  a site something else holds (a publish, a removal, a delete): tried again later
 *   retried  every ten minutes for as long as the route is not installed — a host still running the
 *            old script answers with the old rule's line, which is not "installed"
 *
 * No DNS is read for it: the name was proven when it was connected, and what is being fixed is the
 * route on Tracy's own host, not the customer's records.
 * @returns {Promise<{ sites: number, started: number, held: number, failed: number }>}
 */
export async function sweepLegacyOwnDomains(
  pool,
  config,
  { fetchImpl = fetch, log = console, limit = 5 } = {}
) {
  const { deliver, refresh } = createPublisher({ pool, config, host: hostClient, fetchImpl })
  const { rows } = await pool.query(
    `with due as (
       select n.name from site_name n join site s on s.site_key = n.site_key
        where n.kind = 'custom' and n.state = 'active' and n.routed_at is null
          and s.publish = 'published'
          and (n.migrate_next_at is null or n.migrate_next_at <= clock_timestamp())
        order by n.migrate_next_at nulls first, n.name
        limit $1
        for update of n skip locked)
     update site_name n set migrate_next_at = clock_timestamp() + ${LEGACY_ROUTE_RETRY}
       from due where n.name = due.name
     returning n.site_key`,
    [limit]
  )
  const counts = { sites: 0, started: 0, held: 0, failed: 0 }
  for (const siteKey of new Set(rows.map((row) => row.site_key))) {
    counts.sites++
    try {
      const site = await siteByKey(pool, siteKey)
      if (!site) continue
      // An earlier operation the host has ended is settled before this one asks, as at the door.
      await refresh(site)
      const taken = await reserveUnderNames(pool, {
        siteKey,
        op: 'live',
        choose: async (db) => {
          // Read again under the names lock: only what is STILL an old-route name of a published site.
          const found = await db.query(
            `select n.name from site_name n join site s on s.site_key = n.site_key
              where n.site_key = $1 and n.kind = 'custom' and n.state = 'active' and n.routed_at is null
                and s.publish = 'published'
              order by n.name`,
            [siteKey]
          )
          if (found.rows.length === 0) return { refusal: { status: 200, body: { code: 'NOTHING_TO_MOVE' } } }
          return { domains: found.rows.map((row) => row.name), target: null }
        }
      })
      if ('refusal' in taken) continue
      if (taken.busy) {
        counts.held++
        continue
      }
      const outcome = await deliver(site, taken.row, LEGACY_ROUTE_ASK_MS)
      if ('running' in outcome) counts.started++
      else if ('failed' in outcome) {
        counts.failed++
        log.warn(`[cron] ${siteKey}: its host refused to move its own-domain route (${outcome.failed})`)
      } else counts.held++
    } catch (error) {
      counts.failed++
      log.error(`[cron] ${siteKey}: moving its own-domain route failed`, error?.message ?? error)
    }
  }
  return counts
}

/**
 * Customer domains Tracy registered on its shared Resend account for mode `tracy-domain` and nobody
 * verified within `SITE_MAIL_DOMAIN_PENDING_DAYS`: deleted there, the row marked `expired`
 * (`mail/site-mail/domains.js`). Under the lock so two replicas never delete the same domain twice;
 * `resend` is replaceable by a test.
 * @returns {Promise<{ran: boolean, released: string[], verified: string[], failed: string[]}>}
 */
export async function sweepSiteMailDomains(
  pool,
  config,
  { fetchImpl = fetch, log = console, resend = (key) => resendDomains({ key, fetchImpl }) } = {}
) {
  let result = { released: [], verified: [], failed: [] }
  const ran = await withLock(pool, async () => {
    result = await releaseAbandonedDomains(pool, config, { resend, log })
  })
  return { ran, ...result }
}

/** How long a claimed site waits for its press before the name goes back (`014-site-claimed.sql`). */
const CLAIM_MAX_AGE = "interval '24 hours'"

/**
 * A site claimed (`POST /api/sites/claim`) and never built: the name goes back to the pool. The
 * host's folder holds the claim marker alone, so `unreserve` removes it; the site row goes with
 * its seat (cascade); the creation row goes last, so a sweep that dies half-way is resumed by the
 * next one rather than leaving a site with no creation behind it. A folder the host reports as a
 * site (somebody wrote there) keeps its row: it is not a claim any more.
 * @param {import('pg').Pool} pool
 * @param {object} config
 * @param {{fetchImpl?: typeof fetch, log?: Console, hostCall?: typeof import('./host/client.js').hostCall}} [opts]
 * @returns {Promise<{ran: boolean, released: string[]}>}
 */
export async function sweepClaims(pool, config, { fetchImpl = fetch, log = console, hostCall } = {}) {
  const call = hostCall ?? (await import('./host/client.js')).hostCall
  const released = []
  let ran = false
  await withLock(pool, async (client) => {
    ran = true
    const { rows } = await client.query(
      `select c.account_id, c.build_id, s.site_key, s.label, s.host
         from site_creation c join site s on s.site_key = c.site_key
        where c.state = 'claimed' and c.job_id is null and c.updated_at < now() - ${CLAIM_MAX_AGE}`
    )
    for (const row of rows) {
      const answer = await call(config, row.host, '/unreserve', { label: row.label }, { fetchImpl })
      if (!answer.ok) {
        log.warn(
          `[cron] claim ${row.site_key}: the host would not release its folder (${String(answer.status)})`
        )
        continue
      }
      if (answer.body?.removed !== true) {
        log.warn(`[cron] claim ${row.site_key}: kept — ${answer.body?.reason ?? 'the folder is not bare'}`)
        continue
      }
      await client.query(
        `with gone as (delete from site where site_key = $1 returning site_key) ${DELETE_BRIEF_OF_GONE}`,
        [row.site_key]
      )
      await client.query('delete from site_creation where account_id = $1 and build_id = $2', [
        row.account_id,
        row.build_id
      ])
      released.push(row.site_key)
    }
  })
  return { ran, released }
}

/**
 * Unfinished imports nobody touched for `ABANDONED_IMPORT_MS` (6 h 30 min) are removed through the
 * SAME path as the Remove button (`sites/import-remove.js`): there is no second deletion path.
 *
 * "No activity" is the latest of what this server and the host can see:
 * - here, the claim: the row's birth and the last press of the claim door (`import_touched_at`);
 * - on the host, asked by Remove itself (`quietForMs`): the latest change of a run of the site
 *   (`runs.json`) and the latest uploaded part (the upload cursor's `updatedAt`). A host with newer
 *   activity, a read going, or no answer: the import is kept, and the next run asks again.
 *
 * It also finishes a Remove left half-done (`REMOVE_INCOMPLETE`, or one that died): a row whose
 * `removing_at` mark is older than `REMOVE_MARK_STALE_MS`, whatever its age. A fresh mark is a Remove
 * still at work and is left alone.
 *
 * Its own lock, not `withLock`'s: that one is shared by every sweep of the hourly tick, and the one
 * started second in a tick skips.
 * @param {import('pg').Pool} pool
 * @param {object} config
 * @param {{fetchImpl?: typeof fetch, log?: Console, seatDoor?: {mintSeatSession?: Function},
 *   remove?: Function}} [opts] - `remove` replaces the Remove path in a test of the selection only.
 * @returns {Promise<{ran: boolean, removed: string[], kept: {siteKey: string, code: string}[]}>}
 */
export async function sweepAbandonedImports(
  pool,
  config,
  { fetchImpl = fetch, log = console, seatDoor = { mintSeatSession }, remove } = {}
) {
  const removeImport =
    remove ?? importRemover({ pool, config, seats: { revokeAllGrants }, seatDoor, fetchImpl, log })
  const removed = []
  const kept = []
  const client = await pool.connect()
  let ran = false
  try {
    const lockName = 'cron:abandoned-imports'
    const { rows: lock } = await client.query('select pg_try_advisory_lock(hashtextextended($1, 0)) as got', [
      lockName
    ])
    if (!lock[0].got) return { ran, removed, kept }
    ran = true
    try {
      const { rows } = await client.query(
        `select s.site_key, s.removing_at is not null as unfinished_remove,
                (select a.email from seat x join account a on a.id = x.account_id
                  where x.site_key = s.site_key and x.role = 'owner' and x.accepted_at is not null
                    and x.revoked_at is null and x.declined_at is null
                  order by x.granted_at limit 1) as owner_email
           from site s
          where ${importPendingSql('s')}
            and ((s.removing_at is null
                  and greatest(s.created_at, coalesce(s.import_touched_at, s.created_at))
                      < now() - make_interval(secs => $1))
                 or s.removing_at < now() - make_interval(secs => $2))`,
        [ABANDONED_IMPORT_MS / 1000, REMOVE_MARK_STALE_MS / 1000]
      )
      for (const row of rows) {
        if (!row.owner_email) {
          kept.push({ siteKey: row.site_key, code: 'NO_OWNER' })
          continue
        }
        // A stale mark is a Remove somebody already decided on: finished without the quiet window
        // (the host still refuses while a read runs). The mark itself is taken over in Remove's one
        // guarded statement, so of two runners only one goes on, and a fresh mark is never taken.
        const outcome = await removeImport(row.site_key, {
          email: row.owner_email,
          ...(row.unfinished_remove ? {} : { quietForMs: ABANDONED_IMPORT_MS })
        }).catch((error) => {
          log.error(`[cron] abandoned import ${row.site_key}: remove failed`, error)
          return { refused: { code: 'ERROR' } }
        })
        if (outcome.removed) removed.push(row.site_key)
        else {
          kept.push({ siteKey: row.site_key, code: outcome.refused.code })
          log.warn(`[cron] abandoned import ${row.site_key}: kept (${outcome.refused.code})`)
        }
      }
    } finally {
      await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [lockName]).catch(() => {})
    }
  } finally {
    client.release()
  }
  return { ran, removed, kept }
}

/**
 * Call `/gateway/seat/sweep` on every configured host's dsh, `{olderThanDays: 2}` — ported
 * verbatim from `gcGuestVisitors`. Guarded by the SAME advisory lock as `sweepExpired`: the two
 * jobs never need to run at once, and sharing one lock id means one replica running EITHER job
 * is enough to make every other replica skip its own tick of BOTH.
 */
export async function sweepHosts(pool, config, { fetchImpl = fetch, log = console } = {}) {
  let ran = false
  const failed = []
  await withLock(pool, async () => {
    ran = true
    // A demo-only host runs no dsh, so it has no seats to sweep (`config.js`, `readHosts`).
    const doors = [...config.hosts.entries()]
      .filter(([, host]) => host.dshOrigin && host.seatSecret)
      .map(([name, host]) => ({ name, ...host }))
    const results = await Promise.allSettled(
      doors.map((door) =>
        callSeatDoor({
          origin: door.dshOrigin,
          secret: door.seatSecret,
          path: '/gateway/seat/sweep',
          payload: { olderThanDays: 2 },
          fetchImpl
        })
      )
    )
    // The door NAME, never the key or the body — same discipline as the Worker's own comment on
    // this exact line.
    results.forEach((result, index) => {
      const name = doors[index].name
      if (result.status === 'rejected')
        failed.push(`${name} (${String(result.reason?.message ?? result.reason)})`)
      else if (result.value?.ok === false) failed.push(`${name} (HTTP ${result.value.status})`)
    })
    if (failed.length > 0) log.warn(`[cron] host sweep did not reach: ${failed.join(', ')}`)
  })
  return { ran, failed }
}

/**
 * Drain the seat-sync outbox (`010-seat-sync.sql`): every host that missed a revoke or a role
 * change is told again, oldest first, a bounded batch per tick. A row is settled done when its
 * host answers; a host still not answering pushes the row's `next_at` out (30s · 2^attempts, an
 * hour at most) and keeps the reason. Same advisory lock as the sweeps, so N replicas drain it
 * once per tick between them.
 *
 * `seatDoor` is injected the same way `server.js` injects it into `buildApp` — a test never dials
 * a real gateway.
 * @returns {Promise<{ran: boolean, done: number, failed: number}>}
 */
export async function flushSeatSync(
  pool,
  config,
  { seatDoor = { mintSeatSession, revokeSeatAtDoor }, log = console } = {}
) {
  let ran = false
  let done = 0
  let failed = 0
  await withLock(pool, async () => {
    ran = true
    for (const row of await dueSeatSyncs(pool)) {
      const host = config.hosts.get(row.host)
      if (!host?.dshOrigin || !host?.seatSecret) {
        // A host this deployment no longer configures has nothing left to be told.
        await settleSeatSync(pool, row.id, { ok: true })
        done++
        continue
      }
      try {
        let ok
        if (row.kind === 'revoke') {
          ok = (
            await seatDoor.revokeSeatAtDoor({
              origin: host.dshOrigin,
              secret: host.seatSecret,
              email: row.email,
              site: row.site_key
            })
          ).ok
        } else {
          ok =
            typeof (await seatDoor.mintSeatSession({
              origin: host.dshOrigin,
              secret: host.seatSecret,
              grant: row.payload
            })) === 'string'
        }
        await settleSeatSync(pool, row.id, { ok, error: ok ? null : 'refused' })
        if (ok) done++
        else failed++
      } catch (error) {
        await settleSeatSync(pool, row.id, { ok: false, error: String(error?.message ?? error) })
        failed++
      }
    }
    if (failed > 0) log.warn(`[cron] seat sync: ${failed} host call(s) still owed`)
  })
  return { ran, done, failed }
}

/** Milliseconds from `now` until the next `hour:minute`, local (server) time — today if that time
 * hasn't passed yet, tomorrow otherwise. */
function msUntilNext(hour, minute, now = new Date()) {
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

// Fix round 1 (Minor): the advisory lock is the correct guard across REPLICAS — two processes
// racing to run the same tick, tested above. It says nothing about ONE process calling `start()`
// twice without an intervening `stop()` (a future `server.js` lifecycle bug, a hot-reload, a
// double-boot): that would create a SECOND, independent pair of timers in the same process, each
// one separately winning the advisory lock on its own schedule — twice the sweeps, not zero. This
// module-level singleton is the in-process half: a second `start()` while one is already running
// is a no-op that hands back the same handle, rather than a second schedule.
let current = null

/**
 * Finish the half of the handover that needs nobody, for a build no browser polled.
 *
 * 🔒 A BUILD THAT ENDS `done` WITH NO ADDRESS IS A SITE NOBODY CAN OPEN, and it fails without a
 * single error. `site.address` is what `/api/sites` hands back as `copyUrl`, what the side card
 * opens, and what `hasPageToShow` reads to decide a site has a page at all — so a null there is
 * not a missing nicety, it is a site that finished building and then cannot be reached by any
 * door. Measured 21/09 on the local stand: three sites built from design inspirations, the fleet
 * answering `done` with `port` 52001 and 52002, all three rows settled to `done` by this sweep —
 * and all three with `address` and `port` still null, because the only code that ever wrote them
 * sat behind a browser poll that had long since navigated away.
 *
 * ⚠ THE DOOR DOES FIVE THINGS, AND ONLY ONE OF THEM NEEDS A PERSON. When a job ends the poll door
 * writes the port, the address, the lane, the content-door pairing and the GitHub repo, and this
 * sweep used to skip them all on the stated grounds that they "need the viewer's own grant". Four
 * of the five do not, and the code says so plainly: the port is a number the fleet reported; the
 * address is `bornSiteAddress(label, config)` — the SAME function the door calls, which is why it
 * now lives in `lib/site-address.js` rather than being copied a third time; the lane is
 * `hostCall(…, '/attach', {label})`; and `pairComponent` is one signed host call for a token plus
 * one call to the site's own door with it, touching the viewer's email only to stamp `created_by`
 * on an audit row nothing reads back. All four are signed with this deployment's own secret and
 * never see a person. Only the GitHub repo, created against the asking account, stays at the door.
 *
 * 🔒 EACH ONE ALONE BUYS NOTHING, WHICH IS WHY ALL THREE ARE HERE. `/api/sites` reports
 * `agent: copyUrl && site.attached ? '/' : null`, and the left column's `hasPageToShow` refuses a
 * row whose `agent` is null — so an address without a lane is still a site the UI will not open.
 * And a site the customer CAN open is still one the agent cannot change: without the pairing every
 * `tracy_site` content call answers `COMPONENT_NOT_REGISTERED`, whose `next` sends the agent to
 * edit files instead — which on `tracy-business/j6` that site's own `AGENTS.md` forbids in turn
 * (`pair-component.js` has the measurement).
 *
 * `publish: 'draft'` matches the door. The guard is the null address, not the value: a site that
 * already has one has been through the door, and the customer may have published it since —
 * re-stamping `draft` under them would un-publish a live site from a background timer.
 *
 * Never throws, and the two repairs are independent — a fleet that answers `/attach` badly must not
 * cost the site its address. A build whose row ended is a fact that must survive either failing:
 * the door redoes all of this on EVERY poll of a done job and `POST /api/sites/:key/agent` heals
 * the lane on demand, so a miss here is recoverable, while a `site_creation` left at `provisioning`
 * for ever is the exact spinner this sweep exists to end.
 *
 * @param {import('pg').Pool} pool
 * @param {{origin: string, siteDomain: string, hostName: string}} config
 * @param {string} siteKey
 * @param {{port?: unknown}} detail - the fleet's own answer for this job.
 * @param {{fetchImpl?: typeof fetch, log?: {error?: Function}}} deps
 * @returns {Promise<void>}
 */
async function settleHandover(pool, config, siteKey, detail, { fetchImpl, log } = {}) {
  const site = await siteByKey(pool, siteKey).catch((error) => {
    log?.error?.(`[cron] could not read ${siteKey} to finish its handover`, error)
    return null
  })
  if (!site) return
  try {
    if (Number.isInteger(detail?.port) && !site.address) {
      await setPort(pool, siteKey, detail.port)
      await setAddress(pool, siteKey, {
        address: bornSiteAddress(site.label, config),
        publish: 'draft'
      })
    }
  } catch (error) {
    log?.error?.(`[cron] could not write the address for ${siteKey}`, error)
  }
  try {
    if (!site.attached) {
      const attached = await hostClient.hostCall(
        config,
        site.host,
        '/attach',
        { label: site.label },
        { fetchImpl }
      )
      if (attached.ok) await setAttached(pool, siteKey, true)
      else
        log?.error?.(`[cron] ${siteKey} built but its lane refused: ${attached.body?.code ?? 'LANE_FAILED'}`)
    }
  } catch (error) {
    log?.error?.(`[cron] could not start the lane for ${siteKey}`, error)
  }
  try {
    // `createdBy` records who did it, and it was this sweep — not the customer, who was not here.
    const paired = await pairComponent({
      pool,
      config,
      host: hostClient,
      fetchImpl,
      site,
      createdBy: 'cron:provision-sweep'
    })
    if (paired.custody === 'unavailable')
      log?.error?.(`[cron] ${siteKey} built but its content door is not connected: ${paired.custodyDetail}`)
  } catch (error) {
    log?.error?.(`[cron] could not connect the content door for ${siteKey}`, error)
  }
}

/**
 * Settle the builds nobody is watching.
 *
 * A provision is followed by the browser tab that started it: the tab polls
 * `GET /api/sites/:key/jobs/:id`, and that door is what writes the ending down. But the create
 * flow NAVIGATES as soon as the site row exists, a person reloads, a laptop sleeps — and then the
 * fleet finishes or dies with nobody listening. Measured 15/09 on the local stand: provisioning
 * died at its last step at 01:16 and twelve minutes later the row still read `provisioning`, the
 * chat's task list still spinning on "creating".
 *
 * So this asks the fleet directly for every build that has been quiet too long, and writes the
 * same two endings the door writes. It never starts anything and never retries: a failed build is
 * retried by a person pressing Try again, which is a decision, not a sweep's business.
 *
 * @returns {Promise<{ran: boolean, settled: number}>} `ran: false` means another replica held the lock.
 */
export async function settleProvisions(
  pool,
  config,
  { fetchImpl = fetch, log = console, staleMs = PROVISION_STALE_MS } = {}
) {
  let ran = false
  let settled = 0
  await withLock(pool, async () => {
    ran = true
    for (const row of await stuckProvisions(pool, staleMs)) {
      const job = await jobById(pool, row.job_id)
      if (!job) continue
      let state = job.state
      // The fleet's own answer, which carries the port. On a job already written down as ended it
      // is the copy on the row; otherwise it is what this poll just brought back.
      let detail = job.detail ?? {}
      if (state !== 'done' && state !== 'failed') {
        const polled = await hostJob(config, job.host, row.job_id, { fetchImpl })
        // On the database clock that wrote `created_at`, never this process's: a clock minutes
        // ahead would call a healthy build failed (the clock-shift gate, 16/10/2026).
        const age = (await jobAgeMs(pool, row.job_id)) ?? 0
        // A host that cannot be reached is not an answer about the build: leave the row for the
        // next tick rather than calling a site failed because a machine was rebooting — for two hours.
        if (!polled.ok) {
          if (!(age > PROVISION_UNREACHABLE_GIVE_UP_MS)) continue
          detail = {
            ...job.detail,
            state: 'failed',
            reason: 'host-unreachable',
            detail: 'the host did not answer for 2 hours'
          }
          state = 'failed'
          await updateJob(pool, row.job_id, { state, detail })
        } else {
          const body = polled.body ?? {}
          state = body.state
          detail = body
          if (state !== 'done' && state !== 'failed' && age > PROVISION_GIVE_UP_MS) {
            detail = { ...body, state: 'failed', reason: 'timeout', detail: 'still running after 75 minutes' }
            state = 'failed'
          }
          await updateJob(pool, row.job_id, { state, step: body.step, detail })
        }
      }
      if (state !== 'done' && state !== 'failed') continue
      // A build that ended `done` with nothing else written down is a site no door can open, so
      // the sweep finishes what it can: the port, the address and the lane. Only the pairing and
      // the repo are minted out of a viewer's grant — see `settleHandover` for which is which.
      if (state === 'done') await settleHandover(pool, config, row.site_key, detail, { fetchImpl, log })
      if (await settleCreationByJob(pool, row.job_id, state)) settled++
    }
  })
  if (settled > 0) log.info?.(`[cron] settled ${settled} provision(s) nobody was polling`)
  return { ran, settled }
}

/**
 * The platforms whose build this sweep may start with nobody present.
 *
 * 🔒 IT IS A SECURITY BOUNDARY, NOT A LIMITATION TO ROUTE AROUND. A Joomla or WordPress build
 * writes through the Apply door, and every call there ACTS AS A PERSON: the one who typed in the
 * session, or the one who has the lane open (`planFor` in tracy-site-tools — "nobody mints
 * anything, and the seat book still decides"). A sweep has neither. Measured 23/09/2026 on two
 * sites created and then walked away from: the sweep started both builds and both died at their
 * first stage, `check`, with `NO_VIEWER` — "Nobody has this lane open in a browser; the call
 * acts as the person using it." That left a FAILED build carrying a technical sentence the
 * customer would read on their return, which is worse than no build at all.
 *
 * So those two are left for the customer: the page that comes back finds no build and starts one
 * (`BuildForm`'s resume), with the person present, and the door has someone to act as.
 *
 * EmDash writes with the site's own token instead (`tracy_emdash`), so its build runs unattended —
 * measured the same day on the third site: `check`, `personalize` (57 sentences written) and
 * `shot` all done with no browser open.
 */
const UNATTENDED = new Set(['emdash'])

/**
 * Start the builds whose press lost its page.
 *
 * 🔒 THE PRESS LIVES IN A PROMISE, AND NOTHING USED TO OUTLIVE THE PAGE THAT HELD IT. The Build
 * form reports `creating`, polls the provision, and only when that poll says `done` does it call
 * the plugin's `start` door — the one call that carries the customer's answers into the site. A
 * reload, a navigation, a workspace switch, and the promise goes with the page: the to-do list
 * freezes at the last step it managed to report and the build never begins. Nothing errors.
 *
 * Measured 22/09/2026 on three sites built through Design inspiration, one per CMS: all three
 * provisioned and serving, all three still wearing the template's demo content, and
 * `docs/agents/build/` absent on every one.
 *
 * ⚠ THIS IS NOT THE RETRY THE SWEEP ABOVE REFUSES TO DO, and the difference is who decided. A
 * FAILED build was attempted and ended; trying it again is a judgement, and `settleProvisions`
 * says so in its own note. A build that was never started is not a decision anybody made — the
 * customer pressed, the fleet finished, and the work fell on the floor between them. Picking it up
 * is finishing their press, not overruling it.
 *
 * 🔒 AT MOST ONCE, AND THE DATABASE DECIDES. `claimBuildStart` is one statement with
 * `build_started_at is null` in its WHERE, so two replicas on the same tick produce exactly one
 * build; a start that could not be delivered releases the stamp so the next tick may try again.
 * Two builds on one site is worse than none — the stages are not written to meet themselves.
 *
 * @returns {Promise<{ran: boolean, started: number, failed: number}>}
 */
export async function startUnwatchedBuilds(
  pool,
  config,
  { fetchImpl = fetch, log = console, seatDoor = { mintSeatSession } } = {}
) {
  let ran = false
  let started = 0
  let failed = 0
  await withLock(pool, async () => {
    ran = true
    for (const row of await unstartedBuilds(pool)) {
      const site = await siteByKey(pool, row.site_key)
      if (!site) continue
      // A platform whose build writes through the Apply door is left for the customer's return —
      // see `UNATTENDED`. Its row keeps `build_started_at` null, so the page that comes back
      // finds no build and starts one with the customer present.
      if (!UNATTENDED.has(site.platform)) continue
      const host = config.hosts?.get?.(site.host ?? config.defaultHost)
      const { rows: who } = await pool.query('select email from account where id = $1', [row.account_id])
      const email = who[0]?.email
      if (!host || typeof email !== 'string' || email === '') continue
      const key = { accountId: row.account_id, buildId: row.build_id }
      // Stamped BEFORE the call, released after a refusal: the window where a second replica could
      // duplicate the build is the thing being closed, not the window where one is lost.
      if (!(await claimBuildStart(pool, key))) continue
      const out = await startBuildAtDoor({
        host,
        siteKey: row.site_key,
        label: site.label,
        platform: site.platform,
        email,
        sessionId: row.session_id,
        press: row.press ?? {},
        // What the fleet actually answered with. The press could not know it.
        targetUrl: site.address ?? null,
        seatDoor,
        fetchImpl
      })
      if (out.ok) {
        started++
        log.info?.(`[cron] started the build nobody was watching on ${row.site_key}`)
      } else {
        failed++
        await releaseBuildStart(pool, key)
        log.warn?.(`[cron] could not start ${row.site_key}'s build: ${out.reason}`)
      }
    }
  })
  return { ran, started, failed }
}

const CMS_LOG_JOB_WAITS_MS = [150, 250, 400, 600]

/**
 * A `runJob` for callers outside a request (the timer): start the host job, poll it to the end.
 * Same contract as `runSiteJob` in `sites/route.js`, minus its job ledger. Lives here, not in
 * `sites/cms-log.js`: a domain may not import `host/` (`test/module-graph.test.mjs`).
 */
export function hostJobRunner(config, { fetchImpl = fetch, host = hostClient } = {}) {
  return async (site, input, deadlineMs) => {
    const answer = await host.hostCall(
      config,
      site.host,
      '/site',
      { ...input, label: site.label },
      { fetchImpl }
    )
    if (!answer.ok || typeof answer.body?.jobId !== 'string') {
      return { ok: false, reason: answer.body?.code ?? 'FLEET_REFUSED' }
    }
    const begun = Date.now()
    for (let attempt = 0; Date.now() - begun < deadlineMs; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, CMS_LOG_JOB_WAITS_MS[attempt] ?? 800))
      const polled = await host.hostJob(config, site.host, answer.body.jobId, { fetchImpl })
      if (!polled.ok || !polled.body) continue
      if (polled.body.state === 'done') return { ok: true, output: String(polled.body.output ?? '') }
      if (polled.body.state === 'failed') {
        return {
          ok: false,
          reason: String(polled.body.output ?? polled.body.detail ?? 'failed')
            .trim()
            .slice(0, 200)
        }
      }
    }
    return { ok: false, reason: 'timeout' }
  }
}

/** `pg_try_advisory_lock` id of the CMS-log timer — its own, like the warm pool's 7_243_003. */
const CMS_LOG_LOCK_ID = 7_243_004
/** How often the CMS-log timer looks for due sites; each site is pulled at most every 5 minutes. */
const CMS_LOG_TICK_MS = 60 * 1000

/**
 * One tick of the CMS admin-log timer (site changes P2, `sites/cms-log.js`): pull every site
 * someone worked on or looked at in the last half hour, at most every five minutes each.
 *
 * 🔒 ITS OWN LOCK, NOT `LOCK_ID`. A tick may wait on up to twenty host jobs; under the shared lock
 * that would make every replica skip its seat sync and provision sweep for that whole time.
 * @returns {Promise<{ran: boolean, pulled?: number, sites?: number, failed?: number}>}
 */
export async function sweepCmsLogTick(pool, config, { fetchImpl = fetch, log = console, runJob } = {}) {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('select pg_try_advisory_lock($1) as got', [CMS_LOG_LOCK_ID])
    if (!rows[0].got) return { ran: false }
    try {
      const result = await sweepCmsLogs(pool, { runJob: runJob ?? hostJobRunner(config, { fetchImpl }), log })
      return { ran: true, ...result }
    } finally {
      await client.query('select pg_advisory_unlock($1)', [CMS_LOG_LOCK_ID]).catch(() => {})
    }
  } finally {
    client.release()
  }
}

/**
 * One run of the backup-export sweep (`sites/backup-export.js`): objects past their day deleted,
 * exports the host finished while nobody was asking ended, ones it never will failed, and objects
 * of failed exports the store would not delete when they failed deleted now. Hourly:
 * a package outlives its 24 hours by at most that. No advisory lock — every write is conditional on
 * the state it read, so two replicas sweeping at once delete and end each export once.
 * @returns {Promise<{deleted: number, ended: number}>}
 */
export async function sweepBackupExports(pool, config, { fetchImpl = fetch, log = console } = {}) {
  return createBackupExports({ pool, config, host: hostClient, fetchImpl, log }).sweepExpired()
}

/**
 * One run of the Sync from live retention sweep (`sites/live-sync.js` forgetStale): the live site's
 * last read the host keeps — its whole database — deleted for every site that has not synced for
 * FORGET_AFTER_DAYS. Hourly; a row is marked once asked, so each site is asked once.
 * @returns {Promise<number>} how many sites were asked
 */
export async function sweepLiveSyncReads(pool, config, { fetchImpl = fetch } = {}) {
  const none = async () => null
  return liveSync({
    pool,
    config,
    host: hostClient,
    fetchImpl,
    currentComponent: none,
    writeComponent: none
  }).forgetStale()
}

/**
 * Fill in whatever the caller's logger is missing, from `console`.
 *
 * 🔒 THIS EXISTS BECAUSE A MISSING LOG METHOD TURNS A LOGGED ERROR INTO A CRASH, and the crash
 * lands nowhere near the caller that under-declared the logger. The signature says `log = console`,
 * so every method is promised; but a caller may pass a partial object, and a partial object is
 * indistinguishable from a complete one until the first `.error(...)` runs — which only happens on
 * the failure path, i.e. never during a green run. Measured 23/09/2026: a test started the server
 * with `{ log, warn }`, an inventory pass threw ~9 s in, and `TypeError: log.error is not a
 * function` failed a test about onboarding — in a different file, for a reason written nowhere.
 * Every pull request into `develop` could catch it, depending on timing.
 *
 * Falling back to `console` rather than to a no-op is the point: a message nobody declared a sink
 * for still gets printed. Swallowing it would trade a loud crash for a silent loss, which is the
 * worse half of the trade.
 */
function completeLogger(log) {
  const from = log ?? console
  const pick = (name) =>
    typeof from[name] === 'function' ? from[name].bind(from) : console[name].bind(console)
  return { log: pick('log'), info: pick('info'), warn: pick('warn'), error: pick('error') }
}

/**
 * Start both jobs: `sweepExpired` every hour, `sweepHosts` once a day at 03:17 local time.
 *
 * @returns {{stop: () => void}} clears both timers — call on shutdown, or a test process never exits.
 */
export function start(
  pool,
  config,
  {
    fetchImpl = fetch,
    log: given = console,
    seatDoor,
    signal,
    beta,
    notifier,
    invitationsRealKeys = null,
    closeDeletedSite = null,
    designSystemSweep = null,
    // A shard's event pump (`shard/events-outbox.js` via `app.shardPump`); null on the master.
    shardPump = null,
    // The shard beta's master sweeps (`shards/reconcile.js` via `app.shardSweeps`): null on a shard.
    shardSweeps = null,
    // Website Opportunities' research executor (`website-opportunities/src/executor.js` via `app.opportunityTick`).
    opportunityTick = null,
    // The demo QA gate's sweep (`opportunities-build/demo-qa.js` via `app.demoQaTick`).
    demoQaTick = null,
    // Website Opportunities' site checks: lease and run queued rows (`website-opportunities/src/site-checks.js`).
    siteChecksTick = null,
    // Website Opportunities' social stats, the same way (`website-opportunities/src/social-stats.js`).
    socialStatsTick = null,
    socialPrefetchTick = null,
    // Website Opportunities' demo retention sweep, hourly (`opportunities-build/demo-retention.js`).
    demoRetentionTick = null
  } = {}
) {
  const log = completeLogger(given)
  if (current) {
    log.warn('[cron] start() called again while already running in this process — ignored')
    return current
  }

  let opsRunning = null
  const operations = () => {
    if (opsRunning) return
    opsRunning = Promise.all([beta?.drain(), signal?.daily().then(() => signal.flush())])
      .catch(() => log.warn('[cron] operation signal or beta queue unavailable'))
      .finally(() => {
        opsRunning = null
      })
  }
  const opsTimer = setInterval(operations, 1000)
  opsTimer.unref?.()
  operations()
  // Notification emails still owed (spec #809): retries after a failed send, and C2 groups whose
  // five-minute window closed. Every 30 seconds, so a held reply mail is late by at most that.
  const notificationMail = setInterval(() => {
    notifier?.deliverDue().catch((error) => log.warn('[cron] notification mail sweep failed', error))
  }, NOTIFICATION_MAIL_MS)
  notificationMail.unref?.()
  // Invitations real sends: every minute, turn sends a stopped process left mid-call into unknown,
  // check due unknown sends in Gmail (never resends), then let each running send queue send its next
  // email when pacing allows. Off unless test or pilot sending is configured.
  const invitationSends = setInterval(() => {
    if (!['test', 'pilot'].includes(config.invitationsSending?.mode) || !invitationsRealKeys) return
    sweepRealSends({ pool, keys: invitationsRealKeys, config, fetcher: fetchImpl })
      .catch((error) =>
        log.error('[cron] invitations send sweep failed', error?.code ?? error?.name ?? 'error')
      )
      .then(() => runRealQueues({ pool, keys: invitationsRealKeys, config, fetcher: fetchImpl }))
      .then((result) => {
        for (const q of result?.paused ?? [])
          log.error(`[cron] invitations queue ${q.campaignId} paused: ${q.reason}`)
      })
      .catch((error) => log.error('[cron] invitations queue failed', error?.code ?? error?.name ?? 'error'))
  }, 60_000)
  invitationSends.unref?.()
  // The shard beta: a shard silent for three minutes is told to the ops topic (spec §5).
  const shardSilence = setInterval(() => {
    shardSweeps
      ?.silent()
      .catch((error) => log.error('[cron] shard silence sweep failed', error?.code ?? error?.name ?? 'error'))
  }, 60_000)
  shardSilence.unref?.()
  const hourly = setInterval(() => {
    sweepExpired(pool, {
      invitationsRealKeys: config.invitationsReal?.enabled ? invitationsRealKeys : null
    })
      .then(({ realSweepError, realKeyErrors = [] }) => {
        if (realSweepError) log.error('[cron] invitations real-campaign sweep failed', realSweepError)
        // A campaign the sweep cannot open keeps its data past expiry until someone clears the key
        // problem (runbook: SYSTEM.md, Invitations real campaigns). Say so every pass.
        for (const e of realKeyErrors)
          log.error(
            `[cron] invitations campaign ${e.campaignId} key ${e.code}${e.expired ? ', expired data not yet erased' : ''}`
          )
      })
      .catch((error) => log.error('[cron] hourly sweep failed', error))
    sweepClaims(pool, config, { fetchImpl, log }).catch((error) =>
      log.error('[cron] claim sweep failed', error)
    )
    sweepAbandonedImports(pool, config, { fetchImpl, log, ...(seatDoor ? { seatDoor } : {}) }).catch(
      (error) => log.error('[cron] abandoned import sweep failed', error)
    )
    sweepSiteMailDomains(pool, config, { fetchImpl, log }).catch((error) =>
      log.error('[cron] site-mail domain sweep failed', error)
    )
    sweepBackupExports(pool, config, { fetchImpl, log }).catch((error) =>
      log.error('[cron] backup export sweep failed', error)
    )
    sweepLiveSyncReads(pool, config, { fetchImpl }).catch((error) =>
      log.error('[cron] live sync retention sweep failed', error)
    )
    shardSweeps
      ?.reconcile()
      .catch((error) => log.error('[cron] shard DNS reconcile failed', error?.code ?? error?.name ?? 'error'))
  }, HOURLY_MS)
  hourly.unref?.()

  // Each read of the releases is followed by the Customize your site check of every version not
  // checked yet, in the background (`lib/customize-readiness.js`, ADR 0029 §4). The doors that read
  // the releases (Sync GitHub, the release webhook) kick it too, once this switch is on. The Design
  // system check (`lib/design-system-readiness.js`, ADR 0031) follows on its own sweep.
  startReadinessJob()
  startDsReadinessJob()
  // The blurb translations of the public Templates pages (`lib/template-blurb-translations.js`) are
  // written on the master only: a shard reads them inside the master's `GET /api/templates`.
  if (config.deploymentRole !== 'shard') startBlurbTranslationJob()
  const releases = setInterval(() => {
    refreshReleases(pool, config, { fetchImpl, log })
      .then(() => {
        kickReadiness(pool, config, { fetchImpl, log })
        kickDsReadiness(pool, config, { fetchImpl, log })
        kickBlurbTranslations(pool, config, { fetchImpl, log })
      })
      .catch((error) => log.error('[cron] releases refresh failed', error))
  }, RELEASES_MS)
  releases.unref?.()
  // Once at boot too: a process that just started should not serve yesterday's list for ten
  // minutes, and on a fresh database it would serve an empty one.
  refreshReleases(pool, config, { fetchImpl, log })
    .then(() => {
      kickReadiness(pool, config, { fetchImpl, log })
      kickDsReadiness(pool, config, { fetchImpl, log })
      kickBlurbTranslations(pool, config, { fetchImpl, log })
    })
    .catch((error) => log.error('[cron] first releases refresh failed', error))

  const demoLookups = {
    releases: () => readReleases(pool),
    install: (tag) => resolveInstall(pool, tag),
    token: async () => (await releasesToken(config, fetchImpl)).token
  }
  const demos = setInterval(() => {
    sweepDemos(pool, config, { host: hostClient, fetchImpl, log, releases: demoLookups }).catch((error) =>
      log.error('[cron] demo sweep failed', error)
    )
  }, DEMO_SWEEP_MS)
  demos.unref?.()
  let pumping = false
  const shardTimer = shardPump
    ? setInterval(() => {
        if (pumping) return
        pumping = true
        shardPump()
          .catch((error) => log.error('[cron] shard event pump failed', error))
          .finally(() => {
            pumping = false
          })
      }, SHARD_PUMP_MS)
    : null
  shardTimer?.unref?.()

  const cmsLogs = setInterval(() => {
    sweepCmsLogTick(pool, config, { fetchImpl, log }).catch((error) =>
      log.error('[cron] cms log sweep failed', error)
    )
  }, CMS_LOG_TICK_MS)
  cmsLogs.unref?.()

  // Expired widget conversations; a pass still running when the next tick comes is not doubled.
  let sweepingWidget = false
  const widgetConversations = setInterval(() => {
    if (sweepingWidget) return
    sweepingWidget = true
    sweepWidgetConversations(pool, config)
      .catch((error) =>
        log.error('[cron] widget conversation sweep failed', error?.code ?? error?.name ?? 'error')
      )
      .finally(() => {
        sweepingWidget = false
      })
  }, WIDGET_SWEEP_MS)
  widgetConversations.unref?.()

  let sweepingPublish = false
  let sweepingProbes = false
  let sweepingLegacy = false
  let sweepingHostnames = false
  let sweepingStarts = false
  const followUps = setInterval(() => {
    // The rollout of #1037: names connected by the old direct rule are moved without being asked for.
    if (!sweepingLegacy) {
      sweepingLegacy = true
      sweepLegacyOwnDomains(pool, config, { fetchImpl, log })
        .catch((error) => log.error('[cron] own-domain route migration sweep failed', error))
        .finally(() => {
          sweepingLegacy = false
        })
    }
    // Cloudflare for SaaS (#1037, slice 2): hostnames made, read and deleted; a published site's
    // proven domain carried by a publish. Each a run at a time here; the rows keep replicas apart.
    if (!sweepingHostnames) {
      sweepingHostnames = true
      sweepCustomHostnames(pool, config, { fetchImpl, log })
        .catch((error) => log.error('[cron] custom hostname sweep failed', error))
        .finally(() => {
          sweepingHostnames = false
        })
    }
    if (!sweepingStarts) {
      sweepingStarts = true
      sweepOwnDomainStarts(pool, config, { fetchImpl, log })
        .catch((error) => log.error('[cron] own-domain start sweep failed', error))
        .finally(() => {
          sweepingStarts = false
        })
    }
    // Same rule as the publish sweep below: one run at a time here, the rows keep replicas apart.
    if (!sweepingProbes) {
      sweepingProbes = true
      sweepOwnDomainProbes(pool, config, {
        hostnames: hostnamesFromConfig(config, fetchImpl, hostnameBroker(config, fetchImpl))
      })
        .catch((error) => log.error('[cron] own-domain probe sweep failed', error))
        .finally(() => {
          sweepingProbes = false
        })
    }
    settleDoorFollowUps(pool, config, { fetchImpl, log }).catch((error) =>
      log.error('[cron] door follow-up sweep failed', error)
    )
    // One run at a time in this process: a host that answers slowly must not stack runs. Other
    // replicas are kept off the same rows by the rows themselves (`sweepHeld`).
    if (sweepingPublish) return
    sweepingPublish = true
    sweepPublishOps(pool, config, { fetchImpl, log, closeDeleted: closeDeletedSite })
      .catch((error) => log.error('[cron] publish operation sweep failed', error))
      .finally(() => {
        sweepingPublish = false
      })
  }, FOLLOW_UP_TICK_MS)
  followUps.unref?.()

  const sync = setInterval(() => {
    settleQuietJobs(pool, config, { fetchImpl, log }).catch((error) =>
      log.error('[cron] quiet job sweep failed', error)
    )
    flushSeatSync(pool, config, { ...(seatDoor ? { seatDoor } : {}), log }).catch((error) =>
      log.error('[cron] seat sync failed', error)
    )
    // Same tick, same reason: both are outboxes that only move when somebody asks the other side.
    settleProvisions(pool, config, { fetchImpl, log })
      // A Website Opportunities build whose provision ended with no page open says so on its own row (run 1–3, J2).
      .then(() =>
        settleEndedBuilds(pool).catch((error) => log.error('[cron] demo build sweep failed', error))
      )
      .then(() =>
        // After the settle, never before: a row only becomes startable once its provision has been
        // written down as `done`, and the settle is what writes that for a build nobody polled.
        startUnwatchedBuilds(pool, config, { ...(seatDoor ? { seatDoor } : {}), fetchImpl, log })
      )
      .catch((error) => log.error('[cron] provision sweep failed', error))
    // The design system picked in the Add site form, whose worker died with its process (a deploy): finished once,
    // never written twice (`sites/design-system-at-create.js` `sweep`).
    designSystemSweep?.().catch((error) => log.error('[cron] design system sweep failed', error))
  }, SEAT_SYNC_MS)
  sync.unref?.()

  // 🔒 THE WARM POOL RUNS ON ITS OWN TIMER AND ITS OWN LOCK (`inventory/reconcile.js`'s
  // `LOCK_ID = 7_243_003`, not this file's `7_243_002`). Sharing the lock would mean one long
  // refill — a CMS install is a minute or more — makes every replica skip its seat sync and its
  // provision sweep for that whole time, which is exactly the coupling the single lock here was
  // never meant to buy.
  //
  // `sites` and `doors` are handed DOWN rather than imported by the inventory modules:
  // `test/module-graph.test.mjs` refuses a domain that imports another domain, and this file is
  // top-level, so it is allowed to reach into both.
  const inventoryDeps = {
    host: hostClient,
    fetchImpl,
    log,
    sites: { createSite, putJob, siteByKey, setPort, setAddress, bornSiteAddress },
    doors: COMPONENT_DOORS
  }
  // The four passes in order, because each one's input is the one before's output: advance what
  // the host has finished (so `ready` counts are true), FINISH the teardowns somebody started from
  // /ops (so a removed instance stops counting as stock), count the shortfall against both, then
  // drain the intents it wrote.
  //
  // 🔒 `settleDrains` COMES BEFORE THE COUNT, not after. A site already torn down still occupies a
  // `draining` row until this pass retires it, and `stock` counts `draining` — so counting first
  // would hold the pool at its ceiling and refuse to refill the space that was just freed.
  //
  // Each run is stamped at its start and its end (`027-inventory-sweep.sql`), so /ops can say when
  // the timer last ran, what it did, and whether it threw — the only other evidence that it was
  // alive at all used to be instances appearing. A stamp that cannot be written is logged and the
  // run goes on: the record is for people, the refill is for customers.
  const refill = async () => {
    await recordSweepStart(pool).catch((error) => log.error('[cron] could not stamp the refill start', error))
    let error = null
    let outcome = null
    try {
      const advanced = await advanceInstances(pool, config, inventoryDeps)
      const drained = await settleDrains(pool, config, inventoryDeps)
      const counted = await reconcilePools(pool, config, inventoryDeps)
      const refilled = await runRefills(pool, config, inventoryDeps)
      outcome = {
        advanced: advanced.advanced,
        ready: advanced.ready,
        retired: drained.retired,
        enqueued: counted.enqueued,
        started: refilled.started,
        failed: advanced.failed + drained.failed + refilled.failed
      }
    } catch (thrown) {
      error = String(thrown?.message ?? thrown)
      log.error('[cron] inventory refill failed', thrown)
    }
    await recordSweepEnd(pool, { error, outcome }).catch((thrown) =>
      log.error('[cron] could not stamp the refill end', thrown)
    )
  }

  // 🔒 THE PERIOD IS READ AGAIN BEFORE EVERY TICK, which is why this is a chain of timeouts and not
  // a `setInterval`. An operator changes it at /ops and every replica picks it up on its next tick,
  // with no restart. A database that cannot be read falls back to `RECONCILE_MS` rather than
  // stopping the timer: a refill that keeps its old rhythm is better than one that stops.
  //
  // ⚠ THE NEXT TICK IS ARMED BEFORE THIS ONE'S WORK, NOT AFTER IT. `runRefills` may be on the
  // network for as long as a provision takes, and waiting for it would let one slow install hold
  // back every `advanceInstances` behind it — the same rhythm `setInterval` gave, kept on purpose.
  let inventory = null
  let stopped = false
  const tickRefill = async () => {
    if (stopped) return
    const { periodMs } = await readSweep(pool).catch(() => ({ periodMs: RECONCILE_MS }))
    if (stopped) return
    inventory = setTimeout(tickRefill, periodMs)
    inventory.unref?.()
    refill()
  }
  // Once at boot as well: §4 asks for reconciliation at boot AND periodically, because the event
  // that should have driven a refill may have been written by a process that died before draining
  // it. A pool with `enabled = false` — the default — makes this a no-op read, not a cost.
  tickRefill()

  // Website Opportunities' research jobs: claim one every 5 s under its own advisory lock
  // (`EXECUTOR_LOCK_ID`), run in the background under a lease (`website-opportunities/src/executor.js`).
  const opportunities = opportunityTick
    ? setInterval(() => {
        opportunityTick().catch((error) => log.error('[cron] website opportunities tick failed', error))
      }, OPPORTUNITY_TICK_MS)
    : null
  opportunities?.unref?.()

  // Site checks of found restaurants: every 3 s while something is queued, one indexed query when not.
  const siteChecks = siteChecksTick
    ? setInterval(() => {
        siteChecksTick().catch((error) => log.error('[cron] site checks tick failed', error))
      }, SITE_CHECKS_TICK_MS)
    : null
  siteChecks?.unref?.()

  // Social stats of found restaurants: same cadence; a row deferred by a spent budget is not claimed.
  const socialStats = socialStatsTick
    ? setInterval(() => {
        socialStatsTick().catch((error) => log.error('[cron] social stats tick failed', error))
      }, SITE_CHECKS_TICK_MS)
    : null
  socialStats?.unref?.()
  const socialPrefetch = socialPrefetchTick
    ? setInterval(() => {
        socialPrefetchTick().catch((error) => log.error('[cron] Dubai prefetch tick failed', error))
      }, 15000)
    : null
  socialPrefetch?.unref?.()

  // Unused demos freeze, frozen ones past their grace are torn down; replicas share one advisory lock.
  const sweepDemoRetention = () =>
    demoRetentionTick().catch((error) => log.error('[cron] demo retention sweep failed', error))
  const demoRetention = demoRetentionTick ? setInterval(sweepDemoRetention, HOURLY_MS) : null
  demoRetention?.unref?.()
  const demoRetentionFirst = demoRetentionTick
    ? setTimeout(sweepDemoRetention, DEMO_RETENTION_FIRST_MS)
    : null
  demoRetentionFirst?.unref?.()

  // The demo QA gate: a hand-off chat whose turn closed while no hook heard it (another replica, a
  // restart). One run at a time here; replicas are kept off the same build by its lease.
  let sweepingQa = false
  const demoQa = demoQaTick
    ? setInterval(() => {
        if (sweepingQa) return
        sweepingQa = true
        demoQaTick()
          .catch((error) => log.error('[cron] demo QA sweep failed', error))
          .finally(() => {
            sweepingQa = false
          })
      }, FOLLOW_UP_TICK_MS)
    : null
  demoQa?.unref?.()

  let daily = null
  const scheduleDaily = () => {
    daily = setTimeout(
      () => {
        sweepHosts(pool, config, { fetchImpl, log }).catch((error) =>
          log.error('[cron] host sweep failed', error)
        )
        scheduleDaily()
      },
      msUntilNext(DAILY_HOUR, DAILY_MINUTE)
    )
    daily.unref?.()
  }
  scheduleDaily()

  current = {
    stop() {
      clearInterval(opsTimer)
      clearInterval(notificationMail)
      clearInterval(invitationSends)
      clearInterval(shardSilence)
      clearInterval(hourly)
      clearInterval(releases)
      clearInterval(sync)
      clearInterval(cmsLogs)
      clearInterval(widgetConversations)
      clearInterval(followUps)
      clearInterval(demos)
      if (shardTimer) clearInterval(shardTimer)
      if (opportunities) clearInterval(opportunities)
      if (siteChecks) clearInterval(siteChecks)
      if (socialStats) clearInterval(socialStats)
      if (socialPrefetch) clearInterval(socialPrefetch)
      if (demoRetention) clearInterval(demoRetention)
      if (demoRetentionFirst) clearTimeout(demoRetentionFirst)
      if (demoQa) clearInterval(demoQa)
      stopped = true
      clearTimeout(inventory)
      clearTimeout(daily)
      current = null
      return opsRunning ?? Promise.resolve()
    }
  }
  return current
}

/**
 * The site rows that ARE demos (`site.demo`, 016-demo-sites.sql) and the jobs that put them there.
 *
 * Lives in `lib/` because the ops domain reads and writes them and the module graph lets a domain
 * import only `lib/` and `db/`. The SQL is deliberately its own: a demo is claimed by nobody, has
 * no seat, and is re-created on every redeploy — none of which `sites/store.js`'s `createSite`
 * (a customer's claim, `on conflict do nothing`) is for.
 */

import { createHash } from 'node:crypto'
import { addressReachesTracy } from './address-probe.js'
import { bornSiteAddress } from './site-address.js'
import { DELETE_BRIEF_OF_GONE } from './site-brief-row.js'
import { relaySenderFor } from './site-relay-sender.js'

/**
 * The demo site for `siteKey`, written or rewritten: a redeploy moves the row to the new release
 * in place, so the address keeps its history (`created_at`) and its one identity.
 * @returns {Promise<{row: any} | {error: 'LABEL_TAKEN'}>}
 */
export async function upsertDemoSite(
  pool,
  { siteKey, label, host, platform, tag, version, sha256, badge = true }
) {
  const existing = await pool.query('select site_key, demo from site where site_key = $1 or label = $2', [
    siteKey,
    label
  ])
  if (existing.rows.some((r) => !r.demo)) return { error: 'LABEL_TAKEN' }
  const { rows } = await pool.query(
    `insert into site (site_key, label, host, platform, origin, demo, quickstart_tag, quickstart_version, quickstart_sha256, badge)
     values ($1, $2, $3, $4, 'demo', true, $5, $6, $7, $8)
     on conflict (site_key) do update set
       host = excluded.host, platform = excluded.platform, quickstart_tag = excluded.quickstart_tag,
       quickstart_version = excluded.quickstart_version, quickstart_sha256 = excluded.quickstart_sha256,
       badge = excluded.badge,
       publish = 'draft', address = null, port = null
     returning *`,
    [siteKey, label, host, platform, tag, version, sha256, badge]
  )
  return { row: rows[0] }
}

/**
 * Write a job row. `plan` rides only on an update's prefetch: what the press chose (the server,
 * the badge, the version it fetched), read back when the prefetch is done (`advanceDemo`).
 */
export async function recordDemoJob(pool, { id, siteKey, host, kind, by = null, plan = null }) {
  await pool.query(
    `insert into job (id, site_key, host, kind, detail) values ($1, $2, $3, $4, $5::jsonb) on conflict (id) do nothing`,
    [id, siteKey, host, kind, JSON.stringify(plan ? { by, plan } : { by })]
  )
}

/** A log line without its PHP timestamp or the scripts' `!!` marker. */
const bare = (l) => l.replace(/^\[[^\]]*UTC\]\s*/, '').replace(/^!!\s*/, '')
/**
 * The one-line refusal a fleet step writes as `<helper>: <why>`: `emdash/configure-mail.mjs`, and
 * `platform/joomla.sh`'s `!! installer: <message>` for Joomla's CLI installer.
 */
const HELPER_LINE = /^(configure-mail|installer): /
/**
 * A Symfony Console synopsis (`install [--site-name SITE-NAME] …`): what Joomla's CLI installer
 * prints AFTER its error block. It is never a reason, and being the last unindented line it used to
 * be chosen as one (ja-restaurant 1.0.0: the demo read as a usage dump).
 */
const USAGE_LINE = /^[a-z][\w:-]* \[-/

/**
 * The message of a Symfony Console error block — `In <File>.php line <n>:` and then the message,
 * indented — or null. Older hosts print the block with no `!! installer:` line after it.
 */
function consoleError(lines) {
  const at = lines.findLastIndex((l) => /^In \S+ line \d+:$/.test(l))
  if (at === -1) return null
  const words = []
  for (const l of lines.slice(at + 1)) {
    if (l.trim() === '') {
      if (words.length) break
      continue
    }
    if (!/^\s/.test(l)) break
    words.push(l.trim())
  }
  return words.length ? words.join(' ') : null
}

/**
 * The sentence a failed provision actually died on, read off the host's answer — or null.
 *
 * 🔒 WHY THIS EXISTS: the host writes `step: 'provision'` on EVERY failure (`tracy-host`
 * `provision.js`), so a screen that shows only the step says "Failed at provision" for a checksum
 * that no longer matches, a missing minimum Claude Cowork plugin version and a PHP fatal alike. Measured 21/09: ja-teline-v,
 * ja-rights and ja-voyara all read the same four words while their logs named three different
 * causes. The answer carries the last 200 lines of the script (`output`); the cause is the last line
 * that is not the script's own progress: not a `[stage]` timing line, not a `==>` announcement, not
 * an indented continuation or a PHP stack frame. A PHP fatal is preferred when there is one, since
 * the lines after it are its trace; then a fleet step's own `<helper>: <why>` line; then the message
 * of a Symfony Console error block. A command's usage synopsis is never the reason.
 * @param {unknown} detail the host's job answer as `noteDemoJob` stored it
 * @returns {string | null}
 */
export function failureReason(detail) {
  if (!detail || typeof detail !== 'object') return null
  const d = /** @type {Record<string, unknown>} */ (detail)
  // A failure Tracy itself decided after the host said done (`ADDRESS_SHADOWED`): the host's own
  // output ends in success lines, so its message is the reason, not the script's last line.
  const own = /** @type {{message?: unknown} | undefined} */ (d.tracyRefusal)
  if (own && typeof own.message === 'string') return own.message.slice(0, 300)
  const lines = typeof d.output === 'string' ? d.output.split('\n').map((l) => l.trimEnd()) : []
  const said = lines.filter(
    (l) =>
      l !== '' &&
      !/^\s/.test(l) &&
      !l.startsWith('[stage]') &&
      !l.startsWith('==>') &&
      !/^#\d+ /.test(l) &&
      l !== 'Stack trace:' &&
      !USAGE_LINE.test(l)
  )
  const fatal = said.findLast((l) => /PHP (Fatal|Parse) error/.test(l))
  // A fleet helper's own refusal names the cause; the `!! … refusing to mark this site ready` lines
  // the platform file prints after it only say that something failed (#827: on /ops the mail step
  // read "could not configure this site's mail" while the reason sat one line above).
  const helper = said.findLast((l) => HELPER_LINE.test(bare(l)))
  const line = fatal ?? helper ?? consoleError(lines) ?? said.at(-1) ?? null
  if (line) return bare(line).slice(0, 300)
  // A thrown error (the job never reached the script) is kept as `detail`; "see <log>" is a pointer
  // to a file on the host, not a reason.
  return typeof d.detail === 'string' && !d.detail.startsWith('see ') ? d.detail.slice(0, 300) : null
}

/**
 * Every demo site with its latest job, keyed by quickstart tag — what the list draws under
 * "deployed". A demo with no job yet (a row written by hand) still counts as deployed.
 */
export async function demoSitesByTag(pool) {
  const { rows } = await pool.query(
    `select s.site_key, s.label, s.host, s.quickstart_tag, s.quickstart_version, s.publish, s.address,
            j.id as job_id, j.state as job_state, j.step as job_step, j.kind as job_kind,
            j.created_at as job_created_at, j.detail as job_detail
       from site s
       left join lateral (
         select id, state, step, kind, created_at, detail from job where site_key = s.site_key order by created_at desc limit 1
       ) j on true
      where s.demo`
  )
  return new Map(rows.map((r) => [r.quickstart_tag, r]))
}

/**
 * The deploy history of one demo: every job recorded against `siteKey`, newest first, capped at
 * `limit`. Read-only — what the Demos screen shows in the "Deploy history" drawer.
 * @param {{query: Function}} pool
 * @param {string} siteKey
 * @param {number} [limit]
 * @returns {Promise<{jobId: string, kind: string, state: string, step: string | null, reason?: string | null, createdAt: string}[]>}
 */
export async function listDemoJobs(pool, siteKey, limit = 50) {
  const { rows } = await pool.query(
    `select id, kind, state, step, detail, created_at from job
      where site_key = $1 order by created_at desc limit $2`,
    [siteKey, limit]
  )
  return rows.map((r) => ({
    jobId: r.id,
    kind: r.kind,
    state: r.state,
    step: r.step ?? null,
    ...(r.state === 'failed' ? { reason: failureReason(r.detail) } : {}),
    createdAt: r.created_at
  }))
}

/**
 * The latest job recorded against `siteKey` (kind and state only), or null when it has none —
 * what the install door reads to refuse a second job beside one in flight and to know a failed
 * copy is in the way.
 * @returns {Promise<{id: string, kind: string, state: string} | null>}
 */
export async function latestDemoJob(pool, siteKey) {
  // A job the host never took (`UNANSWERED`) and a pointer to the host's real id (`moved`) say
  // nothing about the address: neither is in flight, and neither left a copy to tear down.
  const { rows } = await pool.query(
    `select id, kind, state, step, now() - updated_at > make_interval(secs => $3) as stale from job
      where site_key = $1 and state <> 'moved' and coalesce(detail->>'door', '') <> $2
      order by created_at desc limit 1`,
    [siteKey, UNANSWERED, STALE_ASK_MS / 1000]
  )
  const row = rows[0] ?? null
  // A hand-off this process started and never finished (it restarted mid-ask) must not hold the
  // address busy for ever: past twice the longest ask, it is not in flight. Judged on the
  // database's clock, the one that wrote `updated_at`.
  if (row?.state === 'queued' && row.step === ASKING_STEP && row.stale === true)
    return { ...row, state: 'failed' }
  return row
}

/**
 * The install door's hand-off (12/10/2026): the job row is written under the id the host WILL use
 * before the host is asked, so the door can answer at once while a busy demo host takes its time.
 * `ASKING_STEP` is the step such a row reads until the host answers; `UNANSWERED` marks one the
 * host never took (no answer, or its own 5xx) in `detail.door`.
 */
export const ASKING_STEP = 'asking the demo server'
export const UNANSWERED = 'unanswered'
const STALE_ASK_MS = 2 * 60 * 1000

/**
 * The id tracy-host gives a named job: a COPY of `keyedJobId` in `apps/tracy-host/src/app.js`,
 * restated because neither image can import the other app; `ops-demos.test.mjs` holds the two
 * equal. Knowing it before asking is what lets the install door answer before the host does.
 * @param {string} key
 */
export function keyedJobId(key) {
  return `k${createHash('sha256').update(key).digest('hex').slice(0, 20)}`
}

/** Forget one job row: the door's own placeholder once the host answered under another id. */
export async function deleteDemoJob(pool, id) {
  await pool.query('delete from job where id = $1', [id])
}

/** Job states that mean the host is still working on the address. */
export const IN_FLIGHT_STATES = new Set(['queued', 'running'])

/** How many provisions this address has been asked for — the attempt number in a job key. */
export async function demoAttempts(pool, siteKey) {
  const { rows } = await pool.query(
    // An ask the host never took is not an attempt: its retry reuses the key, so a provision the
    // host did start behind a timed-out answer is answered as that job (`keyedJobId`).
    `select count(*)::int as n from job where site_key = $1 and kind = 'provision'
        and state <> 'moved' and coalesce(detail->>'door', '') <> $2`,
    [siteKey, UNANSWERED]
  )
  return rows[0]?.n ?? 0
}

export async function demoJob(pool, id) {
  const { rows } = await pool.query(
    `select j.id, j.site_key, j.host, j.kind, j.state, j.step, j.detail, s.label, s.publish, s.quickstart_tag, s.demo,
            s.host as site_host
       from job j join site s on s.site_key = j.site_key where j.id = $1`,
    [id]
  )
  return rows[0] ?? null
}

/**
 * Carry the host's answer onto the job row — the poll's memory, so a screen reloaded mid-way reads the same story.
 *
 * 🔒 THE ANSWER REPLACES `detail`, EXCEPT `by` AND `plan`. `by` is the person who pressed (`recordDemoJob`),
 * which the host never knows; replacing it lost the presser at the first poll of a running
 * teardown, and the sweep then provisioned the redeploy under an identity it made up (#827). `plan`
 * is what an update's prefetch carries to its next step, and is lost the same way.
 */
export async function noteDemoJob(pool, id, { state, step, detail } = {}) {
  await pool.query(
    `update job set state = coalesce($2, state), step = coalesce($3, step),
       detail = case when $4::jsonb is null then detail
                     when jsonb_typeof($4::jsonb) = 'object'
                       then $4::jsonb || jsonb_strip_nulls(jsonb_build_object('by', detail->'by', 'plan', detail->'plan'))
                     else $4::jsonb end,
       updated_at = now() where id = $1`,
    [id, state ?? null, step ?? null, detail !== undefined ? JSON.stringify(detail) : null]
  )
}

/**
 * The code and sentence a demo fails with when its public name does not reach this tracy-web: the
 * name is routed elsewhere — measured 15/10/2026, a hand-made DNS record and tunnel rule for
 * business-joomla.tracy.ai outranked the zone's wildcard and every path answered Cloudflare 502,
 * while the reinstall reported the demo live.
 */
export const ADDRESS_SHADOWED = 'ADDRESS_SHADOWED'
const shadowedMessage = (address) =>
  `The public address ${address} does not reach Tracy: the name is routed elsewhere (for example a stale DNS record or tunnel rule that outranks the zone's wildcard). Remove that record, then install again.`

/** How the public name is asked before a demo is marked live; tests shorten the gap. */
export const DEMO_ADDRESS_PROBE = { tries: 3, gapMs: 2000, waitMs: 5000 }

/** The demo answers at its address now: published, port known. Idempotent — the poll may say it twice. */
export async function markDemoLive(pool, siteKey, { address, port }) {
  await pool.query(
    "update site set publish = 'published', address = $2, port = $3 where site_key = $1 and demo",
    [siteKey, address, port]
  )
}

/**
 * The demo row of a tag WHATEVER state it is in — unlike `liveDemoOf`, which answers only the one
 * serving. A demo that failed halfway still has a container on the host and a row on this server,
 * and "remove it" has to reach exactly those; asking for the published one would answer null for
 * the demos most in need of removing.
 * @param {{query: Function}} pool
 * @param {string} tag
 */
export async function demoSiteOf(pool, tag) {
  const { rows } = await pool.query(
    'select site_key, label, host, publish from site where demo and quickstart_tag = $1 order by created_at limit 1',
    [tag]
  )
  return rows[0] ?? null
}

/**
 * Forget a demo: the row goes, and with it the address, the port and the badge — the Demos screen
 * then draws the tag as one nobody has installed, which is the whole point of the press.
 *
 * 🔒 THE JOBS STAY. They are the deploy history of an address, and `listDemoJobs` is read by the
 * drawer that explains what happened to it. Deleting them with the row would erase the record of
 * the very teardown that is removing it, so a removal that went wrong would leave nothing to read.
 * @returns {Promise<boolean>} whether a row was there to remove
 */
export async function removeDemoSite(pool, siteKey) {
  const { rows } = await pool.query(
    `with gone as (delete from site where site_key = $1 and demo returning site_key),
       brief as (${DELETE_BRIEF_OF_GONE})
     select count(*)::int as removed from gone`,
    [siteKey]
  )
  return rows[0].removed > 0
}

/** The live demo of `tag`, if one is up — the thing a redeploy has to take down first. */
export async function liveDemoOf(pool, tag) {
  const { rows } = await pool.query(
    // `port` is here for the capture: a host-networked tracy-host reaches a site on
    // `127.0.0.1:<port>` and cannot resolve its container name. Leaving the column out made the
    // caller send `undefined` and the far side silently fall back to a name that does not resolve.
    // `address`, `platform` and `quickstart_version`: the Add site preview door
    // (`sites/design-system-preview.js`) reads the demo's home page and lays it out at its public address.
    // `quickstart_sha256`: with the version and the port, the preview door's key for one deploy of the demo.
    `select site_key, label, host, port, publish, address, platform, quickstart_version, quickstart_sha256
       from site where demo and quickstart_tag = $1 and publish = 'published'`,
    [tag]
  )
  return rows[0] ?? null
}

/**
 * Every demo that is not live because its latest job failed, by tag: the reason the job died on
 * (`failureReason`), the step it died at, and when. What a card lacking its demo says in place of
 * "No demo on this server to preview", so the page says why there is none (11/10/2026).
 * @returns {Promise<Map<string, { reason: string | null, step: string | null, at: string | null }>>}
 */
export async function failedDemosByTag(pool) {
  const { rows } = await pool.query(
    `select s.quickstart_tag, s.quickstart_version, j.step, j.detail, j.created_at
       from site s
       join lateral (
         select state, step, detail, created_at from job where site_key = s.site_key order by created_at desc limit 1
       ) j on true
      where s.demo and j.state = 'failed' and s.publish is distinct from 'published'`
  )
  return new Map(
    rows.map((r) => [
      r.quickstart_tag,
      {
        reason: failureReason(r.detail),
        step: r.step ?? null,
        // The version the failed attempt installed (`site.quickstart_version` is set at the start of
        // every attempt): the road says "failed on 1.0.0" while the release is 1.0.2.
        version: r.quickstart_version ?? null,
        at: r.created_at ? new Date(r.created_at).toISOString() : null
      }
    ])
  )
}

/** Every demo answering at its address right now, by tag: what a template card shows as its preview. */
export async function liveDemosByTag(pool) {
  const { rows } = await pool.query(
    // `platform`: the preview door dresses only a demo that records it (`lib/preview-demo.js`, DEMO-1)
    "select quickstart_tag, address, quickstart_version, platform from site where demo and publish = 'published' and address is not null"
  )
  return new Map(
    rows.map((r) => [
      r.quickstart_tag,
      { url: r.address, version: r.quickstart_version, platform: r.platform ?? null }
    ])
  )
}

/** The address a demo label answers at — the site zone, one level down, https like the fleet. */
/**
 * Where a demo answers: the label under its TARGET's zone.
 *
 * 🔒 THE ZONE COMES FROM THE TARGET, NOT FROM `config.siteDomain`. That was the line that made two
 * domains impossible: a single global suffix meant every demo address this process could utter
 * belonged to one machine, however many hosts were configured. `demo.joomlart.com` is not a Tracy
 * zone and never will be.
 *
 * A target is accepted in place of a config for the same reason a caller may still pass the config:
 * every existing caller means the Tracy target, and a deployment with one demo host must keep
 * behaving exactly as it did.
 *
 * @param {string} label
 * @param {{zone: string, scheme?: string, port?: string} | {origin: string, siteDomain: string}} where a demo
 *   target, or the config (read as Tracy's own zone, at `config.origin`'s scheme and port).
 */
export function demoAddress(label, where) {
  // 🔒 A BARE CONFIG IS THIS DEPLOYMENT, SO ITS ADDRESS IS THE ONE EVERY OTHER SITE GETS. It was
  // `https://<label>.<siteDomain>/` by literal: right on a server, and on a local stand
  // (`http://…:51710`) the go-live probe asked an address nothing answers and failed every demo
  // `ADDRESS_SHADOWED` (21/10/2026).
  if (!('zone' in where)) return bornSiteAddress(label, where)
  // A target states the scheme and port its own environment answers on; one that states neither
  // is somebody's public server, https on 443.
  const scheme = 'scheme' in where && where.scheme ? where.scheme : 'https'
  const port = 'port' in where && where.port ? where.port : ''
  return `${scheme}://${label}.${where.zone}${port}/`
}

/**
 * Ask a demo host for a fresh copy of `release` under `label`; the job id is the handle.
 * `releasesToken` is minted per provision by the caller (a private repo, downloaded by asset id).
 * `hostName` is the host the demo's row names — the default demo host only when nobody chose.
 */
export async function provisionDemo({
  pool,
  config,
  host,
  fetchImpl,
  siteKey,
  label,
  release,
  install,
  email,
  releasesToken,
  jobKey,
  hostName = config.demoHost,
  timeoutMs
}) {
  // A caller with a stable name for this attempt (a redeploy, keyed off its teardown job) passes
  // `jobKey` and it is used verbatim, so every concurrent poll that reaches this door sends the
  // SAME key and tracy-host's `keyedJobId` collapses them into one provision. The direct-install
  // path has no such name and falls back to the attempt number.
  const key = jobKey ?? `demo:${label}:${install.version}:${(await demoAttempts(pool, siteKey)) + 1}`
  const mailSender = relaySenderFor(label, config.siteMail)
  const instruction = {
    site: siteKey,
    siteKey,
    liveSite: demoAddress(label, config),
    label,
    platform: release.platform,
    // A demo is shown inside the Design inspiration preview iframe, which lives at this
    // deployment's own origin (cowork.tracy.site on dev, cowork.tracy.ai on prod). The EmDash
    // template's middleware turns this into a `frame-ancestors` CSP so that framing is allowed.
    // This road is DEMO-ONLY, so it is the only place `frameAncestors` is set: a customer provision
    // never carries it, and a customer site stays unframeable — a frameable site is a clickjacking
    // surface, never something a customer's site may become.
    frameAncestors: config.origin,
    fresh: true,
    quickstart: release.tag,
    quickstartEntry: install,
    // As released: no design plan, no contract — the same path a template press takes, said
    // outright because a demo's release need not carry a card (Tracy Base does not).
    workflow: 'template',
    // A demo install waits for one of the host's install slots (`apps/tracy-host/src/install-slots.js`);
    // a customer's provision never sends this and never waits behind a demo.
    demo: true,
    // 🔒 A SEALED CARD NEEDS ITS FLOOR AS A FLAG, NOT ONLY IN THE ENTRY. `resolveInstall` writes
    // `contract` + `coworkMinVersion` into `quickstartEntry`, and `platform/joomla.sh` then binds the
    // card — but it reads the floor from `--cowork-min-version` alone and refuses a sealed card without
    // one. The customer road threads it (`sites/route.js`); this one did not, so from 20/09 every
    // sealed demo (ja-voyara 1.0.2, tracy-business) died with "no --cowork-min-version was passed" on
    // every Install and Redeploy, and the screen said only "Failed at provision".
    ...(install?.coworkMinVersion ? { coworkMinVersion: install.coworkMinVersion } : {}),
    ...(email ? { ownerEmail: email } : {}),
    // The site's own relay address, the sender its mail step uses when no owner is named (a redeploy
    // the sweep drives for a presser nobody recorded). `emdash.sh` prefers `ownerEmail` when there is one.
    ...(mailSender ? { mailSender } : {}),
    ...(releasesToken ? { releasesToken } : {}),
    // The label, not the tag: a tag carries `/`, which the host's job-key shape refuses.
    jobKey: key
  }
  // `timeoutMs` bounds the wait for the host to TAKE the job (the install door's, 12/10/2026);
  // absent, the call waits as it always did.
  const answer = await host.hostCall(config, hostName, '/provision', instruction, { fetchImpl, timeoutMs })
  if (!answer.ok || typeof answer.body?.jobId !== 'string')
    return { error: true, status: answer.status, body: answer.body, timedOut: answer.timedOut === true }
  await recordDemoJob(pool, {
    id: answer.body.jobId,
    siteKey,
    host: hostName,
    kind: 'provision',
    by: email
  })
  return { jobId: answer.body.jobId }
}

const viewOf = (j, extra = {}) => ({
  jobId: j.id,
  kind: j.kind,
  state: j.state,
  step: j.step ?? null,
  ...(j.state === 'failed' ? { reason: failureReason(j.detail) } : {}),
  // While an update is still fetching, the old copy serves but the press has not settled: a screen
  // that read `live` here would stop following the job before it ever reached the teardown.
  live: j.publish === 'published' && !(j.kind === 'prefetch' && IN_FLIGHT_STATES.has(j.state)),
  ...extra
})

/**
 * One step of a demo's life, driven by what the host says about `job`: a teardown that is done asks
 * for the new copy; a provision that is done is made public (ingress + DNS for the demo's own
 * hostname when it lives on another host, then `go-live` so noindex comes off). Every step is written down before it is answered,
 * so a reload mid-way reads the same story and a done provision is published once even if asked twice.
 *
 * Called by the poll door AND by the cron sweep — a demo goes public whether or not a browser is
 * still open on the screen (measured 16/09: the first one waited for a poll that never came).
 * @param {object} input
 * @param {{releases: () => Promise<any[]>, install: (tag: string) => Promise<any>, token: () => Promise<string | null>}} input.releases lookups the caller wires (kept out of this file's imports)
 */
export async function advanceDemo({
  pool,
  config,
  host,
  fetchImpl,
  job,
  email,
  releases,
  addressProbe = DEMO_ADDRESS_PROBE
}) {
  // An ask the host never took has nothing on the host to follow: its row is the whole story.
  if (!host || job.detail?.door === UNANSWERED) return viewOf(job)
  // A job Tracy failed itself after the host said done: asking the host again would read `done`
  // back over the failure. A new install press starts a new job.
  if (job.state === 'failed' && job.detail?.tracyRefusal) return viewOf(job)
  const answer = await host.hostJob(config, job.host, job.id, { fetchImpl })
  if (!answer.ok) return viewOf(job, { hostStatus: answer.status })
  const hostState = typeof answer.body?.state === 'string' ? answer.body.state : job.state
  const hostStep = typeof answer.body?.step === 'string' ? answer.body.step : job.step
  if (hostState !== job.state || hostStep !== job.step)
    await noteDemoJob(pool, job.id, { state: hostState, step: hostStep, detail: answer.body })
  const current = { ...job, state: hostState, step: hostStep, detail: answer.body }

  // ⚠ A REMOVAL IS A TEARDOWN THAT ASKS FOR NOTHING BACK, AND THE DIFFERENCE LIVES IN `kind`, NOT
  // IN `detail`. The obvious shape — a `final: true` beside `by` — does not survive: every poll
  // writes the host's own answer over `detail` (`noteDemoJob` above, which keeps only `by`), so the flag would be gone by
  // the first advance and a removal would quietly redeploy the demo it was sent to remove.
  if (hostState === 'done' && job.kind === 'remove') {
    await removeDemoSite(pool, job.site_key)
    // Said once, by the poll that did it. The polls after this one answer JOB_UNKNOWN, because the
    // row this job is read through is precisely what was removed — which is the right answer to
    // "how is the demo doing" when there is no demo.
    return viewOf(current, { removed: true })
  }

  // An update's new release is fetched and verified: only now does the old copy come down
  // (`demo-update.js`). Imported here, not at the top, because that file builds on this one.
  if (hostState === 'done' && job.kind === 'prefetch') {
    const { replaceAfterPrefetch } = await import('./demo-update.js')
    // `current.detail` is the host's answer; the presser and the plan live on the row's own detail.
    const detail = { ...(current.detail ?? {}), by: job.detail?.by ?? null, plan: job.detail?.plan ?? null }
    return await replaceAfterPrefetch({
      pool,
      config,
      host,
      fetchImpl,
      job: { ...current, detail },
      releases,
      viewOf
    })
  }

  if (hostState === 'done' && job.kind === 'teardown') {
    const release = (await releases.releases()).find((r) => r.tag === job.quickstart_tag && r.choosable)
    const install = release ? await releases.install(release.tag) : null
    if (!release || !install) return viewOf(current, { error: 'UNKNOWN_QUICKSTART' })
    const started = await provisionDemo({
      pool,
      config,
      host,
      fetchImpl,
      siteKey: job.site_key,
      label: job.label,
      release,
      install,
      email,
      releasesToken: await releases.token(),
      // Stable across every concurrent advanceDemo of THIS teardown: derived from the teardown job,
      // not from a check-then-act attempt count. The poll door and the cron sweep both drive this
      // step, and several polls can land at once — each computing its own attempt number would mint
      // a different jobKey and tracy-host would start a separate provision.sh, several racing over
      // one build directory. One key, one provision (`keyedJobId`, apps/tracy-host/src/app.js).
      jobKey: `demo:${job.label}:redeploy:${job.id}`,
      // The row's host, not the teardown's: a demo moving to another server is torn down where it
      // WAS (`job.host`) and built where it is GOING, which the install door already wrote onto the
      // row. Reading `job.host` here would put the new copy straight back on the old machine.
      hostName: job.site_host ?? config.demoHost
    })
    if (started.error) return viewOf(current, { error: 'HOST_REFUSED', hostStatus: started.status })
    return viewOf(await demoJob(pool, started.jobId))
  }

  if (hostState === 'done' && job.kind === 'provision' && job.publish !== 'published') {
    const port = Number(answer.body?.port)
    // A demo on THIS process's own host is left to the zone's wildcard, which already lands here:
    // `bar/route.js` then proxies it and stamps the "Create with Tracy" pill (16/09). An
    // ingress rule of its own would sit in front of the wildcard and hand the tunnel straight to the
    // container, where no pill can be inserted. A demo on ANOTHER host keeps its own rule: this
    // process has no road to a second host's container yet (`sites/resolver.js`'s remote branch).
    if (job.host !== config.hostName) {
      const hostname = `${job.label}.${config.siteDomain}`
      const opened = await host.hostCall(
        config,
        job.host,
        '/address',
        { label: job.label, hostname, port, dns: true },
        { fetchImpl }
      )
      if (!opened.ok && opened.status !== 501)
        return viewOf(current, { error: 'ADDRESS_FAILED', hostStatus: opened.status })
    }
    const golive = await host.hostCall(
      config,
      job.host,
      '/go-live',
      { label: job.label, op: 'live', domains: [] },
      { fetchImpl }
    )
    // ⚠ 501 IS NOT A FAILURE, IT IS AN ABSENCE. `apps/tracy-host` answers `NOT_CONFIGURED` on the
    // address and go-live doors when `CLOUDFLARE_*` is unset — on purpose, and its own config.js
    // says so: a local box gets a named 501 rather than a crash three layers down. Going public
    // means an ingress rule, a DNS record and lifting noindex, and a developer's machine has none
    // of those to do. The site is installed and serving either way.
    //
    // Reading that as GO_LIVE_FAILED sent two people hunting for a broken site that was answering
    // HTTP 200 the whole time (17/09). Every OTHER status still fails: a 403 or a 5xx from a host
    // that IS configured is a real problem and must stay red.
    if (golive.status === 501)
      return viewOf({ ...current, publish: 'draft' }, { publicHere: false, hostStatus: 501 })
    if (!golive.ok) return viewOf(current, { error: 'GO_LIVE_FAILED', hostStatus: golive.status })
    const address = demoAddress(job.label, config)
    // 🔒 LIVE ONLY WHEN THE PUBLIC NAME REACHES THIS PROCESS. A demo on this host is served through
    // the zone's wildcard and `bar/route.js`, which echoes the probe; a more specific record left
    // over from elsewhere wins over the wildcard, and the name then answers something else entirely
    // (a 502, another machine's container) while the host reports a healthy install. A demo on
    // another host is reached through that host's own rule, never through this process, so there is
    // nothing of ours to echo there.
    if (
      job.host === config.hostName &&
      !(await addressReachesTracy(address, { fetchImpl, ...addressProbe }))
    ) {
      const tracyRefusal = { code: ADDRESS_SHADOWED, message: shadowedMessage(address) }
      const detail = { ...(answer.body && typeof answer.body === 'object' ? answer.body : {}), tracyRefusal }
      await noteDemoJob(pool, job.id, { state: 'failed', step: 'address', detail })
      return viewOf({ ...current, state: 'failed', step: 'address', detail }, { error: ADDRESS_SHADOWED })
    }
    await markDemoLive(pool, job.site_key, { address, port })
    return viewOf({ ...current, publish: 'published' })
  }
  return viewOf(current)
}

/**
 * Take a demo's own hostname off a host it is leaving: the tunnel rule AND the DNS record.
 *
 * 🔒 WHY THE DNS RECORD HAS TO GO HERE WHEN `teardown.sh` LEAVES IT. A demo on a second host is
 * reached through a CNAME of its own at that host's tunnel (`advanceDemo`, `dns: true`), because the
 * zone's wildcard points at this process's host. `teardown.sh` keeps the record on purpose — "a
 * dangling CNAME to our own tunnel is harmless" — and for a site that is gone for good it is. For a
 * demo that MOVES back to this process's host it is not: the specific record outranks the wildcard,
 * so the new copy would be served by the old host's tunnel, which answers 404 for a name it no
 * longer has a rule for.
 *
 * Only for a host other than this process's own — a demo here never had a record of its own. Never
 * throws; the answer says whether it happened, and a caller reports a failure rather than hiding
 * it, since the symptom (a 404 at an address that is serving) is otherwise unexplainable.
 * @returns {Promise<{ok: boolean, status?: number}>}
 */
export async function forgetDemoAddress({ config, host, fetchImpl, hostName, label }) {
  if (hostName === config.hostName) return { ok: true }
  const answer = await host.hostCall(
    config,
    hostName,
    '/address',
    { label, hostname: `${label}.${config.siteDomain}`, remove: true, dns: true },
    { fetchImpl }
  )
  // 501 is a host with no Cloudflare at all: it never wrote a record, so there is none to take off.
  return answer.ok || answer.status === 501 ? { ok: true } : { ok: false, status: answer.status }
}

/**
 * Every demo whose latest job has not settled: still queued/running, a teardown that finished (the
 * new copy is owed), or a provision that finished without going public. The sweep advances each
 * one — the same step the poll door takes, on a clock instead of a browser.
 */
export async function unsettledDemoJobs(pool) {
  const { rows } = await pool.query(
    `select j.id, j.site_key, j.host, j.kind, j.state, j.step, j.detail, s.label, s.publish, s.quickstart_tag, s.demo,
            s.host as site_host
       from site s
       join lateral (select * from job where site_key = s.site_key order by created_at desc limit 1) j on true
      where s.demo
        and (j.state in ('queued', 'running')
             or (j.kind = 'teardown' and j.state = 'done')
             or (j.kind = 'prefetch' and j.state = 'done' and j.detail->'plan'->>'next' is null)
             or (j.kind = 'provision' and j.state = 'done' and s.publish <> 'published'))`
  )
  return rows
}

export async function sweepDemos(pool, config, { host, fetchImpl = fetch, log = console, releases }) {
  if (!config.demoHost || !host) return { ran: false, advanced: [] }
  const jobs = await unsettledDemoJobs(pool)
  const advanced = []
  for (const job of jobs) {
    try {
      // The presser `recordDemoJob` wrote, kept through every poll by `noteDemoJob`. Unknown (a row
      // older than that rule, or written by hand) means NO owner: never an identity made up here.
      // `demo-sweep@tracy` was one, and `configure-mail.mjs` refused it as a sender (#827).
      const by = typeof job.detail?.by === 'string' && job.detail.by !== '' ? job.detail.by : null
      const view = await advanceDemo({ pool, config, host, fetchImpl, job, email: by, releases })
      advanced.push({ tag: job.quickstart_tag, ...view })
      if (view.error)
        log.warn(
          `[cron] demo ${job.quickstart_tag}: ${view.error}${view.hostStatus ? ` (HTTP ${view.hostStatus})` : ''}`
        )
    } catch (error) {
      log.error(`[cron] demo ${job.quickstart_tag} could not be advanced`, error)
    }
  }
  return { ran: true, advanced }
}

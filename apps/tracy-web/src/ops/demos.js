/**
 * `/api/ops/demos` — the public demo of every installable quickstart: where it answers, whether a
 * person pinned that address, and what is deployed there right now.
 *
 * A demo is a site on the demo host (`config.demoHost`, the DO droplet in production) built from
 * a release exactly the way a customer's site would be, then made public: ingress + DNS for its
 * own hostname and `go-live` so the noindex header comes off. A demo on another host has a tunnel
 * rule straight at its container; one on tracy-web's own host is reached through the zone wildcard
 * and `bar/route.js`, which lets everyone in (`publish = 'published'`) and stamps the "Create with
 * Tracy" pill (`lib/demo-sites.js`'s `advanceDemo`).
 *
 * Same door rules as the Quickstarts screen: staff read, owner/admin write, writes only from this
 * origin. Same optimistic lock as Build base for the pinned address.
 */
import { randomUUID } from 'node:crypto'

import { Hono } from 'hono'

import { DEFAULT_TRACY_ORIGIN } from '../lib/build-with-tracy-demo.js'

import { readDemoDomains, saveDemoDomain } from '../lib/demo-domain.js'

import {
  ASKING_STEP,
  advanceDemo,
  deleteDemoJob,
  demoAddress,
  demoAttempts,
  demoJob,
  demoSiteOf,
  demoSitesByTag,
  failureReason,
  forgetDemoAddress,
  IN_FLIGHT_STATES,
  keyedJobId,
  latestDemoJob,
  listDemoJobs,
  liveDemoOf,
  provisionDemo,
  noteDemoJob,
  recordDemoJob,
  UNANSWERED,
  upsertDemoSite
} from '../lib/demo-sites.js'
import { demoNamesOn, demoStatusOn, installDemoOn } from '../lib/demo-ssh.js'
import { prefetchDemo } from '../lib/demo-update.js'
import { readReleases, releasesToken, resolveInstall } from '../lib/quickstart-releases.js'
import { downloadReleaseAsset } from '../lib/release-assets.js'
import { tarOf } from '../lib/tar.js'
import { admit, denied } from './admit.js'

/** The install door's wait on the demo host, by default (`hostTimeoutMs` below says why). */
export const DEMO_HOST_CALL_TIMEOUT_MS = 20000
/** How long an install press waits for the host before answering 202 with the job's id. */
export const DEMO_HOST_QUICK_MS = 2000

export function demoRoutes({ pool, config, host, fetchImpl = fetch }) {
  const app = new Hono()

  const guard = async (c, { write = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write) {
      if (!['owner', 'admin'].includes(who.role)) return { deny: c.body(null, 403) }
      // The PUBLIC origin, not the request's: behind the tunnel the app is handed plain http, so
      // `new URL(c.req.url).origin` reads `http://cowork…` while every browser sends `https://…` —
      // and every write from a real browser was refused (measured 16/09 on dev, 403 on Refresh).
      if (c.req.header('origin') !== config.origin) return { deny: c.body(null, 403) }
    }
    return { who }
  }

  /**
   * The targets this deployment knows, and the one a request means.
   *
   * 🔒 AN UNKNOWN TARGET IS REFUSED, NEVER DEFAULTED. Falling back to `tracy` for a name this
   * deployment does not carry would answer 200 and install onto the wrong machine — the exact
   * mix-up two independent servers were called out for (16/09).
   */
  const targets = config.demoTargets ?? []
  const targetOf = (name) => targets.find((t) => t.name === (name ?? 'tracy')) ?? null
  const addressOf = (label, target) => demoAddress(label, target ?? config)
  /** What `advanceDemo` needs to ask for a new copy after a teardown, kept out of lib's imports. */
  const lookups = {
    releases: () => readReleases(pool),
    install: (tag) => resolveInstall(pool, tag),
    token: async () => (await releasesToken(config, fetchImpl)).token
  }

  /**
   * Take a demo's hostname off the host it is leaving. Its answer rides on the door's 202 as a
   * `warning` when it failed: the teardown already started and must not be undone for this, but a
   * record left behind makes the address answer 404 once the demo is back on this process's host,
   * and that is a symptom nobody could trace without being told here.
   */
  const moveAway = async (from) => {
    const forgot = await forgetDemoAddress({
      config,
      host,
      fetchImpl,
      hostName: from.host,
      label: from.label
    })
    if (forgot.ok) return null
    return {
      warning: `${from.label}.${config.siteDomain} may still point at ${from.host} (HTTP ${forgot.status || 0}) — remove its DNS record there before the demo answers from elsewhere.`
    }
  }

  app.get('/api/ops/demos', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const releases = await readReleases(pool)
    const target = targetOf(c.req.query('target'))
    if (target === null && c.req.query('target') !== undefined)
      return c.json({ error: 'UNKNOWN_TARGET' }, 404)
    const domains = await readDemoDomains(pool, releases, target?.name ?? 'tracy')
    const deployed = await demoSitesByTag(pool)
    const deployedOf = (tag) => {
      const row = deployed.get(tag)
      if (!row) return null
      return {
        label: row.label,
        // Which of `servers` the demo sits on — what the row's server picker starts from.
        host: row.host,
        address: addressOf(row.label, target),
        version: row.quickstart_version,
        jobId: row.job_id,
        // provision, teardown or remove: a screen reloaded mid-job says which one is running.
        kind: row.job_kind ?? null,
        state: row.job_state,
        step: row.job_step,
        ...(row.job_state === 'failed' ? { reason: failureReason(row.job_detail) } : {}),
        // The latest job's time, so the "Deployed" column can read the deploy as "2 hours ago"
        // without a per-row fetch. Null when a demo row was written by hand with no job yet.
        deployedAt: row.job_created_at ?? null,
        live: row.publish === 'published'
      }
    }
    // ⚠ `record` NO LONGER MEANS "cannot install". It meant that for one day: Tracy wrote those
    // addresses down and could not build anything at them. It now can — over a forced-command SSH
    // channel — so what the word still means is "Tracy does not RUN this machine": no host agent,
    // no teardown, no go-live. A target is installable when there is a way in at all.
    const installable = target === null || target.kind === 'host' || Boolean(target.ssh)
    return c.json({
      host: config.demoHost,
      zone: target?.zone ?? config.siteDomain,
      target: target?.name ?? 'tracy',
      // 🔒 NEVER THE `ssh` BLOCK. It carries the private key of a production machine (j-ja-demo),
      // and until 23/09 this line sent it whole to every staff browser that opened Demos. The
      // screen needs none of it: whether a target is installable is `writable` below.
      targets: targets.map(({ ssh: _ssh, ...shown }) => shown),
      // The hosts a demo may be put on, and the one it goes to when nobody chose. One entry means
      // there is nothing to choose, and the screens draw no picker.
      servers: config.demoHosts ?? [],
      defaultServer: config.demoHost,
      writable: ['owner', 'admin'].includes(g.who.role) && config.demoHost !== null && installable,
      reason:
        config.demoHost === null
          ? 'No demo host is configured on this server (DEMO_HOST).'
          : installable
            ? null
            : `${target.serverName} is not reachable from this deployment — no login is configured for it (DEMO_JOOMLART_SSH_*).`,
      demos: domains.map((d) => ({
        ...d,
        address: d.label ? addressOf(d.label, target) : null,
        deployed: target === null || target.kind === 'host' ? deployedOf(d.tag) : null
      }))
    })
  })

  /**
   * The deploy history of one demo: the jobs (provision/teardown) recorded against its site_key,
   * newest first. Target-aware like `install` and the listing — an explicit unknown target is
   * refused by name, never defaulted onto the wrong machine (16/09); an absent target means
   * Tracy's own. The site_key is derived exactly as `install` does — the demo's label under the
   * target, one segment down under this deployment's `siteDomain` (the key the job rows carry) — so
   * a demo with no pinned or derived label, and thus nothing to install, has no history.
   * Read-only, staff-only, never cached.
   */
  app.get('/api/ops/demos/history', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const target = targetOf(c.req.query('target'))
    if (target === null && c.req.query('target') !== undefined)
      return c.json({ error: 'UNKNOWN_TARGET' }, 404)
    const tag = c.req.query('tag') ?? ''
    // Only a release this server can install has a demo whose history is worth reading — an unknown
    // tag is refused by name, same as the domain door.
    const release = (await readReleases(pool)).find((r) => r.tag === tag && r.choosable)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const [domain] = await readDemoDomains(pool, [release], target?.name ?? 'tracy')
    const siteKey = domain?.label ? `${domain.label}.${config.siteDomain}` : null
    const jobs = siteKey ? await listDemoJobs(pool, siteKey, 50) : []
    return c.json({ tag, siteKey, jobs })
  })

  /**
   * ── GET /api/ops/demos/present — which recorded addresses that server REALLY serves ──────────
   *
   * ⚠ A DOOR OF ITS OWN, AND NOT FOR TIDINESS. Asking JoomlArt's machine costs ~3.3s for the whole
   * list (measured 16/09; a single `status` is ~4.6s because its `du` walks the tree). Folding that
   * into `/api/ops/demos` would make every visit to the screen wait three seconds for a fact that
   * is not needed to draw a single row. The table paints from the database; this arrives after.
   *
   * ONE ROUND TRIP FOR THE PAGE. `list` returns every folder that server has, and the screen
   * intersects it with what it recorded — seventy `status` calls would be five minutes.
   *
   * `names: null` is NOT an empty answer. A machine that did not reply and a machine that serves
   * nothing would draw the same seventy missing rows, and only one of the two is worth walking
   * over to the server about.
   */
  /**
   * Installs running against a `record` target, by id.
   *
   * ⚠ IN MEMORY, AND THAT IS A DECISION WITH A COST. A demo install is minutes of work happening on
   * ANOTHER machine; if this process restarts mid-way the install carries on there and this record
   * of it does not. The screen then says nothing rather than something wrong, and `list` still
   * tells the truth about what that server ended up with — which is the fact that matters. A table
   * would buy a progress bar that survives a deploy, and cost a migration for a screen an
   * administrator watches for four minutes.
   */
  const installs = new Map()
  const INSTALL_KEPT_MS = 30 * 60 * 1000

  app.get('/api/ops/demos/install-job', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const job = installs.get(c.req.query('id') ?? '')
    if (!job) return c.json({ error: 'UNKNOWN_JOB' }, 404)
    return c.json(job)
  })

  app.get('/api/ops/demos/present', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const target = targetOf(c.req.query('target'))
    if (target === null) return c.json({ error: 'UNKNOWN_TARGET' }, 404)
    if (!target.ssh) return c.json({ error: 'NO_SSH_FOR_TARGET', server: target.serverName }, 503)
    const { names, error } = await demoNamesOn(target.ssh)
    if (names === null) return c.json({ error: 'SERVER_DID_NOT_ANSWER', detail: error }, 502)
    return c.json({ target: target.name, server: target.serverName, present: [...names] })
  })

  /**
   * ── GET /api/ops/demos/on-server — one demo, as that machine describes it ────────────────────
   *
   * The expensive call, asked for one row at a time and only when a person wants it. It is also
   * the only place this deployment learns a demo's CMS version: `ja-campaign` and `ja-eventcamp`
   * answer `joomla=3.9` and both serve 500, which is the whole of why they are broken.
   */
  app.get('/api/ops/demos/on-server', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const target = targetOf(c.req.query('target'))
    if (target === null) return c.json({ error: 'UNKNOWN_TARGET' }, 404)
    if (!target.ssh) return c.json({ error: 'NO_SSH_FOR_TARGET', server: target.serverName }, 503)
    const answer = await demoStatusOn(target.ssh, c.req.query('label') ?? '')
    return c.json(answer, answer.error ? 400 : 200)
  })

  app.put('/api/ops/demos/domain', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!c.req.header('content-type')?.startsWith('application/json')) return c.body(null, 403)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.tag !== 'string' || typeof body.label !== 'string')
      return c.json({ error: 'INVALID_LABEL' }, 400)
    // Only a release this server can install has a demo to name — a tag it has never read, or one
    // with no setting, is refused by name rather than pinned into a table nothing else reads.
    const known = (await readReleases(pool, { choosable: true })).some((r) => r.tag === body.tag)
    if (!known) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    // Pinning is allowed on a `record` target — writing down an address JoomlArt already serves is
    // the entire job there — so this one checks the target exists and nothing more.
    const on = targetOf(body.target)
    if (on === null) return c.json({ error: 'UNKNOWN_TARGET' }, 404)
    const result = await saveDemoDomain(pool, body.tag, body.label, body.revision ?? 0, g.who.email, on.name)
    const status =
      result.error === 'DEMO_CHANGED' || result.error === 'LABEL_TAKEN' ? 409 : result.error ? 400 : 200
    return c.json(result, status)
  })

  /**
   * Put (or re-put) the demo of one release on the demo host. The site row is written first, so a
   * host that never answers still leaves a trace a person can read; the host's job id is the
   * handle the screen polls. A redeploy is a fresh install of the same address (16/09).
   */
  app.post('/api/ops/demos/install', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (config.demoHost === null || !host) return c.json({ error: 'NO_DEMO_HOST' }, 503)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.tag !== 'string') return c.json({ error: 'UNKNOWN_QUICKSTART' }, 400)
    // 🔒 A `record` target has no install. `demo.joomlart.com` is 459 demos on a machine Tracy did
    // not build; an Install press there is a mistake to name, not a job to start. Refusing by name
    // is the whole reason the screen shows which server a row lands on.
    const into = targetOf(body.target)
    if (into === null) return c.json({ error: 'UNKNOWN_TARGET' }, 404)
    if (into.kind !== 'host') {
      // ── Installing onto a server Tracy does not run ──────────────────────────────────────────
      //
      // Everything below is why this is not the same door's happy path with a different host: the
      // package comes off a private release HERE (that machine holds no GitHub key), goes up a
      // forced-command SSH channel that accepts a name and a byte stream, and takes minutes. So it
      // answers with a job id at once and the screen follows it.
      if (!into.ssh) return c.json({ error: 'NO_SSH_FOR_TARGET', server: into.serverName }, 503)
      const releases = await readReleases(pool)
      const release = releases.find((r) => r.tag === body.tag && r.choosable)
      if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
      const install = await resolveInstall(pool, release.tag)
      const packaged = install?.installer
      if (!packaged?.file) return c.json({ error: 'NOT_AN_INSTALLER_QUICKSTART', tag: release.tag }, 409)
      const [domain] = await readDemoDomains(pool, [release], into.name)
      if (!domain?.label) return c.json({ error: 'NO_DEMO_ADDRESS' }, 400)

      const id = `ssh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const job = {
        id,
        target: into.name,
        server: into.serverName,
        tag: release.tag,
        label: domain.label,
        address: addressOf(domain.label, into),
        state: 'running',
        step: 'fetching the package',
        note: null,
        error: null
      }
      installs.set(id, job)
      setTimeout(() => installs.delete(id), INSTALL_KEPT_MS).unref?.()

      // Deliberately NOT awaited: the door answers now and the work carries on.
      void (async () => {
        try {
          const { token } = await releasesToken(config, fetchImpl)
          /** One asset, proven against the checksum the release declared. */
          const fetchPart = (part) =>
            downloadReleaseAsset(fetchImpl, {
              tag: release.tag,
              file: part.file,
              sha256: part.sha256,
              token
            })

          let bytes = null
          if (packaged?.file) {
            const got = await fetchPart(packaged)
            if (got.bytes === null) {
              Object.assign(job, { state: 'failed', error: got.reason })
              return
            }
            bytes = got.bytes
          } else {
            // 🔒 BOTH PARTS, THEN ONE STREAM. A captured site is a webroot AND the database behind
            // it, and the far side reads a single stdin: sending two would mean two connections
            // and a half-restored site when the second one failed. They are tarred together here,
            // after both checksums pass, so that machine gets a whole site or nothing at all.
            job.step = 'fetching the webroot'
            const web = await fetchPart(captured.webroot)
            if (web.bytes === null) {
              Object.assign(job, { state: 'failed', error: web.reason })
              return
            }
            job.step = 'fetching the database'
            const db = await fetchPart(captured.database)
            if (db.bytes === null) {
              Object.assign(job, { state: 'failed', error: db.reason })
              return
            }
            bytes = tarOf([
              { name: 'webroot.tar.gz', bytes: web.bytes },
              { name: 'database.sql.gz', bytes: db.bytes }
            ])
          }
          job.step = `sending ${String(Math.round(bytes.length / 1048576))} MB`
          // The same press-time choice the host target already honours (`body.badge`): absent means
          // with. One switch on the screen must not mean two different things depending on which
          // server the row lands on.
          //
          // Public JoomlArt demos advertise production even when installed from a dev/local ops page.
          const banner =
            body.badge !== false ? new URL('/build-with-tracy-demo.js', DEFAULT_TRACY_ORIGIN).href : null
          const answer = await installDemoOn(into.ssh, {
            slug: domain.label,
            bannerUrl: banner,
            zip: bytes,
            // Same `!== false` rule the badge uses, so one screen's two ticks read the same way.
            // On a `record` target the address may already hold one of THEIR live demos, which is
            // why replacing is a thing a person ticks rather than the default the word implies.
            replace: body.override !== false,
            onStep: (step) => {
              job.step = step
            }
          })
          if (answer.ok) Object.assign(job, { state: 'done', step: answer.line || 'installed' })
          else Object.assign(job, { state: 'failed', error: answer.error })
        } catch (error) {
          Object.assign(job, { state: 'failed', error: String(error?.message ?? error) })
        }
      })()

      return c.json({ jobId: id, address: job.address }, 202)
    }
    // 🔒 ONE JOB PER ADDRESS AT A TIME (11/10/2026). One Retry install on dev left three provision
    // jobs racing over one label in 35 seconds: this door started a job for every request that
    // reached it. A request that arrives while another is between its checks and its job row is
    // refused here (one process serves the doors); one that arrives later meets the job row below.
    if (starting.has(body.tag)) return busy(c)
    starting.add(body.tag)
    try {
      return await installOnHost(c, g, body, into)
    } finally {
      starting.delete(body.tag)
    }
  })

  /**
   * How long the install door waits for the demo host to take a teardown or a provision.
   *
   * 🔒 BOUNDED, AND A HOST THAT CANNOT TAKE THE JOB IS A 503 IN WORDS (12/10/2026). With eight
   * provisions already running on fleet01, one install press held its request about 40 s waiting
   * on the host before its 202, and the thirteen presses after it came back as Cloudflare's own
   * 502 page: nothing this door wrote, nothing the screen could read. The host's own answer is a
   * file write and a 202, so 20 s is ample for a host that is merely busy, and well inside the
   * proxy's 100 s. A timed-out provision is safe to press again: it is named (`jobKey`), so a job
   * the host did start behind the timeout is answered as that job, not started twice.
   */
  const hostTimeoutMs = config.demoHostCallTimeoutMs ?? DEMO_HOST_CALL_TIMEOUT_MS
  /**
   * The answer when the demo host did not take the job: no answer at all (status 0) or its own 5xx
   * (a tunnel's HTML error page included). A 4xx is the host refusing THIS request with its own
   * JSON reason, and still goes back as it came.
   * @returns {Response | null}
   */
  const hostUnavailable = (c, answer, hostName) => {
    if (answer.status !== 0 && answer.status < 500) return null
    c.header('retry-after', '60')
    return c.json(
      { error: 'DEMO_HOST_UNAVAILABLE', host: hostName, reason: unavailableReason(answer, hostName) },
      503
    )
  }
  /** The sentence for a host that did not take the job, on the 503 and on the job row alike. */
  const unavailableReason = (answer, hostName) =>
    answer.status === 0
      ? `${hostName} did not answer${answer.timedOut ? ` in ${String(Math.round(hostTimeoutMs / 1000))} s` : ''}; it may be busy with other installs. Press again in a minute.`
      : answer.status >= 500
        ? `${hostName} answered ${String(answer.status)}; it may be busy with other installs. Press again in a minute.`
        : `${hostName} refused the job (${String(answer.status)}${typeof answer.body?.why === 'string' ? `: ${answer.body.why}` : ''}).`
  /** How long a press waits for the host before it answers 202 anyway (`handOff`). */
  const quickMs = config.demoHostQuickMs ?? DEMO_HOST_QUICK_MS

  /** Install requests between their first check and their job row, by tag (see the 🔒 above). */
  const starting = new Set()
  const busy = (c) =>
    c.json(
      {
        error: 'DEMO_BUSY',
        reason: 'A job is already running for this demo. Wait for it to finish, then press again.'
      },
      409
    )

  /** The install door on a host Tracy runs: tear down what is in the way, else provision. */
  const installOnHost = async (c, g, body, into) => {
    const releases = await readReleases(pool)
    const release = releases.find((r) => r.tag === body.tag && r.choosable)
    if (!release) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)
    const [domain] = await readDemoDomains(pool, [release], into.name)
    if (!domain?.label) return c.json({ error: 'NO_DEMO_ADDRESS' }, 400)
    const install = await resolveInstall(pool, release.tag)
    if (!install) return c.json({ error: 'UNKNOWN_QUICKSTART' }, 404)

    const label = domain.label
    const siteKey = `${label}.${config.siteDomain}`
    const sha256 = Object.values(install).find((p) => p && typeof p === 'object' && p.sha256)?.sha256 ?? null
    // Read BEFORE the row is rewritten: the upsert below resets `publish` and `host`, and a live
    // demo read after it would look like a first install and be provisioned on top of the running
    // one — or, for a move, be looked for on the machine it is going to instead of the one it is on.
    const live = await liveDemoOf(pool, release.tag)
    const previous = await demoSiteOf(pool, release.tag)
    // The address's latest job, before anything is written: one still in flight refuses this press.
    const latest = previous ? await latestDemoJob(pool, previous.site_key) : null
    if (latest && IN_FLIGHT_STATES.has(latest.state)) return busy(c)

    // ── Which server (22/09: "assign any demo to any server") ─────────────────────────────
    //
    // Asked for by name, else where the demo already is, else the default demo host. 🔒 A name
    // outside `demoHosts` is refused, never defaulted — the same rule as an unknown target, for the
    // same reason: a 202 onto the wrong machine is the silent shape this door exists to refuse.
    if (body.host !== undefined && typeof body.host !== 'string')
      return c.json({ error: 'UNKNOWN_HOST' }, 400)
    const servers = config.demoHosts ?? []
    const listed = (name) => servers.some((s) => s.name === name)
    // Where it already is only while that machine is still on the list: a host taken off
    // `DEMO_HOSTS` is somewhere nothing new should go, and the copy there comes down below.
    const onto = body.host ?? (listed(previous?.host) ? previous.host : config.demoHost)
    if (!listed(onto) || !config.hosts.has(onto))
      return c.json(
        { error: 'UNKNOWN_HOST', reason: `${onto} is not a server this deployment puts demos on.` },
        404
      )
    // What has to come down first: the running copy, or — for a move — whatever the demo left on
    // the machine it is leaving, served or not. A half-built demo on the old host still holds its
    // containers, and nothing would ever name them again once the row points elsewhere.
    const leaving = previous && previous.host !== onto ? previous : null
    // 🔒 A FAILED COPY IS IN THE WAY TOO (11/10/2026). A provision that died part way leaves the
    // label's directory on the host, and every later provision refuses it ("quickstart restore
    // refuses a nonempty site not owned by this provision"), so Retry install could never pass.
    // It goes down first like a live copy: teardown.sh is idempotent (a label already gone is a
    // success), the row is a demo (`upsertDemoSite` refuses a customer's label) and it serves
    // nobody, so nothing is lost that the retry was not going to replace.
    const broken = previous && !live && latest?.state === 'failed' ? previous : null
    const old = live ?? leaving ?? broken
    if (old && !config.hosts.has(old.host))
      return c.json(
        { error: 'NO_DEMO_HOST', reason: `The demo sits on ${old.host}, which this server cannot reach.` },
        503
      )
    // With or without the Tracy badge — a press-time choice (16/09). Absent means with: a
    // demo is an advertisement, and the one that wants none says so.
    const badge = body.badge !== false
    const answered = { siteKey, label, host: onto, address: addressOf(label) }

    // ── A LIVE demo is updated without going blank (25/10/2026, `lib/demo-update.js`) ────────────
    //
    // The new release is fetched and verified on the host it will run on BEFORE anything is taken
    // down, and the row is left as it is: the old copy keeps serving while that runs, and keeps
    // serving if it fails. The prefetch's poll asks for the teardown once the files are in hand.
    if (live) {
      const jobKey = `demo:${label}:prefetch:${randomUUID().replaceAll('-', '').slice(0, 16)}`
      return await handOff(c, {
        id: keyedJobId(jobKey),
        siteKey: live.site_key,
        hostName: onto,
        kind: 'prefetch',
        by: g.who.email,
        plan: {
          tag: release.tag,
          version: install.version,
          sha256,
          siteKey,
          label,
          onto,
          badge,
          oldLabel: live.label,
          oldHost: live.host
        },
        answered,
        ask: async () =>
          prefetchDemo({
            config,
            host,
            fetchImpl,
            label,
            release,
            install,
            releasesToken: await lookups.token(),
            hostName: onto,
            jobKey,
            timeoutMs: hostTimeoutMs
          })
      })
    }

    const claimed = await upsertDemoSite(pool, {
      siteKey,
      label,
      host: onto,
      platform: release.platform,
      tag: release.tag,
      version: install.version,
      sha256,
      badge
    })
    if (claimed.error) return c.json({ error: claimed.error }, 409)

    // A copy in the way that is NOT serving (a failed one, or what a demo left on a machine it is
    // leaving) goes down first; the poll of that teardown asks for the new copy once the old one is
    // gone (`provisionDemo` below). A live one never reaches here: it took the prefetch road above. Two copies of one label
    // on one host would fight over the same directory, and the loser would be the one serving.
    //
    // A move tears down on the OLD host and the poll of that teardown builds on the new one
    // (`advanceDemo` reads the row's host, which the upsert above already moved).
    if (old) {
      // Named before it is asked, so the id is known up front (`keyedJobId`); a fresh name per
      // press, because a teardown is safe to repeat and must not collide with an earlier one.
      const jobKey = `demo:${old.label}:teardown:${randomUUID().replaceAll('-', '').slice(0, 16)}`
      return await handOff(c, {
        id: keyedJobId(jobKey),
        siteKey,
        hostName: old.host,
        kind: 'teardown',
        by: g.who.email,
        answered,
        ask: () =>
          host.hostCall(
            config,
            old.host,
            '/teardown',
            { label: old.label, jobKey },
            { fetchImpl, timeoutMs: hostTimeoutMs }
          ),
        after: () => (old.host !== onto ? moveAway(old) : Promise.resolve(null))
      })
    }
    const jobKey = `demo:${label}:${install.version}:${(await demoAttempts(pool, siteKey)) + 1}`
    return await handOff(c, {
      id: keyedJobId(jobKey),
      siteKey,
      hostName: onto,
      kind: 'provision',
      by: g.who.email,
      answered,
      ask: async () => {
        const started = await provisionDemo({
          pool,
          config,
          host,
          fetchImpl,
          siteKey,
          label,
          release,
          install,
          email: g.who.email,
          releasesToken: await lookups.token(),
          hostName: onto,
          jobKey,
          timeoutMs: hostTimeoutMs
        })
        return started.error
          ? { ok: false, status: started.status ?? 0, timedOut: started.timedOut, body: started.body }
          : { ok: true, status: 202, body: { jobId: started.jobId } }
      }
    })
  }

  /**
   * Ask the demo host for one job without ever holding the request on it.
   *
   * 🔒 ANSWER AT ONCE, FINISH IN THE BACKGROUND (12/10/2026). With eight provisions already running
   * on fleet01, one install press held its request about 40 s on the host before its 202, and the
   * thirteen presses after it, each under a second, came back as Cloudflare's own 502 page; ten
   * minutes later the same presses answered 202. What made this server unreachable for those
   * seconds is NOT measured (no server log was read). What this door controls is that it never
   * waits on the host: the job row is written first under the id the host will use (`keyedJobId`),
   * the host is asked with a bounded wait, and the press is answered as soon as the host has
   * answered or `quickMs` has passed, whichever comes first. A late answer lands on the row the
   * screen is already polling; an id the host chose itself (a host not yet deployed with keyed
   * teardowns) is recorded and the placeholder points at it (`moved`); no answer, or the host's own
   * 5xx, marks the row failed in words (`UNANSWERED`) and frees the address for a clean retry.
   */
  const handOff = async (
    c,
    { id, siteKey, hostName, kind, by, answered, ask, after = null, plan = null }
  ) => {
    await recordDemoJob(pool, { id, siteKey, host: hostName, kind, by, plan })
    await noteDemoJob(pool, id, { state: 'queued', step: ASKING_STEP })
    const work = (async () => {
      let answer
      try {
        answer = await ask()
      } catch (error) {
        answer = { ok: false, status: 0, body: { error: String(error?.message ?? error) } }
      }
      const real = answer.ok && typeof answer.body?.jobId === 'string' ? answer.body.jobId : null
      if (real === null) {
        await noteDemoJob(pool, id, {
          state: 'failed',
          detail: { door: UNANSWERED, detail: unavailableReason(answer, hostName), hostStatus: answer.status }
        })
        return { answer, real }
      }
      if (real !== id) {
        await recordDemoJob(pool, { id: real, siteKey, host: hostName, kind, by, plan })
        await noteDemoJob(pool, id, { state: 'moved', detail: { next: real } })
      }
      const extra = after ? await after().catch(() => null) : null
      return { answer, real, extra }
    })()
    // A backstop only: every step above catches its own failure into the job row.
    work.catch(() => {})
    let timer
    const quick = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), quickMs)
      timer.unref?.()
    })
    const settled = await Promise.race([work, quick])
    clearTimeout(timer)
    if (settled === null) return c.json({ jobId: id, ...answered, pending: true }, 202)
    if (settled.real === null)
      return (
        hostUnavailable(c, settled.answer, hostName) ??
        c.json(settled.answer.body ?? { error: 'HOST_REFUSED' }, settled.answer.status || 503)
      )
    // Answered in time under an id of the host's own: the placeholder was never handed out.
    if (settled.real !== id) await deleteDemoJob(pool, id)
    return c.json({ jobId: settled.real, ...answered, ...settled.extra }, 202)
  }

  /**
   * One poll: ask the host how the job is, and move the demo one step when it finished —
   * a teardown that is done asks for the new copy; a provision that is done is made public
   * (ingress + DNS for the demo's own hostname, then `go-live` so noindex comes off). Every step
   * is written down before it is answered, so a reload mid-way reads the same story, and a done
   * provision is published once even if the screen polls twice.
   */
  /**
   * ── DELETE /api/ops/demos?tag= — take a demo off the host and forget it ─────────────────────
   *
   * The press that was missing: until now a demo could only be replaced, never removed, because
   * `/teardown` existed solely as the first half of an install onto an address already serving
   * (`advanceDemo`'s `kind === 'teardown'` asks for the new copy the moment the old one is gone).
   * A quickstart Tracy has stopped building sites from therefore kept its demo, its containers and
   * its share of the host's memory for ever — measured 18/09 on dev, where 82 demos held 14.0 of
   * 23.5 GiB and the machine spent a morning under the OOM killer.
   *
   * 🔒 IT ANSWERS A JOB, NOT A DONE. Tearing a site down takes as long as building one, so this
   * door hands back a job id and the row is forgotten by the poll that sees the host finish — the
   * same two-step every other demo press already uses. Deleting the row here instead would leave
   * the screen saying "not installed" over containers still running.
   *
   * 🔒 A HOST THIS SERVER CANNOT REACH IS A REFUSAL, NOT A ROW DELETION. Forgetting the row while
   * the containers stay up is how a demo becomes invisible AND permanent: nothing on any screen
   * would name it again, and the memory it holds would never be explained. Better to say which
   * host is out of reach and let somebody go there.
   */
  app.delete('/api/ops/demos', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const tag = c.req.query('tag') ?? ''
    const site = await demoSiteOf(pool, tag)
    if (!site) return c.json({ error: 'NO_DEMO', reason: 'No demo of this release on this server.' }, 404)
    if (!host || !config.hosts.has(site.host))
      return c.json(
        { error: 'NO_DEMO_HOST', reason: `The demo sits on ${site.host}, which this server cannot reach.` },
        503
      )

    const answer = await host.hostCall(config, site.host, '/teardown', { label: site.label }, { fetchImpl })
    if (!answer.ok || typeof answer.body?.jobId !== 'string')
      return c.json(answer.body ?? { error: 'HOST_REFUSED' }, answer.status || 502)
    await recordDemoJob(pool, {
      id: answer.body.jobId,
      siteKey: site.site_key,
      host: site.host,
      kind: 'remove',
      by: g.who.email
    })
    // Gone for good still frees the name: installed again later on this process's own host, it
    // must not be answered by the old host's record (`forgetDemoAddress`).
    const moved = await moveAway(site)
    return c.json({ jobId: answer.body.jobId, siteKey: site.site_key, label: site.label, ...moved }, 202)
  })

  app.get('/api/ops/demos/job', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    const id = c.req.query('id') ?? ''
    let job = await demoJob(pool, id)
    // The install door's placeholder, answered by the host under an id of its own (`handOff`):
    // follow it, and the answer carries the real id, which the screen keeps polling from then on.
    if (job?.state === 'moved' && typeof job.detail?.next === 'string')
      job = await demoJob(pool, job.detail.next)
    if (!job || !job.demo) return c.json({ error: 'JOB_UNKNOWN' }, 404)
    return c.json(
      await advanceDemo({ pool, config, host, fetchImpl, job, email: g.who.email, releases: lookups })
    )
  })

  return app
}

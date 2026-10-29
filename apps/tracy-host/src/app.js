import { visionStream } from './vision-stream.js'
import { qaDeadline } from './demo-qa-deadline.js'
import { framePolicyRoute } from './frame-policy.js'
import { publicOriginOf } from './public-origin.js'
/**
 * The one Hono app for `tracy-host` — the per-host service that runs the agent's shell commands
 * (ADR 0014's "one dsh per host"). Every `/_host/*` route sits behind the signature middleware
 * below: a call that doesn't carry a valid `x-host-*` signature never reaches a handler, whether
 * or not that handler exists (a later task's route added here inherits the same door for free —
 * there is no path through this file that skips verification because a handler happened to be
 * missing).
 *
 * `tracy-host` holds no seat secret and admits no cookie — this migration's global boundary rule.
 * `run` and `jobs` are injected so this file and its tests never spawn a real process or touch a
 * real docker socket: `server.js` wires the real ones, a test wires a fake.
 */

import { brandFromOf } from './brand-copy.js'
import { createHash, randomUUID } from 'node:crypto'
import { access, constants } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { verifyHostCall } from './auth.js'
import { installSlots, memoryStep, slotStep } from './install-slots.js'
import { captureBody, captureTarget, CAPTURE_TIMEOUT_MS, runCapture } from './capture.js'
import { demoAddress, demoQaBody, reachableBase } from './demo-qa.js'
import { draining } from './jobs.js'
import { prefetchRefusal, runPrefetchJob } from './prefetch.js'
import {
  attachSite,
  reserveSite,
  unreserveSite,
  PROVISION_FLAGS,
  runProvisionJob,
  runTeardownJob,
  SAFE_ARG,
  SAFE_URL,
  ARCHIVE_URL_ENV,
  SAFE_LABEL
} from './provision.js'
import {
  isDirectory,
  mintAgentToken,
  GO_LIVE_BUSY_EXIT,
  MINT_TOKEN_STATUS,
  readAgentTokenCustody,
  readContentToken,
  runGoLiveJob,
  runIngressUpdate,
  runWebrootJob,
  SAFE_DOMAIN,
  validateWebrootBody,
  WEBROOT_JOBS,
  writeCoreManifest
} from './webroot.js'
import { readSiteFiles } from './site-files.js'
import { writeDisplayLocale } from './display-locale.js'
import { emdashMediaRoute } from './emdash-media.js'
import { CMS_LOG_KIND, runCmsLogJob, validateCmsLogBody } from './cms-log.js'
import { LOOK_CSS_KIND, runLookCssJob, validateLookCssBody } from './look-css.js'
import { DS_SLOT_KIND, runDsSlotJob, validateDsSlotBody } from './ds-slot.js'
import { overlapFolderOf } from './picture-overlap-browser.js'

/** Same shape `uuid.uuid4().hex[:12]` produces on the Python side — short enough for a log line,
 * long enough that two jobs never collide. */
function jobId() {
  return randomUUID().replaceAll('-', '').slice(0, 12)
}

/** What a caller may name one provision attempt by: a build id and an attempt number, or the like. */
const SAFE_JOB_KEY = /^[A-Za-z0-9:._-]{8,120}$/
/** A GitHub token as GitHub spells them: one word, no shell metacharacters, never empty. */
const SAFE_TOKEN = /^[A-Za-z0-9_.-]{20,512}$/

/**
 * The job id for a caller-named attempt — a pure function of the key, so the SAME key always
 * names the SAME job on this host. That is the whole answer to "the host accepted the job and the
 * response never arrived": tracy-web asks again with the same key and gets the id it lost, not a
 * second `provision.sh` racing the first over one webroot. Prefixed so a keyed id can never
 * collide with a random one (`jobId()` is 12 hex characters, this is 21).
 * @param {string} key
 * @returns {string}
 */
export function keyedJobId(key) {
  return `k${createHash('sha256').update(key).digest('hex').slice(0, 20)}`
}

function badRequest(c, why) {
  return c.json({ code: 'BAD_REQUEST', why }, 400)
}

/**
 * The signed body as a JSON object, or the 400 that refuses it. `null`, a list, a number or a
 * string are all JSON, and none of them has a field to read: read as one, `null` answered 500 at
 * every door below (QA run 20/10/2026).
 * @returns {{ body: Record<string, any>, refused?: undefined } | { body?: undefined, refused: Response }}
 */
function bodyObject(c) {
  let body
  try {
    body = JSON.parse(c.get('rawBody') || '{}')
  } catch {
    return { refused: badRequest(c, 'not json') }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    return { refused: badRequest(c, 'not an object') }
  return { body }
}

/**
 * One queue per job id: `inTurn(id, work)` runs `work` after every earlier call for the same id has
 * settled. A keyed ask reads the job store and then writes it; two asks for one key that arrive
 * together would both read "nothing yet" and both start the script (measured on provision,
 * QA run 20/10/2026). One tracy-host process serves a host, so a queue in memory is the whole fence.
 */
function turnsById() {
  /** @type {Map<string, Promise<unknown>>} */
  const turns = new Map()
  /**
   * @template T
   * @param {string} id
   * @param {() => Promise<T>} work
   * @returns {Promise<T>}
   */
  return (id, work) => {
    const next = (turns.get(id) ?? Promise.resolve()).then(work)
    const settled = next.catch(() => {})
    turns.set(id, settled)
    settled.then(() => {
      if (turns.get(id) === settled) turns.delete(id)
    })
    return next
  }
}

/**
 * `POST /_host/provision` — starts `provision.sh` as a background job and answers immediately
 * with its id (py's `_provision`, py:694+). A caller that waited for provision to finish would be
 * a caller that times out; `GET /_host/jobs/:id` is how the rest of the story gets told.
 */
function provisionRoute({ config, jobs, run, slots, inTurn }) {
  /** Record the job under `id` and start it, or answer the job a keyed ask already has. */
  async function start(c, body, id, jobKey) {
    if (jobKey !== '') {
      const existing = await jobs.get(id)
      if (existing) return c.json({ jobId: id, reused: true }, 202)
    }
    // After the reuse answer, not before: asking again for a job that already runs starts nothing,
    // so a deploy has no reason to refuse it. See `draining` in jobs.js for why a new one is.
    if (await draining(config.jobsDir)) return c.json({ code: 'HOST_UPDATING' }, 503)
    await jobs.put(id, {
      state: 'queued',
      step: 'queued',
      label: body.label,
      ...(jobKey === '' ? {} : { jobKey })
    })
    // Fire-and-forget: the route has already promised 202 with this id. runProvisionJob never
    // rejects (it catches its own errors into a `failed` job record) — the extra .catch here is
    // only a backstop against a mistake in that contract, not a path this is expected to take.
    // A DEMO install waits for a slot first (`install-slots.js` says why); a customer's never does.
    const job = () => runProvisionJob({ jobId: id, body, config, jobs, run })
    const started =
      body.demo === true
        ? slots.run((ahead) => jobs.put(id, { state: 'queued', step: slotStep(ahead) }), job, {
            onMemory: (mb) =>
              jobs.put(id, { state: 'queued', step: memoryStep(mb, config.demoInstallMinFreeMb ?? 0) })
          })
        : job()
    started.catch(() => {})
    return c.json({ jobId: id }, 202)
  }

  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    try {
      if (body.publicOrigin !== undefined) body.publicOrigin = publicOriginOf(body.publicOrigin)
    } catch {
      return badRequest(c, 'refused publicOrigin')
    }
    if (!body.site || !body.label) return badRequest(c, 'need site and label')
    // A fleet-born site (ADR 0086) has no archive to ask for: emdash always, every other
    // platform when `fresh`. The restore path still requires webrootKey, same as before —
    // py:707-709. Ported as a synchronous refusal, not a job that starts and fails later: the
    // original answers this one inline, and a 202 for a request the fleet host used to refuse
    // outright would tell a caller "accepted" for work that was never going to run.
    const fresh = Boolean(body.fresh)
    if (!fresh && body.platform !== 'emdash' && !body.webrootKey) {
      return badRequest(c, 'need webrootKey for this platform')
    }
    if (!SAFE_LABEL.test(String(body.label))) return badRequest(c, 'refused label')
    for (const key of Object.keys(PROVISION_FLAGS)) {
      const value = body[key]
      if (value && !SAFE_ARG.test(String(value))) return badRequest(c, `refused ${key}`)
    }
    for (const key of Object.keys(ARCHIVE_URL_ENV)) {
      const value = body[key]
      if (value !== undefined && (typeof value !== 'string' || !SAFE_URL.test(value))) {
        return badRequest(c, `refused ${key}`)
      }
    }

    // `jobKey`: the caller's own name for THIS attempt (tracy-web sends `<buildId>:<attempt>`).
    // Named, the attempt is idempotent on this host: a second request with the same key — a lost
    // response asked again, a double press that reached the door twice — answers the job already
    // running (or finished) under that name and starts nothing. Unnamed keeps the old shape: a
    // fresh random id every time.
    if (body.workflow !== undefined && body.workflow !== 'template') return badRequest(c, 'refused workflow')
    // A brand to bring from another site on this host (`brand-copy.js`): a safe label and host, or
    // nothing. tracy-web checked the viewer's seat on that site before naming it.
    if (brandFromOf(body.brandFrom, String(body.label)) === undefined)
      return badRequest(c, 'refused brandFrom')
    if (body.releasesToken !== undefined && !SAFE_TOKEN.test(String(body.releasesToken)))
      return badRequest(c, 'refused releasesToken')
    // An import's copy gets a Claude Cowork token of its own (provision.sh step 4b), never the live
    // site's that came inside the database: same fence as any token handed over in a body.
    if (body.copyToken !== undefined && !SAFE_TOKEN.test(String(body.copyToken)))
      return badRequest(c, 'refused copyToken')

    const jobKey = typeof body.jobKey === 'string' ? body.jobKey : ''
    if (jobKey !== '' && !SAFE_JOB_KEY.test(jobKey)) return badRequest(c, 'refused jobKey')
    const id = jobKey === '' ? jobId() : keyedJobId(jobKey)
    // A keyed ask looks for its job and records it in its key's turn (`turnsById`), so two asks
    // that arrive together start one `provision.sh`, and the second is told the first one's job.
    return jobKey === '' ? start(c, body, id, jobKey) : inTurn(id, () => start(c, body, id, jobKey))
  }
}

/** A job id as this host makes them: `jobId()` (12 hex characters) or `keyedJobId()` (`k` + 20). */
const JOB_ID = /^(?:[0-9a-f]{12}|k[0-9a-f]{20})$/

/**
 * `GET /_host/jobs/:id` — one job's status, or 404 if there is no such job (yet, or ever). An id
 * this host never makes is answered 404 before the store is asked: `..%2Fsecret` used to read a
 * `.json` file outside the jobs directory (QA run 20/10/2026). 404, not 400: no job has that id,
 * and that is what a caller polling it must read.
 */
function jobRoute({ jobs }) {
  return async (c) => {
    const id = c.req.param('id')
    if (!JOB_ID.test(id)) return c.json({ code: 'NOT_FOUND' }, 404)
    const job = await jobs.get(id)
    if (!job) return c.json({ code: 'NOT_FOUND' }, 404)
    return c.json(job)
  }
}

/**
 * `POST /_host/attach` — see `provision.js`'s `attachSite` for what this does and does not do
 * (no bind-mount; that stays `attach-site.sh`'s job). Synchronous: making a directory exist is a
 * thousandth-of-a-second job, not a job worth a job id.
 */
function attachRoute({ config }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const label = body.label
    if (!label || !SAFE_LABEL.test(String(label))) return badRequest(c, 'refused label')
    // py:568-570 refuses ANY key other than `label` — fail-open on an unknown field is a bug
    // class in this repo, not a style choice, and this door has no use for anything else a
    // caller might send.
    for (const key of Object.keys(body)) {
      if (key !== 'label') return badRequest(c, `refused ${key}`)
    }
    const result = await attachSite({ label: String(label), config })
    return c.json(result, 200)
  }
}

/**
 * `POST /_host/reserve` · `POST /_host/unreserve` — a site's folder before its provision, and the
 * way back. A claimed site (tracy-web `POST /api/sites/claim`) opens its workspace at once, and
 * dsh registers a seat's folder only when it exists; so the folder is made here with a marker and
 * nothing else — `provision.sh` writes AGENTS.md write-if-missing, and one written now would name
 * the wrong CMS for good. `unreserve` removes a folder that holds the marker alone (a claim nobody
 * followed up on): a folder with anything else in it is a site, and stays.
 */
function reserveRoute({ config }, { remove = false } = {}) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const label = body.label
    if (!label || !SAFE_LABEL.test(String(label))) return badRequest(c, 'refused label')
    for (const key of Object.keys(body)) {
      if (key !== 'label') return badRequest(c, `refused ${key}`)
    }
    const result = remove
      ? await unreserveSite({ label: String(label), config })
      : await reserveSite({ label: String(label), config })
    return c.json(result, 200)
  }
}

/**
 * `POST /_host/teardown` — starts `teardown.sh` as a background job, same fire-and-forget shape
 * as provision (py's `_teardown`, py:665+): a synchronous teardown would race the caller's own
 * timeout and lose (BrokenPipe) even though the work finished.
 */
function teardownRoute({ config, jobs, run, inTurn }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    // SAFE_LABEL, not py's own SAFE_ARG: this label becomes `teardown.sh`'s `$ROOT/$LABEL`, the
    // folder it removes, and SAFE_ARG lets `../..` and `a/b` through (QA run 20/10/2026).
    if (!body.label || !SAFE_LABEL.test(String(body.label))) return badRequest(c, 'refused label')

    // `jobKey`, as on provision: the caller's own name for this teardown (tracy-web's install door
    // names it before asking, 12/10/2026, so it can answer at once with the id used here). Named,
    // asking again answers the same job and tears down nothing twice.
    const jobKey = typeof body.jobKey === 'string' ? body.jobKey : ''
    if (jobKey !== '' && !SAFE_JOB_KEY.test(jobKey)) return badRequest(c, 'refused jobKey')
    const id = jobKey === '' ? jobId() : keyedJobId(jobKey)
    const start = async () => {
      if (jobKey !== '' && (await jobs.get(id))) return c.json({ jobId: id, reused: true }, 202)
      await jobs.put(id, { state: 'queued', step: 'queued', label: body.label })
      runTeardownJob({ jobId: id, body, config, jobs, run }).catch(() => {})
      return c.json({ jobId: id }, 202)
    }
    // In its key's turn, as on provision: two asks that arrive together tear down once.
    return jobKey === '' ? start() : inTurn(id, start)
  }
}

/**
 * `POST /_host/prefetch` — fetch and verify one release into this host's quickstart cache, touching
 * no site (`prefetch.js` says why a demo update starts here). Keyed like teardown: asking again
 * with the same `jobKey` answers the job already there.
 */
function prefetchRoute({ config, jobs, run, inTurn }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const why = prefetchRefusal(body, { safeLabel: SAFE_LABEL, safeToken: SAFE_TOKEN })
    if (why) return badRequest(c, why)
    const jobKey = typeof body.jobKey === 'string' ? body.jobKey : ''
    if (jobKey !== '' && !SAFE_JOB_KEY.test(jobKey)) return badRequest(c, 'refused jobKey')
    const id = jobKey === '' ? jobId() : keyedJobId(jobKey)
    const start = async () => {
      if (jobKey !== '' && (await jobs.get(id))) return c.json({ jobId: id, reused: true }, 202)
      await jobs.put(id, { state: 'queued', step: 'queued', label: body.label })
      runPrefetchJob({ jobId: id, body, config, jobs, run }).catch(() => {})
      return c.json({ jobId: id }, 202)
    }
    return jobKey === '' ? start() : inTurn(id, start)
  }
}

/**
 * `POST /_host/site` — every webroot job (`WEBROOT_JOBS`, `webroot.js`), starting in the background
 * exactly like provision/teardown above, PLUS `core-manifest-write` (`webroot.js`'s
 * `writeCoreManifest`) — the counterpart to Python's `_site` (py:723-780) in full, both branches.
 */
function siteJobRoute({ config, jobs, run }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const kind = body.kind
    // The CMS admin log pull (site changes P2) — its own module, same job contract as a webroot job.
    if (kind === CMS_LOG_KIND) {
      if (!SAFE_LABEL.test(String(body.label ?? ''))) return badRequest(c, 'refused label')
      const refused = validateCmsLogBody(body)
      if (refused) return badRequest(c, refused)
      const id = jobId()
      await jobs.put(id, { state: 'queued', step: kind, label: body.label })
      runCmsLogJob({ jobId: id, body, config, jobs, run }).catch(() => {})
      return c.json({ jobId: id }, 202)
    }
    // A WordPress look's Additional CSS, checked or put back for turn undo — its own module too.
    if (kind === LOOK_CSS_KIND) {
      if (!SAFE_LABEL.test(String(body.label ?? ''))) return badRequest(c, 'refused label')
      const refused = validateLookCssBody(body)
      if (refused) return badRequest(c, refused)
      const id = jobId()
      await jobs.put(id, { state: 'queued', step: kind, label: body.label })
      runLookCssJob({ jobId: id, body, config, jobs, run }).catch(() => {})
      return c.json({ jobId: id }, 202)
    }
    // A design system put on a running site or taken off it (the Design system door) — its own module.
    if (kind === DS_SLOT_KIND) {
      if (!SAFE_LABEL.test(String(body.label ?? ''))) return badRequest(c, 'refused label')
      const refused = validateDsSlotBody(body)
      if (refused) return badRequest(c, refused)
      const id = jobId()
      await jobs.put(id, { state: 'queued', step: kind, label: body.label })
      runDsSlotJob({ jobId: id, body, config, jobs, run }).catch(() => {})
      return c.json({ jobId: id }, 202)
    }
    if (!Object.hasOwn(WEBROOT_JOBS, kind) && kind !== 'core-manifest-write') {
      return badRequest(c, 'unknown kind')
    }
    if (!body.label) return badRequest(c, 'need label')

    if (kind === 'core-manifest-write') {
      // DELIBERATELY STRICTER than Python here — the fourth disclosed departure, same reasoning as
      // `/_host/agent-token`'s: Python's own `_site` validates this branch's label with the
      // generic `SAFE_ARG` (py:750), which allows `/` and `..`, then interpolates it straight into
      // `f"/srv/tracy/{label}"` (py:751-752) — an arbitrary file read/write off this host for a
      // crafted label. `SAFE_LABEL` closes that the same way it already does for
      // `/_host/provision` and `/_host/agent-token`.
      if (!SAFE_LABEL.test(String(body.label))) return badRequest(c, 'refused label')
      const result = await writeCoreManifest({
        label: String(body.label),
        contentBase64: body.contentBase64,
        config
      })
      if ('error' in result) {
        return result.status === 404 ? c.json({ code: 'NOT_FOUND' }, 404) : badRequest(c, result.error)
      }
      const id = jobId()
      // Done immediately — there is no background step for a poller to catch mid-flight; this
      // writes the file synchronously above and only THEN records the job, matching py's own
      // `write_job(job_id, state="done", ...)` called after the file is already on disk.
      await jobs.put(id, {
        state: 'done',
        step: kind,
        label: body.label,
        output: JSON.stringify({ ok: true, extensions: result.extensions })
      })
      return c.json({ jobId: id }, 202)
    }

    // SAFE_LABEL, not py's own SAFE_ARG (py: `SAFE_ARG.match` on this door): the label becomes a
    // path under the sites root in every webroot script (`scripts/lib/roots.sh`), and SAFE_ARG lets
    // `../..` and `a/b` through (QA run 20/10/2026). Every label provision makes passes SAFE_LABEL.
    if (!SAFE_LABEL.test(String(body.label))) return badRequest(c, 'refused label')
    const error = validateWebrootBody(body, { exportOverHttp: config.exportOverHttp === true })
    if (error) return badRequest(c, error)

    const id = jobId()
    await jobs.put(id, { state: 'queued', step: kind, label: body.label })
    runWebrootJob({ jobId: id, body, config, jobs, run }).catch(() => {})
    return c.json({ jobId: id }, 202)
  }
}

/**
 * `POST /_host/agent-token` — the PAT for one label: read back if the site actually HOLDS the one
 * provision collected (`webroot.js`'s `readAgentTokenCustody`), MINTED if it does not
 * (`webroot.js`'s `mintAgentToken`). The counterpart to Python's `_agent_token` (py:598-622),
 * which only ever read. Synchronous: reading one or two small files is not a job worth a job id,
 * and minting is one or two queries against a database that is already up.
 *
 * 🔒 A MISSING FILE MEANS "MINT IT", AND SO DOES A FILE THE SITE ITSELF NEVER GOT. The second half
 * was added 20/09/2026: an EmDash site keeps the PAT in two places, and this door used to stop at
 * the first. See `readAgentTokenCustody` for what that cost. There is still no `{mint: true}` flag,
 * and the reason is that
 * nobody would ever have a use for the other answer. Every caller of this door is here BECAUSE it
 * holds no token — `pairComponent` (apps/tracy-web/src/sites/route.js) asks precisely when the
 * site has no component row — so a 404 is a dead end for all of them, and the one repair is
 * always the same. A flag would have to be threaded through `hostCall` and every caller after it,
 * with the caller that forgets it getting the dead end back silently: a second path whose only
 * purpose is to be taken by mistake. Minting is safe to make the default because it is not
 * destructive at any layer: the file short-circuits before a single SQL statement runs, a token
 * already in the component's params is adopted rather than replaced, and the `UPDATE` only matches
 * a row whose token is still empty (`mint-agent-token.sh`'s own race guard).
 *
 * DELIBERATELY STRICTER than Python here — a third disclosed departure, same shape as
 * `provision.js`'s own `SAFE_LABEL` comment. Python's `_agent_token` checks the generic `SAFE_ARG`
 * (py: `SAFE_ARG.match(str(label))`), which allows `/` and `..`: a label like `../../etc/passwd`
 * passes it and reaches `f"/srv/tracy/{label}/tracy-agent.token"` unfiltered, walking the read
 * outside `privateRoot`. `SAFE_LABEL` closes that the same way it already does for
 * `/_host/provision` — no real label (a Docker-container-name-shaped string) is refused by it.
 */
function agentTokenRoute({ config, run }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const label = body.label
    if (!label || !SAFE_LABEL.test(String(label))) return badRequest(c, 'refused label')
    // 🔒 CUSTODY, NOT PRESENCE — see `readAgentTokenCustody`. Asking "is there a file here" is
    // what let an EmDash site pair green for a token its own container had never been given.
    const held = await readAgentTokenCustody({ label: String(label), config })
    if (held.complete) return c.json({ token: held.token })
    // 🔒 CUSTODY THIS DOOR CANNOT PROVE IS NEITHER ANSWERED NOR REPAIRED (fail closed,
    // 23/09/2026). The host token may not be what the container reads, and the legacy repair
    // replaces the inode a container may be holding — so no token and no mint, only the code that
    // names the repair. No runtime mount check here: that is `emdash/migrate-token-mount.mjs`'s job.
    if (held.custody === 'unknown')
      return c.json(
        {
          code: 'TOKEN_CUSTODY_UNKNOWN',
          detail:
            'the agent token custody cannot be proven from the host: the site compose file is missing, unreadable or not a provable read-only bind of the host token, or it declares no mount while the host token file exists, or it binds the host token while that file is gone, or the host token is not one root-owned 0600 regular file; verify with emdash/migrate-token-mount.mjs (emdash/README.md)'
        },
        MINT_TOKEN_STATUS.TOKEN_CUSTODY_UNKNOWN
      )
    const minted = await mintAgentToken({ label: String(label), config, run })
    if ('token' in minted) return c.json({ token: minted.token })
    // 🔒 A HALF-HEALED SITE ANSWERS WITH THE FAILURE, NOT WITH THE TOKEN IT STILL HOLDS. Handing
    // `held.token` back when the re-mint fails would restore the exact green-but-blind pairing
    // this door was changed to end — and it would hide the one line saying why (`SITE_DOWN`:
    // start the site first). Fail closed, and name the repair; the caller is a door, and a
    // refusal it can act on beats a success the agent will discover is worthless.
    // The script's own code, not a bare 404: "this host has no such site", "the site is down" and
    // "the component was never installed" are one repair apart, and they used to arrive identical.
    return c.json({ code: minted.error, detail: minted.detail }, minted.status)
  }
}

/**
 * `POST /_host/content-token` — the read-only Content API relay PAT of one EmDash site
 * (`webroot.js`'s `readContentToken`). tracy-web asks for it on a `content.read` Apply and keeps
 * it server-side; it never reaches the browser or the agent. Read-only: this door never mints,
 * because the token's hash is in the site database and its digest in the container env, both
 * written by provision. No file, or a file provision would not have left: 404 `NO_CONTENT_API`.
 */
function contentTokenRoute({ config }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const label = body.label
    if (!label || !SAFE_LABEL.test(String(label))) return badRequest(c, 'refused label')
    const token = await readContentToken({ label: String(label), config })
    if (!token) return c.json({ code: 'NO_CONTENT_API' }, 404)
    return c.json({ token })
  }
}

/**
 * `POST /_host/display-locale` — the language tag an EmDash site prints, written where its template
 * reads it (`display-locale.js`). Synchronous: one small file. Apply calls it after the template's
 * personalize tool decided the tag from outside the container (#1013).
 */
function displayLocaleRoute({ config }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const label = body.label
    if (!label || !SAFE_LABEL.test(String(label))) return badRequest(c, 'refused label')
    const done = await writeDisplayLocale({ label: String(label), locales: body.locales, config })
    if (done.ok) return c.json({ ok: true })
    const status = { BAD_LOCALES: 400, NOT_EMDASH: 404, NO_DATA_DIR: 404, NOT_A_FILE: 409 }[done.code] ?? 500
    return c.json({ code: done.code, ...(done.detail ? { detail: done.detail } : {}) }, status)
  }
}

/**
 * `POST /_host/site-files` — one site's language files and template sources, read-only, for
 * `content.locate` (`site-files.js`). Synchronous like `/_host/content-token`: a directory walk and
 * a few megabytes of reading answer in well under a second, and a caller that already holds the
 * current set sends its fingerprint back and receives no bytes at all.
 */
function siteFilesRoute({ config }) {
  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const label = body.label
    if (!label || !SAFE_LABEL.test(String(label))) return badRequest(c, 'refused label')
    if (body.locale !== undefined && body.locale !== null && typeof body.locale !== 'string')
      return badRequest(c, 'locale must be text')
    if (body.known !== undefined && body.known !== null && typeof body.known !== 'string')
      return badRequest(c, 'known must be a fingerprint')
    const read = await readSiteFiles({
      label: String(label),
      locale: body.locale ?? null,
      known: body.known ?? null,
      config
    })
    return c.json(read.body, /** @type {any} */ (read.status))
  }
}

/**
 * `POST /_host/address` — one ingress rule through the Cloudflare API (`webroot.js`'s
 * `runIngressUpdate`), gated behind `config.cloudflare`: unset (a local box, no tunnel) answers
 * `501 NOT_CONFIGURED` before this ever shells out to a script that would only fail three layers
 * down. Synchronous, same reasoning as `/_host/attach` — one API call, not a job worth an id.
 */
function addressRoute({ config, run }) {
  return async (c) => {
    if (!config.cloudflare) return c.json({ code: 'NOT_CONFIGURED' }, 501)
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    if (!body.label || !SAFE_ARG.test(String(body.label))) return badRequest(c, 'refused label')
    if (!body.hostname || !SAFE_DOMAIN.test(String(body.hostname))) return badRequest(c, 'refused hostname')
    // `remove: true` takes the rule (and, with `dns`, the record) away instead — a demo moving to
    // another host must not leave its own record here, or the name keeps landing on this tunnel.
    if (body.remove !== undefined && typeof body.remove !== 'boolean') return badRequest(c, 'refused remove')
    const remove = body.remove === true
    const port = Number(body.port)
    if (!remove && !Number.isFinite(port)) return badRequest(c, 'refused port')
    // `dns: true` also writes the hostname's own DNS record at this tunnel. A customer copy under
    // the fleet zone never needs it (a wildcard record already points the zone here); a public
    // demo on a second host does, because that same wildcard points everywhere else.
    if (body.dns !== undefined && typeof body.dns !== 'boolean') return badRequest(c, 'refused dns')

    const result = await runIngressUpdate({
      body: remove
        ? { hostname: String(body.hostname), remove: true, dns: body.dns === true }
        : { hostname: String(body.hostname), port: Math.trunc(port), dns: body.dns === true },
      config,
      run
    })
    if (result.code !== 0) {
      return c.json({ code: 'INGRESS_FAILED', output: result.tail.join('\n') }, 500)
    }
    return c.json({ ok: true })
  }
}

/**
 * `POST /_host/go-live` `{label, op, domains?, jobKey?, routingTarget?, routeGen?, attempt?}` — flips a copy
 * between draft and live, or takes one of its own domains out (`op: 'drop-domain'`): `go-live.sh`,
 * `webroot.js`'s `runGoLiveJob`. `config.cloudflare` is asked for only by an ask that names a
 * domain (`NOT_CONFIGURED` otherwise); a publish or a draft at the Tracy address needs none.
 * Background job, same
 * fire-and-forget shape as provision/teardown — the counterpart to Python's `_go_live`
 * (py:624-479 header, `go_live()` py:450-479).
 *
 * Fix round 2: restores two of py's `_go_live` pre-checks this route had dropped — the
 * unknown-body-key rejection and the `os.path.isdir` existence check that answers a synchronous
 * 404 for a label with no site directory, instead of a 202 followed by an async failure. Same
 * class of drift as Task 3's `need webrootKey` fix: a caller can observe the difference, so it's
 * restored. `go-live.sh:51` still guards with `[ -d "$SITE_DIR" ]` on its own, so nothing was ever
 * unsafe — this is only about the door answering the way the old service answered.
 */
/** A Cloudflare tunnel id: a UUID. Anything else is not put into a DNS record a customer copies. */
const TUNNEL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** This host's routing target as its configuration stands now, or null when it has none. */
export function routingTargetOf(config) {
  const tunnel = config.cloudflare?.tunnel
  if (typeof tunnel !== 'string' || !TUNNEL_ID.test(tunnel)) return null
  return `${tunnel.toLowerCase()}.cfargotunnel.com`
}

/**
 * `POST /_host/routing-target` — the name a customer's own domain must point at to reach this
 * host: the tunnel's public name, `<tunnel-id>.cfargotunnel.com`, the CNAME `go-live.sh` tells the
 * customer to add. Only that name leaves: never the token, never the account. No tunnel
 * configuration (a local box), or a tunnel id that is not one: `501 NOT_CONFIGURED`.
 */
function routingTargetRoute({ config }) {
  return (c) => {
    // The door reads nothing from its body, and says so: a caller that sends it a field expects
    // that field to count (a label, a tunnel) — refused, like every other door here.
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const extra = Object.keys(body)[0]
    if (extra !== undefined) return badRequest(c, `refused ${extra.slice(0, 40)}`)
    const target = routingTargetOf(config)
    if (!target) return c.json({ code: 'NOT_CONFIGURED' }, 501)
    return c.json({ target })
  }
}

/**
 * A customer's own domain as this door takes one: lower case, at least two labels, no label that
 * starts or ends with a hyphen, at most 253 characters, and a last label that is not a number.
 *
 * 🔒 EXACTLY THE NAMES THE SITE'S RECORD OF ITS DOMAINS MAY HOLD (`lib/site-lifecycle.sh`
 * `tracy_golive_ledger`). `go-live.sh` writes every domain it is given into that record, and every
 * later go-live and teardown of the site refuses a record with a line that is not such a name. A
 * name `SAFE_DOMAIN` lets through and the record does not (`Example.COM`) would be written once and
 * lock the site out of every later lifecycle step. An IP address is not a domain: nobody proves one
 * by DNS, and a rule for it would answer for whatever is told to send that Host.
 */
const GO_LIVE_DOMAIN =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
const goLiveDomain = (domain) =>
  typeof domain === 'string' &&
  SAFE_DOMAIN.test(domain) &&
  GO_LIVE_DOMAIN.test(domain) &&
  !/\.\d+$/.test(domain)

/**
 * The directions `go-live.sh` takes (`drop-domain` takes ONE of the site's own domains out), and
 * `teardown`: the whole site off this host (`teardown.sh`), asked for through THIS door when it is
 * an operation of the site — deleting it — so that it has what every other one has: a key that
 * names one job however often it is asked for, an outcome that is only the script's own, and a
 * failed run taken up again where it stopped. (`POST /_host/teardown` stays for callers with no
 * operation to hold: an unkeyed job, started every time it is asked for.)
 */
const GO_LIVE_OPS = ['live', 'draft', 'drop-domain', 'teardown']
/** The most times one key may be asked to run its cleanup again (`attempt`). */
const MAX_ATTEMPT = 1000

function goLiveRoute({ config, jobs, run }) {
  // 🔒 ONE GO-LIVE PER SITE AT A TIME. `go-live.sh` moves a firewall rule, a mail setting and an
  // Apache conf one after another; a `live` and a `draft` of one site running side by side end in
  // whichever order their steps happen to land. The second caller is told which job holds the site
  // (`GO_LIVE_BUSY`, with its id and direction). In memory, so gone with a restart — the script
  // takes the site's lock itself (`go-live.sh`, exit 75), which is what still holds then.
  //
  // 🔒 `jobKey` MAKES THE ASK REPEATABLE, the same way it does for a provision: the same key names
  // the same job, so a caller whose answer never arrived asks again and is told the job it already
  // has — queued, running, done or failed — and nothing is started beside it.
  //
  // 🔒 AND A RECORD THAT IS NOT AN OUTCOME IS RUN AGAIN UNDER THE SAME KEY. Only a record that
  // carries the script's own exit code says what the script did (`hasOutcome`). One this host's
  // restart marked failed (`orphanedAt`), one whose script found the site locked by an earlier run
  // (`busy`, exit 75), one written when the run or its record could not be observed (no exit code),
  // and one left `queued`/`running` that nothing in this process is running, all say nothing. Asked
  // again for that key the job is started again — a go-live does the same work whether run once or
  // twice — and while an earlier script is still at work the new run ends `busy`, having changed
  // nothing.
  //
  // 🔒 THE KEY IS LOOKED UP FIRST, BEFORE ANYTHING ABOUT THE HOST AS IT STANDS NOW IS CHECKED. The
  // site's folder and the tunnel configuration can both change after a job was taken; a caller that
  // never heard the 202 and asks again must still be told the job it has, not "no such site" as if
  // nothing had ever started. So a keyed ask reads the guard and the job store before the
  // configuration, the label, the op and the folder are looked at, and one key's asks are answered
  // one after another (`inTurn`), so a second ask never reads "nothing held" while the first is
  // between its checks and its record.
  //
  // 🔒 A KEY THIS HOST TAKES IS MARKED AS TAKEN ON DISK BEFORE ANYTHING ELSE HAPPENS TO IT
  // (`jobs.accept`, `jobs.js` `acceptJob`): a small file of its own beside the job's record, synced
  // before the record is written, the script is started or 202 is answered. The record cannot carry
  // this: it is rewritten all through the run, and `jobs.get` answers null alike for one that was
  // never written, one that was deleted, one that is half-written and one that cannot be read. A
  // mark that cannot be written means the key is NOT taken: 503 `JOB_STORE_UNAVAILABLE`, nothing
  // recorded, nothing run.
  //
  // 🔒 AND EVERY REFUSAL TO A KEYED ASK SAYS WHETHER THE KEY WAS EVER TAKEN (`accepted`) — FROM THAT
  // MARK, NEVER FROM THE RECORD BEING ABSENT. `true`, with the job id: the mark is there (or a record
  // is — which only a taken key leaves). The job may have no readable record at all; the answer is
  // then "taken, outcome unknown". `false`: the mark's path was looked at and does not exist, and no
  // record does either — no script ever ran for the key; the one refusal a caller may end its
  // operation on. NO `accepted` AT ALL: the mark could not be looked at (a directory that cannot be
  // searched, an I/O error, something that is not a file under its name), the ask has no key, or its
  // key could not be read. A caller treats that as it treats silence.
  /** @type {Map<string, { jobId: string, op: string }>} */
  const running = new Map()
  /** Run `work` after every earlier ask for the same job id has been answered. */
  const inTurn = turnsById()
  /**
   * Check the ask against the host as it stands and start its job. `known` is the record the job
   * store already has under a keyed ask's id (one that is no outcome), or null. `marked` is what
   * the acceptance mark of a keyed ask's id says: true (there), false (looked, not there) or null
   * (could not be looked at; also an ask without a key).
   */
  async function take(c, body, id, known, marked) {
    const jobKey = body.jobKey
    // What a keyed ask is told beside any refusal: whether this host ever took the key.
    const taken =
      jobKey === undefined
        ? {}
        : marked === true || known
          ? { accepted: true, jobId: id }
          : marked === false
            ? { accepted: false }
            : {}
    const refuse = (why) => c.json({ code: 'BAD_REQUEST', why, ...taken }, 400)
    const label = body.label
    // SAFE_LABEL, not py's own SAFE_ARG here — same departure as `/_host/agent-token` and
    // `core-manifest-write`'s label, same reasoning: this label reaches a filesystem path below.
    if (typeof label !== 'string' || !SAFE_LABEL.test(label)) return refuse('refused label')
    // Shape first, existence after (the Python original's own comment) — an op that
    // never had a default so a caller's typo never flips the wrong way.
    if (!GO_LIVE_OPS.includes(body.op)) return refuse('need op: live, draft, drop-domain or teardown')
    // 🔒 A FIELD THAT IS THERE IS READ AS WHAT IT IS, NEVER AS ITS DEFAULT. `domains: null` used to
    // read as "no domains" and `attempt: null` as the first run: a caller that lost its list, or its
    // count, on the way here was given a job for an ask it never made. Only a field that is absent
    // has a default; `null` and every other wrong type are refused below, before anything is written.
    const domains = body.domains === undefined ? [] : body.domains
    if (!Array.isArray(domains) || domains.length > 10) return refuse('refused domains')
    for (const domain of domains) {
      if (!goLiveDomain(domain)) return refuse(`refused domain: ${String(domain).slice(0, 120)}`)
    }
    // One name twice is one `--domain` twice: the script would add, or count, it twice.
    if (new Set(domains).size !== domains.length) return refuse('refused domains: a name is there twice')
    if (body.op === 'drop-domain' && domains.length !== 1)
      return refuse('drop-domain needs exactly one domain')
    // The site's own record says which domains it has; a teardown is told none.
    if (body.op === 'teardown' && domains.length !== 0) return refuse('teardown takes no domains')
    // py:643-645 — a caller sending anything beyond what this door reads is refused, not silently
    // ignored (fail-open on an unknown field is a bug class in this repo, not a style choice).
    for (const key of Object.keys(body)) {
      if (
        ![
          'label',
          'op',
          'domains',
          'jobKey',
          'routingTarget',
          'routeGen',
          'attempt',
          'publicOrigin'
        ].includes(key)
      )
        return refuse(`refused ${key}`)
    }
    // The generation of the own-domain routes this run writes or removes (#1037): tracy-web's own
    // rising number, kept beside each route so an older run never removes a newer one's
    // (`ingress_api.py`). It is about domains, and goes only with an ask that names some.
    const routeGen = body.routeGen
    if (routeGen !== undefined && (!Number.isSafeInteger(routeGen) || routeGen < 1))
      return refuse('refused routeGen')
    if (routeGen !== undefined && domains.length === 0) return refuse('routeGen goes with domains')
    // What the caller measured the domains to point at (`live` with domains only).
    const proven = body.routingTarget
    if (proven !== undefined && !goLiveDomain(proven)) return refuse('refused routingTarget')
    if (proven !== undefined && (body.op !== 'live' || domains.length === 0))
      return refuse('routingTarget goes with a live that carries domains')
    // Which run of the key this is (`hasOutcomeFor`): only a keyed ask has runs to count.
    const attempt = body.attempt === undefined ? 0 : body.attempt
    if (!Number.isInteger(attempt) || attempt < 0 || attempt > MAX_ATTEMPT) return refuse('refused attempt')
    if (attempt > 0 && jobKey === undefined) return refuse('attempt needs a jobKey')

    // 🔒 THE TUNNEL IS NEEDED ONLY BY AN ASK THAT NAMES A DOMAIN, AND IS LOOKED FOR ONLY THEN. This
    // door used to answer 501 to every ask on a host with no tunnel configuration, before it read
    // the request: a site could not be published at its Tracy address, or taken back to draft, on a
    // host that never had a tunnel (a local box, a host behind another front) — though neither
    // touches one. After the request is known to be well-formed, so a malformed ask is told so on
    // any host.
    if (domains.length > 0 && !config.cloudflare && config.tunnelMode !== 'catch-all')
      return c.json({ code: 'NOT_CONFIGURED', ...taken }, 501)
    // 🔒 PROVEN AGAINST ANOTHER TUNNEL IS NOT PROVEN. The caller measured DNS to point at the target
    // it names; when this host writes to another tunnel now, that proof was of somewhere else, and
    // the rule would be added for a name that does not lead here.
    if (proven !== undefined && proven !== routingTargetOf(config))
      return c.json({ code: 'ROUTING_TARGET_CHANGED', ...taken }, 409)

    // py:647-648 — shape first, existence after (see the shape-first comment above): checked
    // last among the synchronous validations, right before a job would otherwise be created.
    // 🔒 NOT FOR A TEARDOWN: "NO FOLDER" IS WHERE A TEARDOWN ENDS, NOT A REASON TO REFUSE ONE. A run
    // whose answer was lost, or one that failed after the folder went, is asked for again with the
    // folder already gone; `teardown.sh` then does what is left (rules, volumes, records) and says
    // `torn_down=1` only when nothing is. Refused here, the caller would hold a site for ever that
    // this host no longer has.
    if (body.op !== 'teardown' && !(await isDirectory(path.join(config.privateRoot, String(label))))) {
      return c.json({ code: 'NOT_FOUND', ...taken }, 404)
    }

    // Read after the await above: another call may have taken the site meanwhile.
    const held = running.get(String(label))
    if (held?.jobId === id) return c.json({ jobId: id, reused: true }, 202)
    if (held) return c.json({ code: 'GO_LIVE_BUSY', jobId: held.jobId, op: held.op }, 409)
    // Held before the next await, so two calls that arrive together cannot both pass the check.
    running.set(String(label), { jobId: id, op: body.op })
    const release = () => {
      if (running.get(String(label))?.jobId === id) running.delete(String(label))
    }
    if (jobKey !== undefined) {
      // The mark first, and synced: from here on this key reads "taken" whatever becomes of its
      // record. Not written → not taken, and nothing below runs. No `accepted` in that answer: a
      // write that failed half-way may still have left the mark.
      try {
        await jobs.accept(id)
      } catch {
        release()
        return c.json({ code: 'JOB_STORE_UNAVAILABLE', jobId: id }, 503)
      }
    }
    try {
      await jobs.put(id, {
        state: 'queued',
        step: `go-live:${body.op}`,
        label,
        ...(jobKey === undefined ? {} : { jobKey, attempt }),
        // A run again under the same key starts from a clean record: nothing of the run before it
        // may read as this one's ending. Also when no record could be read (`known` null) while the
        // mark says the key was taken: what is on disk under the id may be a damaged one.
        ...(known || (jobKey !== undefined && marked !== false)
          ? {
              orphanedAt: null,
              busy: false,
              unobserved: false,
              signal: null,
              timedOut: false,
              exitCode: null,
              output: null,
              detail: null
            }
          : {})
      })
    } catch (error) {
      release()
      throw error
    }
    runGoLiveJob({ jobId: id, body, config, jobs, run })
      .catch(() => {})
      .finally(release)
    return c.json({ jobId: id }, 202)
  }

  return async (c) => {
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    try {
      if (body.publicOrigin !== undefined) body.publicOrigin = publicOriginOf(body.publicOrigin)
    } catch {
      return badRequest(c, 'refused publicOrigin')
    }
    const jobKey = body.jobKey
    if (jobKey !== undefined && (typeof jobKey !== 'string' || !SAFE_JOB_KEY.test(jobKey)))
      return badRequest(c, 'refused jobKey')
    if (jobKey === undefined) return take(c, body, jobId(), null, null)
    const id = keyedJobId(`go-live:${jobKey}`)
    return inTurn(id, async () => {
      // Held: the job is being written or run right now. Still the same job.
      for (const held of running.values())
        if (held.jobId === id) return c.json({ jobId: id, reused: true }, 202)
      // The mark, then the record. A mark that cannot be looked at is neither yes nor no.
      const marked = await Promise.resolve()
        .then(() => jobs.accepted(id))
        .then(
          (found) => (found === true ? true : found === false ? false : null),
          () => null
        )
      const known = await jobs.get(id)
      // Asking again for a job that has an outcome is not a second go-live.
      if (known && hasOutcomeFor(known, body.attempt)) return c.json({ jobId: id, reused: true }, 202)
      return take(c, body, id, known, marked)
    })
  }
}

/**
 * Whether a go-live job's record is its script's outcome: `done` with exit code 0, or `failed` with
 * the script's own non-zero exit code. Everything else is not — still `queued`/`running`, marked
 * failed by this host's restart (`orphanedAt`, `orphanJobs`), ended on the site's lock (`busy`, exit
 * 75), or a record with no exit code (the run or the write of its ending could not be observed).
 */
function hasOutcome(job) {
  if (job.orphanedAt != null || job.busy === true || job.unobserved === true) return false
  if (job.state === 'done') return job.exitCode === 0
  if (job.state !== 'failed') return false
  return Number.isInteger(job.exitCode) && job.exitCode !== 0 && job.exitCode !== GO_LIVE_BUSY_EXIT
}

/**
 * Whether the record answers an ask for run number `attempt` of its key.
 *
 * 🔒 A CLEANUP THAT FAILED MAY BE ASKED FOR AGAIN UNDER ITS OWN KEY — AND ONLY BY SAYING SO. A
 * `draft`, `drop-domain` or `teardown` whose script ended non-zero left something behind (a rule still in the
 * tunnel, a name still on record); the caller asks for the same operation again with the next
 * `attempt`, and the script does what is still left (each of its steps looks before it acts). An
 * ask that names no higher attempt than the record's is answered the job it already has, as ever:
 * nothing reruns because a failed job was merely looked at again. A job that ended `done` is never
 * run again, whatever attempt is asked for, and a `live` is not a cleanup.
 */
function hasOutcomeFor(job, attempt) {
  if (!hasOutcome(job)) return false
  if (job.state === 'done') return true
  const asked = Number.isInteger(attempt) ? attempt : 0
  const ran = Number.isInteger(job.attempt) ? job.attempt : 0
  if (asked <= ran) return true
  return !['go-live:draft', 'go-live:drop-domain', 'go-live:teardown'].includes(job.step)
}

/**
 * `POST /_host/outline` — read a demo's own shape: what it calls itself, where its top-level
 * navigation goes, and whether it has a dark mode.
 *
 * The same target rule as `/capture`, composed here from the same three pieces, because this reads
 * a page on the same machine for the same reason and must not gain a wider reach by being newer.
 */
function outlineRoute({ outline }) {
  return async (c) => {
    if (!outline) return c.json({ code: 'NO_BROWSER' }, 503)
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const asked = captureBody({ ...body, layouts: [{ key: 'home', path: '/' }] })
    if (asked.error) return badRequest(c, asked.error)
    const url = captureTarget(asked.label, asked.platform, asked.port, asked.host)
    try {
      return c.json(await outline({ url }), 200)
    } catch (error) {
      return c.json({ code: 'OUTLINE_FAILED', why: String(error?.message ?? error).slice(0, 400) }, 502)
    }
  }
}

/**
 * `POST /_host/capture` — screenshot a demo's layouts at both card viewports (`capture.js`).
 * Synchronous: a card has a handful of layouts, and tracy-web is waiting on the pictures, not a
 * job id to poll. The browser is injected as `shoot`; a host wired without one answers
 * `503 NO_BROWSER` rather than 500 — a demo host without a browser is a configuration a caller
 * should read, not a crash.
 */
function captureRoute({ shoot, timeoutMs, reach = reachableBase, proxyOrigin = null }) {
  return async (c) => {
    if (!shoot) return c.json({ code: 'NO_BROWSER' }, 503)
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    if (body.mode !== undefined && body.mode !== 'vision-tiles/1')
      return badRequest(c, 'Unknown capture mode')
    const asked = captureBody(body)
    if (asked.error) return badRequest(c, asked.error)
    // Probed like `/demo-qa`, never assumed (23/10/2026): on the macOS stand tracy-host sits on the compose
    // network, the loopback port refuses, and every shot of a finished demo's vision look failed.
    // Opened at the name the demo gives itself when the caller names it (`publicOrigin`), as `/demo-qa` does: on the
    // stand WordPress redirected every page but home to `<label>-web-1:8080` (24/10/2026).
    if (body.mode === 'vision-tiles/1') {
      if (!shoot.vision) return c.json({ code: 'VISION_STREAM_UNAVAILABLE' }, 503)
      const controller = new AbortController()
      const signal = AbortSignal.any([controller.signal, c.req.raw.signal])
      const timer = setTimeout(() => controller.abort(new Error('Vision capture deadline')), 240_000)
      try {
        const address = await demoAddress(asked, { reach, signal, proxyOrigin })
        signal.throwIfAborted()
        return new Response(
          visionStream(
            shoot.vision({ ...asked, ...address, siteHosts: [asked.host].filter(Boolean), signal }),
            {
              signal,
              cancel: () => controller.abort(),
              close: () => clearTimeout(timer)
            }
          ),
          {
            headers: {
              'content-type': 'application/x-ndjson',
              'cache-control': 'no-store',
              'x-accel-buffering': 'no'
            }
          }
        )
      } catch {
        clearTimeout(timer)
        return c.json({ code: 'VISION_CAPTURE_FAILED' }, 502)
      }
    }
    const address = await demoAddress(asked, { reach, proxyOrigin })
    const result = await runCapture({ ...asked, shoot, timeoutMs, ...address })
    return c.json(result, 200)
  }
}

/**
 * `POST /_host/demo-qa` — the QA gate after a demo is handed to its agent (`demo-qa.js`): read the
 * named pages of the site in a browser and judge them, or, with no baseline, take the baseline.
 * Synchronous like `/capture`: at most seven pages, each held to its own time box. Same target rule
 * as `/capture` — a label, a port, a hostname; never a URL.
 */
function demoQaRoute({ demoQa, proxyOrigin = null }) {
  return async (c) => {
    if (!demoQa) return c.json({ code: 'NO_BROWSER' }, 503)
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const asked = demoQaBody(body)
    if (asked.error) return badRequest(c, asked.error)
    // A host-networked tracy-host reaches the loopback port; one inside the compose network (the
    // macOS stand) reaches the web container's name — probe, never assume (18/10/2026).
    // The site's own name, when home writes one on its published host and it is not the reachable
    // address (the stand): pages open at that name and are served from the reachable one.
    const deadline = qaDeadline(asked, c.req.raw.signal)
    try {
      const address = await demoAddress(asked, { discover: true, signal: deadline.signal, proxyOrigin })
      deadline.signal.throwIfAborted()
      return c.json(await demoQa({ asked, ...address, signal: deadline.signal }), 200)
    } catch (error) {
      const code = error?.code === 'DEMO_QA_DEADLINE' ? error.code : 'DEMO_QA_FAILED'
      return c.json({ code, why: String(error?.message ?? error).slice(0, 400) }, 502)
    } finally {
      deadline.dispose()
    }
  }
}

/**
 * `POST /_host/picture-overlap` — the safety net after a brief build (spec TracyHQ/tracy#189): the build's pictures (under
 * `folder`) that cover a heading, a paragraph, a button or the logo on the named pages at any visitor width
 * (`picture-overlap-browser.js`). Same target rule as `/demo-qa`: a label, a port, a hostname; never a URL. It only reads.
 */
function pictureOverlapRoute({ pictureOverlap, proxyOrigin = null }) {
  return async (c) => {
    if (!pictureOverlap) return c.json({ code: 'NO_BROWSER' }, 503)
    const { body, refused } = bodyObject(c)
    if (refused) return refused
    const asked = demoQaBody(body)
    if (asked.error) return badRequest(c, asked.error)
    const folder = overlapFolderOf(body.folder)
    if (!folder) return badRequest(c, 'refused folder')
    const deadline = qaDeadline({ budgetMs: 120_000 }, c.req.raw.signal)
    try {
      const address = await demoAddress(asked, { discover: true, signal: deadline.signal, proxyOrigin })
      deadline.signal.throwIfAborted()
      return c.json(
        await pictureOverlap({ asked: { pages: asked.pages, folder }, ...address, signal: deadline.signal }),
        200
      )
    } catch (error) {
      const code = error?.code === 'DEMO_QA_DEADLINE' ? 'PICTURE_OVERLAP_DEADLINE' : 'PICTURE_OVERLAP_FAILED'
      return c.json({ code, why: String(error?.message ?? error).slice(0, 400) }, 502)
    } finally {
      deadline.dispose()
    }
  }
}

/**
 * `GET /health` — the fleet's own probe. Deliberately UNSIGNED: it carries no secret and answers
 * with nothing a stranger could use, the same call Docker health-checks and load balancers make
 * without a credential. `docker: true` means `run` could reach the docker daemon Task 3's
 * provision/webroot jobs need; `sitesRoot: true` means the directory sites get provisioned into
 * is writable by this process's own user, not just present in config.
 */
function healthRoute({ config, run }) {
  return async (c) => {
    const dockerResult = await run({ script: 'docker', args: ['version'], env: process.env })
    const sitesRoot = await access(config.sitesRoot, constants.W_OK)
      .then(() => true)
      .catch(() => false)
    return c.json({ docker: dockerResult.code === 0, sitesRoot })
  }
}

/**
 * @param {object} input
 * @param {object} input.config - `config.js`'s `readConfig(env)` shape (needs `hostSecret`,
 *   `sitesRoot`, `privateRoot`, `scriptsDir`, `logDir`).
 * @param {{put: (id: string, fields: object) => Promise<object>, get: (id: string) =>
 *   Promise<object|null>}|null} [input.jobs] - the job store `provision`/`attach`/`teardown`
 *   read and write; `server.js` binds it to `jobs.js` + `config.jobsDir`, a test wires an
 *   in-memory fake. Left `null` by default because `/health` (the only route in Task 1) never
 *   touched it — every route Task 3 adds requires a real one.
 * @param {(args: {script: string, args: string[], env: object, logPath?: string, onLine?:
 *   (line: string) => void}) => Promise<{code: number, tail: string[]}>} input.run - runs one
 *   command/script; injected so this file's tests never spawn a real process.
 * @param {object} [input.deps] - room for later tasks' injected seams (fetchImpl for the
 *   relay-git-token calls, etc.) — accepted and unused here on purpose, not yet needed by
 *   anything this task builds.
 * @returns {import('hono').Hono}
 */

/**
 * `POST /_host/model-keys` — put the keys the provider book holds where the agent reads them.
 *
 * WHY THIS HOST AND NOT THE DSH GATEWAY. `/desk-home/.credentials.yaml` is mounted into the
 * `tracy-dsh` container only; `tracy-web` cannot see it and holds no credential dsh would accept.
 * This process already carries the docker socket and already `docker exec`s into that container for
 * `/_host/dsh-versions`, so the shortest honest path is one more door here — signed with the same
 * `HOST_SECRET` `tracy-web` already knows how to sign.
 *
 * 🔒 THE KEY GOES DOWN STDIN, NEVER ARGV. Anything else on the host can read a process list; a key
 * in `docker exec … --set DEEPSEEK_API_KEY=sk-…` would be readable by every other container's
 * escape and by this app's own log tail. The shell below reads the document from stdin.
 *
 * 🔒 THE FILE MUST END UP 0600, or dsh's credential provider refuses to load it — and refusing to
 * load it is not a warning, it is the agent losing its key. `chmod` runs in the same shell as the
 * write so there is no window where the file exists world-readable.
 *
 * 🔒 THE `records:` BLOCK IS PRESERVED. That block holds dsh's own browser-session secret; replacing
 * the whole file would sign every open dsh session out. The script below rewrites only `refs:`.
 *
 * ⚠ IT IS HALF THE ANSWER. `credentials-local` treats an inherited non-empty environment value as
 * authoritative AND read-only, so while `DEEPSEEK_API_KEY` has a value in the container's
 * environment this file is shadowed and writing it changes nothing. The deployment must leave
 * `MODEL_API_KEY`/`OPENROUTER_API_KEY` empty for this door to have any effect — `deploy/.env.example`
 * says so beside those keys.
 */
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/

/** Rewrite (or create) the `refs:` block of the credential file, leave everything else alone. */
const REFS_SCRIPT = `set -eu
f=/desk-home/.credentials.yaml
tmp=$(mktemp)
payload=$(cat)
if [ -f "$f" ]; then
  # Everything that is not the refs block, in order: dsh's own records: section must survive.
  awk 'BEGIN{skip=0}
       /^refs:/{skip=1; next}
       skip==1 && /^[[:space:]]/{next}
       {skip=0; print}' "$f" > "$tmp"
else
  printf 'version: 1\n' > "$tmp"
fi
if [ -z "$payload" ]; then
  printf 'refs: {}\n' >> "$tmp"
else
  printf 'refs:\n%s\n' "$payload" >> "$tmp"
fi
cat "$tmp" > "$f"
rm -f "$tmp"
chmod 600 "$f"
`

function modelKeysRoute({ config, run }) {
  return async (c) => {
    let body
    try {
      body = JSON.parse(c.get('rawBody'))
    } catch {
      return badRequest(c, 'body is not JSON')
    }
    const keys = body?.keys
    if (!keys || typeof keys !== 'object' || Array.isArray(keys))
      return badRequest(c, 'keys must be an object')
    const names = Object.keys(keys)
    // Never an empty write: this door has no "clear everything" meaning, and an empty object
    // arriving from a half-built request must not be read as one.
    // ...except an explicit `clear: true` (the provider book holds nothing any more): then the refs
    // block is emptied, which is how a disabled provider's key leaves the machine.
    if (names.length === 0 && body.clear !== true) return badRequest(c, 'no keys')
    for (const name of names) {
      if (!ENV_NAME.test(name)) return badRequest(c, `not an environment variable name: ${name}`)
      if (typeof keys[name] !== 'string') return badRequest(c, `not a string: ${name}`)
      // dsh rejects an empty ref outright; removing a key means not sending it, not sending ''.
      if (keys[name] === '') return c.json({ code: 'EMPTY_VALUE', why: name }, 400)
    }

    // Values are quoted so a key containing `#` or a leading space survives the YAML round-trip.
    const payload = names.map((name) => `  ${name}: "${keys[name].replace(/"/g, '\\"')}"`).join('\n')
    const container = config.dshContainer ?? 'tracy-dsh'
    const result = await run({
      script: 'docker',
      args: ['exec', '-i', container, 'sh', '-c', REFS_SCRIPT],
      env: process.env,
      stdin: payload
    })
    if (result.code !== 0)
      return c.json({ code: 'WRITE_FAILED', detail: (result.tail ?? []).join('\n').slice(0, 500) }, 502)
    return c.json({ ok: true, wrote: names })
  }
}

export function buildApp({
  config,
  jobs = null,
  run,
  shoot = null,
  outline = null,
  demoQa = null,
  pictureOverlap = null,
  captureTimeoutMs = CAPTURE_TIMEOUT_MS,
  deps: _deps = {}
}) {
  const app = new Hono()
  // One queue of demo installs per running app (`install-slots.js`), with its free-memory floor.
  // `deps.memAvailableMb` lets a test say how much memory the host has.
  const slots = installSlots(config.demoInstallSlots ?? 2, {
    minFreeMb: config.demoInstallMinFreeMb ?? 0,
    ...(_deps.memAvailableMb ? { memAvailableMb: _deps.memAvailableMb } : {}),
    ...(_deps.memoryPollMs ? { pollMs: _deps.memoryPollMs } : {})
  })
  // One replay table per running app, not one per request — a fresh Map on every call would make
  // replay protection a no-op (see auth.js's own module comment on why `seen` defaults empty).
  const seen = new Map()

  app.get('/health', healthRoute({ config, run }))

  app.use('/_host/*', async (c, next) => {
    // Hono's request body can only be read once; every downstream handler must read it back from
    // `c.get('rawBody')` instead of calling `c.req.text()`/`c.req.json()` again.
    const body = await c.req.text()
    const headers = {
      'x-host-timestamp': c.req.header('x-host-timestamp') ?? '',
      'x-host-nonce': c.req.header('x-host-nonce') ?? '',
      'x-host-signature': c.req.header('x-host-signature') ?? ''
    }
    const result = await verifyHostCall({ secret: config.hostSecret, path: c.req.path, body, headers, seen })
    if (!result.ok) return c.json({ code: 'BAD_SIGNATURE', why: result.why }, 403)
    c.set('rawBody', body)
    await next()
  })

  // One turn per keyed job id, shared by provision and teardown (`turnsById`).
  const inTurn = turnsById()
  app.post('/_host/provision', provisionRoute({ config, jobs, run, slots, inTurn }))
  app.post('/_host/frame-policy', framePolicyRoute({ config, run }))
  app.get('/_host/jobs/:id', jobRoute({ jobs }))
  app.post('/_host/attach', attachRoute({ config }))
  app.post('/_host/reserve', reserveRoute({ config }))
  app.post('/_host/unreserve', reserveRoute({ config }, { remove: true }))
  app.post('/_host/teardown', teardownRoute({ config, jobs, run, inTurn }))
  app.post('/_host/prefetch', prefetchRoute({ config, jobs, run, inTurn }))
  app.post('/_host/site', siteJobRoute({ config, jobs, run }))
  app.post('/_host/agent-token', agentTokenRoute({ config, run }))
  app.post('/_host/content-token', contentTokenRoute({ config }))
  app.post('/_host/site-files', siteFilesRoute({ config }))
  app.post('/_host/display-locale', displayLocaleRoute({ config }))
  app.post('/_host/emdash-media', emdashMediaRoute({ config, run, safeLabel: SAFE_LABEL }))
  app.post('/_host/dsh-versions', async (c) => {
    const result = await run({
      script: 'node',
      args: [path.join(config.scriptsDir, 'provision/dsh-versions.mjs'), '--host', config.hostName]
    })
    if (result.code !== 0) return c.json({ code: 'HOST_INVENTORY_UNAVAILABLE' }, 502)
    try {
      const body = JSON.parse(result.tail.at(-1))
      if (!body?.container || !Array.isArray(body.packages)) throw new Error('invalid inventory')
      return c.json(body)
    } catch {
      return c.json({ code: 'HOST_INVENTORY_UNAVAILABLE' }, 502)
    }
  })
  app.post('/_host/model-keys', modelKeysRoute({ config, run }))
  app.post('/_host/address', addressRoute({ config, run }))
  app.post('/_host/go-live', goLiveRoute({ config, jobs, run }))
  app.post('/_host/routing-target', routingTargetRoute({ config }))
  app.post(
    '/_host/capture',
    captureRoute({ shoot, timeoutMs: captureTimeoutMs, proxyOrigin: config.siteProxyOrigin })
  )
  app.post('/_host/outline', outlineRoute({ outline }))
  app.post('/_host/demo-qa', demoQaRoute({ demoQa, proxyOrigin: config.siteProxyOrigin }))
  app.post(
    '/_host/picture-overlap',
    pictureOverlapRoute({ pictureOverlap, proxyOrigin: config.siteProxyOrigin })
  )

  return app
}

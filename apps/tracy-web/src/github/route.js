/**
 * The GitHub domain's two doors, plus the plain functions `sites/route.js` calls at the two
 * moments a site's repo matters (job-done, and minting a fresh push token for a provision run).
 *
 * Ported from `workers/seat-registry/src/index.js`: `handleFleetGitToken` (line 1003, ADR 0050
 * §3's "deploy half" — a token asked for outside a provision run, because the one `handleProvision`
 * minted died after its hour) and `handleGithubPushPolice` (line 1820, ADR 0068's second ear on the
 * same push event). `createRepoFor` carries `handleCreateRepo` (line 7686) narrowed to the one
 * thing this app's job-poll step needs — create the repo, wire the webhook, record it — MINUS the
 * seat/grant bootstrap dance (`ensureSiteOwnerSeat`, workspace-owner fallback) that surrounds it
 * there: this app's job-poll handler already holds a live grant by the time it calls this, so there
 * is no seat to bootstrap.
 *
 * ONE SECRET PER HOST, NOT ONE GLOBAL RELAY SECRET. The Worker's `handleFleetGitToken` verifies
 * against a single `env.FLEET_RELAY_SECRET` shared by every fleet host behind one relay
 * (ADR 0014's "before" picture). This app already has a distinct `HOST_<name>_SECRET` per host
 * (`config.js`'s `readHosts`, `host/client.js`'s outbound half) — this door is the inbound half of
 * that same per-host channel, so the caller names which host it is and this door checks that
 * host's own secret, never a shared one.
 *
 * THE PUSH POLICE INSPECTS THE DIFF, BUT NEVER SANCTIONS ONE. It carries the Worker's
 * `codePathsOf`/`pathMatches` verbatim: a push that only touches data files answers `{clean:
 * true}`, never `{alerted:true}` — a police that cries wolf on every ordinary push is one everyone
 * learns to ignore, the same as having none. What it does NOT carry is the merge/approve doors
 * that ever WRITE a row into `merge_ledger` (spec line 448: deliberately not ported in this plan)
 * — so a CODE push that is not in the ledger is always `{alerted:true}`, because there is no door
 * in this app yet through which a code push could have been sanctioned. That is a real, disclosed
 * capability gap (a legitimate code merge always alerts), not a bug in this file.
 */
import { Hono } from 'hono'

import { kickReadiness } from '../lib/customize-readiness.js'
import { kickDsReadiness } from '../lib/design-system-readiness.js'
import { refreshReleases, releaseEventWanted } from '../lib/quickstart-releases.js'
import { json, normalizeSiteKey } from '../lib/http.js'
import { hmacHex } from '../lib/hmac.js'
import {
  GitHubUnavailable,
  installationIdFor,
  mintTokenFor,
  createSiteRepo,
  deleteSiteRepo,
  ensureRepoWebhook
} from './app.js'
import { repoFor, siteRepoOwner, writeRepo, siteKeyOfRepo, mergeSanctioned } from './store.js'

const API = 'https://api.github.com'

function ghHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'tracy-web'
  }
}

/**
 * `.tracy/site.json`'s declared `codePaths` on `main`, or null when the repo has not declared
 * any (a fresh repo, or one that never opted in) — ported verbatim from `codePathsOf`
 * (`workers/seat-registry/src/index.js:1915-1928`). Null is read by the caller as "use the
 * default-deny fallback", not as "nothing is code."
 */
async function codePathsOf(fetchImpl, repo, token) {
  const response = await fetchImpl(`${API}/repos/${repo}/contents/.tracy/site.json?ref=main`, {
    headers: ghHeaders(token)
  })
  if (!response.ok) return null
  try {
    const payload = await response.json()
    const parsed = JSON.parse(
      Buffer.from((payload.content ?? '').replace(/\n/g, ''), 'base64').toString('utf8')
    )
    if (Array.isArray(parsed.codePaths) && parsed.codePaths.every((entry) => typeof entry === 'string')) {
      return parsed.codePaths
    }
  } catch {
    return null
  }
  return null
}

/**
 * Minimal `fnmatch` for a `codePaths` entry — ported verbatim from `pathMatches`
 * (`workers/seat-registry/src/index.js:1936-1943`): `**` is "everything below here", `*` never
 * crosses a `/`. Stricter than a real glob library on purpose (ADR 0008: an unrecognized pattern
 * matches LESS, never more — the error should lean toward a false alarm, not a missed one).
 */
function pathMatches(pattern, filePath) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
  return new RegExp(`^${escaped}$`).test(filePath)
}

/** No repo has declared `codePaths` yet: everything outside these data directories counts as
 * code — carried verbatim from the Worker's own default-deny list (`index.js:1869`). */
const DEFAULT_DATA_DIRS = /^(surface|digest|media|deliverables)\//

/**
 * Repos of Tracy's own the fleet may push to WITHOUT naming a site — carried verbatim from the
 * Worker's `FLEET_SHARED_REPOS`. There is exactly one: the public store every site's `Brand/<host>/`
 * publishes to (TCH ADR 0013). It belongs to no site, so no site record can vouch for it; this
 * closed list stands in for that vouching instead. Adding a name here grants every host write
 * access to that repo for as long as it stands — this is not a place to accept a caller's word.
 *
 * `config.hostOrg`, not a literal `'TracyHQ'` (Task 11): the GitHub org name now lives in one
 * place, `config.js`, and this door reads it rather than repeating it.
 * @param {object} config - `readConfig`'s value.
 * @returns {readonly string[]}
 */
function fleetSharedRepos(config) {
  return Object.freeze([`${config.hostOrg}/design-inspirations`])
}

/** Constant-time hex compare — `===` on a hex string leaks its shared prefix to a timing attack. */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** `x-tracy-signature`: plain `hex(HMAC-SHA256(hostSecret, rawBody))` — the fleet calling in, on
 * the same per-host secret `host/client.js` uses calling out. */
async function fleetSigned(secret, rawBody, header) {
  if (!secret || typeof header !== 'string') return false
  return timingSafeEqual(await hmacHex(secret, rawBody), header)
}

/** `x-hub-signature-256: sha256=<hex>` — GitHub's own webhook signature scheme. */
async function githubSignatureOk(secret, rawBody, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false
  return timingSafeEqual(await hmacHex(secret, rawBody), header.slice('sha256='.length))
}

/**
 * Mint a fresh installation token for a repo already known to exist — the pairing
 * (`installationIdFor` then `mintTokenFor`) the Worker repeats at every door that pushes code on a
 * site's behalf (`handleProvision`, `handleFleetGitToken`, `handleGithubPushPolice`), factored into
 * one place here instead of copied three times.
 *
 * @returns {Promise<{token: string, expiresAt: string}|null>} null when the App is not configured,
 *   not installed on the repo, or GitHub refuses — never thrown, because every caller of this
 *   treats "no token" as "proceed without the push", not as a fatal error.
 */
export async function mintGitToken(config, repo, fetchImpl = fetch) {
  if (!config.github) return null
  try {
    const installationId = await installationIdFor(config.github, repo, fetchImpl)
    if (installationId === null) return null
    return await mintTokenFor(config.github, installationId, repo.split('/')[1], fetchImpl)
  } catch (error) {
    if (error instanceof GitHubUnavailable) return null
    throw error
  }
}

/**
 * Create (or hand back) the private repo for one site, and (RE-)wire the push-police webhook onto
 * it — called on EVERY job-poll of a `done` job, after every other step of standing the site up
 * has already run, not just the first one.
 *
 * IDEMPOTENT-AND-REPAIRING, matching the Worker's own `handleCreateRepo`/`wireFleetRepo` pattern
 * (`index.js:730-742,7810-7830`): the repo itself is created at most once (checked against the
 * book before ever calling GitHub, so two overlapping polls never race to create two), but the
 * webhook is re-ensured on every call, including for a repo that already existed. That repeat call
 * is the ONLY self-repair path a failed webhook attach ever gets — `ensureRepoWebhook` is
 * idempotent by URL, so re-attaching a hook that is already there is a harmless PATCH, and
 * attaching one that failed to attach the first time (a real production incident the Worker's own
 * comment names: a repo can silently end up with no working webhook, and "nothing happened" looks
 * identical to "nobody pushed yet") finally succeeds once the transient cause clears. Skipping this
 * re-attempt whenever `site.repo` was already set was this port's own bug in its first round, not
 * a Worker behavior — see task-7-review.md's Important finding.
 *
 * @returns {Promise<{repo: string, cloneUrl: string, webhook: boolean, webhookReason?: string}
 *   | {code: 'NOT_CONFIGURED'|'REPO_NAME_TAKEN'|'GITHUB_UNAVAILABLE'}>}
 */
// ported: handleCreateRepo
export async function createRepoFor(pool, config, { siteKey, label, email }, fetchImpl = fetch) {
  if (!config.github) return { code: 'NOT_CONFIGURED' }

  let repo = await repoFor(pool, siteKey)
  if (!repo) {
    let made
    try {
      made = await createSiteRepo(config.github, config.github.org, label, siteKey, fetchImpl)
    } catch (error) {
      if (error instanceof GitHubUnavailable) return { code: 'GITHUB_UNAVAILABLE' }
      throw error
    }
    if (!made) return { code: 'REPO_NAME_TAKEN' }
    repo = made.repo
    await writeRepo(pool, siteKey, { repo, repoCreator: email ?? null })
  }

  const hook = await ensureRepoWebhook(
    config.github,
    repo,
    { url: `${config.origin}/github/push`, secret: config.github.webhookSecret },
    fetchImpl
  )

  return {
    repo,
    // Computed, not read back from GitHub — deterministic from the repo's full name, the same
    // shortcut the Worker's own "hosted" branch takes (`index.js:7827`) for a repo it did not just
    // create this call.
    cloneUrl: `https://github.com/${repo}.git`,
    webhook: hook.ok,
    ...(hook.ok ? {} : { webhookReason: hook.reason })
  }
}

/**
 * Delete the repo of a site that is being deleted — but only a repo Tracy itself created. Called
 * by `DELETE /api/sites/:key` after the host teardown and before the site row goes.
 *
 * WHO CREATED IT IS READ FROM THE BOOK, NEVER GUESSED. `repo_creator` is written by
 * `createRepoFor`, and only right after `createSiteRepo` succeeded — so a recorded creator is the
 * evidence that this repo was born through Tracy's own door. A repo with no recorded creator is
 * kept: deleting a customer's code is not undone by any later apology, while a leftover repo is
 * one manual cleanup. `site.attached` says nothing here — it records that the site was attached to
 * a dsh lane, which every site Tracy builds is, whoever owns its repo.
 *
 * Best-effort like the rest of the teardown, and never thrown: the answer is reported to the owner
 * beside `host`, and the site row still comes off when GitHub refuses.
 *
 * @param {object} config - `readConfig`'s value.
 * @param {{repo?: string|null, repo_creator?: string|null}} site - the site row.
 * @returns {Promise<true|false|'kept'|'failed'>} true: deleted; false: the site had no repo;
 *   'kept': a repo Tracy did not create (or cannot prove it did), left untouched; 'failed':
 *   GitHub not configured, unreachable, or did not confirm the delete.
 */
export async function deleteRepoFor(config, site, fetchImpl = fetch) {
  if (!site.repo) return false
  if (!site.repo_creator) return 'kept'
  if (!config.github) return 'failed'
  if (site.repo.split('/')[0] !== config.github.org) return 'kept'
  try {
    return (await deleteSiteRepo(config.github, site.repo, fetchImpl)) ? true : 'failed'
  } catch {
    // Not only `GitHubUnavailable`: a malformed GitHub answer must not stop the site row coming off.
    return 'failed'
  }
}

/**
 * @param {object} deps
 * @param {import('pg').Pool} deps.pool
 * @param {object} deps.config - `readConfig`'s value.
 * @param {typeof fetch} [deps.fetchImpl]
 * @returns {import('hono').Hono}
 */
export function githubRoutes({ pool, config, fetchImpl = fetch }) {
  const app = new Hono()

  // ── POST /fleet/git-token — a fresh push token, asked for outside a provision run ──────────────
  // Ported from `handleFleetGitToken`. The host that calls this already holds the secret it used
  // at provision time (`config.hosts.get(hostName).hostSecret`); it names itself so this door
  // knows which secret to check.
  // ported: handleFleetGitToken
  app.post('/fleet/git-token', async (c) => {
    if (!config.github) return json(c, { code: 'GITHUB_NOT_CONFIGURED' }, 503)
    const raw = await c.req.text()
    let body
    try {
      body = JSON.parse(raw)
    } catch {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    const hostName = typeof body?.host === 'string' ? body.host : ''
    const channel = config.hosts.get(hostName)
    const signature = c.req.header('x-tracy-signature') ?? ''
    if (!channel || !(await fleetSigned(channel.hostSecret, raw, signature))) {
      return json(c, { code: 'BAD_SIGNATURE' }, 403)
    }

    const siteKey = typeof body?.siteKey === 'string' ? normalizeSiteKey(body.siteKey) : ''
    // `repo` is optional. When it IS named, it must still match what the site actually owns below
    // — naming one is never a way to ask for a token to a different repo.
    const asked = typeof body?.repo === 'string' ? body.repo.trim() : ''
    if (asked !== '' && !/^[\w.-]+\/[\w.-]+$/.test(asked)) return json(c, { code: 'INVALID_REQUEST' }, 400)

    if (!siteKey) {
      // No site key means Tracy's own repo — the closed list stands in for the site record that
      // would otherwise vouch for it.
      if (!fleetSharedRepos(config).includes(asked)) return json(c, { code: 'INVALID_REQUEST' }, 400)
      const minted = await mintGitToken(config, asked, fetchImpl)
      if (!minted) return json(c, { code: 'APP_NOT_INSTALLED' }, 404)
      return json(c, { token: minted.token, expiresAt: minted.expiresAt, repo: asked })
    }

    // `label` is required with a site key: the host reads the site key out of the site folder's
    // `.tracy/site.json`, a file the site's own agent can write. Without a second fact the host
    // knows for itself (the folder's name), an agent that edits that file could point the hourly
    // sync at another site's key and push its folder into that site's repo.
    const label = typeof body?.label === 'string' ? body.label.trim() : ''
    if (!label) return json(c, { code: 'INVALID_REQUEST' }, 400)

    // The site's own record decides which repo it is, not the caller — without this a host that
    // can sign at all could mint a token for any repo the App can reach, which is every site's.
    // And the record must say the site lives on THIS host under THIS label: a good signature proves
    // which host is asking, not that the site it names is one of its own. Checked before NO_REPO,
    // so a host never learns whether another host's site has a repo.
    const site = await siteRepoOwner(pool, siteKey)
    if (!site) return json(c, { code: 'NO_REPO' }, 404)
    if (site.host !== hostName || site.label !== label) return json(c, { code: 'REPO_NOT_YOURS' }, 403)
    const repo = site.repo
    if (!repo) return json(c, { code: 'NO_REPO' }, 404)
    if (asked !== '' && repo !== asked) return json(c, { code: 'REPO_NOT_YOURS' }, 403)

    const minted = await mintGitToken(config, repo, fetchImpl)
    if (!minted) return json(c, { code: 'APP_NOT_INSTALLED' }, 404)
    return json(c, { token: minted.token, expiresAt: minted.expiresAt, repo })
  })

  /**
   * ── POST /github/release — a release moved on the quickstarts repository ────────────────────
   *
   * The same signature and the same door discipline as `/github/push` below: answer 200 to every
   * signed call (GitHub retries anything else, and a re-delivered read helps nobody), ignore what
   * this app has no business acting on. It exists so a quickstart published on ja-products shows up
   * on /ops at once rather than within the ten-minute sweep (ADR 0017).
   */
  app.post('/github/release', async (c) => {
    if (!config.github) return json(c, { code: 'GITHUB_NOT_CONFIGURED' }, 503)
    const raw = await c.req.text()
    if (
      !(await githubSignatureOk(config.github.webhookSecret, raw, c.req.header('x-hub-signature-256') ?? ''))
    )
      return json(c, { code: 'BAD_SIGNATURE' }, 403)
    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    if (!releaseEventWanted(c.req.header('x-github-event') ?? null, payload))
      return json(c, { ignored: true })
    if (!pool) return json(c, { ignored: true })
    const result = await refreshReleases(pool, config, { fetchImpl })
    // A new or changed release is checked for Customize your site and Design system in the background.
    if (result.ok) {
      kickReadiness(pool, config, { fetchImpl })
      kickDsReadiness(pool, config, { fetchImpl })
    }
    // 200 either way: a read that could not happen is this app's problem to report on its own
    // screen, not a delivery for GitHub to retry.
    return json(c, result.ok ? { read: result.count } : { ignored: true, reason: result.reason })
  })

  // ── POST /github/push — the police's second ear on the same push event the fleet listens to ────
  // Ported from `handleGithubPushPolice`. Answers 200 for every signed call, alerted included:
  // GitHub retries a 4xx/5xx, and a re-delivered alert makes nobody safer.
  // ported: handleGithubPushPolice
  app.post('/github/push', async (c) => {
    if (!config.github) return json(c, { code: 'GITHUB_NOT_CONFIGURED' }, 503)
    const raw = await c.req.text()
    const signature = c.req.header('x-hub-signature-256') ?? ''
    if (!(await githubSignatureOk(config.github.webhookSecret, raw, signature))) {
      return json(c, { code: 'BAD_SIGNATURE' }, 403)
    }
    if (c.req.header('x-github-event') !== 'push') return json(c, { ignored: true })

    let payload
    try {
      payload = JSON.parse(raw)
    } catch {
      return json(c, { code: 'INVALID_REQUEST' }, 400)
    }
    if (payload.ref !== 'refs/heads/main') return json(c, { ignored: true })
    const repo = payload.repository?.full_name
    const after = payload.after
    const before = payload.before
    if (typeof repo !== 'string' || typeof after !== 'string') return json(c, { ignored: true })
    // An all-zero SHA is a freshly created branch (provision's own first push), not a change to
    // look at.
    if (typeof before !== 'string' || /^0+$/.test(before)) return json(c, { ignored: true })

    const siteKey = await siteKeyOfRepo(pool, repo)
    if (!siteKey) return json(c, { ignored: true })
    if (await mergeSanctioned(pool, siteKey, after)) return json(c, { sanctioned: true })

    // A SHA with no name in the ledger is not automatically an alert — most pushes to `main` on a
    // fresh site are data (content, media), not code, and alerting on those is how a police gets
    // ignored. Mint a fresh read/compare token and ask GitHub what actually changed.
    const minted = await mintGitToken(config, repo, fetchImpl)
    if (!minted) return json(c, { ignored: true })

    const compared = await fetchImpl(
      `${API}/repos/${repo}/compare/${encodeURIComponent(before)}...${encodeURIComponent(after)}`,
      { headers: ghHeaders(minted.token) }
    )
    if (!compared.ok) return json(c, { ignored: true })
    const comparison = await compared.json()
    const files = Array.isArray(comparison?.files) ? comparison.files.map((f) => f.filename) : []

    const codePaths = await codePathsOf(fetchImpl, repo, minted.token)
    const codeHit =
      codePaths === null
        ? files.filter((f) => !DEFAULT_DATA_DIRS.test(f))
        : files.filter((f) => codePaths.some((pattern) => pathMatches(pattern, f)))
    if (codeHit.length === 0) return json(c, { clean: true })

    return json(c, { alerted: true })
  })

  return app
}

/**
 * The quickstart download door: a signed-in person gets the quickstart zip of a JoomlArt template
 * streamed off `JoomlArt-Products/ja-products`, a private repository, through this server.
 *
 * 🔒 THE GITHUB TOKEN NEVER LEAVES THIS PROCESS. The browser is never redirected to GitHub: the
 * bytes are fetched here with the releases token and piped to the response, and when GitHub
 * answers with a redirect to its object store, that hop is followed here too, WITHOUT the token,
 * and only to a host on the allowlist below. Nothing GitHub says (a `location`, a `set-cookie`, an
 * error body) is reflected to the person: every upstream failure is one generic 502.
 *
 * 🔒 THE HOUR IS COUNTED BEFORE THE STREAM OPENS, IN THE DATABASE. One statement writes the row
 * and counts the last hour; no row back means over the cap, and nothing was fetched. The second
 * cap — open streams per account — is a Map in THIS process: a deployment with two replicas allows
 * two per replica. That is the brake it is meant to be (a stream holds this server's bandwidth,
 * not the repository's), not an accounting of what the person did.
 */
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'

import { json } from '../lib/http.js'
import { referrerOf } from '../lib/referrer.js'
import { QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR, QUICKSTART_STREAMS_PER_ACCOUNT } from '../lib/policy.js'
import { readReleases, releasesToken, RELEASES_REPO } from '../lib/quickstart-releases.js'
import { sessionFromCookieHeader } from '../lib/session.js'

const API = 'https://api.github.com'
/** `ja-kinetic-j6-quickstart-1.0.0.zip` → the version. The quickstart zip is the only asset so named. */
const QUICKSTART_ZIP = /-quickstart-(\d+\.\d+\.\d+)\.zip$/
/** One part of a `quickstart/<template>/<cms>` tag: `ja-kinetic`, `j6`, `emdash-0.x`. */
const TAG_PART = /^[a-z0-9][a-z0-9.-]*$/
/**
 * Where a GitHub asset redirect may go. The docs say the object store; the API host and the site
 * itself are kept for the day GitHub moves the hop — anything else is a 502, never followed.
 * https://docs.github.com/en/rest/releases/assets#get-a-release-asset
 */
const REDIRECT_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com'
])
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
/** Headers to GitHub until the final 200 arrives — and the whole stream after it. */
const CONNECT_TIMEOUT_MS = 30_000
const TOTAL_TIMEOUT_MS = 10 * 60_000

const compareVersions = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/**
 * The quickstart zip of a release as `readReleases` answers it: the asset named
 * `*-quickstart-<x.y.z>.zip` — the one whose version is the setting's when several are, else the
 * highest. `resolveInstall` is NOT this: it walks `setting.install` (webroot, database…), which does
 * not name the quickstart zip. `sha256` is what GitHub states for the asset (`digest`), or null
 * when the stored row carries none.
 * @param {{ assets?: { name: string, size?: number | null, id?: number | null, digest?: string | null }[], setting?: { version?: string } | null }} release
 * @returns {{ name: string, size: number | null, apiUrl: string, sha256: string | null } | null}
 */
export function quickstartAsset(release) {
  const zips = (release.assets ?? [])
    .map((a) => ({ asset: a, version: QUICKSTART_ZIP.exec(a.name)?.[1] ?? null }))
    .filter((z) => z.version !== null && typeof z.asset.id === 'number')
  if (zips.length === 0) return null
  const pinned = release.setting?.version
  const chosen =
    zips.find((z) => z.version === pinned) ??
    zips.reduce((best, z) => (compareVersions(z.version, best.version) > 0 ? z : best))
  const digest = /^sha256:([a-f0-9]{64})$/.exec(chosen.asset.digest ?? '')
  return {
    name: chosen.asset.name,
    size: typeof chosen.asset.size === 'number' ? chosen.asset.size : null,
    apiUrl: `${API}/repos/${RELEASES_REPO}/releases/assets/${chosen.asset.id}`,
    sha256: digest ? digest[1] : null
  }
}

/**
 * The address a GitHub redirect may be followed to, or null: https, on the allowlist, no
 * credentials in the URL. Relative to the asset address, as a browser would resolve it.
 * @param {string | null} location
 * @param {string} from
 */
function allowedRedirect(location, from) {
  if (!location) return null
  let to
  try {
    to = new URL(location, from)
  } catch {
    return null
  }
  if (to.protocol !== 'https:' || to.username !== '' || to.password !== '') return null
  return REDIRECT_HOSTS.has(to.hostname) ? to.href : null
}

/**
 * The upstream body as the response body, with `settle` run exactly once when the stream ends —
 * by reaching its end, by the person closing the connection (the server cancels this stream), or
 * by an upstream error.
 * @param {ReadableStream<Uint8Array>} body
 * @param {() => void} settle
 */
function relay(body, settle) {
  const reader = body.getReader()
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          settle()
        } else controller.enqueue(value)
      } catch (error) {
        controller.error(error)
        settle()
      }
    },
    cancel(reason) {
      settle()
      return reader.cancel(reason).catch(() => {})
    }
  })
}

/**
 * @param {{
 *   pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
 *   config: { sessionSecret: string, github: any, releasesToken: string | null },
 *   identity: { accountByEmail: (email: string) => Promise<{ id: string } | null> },
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   log?: Pick<Console, 'warn' | 'error'>
 * }} deps
 */
export function quickstartDownloadRoutes({
  pool,
  config,
  identity,
  fetchImpl = fetch,
  now = Date.now,
  log = console
}) {
  const app = new Hono()
  /** Open streams per account id — per PROCESS, see the header. */
  const streams = new Map()

  app.get('/api/quickstarts/:template/:cms/quickstart.zip', async (c) => {
    c.header('cache-control', 'no-store')
    const email = await sessionFromCookieHeader(c.req.header('cookie') ?? null, config.sessionSecret, now())
    const account = email ? await identity.accountByEmail(email) : null
    if (!account) return json(c, { code: 'NOT_SIGNED_IN' }, 401)

    const { template, cms } = c.req.param()
    const unavailable = () => json(c, { error: 'QUICKSTART_NOT_AVAILABLE' }, 404)
    if (!TAG_PART.test(template) || !TAG_PART.test(cms)) return unavailable()
    const tag = `quickstart/${template}/${cms}`
    // The page the landing's Download link names (`lib/referrer.js`), cleaned again here: the link
    // is an address anybody can type. A bad one is stored as null; it never refuses the download.
    const referrer = referrerOf({ ref: c.req.query('ref'), referer: null, origin: config.origin })

    let releases
    try {
      releases = await readReleases(pool)
    } catch (error) {
      log.error(
        `[quickstarts] the catalogue could not be read: ${error instanceof Error ? error.message : error}`
      )
      return json(c, { error: 'CATALOGUE_UNAVAILABLE' }, 503)
    }
    // A release Tracy can read (`tracy = 'ready'`) and a person may choose: not a draft, with a setting.
    const release = releases.find((r) => r.tag === tag && r.tracy === 'ready' && r.choosable)
    const asset = release ? quickstartAsset(release) : null
    if (!asset) return unavailable()

    // The per-process cap, taken synchronously so two requests arriving together cannot both pass.
    const open = streams.get(account.id) ?? 0
    if (open >= QUICKSTART_STREAMS_PER_ACCOUNT) return json(c, { error: 'TOO_MANY_STREAMS' }, 429)
    streams.set(account.id, open + 1)
    let settled = false
    let timer = null
    const controller = new AbortController()
    const clientGone = c.req.raw.signal
    /** Exactly once, however the request ends: the slot, the timer and the listener are let go. */
    const settle = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clientGone?.removeEventListener('abort', abort)
      const left = (streams.get(account.id) ?? 1) - 1
      if (left > 0) streams.set(account.id, left)
      else streams.delete(account.id)
    }
    // The person closing the connection, or a timeout: the upstream fetch is aborted with it,
    // and the slot is free at once — not when the next read of a stream nobody reads fails.
    function abort() {
      controller.abort()
      settle()
    }
    clientGone?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(abort, CONNECT_TIMEOUT_MS)
    const failed = (why) => {
      settle()
      log.warn(`[quickstarts] ${tag}: ${why}`)
      return json(c, { error: 'UPSTREAM_FAILED' }, 502)
    }

    // The hour, counted and written in one statement. No row back: the cap is reached, and nothing
    // was fetched. (Two requests racing on one account can each see nine and both write a tenth;
    // the stream cap above bounds that race to the two streams it allows.)
    let counted
    try {
      counted = await pool.query(
        `insert into quickstart_download (id, account_id, tag, referrer)
         select $1::uuid, $2::uuid, $3, $5
         where (select count(*) from quickstart_download where account_id = $2::uuid and at > now() - interval '1 hour') < $4
         returning id`,
        [randomUUID(), account.id, tag, QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR, referrer]
      )
    } catch (error) {
      settle()
      log.error(
        `[quickstarts] the download could not be counted: ${error instanceof Error ? error.message : error}`
      )
      return json(c, { error: 'CATALOGUE_UNAVAILABLE' }, 503)
    }
    if (counted.rows.length === 0) {
      settle()
      return json(c, { error: 'RATE_LIMITED' }, 429)
    }

    try {
      const { token, reason } = await releasesToken(config, fetchImpl)
      if (!token) {
        settle()
        log.warn(`[quickstarts] ${tag}: ${reason}`)
        return json(c, { error: 'CATALOGUE_UNAVAILABLE' }, 503)
      }

      const headers = {
        accept: 'application/octet-stream',
        'user-agent': 'tracy-web',
        'x-github-api-version': '2022-11-28'
      }
      let upstream = await fetchImpl(asset.apiUrl, {
        headers: { ...headers, authorization: `Bearer ${token}` },
        redirect: 'manual',
        signal: controller.signal
      })
      if (REDIRECT_STATUSES.has(upstream.status)) {
        const to = allowedRedirect(upstream.headers.get('location'), asset.apiUrl)
        await upstream.body?.cancel().catch(() => {})
        if (!to) return failed(`GitHub redirected ${asset.name} (${upstream.status}) to a host not allowed`)
        // 🔒 No `authorization` on this hop: the object store takes its own signed URL, and the
        // token must never reach a host the allowlist did not vouch for a second time.
        upstream = await fetchImpl(to, { headers, redirect: 'manual', signal: controller.signal })
      }
      if (upstream.status !== 200 || !upstream.body) {
        await upstream.body?.cancel().catch(() => {})
        return failed(`GitHub answered ${upstream.status} for ${asset.name}`)
      }

      clearTimeout(timer)
      timer = setTimeout(abort, TOTAL_TIMEOUT_MS)
      const out = new Headers({
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${asset.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        'cache-control': 'no-store'
      })
      const length =
        upstream.headers.get('content-length') ?? (asset.size !== null ? String(asset.size) : null)
      if (length) out.set('content-length', length)
      if (asset.sha256) out.set('x-tracy-sha256', asset.sha256)
      return new Response(relay(upstream.body, settle), { status: 200, headers: out })
    } catch (error) {
      // The person left (the server aborted us) or GitHub did not answer: either way, nothing to
      // reflect, and no token in the sentence — it travels in a header, never in a message.
      const cause = controller.signal.aborted
        ? 'the request was aborted'
        : (error?.cause?.code ?? error?.message ?? 'unknown')
      return failed(`GitHub did not answer for ${asset.name}: ${cause}`)
    }
  })

  return app
}

/**
 * Turborepo's remote cache API in front of the GitHub Actions cache, with no dependency (12/10/2026;
 * on the Actions cache instead of a Cloudflare R2 bucket since 30/10/2026).
 *
 * WHY NOT `turborepo-remote-cache` FROM npm. It worked, but it carries the AWS, Azure and Google
 * storage SDKs: `npx` fetched it in 86 s on every job, the plan job included. Turbo needs four
 * routes, and each maps onto one or two plain HTTP calls, so this file is the whole server.
 *
 * WHY THE ACTIONS CACHE AND NOT R2. No secret to set or rotate (the four `TURBO_CACHE_S3_*` secrets
 * were never set on the public repository, so every run planned as if nothing were cached), and the
 * runner already holds the credential: `ACTIONS_RUNTIME_TOKEN`, which GitHub hands to JavaScript
 * actions only — hence `.github/actions/turbo-cache` is a `node` action that starts this server.
 *
 * THE PROTOCOL is cache service v2, the one `@actions/cache` 4.x speaks (read from its source,
 * `lib/generated/results/api/v1/cache.js` and `lib/internal/shared/cacheTwirpClient.js`): Twirp JSON
 * POSTs to `<ACTIONS_RESULTS_URL>/twirp/github.actions.results.api.v1.CacheService/<Method>` with the
 * runtime token as bearer, field names as PROTO names (snake_case) in requests, answers read under
 * either name (a Twirp server sends proto names: the first CI run read `signedUploadUrl` and, most
 * likely for that reason, wrote no entry), int64 as a decimal string.
 *   HEAD  GetCacheEntryDownloadURL {key, version} — `ok` and `matched_key == key` is a hit. One
 *         lookup, nothing downloaded.
 *   GET   the same lookup, then a GET of the returned `signed_download_url` (an Azure blob SAS URL).
 *   PUT   CreateCacheEntry {key, version} → `signed_upload_url`; one Azure Put Blob of the artifact;
 *         FinalizeCacheEntryUpload {key, size_bytes, version}. An entry is immutable: the service
 *         answers 409 for a key that exists in this scope, and that is a success here.
 *
 * KEYS. `turbo-<team>-<hash>` under the fixed `VERSION` below, one entry per artifact. A test task's
 * artifact is its log (`outputs: []` in turbo.json), a few KB, so a full run of ~50 tasks adds well
 * under 1 MB to the repository's 10 GB.
 *
 * 🔒 NEVER RED. Any failure of the cache service (an error status, a timeout, `ok: false`) is a MISS
 * for HEAD/GET and a skipped write for PUT; Turbo then runs the task, and only warns on a write it
 * could not make — the same as with an unreachable cache before.
 *
 * 🔒 EVERY FAILURE IS IN THE LOG, NOTHING SECRET IS. Turbo only says "502 Bad Gateway"; this server
 * writes one `cache-service failure` line per failed call (which call, HTTP status, the first 500
 * bytes of the answer) to its output, `$RUNNER_TEMP/turbo-cache.log`, which every job that starts it
 * prints at its end. `redact` strips the query of every URL (the SAS signature) and masks the
 * runtime token and any bearer value first.
 *
 * ENV. ACTIONS_RESULTS_URL, ACTIONS_RUNTIME_TOKEN, TURBO_TOKEN (the bearer Turbo sends), PORT
 * (default 43901), TURBO_CACHE_READ_ONLY (`1`: every PUT is answered without writing — a fork's pull
 * request). Started by `.github/actions/turbo-cache`; it binds 127.0.0.1 only.
 */
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const SERVICE = 'github.actions.results.api.v1.CacheService'

/** The cache entry version: fixed, so a change of format is a new version and never a wrong hit. */
export const VERSION = createHash('sha256').update('tracy-turbo-artifact-v1').digest('hex')

/** One part of the cache key: never a comma (the key separator of `actions/cache`) or a slash. */
const SAFE = /^(?!\.+$)[A-Za-z0-9._-]{1,200}$/

/** @param {string} team @param {string} hash */
export const cacheKey = (team, hash) => `turbo-${team}-${hash}`

/** Azure Storage REST version of the blob PUT; `@azure/storage-blob` 12.x sends one on every call. */
const MS_VERSION = '2024-11-04'

/** How much of a failed response's body the log keeps. */
const BODY_BYTES = 500

/**
 * A text made safe for the job log: every URL loses its query string (an Azure SAS signature is
 * there), every bearer value and every secret given is masked, and it is cut to `max` bytes.
 * @param {string} text @param {string[]} [secrets] @param {number} [max]
 */
export function redact(text, secrets = [], max = BODY_BYTES) {
  let out = String(text)
  for (const s of secrets) if (s) out = out.split(s).join('***')
  out = out
    .replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/g, '$1?<query removed>')
    .replace(/(bearer\s+)[^\s"',]+/gi, '$1***')
  const bytes = Buffer.from(out)
  return bytes.length > max ? `${bytes.subarray(0, max).toString()}…` : out
}

/** A URL without its query string or fragment: what the log may say about a signed URL. */
const bare = (url) => {
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return '<not a URL>'
  }
}

/** A value of a Twirp JSON answer, under its proto name (what the service sends) or its JSON name. */
const field = (body, protoName, jsonName) => body?.[protoName] ?? body?.[jsonName]

/**
 * The three calls of the Actions cache service this server needs. Each throws on any failure, and
 * the server turns a throw into a miss or a skipped write. Every failure is first handed to
 * `onFailure` — which call, the HTTP status (`network` when none came back), the start of the
 * answer — already redacted: no token, no signed URL's query.
 *
 * THE WIRE FORMAT is what `@actions/cache` 4.x puts there: its generated client encodes requests
 * with `toJson({ useProtoFieldName: true })` (`restore_keys`, `size_bytes`) and decodes answers with
 * `fromJson`, which takes either name; the service answers with proto names (`signed_upload_url`,
 * `matched_key`), so an answer is read under both.
 * @param {{ resultsUrl: string, runtimeToken: string, fetchImpl?: typeof fetch, rpcTimeoutMs?: number, blobTimeoutMs?: number, onFailure?: (failure: { call: string, status: number | 'network', url: string, body: string }) => void }} config
 */
export function actionsCache({
  resultsUrl,
  runtimeToken,
  fetchImpl = fetch,
  rpcTimeoutMs = 10_000,
  blobTimeoutMs = 120_000,
  onFailure = () => {}
}) {
  /** Record a failure, then throw it. */
  const fail = (call, status, url, text) => {
    const failure = { call, status, url: bare(url), body: redact(text, [runtimeToken]) }
    onFailure(failure)
    throw new Error(`${call}: HTTP ${String(status)}`)
  }
  /** fetch, with a network error or a timeout recorded as a failure of `call`. */
  const send = async (call, url, init) => {
    try {
      return await fetchImpl(url, init)
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : ''
      return fail(call, 'network', url, `${err instanceof Error ? err.message : String(err)}${cause}`)
    }
  }
  const rpc = async (method, body) => {
    const url = new URL(`/twirp/${SERVICE}/${method}`, resultsUrl).href
    const r = await send(method, url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        authorization: `Bearer ${runtimeToken}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(rpcTimeoutMs)
    })
    const text = await r.text()
    let json = null
    try {
      json = r.ok ? JSON.parse(text) : null
    } catch {
      return fail(method, r.status, url, `not JSON: ${text}`)
    }
    return { status: r.status, url, text, body: json }
  }
  /** @returns {Promise<string | null>} the signed download URL, or null when the key is not stored. */
  const lookup = async (key) => {
    const r = await rpc('GetCacheEntryDownloadURL', { key, version: VERSION })
    if (r.status === 404) return null
    if (!r.body) return fail('GetCacheEntryDownloadURL', r.status, r.url, r.text)
    const url = field(r.body, 'signed_download_url', 'signedDownloadUrl')
    return r.body.ok && field(r.body, 'matched_key', 'matchedKey') === key && url ? url : null
  }
  return {
    lookup,
    /** @returns {Promise<Buffer | null>} */
    async read(key) {
      const url = await lookup(key)
      if (!url) return null
      const r = await send('download', url, { signal: AbortSignal.timeout(blobTimeoutMs) })
      if (!r.ok) return fail('download', r.status, url, await r.text())
      return Buffer.from(await r.arrayBuffer())
    },
    /** @returns {Promise<'stored' | 'exists'>} */
    async write(key, data) {
      const created = await rpc('CreateCacheEntry', { key, version: VERSION })
      if (created.status === 409) return 'exists'
      const uploadUrl = field(created.body, 'signed_upload_url', 'signedUploadUrl')
      if (!created.body?.ok || !uploadUrl)
        return fail('CreateCacheEntry', created.status, created.url, created.text)
      const put = await send('upload', uploadUrl, {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-version': MS_VERSION,
          'content-type': 'application/octet-stream'
        },
        body: data,
        signal: AbortSignal.timeout(blobTimeoutMs)
      })
      if (!put.ok) return fail('upload', put.status, uploadUrl, await put.text())
      const done = await rpc('FinalizeCacheEntryUpload', {
        key,
        size_bytes: String(data.length),
        version: VERSION
      })
      if (!done.body?.ok) return fail('FinalizeCacheEntryUpload', done.status, done.url, done.text)
      return 'stored'
    }
  }
}

/**
 * @param {{ resultsUrl: string, runtimeToken: string, token: string, readOnly?: boolean, fetchImpl?: typeof fetch, log?: (line: string) => void }} config
 */
export function cacheServer({
  resultsUrl,
  runtimeToken,
  token,
  readOnly = false,
  fetchImpl = fetch,
  log = (line) => console.error(line)
}) {
  const cache = actionsCache({
    resultsUrl,
    runtimeToken,
    fetchImpl,
    onFailure: (f) =>
      log(`cache-service failure: ${f.call} HTTP ${String(f.status)} ${f.url} — ${f.body || '(empty body)'}`)
  })
  return createServer(async (req, res) => {
    const send = (status, body = '', type = 'application/json') => {
      res.writeHead(status, { 'content-type': type })
      res.end(body)
    }
    const url = new URL(req.url ?? '/', 'http://local')
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, '{"error":"unauthorized"}')
    if (url.pathname === '/v8/artifacts/status') return send(200, '{"status":"enabled"}')
    if (url.pathname === '/v8/artifacts/events') return send(200, '{}')
    const m = /^\/v8\/artifacts\/([^/]+)$/.exec(url.pathname)
    const team =
      url.searchParams.get('teamId') ?? url.searchParams.get('slug') ?? url.searchParams.get('team')
    if (!m || !team || !SAFE.test(m[1]) || !SAFE.test(team)) return send(400, '{"error":"bad request"}')
    const key = cacheKey(team, m[1])
    const miss = () => send(404, req.method === 'HEAD' ? '' : '{"error":"not found"}')
    try {
      if (req.method === 'HEAD') return (await cache.lookup(key)) ? send(200, '') : miss()
      if (req.method === 'GET') {
        const data = await cache.read(key)
        if (!data) return miss()
        res.writeHead(200, { 'content-type': 'application/octet-stream' })
        res.end(data)
        return
      }
      if (req.method === 'PUT') {
        const chunks = []
        for await (const c of req) chunks.push(c)
        if (readOnly) {
          log(`PUT ${key}: read-only, not written`)
          return send(202, JSON.stringify({ urls: [] }))
        }
        log(`PUT ${key}: ${await cache.write(key, Buffer.concat(chunks))}`)
        return send(202, JSON.stringify({ urls: [key] }))
      }
      return send(405, '')
    } catch (err) {
      // A miss for a read, a skipped write for a PUT: never more than a warning in Turbo's log.
      log(
        redact(
          `${req.method ?? '?'} ${key}: ${err instanceof Error ? err.message : String(err)}`,
          [runtimeToken, token],
          2000
        )
      )
      if (req.method === 'PUT') return send(502, '')
      return miss()
    }
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { ACTIONS_RESULTS_URL, ACTIONS_RUNTIME_TOKEN, TURBO_TOKEN, PORT, TURBO_CACHE_READ_ONLY } = process.env
  if (!ACTIONS_RESULTS_URL || !ACTIONS_RUNTIME_TOKEN || !TURBO_TOKEN) {
    console.error(
      'turbo-cache-server: ACTIONS_RESULTS_URL, ACTIONS_RUNTIME_TOKEN and TURBO_TOKEN are required'
    )
    process.exit(2)
  }
  cacheServer({
    resultsUrl: ACTIONS_RESULTS_URL,
    runtimeToken: ACTIONS_RUNTIME_TOKEN,
    token: TURBO_TOKEN,
    readOnly: TURBO_CACHE_READ_ONLY === '1'
  }).listen(Number(PORT || 43901), '127.0.0.1', () =>
    console.error(
      `turbo-cache-server: listening (${TURBO_CACHE_READ_ONLY === '1' ? 'read-only' : 'read-write'})`
    )
  )
}

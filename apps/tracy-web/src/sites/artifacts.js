/**
 * The R2 signing half of the artifact door (`POST /api/sites/:key/artifacts/:step`) — ported from
 * `workers/seat-registry/src/artifacts.js`. One rule carries over unchanged: **this relay signs,
 * it never carries bytes.** A short-lived URL goes back to the caller, who `PUT`s straight to R2;
 * a Node process holding a 300 MB webroot mid-request is both expensive and the wrong job.
 *
 * No new dependency: SigV4 is a handful of HMAC calls, and pulling in a whole S3 SDK to avoid
 * fifty lines here would trade something readable for something merely trusted.
 */

const ALGO = 'AWS4-HMAC-SHA256'
// R2 has no real region; every S3 client signs it as `auto`.
const REGION = 'auto'
const SERVICE = 's3'

/** Long enough for a slow connection to push one part, short enough that a leaked URL is dead soon after. */
export const PART_URL_TTL_S = 900

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}

async function hmac(key, text) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)))
}

async function signingKey(secret, date) {
  let k = enc.encode(`AWS4${secret}`)
  for (const part of [date, REGION, SERVICE, 'aws4_request']) k = await hmac(k, part)
  return k
}

/** `20260813T081500Z` and `20260813` — the two date shapes SigV4 needs, from one instant. */
function stamps(now) {
  const amz = new Date(now)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { amz, date: amz.slice(0, 8) }
}

/**
 * Path-encode the way S3 requires: each segment percent-encoded, `/` kept bare.
 * `encodeURIComponent` leaves `!'()*` alone — S3's signature counts them, so they are escaped by hand.
 */
function encodePath(path) {
  return path
    .split('/')
    .map((seg) =>
      encodeURIComponent(seg).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    )
    .join('/')
}

function canonicalQuery(params) {
  return [...params.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
}

/**
 * A single-use, single-purpose signed URL. The signature lives in the query string so the
 * uploader needs no header at all — a plain `PUT` to the URL is the whole contract. Payload is
 * `UNSIGNED-PAYLOAD`: signing the body would mean reading the whole thing before sending it,
 * which does not work against a webroot streaming in at 200 MB.
 *
 * `now` defaults to `Date.now()` but can be pinned — the one thing this port adds over the
 * Worker's original, which reached `Date.now()` from inside `stamps()` with no way for a test to
 * hold it still. See `test/artifacts.test.mjs`.
 */
export async function presign(
  store,
  { method, key, query = {}, expiresIn = PART_URL_TTL_S, now = Date.now() }
) {
  const { amz, date } = stamps(now)
  const host = new URL(store.endpoint).host
  const path = `/${store.bucket}/${encodePath(key)}`

  const params = new URLSearchParams(query)
  params.set('X-Amz-Algorithm', ALGO)
  params.set('X-Amz-Credential', `${store.accessKey}/${date}/${REGION}/${SERVICE}/aws4_request`)
  params.set('X-Amz-Date', amz)
  params.set('X-Amz-Expires', String(expiresIn))
  params.set('X-Amz-SignedHeaders', 'host')

  const canonical = [method, path, canonicalQuery(params), `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join(
    '\n'
  )
  const toSign = [ALGO, amz, `${date}/${REGION}/${SERVICE}/aws4_request`, await sha256Hex(canonical)].join(
    '\n'
  )
  const signature = hex(await hmac(await signingKey(store.secretKey, date), toSign))

  return `${store.endpoint}${path}?${canonicalQuery(params)}&X-Amz-Signature=${signature}`
}

/**
 * The store as a SOURCE site sees it: same bucket and keys, but `publicEndpoint` when one is
 * configured. SigV4 signs the `host`, so a URL signed for `host.docker.internal:51740` is useless
 * to a WordPress site on the internet that PUTs its own webroot parts (`files.pack` with a
 * `put_url`), and a URL signed for the public address would be refused if sent to the internal
 * one. Only the `part` door hands a URL to the source; every other URL stays on `endpoint`.
 */
export function storeForSource(store) {
  return store.publicEndpoint ? { ...store, endpoint: store.publicEndpoint } : store
}

/**
 * A control call to R2, signed with this relay's own key — only for calls that carry no caller
 * data: opening, closing, or aborting a multipart upload. `fetchImpl` defaults to the platform
 * `fetch`, overridable so a test never dials real R2 (mirrors `host/client.js`'s own `fetchImpl`).
 */
export async function signedCall(
  store,
  { method, key, query = {}, body = '', now = Date.now() },
  fetchImpl = fetch
) {
  const { amz, date } = stamps(now)
  const host = new URL(store.endpoint).host
  const path = `/${store.bucket}/${encodePath(key)}`
  const payloadHash = await sha256Hex(body)

  const params = new URLSearchParams(query)
  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz
  }
  const signedHeaders = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((h) => `${h}:${headers[h]}\n`)
    .join('')

  const canonical = [method, path, canonicalQuery(params), canonicalHeaders, signedHeaders, payloadHash].join(
    '\n'
  )
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const toSign = [ALGO, amz, scope, await sha256Hex(canonical)].join('\n')
  const signature = hex(await hmac(await signingKey(store.secretKey, date), toSign))

  const query_ = canonicalQuery(params)
  return fetchImpl(`${store.endpoint}${path}${query_ ? `?${query_}` : ''}`, {
    method,
    headers: {
      ...headers,
      authorization: `${ALGO} Credential=${store.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      ...(body ? { 'content-type': 'application/xml' } : {})
    },
    body: body || undefined
  })
}

/**
 * The object name for a fresh upload — chosen HERE, never by the caller. A caller naming its own
 * key could overwrite another site's artifact under the same `sites/<label>/` prefix; see
 * `sites/route.js`'s `KEY_NOT_YOURS` check on every step that takes a key back.
 *
 * `now` defaults to `Date.now()`, pinnable for deterministic tests the same way `presign` is.
 * @param {string} label - `labelPrefix(siteKey)` (`sites/label.js`).
 * @param {'db'|'webroot'} kind
 */
export function artifactKey(label, kind, now = Date.now()) {
  const stamp = new Date(now)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
  const name = kind === 'db' ? 'db.sql.gz' : 'webroot.tar'
  return `sites/${label}/${stamp}-${name}`
}

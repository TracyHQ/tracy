/**
 * An HTTP client of a shared research hub (`/hub/v1`, ADR 0036 Phase 3), for a server that reads one (`HUB_URL`,
 * `HUB_TOKEN`). Every method answers a plain result instead of throwing on a refusal the caller must handle (quota,
 * gone, expired cursor); network failures, 5xx and rate limits are retried with backoff, then thrown.
 *
 *   lookup(identities)         POST /places/lookup     { status: 'found', id, revision } | 'not_found' | 'ambiguous'
 *   place(id, { etag })        GET  /places/:id        { status: 'ok', dto, etag } | 'not_modified' | 'gone' | 'not_found' | 'quota'
 *   contribute(body, key)      POST /contributions     { status: 'accepted', receipt } | 'refused'
 *   feed(name, cursor)         GET  /changes | /revocations  { status: 'ok', events, cursor, more } | 'cursor_expired'
 */

const RETRY_STATUS = new Set([500, 502, 503, 504])

export class HubError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.status = status ?? null
    this.code = code ?? 'HUB_ERROR'
  }
}

/**
 * @param {{ url: string, token: string, fetchImpl?: typeof fetch, retries?: number, backoffMs?: number,
 *   timeoutMs?: number, sleep?: (ms: number) => Promise<void> }} options
 */
export function createHubClient({
  url,
  token,
  fetchImpl = fetch,
  retries = 3,
  backoffMs = 250,
  timeoutMs = 15_000,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms))
}) {
  const base = `${String(url).replace(/\/+$/, '')}/hub/v1`

  async function send(path, { method = 'GET', body, headers = {} } = {}) {
    let lastError = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1))
      let res
      try {
        res = await fetchImpl(`${base}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...headers
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(timeoutMs)
        })
      } catch (error) {
        lastError = new HubError(`hub unreachable: ${error?.message ?? error}`, { code: 'HUB_UNREACHABLE' })
        continue
      }
      const json = res.status === 304 ? null : await res.json().catch(() => null)
      // A rate limit is worth waiting for; a spent quota is not (it answers `quota_exceeded`).
      if (RETRY_STATUS.has(res.status) || (res.status === 429 && json?.code === 'rate_limited')) {
        lastError = new HubError(`hub answered ${res.status}`, { status: res.status, code: json?.code })
        continue
      }
      if (res.status === 401)
        throw new HubError('the hub refused the token', { status: 401, code: 'invalid_token' })
      return { status: res.status, json, headers: res.headers }
    }
    throw lastError
  }

  async function lookup(identities) {
    const { status, json } = await send('/places/lookup', {
      method: 'POST',
      body: { items: [{ identities }] }
    })
    if (status === 429) return { status: 'quota', code: json?.code }
    if (status !== 200) throw new HubError(`lookup answered ${status}`, { status, code: json?.code })
    return json.results[0]
  }

  async function place(id, { etag } = {}) {
    const { status, json, headers } = await send(`/places/${encodeURIComponent(id)}`, {
      headers: etag ? { 'if-none-match': etag } : {}
    })
    if (status === 304) return { status: 'not_modified' }
    if (status === 200) return { status: 'ok', dto: json, etag: headers.get('etag') }
    if (status === 410 || status === 301)
      return { status: 'gone', code: json?.code, mergedInto: json?.mergedInto }
    if (status === 404) return { status: 'not_found' }
    if (status === 429) return { status: 'quota', code: json?.code }
    throw new HubError(`place answered ${status}`, { status, code: json?.code })
  }

  async function contribute(body, idempotencyKey) {
    const { status, json } = await send('/contributions', {
      method: 'POST',
      body,
      headers: { 'idempotency-key': idempotencyKey }
    })
    if (status === 202) return { status: 'accepted', receipt: json }
    return { status: 'refused', httpStatus: status, code: json?.code ?? null }
  }

  async function feed(name, cursor) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=500` : ''
    const { status, json } = await send(`/${name}${query}`)
    if (status === 410) return { status: 'cursor_expired' }
    if (status !== 200) throw new HubError(`${name} answered ${status}`, { status, code: json?.code })
    return { status: 'ok', events: json.events, cursor: json.cursor, more: json.more }
  }

  return { lookup, place, contribute, feed }
}

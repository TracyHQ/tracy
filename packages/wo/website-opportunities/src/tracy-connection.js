/**
 * This server's connection to a Tracy account, for the `tracy` builder (`./plugins/builders/tracy.js`).
 *
 * Connecting is the OAuth 2.0 device flow (RFC 8628): the server asks Tracy for a code, the operator opens Tracy's
 * page in any browser, signs in and allows it, and the server polls until Tracy hands over a token pair. Nothing
 * needs to reach this server from outside, so it works on localhost and behind NAT alike.
 *
 *   POST {tracyUrl}/oauth/device/code   client_id=website-opportunities&scope=demos
 *   POST {tracyUrl}/oauth/token         the device code grant, then `refresh_token` (Tracy rotates the pair)
 *   POST {tracyUrl}/oauth/revoke        on Disconnect
 *   GET  {apiUrl}/v1/me                 who the token belongs to
 *
 * Tokens stay on the server (`./tracy-token-file.js`); `status()` is what a page may see and holds none. One refresh
 * runs at a time: every call that finds the token expired waits for the same one, and the rotated pair is written
 * before anyone uses it. A refresh Tracy refuses (`invalid_grant`: revoked in Tracy, or expired) turns the state to
 * `reconnect`; Tracy being unreachable leaves the tokens alone.
 *
 * States: `disconnected` (with `error` after a denied or expired code), `pending`, `connected`, `reconnect`.
 */
export const TRACY_CLIENT_ID = 'website-opportunities'
export const TRACY_SCOPE = 'demos'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const SLOW_DOWN_MS = 5_000
const DEFAULT_INTERVAL_S = 5
// Refresh a little before the access token runs out, not on the first 401.
const EARLY_REFRESH_MS = 60_000

const fail = (code, message) => Object.assign(new Error(message), { code })

/**
 * @param {{ tracyUrl: string, apiUrl?: string | null, store: ReturnType<import('./tracy-token-file.js').createTokenFile>,
 *   fetchImpl?: typeof fetch, now?: () => number, timeoutMs?: number, log?: { warn?: Function } }} deps
 */
export function createTracyConnection({
  tracyUrl,
  apiUrl = null,
  store,
  fetchImpl = fetch,
  now = Date.now,
  timeoutMs = 15_000,
  log = console
}) {
  const origin = String(tracyUrl).replace(/\/+$/, '')
  const api = String(apiUrl ?? origin).replace(/\/+$/, '')
  /** The device flow under way, in memory only: a restart asks the operator to connect again. */
  let pending = null
  let lastError = null
  let polling = null
  let refreshing = null
  let cached

  async function record() {
    if (cached === undefined) cached = await store.read()
    return cached
  }
  async function save(next) {
    await store.write(next)
    cached = next
  }

  async function send(url, init) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      throw Object.assign(fail('TRACY_UNAVAILABLE', 'Tracy did not answer; try again in a moment.'), {
        cause: error
      })
    }
  }
  const postForm = (path, fields) =>
    send(`${origin}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: TRACY_CLIENT_ID, ...fields }).toString()
    })
  const jsonOf = (res) => res.json().catch(() => null)

  async function status() {
    if (pending) {
      return {
        state: 'pending',
        tracyUrl: origin,
        userCode: pending.userCode,
        verificationUri: pending.verificationUri,
        verificationUriComplete: pending.verificationUriComplete,
        expiresAt: new Date(pending.expiresAt).toISOString()
      }
    }
    const r = await record()
    if (r?.state === 'connected' || r?.state === 'reconnect')
      return {
        state: r.state,
        tracyUrl: origin,
        account: r.account ?? null,
        connectedAt: r.connectedAt ?? null
      }
    return { state: 'disconnected', tracyUrl: origin, ...(lastError ? { error: lastError } : {}) }
  }

  /** Starts a device flow (a new one replaces any under way). */
  async function connect() {
    const res = await postForm('/oauth/device/code', { scope: TRACY_SCOPE })
    const body = await jsonOf(res)
    if (!res.ok || typeof body?.device_code !== 'string' || typeof body?.user_code !== 'string')
      throw fail('TRACY_CONNECT_REFUSED', `Tracy refused to start connecting (${body?.error ?? res.status}).`)
    const at = now()
    const interval = Number.isFinite(body.interval) ? body.interval : DEFAULT_INTERVAL_S
    pending = {
      deviceCode: body.device_code,
      userCode: body.user_code,
      verificationUri: body.verification_uri ?? `${origin}/connect`,
      verificationUriComplete: body.verification_uri_complete ?? null,
      intervalMs: Math.max(0, interval * 1000),
      nextPollAt: at + Math.max(0, interval * 1000),
      expiresAt: at + (Number.isFinite(body.expires_in) ? body.expires_in : 600) * 1000
    }
    lastError = null
    return status()
  }

  /** One token request when one is due; the device flow's state after it. Safe to call often and concurrently. */
  function poll() {
    polling ??= pollOnce().finally(() => (polling = null))
    return polling
  }

  async function pollOnce() {
    const flow = pending
    if (!flow) return status()
    const at = now()
    if (at >= flow.expiresAt) return end('expired_token')
    if (at < flow.nextPollAt) return status()
    const res = await postForm('/oauth/token', { grant_type: DEVICE_GRANT, device_code: flow.deviceCode })
    const body = await jsonOf(res)
    if (pending !== flow) return status()
    if (res.ok && typeof body?.access_token === 'string') {
      pending = null
      await save({
        v: 1,
        state: 'connected',
        ...tokensOf(body),
        account: await accountOf(body.access_token),
        connectedAt: new Date(now()).toISOString()
      })
      return status()
    }
    const error = body?.error
    if (error === 'slow_down') flow.intervalMs += SLOW_DOWN_MS
    if (error === 'authorization_pending' || error === 'slow_down') {
      flow.nextPollAt = now() + flow.intervalMs
      return status()
    }
    if (res.status >= 500) {
      flow.nextPollAt = now() + flow.intervalMs
      return status()
    }
    return end(error === 'access_denied' || error === 'expired_token' ? error : 'connect_failed')
  }

  function end(error) {
    pending = null
    lastError = error
    return status()
  }

  function tokensOf(body) {
    return {
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
      accessExpiresAt: now() + (Number.isFinite(body.expires_in) ? body.expires_in : 3600) * 1000
    }
  }

  async function accountOf(accessToken) {
    const res = await send(`${api}/v1/me`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
    }).catch(() => null)
    const me = res?.ok ? await jsonOf(res) : null
    if (!me || typeof me.email !== 'string') return null
    const name = me.name ?? me.displayName
    return { email: me.email, name: typeof name === 'string' && name ? name : null }
  }

  /**
   * A fresh access token. `stale` is the token a 401 came back for: it is refreshed only while it is still the
   * current one, so callers that failed together share one refresh.
   */
  async function accessToken({ stale = null } = {}) {
    const r = await record()
    if (r?.state === 'reconnect')
      throw fail('TRACY_RECONNECT', 'Tracy no longer accepts this connection: reconnect it.')
    if (r?.state !== 'connected' || !r.accessToken) throw fail('TRACY_NOT_CONNECTED', 'Connect Tracy first.')
    const expired = now() >= r.accessExpiresAt - EARLY_REFRESH_MS
    if (!expired && (stale === null || stale !== r.accessToken)) return r.accessToken
    refreshing ??= refresh(r).finally(() => (refreshing = null))
    return refreshing
  }

  async function refresh(r) {
    if (!r.refreshToken) return reconnect(r)
    const res = await postForm('/oauth/token', { grant_type: 'refresh_token', refresh_token: r.refreshToken })
    const body = await jsonOf(res)
    if (res.ok && typeof body?.access_token === 'string') {
      // The rotated pair is on disk before any caller uses it.
      await save({ ...r, ...tokensOf(body), refreshToken: body.refresh_token ?? r.refreshToken })
      return body.access_token
    }
    if (res.status >= 500 || res.status === 429)
      throw fail('TRACY_UNAVAILABLE', 'Tracy did not answer; try again in a moment.')
    return reconnect(r)
  }

  async function reconnect(r) {
    await save({ ...r, state: 'reconnect', accessToken: null, refreshToken: null, accessExpiresAt: 0 })
    log.warn?.('[wo] Tracy refused the connection; the operator has to reconnect')
    throw fail('TRACY_RECONNECT', 'Tracy no longer accepts this connection: reconnect it.')
  }

  /**
   * A request to Tracy's API with the account's token: refreshed when expired, and once more after a 401.
   * Throws `TRACY_NOT_CONNECTED`, `TRACY_RECONNECT` or `TRACY_UNAVAILABLE`; any other answer is returned as it is.
   * @param {string} path  `/v1/...`
   * @param {{ method?: string, body?: unknown, headers?: Record<string, string> }} [init]
   */
  async function call(path, { method = 'GET', body, headers = {} } = {}) {
    const go = (token) =>
      send(`${api}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
          authorization: `Bearer ${token}`
        },
        ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
      })
    const token = await accessToken()
    const res = await go(token)
    if (res.status !== 401) return res
    return go(await accessToken({ stale: token }))
  }

  /** Revokes the grant in Tracy (best effort) and forgets the tokens. */
  async function disconnect() {
    pending = null
    lastError = null
    const r = await record()
    const token = r?.refreshToken ?? r?.accessToken
    if (token) {
      const res = await postForm('/oauth/revoke', {
        token,
        token_type_hint: r.refreshToken ? 'refresh_token' : 'access_token'
      }).catch((error) => error)
      if (!(res instanceof Response) || !res.ok)
        log.warn?.('[wo] Tracy did not confirm the revoke; tokens forgotten here')
    }
    await store.clear()
    cached = null
    return status()
  }

  return { status, connect, poll, call, disconnect, tracyUrl: origin }
}

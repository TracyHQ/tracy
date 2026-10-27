// The only module that talks to the server: `/api/website-opportunities/*`, with the operator token when one is set.
const BASE = '/api/website-opportunities'
const TOKEN_KEY = 'website-opportunities.operator-token'

/** The operator token for this tab, or null. Storage can be blocked (private mode, sandbox): then there is none. */
export function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function writeToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Not kept: the next request asks again.
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(typeof body?.next === 'string' ? body.next : `HTTP ${status}`)
    this.status = status
    this.code = typeof body?.code === 'string' ? body.code : null
    this.body = body
  }
}

function headers(extra = {}) {
  const token = readToken()
  return token ? { ...extra, authorization: `Bearer ${token}` } : extra
}

/** JSON in, JSON out. Throws ApiError for an HTTP refusal, a TypeError when the server is unreachable. */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(body === undefined ? {} : { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data)
  return data
}

/** A stored picture as an object URL: an `<img src>` cannot carry the token header. */
export async function mediaObjectUrl(mediaId) {
  const res = await fetch(`${BASE}/media/${encodeURIComponent(mediaId)}`, { headers: headers() })
  if (!res.ok) throw new ApiError(res.status, null)
  return URL.createObjectURL(await res.blob())
}

export const newRequestId = () =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

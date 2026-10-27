// A thin HTTP client for one role (owner, editor, stranger): the session cookie it carries, a
// browser user agent (Cloudflare challenges bare clients), and a record of every call's status,
// time and Cloudflare verdict. The cookie lives in this object's memory and nowhere else.

import { ENV } from './env.mjs'

/**
 * @typedef {{ method: string, url: string, status: number, ms: number, cfMitigated: string | null,
 *   cfRay: string | null, code?: string }} CallRecord
 */

export class Client {
  /**
   * @param {{ name: string, email?: string | null, token?: string | null }} who
   */
  constructor({ name, email = null, token = null }) {
    this.name = name
    this.email = email
    /** @type {string | null} */
    this.token = token
    /** @type {CallRecord[]} */
    this.calls = []
  }

  /**
   * One request. `path` is absolute (`https://…`) or relative to the workspace origin.
   * @param {string} path
   * @param {{ method?: string, json?: any, headers?: Record<string, string>, redirect?: RequestRedirect, timeoutMs?: number }} [opts]
   * @returns {Promise<{ status: number, headers: Headers, text: string, json: any, ms: number }>}
   */
  async request(path, { method = 'GET', json, headers = {}, redirect = 'manual', timeoutMs = 60_000 } = {}) {
    const url = /^https?:\/\//.test(path) ? path : `${ENV.origin}${path}`
    const h = { 'user-agent': ENV.userAgent, accept: 'application/json, text/html;q=0.9', ...headers }
    if (this.token) h.cookie = `${ENV.sessionCookie}=${this.token}`
    if (json !== undefined) h['content-type'] = 'application/json'
    // Doors that change state check Origin against the workspace (CSRF); a browser always sends it.
    if (method !== 'GET' && method !== 'HEAD' && !h.origin) h.origin = new URL(url).origin
    const started = Date.now()
    const res = await fetch(url, {
      method,
      headers: h,
      body: json === undefined ? undefined : JSON.stringify(json),
      redirect,
      signal: AbortSignal.timeout(timeoutMs)
    })
    const text = await res.text()
    const ms = Date.now() - started
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    this.calls.push({
      method,
      url,
      status: res.status,
      ms,
      cfMitigated: res.headers.get('cf-mitigated'),
      cfRay: res.headers.get('cf-ray'),
      ...(body && typeof body.code === 'string' ? { code: body.code } : {})
    })
    return { status: res.status, headers: res.headers, text, json: body, ms }
  }

  get(path, opts) {
    return this.request(path, { ...opts, method: 'GET' })
  }

  post(path, json, opts) {
    return this.request(path, { ...opts, method: 'POST', json })
  }

  delete(path, opts) {
    return this.request(path, { ...opts, method: 'DELETE' })
  }
}

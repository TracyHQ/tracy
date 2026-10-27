/**
 * Resend's domain API, for mode `tracy-domain`: register the customer's domain on Tracy's Resend
 * account, read the DNS records Resend wants, ask it to check them again, list what the account
 * holds, and delete what Tracy made.
 *
 * Every answer is reduced to the one shape the screen draws — `{id, name, status, records}` with
 * `records: [{type, name, value, status}]` — so a field Resend adds or renames later changes this
 * file and nothing else.
 *
 * 🔒 A REFUSAL IS NOT A SILENCE. Resend's plan-limit answer ("You have reached the domain limit of
 * your plan") used to reach the screen as "the domain check did not answer, try again" — a retry
 * that can never succeed. `domainFailure` sorts every error into what the person can do about it,
 * and only a timeout, a dropped connection or a 5xx is "did not answer".
 */
const BASE = 'https://api.resend.com'
/** Long enough for Resend on a slow day, short enough that a Save button does not hang. */
const TIMEOUT_MS = 15_000
/** Pages of `GET /domains` read before giving up: a plan holds a handful, never hundreds. */
const MAX_PAGES = 10

export class ResendError extends Error {
  /**
   * @param {string} message
   * @param {number | null} status - Resend's HTTP status; null when it never answered.
   * @param {string | null} [name] - Resend's own error name (`not_found`, `validation_error`, …).
   */
  constructor(message, status = null, name = null) {
    super(message)
    this.name = 'ResendError'
    this.status = status
    this.resendName = name
  }
}

function shape(body) {
  const records = Array.isArray(body?.records) ? body.records : []
  return {
    id: typeof body?.id === 'string' ? body.id : null,
    name: typeof body?.name === 'string' ? body.name : null,
    status: typeof body?.status === 'string' ? body.status : null,
    records: records.map((r) => ({
      type: String(r?.type ?? r?.record ?? ''),
      name: String(r?.name ?? ''),
      value: String(r?.value ?? ''),
      status: typeof r?.status === 'string' ? r.status : null,
      ...(r?.priority !== undefined && r?.priority !== null ? { priority: Number(r.priority) } : {})
    }))
  }
}

/** Resend answered that the domain id is unknown to it: deleted on the dashboard, or never made. */
export const isGone = (error) => error instanceof ResendError && error.status === 404

/** Resend's refusal to add a domain because the plan is full. Its wording is the only marker. */
export const isPlanLimit = (error) =>
  error instanceof ResendError &&
  error.status !== null &&
  error.status >= 400 &&
  error.status < 500 &&
  /domain limit|upgrade to add more/i.test(error.message)

/**
 * What a failed domain call means for the person who pressed the button, as the door answers it.
 * @returns {{status: number, body: {code: string, reason?: string}}}
 */
export function domainFailure(error) {
  if (isPlanLimit(error)) return { status: 409, body: { code: 'SITE_MAIL_DOMAIN_LIMIT' } }
  const status = error instanceof ResendError ? error.status : null
  // The key cannot manage domains (a sending-only key answers 401 `restricted_api_key`): nothing
  // the site admin does fixes that, and "try again" would be a lie.
  if (status === 401 || status === 403) return { status: 503, body: { code: 'SITE_MAIL_DOMAIN_UNAVAILABLE' } }
  // Resend read the name and refused it (not a real domain, a public suffix, …).
  if (status === 400 || status === 422)
    return { status: 400, body: { code: 'INVALID_REQUEST', reason: 'DOMAIN_REJECTED' } }
  return { status: 502, body: { code: 'SITE_MAIL_UPSTREAM' } }
}

/**
 * @param {{key: string, fetchImpl?: typeof fetch, timeoutMs?: number}} o
 */
export function resendDomains({ key, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const call = async (method, path, body) => {
    let res
    try {
      res = await fetchImpl(`${BASE}${path}`, {
        method,
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    } catch (error) {
      throw new ResendError(`resend ${method} ${path}: ${error?.message ?? error}`.slice(0, 300))
    }
    const text = await res.text()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    if (!res.ok) {
      const why = typeof parsed?.message === 'string' ? parsed.message : `HTTP ${res.status}`
      throw new ResendError(
        `resend ${method} ${path}: ${why}`.slice(0, 300),
        res.status,
        typeof parsed?.name === 'string' ? parsed.name : null
      )
    }
    return parsed
  }
  const one = (id) => `/domains/${encodeURIComponent(id)}`
  return {
    create: async (name) => shape(await call('POST', '/domains', { name })),
    get: async (id) => shape(await call('GET', one(id))),
    verify: async (id) => {
      await call('POST', `${one(id)}/verify`)
      return shape(await call('GET', one(id)))
    },
    /** Every domain on the account, `[{id, name, status}]` (no records: the list does not carry them). */
    list: async () => {
      const all = []
      let after = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const q = new URLSearchParams({ limit: '100', ...(after ? { after } : {}) })
        const body = await call('GET', `/domains?${q}`)
        const data = Array.isArray(body?.data) ? body.data : []
        for (const d of data) {
          const { id, name, status } = shape(d)
          if (id && name) all.push({ id, name: name.toLowerCase(), status })
        }
        if (body?.has_more !== true || data.length === 0) break
        after = all.at(-1).id
      }
      return all
    },
    /** Delete one domain. `false` when Resend no longer had it — the outcome wanted either way. */
    remove: async (id) => {
      try {
        await call('DELETE', one(id))
        return true
      } catch (error) {
        if (isGone(error)) return false
        throw error
      }
    }
  }
}

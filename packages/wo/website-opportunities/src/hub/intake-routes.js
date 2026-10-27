/**
 * The hub's intake doors (ADR 0036 Phase 3), under `/hub/v1`:
 *
 *   POST /hub/v1/contributions                 202 + receipt; `Idempotency-Key` header required
 *   GET  /hub/v1/contributions/:id             the receipt (own contributions only)
 *   POST /hub/v1/contributions/:id/withdraw    withdraw (own only); its observations become `withdrawn`
 *   GET  /hub/v1/account                       the account's quota use and limits
 *
 * Callers authenticate with `Authorization: Bearer <token>`; every token of one account shares its quota. When the
 * host has the optional `hubAccountOf` member, a signed-in person also manages their own token:
 *
 *   GET    /hub/v1/account/token   the account and the active token's prefix
 *   POST   /hub/v1/account/token   a new token (issue, or rotate when one exists); shown once
 *   DELETE /hub/v1/account/token   revoke it
 */
import { Hono } from 'hono'
import { createHubContributions, IDEMPOTENCY_KEY_RE } from './contributions.js'
import { createHubQuota } from './quota.js'
import { createHubTokens } from './tokens.js'

export const HUB_BASE = '/hub/v1'
export const MAX_CONTRIBUTION_BYTES = 256 * 1024
const RATE_PER_MINUTE = 60

const NEXT = {
  invalid_token: 'Send a valid hub token as "Authorization: Bearer <token>".',
  missing_idempotency_key:
    'Send an Idempotency-Key header (1 to 200 visible ASCII characters) and retry with the same one.',
  invalid_json: 'Send the contribution as a JSON object.',
  payload_too_large: `Send at most ${MAX_CONTRIBUTION_BYTES} bytes per contribution; split the observations.`,
  idempotency_key_reused: 'This key was used for a different payload. Use a new key for new data.',
  quota_exceeded: 'Wait for the quota period to end.',
  pending_limit: 'Wait until your pending observations are verified.',
  rate_limited: 'Slow down and retry in a minute.',
  private_field:
    'Send only public business facts: deal status, notes, briefs, demos and outreach stay with you.',
  not_found: 'No such contribution on this account.',
  forbidden_origin: 'Use this page from its own site.',
  no_account: 'This sign-in has no hub account here.',
  too_many_observations: 'Send at most 50 observations per contribution.',
  unknown_key: 'Send only the keys of wo-contribution/v1: schema, subject, observations.',
  unsupported_schema: 'Set "schema" to "wo-contribution/v1".',
  invalid_subject: 'Name the subject as {"identity": {"namespace", "externalId"}}.',
  no_observations: 'Send at least one observation.',
  invalid_contribution: 'Send the contribution as a JSON object.'
}

/**
 * @param {{ pool: import('pg').Pool, host?: Partial<import('../host.js').WoHost>, config?: { origin?: string },
 *   tokens?: ReturnType<typeof createHubTokens>, quota?: ReturnType<typeof createHubQuota>,
 *   quotaLimits?: Parameters<typeof createHubQuota>[0]['limits'], pendingPlacesLimit?: number,
 *   now?: () => number }} deps
 */
export function hubIntakeRoutes({
  pool,
  host = {},
  config = {},
  tokens = createHubTokens({ pool }),
  quota,
  quotaLimits,
  pendingPlacesLimit,
  now = Date.now
}) {
  const hubQuota = quota ?? createHubQuota({ pool, limits: quotaLimits, now })
  const contributions = createHubContributions({ pool, quota: hubQuota, pendingPlacesLimit, now })
  const json = (c, body, status = 200) => (host.json ? host.json(c, body, status) : c.json(body, status))
  const refuse = (c, status, code, extra = {}) => json(c, { code, ...extra, next: NEXT[code] ?? '' }, status)
  const origin = String(config.origin ?? '').replace(/\/+$/, '')
  const app = new Hono()

  /** The token's account, or a refusal Response. */
  async function account(c) {
    const header = c.req.header('authorization') ?? ''
    const match = /^Bearer\s+(\S+)$/i.exec(header)
    const who = match ? await tokens.authenticate(match[1]) : null
    if (!who) {
      c.header('WWW-Authenticate', 'Bearer realm="hub"')
      return refuse(c, 401, 'invalid_token')
    }
    if (
      host.overLimitOrClosed &&
      (await host.overLimitOrClosed(pool, `hub:${who.accountId}`, RATE_PER_MINUTE, now(), 60_000))
    )
      return refuse(c, 429, 'rate_limited')
    return who
  }

  app.post(`${HUB_BASE}/contributions`, async (c) => {
    const who = await account(c)
    if (who instanceof Response) return who
    const key = c.req.header('idempotency-key') ?? ''
    if (!IDEMPOTENCY_KEY_RE.test(key)) return refuse(c, 400, 'missing_idempotency_key')
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > MAX_CONTRIBUTION_BYTES) return refuse(c, 413, 'payload_too_large')
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.length > MAX_CONTRIBUTION_BYTES) return refuse(c, 413, 'payload_too_large')
    let body
    try {
      body = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return refuse(c, 400, 'invalid_json')
    }
    const out = await contributions.submit({
      accountId: who.accountId,
      idempotencyKey: key,
      body,
      bytes: bytes.length
    })
    switch (out.kind) {
      case 'created':
        return json(c, out.receipt, 202)
      case 'replayed':
        c.header('Idempotent-Replayed', 'true')
        return json(c, out.receipt, 202)
      case 'conflict':
        return refuse(c, 409, 'idempotency_key_reused')
      case 'quota':
        return refuse(c, 429, 'quota_exceeded', {
          category: out.refusal.category,
          period: out.refusal.period,
          limit: out.refusal.limit,
          used: out.refusal.used
        })
      case 'pending_limit':
        return refuse(c, 429, 'pending_limit', { limit: out.limit })
      default:
        return refuse(c, 422, out.code, out.path ? { path: out.path } : {})
    }
  })

  app.get(`${HUB_BASE}/contributions/:id`, async (c) => {
    const who = await account(c)
    if (who instanceof Response) return who
    const receipt = await contributions.receipt(who.accountId, c.req.param('id'))
    return receipt ? json(c, receipt) : refuse(c, 404, 'not_found')
  })

  app.post(`${HUB_BASE}/contributions/:id/withdraw`, async (c) => {
    const who = await account(c)
    if (who instanceof Response) return who
    const receipt = await contributions.withdraw(who.accountId, c.req.param('id'))
    return receipt ? json(c, receipt) : refuse(c, 404, 'not_found')
  })

  app.get(`${HUB_BASE}/account`, async (c) => {
    const who = await account(c)
    if (who instanceof Response) return who
    const limits = Object.fromEntries(
      Object.keys(await hubQuota.usage(who.accountId)).map((k) => [k, hubQuota.limitsOf(k)])
    )
    return json(c, { accountId: who.accountId, usage: await hubQuota.usage(who.accountId), limits })
  })

  if (typeof host.hubAccountOf === 'function') {
    /** The signed-in person's principal, once the host allows them a hub account; or a refusal Response. */
    async function person(c, { write }) {
      if (write && origin && c.req.header('origin') !== origin) return refuse(c, 403, 'forbidden_origin')
      const email = await host.requireViewer(c, config)
      if (email instanceof Response) return email
      const principalId = await host.principalOf(pool, email)
      if (!principalId) return refuse(c, 403, 'no_account')
      if (write && !(await host.hubAccountOf(pool, principalId))) return refuse(c, 403, 'no_account')
      return principalId
    }
    app.get(`${HUB_BASE}/account/token`, async (c) => {
      const p = await person(c, { write: false })
      if (p instanceof Response) return p
      return json(c, await tokens.status(p))
    })
    app.post(`${HUB_BASE}/account/token`, async (c) => {
      const p = await person(c, { write: true })
      if (p instanceof Response) return p
      const { token, prefix, accountId } = await tokens.rotate(p)
      c.header('Cache-Control', 'no-store')
      return json(c, { token, prefix, accountId }, 201)
    })
    app.delete(`${HUB_BASE}/account/token`, async (c) => {
      const p = await person(c, { write: true })
      if (p instanceof Response) return p
      return json(c, { revoked: await tokens.revoke(p) })
    })
  }

  return app
}

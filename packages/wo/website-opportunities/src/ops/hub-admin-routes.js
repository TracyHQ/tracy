/**
 * Hub administration doors, under `/api/website-opportunities/operator/hub`. Mount them only where this deployment
 * serves the hub (`HUB_SERVE=1`); pass `hub: true` to `operatorRoutes` then, so the page shows its Hub tab.
 *
 *   GET  /accounts?state=                       → accounts with token prefix, contributions, quota use and limits
 *   POST /accounts/:id/block | /unblock          → a blocked account's token stops at once
 *   POST /accounts/:id/revoke-token              → the active token stops; the account and its quota stay
 *   GET  /accounts/:id/contributions             → its newest contributions
 *   POST /contributions/:id/withdraw             → withdrawn on the account's behalf; snapshots recompute without it
 *   POST /places/:id/revoke     {reason}         → off the hub, a tombstone goes out
 *   POST /places/:id/suppress   {reason}         → removed at the business's request; never ingested again
 *   POST /media/:id/revoke      {reason}         → one picture off the hub
 *   GET  /verify                                 → verification backlog and today's verification spend
 *
 * Who may: whoever `host.requireOperator` names; every POST asks it with `{write: true}` and needs a JSON body.
 */
import { Hono } from 'hono'
import { requireHost } from '../host.js'
import {
  contributionAccountOf,
  contributionsOf,
  hubAccountById,
  isUuid,
  listHubAccounts,
  setHubAccountState,
  verifyBacklog
} from '../hub/admin.js'
import { createHubContributions } from '../hub/contributions.js'
import { createHubQuota, QUOTA_CATEGORIES } from '../hub/quota.js'
import { revokeMedia, revokePlace, suppressBusiness } from '../hub/revocations.js'
import { createHubTokens } from '../hub/tokens.js'
import { DEFAULT_VERIFY_DAILY_CAP_CENTS } from '../hub/verify-queue.js'
import { OPERATOR_BASE } from './operator-routes.js'

const REASON_MAX = 500
const REFUSALS = Object.freeze({
  JSON_REQUIRED: [415, 'Send the body as application/json.'],
  REASON_REQUIRED: [400, `Say why in "reason" (1 to ${REASON_MAX} characters).`],
  INVALID_FILTER: [400, 'Filter by state "active" or "blocked".'],
  ACCOUNT_NOT_FOUND: [404, 'No such hub account.'],
  CONTRIBUTION_NOT_FOUND: [404, 'No such contribution.'],
  PLACE_NOT_FOUND: [404, 'No such place.'],
  MEDIA_NOT_FOUND: [404, 'No such picture.']
})

/**
 * @param {{ pool: import('pg').Pool, host: import('../host.js').WoHost, now?: () => number,
 *   quotaLimits?: object, verifyDailyCapCents?: number, log?: {log: Function} }} deps
 *   `quotaLimits` and `verifyDailyCapCents`: the same the hub's intake and verify queue run with.
 */
export function hubAdminRoutes({
  pool,
  host: given,
  now = Date.now,
  quotaLimits = {},
  verifyDailyCapCents = DEFAULT_VERIFY_DAILY_CAP_CENTS,
  log = console
}) {
  const host = requireHost(given, ['json', 'requireOperator'])
  const quota = createHubQuota({ pool, limits: quotaLimits, now })
  const tokens = createHubTokens({ pool })
  const contributions = createHubContributions({ pool, quota, now })
  const app = new Hono()
  const B = `${OPERATOR_BASE}/hub`

  const refuse = (c, code) => {
    const [status, next] = REFUSALS[code]
    return host.json(c, { code, next }, status)
  }
  const answer = (c, body) => {
    c.header('cache-control', 'no-store')
    return host.json(c, body)
  }
  async function operator(c, { write = false } = {}) {
    const who = await host.requireOperator(c, { write })
    if (typeof who !== 'string') return { deny: who }
    if (write && !/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return { deny: refuse(c, 'JSON_REQUIRED') }
    return { email: who }
  }
  const reasonOf = async (c) => {
    const body = await c.req.json().catch(() => null)
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    return reason && reason.length <= REASON_MAX ? reason : null
  }
  const placeExists = async (id) =>
    isUuid(id) && (await pool.query('select 1 from wo_place where id = $1', [id])).rowCount === 1

  app.get(`${B}/accounts`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    const state = c.req.query('state') || null
    if (state && !['active', 'blocked'].includes(state)) return refuse(c, 'INVALID_FILTER')
    return answer(c, {
      accounts: await listHubAccounts(pool, { now, state }),
      limits: Object.fromEntries(QUOTA_CATEGORIES.map((k) => [k, quota.limitsOf(k)]))
    })
  })

  for (const [action, state] of [
    ['block', 'blocked'],
    ['unblock', 'active']
  ]) {
    app.post(`${B}/accounts/:id/${action}`, async (c) => {
      const g = await operator(c, { write: true })
      if (g.deny) return g.deny
      const account = await hubAccountById(pool, c.req.param('id'))
      if (!account) return refuse(c, 'ACCOUNT_NOT_FOUND')
      await setHubAccountState(pool, account.id, state)
      log.log?.(`[wo hub admin] account ${account.id} ${state} by ${g.email}`)
      return answer(c, { ok: true, state })
    })
  }

  app.post(`${B}/accounts/:id/revoke-token`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const account = await hubAccountById(pool, c.req.param('id'))
    if (!account) return refuse(c, 'ACCOUNT_NOT_FOUND')
    const revoked = await tokens.revoke(account.principalId)
    log.log?.(`[wo hub admin] token of ${account.id} revoked by ${g.email}`)
    return answer(c, { ok: true, revoked })
  })

  app.get(`${B}/accounts/:id/contributions`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    const account = await hubAccountById(pool, c.req.param('id'))
    if (!account) return refuse(c, 'ACCOUNT_NOT_FOUND')
    return answer(c, { contributions: await contributionsOf(pool, account.id) })
  })

  app.post(`${B}/contributions/:id/withdraw`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const id = c.req.param('id')
    const accountId = await contributionAccountOf(pool, id)
    if (!accountId) return refuse(c, 'CONTRIBUTION_NOT_FOUND')
    const receipt = await contributions.withdraw(accountId, id)
    log.log?.(`[wo hub admin] contribution ${id} withdrawn by ${g.email}`)
    return answer(c, { ok: true, receipt })
  })

  for (const [action, run] of [
    ['revoke', revokePlace],
    ['suppress', suppressBusiness]
  ]) {
    app.post(`${B}/places/:id/${action}`, async (c) => {
      const g = await operator(c, { write: true })
      if (g.deny) return g.deny
      const placeId = c.req.param('id')
      if (!(await placeExists(placeId))) return refuse(c, 'PLACE_NOT_FOUND')
      const reason = await reasonOf(c)
      if (!reason) return refuse(c, 'REASON_REQUIRED')
      const out = await run(pool, { placeId, reason, actor: g.email })
      log.log?.(`[wo hub admin] place ${placeId} ${action} by ${g.email}`)
      return answer(c, { ok: true, already: out.already })
    })
  }

  app.post(`${B}/media/:id/revoke`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const mediaId = c.req.param('id')
    const reason = await reasonOf(c)
    if (!reason) return refuse(c, 'REASON_REQUIRED')
    if (!isUuid(mediaId)) return refuse(c, 'MEDIA_NOT_FOUND')
    const exists = (await pool.query('select 1 from wo_place_media where id = $1', [mediaId])).rowCount
    if (!exists) return refuse(c, 'MEDIA_NOT_FOUND')
    const out = await revokeMedia(pool, { mediaId, reason })
    log.log?.(`[wo hub admin] media ${mediaId} revoked by ${g.email}`)
    return answer(c, { ok: true, revoked: out.revoked })
  })

  app.get(`${B}/verify`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    return answer(c, await verifyBacklog(pool, { now, verifyDailyCapCents }))
  })

  return app
}

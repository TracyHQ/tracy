/**
 * The operator doors of a Website Opportunities deployment, under `/api/website-opportunities/operator`:
 *
 *   GET  /me                       → {operator, email, hub, tracy?, keysWritable}: whether to show the operator page
 *   GET  /settings                 → settings, provider key facts (never a key), provider order with states
 *   PUT  /settings                 {settings} → keys left out keep their saved value
 *   PUT  /keys/:provider           {apiKey} → sealed through the host; '' clears it (409 KEYS_READ_ONLY without a seal)
 *   POST /keys/:provider/test      → one cheap call to the provider with the key in use
 *   GET  /spend?days=30            → cost ledger totals per provider, purpose and day, and the caps
 *   GET  /spend/rows?state=&provider=&purpose=&cursor=&limit=
 *   GET  /queue?state=&limit=      → research jobs by state
 *   POST /queue/:id/retry | /queue/:id/cancel
 *
 * Who may: whoever `host.requireOperator` names (`../host.js`); a door that writes asks it with `{write: true}`. A
 * write must carry a JSON body: a page on another site cannot send one without the browser asking first. Hub
 * administration has its own doors (`./hub-admin-routes.js`), mounted only where the hub is served.
 */
import { Hono } from 'hono'
import { requireHost } from '../host.js'
import {
  parseWoOpsSettingsInput,
  readWoOpsSettings,
  saveWoOpsSettings,
  WO_PROVIDERS
} from '../wo-settings.js'
import { keysWritable, providerKeyFacts, saveProviderKey, testProviderKey } from './provider-keys.js'
import { capabilityGroups } from './provider-states.js'
import { cancelPlaceJob, PLACE_JOB_STATES, researchQueue, retryPlaceJob } from './research-queue.js'
import {
  decodeSpendCursor,
  LEDGER_STATES,
  MAX_SPEND_DAYS,
  spendCaps,
  spendRows,
  spendSummary
} from './spend.js'

export const OPERATOR_BASE = '/api/website-opportunities/operator'
const KEY_MAX = 512
const NAME = /^[a-z0-9][a-z0-9._~-]{0,99}$/i

const REFUSALS = Object.freeze({
  JSON_REQUIRED: [415, 'Send the body as application/json.'],
  INVALID_BODY: [400, 'Send a JSON object.'],
  UNKNOWN_PROVIDER: [400, 'Name a provider this deployment knows.'],
  INVALID_API_KEY: [
    400,
    'Send apiKey as one string without spaces, at most 512 characters; an empty string clears it.'
  ],
  KEYS_READ_ONLY: [409, 'This server reads provider keys from its environment; set them there and restart.'],
  INVALID_DAYS: [400, `Ask for 1 to ${MAX_SPEND_DAYS} days.`],
  INVALID_FILTER: [400, 'Use a known state and a provider or purpose name.'],
  INVALID_CURSOR: [400, 'Use the cursor a previous page returned.'],
  INVALID_LIMIT: [400, 'Ask for 1 to 200 rows.'],
  NOT_FOUND: [404, 'No such research job.'],
  NOT_RETRYABLE: [409, 'Only a failed, paused, blocked or cancelled job can be retried.'],
  NOT_ACTIVE: [409, 'The job is not running or waiting any more.'],
  STILL_WANTED: [409, 'Someone still waits on this research; it is stopped when they cancel.'],
  NO_DATABASE: [503, 'This server has no database.']
})

/**
 * @param {{ pool: import('pg').Pool | null, config: any, host: import('../host.js').WoHost,
 *   fetchImpl?: typeof fetch, hub?: boolean, tracy?: boolean, now?: () => number, log?: {log: Function} }} deps
 *   `hub`: the hub admin doors are mounted beside these, so the page shows a Hub tab.
 *   `tracy`: the Tracy connection doors (`./tracy-routes.js`) are mounted beside these, so the page shows a Tracy tab.
 */
export function operatorRoutes({
  pool,
  config,
  host: given,
  fetchImpl = fetch,
  hub = false,
  tracy = false,
  now = Date.now,
  log = console
}) {
  const host = requireHost(given, ['json', 'requireOperator', 'openSecret'])
  const app = new Hono()

  const refuse = (c, code, extra = {}) => {
    const [status, next] = REFUSALS[code]
    return host.json(c, { code, next, ...extra }, status)
  }
  const answer = (c, body, status = 200) => {
    c.header('cache-control', 'no-store')
    return host.json(c, body, status)
  }

  /** The operator's email, or the refusal to return. Writes also need a JSON body. */
  async function operator(c, { write = false } = {}) {
    const who = await host.requireOperator(c, { write })
    if (typeof who !== 'string') return { deny: who }
    if (write && !/^application\/json\b/i.test(c.req.header('content-type') ?? ''))
      return { deny: refuse(c, 'JSON_REQUIRED') }
    if (!pool) return { deny: refuse(c, 'NO_DATABASE') }
    return { email: who }
  }

  async function settingsDocument() {
    const [{ settings, updatedBy, updatedAt }, keys, capabilities] = await Promise.all([
      readWoOpsSettings(pool),
      providerKeyFacts(pool, config, host),
      capabilityGroups(pool, config, host, { now })
    ])
    return {
      settings,
      settingsMeta: { updatedBy, updatedAt },
      keys,
      keysWritable: keysWritable(config, host),
      capabilities
    }
  }

  const B = OPERATOR_BASE

  app.get(`${B}/me`, async (c) => {
    const who = await host.requireOperator(c, { write: false })
    if (typeof who !== 'string') return who
    return answer(c, {
      operator: true,
      email: who,
      hub: Boolean(hub),
      // Only where the Tracy tab exists, so a host without it answers as before.
      ...(tracy ? { tracy: true } : {}),
      keysWritable: keysWritable(config, host)
    })
  })

  app.get(`${B}/settings`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    return answer(c, await settingsDocument())
  })

  app.put(`${B}/settings`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const body = await c.req.json().catch(() => null)
    const sent = body?.settings
    if (!sent || typeof sent !== 'object' || Array.isArray(sent)) return refuse(c, 'INVALID_BODY')
    const parsed = parseWoOpsSettingsInput(sent)
    if (!parsed.ok) return answer(c, { code: parsed.error, next: parsed.message }, 400)
    // Keys left out keep their saved value: a tab sends only what it shows.
    const { settings: saved } = await readWoOpsSettings(pool)
    const given = Object.fromEntries(Object.keys(sent).map((k) => [k, parsed.settings[k]]))
    await saveWoOpsSettings(pool, { ...saved, ...given }, g.email)
    log.log?.(`[wo operator] settings updated by ${g.email}`)
    return answer(c, await settingsDocument())
  })

  app.put(`${B}/keys/:provider`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const provider = c.req.param('provider')
    if (!WO_PROVIDERS.includes(provider)) return refuse(c, 'UNKNOWN_PROVIDER')
    if (!keysWritable(config, host)) return refuse(c, 'KEYS_READ_ONLY')
    const body = await c.req.json().catch(() => null)
    if (typeof body?.apiKey !== 'string' || body.apiKey.length > KEY_MAX || /\s/.test(body.apiKey.trim()))
      return refuse(c, 'INVALID_API_KEY')
    await saveProviderKey(pool, config, host, provider, body.apiKey, g.email)
    log.log?.(
      `[wo operator] ${provider} key ${body.apiKey.trim() === '' ? 'cleared' : 'saved'} by ${g.email}`
    )
    return answer(c, await settingsDocument())
  })

  app.post(`${B}/keys/:provider/test`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const provider = c.req.param('provider')
    if (!WO_PROVIDERS.includes(provider)) return refuse(c, 'UNKNOWN_PROVIDER')
    return answer(c, await testProviderKey(pool, config, host, provider, fetchImpl))
  })

  app.get(`${B}/spend`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    const days = Number(c.req.query('days') ?? 30)
    if (!Number.isInteger(days) || days < 1 || days > MAX_SPEND_DAYS) return refuse(c, 'INVALID_DAYS')
    const [summary, { settings }] = await Promise.all([
      spendSummary(pool, { days, now }),
      readWoOpsSettings(pool)
    ])
    return answer(c, { ...summary, caps: spendCaps(settings) })
  })

  app.get(`${B}/spend/rows`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    const state = c.req.query('state') || null
    const provider = c.req.query('provider') || null
    const purpose = c.req.query('purpose') || null
    if ((state && !LEDGER_STATES.includes(state)) || [provider, purpose].some((v) => v && !NAME.test(v)))
      return refuse(c, 'INVALID_FILTER')
    const limit = Number(c.req.query('limit') ?? 50)
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return refuse(c, 'INVALID_LIMIT')
    const raw = c.req.query('cursor')
    const cursor = raw ? decodeSpendCursor(raw) : null
    if (raw && !cursor) return refuse(c, 'INVALID_CURSOR')
    return answer(c, await spendRows(pool, { state, provider, purpose, cursor, limit }))
  })

  app.get(`${B}/queue`, async (c) => {
    const g = await operator(c)
    if (g.deny) return g.deny
    const state = c.req.query('state') || null
    if (state && !PLACE_JOB_STATES.includes(state)) return refuse(c, 'INVALID_FILTER')
    const limit = Number(c.req.query('limit') ?? 50)
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return refuse(c, 'INVALID_LIMIT')
    return answer(c, await researchQueue(pool, { state, limit }))
  })

  app.post(`${B}/queue/:id/retry`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const out = await retryPlaceJob(pool, c.req.param('id'), { now })
    if (out.error) return refuse(c, out.error)
    log.log?.(`[wo operator] research job ${c.req.param('id')} retried by ${g.email}`)
    return answer(c, { ok: true, job: out.job })
  })

  app.post(`${B}/queue/:id/cancel`, async (c) => {
    const g = await operator(c, { write: true })
    if (g.deny) return g.deny
    const out = await cancelPlaceJob(pool, c.req.param('id'))
    if (out.error) return refuse(c, out.error)
    log.log?.(`[wo operator] research job ${c.req.param('id')} cancelled by ${g.email}`)
    return answer(c, { ok: true })
  })

  return app
}

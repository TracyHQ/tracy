/**
 * `/ops/wo` — Website Opportunities Operations (Live Queue across all accounts + Settings).
 *
 *   GET  /api/ops/wo                              → full Live Queue, user tabs, provider facts, settings,
 *                                                   capability groups with their provider order and states
 *   GET  /api/ops/wo/demos/summary                → demo retention keys + live/frozen/expiring/deleted counts
 *   PUT  /api/ops/wo/read                         { opportunityId, read } → mark row read/unread for viewer
 *   PUT  /api/ops/wo/settings                     { settings, uiEnabled? } → save deployment settings
 *   GET  /api/ops/wo/public-demos                 → `/v1/demos` live cap and model budget (Tracy's, not the package's)
 *   PUT  /api/ops/wo/public-demos                 { settings } → save them; keys left out keep their value
 *   PUT  /api/ops/wo/keys/:provider               { apiKey } → seal & save provider key (empty clears override)
 *   POST /api/ops/wo/keys/:provider/test          → test provider connectivity & latency
 *   POST /api/ops/wo/opportunities/:id/action     { action } → force-complete-brief | reset-cap-resume | reclaim-retry | bump-queue | cancel-job
 *
 * Staff (`admit`) may read the queue and mark their own rows read/unread; only `owner` or `admin`
 * from this deployment's origin may modify settings, rotate keys, test keys, or run queue actions.
 */
import { Hono } from 'hono'
import {
  listWoQueue,
  markWoRead,
  readDemoSummary,
  runWoOperatorAction,
  saveWoProviderKey,
  saveWoSurfaceSwitch,
  testWoProviderKey,
  woCapabilities
} from '../lib/wo-ops.js'
import {
  PUBLIC_FIND_RANGES,
  parseWoOpsSettingsInput,
  readWoOpsSettings,
  saveWoOpsSettings,
  WO_PROVIDERS
} from 'website-opportunities/src/wo-settings.js'
import {
  mintSocialServiceKey,
  revokeSocialServiceKey,
  SOCIAL_DEPLOYMENT_ID,
  SOCIAL_SERVICE_SCOPES,
  socialOrigin
} from 'website-opportunities/src/wo-social-auth.js'
import { admit, denied } from './admit.js'
import {
  parsePublicDemoSettings,
  readPublicDemoSettings,
  savePublicDemoSettings
} from '../lib/wo-public-demo-settings.js'

/**
 * @param {{
 *   pool: import('pg').Pool | null,
 *   config: { origin: string, sessionSecret: string, siteDomain?: string, apifyToken?: string | null, model?: { apiKey?: string } | null },
 *   fetchImpl?: typeof fetch,
 *   log?: { log: (...a: any[]) => void },
 *   now?: () => number
 * }} deps
 */
export function woOpsRoutes({
  pool,
  config,
  fetchImpl = fetch,
  log = console,
  now = Date.now,
  prefetch = null
}) {
  const app = new Hono()

  const guard = async (c, { write = false, sameOrigin = false } = {}) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (write && !['owner', 'admin'].includes(who.role)) {
      return { deny: c.body(null, 403) }
    }
    if ((write || sameOrigin) && c.req.header('origin') !== config.origin) {
      return { deny: c.body(null, 403) }
    }
    return { who }
  }

  const viewerAccountFor = async (email) => {
    if (!pool || !email) return null
    try {
      const { rows } = await pool.query(
        'select id, email, display_name as name from account where email = $1 limit 1',
        [email]
      )
      return rows[0] ?? { id: null, email, name: email.split('@')[0] }
    } catch {
      return { id: null, email, name: email.split('@')[0] }
    }
  }

  const fullDocument = async (who) => {
    const viewerAccount = await viewerAccountFor(who.email)
    const queue = await listWoQueue(pool, config, viewerAccount)
    return {
      ...queue,
      capabilities: await woCapabilities(pool, config, { now }),
      writable: ['owner', 'admin'].includes(who.role),
      viewerRole: who.role
    }
  }

  app.get('/api/ops/wo/prefetch/dubai', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('Cache-Control', 'no-store')
    return prefetch ? c.json(await prefetch.status()) : c.json({ error: 'DATABASE_REQUIRED' }, 503)
  })
  app.get('/api/ops/wo/prefetch/dubai/places/:id/media/:mediaId', async (c) => {
    c.header('Cache-Control', 'private, no-store')
    const g = await guard(c)
    if (g.deny) return g.deny
    return (await prefetch?.media(c.req.param('id'), c.req.param('mediaId'))) ?? c.body(null, 404)
  })
  app.post('/api/ops/wo/prefetch/dubai', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!prefetch || config.woSocialRole !== 'central' || config.woSharedResearch === false)
      return c.json({ error: 'SOCIAL_CENTRAL_REQUIRED' }, 503)
    const b = await c.req.json().catch(() => null)
    if (!['seed', 'start', 'stop', 'concurrency'].includes(b?.action))
      return c.json({ error: 'INVALID_PREFETCH_ACTION' }, 400)
    if (
      b.action === 'concurrency' &&
      (!Number.isInteger(b.concurrency) || b.concurrency < 1 || b.concurrency > 3)
    )
      return c.json({ error: 'INVALID_PREFETCH_CONCURRENCY' }, 400)
    try {
      const result =
        b.action === 'seed'
          ? await prefetch.create()
          : b.action === 'concurrency'
            ? await prefetch.setConcurrency(b.concurrency)
            : await prefetch.setEnabled(b.action === 'start')
      return c.json(result, result.sourceUnavailable ? 502 : result.busy || result.reason ? 409 : 200)
    } catch (error) {
      log.error?.('[opportunities] Dubai prefetch action failed', error?.message)
      return c.json({ error: 'PREFETCH_ACTION_FAILED' }, 502)
    }
  })

  // Service grants belong to the authority, and are never seat credentials.
  app.put('/api/ops/wo/social/deployments/:id', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool || config.woSocialRole !== 'central') return c.json({ error: 'SOCIAL_CENTRAL_REQUIRED' }, 503)
    const b = await c.req.json().catch(() => null),
      id = c.req.param('id')
    const limits = ['readsPerMinute', 'refreshesPerDay', 'forcesPerDay']
    if (
      !SOCIAL_DEPLOYMENT_ID.test(id) ||
      !socialOrigin(b?.origin) ||
      typeof b?.enabled !== 'boolean' ||
      limits.some((k) => !Number.isInteger(b?.[k]) || b[k] < 0 || b[k] > 10000)
    )
      return c.json({ error: 'INVALID_SOCIAL_DEPLOYMENT' }, 400)
    await pool.query(
      `insert into wo_social_deployment(deployment_id,origin,enabled,reads_per_minute,refreshes_per_day,forces_per_day)
      values($1,$2,$3,$4,$5,$6) on conflict(deployment_id) do update set origin=excluded.origin,enabled=excluded.enabled,
      reads_per_minute=excluded.reads_per_minute,refreshes_per_day=excluded.refreshes_per_day,forces_per_day=excluded.forces_per_day`,
      [id, socialOrigin(b.origin), b.enabled, ...limits.map((k) => b[k])]
    )
    return c.json({ ok: true })
  })
  app.post('/api/ops/wo/social/deployments/:id/keys', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool || config.woSocialRole !== 'central' || !config.woSocialKeyPepper)
      return c.json({ error: 'SOCIAL_CENTRAL_REQUIRED' }, 503)
    const b = await c.req.json().catch(() => null),
      id = c.req.param('id')
    if (
      !SOCIAL_DEPLOYMENT_ID.test(id) ||
      !Array.isArray(b?.scopes) ||
      !b.scopes.length ||
      b.scopes.some((s) => !SOCIAL_SERVICE_SCOPES.includes(s)) ||
      (b.expiresAt !== undefined &&
        (!Number.isFinite(Date.parse(b.expiresAt)) || Date.parse(b.expiresAt) <= now()))
    )
      return c.json({ error: 'INVALID_SOCIAL_KEY' }, 400)
    if (!(await pool.query('select 1 from wo_social_deployment where deployment_id=$1', [id])).rowCount)
      return c.json({ error: 'DEPLOYMENT_NOT_FOUND' }, 404)
    c.header('Cache-Control', 'no-store')
    return c.json(
      await mintSocialServiceKey({
        pool,
        pepper: config.woSocialKeyPepper,
        deploymentId: id,
        scopes: b.scopes,
        expiresAt: b.expiresAt ?? null,
        now: now()
      }),
      201
    )
  })
  app.delete('/api/ops/wo/social/keys/:id', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool || config.woSocialRole !== 'central') return c.json({ error: 'SOCIAL_CENTRAL_REQUIRED' }, 503)
    await revokeSocialServiceKey(pool, c.req.param('id'), now())
    return c.json({ ok: true })
  })

  app.get('/api/ops/wo', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    c.header('cache-control', 'no-store')
    return c.json(await fullDocument(g.who))
  })

  // The Website Opportunity panel of /ops/settings: the demo retention keys and how many demos each
  // state holds. Its own door so the panel does not read the whole Live Queue.
  app.get('/api/ops/wo/demos/summary', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const { settings } = await readWoOpsSettings(pool)
    c.header('cache-control', 'no-store')
    return c.json({
      retention: Object.fromEntries(
        Object.entries(settings).filter(
          ([k]) => k.startsWith('demo') || k === 'ownSiteBuildsPerAccountPerDay'
        )
      ),
      publicFind: Object.fromEntries(Object.keys(PUBLIC_FIND_RANGES).map((k) => [k, settings[k]])),
      counts: await readDemoSummary(pool, { now: now() }),
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  // `/v1/demos` (tasks/todo-wo-public-demos.md "decided"): live demo sites per account and the model budget.
  app.get('/api/ops/wo/public-demos', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    c.header('cache-control', 'no-store')
    return c.json({
      ...(await readPublicDemoSettings(pool)),
      writable: ['owner', 'admin'].includes(g.who.role)
    })
  })

  app.put('/api/ops/wo/public-demos', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const body = await c.req.json().catch(() => null)
    const { settings } = await readPublicDemoSettings(pool)
    const parsed = parsePublicDemoSettings(body?.settings, settings)
    if (!parsed.ok) return c.json({ error: parsed.code, message: parsed.message }, 400)
    await savePublicDemoSettings(pool, parsed.settings, g.who.email)
    log.log(`[ops/wo] public demo settings updated by ${g.who.email}`)
    c.header('cache-control', 'no-store')
    return c.json({ ...(await readPublicDemoSettings(pool)), writable: true })
  })

  app.put('/api/ops/wo/read', async (c) => {
    const g = await guard(c, { sameOrigin: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const body = await c.req.json().catch(() => null)
    const opportunityId = typeof body?.opportunityId === 'string' ? body.opportunityId.trim() : ''
    if (!opportunityId || typeof body?.read !== 'boolean') {
      return c.json({ error: 'INVALID_READ_BODY' }, 400)
    }
    const viewerAccount = await viewerAccountFor(g.who.email)
    if (viewerAccount?.id) {
      await markWoRead(pool, viewerAccount.id, opportunityId, body.read)
    }
    c.header('cache-control', 'no-store')
    return c.json({ ok: true, opportunityId, read: body.read })
  })

  app.put('/api/ops/wo/settings', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return c.json({ error: 'INVALID_BODY' }, 400)
    }

    if (typeof body.uiEnabled === 'boolean') {
      await saveWoSurfaceSwitch(pool, body.uiEnabled, g.who.email)
    }

    if (body.settings !== undefined) {
      const parsed = parseWoOpsSettingsInput(body.settings)
      if (!parsed.ok) return c.json({ error: parsed.error, message: parsed.message }, 400)
      // Keys left out keep their saved value: /ops/settings/wo sends only the demo retention keys.
      const sent = body.settings?.settings ?? body.settings
      const { settings: saved } = await readWoOpsSettings(pool)
      const given = Object.fromEntries(Object.keys(sent).map((k) => [k, parsed.settings[k]]))
      await saveWoOpsSettings(pool, { ...saved, ...given }, g.who.email)
    }

    log.log(`[ops/wo] settings updated by ${g.who.email}`)
    c.header('cache-control', 'no-store')
    return c.json(await fullDocument(g.who))
  })

  app.put('/api/ops/wo/keys/:provider', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const provider = c.req.param('provider')
    if (!WO_PROVIDERS.includes(provider)) {
      return c.json({ error: 'UNKNOWN_PROVIDER' }, 400)
    }
    const body = await c.req.json().catch(() => null)
    if (typeof body?.apiKey !== 'string' || body.apiKey.length > 512 || /\s/.test(body.apiKey.trim())) {
      return c.json({ error: 'INVALID_API_KEY' }, 400)
    }
    await saveWoProviderKey(pool, config, provider, body.apiKey, g.who.email)
    log.log(`[ops/wo] ${provider} key ${body.apiKey.trim() === '' ? 'cleared' : 'saved'} by ${g.who.email}`)
    c.header('cache-control', 'no-store')
    return c.json(await fullDocument(g.who))
  })

  app.post('/api/ops/wo/keys/:provider/test', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    const provider = c.req.param('provider')
    if (!WO_PROVIDERS.includes(provider)) {
      return c.json({ ok: false, provider, status: 'invalid_provider', detail: 'Unknown provider.' }, 400)
    }
    c.header('cache-control', 'no-store')
    const result = await testWoProviderKey(pool, config, provider, fetchImpl)
    return c.json(result)
  })

  app.post('/api/ops/wo/opportunities/:id/action', async (c) => {
    const g = await guard(c, { write: true })
    if (g.deny) return g.deny
    if (!pool) return c.json({ error: 'NO_DATABASE' }, 503)
    const opportunityId = c.req.param('id')
    const body = await c.req.json().catch(() => null)
    const action = typeof body?.action === 'string' ? body.action.trim() : ''
    if (!action) return c.json({ error: 'MISSING_ACTION' }, 400)

    const outcome = await runWoOperatorAction(pool, opportunityId, action, g.who.email)
    if (!outcome.ok) {
      return c.json({ error: outcome.error, message: outcome.message }, outcome.status || 400)
    }
    log.log(`[ops/wo] action ${action} on ${opportunityId} by ${g.who.email}`)
    c.header('cache-control', 'no-store')
    return c.json({
      ok: true,
      action,
      opportunityId,
      queue: await fullDocument(g.who)
    })
  })

  return app
}

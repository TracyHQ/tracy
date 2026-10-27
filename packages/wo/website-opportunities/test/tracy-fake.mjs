// A fake Tracy on a random local port: the OAuth device flow (RFC 8628), refresh rotation, revoke, `/v1/me` and
// `/v1/demos*`, with knobs a test turns to reach each answer. Holds everything in memory.
// `/v1/demos*` answers in Tracy's own shapes (`apps/tracy-web/src/opportunities-build/public-demos*.js`):
// `{demo, demos}`, and a refusal `{error: {code, message}, ...extra}`.
import { randomBytes } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const CLIENT = 'website-opportunities'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const FINAL = new Set(['ready', 'failed', 'cancelled'])

const id = (prefix) => `${prefix}${randomBytes(9).toString('hex')}`

export async function startFakeTracy({
  interval = 0,
  expiresIn = 600,
  accessSeconds = 3600,
  listen = true
} = {}) {
  const state = {
    devices: new Map(), // device_code → {userCode, status: pending|approved|denied, polls, lastPollAt, expiresAt}
    access: new Map(), // access token → {grant, expiresAt}
    refresh: new Map(), // refresh token → grant
    grants: new Map(), // grant → {live}
    demos: new Map(), // id → demo
    keys: new Map(), // idempotency key → {body, id}
    calls: [],
    refreshCalls: 0,
    revoked: [],
    limit: 20,
    budgetExhausted: false,
    // Before the next POST /v1/demos answers: wait this long (the client times out), the demo is made anyway.
    stallNextCreateMs: 0,
    slowDownNext: 0,
    retryAfter: null,
    // What GET /v1/demos/options announces; null answers as a Tracy from before `accepts`.
    accepts: null,
    profileRefusal: null,
    submissions: [],
    refreshDelayMs: 0,
    me: { email: 'seller@example.com', displayName: 'Sam Seller' }
  }

  function issue(grant) {
    const access = id('tra_')
    const refresh = id('trr_')
    state.access.set(access, { grant, expiresAt: Date.now() + accessSeconds * 1000 })
    state.refresh.set(refresh, grant)
    return { access_token: access, refresh_token: refresh, token_type: 'Bearer', expires_in: accessSeconds }
  }

  const form = async (c) => Object.fromEntries(new URLSearchParams(await c.req.text()))
  const app = new Hono()
  app.use('*', async (c, next) => {
    state.calls.push({ method: c.req.method, path: new URL(c.req.url).pathname })
    await next()
  })

  app.post('/oauth/device/code', async (c) => {
    if (!(c.req.header('content-type') ?? '').startsWith('application/x-www-form-urlencoded'))
      return c.json({ error: 'invalid_request' }, 400)
    const f = await form(c)
    if (f.client_id !== CLIENT || f.scope !== 'demos') return c.json({ error: 'invalid_client' }, 400)
    const deviceCode = id('dev_')
    const userCode = `${randomBytes(2).toString('hex')}-${randomBytes(2).toString('hex')}`.toUpperCase()
    state.devices.set(deviceCode, {
      userCode,
      status: 'pending',
      polls: 0,
      expiresAt: Date.now() + expiresIn * 1000
    })
    const base = new URL(c.req.url).origin
    return c.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_uri: `${base}/connect`,
      verification_uri_complete: `${base}/connect?code=${userCode}`,
      expires_in: expiresIn,
      interval
    })
  })

  app.post('/oauth/token', async (c) => {
    const f = await form(c)
    if (f.client_id !== CLIENT) return c.json({ error: 'invalid_client' }, 400)
    if (f.grant_type === DEVICE_GRANT) {
      const d = state.devices.get(f.device_code)
      if (!d) return c.json({ error: 'invalid_grant' }, 400)
      d.polls += 1
      if (state.slowDownNext > 0) {
        state.slowDownNext -= 1
        return c.json({ error: 'slow_down' }, 400)
      }
      if (Date.now() >= d.expiresAt) return c.json({ error: 'expired_token' }, 400)
      if (d.status === 'denied') return c.json({ error: 'access_denied' }, 400)
      if (d.status !== 'approved') return c.json({ error: 'authorization_pending' }, 400)
      state.devices.delete(f.device_code)
      const grant = id('g_')
      state.grants.set(grant, { live: true })
      return c.json(issue(grant))
    }
    if (f.grant_type === 'refresh_token') {
      state.refreshCalls += 1
      if (state.refreshDelayMs) await new Promise((r) => setTimeout(r, state.refreshDelayMs))
      const grant = state.refresh.get(f.refresh_token)
      if (!grant || !state.grants.get(grant)?.live) {
        // A reused (rotated) refresh token revokes the whole grant, as replay detection does.
        if (!grant) for (const g of state.grants.values()) g.reused = true
        return c.json({ error: 'invalid_grant' }, 400)
      }
      state.refresh.delete(f.refresh_token)
      return c.json(issue(grant))
    }
    return c.json({ error: 'unsupported_grant_type' }, 400)
  })

  app.post('/oauth/revoke', async (c) => {
    const f = await form(c)
    const grant = state.refresh.get(f.token) ?? state.access.get(f.token)?.grant
    if (grant) state.grants.get(grant).live = false
    state.revoked.push(f.token)
    return c.body(null, 200)
  })

  /** The grant of a live Bearer token, or a 401 Response. */
  function bearer(c) {
    const token = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '')?.[1]
    const row = token && state.access.get(token)
    if (!row || row.expiresAt <= Date.now() || !state.grants.get(row.grant)?.live)
      return c.json({ code: 'UNAUTHENTICATED' }, 401)
    return row.grant
  }

  app.get('/v1/me', (c) => {
    const g = bearer(c)
    return typeof g === 'string' ? c.json(state.me) : g
  })

  const live = () => [...state.demos.values()].filter((d) => d.siteMade && !d.deletedAt).length
  const shape = (d) => ({
    id: d.id,
    status: d.status,
    statusUrl: `/v1/demos/${d.id}`,
    site: d.site ?? null,
    error: d.error ?? null,
    retention: { expiresAt: d.expiresAt, frozenAt: null, deletedAt: d.deletedAt }
  })
  const answer = (d) => ({ demo: shape(d), demos: { live: live(), limit: state.limit } })
  const refuse = (c, status, code, extra = {}) => c.json({ error: { code, message: code }, ...extra }, status)

  app.post('/v1/demos', async (c) => {
    const g = bearer(c)
    if (typeof g !== 'string') return g
    const key = c.req.header('idempotency-key')
    if (!key) return refuse(c, 400, 'IDEMPOTENCY_KEY_REQUIRED')
    const text = await c.req.text()
    const body = JSON.parse(text)
    state.submissions.push({ key, body })
    if (body.schema === 'website-opportunities/demo-request/v2' && state.profileRefusal) {
      if (state.profileRefusal === 'INVALID_DEMO_REQUEST')
        return refuse(c, 422, state.profileRefusal, {
          errors: [{ path: 'schema', code: 'SCHEMA_UNSUPPORTED' }]
        })
      return refuse(c, 422, state.profileRefusal)
    }
    const seen = state.keys.get(key)
    if (seen) {
      if (seen.body !== text) return refuse(c, 409, 'IDEMPOTENCY_KEY_REUSED')
      return c.json(answer(state.demos.get(seen.id)), 202)
    }
    if (state.budgetExhausted) return refuse(c, 503, 'SPONSOR_BUDGET_EXHAUSTED')
    if (live() >= state.limit)
      return refuse(c, 409, 'DEMO_LIMIT_REACHED', { demos: { live: live(), limit: state.limit } })
    const demoId = id('dm_')
    const d = {
      id: demoId,
      body,
      status: 'queued',
      siteMade: true,
      site: null,
      expiresAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      deletedAt: null,
      polls: 0
    }
    state.demos.set(demoId, d)
    state.keys.set(key, { body: text, id: demoId })
    if (state.stallNextCreateMs) {
      const ms = state.stallNextCreateMs
      state.stallNextCreateMs = 0
      await new Promise((r) => setTimeout(r, ms))
    }
    return c.json(answer(d), 202)
  })

  app.get('/v1/demos/options', (c) => {
    const g = bearer(c)
    if (typeof g !== 'string') return g
    return c.json({
      cms: [
        {
          cms: 'wordpress',
          pinned: { design: 'tracy', quickstart: 'tracy-base/wp7' },
          templates: [
            { design: 'ja-fresco', quickstart: 'quickstart/ja-fresco/wp7', label: 'JA Fresco' },
            { design: 'tracy', quickstart: 'tracy-base/wp7', label: 'Tracy Base' }
          ]
        }
      ],
      ...(state.accepts ? { accepts: state.accepts } : {})
    })
  })

  app.get('/v1/demos/:id', (c) => {
    const g = bearer(c)
    if (typeof g !== 'string') return g
    const d = state.demos.get(c.req.param('id'))
    if (!d) return refuse(c, 404, 'NOT_FOUND')
    d.polls += 1
    if (state.retryAfter !== null) c.header('retry-after', String(state.retryAfter))
    return c.json(answer(d))
  })

  app.post('/v1/demos/:id/cancel', (c) => {
    const g = bearer(c)
    if (typeof g !== 'string') return g
    const d = state.demos.get(c.req.param('id'))
    if (!d) return refuse(c, 404, 'NOT_FOUND')
    if (!FINAL.has(d.status)) d.status = 'cancelled'
    return c.json(answer(d))
  })

  const server = listen
    ? await new Promise((done) => {
        const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => done(s))
      })
    : null
  const url = server ? `http://127.0.0.1:${server.address().port}` : 'http://tracy.example'

  return {
    url,
    state,
    fetch: (path, init) => app.fetch(new Request(new URL(path, url), init)),
    /** The person allows (or denies) the code shown to them. */
    decide(userCode, allow = true) {
      for (const d of state.devices.values())
        if (d.userCode === userCode) d.status = allow ? 'approved' : 'denied'
    },
    expireDevices() {
      for (const d of state.devices.values()) d.expiresAt = 0
    },
    expireAccessTokens() {
      for (const t of state.access.values()) t.expiresAt = 0
    },
    revokeAll() {
      for (const g of state.grants.values()) g.live = false
    },
    /** Moves a demo on, as Tracy's build would. */
    advance(demoId, status, extra = {}) {
      const d = state.demos.get(demoId)
      d.status = status
      if (status === 'waiting-for-you')
        d.site = {
          key: 'corner-cafe',
          url: 'https://corner-cafe.example',
          editUrl: `https://tracy.example/corner-cafe/s/wo-demo-${d.id}?wo-demo-chat=${d.id}`
        }
      if (status === 'ready')
        d.site = {
          key: 'corner-cafe',
          url: 'https://corner-cafe.example',
          editUrl: 'https://tracy.example/s/corner-cafe'
        }
      Object.assign(d, extra)
    },
    close: () => (server ? new Promise((done) => server.close(() => done(undefined))) : Promise.resolve())
  }
}

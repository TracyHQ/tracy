import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { verifyBetaToken } from '../lib/beta-token.js'
import { overLimitOrClosed, memoryRateLimiter } from '../lib/rate.js'

const platforms = new Set(['WordPress', 'Joomla', 'EmDash', 'Other'])
const roles = new Set(['own', 'clients'])
const siteCounts = new Set(['none', 'one', '2-10', '11-50', '50+'])

export function validateWaitlist(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (
    !name ||
    name.length > 200 ||
    !Array.isArray(body.platforms) ||
    !body.platforms.length ||
    body.platforms.length > 4 ||
    !body.platforms.every((p) => platforms.has(p)) ||
    !roles.has(body.role) ||
    !siteCounts.has(body.site_count)
  )
    return null
  let website = typeof body.website === 'string' ? body.website.trim() : ''
  if (website.length > 2048) return null
  if (website) {
    try {
      if (!/^[a-z][a-z\d+.-]*:/i.test(website)) website = `https://${website}`
      const url = new URL(website)
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        !url.hostname.includes('.') ||
        url.username ||
        url.password
      )
        return null
      website = url.toString()
    } catch {
      return null
    }
  }
  return {
    name,
    website: website || null,
    platforms: [...new Set(body.platforms)],
    role: body.role,
    site_count: body.site_count
  }
}

export function betaRoutes({ config, pool, signal, now = Date.now }) {
  const app = new Hono()
  const memory = new Map()
  const rate = memoryRateLimiter()
  const allowed = config.beta?.waitlistOrigin ?? config.origin
  app.use('/api/beta/*', async (c, next) => {
    c.header('cache-control', 'no-store')
    c.header('referrer-policy', 'no-referrer')
    const origin = c.req.header('origin')
    if (origin !== undefined && origin !== allowed && origin !== config.origin)
      return c.json({ code: 'ORIGIN_REFUSED' }, 403)
    if (origin) {
      c.header('access-control-allow-origin', origin)
      c.header('vary', 'Origin')
    }
    if (c.req.method === 'OPTIONS') {
      c.header('access-control-allow-methods', 'GET, POST, OPTIONS')
      c.header('access-control-allow-headers', 'Content-Type, Authorization')
      return c.body(null, 204)
    }
    return next()
  })
  app.get('/api/beta/waitlist', async (c) => {
    const token = c.req.header('authorization')?.replace(/^Bearer /, '')
    const email = await verifyBetaToken(token, config.sessionSecret, now())
    return email ? c.json({ email }) : c.json({ code: 'LINK_INVALID' }, 401)
  })
  app.post(
    '/api/beta/waitlist',
    bodyLimit({ maxSize: 8192, onError: (c) => c.json({ code: 'INVALID_REQUEST' }, 413) }),
    async (c) => {
      if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json'))
        return c.json({ code: 'INVALID_REQUEST' }, 415)
      const token = c.req.header('authorization')?.replace(/^Bearer /, '')
      const email = await verifyBetaToken(token, config.sessionSecret, now())
      if (!email) return c.json({ code: 'LINK_INVALID' }, 401)
      if (Number(c.req.header('content-length') ?? 0) > 8192) return c.json({ code: 'INVALID_REQUEST' }, 413)
      const raw = await c.req.text()
      if (raw.length > 8192) return c.json({ code: 'INVALID_REQUEST' }, 413)
      let body
      try {
        body = JSON.parse(raw)
      } catch {
        return c.json({ code: 'INVALID_REQUEST' }, 400)
      }
      const data = validateWaitlist(body)
      if (!data) return c.json({ code: 'INVALID_REQUEST' }, 400)
      const limited = pool
        ? await overLimitOrClosed(pool, `beta-form:${email}`, 10, now())
        : rate.overLimit(`beta-form:${email}`, 10, now())
      if (limited) return c.json({ code: 'RATE_LIMITED' }, 429)
      if (pool)
        await pool.query(
          `insert into beta_waitlist (email,name,website,platforms,role,site_count) values ($1,$2,$3,$4,$5,$6)
       on conflict (email) do update set name = excluded.name, website = excluded.website, platforms = excluded.platforms,
       role = excluded.role, site_count = excluded.site_count, updated_at = now()`,
          [email, data.name, data.website, JSON.stringify(data.platforms), data.role, data.site_count]
        )
      else memory.set(email, data)
      await signal.record('beta.waitlist_form', { email, data })
      return c.json({ ok: true })
    }
  )
  return app
}

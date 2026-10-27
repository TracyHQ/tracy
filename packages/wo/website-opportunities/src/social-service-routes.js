/** Server-to-server doors. A seat cookie or seat API key grants no shared-social access. */
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { verifySocialServiceKey } from './wo-social-auth.js'
import { SOCIAL_SERVICE_BASE, validSocialFence } from './social-service.js'
import { requireHost } from './host.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const handlesValid = (h) =>
  Array.isArray(h) &&
  h.length > 0 &&
  h.length <= 40 &&
  h.every(
    (x) =>
      ['facebook', 'instagram', 'tiktok', 'youtube'].includes(x?.network) &&
      typeof x.url === 'string' &&
      x.url.length <= 2000
  )
export function socialServiceRoutes({ pool, host, service, pepper, now = Date.now }) {
  const { overLimitOrClosed } = requireHost(host, ['overLimitOrClosed'])
  const app = new Hono()
  app.use(
    `${SOCIAL_SERVICE_BASE}/*`,
    bodyLimit({ maxSize: 100000, onError: (c) => c.json({ error: 'BODY_TOO_LARGE' }, 413) })
  )
  app.use(`${SOCIAL_SERVICE_BASE}/*`, async (c, next) => {
    c.header('Cache-Control', 'no-store')
    const who = await verifySocialServiceKey({
      pool,
      pepper,
      header: c.req.header('authorization'),
      now: now()
    })
    if (who.error) return c.json({ error: who.error }, who.error === 'SOCIAL_AUTH_UNAVAILABLE' ? 503 : 401)
    if (
      await overLimitOrClosed(
        pool,
        `wo:social-service:reads:${who.deploymentId}`,
        who.limits.readsPerMinute,
        now(),
        60000
      )
    )
      return c.json({ error: 'SOCIAL_READ_LIMIT' }, 429)
    c.set('socialPrincipal', who)
    await next()
  })
  app.onError((e, c) => {
    const code = [
      'INVALID_PROFILE',
      'INVALID_FENCE',
      'OPERATION_CONFLICT',
      'SOCIAL_REFRESH_LIMIT',
      'SOCIAL_AUTHORITY_CHANGED'
    ].includes(e.code)
      ? e.code
      : 'SOCIAL_UNAVAILABLE'
    return c.json(
      { error: code },
      ['INVALID_PROFILE', 'INVALID_FENCE'].includes(code)
        ? 400
        : ['OPERATION_CONFLICT', 'SOCIAL_AUTHORITY_CHANGED'].includes(code)
          ? 409
          : code === 'SOCIAL_REFRESH_LIMIT'
            ? 429
            : 503
    )
  })
  app.post(`${SOCIAL_SERVICE_BASE}/lookup`, async (c) => {
    if (!c.get('socialPrincipal').scopes.includes('read')) return c.json({ error: 'SOCIAL_SCOPE' }, 403)
    const b = await c.req.json().catch(() => null)
    if (!handlesValid(b?.handles)) return c.json({ error: 'INVALID_HANDLES' }, 400)
    return c.json(await service.lookup(b.handles))
  })
  app.post(`${SOCIAL_SERVICE_BASE}/refresh`, async (c) => {
    const who = c.get('socialPrincipal')
    if (!who.scopes.includes('refresh')) return c.json({ error: 'SOCIAL_SCOPE' }, 403)
    const b = await c.req.json().catch(() => null)
    if (
      !UUID.test(b?.operationId ?? '') ||
      !UUID.test(b?.authorityId ?? '') ||
      !handlesValid([b?.handle]) ||
      typeof b?.force !== 'boolean' ||
      (b.force && !validSocialFence(b.expectedFence)) ||
      (b.expectedFence !== undefined && !validSocialFence(b.expectedFence))
    )
      return c.json({ error: 'INVALID_OPERATION' }, 400)
    return c.json(await service.refresh(who, b))
  })
  app.get(`${SOCIAL_SERVICE_BASE}/operations/:id`, async (c) => {
    const who = c.get('socialPrincipal')
    if (!who.scopes.includes('read')) return c.json({ error: 'SOCIAL_SCOPE' }, 403)
    if (!UUID.test(c.req.param('id'))) return c.json({ error: 'INVALID_OPERATION' }, 400)
    const operation = await service.operation(who, c.req.param('id'))
    return operation ? c.json(operation) : c.json({ error: 'OPERATION_NOT_FOUND' }, 404)
  })
  return app
}

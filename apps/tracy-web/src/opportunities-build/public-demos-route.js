/**
 * The HTTP of `/v1/demos` (`public-demos.js`), on the api host only, beside the site doors of `api/route.js`:
 *
 *   POST /v1/demos              `Idempotency-Key` + `website-opportunities/demo-request/v1` or `v2` → 202 {demo, demos}
 *   GET  /v1/demos              ?limit (1–50) &cursor → {data, nextCursor, demos}
 *   GET  /v1/demos/options      the CMS and templates a demo may name → {cms, defaultCms, accepts, demos}
 *   GET  /v1/demos/:id          → {demo, demos}
 *   POST /v1/demos/:id/cancel   → {demo, demos}
 *
 * WHO is an account token of scope `demos` (`requireAccountToken`, part A), never a seat key: a seat key names one
 * site and is refused 403 here. Refusals speak `/v1`'s envelope `{ error: { code, message } }`.
 */
import { Hono } from 'hono'
import { json } from '../lib/http.js'
import { clientIp } from '../lib/login-mail-rate.js'
import { overLimitDetail } from '../lib/rate.js'
import { createPublicDemos, fingerprintOf } from './public-demos.js'

export const DEMO_REQUEST_MAX_BYTES = 512 * 1024
/** Calls an hour, per account and per address, over all five doors; creating a demo has its own lower cap. */
export const DEMO_RATE = Object.freeze({ accountHour: 600, addressHour: 1200, createsAccountHour: 60 })
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,100}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEAT_KEY = /^Bearer\s+trk_/i

/**
 * @param {Parameters<typeof createPublicDemos>[0] & {
 *   isApiHost: (c: import('hono').Context) => boolean,
 *   requireAccountToken: (c: import('hono').Context, scope: string) => Promise<{ accountId: string } | Response>,
 *   switchOn: () => Promise<boolean>
 * }} deps
 */
export function publicDemoRoutes(deps) {
  const demos = createPublicDemos(deps)
  const now = deps.now ?? Date.now
  const app = new Hono()
  const refuse = (c, status, code, message, extra = {}) =>
    json(c, { error: { code, message }, ...extra }, status)
  const answer = (c, result) => json(c, result.body, /** @type {any} */ (result.status))

  /** Host, headers, token and rate: the account id, or the refusal to send. */
  async function who(c, { creates = false } = {}) {
    c.header('x-tracy-api-version', 'v1')
    c.header('cache-control', 'private, no-store')
    if (SEAT_KEY.test(c.req.header('authorization') ?? ''))
      return refuse(
        c,
        403,
        'ACCOUNT_TOKEN_REQUIRED',
        'A seat key names one site. /v1/demos takes an account token of scope demos (Connect Tracy).'
      )
    const auth = await deps.requireAccountToken(c, 'demos')
    if (auth instanceof Response) return auth
    const at = now()
    const buckets = [
      [`v1-demos:account:${auth.accountId}`, DEMO_RATE.accountHour],
      [`v1-demos:address:${clientIp(c)}`, DEMO_RATE.addressHour],
      ...(creates ? [[`v1-demos:create:${auth.accountId}`, DEMO_RATE.createsAccountHour]] : [])
    ]
    for (const [bucket, limit] of buckets) {
      const over = await overLimitDetail(deps.pool, bucket, limit, at)
      if (over.over) {
        c.header('retry-after', String(over.retryAfterS))
        return refuse(
          c,
          429,
          'RATE_LIMITED',
          'Too many calls this hour. Retry after the time Retry-After gives.'
        )
      }
    }
    return auth
  }

  const onHost = (handler) => async (c, next) => (deps.isApiHost(c) ? handler(c) : next())

  app.post(
    '/v1/demos',
    onHost(async (c) => {
      const auth = await who(c, { creates: true })
      if (auth instanceof Response) return auth
      const key = c.req.header('idempotency-key')
      if (key === undefined || !IDEMPOTENCY_KEY.test(key))
        return refuse(
          c,
          400,
          'IDEMPOTENCY_KEY_REQUIRED',
          'Send an Idempotency-Key header of 8–100 letters, digits, ".", "_", ":" or "-"; the same key for a retry.'
        )
      const declared = Number(c.req.header('content-length') ?? 0)
      if (declared > DEMO_REQUEST_MAX_BYTES) return tooLarge(c)
      const text = await c.req.text()
      if (Buffer.byteLength(text) > DEMO_REQUEST_MAX_BYTES) return tooLarge(c)
      let raw
      try {
        raw = JSON.parse(text)
      } catch {
        return refuse(c, 400, 'INVALID_JSON', 'The body is not JSON.')
      }
      const domain = await deps.loadDomain()
      const checked = domain.validateDemoRequest(raw)
      if (!checked.ok)
        return refuse(
          c,
          422,
          'INVALID_DEMO_REQUEST',
          'The body does not follow website-opportunities/demo-request/v1 or v2.',
          {
            errors: checked.errors
          }
        )
      if (!(await deps.switchOn()))
        return refuse(c, 503, 'DEMOS_UNAVAILABLE', 'Tracy is not building demos right now. Try again later.')
      return answer(
        c,
        await demos.submit({
          accountId: auth.accountId,
          key,
          request: checked.request,
          fingerprint: fingerprintOf(raw)
        })
      )
    })
  )

  app.get(
    '/v1/demos',
    onHost(async (c) => {
      const auth = await who(c)
      if (auth instanceof Response) return auth
      const limitText = c.req.query('limit') ?? '20'
      const limit = /^\d{1,2}$/.test(limitText) ? Number(limitText) : 0
      if (limit < 1 || limit > 50)
        return refuse(c, 400, 'INVALID_LIMIT', 'limit: a whole number from 1 to 50.')
      let after = null
      const cursor = c.req.query('cursor')
      if (cursor) {
        try {
          after = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
        } catch {}
        if (!Array.isArray(after) || !Number.isFinite(Date.parse(after[0])) || !UUID.test(String(after[1])))
          return refuse(
            c,
            400,
            'INVALID_CURSOR',
            'cursor: send the nextCursor of the previous page as it was.'
          )
      }
      return json(c, await demos.list(auth.accountId, { limit, after }))
    })
  )

  app.get(
    '/v1/demos/options',
    onHost(async (c) => {
      const auth = await who(c)
      if (auth instanceof Response) return auth
      return json(c, await demos.options(auth.accountId))
    })
  )

  app.get(
    '/v1/demos/:id',
    onHost(async (c) => {
      const auth = await who(c)
      if (auth instanceof Response) return auth
      const id = c.req.param('id')
      const found = UUID.test(id) ? await demos.view(auth.accountId, id) : null
      return found ? json(c, found) : notFound(c)
    })
  )

  app.post(
    '/v1/demos/:id/cancel',
    onHost(async (c) => {
      const auth = await who(c)
      if (auth instanceof Response) return auth
      const id = c.req.param('id')
      const result = UUID.test(id) ? await demos.cancel(auth.accountId, id) : null
      return result ? answer(c, result) : notFound(c)
    })
  )

  const tooLarge = (c) =>
    refuse(
      c,
      413,
      'REQUEST_TOO_LARGE',
      `A demo request is at most ${DEMO_REQUEST_MAX_BYTES} bytes; send photo URLs, not photos.`
    )
  const notFound = (c) => refuse(c, 404, 'NOT_FOUND', 'No demo of this account has this id.')
  return app
}

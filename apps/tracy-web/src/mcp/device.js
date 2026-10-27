/**
 * OAuth device authorization (RFC 8628) for registered device clients — "Connect Tracy" in a
 * self-hosted Website Opportunities. Issues ACCOUNT tokens (`lib/account-token.js`), never seat keys.
 *
 *   POST /oauth/device/code   (token host)  form: client_id, scope=demos
 *   GET  /connect             (Tracy host)  signed-in page: account, client, rights, code, Allow/Deny
 *   POST /connect             (Tracy host)  signed form + exact Origin, like the MCP consent page
 *   /oauth/token and /oauth/revoke delegate here when `client_id` is a device client (`oauth.js`).
 *
 * The page never approves from the link alone: `?code=` only pre-fills the code the person compares
 * with what the app shows, and the decision is a POST from the page.
 */
import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { refreshAccountGrant, revokeAccountToken } from '../lib/account-token.js'
import { hmacHex } from '../lib/hmac.js'
import { viewer } from '../lib/http.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { clientIp } from '../lib/login-mail-rate.js'
import { mcpOrigin } from '../lib/mcp-host.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { pageSecurityHeaders } from '../lib/security-headers.js'
import { DEVICE_CLIENTS, deviceClient } from './clients.js'
import {
  DEVICE_SECONDS,
  POLL_SECONDS,
  decideDeviceCode,
  issueDeviceCode,
  normalUserCode,
  pollDeviceCode,
  showUserCode
} from './device-store.js'
import { connectPage, connectResultPage } from './pages.js'

export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
/** Codes one address may request an hour. */
export const DEVICE_CODES_PER_HOUR = 30
/** Code submissions one account may make from one address an hour (right or wrong). */
export const CODE_TRIES_PER_HOUR = 10

const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  /^[a-f0-9]{64}$/.test(a) &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b))
const connectMac = (secret, request) => hmacHex(secret, `device-connect:v1:${request}`)
const secure = (c) => {
  for (const [name, value] of Object.entries(
    pageSecurityHeaders({ formAction: '', referrerPolicy: 'same-origin' })
  ))
    c.header(name, value)
}

/**
 * @param {{config: any, pool: import('pg').Pool, seats: {accountByEmail: Function},
 *   onTracy: (c: any) => boolean, onTokenHost: (c: any) => boolean, ready: () => boolean,
 *   now?: () => number}} deps
 */
export function deviceRoutes({ config, pool, seats, onTracy, onTokenHost, ready, now = Date.now }) {
  const app = new Hono()
  const audience = config.apiOrigin
  const fail = (c, error, status = 400) => c.json({ error }, status)
  const form = async (c) =>
    (c.req.header('content-type') ?? '').split(';')[0] === 'application/x-www-form-urlencoded'
      ? new URLSearchParams(await c.req.text())
      : null

  app.post(
    '/oauth/device/code',
    async (c, next) => {
      if (!onTokenHost(c)) return next()
      c.header('cache-control', 'no-store')
      if (!ready()) return fail(c, 'temporarily_unavailable', 503)
      return bodyLimit({ maxSize: 4096, onError: (ctx) => fail(ctx, 'invalid_request', 413) })(c, next)
    },
    async (c, next) => {
      if (!onTokenHost(c)) return next()
      const body = await form(c)
      if (!body) return fail(c, 'invalid_request', 415)
      if (await overLimitOrClosed(pool, `device-code:${clientIp(c)}`, DEVICE_CODES_PER_HOUR, now()))
        return fail(c, 'slow_down', 429)
      const client = deviceClient(body.get('client_id'))
      if (!client) return fail(c, 'invalid_client', 401)
      const asked = (body.get('scope') ?? client.scopes.join(' ')).split(' ').filter(Boolean)
      if (asked.length === 0 || asked.some((scope) => !client.scopes.includes(scope)))
        return fail(c, 'invalid_scope')
      const issued = await issueDeviceCode(pool, {
        clientId: client.id,
        audience,
        scopes: [...new Set(asked)],
        pepper: config.apiKeyPepper,
        now: now()
      })
      const verification = `${config.origin}/connect`
      return c.json({
        device_code: issued.deviceCode,
        user_code: issued.userCode,
        verification_uri: verification,
        verification_uri_complete: `${verification}?code=${encodeURIComponent(issued.userCode)}`,
        expires_in: DEVICE_SECONDS,
        interval: POLL_SECONDS
      })
    }
  )

  /** The page for one signed-in account; the form is signed for this account and client. */
  async function page(c, { email, client, code, error = null, status = 200 }) {
    const request = Buffer.from(
      JSON.stringify({ email, clientId: client.id, expires: now() + 600_000 })
    ).toString('base64url')
    return c.html(
      connectPage({
        email,
        clientName: client.name,
        code,
        error,
        request,
        signature: await connectMac(config.sessionSecret, request),
        lang: requestLanguage(c)
      }),
      status
    )
  }

  app.get('/connect', async (c, next) => {
    if (!onTracy(c)) return next()
    secure(c)
    c.header('cache-control', 'no-store')
    if (!ready()) return fail(c, 'temporarily_unavailable', 503)
    const email = await viewer(c, config)
    if (!email) {
      const url = new URL(c.req.url)
      return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302)
    }
    if (!(await seats.accountByEmail(pool, email))) return fail(c, 'access_denied', 403)
    const shown = normalUserCode(c.req.query('code'))
    // One device client exists; a second one would need the code looked up before the page names it.
    return page(c, { email, client: DEVICE_CLIENTS[0], code: shown ? showUserCode(shown) : '' })
  })

  app.post(
    '/connect',
    async (c, next) => {
      if (!onTracy(c)) return next()
      return bodyLimit({ maxSize: 8192, onError: (ctx) => fail(ctx, 'invalid_request', 413) })(c, next)
    },
    async (c, next) => {
      if (!onTracy(c)) return next()
      secure(c)
      c.header('cache-control', 'no-store')
      if (!ready()) return fail(c, 'temporarily_unavailable', 503)
      if (c.req.header('origin') !== config.origin) return fail(c, 'access_denied', 403)
      const body = await form(c)
      if (!body) return fail(c, 'invalid_request', 415)
      const request = body.get('request')
      if (!request || !same(body.get('signature'), await connectMac(config.sessionSecret, request)))
        return fail(c, 'invalid_request')
      const signed = (() => {
        try {
          return JSON.parse(Buffer.from(request, 'base64url').toString())
        } catch {
          return null
        }
      })()
      const email = await viewer(c, config)
      if (!signed || !email || signed.email !== email || signed.expires <= now())
        return fail(c, 'access_denied', 403)
      const client = deviceClient(signed.clientId)
      const account = await seats.accountByEmail(pool, email)
      if (!client || !account) return fail(c, 'access_denied', 403)
      const decision = body.get('decision')
      if (decision !== 'allow' && decision !== 'deny') return fail(c, 'invalid_request')
      const typed = body.get('user_code') ?? ''
      if (
        await overLimitOrClosed(
          pool,
          `device-connect:${account.id}:${clientIp(c)}`,
          CODE_TRIES_PER_HOUR,
          now()
        )
      )
        return page(c, { email, client, code: typed, error: 'tooMany', status: 429 })
      const userCode = normalUserCode(typed)
      const decided =
        userCode &&
        (await decideDeviceCode(pool, {
          userCode,
          clientId: client.id,
          accountId: account.id,
          decision,
          pepper: config.apiKeyPepper,
          now: now()
        }))
      if (!decided) return page(c, { email, client, code: typed, error: 'badCode', status: 400 })
      return c.html(
        connectResultPage({
          clientName: client.name,
          allowed: decision === 'allow',
          lang: requestLanguage(c)
        })
      )
    }
  )

  return Object.assign(app, {
    /** `/oauth/token` for a device client: the device grant and refresh of an account grant. */
    async token(c, client, body) {
      const fail400 = (error) => fail(c, error)
      const kind = body.get('grant_type')
      if (kind === DEVICE_GRANT) {
        const deviceCode = body.get('device_code')
        if (typeof deviceCode !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(deviceCode))
          return fail400('invalid_grant')
        const answer = await pollDeviceCode(pool, {
          clientId: client.id,
          deviceCode,
          pepper: config.apiKeyPepper,
          now: now()
        })
        return answer.tokens ? c.json(answer.tokens) : fail400(answer.error)
      }
      if (kind === 'refresh_token') {
        const token = body.get('refresh_token')
        if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return fail400('invalid_grant')
        const tokens = await refreshAccountGrant(pool, {
          clientId: client.id,
          token,
          pepper: config.apiKeyPepper,
          now: now()
        })
        return tokens ? c.json(tokens) : fail400('invalid_grant')
      }
      return fail400('unsupported_grant_type')
    },
    /** `/oauth/revoke` for a device client: always 200 (RFC 7009). */
    async revoke(c, client, body) {
      await revokeAccountToken(pool, {
        clientId: client.id,
        token: body.get('token'),
        pepper: config.apiKeyPepper,
        now: now()
      })
      return c.body(null, 200)
    },
    deviceEndpoint: () => `${mcpOrigin(config)}/oauth/device/code`
  })
}

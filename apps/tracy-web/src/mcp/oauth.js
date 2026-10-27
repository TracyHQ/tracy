/** OAuth authorization-code + S256 PKCE for Tracy connectors. One consent names one site. */
import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { parseKey, verifyKey } from '../lib/api-key.js'
import { hmacHex } from '../lib/hmac.js'
import { viewer } from '../lib/http.js'
import { requestLanguage } from '../lib/i18n/index.js'
import { clientIp } from '../lib/login-mail-rate.js'
import { mcpOrigin, mcpResource } from '../lib/mcp-host.js'
import { overLimitOrClosed } from '../lib/rate.js'
import { pageSecurityHeaders } from '../lib/security-headers.js'
import { acceptsRedirect, deviceClient, oauthClient } from './clients.js'
import { DEVICE_GRANT, deviceRoutes } from './device.js'
import { exchangeToken, issueCode, liveOAuthKey, revokeToken } from './oauth-store.js'
import { consentPage } from './pages.js'

const SCOPES = ['content']
const opaque = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const same = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  /^[a-f0-9]{64}$/.test(a) &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b))
const consentMac = (secret, request) => hmacHex(secret, `mcp-consent:v1:${request}`)

export function oauthRoutes({
  config,
  pool,
  seats,
  listSites,
  resolvePrincipal,
  isApiHost,
  clientFetch = fetch,
  now = Date.now
}) {
  const app = new Hono()
  const issuer = config.origin
  const resourceOrigin = mcpOrigin(config)
  const resource = mcpResource(config)
  const onTracy = (c) =>
    (c.req.header('host') ?? new URL(c.req.url).host).toLowerCase() === new URL(issuer).host.toLowerCase()
  const fail = (c, error, status = 400) => c.json({ error }, status)
  const ready = () => Boolean(config.apiOrigin && config.apiKeyPepper)
  const device = deviceRoutes({
    config,
    pool,
    seats,
    onTracy,
    onTokenHost: isApiHost,
    ready,
    now
  })
  app.route('/', device)
  const hasSeat = async (accountId, siteKey) =>
    Boolean(await seats.grantFor(pool, accountId, siteKey)) &&
    (await listSites(accountId)).some((site) => site.site_key === siteKey)
  const callback = (request, fields) => {
    const url = new URL(request.redirect_uri)
    for (const [key, value] of Object.entries({ ...fields, state: request.state, iss: issuer }))
      url.searchParams.set(key, value)
    return url.href
  }
  function validRequest(query, client) {
    return (
      client &&
      query.client_id === client.id &&
      acceptsRedirect(client, query.redirect_uri) &&
      query.response_type === 'code' &&
      query.resource === resource &&
      query.code_challenge_method === 'S256' &&
      opaque(query.code_challenge) &&
      typeof query.state === 'string' &&
      query.state.length > 0 &&
      query.state.length <= 1024 &&
      (!query.scope || query.scope === 'content')
    )
  }
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'])
    app.get(path, (c, next) => {
      if (!isApiHost(c)) return next()
      if (!ready()) return fail(c, 'temporarily_unavailable', 503)
      c.header('cache-control', 'no-store')
      return c.json({
        resource,
        authorization_servers: [issuer],
        scopes_supported: SCOPES,
        bearer_methods_supported: ['header']
      })
    })
  app.get('/.well-known/oauth-authorization-server', (c, next) => {
    if (!onTracy(c)) return next()
    if (!ready()) return fail(c, 'temporarily_unavailable', 503)
    c.header('cache-control', 'no-store')
    return c.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${resourceOrigin}/oauth/token`,
      revocation_endpoint: `${resourceOrigin}/oauth/revoke`,
      device_authorization_endpoint: device.deviceEndpoint(),
      scopes_supported: [...SCOPES, 'demos'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', DEVICE_GRANT],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true
    })
  })
  app.get('/oauth/authorize', async (c, next) => {
    if (!onTracy(c)) return next()
    for (const [name, value] of Object.entries(
      pageSecurityHeaders({
        formAction: '',
        referrerPolicy: 'same-origin'
      })
    ))
      c.header(name, value)
    if (!ready()) return fail(c, 'temporarily_unavailable', 503)
    const query = c.req.query()
    if (await overLimitOrClosed(pool, `mcp-authorize:${clientIp(c)}`, 6000, now()))
      return fail(c, 'slow_down', 429)
    const client = await oauthClient(query.client_id, clientFetch)
    // Never redirect an invalid redirect_uri, even to report an error.
    if (!validRequest(query, client)) return fail(c, 'invalid_request')
    for (const [name, value] of Object.entries(
      pageSecurityHeaders({ formAction: query.redirect_uri, referrerPolicy: 'same-origin' })
    ))
      c.header(name, value)
    const email = await viewer(c, config)
    if (!email)
      return c.redirect(
        `/login?next=${encodeURIComponent(new URL(c.req.url).pathname + new URL(c.req.url).search)}`,
        302
      )
    const account = await seats.accountByEmail(pool, email)
    if (!account) return fail(c, 'access_denied', 403)
    const sites = await listSites(account.id)
    const request = Buffer.from(JSON.stringify({ ...query, email, expires: now() + 600_000 })).toString(
      'base64url'
    )
    return c.html(
      consentPage({
        clientName: client.name,
        clientHost: new URL(query.redirect_uri).host,
        email,
        sites,
        request,
        signature: await consentMac(config.sessionSecret, request),
        lang: requestLanguage(c)
      })
    )
  })
  app.post(
    '/oauth/authorize',
    async (c, next) => {
      if (!onTracy(c)) return next()
      return bodyLimit({ maxSize: 16_384, onError: (ctx) => fail(ctx, 'invalid_request', 413) })(c, next)
    },
    async (c, next) => {
      if (!onTracy(c)) return next()
      for (const [name, value] of Object.entries(
        pageSecurityHeaders({
          formAction: '',
          referrerPolicy: 'same-origin'
        })
      ))
        c.header(name, value)
      if (!ready()) return fail(c, 'temporarily_unavailable', 503)
      if (c.req.header('origin') !== issuer) return fail(c, 'access_denied', 403)
      if ((c.req.header('content-type') ?? '').split(';')[0] !== 'application/x-www-form-urlencoded')
        return fail(c, 'invalid_request', 415)
      const body = new URLSearchParams(await c.req.text())
      const request = body.get('request')
      if (!request || !same(body.get('signature'), await consentMac(config.sessionSecret, request)))
        return fail(c, 'invalid_request')
      const query = (() => {
        try {
          return JSON.parse(Buffer.from(request, 'base64url').toString())
        } catch {
          return null
        }
      })()
      const email = await viewer(c, config)
      if (!query || !email || query.email !== email || query.expires <= now())
        return fail(c, 'access_denied', 403)
      const client = await oauthClient(query.client_id, clientFetch)
      if (!validRequest(query, client)) return fail(c, 'access_denied', 403)
      for (const [name, value] of Object.entries(
        pageSecurityHeaders({ formAction: query.redirect_uri, referrerPolicy: 'same-origin' })
      ))
        c.header(name, value)
      if (body.get('decision') === 'deny') return c.redirect(callback(query, { error: 'access_denied' }), 303)
      if (body.get('decision') !== 'allow') return fail(c, 'invalid_request')
      if (await overLimitOrClosed(pool, `mcp-consent:${email}`, 20, now())) return fail(c, 'slow_down', 429)
      const account = await seats.accountByEmail(pool, email)
      const siteKey = body.get('siteKey')
      // The consent lists live seats only; POST rechecks, so a stale page cannot grant another site.
      const allowed = account
        ? (await listSites(account.id)).some((site) => site.site_key === siteKey)
        : false
      if (!allowed) return fail(c, 'access_denied', 403)
      const code = await issueCode(pool, {
        clientId: client.id,
        accountId: account.id,
        siteKey,
        resource,
        scopes: SCOPES,
        challenge: query.code_challenge,
        redirectUri: query.redirect_uri,
        now: now()
      })
      return c.redirect(callback(query, { code }), 303)
    }
  )
  for (const path of ['/oauth/token', '/oauth/revoke']) {
    app.post(
      path,
      async (c, next) => {
        if (!isApiHost(c)) return next()
        c.header('cache-control', 'no-store')
        c.header('pragma', 'no-cache')
        if (!ready()) return fail(c, 'temporarily_unavailable', 503)
        return bodyLimit({ maxSize: 8192, onError: (ctx) => fail(ctx, 'invalid_request', 413) })(c, next)
      },
      async (c, next) => {
        if (!isApiHost(c)) return next()
        if ((c.req.header('content-type') ?? '').split(';')[0] !== 'application/x-www-form-urlencoded')
          return fail(c, 'invalid_request', 415)
        const body = new URLSearchParams(await c.req.text())
        // Reuse the sign-in door's trusted address reader; absent addresses share its unknown bucket.
        if (await overLimitOrClosed(pool, `mcp-token:${clientIp(c)}`, 6000, now()))
          return fail(c, 'slow_down', 429)
        // Device clients hold account grants (`device.js`), never a site-bound key.
        const accountClient = deviceClient(body.get('client_id'))
        if (accountClient)
          return path === '/oauth/revoke'
            ? device.revoke(c, accountClient, body)
            : device.token(c, accountClient, body)
        const client = await oauthClient(body.get('client_id'), clientFetch)
        if (!client) return fail(c, 'invalid_client')
        if (path === '/oauth/revoke') {
          const token = body.get('token')
          if (opaque(token)) await revokeToken(pool, { clientId: client.id, refresh: token, now: now() })
          else if (parseKey(`Bearer ${token}`)) {
            const key = await verifyKey({
              pool,
              header: `Bearer ${token}`,
              pepper: config.apiKeyPepper,
              now: now()
            })
            if (!('error' in key))
              await revokeToken(pool, { clientId: client.id, keyId: key.keyId, now: now() })
          }
          return c.body(null, 200)
        }
        const kind = body.get('grant_type')
        if (!['authorization_code', 'refresh_token'].includes(kind)) return fail(c, 'unsupported_grant_type')
        const token = body.get(kind === 'authorization_code' ? 'code' : 'refresh_token')
        const verifier = body.get('code_verifier')
        if (
          !opaque(token) ||
          body.get('resource') !== resource ||
          (body.get('scope') && body.get('scope') !== 'content')
        )
          return fail(c, 'invalid_grant')
        if (
          kind === 'authorization_code' &&
          (!acceptsRedirect(client, body.get('redirect_uri')) ||
            typeof verifier !== 'string' ||
            !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
        )
          return fail(c, 'invalid_grant')
        const tokens = await exchangeToken(pool, {
          clientId: client.id,
          clientName: client.name,
          kind,
          token,
          verifier,
          resource,
          redirectUri: body.get('redirect_uri'),
          pepper: config.apiKeyPepper,
          now: now(),
          hasSeat
        })
        return tokens ? c.json(tokens) : fail(c, 'invalid_grant')
      }
    )
  }
  return Object.assign(app, {
    async resolvePrincipal(c, siteKey) {
      const auth = await resolvePrincipal(c, siteKey)
      if (auth.error) return auth
      if (!(await liveOAuthKey(pool, auth.key.keyId, resource, now())))
        return { error: Response.json({ code: 'KEY_INVALID' }, { status: 401 }) }
      return auth
    }
  })
}

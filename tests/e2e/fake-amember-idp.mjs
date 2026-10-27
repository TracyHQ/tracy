/**
 * A stand-in for aMember's `joomlartsso` module, for E2E on a local stand where the real aMember
 * cannot answer (its `return_url` allowlist names only cowork.tracy.ai / cowork.tracy.site).
 *
 * Speaks the exact contract of `application/joomlartsso` in JoomlArt-26/member: verifies the
 * inbound `sso`/`sig` with the shared secret, refuses a wrong client, a mismatched return_url or a
 * past `exp`, and — on `GET /sso/v1/authorize` — redirects straight back with a signed assertion
 * for one fixture member (as if the person were already signed in on joomlart.com). `?signin=1`
 * on the first hit shows a one-button "Login" page first, to exercise the bounce.
 *
 *   JOOMLART_SSO_SECRET=… FAKE_IDP_PORT=45900 FAKE_IDP_RETURN=http://sso.tracy.test:45080/signin/joomlart/callback \
 *     node tests/e2e/fake-amember-idp.mjs
 *
 * Never run it anywhere a real person could reach it: it signs anyone in as the fixture.
 */
import { createServer } from 'node:http'
import {
  buildRequest,
  decodePayload,
  encodePayload,
  sign,
  verify
} from '../../apps/tracy-web/src/identity/joomlart-sso.js'

const SECRET = process.env.JOOMLART_SSO_SECRET ?? ''
const PORT = Number(process.env.FAKE_IDP_PORT ?? 45900)
const RETURN = process.env.FAKE_IDP_RETURN ?? ''
const MEMBER = {
  external_id: process.env.FAKE_IDP_ID ?? '424242',
  email: process.env.FAKE_IDP_EMAIL ?? 'supportguy@example.test',
  email_verified: process.env.FAKE_IDP_VERIFIED ?? 'true',
  username: 'supportguy',
  name: 'Support Guy',
  entitlement: JSON.stringify(
    process.env.FAKE_IDP_FREE === '1'
      ? [{ product_id: '7', name: 'Free member', expires_at: null, paid: false }]
      : [{ product_id: '12993', name: 'JA Developer', expires_at: '2027-12-31T00:00:00Z', paid: true }]
  )
}
if (!SECRET) {
  process.stderr.write('JOOMLART_SSO_SECRET is required\n')
  process.exit(2)
}

const fail = (res, message) => {
  res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(`JoomlArt SSO error: ${message}`)
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (url.pathname !== '/sso/v1/authorize') {
    res.writeHead(404).end()
    return
  }
  const client = url.searchParams.get('client') ?? 'georeport'
  if (!['tracy', 'tracy-dev'].includes(client)) return fail(res, `Unknown SSO client: ${client}`)
  const sso = url.searchParams.get('sso') ?? ''
  const sig = url.searchParams.get('sig') ?? ''
  if (!verify(sso, sig, SECRET)) return fail(res, 'Invalid SSO signature')
  const request = decodePayload(sso)
  if (!request?.nonce || !request.return_url)
    return fail(res, 'SSO request is missing a valid nonce or return URL')
  if (RETURN && request.return_url !== RETURN)
    return fail(res, `SSO return URL is not allowed for client ${client}`)
  if (!/^\d+$/.test(request.exp ?? '')) return fail(res, 'SSO request is missing an expiry (exp)')
  if (Number(request.exp) < Math.floor(Date.now() / 1000))
    return fail(res, 'This sign-in link has expired. Please start again from Tracy.')
  if (url.searchParams.get('signin') === '1' && !url.searchParams.has('ok')) {
    const back = new URL(url)
    back.searchParams.delete('signin')
    back.searchParams.set('ok', '1')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<!doctype html><title>Fake aMember</title><h1>Fake aMember login</h1><form method="get" action="/sso/v1/authorize">${[...back.searchParams].map(([k, v]) => `<input type="hidden" name="${k}" value="${v.replace(/"/g, '&quot;')}">`).join('')}<button data-fake-login>Login</button></form>`
    )
    return
  }
  const answer = encodePayload([
    ['nonce', request.nonce],
    ['external_id', MEMBER.external_id],
    ['email', MEMBER.email],
    ['email_verified', MEMBER.email_verified],
    ['username', MEMBER.username],
    ['name', MEMBER.name],
    ['entitlement', MEMBER.entitlement]
  ])
  const target = new URL(request.return_url)
  target.searchParams.set('sso', answer)
  target.searchParams.set('sig', sign(answer, SECRET))
  res.writeHead(302, { location: target.toString(), 'cache-control': 'no-store' })
  res.end()
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(
    `fake aMember IdP on http://127.0.0.1:${PORT}/sso/v1/authorize (member ${MEMBER.email})\n`
  )
})

// Exported for a self-check: `node -e` can build a request the way tracy-web does.
export { buildRequest }

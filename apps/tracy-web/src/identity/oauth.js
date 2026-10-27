/**
 * Google and GitHub sign-in: a plain server-side authorization-code exchange, straight to the
 * provider.
 *
 * NOT A PORT OF `workers/cowork/src/index.js`'s `serveBrowserOAuthSignIn`/`exchangeAuthLink` — that
 * flow routes the browser through `cowork.tracy.ai` and a Supabase GoTrue project, because the
 * Worker never held a client secret of its own. This app is one process with its own OAuth client
 * credentials (`config.oauth`), so the exchange happens here directly, with no broker in between.
 *
 * GOOGLE'S id_token IS TRUSTED WITHOUT VERIFYING ITS SIGNATURE — the same stance Supabase itself
 * takes on the exact same token (`workers/cowork/src/index.js`'s comment on the practice, cited in
 * this task's brief): it arrives over TLS straight from Google's own token endpoint, in the same
 * response as the access token, so checking a signature buys nothing against an adversary who
 * cannot already MITM a channel this exchange has to trust regardless. What IS checked is
 * `email_verified` — a provider handing back an email address is not the same as the provider
 * vouching that address belongs to this person, and signing someone in on an unverified address is
 * account takeover (this task's brief, security care points).
 *
 * GITHUB'S SUBJECT IS THE ACCOUNT'S NUMERIC id, NOT ITS EMAIL — a deliberate widening past the
 * brief's own two-call sketch (`POST .../access_token` then `GET .../user/emails`). Using the
 * verified primary email as the "subject" would make `identity`'s whole reason to exist (a stable
 * key that survives an email change) collapse back into `account.email` — the exact case
 * `identity_upsert`'s test in `oauth.test.mjs` (same subject, twice) is there to catch. A third
 * call, `GET /user`, is the standard way GitHub-OAuth integrations get that stable id.
 */

export class OAuthError extends Error {
  constructor(code) {
    super(`oauth: ${code}`)
    this.code = code
  }
}

export const OAUTH_STATE_COOKIE = 'tracy_oauth_state'
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

/** An unguessable, single-use flow token — 256 bits from the platform CSPRNG, not Math.random. */
export function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function cookieAttrs({ secure }) {
  // Path scoped to /signin, not /: this cookie has no business riding along on every other
  // request, and scoping it narrows what a stray XSS elsewhere on the origin could read.
  return `HttpOnly;${secure ? ' Secure;' : ''} SameSite=Lax; Path=/signin`
}

/**
 * Plant the flow's own nonce as a cookie, alongside the same value stored server-side in
 * `oauth_state` — the double-submit half of CSRF protection on this callback (see the callback
 * route's own comment for what this defends against, and why the DB row alone isn't enough).
 */
export function stateCookie(state, opts) {
  return `${OAUTH_STATE_COOKIE}=${state}; ${cookieAttrs(opts)}; Max-Age=${Math.floor(OAUTH_STATE_TTL_MS / 1000)}`
}

export function clearStateCookie(opts) {
  return `${OAUTH_STATE_COOKIE}=; ${cookieAttrs(opts)}; Max-Age=0`
}

// Exported and imported by `route.js` rather than declared twice — a third provider added to one
// file and not the other used to be able to disagree silently (route.js 404s an oauth.js-only
// provider, or authorizeUrl throws UNKNOWN_PROVIDER for a route.js-only one), with no test in
// either file positioned to catch the mismatch (fix round 1, Minor).
export const PROVIDERS = new Set(['google', 'github'])

function redirectUri(config, provider) {
  return `${config.origin}/signin/${provider}/callback`
}

/**
 * Where to send the browser to start the flow. Throws `OAuthError('NOT_CONFIGURED')` for a
 * provider with no client credentials, and `OAuthError('UNKNOWN_PROVIDER')` for anything else —
 * both are refused before ever touching the network, same discipline as `host/client.js`'s
 * "never skip signing".
 */
export function authorizeUrl(provider, config, state) {
  if (!PROVIDERS.has(provider)) throw new OAuthError('UNKNOWN_PROVIDER')
  const creds = config.oauth?.[provider]
  if (!creds) throw new OAuthError('NOT_CONFIGURED')
  if (provider === 'google') {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('client_id', creds.id)
    url.searchParams.set('redirect_uri', redirectUri(config, provider))
    url.searchParams.set('response_type', 'code')
    // `profile` puts `name` and `picture` in the id_token: the account's face (09/10/2026).
    url.searchParams.set('scope', 'openid email profile')
    url.searchParams.set('state', state)
    return url.toString()
  }
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', creds.id)
  url.searchParams.set('redirect_uri', redirectUri(config, provider))
  url.searchParams.set('scope', 'user:email')
  url.searchParams.set('state', state)
  return url.toString()
}

/** Decode a JWT's payload segment without checking its signature — see the module comment for why
 * that is the right call for an id_token that arrived straight from Google over TLS. */
function decodeJwtPayload(token) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/** Longest profile value kept: a name or a picture address, never a document. */
const PROFILE_TEXT_MAX = 2048

/**
 * A profile field the provider sent (a name, a picture address), trimmed, or null when it sent
 * none. Never trusted further than that: the picture address is checked against the allow-list
 * where it is stored (`lib/avatar-source.js`).
 */
function profileText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text === '' || text.length > PROFILE_TEXT_MAX ? null : text
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function exchangeGoogle(config, code, fetchImpl) {
  const creds = config.oauth.google
  const body = new URLSearchParams({
    client_id: creds.id,
    client_secret: creds.secret,
    code,
    redirect_uri: redirectUri(config, 'google'),
    grant_type: 'authorization_code'
  })
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  const payload = await readJson(response)
  if (!response.ok || typeof payload?.id_token !== 'string') throw new OAuthError('EXCHANGE_FAILED')
  const claims = decodeJwtPayload(payload.id_token)
  if (!claims) throw new OAuthError('EXCHANGE_FAILED')
  // Google sends this as a real boolean; some other id_token issuers send the string "true" —
  // both are checked so a bug elsewhere never turns into a laxer check here.
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    throw new OAuthError('EMAIL_NOT_VERIFIED')
  }
  if (typeof claims.email !== 'string' || typeof claims.sub !== 'string') {
    throw new OAuthError('EXCHANGE_FAILED')
  }
  return {
    email: claims.email.toLowerCase(),
    subject: claims.sub,
    name: profileText(claims.name),
    picture: profileText(claims.picture)
  }
}

function githubHeaders(accessToken) {
  return {
    authorization: `Bearer ${accessToken}`,
    accept: 'application/vnd.github+json',
    // GitHub's API refuses every request with no User-Agent (403) — same header `github/route.js`
    // already sends for the App's own calls.
    'user-agent': 'tracy-web'
  }
}

async function exchangeGithub(config, code, fetchImpl) {
  const creds = config.oauth.github
  const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      client_id: creds.id,
      client_secret: creds.secret,
      code,
      redirect_uri: redirectUri(config, 'github')
    }).toString()
  })
  const tokenPayload = await readJson(tokenResponse)
  if (!tokenResponse.ok || typeof tokenPayload?.access_token !== 'string') {
    throw new OAuthError('EXCHANGE_FAILED')
  }
  const headers = githubHeaders(tokenPayload.access_token)
  const [emailsResponse, userResponse] = await Promise.all([
    fetchImpl('https://api.github.com/user/emails', { headers }),
    fetchImpl('https://api.github.com/user', { headers })
  ])
  if (!emailsResponse.ok || !userResponse.ok) throw new OAuthError('EXCHANGE_FAILED')
  const emails = await readJson(emailsResponse)
  const user = await readJson(userResponse)
  const primary = Array.isArray(emails) ? emails.find((e) => e?.primary && e?.verified) : null
  if (!primary || typeof primary.email !== 'string') throw new OAuthError('EMAIL_NOT_VERIFIED')
  if (user?.id === undefined || user?.id === null) throw new OAuthError('EXCHANGE_FAILED')
  return {
    email: primary.email.toLowerCase(),
    subject: String(user.id),
    name: profileText(user.name),
    picture: profileText(user.avatar_url)
  }
}

/**
 * Trade an authorization code for the signed-in person's email and a stable per-provider subject.
 *
 * @param {'google'|'github'} provider
 * @param {object} config - `readConfig`'s value.
 * @param {string} code - the `code` query param the provider's redirect carried.
 * @param {{fetchImpl?: typeof fetch}} [deps] - overridable so a test never dials a real provider.
 * @returns {Promise<{email: string, subject: string, name: string | null, picture: string | null}>}
 *   `name` and `picture` are the provider's profile (Google's id_token claims, GitHub's `GET /user`),
 *   null when it sent none.
 * @throws {OAuthError}
 */
export async function exchangeCode(provider, config, code, { fetchImpl = fetch } = {}) {
  if (!PROVIDERS.has(provider)) throw new OAuthError('UNKNOWN_PROVIDER')
  if (!config.oauth?.[provider]) throw new OAuthError('NOT_CONFIGURED')
  return provider === 'google'
    ? exchangeGoogle(config, code, fetchImpl)
    : exchangeGithub(config, code, fetchImpl)
}

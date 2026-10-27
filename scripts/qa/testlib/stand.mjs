/**
 * HTTP to the QA stand for tests a lane writes (plan §4.6, seams 1 and 3). Copied into `lib/` of the
 * `qa/daily-tests` branch, so it imports nothing but Node core.
 *
 * Every request goes to the QA gate (never to `tracy-web` directly) with the lane's key and PR:
 *   - `Host` is the stand's own name (`qa.tracy.test:36080`) or a site's (`<siteKey>:36080`); the TCP
 *     connection goes to the gate address, so no DNS is needed inside the fence.
 *   - a write (POST/PUT/PATCH/DELETE) carries `Origin: <TRACY_ORIGIN>` exactly and NEVER
 *     `Sec-Fetch-Site` (`apps/tracy-web/src/lib/csrf.js`: absent fetch metadata -> Origin decides);
 *   - a body is JSON with `content-type: application/json` (anything else is 415 at a JSON door).
 *   - `node:http` is used rather than `fetch`, which sends fetch-metadata headers of its own.
 *
 * Env (set by the orchestrator and by `rerun`):
 *   QA_GATE_URL      where the gate listens           default http://127.0.0.1:36080
 *   TRACY_ORIGIN     the stand's origin               default http://qa.tracy.test:36080
 *   QA_LANE          sonnet | sol | verify
 *   QA_LANE_KEY_FILE file holding the lane key (or QA_LANE_KEY, the key itself)
 *   QA_PR            the PR under test (sent as `x-qa-pr`)
 *   QA_STAND_DOMAIN  default qa.tracy.test
 *   QA_API_HOST      the stand's API host (API_ORIGIN) default api.<QA_STAND_DOMAIN>
 *
 * Exports:
 *   standConfig(env = process.env): Config
 *   laneEmail(config, name?): string                       // <name>@<lane>.<domain>, a fresh name if omitted
 *   newBuildId(): string                                   // a UUID, what `/api/sites` wants as `buildId`
 *   isWrite(method): boolean
 *   requestHeaders(config, { method, host, cookie?, headers?, hasBody? }): object   // pure
 *   standClient(config = standConfig()): Client
 * Client:
 *   config
 *   cookies: Map<string,string>                            // the client's own cookie jar
 *   request(method, path, { body?, host?, headers?, raw?, cookies? = true }): Promise<Reply>
 *   get(path, opts?) · post(path, body, opts?) · put(path, body, opts?) · patch(path, body, opts?)
 *   del(path, opts?)
 *   signIn(email?): Promise<{ email }>                     // POST /__qa/session -> tracy_sess in the jar
 *   otp(email): Promise<string>                            // GET /__qa/otp
 *   claimSite({ platform, label, buildId?, ...rest }): Promise<Reply>   // POST /api/sites/claim
 *   createSite({ platform, label, buildId?, ...rest }): Promise<Reply>  // POST /api/sites
 *   deleteSite(siteKey): Promise<Reply>
 *   apply(siteKey, action, params?): Promise<Reply>        // POST /api/sites/<key>/apply/<action>
 *   page(siteKey, path = '/'): Promise<Reply>              // the site's public page (Host = siteKey)
 *   dsh(siteKey, endpoint, args): Promise<Reply>           // one dsh RPC under /<siteKey>/api/<endpoint>
 *   mintKey({ siteKey, label?, scopes? = ['content'], expiresInDays? = 1 }): Promise<Reply>
 *                                                          // POST /api/me/keys; 201 json { id, key, … }
 *   revokeKey(id): Promise<Reply>                          // DELETE /api/me/keys/<id>
 *   v1(method, path, { key, body?, headers? }): Promise<Reply>   // the public API on the API host,
 *                                                          // `Authorization: Bearer <key>`, no cookie
 * Reply: { status, headers, text, json (parsed or null), buildId? }
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'

const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const isWrite = (method) => WRITES.has(String(method).toUpperCase())
export const newBuildId = () => randomUUID()

export function standConfig(env = process.env) {
  const origin = (env.TRACY_ORIGIN ?? 'http://qa.tracy.test:36080').replace(/\/+$/, '')
  const gate = new URL(env.QA_GATE_URL ?? 'http://127.0.0.1:36080')
  let laneKey = env.QA_LANE_KEY ?? null
  if (!laneKey && env.QA_LANE_KEY_FILE) laneKey = readFileSync(env.QA_LANE_KEY_FILE, 'utf8').trim()
  const o = new URL(origin)
  return {
    origin,
    mainHost: o.host,
    port: o.port || '80',
    domain: (env.QA_STAND_DOMAIN ?? o.hostname).toLowerCase(),
    apiHost: (env.QA_API_HOST ?? `api.${env.QA_STAND_DOMAIN ?? o.hostname}`).toLowerCase(),
    gateHost: gate.hostname,
    gatePort: Number(gate.port || 80),
    lane: env.QA_LANE ?? null,
    laneKey,
    pr: env.QA_PR ?? null
  }
}

export function laneEmail(config, name = `t${randomUUID().slice(0, 8)}`) {
  if (!config.lane) throw new Error('QA_LANE is not set')
  return `${name}@${config.lane}.${config.domain}`
}

/** The headers one request carries. Pure, so the rule is testable without a server. */
export function requestHeaders(config, { method, host, cookie, headers = {}, hasBody = false }) {
  const h = { host, accept: 'application/json, text/html;q=0.9, */*;q=0.8' }
  if (config.laneKey) h['x-qa-lane'] = config.laneKey
  if (config.pr !== null && config.pr !== undefined) h['x-qa-pr'] = String(config.pr)
  if (cookie) h.cookie = cookie
  if (isWrite(method)) h.origin = config.origin
  if (hasBody) h['content-type'] = 'application/json'
  for (const [k, v] of Object.entries(headers)) h[k.toLowerCase()] = v
  // Fetch metadata would make tracy-web judge the request as a browser's (csrf.js rule 1).
  for (const k of Object.keys(h)) if (k.startsWith('sec-fetch-')) delete h[k]
  return h
}

function parseSetCookies(jar, setCookie) {
  for (const sc of [setCookie ?? []].flat()) {
    const first = String(sc).split(';')[0]
    const i = first.indexOf('=')
    if (i <= 0) continue
    const name = first.slice(0, i).trim()
    const value = first.slice(i + 1).trim()
    if (/max-age=0\b/i.test(sc) || value === '') jar.delete(name)
    else jar.set(name, value)
  }
}

export function standClient(config = standConfig()) {
  const cookies = new Map()
  const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')

  function request(method, path, { body, host, headers, raw, cookies: withCookies = true } = {}) {
    const m = String(method).toUpperCase()
    const payload =
      raw !== undefined ? Buffer.from(raw) : body !== undefined ? Buffer.from(JSON.stringify(body)) : null
    const h = requestHeaders(config, {
      method: m,
      host: host ?? config.mainHost,
      cookie: withCookies ? cookieHeader() : '',
      headers,
      hasBody: body !== undefined
    })
    if (payload) h['content-length'] = String(payload.length)
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: config.gateHost, port: config.gatePort, method: m, path, headers: h },
        (res) => {
          parseSetCookies(cookies, res.headers['set-cookie'])
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8')
            let json = null
            try {
              json = JSON.parse(text)
            } catch {}
            resolve({ status: res.statusCode, headers: res.headers, text, json })
          })
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.end(payload ?? undefined)
    })
  }

  const siteHost = (siteKey) => `${String(siteKey).toLowerCase()}:${config.port}`

  async function build(door, { platform, label, buildId = newBuildId(), ...rest }) {
    if (!label) throw new Error('createSite needs a label (the gate refuses a nameless build)')
    const reply = await request('POST', door, { body: { platform, label, buildId, ...rest } })
    return { ...reply, buildId }
  }

  return {
    config,
    cookies,
    request,
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    del: (path, opts) => request('DELETE', path, opts),
    async signIn(email = laneEmail(config)) {
      const reply = await request('POST', '/__qa/session', { body: { email } })
      if (reply.status !== 200) throw new Error(`QA session refused: ${reply.status} ${reply.text}`)
      return { email: reply.json?.email ?? email }
    },
    async otp(email) {
      const reply = await request('GET', `/__qa/otp?email=${encodeURIComponent(email)}`)
      if (reply.status !== 200) throw new Error(`QA otp refused: ${reply.status} ${reply.text}`)
      return reply.json.code
    },
    claimSite: (opts) => build('/api/sites/claim', opts),
    createSite: (opts) => build('/api/sites', opts),
    deleteSite: (siteKey) => request('DELETE', `/api/sites/${encodeURIComponent(siteKey)}`),
    apply: (siteKey, action, params = {}) =>
      request('POST', `/api/sites/${encodeURIComponent(siteKey)}/apply/${encodeURIComponent(action)}`, {
        body: params
      }),
    page: (siteKey, path = '/') => request('GET', path, { host: siteHost(siteKey) }),
    /**
     * The seat-key door (`apps/tracy-web/src/keys/route.js`). Its body check refuses with a bare
     * 400 INVALID_REQUEST a `siteKey` that is not a host (`lib/http.js` `normalizeSiteKey`): a
     * label such as `qa-fixedwp` is one (seven cases of a night were lost to it, 03/10), so it is
     * refused here, by name, before anything is sent.
     */
    mintKey({ siteKey, label = 'qa test key', scopes = ['content'], expiresInDays = 1 } = {}) {
      if (typeof siteKey !== 'string' || !siteKey.includes('.'))
        throw new Error(`mintKey needs a siteKey (<label>.${config.domain}), not a label: ${siteKey}`)
      return request('POST', '/api/me/keys', { body: { siteKey, label, scopes, expiresInDays } })
    },
    revokeKey: (id) => request('DELETE', `/api/me/keys/${encodeURIComponent(id)}`),
    v1(method, path, { key, body, headers = {} } = {}) {
      if (!key) throw new Error('v1 needs the key mintKey answered')
      return request(method, path, {
        body,
        host: `${config.apiHost}:${config.port}`,
        headers: { ...headers, authorization: `Bearer ${key}` },
        cookies: false
      })
    },
    dsh(siteKey, endpoint, args, { rpcId = randomUUID() } = {}) {
      return request('POST', `/${siteKey}/api/${endpoint}`, {
        body: { type: 'client-request', rpcId, method: endpoint, payload: { args } }
      })
    }
  }
}

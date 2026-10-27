// `/v1/demos` the way a self-hosted Website Opportunities uses it (`packages/wo/website-opportunities/src/
// tracy-connection.js`): an account token of scope `demos` from the OAuth device flow, approved on `/connect` with
// the run account's own session, then `POST /v1/demos` with an `Idempotency-Key`. The token lives in memory only.
//
// Cleanup: each demo is written into the manifest BEFORE it is asked for (kind `demo`); its cleaner finds the demo's
// site (read-only, by the run account) and deletes it through the site door, like every other site of the run.

import { randomUUID } from 'node:crypto'
import { Client } from './api.mjs'
import { devExec, mintCookie } from './dev.mjs'
import { ENV } from './env.mjs'
import { deleteSite } from './sites.mjs'

export const DEVICE_CLIENT_ID = 'website-opportunities'
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'

async function form(url, fields, { cookie, origin } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'user-agent': ENV.userAgent,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json, text/html;q=0.9',
      ...(cookie ? { cookie: `${ENV.sessionCookie}=${cookie}` } : {}),
      ...(origin ? { origin } : {})
    },
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000)
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  return { status: res.status, text, json }
}

/**
 * Connect the run account the way "Connect Tracy" does, and return its account token.
 * @param {Client} owner - the run account, with its minted session
 * @returns {Promise<{ accessToken: string, refreshToken: string | null, steps: Record<string, number> }>}
 */
export async function connectDemosToken(owner) {
  const steps = {}
  // `/connect` refuses a session with no account row, and a minted session has none until a door writes it:
  // marking the welcome hint seen is the smallest such door, harmless on a throwaway run account.
  steps.me = (await owner.get('/auth/me')).status
  steps.account = (await owner.post('/api/seen-hints', { hint: 'welcome' })).status
  const code = await form(`${ENV.origin}/oauth/device/code`, {
    client_id: DEVICE_CLIENT_ID,
    scope: 'demos'
  })
  steps.deviceCode = code.status
  if (code.status !== 200 || !code.json?.user_code)
    throw new Error(`device code answered ${code.status} ${code.text.slice(0, 160)}`)
  const page = await owner.get(`/connect?code=${encodeURIComponent(code.json.user_code)}`, {
    headers: { accept: 'text/html' }
  })
  steps.connectPage = page.status
  const field = (name) => new RegExp(`name="${name}" value="([^"]*)"`).exec(page.text)?.[1]
  const request = field('request')
  const signature = field('signature')
  if (page.status !== 200 || !request || !signature)
    throw new Error(`/connect answered ${page.status} without its signed form`)
  const allow = await form(
    `${ENV.origin}/connect`,
    { request, signature, user_code: code.json.user_code, decision: 'allow' },
    { cookie: owner.token, origin: ENV.origin }
  )
  steps.allow = allow.status
  if (allow.status !== 200) throw new Error(`POST /connect answered ${allow.status}`)
  const token = await form(`${ENV.origin}/oauth/token`, {
    grant_type: DEVICE_GRANT,
    device_code: code.json.device_code,
    client_id: DEVICE_CLIENT_ID
  })
  steps.token = token.status
  if (token.status !== 200 || typeof token.json?.access_token !== 'string')
    throw new Error(`/oauth/token answered ${token.status} ${token.json?.error ?? ''}`)
  return { accessToken: token.json.access_token, refreshToken: token.json.refresh_token ?? null, steps }
}

/** Revoke the grant at the end of a journey; a failure is reported, never thrown. */
export async function revokeDemosToken(refreshToken) {
  if (!refreshToken) return null
  return (await form(`${ENV.origin}/oauth/revoke`, { token: refreshToken, client_id: DEVICE_CLIENT_ID }))
    .status
}

/** A `/v1/demos` client for one account token. */
export function demosApi(accessToken) {
  const c = new Client({ name: 'demos' })
  const auth = { authorization: `Bearer ${accessToken}` }
  const url = (p) => `${ENV.apiOrigin}${p}`
  return {
    options: () => c.get(url('/v1/demos/options'), { headers: auth }),
    /** @param {any} body @param {string} [key] */
    create: (body, key = `e2e-${randomUUID()}`) =>
      c.post(url('/v1/demos'), body, { headers: { ...auth, 'idempotency-key': key }, timeoutMs: 120_000 }),
    get: (id) => c.get(url(`/v1/demos/${encodeURIComponent(id)}`), { headers: auth }),
    list: () => c.get(url('/v1/demos?limit=50'), { headers: auth }),
    cancel: (id) => c.post(url(`/v1/demos/${encodeURIComponent(id)}/cancel`), {}, { headers: auth }),
    calls: c.calls
  }
}

/**
 * Poll a demo until it leaves `queued`/`building` (or, with `until`, reaches one of those states).
 * @param {ReturnType<typeof demosApi>} api
 * @param {string} id
 * @param {{ capMs?: number, until?: string[] }} [opts]
 */
export async function waitForDemo(api, id, { capMs = 15 * 60_000, until } = {}) {
  const started = Date.now()
  const seen = []
  let demo = null
  while (Date.now() - started < capMs) {
    const res = await api.get(id)
    demo = res.json?.demo ?? null
    const status = demo?.status ?? `http-${res.status}`
    if (seen.at(-1) !== status) seen.push(status)
    const done = until ? until.includes(status) : !['queued', 'building'].includes(status)
    if (done) return { demo, seen, ms: Date.now() - started }
    await new Promise((r) => setTimeout(r, 5_000))
  }
  return { demo, seen, ms: Date.now() - started, timeout: true }
}

/**
 * The manifest cleaner for kind `demo` (id: the request's Idempotency-Key): delete every demo site of the run
 * account through the site door, as its owner. A per-run account holds this run's demos only.
 * @param {import('./manifest.mjs').Resource} resource
 * @param {{ runId?: string }} [run]
 */
export async function cleanDemoResource(resource, { runId } = {}) {
  const email = resource.data?.owner
  if (typeof email !== 'string' || !runId)
    return { state: 'left', detail: { reason: 'manifest names no owner' } }
  const rows = await devExec.psqlReadOnly(
    runId,
    `select distinct b.site_key from wo_public_demo d
       join wo_demo_action a on a.id = d.action_id
       join wo_build b on b.account_id = a.account_id and b.request_id = a.build_request_id
       join site st on st.site_key = b.site_key
     where b.site_key is not null and d.account_id = (select id from account where lower(email) = lower(:'owner'))`,
    { owner: email }
  )
  const siteKeys = rows.map((r) => r[0]).filter(Boolean)
  if (siteKeys.length === 0)
    return { state: 'never-created', detail: { reason: 'the account holds no demo site' } }
  const owner = new Client({ name: 'owner', email, token: await mintCookie(email) })
  const sites = []
  for (const siteKey of siteKeys) {
    const out = await deleteSite(owner, siteKey, siteKey.split('.')[0])
    sites.push({ siteKey, state: out.state, ...out.detail })
  }
  const left = sites.filter((s) => s.state === 'left')
  return { state: left.length ? 'left' : 'cleaned', detail: { sites } }
}

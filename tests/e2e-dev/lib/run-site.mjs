// One site per run, shared by the journeys that only need "a ready site of this CMS" (J4a/b/c,
// J5, J6, J7). Each journey runs in its own process, so the site is found again through the
// manifest: the first journey creates it, the next ones reuse it, and `run.mjs` deletes it in its
// end-of-run cleanup like every other site the manifest names.
//
// Seats and comments a journey adds on this site go away with it (the delete door removes the
// site's book and threads); they are written into the site's own history in the manifest, so the
// report still lists what the run made.

import { Client } from './api.mjs'
import { mintCookie } from './dev.mjs'
import { ENV, addressLabel, runEmail, runLabel, siteOrigin } from './env.mjs'
import { createSite, waitForJob } from './sites.mjs'

/** The label suffix of a run's shared site: `s` + the CMS letter (+ attempt), e.g. `e2ei7k2sw`. */
const SHARED = (platform, n) => `s${platform[0]}${n ? n : ''}`

/**
 * Name an account in the manifest before its first door creates its row. A profile with fixed
 * accounts (staging) reuses `e2e-<profile>-<role>@…`, which no run made, so it is no run's to list.
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {string} email
 * @param {Record<string, any>} [data]
 */
export function noteAccount(manifest, email, data = {}) {
  if (ENV.accounts !== 'per-run') return
  if (!manifest.read().resources.some((r) => r.kind === 'account' && r.id === email))
    manifest.intend('account', email, data)
}

/**
 * The run's account for `role` (`e2e-<runId>-owner@…`), written into the manifest before its first use.
 * @param {{ runId: string, manifest: import('./manifest.mjs').Manifest }} run
 * @param {string} [role]
 */
export async function runAccount({ runId, manifest }, role = 'owner') {
  const email = runEmail(runId, role)
  noteAccount(manifest, email)
  return new Client({ name: role, email, token: await mintCookie(email) })
}

/**
 * The run's shared site of `platform`, created on first use and waited for until its job is done.
 * A shared site whose provision failed is left to the end-of-run cleanup and a new one is made
 * under the next label.
 * @param {{ runId: string, manifest: import('./manifest.mjs').Manifest }} run
 * @param {Client} owner
 * @param {string} platform
 * @returns {Promise<{ siteKey: string, label: string, origin: string, created: boolean, readyMs: number | null }>}
 */
export async function sharedSite(run, owner, platform) {
  const { runId, manifest } = run
  for (let n = 0; n < 3; n++) {
    const label = addressLabel(runLabel(runId, SHARED(platform, n)))
    const known = manifest.read().resources.find((r) => r.kind === 'site' && r.data?.label === label)
    if (known) {
      if (known.state === 'created' && known.history.some((h) => h.detail?.shared === 'ready'))
        return { siteKey: known.id, label, origin: siteOrigin(label), created: false, readyMs: null }
      continue
    }
    const t0 = Date.now()
    const made = await createSite(owner, manifest, {
      label: runLabel(runId, SHARED(platform, n)),
      platform,
      ...ENV.builds[platform]
    })
    const job = await waitForJob(owner, made.siteKey, made.jobId, ENV.readyCapMs)
    if (job.state !== 'done') {
      manifest.mark('site', made.siteKey, 'created', { shared: 'failed', job: job.state })
      continue
    }
    manifest.mark('site', made.siteKey, 'created', { shared: 'ready', readyMs: Date.now() - t0 })
    return {
      siteKey: made.siteKey,
      label,
      origin: siteOrigin(label),
      created: true,
      readyMs: Date.now() - t0
    }
  }
  throw new Error(`no shared ${platform} site could be provisioned for run ${runId} (3 attempts)`)
}

/**
 * Note in the site's manifest history something the run made on it that dies with it (a seat, a
 * comment thread), so the report lists it.
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {string} siteKey
 * @param {Record<string, any>} child - must be free of secrets
 */
export function noteChild(manifest, siteKey, child) {
  const site = manifest.read().resources.find((r) => r.kind === 'site' && r.id === siteKey)
  if (!site) throw new Error(`manifest does not name site ${siteKey}`)
  manifest.mark('site', siteKey, site.state, { child })
}

/**
 * A file of the site's webroot, read the way a visitor's browser reads it (a static file served
 * from the site's own address), with a query that no cache has seen. No door of tracy-web returns
 * a webroot file's contents, and this needs no shell on the dev host.
 * @param {string} origin - `https://<label>.<siteDomain>`
 * @param {string} path - relative to the webroot, e.g. `wp-content/themes/<slug>/style.css`
 * @param {Client} [as] - who reads it (a draft answers anyone since 16/09; the owner by default)
 */
export async function readSiteFile(origin, path, as) {
  const reader = as ?? new Client({ name: 'reader' })
  const res = await reader.get(
    `${origin}/${path}?e2e=${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    {
      headers: { accept: '*/*', 'cache-control': 'no-cache' }
    }
  )
  return { status: res.status, text: res.text }
}

/**
 * The slug of the active WordPress theme, read off the home page's own asset URLs.
 * @param {string} origin
 * @param {Client} [as]
 */
export async function wordpressTheme(origin, as) {
  const reader = as ?? new Client({ name: 'reader' })
  const home = await reader.get(`${origin}/`, { headers: { accept: 'text/html' }, timeoutMs: 90_000 })
  const counts = new Map()
  for (const m of home.text.matchAll(/wp-content\/themes\/([a-z0-9_-]+)\//gi))
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  const slug = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { slug, home }
}

/**
 * Invite `member` to the site in `role` and accept with the member's own session — the mail's link
 * cannot be read without a test mailbox (plan Q1), so acceptance goes through the My Sites door.
 * Returns the member's account id as the roster names it.
 * @param {{ manifest: import('./manifest.mjs').Manifest }} run
 * @param {Client} owner
 * @param {Client} member
 * @param {string} siteKey
 * @param {string} role
 */
export async function seatMember({ manifest }, owner, member, siteKey, role) {
  noteChild(manifest, siteKey, { seat: member.email, role, state: 'intended' })
  const invite = await owner.post('/api/team/invite', { emails: [member.email], role, siteKeys: [siteKey] })
  const outcome = invite.json?.results?.[0]?.sites?.[0]?.outcome ?? null
  if (invite.status !== 200 || !['invited', 'already_granted'].includes(String(outcome)))
    throw new Error(`invite answered ${invite.status} ${invite.json?.code ?? ''} outcome ${outcome}`)
  const accept = await member.post(`/api/sites/${encodeURIComponent(siteKey)}/accept`, {})
  if (accept.status !== 200 || accept.json?.accepted !== true)
    throw new Error(`accept answered ${accept.status} ${accept.json?.code ?? ''}`)
  const id = await rosterIdOf(owner, siteKey, member.email)
  if (!id) throw new Error(`${member.email} is not on the roster after accepting`)
  return { id, invite: { status: invite.status, outcome }, accept: { status: accept.status } }
}

/**
 * The roster row of `email` on `siteKey`, as `GET /api/team` answers it to `viewer`.
 * @param {Client} viewer
 * @param {string} siteKey
 * @param {string} email
 */
export async function rosterRowOf(viewer, siteKey, email) {
  const team = await viewer.get('/api/team')
  const site = (team.json?.sites ?? []).find((s) => s.siteKey === siteKey)
  return (site?.seats ?? []).find((s) => String(s.email).toLowerCase() === email.toLowerCase()) ?? null
}

/**
 * The WordPress tagline as the database holds it, through the Apply door's read.
 * @param {Client} owner
 * @param {string} siteKey
 */
export async function readTagline(owner, siteKey) {
  const res = await owner.post(`/api/sites/${encodeURIComponent(siteKey)}/apply`, {
    action: 'content.get',
    params: { kind: 'option', key: 'blogdescription' }
  })
  const b = res.json ?? {}
  const value = [b.value, b.data?.value, b.item?.value, b.option?.value, b.result?.value].find(
    (v) => typeof v === 'string'
  )
  return { status: res.status, value: value ?? null, body: b }
}

/**
 * Write the WordPress tagline directly through the Apply door (no chat, no prompt spent). The
 * component wants an `apply_id` of the caller's own, in the site tools' shape.
 * @param {Client} owner
 * @param {string} siteKey
 * @param {string} value
 */
export async function writeTagline(owner, siteKey, value) {
  const applyId = `wp-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8).padEnd(6, '0')}`
  const res = await owner.post(`/api/sites/${encodeURIComponent(siteKey)}/apply`, {
    action: 'content.update',
    params: { kind: 'option', key: 'blogdescription', fields: { value }, apply_id: applyId }
  })
  return {
    status: res.status,
    ok: res.json?.ok ?? null,
    code: res.json?.code ?? null,
    applyId,
    body: res.json
  }
}

async function rosterIdOf(viewer, siteKey, email) {
  return (await rosterRowOf(viewer, siteKey, email))?.id ?? null
}

/**
 * Publish (`live`) or unpublish (`draft`) through `POST /api/sites/:key/go-live` — the only door that
 * moves the publish flag (`apps/tracy-web/src/sites/publish.js`; `POST /state {publish}` is refused
 * with 409 `PUBLISH_BY_GO_LIVE`) — and poll `GET /state` until the host's job has ended: the flag
 * reads `want` with no operation running, or the operation failed, or `capMs` ran out.
 * @param {Client} owner - an owner/admin of the site
 * @param {string} siteKey
 * @param {'live' | 'draft'} op
 * @param {number} [capMs]
 * @returns {Promise<{ status: number, code: string | null, jobId: string | null, ended: 'done' | 'failed' | 'timeout' | 'refused', publish: string | null, ms: number, operation: any }>}
 */
export async function goLive(owner, siteKey, op, capMs = 180_000) {
  const path = `/api/sites/${encodeURIComponent(siteKey)}`
  const want = op === 'live' ? 'published' : 'draft'
  const started = Date.now()
  const res = await owner.post(`${path}/go-live`, { op }, { timeoutMs: 60_000 })
  const out = {
    status: res.status,
    code: res.json?.code ?? null,
    jobId: res.json?.jobId ?? null,
    ended: /** @type {'done' | 'failed' | 'timeout' | 'refused'} */ ('refused'),
    publish: null,
    ms: 0,
    operation: null
  }
  if (res.status !== 202) return { ...out, ms: Date.now() - started }
  while (Date.now() - started < capMs) {
    await new Promise((r) => setTimeout(r, ENV.jobPollMs))
    const state = await owner.get(`${path}/state`)
    out.publish = state.json?.publish ?? null
    out.operation = state.json?.operation ?? null
    if (out.operation?.state === 'failed') return { ...out, ended: 'failed', ms: Date.now() - started }
    if (!out.operation && out.publish === want) return { ...out, ended: 'done', ms: Date.now() - started }
  }
  return { ...out, ended: 'timeout', ms: Date.now() - started }
}

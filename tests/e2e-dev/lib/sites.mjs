// Creating and removing a run's sites, only through tracy-web's own doors, and checking on the
// host that removal really happened (plan §1: the delete door can answer `removed: true`
// with `host: false`, so a 200 alone proves nothing).

import { randomUUID } from 'node:crypto'
import { Client } from './api.mjs'
import { devExec, mintCookie } from './dev.mjs'
import { ENV, addressLabel, siteKeyOf } from './env.mjs'

/**
 * Ask for a site. The manifest is written BEFORE the request, so a process that dies while the
 * request is in flight still leaves the name for cleanup.
 *
 * `label` is what a person types; the server builds the address `<prefix><label>` (staging:
 * `stg-`), and that ADDRESS label is what the manifest, the return value and every later lookup
 * (containers, origin) use. A site key from the server that differs from the expected one means
 * the profile's prefix is wrong: the site it made goes into the manifest for cleanup, and the
 * journey stops.
 * @param {Client} owner
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {{ label: string, platform: string, design?: string, quickstart?: string }} want
 * @returns {Promise<{ siteKey: string, label: string, jobId: string, status: number, ms: number, body: any }>}
 */
export async function createSite(owner, manifest, { label: typed, platform, design, quickstart }) {
  const label = addressLabel(typed)
  const siteKey = siteKeyOf(label)
  manifest.intend('site', siteKey, { label, typed, platform, owner: owner.email, design: design ?? null })
  const res = await owner.post('/api/sites', {
    label: typed,
    platform,
    buildId: randomUUID(),
    ...(design ? { design } : {}),
    ...(quickstart ? { quickstart } : {})
  })
  if (res.status !== 202 || typeof res.json?.jobId !== 'string') {
    // Nothing was provisioned unless the door said so; the row may still exist (a claim), so
    // the cleanup pass still asks the delete door about it.
    throw new Error(
      `POST /api/sites ${platform} answered ${res.status} ${res.json?.code ?? res.text.slice(0, 200)}`
    )
  }
  if (typeof res.json.siteKey === 'string' && res.json.siteKey !== siteKey) {
    // The site the server did make is still this run's: name it so the cleanup removes it.
    const made = res.json.siteKey
    manifest.intend('site', made, { label: made.split('.')[0], typed, platform, owner: owner.email })
    manifest.mark('site', made, 'created', { jobId: res.json.jobId })
    throw new Error(
      `POST /api/sites made ${res.json.siteKey}, expected ${siteKey}: the ${ENV.name} profile's site prefix is wrong`
    )
  }
  manifest.mark('site', siteKey, 'created', { jobId: res.json.jobId })
  return { siteKey, label, jobId: res.json.jobId, status: res.status, ms: res.ms, body: res.json }
}

/**
 * Poll the provision job until it is `done`, `failed`, or the budget runs out. Polling is not
 * passive: the `done` poll is what hands the site over (repo, lane, content door), as in the UI.
 * @param {Client} owner
 * @param {string} siteKey
 * @param {string} jobId
 * @param {number} budgetMs
 * @returns {Promise<{ state: string, ms: number, polls: number, steps: string[], body: any }>}
 */
export async function waitForJob(owner, siteKey, jobId, budgetMs) {
  const started = Date.now()
  const steps = []
  let polls = 0
  let body = null
  while (Date.now() - started < budgetMs) {
    polls++
    const res = await owner.get(`/api/sites/${encodeURIComponent(siteKey)}/jobs/${encodeURIComponent(jobId)}`)
    body = res.json
    const state = body?.state ?? `http-${res.status}`
    if (body?.step && steps.at(-1) !== body.step) steps.push(body.step)
    if (state === 'done' || state === 'failed') return { state, ms: Date.now() - started, polls, steps, body }
    // A 5xx while a host is busy is a poll that did not land, not a verdict.
    await new Promise((r) => setTimeout(r, ENV.jobPollMs))
  }
  return { state: 'timeout', ms: Date.now() - started, polls, steps, body }
}

/**
 * The containers of the site's compose project on the host (stopped ones included); another site whose label starts
 * with this one's (`foo` and `foo-bar`) is not counted.
 * @param {string} label - the ADDRESS label (prefix included)
 */
export async function containersOf(label) {
  const rows = await devExec.ps({ label })
  return rows.map((r) => ({ name: r.Names, state: r.State, status: r.Status, image: r.Image }))
}

/**
 * Delete a site through `DELETE /api/sites/:key` as its owner, then reconcile against the host.
 * @param {Client} owner
 * @param {string} siteKey
 * @param {string} label - the ADDRESS label
 * @returns {Promise<{ state: 'cleaned' | 'left' | 'never-created', detail: any }>}
 */
export async function deleteSite(owner, siteKey, label) {
  const res = await owner.delete(`/api/sites/${encodeURIComponent(siteKey)}`, { timeoutMs: 180_000 })
  const answer = res.json ?? { status: res.status }
  const left = await containersOf(label)
  const detail = {
    status: res.status,
    removed: answer.removed ?? null,
    host: answer.host ?? null,
    sessions: answer.sessions ?? null,
    repo: answer.repo ?? null,
    ...(answer.hostReason ? { hostReason: answer.hostReason } : {}),
    ...(answer.sessionsReason ? { sessionsReason: answer.sessionsReason } : {}),
    ...(answer.code ? { code: answer.code } : {}),
    containersLeft: left.map((c) => `${c.name} (${c.state})`)
  }
  if (res.status === 404 && answer.code === 'SITE_UNKNOWN' && left.length === 0)
    return { state: 'never-created', detail }
  const clean = res.status === 200 && answer.removed === true && answer.host === true && left.length === 0
  return { state: clean ? 'cleaned' : 'left', detail }
}

/**
 * The manifest cleaner for kind `site`: mints the owner the manifest names (a run account) and
 * deletes through the door. Used in a journey's `finally`, by `run.mjs` at the end of a run, and
 * to recover a dead run's leftovers.
 * @param {import('./manifest.mjs').Resource} resource
 * @param {{ runId?: string }} [run] - the manifest's run, which the site table read must name
 */
export async function cleanSiteResource(resource, { runId } = {}) {
  const email = resource.data?.owner
  const label = resource.data?.label
  if (typeof email !== 'string' || typeof label !== 'string')
    return { state: 'left', detail: { reason: 'manifest names no owner/label' } }
  const owner = new Client({ name: 'owner', email, token: await mintCookie(email) })
  const out = await deleteSite(owner, resource.id, label)
  if (out.state !== 'left' || out.detail.containersLeft.length > 0) return out
  // The door can answer 502 while the removal it started still finishes (measured 04/10/2026:
  // a WordPress site's DELETE answered 502, the site row, seats and containers were gone a
  // minute later, and the retry answered 403 SEAT_NOT_AUTHORIZED). With no container left, the
  // site table is the last word: no row means the site is gone.
  if (!runId) return out
  const rows = await devExec
    .psqlReadOnly(runId, "select count(*) from site where site_key = :'key'", { key: resource.id })
    .catch(() => null)
  if (rows?.[0]?.[0] !== '0') return out
  return {
    state: 'cleaned',
    detail: { ...out.detail, reconciled: 'door did not confirm; no site row, no container' }
  }
}

/** Accounts have no delete door; the row stays, and the manifest says so (per-run accounts only). */
export async function cleanAccountResource() {
  return { state: 'kept-no-door', detail: { reason: 'tracy-web has no door that deletes an account' } }
}

export const CLEANERS = { site: cleanSiteResource, account: cleanAccountResource }

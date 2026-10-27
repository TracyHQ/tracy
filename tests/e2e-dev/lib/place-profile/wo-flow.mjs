// Website Opportunities inside Tracy, through the doors its screens call (`/api/website-opportunities/*`, the
// API reference `apps/tracy-web/src/api-reference/routes/website-opportunities.js`): Find → save → research →
// place profile → Build demo → the demo's chat → its site. Every site a build makes is written into the manifest
// (kind `site`, owner the run account) as soon as its key is known, so the run's cleanup deletes it.

import { randomUUID } from 'node:crypto'
import { ENV } from '../env.mjs'
import { Blocked } from '../journey.mjs'

const BASE = '/api/website-opportunities'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const requestId = () => `e2e-${randomUUID()}`

/** Areas the journeys search in: busy enough that every trade below has places. */
export const AREAS = Object.freeze({
  lisbon: Object.freeze({ query: 'Lisbon', lat: 38.7223, lon: -9.1393, radiusM: 3000 }),
  hanoi: Object.freeze({ query: 'Hanoi', lat: 21.0278, lon: 105.8342, radiusM: 3000 })
})

/**
 * Find places of a trade and save the first one `pick` accepts as an opportunity.
 * @param {import('../api.mjs').Client} owner
 * @param {{ area: { query: string, lat: number, lon: number, radiusM: number }, trade: string,
 *   pick?: (candidate: any) => boolean }} want
 */
export async function findAndSave(owner, { area, trade, pick = () => true }) {
  const found = await owner.post(`${BASE}/search`, { ...area, intent: 'area', trade }, { timeoutMs: 120_000 })
  if (found.status !== 200)
    throw new Blocked(`Find answered ${found.status} ${found.json?.code ?? ''}`, 'provider')
  const candidate = (found.json?.candidates ?? []).find((c) => !c.chain && pick(c))
  if (!candidate) throw new Blocked(`Find returned no ${trade} place in ${area.query}`, 'provider')
  const saved = await owner.post(BASE, { candidate })
  if (saved.status !== 200 && saved.status !== 201)
    throw new Error(`saving the opportunity answered ${saved.status} ${saved.json?.code ?? ''}`)
  return { candidate, opportunity: saved.json.opportunity, provider: found.json.provider }
}

/**
 * Research the opportunity and wait for its jobs to settle.
 * @param {import('../api.mjs').Client} owner
 * @param {string} id
 */
export async function research(owner, id, capMs = 12 * 60_000) {
  const started = await owner.post(`${BASE}/${id}/research`, { requestId: requestId() })
  if (started.status !== 202)
    throw new Error(`research answered ${started.status} ${started.json?.code ?? ''}`)
  const t0 = Date.now()
  while (Date.now() - t0 < capMs) {
    const read = await owner.get(`${BASE}/${id}`)
    const jobs = read.json?.jobs ?? []
    if (jobs.length && jobs.every((j) => !['queued', 'running', 'pending'].includes(j.state ?? j.status)))
      return { ms: Date.now() - t0, jobs: jobs.map((j) => j.state ?? j.status) }
    await sleep(10_000)
  }
  throw new Blocked(`research of ${id} did not settle in ${capMs / 60_000} min`, 'provider')
}

/** The place profile door (T5b). */
export async function readPlaceProfile(owner, id) {
  const res = await owner.get(`${BASE}/${id}/place-profile`)
  if (res.status !== 200) throw new Error(`place-profile answered ${res.status} ${res.json?.code ?? ''}`)
  return res.json.profile
}

/**
 * Build a demo and follow it to its site: accept → the action's chat (the seller's AI builds it; opened in the
 * watched browser, which is what sends the brief) → a terminal state.
 * @param {{ owner: import('../api.mjs').Client, manifest: any, role: any, id: string,
 *   selection: { cms: string, quickstart?: string, design?: string }, capMs?: number }} b
 */
export async function buildDemo({ owner, manifest, role, id, selection, capMs = 30 * 60_000 }) {
  const accepted = await owner.post(`${BASE}/${id}/demo/build`, {
    requestId: requestId(),
    workflow: 'agent-demo/1',
    selection
  })
  if (accepted.status === 429) throw new Blocked(`demo build daily limit: ${accepted.json?.code}`, 'quota')
  if (accepted.status !== 202)
    throw new Error(`demo build answered ${accepted.status} ${accepted.json?.code ?? ''}`)
  let action = accepted.json.actions[0]
  const t0 = Date.now()
  const seen = [action.state]
  let chatOpened = false
  while (Date.now() - t0 < capMs) {
    const res = await owner.get(`${BASE}/demo/actions/${action.id}`)
    action = res.json?.action ?? action
    if (seen.at(-1) !== action.state) seen.push(action.state)
    const siteKey = action.chat?.siteKey ?? null
    if (siteKey && !manifest.read().resources.some((r) => r.kind === 'site' && r.id === siteKey)) {
      manifest.intend('site', siteKey, { label: siteKey.split('.')[0], owner: owner.email, wo: action.id })
      manifest.mark('site', siteKey, 'created', { wo: 'demo' })
    }
    if (action.chat?.href && !chatOpened) {
      chatOpened = true
      await role.goto(`${ENV.origin}${action.chat.href}?wo-demo-chat=${encodeURIComponent(action.id)}`, {
        settleMs: 15_000
      })
    }
    if (['completed', 'failed', 'needs-review'].includes(action.state)) break
    await sleep(10_000)
  }
  return { action, seen, ms: Date.now() - t0, siteKey: action.chat?.siteKey ?? null }
}

/**
 * Handover: one press gives a Website Opportunities demo to the business it was made for. Not the agent hand-off
 * (`handoff.js`, the demo's agent gets its prompt): this one hands the SITE to the business owner, through doors Tracy
 * already has, each step idempotent and reported, so a press that stopped half way is pressed again:
 *
 *   team_invite  the owner's email joins the site's Team (`POST /api/team/invite`) as an Editor, the highest role an
 *                invitation can carry. Already on the Team, or invited and not answered yet: skipped, no second letter.
 *   owner_role   the seat promoted to Owner (`PATCH /api/sites/:key/seats/:grant`). 🔒 ADR 0028: Owners are never invited,
 *                only promoted from the Team table, so a seat still waiting for its invitation's answer is skipped
 *                (`INVITE_PENDING`) and the next press, once they accepted, promotes it.
 *   keep_demo    the demo clock stopped for good (`demo-retention.js keepDemo`), once the owner is on the Team.
 *   domain       only when a domain is asked: the owner's own domain connected through the site address door
 *                (`PUT /api/sites/:key/address`, `kind: "custom"`). Switched off or not served on this deployment:
 *                `not_available`. Nothing else publishes a demo: it is already live at its Tracy address.
 *
 * Every step answers `{step, state: done | skipped | failed | not_available, reason, detail?}`; a failed step is in the
 * answer, never hidden behind the steps that worked. The seat and domain doors are asked as the caller (their session
 * cookie and this deployment's `Origin`), so each keeps its own checks, rate limit, letters, records and refusals.
 */
import { keepDemo } from './demo-retention.js'

export const HANDOVER_STEPS = Object.freeze(['team_invite', 'owner_role', 'keep_demo', 'domain'])
const INVITE_ROLE = 'editor'
/** Codes of the address door that mean this deployment cannot connect a domain at all. */
const DOMAIN_UNAVAILABLE = new Set(['OWN_DOMAIN_DISABLED', 'OWN_DOMAIN_UNAVAILABLE', 'UI_SETTING_UNREADABLE'])

const step = (name, state, reason, detail) => ({
  step: name,
  state,
  reason,
  ...(detail === undefined ? {} : { detail })
})

async function readJson(request, path, init) {
  try {
    const res = await request(path, init)
    const text = await res.text()
    let body = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { ok: res.ok, status: res.status, body }
  } catch {
    return { ok: false, status: 503, body: null }
  }
}

const codeOf = (answer, fallback) =>
  typeof answer.body?.code === 'string' && answer.body.code
    ? answer.body.code
    : `${fallback}_${answer.status}`

/**
 * Run `fn` holding the build's handover lock on its own connection (advisory locks are session-scoped): two presses at
 * once would both find no seat and both invite. A second press while one runs gets `{locked: false}`.
 * @template T @param {import('pg').Pool} pool @param {string} buildId @param {() => Promise<T>} fn
 * @returns {Promise<{locked: false} | {locked: true, value: T}>}
 */
export async function withHandoverLock(pool, buildId, fn) {
  const client = await pool.connect()
  let locked = false
  try {
    const { rows } = await client.query(
      `select pg_try_advisory_lock(hashtext('wo-handover'), hashtext($1)) as got`,
      [buildId]
    )
    locked = rows[0]?.got === true
    if (!locked) return { locked: false }
    return { locked: true, value: await fn() }
  } finally {
    if (locked)
      await client
        .query(`select pg_advisory_unlock(hashtext('wo-handover'), hashtext($1))`, [buildId])
        .catch(() => {})
    client.release()
  }
}

/**
 * One handover press. `build` is the caller's own build with a live site; `email` the owner's, lower case; `domain`
 * the domain to connect, or null.
 * @param {{pool: import('pg').Pool, request: (path: string, init?: RequestInit) => Promise<Response>, origin: string,
 *   cookie: string, build: Record<string, any>, email: string, domain: string | null, now: () => number}} input
 * @returns {Promise<{steps: ReturnType<typeof step>[], complete: boolean}>}
 */
export async function handOverDemo({ pool, request, origin, cookie, build, email, domain, now }) {
  const siteKey = build.site_key
  const headers = { cookie, origin }
  const writeHeaders = { ...headers, 'content-type': 'application/json' }

  /** The owner's seat on the site as the Team door lists it, `null` when they have none, or a read refusal. */
  async function seatOf() {
    const team = await readJson(request, '/api/team', { headers })
    if (!team.ok || !Array.isArray(team.body?.sites)) return { error: codeOf(team, 'TEAM_UNREADABLE') }
    const site = team.body.sites.find((s) => s?.siteKey === siteKey)
    if (!site || !Array.isArray(site.seats)) return { error: 'NOT_ON_SITE_TEAM' }
    const seat = site.seats.find(
      (s) =>
        typeof s?.email === 'string' &&
        s.email.toLowerCase() === email &&
        (s.status === 'active' || s.status === 'invited')
    )
    return { seat: seat ?? null }
  }

  const steps = []

  // ── team_invite ───────────────────────────────────────────────────────────────────────────────
  const before = await seatOf()
  if (before.error) steps.push(step('team_invite', 'failed', before.error))
  else if (before.seat?.status === 'active') steps.push(step('team_invite', 'skipped', 'ALREADY_ON_TEAM'))
  else if (before.seat) steps.push(step('team_invite', 'skipped', 'INVITE_PENDING'))
  else {
    const sent = await readJson(request, '/api/team/invite', {
      method: 'POST',
      headers: writeHeaders,
      body: JSON.stringify({ emails: [email], role: INVITE_ROLE, siteKeys: [siteKey] })
    })
    const result = sent.ok && Array.isArray(sent.body?.results) ? sent.body.results[0] : null
    const outcome = result?.sites?.find((s) => s?.siteKey === siteKey) ?? null
    if (!sent.ok || !outcome) steps.push(step('team_invite', 'failed', codeOf(sent, 'INVITE_FAILED')))
    else if (outcome.outcome === 'invited' || outcome.outcome === 'approved')
      steps.push(
        step('team_invite', 'done', outcome.outcome === 'approved' ? 'JOIN_REQUEST_APPROVED' : 'INVITED', {
          role: INVITE_ROLE,
          notified: result.notified === true
        })
      )
    else if (outcome.outcome === 'already_granted')
      steps.push(step('team_invite', 'skipped', 'ALREADY_ON_TEAM'))
    else steps.push(step('team_invite', 'failed', outcome.code ?? 'INVITE_REFUSED'))
  }
  const invited = steps[0].state !== 'failed'

  // ── owner_role ────────────────────────────────────────────────────────────────────────────────
  if (!invited) steps.push(step('owner_role', 'skipped', 'INVITE_FAILED'))
  else {
    const after = await seatOf()
    if (after.error) steps.push(step('owner_role', 'failed', after.error))
    else if (!after.seat) steps.push(step('owner_role', 'failed', 'SEAT_NOT_FOUND'))
    else if (after.seat.role === 'owner') steps.push(step('owner_role', 'skipped', 'ALREADY_OWNER'))
    else if (after.seat.status !== 'active') steps.push(step('owner_role', 'skipped', 'INVITE_PENDING'))
    else {
      const promoted = await readJson(
        request,
        `/api/sites/${encodeURIComponent(siteKey)}/seats/${encodeURIComponent(after.seat.id)}`,
        { method: 'PATCH', headers: writeHeaders, body: JSON.stringify({ role: 'owner' }) }
      )
      steps.push(
        promoted.ok && promoted.body?.role === 'owner'
          ? step('owner_role', 'done', 'PROMOTED', { role: 'owner' })
          : step('owner_role', 'failed', codeOf(promoted, 'PROMOTE_FAILED'))
      )
    }
  }

  // ── keep_demo ─────────────────────────────────────────────────────────────────────────────────
  let kept = false
  if (!invited) steps.push(step('keep_demo', 'skipped', 'INVITE_FAILED'))
  else {
    const result = await keepDemo(pool, build.id, { now: now() }).catch(() => null)
    if (!result) steps.push(step('keep_demo', 'failed', 'KEEP_FAILED'))
    else if (result.state === 'gone') steps.push(step('keep_demo', 'failed', 'DEMO_DELETED'))
    else {
      kept = true
      steps.push(
        step(
          'keep_demo',
          result.state === 'kept' ? 'done' : 'skipped',
          result.state === 'kept' ? 'KEPT' : 'ALREADY_KEPT'
        )
      )
    }
  }

  // ── domain ────────────────────────────────────────────────────────────────────────────────────
  if (!domain) steps.push(step('domain', 'skipped', 'NOT_ASKED'))
  else if (!kept) steps.push(step('domain', 'skipped', 'DEMO_NOT_KEPT'))
  else {
    const set = await readJson(request, `/api/sites/${encodeURIComponent(siteKey)}/address`, {
      method: 'PUT',
      headers: writeHeaders,
      body: JSON.stringify({ name: domain, kind: 'custom' })
    })
    const code = set.body?.code
    if (set.ok && set.body?.state === 'active' && !set.body?.pending)
      steps.push(step('domain', 'skipped', 'ALREADY_CONNECTED', set.body))
    else if (set.ok)
      steps.push(step('domain', 'done', set.body?.connected ? 'CONNECTED' : 'DNS_PENDING', set.body))
    else if (DOMAIN_UNAVAILABLE.has(code)) steps.push(step('domain', 'not_available', code))
    else steps.push(step('domain', 'failed', codeOf(set, 'DOMAIN_FAILED'), set.body ?? undefined))
  }

  const settled = (name, ...reasons) => {
    const s = steps.find((x) => x.step === name)
    return s.state === 'done' || (s.state === 'skipped' && reasons.includes(s.reason))
  }
  const complete =
    settled('owner_role', 'ALREADY_OWNER') &&
    settled('keep_demo', 'ALREADY_KEPT') &&
    (!domain || settled('domain', 'ALREADY_CONNECTED'))
  return { steps, complete }
}

import { sha256Hex } from './hmac.js'

const EXCLUDED = new Set(['18', '19', '35'])
const PLAN_NAMES = {
  10: 'JA Template',
  14: 'JA Starter',
  6: 'JoomlArt One',
  12: 'JA Extensions',
  30: 'Premium Ticket Support',
  8: 'JomSocial Pro',
  13: 'JA Developer Legacy',
  3: 'iJ Guru Pro',
  28: 'Developer',
  45: 'S5 Pro (Joomla)',
  2: 'iJ AdAgency Pro',
  31: 'Moderator',
  20: 'GK Joomla 6 months legacy',
  24: 'JA Builder Premium',
  23: 'JA Builder Pro',
  7: 'JomSocial Standard'
}

export const normalizeEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
export const validEmail = (value) =>
  typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
export const vietnamDay = (time = Date.now()) => new Date(time + 7 * 3600_000).toISOString().slice(0, 10)
export const validDay = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value

/** Unknown shapes are service failures, never a negative membership decision. */
export function parseAccess(body, day) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return { status: 'error', reason: 'INVALID_RESPONSE' }
  if (body.error || String(body.message ?? '').startsWith('API Error')) {
    const code = /^API Error (1000[123])/.exec(String(body.message ?? ''))?.[1]
    return { status: 'error', reason: code ? `API_CONFIGURATION_${code}` : 'API_CONFIGURATION' }
  }
  if (body.ok === false && body.code === -1 && body.msg === 'Failure')
    return { status: 'waitlist', plans: [] }
  if (body.ok !== true) return { status: 'error', reason: 'INVALID_RESPONSE' }
  const subscriptions = body.subscriptions
  if (Array.isArray(subscriptions))
    return subscriptions.length === 0
      ? { status: 'waitlist', plans: [] }
      : { status: 'error', reason: 'INVALID_RESPONSE' }
  if (!subscriptions || typeof subscriptions !== 'object')
    return { status: 'error', reason: 'INVALID_RESPONSE' }
  const plans = []
  for (const [id, until] of Object.entries(subscriptions)) {
    if (!/^\d+$/.test(id) || !validDay(until)) return { status: 'error', reason: 'INVALID_RESPONSE' }
    if (!EXCLUDED.has(id) && until >= day) plans.push({ id, name: PLAN_NAMES[id] ?? `plan #${id}`, until })
  }
  return {
    status: plans.length ? 'allow' : 'waitlist',
    userId: Number.isSafeInteger(body.user_id) ? body.user_id : null,
    plans
  }
}

/** A deadline also bounds a test/client that fails to honour AbortSignal. */
export async function withDeadline(fn, ms) {
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      fn(controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('TIMEOUT'))
        }, ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function createBetaAccess({
  config,
  pool = null,
  identity,
  pendingInvites = async () => [],
  fetchImpl = fetch,
  now = Date.now,
  log = console
}) {
  const cache = new Map()
  const inflight = new Map()
  const gate = config.beta?.enabled === true
  const admission = (badge, plans = [], userId = null) => ({
    status: 'allow',
    badge,
    plans,
    userId,
    checkedAt: new Date(now()).toISOString(),
    gate
  })

  async function membership(email) {
    const hash = await sha256Hex(email)
    let cached = cache.get(hash)
    if (pool) {
      const row = (
        await pool.query('select result, expires_at from beta_access_cache where email_hash = $1', [hash])
      ).rows[0]
      if (row) cached = { result: row.result, expiresAt: row.expires_at.getTime() }
    }
    // Read the memory cache again after the awaits above: a request for the same address can start
    // and finish while this one waited on its database read, and its answer is already here (it is
    // set before the database write, and `inflight` is cleared after it). Without this second look
    // the stale read sends a second call to the membership API (12/10/2026: 2 calls for 10
    // concurrent sign-ins on a loaded CI runner).
    const fresh = cache.get(hash)
    if (fresh && !(cached?.expiresAt > fresh.expiresAt)) cached = fresh
    if (cached?.expiresAt > now()) {
      const plans = (cached.result.plans ?? []).filter((plan) => plan.until >= vietnamDay(now()))
      return { ...cached.result, plans, status: plans.length ? 'allow' : 'waitlist' }
    }
    if (inflight.has(hash)) return inflight.get(hash)
    const request = (async () => {
      let result
      try {
        result = await withDeadline(async (signal) => {
          const url = new URL(config.beta.apiUrl)
          url.searchParams.set('email', email)
          url.searchParams.set('_key', config.beta.apiKey)
          const response = await fetchImpl(url, {
            headers: { 'user-agent': 'tracy-web/1.0 (+https://tracy.ai)' },
            signal,
            redirect: 'error'
          })
          if (response.status !== 200) return { status: 'error', reason: `HTTP_${response.status}` }
          return parseAccess(await response.json().catch(() => null), vietnamDay(now()))
        }, 3000)
      } catch (error) {
        result = { status: 'error', reason: error?.message === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK' }
      }
      if (result.status !== 'error') {
        const expiresAt = now() + 10 * 60_000
        cache.set(hash, { result, expiresAt })
        if (pool)
          await pool.query(
            `insert into beta_access_cache (email_hash, result, expires_at) values ($1, $2, $3)
           on conflict (email_hash) do update set result = excluded.result, expires_at = excluded.expires_at`,
            [hash, result, new Date(expiresAt)]
          )
      }
      return result
    })().finally(() => inflight.delete(hash))
    inflight.set(hash, request)
    return request
  }

  /**
   * With the gate off nobody is refused, but `/ops` still wants to know who holds a JoomlArt plan
   * (sarahxbt, 19/10/2026: after the gate opened on 15/10 every email and Google sign-in read
   * "gate off" with no plans). The same cached membership call labels the admission and never
   * decides it: a member is "JoomlArt member" with their plans, anyone else, and any failure or
   * timeout, stays "gate off" and is let in. `lookup: 'failed'` marks an answer nobody got, so a
   * later count can tell "no plan" from "not known".
   */
  async function label(email) {
    if (!config.beta?.apiKey) return admission('gate off')
    const result = await membership(email).catch(() => ({ status: 'error' }))
    if (result.status === 'allow') return admission('JoomlArt member', result.plans, result.userId)
    return result.status === 'error' ? { ...admission('gate off'), lookup: 'failed' } : admission('gate off')
  }

  return {
    enabled: gate,
    async decide(raw, { provider, subject } = {}) {
      const email = normalizeEmail(raw)
      if (!validEmail(email)) return { status: 'error', reason: 'INVALID_EMAIL' }
      if (!gate) return label(email)
      // A linked provider keeps its established account even when its reported email changes.
      const linked = provider && subject ? await identity.accountForIdentity?.(provider, subject) : null
      const account = linked ?? (await identity.accountByEmail?.(email))
      if (account?.lastSeenAt) return { ...admission('existing account'), email: account.email }
      if ((await pendingInvites(email)).length) return admission('seat invite')
      const result = await membership(email)
      if (result.status === 'allow') return admission('JoomlArt member', result.plans, result.userId)
      if (result.status !== 'error') return { ...result, gate }
      const logger = result.reason.startsWith('API_CONFIGURATION') ? (log.error ?? log.warn) : log.warn
      logger.call(log, `[beta] aMember unavailable: ${result.reason}`)
      const hash = await sha256Hex(email)
      if (pool && (await pool.query('select 1 from beta_fallback where email_hash = $1', [hash])).rowCount)
        return admission('fallback list')
      return { status: 'unavailable', reason: result.reason, plans: [], gate }
    }
  }
}

import { randomUUID } from 'node:crypto'

// #85: safe Codex quota reset credits. Host-only: the browser never sees
// account ids, bearer tokens, credit ids or idempotency keys. A single-flight
// challenge carries a 5s cooldown plus an explicit acknowledgement, so a
// double click or concurrent call can never consume two credits.

const RESET_URL = 'https://chatgpt.com/backend-api/wham/rate-limit-reset-credits'
const CONSUME_URL = RESET_URL + '/consume'
const CONFIRM_DELAY_MS = 5000
const CHALLENGE_TTL_MS = 60000
const TIMEOUT_MS = 15000
const UNCERTAIN = 'reset result is uncertain; re-run the confirmation to check the same request'

function record(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function expirationOf(v) {
  if (v == null) return undefined
  if (Number.isSafeInteger(v) && v > 0) return v * 1000
  if (typeof v === 'string' && v.length > 0 && v.length <= 64) {
    const p = Date.parse(v)
    if (Number.isFinite(p) && p > 0) return p
  }
  throw new Error('malformed reset expiry')
}

export function parseDetails(raw, now) {
  if (!record(raw) || !Number.isSafeInteger(raw.available_count) || raw.available_count < 0 || !Array.isArray(raw.credits)) {
    throw new Error('malformed reset details')
  }
  if (raw.available_count === 0) throw new Error('no reset available')
  const nowMs = Number(now) || 0
  const available = raw.credits
    .filter((c) => record(c) && typeof c.id === 'string' && c.id.length > 0 && c.id.length <= 256 && String(c.status || '').toLowerCase() === 'available')
    .map((c) => ({ c, expiresAt: expirationOf(c.expires_at) }))
    .filter((row) => row.expiresAt === undefined || row.expiresAt > nowMs)
    .sort((a, b) => (a.expiresAt === undefined ? Number.MAX_SAFE_INTEGER : a.expiresAt) - (b.expiresAt === undefined ? Number.MAX_SAFE_INTEGER : b.expiresAt))
  if (!available.length) throw new Error('no usable reset credit')
  const first = available[0]
  return {
    availableCount: raw.available_count,
    creditId: first.c.id,
    title: typeof first.c.title === 'string' ? first.c.title.slice(0, 240) : undefined,
    description: typeof first.c.description === 'string' ? first.c.description.slice(0, 240) : undefined,
    creditExpiresAt: first.expiresAt,
  }
}

export function parseConsumeResult(raw) {
  if (!record(raw) || !['reset', 'nothing_to_reset', 'no_credit', 'already_redeemed'].includes(raw.code)) {
    throw new Error('unreadable reset response')
  }
  const windowsReset = Array.isArray(raw.windows_reset)
    ? raw.windows_reset.filter((x) => typeof x === 'string').slice(0, 16)
    : []
  const count = Number.isSafeInteger(raw.windows_reset) && raw.windows_reset >= 0 && raw.windows_reset <= 16
    ? raw.windows_reset
    : undefined
  return { code: raw.code, windowsReset, ...(count === undefined ? {} : { windowsResetCount: count }) }
}

export function createResetCreditService({ loadBlob, fetchImpl, now = Date.now, randomId = randomUUID }) {
  const challenges = new Map()

  function pruneChallenges(nowMs = now()) {
    for (const [id, ch] of challenges.entries()) {
      if (nowMs > ch.expiresAt) {
        challenges.delete(id)
      }
    }
  }

  async function readDetails(ref) {
    const blob = await loadBlob(ref)
    const access = blob && blob.accessToken
    const accountId = blob && blob.accountId
    if (!access || !accountId) throw new Error('codex account is not signed in')
    const res = await (fetchImpl || fetch)(RESET_URL, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + access,
        'chatgpt-account-id': accountId,
        Accept: 'application/json',
        'cache-control': 'no-store',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(res.status === 401 || res.status === 403
        ? 'codex sign-in needs renewal'
        : 'reset request failed (HTTP ' + res.status + ')')
    }
    let raw
    try { raw = await res.json() } catch { throw new Error('unreadable reset details') }
    return { accountId, details: parseDetails(raw, now()) }
  }

  return {
    async inspect(ref) {
      const { details } = await readDetails(ref)
      return {
        availableCount: details.availableCount,
        ...(details.creditExpiresAt === undefined ? {} : { nextExpiresAt: details.creditExpiresAt }),
      }
    },

    async prepare(ref) {
      const { accountId, details } = await readDetails(ref)
      const preparedAt = now()
      pruneChallenges(preparedAt)
      const readyAt = preparedAt + CONFIRM_DELAY_MS
      const expiresAt = Math.min(preparedAt + CHALLENGE_TTL_MS, details.creditExpiresAt === undefined ? Number.MAX_SAFE_INTEGER : details.creditExpiresAt)
      if (expiresAt <= readyAt) throw new Error('the available reset expires too soon')
      const challengeId = randomId()
      challenges.set(challengeId, {
        state: 'prepared',
        ref,
        accountId,
        creditId: details.creditId,
        redeemRequestId: randomId(),
        readyAt,
        expiresAt,
        availableCount: details.availableCount,
        creditExpiresAt: details.creditExpiresAt,
        title: details.title,
        description: details.description,
        uncertain: false,
      })
      return {
        challengeId,
        availableCount: details.availableCount,
        readyAt,
        expiresAt,
        ...(details.creditExpiresAt === undefined ? {} : { creditExpiresAt: details.creditExpiresAt }),
        ...(details.title ? { title: details.title } : {}),
        ...(details.description ? { description: details.description } : {}),
      }
    },

    async consume({ challengeId, acknowledged } = {}) {
      const challenge = typeof challengeId === 'string' ? challenges.get(challengeId) : undefined
      if (!challenge) throw new Error('this reset confirmation is no longer valid')
      if (challenge.state === 'pending') throw new Error('this reset is already in progress')
      if (now() < challenge.readyAt) throw new Error('wait before confirming this reset')
      if (now() > challenge.expiresAt) {
        challenges.delete(challengeId)
        throw new Error('this reset confirmation is no longer valid')
      }
      if (acknowledged !== true) throw new Error('acknowledge that one reset attempt will be consumed')
      // Synchronous gate before the first await: rapid clicks and concurrent
      // calls can never create more than one provider POST.
      challenge.state = 'pending'
      let retryable = challenge.uncertain === true
      try {
        const blob = await loadBlob(challenge.ref)
        const access = blob && blob.accessToken
        const accountId = blob && blob.accountId
        if (!access || !accountId) { retryable = false; throw new Error('codex account is not signed in') }
        if (accountId !== challenge.accountId) { retryable = false; throw new Error('the signed-in account changed') }
        let res
        try {
          res = await (fetchImpl || fetch)(CONSUME_URL, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + access,
              'chatgpt-account-id': accountId,
              Accept: 'application/json',
              'content-type': 'application/json',
              'cache-control': 'no-store',
            },
            body: JSON.stringify({
              redeem_request_id: challenge.redeemRequestId,
              credit_id: challenge.creditId,
            }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
          })
        } catch { retryable = true; throw new Error(UNCERTAIN) }
        if (!res.ok) {
          if (res.status >= 500) { retryable = true; throw new Error(UNCERTAIN) }
          throw new Error(res.status === 401 || res.status === 403
            ? 'codex sign-in needs renewal'
            : 'reset request failed (HTTP ' + res.status + ')')
        }
        let raw
        try { raw = await res.json() } catch { retryable = true; throw new Error(UNCERTAIN) }
        let result
        try { result = parseConsumeResult(raw) } catch { retryable = true; throw new Error(UNCERTAIN) }
        retryable = false
        return result
      } finally {
        if (retryable && now() <= challenge.expiresAt) {
          challenge.state = 'prepared'
          challenge.uncertain = true
        } else {
          challenges.delete(challengeId)
        }
      }
    },
  }
}

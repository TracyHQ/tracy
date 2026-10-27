// #350: Self-healing & Warm-up probe before returning from quarantine.
export const REASON_RATE_LIMIT = 'RATE_LIMIT'
export const REASON_HARD_LIMIT = 'HARD_LIMIT'
export const REASON_REVOKED = 'TOKEN_REVOKED'
export const REASON_MANUAL_PARK = 'MANUAL_PARK'

export const STATUS_ACTIVE = 'active'
export const STATUS_QUARANTINE = 'quarantine'
export const STATUS_PROBING = 'probing'

export function quarantineDuration(reason) {
  switch (reason) {
    case REASON_HARD_LIMIT:
      return 24 * 60 * 60 * 1000 // 24 hours
    case REASON_REVOKED:
      return 7 * 24 * 60 * 60 * 1000 // 7 days (requires re-auth)
    case REASON_MANUAL_PARK:
      return 60 * 60 * 1000 // 1 hour (manual park)
    case REASON_RATE_LIMIT:
    default:
      return 60 * 60 * 1000 // 1 hour
  }
}

export function putInQuarantine(account, reason, nowMs = Date.now()) {
  const duration = quarantineDuration(reason)
  return {
    ...account,
    quarantineReason: reason,
    quarantineUntil: nowMs + duration,
    status: STATUS_QUARANTINE,
  }
}

export function isQuarantined(account, nowMs = Date.now()) {
  if (!account) return false
  if (account.status === STATUS_PROBING) return true
  if (!account.quarantineUntil) return false
  return Number(account.quarantineUntil) > Number(nowMs)
}

/**
 * Checks whether an account has expired its quarantine period and needs a warm-up probe.
 */
export function needsWarmupProbe(account, nowMs = Date.now()) {
  if (!account) return false
  const until = Number(account.quarantineUntil) || 0
  if (until === 0) return false
  return until <= Number(nowMs) && (account.status === STATUS_QUARANTINE || account.status === STATUS_PROBING)
}

/**
 * Transitions account to probing state for warm-up.
 */
export function enterProbing(account) {
  return {
    ...account,
    status: STATUS_PROBING,
  }
}

/**
 * Restores an account back to active service after a successful warm-up probe.
 */
export function resolveWarmupSuccess(account, nowMs = Date.now()) {
  return {
    ...account,
    status: STATUS_ACTIVE,
    quarantineUntil: 0,
    quarantineReason: null,
    quarantineAttempts: 0,
    probePassedAt: nowMs,
  }
}

/**
 * Extends quarantine with exponential backoff if warmup probe failed.
 */
export function resolveWarmupFailure(account, reason, nowMs = Date.now()) {
  const baseDuration = quarantineDuration(reason || account?.quarantineReason || REASON_RATE_LIMIT)
  const attempts = Math.min((Number(account?.quarantineAttempts) || 1) * 2, 8)
  const extendedDuration = Math.min(baseDuration * attempts, 48 * 60 * 60 * 1000) // max 48h
  return {
    ...account,
    status: STATUS_QUARANTINE,
    quarantineReason: reason || account?.quarantineReason || REASON_RATE_LIMIT,
    quarantineUntil: nowMs + extendedDuration,
    quarantineAttempts: attempts,
    probeFailedAt: nowMs,
  }
}

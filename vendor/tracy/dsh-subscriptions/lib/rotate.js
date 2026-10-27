import { computePacingRisk, calculateBurnRatePerHour, calculateBurnUrgency } from "./forecast.js"
import { isQuarantined } from './quarantine.js'
import { getPinnedAccountRef, pinSession } from './session-pin.js'

const SWITCH_CODES = new Set([
  'RATE_LIMIT',
  'QUOTA',
  'QUOTA_EXCEEDED',
  'LICENSE_REQUIRED',
])

export function isRegionError(err) {
  if (!err || typeof err !== 'object') return false
  const status = Number(err.status || err.statusCode) || 0
  const msg = String(err.message || '')
  return status === 400 && (/FAILED_PRECONDITION/i.test(msg) || /User location is not supported/i.test(msg))
}

export function isSwitchableError(err) {
  if (!err || typeof err !== 'object') return false
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR' || err.code === 'ERR_ABORTED' || (err.message && /aborted/i.test(err.message))) return false
  const code = err.code || (err.failure && err.failure.code)
  if (SWITCH_CODES.has(code)) return true
  if (isRegionError(err)) return true
  const status = err.status || err.statusCode
  return status === 401 || status === 403 || status === 429 || status === 500 || status === 502 || status === 503
}

export function modelFamily(provider, model) {
  const id = String(model || '')
  if (provider === 'claude') return /thinking/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'grok') return /reasoning/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'codex') return 'reasoning'
  return 'standard'
}

export function cooldownBlocks(acc, family) {
  const fams = acc && acc.cooldownFamilies
  if (!Array.isArray(fams) || !fams.length) return true
  if (!family) return true
  return fams.includes(family)
}


export function getAccountRemainingPercent(acc) {
  if (!acc) return null
  if (acc.quota?.remainingPercent != null) {
    const val = Number(acc.quota.remainingPercent)
    return Number.isFinite(val) ? val : null
  }
  if (acc.quota?.usedPercent != null) {
    const val = 100 - Number(acc.quota.usedPercent)
    return Number.isFinite(val) ? val : null
  }
  if (acc.usagePercent != null) {
    const val = 100 - Number(acc.usagePercent)
    return Number.isFinite(val) ? val : null
  }
  if (acc.quota?.remaining != null && acc.quota?.limit != null && Number(acc.quota.limit) > 0) {
    const val = (Number(acc.quota.remaining) / Number(acc.quota.limit)) * 100
    return Number.isFinite(val) ? val : null
  }
  return null
}

export function pickAccount(accounts, nowMs, opts) {
  const list = Array.isArray(accounts) ? accounts : []
  const now = Number(nowMs) || 0
  const thrRaw = opts && opts.switchAtRemaining != null ? Number(opts.switchAtRemaining) : 0
  const thr = Number.isFinite(thrRaw) ? thrRaw : 0
  const isVipRequest = Boolean(opts && opts.vip)
  const targetTag = opts && opts.tag
  const targetSession = opts && opts.sessionId

  function isQuotaExhausted(acc) {
    if (!thr || thr <= 0) return false
    const q = acc.quota
    if (!q) return false
    if (q.resetAt && Number(q.resetAt) <= now) return false
    if (q.remaining == null) return false
    if (q.resetAt && Number(q.resetAt) - now < 60000) return true
    let below = false
    if (q.limit != null && q.limit > 0 && thr > 0 && thr < 1) {
      const frac = q.remaining / q.limit
      below = frac <= thr
    } else {
      below = q.remaining <= thr
    }
    return below
  }

  function isUsageExhausted(acc) {
    if (acc.usagePercent == null || Number(acc.usagePercent) < 100) return false
    const q = acc.quota
    if (q && q.resetAt && Number(q.resetAt) <= now) return false
    return true
  }

  // Sticky Session Pinning (#170)
  if (targetSession) {
    const pinnedRef = getPinnedAccountRef(targetSession)
    if (pinnedRef) {
      const pinned = list.find((a) => (a.ref || a.id) === pinnedRef)
      if (pinned && pinned.hasToken && !isQuarantined(pinned, now)) {
        const isCooldown = pinned.cooldownUntil && Number(pinned.cooldownUntil) > now && cooldownBlocks(pinned, opts && opts.family)
        const isPinnedZero = Boolean(pinned.quota && (
          (pinned.quota.remaining != null && Number(pinned.quota.remaining) <= 0) ||
          (pinned.quota.remainingPercent != null && Number(pinned.quota.remainingPercent) <= 0)
        ) && (!pinned.quota.resetAt || Number(pinned.quota.resetAt) > now))
        if (!isCooldown && !isPinnedZero && !isQuotaExhausted(pinned) && !isUsageExhausted(pinned)) {
          return pinned
        }
      }
    }
  }

  // 3-Tier priority:
  // Tier 0: Has known quota & healthy
  // Tier 1: Quota unknown (null) & healthy
  // Tier 2: Cooldown, quarantine or exhausted
  const tiers = [[], [], []]

  for (const acc of list) {
    if (!acc || !acc.hasToken) continue

    if (!opts || opts.autoPacing !== false) {
      if (acc.pacingRisk === undefined) {
        const rem = acc.quota?.remainingPercent ?? (acc.quota?.usedPercent != null ? (100 - Number(acc.quota.usedPercent)) : (acc.usagePercent != null ? (100 - Number(acc.usagePercent)) : null))
        const pace = acc.pacePerHour || (Array.isArray(acc.samples) ? calculateBurnRatePerHour(acc.samples, now) : 0)
        const resetAt = acc.quota?.resetAt || 0
        const riskInfo = computePacingRisk(rem, pace, resetAt, now)
        acc.pacingRisk = riskInfo.pacingRisk
      }
    }

    if (opts && opts.drainBeforeReset) {
      if (acc.burnUrgency === undefined) {
        const rem = getAccountRemainingPercent(acc)
        const resetAt = acc.quota?.resetAt || 0
        const safetyFloor = opts.drainSafetyPercent != null ? Number(opts.drainSafetyPercent) : 5
        acc.burnUrgency = calculateBurnUrgency(rem, resetAt, now, safetyFloor)
      }
    }

    // VIP Slot Reservation (#175)
    if (acc.vipOnly && !isVipRequest) continue

    // Tag-based filtering (#173)
    if (targetTag && Array.isArray(acc.tags) && !acc.tags.includes(targetTag)) continue

    const isCooldown = acc.cooldownUntil && Number(acc.cooldownUntil) > now && cooldownBlocks(acc, opts && opts.family)
    const inQuarantine = isQuarantined(acc, now)
    const isHardExhausted = (acc.usagePercent != null && Number(acc.usagePercent) >= 100 && (!acc.quota || !acc.quota.resetAt || Number(acc.quota.resetAt) > now))
    const isZeroQuota = Boolean(acc.quota && (
      (acc.quota.remaining != null && Number(acc.quota.remaining) <= 0) ||
      (acc.quota.remainingPercent != null && Number(acc.quota.remainingPercent) <= 0)
    ) && (!acc.quota.resetAt || Number(acc.quota.resetAt) > now))

    if (isCooldown || inQuarantine || isHardExhausted || isZeroQuota) {
      continue
    }

    const softExhausted = isQuotaExhausted(acc) || isUsageExhausted(acc)
    if (softExhausted) {
      tiers[2].push(acc)
      continue
    }

    if (!acc.quota) tiers[1].push(acc)
    else tiers[0].push(acc)
  }

  for (const tier of tiers) {
    if (tier.length) {
      tier.sort((a, b) => {
        // #485: Smart Quota Drainer - prioritize higher burn urgency first
        if (opts && opts.drainBeforeReset) {
          const aUrg = Number(a.burnUrgency) || 0
          const bUrg = Number(b.burnUrgency) || 0
          if (Math.abs(aUrg - bUrg) > 0.01) {
            return bUrg - aUrg
          }
        }

        // 0. Auto-Pacing: lower pacing risk preferred (#352)
        const aRisk = Number(a.pacingRisk) || 0
        const bRisk = Number(b.pacingRisk) || 0
        if (Math.abs(aRisk - bRisk) >= 20) return aRisk - bRisk

        // 1. Least Remaining Window (#167)
        if (a.quota && b.quota && a.quota.resetAt && b.quota.resetAt) {
          const aReset = Number(a.quota.resetAt)
          const bReset = Number(b.quota.resetAt)
          if (Math.abs(aReset - bReset) > 300000) {
            return aReset - bReset
          }
        }

        // 2. Weighted Round Robin: Pro/Team weight (#171)
        const aWeight = a.weight || (a.isPro ? 5 : 1)
        const bWeight = b.weight || (b.isPro ? 5 : 1)
        if (aWeight !== bWeight) return bWeight - aWeight

        // 3. Health Score
        return (b.healthScore ?? 100) - (a.healthScore ?? 100)
      })

      const chosen = tier[0]
      if (targetSession && chosen) {
        pinSession(targetSession, chosen.ref || chosen.id)
      }
      return chosen
    }
  }

  return null
}

export function markCooldown(account, nowMs, cooldownMs, family) {
  const wait = Number(cooldownMs)
  const ms = Number.isFinite(wait) && wait > 0 ? wait : 30 * 60 * 1000
  const prev = Array.isArray(account.cooldownFamilies) ? account.cooldownFamilies.slice() : []
  const fams = family ? (prev.includes(family) ? prev : prev.concat(family)) : prev
  return {
    ...account,
    cooldownUntil: (Number(nowMs) || 0) + ms,
    ...(fams.length ? { cooldownFamilies: fams } : {}),
  }
}

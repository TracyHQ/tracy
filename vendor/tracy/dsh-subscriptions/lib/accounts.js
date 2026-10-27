import { calculateBurnRatePerHour } from "./forecast.js"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function resolveQuarantineFilePath() {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(base, 'subscriptions', 'quarantines.json')
}

function loadQuarantinesFromFile(map) {
  try {
    const p = resolveQuarantineFilePath()
    const content = readFileSync(p, 'utf8')
    const json = JSON.parse(content)
    if (json && typeof json === 'object') {
      for (const [k, v] of Object.entries(json)) {
        if (v && typeof v === 'object' && v.until) {
          map.set(k, v)
        }
      }
    }
  } catch { /* best-effort */ }
}

function saveQuarantinesToFile(map) {
  try {
    const p = resolveQuarantineFilePath()
    mkdirSync(join(p, '..'), { recursive: true })
    const obj = {}
    for (const [k, v] of map.entries()) {
      if (v && typeof v === 'object' && v.until) {
        obj[k] = v
      }
    }
    writeFileSync(p, JSON.stringify(obj), 'utf8')
  } catch { /* best-effort */ }
}

const sharedQuarantines = new Map()
loadQuarantinesFromFile(sharedQuarantines)

import { needsWarmupProbe, enterProbing, resolveWarmupSuccess, resolveWarmupFailure, STATUS_QUARANTINE, STATUS_PROBING } from "./quarantine.js"
import { fetchWithTimeout, isTimeoutError } from "./http.js"
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { oauthRef, isProvider, parseOauthRef } from './refs.js'
import { vendorAllowed } from './ui-options.js'
import { parseBlob, serializeBlob } from './blob.js'
import { recordSwitch, recordExhaust, recordBroken, computeHealthScore, healthBadge } from './health.js'
import { executeWithRetry } from './backoff.js'
import { getVendor } from './vendors/index.js'

const SKEW_MS = 60 * 1000
const USAGE_TTL_MS = 2 * 60 * 1000

export function normalizeSlots(slots) {
  const out = []
  const seen = new Set()
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slot || typeof slot !== 'object') continue
    if (!isProvider(slot.provider)) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    const ref = oauthRef(slot.provider, index)
    if (seen.has(ref)) continue
    seen.add(ref)
    out.push({
      ...slot,
      provider: slot.provider,
      index,
      label: String(slot.label || ''),
      ref,
      ...(slot.proxyUrl ? { proxyUrl: String(slot.proxyUrl) } : {}),
      ...(slot.expiresAt ? { expiresAt: Number(slot.expiresAt) } : {}),
    })
  }
  return out
}

export function vendorConfig(provider, cfg) {
  const d = getVendor(provider).defaults()
  const pick = (suffix, fallback) => {
    const value = cfg && cfg[`${provider}${suffix}`]
    if (value == null || String(value).trim() === '') return fallback
    return String(value).trim()
  }
  const modelsKey = `${provider}Models`
  return {
    clientId: pick('ClientId', d.clientId),
    clientSecret: pick('ClientSecret', d.clientSecret || ''),
    redirectUri: pick('RedirectUri', d.redirectUri),
    baseUrl: pick('BaseUrl', d.baseUrl || ''),
    originator: pick('Originator', d.originator || ''),
    systemPrefix: pick('SystemPrefix', d.systemPrefix || ''),
    clientVersion: pick('ClientVersion', d.clientVersion || ''),
    // #93/#92: per-vendor request shaping (codex only consumes these today).
    verbosity: pick('Verbosity', ''),
    fastMode: !!(cfg && cfg[`${provider}FastMode`]),
    models: Array.isArray(cfg && cfg[modelsKey]) && cfg[modelsKey].length
      ? cfg[modelsKey]
      : (d.models || []),
  }
}

export function createAccountStore({ credentials, getConfig, fetchImpl, fetchForRef, onLimitNotice }) {
  const cooldowns = new Map()
  const quotas = new Map()
  const quotaSamples = new Map()
  const quarantines = sharedQuarantines
  const writeQueues = new Map()
  const credentialVersions = new Map()
  const clearedRefs = new Set()
  const latestBlobs = new Map()
  const refreshLocks = new Map()
  const refreshFailures = new Map()
  const usage = new Map()
  const notifyThresholds = new Map()
  const health = new Map()
  const requestCounts = new Map()
  const windows = new Map()
  const usageFetched = new Map()
  const doFetch = fetchImpl || fetch
  // #88: per-account proxy fetch for token refresh / usage (falls back to doFetch).
  const rawFetchFor = (ref) => (typeof fetchForRef === 'function' && fetchForRef(ref)) || doFetch
  const fetchFor = (ref, defaultTimeoutMs = 25000) => (url, init, opts) => fetchWithTimeout(rawFetchFor(ref), url, init, { timeoutMs: defaultTimeoutMs, ...(opts || {}) })

  async function resolveRaw(ref) {
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      return resolved && resolved.value ? String(resolved.value) : ''
    } catch {
      return ''
    }
  }

  async function loadBlob(ref) {
    const raw = await resolveRaw(ref)
    if (!raw) {
      const err = /** @type {Error & { code?: string }} */ (new Error(`no token for ${ref}`))
      err.code = 'AUTH'
      throw err
    }
    return parseBlob(raw)
  }

  async function saveBlob(ref, blob) {
    if (!ref || typeof ref !== "string") throw new Error("invalid ref for saveBlob")
    // Last line of the vendor allowlist: no door may store a NEW credential for a vendor
    // this host does not allow. A credential stored before the vendor was dropped keeps
    // saving its refreshed token; otherwise a rotated refresh token would be lost.
    const owner = parseOauthRef(ref)
    if (owner && !vendorAllowed(typeof getConfig === "function" ? getConfig() : null, owner.provider)
      && !latestBlobs.has(ref) && !(await resolveRaw(ref))) {
      const refused = /** @type {Error & { code?: string }} */ (new Error(`vendor ${owner.provider} is not allowed on this host`))
      refused.code = "VENDOR_NOT_ALLOWED"
      throw refused
    }
    clearedRefs.delete(ref)
    latestBlobs.set(ref, blob)
    const version = (credentialVersions.get(ref) || 0) + 1
    credentialVersions.set(ref, version)

    const prev = writeQueues.get(ref) || Promise.resolve()
    const next = prev.catch(() => {}).then(async () => {
      if (clearedRefs.has(ref) || credentialVersions.get(ref) !== version) {
        return
      }
      try {
        await credentials.set(credentialRef(ref), serializeBlob(blob))
        if (clearedRefs.has(ref)) {
          try { await credentials.unset(credentialRef(ref)) } catch { /* best-effort */ }
        } else if (credentialVersions.get(ref) > version && latestBlobs.has(ref)) {
          try { await credentials.set(credentialRef(ref), serializeBlob(latestBlobs.get(ref))) } catch { /* best-effort */ }
        }
      } catch (err) {
        if (clearedRefs.has(ref) || credentialVersions.get(ref) !== version) {
          return
        }
        const wrapErr = /** @type {Error & { code?: string, cause?: any }} */ (new Error(`failed to persist credentials for ${ref}: ${err && err.message || err}`))
        wrapErr.code = "CREDENTIAL_SAVE_FAILED"
        wrapErr.cause = err
        throw wrapErr
      }
    })
    writeQueues.set(ref, next)
    await next
  }

  async function clearRef(ref) {
    if (!ref || typeof ref !== "string") return
    clearedRefs.add(ref)
    latestBlobs.delete(ref)
    const version = (credentialVersions.get(ref) || 0) + 1
    credentialVersions.set(ref, version)
    try {
      await credentials.unset(credentialRef(ref))
    } catch { /* best-effort unset */ }
    cooldowns.delete(ref)
    quotas.delete(ref)
    quotaSamples.delete(ref)
    quarantines.delete(ref)
    saveQuarantinesToFile(quarantines)
    writeQueues.delete(ref)
    for (const k of [...notifyThresholds.keys()]) { if (k.startsWith(ref + ':')) notifyThresholds.delete(k) }
    refreshFailures.delete(ref)
    usage.delete(ref)
    usageFetched.delete(ref)
    // Counters and health must not outlive the account, otherwise a
    // re-added slot inherits stale rotation statistics.
    requestCounts.delete(ref)
    health.delete(ref)
    windows.delete(ref)
  }

  async function describeRef(ref) {
    const base = { ref, configured: false, writable: true, label: '', email: '' }
    try {
      if (typeof credentials.describe === 'function') {
        const d = await credentials.describe(credentialRef(ref))
        base.configured = !!(d && d.configured)
        base.writable = d && d.writable === false ? false : true
      } else {
        base.configured = !!(await resolveRaw(ref))
      }
    } catch {
      return base
    }
    if (base.configured) {
      try {
        const blob = parseBlob(await resolveRaw(ref))
        base.label = blob.label || blob.email || ''
        base.email = blob.email || ''
        if (Array.isArray(blob.usage)) { base.usage = blob.usage; base.usageAt = blob.usageAt || 0 }
        if (blob.validationUrl) base.validationUrl = blob.validationUrl
        if (blob.validationMessage) base.validationMessage = blob.validationMessage
        if (blob.accountNotice) base.accountNotice = blob.accountNotice
        if (blob.paidTierName) base.paidTierName = blob.paidTierName
      } catch { /* ignore parse */ }
    }
    return {
      ...base,
      cooldownUntil: cooldowns.get(ref) ? cooldowns.get(ref).until : 0,
      quarantineUntil: quarantines.get(ref) ? quarantines.get(ref).until : 0,
      quarantineReason: quarantines.get(ref) ? quarantines.get(ref).reason : null,
      cooldownFamilies: cooldowns.get(ref) && cooldowns.get(ref).families ? cooldowns.get(ref).families : null,
      quota: quotas.get(ref) || null,
      pacePerHour: quotas.get(ref)?.pacePerHour || calculateBurnRatePerHour(quotaSamples.get(ref) || [], Date.now()),
      samples: quotaSamples.get(ref) || [],
      usage: windows.get(ref) || base.usage || null,
      health: health.get(ref) || null,
      healthScore: computeHealthScore(health.get(ref) || null),
      healthBadge: healthBadge(computeHealthScore(health.get(ref) || null)),
      usagePercent: usage.has(ref) ? usage.get(ref) : null,
      refreshError: refreshFailures.get(ref)?.error || '',
      isTimeout: !!refreshFailures.get(ref)?.isTimeout,
      validationUrl: base.validationUrl || '',
      validationMessage: base.validationMessage || '',
      accountNotice: base.accountNotice || '',
      paidTierName: base.paidTierName || '',
    }
  }

  async function listAccounts(provider) {
    const curConfig = getConfig()
    const slots = normalizeSlots(curConfig.slots).filter((s) => s.provider === provider)
    const out = []
    for (const slot of slots) {
      const info = await describeRef(slot.ref)
      const q = quarantines.get(slot.ref)
      out.push({
        ref: slot.ref,
        hasToken: !!info.configured,
        usagePercent: info.usagePercent,
        cooldownUntil: info.cooldownUntil,
        cooldownFamilies: info.cooldownFamilies || null,
        quota: info.quota || null,
        healthScore: computeHealthScore(info.health),
        healthBadge: healthBadge(computeHealthScore(info.health)),
        quarantineUntil: q ? q.until : 0,
        quarantineReason: q ? q.reason : null,
        label: slot.label || info.label,
        pacePerHour: info.pacePerHour || 0,
      })
    }
    return out
  }

  async function loggedInProviders() {
    const curConfig = getConfig()
    const slots = normalizeSlots(curConfig.slots)
    const found = new Set()
    for (const slot of slots) {
      const info = await describeRef(slot.ref)
      if (info.configured) found.add(slot.provider)
    }
    return [...found]
  }

  async function ensureFresh(provider, blob, ref) {
    if (!blob || typeof blob !== 'object') return blob
    if (blob.apiKeyOnly || (blob.apiKey && (!blob.refreshToken || blob.refreshToken === blob.apiKey))) return blob
    if (!blob.refreshToken) return blob
    if (blob.expiresAt && blob.expiresAt - SKEW_MS > Date.now()) return blob
    const lockKey = ref || (provider + ":" + (blob.accountId || blob.email || (blob.refreshToken && blob.refreshToken.slice(-16)) || "anon"))
    if (refreshLocks.has(lockKey)) return refreshLocks.get(lockKey)
    const promise = (async () => {
      try {
        const curConfig = getConfig()
        const cfg = vendorConfig(provider, curConfig)
        const next = await executeWithRetry(
          () => getVendor(provider).refresh(cfg, blob, fetchFor(ref, 30000)),
          {
            maxRetries: 2,
            initialDelayMs: 300,
            maxDelayMs: 2000,
            isRetryable: (err) => {
              const status = Number(err && (err.status || err.statusCode) || 0)
              if (status === 400 || status === 401 || status === 403) return false
              return true
            },
          }
        )
        const merged = {
          ...blob,
          ...next,
          refreshToken: next.refreshToken || blob.refreshToken,
          projectId: next.projectId || blob.projectId,
          accountId: next.accountId || blob.accountId,
        }
        if (ref) await saveBlob(ref, merged)
        if (ref) refreshFailures.delete(ref)
        return merged
      } catch (e) {
        const isTimeout = isTimeoutError(e)
        const errMsg = isTimeout
          ? `Network timeout refreshing token: ${e.message || 'timed out'}`
          : String(e && e.message || e)
        if (ref) refreshFailures.set(ref, { at: Date.now(), error: errMsg, isTimeout })
        throw e
      } finally {
        refreshLocks.delete(lockKey)
      }
    })()
    refreshLocks.set(lockKey, promise)
    return promise
  }

  const providerUsageLocks = new Map()
  const slotUsageLocks = new Map()

  async function refreshUsage(provider) {
    if (providerUsageLocks.has(provider)) {
      return providerUsageLocks.get(provider)
    }
    const flight = (async () => {
      const curConfig = getConfig()
      const cfg = vendorConfig(provider, curConfig)
      const vendor = getVendor(provider)
      const slots = normalizeSlots(curConfig.slots).filter((s) => s.provider === provider)
      for (const slot of slots) {
        if (slotUsageLocks.has(slot.ref)) {
          await slotUsageLocks.get(slot.ref).catch(() => {})
          continue
        }
        const last = usageFetched.get(slot.ref) || 0
        if (Date.now() - last < USAGE_TTL_MS) continue
        let raw = ''
        try { raw = await resolveRaw(slot.ref) } catch { continue }
        if (!raw) continue

        const slotFlight = (async () => {
          try {
            usageFetched.set(slot.ref, Date.now())
            const blob = await ensureFresh(provider, parseBlob(raw), slot.ref)
            const usageTimeout = Number(curConfig?.usageTimeoutMs) || 15000
            const snap = await vendor.usage(blob, cfg, fetchFor(slot.ref, usageTimeout))
            if (!snap) return
            if (Number.isFinite(Number(snap.usedPercent))) {
              usage.set(slot.ref, Number(snap.usedPercent))
            }
            // Notification thresholds: 70/90/100% — fire once per window until reset.
            if (Array.isArray(snap.windows)) {
              for (const win of snap.windows) {
                if (!win || !Number.isFinite(Number(win.usedPercent))) continue
                const pct = Number(win.usedPercent)
                const key = slot.ref + ':' + win.id
                const prev = notifyThresholds.get(key) || 0
                const THRESHOLDS = [70, 90, 100]
                for (const th of THRESHOLDS) {
                  if (pct >= th && prev < th) {
                    notifyThresholds.set(key, th)
                    try { onLimitNotice && onLimitNotice(slot.provider, slot.ref, win, th) } catch { /* ignore notification failure */ }
                    break
                  }
                }
              }
            }
            const list = Array.isArray(snap.windows) ? snap.windows : null
            if (list) {
              windows.set(slot.ref, list)
              // persist last known windows so the card survives restarts
              try {
                if (clearedRefs.has(slot.ref)) return
                let currentBlob = null
                try {
                  const currentRaw = await resolveRaw(slot.ref)
                  if (currentRaw) currentBlob = parseBlob(currentRaw)
                } catch { /* best-effort */ }
                if (!currentBlob || clearedRefs.has(slot.ref)) return
                if (latestBlobs.has(slot.ref)) {
                  currentBlob = { ...currentBlob, ...latestBlobs.get(slot.ref) }
                }
                const prev = Array.isArray(currentBlob.usage) ? JSON.stringify(currentBlob.usage) : ''
                if (prev !== JSON.stringify(list)) {
                  await saveBlob(slot.ref, { ...currentBlob, usage: list, usageAt: Date.now() })
                } else if (!currentBlob.usageAt) {
                  await saveBlob(slot.ref, { ...currentBlob, usageAt: Date.now() })
                }
              } catch { /* persistence best-effort */ }
            }
          } catch (err) {
            usageFetched.set(slot.ref, Date.now())
            const isTimeout = isTimeoutError(err)
            if (isTimeout && !refreshFailures.has(slot.ref)) {
              refreshFailures.set(slot.ref, { at: Date.now(), error: `Network timeout fetching usage: ${err.message || 'timed out'}`, isTimeout: true })
            }
          } finally {
            slotUsageLocks.delete(slot.ref)
          }
        })()

        slotUsageLocks.set(slot.ref, slotFlight)
        await slotFlight.catch(() => {})
      }
    })().finally(() => {
      providerUsageLocks.delete(provider)
    })

    providerUsageLocks.set(provider, flight)
    return flight
  }

  return {
    loadBlob,
    saveBlob,
    clearRef,
    describeRef,
    listAccounts,
    loggedInProviders,
    resolveRaw,
    ensureFresh,
    refreshUsage,
    // #87: family-scoped cooldowns. families=null blocks the whole account
    // (legacy behavior); a list blocks only those model families.
    rememberCooldown(ref, until, families) {
      if (!families || !families.length) { cooldowns.set(ref, { until: Number(until) || 0, families: null }); return }
      const prev = cooldowns.get(ref)
      const merged = new Set(families)
      if (prev && Array.isArray(prev.families)) for (const f of prev.families) merged.add(f)
      cooldowns.set(ref, { until: Math.max(Number(until) || 0, prev ? prev.until : 0), families: Array.from(merged) })
    },
    rememberQuota(ref, snap) {
      if (snap) {
        const prevSnap = quotas.get(ref)
        quotas.set(ref, snap)
        if (snap.usedPercent != null) {
          const now = snap.measuredAt || Date.now()
          let samples = (quotaSamples.get(ref) || []).slice()
          const remainingPercent = snap.remainingPercent ?? (100 - Number(snap.usedPercent))
          const lastSample = samples[samples.length - 1]

          const prevReset = prevSnap?.resetAt ?? lastSample?.resetAt ?? null
          const currReset = snap.resetAt ?? null
          const resetChanged = (prevReset !== null && currReset !== null && Math.abs(Number(prevReset) - Number(currReset)) > 300) ||
                               (prevSnap !== undefined && (prevReset === null) !== (currReset === null))
          const increased = lastSample !== undefined && remainingPercent > lastSample.pct + 0.5

          if (resetChanged || increased) {
            samples = []
          }

          samples.push({ at: now, pct: remainingPercent, resetAt: currReset })
          while (samples.length > 20) samples.shift()
          quotaSamples.set(ref, samples)
          snap.samples = [...samples]
          snap.pacePerHour = calculateBurnRatePerHour(samples, now)
        }
      } else {
        quotas.delete(ref)
        quotaSamples.delete(ref)
      }
    },
    shouldSkipRefresh(ref, now, retryMs) { const f = refreshFailures.get(ref); if (!f) return false; return (Number(f.at) + Number(retryMs)) > Number(now) },
    getQuota(ref) { return quotas.get(ref) || null },
    rememberUsage(ref, percent) { usage.set(ref, percent) },
    getHealth(ref) { return health.get(ref) || null },
    setHealth(ref, h) { health.set(ref, h) },
    recordSwitch(ref) { health.set(ref, recordSwitch(health.get(ref))) },
    recordExhaust(ref) { health.set(ref, recordExhaust(health.get(ref))) },
    recordBroken(ref) { health.set(ref, recordBroken(health.get(ref))) },
    recordSuccess(ref) {
      // successful request clears the cooldown and puts the account back in rotation
      cooldowns.delete(ref)
      quarantines.delete(ref)
      saveQuarantinesToFile(quarantines)
      if (health.has(ref)) health.set(ref, null)
    },
    rememberQuarantine(ref, reason, until, attempts) {
      if (!ref) return
      const existing = quarantines.get(ref)
      const finalAttempts = attempts !== undefined ? Number(attempts) : (existing?.attempts ? existing.attempts + 1 : 1)
      quarantines.set(ref, {
        reason: reason || existing?.reason || 'RATE_LIMIT',
        until: Number(until) || existing?.until || (Date.now() + 3600000),
        attempts: Number(finalAttempts) || 1,
        status: STATUS_QUARANTINE,
      })
      saveQuarantinesToFile(quarantines)
    },
    getQuarantine(ref, now = Date.now()) {
      const q = quarantines.get(ref)
      if (!q) return null
      if (Number(q.until) <= Number(now)) {
        if (q.status === STATUS_PROBING) return q
        return null
      }
      return q
    },
    async probeWarmup(ref, probeFn, force = false) {
      const q = quarantines.get(ref)
      if (!q) return { success: true }
      const acc = { quarantineReason: q.reason, quarantineUntil: q.until, quarantineAttempts: q.attempts || 1, status: q.status }
      if (!force && !needsWarmupProbe(acc)) {
        return { success: false, reason: 'NOT_EXPIRED' }
      }
      quarantines.set(ref, enterProbing(acc))
      saveQuarantinesToFile(quarantines)
      try {
        if (typeof probeFn === 'function') {
          await probeFn(ref)
        }
        resolveWarmupSuccess(acc)
        quarantines.delete(ref)
        saveQuarantinesToFile(quarantines)
        return { success: true }
      } catch (err) {
        const updated = resolveWarmupFailure(acc, err?.message || q.reason)
        quarantines.set(ref, {
          reason: updated.quarantineReason,
          until: updated.quarantineUntil,
          attempts: updated.quarantineAttempts,
          status: updated.status,
        })
        saveQuarantinesToFile(quarantines)
        return { success: false, account: updated, error: err }
      }
    },
    releaseQuarantine(ref) {
      quarantines.delete(ref)
      saveQuarantinesToFile(quarantines)
    },
    rememberRequest(ref) { requestCounts.set(ref, (requestCounts.get(ref) || 0) + 1) },
    getRequestCount(ref) { return requestCounts.get(ref) || 0 },
  }
}
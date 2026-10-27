import { readFileSync } from 'node:fs'

let pkgVersion = ''
try {
  pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || ''
} catch {
  // ignore package read errors
}

// #351: Proactive Quota Alerts & Webhook Dispatcher
// Manages quota threshold warnings, session expiry notifications,
// and webhook dispatch (e.g. Telegram/Discord or external monitoring).

const MAX_ALERTS = 100
const DEDUP_WINDOW_MS = 10 * 60 * 1000 // 10 minutes cooldown per (ref + type)

const alertBuffer = []
const lastAlertTime = new Map()

export function clearAlerts() {
  alertBuffer.length = 0
  lastAlertTime.clear()
}

/**
 * Records an alert into the in-memory buffer with deduplication.
 * @returns {object|null} the created alert, or null if deduped
 */
export function recordAlert({ type, ref, provider, message, severity = 'warn', details = null, nowMs = Date.now() }) {
  const dedupKey = `${type}:${ref || provider}`
  const prev = lastAlertTime.get(dedupKey) || 0
  if (nowMs - prev < DEDUP_WINDOW_MS) {
    return null // Deduplicate to avoid alert floods
  }
  lastAlertTime.set(dedupKey, nowMs)

  const alert = {
    id: `alt_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    ref: ref || null,
    provider: provider || 'unknown',
    message: String(message || ''),
    severity,
    details,
    timestamp: nowMs,
  }

  alertBuffer.push(alert)
  if (alertBuffer.length > MAX_ALERTS) {
    alertBuffer.shift()
  }
  return alert
}

/**
 * Returns recent alerts from the in-memory buffer.
 */
export function getRecentAlerts(limit = 50) {
  return alertBuffer.slice(-Math.max(1, Math.min(limit, MAX_ALERTS))).reverse()
}

/**
 * Dispatches an alert asynchronously to an external webhookUrl if provided.
 */
export async function dispatchWebhookAlert(alert, webhookUrl, fetchImpl = fetch) {
  if (!alert || !webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return false
  }

  const payload = {
    event: 'subscription_alert',
    alert,
    source: 'dsh-subscriptions',
    sentAt: new Date().toISOString(),
  }

  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': pkgVersion ? `dsh-subscriptions/${pkgVersion}` : 'dsh-subscriptions',
      },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    // Non-blocking fire-and-forget
    return false
  }
}

/**
 * Evaluates used percent against configured thresholds and fires alerts if triggered.
 */
export function checkQuotaThresholds({
  ref,
  provider,
  usedPercent,
  thresholds = [80, 90, 95],
  webhookUrl = '',
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const pct = Number(usedPercent) || 0
  if (pct <= 0) return null

  // Find the highest threshold that was exceeded
  const sorted = [...thresholds].sort((a, b) => b - a)
  const matchedThreshold = sorted.find((th) => pct >= th)
  if (!matchedThreshold) return null

  const severity = pct >= 95 ? 'error' : 'warn'
  const message = `[Quota Alert] ${provider || 'Account'} (${ref || 'slot'}) has reached ${Math.round(pct)}% used (threshold: ${matchedThreshold}%)`

  const alert = recordAlert({
    type: 'quota_threshold',
    ref,
    provider,
    message,
    severity,
    details: { usedPercent: pct, threshold: matchedThreshold },
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * Fires an alert when a session token expires or is revoked.
 */
export function notifySessionExpired({
  ref,
  provider,
  message,
  webhookUrl = '',
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const alert = recordAlert({
    type: 'token_expired',
    ref,
    provider,
    message: message || `Session for ${provider || 'account'} (${ref || 'slot'}) has expired and requires re-authentication.`,
    severity: 'error',
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * #509 & #510: Fires an alert when an account enters quarantine.
 */
export function notifyQuarantineEntered({
  ref,
  provider,
  reason,
  until,
  webhookUrl = "",
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const untilIso = until ? new Date(until).toISOString() : ""
  const alert = recordAlert({
    type: "quarantine_entered",
    ref,
    provider,
    message: "Account " + (provider || "slot") + " (" + (ref || "") + ") entered quarantine (" + (reason || "RATE_LIMIT") + ")" + (untilIso ? " until " + untilIso : ""),
    severity: "warn",
    details: { reason, until },
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * #509 & #510: Fires an alert when an account is released from quarantine.
 */
export function notifyQuarantineReleased({
  ref,
  provider,
  message,
  webhookUrl = "",
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const alert = recordAlert({
    type: "quarantine_released",
    ref,
    provider,
    message: message || ("Account " + (provider || "slot") + " (" + (ref || "") + ") released from quarantine and is active"),
    severity: "info",
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

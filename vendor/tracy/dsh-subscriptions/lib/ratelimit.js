// ponytail: per-provider header/body maps, add keys when new vendor differs
export function numberOrNull(v) {
  if (v == null || String(v).trim() === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function resetAtFromValue(raw, now) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  // ISO date?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : null
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  // if looks like epoch seconds (>1e9) -> ms
  if (n > 1e9) {
    // epoch seconds or ms? if >1e12 already ms
    return n > 1e12 ? n : n * 1000
  }
  // otherwise seconds-from-now (Retry-After)
  if (n >= 0 && n < 7 * 24 * 3600) return now + n * 1000
  return null
}

function getHeader(headers, name) {
  if (!headers) return null
  const want = name.toLowerCase()
  // Headers instance
  if (typeof headers.get === "function") {
    // try direct, then lowercase
    let v = headers.get(name)
    if (v != null) return v
    // Headers are case-insensitive, but some impls need lower
    v = headers.get(want)
    if (v != null) return v
    // iterate
    if (typeof headers.forEach === "function") {
      let found = null
      headers.forEach((val, key) => {
        if (String(key).toLowerCase() === want) found = val
      })
      return found
    }
    return null
  }
  // plain object
  if (typeof headers === "object") {
    for (const [k, v] of Object.entries(headers)) {
      if (String(k).toLowerCase() === want) return v
    }
    // also handle array of pairs
    if (Array.isArray(headers)) {
      for (const [k,v] of headers) if (String(k).toLowerCase()===want) return v
    }
  }
  return null
}

const HEADER_REMAINING = [
  "x-ratelimit-remaining",
  "x-ratelimit-remaining-requests",
  "x-ratelimit-remaining-tokens",
  "ratelimit-remaining",
  "x-ratelimit-remaining-minute",
]
const HEADER_LIMIT = [
  "x-ratelimit-limit",
  "x-ratelimit-limit-requests",
  "x-ratelimit-limit-tokens",
  "ratelimit-limit",
]
const HEADER_RESET = [
  "x-ratelimit-reset",
  "x-ratelimit-reset-requests",
  "x-ratelimit-reset-tokens",
  "ratelimit-reset",
  "retry-after",
  "x-retry-after",
  "x-ratelimit-reset-minute",
]

// per-provider body field tables — add provider key to extend without touching parser
export const PROVIDER_BODY_FIELDS = {
  codex: {
    remaining: ["remaining", "remaining_requests", "rate_limit_remaining", "quota_remaining", "requests_remaining"],
    limit: ["limit", "limit_requests", "quota_limit", "rate_limit", "max_requests"],
    reset: ["reset", "reset_at", "resetAt", "reset_time", "retry_after", "reset_after"],
  },
  claude: {
    remaining: ["remaining", "remaining_requests", "rate_limit_remaining"],
    limit: ["limit", "quota", "rate_limit"],
    reset: ["reset", "reset_at", "retry_after"],
  },
  grok: {
    remaining: ["remaining", "creditRemaining", "remainingCredits"],
    limit: ["limit", "monthlyLimit", "creditLimit"],
    reset: ["reset", "resetAt", "retry_after"],
  },
  antigravity: {
    remaining: ["remaining", "quotaRemaining"],
    limit: ["limit", "quotaLimit"],
    reset: ["reset", "resetAt", "retry_after"],
  },
  _common: {
    remaining: ["remaining", "remaining_requests", "requests_remaining", "quota_remaining", "rate_limit_remaining", "rateLimitRemaining", "creditRemaining"],
    limit: ["limit", "limit_requests", "quota_limit", "rate_limit", "rateLimit", "creditLimit", "monthlyLimit"],
    reset: ["reset", "reset_at", "resetAt", "reset_time", "retry_after", "retryAfter", "reset_after", "rateLimitReset"],
  },
}

function pickBodyField(obj, keys) {
  if (!obj || typeof obj !== "object") return null
  for (const k of keys) {
    if (k in obj) {
      const v = obj[k]
      if (v != null && String(v) !== "") return v
    }
    // case-insensitive fallback
    const low = k.toLowerCase()
    for (const [ok, ov] of Object.entries(obj)) {
      if (String(ok).toLowerCase() === low && ov != null && String(ov) !== "") return ov
    }
  }
  return null
}

function deepest(obj, keys, depth=0) {
  if (!obj || typeof obj !== "object" || depth>4) return null
  const direct = pickBodyField(obj, keys)
  if (direct != null) return direct
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = deepest(v, keys, depth+1)
      if (found != null) return found
    }
  }
  return null
}

export function parseHeaders(headers, nowMs = Date.now()) {
  let remaining = null, limit = null, resetAt = null
  for (const h of HEADER_REMAINING) {
    const v = getHeader(headers, h)
    const n = numberOrNull(v)
    if (n != null) { remaining = n; break }
  }
  for (const h of HEADER_LIMIT) {
    const v = getHeader(headers, h)
    const n = numberOrNull(v)
    if (n != null) { limit = n; break }
  }
  for (const h of HEADER_RESET) {
    const v = getHeader(headers, h)
    if (v != null && String(v) !== "") {
      const t = resetAtFromValue(v, nowMs)
      if (t != null) { resetAt = t; break }
      const n = numberOrNull(v)
      if (n != null) { resetAt = n > 1e9 ? (n>1e12?n:n*1000) : nowMs + n*1000; break }
    }
  }
  if (remaining==null && limit==null && resetAt==null) return null
  return { remaining, limit, resetAt }
}

export function parseBody(provider, json, nowMs = Date.now()) {
  if (!json || typeof json !== "object") return null
  const table = PROVIDER_BODY_FIELDS[provider] || PROVIDER_BODY_FIELDS._common
  const common = PROVIDER_BODY_FIELDS._common
  const rk = [...(table.remaining||[]), ...common.remaining]
  const lk = [...(table.limit||[]), ...common.limit]
  const sk = [...(table.reset||[]), ...common.reset]
  const rawRem = deepest(json, [...new Set(rk)])
  const rawLim = deepest(json, [...new Set(lk)])
  const rawReset = deepest(json, [...new Set(sk)])
  const remaining = numberOrNull(rawRem)
  const limit = numberOrNull(rawLim)
  let resetAt = null
  if (rawReset != null) resetAt = resetAtFromValue(rawReset, nowMs)
  if (remaining==null && limit==null && resetAt==null) return null
  return { remaining, limit, resetAt }
}

export function mergeQuota(headerPart, bodyPart) {
  if (!headerPart && !bodyPart) return null
  const remaining = headerPart?.remaining ?? bodyPart?.remaining ?? null
  const limit = headerPart?.limit ?? bodyPart?.limit ?? null
  const resetAt = headerPart?.resetAt ?? bodyPart?.resetAt ?? null
  if (remaining==null && limit==null && resetAt==null) return null
  return { remaining, limit, resetAt }
}

export function quotaSnapshot(provider, headers, bodyJson, nowMs = Date.now()) {
  const h = parseHeaders(headers, nowMs)
  const b = bodyJson ? parseBody(provider, bodyJson, nowMs) : null
  const merged = mergeQuota(h, b)
  if (!merged) return null
  const { remaining, limit, resetAt } = merged
  let usedPercent = null
  if (remaining!=null && limit!=null && limit>0) {
    usedPercent = ((limit - remaining) / limit) * 100
    if (usedPercent < 0) usedPercent = 0
    if (usedPercent > 100) usedPercent = 100
  }
  return { remaining, limit, resetAt: resetAt ?? null, usedPercent, measuredAt: nowMs }
}


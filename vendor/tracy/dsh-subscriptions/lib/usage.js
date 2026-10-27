export function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function windowPercent(obj, key) {
  if (!obj || typeof obj !== 'object') return null
  if (key === 'extra_usage' || (obj.monthly_limit != null && obj.used_credits != null)) return null
  return numberOrNull(
    obj.utilization ?? obj.used_percent ?? obj.usedPercent ?? obj.creditUsagePercent ?? obj.used_percentage,
  )
}

export function deepestUsedPercent(obj) {
  let max = null
  function walk(value, key, depth) {
    if (!value || typeof value !== 'object' || depth > 8) return
    const here = windowPercent(value, key)
    if (here != null) max = max == null ? here : Math.max(max, here)
    const remaining = numberOrNull(value.remainingFraction)
    if (remaining != null) {
      const used = (1 - remaining) * 100
      max = max == null ? used : Math.max(max, used)
    }
    const usedFrac = numberOrNull(value.usedFraction)
    if (usedFrac != null) {
      const used = usedFrac * 100
      max = max == null ? used : Math.max(max, used)
    }
    for (const [k, child] of Object.entries(value)) {
      if (child && typeof child === 'object') walk(child, k, depth + 1)
    }
  }
  walk(obj, '', 0)
  return max
}

export function grokBillingPercent(json) {
  const cfg = json && json.config && typeof json.config === 'object' ? json.config : json
  const ready = numberOrNull(cfg && cfg.creditUsagePercent)
  if (ready != null) return ready
  const limit = numberOrNull(cfg && (cfg.monthlyLimit ?? cfg.limit))
  const used = numberOrNull(cfg && (cfg.used ?? cfg.usedCredits))
  if (limit && limit > 0 && used != null) return (used / limit) * 100
  return deepestUsedPercent(json)
}

export function asUsageSnapshot(percent) {
  const usedPercent = numberOrNull(percent)
  if (usedPercent == null) return null
  return { usedPercent }
}

export function parseResetAt(val) {
  if (val == null) return null
  if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
    return val < 1e11 ? Math.round(val * 1000) : Math.round(val)
  }
  if (typeof val === 'string' && val.trim()) {
    const s = val.trim()
    const n = Number(s)
    if (Number.isFinite(n) && n > 0) {
      return n < 1e11 ? Math.round(n * 1000) : Math.round(n)
    }
    const parsed = Date.parse(s)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

// Named limit windows reported by vendors (five_hour, seven_day, primary...).
// Label map is a data table: extend it when a vendor adds a window name.
const WINDOW_LABELS = {
  five_hour: { zh: "5小时", en: "5h" },
  seven_day: { zh: "7天", en: "7d" },
  seven_day_oauth_apps: { zh: "7天应用", en: "7d apps" },
  weekly_limit_7_days: { zh: "7天", en: "7d" },
  primary: { zh: "主配额", en: "primary" },
  secondary: { zh: "次配额", en: "secondary" },
  // codex: the vendor API returns primary_window/secondary_window - surfaced as 5h/7d in the UI
  primary_window: { zh: "5小时", en: "5h" },
  secondary_window: { zh: "7天", en: "7d" },
  monthly: { zh: "月度", en: "month" },
  credits: { zh: "点数", en: "credits" },
  extra_usage: { zh: "额外用量", en: "extra" },
}

export function windowLabel(id) {
  const known = WINDOW_LABELS[id]
  return known || { zh: id, en: id }
}

function resolveWindowId(value, key) {
  if (value && typeof value === 'object') {
    const semantic = value.modelId ?? value.model ?? value.window ?? value.name ?? value.id ?? value.scope
    if (typeof semantic === 'string' && semantic.trim() && !/^\d+$/.test(semantic.trim())) {
      return { id: semantic.trim(), isModelBucket: Boolean(value.modelId || value.model) }
    }
  }
  if (typeof key === 'string' && key.trim() && !/^\d+$/.test(key.trim())) {
    return { id: key.trim(), isModelBucket: false }
  }
  return null
}

// Walk vendor usage JSON; every node carrying a utilization-style number
// becomes a named window keyed by its semantic identifier or JSON key.
export function usageWindows(obj) {
  const out = []
  const seen = new Set()
  function walk(value, key, depth) {
    if (!value || typeof value !== 'object' || depth > 6) return
    const resolved = resolveWindowId(value, key)
    if (resolved && !seen.has(resolved.id)) {
      const pct = numberOrNull(
        value.utilization ?? value.used_percent ?? value.usedPercent ?? value.creditUsagePercent ?? value.used_percentage,
      )
      const frac = numberOrNull(value.remainingFraction)
      const ufrac = numberOrNull(value.usedFraction)
      let usedPercent = null
      if (pct != null) usedPercent = pct
      else if (frac != null) usedPercent = (1 - frac) * 100
      else if (ufrac != null) usedPercent = ufrac * 100

      if (usedPercent != null) {
        seen.add(resolved.id)
        const label = windowLabel(resolved.id)
        const rawReset = value.resetAt ?? value.reset_at ?? value.resetTime ?? value.resets_at ?? value.resetsAt ?? value.reset_time
        const resetAt = parseResetAt(rawReset)
        out.push({
          id: resolved.id,
          zh: label.zh,
          en: label.en,
          usedPercent,
          ...(resetAt ? { resetAt } : {}),
          isModelBucket: resolved.isModelBucket,
        })
      }
    }
    for (const [k, child] of Object.entries(value)) {
      if (child && typeof child === 'object') walk(child, k, depth + 1)
    }
  }
  walk(obj, '', 0)

  // Separate model buckets from standard named windows
  const standardWindows = out.filter((w) => !w.isModelBucket)
  const modelBuckets = out.filter((w) => w.isModelBucket)

  let keptModelBuckets = []
  if (modelBuckets.length) {
    // Only surface model buckets when usage > 0, keeping the tightest 1-2
    const active = modelBuckets.filter((w) => w.usedPercent > 0)
    if (active.length) {
      active.sort((a, b) => b.usedPercent - a.usedPercent)
      keptModelBuckets = active.slice(0, 2)
    }
  }

  const result = [...standardWindows, ...keptModelBuckets].map(({ isModelBucket: _, ...rest }) => rest)
  return result.length ? result : null
}

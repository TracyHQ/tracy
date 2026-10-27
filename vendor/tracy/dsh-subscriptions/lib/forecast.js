// #84: predictive runway forecast from a sliding window of usage samples.
// Port of the reference approach (WSL043 quota-forecast): track remaining
// percent samples per window key, estimate pace with a recency-weighted
// least-squares slope, convert to a runway estimate.

const HOUR_MS = 60 * 60 * 1000
const HISTORY_MS = 24 * HOUR_MS
const MIN_SPAN_MS = 30 * 60 * 1000
const MIN_CONSUMED = 1
const MAX_SAMPLES = 192

const finite = (v) => Number.isFinite(Number(v))

export function observeForecast(state, key, remainingPercent, resetsAt, now) {
  const windows = Object.assign({}, (state && state.windows) || {})
  const pct = Math.max(0, Math.min(100, Number(remainingPercent)))
  const reset = finite(resetsAt) ? Number(resetsAt) : null
  const prev = windows[key]
  const resetChanged = prev !== undefined && (
    (prev.resetsAt === null) !== (reset === null) ||
    (prev.resetsAt !== null && reset !== null && Math.abs(prev.resetsAt - reset) > 300)
  )
  const last = prev && prev.samples && prev.samples[prev.samples.length - 1]
  const increased = last !== undefined && pct > last.pct + 0.5
  const samples = resetChanged || increased ? [] : ((prev && prev.samples) || []).slice()
  if (!samples.length || now > samples[samples.length - 1].at && (
    Math.abs(pct - samples[samples.length - 1].pct) >= 0.1 || now - samples[samples.length - 1].at >= 15 * 60 * 1000
  )) {
    samples.push({ at: now, pct })
  }
  const kept = samples.filter((s) => s.at >= now - HISTORY_MS).slice(-MAX_SAMPLES)
  windows[key] = { resetsAt: reset, samples: kept }
  return { windows }
}

export function estimateForecast(state, key, remainingPercent, resetsAt, now) {
  if (!finite(remainingPercent)) return { status: 'idle' }
  const rec = state && state.windows && state.windows[key]
  if (!rec) return { status: 'calibrating' }
  const reset = finite(resetsAt) ? Number(resetsAt) : null
  if ((rec.resetsAt === null) !== (reset === null) ||
      (rec.resetsAt !== null && reset !== null && Math.abs(rec.resetsAt - reset) > 300)) return { status: 'calibrating' }
  const samples = rec.samples.filter((s) => s.at >= now - HISTORY_MS)
  if (samples.length < 3) return { status: 'calibrating', sampleCount: samples.length }
  const first = samples[0]
  const last = samples[samples.length - 1]
  const spanMs = last.at - first.at
  const consumed = Math.max(0, first.pct - last.pct)
  if (spanMs < MIN_SPAN_MS || consumed < MIN_CONSUMED) return { status: 'calibrating', sampleCount: samples.length }
  const t0 = first.at
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const s of samples) {
    const x = (s.at - t0) / HOUR_MS
    const y = first.pct - s.pct
    const w = Math.exp((s.at - last.at) / (6 * HOUR_MS))
    sw += w; sx += w * x; sy += w * y; sxx += w * x * x; sxy += w * x * y
  }
  const den = sw * sxx - sx * sx
  const pace = den > 0 ? (sw * sxy - sx * sy) / den : 0
  if (!Number.isFinite(pace) || pace < 0.02) return { status: 'idle', pacePerHour: 0 }
  const runwayHours = Math.max(0, Math.min(100, Number(remainingPercent))) / pace
  const resetSec = reset === null ? null : Math.max(0, Math.round((reset - now) / 1000))
  return {
    status: 'ready',
    pacePerHour: pace,
    runwayHours,
    runwaySeconds: Math.round(runwayHours * 3600),
    survivesReset: resetSec !== null && runwayHours * 3600 >= resetSec,
    sampleCount: samples.length,
  }
}

// #352: Burn-rate calculation & Pacing risk estimator
export function calculateBurnRatePerHour(samples, now = Date.now()) {
  if (!Array.isArray(samples) || samples.length < 2) return 0
  let recent = samples.filter((s) => s.at >= now - 6 * HOUR_MS)
  if (recent.length < 2) return 0

  let windowStartIdx = 0
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]
    const curr = recent[i]
    const resetChanged = prev.resetAt != null && curr.resetAt != null && Math.abs(Number(prev.resetAt) - Number(curr.resetAt)) > 300
    const increased = curr.pct > prev.pct + 0.5
    if (resetChanged || increased) {
      windowStartIdx = i
    }
  }
  recent = recent.slice(windowStartIdx)
  if (recent.length < 2) return 0

  const first = recent[0]
  const last = recent[recent.length - 1]
  const hours = (last.at - first.at) / HOUR_MS
  if (hours <= 0.05) return 0
  const consumed = Math.max(0, first.pct - last.pct)
  return consumed / hours
}

export function computePacingRisk(remainingPercent, pacePerHour, resetsAt, now = Date.now()) {
  const rem = Number(remainingPercent) || 0
  const pace = Number(pacePerHour) || 0
  if (pace <= 0.02 || rem <= 0) {
    return { pacePerHour: 0, hoursUntilExhaustion: Infinity, survivesReset: true, pacingRisk: 0 }
  }

  const hoursUntilExhaustion = rem / pace
  const reset = Number(resetsAt) || 0
  if (reset > now) {
    const hoursUntilReset = (reset - now) / HOUR_MS
    if (hoursUntilExhaustion < hoursUntilReset) {
      // Risk: will exhaust before reset
      const deficitHours = hoursUntilReset - hoursUntilExhaustion
      const pacingRisk = Math.min(100, Math.round(deficitHours * 25))
      return { pacePerHour: pace, hoursUntilExhaustion, survivesReset: false, pacingRisk }
    } else {
      return { pacePerHour: pace, hoursUntilExhaustion, survivesReset: true, pacingRisk: 0 }
    }
  }

  return {
    pacePerHour: pace,
    hoursUntilExhaustion,
    survivesReset: null,
    pacingRisk: hoursUntilExhaustion < 1 ? 50 : 0,
  }
}

// #485: Smart Quota Drainer urgency calculation
export function calculateBurnUrgency(remainingPercent, resetAt, nowMs = Date.now(), safetyFloor = 5) {
  const rem = Number(remainingPercent)
  if (!Number.isFinite(rem) || rem <= 0) return 0
  const floor = Number(safetyFloor) || 0
  if (rem <= floor) return 0

  const reset = Number(resetAt)
  if (!Number.isFinite(reset) || reset <= nowMs) return 0

  const hoursUntilReset = (reset - nowMs) / HOUR_MS
  // Denominator clamped to minimum 0.05 hours (3 mins) to avoid infinity
  const clampedHours = Math.max(hoursUntilReset, 0.05)
  return rem / clampedHours
}

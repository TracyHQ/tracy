// Per-account health score for smart rotation.
// Numbers mirror dsh-key-rotation pool.js: switch 5, exhaustion 10, bad key 15.
const PENALTY = { switch: 5, exhaust: 10, broken: 15 }

export function emptyHealth() {
  return { switches: 0, exhaustions: 0, broken: 0 }
}

export function recordSwitch(h) {
  const cur = h || emptyHealth()
  return { ...cur, switches: (cur.switches || 0) + 1 }
}

export function recordExhaust(h) {
  const cur = h || emptyHealth()
  return { ...cur, exhaustions: (cur.exhaustions || 0) + 1 }
}

export function recordBroken(h) {
  const cur = h || emptyHealth()
  return { ...cur, broken: (cur.broken || 0) + 1 }
}

export function computeHealthScore(h) {
  const H = h || emptyHealth()
  const score = 100
    - (H.switches || 0) * PENALTY.switch
    - (H.exhaustions || 0) * PENALTY.exhaust
    - (H.broken || 0) * PENALTY.broken
  return Math.max(0, Math.min(100, score))
}

export function healthBadge(score) {
  if (score == null) return 'unknown'
  if (score >= 80) return 'healthy'
  if (score >= 50) return 'tired'
  return 'broken'
}

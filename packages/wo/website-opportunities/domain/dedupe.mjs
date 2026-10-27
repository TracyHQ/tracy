const SAME_PLACE_M = 60

export function normaliseName(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function distanceM(a, b) {
  const R = 6_371_000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function samePlace(a, b) {
  if (a.provider === b.provider && a.providerId && a.providerId === b.providerId) return true
  if (normaliseName(a.name) !== normaliseName(b.name)) return false
  if (normaliseName(a.branch) !== normaliseName(b.branch)) return false
  if (![a.lat, a.lon, b.lat, b.lon].every(Number.isFinite)) return false
  return distanceM(a, b) < SAME_PLACE_M
}

// The first seen wins; later duplicates only fill fields it lacks.
function merge(keep, extra) {
  const out = { ...keep, socials: { ...extra.socials, ...keep.socials } }
  for (const [k, v] of Object.entries(extra)) {
    if (k !== 'socials' && out[k] === undefined && v !== undefined) out[k] = v
  }
  return out
}

export function dedupeCandidates(list) {
  const out = []
  for (const cand of list ?? []) {
    const i = out.findIndex((kept) => samePlace(kept, cand))
    if (i === -1) out.push({ ...cand, socials: { ...cand.socials } })
    else out[i] = merge(out[i], cand)
  }
  return out
}

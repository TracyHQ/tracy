/**
 * Grid clustering for the map: pins closer than about one pin's width at the current zoom share a
 * cell and draw as one numbered group. No @googlemaps/markerclusterer — this is enough for a few
 * hundred places, and it keeps the library free of the Maps SDK's packages.
 */
import type { PlaceRow } from './types.ts'

/** From this zoom on, every place is its own pin. */
export const CLUSTER_MAX_ZOOM = 15
/** Cell width in screen pixels. */
const CELL_PX = 48

export interface PinGroup {
  lat: number
  lon: number
  rows: PlaceRow[]
}

const located = (r: PlaceRow): r is PlaceRow & { lat: number; lon: number } =>
  typeof r.lat === 'number' && Number.isFinite(r.lat) && typeof r.lon === 'number' && Number.isFinite(r.lon)

/** Places without coordinates are left out; a group sits at the mean of its places. */
export function clusterPins(rows: PlaceRow[], zoom: number): PinGroup[] {
  const pins = rows.filter(located)
  if (zoom >= CLUSTER_MAX_ZOOM) return pins.map((r) => ({ lat: r.lat, lon: r.lon, rows: [r] }))
  // Degrees of longitude per pixel at this zoom (Web Mercator, 256 px tiles); good enough for latitude near the search area.
  const cell = (CELL_PX * 360) / (256 * 2 ** zoom)
  const cells = new Map<string, Array<PlaceRow & { lat: number; lon: number }>>()
  for (const r of pins) {
    const id = `${Math.floor(r.lat / cell)}:${Math.floor(r.lon / cell)}`
    const list = cells.get(id)
    if (list) list.push(r)
    else cells.set(id, [r])
  }
  return [...cells.values()].map((list) => ({
    lat: list.reduce((s, r) => s + r.lat, 0) / list.length,
    lon: list.reduce((s, r) => s + r.lon, 0) / list.length,
    rows: list
  }))
}

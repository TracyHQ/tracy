/**
 * Design systems by their display name on /ops (15/10/2026: "Refero 5fd3b3b4" must read
 * "Figma"). The Design system check and the preview probe name a Refero system by its library id
 * (`refero:<uuid>`), in a finding's "on" list and inside rule messages; the operator reads, and pastes
 * into Claude Code, the name the library shows customers instead (`referoLibrary`, the distinct names
 * of `refero-names.js`). An id the library does not offer keeps its id.
 */
import { referoLibrary } from './ds-slot.js'

const REFERO_IN_TEXT = /refero:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g

/**
 * Every offered Refero system's display name by uuid; an empty map when the library cannot be read
 * (the screen then shows ids, as before, rather than failing).
 * @returns {Promise<Map<string, string>>}
 */
export async function referoNames() {
  try {
    return new Map((await referoLibrary()).map((r) => [r.uuid, r.name]))
  } catch {
    return new Map()
  }
}

/**
 * A copy of `value` with every `refero:<uuid>` inside its strings replaced by the system's name.
 * @template T
 * @param {T} value any JSON value (a road, a list of issues)
 * @param {Map<string, string>} names from {@link referoNames}
 * @returns {T}
 */
export function withSystemNames(value, names) {
  if (names.size === 0) return value
  const walk = (/** @type {any} */ v) => {
    if (typeof v === 'string') return v.replace(REFERO_IN_TEXT, (id, uuid) => names.get(uuid) ?? id)
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value)
}

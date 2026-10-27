/**
 * The browser half's current brand values: seeded from the served page's snapshot, then replaced by
 * every section dsh's settings form accepts. Plain JS so node --test can import it without a build.
 */
import { CODE_FONT_FIELD, GLOBAL_FONT_FIELD, PRIMARY_FIELD, brandSettingsFrom } from './settings.mjs'

const FIELDS = [PRIMARY_FIELD, GLOBAL_FONT_FIELD, CODE_FONT_FIELD]

/**
 * @param {unknown} initial - the boot snapshot (`globalThis.__TRACY_BRAND__`), possibly absent.
 */
export function createBrandValues(initial) {
  let value = brandSettingsFrom(initial)
  /** @type {Set<() => void>} */
  const listeners = new Set()
  return {
    /** @returns {{ [k: string]: string }} the values in force now. */
    get: () => value,
    /**
     * Take a section the settings form accepted. `undefined` (form still loading, or `memory` mode)
     * keeps what the page was served with; an unchanged section notifies nobody.
     * @param {unknown} next
     */
    adopt(next) {
      if (next === undefined) return
      const normalised = brandSettingsFrom(next)
      if (FIELDS.every((field) => normalised[field] === value[field])) return
      value = normalised
      for (const listener of listeners) listener()
    },
    /**
     * @param {() => void} listener
     * @returns {() => void}
     */
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

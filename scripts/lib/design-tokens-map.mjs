/**
 * The design token map tracy-web reads: every catalogue system's CSS custom properties, keyed by id.
 *
 * WHY A GENERATED MAP. tracy-web owns the design record a site wears (ADR 0023, "Addendum 29/09") and
 * updates it when `theme.style` switches the look — so it must know the 56 token VALUES of any
 * catalogue system. The image carries none of `vendor/tracy/od-design-system/systems/` (39 MB, of
 * which the 154 `tokens.css` are 1.2 MB), and copying by glob would flatten the paths. One map,
 * generated here and guarded by a gate like `od-slots` and `design-templates`, is the smaller truth.
 *
 * Same reading rule as `tokensOf` in `packages/site/tracy-site-build-core/src/host/design-record.mjs`
 * (first declaration of each name wins, comments stripped), so tracy-web and the build record the
 * same values for the same system.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const SCHEMA = 'tracy-design-tokens/v1'

/**
 * @param {string} css
 * @returns {Record<string, string>}
 */
export function tokensOf(css) {
  /** @type {Record<string, string>} */
  const out = {}
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of bare.matchAll(/(--[A-Za-z0-9][\w-]*)\s*:\s*([^;{}]+);/g)) {
    if (!(m[1] in out)) out[m[1]] = m[2].trim()
  }
  return out
}

/**
 * @param {string} systemsDir `vendor/tracy/od-design-system/systems`
 * @param {{ systems?: { id?: unknown, name?: unknown }[] }} catalog the parsed `catalog.json`
 * @returns {{ schemaVersion: string, names: Record<string, string>, ids: Record<string, Record<string, string>> }}
 */
export function buildTokenMap(systemsDir, catalog) {
  const rows = (catalog.systems ?? [])
    .filter((s) => typeof s.id === 'string')
    .map((s) => ({
      id: /** @type {string} */ (s.id),
      name: typeof s.name === 'string' ? s.name : /** @type {string} */ (s.id)
    }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  /** @type {Record<string, string>} */
  const names = {}
  /** @type {Record<string, Record<string, string>>} */
  const ids = {}
  for (const { id, name } of rows) {
    names[id] = name
    const file = path.join(systemsDir, id, 'tokens.css')
    if (existsSync(file)) ids[id] = tokensOf(readFileSync(file, 'utf8'))
  }
  return { schemaVersion: SCHEMA, names, ids }
}

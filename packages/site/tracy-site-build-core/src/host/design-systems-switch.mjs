/**
 * Tracy's switch "Design systems on Design inspiration", asked by the Build at the moment it starts.
 *
 * WHY THE LANE ASKS TOO. Tracy's create doors refuse a design system named by id while the switch is
 * off, but a WordPress Build never names its design to them: the site is created bare and the look
 * is applied here, by the `style` stage (`theme.style`). EmDash is created bare the same way. So
 * `POST <prefix>/start` is a door the id reaches without passing Tracy's check, and it refuses the
 * same ids with the same code.
 *
 * 🔒 ANYTHING BUT A PLAIN `shown: true` IS OFF — no origin, a refusal, a throw, a body of another
 * shape. A lane that cannot tell must refuse the library rather than build it: building is the
 * fail-open shape this repo refuses (the same rule as `tracy-design-inspiration`'s
 * `designSystemsShownFromTracy`).
 */
import { readFileSync } from 'node:fs'

/**
 * This dsh's Tracy: the config's word in tests, else `MCP_TRACY_ORIGIN` — the process env first,
 * then the password gate's env file, where `tracy-site-tools` and `tracy-add-site` read it too.
 * @param {{ tracyOrigin?: string }} config
 * @returns {string | null}
 */
export function tracyOriginOf(config) {
  if (config.tracyOrigin) return config.tracyOrigin
  const own = process.env.MCP_TRACY_ORIGIN?.trim()
  if (own) return own
  const file = process.env.DSH_PASSWORDS_ENV_FILE?.trim()
  if (!file) return null
  try {
    const m = /^MCP_TRACY_ORIGIN=(.+)$/m.exec(readFileSync(file, 'utf8'))
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
  } catch {
    return null
  }
}

/**
 * Whether Tracy offers the design-system library right now.
 * @param {string | null} origin
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function designSystemsShown(origin, fetchImpl = fetch) {
  if (!origin) return false
  try {
    const response = await fetchImpl(`${origin.replace(/\/+$/, '')}/api/design-systems`, {
      headers: { accept: 'application/json' }
    })
    if (!response.ok) return false
    return (await response.json())?.shown === true
  } catch {
    return false
  }
}

/**
 * Does a Build of `id` name a design system of the library? Not when the id is a template — one
 * this plugin restores itself, or one Tracy's plan answered as a template (`ja-kinetic` is also a
 * library id, and its card must still build) — and not a brand, which the catalog never lists.
 * @param {string} id
 * @param {{ catalog: Set<string>, templates: Set<string>, designPlan?: { workflow?: unknown } | null }} known
 */
export function namesDesignSystem(id, { catalog, templates, designPlan }) {
  return catalog.has(id) && !templates.has(id) && designPlan?.workflow !== 'template'
}

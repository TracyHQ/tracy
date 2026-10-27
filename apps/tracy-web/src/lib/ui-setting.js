/**
 * The operator's User Interface switches: which pieces of the customer's dsh page are hidden
 * (`tasks/plan-ui-switches.md`). The list of switches is `@tracy/core/ui-switches/catalogue.json`,
 * reached the way `lib/content-api.js` reaches its package: the image copies it beside `src/`
 * (Dockerfile), a checkout reads the package in place — one set of bytes, no mirror to keep equal.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const IN_IMAGE = fileURLToPath(new URL('../ui-switches/catalogue.json', import.meta.url))
const IN_CHECKOUT = fileURLToPath(
  new URL('../../../../packages/core/tracy-core/src/ui-switches/catalogue.json', import.meta.url)
)

/** @type {{ areas: object[], groups: object[], switches: { id: string, defaultOn: boolean, locked?: string }[] }} */
export const UI_CATALOGUE = JSON.parse(readFileSync(existsSync(IN_IMAGE) ? IN_IMAGE : IN_CHECKOUT, 'utf8'))

const DEFAULTS = new Map(UI_CATALOGUE.switches.map((s) => [s.id, s.defaultOn]))
/** Switches the catalogue locks at their default: no press reaches them, no stored answer counts. */
const LOCKED = new Set(UI_CATALOGUE.switches.filter((s) => s.locked !== undefined).map((s) => s.id))

/**
 * The operator's differences from the code defaults.
 *
 * 🔒 ABSENT IS DEFAULTS. No row, no pool, a failed query — every one answers `{}`, i.e. exactly what
 * the plugins fall back to on their own. Neither "show everything" nor "hide everything".
 * @returns {Promise<{ overrides: Record<string, boolean>, updatedBy: string | null, updatedAt: string | null }>}
 */
export async function readUiOverrides(pool) {
  const none = { overrides: {}, updatedBy: null, updatedAt: null }
  if (!pool) return none
  try {
    const { rows } = await pool.query('select overrides, updated_by, updated_at from ui_setting where id')
    if (!rows[0]) return none
    const overrides = {}
    for (const [id, on] of Object.entries(rows[0].overrides ?? {})) {
      // A switch the catalogue dropped since is not an answer to anything any more.
      // Nor is one it has locked since: the lock outranks what was pressed before it.
      if (DEFAULTS.has(id) && !LOCKED.has(id) && typeof on === 'boolean') overrides[id] = on
    }
    return {
      overrides,
      updatedBy: rows[0].updated_by,
      updatedAt: rows[0].updated_at?.toISOString?.() ?? null
    }
  } catch {
    return none
  }
}

/**
 * Whether one switch is on, for a server door that ENFORCES it (`site-connect-domain` closes the
 * doors that start an own domain).
 *
 * 🔒 NOT `readUiOverrides`. That one answers the defaults when the query fails, which is right for
 * what a page draws and wrong for a door: a database that cannot be read must not open a door the
 * operator closed. So a failed read THROWS here, and the caller refuses for now — and so does a
 * stored answer that is not a boolean (no press writes one: `parseUiPress`), which is no answer to
 * open a door on. No row, or no stored answer for the switch, is its catalogue default; a locked
 * switch is its default whatever was stored.
 * @param {{ query: Function }} pool
 * @param {string} id - a switch of the catalogue; any other id throws
 * @returns {Promise<boolean>}
 */
export async function uiSwitchOn(pool, id) {
  if (!DEFAULTS.has(id)) throw new Error(`not a UI switch: ${id}`)
  const fallback = /** @type {boolean} */ (DEFAULTS.get(id))
  if (LOCKED.has(id)) return fallback
  const { rows } = await pool.query('select overrides -> $1 as on from ui_setting where id', [id])
  const on = rows[0]?.on
  if (on === undefined || on === null) return fallback
  if (typeof on !== 'boolean') throw new Error(`UI switch ${id} is stored as ${typeof on}, not a boolean`)
  return on
}

/** @returns {Promise<string[]>} The ids hidden for every customer of this deployment. */
export async function readUiHidden(pool) {
  const { overrides } = await readUiOverrides(pool)
  return UI_CATALOGUE.switches.filter((s) => !(overrides[s.id] ?? s.defaultOn)).map((s) => s.id)
}

/**
 * Check a press before anything is written.
 * @returns {{ ok: true, switches: Record<string, boolean> } | { ok: false, error: string, id?: string }}
 */
export function parseUiPress(body) {
  const switches = body?.switches
  if (switches === null || typeof switches !== 'object' || Array.isArray(switches)) {
    return { ok: false, error: 'SWITCHES_NOT_OBJECT' }
  }
  for (const [id, on] of Object.entries(switches)) {
    if (!DEFAULTS.has(id)) return { ok: false, error: 'UNKNOWN_SWITCH', id }
    if (typeof on !== 'boolean') return { ok: false, error: 'SWITCH_NOT_BOOLEAN', id }
  }
  for (const id of Object.keys(switches)) {
    if (LOCKED.has(id)) return { ok: false, error: 'SWITCH_LOCKED', id }
  }
  return { ok: true, switches }
}

/**
 * Apply a press in ONE statement, so two operators pressing different switches at once both land:
 * a switch set away from its default joins `overrides`, one set back to its default leaves it.
 */
export async function saveUiSwitches(pool, switches, updatedBy) {
  const away = {}
  const back = []
  for (const [id, on] of Object.entries(switches)) {
    if (on === DEFAULTS.get(id)) back.push(id)
    else away[id] = on
  }
  await pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb - $2::text[], $3)
     on conflict (id) do update set overrides = (ui_setting.overrides || $1::jsonb) - $2::text[],
       updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(away), back, updatedBy]
  )
}

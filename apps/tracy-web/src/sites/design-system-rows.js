/**
 * What the Design system doors' writes leave behind: their Site changes rows (whether a row's apply can
 * still be undone, and the sentence it reads as) and the `site_design_system` table (migration 089) the
 * doors keep each apply in. Read by `activity-v2.js`; the store is handed to `mountDesignSystem`.
 */
import { APPLY_ID, slotIdOf } from './design-system-ids.js'

/**
 * What a Site changes row of a design system write offers (`designSystem` of a V2 `writes` item):
 * the apply its group is (`design-system-<applyId>`), whether it can be undone from the row and why
 * not — by the Design system door's own rules: only the site's newest apply, not undone yet, and a
 * seat whose role may write (`canWrite`, the `code` toolset). Null for any other group.
 * @param {any[]} writes the group's `site_write` rows
 * @param {{ rows: Map<string, any>, newest: string | null, canWrite: boolean }} known
 *   `rows`: the `site_design_system` rows of the page's applies, by id; `newest`: the site's newest
 *   apply id.
 */
export function designSystemRowOf(writes, known) {
  const apply = writes.find(
    (w) => w.via === 'ds-slot' && w.action === 'design-system.apply' && w.outcome === 'ok'
  )
  const applyId = apply?.target?.applyId
  if (typeof applyId !== 'string' || !APPLY_ID.test(applyId)) return null
  const row = known.rows.get(applyId)
  if (!row) return null
  const previous = row.previous_id ? { id: row.previous_id, name: row.previous_name ?? null } : null
  const base = { applyId, name: row.system_name ?? row.system_id, previous }
  if (row.undone_at) return { ...base, state: 'undone', canUndo: false }
  if (known.newest !== applyId) return { ...base, state: 'not-latest', canUndo: false }
  return { ...base, state: 'available', canUndo: known.canWrite }
}

/**
 * The Description of a design system write group (walkthrough 11/10/2026, bug 4): the three things a
 * press does read differently — "Applied the design system “Stripe”", "Switched the design system
 * from “Stripe” to “Spotify”", "Undid the design system “Spotify”" — never the machine word
 * "design-system". `name` is the system's name as the door stored it with the write; `from` the
 * look the site wore before an apply, from the write (`target.from`) or, for a write recorded before
 * the door kept it, from the apply's `site_design_system` row. An apply whose outcome is not known
 * (the job did not answer) says so. Null for a group that is not a design system write.
 * @param {any[]} writes the group's `site_write` rows
 * @param {any | null} [dsRow] the apply's `site_design_system` row, when known
 * @returns {{ key: string, params: Record<string, unknown>, isRequestOnly: false } | null}
 */
export function designSystemDescription(writes, dsRow = null) {
  const ds = writes.filter((w) => w.via === 'ds-slot')
  if (ds.length === 0 || ds.length !== writes.length) return null
  const w = ds[ds.length - 1]
  const t = w.target && typeof w.target === 'object' ? w.target : {}
  const name =
    (typeof t.title === 'string' && t.title) || dsRow?.system_name || (typeof t.id === 'string' ? t.id : null)
  const said = (key, params) => ({ key, params, isRequestOnly: /** @type {const} */ (false) })
  if (w.action === 'design-system.undo') return said('design-system.undo', { name })
  if (w.action !== 'design-system.apply') return null
  if (w.outcome !== 'ok') return said('design-system.unsure', { name })
  // The same system put on again is an apply, not a switch from itself.
  const same =
    t.from && typeof t.from === 'object'
      ? t.from.id === slotIdOf(String(t.id))
      : dsRow !== null && dsRow?.previous_id === dsRow?.system_id
  const from =
    t.from === null || same
      ? null
      : t.from && typeof t.from === 'object'
        ? (typeof t.from.name === 'string' && t.from.name) ||
          (typeof t.from.id === 'string' ? t.from.id : null)
        : (dsRow?.previous_name ?? dsRow?.previous_id ?? null)
  return from ? said('design-system.switch', { name, from }) : said('design-system.apply', { name })
}

/**
 * The `site_design_system` rows of some applies of one site, and the site's newest apply id — what
 * the Site changes rows of those applies need ({@link designSystemRowOf}). One query.
 * @param {import('pg').Pool} pool
 * @param {string} siteKey
 * @param {string[]} applyIds
 * @returns {Promise<{ rows: Map<string, any>, newest: string | null }>}
 */
export async function designSystemApplies(pool, siteKey, applyIds) {
  if (applyIds.length === 0) return { rows: new Map(), newest: null }
  const { rows } = await pool.query(
    `select d.*, (d.undo_id = (select n.undo_id from site_design_system n where n.site_key = $1
                                order by n.applied_at desc, n.id desc limit 1)) as newest
       from site_design_system d
      where d.site_key = $1 and d.undo_id = any($2::text[])`,
    [siteKey, applyIds]
  )
  return {
    rows: new Map(rows.map((r) => [r.undo_id, r])),
    newest: rows.find((r) => r.newest === true)?.undo_id ?? null
  }
}

/**
 * The `site_design_system` reads and writes (migration 089), over a pool.
 * @param {import('pg').Pool} pool
 */
export function designSystemStore(pool) {
  return {
    async insert(r) {
      await pool.query(
        `insert into site_design_system (site_key, undo_id, platform, system_id, system_name, previous_id, previous_name, actor)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [r.siteKey, r.undoId, r.platform, r.systemId, r.systemName, r.previousId, r.previousName, r.actor]
      )
    },
    async latest(siteKey) {
      const { rows } = await pool.query(
        `select * from site_design_system where site_key = $1 order by applied_at desc, id desc limit 1`,
        [siteKey]
      )
      return rows[0] ?? null
    },
    async markUndone(siteKey, undoId, by) {
      await pool.query(
        `update site_design_system set undone_at = now(), undone_by = $3
          where site_key = $1 and undo_id = $2 and undone_at is null`,
        [siteKey, undoId, by]
      )
    }
  }
}

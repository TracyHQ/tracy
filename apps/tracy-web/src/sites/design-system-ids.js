/**
 * The Design system doors' vocabulary (`design-system.js`): how a library id, a slot id and an apply id
 * are spelled, what a slot the site wears means in the library, and the newest apply as the doors
 * answer it. Pure — shared by the doors, their writes and the Site changes rows they leave.
 */

/** @typedef {{ id: string, name: string | null }} Slot */

/**
 * The Template default card: the template's own look, no system worn. The preview door shows the site's page
 * with the worn slot taken off; the apply door takes it off for real (the host's `site-ds-slot` mode `clear`),
 * kept as an apply of its own so it can be undone like any other. Never a library id: no create request and no
 * chat-picked system may carry it.
 */
export const TEMPLATE_DEFAULT_ID = 'template-default'
/** What the rows of a Template default apply are called (Site changes, `site_design_system.system_name`). */
export const TEMPLATE_DEFAULT_NAME = 'Template default'

/** An apply's id, as the host's `site-ds-slot` makes it (`undoId`). */
export const APPLY_ID = /^[0-9a-f]{12}$/

/** A Refero library id, as the slot writes it too (`refero:<uuid>`). */
const REFERO_LIBRARY_ID = /^refero:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The `site_write.session_id` of an apply's row and of its undo's row: one Site changes row each. */
export const applySession = (/** @type {string} */ applyId) => `design-system-${applyId}`
export const undoSession = (/** @type {string} */ applyId) => `design-system-undo-${applyId}`

/** The only file paths a `site-ds-slot` answer may name: webroot-relative, no climbing out. */
const DS_FILE = /^(?!\/)(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._@+/-]{1,300}$/

/**
 * The webroot files an apply's job said it wrote (`files` of the host's answer: on WordPress the
 * variation and the catalogue under `uploads/tracy/`), kept on the write so a later seal of them
 * folds into this press's row (`activity-source.js` `dsWriteExplainsPathSql`). Anything else: none.
 * @param {unknown} files
 * @returns {string[]}
 */
export function dsFilesOf(files) {
  if (!Array.isArray(files)) return []
  return [...new Set(files.filter((f) => typeof f === 'string' && DS_FILE.test(f)))].slice(0, 8)
}

/**
 * A library id as a request may spell it, as the library keys it: an OpenDesign system bare (`stripe`,
 * also accepted as `od:stripe`), a Refero one as `refero:<uuid>`.
 * @param {string} id
 */
export function libraryIdOf(id) {
  const od = /^od:([a-z0-9][a-z0-9-]{0,60})$/.exec(id)
  return od ? od[1] : id
}

/**
 * The slot id the site carries for a library id (`od:<id>`, `refero:<uuid>`): the marker `seen` looks
 * for, and what a write's `from` names.
 * @param {string} id
 */
export function slotIdOf(id) {
  return REFERO_LIBRARY_ID.test(id) ? id : `od:${id}`
}

/**
 * What a slot id from the site means in the library: `od:<id>` and `refero:<uuid>` are ours; anything
 * else is named as worn but cannot be matched to a card.
 * @param {Slot | null} slot
 * @param {Map<string, string>} names library id → display name
 */
export function wornOf(slot, names) {
  if (!slot) return null
  const own = /^od:([a-z0-9][a-z0-9-]{0,60})$/.exec(slot.id)
  const id = own ? own[1] : REFERO_LIBRARY_ID.test(slot.id) ? slot.id : null
  return { id, slotId: slot.id, name: (id && names.get(id)) || slot.name || slot.id }
}

/**
 * The newest apply as the doors answer it (`last`), from its `site_design_system` row.
 * @param {any} row
 */
export function lastOf(row) {
  if (!row) return null
  return {
    applyId: row.undo_id,
    id: row.system_id,
    name: row.system_name,
    previous: row.previous_id ? { id: row.previous_id, name: row.previous_name } : null,
    at: row.applied_at instanceof Date ? row.applied_at.toISOString() : row.applied_at,
    by: row.actor,
    undone: row.undone_at !== null && row.undone_at !== undefined
  }
}

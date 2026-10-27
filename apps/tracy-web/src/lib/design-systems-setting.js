/**
 * The operator switch "Design systems on Design inspiration": whether this server offers the
 * design-system library beside the finished templates. One row, `design_systems_setting`.
 *
 * 🔒 ABSENT IS OFF. No row, no pool, a failed query — every one of them answers `false`. A reader
 * that cannot tell must hide the library rather than show it: showing is the fail-open shape this
 * repo refuses everywhere.
 */

/** @returns {Promise<boolean>} */
export async function readDesignSystemsShown(pool) {
  if (!pool) return false
  try {
    const { rows } = await pool.query('select shown from design_systems_setting where id')
    return rows[0]?.shown === true
  } catch {
    return false
  }
}

/** Last press wins: the value is absolute, so two operators racing both get what they pressed. */
export async function saveDesignSystemsShown(pool, shown, updatedBy) {
  await pool.query(
    `insert into design_systems_setting (id, shown, updated_by) values (true, $1, $2)
     on conflict (id) do update set shown = excluded.shown, updated_by = excluded.updated_by, updated_at = now()`,
    [shown, updatedBy]
  )
}

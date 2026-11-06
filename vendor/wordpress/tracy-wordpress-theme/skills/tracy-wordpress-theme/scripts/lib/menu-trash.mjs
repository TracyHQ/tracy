// Which #__menu rows are in Joomla's trash: a row with `published -2` and every row under it. Joomla's navigation never
// shows them and serves no path for them, so a published child of a trashed item is not a live page either.

/** The ids (strings) of the rows that are trashed or hang under a trashed row. */
export function trashedMenuIds(rows) {
  const parentOf = new Map(rows.map((r) => [String(r.id), String(r.parent_id ?? '1')]))
  const trashed = new Set(rows.filter((r) => Number(r.published) === -2).map((r) => String(r.id)))
  const under = new Set()
  for (const r of rows) {
    for (let at = String(r.id), hops = 0; at && hops < 100; at = parentOf.get(at), hops++) {
      if (trashed.has(at)) {
        under.add(String(r.id))
        break
      }
    }
  }
  return under
}

/** The rows that are not in the trash. */
export function liveMenuRows(rows) {
  const out = trashedMenuIds(rows)
  return rows.filter((r) => !out.has(String(r.id)))
}

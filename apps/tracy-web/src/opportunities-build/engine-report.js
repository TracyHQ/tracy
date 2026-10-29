/**
 * What the site build said and what the site refused, kept on the build's receipt (`receipt.engine`) and carried into the
 * hand-off report, so a part that did not happen is visible without reading the database (spec TracyHQ/tracy#189).
 * The run keeps them on its `site_brief` row: `error` joins the notes, `timings.notes` lists them whole, `timings.refused`
 * lists the door calls the site refused with the site's own reason.
 */

/**
 * @param {{state?: string, error?: string | null, timings?: any} | null | undefined} row - the `site_brief` row
 * @returns {{state: string | null, notes: string[], refused: Array<Record<string, unknown>>} | null}
 */
export function engineReportOf(row) {
  if (!row) return null
  const timings = row.timings && typeof row.timings === 'object' ? row.timings : {}
  const notes = Array.isArray(timings.notes)
    ? timings.notes.map(String)
    : String(row.error ?? '')
        .split(' · ')
        .filter(Boolean)
  const refused = Array.isArray(timings.refused) ? timings.refused : []
  return { state: row.state ?? null, notes, refused }
}

/** The engine report as the hand-off keeps it. */
export function handoffEngine(/** @type {any} */ engine) {
  return {
    state: engine?.state ?? null,
    notes: Array.isArray(engine?.notes) ? engine.notes : [],
    refused: Array.isArray(engine?.refused) ? engine.refused : []
  }
}

/** Read the build's row and keep its report on the receipt. Never throws: no report is better than a failed check. */
export async function keepEngineReport(/** @type {{query: Function}} */ db, /** @type {any} */ build) {
  try {
    const { rows } = await db.query('select state, error, timings from site_brief where site_key = $1', [
      build.site_key
    ])
    const engine = engineReportOf(rows[0])
    if (!engine) return build
    const out = await db.query(
      `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || jsonb_build_object('engine', $2::jsonb),
         updated_at = now() where id = $1 returning *`,
      [build.id, JSON.stringify(engine)]
    )
    return out.rows[0] ?? { ...build, receipt: { ...build.receipt, engine } }
  } catch {
    return build
  }
}

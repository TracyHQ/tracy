/**
 * What a `--write` run of preview-check.mjs or preview-parity.mjs measured too little of to write: the gaps a
 * reader of the measurement file would not see, so a partial run could pass on /ops as a whole one. A run
 * with a gap writes nothing and exits 1 (a page that could not be read is no gap: its declared page has no
 * row, and the judge leaves the rule unmeasured). PURE.
 */

/**
 * preview-check.mjs: a requested system with no row on any page (the file would keep that system's older
 * rows beside the new ones, or not judge the system at all), or no page measured.
 * @param {{ pages: Record<string, { systems?: Record<string, any> }>, misses: { page: string, reason: string }[] }} row
 * @param {readonly string[]} systems the systems the run was asked to measure
 * @returns {string[]}
 */
export function previewGaps(row, systems) {
  const pages = Object.values(row.pages)
  if (!pages.length) {
    const home = row.misses.find((m) => m.page === '/')
    return [`no page measured${home ? ` (/: ${home.reason})` : ''}`]
  }
  return systems
    .filter((id) => !pages.some((p) => p.systems?.[id] && !p.systems[id].miss))
    .map((id) => `${id}: no page measured`)
}

/**
 * preview-parity.mjs: every view (page, system, width, popup) not compared. The rule only asks that each
 * declared page has a row, so a view missing beside another of the same page would pass unseen.
 * @param {{ rows: any[], misses?: { page: string, system: string, width: number, miss: string, popup?: string }[] }} block
 * @returns {string[]}
 */
export function parityGaps(block) {
  const misses = (block.misses ?? []).map(
    (m) => `${m.page} ${m.system} ${m.width}${m.popup ? ` ${m.popup}` : ''}: ${m.miss}`
  )
  return misses.length || block.rows.length ? misses : ['no view compared']
}

/**
 * preview-check.mjs --write: the gaps of every side and demo of the run decided first, then every row written
 * at once, or none. Rows written side by side as each side finished left light's new rows beside the file's
 * old dark rows when dark then measured nothing, and the file judged as one whole measurement.
 * @template {{ label: string, row: Parameters<typeof previewGaps>[0] }} R
 * @param {readonly R[]} runs every side and demo of the run, in the order they are written
 * @param {readonly string[]} systems the systems the run was asked to measure
 * @param {(run: R) => void} write writes one run's rows into its measurement file
 * @returns {string[]} the gaps (`<label>: <gap>`); nothing was written when there are any
 */
export function writeWholeRun(runs, systems, write) {
  const gaps = runs.flatMap((r) => previewGaps(r.row, systems).map((g) => `${r.label}: ${g}`))
  if (!gaps.length) for (const r of runs) write(r)
  return gaps
}

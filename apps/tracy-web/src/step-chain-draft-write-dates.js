// The dates of the articles a draft write creates (#597): the plan gives each a rank (`op.dated.rank`, 0 newest,
// `draft-write-record-columns.mjs`), the write turns it into `publish_up` from one time it keeps in the run record
// (`state.dateBase`, set on the first run and never moved), so a resumed run, a retry and the read back all send and
// expect the same date. The newest article is dated an hour before that time, so a site clock a little behind the
// server's never holds it back as not published yet; each next rank is one minute older. Joomla stores the column in
// UTC as `YYYY-MM-DD HH:MM:SS` (measured: read back as sent). `created` is not sent: the record door does not write it
// (`draft-write-door-columns.mjs`; a new article is stamped with the site's own time of the write). The lists the kit
// orders by date order by `publish_up` (`itemsOrder.by: "published"`), so nothing they show depends on `created`.

/** How far the newest article sits before the run's time, and how far apart two ranks are. */
export const NEWEST_BEFORE_MS = 60 * 60 * 1000
export const RANK_STEP_MS = 60 * 1000

const sqlDate = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/** The date column of a created article, or none (no rank, or a run record with no time kept). */
export function datesOf(op, ctx) {
  const base = Date.parse(ctx.state?.dateBase ?? '')
  if (!op.dated || !Number.isFinite(base)) return {}
  const at = sqlDate(base - NEWEST_BEFORE_MS - op.dated.rank * RANK_STEP_MS)
  return { publish_up: at }
}

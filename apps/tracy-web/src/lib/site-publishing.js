// The publish, back-to-draft or delete under way on each of a list of sites, read from the book
// (`site_publish_op`, written by `sites/publish-store.js`). In `lib/` because the reader is another
// domain — `seats/`, for the list of sites — and a domain directory never imports another
// (`test/module-graph.test.mjs`).

/**
 * The direction of the operation that holds each of `siteKeys` right now — `starting` or `running`,
 * confirmed by the host or not — for a list of sites (`GET /api/sites`): one read, nothing asked of
 * any host. A site with no operation under way is not in the map.
 * @param {{ query: Function }} db
 * @param {string[]} siteKeys
 * @returns {Promise<Map<string, 'live' | 'draft' | 'delete'>>} `delete`: the site is being taken off
 *   its host; its row is there until the host said it is gone, or to delete again when it failed
 */
export async function publishingOf(db, siteKeys) {
  if (siteKeys.length === 0) return new Map()
  const { rows } = await db.query(
    `select site_key, op from site_publish_op
      where site_key = any($1::text[]) and state in ('starting', 'running')
        -- One own domain being removed changes nothing about whether the site is published.
        and op in ('live', 'draft', 'delete')`,
    [siteKeys]
  )
  return new Map(
    rows.map((row) => [row.site_key, row.op === 'draft' ? 'draft' : row.op === 'delete' ? 'delete' : 'live'])
  )
}

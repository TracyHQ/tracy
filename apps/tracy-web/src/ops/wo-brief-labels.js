/**
 * `/ops/wo` › Briefs: what a brief revision holds about its photos, for staff (#51, spec #38).
 *
 *   GET /ops/wo/revisions/:revId/labels             → the review page of ONE revision (HTML)
 *   GET /ops/wo/places/:id/briefs                   → the review page of a place: its opportunities' latest revisions
 *   GET /api/ops/wo/revisions/:revId/labels         → the same view as JSON (`wo-brief-labels-view.js`)
 *   GET /api/ops/wo/places/:id/briefs               → the same, one view per opportunity of the place
 *   GET /api/ops/wo/revisions/:revId/assets/:assetId/image → the stored bytes of one photo of the revision
 *
 * Staff read (`admit`), any account's revision; nothing here writes. The pages and the JSON share ONE shaper, so the
 * tool a person opens and the data a script reads cannot disagree. A revision is named by its id, so the page works for
 * any revision on any deployment: `GET /ops/wo/revisions/<id>/labels`.
 */
import { Hono } from 'hono'
import { isUuid } from 'website-opportunities/src/wo-places-store.js'
import { admit, denied } from './admit.js'
import { briefLabelsViewOf } from './wo-brief-labels-view.js'
import { renderBriefLabelsPage } from './wo-brief-labels-page.js'

const PLACE_REVISIONS_MAX = 20

/**
 * @param {{ pool: import('pg').Pool | null, config: object, objects?: { get(key: string): Promise<Response | null>, publicUrl?(key: string): Promise<string | null> } | null }} deps
 */
export function woBriefLabelsRoutes({ pool, config, objects = null }) {
  const app = new Hono()

  const guard = async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return { deny: denied(c, who) }
    if (!pool) return { deny: c.json({ error: 'NO_DATABASE' }, 503) }
    return { who }
  }

  const revisionRow = async (id) =>
    isUuid(id) ? ((await pool.query('select * from wo_revision where id = $1', [id])).rows[0] ?? null) : null

  /** The latest revision of each opportunity that resolved to the place, newest first. */
  const placeRevisions = async (placeId) =>
    (
      await pool.query(
        `select * from (
           select distinct on (r.opportunity_id) r.*
             from wo_revision r join wo_opportunity o on o.id = r.opportunity_id
            where o.place_id = $1
            order by r.opportunity_id, r.n desc
         ) latest order by created_at desc limit ${PLACE_REVISIONS_MAX}`,
        [placeId]
      )
    ).rows

  const viewOf = (row) =>
    briefLabelsViewOf(row, {
      imageUrlOf: (assetId) => `/api/ops/wo/revisions/${row.id}/assets/${encodeURIComponent(assetId)}/image`
    })

  const notFound = (c, what) => c.json({ error: `${what}_NOT_FOUND` }, 404)

  app.get('/api/ops/wo/revisions/:revId/labels', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const row = await revisionRow(c.req.param('revId'))
    if (!row) return notFound(c, 'REVISION')
    c.header('cache-control', 'no-store')
    return c.json(viewOf(row))
  })

  app.get('/api/ops/wo/places/:id/briefs', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    if (!isUuid(c.req.param('id'))) return notFound(c, 'PLACE')
    c.header('cache-control', 'no-store')
    return c.json({ revisions: (await placeRevisions(c.req.param('id'))).map(viewOf) })
  })

  app.get('/ops/wo/revisions/:revId/labels', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const row = await revisionRow(c.req.param('revId'))
    if (!row) return c.body(null, 404)
    c.header('cache-control', 'no-store')
    return c.html(renderBriefLabelsPage([viewOf(row)], { title: 'Brief labels' }))
  })

  app.get('/ops/wo/places/:id/briefs', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    if (!isUuid(c.req.param('id'))) return c.body(null, 404)
    c.header('cache-control', 'no-store')
    const views = (await placeRevisions(c.req.param('id'))).map(viewOf)
    return c.html(
      renderBriefLabelsPage(views, {
        title: 'Place briefs',
        note: 'The latest revision of each opportunity of this place.'
      })
    )
  })

  app.get('/api/ops/wo/revisions/:revId/assets/:assetId/image', async (c) => {
    const g = await guard(c)
    if (g.deny) return g.deny
    const row = await revisionRow(c.req.param('revId'))
    const entry = row?.asset_manifest?.find?.((m) => m.id === c.req.param('assetId'))
    if (!entry) return notFound(c, 'ASSET')
    // The manifest names the table by `origin`; the bytes must be the ones the manifest pinned (same sha256).
    const table = entry.origin === 'place' ? 'wo_place_media' : 'wo_media'
    const media = isUuid(entry.id)
      ? (await pool.query(`select object_key, mime, status, sha256 from ${table} where id = $1`, [entry.id]))
          .rows[0]
      : null
    if (!media || media.sha256 !== entry.sha256 || media.status !== 'stored' || !media.object_key)
      return c.json({ error: 'MEDIA_NOT_STORED' }, 404)
    if (!objects) return c.json({ error: 'STORE_UNAVAILABLE' }, 503)
    const direct = await objects.publicUrl?.(media.object_key)
    c.header('cache-control', 'private, no-store')
    if (direct) return c.redirect(direct, 302)
    const res = await objects.get(media.object_key)
    if (!res?.ok || !res.body) return c.json({ error: 'STORE_READ_FAILED' }, 502)
    return new Response(res.body, {
      status: 200,
      headers: {
        'content-type': media.mime ?? 'application/octet-stream',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff'
      }
    })
  })

  return app
}

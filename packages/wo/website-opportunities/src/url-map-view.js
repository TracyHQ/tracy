/**
 * The old URL → new page map of one opportunity's demo as the doors answer it (`domain/url-map.mjs`): the business's
 * current website as this card's own research read it (the website source row: no new fetch) against the demo's pages
 * the builder kept (`wo_build.built.pages`). Before this card's research finished nothing of the old site is shown
 * (#524), so the map then reads `old-site-not-read`, as for a site research could not read.
 */
import { oldUrlMap } from '../domain/url-map.mjs'
import { placeViewOf } from './place-view.js'
import { researched, researchStateOf } from './research-state.js'
import { sourcesOf } from './store.js'

/**
 * @param {import('pg').Pool} pool
 * @param {any} opportunity the `wo_opportunity` row
 * @param {any} demo the demo's pages as kept on its build (`{readAt, truncated, pages}`), or `{reason}` / null
 * @returns {Promise<ReturnType<typeof oldUrlMap>>}
 */
export async function urlMapView(pool, opportunity, demo) {
  const candidate = opportunity?.candidate ?? {}
  let row = null
  if (researched(await researchStateOf(pool, opportunity.id))) {
    const view = opportunity.place_id ? await placeViewOf(pool, opportunity) : null
    const sources = view ? view.shown : await sourcesOf(pool, opportunity.id)
    row = (Array.isArray(sources) ? sources : []).find((s) => s?.source === 'website') ?? null
  }
  return oldUrlMap({ website: row?.ref ?? candidate.website ?? null, row, demo })
}

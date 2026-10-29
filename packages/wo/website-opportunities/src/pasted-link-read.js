/** Read the current per-link result from the same shared/private research the detail page reads. */
import { pastedLinkResults, requiresLinkReview } from '../domain/pasted-link-status.mjs'
import { placeViewOf } from './place-view.js'
import { mediaOf, sourcesOf } from './store.js'

export async function pastedLinkRead(db, opportunity, { finished = false } = {}) {
  if (!opportunity.candidate?.pastedLinks?.length) return { links: [], requiresLinkReview: false }
  const shared = opportunity.place_id ? await placeViewOf(db, opportunity) : null
  const [sources, media] = shared
    ? [[...shared.snapshot.sources.map((s) => ({ ...s, shared: true })), ...shared.shown], shared.media]
    : await Promise.all([sourcesOf(db, opportunity.id), mediaOf(db, opportunity.id)])
  const links = pastedLinkResults(opportunity, { sources, media, finished })
  return { links, requiresLinkReview: requiresLinkReview(links) }
}

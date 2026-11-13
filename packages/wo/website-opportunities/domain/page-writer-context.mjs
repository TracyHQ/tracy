// What every writer call of one build reads besides its page (ticket #594, split out for #599): the block
// descriptions, the plan data, the place limits, the known values the copy check holds copy to, the voice and the
// search limits; and each page's fields, a child list row's copy field with the values of its sibling rows. The page
// writer (`page-writer.mjs`) and the revision impact (`revision-impact.mjs`) build a page's writer request from the
// same context, so a page whose request is unchanged is known before any call. Pure.
import { placeLimitsOf } from './field-place-limits.mjs'
import { blockDescriptionsOf, knownEntriesOf, pageFieldsOf } from './page-writer-fields.mjs'
import { pageWriterUser } from './page-writer-request.mjs'
import { foreignValuesOf } from './page-writer-rows.mjs'
import { planDataOf } from './plan-data.mjs'
import { seoLimitsOf } from './seo-limits.mjs'

/** The context of every writer call of a build (the prompt is added by the writer). */
export function writerContextOf({ profile, blockStore, library = [], mapping }) {
  const data = planDataOf(profile)
  const { byId } = data
  const blocks = blockDescriptionsOf(blockStore, library)
  return {
    blocks,
    byId,
    data,
    placeLimits: placeLimitsOf(blocks.values()),
    known: knownEntriesOf(byId, data.rowsById),
    voice: profile?.voice,
    seoLimits: seoLimitsOf(mapping)
  }
}

/** A page's fields; a row's copy field is checked against the other rows of its own list (`foreign`). */
export function writerFieldsOf(page, context) {
  const fields = pageFieldsOf(page, context)
  return fields.map((f) =>
    f.row && f.from === 'writer' ? { ...f, foreign: foreignValuesOf(f, fields, context.data) } : f
  )
}

/**
 * The first writer request of every page of a plan that has a field to write, by page id: exactly the user message
 * `callPage` sends (no rewrite), parsed.
 */
export function writerRequestsOf(plan, context) {
  const out = new Map()
  for (const page of plan.pages) {
    const fields = writerFieldsOf(page, context)
    const slots = fields.filter((f) => f.from === 'writer')
    if (slots.length === 0) continue
    out.set(page.id, pageWriterUser({ plan, page, slots, shown: fields, ...context, seo: context.seoLimits }))
  }
  return out
}

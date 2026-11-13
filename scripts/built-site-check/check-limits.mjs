// Text fields over their declared limit (ticket #601). For every text field the write wrote (a value of an operation
// of the write result that ran, naming an entry of the write order by its place, typed `text`), the field's own run is
// found on the rendered pages (`limit-measure.mjs`: its page first, then every page; an SEO value on its page only)
// and counted against the smaller of the kit's declared limit and the order's limit for the field. With the slots read
// back after the build (`stored`), the stored value is counted too. A finding gives the field and the lengths, never
// the words. Written text fields that exist but of which none could be measured are `not_run`, never a pass.
import { visibleOf } from '../../packages/wo/website-opportunities/domain/draft-write-guards.mjs'
import { squash } from './html-read.mjs'
import { declaredFieldOf } from './inputs.mjs'
import { charCount, renderedRunOf, seoRunOf } from './limit-measure.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const notRun = (reason, extra = {}) => ({ status: 'not_run', reason, findings: [], ...extra })

/** The limit of an entry: the smaller of the kit's declared limit and the order's own. */
function limitOf(kit, hit) {
  const declared = hit.block ? declaredFieldOf(kit, hit.block, hit.entry.field)?.limit : undefined
  const all = [declared, hit.entry.limit].filter((n) => Number.isInteger(n) && n > 0)
  return all.length
    ? { limit: Math.min(...all), from: all.length === 2 ? 'kit_and_order' : declared ? 'kit' : 'order' }
    : null
}

/** The written text values: one per entry, with the entry's place in the order; and the values naming no entry. */
function writtenTextOf(write, entries) {
  const out = []
  const seen = new Set()
  let named = 0
  let unknown = 0
  for (const op of write.ops)
    for (const v of list(op.values)) {
      if (!v?.entry) continue
      named++
      const hit = entries.get(v.entry)
      if (!hit) unknown++
      if (!hit || hit.entry.type !== 'text' || typeof v.value !== 'string' || seen.has(v.entry)) continue
      seen.add(v.entry)
      out.push({ v, hit })
    }
  return { out, named, unknown }
}

/**
 * The limits check.
 * @param {{write?: object, entries?: Map, kit?: object, pages: object[], pathOf: Map, stored?: object}} input
 *   `pages`: the rendered pages with their `tree`; `pathOf`: the site address of each plan page id
 */
export function checkLimits({ write, entries, kit, pages, pathOf, stored }) {
  if (!write) return notRun('write_result_missing: nothing says which fields were written')
  if (write.orderMismatch)
    return notRun('write_order_mismatch: the write order given is not the one the write plan was made from')
  if (write.plan.ops.length && !write.ops.length)
    return notRun("nothing_ran: the run report lists none of the write plan's operations")
  if (!entries?.size)
    return notRun('write_order_missing: give the write order (--write-order, or `order` in the write result)')
  const { out, named, unknown } = writtenTextOf(write, entries)
  if (named && unknown === named)
    return notRun(
      `write_order_unmatched: none of ${named} written value(s) names an entry of the write order`
    )
  const shown = pages.filter((p) => p.status === 200 && p.tree)
  const findings = []
  const notLocated = []
  let measured = 0
  let fields = 0
  let storedMeasured = 0
  for (const { v, hit } of out) {
    const limit = limitOf(kit, hit)
    if (!limit) continue
    fields++
    const words = squash(visibleOf(v.value))
    const at = { entry: v.entry, place: hit.entry.place ?? null, block: hit.block, field: hit.entry.field }
    const own = shown.filter((p) => p.path === pathOf.get(hit.page))
    const found = !words
      ? null
      : hit.entry.seo
        ? seoRunOf(words, hit.entry.seo, own)
        : renderedRunOf(words, [own, shown])
    if (!found) notLocated.push(v.entry)
    else {
      measured++
      if (found.length > limit.limit)
        findings.push({
          kind: 'text_over_limit',
          source: 'rendered',
          page: found.page,
          place: { ...at, element: found.element },
          limit: limit.limit,
          limitFrom: limit.from,
          length: found.length
        })
    }
    const slot = v.loc?.slot
    if (stored && typeof slot === 'string' && typeof stored[slot] === 'string') {
      storedMeasured++
      const length = charCount(squash(visibleOf(stored[slot])))
      if (length > limit.limit)
        findings.push({
          kind: 'text_over_limit',
          source: 'stored',
          page: pathOf.get(hit.page) ?? null,
          place: { ...at, slot },
          limit: limit.limit,
          limitFrom: limit.from,
          length
        })
    }
  }
  const notes = [`${measured} of ${fields} written text field(s) measured on the rendered pages`]
  if (stored) notes.push(`${storedMeasured} stored value(s) measured`)
  if (unknown) notes.push(`${unknown} written value(s) name no entry of the write order`)
  if (notLocated.length)
    notes.push(
      `${notLocated.length} written text field(s) not found on any rendered page: ${notLocated.join(', ')}`
    )
  if (fields && !measured && !storedMeasured)
    return notRun(`nothing_measured: ${fields} written text field(s), none found on a rendered page`, {
      notes,
      notLocated
    })
  return { status: 'ran', notes, findings, notLocated, measured, fields }
}

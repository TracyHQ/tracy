// Text fields over their declared limit (ticket #601). For every text field the write order wrote (an operation of
// the write result that ran, carrying an entry of type `text`), the field's element is found on the rendered pages
// (its page first, then every page) as the innermost element whose visible words hold the start of the written words,
// even across inline tags; of several, the one closest in length to what was written. Its visible words are counted
// as every limit of the domain is counted (`charCount`, one per code point) against the smaller of the kit's declared
// limit and the order's limit for the field. With the slots read back after the build (`stored`), the stored value is
// counted too. A finding gives the field and the lengths, never the words.
import { charCount } from '../../packages/wo/website-opportunities/domain/page-copy-check.mjs'
import { visibleOf } from '../../packages/wo/website-opportunities/domain/draft-write-guards.mjs'
import { innermostHolding, squash, textOf } from './html-read.mjs'
import { declaredFieldOf } from './inputs.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const NEEDLE = 24

/** The limit of an entry: the smaller of the kit's declared limit and the order's own. */
function limitOf(kit, hit) {
  const declared = declaredFieldOf(kit, hit.block, hit.entry.field)?.limit
  const all = [declared, hit.entry.limit].filter((n) => Number.isInteger(n) && n > 0)
  return all.length
    ? { limit: Math.min(...all), from: all.length === 2 ? 'kit_and_order' : declared ? 'kit' : 'order' }
    : null
}

/** The rendered length of a written value on the pages, or null when no element shows it. */
function renderedLength(words, pages) {
  const needle = [...words].slice(0, NEEDLE).join('')
  for (const group of pages) {
    const found = group.flatMap((p) => innermostHolding(p.tree, needle).map((el) => ({ page: p, el })))
    if (!found.length) continue
    const want = charCount(words)
    const best = found
      .map((f) => ({ ...f, length: charCount(textOf(f.el)) }))
      .sort((a, b) => Math.abs(a.length - want) - Math.abs(b.length - want))[0]
    return { page: best.page.path, element: best.el.name, length: best.length }
  }
  return null
}

/**
 * The limits check.
 * @param {{write?: object, entries?: Map, kit?: object, pages: object[], pathOf: Map, stored?: object}} input
 *   `pages`: the rendered pages with their `tree`; `pathOf`: the site address of each plan page id
 */
export function checkLimits({ write, entries, kit, pages, pathOf, stored }) {
  if (!write)
    return {
      status: 'not_run',
      reason: 'write_result_missing: nothing says which fields were written',
      findings: []
    }
  if (!entries?.size)
    return {
      status: 'not_run',
      reason: 'write_order_missing: the write result holds no write order',
      findings: []
    }
  const shown = pages.filter((p) => p.status === 200 && p.tree)
  const findings = []
  const seen = new Set()
  let measured = 0
  const notLocated = []
  for (const op of write.ops)
    for (const v of list(op.values)) {
      const hit = entries.get(v.entry)
      if (!hit || hit.entry.type !== 'text' || typeof v.value !== 'string' || seen.has(v.entry)) continue
      seen.add(v.entry)
      const limit = limitOf(kit, hit)
      if (!limit) continue
      const words = squash(visibleOf(v.value))
      const at = { entry: v.entry, place: hit.entry.place ?? null, block: hit.block, field: hit.entry.field }
      if (words) {
        const own = shown.filter((p) => p.path === pathOf.get(hit.page))
        const found = renderedLength(words, [own, shown])
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
      }
      const slot = v.loc?.slot
      if (stored && typeof slot === 'string' && typeof stored[slot] === 'string') {
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
  const notes = [`${measured} written text field(s) measured on the rendered pages`]
  if (notLocated.length)
    notes.push(
      `${notLocated.length} written text field(s) not found on any rendered page: ${notLocated.join(', ')}`
    )
  return { status: 'ran', notes, findings, notLocated }
}

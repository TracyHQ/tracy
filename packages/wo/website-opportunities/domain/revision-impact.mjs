// Which pages a plan revision makes the writer write again (ticket #599, spec #577 part 3). Pure.
//
// A page's copy is a function of its writer request (`writerRequestsOf`, the very message `callPage` sends): the site
// language, the name the site shows, the voice, the search limits, the page's own name and type, and per block its
// type, label, the plan data it shows (each fact or item as the writer reads it), the values its data fields show, its
// child list rows (a row naming a page reads that page's name) and the fields it asks for. A service renamed changes
// the data view of every block that shows it, so every page holding such a block is written again; a page whose
// request is the same keeps its words and takes NO model call. The dependency is read from the plan, the needs profile
// and the block store through the writer's own request builder, never by searching the copy for the old words.
//
// Reasons that do not come from the request:
//   - `held_text_in_copy`: the copy a page would keep names a text the owner now holds (a held person, the held
//     business name), on any leaf and in any form (`revision-text-forms.mjs`): the page is written again, whatever its
//     request (a privacy rule; the write step's `held_text_in_value` guard still holds the whole site after it);
//   - `old_text_in_copy` (`old_text_in_copy:short` for a weak match): a kept block quotes a value the revision changed
//     or took away, seen by the writer in another block (`revision-old-values.mjs`): that block is written again; a
//     page whose search texts quote one is written whole;
//   - `copy_missing`, `prompt_changed`: the previous build kept no words for the page (or not every field its request
//     asks), or wrote them with another prompt: written again.
// With no previous copy at all, every page is written again (`full: {why: 'previous_copy_missing'}`).
//
// `removals` lists what the revision takes off the site: a page, a block, a block whose data list is emptied (it is
// no longer placed), an item. No measured door removes a record, so the plan step stops on any of them.
import { writerContextOf, writerRequestsOf } from './page-writer-context.mjs'
import { withoutWithheld } from './plan-withheld.mjs'
import { oldValuesNamedIn } from './revision-old-forms.mjs'
import { oldTextHitsOf, oldValuesOf } from './revision-old-values.mjs'
import { heldFormsOf, namesAnyIn } from './revision-text-forms.mjs'
import { makesRecord } from './revision-write-delta.mjs'

export const REVISION_IMPACT_SCHEMA = 'tracy-revision-impact/v1'
const list = (value) => (Array.isArray(value) ? value : [])
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
/** The site wide parts of a request, each with the reason a change of it gives every page. */
const SITE_PARTS = [
  ['language', 'site:language'],
  ['business', 'site:name'],
  ['voice', 'site:voice'],
  ['seo', 'site:seo']
]

/** Why one block's writer input changed: each data id whose view changed, then each other part that changed. */
function blockReasons(before, after, held) {
  if (!before) return ['block:added']
  const views = (block) => new Map(list(block.data).map((d) => [d.id, d]))
  const [a, b] = [views(before), views(after)]
  const reasons = [...new Set([...a.keys(), ...b.keys()])]
    .filter((id) => !same(a.get(id), b.get(id)))
    // An id may be a slug of a held name: it is named `data:held`, never as it is.
    .map((id) => (held.length && namesAnyIn(id, held) ? 'data:held' : `data:${id}`))
  if (reasons.length === 0 && !same([...a.keys()], [...b.keys()])) reasons.push('data:order')
  for (const part of ['type', 'label', 'shows', 'rows', 'fields'])
    if (!same(before[part], after[part])) reasons.push(part)
  return reasons
}

/** The writer's words a previous build kept for a page: its written fields by key and its search texts. */
export function keptWordsOf(page) {
  const values = {}
  for (const f of list(page?.fields))
    if (f.from === 'writer' && f.value !== undefined) values[f.key] = f.value
  return { values, ...(page?.seo ? { seo: page.seo } : {}) }
}

/**
 * What the revision takes off the site: pages, blocks (removed, or their data list emptied) and the items the previous
 * build made a record for (an operation of a kind that makes a record, keyed `<kind>:<item id>`, in its ops record).
 */
export function removalsOf(previousPlan, nextPlan, previousOps = []) {
  const ids = (plan) => new Set(list(plan?.pages).map((p) => p.id))
  const blocks = (plan) =>
    new Map(list(plan?.pages).flatMap((p) => list(p.blocks).map((b) => [b.id, { page: p.id, b }])))
  const nextPages = ids(nextPlan)
  const nextBlocks = blocks(nextPlan)
  const out = { pages: [...ids(previousPlan)].filter((id) => !nextPages.has(id)), blocks: [], items: [] }
  for (const [id, { page, b }] of blocks(previousPlan)) {
    if (!nextPages.has(page)) continue
    const now = nextBlocks.get(id)?.b
    if (!now) out.blocks.push({ page, block: id, why: 'block:removed' })
    else if (list(b.data).length > 0 && list(now.data).length === 0)
      out.blocks.push({ page, block: id, why: 'data:emptied' })
  }
  const items = new Set(list(nextPlan?.items).map((i) => i.id))
  const made = (id) =>
    list(previousOps).some((o) => makesRecord(o?.kind) && String(o?.key).endsWith(`:${id}`))
  out.items = list(previousPlan?.items)
    .map((i) => i.id)
    .filter((id) => !items.has(id) && made(id))
  return out
}
export const hasRemovals = (r) => Boolean(r && (r.pages.length || r.blocks.length || r.items.length))

/** Whether a kept page lacks a field the previous request asked for (a broken or partial copy): written whole. */
const keptIncomplete = (words, request) =>
  list(request.blocks).some((b) => list(b.fields).some((f) => !Object.hasOwn(words.values, f.key)))

/**
 * @param {{previous: {plan: object, profile: object, copy?: {pages: object[], prompt?: {sha256: string}} | null,
 *   replies?: Array<{key: string, reply: unknown}>, ops?: object[]},
 *   next: {plan: object, profile: object}, blockStore: object, library?: object[], mapping?: object,
 *   promptSha256?: string}} input the gated profiles (with `withheld`); the writer reads them without what is held
 * @returns {{schema: string, full: {why: string} | null, write: Array<{page: string, reasons: string[]}>,
 *   reuse: string[], blocks: Array<{page: string, block: string, reasons: string[]}>,
 *   unaffected: Array<{page: string, block: string}>, removed: string[], removals: object, staleReplies: string[]}} `write`: the pages written again (one model
 *   call each); `reuse`: the pages that keep their words; `blocks`: the blocks whose writer input changed;
 *   `unaffected`: the blocks with copy fields whose input did not; `removed`: pages of the previous plan no longer there
 */
export function revisionImpactOf({ previous, next, blockStore, library = [], mapping, promptSha256 }) {
  const requests = (side) =>
    writerRequestsOf(
      side.plan,
      writerContextOf({ profile: withoutWithheld(side.profile), blockStore, library, mapping })
    )
  const before = requests(previous)
  const after = requests(next)
  const kept = new Map(list(previous.copy?.pages).map((p) => [p.id, p]))
  const held = heldFormsOf(next.profile?.withheld)
  const full = previous.copy ? null : { why: 'previous_copy_missing' }
  const prompt = previous.copy?.prompt?.sha256 && promptSha256 && previous.copy.prompt.sha256 !== promptSha256
  const out = {
    schema: REVISION_IMPACT_SCHEMA,
    full,
    write: [],
    reuse: [],
    blocks: [],
    unaffected: [],
    removed: [],
    removals: removalsOf(previous.plan, next.plan, previous.ops)
  }
  out.removed = out.removals.pages
  const pageReasons = new Map()
  for (const [id, request] of after) {
    const old = before.get(id)
    const reasons = []
    const words = kept.get(id)
    if (full) reasons.push(full.why)
    else if (prompt) reasons.push('prompt_changed')
    else if (!words || (old && keptIncomplete(keptWordsOf(words), old))) reasons.push('copy_missing')
    if (!old) {
      reasons.push('page:added')
      for (const block of request.blocks)
        out.blocks.push({ page: id, block: block.id, reasons: ['page:added'] })
    } else {
      for (const [part, why] of SITE_PARTS) if (!same(old[part], request[part])) reasons.push(why)
      if (!same(old.page, request.page)) reasons.push('page:name')
      const olds = new Map(old.blocks.map((b) => [b.id, b]))
      for (const block of request.blocks) {
        const why = [...new Set(blockReasons(olds.get(block.id), block, held))]
        if (why.length) out.blocks.push({ page: id, block: block.id, reasons: why })
        else out.unaffected.push({ page: id, block: block.id })
      }
      for (const gone of old.blocks.filter((b) => !request.blocks.some((x) => x.id === b.id))) {
        out.blocks.push({ page: id, block: gone.id, reasons: ['block:removed'] })
      }
      if (out.blocks.some((b) => b.page === id)) reasons.push('blocks')
    }
    if (held.length && words && namesAnyIn(flatWords(words), held)) reasons.push('held_text_in_copy')
    pageReasons.set(id, reasons)
  }
  // A kept block that quotes a changed or removed value is written again, whatever its request.
  const live = new Map([...kept].filter(([id]) => after.has(id) && before.has(id)))
  const oldValues = oldValuesOf(previous, next, before, after)
  // A kept model reply (a picture label, an icon ranking) that names an old value or a held text is asked again.
  out.staleReplies = list(previous.replies)
    .filter(
      (r) => oldValuesNamedIn(r?.reply ?? null, oldValues).length > 0 || namesAnyIn(r?.reply ?? null, held)
    )
    .map((r) => r.key)
  for (const hit of oldTextHitsOf(live, oldValues)) {
    const reasons = pageReasons.get(hit.page)
    if (hit.seo) reasons.push(hit.seo)
    for (const [block, why] of hit.blocks) {
      if (!after.get(hit.page).blocks.some((b) => b.id === block)) continue
      const entry = out.blocks.find((b) => b.page === hit.page && b.block === block)
      if (entry) entry.reasons = [...new Set([...entry.reasons, why])]
      else out.blocks.push({ page: hit.page, block, reasons: [why] })
      out.unaffected = out.unaffected.filter((u) => !(u.page === hit.page && u.block === block))
      reasons.push('blocks')
    }
  }
  for (const [id, reasons] of pageReasons)
    if (reasons.length) out.write.push({ page: id, reasons: [...new Set(reasons)] })
    else out.reuse.push(id)
  return out
}

/** Every text a kept page shows: its written fields and its search texts. */
function flatWords(page) {
  const { values, seo } = keptWordsOf(page)
  return {
    ...values,
    ...(seo?.title ? { 'seo.title': seo.title } : {}),
    ...(seo?.description ? { 'seo.description': seo.description } : {})
  }
}

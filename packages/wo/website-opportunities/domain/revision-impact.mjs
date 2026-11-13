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
// Two reasons do not come from the request:
//   - `held_text_in_copy`: the copy a page would keep names a text the owner now holds (a held person, the held
//     business name), in any form: the page is written again, whatever its request (a privacy rule; the write step's
//     `held_text_in_value` guard still holds the whole site after it);
//   - `copy_missing`, `prompt_changed`: the previous build kept no words for the page, or wrote them with another
//     prompt: written again.
// With no previous copy at all, every page is written again (`full: {why: 'previous_copy_missing'}`).
import { writerContextOf, writerRequestsOf } from './page-writer-context.mjs'
import { heldTextsOf, namesHeldInAnyForm, withoutWithheld } from './plan-withheld.mjs'

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
    .map((id) => (held.length && namesHeldInAnyForm([id], held) ? 'data:held' : `data:${id}`))
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
 * @param {{previous: {plan: object, profile: object, copy?: {pages: object[], prompt?: {sha256: string}} | null},
 *   next: {plan: object, profile: object}, blockStore: object, library?: object[], mapping?: object,
 *   promptSha256?: string}} input the gated profiles (with `withheld`); the writer reads them without what is held
 * @returns {{schema: string, full: {why: string} | null, write: Array<{page: string, reasons: string[]}>,
 *   reuse: string[], blocks: Array<{page: string, block: string, reasons: string[]}>,
 *   unaffected: Array<{page: string, block: string}>, removed: string[]}} `write`: the pages written again (one model
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
  const held = heldTextsOf(next.profile?.withheld)
  const full = previous.copy ? null : { why: 'previous_copy_missing' }
  const prompt = previous.copy?.prompt?.sha256 && promptSha256 && previous.copy.prompt.sha256 !== promptSha256
  const out = {
    schema: REVISION_IMPACT_SCHEMA,
    full,
    write: [],
    reuse: [],
    blocks: [],
    unaffected: [],
    removed: []
  }
  out.removed = list(previous.plan?.pages)
    .map((p) => p.id)
    .filter((id) => !list(next.plan.pages).some((p) => p.id === id))
  for (const [id, request] of after) {
    const old = before.get(id)
    const reasons = []
    if (full) reasons.push(full.why)
    else if (prompt) reasons.push('prompt_changed')
    else if (!kept.has(id)) reasons.push('copy_missing')
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
    const words = kept.get(id)
    if (held.length && words && namesHeldInAnyForm(Object.values(flatWords(words)), held))
      reasons.push('held_text_in_copy')
    if (reasons.length) out.write.push({ page: id, reasons: [...new Set(reasons)] })
    else out.reuse.push(id)
  }
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

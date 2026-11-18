// What a change request keeps as it was (ticket #617). The revised plan is composed again by the same code as a first
// plan (`plan-gate.mjs`): placement, rows, pictures, look and the left out list are worked out afresh. What the
// customer settled before is put back by code, never left to the model:
// - every fact and item the current plan leaves out stays left out with its reason, unless a change shows it, so the
//   gate's placement never brings back what the customer or the first plan kept off (`carriedLeftOutOf`); what the
//   customer took off with a plan edit (shown nowhere, in no entry) is left out as asked (`REQUESTED_OFF_REASON`);
// - left out entries no rule writes again (sections left out, what the customer keeps private, a contact method chosen
//   without its value, a page the customer asked to remove) are carried; a section entry whose reason names a page the
//   request removed ("shown on the trainers page") is carried with `STALE_PAGE_REASON`, as its own reason no longer
//   holds. The other pages the plan does not keep are listed again by code (`plan-left-out-pages.mjs`), so none is
//   carried; a page the customer removed carries its page type (`params.pageType`, code `page_removed`), so code
//   never lists it twice (`removedTypes`, the gate's `removedPageTypes`);
// - the model's own assumption lines are carried; one whose page or section the revision removed is dropped, with no
//   line (an assumption explains a part of the plan, and that part is gone);
// - the ids of every page and section the revision keeps (`pagesOf`, `givenIds`);
// - the language, the look fields, the item labels, the search terms the owner added and took off (#575) and a
//   pictures count the customer changed on the plan card (`settleRevisedPlan`). Fact values need nothing: a plan
//   edit writes them into the needs profile the revision is composed from. A request cannot change any of these: they are changed on the plan card. A look field put back is
//   the customer's own choice, so the template look rules (`lookProblemsOf`) hold for every other look field and line
//   of the revised plan (`settledLookProblems`), never against the customer's choice.
// Pure.
import { lookProblemsOf } from './brand-look-problems.mjs'
import { rowDataIdsOf } from './plan-accounting.mjs'
import { CONTACT_VALUE_MISSING_REASON } from './plan-answers.mjs'
import { generatedOf, picturesOf } from './plan-look-pictures.mjs'
import { withSearchTerms } from './plan-intent-seo.mjs'
import { REMOVED_PAGE_DATA_CODE, REMOVED_PAGE_DATA_REASON } from './plan-request-apply.mjs'
import {
  REQUESTED_OFF_CODE,
  REQUESTED_OFF_REASON,
  leftOutEntryOf,
  namesOf
} from './plan-request-taken-off.mjs'
import { WITHHELD_REASON } from './plan-withheld.mjs'

export const REMOVED_PAGE_REASON = 'You asked to remove this page.'
export const REMOVED_PAGE_CODE = 'page_removed'
/** The reason of a left out page or section whose reason named a page the request removed. */
export const STALE_PAGE_REASON = 'It is not part of your plan.'
export const STALE_PAGE_CODE = 'no_longer_in_plan'
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Whether a reason names one of the removed pages ("the Trainers page", "the trainers page"). */
const namesRemoved = (reason, removedPages) =>
  removedPages.some((page) =>
    [page.name, page.pageType]
      .filter((n) => typeof n === 'string' && n !== '')
      .some((n) => new RegExp(`\\b${escaped(n)}\\s+page\\b`, 'i').test(String(reason)))
  )
/** The code of each reason a change gives what it takes off (`takenOff`), so the card says it by its code. */
const TAKEN_OFF_CODES = new Map([
  [REQUESTED_OFF_REASON, REQUESTED_OFF_CODE],
  [REMOVED_PAGE_DATA_REASON, REMOVED_PAGE_DATA_CODE]
])
const CARRIED_REASONS = new Set([WITHHELD_REASON, CONTACT_VALUE_MISSING_REASON])
const LOOK_KEYS = ['template', 'accent', 'accentDark', 'logo']
const list = (value) => (Array.isArray(value) ? value : [])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const shownOn = (pages) => new Set(list(pages).flatMap((p) => p.blocks.flatMap((b) => b.data)))

/**
 * The left out entries the revised composition carries: `{item, reason}` for every fact and item the current plan
 * leaves out that the changed pages do not show (`takenOff`: with the reason the change gives), and the entries no
 * rule writes again, as `{what, kind, reason}`.
 * @returns {{composition: object[], context: object[], codes: Map<string, string>, removedTypes: Set<string>}}
 *   `composition`: model style entries naming an item; `context`: entries the gate adds as they are; `codes`: the code
 *   of each carried item's entry; `removedTypes`: the page types the customer removed, which the plan does not keep
 */
export function carriedLeftOutOf({ plan, data, pages, takenOff, removedPages, fresh = new Set() }) {
  const before = new Set([...shownOn(plan.pages), ...rowDataIdsOf(plan.pages)])
  const after = shownOn(pages)
  const used = new Set()
  const composition = []
  const codes = new Map()
  for (const [id, record] of data.byId) {
    // A value the owner typed in this request (`fresh`) is new data, placed by the gate as a first plan's.
    if (record.itemField || data.withheld?.has(id) || after.has(id) || fresh.has(id)) continue
    if (takenOff.has(id)) {
      composition.push({ item: id, reason: takenOff.get(id) })
      if (TAKEN_OFF_CODES.has(takenOff.get(id))) codes.set(id, TAKEN_OFF_CODES.get(takenOff.get(id)))
      continue
    }
    if (before.has(id)) continue
    const entry = leftOutEntryOf(plan, namesOf(plan, record, id), used)
    if (entry) used.add(entry)
    composition.push({ item: id, reason: entry?.reason ?? REQUESTED_OFF_REASON })
    // The entry's code goes beside the composition (whose entries have the model's shape), so a carried sentence code
    // wrote keeps its code instead of reading as `model_reason`. An entry of a plan stored before its sentence had a
    // code is read by its exact sentence in the gate (`withSentenceCodes`).
    const code = entry ? entry.code : REQUESTED_OFF_CODE
    if (code) codes.set(id, code)
  }
  const names = new Set(pages.map((p) => p.name))
  const types = new Set(pages.map((p) => p.pageType))
  const removedOf = (e) =>
    e.kind === 'page' && e.code === REMOVED_PAGE_CODE && !types.has(e.params?.pageType)
      ? e.params.pageType
      : null
  const context = list(plan.leftOut)
    .filter(
      (e) =>
        !used.has(e) &&
        (CARRIED_REASONS.has(e.reason) || (e.kind === 'block' && !names.has(e.what)) || removedOf(e) !== null)
    )
    .map((e) =>
      !CARRIED_REASONS.has(e.reason) && namesRemoved(e.reason, removedPages)
        ? { ...e, reason: STALE_PAGE_REASON, code: STALE_PAGE_CODE }
        : e
    )
  for (const page of removedPages)
    context.push({
      what: page.name,
      kind: 'page',
      reason: REMOVED_PAGE_REASON,
      code: REMOVED_PAGE_CODE,
      params: { pageType: page.pageType }
    })
  const removedTypes = new Set(context.map(removedOf).filter((type) => type !== null))
  return { composition, context, codes, removedTypes }
}

/**
 * The model's assumption lines of the current plan, as the composition carries them: one whose page or section the
 * changes removed is dropped (`pages`: the working pages, each page and block with its plan id as `origin`).
 */
export const carriedAssumptionsOf = (plan, pages) =>
  list(plan.assumptions)
    .filter((a) => /^model-\d+$/.test(a.id) && resolves(a.field, pages))
    .map(({ field, said }) => ({ field, said }))

/** Whether an assumption's field names a page and a section the working pages have (or names none). */
function resolves(field, pages) {
  const m = /^pages\[([^\]]+)\](?:\.blocks\[([^\]]+)\])?/.exec(String(field))
  if (!m) return true
  const page = pages.find((p) => p.origin === m[1])
  return Boolean(page) && (m[2] === undefined || page.blocks.some((b) => b.origin === m[2]))
}

/**
 * The look of the revision: the look a first composition gives (`lookOf`, recomputed), with every field the current
 * plan holds otherwise kept, for that is a field the customer changed on the plan card.
 */
function settledLookOf(recomputed, current) {
  const look = { ...recomputed }
  for (const key of LOOK_KEYS) {
    if (!current || same(current[key], recomputed[key])) continue
    if (current[key] === undefined) delete look[key]
    else look[key] = structuredClone(current[key])
  }
  return look
}

/** Exact duplicates out of a left out list, in order. */
const uniqueEntries = (entries) => {
  const seen = new Set()
  return entries.filter((e) => {
    const key = JSON.stringify([e.what, e.kind, e.reason])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * The gated plan made the next revision of the current plan: its id and revision, the look fields and item labels
 * the customer changed, a pictures count the customer lowered (as `plan-edit-gate.mjs` keeps it), no duplicate left out entry.
 */
export function settleRevisedPlan(revised, current, blocks, data) {
  const next = { ...revised, id: current.id, revision: current.revision + 1 }
  next.look = settledLookOf(revised.look, current.look)
  const labels = new Map(list(current.items).map((i) => [i.id, i.label]))
  next.items = revised.items.map((i) => (labels.has(i.id) ? { ...i, label: labels.get(i.id) } : i))
  const was = current.pictures?.generated?.frames
  const counted = picturesOf(current.pages, blocks, data).pictures.generated.frames
  const now = next.pictures.generated.frames
  if (Number.isInteger(was) && was < counted && was < now)
    next.pictures = {
      ...next.pictures,
      generated: generatedOf(was)
    }
  next.leftOut = uniqueEntries(next.leftOut)
  next.pages = withOwnerTermMarks(next.pages, current.pages, data)
  return next
}

/**
 * The revised pages with the search terms the owner added and took off on the plan card (#575, `seo.ownerAdded`,
 * `seo.ownerRemoved`) kept on each page the revision keeps: the terms are made again from the data, the owner's marks
 * applied, as after a plan edit (`plan-intent-seo.mjs`). The composer reads a page's intent without the marks, so a
 * revision put every term the owner took off back on the page and dropped every term the owner typed.
 */
function withOwnerTermMarks(pages, currentPages, data) {
  const marks = new Map()
  for (const page of list(currentPages)) {
    const { ownerAdded, ownerRemoved } = page.seo ?? {}
    if (list(ownerAdded).length || list(ownerRemoved).length)
      marks.set(page.id, {
        ...(list(ownerAdded).length ? { ownerAdded: [...ownerAdded] } : {}),
        ...(list(ownerRemoved).length ? { ownerRemoved: [...ownerRemoved] } : {})
      })
  }
  if (!list(pages).some((p) => marks.has(p.id) && p.seo)) return pages
  const marked = pages.map((p) =>
    marks.has(p.id) && p.seo ? { ...p, seo: { ...p.seo, ...marks.get(p.id) } } : p
  )
  return withSearchTerms(marked, data)
}

/**
 * The template look problems of a settled revision (`lookProblemsOf`), but those of a look field the customer chose
 * on the plan card: the accent pair and the logo the customer set are theirs, not the template's look shown to them.
 */
export function settledLookProblems(settled, recomputedLook, current, context) {
  if (context.allowTemplateLook) return []
  const chosen = LOOK_KEYS.filter((key) => current.look && !same(current.look[key], recomputedLook?.[key]))
  const theirs = (at) =>
    (at === 'look.accent' && (chosen.includes('accent') || chosen.includes('accentDark'))) ||
    (at === 'look.logo' && chosen.includes('logo'))
  return lookProblemsOf({
    plan: settled,
    template: context.template,
    lookSources: context.lookSources
  }).filter((p) => !theirs(p.at))
}

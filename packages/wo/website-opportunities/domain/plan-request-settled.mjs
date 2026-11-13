// What a change request keeps as it was (ticket #617). The revised plan is composed again by the same code as a first
// plan (`plan-gate.mjs`): placement, rows, pictures, look and the left out list are worked out afresh. What the
// customer settled before is put back by code, never left to the model:
// - every fact and item the current plan leaves out stays left out with its reason, unless a change shows it, so the
//   gate's placement never brings back what the customer or the first plan kept off (`carriedLeftOutOf`); what the
//   customer took off with a plan edit (shown nowhere, in no entry) is left out as asked (`REQUESTED_OFF_REASON`);
// - left out entries no rule writes again (pages and sections left out, what the customer keeps private, a contact
//   method chosen without its value) are carried;
// - the model's own assumption lines are carried; one whose page or section the revision removed is dropped, with no
//   line (an assumption explains a part of the plan, and that part is gone);
// - the ids of every page and section the revision keeps (`pagesOf`, `givenIds`);
// - the language, the look fields, the item labels and a pictures count the customer changed on the plan card
//   (`settleRevisedPlan`). Fact values need nothing: a plan edit writes them into the needs profile the revision is
//   composed from. A request cannot change any of these: they are changed on the plan card. A look field put back is
//   the customer's own choice, so the template look rules (`lookProblemsOf`) hold for every other look field and line
//   of the revised plan (`settledLookProblems`), never against the customer's choice.
// Pure.
import { lookProblemsOf } from './brand-look-problems.mjs'
import { rowDataIdsOf } from './plan-accounting.mjs'
import { CONTACT_VALUE_MISSING_REASON } from './plan-answers.mjs'
import { picturesOf } from './plan-look-pictures.mjs'
import { REQUESTED_OFF_REASON, leftOutEntryOf, namesOf } from './plan-request-taken-off.mjs'
import { WITHHELD_REASON } from './plan-withheld.mjs'

export const REMOVED_PAGE_REASON = 'You asked to remove this page.'
const CARRIED_REASONS = new Set([WITHHELD_REASON, CONTACT_VALUE_MISSING_REASON])
const LOOK_KEYS = ['template', 'accent', 'accentDark', 'logo']
const list = (value) => (Array.isArray(value) ? value : [])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const shownOn = (pages) => new Set(list(pages).flatMap((p) => p.blocks.flatMap((b) => b.data)))

/**
 * The left out entries the revised composition carries: `{item, reason}` for every fact and item the current plan
 * leaves out that the changed pages do not show (`takenOff`: with the reason the change gives), and the entries no
 * rule writes again, as `{what, kind, reason}`.
 * @returns {{composition: object[], context: object[]}} `composition`: model style entries naming an item; `context`:
 *   entries the gate adds as they are
 */
export function carriedLeftOutOf({ plan, data, pages, takenOff, removedPages }) {
  const before = new Set([...shownOn(plan.pages), ...rowDataIdsOf(plan.pages)])
  const after = shownOn(pages)
  const used = new Set()
  const composition = []
  for (const [id, record] of data.byId) {
    if (record.itemField || data.withheld?.has(id) || after.has(id)) continue
    if (takenOff.has(id)) {
      composition.push({ item: id, reason: takenOff.get(id) })
      continue
    }
    if (before.has(id)) continue
    const entry = leftOutEntryOf(plan, namesOf(plan, record, id), used)
    if (entry) used.add(entry)
    composition.push({ item: id, reason: entry?.reason ?? REQUESTED_OFF_REASON })
  }
  const names = new Set(pages.map((p) => p.name))
  const context = list(plan.leftOut).filter(
    (e) =>
      !used.has(e) &&
      (CARRIED_REASONS.has(e.reason) || ((e.kind === 'page' || e.kind === 'block') && !names.has(e.what)))
  )
  for (const page of removedPages)
    context.push({ what: page.name, kind: 'page', reason: REMOVED_PAGE_REASON })
  return { composition, context }
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
      generated: was > 0 ? { ...next.pictures.generated, frames: was } : { frames: 0 }
    }
  next.leftOut = uniqueEntries(next.leftOut)
  return next
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

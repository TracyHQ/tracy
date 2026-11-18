// The plan card's structured operations (#575): the owner takes a part off the plan with one click, and brings it back
// the same way. Pure code, no model: each operation is a fixed change of the plan's structure, and the plan operation
// gate (`plan-edit-gate.mjs` `gateOperatedPlan`) holds the result to every rule an edit is held to.
//
// It inherits the step chain's Profile card (#537, `owner-fact-picks.js`, `business-reading.mjs`): there the owner
// removes a key message and restores it (`nextReadingPicks`, `withKeyMessagePicks`, the removed ones listed as such
// on the card). The step chain had no edit of the plan's structure, so the same idea is applied to the plan: what the
// owner removes is kept in a removal record beside the plan (the review, never the plan), so a restore puts back
// exactly what was taken, where it was.
//
// A removal record is `{id, op, target, taken, assumptions, leftOut}`: `target` names what was taken (`page`, `block`,
// `item`, `message`, `fact`, `later`), `taken` holds every piece the operation took out of the plan and where each was
// (`after`: the ids before it, nearest first; `before`: the ids after it, nearest first), `assumptions` the
// assumptions that named a part taken with it, and `leftOut` the left out entries it added, code `owner_removed`
// (`OWNER_REMOVED`), with `params.removal` its id: the data the removal leaves shown nowhere, and the part itself. A
// restore removes those entries and puts each piece back between its nearest neighbours still there; pieces brought
// back between the same neighbours keep the order of the review's original plan.
import { parseFieldPath, resolveFieldPath } from './build-contract-shared.mjs'
import { CONTACT_CHANNEL_KINDS } from './plan-placement-facts.mjs'
import { itemCountOf, planLocksOf } from './plan-operation-locks.mjs'

/** The left out code of a part the owner took off the plan at plan review (never `owner_withheld`, a brief's hold). */
export const OWNER_REMOVED = 'owner_removed'
export const OWNER_REMOVED_REASON = 'You took this off the plan.'

const list = (value) => (Array.isArray(value) ? value : [])
const idOf = (x) => x?.id

/** The owner's sentence of each refusal code; the card says it in the owner's language by the code. */
export const OPERATION_REFUSALS = Object.freeze({
  first_page: 'The first page of your site stays: every other page leads back to it.',
  privacy_page: 'This page is your privacy page, so it stays.',
  main_block: 'This section is the main section of its page, so it stays while the page does.',
  site_chrome: 'This section is shared by every page of your site, so it cannot leave one page.',
  end_action: 'Your page ends on this section, so it stays.',
  main_button: 'Your main button uses this, so it stays.',
  too_few_items: 'This section needs at least {min} of these, so this one stays.',
  block_empty: 'This is the last thing this section shows. Remove the whole section instead.',
  not_in_footer: 'This is not shown in the footer of your pages.',
  not_a_channel: 'Only a way to contact you can be taken off the footer.',
  not_an_item: 'Only a service, a person, a photo or a review can be taken off a section.',
  needed_by_privacy_page: 'Your privacy page needs this, so it stays.',
  needed_by_end_action: 'The end of a page leads to this, so it stays.',
  not_found: 'This is no longer on your plan.',
  removal_unknown: 'There is nothing to bring back here.',
  restore_target_gone: 'This goes back into something you removed after it. Bring that back first.'
})

/** One coded refusal of an operation, in the owner's words. */
export const operationRefusal = (code, at, params = {}) => ({
  code,
  at,
  message: OPERATION_REFUSALS[code].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? '')),
  ...(Object.keys(params).length ? { params } : {})
})
const refused = (code, at, params = {}) => ({ problems: [operationRefusal(code, at, params)] })

/** Where the piece at `index` of `ids` was: the ids before it and after it, each nearest first. */
const before = (ids, index) => ({ after: ids.slice(0, index).reverse(), before: ids.slice(index + 1) })

/**
 * Insert `value` (key `key`) between the nearest of its neighbours (`place`) still in `values`. Pieces brought back
 * there since are ordered by `original` (the keys of the same list in the review's original plan), when it holds both.
 */
function insertAt(values, value, place, keyOf = idOf, original = []) {
  const keys = values.map(keyOf)
  const anchor = place.after.find((k) => keys.includes(k))
  const start = anchor === undefined ? 0 : keys.indexOf(anchor) + 1
  const next = place.before.find((k) => keys.indexOf(k) >= start)
  const end = next === undefined ? keys.length : keys.indexOf(next)
  const mine = original.indexOf(keyOf(value))
  let at = end
  for (let i = start; i < end; i++) {
    const theirs = original.indexOf(keys[i])
    if (mine >= 0 && theirs > mine) {
      at = i
      break
    }
  }
  values.splice(at, 0, value)
}
const self = (x) => x

/** The ids some page shows: its blocks' data, the rows of their lists, the facts of a trade block. */
function shownIdsOf(plan) {
  const shown = new Set()
  const rows = (lists) => {
    for (const l of list(lists))
      for (const r of list(l?.rows)) {
        if (typeof r?.data === 'string') shown.add(r.data)
        rows(r?.lists)
      }
  }
  for (const page of list(plan.pages))
    for (const block of list(page.blocks)) {
      for (const id of [...list(block.data), ...list(block.factIds)]) shown.add(id)
      rows(block.lists)
    }
  return shown
}

/** The left out entry of one fact or item the removal leaves shown nowhere. */
function dataEntryOf(plan, id, removal) {
  const fact = list(plan.facts).find((f) => f.id === id)
  const item = fact ? null : list(plan.items).find((i) => i.id === id)
  if (!fact && !item) return null
  return {
    what: (fact ?? item).label,
    kind: fact ? 'feature' : 'item',
    reason: OWNER_REMOVED_REASON,
    code: OWNER_REMOVED,
    item: id,
    params: { removal }
  }
}

/** The left out entries of a removal: the part itself (when it is one), then the data it leaves shown nowhere. */
function leftOutOf(next, prior, part, removal) {
  const after = shownIdsOf(next)
  const lost = [...shownIdsOf(prior)].filter((id) => !after.has(id))
  const entries = [
    ...(part ? [{ ...part, reason: OWNER_REMOVED_REASON, code: OWNER_REMOVED, params: { removal } }] : []),
    ...lost.map((id) => dataEntryOf(prior, id, removal)).filter(Boolean)
  ]
  next.leftOut = [...list(next.leftOut), ...entries]
  return entries
}

const findPage = (plan, id) => list(plan.pages).find((p) => p.id === id)
const findBlock = (page, id) => list(page?.blocks).find((b) => b.id === id)

function removePage(plan, { page: pageId }, locks, removal) {
  const index = list(plan.pages).findIndex((p) => p.id === pageId)
  if (index < 0) return refused('not_found', `pages[${pageId}]`)
  if (locks.pages[pageId]) return refused(locks.pages[pageId], `pages[${pageId}]`)
  const next = structuredClone(plan)
  const [page] = next.pages.splice(index, 1)
  const taken = { page, place: before(plan.pages.map(idOf), index) }
  const leads = list(next.notFound?.leadsTo)
  const at = leads.indexOf(pageId)
  if (at >= 0) {
    taken.leadsTo = before(leads, at)
    next.notFound.leadsTo = leads.filter((id) => id !== pageId)
  }
  const part = { what: page.name, kind: 'page' }
  return { plan: next, taken, leftOut: leftOutOf(next, plan, part, removal) }
}

function removeBlock(plan, { page: pageId, block: blockId }, locks, removal) {
  const page = findPage(plan, pageId)
  const index = list(page?.blocks).findIndex((b) => b.id === blockId)
  if (index < 0) return refused('not_found', `pages[${pageId}].blocks[${blockId}]`)
  if (locks.blocks[blockId]) return refused(locks.blocks[blockId], `pages[${pageId}].blocks[${blockId}]`)
  const next = structuredClone(plan)
  const [block] = findPage(next, pageId).blocks.splice(index, 1)
  const taken = { page: pageId, block, place: before(page.blocks.map(idOf), index) }
  const part = { what: block.label, kind: 'block' }
  return { plan: next, taken, leftOut: leftOutOf(next, plan, part, removal) }
}

function removeItem(plan, { page: pageId, block: blockId, item }, locks, removal) {
  const block = findBlock(findPage(plan, pageId), blockId)
  const at = `pages[${pageId}].blocks[${blockId}].data`
  const index = list(block?.data).indexOf(item)
  if (index < 0) return refused('not_found', at)
  if (!list(plan.items).some((i) => i.id === item)) return refused('not_an_item', at)
  if (block.data.length === 1 && block.basis !== 'trade') return refused('block_empty', at)
  const min = locks.minItems[blockId] ?? 0
  if (itemCountOf(block, plan) - 1 < min) return refused('too_few_items', at, { min })
  const next = structuredClone(plan)
  findBlock(findPage(next, pageId), blockId).data.splice(index, 1)
  const taken = { page: pageId, block: blockId, item, place: before(block.data, index) }
  return { plan: next, taken, leftOut: leftOutOf(next, plan, null, removal) }
}

function removeKeyMessage(plan, { message: id }, _locks, removal) {
  const index = list(plan.keyMessages).findIndex((m) => m.id === id)
  if (index < 0) return refused('not_found', `keyMessages[${id}]`)
  const next = structuredClone(plan)
  const [message] = next.keyMessages.splice(index, 1)
  if (next.keyMessages.length === 0) delete next.keyMessages
  const carries = []
  for (const page of next.pages)
    for (const block of page.blocks) {
      const at = list(block.carries).indexOf(id)
      if (at < 0) continue
      carries.push({ page: page.id, block: block.id, place: before(block.carries, at) })
      block.carries = block.carries.filter((c) => c !== id)
      if (block.carries.length === 0) delete block.carries
    }
  const taken = { message, place: before(plan.keyMessages.map(idOf), index), carries }
  const part = { what: message.label, kind: 'feature' }
  return { plan: next, taken, leftOut: leftOutOf(next, plan, part, removal) }
}

function removeChannel(plan, { fact: id }, locks, removal) {
  const fact = list(plan.facts).find((f) => f.id === id)
  if (!fact) return refused('not_found', `facts[${id}]`)
  if (!CONTACT_CHANNEL_KINDS.includes(fact.kind)) return refused('not_a_channel', `facts[${id}]`)
  if (locks.facts[id]) return refused(locks.facts[id], `facts[${id}]`)
  const next = structuredClone(plan)
  const blocks = []
  for (const page of next.pages)
    for (const block of page.blocks) {
      const at = block.data.indexOf(id)
      if (block.type !== 'footer' || at < 0) continue
      if (block.data.length === 1) return refused('block_empty', `pages[${page.id}].blocks[${block.id}].data`)
      blocks.push({ page: page.id, block: block.id, place: before(block.data, at) })
      block.data.splice(at, 1)
    }
  if (blocks.length === 0) return refused('not_in_footer', `facts[${id}]`)
  const legal = []
  for (const page of list(next.legalPages)) {
    const at = list(page.factIds).indexOf(id)
    if (at < 0) continue
    if (page.factIds.length === 1) return refused('needed_by_privacy_page', `facts[${id}]`)
    legal.push({ kind: page.kind, place: before(page.factIds, at) })
    page.factIds.splice(at, 1)
  }
  const ends = []
  for (const page of next.pages) {
    const at = list(page.endAction?.factIds).indexOf(id)
    if (at < 0) continue
    if (page.endAction.factIds.length === 1) return refused('needed_by_end_action', `facts[${id}]`)
    ends.push({ page: page.id, place: before(page.endAction.factIds, at) })
    page.endAction.factIds.splice(at, 1)
  }
  const taken = { fact: id, blocks, legal, ends }
  return { plan: next, taken, leftOut: leftOutOf(next, plan, null, removal) }
}

function removeLater(plan, { later: code }, _locks, removal) {
  const index = list(plan.later).findIndex((e) => e.code === code)
  if (index < 0) return refused('not_found', `later[${code}]`)
  const next = structuredClone(plan)
  const [entry] = next.later.splice(index, 1)
  if (next.later.length === 0) delete next.later
  const taken = {
    entry,
    place: before(
      plan.later.map((e) => e.code),
      index
    )
  }
  const part = { what: entry.what, kind: 'feature' }
  return { plan: next, taken, leftOut: leftOutOf(next, plan, part, removal) }
}

const REMOVERS = Object.freeze({
  'remove-page': [removePage, 'page'],
  'remove-block': [removeBlock, 'block'],
  'remove-item': [removeItem, 'item'],
  'remove-key-message': [removeKeyMessage, 'message'],
  'remove-channel': [removeChannel, 'fact'],
  'remove-later': [removeLater, 'later']
})

/**
 * Take a part off the plan. The revision is the gate's to raise.
 * @param {object} plan a Contract B plan
 * @param {{op: string}} operation a remove operation (`PLAN_OPERATIONS`)
 * @param {{kit: object, removal: string}} context `kit`: the plan's kit (`planLocksOf`); `removal`: the record's id
 * @returns {{plan: object, removal: object} | {problems: Array<{code: string, at: string, message: string}>}}
 */
export function removeFromPlan(plan, operation, { kit, removal }) {
  const [remove, key] = REMOVERS[operation?.op] ?? []
  if (!remove) return refused('removal_unknown', 'operation.op')
  const done = remove(plan, operation, planLocksOf(plan, kit), removal)
  if (done.problems) return done
  // An assumption names a part of the plan by its field path: one whose part went with the removal goes with it.
  const assumptions = []
  const kept = []
  list(done.plan.assumptions).forEach((a, i) => {
    const path = parseFieldPath(a?.field)
    if (path && !resolveFieldPath(done.plan, path).found)
      assumptions.push({ assumption: a, place: before(list(done.plan.assumptions).map(idOf), i) })
    else kept.push(a)
  })
  done.plan.assumptions = kept
  const { op, ...target } = operation
  return {
    plan: done.plan,
    removal: {
      id: removal,
      op,
      target: { [key]: target[key], ...target },
      taken: done.taken,
      assumptions,
      leftOut: done.leftOut
    }
  }
}

/** Remove from `entries` the first entry deeply equal to each of `taken`. */
function withoutEntries(entries, taken) {
  const out = [...entries]
  for (const entry of taken) {
    const key = JSON.stringify(entry)
    const at = out.findIndex((e) => JSON.stringify(e) === key)
    if (at >= 0) out.splice(at, 1)
  }
  return out
}

/** Put the pieces of one removal back into `next` (a copy); false when the place they go back to is gone. */
function putBack(next, { op, taken }, base) {
  const o = base ?? {}
  if (op === 'remove-page') {
    insertAt(next.pages, taken.page, taken.place, idOf, list(o.pages).map(idOf))
    if (taken.leadsTo && next.notFound)
      insertAt(next.notFound.leadsTo, taken.page.id, taken.leadsTo, self, list(o.notFound?.leadsTo))
    return true
  }
  if (op === 'remove-block') {
    const page = findPage(next, taken.page)
    if (!page) return false
    insertAt(page.blocks, taken.block, taken.place, idOf, list(findPage(o, taken.page)?.blocks).map(idOf))
    return true
  }
  if (op === 'remove-item') {
    const block = findBlock(findPage(next, taken.page), taken.block)
    if (!block) return false
    insertAt(
      block.data,
      taken.item,
      taken.place,
      self,
      list(findBlock(findPage(o, taken.page), taken.block)?.data)
    )
    return true
  }
  if (op === 'remove-key-message') {
    // Every section that carried it must be back first, or the restore could not be exact.
    if (taken.carries.some((c) => !findBlock(findPage(next, c.page), c.block))) return false
    next.keyMessages ??= []
    insertAt(next.keyMessages, taken.message, taken.place, idOf, list(o.keyMessages).map(idOf))
    for (const c of taken.carries) {
      const block = findBlock(findPage(next, c.page), c.block)
      block.carries ??= []
      const original = list(findBlock(findPage(o, c.page), c.block)?.carries)
      insertAt(block.carries, taken.message.id, c.place, self, original)
    }
    return true
  }
  if (op === 'remove-channel') {
    const blocks = taken.blocks.map((b) => [findBlock(findPage(next, b.page), b.block), b])
    if (blocks.some(([block]) => !block)) return false
    if (taken.ends.some((e) => !findPage(next, e.page)?.endAction)) return false
    for (const [block, b] of blocks)
      insertAt(block.data, taken.fact, b.place, self, list(findBlock(findPage(o, b.page), b.block)?.data))
    for (const l of taken.legal) {
      const page = list(next.legalPages).find((p) => p.kind === l.kind)
      const original = list(list(o.legalPages).find((p) => p.kind === l.kind)?.factIds)
      if (page?.factIds) insertAt(page.factIds, taken.fact, l.place, self, original)
    }
    for (const e of taken.ends) {
      const end = findPage(next, e.page)?.endAction
      if (end?.factIds)
        insertAt(end.factIds, taken.fact, e.place, self, list(findPage(o, e.page)?.endAction?.factIds))
    }
    return true
  }
  if (op === 'remove-later') {
    next.later ??= []
    const code = (e) => e.code
    insertAt(next.later, taken.entry, taken.place, code, list(o.later).map(code))
    return true
  }
  return false
}

/**
 * Bring back what one removal took: its pieces where they were, its left out entries gone. The revision is the
 * gate's to raise.
 * @param {object} plan
 * @param {object | undefined} record the removal record the restore names
 * @param {object | null} base the review's original plan: the order of pieces brought back between the same neighbours
 * @returns {{plan: object} | {problems: Array<{code: string, at: string, message: string}>}}
 */
export function restoreToPlan(plan, record, base = null) {
  if (!record?.op) return refused('removal_unknown', 'operation.removal')
  const next = structuredClone(plan)
  if (!putBack(next, record, base)) return refused('restore_target_gone', 'operation.removal')
  const original = list(base?.assumptions).map(idOf)
  for (const { assumption, place } of list(record.assumptions)) {
    next.assumptions ??= []
    insertAt(next.assumptions, assumption, place, idOf, original)
  }
  next.leftOut = withoutEntries(list(next.leftOut), list(record.leftOut))
  return { plan: next }
}

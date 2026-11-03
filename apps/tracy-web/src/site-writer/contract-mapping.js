// Exports a site-copy/1 file (ADR 0042) as the mapping the Joomla content contract write door accepts
// (`applyJoomlaContract`): { contract, revision, changes: { <content map key>: string }, evidence, pending, emptyLinks }.
// Pure: no I/O, no network, no site. Nothing is written anywhere; the caller decides what to do with the result.
import { readCopy } from './copy-check/copy-view.js'

/** Kit id to content map key: `block-163.4` -> `module-163.4`. Article and menu item ids stay as they are. */
export const contentMapKey = (id) => String(id ?? '').replace(/^block-/, 'module-')

const BULLET_ALL = (slot) => Number(slot?.bullets) > 0 && !(Number(slot?.paragraphs) > 0)

// A content map stores markup as plain text with doubled round brackets: a paragraph is `((p))text((/p))`, a bullet
// list `((ul))` with one `((li))text((/li))` per item (see the ja-tour and ja-seven content maps). A slot written as
// one string is exported as is. A list of strings is joined by the slot's format: bullets when the kit shows only
// bullets, otherwise paragraphs. Without a kit, a list is read as paragraphs, the common case.
export function joinItems(items, kitSlot) {
  if (items.length === 1) return items[0]
  if (BULLET_ALL(kitSlot)) return `((ul))\n${items.map((t) => `((li))${t}((/li))`).join('\n')}\n((/ul))`
  return items.map((t) => `((p))${t}((/p))`).join('\n')
}

function kitSlotIndex(kit) {
  const index = new Map()
  const walk = (slots) => {
    for (const s of slots ?? []) index.set(s.id, s)
  }
  for (const b of kit?.blocks ?? []) {
    walk(b.slots)
    for (const l of b.lists ?? []) {
      walk(l.rowSlots)
      for (const r of l.rows ?? []) walk(r.slots)
    }
  }
  return index
}

/**
 * @param {{ copy: object, contract: string, revision: string, kit?: object, brief?: { facts?: {id:string,value:string}[] } }} input
 * @returns {{ mapping: object, extras: { alts: Record<string,string>, pageMeta: Record<string,{title:string,description:string}>, pages: Record<string,{title:string,body:string[]}> }, problems: object[] }}
 */
export function exportContractMapping({ copy, contract, revision, kit, brief }) {
  const { view, problems } = readCopy(copy)
  const kitSlots = kitSlotIndex(kit)
  const facts = new Map((brief?.facts ?? []).map((f) => [f.id, f.value]))
  const changes = {}
  const evidence = {}
  for (const s of view.slots) {
    const key = contentMapKey(s.slot)
    changes[key] = joinItems(s.items, kitSlots.get(s.slot))
    if (s.factIds.length) {
      const cited = s.factIds.map((id) => (facts.has(id) ? `${id}: ${facts.get(id)}` : id))
      evidence[key] = `Brief facts: ${cited.join('; ')}`
    }
  }
  const alts = Object.fromEntries(view.alts.map((a) => [a.frame, a.text]))
  const pageMeta = Object.fromEntries(
    view.seo.map((s) => [s.page, { title: s.title, description: s.description }])
  )
  const pages = Object.fromEntries(view.pages.map((p) => [p.page, { title: p.title, body: p.body }]))
  return {
    mapping: { contract, revision, changes, evidence, pending: [], emptyLinks: [] },
    extras: { alts, pageMeta, pages },
    problems
  }
}

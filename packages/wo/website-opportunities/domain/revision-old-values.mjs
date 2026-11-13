// The old values a plan revision takes off the site, and the kept words that still quote one (ticket #599). Pure.
//
// A writer may quote in one block a fact it saw in another block of the same page (a service named in the hero's
// paragraph). The writer request of the quoting block does not change when that fact changes, so the impact of the
// requests alone keeps its words, and the site keeps the old value. So every value the revision changed or took away
// is listed with its old text (`oldValuesOf`): each fact, item label and item field of the plan and the profile, the
// name the site shows, each page name, and each leaf of every writer request's data view (`data:<id>`), by a stable
// path, never by its text. Every kept word is then scanned for those old texts in any form (`textsNamedIn`: case,
// references, accents, slug), and a block that quotes one is written again (`old_text_in_copy`).
//
// A short or common old value (fewer than four letters and digits, or one word of letters) also matches where the
// words mean something else (a price `5`, a name that is a common word). Correctness wins over cost: the block is
// written again all the same, and the reason says the match was weak (`old_text_in_copy:short`).
import { textsNamedIn } from './revision-text-forms.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const text = (value) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''

/** Every leaf text of a value under a stable path. */
function leavesAt(prefix, value, out) {
  if (Array.isArray(value)) value.forEach((v, i) => leavesAt(`${prefix}[${i}]`, v, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) leavesAt(`${prefix}.${k}`, v, out)
  else if (text(value)) out.set(prefix, text(value))
  return out
}

/** The values a side of a revision shows, by path: plan, profile and writer requests. */
export function revisionValuesOf(side, requests) {
  const out = new Map()
  for (const f of list(side.plan?.facts)) leavesAt(`fact:${f.id}`, f.value, out)
  for (const i of list(side.plan?.items)) leavesAt(`item:${i.id}.label`, i.label, out)
  for (const p of list(side.plan?.pages)) leavesAt(`page:${p.id}.name`, p.name, out)
  for (const [kind, values] of Object.entries(side.profile?.facts ?? {}))
    list(values).forEach((v, n) => leavesAt(`profile-fact:${kind}[${n}]`, v?.value, out))
  for (const [kind, items] of Object.entries(side.profile?.items ?? {}))
    for (const item of list(items)) {
      leavesAt(`profile-item:${kind}:${item.id}.label`, item.label, out)
      for (const [key, f] of Object.entries(item.fields ?? {}))
        leavesAt(`profile-item:${kind}:${item.id}.${key}`, f?.value, out)
    }
  for (const [, request] of requests ?? []) {
    leavesAt('site:name', request.business?.name, out)
    for (const block of list(request.blocks))
      for (const view of list(block.data)) {
        const { id, kind: _kind, ...shown } = view ?? {}
        if (typeof id === 'string') leavesAt(`data:${id}`, shown, out)
      }
  }
  return out
}

/**
 * The old texts a revision changed or took away, each once.
 * @param {{plan: object, profile: object}} previous @param {{plan: object, profile: object}} next
 * @param {Map<string, object>} before the writer requests of the previous plan @param {Map<string, object>} after
 * @returns {string[]}
 */
export function oldValuesOf(previous, next, before, after) {
  const was = revisionValuesOf(previous, before)
  const now = revisionValuesOf(next, after)
  const out = new Set()
  for (const [path, value] of was) if (now.get(path) !== value) out.add(value)
  return [...out]
}

/** Whether an old text is short or common enough to match words that mean something else. */
export const isWeakOldValue = (value) => {
  const plain = String(value).normalize('NFKD').replace(/\p{M}/gu, '')
  const alnum = plain.replace(/[^\p{L}\p{N}]/gu, '')
  return alnum.length < 4 || /^\p{L}+$/u.test(plain.trim())
}

/**
 * The kept words that quote an old text: per page, the blocks whose writer fields name one, and whether its search
 * texts do (the page is then written whole).
 * @param {Map<string, object>} kept the kept copy pages by id @param {string[]} old
 * @returns {Array<{page: string, blocks: Map<string, string>, seo: string | null}>} each hit's reason
 */
export function oldTextHitsOf(kept, old) {
  if (!old.length) return []
  const reasonOf = (named) => (named.every(isWeakOldValue) ? 'old_text_in_copy:short' : 'old_text_in_copy')
  const out = []
  for (const [id, page] of kept) {
    const blocks = new Map()
    for (const f of list(page?.fields)) {
      if (f?.from !== 'writer') continue
      const named = textsNamedIn(f.value, old)
      if (!named.length) continue
      const block = String(f.key).split('/')[0]
      const why = reasonOf(named)
      if (blocks.get(block) !== 'old_text_in_copy') blocks.set(block, why)
    }
    const seoNamed = textsNamedIn(page?.seo ?? null, old)
    const seo = seoNamed.length ? reasonOf(seoNamed) : null
    if (blocks.size || seo) out.push({ page: id, blocks, seo })
  }
  return out
}

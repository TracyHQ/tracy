// A runtime view repairs a missing declaration only when an exact measured page title and its native field agree.
// Published kit/map objects stay unchanged; ordinary stored fields never become writable through this projection.
import { blockSlotsOf } from './kit-slots.js'

const each = (value) => (Array.isArray(value) ? value : [])
const nameOf = (id) => typeof id === 'string' && id.trim() !== ''
const keyOf = (id) => id.replace(/^block-/, 'module-')
const blockedIds = (value) => {
  const out = new Set()
  const visit = (item, depth = 0) => {
    if (!item || typeof item !== 'object' || depth > 12) return
    if (item.writable === false) out.add(item.slot ?? item.slotId ?? item.id ?? item.key)
    for (const child of Object.values(item)) visit(child, depth + 1)
  }
  visit(value)
  return out
}
const unique = (items, id, key) => {
  const found = items.filter((item) => item?.[key] === id)
  return found.length === 1 ? found[0] : null
}
const measured = (slot) =>
  slot?.fit?.measured === true &&
  ['desktop', 'phone'].every((width) => {
    const box = slot.fit.boxes?.[width]
    return Number.isFinite(box?.width) && box.width > 0 && Number.isFinite(box?.height) && box.height > 0
  })

/** Join exact title id, stored owner/path/sample and measured native mapping, or preserve the original kit. */
export function withMeasuredTitles(doc, contentMap, { contract = doc?.contract } = {}) {
  if (
    !doc ||
    !contentMap ||
    typeof doc.contract !== 'string' ||
    doc.contract !== contract ||
    (contentMap.contract !== undefined && contentMap.contract !== contract)
  )
    return doc
  const blocks = each(doc.blocks)
  const declared = new Set(blocks.flatMap((block) => blockSlotsOf(block).map((slot) => slot.id)))
  const names = new Set(
    each(doc.site?.nameSlots)
      .filter((name) => name?.kind === 'slot')
      .map((name) => name.id)
  )
  const blocked = new Set([...blockedIds(doc), ...blockedIds(contentMap)])
  const pagesByTitle = new Map()
  for (const page of each(doc.pages))
    if (nameOf(page?.titleSlot))
      pagesByTitle.set(page.titleSlot, [...(pagesByTitle.get(page.titleSlot) ?? []), page])
  const additions = new Map()
  for (const [id, pages] of pagesByTitle) {
    if (declared.has(id) || names.has(id) || blocked.has(id) || blocked.has(keyOf(id))) continue
    const stored = unique(each(doc.storedFields), id, 'slot')
    const native = unique(each(contentMap.slots), keyOf(id), 'key')
    const owners = native ? blocks.filter((block) => block?.source?.entity === native.entity) : []
    const owner = owners.length === 1 ? owners[0] : null
    if (
      !owner ||
      !stored ||
      !native ||
      !nameOf(native.entity) ||
      !nameOf(native.column) ||
      !nameOf(owner.source?.entity) ||
      !nameOf(owner.id) ||
      owner.writable === false ||
      !id.startsWith(`${owner.id}.`) ||
      !native.key.startsWith(`${native.entity}.`) ||
      (stored.listedIn != null && stored.listedIn !== owner.id) ||
      stored.type !== 'text' ||
      native.type !== 'text' ||
      !['editorial.heading', 'editorial.title'].includes(native.role) ||
      native.requiresEvidence !== false ||
      native.nestedJson ||
      !measured(native)
    )
      continue
    if (
      owner.source?.entity !== native.entity ||
      !Array.isArray(native.jsonPath) ||
      !native.jsonPath.length ||
      !native.jsonPath.every((part) => typeof part === 'string' || Number.isInteger(part))
    )
      continue
    if (
      stored.field !== [native.column, ...native.jsonPath].join('.') ||
      typeof native.sample !== 'string' ||
      !native.sample.trim() ||
      stored.sample !== native.sample
    )
      continue
    if (
      !pages.every(
        (page) =>
          Object.values(page.blocks ?? {})
            .flat()
            .includes(owner.id) &&
          each(stored.drives).some(
            (drive) =>
              drive?.page === page.path &&
              drive.shown === true &&
              drive.title === true &&
              drive.attribute === 'text'
          )
      )
    )
      continue
    const limits = [
      native.maxCharacters,
      native.fit.maxCharacters,
      ...Object.values(native.fit.maxChars ?? {})
    ].filter((value) => Number.isFinite(value) && value > 0)
    if (!limits.length || !Number.isFinite(native.fit.maxCharacters) || native.fit.maxCharacters <= 0)
      continue
    const slot = {
      id,
      type: 'text',
      role: native.role,
      sample: native.sample,
      maxCharacters: Math.min(...limits),
      maxCharactersFrom: 'measured native title fit',
      paragraphs: 1,
      bullets: 0,
      formatFrom: 'measured native title',
      pageTitleOf: pages.map((page) => page.id),
      measuredTitleProjection: true
    }
    additions.set(owner.id, [...(additions.get(owner.id) ?? []), slot])
  }
  if (!additions.size) return doc
  return {
    ...doc,
    blocks: blocks.map((block) =>
      additions.has(block.id)
        ? { ...block, slots: [...each(block.slots), ...additions.get(block.id)] }
        : block
    )
  }
}

/**
 * The template inventory of a brief build (spec TracyHQ/tracy#231, ticket #233): every visible element of a released
 * template, read by code from its content map and contract (no model), each with a stable id, its kind and its limits.
 * The site plan gives every element whose `decide` is true exactly one decision (`site-plan-check.js`); text slots are
 * listed with their limits for the writer and are decided by their section.
 *
 * Ids are stable across reads of one release: `page:<entity>`, `section:<entity>`, `cards:<collection>`,
 * `picture:<slot>`, `icon:<slot>`, `button:<slot>`, `link:<slot>`, `slot:<slot>`, `menu:<menutype>`,
 * `footer-column:<id>`, `contact-block:<id>`, `cta-band:<id>`, `record-page:<id>`.
 * CMS-neutral: it reads only the content-map schema every released template ships.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { collectionOfGroupId } from 'website-opportunities/domain/content-map-repeatable-lists.mjs'
import { slotCharacterLimit } from 'website-opportunities/domain/site-plan-honesty.mjs'

import { membersOf, pagesOfEntity } from './template-inventory-pages.js'

const LABEL_ROLE = /(?:^|\.)(?:cta_label|button_label)$/

/** The kind of element a slot is, or null when it is part of another element (a button's url). */
function slotKind(slot, buttonUrls) {
  if (slot.type === 'image')
    return slot.role === 'editorial.item_icon' || slot.fit?.kind === 'icon' ? 'icon' : 'picture'
  if (slot.type === 'url') {
    if (buttonUrls.has(slot.key)) return null
    return slot.action ? 'link' : null
  }
  if (slot.action || slot.button === true || LABEL_ROLE.test(slot.role ?? '')) return 'button'
  return 'slot'
}

/** The limits a slot's element carries, by its kind. */
function slotLimits(slot, kind) {
  if (kind === 'picture' || kind === 'icon') {
    const fit = slot.fit ?? {}
    return {
      frame: fit.kind ?? null,
      aspect: fit.aspect ?? null,
      minWidth: fit.minWidth ?? null,
      boxes: fit.boxes ?? null,
      keep: slot.customize === 'keep'
    }
  }
  const limit = slotCharacterLimit(slot)
  return {
    maxCharacters: Number.isFinite(limit) ? limit : null,
    lines: slot.fit?.lines ?? null,
    boxes: slot.fit?.boxes ?? null
  }
}

/** The capacity of a card collection: the template's declared repeat, else the cards it measured or shows. */
function capacityOf(contentMap, collection, shown) {
  const repeat = contentMap.repeatableLists?.[collection]
  if (repeat && Number.isInteger(repeat.max)) return repeat.max
  return Math.max(shown, Number(contentMap.fitGroups?.[collection]?.items) || 0)
}

/**
 * The inventory of a released template.
 * @param {{contentMap: any, showcaseNav?: any, contract?: string | null}} input
 * @returns {{contract: string | null, elements: any[]}}
 */
export function templateInventory({ contentMap, showcaseNav = null, contract = null }) {
  const map = contentMap ?? {}
  const slots = Array.isArray(map.slots) ? map.slots : []
  const pages = Array.isArray(map.pages) ? map.pages : []
  /** @type {any[]} */
  const elements = []
  const hidden = new Set(
    (showcaseNav?.operations ?? []).filter((o) => o?.rule === 'hide.decision').map((o) => o.key)
  )
  for (const page of pages)
    elements.push({
      id: `page:${page.entity}`,
      kind: 'page',
      decide: true,
      entity: page.entity,
      route: page.route ?? null,
      layout: page.layout ?? null,
      link: page.link ?? null,
      showcase: hidden.has(page.entity)
    })
  const pagesOf = pagesOfEntity(map)
  const sections = new Set()
  const section = (entity) => {
    const id = `section:${entity}`
    if (!sections.has(id)) {
      sections.add(id)
      elements.push({ id, kind: 'section', decide: true, entity, pages: pagesOf(entity) })
    }
    return id
  }
  const buttonUrls = new Set(slots.map((s) => s.action?.urlKey).filter(Boolean))
  /** @type {Map<string, {id: string, groups: Set<string>, section: string}>} */
  const collections = new Map()
  for (const slot of slots) {
    if (String(slot.entity).startsWith('menuItem-')) continue
    const kind = slotKind(slot, buttonUrls)
    if (!kind) continue
    const owner = section(slot.entity)
    const collection = collectionOfGroupId(slot.group?.id)
    let card = null
    if (collection) {
      const id = `cards:${collection}`
      const entry = collections.get(id) ?? { id, groups: new Set(), section: owner }
      entry.groups.add(slot.group.id)
      collections.set(id, entry)
      card = { collection: id, index: Number(slot.group.id.slice(collection.length + 1)) }
    }
    elements.push({
      id: `${kind}:${slot.key}`,
      kind,
      decide: kind !== 'slot',
      key: slot.key,
      section: owner,
      card,
      role: slot.role ?? null,
      label: slot.label ?? null,
      sample: slot.sample ?? null,
      ...(slot.action ? { action: slot.action.kind, urlKey: slot.action.urlKey ?? null } : {}),
      limits: slotLimits(slot, kind)
    })
  }
  // A card's index is its place in its collection (the n-th card), whatever number its group id carries.
  for (const element of elements)
    if (element.card) {
      const raw = [...(collections.get(element.card.collection)?.groups ?? [])]
        .map((id) => Number(id.slice(id.lastIndexOf('.') + 1)))
        .sort((a, b) => a - b)
      element.card.index = raw.indexOf(element.card.index)
    }
  for (const entry of collections.values()) {
    const collection = entry.id.slice('cards:'.length)
    elements.push({
      id: entry.id,
      kind: 'cards',
      decide: true,
      section: entry.section,
      pages: pagesOf(collection.split('.')[0]),
      limits: { capacity: capacityOf(map, collection, entry.groups.size) }
    })
  }
  elements.push(...membersOf(map, section))
  return { contract, elements }
}

/**
 * The inventory of a contract on disk (`contractFor` of `lib/contracts.js`): its content map and its showcase-nav map.
 * @param {{id: string, dir: string}} contract
 */
export function inventoryOfContract(contract) {
  const read = (/** @type {string} */ name) => {
    try {
      return JSON.parse(readFileSync(path.join(contract.dir, name), 'utf8'))
    } catch {
      return null
    }
  }
  return templateInventory({
    contentMap: read('content-map.json'),
    showcaseNav: read('showcase-nav-map.json'),
    contract: contract.id
  })
}

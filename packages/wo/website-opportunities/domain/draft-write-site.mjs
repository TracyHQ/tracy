// The site the draft write builds, as the planner reads it (ticket #597): which item a page is about, which record a
// page's SEO goes on, which container copy holds a tab copy, which page lists the records of a category. Pure; built
// once per plan from the write order and the kit (`draft-write-plan.mjs`).
import { blockRecordOf } from './draft-write-targets.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/**
 * @param {object} order the checked write order
 * @param {object} kit `{mapping, store, ...}`
 * @param {object} sink the planner's sink
 */
export function siteOf(order, kit, sink) {
  const itemIds = new Set(list(order.items).map((i) => i.data))
  const subjects = new Map()
  const listedBy = new Map()
  const containers = new Map()
  const heldKeys = new Map()
  for (const page of order.pages) {
    const shown = new Set()
    let holding = null
    for (const block of page.blocks) {
      const placement = kit.mapping.placements?.[block.block]
      if (kit.store.get(block.block)?.placement === 'created')
        for (const e of list(block.fields)) if (e.from === 'data' && itemIds.has(e.data)) shown.add(e.data)
      for (const item of list(block.items))
        listedBy.set(item.data, [...(listedBy.get(item.data) ?? []), { page, block }])
      if (placement?.holds) holding = blockRecordOf(kit, page, block)?.key ?? null
      else if (placement?.inside && holding) {
        const key = blockRecordOf(kit, page, block)?.key
        if (key) {
          containers.set(key, holding)
          heldKeys.set(`${holding}|${placement.entity}`, key)
        }
      }
    }
    subjects.set(page.id, shown.size === 1 ? [...shown][0] : `page.${page.id}`)
  }
  const subjectOf = (page) => subjects.get(page.id)
  const pageOfSubject = (subject) => order.pages.find((p) => subjects.get(p.id) === subject) ?? null
  const setsOf = (entity) =>
    Object.values(kit.mapping.buildSets ?? {}).find((s) => s.entity === entity && s.sets === 'category')
  const listedTypeOf = (subject) => {
    for (const at of listedBy.get(subject) ?? []) {
      const entity = kit.mapping.placements?.[at.block.block]?.entity
      const type = entity && setsOf(entity)?.pageType
      if (type) return type
    }
    return null
  }
  const name = list(order.facts).find((f) => f.kind === 'business.name')?.value ?? null
  return {
    subjectOf,
    pageOfSubject,
    listedTypeOf,
    /**
     * The title of a category: the name of the list page of its page type (a page whose main block, by its recipe,
     * lists the records), else of another page listing them that is not the home page, else the business name.
     */
    listTitleOf: (pageType) => {
      const pages = []
      for (const [subject, ats] of listedBy)
        if (listedTypeOf(subject) === pageType)
          for (const at of ats) if (pageOfSubject(subject)?.id !== at.page.id) pages.push(at)
      const main = pages.find((at) => kit.mainBlocks?.get(at.page.pageType) === at.block.block)
      return (main ?? pages.find((at) => !at.page.home))?.page.name ?? name
    },
    /** The record a page's SEO goes on (`mapping.seo.pageTypes`): its article, or its menu item in the main menu. */
    pageRecordOf: (page) => {
      const record = kit.mapping.seo?.pageTypes?.[page.pageType]
      if (record === 'article') {
        const subject = subjectOf(page)
        return {
          key: `article:${subject}`,
          init: { kind: 'created', recordKind: 'article', subject, title: page.name }
        }
      }
      return { key: `menuItem:${kit.mainMenu}:${page.id}`, init: { kind: 'created', recordKind: 'menuItem' } }
    },
    heldOf: (page, block, entity) => {
      const container = blockRecordOf(kit, page, block)?.key
      const key = heldKeys.get(`${container}|${entity}`)
      return key ? { key, init: sink.records.get(key) } : null
    },
    containerKeyOf: (record) => containers.get(record.key) ?? null,
    copyOfOwner: (page, owner) => {
      const block = page.blocks.find((b) => b.block === owner)
      const own = block && blockRecordOf(kit, page, block)
      return own && sink.records.has(own.key) ? own : { skip: 'foreign_copy_not_placed' }
    },
    recordOfBlock: (page, block) => {
      const own = blockRecordOf(kit, page, block)
      return own ? sink.records.get(own.key) : null
    }
  }
}

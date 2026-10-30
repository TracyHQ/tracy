/**
 * The parts of the template inventory (`template-inventory.js`) read from a content map's page and band declarations:
 * which pages show an entity, and the menus, footer columns, contact blocks, CTA bands, record pages and forms.
 */
import { formsOf } from 'website-opportunities/domain/form-blocks.mjs'

/** The entity a page link opens as its body: an article, a category (its listing) or a contact (Joomla link forms). */
const LINK_BODIES = [
  [/[?&]view=article&id=(\d+)/, 'article'],
  [/[?&]view=category(?:&[^#]*?)?&id=(\d+)/, 'category'],
  [/[?&]view=contact(?:&[^#]*?)?&id=(\d+)/, 'contact']
]

/**
 * Which pages show an entity (COO rule "content map gaps", 30/10/2026): a module by its page assignments; an article, a
 * category or a contact by the page whose link opens it; an entity that references another (an article its category, a
 * profile field its user) by the pages of what it references; and an entity the map cannot place by its declared
 * `shownOn`: page entity keys, `"every-page"` (site-wide strings and settings), or `[]` (on no page, on purpose).
 * The packing check reports every entity with slots that is on no page and not declared (`content-map-lint-pages.js`).
 * @param {any} map - a content map
 * @returns {(entity: string) => string[]} page element ids
 */
export function pagesOfEntity(map) {
  const pages = Array.isArray(map.pages) ? map.pages : []
  const entities = Array.isArray(map.entities) ? map.entities : []
  const sourceOf = new Map(entities.map((e) => [e.key, e.sourceId]))
  /** @type {Map<string, string[]>} */
  const out = new Map()
  const add = (entity, page) => out.set(entity, [...(out.get(entity) ?? []), `page:${page}`])
  const pageIds = pages.map((p) => Number(sourceOf.get(p.entity)))
  pages.forEach((page, i) => {
    for (const a of page.assignedModules ?? []) {
      const ids = (a.menuIds ?? []).map(Number)
      const shows =
        a.assignmentMode === 'all' ||
        (a.assignmentMode === 'include' && ids.includes(pageIds[i])) ||
        (a.assignmentMode === 'exclude' && !ids.includes(pageIds[i]))
      if (shows) add(a.entity, page.entity)
    }
    for (const [pattern, kind] of LINK_BODIES) {
      const id = pattern.exec(page.link ?? '')
      if (id) add(`${kind}-${id[1]}`, page.entity)
    }
  })
  for (const entity of entities) {
    if (entity?.shownOn === 'every-page') for (const page of pages) add(entity.key, page.entity)
    else if (Array.isArray(entity?.shownOn)) for (const page of entity.shownOn) add(entity.key, page)
  }
  // An entity follows what it references, until nothing moves (a profile field its user, an article its category).
  const referencing = entities.filter(
    (e) => e?.identityReferences && typeof e.identityReferences === 'object'
  )
  for (let moved = true; moved; ) {
    moved = false
    for (const entity of referencing)
      for (const target of Object.values(entity.identityReferences))
        for (const page of out.get(String(target)) ?? [])
          if (!(out.get(entity.key) ?? []).includes(page)) {
            out.set(entity.key, [...(out.get(entity.key) ?? []), page])
            moved = true
          }
  }
  return (entity) => [...new Set(out.get(entity) ?? [])]
}

/** Whether a content map declares an entity on no page on purpose (`shownOn: []`). */
export function shownOnNone(map) {
  const none = new Set(
    (map.entities ?? []).filter((e) => Array.isArray(e?.shownOn) && e.shownOn.length === 0).map((e) => e.key)
  )
  return (/** @type {string} */ entity) => none.has(entity)
}

/**
 * The menus, footer columns, contact blocks, CTA bands and record pages of a content map, as inventory elements.
 * A menu a footer column shows is that column, not a menu of its own.
 * @param {any} map - a content map
 * @param {(entity: string) => string} section - the section element id of an entity (adds it when new)
 */
export function membersOf(map, section) {
  /** @type {any[]} */
  const out = []
  const columns = (map.navigationGroups ?? []).filter((g) => g?.id)
  const shownByColumn = new Set(columns.map((g) => g.menu).filter(Boolean))
  const menus = new Map()
  for (const entity of map.entities ?? [])
    if (entity?.kind === 'menuItem' && entity.identity?.menutype) {
      const type = entity.identity.menutype
      menus.set(type, [...(menus.get(type) ?? []), `page:${entity.key}`])
    }
  for (const [type, items] of menus)
    if (!shownByColumn.has(type))
      out.push({ id: `menu:${type}`, kind: 'menu', decide: true, items, limits: { capacity: items.length } })
  for (const g of columns)
    out.push({
      id: `${g.placement === 'footer' ? 'footer-column' : 'menu'}:${g.id}`,
      kind: g.placement === 'footer' ? 'footer-column' : 'menu',
      decide: true,
      holds: g.holds ?? null,
      section: g.container ? section(g.container) : null,
      links: g.links ?? [],
      limits: { capacity: (g.links ?? []).length }
    })
  for (const b of map.contactBlocks ?? [])
    out.push({
      id: `contact-block:${b.id}`,
      kind: 'contact-block',
      decide: true,
      placement: b.placement ?? null,
      section: b.container ? section(b.container) : null
    })
  for (const band of map.ctaBands ?? [])
    out.push({
      id: `cta-band:${band.id}`,
      kind: 'cta-band',
      decide: true,
      section: band.entity ? section(band.entity) : null,
      buttons: (band.buttons ?? []).map((k) => `button:${k}`)
    })
  // A form (ticket #240): what the map declares in `forms`, else what it contains (`formsOf`). Code decides it from the
  // brief's destinations (`site-plan-defaults-site.js`), not the author, so the plan check does not ask for it (`decide`).
  for (const f of formsOf(map))
    out.push({
      id: `form:${f.entity}`,
      kind: 'form',
      decide: false,
      entity: f.entity,
      formKind: f.kind,
      declared: f.declared,
      // The section of its entity when it has one; a form adds no section of its own for the author to decide.
      section: `section:${f.entity}`
    })
  for (const r of map.recordPages ?? [])
    out.push({
      id: `record-page:${r.id}`,
      kind: 'record-page',
      decide: true,
      layout: r.layout ?? null,
      entities: r.entities ?? [],
      limits: { capacity: (r.entities ?? []).length }
    })
  return out
}

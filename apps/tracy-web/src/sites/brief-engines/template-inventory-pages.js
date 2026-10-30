/**
 * The parts of the template inventory (`template-inventory.js`) read from a content map's page and band declarations:
 * which pages show an entity, and the menus, footer columns, contact blocks, CTA bands and record pages.
 */

/**
 * Which pages show an entity: a module by its page assignments, an article by the page that opens it.
 * @param {any} map - a content map
 * @returns {(entity: string) => string[]} page element ids
 */
export function pagesOfEntity(map) {
  const pages = Array.isArray(map.pages) ? map.pages : []
  const sourceOf = new Map((map.entities ?? []).map((e) => [e.key, e.sourceId]))
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
    const article = /view=article&id=(\d+)/.exec(page.link ?? '')
    if (article) add(`article-${article[1]}`, page.entity)
  })
  return (entity) => [...new Set(out.get(entity) ?? [])]
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

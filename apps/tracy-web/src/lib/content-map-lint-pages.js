/**
 * The packing rule of entities on no page (COO rule "content map gaps", 30/10/2026): a brief build plans only what a page
 * shows (`template-inventory.js`), so an entity with slots that no page shows is left out of the site plan and keeps the
 * demo's words. Which pages show an entity is read by the same reader the inventory uses (`pagesOfEntity`): page
 * assignments, the link that opens it, what it references, and its declared `shownOn`. Reported by the packing check and
 * the /ops content coverage for every quickstart, so an admin declares the gap once.
 */
import { pagesOfEntity, shownOnNone } from '../sites/brief-engines/template-inventory-pages.js'

const list = (v) => (Array.isArray(v) ? v : [])

/** @type {Array<import('./content-map-lint.js').LintRule>} */
export const PAGE_RULES = [
  {
    id: 'entity-on-no-page',
    severity: 'warning',
    checks: 'every entity with slots is shown on a page, or declared on none',
    fix: 'Declare on the entity where it shows: "shownOn": ["<page entity key>", ...] for the pages that show it, "shownOn": "every-page" for a site-wide string or setting, or "shownOn": [] when no page shows it on purpose. A page shows a module by its assignments, an article, category or contact by the link that opens it, and an entity that references another (identityReferences) by that entity\'s pages; anything else is invisible to the site plan.',
    find: ({ map, slots }) => {
      // A map with no page entities (a trimmed or pre-pages map) cannot say which page shows what: not judged.
      if (!list(map?.pages).some((p) => p?.entity)) return []
      const pagesOf = pagesOfEntity(map)
      const onNone = shownOnNone(map)
      const skipped = new Set(
        list(map.entities)
          .filter((e) => e?.demoOnly === true || e?.kind === 'menuItem')
          .map((e) => e.key)
      )
      const withSlots = [...new Set(slots.map((s) => String(s?.entity ?? '')).filter(Boolean))]
      return withSlots
        .filter((entity) => !skipped.has(entity) && !entity.startsWith('menuItem-'))
        .filter((entity) => !pagesOf(entity).length && !onNone(entity))
        .map((entity) => ({ key: entity, note: `no page shows "${entity}" and it declares no shownOn` }))
    }
  }
]

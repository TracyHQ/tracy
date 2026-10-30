/**
 * The packing rule of copying a record page (COO rule "content map gaps", 30/10/2026; spec TracyHQ/tracy#231 ticket #238):
 * when a brief lists more offerings than the template has record pages, the build adds pages that copy one record page of
 * the family and joins the copy to the family's parent, so the page that lists the family lists it. The map says which page
 * that is (`recordPages[].listing`, a page entity); without it the build guesses from the records' parent. Reported by the
 * /ops content coverage for every quickstart, so an admin declares it once.
 */
import { pageBodyOf, recordParentOf } from '../sites/brief-engines/template-inventory-pages.js'

/** @type {Array<import('./content-map-lint.js').LintRule>} */
export const RECORD_PAGE_RULES = [
  {
    id: 'record-page-listing',
    severity: 'warning',
    checks:
      'every record page family names the page that lists it, and that page opens the parent its records share',
    fix: 'Add "listing": "<page entity>" to each "recordPages" entry: the page (a menu item) whose list shows every record of the family, for example the category page of the offerings. Its records must share that parent (one category), so a page the build adds as a copy of a record is listed there too.',
    find: ({ map }) => {
      const pages = Array.isArray(map?.pages) ? map.pages : []
      const families = Array.isArray(map?.recordPages) ? map.recordPages : []
      return families.flatMap((family) => {
        const key = String(family?.id ?? 'recordPages')
        const parent = recordParentOf(map, family)
        if (!parent) return [{ key, note: 'its records share no one parent, so a copy cannot be listed with them' }]
        if (typeof family?.listing !== 'string' || !family.listing)
          return [{ key, note: 'no listing page declared' }]
        const page = pages.find((p) => p?.entity === family.listing)
        if (!page) return [{ key, note: `listing ${family.listing} is not a page of the map` }]
        if (pageBodyOf(page.link) !== parent)
          return [{ key, note: `listing ${family.listing} does not open ${parent}, the parent of its records` }]
        return []
      })
    }
  }
]

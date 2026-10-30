/**
 * The final check of site build rule 2 (spec TracyHQ/tracy#189, COO decision 30/10/2026): a picture belongs to its own
 * record. On sibling record pages (one family: the pages under one parent address whose sections run alike, as
 * `record-pages-check.js` reads them) a photo or a drawing shown on one record's page is never shown on another record's
 * page in another section. The same section of two siblings is `sibling-record-picture` already; this check adds the
 * pictures moved to another section, so a drawing made for one record and reused on its sibling is caught wherever it
 * stands. Read from the served pages of any CMS. Pure: pages in, findings out.
 */
import { parse } from 'parse5'
import { MIN_SECTIONS, parentPath, photosOf, sectionsOf, signature } from './record-pages-check.js'

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>}} input
 * @returns {Array<{kind: 'record-picture-shared', severity: 'blocker', page: string, found: string, why: string}>}
 */
export function checkRecordPictures({ pages }) {
  /** @type {Map<string, Array<{path: string, sections: any[]}>>} */
  const families = new Map()
  for (const page of pages ?? []) {
    if (page.status !== undefined && page.status !== 200) continue
    const sections = sectionsOf(parse(String(page.html ?? '')))
    if (sections.length < MIN_SECTIONS) continue
    const key = `${parentPath(page.path)}|${sections.map(signature).join('>')}`
    families.set(key, [...(families.get(key) ?? []), { path: page.path, sections }])
  }
  const out = []
  for (const family of families.values()) {
    if (family.length < 2) continue
    family.forEach((a, i) => {
      for (const b of family.slice(i + 1)) {
        const seen = new Set()
        a.sections.forEach((mine, at) => {
          const own = new Set(photosOf(mine))
          b.sections.forEach((theirs, other) => {
            if (other === at) return
            for (const src of photosOf(theirs)) {
              if (!own.has(src) || seen.has(src)) continue
              seen.add(src)
              out.push({
                kind: 'record-picture-shared',
                severity: 'blocker',
                page: b.path,
                found: src,
                why: `Section ${other + 1} shows the picture of section ${at + 1} on ${a.path}: a picture belongs to its own record`
              })
            }
          })
        })
      }
    })
  }
  return out
}

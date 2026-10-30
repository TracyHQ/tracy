// Record pages (spec TracyHQ/tracy#189, site build rule 3): a template shows several records of one kind (an offering, a
// service, a product, a person, a location) each on a page of the same layout. When that page is laid out as a landing
// page, not a blog post, the blog pager (Previous / Next article) is no part of it and is taken off. Pure and deterministic.
//
// A content map declares its record pages in the top-level `recordPages` (quickstart-contract skill):
//   "recordPages": [{"id": "classes", "entities": ["article-2", "article-14"], "layout": "landing"}]
// `layout` is `landing` (the pager is taken off) or `post` (a blog post: the pager stays). The packing check
// (`scripts/slot-roles/check.mjs`) refuses a map whose record pages are not declared, so a template cannot be released
// without saying which layout its record pages have.

export const RECORD_PAGE_LAYOUTS = Object.freeze(['landing', 'post'])

/** Group kinds whose card shows one record. */
const RECORD_GROUP_KINDS = new Set(['service', 'menu_item', 'package', 'product', 'person', 'location'])
/** Entity kinds a CMS shows as a page of its own with a blog pager (a Joomla article, a WordPress or EmDash post). */
const PAGE_KINDS = new Set(['article', 'post', 'page', 'entry', 'product'])
const NAME_ROLES = new Set(['offering.name', 'person.name', 'location.name', 'product.name'])
const object = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** The record pages a map declares. */
export function recordPagesOf(contentMap) {
  return Array.isArray(contentMap?.recordPages) ? contentMap.recordPages.filter(object) : []
}

/**
 * The record pages a map holds whether or not it declares them: every page entity that names exactly one record
 * (a name slot in a record card group), when at least two entities of one kind and one parent do (the sibling pages).
 * @returns {string[]} entity keys, in map order
 */
export function heldRecordPages(contentMap) {
  const entities = new Map((contentMap?.entities ?? []).map((e) => [e.key, e]))
  const named = new Map()
  for (const slot of contentMap?.slots ?? []) {
    if (!NAME_ROLES.has(slot.role) || !RECORD_GROUP_KINDS.has(slot.group?.kind)) continue
    const entity = entities.get(slot.entity)
    if (!entity || !PAGE_KINDS.has(entity.kind) || entity.demoOnly === true) continue
    named.set(slot.entity, (named.get(slot.entity) ?? new Set()).add(slot.group.id))
  }
  const single = [...named].filter(([, groups]) => groups.size === 1).map(([key]) => key)
  const familyOf = (key) => {
    const e = entities.get(key)
    return `${e?.kind}|${Object.values(e?.identityReferences ?? {}).join(',')}`
  }
  const sizes = new Map()
  for (const key of single) sizes.set(familyOf(key), (sizes.get(familyOf(key)) ?? 0) + 1)
  return single.filter((key) => sizes.get(familyOf(key)) >= 2)
}

/** The entities whose record page is a landing page: the blog pager is taken off them. */
export function landingRecordEntities(contentMap) {
  return [
    ...new Set(
      recordPagesOf(contentMap)
        .filter((p) => p.layout === 'landing')
        .flatMap((p) => (Array.isArray(p.entities) ? p.entities : []))
        .filter((e) => typeof e === 'string')
    )
  ]
}

/**
 * The problems of a map's record page declarations, each one sentence: a malformed entry, an entity no map holds, or a
 * record page the map holds that no entry declares.
 * @returns {string[]}
 */
export function recordPageProblems(contentMap) {
  const known = new Set((contentMap?.entities ?? []).map((e) => e.key))
  const raw = contentMap?.recordPages
  const out = []
  if (raw !== undefined && !Array.isArray(raw)) return ['recordPages must be a list']
  const declared = new Set()
  for (const [i, page] of (raw ?? []).entries()) {
    if (!object(page) || typeof page.id !== 'string' || !page.id) out.push(`recordPages[${i}] needs an id`)
    if (!RECORD_PAGE_LAYOUTS.includes(page?.layout))
      out.push(`recordPages[${i}].layout must be one of ${RECORD_PAGE_LAYOUTS.join(', ')}`)
    if (!Array.isArray(page?.entities) || page.entities.length === 0)
      out.push(`recordPages[${i}].entities must list the record page entities`)
    for (const e of Array.isArray(page?.entities) ? page.entities : []) {
      if (!known.has(e)) out.push(`recordPages[${i}] names ${e}, which the map does not hold`)
      declared.add(e)
    }
  }
  for (const key of heldRecordPages(contentMap))
    if (!declared.has(key))
      out.push(`${key} is a record page no recordPages entry declares (layout landing or post)`)
  return out
}

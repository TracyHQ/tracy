// Where each page of a template prints its one main heading (h1), as the template declares it in its content map (spec
// TracyHQ/tracy#189, criterion 8.2, R12 group G). Pure and CMS neutral; read by the packing check and the writers.
//
// 🔒 EVERY PAGE HAS EXACTLY ONE H1, AND THE TEMPLATE SAYS WHERE IT IS. Measured on a brief build of a T4 template 30/10/2026:
// five of six pages had none. The template prints the page's title in a masthead module as an h2 and the record page's
// title in a plain block, and its menu entries leave the component's own page heading off. A heading level is template
// code; what a build can set is which element carries the h1. So each page entity is declared with one way:
//
//   template      the template already prints one h1 there (a hero title): nothing is written
//   page-heading  the CMS's own page heading of the entry is switched on with the page's name (Joomla: the menu entry's
//                 `show_page_heading` and `page_heading`, which the component layouts print as an h1)
//   menu-param    named settings of the entry that the template's layout prints as an h1 for this page only (`params`,
//                 '{name}' standing for the page's name): a category listing whose own page heading would also show on
//                 every record page beneath it declares its sub-heading here instead
//   field         a field of the record that the template prints as the page's title is written as an h1 that keeps the
//                 look of the block (`column` and `jsonPath` name the field)
//
// `mainHeadings: [{ entities: [...], via: 'template' | 'page-heading' | 'menu-param' | 'field', params?, column?, jsonPath? }]`
export const MAIN_HEADING_WAYS = Object.freeze(['template', 'page-heading', 'menu-param', 'field'])

const object = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** The declared ways, by entity key. */
export function mainHeadingsOf(contentMap) {
  const out = new Map()
  for (const entry of Array.isArray(contentMap?.mainHeadings) ? contentMap.mainHeadings : []) {
    if (!object(entry) || !MAIN_HEADING_WAYS.includes(entry.via)) continue
    for (const entity of Array.isArray(entry.entities) ? entry.entities : []) out.set(entity, entry)
  }
  return out
}

/** Whether a page entity opens a page of its own (a component link, not a heading, an anchor or an alias). */
const opensPage = (page) => /[?&]option=com_/.test(String(page?.link ?? ''))

/**
 * The page entities a map must declare a main heading for: every page that opens a component of its own, and every
 * declared record page.
 */
export function headedEntitiesOf(contentMap) {
  const pages = (Array.isArray(contentMap?.pages) ? contentMap.pages : [])
    .filter(opensPage)
    .map((p) => p.entity)
  const records = (Array.isArray(contentMap?.recordPages) ? contentMap.recordPages : []).flatMap((r) =>
    Array.isArray(r?.entities) ? r.entities : []
  )
  return [...new Set([...pages, ...records].filter((e) => typeof e === 'string'))]
}

/**
 * The problems of a map's main heading declarations, each one sentence.
 * @returns {string[]}
 */
export function mainHeadingProblems(contentMap) {
  const raw = contentMap?.mainHeadings
  if (raw !== undefined && !Array.isArray(raw)) return ['mainHeadings must be a list']
  const known = new Set((contentMap?.entities ?? []).map((e) => e.key))
  const out = []
  for (const [i, entry] of (raw ?? []).entries()) {
    if (!object(entry) || !MAIN_HEADING_WAYS.includes(entry.via))
      out.push(`mainHeadings[${i}].via must be one of ${MAIN_HEADING_WAYS.join(', ')}`)
    if (!Array.isArray(entry?.entities) || entry.entities.length === 0)
      out.push(`mainHeadings[${i}].entities must list the page entities`)
    if (entry?.via === 'field' && (typeof entry.column !== 'string' || !Array.isArray(entry.jsonPath)))
      out.push(`mainHeadings[${i}] via field needs a column and a jsonPath`)
    if (
      entry?.via === 'menu-param' &&
      (!object(entry.params) || Object.values(entry.params).some((v) => typeof v !== 'string'))
    )
      out.push(`mainHeadings[${i}] via menu-param needs params of strings`)
    for (const e of Array.isArray(entry?.entities) ? entry.entities : [])
      if (!known.has(e)) out.push(`mainHeadings[${i}] names ${e}, which the map does not hold`)
  }
  const declared = mainHeadingsOf(contentMap)
  for (const key of headedEntitiesOf(contentMap))
    if (!declared.has(key)) out.push(`${key} is a page with no declared main heading (mainHeadings)`)
  return out
}

/** A record field's words as the page's one h1, keeping the look of the block it sits in. */
export const AS_MAIN_HEADING = (/** @type {string} */ html) =>
  `<h1 style="font:inherit;color:inherit;margin:0;line-height:inherit;letter-spacing:inherit;text-transform:inherit">${html}</h1>`

/** The menu entry settings a declared way writes for a page named `name`; null for a way that writes none there. */
export function headingParamsOf(entry, name) {
  if (entry?.via === 'page-heading') return { show_page_heading: '1', page_heading: name }
  if (entry?.via === 'menu-param' && object(entry.params))
    return Object.fromEntries(
      Object.entries(entry.params).map(([k, v]) => [k, String(v).replaceAll('{name}', name)])
    )
  return null
}

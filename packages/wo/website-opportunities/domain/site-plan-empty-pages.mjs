// The kept pages a brief build would leave with a heading and nothing under it (spec TracyHQ/tracy#189). Measured 29/10/2026
// on a local brief build (a coaching club on a Joomla T4 template): the brief holds no price, so the site plan hid every
// package card of the Plans page, and the page showed its title and a one-line intro, nothing else.
//
// 🔒 A PAGE WHOSE CONTENT WAS ALL TAKEN OFF IS TAKEN OFF TOO, with its menu entries (the build takes off every page the plan
// drops, and the links into it): a page of the template is kept only while it has something of the business to show. A page
// is emptied when the plan hid at least one of its own records and none of its own records with content is left: a record
// with repeated items, a picture, an article or a contact record. A section of a heading and an intro alone is no content.
// The home page, the Contact page kept for the business's contact facts and a blog are never judged here. Rules by record
// kind and slot role only; pages the content map does not describe are left as they are. Pure and deterministic.

/** Roles of a section's own words, beside the items it shows. */
const INTRO_ROLES = new Set([
  'editorial.heading',
  'editorial.paragraph',
  'editorial.button_label',
  'editorial.navigation_url'
])

/** The id a link names for a view (`view=article&id=14` → `14`), or null. */
const idOf = (link, view) => {
  const text = String(link ?? '')
  return new RegExp(`[?&]view=${view}(?:&|$)`).test(text) ? (/[?&]id=(\d+)/.exec(text)?.[1] ?? null) : null
}

/**
 * The records a map page shows of its own: the modules assigned to it alone, the article or contact it opens, and the
 * articles of the category it lists.
 * @param {any} page - a content map page
 * @param {any[]} entities
 */
function ownRecords(page, entities) {
  const out = new Set()
  for (const module of page?.assignedModules ?? [])
    if (module?.entity && module.assignmentMode && module.assignmentMode !== 'all') out.add(module.entity)
  const article = idOf(page?.link, 'article')
  if (article) out.add(`article-${article}`)
  const contact = idOf(page?.link, 'contact')
  if (contact) out.add(`contact-${contact}`)
  const category = idOf(page?.link, 'category')
  if (category)
    for (const entity of entities)
      if (entity?.kind === 'article' && entity.identityReferences?.catid === `category-${category}`)
        out.add(entity.key)
  return out
}

/** Whether a record shows something beyond a heading and an intro. */
function hasContent(entity, slots) {
  if (entity.startsWith('contact-')) return true
  const own = slots.filter((s) => s.entity === entity)
  if (entity.startsWith('article-'))
    return own.some((s) => /^(offering|article|post)\./.test(String(s.role ?? '')))
  return own.some((s) => s.group || s.type === 'image' || (s.role && !INTRO_ROLES.has(s.role)))
}

/**
 * The kept pages whose own content the site plan took off, each with why.
 * @param {object} input
 * @param {Array<{id: string, keep: boolean, role: string, why?: string}>} input.pages - the page plan's rows
 * @param {{slots?: any[], pages?: any[], entities?: any[]} | null} input.contentMap
 * @param {{hide?: Array<{how?: string, entity?: string}>} | null} input.honesty - the site plan's
 * @param {string} input.keptForFacts - the `why` of a Contact page kept for the business's contact facts
 * @returns {string[]} the page ids to take off
 */
export function emptiedPages({ pages, contentMap, honesty, keptForFacts }) {
  const entities = contentMap?.entities ?? []
  const slots = contentMap?.slots ?? []
  const hidden = new Set(
    (honesty?.hide ?? []).filter((h) => h?.how === 'entity' && h.entity).map((h) => h.entity)
  )
  if (hidden.size === 0) return []
  /** The content map page of a page plan row: the menu entry whose path is the row's id. */
  const pathOf = new Map(
    entities
      .filter((e) => e?.kind === 'menuItem' && typeof e.identity?.path === 'string')
      .map((e) => [e.key, e.identity.path])
  )
  const out = []
  for (const row of pages ?? []) {
    if (!row?.keep || row.role === 'home' || row.role === 'blog' || row.why === keptForFacts) continue
    const page = (contentMap?.pages ?? []).find((p) => pathOf.get(p?.entity) === row.id)
    if (!page) continue
    const records = [...ownRecords(page, entities)]
    if (!records.some((r) => hidden.has(r))) continue
    if (records.some((r) => !hidden.has(r) && hasContent(r, slots))) continue
    out.push(row.id)
  }
  return out
}

/** Why a page the plan emptied goes. */
export const EMPTIED_PAGE_WHY = 'every section of this page was taken off: the brief holds nothing for it'

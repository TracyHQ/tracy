// The limits of a page's search title and description (ticket #597, #594): the template mapping's own limits when it
// declares them (`seo.titleLimit`, `seo.descriptionLimit`), else the defaults. The writer writes to them and the write
// order holds them. Pure.

/** The longest search description, in characters, when the template's mapping declares none. */
export const SEO_DESCRIPTION_LIMIT = 160
/** The longest page title, in characters, when the template's mapping declares none. */
export const SEO_TITLE_LIMIT = 60

const positive = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback)

/** The SEO limits of a template mapping: its own limits when it declares them, else the defaults. */
export function seoLimitsOf(mapping) {
  return {
    title: positive(mapping?.seo?.titleLimit, SEO_TITLE_LIMIT),
    description: positive(mapping?.seo?.descriptionLimit, SEO_DESCRIPTION_LIMIT)
  }
}

/**
 * A page title as the form two titles compare in: NFKC, case folded, spaces collapsed and trimmed, so `Meadow Loom`
 * and `meadow  loom ` are one title. The writer's site check and the write order check share it.
 */
export const titleKey = (title) => String(title).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

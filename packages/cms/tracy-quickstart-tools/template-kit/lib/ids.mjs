// CMS-neutral names in the kit: a planner reads "block-163", never the CMS word for it. The content map key
// is kept only in a block's `source`, so the kit can be joined back to the map.

/** `module-163` -> `block-163`; `module-163.4` -> `block-163.4`; any other key unchanged. */
export const neutralKey = (key) => String(key ?? '').replace(/^module-/, 'block-')

/** The id of a page from its file-safe slug. */
export const pageIdOf = (slug) => `page-${slug}`

/** The id of a block found on a page: a CMS block by its number, the header, or the page's own body. */
export function blockIdOf(raw, pageSlug) {
  if (raw === 'header') return 'header'
  if (raw === 'main-body') return `body-${pageSlug}`
  return neutralKey(raw)
}

/** The id of an image from its path: `images/block-163-1440.jpg` -> `block-163-1440`. */
export const imageIdOf = (path) =>
  String(path ?? '')
    .split('/')
    .pop()
    .replace(/\.[a-z]+$/i, '')

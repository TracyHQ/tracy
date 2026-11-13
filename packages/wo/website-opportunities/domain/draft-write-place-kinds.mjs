// The kinds of place the write guard tells apart (ticket #597): a place that writes an address (where a code address is
// refused; words are never read as one), a plain text column or key (which holds no tag at all), and a record's own
// link. Pure.
import { URL_ATTRS } from './draft-write-markup.mjs'

/** Whether a location writes an address. */
export const addressAt = (loc, e, slot) =>
  ['link', 'image'].includes(e?.type) ||
  ['link', 'image', 'picture'].includes(slot?.type) ||
  Boolean(loc?.as) ||
  URL_ATTRS.has(/@([a-z:-]+)$/i.exec(loc?.xpath ?? '')?.[1]?.toLowerCase())
/** Columns and keys that hold plain text only (a title, an alias, a name, an SEO title or description). */
export const PLAIN_COLUMNS = new Set([
  'title',
  'alias',
  'name',
  'label',
  'metadesc',
  'metakey',
  'sitename',
  'fromname',
  'menutype'
])
const PLAIN_KEYS = new Set(['page_title', 'menu-meta_description', 'menu-meta_keywords', 'menu_text'])
export const plainAt = (loc) =>
  !loc?.xpath &&
  (loc?.jsonPath?.length ? PLAIN_KEYS.has(String(loc.jsonPath.at(-1))) : PLAIN_COLUMNS.has(loc?.column))
/** A record's own link as written (`index.php?...`, given whole or `{fixed}`); null when it names another record. */
export const linkOf = (op) =>
  typeof op.link === 'string' ? op.link : typeof op.link?.fixed === 'string' ? op.link.fixed : null
/** A tag, a comment or any `<!`, `<?`, `</` form: never in a plain text column. */
export const TAG_START = /<[a-zA-Z/!?]/

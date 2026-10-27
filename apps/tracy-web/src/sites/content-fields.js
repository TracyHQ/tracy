/**
 * ONLY THE KEYS ASKED FOR: `content.read {fields}`.
 *
 * A read answers the whole record — body, images, every block with every field and its
 * constraints — when the question was "what are the headings on this page". The model reads all of
 * it, pays for all of it, and picks the wrong slot more often in a long answer than in a short one.
 * `fields` is an include-only list of paths; the relay trims the envelope the Claude Cowork plugin sent, so no
 * Claude Cowork plugin learns a new query. The ids that address what is kept always stay: a content's `id` and
 * `native`, a block's `id`, a field's `key` — without them nothing kept could be written back.
 *
 * Paths: a content key (`title`, `url`, `revision`…), `blocks.<block key>`, `blocks.fields.<field
 * key>` and `fields.<field key>` (the record's own fields). A bare `blocks` or `fields` keeps them
 * whole.
 */

const CONTENT_KEYS = [
  'type',
  'title',
  'slug',
  'url',
  'locale',
  'translationGroupId',
  'summary',
  'publishedAt',
  'createdAt',
  'updatedAt',
  'revision',
  'detailState',
  'links',
  'bodyHtml',
  'tags',
  'fields',
  'blocks',
  'images',
  'relations',
  'blocksPagination',
  'publication',
  'writable',
  'lockedBy'
]
const BLOCK_KEYS = [
  'key',
  'role',
  'position',
  'sharedContentId',
  'visibility',
  'fields',
  'items',
  'itemsPagination',
  'writable'
]
/** A field's own keys, and the three the relay adds (`content-extend.js`). */
const FIELD_KEYS = ['type', 'value', 'slotKey', 'semanticKey', 'writable', 'constraints', 'next']

/** Every path `fields` accepts, in the order a refusal lists them. */
export const PROJECTION_PATHS = [
  ...CONTENT_KEYS,
  ...BLOCK_KEYS.filter((key) => key !== 'fields').map((key) => `blocks.${key}`),
  ...FIELD_KEYS.map((key) => `blocks.fields.${key}`),
  ...FIELD_KEYS.map((key) => `fields.${key}`)
]

/**
 * The paths a `fields` parameter names, or why it cannot be used.
 * @param {unknown} value - a comma-separated string or an array of strings.
 * @returns {{ paths: string[] } | { problem: string }}
 */
export function projectionOf(value) {
  const raw = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : null
  if (raw === null || raw.some((one) => typeof one !== 'string'))
    return { problem: 'fields must be a list of keys, e.g. "title,url" or ["title","blocks.fields.value"]' }
  const paths = [...new Set(raw.map((one) => one.trim()).filter((one) => one !== ''))]
  if (paths.length === 0) return { problem: 'fields names no key; leave it out to read everything' }
  const unknown = paths.find((path) => !PROJECTION_PATHS.includes(path))
  if (unknown !== undefined)
    return {
      problem: `fields has no key ${JSON.stringify(unknown)}; a field of a block is "blocks.fields.<key>" (value, slotKey…), a content key is one of ${CONTENT_KEYS.join(', ')}`
    }
  return { paths }
}

/** @param {string[]} paths @param {string} prefix */
const under = (paths, prefix) =>
  paths.filter((path) => path.startsWith(`${prefix}.`)).map((path) => path.slice(prefix.length + 1))

/** Keep `keep` of `object`, always its identity key. */
function pick(object, identity, keep) {
  const out = { [identity]: object?.[identity] }
  for (const key of keep) if (object && key in object) out[key] = object[key]
  return out
}

/** @param {any[]} fields @param {string[]} keys */
const projectFields = (fields, keys) =>
  Array.isArray(fields) ? fields.map((field) => pick(field, 'key', keys)) : fields

/**
 * @param {any} block @param {string[]} paths - the paths under `blocks.`.
 */
function projectBlock(block, paths) {
  const own = paths.filter((path) => !path.includes('.'))
  const fieldKeys = under(paths, 'fields')
  const out = pick(block, 'id', own)
  if (fieldKeys.length > 0) out.fields = projectFields(block?.fields, fieldKeys)
  return out
}

/**
 * The envelope with every content cut to `paths`, and `projection` saying so.
 * @param {any} envelope - a `tracy-content/v1` envelope, after `extendEnvelope`.
 * @param {string[]} paths
 */
export function projectEnvelope(envelope, paths) {
  const own = paths.filter((path) => !path.includes('.'))
  const blockPaths = own.includes('blocks') ? [] : under(paths, 'blocks')
  const fieldKeys = own.includes('fields') ? [] : under(paths, 'fields')
  const contents = (Array.isArray(envelope?.contents) ? envelope.contents : []).map((row) => {
    const out = pick(row, 'id', own)
    // Kept like the id: the CMS records a kept content is written through (`native`).
    if (Array.isArray(row?.native)) out.native = row.native
    if (blockPaths.length > 0 && Array.isArray(row?.blocks))
      out.blocks = row.blocks.map((block) => projectBlock(block, blockPaths))
    if (fieldKeys.length > 0 && Array.isArray(row?.fields)) out.fields = projectFields(row.fields, fieldKeys)
    return out
  })
  return { ...envelope, projection: paths, contents }
}

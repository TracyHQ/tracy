/**
 * `content.read {fields}`: THE KEYS THE RELAY TAKES, MIRRORED, AND THE MISTAKES A MODEL MAKES IN THEM.
 *
 * 🔒 WHY. `fields` keeps only the paths it names (`apps/tracy-web/src/sites/content-fields.js`) and
 * refuses any other, naming ONE unknown key per refusal. Measured on the round-7 bench (29–30/09/2026):
 * 12 of the 15 `CONTENT_BAD_QUERY` answers were a `fields` key that does not exist — `blocks.fields.key`
 * (5), `blocks.kind`, `blocks.name`, `blocks.title`, `blocks.label`, `blocks.slotName`, `path` — and two
 * runs were refused twice in a row because a second wrong key sat behind the first. Every one of them
 * asked for what the relay ALWAYS returns (a block's `id`, a field's `key`) or for a name the record has
 * under another one (`url`), so the refusal cost a step and the answer it was for came a step later.
 *
 * So the host takes the mistake apart before the call leaves: a key the relay always keeps is dropped,
 * `path` is read as `url`, a key that names nothing is dropped, and each is said in `normalized`. It
 * only ever REMOVES or renames names inside an include-only list, so the answer is at most smaller than
 * asked, never different, and a call that named nothing valid is relayed as it came (the refusal, with
 * its `next`, names what to send).
 *
 * `revision` is added when the read shows slots. A `content.contract` apply is based on the revisions a
 * read showed (`call-memory` `rememberContentRevisions`), and a content with no `revision` teaches it
 * nothing: a projection without it made the next apply answer INSPECT_FIRST — an inspect of 12–20 s.
 *
 * site-tools cannot import tracy-web, so the list is a mirror; `test/normalize-content-read.test.mjs`
 * compares it with the relay's own export, both ways. Pure: no I/O.
 */

/** A content's own keys (`CONTENT_KEYS` of the relay). */
export const CONTENT_KEYS = Object.freeze([
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
])

/** A block's own keys, each read as `blocks.<key>` (`BLOCK_KEYS` of the relay, without `fields`). */
export const BLOCK_KEYS = Object.freeze([
  'key',
  'role',
  'position',
  'sharedContentId',
  'visibility',
  'items',
  'itemsPagination',
  'writable'
])

/** A field's keys, read as `blocks.fields.<key>` or `fields.<key>` (`FIELD_KEYS` of the relay). */
export const FIELD_KEYS = Object.freeze([
  'type',
  'value',
  'slotKey',
  'semanticKey',
  'writable',
  'constraints',
  'next'
])

/** Every path `fields` accepts, as the relay lists them. */
export const FIELD_PATHS = Object.freeze([
  ...CONTENT_KEYS,
  ...BLOCK_KEYS.map((key) => `blocks.${key}`),
  ...FIELD_KEYS.map((key) => `blocks.fields.${key}`),
  ...FIELD_KEYS.map((key) => `fields.${key}`)
])

/**
 * The paths the relay always keeps whatever `fields` says: a content's `id` and `native`, a block's
 * `id`, a field's `key` — without them nothing kept could be written back. Naming one is refused,
 * though it asks for nothing the answer would not carry anyway.
 */
export const ALWAYS_KEPT = Object.freeze(['id', 'native', 'blocks.id', 'blocks.fields.key', 'fields.key'])

/**
 * A name a model gives to a key the record has under another one. Only `path`: the pages view
 * (`view:"pages"`) names a row's address `path`, and a content record names it `url`.
 */
const RENAMED = Object.freeze({ path: 'url' })

/**
 * The paths that carry slots (a field's `slotKey` and `value`), so a read that names one shows what a
 * `content.contract` apply is written against.
 * @param {string} path
 */
const showsSlots = (path) =>
  path === 'blocks' ||
  path === 'blocks.items' ||
  path === 'fields' ||
  path.startsWith('blocks.fields') ||
  path.startsWith('fields.')

/**
 * What a model that asked for a wrong block key was after, in one clause: the keys a block has.
 * ≤ 90 characters, the size of one `normalized` entry.
 */
const BLOCK_HAS = 'a block has key, role, position, visibility, fields, items'

/**
 * `fields` as it should be sent, and what was said about it.
 *
 * @param {unknown} value - `params.fields`: a comma-separated string, or a list of strings.
 * @returns {{ fields: string[] | null, notes: string[] } | null} `null`: nothing to change,
 *   relay the call as it is (also for a value that is not a string or list, and for a list that names
 *   only keys that do not exist — the relay's refusal is then the right answer). `fields: null` when
 *   the call named only ids: it reads everything.
 */
export function normalizeFields(value) {
  const asked = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : null
  if (asked === null || asked.some((one) => typeof one !== 'string')) return null
  const named = [...new Set(asked.map((one) => String(one).trim()).filter((one) => one !== ''))]
  if (named.length === 0) return null
  /** @type {string[]} */
  const kept = []
  /** @type {string[]} */
  const always = []
  /** @type {string[]} */
  const renamed = []
  /** @type {string[]} */
  const unknown = []
  for (const path of named) {
    const other = Object.hasOwn(RENAMED, path) ? RENAMED[/** @type {keyof typeof RENAMED} */ (path)] : null
    if (ALWAYS_KEPT.includes(path)) always.push(path)
    else if (FIELD_PATHS.includes(path)) kept.push(path)
    else if (other !== null) {
      renamed.push(`${path} is ${other}`)
      if (!named.includes(other) && !kept.includes(other)) kept.push(other)
    } else unknown.push(path)
  }
  if (always.length === 0 && renamed.length === 0 && unknown.length === 0) return withRevision(named, [])
  // Nothing valid left. Only ids named: the read answers everything (each row's ids stay). Something
  // that names nothing was named too: relayed as it came, for the relay to say which key.
  if (kept.length === 0) {
    if (unknown.length > 0) return null
    return {
      fields: null,
      notes: [
        `fields ${always.join(', ')} dropped: ids are always kept`,
        'params.fields dropped: it named only ids'
      ]
    }
  }
  /** @type {string[]} */
  const notes = []
  if (always.length > 0) notes.push(`fields ${always.join(', ')} dropped: ids are always kept`)
  for (const one of renamed) notes.push(`fields ${one}`)
  if (unknown.length > 0) {
    notes.push(`fields ${unknown.join(', ')} dropped: no such key`)
    if (unknown.some((path) => path.startsWith('blocks.') && !path.startsWith('blocks.fields')))
      notes.push(BLOCK_HAS)
  }
  return withRevision(kept, notes)
}

/**
 * The list to send, with `revision` in it when the read shows slots and does not ask for it.
 * @param {string[]} paths - valid paths, in the order asked.
 * @param {string[]} notes
 * @returns {{ fields: string[], notes: string[] } | null} null when nothing was changed.
 */
function withRevision(paths, notes) {
  const add = paths.some(showsSlots) && !paths.includes('revision')
  if (!add && notes.length === 0) return null
  return {
    fields: add ? [...paths, 'revision'] : paths,
    notes: add ? [...notes, 'fields revision added: an apply after this read is based on it'] : notes
  }
}

/**
 * A row in `ec_posts` / `ec_pages` ⇄ a file in `SiteContent/`.
 *
 * The projection Tracy tracks is the WORDS, not the store. Committing `data.db` itself would make
 * every one-word edit a new 1.4 MB blob whose diff says nothing — the history would grow while
 * answering no question anybody asks. So the store stays out of git, and this file decides what its
 * readable shadow looks like.
 *
 * ## What crosses back, and what only ever comes out
 *
 * Editing prose is the point; editing identity is not. `id`, `created_at`, `version` and the
 * revision pointers are emdash's own bookkeeping — they appear in the front matter because a person
 * reading the file needs to know which row it is, and they are IGNORED on the way back. A file that
 * has had its `id` rewritten is not an instruction to move a post, it is a mistake, and the safe
 * reading of a mistake is to change nothing.
 *
 * `title`, `slug`, `excerpt`, `status` and the body do cross back: those are the words.
 */

import { fromMarkdown, roundTrips, toMarkdown } from './portableText.mjs'
import { serializeFile, splitFile } from './frontmatter.mjs'

/** Fields a file may change. Everything else in the front matter is there to be read, not obeyed. */
export const EDITABLE = ['title', 'slug', 'status', 'excerpt']

/** The two collections emdash keeps prose in, and the directory each is mirrored into. */
export const COLLECTIONS = [
  { table: 'ec_posts', dir: 'posts' },
  { table: 'ec_pages', dir: 'pages' }
]

/** JSON with object keys in a fixed order, so two equal values compare equal as strings. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

function parseContent(raw) {
  if (typeof raw !== 'string') return Array.isArray(raw) ? raw : []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

/**
 * Where a row's file lives.
 *
 * The id leads, and that is not decoration: two posts may hold the same slug in different locales,
 * and a slug is the thing an author changes. A filename built from the slug alone would rename the
 * file on every retitle, which reads in git as "deleted one post, wrote another" and loses the
 * history of the thing that actually happened.
 */
export function pathFor(dir, row) {
  const slug = String(row.slug ?? '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `SiteContent/${dir}/${row.id}${slug ? `-${slug}` : ''}.md`
}

/**
 * One row → the file that mirrors it.
 *
 * Key order is fixed and no timestamp of ours is written: a field that moves on every export
 * rewrites every file on every Sync, which is how a real change becomes invisible in the diff.
 */
export function fileFor(row) {
  const data = {
    id: row.id,
    collection: row.collection ?? null,
    slug: row.slug ?? null,
    status: row.status ?? null,
    locale: row.locale ?? null,
    title: row.title ?? null,
    excerpt: row.excerpt ?? null,
    featured_image: row.featured_image ?? null,
    published_at: row.published_at ?? null,
    updated_at: row.updated_at ?? null,
    version: typeof row.version === 'number' ? row.version : null
  }
  return serializeFile(data, toMarkdown(parseContent(row.content)))
}

/**
 * A file, read back against the row it mirrors.
 *
 * Returns the columns to write and nothing else, or a refusal naming what stopped it. There is no
 * third answer on purpose: "applied most of it" is the outcome this whole module exists to make
 * unreachable.
 *
 * @param {string} contents the file on disk.
 * @param {object} row the row as it currently stands, for its keys and its identity.
 * @returns {{ok: true, id: string, changes: object}|{ok: false, reason: string}}
 */
export function changesFrom(contents, row) {
  const { data, body } = splitFile(contents)
  if (!data.id) return { ok: false, reason: 'no_id_in_frontmatter' }
  // The file names a different row than the one we read. Something is out of step — a copied file,
  // a hand-edited id, an export from another site — and guessing which is not this function's job.
  if (data.id !== row.id) return { ok: false, reason: 'id_does_not_match_row' }

  const previous = parseContent(row.content)
  // The guard. Whatever the projection gets wrong costs a refusal here, never a live edit.
  if (!roundTrips(body, previous)) return { ok: false, reason: 'body_does_not_round_trip' }

  const changes = {}
  for (const field of EDITABLE) {
    const next = data[field] ?? null
    const current = row[field] ?? null
    if (next !== current) changes[field] = next
  }

  const blocks = fromMarkdown(body, previous)
  // Compared CANONICALLY, not as stored text. Whitespace in the column, and the order the keys of a
  // block happen to sit in, are not changes to the post — a parse and a re-serialise reorder them
  // by construction. Comparing the raw strings would mark every untouched post as edited on every
  // Sync, bump `updated_at` on all of them, and bury the one post that really changed.
  if (canonical(blocks) !== canonical(previous)) changes.content = JSON.stringify(blocks)

  return { ok: true, id: row.id, changes }
}

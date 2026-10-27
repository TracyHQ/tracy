/**
 * Provenance stamps for Tracy's comment picker: which entry, and which field of it, printed each
 * element of a page. EmDash runs no Claude Cowork plugin, so the template prints them itself.
 *
 * WHAT. On a stamped request, an element showing an entry's value carries
 *
 *     data-tracy-src="emdash:<collection>:<entry id>:<slug> field:<key>"
 *
 * `field:<repeater>.<subfield>` inside a repeater row, `field:<field>.<_key>` on one block of a
 * Portable Text field (`stampBlocks`), `block:<repeater>` on the row itself, and no
 * second word on an element that shows a whole entry (a card, a list item). The page's own entry is
 * a `<template data-tracy-owner="emdash:…">` directly in `<body>`. The entry id is the ULID the
 * EmDash REST API and admin use (`entry.data.id`); the slug is what Tracy's Content API reports for
 * the entry, so the resolver (`apps/tracy-web/src/sites/content-locate.js` `markOwner`) matches on
 * it. The picker (`packages/cms/tracy-cms-preview/src/pick.mjs`) reads the stamps of an element and
 * its ancestors, innermost first. The format is shared by the picker, the resolver and the
 * WordPress and Joomla plugins: changing it is a contract change on all of them.
 *
 * WHEN. Only when the request carries `X-Tracy-Preview: pick`. Tracy's site proxy sets it after it
 * verified a preview ticket and strips any `x-tracy-*` header a browser sent. Every other request
 * gets the page without a single stamp: each helper returns `{}` and Astro spreads nothing. A
 * forged header obtains the ids and slugs of entries the same request already renders, nothing
 * more. The middleware keeps a stamped answer out of shared caches (`keepPickPrivate`).
 *
 * WHERE FROM. This file, `PageOwner.astro` and the three `Prose*.astro` renderers come from the
 * EmDash template kit (`scripts/src/` of tracy-emdash-template) and must stay identical to it; the
 * views that call them are the template's own.
 */

/** The request header Tracy's site proxy sets on a verified preview. */
export const PICK_HEADER = 'x-tracy-preview'

/** Does this request ask for stamps? */
export function isPicking(request: Request): boolean {
  return request.headers.get(PICK_HEADER) === 'pick'
}

/**
 * Keep a stamped answer out of shared caches: a page rendered with stamps is Tracy's preview of it,
 * never the public page, so no shared cache may keep it and any cache in front must key on the
 * header. Called by `src/middleware.ts` on the response of every request; the admin is left alone.
 */
export function keepPickPrivate(request: Request, pathname: string, headers: Headers): void {
  if (!isPicking(request) || pathname.startsWith('/_emdash/')) return
  headers.set('Cache-Control', 'private, no-store')
  headers.append('Vary', PICK_HEADER)
}

/** Anything EmDash hands a view for one entry: a live entry, or its `data`. */
export type EntryLike =
  | { id?: unknown; slug?: unknown; data?: { id?: unknown; slug?: unknown } | null }
  | null
  | undefined

const COLLECTION = /^[a-z][a-z0-9_]*$/
const TOKEN = /^[^\s:"]+$/

/**
 * The owner mark of one entry, or null when the entry has no id or slug to name. A live entry keeps
 * its ULID in `data.id` and its slug in `slug` (its own `id` IS the slug, 0.37); a `data` object
 * passed on its own carries both as `id` and `slug`.
 */
export function ownerMark(collection: string, entry: EntryLike): string | null {
  if (!entry || !COLLECTION.test(collection)) return null
  const data = entry.data ?? null
  const id = data ? data.id : entry.id
  const slug = entry.slug ?? data?.slug ?? (data ? entry.id : null)
  if (typeof id !== 'string' || typeof slug !== 'string' || !TOKEN.test(id) || !TOKEN.test(slug)) return null
  return `emdash:${collection}:${id}:${slug}`
}

/** Attributes to spread on an element: one `data-tracy-src`, or none. */
export type Attrs = Record<string, string>

/** Stamps for one entry: call it with a field key, or with nothing for the whole entry. */
export interface Stamp {
  (field?: string): Attrs
  /** The row of a repeater field. */
  block(repeater: string): Attrs
  /** The owner mark itself, or null on an ordinary request. */
  readonly owner: string | null
}

const KEY = /^[A-Za-z0-9_.-]+$/

/**
 * The stamp helper for one entry on this request. On an ordinary request every call returns an
 * empty object, so `<h1 {...s('title')}>` renders exactly `<h1>`.
 */
export function stampFor(request: Request, collection: string, entry: EntryLike): Stamp {
  const owner = isPicking(request) ? ownerMark(collection, entry) : null
  const attrs = (second: string | null): Attrs =>
    // A fresh object every call, never a shared frozen one: Astro's spreadAttributes writes `class`
    // into the spread object when the element also has `class:list`, and a frozen object then
    // throws "Cannot add property class, object is not extensible" (measured 29/09/2026 on
    // tracy-saas: every section with `class:list` answered 500 on an ordinary request).
    owner ? { 'data-tracy-src': second ? `${owner} ${second}` : owner } : {}
  const stamp = ((field?: string) => attrs(field && KEY.test(field) ? `field:${field}` : null)) as Stamp
  stamp.block = (repeater: string) => attrs(KEY.test(repeater) ? `block:${repeater}` : null)
  Object.defineProperty(stamp, 'owner', { value: owner })
  return stamp
}

/** `stampFor` bound to one request, for views that stamp many entries: `$('projects', p)('title')`. */
export function stampsFor(request: Request): (collection: string, entry: EntryLike) => Stamp {
  return (collection, entry) => stampFor(request, collection, entry)
}

/**
 * Stamps handed to a React island, keyed by the part of it they belong to (`label`, `title`…).
 * An island draws its DOM again on hydration, so a stamp in the server HTML alone would vanish:
 * the island spreads `{...marks?.title}` itself, and the stamp survives hydration.
 */
export type IslandMarks<K extends string = string> = Partial<Record<K, Attrs>>

/**
 * `{ marks }` holding every non-empty stamp of `parts`, or `{}` when none is. Astro serializes
 * every island prop into the page, so an empty `marks: {}` would change the HTML of an ordinary
 * request; spreading this adds nothing at all there: `{ ...item, ...islandMarks({ title: s('title') }) }`.
 */
export function islandMarks<K extends string>(parts: Record<K, Attrs>): { marks?: IslandMarks<K> } {
  const marks: IslandMarks<K> = {}
  let any = false
  for (const key of Object.keys(parts) as K[]) {
    if (parts[key]['data-tracy-src']) {
      marks[key] = parts[key]
      any = true
    }
  }
  return any ? { marks } : {}
}

/**
 * The node property a stamped Portable Text block carries its stamp in; `ProseBlock.astro`,
 * `ProseListItem.astro` and `ProseQuote.astro` print it as `data-tracy-src`.
 */
export const BLOCK_SRC = '_tracySrc'

// Tracy's Content API gives a Portable Text block the id `<field>.<_key>` only for a key that is
// unique in the field and matches this (`tools/content-api/reader.mjs` BLOCK_KEY); the stamp names
// the same blocks and no others, so a stamp never points at an id the Content API does not have.
const BLOCK_KEY = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The blocks of one Portable Text field, each text block carrying `field:<field>.<_key>` in
 * `BLOCK_SRC`. The key is the block's own stored `_key`, which the EmDash editor keeps across saves:
 * a paragraph keeps its stamp when another one is added above it. On an ordinary request the very
 * same array comes back. The stored value is never mutated (stamped blocks are shallow copies).
 */
export function stampBlocks<T>(stamp: Stamp, field: string, blocks: T[] | null | undefined): T[] {
  const list = Array.isArray(blocks) ? blocks : []
  if (!stamp.owner || !KEY.test(field)) return blocks ?? list
  const isText = (b: any) => b && b._type === 'block' && Array.isArray(b.children)
  const count = new Map<string, number>()
  for (const b of list as any[]) if (isText(b)) count.set(b._key, (count.get(b._key) ?? 0) + 1)
  return list.map((b: any) =>
    isText(b) && typeof b._key === 'string' && BLOCK_KEY.test(b._key) && count.get(b._key) === 1
      ? { ...b, [BLOCK_SRC]: `${stamp.owner} field:${field}.${b._key}` }
      : b
  )
}

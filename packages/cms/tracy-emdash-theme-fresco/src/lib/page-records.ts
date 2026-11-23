/**
 * Which page record an internal link lands on, and whether that record is still published (TCH #1013).
 *
 * When the customer unticks a page in Tracy's "Pages" question, Apply unpublishes its record and the
 * page's list view answers 404 on `!entry`. Decided 08/10/2026: a button or link in content that leads
 * there goes on its own (its section stays, nothing is relinked), and the page's children go with it,
 * unless a page the customer KEPT still lists the child: then the child stays reachable, and it answers
 * 404 only when no kept page lists it (Tracy SaaS: Blog unticked, Engineering kept, its posts still open).
 * This file is the pure half — the route table, the lookup and the listed children are passed in
 * (`link-gate.ts` wires them to EmDash), so the same file serves every theme and runs in node tests.
 * Re-publishing the page (or `personalize --revert`) brings every link back: nothing here writes.
 */

/** A page record: the collection and slug a list view reads with `getEmDashEntry`. */
export interface PageRecord {
  collection: string
  slug: string
}

/**
 * Site path without its leading slash → the page record that serves it and every path below it. A key
 * is one segment (`projects`) where a theme routes by its first segment, or several (`product/blog`)
 * where pages carry their own nested `path`; the longest key that prefixes the URL wins.
 */
export type RecordTable = Readonly<Record<string, PageRecord>>

/** Answers whether a page record is published in the locale being drawn. */
export type FetchRecord = (record: PageRecord) => Promise<boolean>

/**
 * The child paths (`sitePath` form) that a page the customer kept still lists, in the locale being drawn.
 * Read only when a URL asked lands on a record that is off, and at most once per checker.
 */
export type ListedChildren = () => Promise<ReadonlySet<string>>

/**
 * The site path of an internal URL: `/a/b`, without a locale prefix, query, hash or trailing slash (`/` for
 * the root). External, protocol-relative, anchor-only and mailto/tel URLs have none (null).
 */
export function sitePath(url: unknown, locales: readonly string[] = []): string | null {
  if (typeof url !== 'string') return null
  const raw = url.trim()
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  const segs = raw
    .replace(/[?#].*$/, '')
    .split('/')
    .filter(Boolean)
  if (segs.length > 0 && locales.includes(segs[0])) segs.shift()
  return `/${segs.join('/')}`
}

/** The record a site path lands on and the table key that matched (the record's own page is `/<key>`). */
function match(path: string | null, table: RecordTable): { record: PageRecord; key: string } | null {
  if (!path) return null
  const segs = path.split('/').filter(Boolean)
  for (let n = segs.length; n > 0; n--) {
    const key = segs.slice(0, n).join('/')
    if (Object.hasOwn(table, key)) return { record: table[key], key }
  }
  return null
}

/**
 * The page record an internal URL lands on: the longest leading run of its path segments (after a
 * locale prefix) that `table` names. A deeper path (`/projects/<slug>`, `/news/category/<c>`,
 * `/product/blog/<slug>`) lands on the same record, since a list page's children go with it. External,
 * protocol-relative, anchor-only, mailto/tel, root and unknown paths land on nothing, and there is
 * nothing to check.
 */
export function pageRecordFor(
  url: unknown,
  table: RecordTable,
  locales: readonly string[] = []
): PageRecord | null {
  return match(sitePath(url, locales), table)?.record ?? null
}

/**
 * A checker for one locale of one request: given the URLs a view is about to draw, it asks each page
 * record they land on once (cached across calls), and returns a sync predicate `live(url)` that is false
 * only for a URL whose page record is off and that no kept page lists (`listed`; the record's own page is
 * never in it). A record that cannot be read keeps its link: a lookup error never hides content. A listed
 * set that cannot be read lists nothing, so the children of an unticked page go with it as before.
 */
export function linkChecker(
  fetchRecord: FetchRecord,
  table: RecordTable,
  locales: readonly string[] = [],
  listed?: ListedChildren
) {
  const asked = new Map<string, Promise<boolean>>()
  const keyOf = (r: PageRecord) => `${r.collection}/${r.slug}`
  let children: Promise<ReadonlySet<string>> | null = null
  return async function check(urls: readonly unknown[]): Promise<(url: unknown) => boolean> {
    const known = new Map<string, boolean>()
    for (const url of urls) {
      const record = pageRecordFor(url, table, locales)
      if (!record) continue
      const key = keyOf(record)
      if (!asked.has(key))
        asked.set(
          key,
          fetchRecord(record).catch(() => true)
        )
      known.set(key, await (asked.get(key) as Promise<boolean>))
    }
    let kept: ReadonlySet<string> = new Set()
    if (listed && [...known.values()].includes(false)) {
      children ??= listed().catch(() => new Set<string>())
      kept = await children
    }
    return (url: unknown) => {
      const path = sitePath(url, locales)
      const hit = match(path, table)
      if (!hit || known.get(keyOf(hit.record)) !== false) return true
      return path !== `/${hit.key}` && kept.has(path as string)
    }
  }
}

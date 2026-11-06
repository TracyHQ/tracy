/**
 * A nested page hangs under its parent (TCH #1013, PAGE-7): `/menu/simple-menu` answers to its own record, but with `/menu`
 * unticked it is unreachable and never linked, whatever its own record says. `page-records.ts` (the kit's file) lets the
 * longest key win; this wraps its checker so every key that is a proper prefix of a URL must be live as well. Pure, so
 * node tests run it; `link-gate.ts` wires it to EmDash.
 */
import { sitePath, type RecordTable } from './page-records.ts'

/** The URLs of every table key that is a proper prefix of `url`'s path: `/menu/simple-menu` -> `/menu`. */
export function ancestorUrls(url: unknown, table: RecordTable, locales: readonly string[] = []): string[] {
  const path = sitePath(url, locales)
  if (!path) return []
  const segs = path.split('/').filter(Boolean)
  const out: string[] = []
  for (let n = 1; n < segs.length; n++) {
    const key = segs.slice(0, n).join('/')
    if (Object.hasOwn(table, key)) out.push(`/${key}`)
  }
  return out
}

type Check = (urls: readonly unknown[]) => Promise<(url: unknown) => boolean>

/** A checker that also asks the parents of the URLs, and answers false for a URL under a parent that is off. */
export function withParents(check: Check, table: RecordTable, locales: readonly string[] = []): Check {
  return async (urls) => {
    const live = await check([...urls, ...urls.flatMap((u) => ancestorUrls(u, table, locales))])
    return (url) => live(url) && ancestorUrls(url, table, locales).every((parent) => live(parent))
  }
}

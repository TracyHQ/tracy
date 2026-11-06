/**
 * The main menu minus the pages the customer unticked (TCH #1013, PAGE-4): a menu item whose page is off, and every item
 * under it, is not drawn, so no link leads to a 404. Pure, so node tests run it; `link-gate.ts` answers `live`.
 */

/** The shape of a menu item this gate reads (`ChromeMenuItem` of `chrome.ts` fits). */
export interface MenuNode {
  url?: string | null
  children: MenuNode[]
}

/** Every URL of a menu, at any depth. */
export function menuUrls(items: readonly MenuNode[]): string[] {
  return items.flatMap((i) => [...(i.url ? [i.url] : []), ...menuUrls(i.children)])
}

/**
 * The items whose page is reachable. An item with a URL goes when `live(url)` is false, children and all; a heading
 * (no URL) goes when all of its children did, since it would open nothing.
 */
export function pruneMenu<T extends MenuNode>(items: readonly T[], live: (url: string) => boolean): T[] {
  const out: T[] = []
  for (const item of items) {
    if (item.url && !live(item.url)) continue
    const children = pruneMenu(item.children as T[], live)
    if (!item.url && item.children.length > 0 && children.length === 0) continue
    out.push({ ...item, children })
  }
  return out
}

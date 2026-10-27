// Shared helpers for the header islands (megamenu and mobile drawer).
export interface NavLink {
  label: string
  url: string
  target?: string
  children: NavLink[]
}

/** A menu URL of `#` (or empty) has no destination: group headings and deliberate placeholders. */
export const hasDestination = (url: string | undefined | null): url is string => !!url && url !== '#'

/** True when `url` is the current page, or an ancestor of it (never for `/`, which matches only itself). */
export function isCurrent(url: string, currentPath: string): boolean {
  if (!hasDestination(url) || !url.startsWith('/')) return false
  const path = url.replace(/\/+$/, '') || '/'
  if (path === '/') return currentPath === '/'
  return currentPath === path || currentPath.startsWith(`${path}/`)
}

export function isItemActive(item: NavLink, currentPath: string): boolean {
  return isCurrent(item.url, currentPath) || item.children.some((c) => isItemActive(c, currentPath))
}

/** A megamenu column heading: no destination of its own, links as children (DECISIONS D20). */
export const isHeading = (item: NavLink): boolean => !hasDestination(item.url) && item.children.length > 0

/**
 * Column layout for a flat list of children (fallback when a group has no column headings): at most three rows per column, filled top to bottom.
 * The CMS menu has no column headings, so the columns are balanced rather than titled.
 */
export function columnRows(count: number): number {
  const columns = Math.max(1, Math.ceil(count / 3))
  return Math.ceil(count / columns)
}

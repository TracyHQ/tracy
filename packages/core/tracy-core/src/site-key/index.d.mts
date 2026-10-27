/**
 * Hand-written types for `index.mjs`, for consumer packages with no `allowJs` (same reason as
 * `../config/index.d.mts`). Kept in sync BY HAND with the JSDoc there.
 */

export declare const CREATION_MOUNT: '/new'

export declare function inCreationWorkspace(page: { pathname: string; basePathname?: string }): boolean

export declare function siteKeyOfPage(page: {
  pathname: string
  basePathname?: string
  cookie: string
}): string | null

export declare function siteKeyHere(): string | null

export interface NamedSiteRow {
  siteKey?: unknown
  displayName?: unknown
  aliases?: unknown
  copyUrl?: unknown
}

export declare function siteRowFor<R extends NamedSiteRow>(
  rows: readonly R[] | null | undefined,
  name: string | null | undefined
): R | null

export declare function siteNameFor(rows: readonly NamedSiteRow[] | null | undefined, name: string): string

export declare function siteKeyFor(
  rows: readonly NamedSiteRow[] | null | undefined,
  name: string | null | undefined
): string | null

export declare function followedAddress(
  url: string,
  rows: readonly NamedSiteRow[] | null | undefined
): string | null

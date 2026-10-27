/**
 * Hand-written types for `index.mjs`, for consumer packages with no `allowJs` (same reason as
 * `../config/index.d.mts`). Kept in sync BY HAND with the JSDoc there.
 */

export declare const PAGE_RECORD: RegExp
export declare const RECORD_PATH: RegExp
export declare const CHIP_EXCERPT: number
export declare const TAG_ONLY: RegExp

export declare function storageId(name: string): boolean

export declare function chipLabel(
  element: { status?: string; incomplete?: boolean; name?: string; text?: string; label?: string },
  form?: { many?: boolean }
): string

export declare const UNNAMED_ELEMENT: string
export declare const UNNAMED_PAGE: string

export declare function decodeEntities(text: string): string

export declare function replaceMentions(text: string, say: (words: string) => string): string

/** Types for `resolve.mjs`: the interface-language rule for pages outside dsh. */

type Table = Readonly<Record<string, unknown>> | undefined | null
type Params = Readonly<Record<string, string | number>>

export declare const DEFAULT_LANGUAGE: 'en'
export declare const LANGUAGE_COOKIE: 'tracy_lang'
export declare function matchLanguage(tag: unknown): string | null
export declare function firstLanguage(tags: unknown): string | null
export declare function resolveLanguage(input?: {
  query?: unknown
  cookie?: unknown
  browser?: unknown
}): string
export declare function cookieValue(header: unknown, name: string): string | null
export declare function htmlLang(lang: string): string
export declare function textOf(table: Table, key: string): string | null
export declare function interpolate(text: string, params?: Params): string
export declare function translate(tables: readonly Table[], key: string, params?: Params): string

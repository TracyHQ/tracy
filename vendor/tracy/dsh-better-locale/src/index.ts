/**
 * dsh-plugin-better-locale — host plugin entry.
 *
 * Client-only plugin: the host half has no runtime work. The browser half
 * (`./client`) is a pure language pack for DSH's native third-language API
 * (v0.1.2-alpha.1): it registers bundled catalog entries through
 * `ctx.locale.addLanguage` and their dictionaries through
 * `ctx.locale.register(ns, locale, dict)`, so each language becomes
 * selectable in DSH's own Language settings row with per-key fallback to
 * English. The dsh `locale.preference` setting carries the selection
 * natively — no monkey-patching, no localStorage.
 *
 * @module @huanlin/dsh-plugin-better-locale
 */

import type { Context } from '@deepseek-ai/cordis'

export const name = 'dsh-plugin-better-locale'
export const inject: string[] = []

/**
 * Host apply — no-op. The language-pack layer is a pure client-side
 * contribution; no host-side resources are used.
 * @param _ctx - host context (unused).
 */
export function apply(_ctx: Context): void {
  // Client-only plugin: all work happens in src/client/index.ts.
}

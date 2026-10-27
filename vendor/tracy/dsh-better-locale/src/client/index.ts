/**
 * dsh-plugin-better-locale — browser half.
 *
 * A pure language pack for DSH's native third-language API (v0.1.2-alpha.1):
 * for every bundled language the plugin registers the catalog entry through
 * `ctx.locale.addLanguage({ id, label, fallback })` and its dictionaries
 * through the single-locale form `ctx.locale.register(ns, locale, dict)`.
 * Each language's whole contribution (catalog entry + all namespace dicts)
 * is one `ctx.effect`, so HMR / fiber disposal removes exactly what was
 * added.
 *
 * What the native API takes over since the adaptation (previously done by
 * this plugin's monkey-patch of `LocaleRuntime.prototype.lookup`):
 *
 *   - selection UI: added languages appear in DSH's own Language row
 *     (Settings → General), so the plugin ships no settings row,
 *   - persistence: `setLocale` writes the durable `locale.preference`
 *     setting — no localStorage,
 *   - `<html lang>` sync, `locale/change` emission, and per-key fallback
 *     along the declared fallback chain (third language → en),
 *   - third-party plugin dictionaries: register them directly through
 *     `ctx.locale.register(ns, locale, dict)` — no `ctx.betterLocale`
 *     service is published anymore.
 *
 * The plugin has no UI of its own and no runtime imports of any DSH or
 * React module; the DSH reference is type-only and erased at build time.
 *
 * @module @huanlin/dsh-plugin-better-locale/client
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.locale Context merge (LocaleRuntime with
// addLanguage + the single-locale register overload). Erased at build
// time, so it never hits the client-bundle purity gate.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BUNDLED_LANGUAGES } from './languages.ts'

/** Required services: the locale service (catalog + dictionary registry). */
export const inject = ['locale']

/**
 * Client plugin body: register every bundled language's catalog entry and
 * dictionaries, one `ctx.effect` per language.
 * @param ctx - client cordis context.
 */
export function apply(ctx: Context): void {
  for (const language of BUNDLED_LANGUAGES) {
    ctx.effect(() => {
      const disposers = [
        ctx.locale.addLanguage({ id: language.id, label: language.label, fallback: language.fallback }),
        ...Object.entries(language.dicts).map(([ns, dict]) => ctx.locale.register(ns, language.id, dict)),
      ]
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, `dsh-plugin-better-locale: language ${language.id}`)
  }
}

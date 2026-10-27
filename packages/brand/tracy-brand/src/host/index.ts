/**
 * Node half of `@tracy/dsh-brand`.
 *
 * Three small jobs:
 *
 *   1. Declare the brand preferences (primary color, global font, code font) as this entry's Cordis
 *      `Config`, every field `.volatile()`. Since dsh 0.1.7 that is the only live-configuration
 *      mechanism: the Loader keeps the plugin mounted when only these fields change, and dsh's
 *      settings forms enumerate volatile fields by entry id (`tracy-brand`, the row id in both
 *      bundles). The values live in the profile's `cordis.patch.yml`, never in a per-browser store.
 *   2. Hand the CURRENT values to the browser on every index render (a `global` row), so the
 *      palette is right at boot even where the browser cannot read the settings mirror — a page
 *      served off loopback runs dsh's forms in `memory` mode and never receives them.
 *   3. Put Tracy's product name into the served HTML so the tab reads right before any script
 *      runs — the document title is the FIRST <title> in tree order, and index injections land
 *      right after <head>, ahead of dsh's own.
 */
import z from '@deepseek-ai/schemastery'
import {
  BOOT_GLOBAL,
  CODE_FONT_FIELD,
  DEFAULT_FONT,
  GLOBAL_FONT_FIELD,
  PRIMARY_FIELD
} from '../shared/settings.mjs'
import { PRODUCT_NAME } from '../shared/theme.mjs'

/** A Cordis volatile reference: stable identity, `get()` returns the value committed right now. */
interface VolatileRef<T> {
  get(): T
}

/** Resolved Config: one volatile reference per preference (keys = the `*_FIELD` constants). */
export interface Config {
  primaryColor: VolatileRef<string>
  globalFont: VolatileRef<string>
  codeFont: VolatileRef<string>
}

interface SettingsFiber {
  settings: { configure(presentation: { auto?: boolean }, owner: unknown): () => void }
  effect(fn: () => () => void): void
}

interface HostContext {
  fiber: unknown
  inject(services: string[], callback: (ctx: SettingsFiber) => void): void
  on(event: string, listener: (table: { push(...rows: unknown[]): void }) => void): void
}

/** Same-origin page loads crossfade, root only: nothing is named, so no element is lifted out. */
export const VIEW_TRANSITION =
  '<style>@view-transition{navigation:auto}::view-transition-group(root){animation-duration:180ms}</style>'

export const name = 'tracy-brand'

export const inject: string[] = []

/**
 * The live brand preferences. An empty primary means "the brand default" (see `DEFAULT_PRIMARY`),
 * so a profile that never set one follows a future default instead of pinning today's.
 */
export const Config = z.object({
  [PRIMARY_FIELD]: z.string().default('').volatile(),
  [GLOBAL_FONT_FIELD]: z.string().default(DEFAULT_FONT).volatile(),
  [CODE_FONT_FIELD]: z.string().default(DEFAULT_FONT).volatile()
})

/**
 * Snapshot of the three values, read at call time (volatile references change without a remount).
 * @param config - this entry's resolved Config.
 * @returns plain values, safe to serialise into the page.
 */
export function brandValues(config: Config): Record<string, string> {
  return {
    [PRIMARY_FIELD]: config.primaryColor.get(),
    [GLOBAL_FONT_FIELD]: config.globalFont.get(),
    [CODE_FONT_FIELD]: config.codeFont.get()
  }
}

export function apply(ctx: HostContext, config: Config): void {
  // Tracy renders its own rows in General settings, so dsh must not generate a second form for this
  // entry on the Plugins page. `settings` is optional here: a profile that turns it off (the fleet
  // does — one dsh serves every site, nobody may write the profile from a browser) still boots.
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
  })
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'html', placement: 'head', html: `<title>${PRODUCT_NAME}</title>` })
    // ONE WORKSPACE, ONE SITE (15/09/2026): switching site is a full page load (each site is its own
    // seat), and it flashed. A cross-document view transition crossfades the two pages instead —
    // both halves must opt in BEFORE their first paint, so the rule rides the served index's head,
    // never a plugin's runtime <style>. Browsers without it navigate exactly as before.
    table.push({ kind: 'html', placement: 'head', html: VIEW_TRANSITION })
    // Rows are collected fresh for every index render, so this reads the values live right now.
    table.push({ kind: 'global', name: BOOT_GLOBAL, value: brandValues(config) })
  })
}

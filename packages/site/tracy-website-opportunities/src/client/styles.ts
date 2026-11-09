/**
 * The plugin's stylesheet, injected once into dsh's page.
 *
 * Tailwind (theme + utilities, no preflight) runs at build time on `website-opportunities.css` and
 * arrives here through esbuild's `define` (`scripts/build-client.mjs`). The layout rules live in
 * `layout-css.ts`, written for a narrow right column (360–480px).
 */

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

import { CSS as LAYOUT_CSS } from './layout-css.ts'
import { DETAILS_CSS } from './details-css.ts'

/** The layout rules, then the Details page's own (`details-css.ts`). */
export const CSS = LAYOUT_CSS + DETAILS_CSS

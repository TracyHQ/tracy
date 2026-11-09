/**
 * The plugin's stylesheet, injected once into dsh's page.
 *
 * Tailwind (theme + utilities, no preflight) runs at build time on `website-opportunities.css` and
 * arrives here through esbuild's `define` (`scripts/build-client.mjs`). The layout rules live in
 * `layout-css.ts` (plus the progress card's `demo-progress-css.ts`), written for a narrow right column (360–480px).
 */

import { PROGRESS_CSS } from './demo-progress-css.ts'
import { CSS as LAYOUT_CSS } from './layout-css.ts'

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

export const CSS = LAYOUT_CSS + PROGRESS_CSS

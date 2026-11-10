/**
 * The plugin's stylesheet, injected once into dsh's page.
 *
 * Tailwind (theme + utilities, no preflight) runs at build time on `website-opportunities.css` and
 * arrives here through esbuild's `define` (`scripts/build-client.mjs`). The layout rules live in
 * `layout-css.ts`, then the Details page's own (`details-css.ts`), the review steps' (`review-css.ts`) and the progress card's
 * (`demo-progress-css.ts`), then the brief view's (`brief-view-css.ts`).
 */

import { BRIEF_VIEW_CSS } from './brief-view-css.ts'
import { PROGRESS_CSS } from './demo-progress-css.ts'
import { DETAILS_CSS } from './details-css.ts'
import { CSS as LAYOUT_CSS } from './layout-css.ts'
import { REVIEW_CSS } from './review-css.ts'

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

/** The layout rules, then the Details page's, the progress card's and the brief view's. */
export const CSS = LAYOUT_CSS + DETAILS_CSS + REVIEW_CSS + PROGRESS_CSS + BRIEF_VIEW_CSS

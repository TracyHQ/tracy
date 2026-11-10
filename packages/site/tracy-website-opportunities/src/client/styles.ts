/**
 * The plugin's stylesheet, injected once into dsh's page.
 *
 * Tailwind (theme + utilities, no preflight) runs at build time on `website-opportunities.css` and
 * arrives here through esbuild's `define` (`scripts/build-client.mjs`). The layout rules live in
 * `layout-css.ts` and My opportunities' (`my-list-css.ts`), then the Details page's own (`details-css.ts`), the review steps' (`review-css.ts`), the Workspace card's
 * (`workspace-css.ts`) and the progress card's
 * (`demo-progress-css.ts`), then the brief view's (`brief-view-css.ts`).
 */

import { BRIEF_VIEW_CSS } from './brief-view-css.ts'
import { PROGRESS_CSS } from './demo-progress-css.ts'
import { DETAILS_CSS } from './details-css.ts'
import { CSS as LAYOUT_CSS } from './layout-css.ts'
import { MY_LIST_CSS } from './my-list-css.ts'
import { REVIEW_CSS } from './review-css.ts'
import { WORKSPACE_CSS } from './workspace-css.ts'

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

/** The layout rules and My opportunities', then the Details page's, the progress card's and the brief view's. */
export const CSS =
  LAYOUT_CSS + MY_LIST_CSS + DETAILS_CSS + REVIEW_CSS + WORKSPACE_CSS + PROGRESS_CSS + BRIEF_VIEW_CSS

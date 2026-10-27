/**
 * The ask form tab's stylesheet, injected once into dsh's page.
 *
 * Tailwind (theme + utilities, no preflight — DESIGN.md §3) runs at build time on `ask-form.css`
 * and arrives here as a string through esbuild's `define` (`scripts/build-client.mjs`).
 */

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

/**
 * The stylesheet of the Brand tabs, injected once into dsh's page.
 *
 * Same recipe as `@tracy/dsh-design-inspiration`: Tailwind runs at build time on `src/client/brand-engine.css`
 * (theme + utilities, NO preflight — this bundle lives INSIDE dsh's page, and a second reset breaks
 * the host, CLAUDE.md LAW #4), and esbuild's `define` puts the result here as a string constant.
 */

/** The CSS Tailwind generated at build time, substituted here by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

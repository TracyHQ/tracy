/**
 * The stylesheet of the design inspirations tab, injected once into dsh's page.
 *
 * Same recipe as `@tracy/dsh-my-sites`: Tailwind runs at build time on `src/client/design-inspiration.css`
 * (theme + utilities, NO preflight — this bundle lives INSIDE dsh's page, and a second reset breaks
 * the host, CLAUDE.md LAW #4), and esbuild's `define` puts the result here as a string constant.
 * Colour only goes through tokens: `tokens.css` of `@tracy/ui` maps every shadcn variable onto
 * `--dsw-alias-*` with a fallback, so the tab follows dsh's light/dark switch.
 */

/** The CSS Tailwind generated at build time, substituted here by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

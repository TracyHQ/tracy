/**
 * The stylesheet of the three site tabs, injected once into dsh's page.
 *
 * Same recipe as `@tracy/dsh-my-sites`: Tailwind runs at build time on `src/client/site-tabs.css`
 * (theme + utilities, NO preflight — this bundle lives INSIDE dsh's page, and a second reset breaks
 * the host, CLAUDE.md LAW #4), and esbuild's `define` puts the result here as a string constant.
 * Colour only goes through tokens: `tokens.css` of `@tracy/ui` maps every shadcn variable onto
 * `--dsw-alias-*` with a fallback, so the tabs follow dsh's light/dark switch.
 */

import { CREATE_STEP_CSS, WIZARD_CSS, WIZARD_ROOT_CSS } from '@tracy/core/wizard-shell'

/** The CSS Tailwind generated at build time, substituted here by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

/**
 * The stepped wizard the Publish tab draws with: the same `.tas-` rules Add site writes (root,
 * step bar, sticky footer, notices), so the two read as one product.
 */
export const WIZARD_SHELL_CSS = [WIZARD_ROOT_CSS, WIZARD_CSS, CREATE_STEP_CSS].join('\n')

/**
 * The plugin's ONE stylesheet, injected once into dsh's page (`index.tsx`): Tailwind for the
 * account menu's row and the chip, then the shared cards' plain CSS.
 *
 * Tailwind (theme + utilities, no preflight — DESIGN.md §3) runs at build time on `model-plan.css`
 * and arrives here as a string through esbuild's `define` (`scripts/build-client.mjs`). The plain
 * stylesheets are imported as text (same script, `plainCssAsText`); a test build that loads `.css`
 * as `empty` gets no string for them, and the join below leaves them out rather than print
 * "undefined" into the page.
 */
import ACCOUNT_CARDS_CSS from './account-cards/account-cards.css'
import ACCOUNTS_PANE_CSS from './accounts-pane.css'

/** CSS Tailwind generated at build time, substituted by esbuild's `define`. */
declare const __TAILWIND_CSS__: string

export const TAILWIND = __TAILWIND_CSS__

/* Scope to the conversation header; match readable CSS-module tails rather than build hashes.
   Job labels stay intact at wide widths. The adapter copies only the localized count and tooltip;
   the original button, aria-label, spinner, chevron and menu remain owned by dsh. */
const HEADER = 'header[class*="_header"]'
const ACTIONS = '[class*="_headerActions"]'
const JOB = '[data-tracy-job-count]'
export const HEADER_CSS = `
${HEADER}:has(.tracy-model-chip) ${ACTIONS} { flex: 1 1 auto; min-width: 0; }
${HEADER} .tracy-model-chip-row { display: flex; flex: 0 1 auto; min-width: 0; }
${HEADER} ${ACTIONS} > [data-slot] > [class*="_root"]:has(> ${JOB}) { flex: none; }
${HEADER} ${JOB}, ${HEADER} ${JOB} > [class*="_count"] { white-space: nowrap; }
${HEADER} ${JOB} > svg { flex: none; }
@container (max-width: 360px) {
  ${HEADER} ${JOB} > [class*="_count"] { display: none; }
  ${HEADER} ${JOB}::before {
    content: attr(data-tracy-job-count); min-width: 1ch; padding: 0 5px;
    border-radius: 999px; background: var(--muted); color: var(--muted-foreground);
    line-height: 18px; text-align: center; font-variant-numeric: tabular-nums;
  }
  ${HEADER} ${ACTIONS} { gap: 4px; }
  ${HEADER} [class*="_headerUtilities"] { margin-left: 8px; }
}
/* Leave a useful slice of the model until only the fixed controls fit in the title row. */
@container (max-width: 110px) {
  ${HEADER} .tracy-model-chip-row, ${HEADER} .tracy-model-chip { display: none; }
}
`

/** Everything the plugin injects, in cascade order. */
export const STYLES: string = [TAILWIND, ACCOUNT_CARDS_CSS, ACCOUNTS_PANE_CSS, HEADER_CSS]
  .filter((part): part is string => typeof part === 'string' && part !== '')
  .join('\n')

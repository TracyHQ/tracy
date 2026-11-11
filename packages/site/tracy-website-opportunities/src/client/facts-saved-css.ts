/**
 * The saved profile on the Business facts bands (#537 R18): a generic cell's last line (source chip, Edited chip,
 * switch), a list or flags as small chips on one line, a count as a small figure beside its link or in the reviews
 * header, a quote cell of the About band, an item kept off the site dimmed, and the checkboxes of flags in Edit.
 * Tracy tokens only. No backtick may appear inside the template below.
 */
export const FACTS_SAVED_CSS = `
.tracy-wo-facts-meta { gap: 4px; }
.tracy-wo-facts-meta > .tracy-wo-facts-sw { flex: none; }
.tracy-wo-facts-cell[data-off] > :not(.tracy-wo-facts-meta), .tracy-wo-facts-pill[data-off] > :not(.tracy-wo-facts-sw):not(.tracy-wo-facts-fig) { opacity: 0.45; }
.tracy-wo-facts-pill > .tracy-wo-facts-sw { flex: none; }
.tracy-wo-facts-pill:has(> .tracy-wo-facts-fig) { max-width: none; }
.tracy-wo-facts-pill > a > .tracy-wo-facts-ell { min-width: 6ch; }
.tracy-wo-facts-minis { gap: 4px; overflow: hidden; }
.tracy-wo-facts-mini { flex: none; padding: 0 7px; border: 1px solid var(--border); border-radius: 999px; font-size: 11.5px; line-height: 18px; white-space: nowrap; }
.tracy-wo-facts-fig { display: inline-flex; align-items: center; gap: 4px; flex: none; min-width: 0; padding-left: 8px; border-left: 1px solid var(--border); color: var(--muted-foreground); font-size: 12px; font-variant-numeric: tabular-nums; }
.tracy-wo-facts-fig[data-off] > .tracy-wo-facts-ell { opacity: 0.5; }
.tracy-wo-facts-figs { display: inline-flex; align-items: center; gap: 8px; flex: 0 1 auto; min-width: 0; overflow: hidden; }
.tracy-wo-facts-figs > .tracy-wo-facts-fig:first-child { padding-left: 0; border-left: 0; }
.tracy-wo-facts-quotes { grid-auto-columns: minmax(240px, 1fr); }
.tracy-wo-facts-quote { justify-content: flex-start; }
.tracy-wo-facts-qt { margin: 0; font-size: 12.5px; line-height: 17px; }
.tracy-wo-facts-flags { display: flex; flex-wrap: wrap; gap: 6px 14px; }
.tracy-wo-facts-flag { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
`

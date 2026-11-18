/**
 * The look of the one status pill (`status-pill.tsx`, #537 option A1): 22px tall, 8px side padding (6px on the glyph
 * side), 11px weight 500, fully round, a 14px lucide glyph with a 2px stroke and a 5px gap, a tinted fill and no
 * border. The state picks a Tracy token: failed destructive, done success, attention warning, running primary,
 * neutral, off and info the muted foreground on a 7% foreground tint. In light the text is the token mixed with the
 * foreground for contrast; in dark it is the token itself. Failed is always the pure destructive red. A call site
 * that draws the pill over lines or a shaded pane sets --wo-pill-surface so the fill stays opaque.
 * No backtick may appear inside the template below.
 */
export const STATUS_PILL_CSS = `
.tracy-wo-pill { --wo-pill-c: var(--muted-foreground); flex: none; display: inline-flex; align-items: center; gap: 5px; box-sizing: border-box; height: 22px; max-width: 100%; margin: 0; padding: 0 8px; border: 0; border-radius: 999px; background: color-mix(in oklab, var(--wo-pill-c) 12%, var(--wo-pill-surface, transparent)); color: color-mix(in oklab, var(--wo-pill-c) 72%, var(--foreground)); font-size: 11px; line-height: 1; font-weight: 500; white-space: nowrap; vertical-align: middle; }
.tracy-wo-pill[data-glyph] { padding-left: 6px; }
.tracy-wo-pill > svg { flex: none; width: 14px; height: 14px; }
.tracy-wo-pill > .tracy-wo-pill-glyph { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.tracy-wo-pill-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-pill[data-pill='running'] { --wo-pill-c: var(--primary); }
.tracy-wo-pill[data-pill='done'] { --wo-pill-c: var(--success); }
.tracy-wo-pill[data-pill='attention'] { --wo-pill-c: var(--warning); }
.tracy-wo-pill[data-pill='failed'] { --wo-pill-c: var(--destructive); color: var(--destructive); }
.tracy-wo-pill[data-pill='neutral'], .tracy-wo-pill[data-pill='off'], .tracy-wo-pill[data-pill='info'] { background: color-mix(in oklab, var(--foreground) 7%, var(--wo-pill-surface, transparent)); color: var(--muted-foreground); }
[data-ds-dark-theme] .tracy-wo-pill, .dark .tracy-wo-pill { background: color-mix(in oklab, var(--wo-pill-c) 16%, var(--wo-pill-surface, transparent)); color: var(--wo-pill-c); }
[data-ds-dark-theme] .tracy-wo-pill[data-pill='neutral'], [data-ds-dark-theme] .tracy-wo-pill[data-pill='off'], [data-ds-dark-theme] .tracy-wo-pill[data-pill='info'], .dark .tracy-wo-pill[data-pill='neutral'], .dark .tracy-wo-pill[data-pill='off'], .dark .tracy-wo-pill[data-pill='info'] { background: color-mix(in oklab, var(--foreground) 7%, var(--wo-pill-surface, transparent)); color: var(--muted-foreground); }
.tracy-wo-pill-glyph[data-spin] { animation: tracy-wo-pill-spin 0.9s linear infinite; }
@keyframes tracy-wo-pill-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .tracy-wo-pill-glyph[data-spin] { animation: none; } }
`

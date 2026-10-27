/**
 * The plugin's layout rules, scoped under `.tracy-wo`, reading only Tracy tokens. Kept apart from
 * `styles.ts` so a bundler without esbuild's `__TAILWIND_CSS__` define (the public Find page, Vite)
 * can import them. No backtick may appear inside the template below: it would close the string.
 */
export const CSS = `
.tracy-wo { color: var(--foreground); font-size: 13px; line-height: 18px; }
.tracy-wo-tab { container-type: inline-size; display: flex; flex-direction: column; height: 100%; min-width: 0; overflow-y: auto; background: var(--background); }
.tracy-wo-body { display: flex; flex-direction: column; gap: 12px; padding: 12px; min-width: 0; }
.tracy-wo-stack { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.tracy-wo-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tracy-wo-wrap { flex-wrap: wrap; }
.tracy-wo-between { justify-content: space-between; }
.tracy-wo-back { align-self: flex-start; }
.tracy-wo-h2 { font-size: 15px; line-height: 20px; font-weight: 600; overflow-wrap: anywhere; }
.tracy-wo-h3 { font-size: 13px; line-height: 18px; font-weight: 600; }
.tracy-wo-label { font-size: 12px; font-weight: 500; color: var(--muted-foreground); }
.tracy-wo-name { font-weight: 600; overflow-wrap: anywhere; }
.tracy-wo-muted { color: var(--muted-foreground); }
.tracy-wo-small { font-size: 12px; line-height: 17px; }
.tracy-wo-note { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-error { font-size: 12px; color: var(--destructive); }
.tracy-wo-warn { color: color-mix(in oklab, var(--primary) 70%, var(--foreground)); }
.tracy-wo-ok { font-size: 12px; font-weight: 500; color: var(--foreground); }
.tracy-wo-empty { display: flex; flex-direction: column; gap: 4px; min-height: 64px; padding: 24px 12px; text-align: center; }
.tracy-wo-section { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
.tracy-wo-list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--card); }
.tracy-wo-list > li { border-top: 1px solid var(--border); }
.tracy-wo-list > li:first-child { border-top: 0; }
.tracy-wo-item { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; }
.tracy-wo-row-open { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; cursor: pointer; border-radius: 6px; }
.tracy-wo-list > li > .tracy-wo-row-open { padding: 10px 12px; }
.tracy-wo-row-open:hover { background-color: color-mix(in oklab, var(--foreground) 6%, transparent); }
.tracy-wo-row-open:focus-visible, .tracy-wo-candidate:focus-within { outline: 1px solid var(--ring); outline-offset: -1px; }
.tracy-wo-row-open .tracy-wo-name { flex: 1 1 auto; min-width: 0; }
.tracy-wo-chevron, .tracy-wo-icon { width: 14px; height: 14px; flex: 0 0 auto; color: var(--muted-foreground); }
.tracy-wo-job { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-candidate { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; cursor: pointer; }
.tracy-wo-candidate input { margin-top: 2px; accent-color: var(--primary); width: 16px; height: 16px; flex: 0 0 auto; }
.tracy-wo-candidate-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tracy-wo-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.tracy-wo-sticky { position: sticky; bottom: 0; z-index: 2; display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-top: 1px solid var(--border); background: var(--background); }
.tracy-wo-sticky-row { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-width: 0; }
.tracy-wo-sticky-note { flex: 1 1 auto; min-width: 0; }
.tracy-wo-fields { display: flex; flex-direction: column; gap: 8px; }
.tracy-wo-field dd { display: flex; flex-direction: column; gap: 2px; overflow-wrap: anywhere; }
.tracy-wo-review-author { display: flex; align-items: center; gap: 6px; }
.tracy-wo-review-author img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
.tracy-wo-reviews { gap: 8px; }
.tracy-wo-review { display: flex; flex-direction: column; gap: 2px; margin: 0; padding-left: 10px; border-left: 2px solid var(--border); }
.tracy-wo-facts { overflow-wrap: anywhere; }
.tracy-wo-swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.tracy-wo-swatch { display: flex; align-items: center; gap: 6px; }
.tracy-wo-chip { width: 20px; height: 20px; border-radius: 6px; border: 1px solid var(--border); }
.tracy-wo-media { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; }
.tracy-wo-tile { aspect-ratio: 1 / 1; overflow: hidden; border-radius: 8px; background: var(--muted); }
.tracy-wo-tile img, .tracy-wo-tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
.tracy-wo-photo { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.tracy-wo-file { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 6px; text-align: center; border: 1px dashed var(--border); color: inherit; text-decoration: none; }
.tracy-wo-file:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.tracy-wo-logo { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; flex: 0 0 auto; overflow: hidden; border-radius: 8px; border: 1px solid var(--border); background: var(--muted); }
.tracy-wo-logo img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.tracy-wo-sources { width: 100%; border-collapse: collapse; font-size: 12px; }
.tracy-wo-sources th, .tracy-wo-sources td { padding: 6px 4px; text-align: left; vertical-align: top; border-top: 1px solid var(--border); }
.tracy-wo-sources thead th { border-top: 0; color: var(--muted-foreground); font-weight: 500; }
.tracy-wo-sources td { display: table-cell; }
.tracy-wo-sources td > span { display: block; }
.tracy-wo-tone { font-weight: 600; }
.tracy-wo-tone.is-ok { color: var(--foreground); }
.tracy-wo-tone.is-partial, .tracy-wo-tone.is-blocked { color: color-mix(in oklab, var(--primary) 70%, var(--foreground)); }
.tracy-wo-tone.is-failed { color: var(--destructive); }
.tracy-wo-tone.is-waiting { color: var(--muted-foreground); }
.tracy-wo-markdown { margin: 0; padding: 10px; max-height: 420px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 17px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
.tracy-wo-build { gap: 6px; }
.tracy-wo-action-link { display: inline-flex; align-items: center; gap: 4px; color: var(--primary); font-weight: 500; text-decoration: none; }
.tracy-wo-action-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.tracy-wo-action-link:focus-visible { outline: 1px solid var(--ring); outline-offset: 0; border-radius: 3px; }
.tracy-wo-settings select { min-width: 140px; }

/* Find places: the form, Advanced search and the results around @tracy/wo-views. */
.tracy-wo-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.tracy-wo-search { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: end; gap: 8px; }
.tracy-wo-adv-toggle { margin-left: -8px; }
.tracy-wo-adv-toggle[aria-expanded="true"] .tracy-wo-chev { transform: rotate(180deg); }
.tracy-wo-adv { display: flex; flex-direction: column; gap: 16px; padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
.tracy-wo-adv-group { display: flex; flex-direction: column; gap: 12px; }
.tracy-wo-adv-group + .tracy-wo-adv-group { padding-top: 16px; border-top: 1px solid var(--border); }
.tracy-wo-adv-head { display: flex; flex-direction: column; gap: 2px; }
.tracy-wo-adv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px 24px; }
.tracy-wo-wide { grid-column: 1 / -1; }
.tracy-wo-range { display: flex; align-items: center; gap: 6px; }
.tracy-wo-range input { width: 96px; }
.tracy-wo-checks { display: flex; flex-wrap: wrap; gap: 10px 24px; }
.tracy-wo-check { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
.tracy-wo-adv-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 16px; border-top: 1px solid var(--border); }
.tracy-wo-results { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.tracy-wo-more { align-self: center; }
/* My opportunities: Status, Research and Action cells, the stage bar and the Inspector. */
.tracy-wo-badge-ok svg { color: var(--success); }
.tracy-wo-badge-live { background: color-mix(in oklab, var(--success) 14%, transparent); color: color-mix(in oklab, var(--success) 70%, var(--foreground)); }
.tracy-wo-name-chip.is-check { background: color-mix(in oklab, var(--warning) 16%, transparent); border-color: color-mix(in oklab, var(--warning) 40%, transparent); color: color-mix(in oklab, var(--warning) 45%, var(--foreground)); }
.tracy-wo-name-chip.is-checked { background: color-mix(in oklab, var(--success) 14%, transparent); border-color: transparent; color: color-mix(in oklab, var(--success) 70%, var(--foreground)); }
.tracy-wo-name-actions { gap: 12px; }
.tracy-wo-name-actions [data-slot='button'] { padding-inline: 0; height: auto; }
.tracy-wo-hours-lines { display: flex; flex-direction: column; }
.tracy-wo-reading-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-reading-item { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tracy-wo-reading-item summary { cursor: pointer; overflow-wrap: anywhere; }
.tracy-wo-reading-item[data-off='true'] .tracy-wo-reading-label { color: var(--muted-foreground); }
.tracy-wo-reading-label.is-removed { text-decoration: line-through; }
.tracy-wo-reading-quote { margin: 4px 0 2px; padding-left: 8px; border-left: 2px solid var(--border); color: var(--muted-foreground); overflow-wrap: anywhere; }
.tracy-wo-fact[data-off='true'] .tracy-wo-reading-label { color: var(--muted-foreground); }
.tracy-wo-fact-confidence { font-style: normal; }
.tracy-wo-phone-list { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-hours-edit { display: flex; flex-direction: column; gap: 6px; max-width: 320px; }
.tracy-wo-research { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tracy-wo-reason { font-size: 12px; line-height: 17px; color: var(--destructive); }
.tracy-wo-reason.is-soft { color: var(--muted-foreground); }
.tracy-wo-steps { display: flex; gap: 3px; width: 150px; max-width: 100%; }
.tracy-wo-insp .tracy-wo-steps { width: 100%; }
.tracy-wo-steps > span { flex: 1 1 0; height: 4px; border-radius: 2px; background: var(--muted); }
.tracy-wo-steps > span[data-state="done"] { background: var(--primary); }
.tracy-wo-steps > span[data-state="now"] { background: color-mix(in oklab, var(--primary) 45%, var(--muted)); }
/* Wraps rather than scrolls, so Attention (pushed right) never hides behind the open Inspector. */
.tracy-wo-stages { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; min-width: 0; }
.tracy-wo-stages-grow { flex: 1 1 auto; min-width: 8px; }
.tracy-wo-stage { height: 28px; flex-shrink: 0; gap: 4px; padding: 0 8px; font-size: 12px; }
.tracy-wo-stage.is-on { font-weight: 600; }
.tracy-wo-stage.is-zero { opacity: 0.45; }
.tracy-wo-attn { border-color: color-mix(in oklab, var(--destructive) 30%, transparent); color: var(--destructive); }
.tracy-wo-attn:hover, .tracy-wo-attn.is-on { background: color-mix(in oklab, var(--destructive) 10%, transparent); color: var(--destructive); }
.tracy-wo-attn.is-on { border-color: color-mix(in oklab, var(--destructive) 50%, transparent); }
.tracy-wo-attn:focus-visible { border-color: var(--ring); }
.tracy-wo-attn-pill { padding: 1px 6px; border-radius: 999px; background: color-mix(in oklab, var(--destructive) 10%, transparent); font-weight: 600; }
.tracy-wo-insp { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 10px; min-width: 0; max-height: calc(100vh - 24px); overflow-y: auto; padding: 12px 14px 14px; border: 1px solid color-mix(in oklab, var(--primary) 25%, var(--border)); border-radius: 14px; background: var(--card); font-size: 12px; line-height: 17px; }
.tracy-wo-insp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.tracy-wo-insp-title-block { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.tracy-wo-insp-title { margin-top: 4px; font-size: 15px; line-height: 20px; font-weight: 600; overflow-wrap: anywhere; }
.tracy-wo-insp-acts { flex: none; gap: 4px; }
.tracy-wo-insp-back { display: none; align-self: flex-start; }
.tracy-wo-insp-sec { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; }
.tracy-wo-insp-sec.is-tint { background: color-mix(in oklab, var(--muted) 45%, transparent); }
.tracy-wo-insp-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tracy-wo-roll { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; }
.tracy-wo-roll svg { width: 14px; height: 14px; }
.tracy-wo-roll.is-ok { color: color-mix(in oklab, var(--success) 75%, var(--foreground)); }
.tracy-wo-roll.is-bad { color: var(--destructive); }
.tracy-wo-roll.is-run { color: var(--primary); }
.tracy-wo-roll.is-paused, .tracy-wo-roll.is-idle { color: var(--muted-foreground); }
.tracy-wo-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; color: var(--muted-foreground); }
.tracy-wo-kv.is-wide { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.tracy-wo-kv > div { display: flex; gap: 4px; min-width: 0; }
.tracy-wo-kv dd { color: var(--foreground); font-weight: 500; font-variant-numeric: tabular-nums; }
.tracy-wo-srcs { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-src { border: 1px solid var(--border); border-radius: 4px; background: var(--background); }
.tracy-wo-src summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; list-style: none; cursor: pointer; border-radius: 4px; }
.tracy-wo-src summary::-webkit-details-marker { display: none; }
.tracy-wo-src summary:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.tracy-wo-src-name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-weight: 500; }
.tracy-wo-src-icon { width: 14px; height: 14px; flex: 0 0 auto; }
.tracy-wo-src-icon.is-ok { color: var(--success); }
.tracy-wo-src-icon.is-failed, .tracy-wo-src-icon.is-blocked { color: var(--destructive); }
.tracy-wo-src-icon.is-partial { color: var(--primary); }
.tracy-wo-src-icon.is-waiting, .tracy-wo-src-icon.is-skipped { color: var(--muted-foreground); }
.tracy-wo-src-retry { margin-top: 6px; }
.tracy-wo-src-body { padding: 6px 10px 8px; border-top: 1px solid var(--border); color: var(--muted-foreground); }
.tracy-wo-search-pages { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.tracy-wo-search-page { display: flex; flex-direction: column; gap: 2px; padding-top: 6px; border-top: 1px solid var(--border); }
.tracy-wo-again { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
.tracy-wo-again-list { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 6px; }
.tracy-wo-again-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 8px 10px; }
.tracy-wo-again-item + .tracy-wo-again-item { border-top: 1px solid var(--border); }
.tracy-wo-again-item > :nth-child(2) { grid-column: 1; }
.tracy-wo-again-item .tracy-wo-again-price { grid-column: 2; grid-row: 1 / span 2; align-self: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tracy-wo-again-item.is-kept { color: var(--muted-foreground); }
.tracy-wo-again-dialog { max-width: min(28rem, calc(100% - 2rem)); }
.tracy-wo-quote { padding-left: 8px; border-left: 2px solid var(--border); }
.tracy-wo-menu-chip.is-file { color: color-mix(in oklab, var(--success) 75%, var(--foreground)); }
.tracy-wo-menu-chip.is-photo { color: var(--primary); }
.tracy-wo-menu-sec { display: flex; flex-direction: column; gap: 2px; }
.tracy-wo-menu-sec-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 4px; }
.tracy-wo-menu-sec-title { font-size: 12px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: var(--muted-foreground); }
.tracy-wo-menu-items { display: flex; flex-direction: column; }
.tracy-wo-menu-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 5px 0; border-bottom: 1px dashed var(--border); overflow-wrap: anywhere; }
.tracy-wo-menu-price { white-space: nowrap; font-variant-numeric: tabular-nums; }
.tracy-wo-menu-price.is-none { color: var(--muted-foreground); }
.tracy-wo-menu-other { grid-column: 1 / -1; }
.tracy-wo-menu-status { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 10px; padding: 4px 0; }
.tracy-wo-menu-status-why { grid-column: 1 / -1; }
.tracy-wo-menu-status-act { justify-content: flex-end; }
.tracy-wo-menu-dot { width: 8px; height: 8px; flex: 0 0 auto; border-radius: 50%; background: var(--muted-foreground); }
.tracy-wo-menu-dot.is-warn { background: color-mix(in oklab, var(--primary) 70%, var(--foreground)); }
.tracy-wo-menu-photo .is-ok { color: color-mix(in oklab, var(--success) 75%, var(--foreground)); }
.tracy-wo-insp .tracy-wo-swatches { gap: 6px; }
.tracy-wo-thumbs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.tracy-wo-thumbs > li { display: grid; place-items: center; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 6px; background: var(--muted); }
.tracy-wo-thumbs img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* The two sub-tabs (@tracy/ui Tabs, line) under dsh's tab bar, with the "N researching" note on the right. */
.tracy-wo-sub { position: sticky; top: 0; z-index: 3; display: flex; align-items: flex-end; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--border); background: var(--background); }
.tracy-wo-sub-list { height: 40px; }
.tracy-wo-sub-n { color: var(--muted-foreground); font-weight: 400; font-variant-numeric: tabular-nums; }
.tracy-wo-sub-live { display: inline-flex; align-items: center; gap: 4px; padding-bottom: 11px; font-size: 12px; color: var(--muted-foreground); white-space: nowrap; }
/* My opportunities: list beside the Inspector, the search, paging and the bulk bar. */
.tracy-wo-split { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; }
.tracy-wo-split[data-open] { display: block; }
.tracy-wo-q { width: 220px; height: 28px; }
.tracy-wo-c-research { min-width: 200px; }
.tracy-wo-split[data-open] .tracy-wo-c-research { min-width: 150px; }
.tracy-wo-c-action, .tracy-wo-c-demo { white-space: nowrap; }
.tracy-wo-c-go { width: 32px; padding-left: 0; }
.tracy-wo-select-all { justify-content: center; padding: 6px 10px; border-radius: 8px; background: var(--muted); }
.tracy-wo-more-long { display: flex; align-items: center; justify-content: center; gap: 10px; }
/* Outreach v3: a flat Inspector with one resizable divider. */
.tracy-wo-split > [data-group] { min-height: 500px; }
.tracy-wo-resize { flex: 0 0 12px; width: 12px; background: transparent !important; position: relative; }
.tracy-wo-resize::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--border); }
.tracy-wo-resize:hover::after, .tracy-wo-resize:focus-visible::after { background: var(--primary); }
.tracy-wo-resize:focus-visible { outline: none; box-shadow: none; }
.tracy-wo-insp > .tracy-wo-insp-sec, .tracy-wo-insp .tracy-wo-insp-sec .tracy-wo-insp-sec { border: 0; border-radius: 0; background: transparent; padding: 14px 0; }
.tracy-wo-insp > .tracy-wo-insp-sec + .tracy-wo-insp-sec, .tracy-wo-send { border-top: 1px solid var(--border); }
.tracy-wo-insp .tracy-wo-insp-sec .tracy-wo-insp-sec { padding: 0; }
.tracy-wo-step-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.tracy-wo-step-list li { display: flex; align-items: flex-start; gap: 8px; }
.tracy-wo-flow-content { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.tracy-wo-flow-content b { font-weight: 500; }
.tracy-wo-flow-content details summary { cursor: pointer; }
.tracy-wo-flow-link { color: var(--primary); cursor: pointer; text-decoration: underline; margin-left: 8px; }
.tracy-wo-step-list li[data-complete] > span { color: var(--success); }
.tracy-wo-step-list li[data-failed] { color: var(--destructive); }
.tracy-wo-demo-url { color: var(--primary); text-decoration: none; display: block; font-size: 12px; white-space: normal; overflow-wrap: anywhere; }
.tracy-wo-c-message { min-width: 230px; max-width: 300px; }
.tracy-wo-message-cell { display: flex; flex-direction: column; gap: 6px; }
.tracy-wo-message-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; margin: 0; }
.tracy-wo-send { padding: 14px 0; display: flex; flex-direction: column; gap: 12px; }
.tracy-wo-send-contacts { display: flex; flex-direction: column; }
.tracy-wo-send-contact { display: flex; align-items: center; gap: 10px; padding: 9px 0; text-align: left; width: 100%; cursor: pointer; border-bottom: 1px solid var(--border); }
.tracy-wo-send-contact > span { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.tracy-wo-send-contact svg { width: 14px; height: 14px; flex-shrink: 0; }
.tracy-wo-send-contact:focus-visible { outline: 1px solid var(--primary); outline-offset: 0; }
.tracy-wo-send-contact .tracy-wo-contact-mark { flex: 0 0 14px; }
.tracy-wo-message-editor { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.tracy-wo-message-editor:focus-within { border-color: var(--primary); }
.tracy-wo-message-tools { display: flex; justify-content: flex-end; gap: 6px; padding: 8px; border-bottom: 1px solid var(--border); }
.tracy-wo-message-editor textarea { border: 0; border-radius: 0; field-sizing: fixed; height: 240px; min-height: 160px; resize: vertical; box-shadow: none; outline: none; }
/* Details and Brief pages. */
.tracy-wo-page { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-crumbs { min-width: 0; font-size: 13px; color: var(--muted-foreground); }
.tracy-wo-crumbs button { cursor: pointer; }
.tracy-wo-crumbs button:hover { text-decoration: underline; text-underline-offset: 2px; }
.tracy-wo-crumbs button:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; border-radius: 3px; }
.tracy-wo-page-head { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-page-title { font-size: 18px; line-height: 24px; font-weight: 600; overflow-wrap: anywhere; }
.tracy-wo-page-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; font-size: 12px; line-height: 17px; }
.tracy-wo-page-grid.is-brief { grid-template-columns: minmax(0, 1fr) 340px; }
.tracy-wo-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.tracy-wo-briefs { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-brief-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; }
.tracy-wo-briefs .tracy-wo-name { flex: 0 0 auto; }
.tracy-wo-brief-acts { margin-left: auto; gap: 4px; }
.tracy-wo-brief-doc { font-size: 13px; line-height: 20px; }
.tracy-wo-brief-facts { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-line { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.tracy-wo-facts-line > div { display: flex; gap: 6px; }
.tracy-wo-start { align-self: flex-start; }
@container (max-width: 900px) {
  .tracy-wo-insp { position: static; max-height: none; }
  .tracy-wo-insp-back { display: inline-flex; }
  /* Narrow: the Inspector takes the list's place; its back button closes it. */
  .tracy-wo-split[data-open] { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-split[data-open] > .tracy-wo-split-list { display: none; }
  .tracy-wo-page-grid, .tracy-wo-page-grid.is-brief { grid-template-columns: minmax(0, 1fr); }
}
@container (max-width: 560px) {
  .tracy-wo-search { grid-template-columns: minmax(0, 1fr) auto; }
  .tracy-wo-search-place { grid-column: 1 / -1; }
  .tracy-wo-adv-grid { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-sticky-note { display: none; }
  .tracy-wo-sticky-send { flex: 1 1 auto; }
  .tracy-wo-q { width: 100%; }
  .tracy-wo-sub { padding: 0 8px; }
  .tracy-wo-sub-live { display: none; }
}

/* The row below New session in the left column: the column's own colours (declared by @tracy/dsh-sidebar), a Tracy token elsewhere. */
.tracy-wo-nav .tracy-wo-nav-button { position: relative; display: flex; align-items: center; gap: 0.5rem; border-radius: 8px; color: var(--tsb-row-fg, var(--muted-foreground)); cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.tracy-wo-nav .tracy-wo-nav-button:hover { color: var(--sidebar-foreground); background: var(--tsb-hover, color-mix(in oklab, var(--sidebar-foreground) 8%, transparent)); }
.tracy-wo-nav .tracy-wo-nav-button:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
`

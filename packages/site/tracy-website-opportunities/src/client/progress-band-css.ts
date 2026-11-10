/**
 * The Progress band at ONE fixed height (#537). The left list sets the height: three steps, each a name, one status
 * line and at most one lock line, every line clamped to one row (full text on hover). The right pane fills that
 * height as a flex column (kicker, name, a status line clamped to two rows, the sub-step row, buttons pinned to the
 * bottom), so no state grows or shrinks the band. Sub-steps (and the build's step chain) run as one horizontal row
 * that scrolls sideways inside the pane when it is long. Stacked on a narrow page, each pane keeps its own fixed
 * height. Joined to the Details stylesheet before the review rules, so every selector carries the band's own
 * data-fixed attribute to win over them. Reads only Tracy tokens. No backtick may appear inside the template below.
 */
export const PROGRESS_BAND_CSS = `
.tracy-wo-band[data-fixed] { --wo-band-h: 194px; box-sizing: border-box; height: var(--wo-band-h); grid-template-columns: minmax(0, 38fr) minmax(0, 62fr); grid-template-rows: minmax(0, 1fr); }
.tracy-wo-band[data-fixed] .tracy-wo-band-list { box-sizing: border-box; min-height: 0; overflow: hidden; }
.tracy-wo-band[data-fixed] .tracy-wo-step { padding-bottom: 12px; }
.tracy-wo-band[data-fixed] .tracy-wo-step:last-child { padding-bottom: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-step-ln { bottom: -12px; }
.tracy-wo-band[data-fixed] .tracy-wo-step-body { gap: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-step-name, .tracy-wo-band[data-fixed] .tracy-wo-step-sub, .tracy-wo-band[data-fixed] .tracy-wo-band-lock > span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-status { display: flex; align-items: center; gap: 6px; min-width: 0; height: 16px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-status > .tracy-wo-step-sub { flex: 0 0 auto; max-width: 100%; }
.tracy-wo-band[data-fixed] .tracy-wo-band-stale { flex: 0 1 auto; min-width: 0; height: 16px; margin: 0; padding: 0 6px; font-size: 11px; line-height: 16px; display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-lock { display: flex; min-width: 0; height: 16px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-pane { box-sizing: border-box; min-height: 0; overflow: hidden; gap: 6px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-kicker { line-height: 16px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-line { flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.tracy-wo-band[data-fixed] .tracy-wo-band-pane[data-build] .tracy-wo-band-line { -webkit-line-clamp: 1; }
.tracy-wo-band[data-fixed] .tracy-wo-band-running { flex: none; height: 24px; margin: 0; white-space: nowrap; }
.tracy-wo-band[data-fixed] .tracy-wo-band-acts { flex: none; flex-wrap: nowrap; align-items: center; margin-top: auto; padding-top: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-acts > button { flex: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-refused { flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps { flex: none; display: flex; flex-direction: row; align-items: center; gap: 0; position: relative; height: 24px; margin: 0; padding: 0; list-style: none; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; font-size: 12px; line-height: 16px; -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs::-webkit-scrollbar, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps::-webkit-scrollbar { display: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li { flex: none; display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--foreground); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li + li::before, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li + li::before { content: ''; flex: none; width: 16px; height: 1px; margin: 0 6px 0 2px; background: var(--border); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='done'] + li::before, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li[data-state='done'] + li::before { background: var(--success); }
.tracy-wo-band[data-fixed] .tracy-wo-band-sub-node { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--background); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li > .tracy-wo-band-sub-node > svg { width: 10px; height: 10px; stroke-width: 3; color: var(--background); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='running'] > .tracy-wo-band-sub-node > svg { width: 14px; height: 14px; stroke-width: 2.5; color: var(--primary); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs[data-many] > li[data-state='done'] > .tracy-wo-band-sub-label, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps:has(> li:nth-child(5)) > li[data-state='done'] > b { display: none; }
.tracy-wo-band[data-fixed] li[data-state='done'] > .tracy-wo-band-sub-node { border-color: var(--success); background: var(--success); color: var(--background); }
.tracy-wo-band[data-fixed] li[data-state='running'] > .tracy-wo-band-sub-node { width: 16px; height: 16px; border: 0; background: transparent; color: var(--primary); }
.tracy-wo-band[data-fixed] li[data-state='failed'] > .tracy-wo-band-sub-node { border-color: var(--destructive); background: var(--destructive); color: var(--background); }
.tracy-wo-band[data-fixed] .tracy-wo-band-sub-label, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li > b { max-width: 16ch; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 400; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='running'] .tracy-wo-band-sub-label, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li[data-state='current'] > b { padding: 1px 7px; border-radius: 999px; font-weight: 600; color: var(--primary); background: color-mix(in oklab, var(--primary) 12%, transparent); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='failed'] .tracy-wo-band-sub-label { color: var(--destructive); font-weight: 500; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='waiting'], .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li[data-state='upcoming'] { color: var(--muted-foreground); }
.tracy-wo-band[data-fixed] .tracy-wo-band-sub-state, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li > span.tracy-wo-muted { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build { flex: none; min-width: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress { gap: 6px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-now:not(:only-child), .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-bar, .tracy-wo-band[data-fixed] .tracy-wo-band-build details > summary { display: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress > span.tracy-wo-small { height: 16px; line-height: 16px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li > .tracy-wo-icon, .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li > [role='status'] { flex: none; width: 14px; height: 14px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-steps > li[data-state='done'] > .tracy-wo-icon { color: var(--success); }
@container (max-width: 719px) {
  .tracy-wo-band[data-fixed] { height: auto; grid-template-columns: minmax(0, 1fr); grid-template-rows: var(--wo-band-h) var(--wo-band-h); }
}
`

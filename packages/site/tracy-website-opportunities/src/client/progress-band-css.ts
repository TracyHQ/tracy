/**
 * The Progress band at ONE fixed height (#537). The left list sets the height: three steps, each a name, one status
 * line and at most one lock line, every line clamped to one row (full text on hover). The right pane fills that
 * height as a flex column (kicker, name, a status line clamped to two rows, the sub-step row, buttons pinned to the
 * bottom), so no state grows or shrinks the band. Sub-steps (and the build's step chain) run as one horizontal row
 * that scrolls sideways inside the pane when it is long. Stacked on a narrow page, each pane keeps its own fixed
 * height. Joined to the Details stylesheet before the review rules, so every selector carries the band's own
 * data-fixed attribute to win over them. Reads only Tracy tokens. No backtick may appear inside the template below.
 *
 * Width: the left list is as wide as its content and no wider (fit-content track capped at min(46%, 400px)); its
 * min-content is the widest name with its pill (both never shrink), so a step name never truncates, while a purpose
 * line contributes only its longest word to that minimum and clamps to one line past the cap (full text on hover).
 * The right pane takes the rest. Research and the brief draw the sub-step row (.tracy-wo-band-subs); the build draws
 * its six steps as columns with their time and cost (.tracy-wo-band-cols, option A), and only then the band grows past
 * its fixed height to fit them (two rows of three on a narrow pane).
 */
export const PROGRESS_BAND_CSS = `
.tracy-wo-band[data-fixed] { --wo-band-h: 176px; box-sizing: border-box; height: var(--wo-band-h); grid-template-columns: fit-content(min(46%, 400px)) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); }
.tracy-wo-band[data-fixed] .tracy-wo-band-list { box-sizing: border-box; min-width: min-content; min-height: 0; overflow: hidden; }
.tracy-wo-band[data-fixed] .tracy-wo-step { grid-template-columns: 22px auto; }
.tracy-wo-band[data-fixed] .tracy-wo-step { padding-bottom: 12px; }
.tracy-wo-band[data-fixed] .tracy-wo-step:last-child { padding-bottom: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-step-ln { bottom: -12px; }
.tracy-wo-band[data-fixed] .tracy-wo-step-body { gap: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-step-name { white-space: nowrap; }
.tracy-wo-band[data-fixed] .tracy-wo-band-top { display: flex; align-items: center; gap: 8px; min-width: 0; height: 22px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-top > .tracy-wo-step-name { flex: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-purpose { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; height: 16px; overflow: hidden; white-space: normal; overflow-wrap: anywhere; font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tracy-wo-band[data-fixed] { --wo-pane-bg: color-mix(in oklab, var(--primary) 5%, var(--card, var(--background))); }
.tracy-wo-band[data-fixed] .tracy-wo-band-pane[data-review] { --wo-pane-bg: color-mix(in oklab, var(--warning) 8%, var(--card, var(--background))); }
.tracy-wo-band[data-fixed] .tracy-wo-band-pane { box-sizing: border-box; min-height: 0; overflow: hidden; gap: 6px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-kicker { line-height: 16px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-head { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.tracy-wo-band[data-fixed] .tracy-wo-band-est { flex: none; max-width: 40%; }
.tracy-wo-band[data-fixed] .tracy-wo-band-head > .tracy-wo-band-name { flex: 0 1 auto; min-width: 0; margin: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-line { flex: none; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.tracy-wo-band[data-fixed] .tracy-wo-band-pane[data-build] .tracy-wo-band-line { -webkit-line-clamp: 1; }
.tracy-wo-band[data-fixed] .tracy-wo-band-running { flex: none; height: 24px; margin: 0; white-space: nowrap; }
.tracy-wo-band[data-fixed] .tracy-wo-band-acts { flex: none; flex-wrap: nowrap; align-items: center; margin-top: auto; padding-top: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-acts > button { flex: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-refused { flex: 1 1 auto; min-width: 0; margin: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs { flex: none; display: flex; flex-direction: row; align-items: center; gap: 0; position: relative; height: 24px; margin: 0; padding: 0; list-style: none; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; font-size: 12px; line-height: 16px; -webkit-mask-image: linear-gradient(to right, var(--foreground) calc(100% - 28px), transparent); mask-image: linear-gradient(to right, var(--foreground) calc(100% - 28px), transparent); }
/* The running sub-step is the status pill (status-pill-css.ts): its fill sits on the pane, over the joining line. */
.tracy-wo-band[data-fixed] .tracy-wo-band-subs { --wo-pill-surface: var(--wo-pane-bg); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs::-webkit-scrollbar { display: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li { flex: none; display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--foreground); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li { position: relative; padding: 0 12px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li:first-child { padding-left: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li:last-child { padding-right: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li::before, .tracy-wo-band[data-fixed] .tracy-wo-band-subs > li::after { content: ''; position: absolute; top: 50%; height: 1px; background: var(--border); z-index: 0; pointer-events: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li::before { left: 0; width: 19px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li::after { left: 19px; right: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li:first-child::before, .tracy-wo-band[data-fixed] .tracy-wo-band-subs > li:last-child::after { display: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li:first-child::after { left: 7px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li > * { position: relative; z-index: 1; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='done']::after, .tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='done'] + li::before { background: var(--success); }
.tracy-wo-band[data-fixed] .tracy-wo-band-sub-node { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 999px; border: 1.5px solid color-mix(in oklab, var(--muted-foreground) 45%, transparent); background: var(--wo-pane-bg); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li > .tracy-wo-band-sub-node > svg { width: 10px; height: 10px; stroke-width: 3; color: var(--background); }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs[data-many] > li[data-state='done'] > .tracy-wo-band-sub-label { display: none; }
.tracy-wo-band[data-fixed] li[data-state='done'] > .tracy-wo-band-sub-node { border-color: var(--success); background: var(--success); color: var(--background); }
.tracy-wo-band[data-fixed] li[data-state='failed'] > .tracy-wo-band-sub-node { border-color: var(--destructive); background: var(--destructive); color: var(--background); }
.tracy-wo-band[data-fixed] .tracy-wo-band-sub-label { padding: 0 4px; background: var(--wo-pane-bg); white-space: nowrap; font-weight: 400; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='failed'] .tracy-wo-band-sub-label { color: var(--destructive); font-weight: 500; }
.tracy-wo-band[data-fixed] .tracy-wo-band-subs > li[data-state='waiting'] { color: var(--muted-foreground); }
.tracy-wo-band[data-fixed] .tracy-wo-band-sub-state { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build { flex: none; min-width: 0; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress { gap: 6px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-now:not(:only-child), .tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress-bar, .tracy-wo-band[data-fixed] .tracy-wo-band-build details > summary { display: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-build .tracy-wo-progress > span.tracy-wo-small { height: 16px; line-height: 16px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* The build's six steps as columns (progress-band-build.tsx, option A): the band grows to fit them, never below its height. */
.tracy-wo-band[data-fixed]:has(> .tracy-wo-band-pane[data-build]) { height: auto; min-height: var(--wo-band-h); }
.tracy-wo-band[data-fixed] .tracy-wo-band-build { container-type: inline-size; }
.tracy-wo-band[data-fixed] .tracy-wo-band-pane[data-build] .tracy-wo-band-acts { padding-top: 6px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0 8px; margin: 8px 0 0; padding: 0; list-style: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li { position: relative; display: flex; flex-direction: column; align-items: flex-start; min-width: 0; padding-right: 4px; }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li::after { content: ''; position: absolute; top: 8px; left: 26px; right: 2px; height: 2px; border-radius: 1px; background: var(--border); }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li[data-state='done']::after { background: var(--success); }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li:last-child::after { display: none; }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-node { box-sizing: border-box; display: grid; place-items: center; flex: none; width: 18px; height: 18px; margin-bottom: 6px; border-radius: 999px; border: 2px solid color-mix(in oklab, var(--muted-foreground) 35%, transparent); background: var(--wo-pane-bg); color: var(--background); }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-node > svg { width: 10px; height: 10px; stroke-width: 3; }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-node[data-node='done'] { border-color: var(--success); background: var(--success); }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-node[data-node='failed'] { border-color: var(--destructive); background: var(--destructive); }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-node[data-node='running'] { border-color: color-mix(in oklab, var(--primary) 25%, transparent); border-top-color: var(--primary); animation: tracy-wo-pill-spin 1.1s linear infinite; }
@media (prefers-reduced-motion: reduce) { .tracy-wo-band[data-fixed] .tracy-wo-band-col-node[data-node='running'] { animation: none; } }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-name { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12.5px; line-height: 16px; font-weight: 500; color: var(--foreground); }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li[data-state='running'] .tracy-wo-band-col-name { color: var(--primary); font-weight: 600; }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li[data-state='failed'] .tracy-wo-band-col-name { color: var(--destructive); font-weight: 600; }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li[data-state='waiting'] .tracy-wo-band-col-name { color: var(--muted-foreground); font-weight: 400; }
.tracy-wo-band[data-fixed] .tracy-wo-band-col-fig { display: block; margin-top: 2px; font-size: 11.5px; line-height: 15px; color: var(--muted-foreground); text-wrap: balance; }
.tracy-wo-band[data-fixed] .tracy-wo-band-cols > li[data-state='running'] .tracy-wo-band-col-fig { color: var(--foreground); }
@container (max-width: 560px) {
  .tracy-wo-band[data-fixed] .tracy-wo-band-cols { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: 14px; }
  .tracy-wo-band[data-fixed] .tracy-wo-band-cols > li:nth-child(3)::after { display: none; }
}
@container (max-width: 719px) {
  .tracy-wo-band[data-fixed] { height: auto; grid-template-columns: minmax(0, 1fr); grid-template-rows: var(--wo-band-h) var(--wo-band-h); }
  .tracy-wo-band[data-fixed]:has(> .tracy-wo-band-pane[data-build]) { grid-template-rows: var(--wo-band-h) auto; }
}
`

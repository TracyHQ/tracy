/**
 * My opportunities' own rules (#537, header C with row style 2): the tool line and the selection bar, the "..." menu's
 * extra bits, and the Rows table, whose header and rows share one set of fixed grid tracks so every title sits over
 * its cells: the table is one grid and the header, the list and every row are subgrids of its columns, so the Action
 * column is as wide as the widest button in any row and the header follows. Every row is 64px high. Tracy tokens only.
 * No backtick may appear inside the template below.
 *
 * Wide (over 900px): Place 1fr, Address 1fr, Progress 230px, Added 110px, Action max-content (never cut).
 * Narrow (up to 900px): Place 1.3fr, Address 0.7fr (one line) and Progress share what the action leaves; Address gives
 * way first (down to 80px), then Progress (200px down to 120px). Added sits under Progress.
 * Small (up to 560px): rows stack and grow; the header hides.
 */
export const MY_LIST_CSS = `
.tracy-wo-my-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 32px; min-width: 0; }
.tracy-wo-my-bar-grow { flex: 1 1 auto; }
.tracy-wo-my-selbar { justify-content: flex-start; height: 40px; padding: 0 6px 0 12px; border: 1px solid color-mix(in oklab, var(--primary) 28%, var(--border)); border-radius: 9px; background: color-mix(in oklab, var(--primary) 8%, var(--card)); animation: tracy-wo-fade-in 120ms ease-out; }
.tracy-wo-my-selcount { margin-right: 6px; font-weight: 600; white-space: nowrap; }
.tracy-wo-my-danger { color: var(--destructive); border-color: color-mix(in oklab, var(--destructive) 35%, var(--border)); }
.tracy-wo-my-danger:hover { color: var(--destructive); background: color-mix(in oklab, var(--destructive) 8%, transparent); }
.tracy-wo-my-danger:focus-visible { border-color: var(--destructive); }
.tracy-wo-my-dots { color: var(--muted-foreground); }
.tracy-wo-my-dots[data-popup-open] { color: var(--foreground); background: color-mix(in oklab, var(--foreground) 8%, var(--card)); }
.tracy-wo-my-menu { width: 232px; }
.tracy-wo-my-menu-n { margin-left: auto; font-variant-numeric: tabular-nums; }
.tracy-wo-my-menu-note { margin: 0; padding: 6px 8px 4px; font-size: 11.5px; line-height: 16px; color: var(--muted-foreground); }
@keyframes tracy-wo-fade-in { from { opacity: 0; } }
@keyframes tracy-wo-slide-in { from { opacity: 0; transform: translateX(-6px); } }
.tracy-wo-my-check { animation: tracy-wo-slide-in 140ms ease-out; }

.tracy-wo-my-cards[data-selecting] .tracy-wo-p-top, .tracy-wo-my-cards[data-selecting] .tracy-wo-p-demo { padding-left: 40px; }
.tracy-wo-my-cards .tracy-wo-p-added { margin-top: -6px; }

.tracy-wo-my-table { --tracy-wo-my-cols: minmax(0, 1fr) minmax(0, 1fr) 230px 110px max-content; --tracy-wo-my-areas: "place address step added action"; display: grid; grid-template-columns: var(--tracy-wo-my-cols); column-gap: 16px; row-gap: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
.tracy-wo-my-table[data-selecting] { --tracy-wo-my-cols: 16px minmax(0, 1fr) minmax(0, 1fr) 230px 110px max-content; --tracy-wo-my-areas: "check place address step added action"; }
.tracy-wo-my-head, .tracy-wo-my-rows, .tracy-wo-my-rows .tracy-wo-my-place { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }
.tracy-wo-my-head, .tracy-wo-my-rows .tracy-wo-my-place { grid-template-areas: var(--tracy-wo-my-areas); padding: 0 14px; }
.tracy-wo-my-head { height: 30px; align-items: center; border-bottom: 1px solid var(--border); background: color-mix(in oklab, var(--foreground) 2.5%, var(--card)); font-size: 11.5px; line-height: 16px; font-weight: 500; color: var(--muted-foreground); }
.tracy-wo-my-head > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-my-head > [data-col='action'] { text-align: right; }
.tracy-wo-my-rows { row-gap: 0; list-style: none; margin: 0; padding: 0; }
.tracy-wo-my-rows .tracy-wo-my-place { height: 64px; align-items: center; align-content: center; border-top: 1px solid var(--border); }
.tracy-wo-my-rows .tracy-wo-my-place:first-child { border-top: 0; }
.tracy-wo-my-rows .tracy-wo-my-place:hover { background: color-mix(in oklab, var(--foreground) 4%, transparent); }
.tracy-wo-my-rows .tracy-wo-my-place[data-selected] { background: color-mix(in oklab, var(--primary) 7%, var(--card)); }
.tracy-wo-my-head > [data-col='place'], .tracy-wo-my-rows [data-col='place'] { grid-area: place; }
.tracy-wo-my-head > [data-col='address'], .tracy-wo-my-rows [data-col='address'] { grid-area: address; }
.tracy-wo-my-head > [data-col='step'], .tracy-wo-my-rows .tracy-wo-p-step { grid-area: step; }
.tracy-wo-my-head > [data-col='added'], .tracy-wo-my-rows [data-col='added'] { grid-area: added; }
.tracy-wo-my-head > [data-col='action'], .tracy-wo-my-rows .tracy-wo-p-status { grid-area: action; }
.tracy-wo-my-table[data-selecting] .tracy-wo-my-head::before { content: ""; grid-area: check; }
.tracy-wo-my-rows .tracy-wo-my-check { grid-area: check; }
.tracy-wo-my-rows .tracy-wo-p-place { gap: 2px; }
.tracy-wo-my-rows .tracy-wo-p-name, .tracy-wo-my-rows .tracy-wo-p-type { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-p-addr { display: flex; align-items: flex-start; gap: 2px; min-width: 0; font-size: 12.5px; line-height: 17px; }
.tracy-wo-p-addr .tracy-wo-p-pin { width: 18px; height: 18px; margin-top: -1px; }
.tracy-wo-p-addr-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-width: 0; overflow: hidden; overflow-wrap: anywhere; }
.tracy-wo-p-added { min-width: 0; font-size: 12.5px; line-height: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-p-added time { cursor: default; text-decoration: underline dotted color-mix(in oklab, var(--foreground) 30%, transparent); text-underline-offset: 3px; }
.tracy-wo-my-rows .tracy-wo-p-status { flex-wrap: nowrap; min-width: 0; }

@container (max-width: 900px) {
  .tracy-wo-my-table { --tracy-wo-my-cols: minmax(140px, 1.3fr) minmax(80px, 0.7fr) minmax(120px, 200px) max-content; --tracy-wo-my-areas: "place address step action" "place address added action"; }
  .tracy-wo-my-table[data-selecting] { --tracy-wo-my-cols: 16px minmax(140px, 1.3fr) minmax(80px, 0.7fr) minmax(120px, 200px) max-content; --tracy-wo-my-areas: "check place address step action" "check place address added action"; }
  .tracy-wo-my-rows .tracy-wo-my-place { grid-template-rows: auto auto; row-gap: 2px; }
  .tracy-wo-my-head { --tracy-wo-my-areas: "place address step action"; }
  .tracy-wo-my-table[data-selecting] .tracy-wo-my-head { --tracy-wo-my-areas: "check place address step action"; }
  .tracy-wo-my-head > [data-col='added'] { display: none; }
  .tracy-wo-my-rows .tracy-wo-p-step { align-self: end; }
  .tracy-wo-my-rows [data-col='added'] { align-self: start; font-size: 11.5px; line-height: 15px; }
  .tracy-wo-my-rows [data-col='place'], .tracy-wo-my-rows [data-col='address'], .tracy-wo-my-rows .tracy-wo-p-status, .tracy-wo-my-rows .tracy-wo-my-check { align-self: center; }
  .tracy-wo-p-addr-text { -webkit-line-clamp: 1; }
}
@container (max-width: 560px) {
  .tracy-wo-my-head { display: none; }
  .tracy-wo-my-table { --tracy-wo-my-cols: minmax(0, 1fr) max-content; --tracy-wo-my-areas: "place action" "address address" "step step" "added added"; }
  .tracy-wo-my-table[data-selecting] { --tracy-wo-my-cols: 16px minmax(0, 1fr) max-content; --tracy-wo-my-areas: "check place action" "check address address" "check step step" "check added added"; }
  .tracy-wo-my-rows .tracy-wo-my-place { height: auto; grid-template-rows: none; row-gap: 4px; padding: 10px 12px; }
  .tracy-wo-my-bar { flex-wrap: wrap; }
}
`

/**
 * The Workspace card of Details (#537, option D, `workspace-card.tsx`): one card, a row per section with a tile, the
 * title and a folded summary, open sections below their row, locked rows muted. Reads only Tracy tokens, so light and
 * dark follow the theme. The Business facts and brief rows are one button each that opens the sub-page. No backtick
 * may appear inside the template below.
 */

export const WORKSPACE_CSS = `
.tracy-wo-ws { min-width: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--card, var(--background)); overflow: hidden; }
/* The Add source popover hangs below the Sources row: the card stops clipping while it is open. */
.tracy-wo-ws:has(.tracy-wo-addsrc-pop) { overflow: visible; }
.tracy-wo-ws:has(.tracy-wo-addsrc-pop) > .tracy-wo-ws-head { border-radius: 9px 9px 0 0; }
.tracy-wo-ws:has(.tracy-wo-addsrc-pop) > .tracy-wo-ws-sec:last-child { border-radius: 0 0 9px 9px; }
.tracy-wo-ws-head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; padding: 11px 16px; border-bottom: 1px solid var(--border); background: color-mix(in oklab, var(--muted) 40%, var(--card, var(--background))); }
.tracy-wo-ws-title { margin: 0; font-size: 14px; font-weight: 600; line-height: 20px; }
.tracy-wo-ws-subtitle { font-size: 12.5px; color: var(--muted-foreground); }
.tracy-wo-ws-sec + .tracy-wo-ws-sec { border-top: 1px solid var(--border); }
/* Every section row reads as a header, locked or not, so the values that open under it stand apart (owner, #537). */
.tracy-wo-ws-row { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 6px 16px; background: color-mix(in oklab, var(--muted) 35%, var(--card, var(--background))); }
.tracy-wo-ws-sec:not([data-state='locked']) > .tracy-wo-ws-row:hover { background: color-mix(in oklab, var(--muted) 55%, var(--card, var(--background))); }
.tracy-wo-ws-sec[data-open] > .tracy-wo-ws-row { border-bottom: 1px solid color-mix(in oklab, var(--border) 60%, transparent); }
.tracy-wo-ws-toggle { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; margin: 0; padding: 4px 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; }
button.tracy-wo-ws-toggle { cursor: pointer; }
button.tracy-wo-ws-toggle:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 4px; }
/* A link row (Business facts, the brief): the whole row is the button that opens the sub-page, its pill drawn inside. */
button.tracy-wo-ws-link { width: 100%; margin: 0; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
button.tracy-wo-ws-link:focus-visible { outline: 1px solid var(--ring); outline-offset: -2px; }
.tracy-wo-ws-link:hover .tracy-wo-ws-pill { background: color-mix(in oklab, var(--muted) 60%, var(--card, var(--background))); }
.tracy-wo-ws-link:hover .tracy-wo-ws-pill[data-kind='review'] { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
.tracy-wo-ws-link:hover .tracy-wo-ws-pill[data-kind='review'] > svg { color: var(--primary-foreground); }
.tracy-wo-ws-tile { display: grid; place-items: center; flex: none; width: 24px; height: 24px; border-radius: 7px; background: color-mix(in oklab, var(--muted) 70%, var(--card, var(--background))); color: var(--muted-foreground); }
.tracy-wo-ws-tile > svg { width: 14px; height: 14px; }
.tracy-wo-ws-sec[data-state='done'] .tracy-wo-ws-tile { background: color-mix(in oklab, var(--success) 16%, transparent); color: color-mix(in oklab, var(--success) 80%, var(--foreground)); }
.tracy-wo-ws-sec[data-state='open'] .tracy-wo-ws-tile { background: color-mix(in oklab, var(--primary) 12%, transparent); color: var(--primary); }
.tracy-wo-ws-sec[data-state='review'] .tracy-wo-ws-tile { background: color-mix(in oklab, var(--warning) 16%, transparent); color: color-mix(in oklab, var(--warning) 45%, var(--foreground)); }
.tracy-wo-ws-main { display: flex; flex-direction: column; flex: 0 1 300px; min-width: 150px; }
.tracy-wo-ws-name { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; white-space: nowrap; }
.tracy-wo-ws-desc { overflow: hidden; color: var(--muted-foreground); font-size: 12px; line-height: 1.4; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-ws-chev { flex: none; width: 14px; height: 14px; color: var(--muted-foreground); transition: transform 0.15s ease; }
.tracy-wo-ws-sec[data-open] .tracy-wo-ws-chev { transform: rotate(180deg); }
.tracy-wo-ws-sum { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--muted-foreground); white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-ws-pill { display: inline-flex; align-items: center; flex: none; gap: 3px; height: 26px; margin: 0; padding: 0 8px 0 11px; border: 1px solid var(--border); border-radius: 99px; background: var(--card, var(--background)); color: var(--foreground); font: inherit; font-size: 12.5px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.tracy-wo-ws-pill > svg { width: 14px; height: 14px; color: var(--muted-foreground); }
.tracy-wo-ws-pill:hover { background: color-mix(in oklab, var(--muted) 60%, var(--card, var(--background))); }
.tracy-wo-ws-pill:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
.tracy-wo-ws-pill[data-kind='review'] { border-color: color-mix(in oklab, var(--primary) 35%, transparent); background: color-mix(in oklab, var(--primary) 10%, transparent); color: var(--primary); }
.tracy-wo-ws-pill[data-kind='review'] > svg { color: var(--primary); }
.tracy-wo-ws-pill[data-kind='review']:hover { background: var(--primary); border-color: var(--primary); color: var(--primary-foreground); }
.tracy-wo-ws-pill[data-kind='review']:hover > svg { color: var(--primary-foreground); }
.tracy-wo-ws-sec[data-state='locked'] .tracy-wo-ws-name { color: var(--muted-foreground); }
.tracy-wo-ws-body { padding: 12px 16px 14px; }
.tracy-wo-site-card { display: flex; gap: 16px; align-items: stretch; min-width: 0; }
.tracy-wo-site-thumb { position: relative; display: grid; place-items: center; flex: none; width: 160px; height: 100px; overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); }
.tracy-wo-site-thumb > img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
/* No picture: the site's name on its brand colour (inline, from the saved profile), else the theme's primary. */
.tracy-wo-site-thumb[data-fallback] { background: var(--primary); color: var(--primary-foreground); border-color: transparent; }
.tracy-wo-site-thumb-name { display: -webkit-box; max-width: 100%; padding: 0 12px; overflow: hidden; font-size: 14px; font-weight: 650; line-height: 1.25; text-align: center; overflow-wrap: anywhere; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.tracy-wo-site-info { display: flex; flex: 1 1 auto; flex-direction: column; gap: 6px; min-width: 0; }
.tracy-wo-site-l1 { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-width: 0; }
.tracy-wo-site-addr { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: var(--foreground); font-weight: 600; text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--foreground) 30%, transparent); text-underline-offset: 3px; }
.tracy-wo-site-addr > span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-site-addr > svg { flex: none; width: 13px; height: 13px; color: var(--muted-foreground); }
.tracy-wo-site-addr:hover { text-decoration-color: currentColor; }
.tracy-wo-site-addr:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 3px; }
.tracy-wo-site-meta { margin: 0; color: var(--muted-foreground); }
.tracy-wo-site-finds { margin: 0; padding: 8px 10px 8px 12px; border-left: 3px solid var(--warning); border-radius: 0 8px 8px 0; background: color-mix(in oklab, var(--warning) 14%, var(--card, var(--background))); color: var(--foreground); font-size: 12.5px; }
.tracy-wo-site-finds > b { font-weight: 600; }
.tracy-wo-site-finds > ul { margin: 2px 0 0; padding-left: 18px; list-style: disc; }
.tracy-wo-site-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 4px; }
@container (max-width: 560px) {
  .tracy-wo-ws-row { gap: 8px; padding: 6px 12px; }
  .tracy-wo-ws-toggle { display: grid; grid-template-columns: 24px minmax(0, 1fr); column-gap: 10px; row-gap: 0; }
  .tracy-wo-ws-tile { grid-row: span 2; }
  .tracy-wo-ws-main { min-width: 0; flex: 1 1 auto; }
  .tracy-wo-ws-name { white-space: normal; }
  .tracy-wo-ws-sum { white-space: normal; }
  .tracy-wo-ws-sum:empty { display: none; }
  .tracy-wo-ws-body { padding: 10px 12px 12px; }
  .tracy-wo-site-card { flex-direction: column; }
}
`

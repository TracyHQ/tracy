/**
 * The Business facts sub-page frame (#537, layout B): the page column at most 1280px wide and centred, its header
 * sticky under the tab row, and the section rail (facts-rail.tsx) at the left of the cards, sticky under the header.
 * The section of the sub-page is the size container (wo-factspage): on a page under 1100px the rail turns into a row
 * of chips above the cards, not sticky. The sticky offsets come from the rail (--wo-stick-top, --wo-head-h).
 * Tracy tokens only. No backtick may appear inside the template below.
 */
const card = 'var(--card, var(--background))'
const amber = 'color-mix(in oklab, var(--warning) 45%, var(--foreground))'
const PAGE = 1280
/** Page widths, less the 12px page padding on each side: the rail narrows under the first, turns into chips under the second. */
const MID = 1240 - 24
const CHIPS = 1100 - 24

export const FACTS_RAIL_CSS = `
.tracy-wo-subpage[data-section='profile'] { width: 100%; max-width: ${PAGE}px; margin: 0 auto; box-sizing: border-box; }
.tracy-wo-subpage[data-section='profile'] > .tracy-wo-subhead { position: sticky; top: var(--wo-stick-top, 0px); z-index: 3; margin-top: -12px; padding: 12px 0 10px; background: var(--background); }
.tracy-wo-subpage[data-section='profile'] > .tracy-wo-psec { container: wo-factspage / inline-size; }
.tracy-wo-facts-page { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 40px; align-items: start; min-width: 0; }
.tracy-wo-facts-rail { position: sticky; top: calc(var(--wo-stick-top, 0px) + var(--wo-head-h, 0px) + 12px); display: flex; flex-direction: column; min-width: 0; padding: 12px 8px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 14px; background: ${card}; font-size: 14px; }
.tracy-wo-facts-rail-h { margin: 0 0 6px; padding: 0 10px 8px; border-bottom: 1px solid var(--border); color: var(--muted-foreground); font-size: 13px; line-height: 20px; }
.tracy-wo-facts-rail-h[data-check] { color: var(--foreground); font-weight: 600; }
.tracy-wo-facts-rail ol { display: flex; flex-direction: column; gap: 2px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-ri { display: grid; grid-template-columns: 18px minmax(0, 1fr) auto; column-gap: 8px; align-items: start; width: 100%; padding: 7px 10px; box-sizing: border-box; border: 0; border-radius: 9px; background: transparent; color: var(--foreground); font: inherit; font-size: 14px; line-height: 20px; text-align: left; cursor: pointer; }
.tracy-wo-facts-ri:hover { background: var(--muted); }
.tracy-wo-facts-ri[aria-current] { background: color-mix(in oklab, var(--primary) 12%, ${card}); }
.tracy-wo-facts-ri:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.tracy-wo-facts-ri-n { min-width: 0; overflow-wrap: anywhere; }
.tracy-wo-facts-ri-c { color: var(--muted-foreground); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.tracy-wo-facts-ri-s { grid-column: 2 / 4; font-size: 12px; line-height: 16px; color: ${amber}; }
.tracy-wo-facts-ri[data-state='off'] .tracy-wo-facts-ri-n, .tracy-wo-facts-ri[data-state='off'] .tracy-wo-facts-ri-s { color: var(--muted-foreground); }
.tracy-wo-facts-mk { display: grid; place-items: center; width: 18px; height: 18px; margin-top: 1px; box-sizing: border-box; border-radius: 50%; }
.tracy-wo-facts-mk svg { width: 11px; height: 11px; }
.tracy-wo-facts-mk[data-state='ok'] { background: color-mix(in oklab, var(--success) 18%, ${card}); color: color-mix(in oklab, var(--success) 70%, var(--foreground)); }
.tracy-wo-facts-mk[data-state='check'] { border: 1px solid color-mix(in oklab, var(--warning) 45%, transparent); background: color-mix(in oklab, var(--warning) 14%, ${card}); color: ${amber}; }
.tracy-wo-facts-mk[data-state='off'] { border: 1.5px solid color-mix(in oklab, var(--muted-foreground) 50%, transparent); }
.tracy-wo-facts-rail-f { margin: 6px 0 0; padding: 8px 10px 2px; border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 12.5px; line-height: 18px; }
@container wo-factspage (max-width: ${MID - 1}px) {
  .tracy-wo-facts-page { grid-template-columns: 200px minmax(0, 1fr); gap: 24px; }
}
@container wo-factspage (max-width: ${CHIPS - 1}px) {
  .tracy-wo-facts-page { grid-template-columns: minmax(0, 1fr); gap: 12px; }
  .tracy-wo-facts-rail { position: static; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 0; border: 0; background: transparent; }
  .tracy-wo-facts-rail-h { margin: 0; padding: 0; border: 0; }
  .tracy-wo-facts-rail ol { flex-direction: row; flex-wrap: wrap; gap: 6px; }
  .tracy-wo-facts-ri { display: inline-flex; align-items: center; gap: 6px; width: auto; padding: 3px 10px 3px 5px; border: 1px solid var(--border); border-radius: 999px; background: ${card}; font-size: 13px; }
  .tracy-wo-facts-mk { margin-top: 0; }
  .tracy-wo-facts-ri-s, .tracy-wo-facts-rail-f { display: none; }
}
`

/**
 * The Business facts sub-page as stacked fixed-height bands (#537, layout C). The facts column is its own size
 * container (wo-facts), so the layout follows the width the bands really have, not the width of the whole tab. One
 * custom property per band kind holds its height (from BAND_HEIGHTS) at three widths: wide, under 900px (the title
 * moves above the content) and under 560px. Every band clips what does not fit: rows of chips and people wrap what
 * does not fit out of sight and offer Show all, the days scroll sideways, long values end in an ellipsis with the
 * whole value on hover. Tracy tokens only. No backtick may appear inside the template below.
 */
import { BAND_BREAKPOINTS, BAND_HEIGHTS, BAND_IDS } from './business-facts-model.ts'

const heightsAt = (tier: 0 | 1 | 2): string =>
  BAND_IDS.map((id) => `--wo-band-${id}: ${BAND_HEIGHTS[id][tier]}px;`).join(' ')
const [MID, NARROW] = BAND_BREAKPOINTS
const heights = BAND_IDS.map(
  (id) => `.tracy-wo-facts-band[data-card='${id}'] { height: var(--wo-band-${id}); }`
).join('\n')

export const FACTS_BANDS_CSS = `
.tracy-wo-facts { container: wo-facts / inline-size; display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 0; box-sizing: border-box; }
.tracy-wo-facts-band { ${heightsAt(0)} }
${heights}
.tracy-wo-facts-band { box-sizing: border-box; position: relative; display: flex; flex-direction: row; min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--card, var(--background)); }
.tracy-wo-facts-band-label { flex: none; display: flex; flex-direction: column; gap: 4px; justify-content: center; width: 224px; min-width: 0; padding: 8px 16px; overflow: hidden; border-right: 1px solid var(--border); }
.tracy-wo-facts-band-label > h3 { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 0; font-size: 13.5px; font-weight: 600; line-height: 20px; white-space: nowrap; overflow: hidden; }
.tracy-wo-facts-band-label > h3 > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-band-label > h3 > .tracy-wo-icon { flex: none; width: 15px; height: 15px; color: var(--muted-foreground); }
.tracy-wo-facts-band-label > .tracy-wo-facts-aside { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 16px; }
.tracy-wo-facts-band-label > .tracy-wo-facts-acts { justify-content: flex-start; margin-left: 0; gap: 2px 12px; }
.tracy-wo-facts-band-body { position: relative; flex: 1 1 auto; display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px 16px; overflow: hidden; }
.tracy-wo-facts-corner { position: absolute; top: 10px; right: 12px; }
.tracy-wo-facts-na { color: var(--muted-foreground); font-style: normal; cursor: default; }
.tracy-wo-facts-ln { display: flex; align-items: center; gap: 6px; min-width: 0; line-height: 20px; }
.tracy-wo-facts-ln > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-ell { display: block; min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-dim { color: var(--muted-foreground); }
.tracy-wo-facts-ck { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 14px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted-foreground); }
.tracy-wo-facts-cells { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); width: 100%; height: 100%; min-width: 0; }
.tracy-wo-facts-cells[data-off] > :not(.tracy-wo-facts-status) { opacity: 0.6; }
.tracy-wo-facts-cell { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; padding: 0 14px; overflow: hidden; border-left: 1px solid var(--border); }
.tracy-wo-facts-cell:first-child { padding-left: 0; border-left: 0; }
.tracy-wo-facts-cell > q { display: block; font-size: 12px; }
.tracy-wo-facts-status .tracy-wo-facts-off { margin-left: 0; }
.tracy-wo-facts-choices { gap: 4px 10px; }
.tracy-wo-facts-clamp2, .tracy-wo-facts-clamp3 { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
.tracy-wo-facts-clamp2 { -webkit-line-clamp: 2; }
.tracy-wo-facts-clamp3 { -webkit-line-clamp: 3; }
.tracy-wo-facts-band .tracy-wo-facts-about { flex: 1 1 auto; min-width: 0; line-height: 20px; }
/* The business band: the mark and the full name on a first row, then phone, rating, address and website, four in a row. */
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-band-body { align-items: flex-start; padding: 12px 16px; }
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cells { grid-auto-flow: row; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-rows: 48px 58px; row-gap: 10px; height: auto; }
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cell { justify-content: flex-start; padding: 0 12px; }
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-hero { grid-column: 1 / -1; justify-content: flex-start; padding: 0 64px 0 0; border-left: 0; }
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-hero + .tracy-wo-facts-cell { padding-left: 0; border-left: 0; }
.tracy-wo-facts-hero { flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px; }
.tracy-wo-facts-hero-name { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1 1 auto; }
.tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child { font-size: 16px; font-weight: 600; line-height: 24px; }
/* The name never shrinks below 40 characters, nor past the room the source chip needs. */
.tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child > .tracy-wo-facts-ell { flex: 0 0 auto; max-width: max(40ch, calc(100% - 80px)); }
.tracy-wo-facts-logo { flex: none; display: grid; place-items: center; width: 48px; height: 48px; overflow: hidden; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.02em; }
.tracy-wo-facts-ln > b, .tracy-wo-facts-rating > b { color: var(--foreground); font-weight: 600; }
/* The phone keeps its digits whole; the chips after it give way first. */
.tracy-wo-facts-ln > .tracy-wo-facts-keep { flex: 0 0 auto; max-width: 100%; }
.tracy-wo-facts-ln > .tracy-wo-edited { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* The rating is one string: the star and the score never wrap, the count ends in an ellipsis first. */
.tracy-wo-facts-rating { flex: 0 1 auto; min-width: 5.5ch; }
.tracy-wo-facts-rating-acts { flex-wrap: nowrap; gap: 4px 8px; min-width: 0; overflow: hidden; }
.tracy-wo-facts-rating-acts > .tracy-wo-facts-act { flex: none; }
.tracy-wo-facts-rating-acts > .tracy-wo-chip-warn { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-rating-acts .tracy-wo-facts-off { margin-left: 0; flex: none; }
/* Chips in one line of fixed height: a chip that does not fit whole wraps out of sight, and the band offers Show all. */
.tracy-wo-facts-chiprow { display: flex; flex-wrap: wrap; align-content: flex-start; align-items: center; gap: 8px 6px; width: 100%; height: 28px; min-width: 0; margin: 0; padding: 1px 0; overflow: hidden; list-style: none; box-sizing: border-box; }
.tracy-wo-facts-pill { display: inline-flex; align-items: center; gap: 6px; flex: 0 1 auto; max-width: min(280px, 100%); box-sizing: border-box; min-width: 0; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--card, var(--background)); font-size: 12.5px; line-height: 20px; }
.tracy-wo-facts-pill > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-pill > a { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: inherit; text-decoration: none; }
.tracy-wo-facts-pill > a:hover { text-decoration: underline; }
.tracy-wo-facts-pill > a:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-facts-pill svg { flex: none; color: var(--muted-foreground); }
.tracy-wo-facts-group { flex: none; padding-left: 6px; line-height: 24px; }
/* Team: people in one row. */
.tracy-wo-facts-band .tracy-wo-facts-people { flex-direction: row; flex-wrap: wrap; align-content: flex-start; gap: 12px 18px; width: 100%; height: 36px; min-width: 0; overflow: hidden; }
.tracy-wo-facts-people > li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tracy-wo-facts-band .tracy-wo-facts-people > li { flex: 0 1 auto; max-width: min(320px, 100%); height: 36px; overflow: hidden; }
.tracy-wo-facts-band .tracy-wo-facts-person > small { line-height: 16px; }
.tracy-wo-facts-band .tracy-wo-facts-avatar { width: 28px; height: 28px; font-size: 12px; }
.tracy-wo-facts-people li[data-off] .tracy-wo-facts-person .tracy-wo-facts-ell { color: var(--muted-foreground); }
.tracy-wo-facts-person > small { display: block; }
/* Brand: three cells side by side, nothing laid over another. */
.tracy-wo-facts-brand { display: flex; flex-wrap: nowrap; align-items: center; gap: 16px; width: 100%; min-width: 0; height: 100%; overflow: hidden; }
.tracy-wo-facts-brand-logo { flex: 0 1 auto; display: flex; align-items: center; gap: 10px; min-width: 0; max-width: 300px; overflow: hidden; }
.tracy-wo-facts-brand-logo .tracy-wo-logo { flex: none; width: 56px; height: 56px; }
.tracy-wo-facts-brand-logo .tracy-wo-stack { min-width: 0; overflow: hidden; }
.tracy-wo-facts-brand-logo .tracy-wo-warn { color: var(--muted-foreground); font-size: 12.5px; }
.tracy-wo-facts-brand-via { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.tracy-wo-facts-brand-via > * { max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-brand-notes { flex: 1 1 0; display: flex; flex-direction: column; gap: 2px; min-width: 80px; line-height: 18px; overflow: hidden; }
.tracy-wo-facts-brand > .tracy-wo-facts-swatches { flex: 0 1 auto; flex-wrap: nowrap; min-width: 0; margin: 0; overflow: hidden; }
.tracy-wo-facts-brand > .tracy-wo-facts-swatches li { flex: none; }
/* Opening hours: the days scroll sideways in fixed cells, the check and its choices sit in a last cell that stays. */
.tracy-wo-facts-hoursrow { display: flex; align-items: stretch; width: 100%; height: 100%; min-width: 0; }
.tracy-wo-facts-band .tracy-wo-facts-days { flex: 1 1 auto; grid-auto-columns: 112px; width: auto; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.tracy-wo-facts-days::-webkit-scrollbar { display: none; }
.tracy-wo-facts-days > .tracy-wo-facts-cell { padding: 0 10px; }
.tracy-wo-facts-days > .tracy-wo-facts-cell:first-child { padding-left: 0; }
.tracy-wo-facts-hoursrow > .tracy-wo-facts-status { flex: none; max-width: 50%; padding: 0 0 0 14px; }
.tracy-wo-facts-status > .tracy-wo-facts-ln { flex-wrap: nowrap; min-width: 0; overflow: hidden; }
.tracy-wo-facts-status .tracy-wo-facts-act { flex: none; }
/* What guests say: fixed-size quote cards in a row that scrolls sideways inside the band. */
.tracy-wo-facts-cards { display: flex; gap: 10px; align-items: stretch; height: 100%; min-width: 0; margin: 0; padding: 0 0 6px; overflow-x: auto; overflow-y: hidden; list-style: none; scrollbar-width: thin; }
.tracy-wo-facts-cards > li { flex: none; display: flex; flex-direction: column; justify-content: space-between; gap: 6px; width: 300px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in oklab, var(--muted) 50%, var(--card, var(--background))); }
.tracy-wo-facts-cards q { font-size: 12.5px; line-height: 18px; }
.tracy-wo-facts-band .tracy-wo-facts-stars { letter-spacing: 0; }
/* Photos & video: a filmstrip of fixed tiles, Add more first. */
.tracy-wo-facts-strip { display: grid; grid-auto-flow: column; grid-auto-columns: 132px; gap: 8px; align-items: stretch; height: 100%; min-width: 0; margin: 0; padding: 0 0 6px; overflow-x: auto; overflow-y: hidden; list-style: none; scrollbar-width: thin; }
.tracy-wo-facts-strip > li { position: relative; overflow: hidden; border-radius: 8px; background: var(--muted); }
.tracy-wo-facts-strip > li:first-child { background: transparent; }
.tracy-wo-facts-strip > li > a { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted-foreground); }
.tracy-wo-facts-strip > li > a svg { width: 28px; height: 28px; fill: currentColor; }
.tracy-wo-facts-strip img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-strip .tracy-wo-add-tile, .tracy-wo-facts-strip .tracy-wo-add-tile > button { height: 100%; }
.tracy-wo-facts-strip .tracy-wo-add-tile .tracy-wo-error { position: absolute; left: 4px; right: 4px; bottom: 4px; }
.tracy-wo-facts-more-tile { display: grid; place-items: center; color: var(--muted-foreground); font-size: 14px; font-weight: 600; }
.tracy-wo-facts-strip > .tracy-wo-facts-strip-na { display: flex; align-items: center; background: transparent; white-space: nowrap; }
.tracy-wo-facts-band[data-card='media'] .tracy-wo-add-media { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.tracy-wo-facts-band[data-card='media'] .tracy-wo-add-media button { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--foreground); font: inherit; font-size: 12px; line-height: 16px; cursor: pointer; }
.tracy-wo-facts-band[data-card='media'] .tracy-wo-add-media button:hover:not(:disabled) { background: var(--muted); }
.tracy-wo-facts-band[data-card='media'] .tracy-wo-add-media button svg { width: 12px; height: 12px; }
.tracy-wo-facts-band[data-card='media'] .tracy-wo-add-media > span { font-size: 11.5px; color: var(--muted-foreground); }
/* Research details: one line, Open at the right. */
.tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-label { flex: 1 1 auto; width: auto; flex-direction: row; justify-content: flex-start; align-items: center; gap: 10px; border-right: 0; }
.tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-label > .tracy-wo-facts-acts { margin-left: auto; }
.tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-body:empty { display: none; }
/* The side sheet a band opens: Show all, Edit, Research details. */
.tracy-wo-facts-sheet-body { flex: 1 1 auto; min-height: 0; padding: 0 16px; overflow-y: auto; }
.tracy-wo-facts-sheet-body .tracy-wo-facts-people { flex-direction: column; }
.tracy-wo-facts-sheet-body .tracy-wo-facts-chips { margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-sheet-body .tracy-wo-facts-chips > li { max-width: 100%; }
.tracy-wo-facts-sheet-media { display: flex; flex-direction: column; gap: 10px; }
.tracy-wo-facts-sheet-media .tracy-wo-facts-filters { justify-content: flex-start; }
.tracy-wo-facts-msgs li:first-child, .tracy-wo-facts-quotes li:first-child { border-top: 0; padding-top: 0; }
@container wo-facts (max-width: ${MID - 1}px) {
  .tracy-wo-facts-band { ${heightsAt(1)} flex-direction: column; }
  .tracy-wo-facts-band-label { width: auto; flex-direction: row; flex-wrap: nowrap; align-items: center; justify-content: flex-start; gap: 12px; padding: 10px 14px 0; border-right: 0; }
  .tracy-wo-facts-band-label > h3 { flex: 0 1 auto; }
  .tracy-wo-facts-band-label > .tracy-wo-facts-aside { flex: 1 1 0; min-width: 0; display: block; white-space: nowrap; text-overflow: ellipsis; line-height: 20px; }
  .tracy-wo-facts-band-label > .tracy-wo-facts-acts { flex: none; flex-wrap: nowrap; margin-left: auto; }
  .tracy-wo-facts-band-body { flex: 1 1 auto; min-height: 0; align-items: flex-start; padding: 8px 14px 12px; }
  .tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-band-body { padding: 12px 14px; }
  .tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: 48px 58px 58px; }
  .tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cell:nth-child(2n) { padding-left: 0; border-left: 0; }
  .tracy-wo-facts-band[data-card='research'] { flex-direction: row; }
  .tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-label { padding: 14px 16px; }
  .tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-body { align-items: center; padding: 0 14px; }
  .tracy-wo-facts-strip { grid-auto-columns: 112px; }
  .tracy-wo-facts-cards > li { width: 240px; }
}
@container wo-facts (max-width: ${NARROW - 1}px) {
  .tracy-wo-facts-band { ${heightsAt(2)} }
  .tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child { font-size: 15px; }
  .tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child > .tracy-wo-facts-ell { flex: 0 1 auto; max-width: none; }
  .tracy-wo-facts-band[data-card='messages'] .tracy-wo-facts-cells { grid-auto-flow: row; grid-template-columns: minmax(0, 1fr); row-gap: 8px; height: auto; }
  .tracy-wo-facts-band[data-card='messages'] .tracy-wo-facts-cell { padding-left: 0; border-left: 0; }
  .tracy-wo-facts-brand { flex-wrap: wrap; align-content: flex-start; row-gap: 8px; }
  .tracy-wo-facts-brand-notes { order: 3; flex: 1 1 100%; }
  .tracy-wo-facts-brand > .tracy-wo-facts-swatches { flex: 1 1 0; }
}
`

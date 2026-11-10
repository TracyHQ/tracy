/**
 * The Business facts sub-page as stacked fixed-height bands (#537, layout C). One custom property per band kind
 * holds its height (from BAND_HEIGHTS), a taller value under 720px of container width, and every band clips what
 * does not fit: lists scroll inside the band or open in Show all, long values end in an ellipsis. Tracy tokens
 * only. No backtick may appear inside the template below.
 */
import { BAND_HEIGHTS, BAND_IDS } from './business-facts-model.ts'

const wide = BAND_IDS.map((id) => `--wo-band-${id}: ${BAND_HEIGHTS[id][0]}px;`).join(' ')
const narrow = BAND_IDS.map((id) => `--wo-band-${id}: ${BAND_HEIGHTS[id][1]}px;`).join(' ')
const heights = BAND_IDS.map(
  (id) => `.tracy-wo-facts-band[data-card='${id}'] { height: var(--wo-band-${id}); }`
).join('\n')

export const FACTS_BANDS_CSS = `
.tracy-wo-facts { ${wide} display: flex; flex-direction: column; gap: 10px; min-width: 0; }
${heights}
.tracy-wo-facts-band { position: relative; display: flex; flex-direction: row; min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--card, var(--background)); }
.tracy-wo-facts-band-label { flex: none; display: flex; flex-direction: column; gap: 4px; width: 200px; min-width: 0; padding: 14px 16px; overflow: hidden; border-right: 1px solid var(--border); }
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
/* The business band: five cells in a row, the mark and the name in the first. */
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-band-body { padding: 14px 16px; }
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cells { grid-auto-flow: row; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1.3fr) minmax(0, 1.15fr); padding-right: 40px; }
.tracy-wo-facts-hero { flex-direction: row; align-items: center; justify-content: flex-start; gap: 12px; }
.tracy-wo-facts-hero-name { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child { font-size: 16px; font-weight: 600; line-height: 24px; }
.tracy-wo-facts-logo { flex: none; display: grid; place-items: center; width: 48px; height: 48px; overflow: hidden; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.02em; }
.tracy-wo-facts-rating-acts { gap: 4px 8px; }
.tracy-wo-facts-rating-acts .tracy-wo-facts-off { margin-left: 0; }
.tracy-wo-facts-ln > b { color: var(--foreground); font-weight: 600; }
/* Chips in one row, the rest in Show all. */
.tracy-wo-facts-chiprow { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; min-width: 0; margin: 0; padding: 0; overflow: hidden; list-style: none; }
.tracy-wo-facts-pill { display: inline-flex; align-items: center; gap: 6px; flex: none; max-width: 280px; min-width: 0; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--card, var(--background)); font-size: 12.5px; line-height: 20px; }
.tracy-wo-facts-pill > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-pill > a { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: inherit; text-decoration: none; }
.tracy-wo-facts-pill > a:hover { text-decoration: underline; }
.tracy-wo-facts-pill > a:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-facts-pill svg { flex: none; color: var(--muted-foreground); }
.tracy-wo-facts-group { flex: none; padding-left: 6px; }
/* Team: people in one row. */
.tracy-wo-facts-band .tracy-wo-facts-people { flex-direction: row; flex-wrap: nowrap; gap: 18px; min-width: 0; overflow: hidden; }
.tracy-wo-facts-people > li { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tracy-wo-facts-band .tracy-wo-facts-people > li { flex: 0 1 auto; max-width: 320px; }
.tracy-wo-facts-band .tracy-wo-facts-avatar { width: 28px; height: 28px; font-size: 12px; }
.tracy-wo-facts-people li[data-off] .tracy-wo-facts-person .tracy-wo-facts-ell { color: var(--muted-foreground); }
.tracy-wo-facts-person > small { display: block; }
/* Brand: logo, colours and the note in a row. */
.tracy-wo-facts-brand { display: flex; align-items: center; gap: 16px; min-width: 0; height: 100%; overflow: hidden; }
.tracy-wo-facts-brand .tracy-wo-stack { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
.tracy-wo-facts-brand .tracy-wo-warn { color: var(--muted-foreground); font-size: 12.5px; }
.tracy-wo-facts-brand .tracy-wo-logo { width: 56px; height: 56px; }
.tracy-wo-facts-brand-info { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tracy-wo-facts-brand-info .tracy-wo-facts-swatches { flex-wrap: nowrap; margin: 0; overflow: hidden; }
.tracy-wo-facts-brand-info .tracy-wo-facts-cap { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
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
.tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-label { flex: 1 1 auto; width: auto; flex-direction: row; align-items: center; gap: 10px; border-right: 0; }
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
@container (max-width: 719px) {
  .tracy-wo-facts { ${narrow} }
  .tracy-wo-facts-band { flex-direction: column; }
  .tracy-wo-facts-band-label { width: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 10px 14px 0; border-right: 0; }
  .tracy-wo-facts-band-label > .tracy-wo-facts-acts { margin-left: auto; }
  .tracy-wo-facts-band-body { flex: 1 1 auto; min-height: 0; align-items: flex-start; padding: 8px 14px 12px; }
  .tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cells { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-auto-rows: minmax(0, auto); row-gap: 10px; padding-right: 0; }
  .tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-hero { grid-column: 1 / -1; padding-right: 48px; }
  .tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cell:nth-child(2n+2) { padding-left: 0; border-left: 0; }
  .tracy-wo-facts-band[data-card='hours'] .tracy-wo-facts-cells, .tracy-wo-facts-band[data-card='messages'] .tracy-wo-facts-cells { grid-auto-flow: row; grid-template-columns: repeat(4, minmax(0, 1fr)); row-gap: 8px; height: auto; }
  .tracy-wo-facts-band[data-card='messages'] .tracy-wo-facts-cells { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-facts-band[data-card='hours'] .tracy-wo-facts-cell:nth-child(4n+1), .tracy-wo-facts-band[data-card='messages'] .tracy-wo-facts-cell { padding-left: 0; border-left: 0; }
  .tracy-wo-facts-band[data-card='research'] .tracy-wo-facts-band-label { padding: 14px 16px; }
  .tracy-wo-facts-strip { grid-auto-columns: 112px; }
  .tracy-wo-facts-cards > li { width: 240px; }
}
`

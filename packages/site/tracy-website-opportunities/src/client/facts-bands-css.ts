/**
 * The Business facts sub-page as stacked bands (#537, design A). The facts column is its own size container
 * (wo-facts), so the layout follows the width the bands really have. Every band is a 40px header row (title, chips,
 * Check this, the action cluster in fixed slots) over a body of one shared height (BAND_HEIGHT, per breakpoint): a
 * band never grows by itself, only Edit makes it taller. Rows that do not fit scroll sideways (tracy-wo-facts-row,
 * scrollbar hidden). Tracy tokens only. No backtick may appear inside the template below.
 */
import { BAND_BREAKPOINTS, BAND_HEIGHT } from './business-facts-model.ts'

const [MID, NARROW] = BAND_BREAKPOINTS
const [WIDE_H, MID_H, NARROW_H] = BAND_HEIGHT
const amber = 'color-mix(in oklab, var(--warning) 45%, var(--foreground))'

export const FACTS_BANDS_CSS = `
.tracy-wo-facts { container: wo-facts / inline-size; --wo-band-h: ${WIDE_H}px; display: flex; flex-direction: column; gap: 10px; width: 100%; min-width: 0; box-sizing: border-box; }
.tracy-wo-facts-band { box-sizing: border-box; display: flex; flex-direction: column; height: var(--wo-band-h); min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 12px; background: var(--card, var(--background)); }
.tracy-wo-facts-band[data-editing] { height: auto; overflow: visible; border-color: var(--primary); }
.tracy-wo-facts-bh { flex: none; display: flex; align-items: center; gap: 8px; height: 40px; min-width: 0; padding: 0 14px 0 16px; box-sizing: border-box; border-bottom: 1px solid var(--border); }
.tracy-wo-facts-bh > h3 { flex: none; display: flex; align-items: center; gap: 6px; max-width: 40%; min-width: 0; margin: 0; overflow: hidden; font-size: 13.5px; font-weight: 600; line-height: 20px; white-space: nowrap; }
.tracy-wo-facts-bh > h3 > .tracy-wo-icon { flex: none; width: 15px; height: 15px; color: var(--muted-foreground); }
.tracy-wo-facts-chips-h { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; }
.tracy-wo-facts-chips-h > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-bh > .tracy-wo-facts-aside { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-chk { flex: none; display: inline-flex; align-items: center; gap: 4px; padding: 0 8px; border: 1px solid color-mix(in oklab, var(--warning) 40%, transparent); border-radius: 999px; background: color-mix(in oklab, var(--warning) 14%, transparent); color: ${amber}; font-size: 11.5px; font-weight: 600; line-height: 18px; white-space: nowrap; cursor: help; }
.tracy-wo-facts-chk svg, .tracy-wo-facts-note svg { flex: none; width: 12px; height: 12px; }
/* The cluster: [Add more] then the switch slot and the Edit slot, fixed widths, right-aligned on every band. */
.tracy-wo-facts-cl { flex: none; display: flex; align-items: center; gap: 8px; margin-left: auto; }
.tracy-wo-facts-cl > span { display: flex; align-items: center; }
.tracy-wo-facts-slot-add { margin-right: 6px; }
.tracy-wo-facts-slot-sw { width: 124px; }
.tracy-wo-facts-slot-edit { width: 44px; justify-content: flex-end; }
.tracy-wo-facts-sw { position: relative; display: inline-flex; align-items: center; gap: 7px; min-width: 0; font-size: 12.5px; line-height: 18px; white-space: nowrap; }
.tracy-wo-facts-sw-word { color: var(--muted-foreground); }
.tracy-wo-facts-sw[data-on]:not([data-lock]) .tracy-wo-facts-sw-word { color: var(--foreground); }
.tracy-wo-facts-sw[data-failed] .tracy-wo-facts-sw-word, .tracy-wo-add-act[data-failed] .tracy-wo-facts-act { color: var(--destructive); }
.tracy-wo-facts-sw [data-slot='switch']:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; box-shadow: none; }
.tracy-wo-facts-lock { flex: none; width: 11px; height: 11px; color: var(--muted-foreground); }
.tracy-wo-facts-sw-failed { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tracy-wo-add-act { display: inline-flex; align-items: center; }
.tracy-wo-facts-bh .tracy-wo-facts-act { color: var(--foreground); font-size: 12.5px; font-weight: 500; }
.tracy-wo-facts-bh .tracy-wo-facts-act:disabled { color: var(--muted-foreground); font-weight: 400; }
/* The body: one row, the same height on every band; what does not fit scrolls sideways. */
.tracy-wo-facts-band-body { flex: 1 1 auto; display: flex; align-items: center; min-width: 0; min-height: 0; padding: 10px 16px; box-sizing: border-box; overflow: hidden; }
.tracy-wo-facts-band[data-off] .tracy-wo-facts-band-body { opacity: 0.55; }
.tracy-wo-facts-row { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; }
.tracy-wo-facts-row::-webkit-scrollbar { display: none; }
.tracy-wo-facts-na { color: var(--muted-foreground); font-style: normal; cursor: default; }
.tracy-wo-facts-ln { display: flex; align-items: center; gap: 6px; min-width: 0; line-height: 20px; }
.tracy-wo-facts-ln > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-ell { display: block; min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-dim { color: var(--muted-foreground); }
.tracy-wo-facts-ck { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; line-height: 14px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted-foreground); }
.tracy-wo-facts-cells { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(140px, 1fr); width: 100%; height: 100%; min-width: 0; }
.tracy-wo-facts-cell { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; padding: 0 12px; overflow: hidden; border-left: 1px solid var(--border); }
.tracy-wo-facts-cell:first-child { padding-left: 0; border-left: 0; }
.tracy-wo-facts-cell > q { display: block; font-size: 12px; }
.tracy-wo-facts-clamp2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.tracy-wo-facts-band .tracy-wo-facts-about { flex: 1 1 auto; min-width: 0; line-height: 20px; }
/* The business: the mark and the name, then phone, rating, address and website, in one row of five cells. */
.tracy-wo-facts-band[data-card='business'] .tracy-wo-facts-cells { grid-template-columns: minmax(200px, 1.4fr) minmax(150px, 1.15fr) minmax(170px, 1.25fr) minmax(150px, 1.15fr) minmax(100px, 0.7fr); grid-auto-columns: unset; }
.tracy-wo-facts-hero { flex-direction: row; align-items: center; justify-content: flex-start; gap: 10px; }
.tracy-wo-facts-hero-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 auto; }
.tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child { font-size: 14.5px; font-weight: 600; }
.tracy-wo-facts-logo { flex: none; display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
.tracy-wo-facts-ln > b, .tracy-wo-facts-rating > b { color: var(--foreground); font-weight: 600; }
.tracy-wo-facts-ln > .tracy-wo-facts-keep { flex: 0 0 auto; max-width: 100%; }
.tracy-wo-facts-ln > .tracy-wo-edited { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-facts-rating { flex: 0 1 auto; min-width: 5.5ch; }
.tracy-wo-facts-rating-acts { flex-wrap: nowrap; gap: 4px 8px; min-width: 0; overflow: hidden; }
.tracy-wo-facts-rating-acts > .tracy-wo-facts-act { flex: none; }
.tracy-wo-facts-rating-acts > .tracy-wo-chip-warn { display: block; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-rating-acts .tracy-wo-facts-off { margin-left: 0; flex: none; }
/* Opening hours: seven cells share the row and shrink; under that they scroll sideways. */
.tracy-wo-facts-days { grid-auto-columns: minmax(84px, 1fr); }
.tracy-wo-facts-days > .tracy-wo-facts-cell { padding: 0 10px; }
.tracy-wo-facts-days > .tracy-wo-facts-cell:first-child { padding-left: 0; }
/* Chips (services, social pages, research sources): one line. */
.tracy-wo-facts-chiprow { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; width: 100%; min-width: 0; margin: 0; padding: 1px 0; list-style: none; box-sizing: border-box; }
.tracy-wo-facts-pill { display: inline-flex; align-items: center; gap: 6px; flex: none; max-width: 280px; box-sizing: border-box; min-width: 0; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--card, var(--background)); font-size: 12.5px; line-height: 20px; }
.tracy-wo-facts-pill > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-pill > a { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: inherit; text-decoration: none; }
.tracy-wo-facts-pill > a:hover { text-decoration: underline; }
.tracy-wo-facts-pill > a:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-facts-pill svg { flex: none; color: var(--muted-foreground); }
.tracy-wo-facts-group { flex: none; padding-left: 6px; line-height: 24px; }
/* Team: people side by side, each a small card with its own switch. */
.tracy-wo-facts-band .tracy-wo-facts-people { flex-direction: row; flex-wrap: nowrap; align-items: center; gap: 10px; width: 100%; min-width: 0; }
.tracy-wo-facts-band .tracy-wo-facts-people > li { flex: none; display: flex; align-items: center; gap: 8px; max-width: 360px; padding: 4px 10px 4px 6px; border: 1px solid var(--border); border-radius: 10px; }
.tracy-wo-facts-band .tracy-wo-facts-people > li > .tracy-wo-facts-sw { padding-left: 10px; border-left: 1px solid var(--border); }
.tracy-wo-facts-band .tracy-wo-facts-person > small { line-height: 16px; }
.tracy-wo-facts-band .tracy-wo-facts-avatar { width: 28px; height: 28px; font-size: 12px; }
.tracy-wo-facts-people li[data-off] .tracy-wo-facts-person, .tracy-wo-facts-people li[data-off] .tracy-wo-facts-avatar { opacity: 0.45; }
.tracy-wo-facts-person > small { display: block; }
/* Brand: three cells side by side, nothing laid over another. */
.tracy-wo-facts-brand { display: flex; flex-wrap: nowrap; align-items: center; gap: 16px; width: 100%; min-width: 0; height: 100%; overflow: hidden; }
.tracy-wo-facts-brand-logo { flex: 0 1 auto; display: flex; align-items: center; gap: 10px; min-width: 0; max-width: 300px; overflow: hidden; }
.tracy-wo-facts-brand-logo .tracy-wo-logo { flex: none; width: 48px; height: 48px; }
.tracy-wo-facts-brand-logo .tracy-wo-stack { min-width: 0; overflow: hidden; }
.tracy-wo-facts-brand-logo .tracy-wo-warn { color: var(--muted-foreground); font-size: 12.5px; }
.tracy-wo-facts-brand-via { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.tracy-wo-facts-brand-via > * { max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-brand-notes { flex: 1 1 0; display: flex; flex-direction: column; gap: 2px; min-width: 80px; line-height: 18px; overflow: hidden; }
.tracy-wo-facts-brand > .tracy-wo-facts-swatches { flex: 0 1 auto; flex-wrap: nowrap; min-width: 0; margin: 0; overflow: hidden; }
.tracy-wo-facts-brand > .tracy-wo-facts-swatches li { flex: none; }
/* What guests say: quote cards in one row. */
.tracy-wo-facts-cards { display: flex; gap: 10px; align-items: stretch; width: 100%; height: 100%; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-cards > li { flex: none; display: flex; flex-direction: column; justify-content: space-between; gap: 0; width: 320px; padding: 3px 10px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 9px; background: color-mix(in oklab, var(--muted) 50%, var(--card, var(--background))); }
.tracy-wo-facts-cards q { font-size: 12px; line-height: 16px; }
.tracy-wo-facts-cards .tracy-wo-facts-ln { line-height: 16px; }
.tracy-wo-facts-cards .tracy-wo-facts-ln > .tracy-wo-facts-ell { min-width: 9ch; }
.tracy-wo-facts-band .tracy-wo-facts-stars { letter-spacing: 0; }
/* Photos & video: the filters, then every tile in one filmstrip. */
.tracy-wo-facts-mediarow { display: flex; align-items: center; gap: 12px; width: 100%; height: 100%; min-width: 0; }
.tracy-wo-facts-mediarow > .tracy-wo-facts-filters { flex: none; flex-wrap: nowrap; justify-content: flex-start; }
.tracy-wo-facts-strip { flex: 1 1 auto; display: flex; gap: 6px; align-items: center; height: 100%; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-strip > li { position: relative; flex: none; width: 52px; height: 52px; overflow: hidden; border-radius: 8px; background: var(--muted); }
.tracy-wo-facts-strip > li > a { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted-foreground); }
.tracy-wo-facts-strip > li > a svg { width: 18px; height: 18px; fill: currentColor; }
.tracy-wo-facts-strip img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-strip .tracy-wo-facts-bdg { right: 2px; bottom: 2px; width: 14px; height: 14px; }
.tracy-wo-facts-strip .tracy-wo-facts-owner { left: 2px; bottom: 2px; font-size: 9px; padding: 0 3px; }
/* Edit: the band's fields in place, Cancel and Save at its bottom right. */
.tracy-wo-facts-band-edit { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 14px 16px 12px; }
.tracy-wo-facts-note { display: flex; flex-direction: row; align-items: flex-start; gap: 8px; padding: 6px 10px; border: 1px solid color-mix(in oklab, var(--warning) 40%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--warning) 12%, var(--card, var(--background))); color: ${amber}; font-size: 12px; line-height: 17px; }
.tracy-wo-facts-note svg { margin-top: 2px; }
.tracy-wo-facts-ef { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; min-width: 0; }
.tracy-wo-facts-ef[data-days] { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.tracy-wo-facts-fld { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tracy-wo-facts-fld[data-wide] { grid-column: span 2; }
.tracy-wo-facts-bf { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 2px -16px 0; padding: 10px 14px 0 16px; border-top: 1px solid var(--border); }
.tracy-wo-facts-bf-note { margin-right: auto; min-width: 0; font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-facts-band-edit .tracy-wo-facts-people { flex-direction: column; }
/* What research read beyond the facts, under the bands. */
.tracy-wo-facts-more { min-width: 0; }
@container wo-facts (max-width: ${MID - 1}px) {
  .tracy-wo-facts { --wo-band-h: ${MID_H}px; }
  .tracy-wo-facts-ef { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container wo-facts (max-width: ${NARROW - 1}px) {
  .tracy-wo-facts { --wo-band-h: ${NARROW_H}px; }
  .tracy-wo-facts-bh { padding: 0 10px 0 12px; gap: 6px; }
  .tracy-wo-facts-chips-h, .tracy-wo-facts-bh > .tracy-wo-facts-aside { display: none; }
  .tracy-wo-facts-band-body { padding: 10px 12px; }
  .tracy-wo-facts-ef { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-facts-fld[data-wide] { grid-column: auto; }
  .tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child { font-size: 14px; }
}
`

/**
 * The Business facts sub-page as one column of section cards (#537, layout B; the rail is facts-rail-css.ts). The
 * facts column is its own size container (wo-facts). Every card is a header row (title, Check this, the section's one
 * source, the action cluster) over its facts, one per row: a 160px muted label, the value, a source chip only where it
 * differs from the section's, and the row's own small switch at the end, in one aligned column. Edit turns a card into
 * its fields in place. Tracy tokens only. No backtick may appear inside the template below.
 */
import { BAND_BREAKPOINTS } from './business-facts-model.ts'
import { FACTS_RAIL_CSS } from './facts-rail-css.ts'

const [MID, NARROW] = BAND_BREAKPOINTS
const amber = 'color-mix(in oklab, var(--warning) 45%, var(--foreground))'
const card = 'var(--card, var(--background))'

export const FACTS_BANDS_CSS =
  FACTS_RAIL_CSS +
  `
.tracy-wo-facts { container: wo-facts / inline-size; display: flex; flex-direction: column; gap: 16px; width: 100%; min-width: 0; box-sizing: border-box; font-size: 14px; line-height: 21px; }
.tracy-wo-facts-band { box-sizing: border-box; display: flex; flex-direction: column; min-width: 0; padding: 14px 20px 6px; border: 1px solid var(--border); border-radius: 14px; background: ${card}; scroll-margin-top: calc(var(--wo-stick-top, 0px) + var(--wo-head-h, 0px) + 12px); }
.tracy-wo-facts-band:focus { outline: none; }
.tracy-wo-facts-band:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
.tracy-wo-facts-band[data-editing] { border-color: var(--primary); padding-bottom: 14px; }
.tracy-wo-facts-bh { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-height: 32px; min-width: 0; margin-bottom: 2px; }
.tracy-wo-facts-bh > h3 { flex: none; display: flex; align-items: center; gap: 6px; max-width: 100%; min-width: 0; margin: 0; overflow: hidden; font-size: 16px; font-weight: 600; line-height: 24px; white-space: nowrap; }
.tracy-wo-facts-bh > h3 > .tracy-wo-icon { flex: none; width: 16px; height: 16px; color: var(--muted-foreground); }
.tracy-wo-facts-from { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: var(--muted-foreground); font-size: 13px; line-height: 20px; white-space: nowrap; }
.tracy-wo-facts-from svg { flex: none; }
.tracy-wo-facts-chips-h { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; }
.tracy-wo-facts-bh > .tracy-wo-facts-aside { flex: 0 1 auto; min-width: 0; overflow: hidden; color: var(--muted-foreground); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-note svg { flex: none; width: 12px; height: 12px; }
/* The cluster: [Add more] then the switch slot and the Edit slot, right-aligned on every card. */
.tracy-wo-facts-cl { flex: none; display: flex; align-items: center; gap: 12px; margin-left: auto; }
.tracy-wo-facts-cl > span { display: flex; align-items: center; }
.tracy-wo-facts-slot-sw { width: 118px; }
.tracy-wo-facts-slot-edit { width: 44px; justify-content: flex-end; }
.tracy-wo-facts-sw { position: relative; display: inline-flex; align-items: center; gap: 7px; min-width: 0; font-size: 13px; line-height: 18px; white-space: nowrap; }
.tracy-wo-facts-sw-word { color: var(--muted-foreground); }
.tracy-wo-facts-sw[data-on]:not([data-lock]) .tracy-wo-facts-sw-word { color: var(--foreground); }
.tracy-wo-facts-sw[data-failed] .tracy-wo-facts-sw-word, .tracy-wo-add-act[data-failed] .tracy-wo-facts-act { color: var(--destructive); }
.tracy-wo-facts-sw [data-slot='switch']:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; box-shadow: none; }
.tracy-wo-facts-lock { flex: none; width: 11px; height: 11px; color: var(--muted-foreground); }
.tracy-wo-facts-sw-failed { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tracy-wo-add-act { display: inline-flex; align-items: center; }
.tracy-wo-facts-bh .tracy-wo-facts-act { color: var(--muted-foreground); font-size: 13px; font-weight: 500; }
.tracy-wo-facts-bh .tracy-wo-facts-act:hover:not(:disabled) { color: var(--foreground); }
.tracy-wo-facts-bh .tracy-wo-facts-act:disabled { font-weight: 400; }
/* The body: the card's facts, one per row; what is no row (N/A, a paragraph, chips) keeps a small margin. */
.tracy-wo-facts-band-body { min-width: 0; padding: 6px 0 12px; }
.tracy-wo-facts-band-body:has(> .tracy-wo-facts-cells) { padding: 0; }
.tracy-wo-facts-band[data-off] .tracy-wo-facts-band-body { opacity: 0.5; }
.tracy-wo-facts-row { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; overscroll-behavior-x: contain; }
.tracy-wo-facts-row::-webkit-scrollbar { display: none; }
.tracy-wo-facts-na { color: var(--muted-foreground); font-style: normal; cursor: default; }
.tracy-wo-facts-ln { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; }
.tracy-wo-facts-ln > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-ell { display: block; min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tracy-wo-facts-dim { color: var(--muted-foreground); }
.tracy-wo-facts-ck { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 13px; line-height: 20px; color: var(--muted-foreground); }
.tracy-wo-facts-clamp2 { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.tracy-wo-facts-band .tracy-wo-facts-about { min-width: 0; margin: 0; line-height: 22px; }
/* One fact per row: label, value, then the row's chip and switch at the end (their own column, right-aligned). */
.tracy-wo-facts-cells { display: flex; flex-direction: column; min-width: 0; }
.tracy-wo-facts-cell { display: grid; grid-template-columns: 160px minmax(0, 1fr) auto; column-gap: 16px; align-items: center; min-width: 0; min-height: 46px; padding: 10px 0; box-sizing: border-box; border-top: 1px solid var(--border); font-size: 15px; }
.tracy-wo-facts-cell:first-child { border-top: 0; }
.tracy-wo-facts-cell > * { grid-column: 2; min-width: 0; }
.tracy-wo-facts-cell > .tracy-wo-facts-ck { grid-column: 1; grid-row: 1 / span 3; }
.tracy-wo-facts-cell > .tracy-wo-facts-meta { grid-column: 3; grid-row: 1 / span 3; flex-wrap: nowrap; justify-content: flex-end; }
.tracy-wo-facts-meta:not(:has(.tracy-wo-facts-sw)) { padding-right: 32px; }
.tracy-wo-facts-cell .tracy-wo-facts-ln > .tracy-wo-facts-ell { white-space: normal; overflow-wrap: anywhere; }
.tracy-wo-facts-cell > .tracy-wo-small, .tracy-wo-facts-cell > q { display: block; margin-top: 2px; font-size: 13px; line-height: 19px; }
.tracy-wo-facts-cell > .tracy-wo-facts-ln + .tracy-wo-facts-ln { margin-top: 2px; }
.tracy-wo-facts-cell[data-off] > :not(.tracy-wo-facts-meta):not(.tracy-wo-facts-ck), .tracy-wo-facts-cell[data-off] > .tracy-wo-facts-ck { opacity: 0.45; }
/* The business: the mark, the name and the type on one line. */
.tracy-wo-facts-hero-v { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tracy-wo-facts-hero-name { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; }
.tracy-wo-facts-hero-name > .tracy-wo-facts-ln:first-child { font-size: 16px; font-weight: 600; }
.tracy-wo-facts-logo { flex: none; display: grid; place-items: center; width: 40px; height: 40px; overflow: hidden; border-radius: 10px; font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
.tracy-wo-facts-logo > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-ln > b { color: var(--foreground); font-weight: 600; }
.tracy-wo-facts-ln > .tracy-wo-facts-keep { flex: 0 0 auto; max-width: 100%; }
.tracy-wo-facts-ln > .tracy-wo-pill { flex: 0 1 auto; min-width: 0; }
/* Chips (services, amenities, social pages): they wrap onto more lines. */
.tracy-wo-facts-chiprow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; width: 100%; min-width: 0; margin: 0; padding: 1px 0; list-style: none; box-sizing: border-box; overflow: visible; }
.tracy-wo-facts-pill { display: inline-flex; align-items: center; gap: 6px; flex: none; max-width: 100%; box-sizing: border-box; min-width: 0; padding: 2px 10px; border: 1px solid var(--border); border-radius: 999px; background: ${card}; font-size: 13.5px; line-height: 22px; }
.tracy-wo-facts-pill > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-pill > a { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: inherit; text-decoration: none; }
.tracy-wo-facts-pill > a:hover { text-decoration: underline; }
.tracy-wo-facts-pill > a:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-facts-pill svg { flex: none; color: var(--muted-foreground); }
.tracy-wo-facts-group { flex: none; padding-left: 6px; line-height: 24px; }
/* Services: the chip is its own switch, a round tick when on, an empty ring when kept off. */
.tracy-wo-facts-toggles > .tracy-wo-facts-pill { position: relative; gap: 7px; padding: 0 12px 0 6px; font-size: 14px; line-height: 30px; }
.tracy-wo-facts-toggles .tracy-wo-facts-sw { position: static; gap: 0; }
.tracy-wo-facts-toggles [data-slot='switch'] { position: static; width: 18px; height: 18px; padding: 0; border: 1.5px solid color-mix(in oklab, var(--muted-foreground) 55%, transparent); border-radius: 50%; background: transparent; box-sizing: border-box; }
.tracy-wo-facts-toggles [data-slot='switch'][data-checked] { border-color: var(--primary); background: var(--primary); }
.tracy-wo-facts-toggles [data-slot='switch'] > [data-slot='switch-thumb'] { display: none; }
.tracy-wo-facts-toggles [data-slot='switch']::after { content: ''; position: absolute; inset: 0; border-radius: 999px; cursor: pointer; }
.tracy-wo-facts-toggles [data-slot='switch'][data-checked]::before { content: ''; display: block; width: 4px; height: 8px; margin: 1px auto 0; border: solid var(--primary-foreground); border-width: 0 1.75px 1.75px 0; transform: rotate(45deg); }
.tracy-wo-facts-toggles [data-slot='switch']:focus-visible::after { outline: 1px solid var(--ring); outline-offset: 1px; }
.tracy-wo-facts-toggles > .tracy-wo-facts-pill[data-off] { border-style: dashed; color: var(--muted-foreground); }
.tracy-wo-facts-toggles > .tracy-wo-facts-pill:hover { border-color: color-mix(in oklab, var(--foreground) 30%, var(--border)); }
/* Team: one row per person, the name where the labels are, the role as the value, the switch at the end. */
.tracy-wo-facts-people { display: flex; flex-direction: column; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-band .tracy-wo-facts-people > li { display: grid; grid-template-columns: 28px 116px minmax(0, 1fr) auto; column-gap: 16px; align-items: center; min-height: 46px; padding: 9px 0; border-top: 1px solid var(--border); font-size: 15px; }
.tracy-wo-facts-band .tracy-wo-facts-people > li:first-child { border-top: 0; }
.tracy-wo-facts-band .tracy-wo-facts-person { display: contents; }
.tracy-wo-facts-band .tracy-wo-facts-person > small { color: var(--muted-foreground); font-size: 15px; }
.tracy-wo-facts-band .tracy-wo-facts-people > li > .tracy-wo-facts-sw { grid-column: 4; justify-self: end; }
.tracy-wo-facts-band .tracy-wo-facts-avatar { width: 28px; height: 28px; font-size: 12px; }
.tracy-wo-facts-people li[data-off] .tracy-wo-facts-person > *, .tracy-wo-facts-people li[data-off] .tracy-wo-facts-avatar { opacity: 0.45; }
.tracy-wo-facts-people .tracy-wo-facts-sw-word, .tracy-wo-facts-cards .tracy-wo-facts-sw-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
/* Brand: the logo and what it is, then the colours. */
.tracy-wo-facts-brand-logo { display: flex; align-items: center; gap: 12px; min-width: 0; }
.tracy-wo-facts-brand-logo .tracy-wo-logo { flex: none; width: 48px; height: 48px; }
.tracy-wo-facts-brand-logo .tracy-wo-warn { color: var(--muted-foreground); font-size: 13px; }
.tracy-wo-facts-brand-via { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.tracy-wo-facts-brand-via > * { max-width: 100%; min-width: 0; }
.tracy-wo-facts-brand .tracy-wo-facts-swatches { margin: 0; font-size: 13px; }
/* Key messages: the message as the value, the quote it rests on under it. */
.tracy-wo-facts-band[data-card='messages'] .tracy-wo-facts-cell > .tracy-wo-facts-ln { font-weight: 600; }
/* What guests say: one review per row, its author line and switch under the quote. */
.tracy-wo-facts-cards { display: flex; flex-direction: column; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-cards > li { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 10px 0; border-top: 1px solid var(--border); }
.tracy-wo-facts-cards > li:first-child { border-top: 0; }
.tracy-wo-facts-cards q { font-size: 14.5px; line-height: 21px; }
.tracy-wo-facts-cards .tracy-wo-facts-ln { flex-wrap: nowrap; }
.tracy-wo-facts-cards .tracy-wo-facts-ln > .tracy-wo-facts-ell { min-width: 9ch; }
.tracy-wo-facts-figs { display: inline-flex; align-items: center; gap: 8px; flex: 0 1 auto; min-width: 0; overflow: hidden; }
/* About: the story and the posts, two lines each. */
.tracy-wo-facts-qt { margin: 0; font-size: 14.5px; line-height: 22px; }
/* Photos & video: the filters, then every tile in one filmstrip. */
.tracy-wo-facts-mediarow { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; }
.tracy-wo-facts-mediarow > .tracy-wo-facts-filters { flex: none; flex-wrap: nowrap; justify-content: flex-start; }
.tracy-wo-facts-strip { flex: 1 1 auto; display: flex; gap: 6px; align-items: center; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-strip > li { position: relative; flex: none; width: 60px; height: 60px; overflow: hidden; border-radius: 8px; background: var(--muted); }
.tracy-wo-facts-strip > li > a { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted-foreground); }
.tracy-wo-facts-strip > li > a svg { width: 18px; height: 18px; fill: currentColor; }
.tracy-wo-facts-strip img { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-strip .tracy-wo-facts-bdg { right: 2px; bottom: 2px; width: 14px; height: 14px; }
.tracy-wo-facts-strip .tracy-wo-facts-owner { left: 2px; bottom: 2px; font-size: 9px; padding: 0 3px; }
/* Edit: the band's fields in place, Cancel and Save at its bottom right. */
.tracy-wo-facts-band-edit { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 8px 0 0; }
.tracy-wo-facts-note { display: flex; flex-direction: row; align-items: flex-start; gap: 8px; padding: 6px 10px; border: 1px solid color-mix(in oklab, var(--warning) 40%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--warning) 12%, var(--card, var(--background))); color: ${amber}; font-size: 12px; line-height: 17px; }
.tracy-wo-facts-note svg { margin-top: 2px; }
.tracy-wo-facts-ef { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; min-width: 0; }
.tracy-wo-facts-ef[data-days] { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
.tracy-wo-facts-fld { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tracy-wo-facts-fld[data-wide] { grid-column: span 2; }
.tracy-wo-facts-bf { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 2px -20px 0; padding: 12px 20px 0; border-top: 1px solid var(--border); }
.tracy-wo-facts-bf-note { margin-right: auto; min-width: 0; font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-facts-band-edit .tracy-wo-facts-people { flex-direction: column; }
@container wo-facts (max-width: ${MID - 1}px) {
  .tracy-wo-facts-ef { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container wo-facts (max-width: ${NARROW - 1}px) {
  .tracy-wo-facts-band { padding: 12px 14px 4px; }
  .tracy-wo-facts-cell { grid-template-columns: minmax(0, 1fr) auto; row-gap: 2px; }
  .tracy-wo-facts-cell > .tracy-wo-facts-ck { grid-column: 1; grid-row: auto; }
  .tracy-wo-facts-cell > * { grid-column: 1; }
  .tracy-wo-facts-cell > .tracy-wo-facts-meta { grid-column: 2; grid-row: 1 / span 4; }
  .tracy-wo-facts-band .tracy-wo-facts-people > li { grid-template-columns: 28px minmax(0, 1fr) auto; }
  .tracy-wo-facts-band .tracy-wo-facts-person > small { grid-column: 2; }
  .tracy-wo-facts-band .tracy-wo-facts-people > li > .tracy-wo-facts-sw { grid-column: 3; grid-row: 1 / span 2; }
  .tracy-wo-facts-ef { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-facts-fld[data-wide] { grid-column: auto; }
}
`

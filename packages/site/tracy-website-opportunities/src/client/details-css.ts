/**
 * Layout of the Details page (#517): the sticky header, the two columns of section cards (layout C), the Progress
 * card (stepper style D), the sub-page (its header: `sub-page-header-css.ts`), the Demo site block and
 * the Business brief table. Scoped under `.tracy-wo-details`, reading only Tracy tokens. The
 * section card rules are repeated here so Details keeps its look when the Inspector's rules go. No backtick may appear
 * inside the template below.
 */
import { PROGRESS_BAND_CSS } from './progress-band-css.ts'
import { FACTS_BANDS_CSS } from './facts-bands-css.ts'
import { FACTS_OWNER_CSS } from './facts-owner-css.ts'
import { FACTS_SAVED_CSS } from './facts-saved-css.ts'
import { PAGE_HEADER_CSS } from './page-header-css.ts'
import { SUB_PAGE_HEADER_CSS } from './sub-page-header-css.ts'
export const DETAILS_CSS =
  `
.tracy-wo-details { gap: 12px; }
.tracy-wo-details .tracy-wo-insp-sec { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; }
.tracy-wo-details .tracy-wo-insp-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tracy-wo-details-head { position: sticky; top: 0; z-index: 4; display: flex; flex-direction: column; gap: 6px; margin: -12px -12px 0; padding: 8px 12px 10px; background: var(--background); border-bottom: 1px solid var(--border); }
.tracy-wo-details-head-line { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tracy-wo-details-head-facts { margin: 0 0 0 46px; }
.tracy-wo-details-head-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.tracy-wo-details-head-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 260px; }
.tracy-wo-details-head-acts { flex: none; }
.tracy-wo-psec { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--card, var(--background)); }
.tracy-wo-psec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tracy-wo-psec-title { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 14px; font-weight: 600; line-height: 20px; }
.tracy-wo-psec-meta { font-size: 12px; font-weight: 400; color: var(--muted-foreground); }
.tracy-wo-psec[data-locked] { background: color-mix(in oklab, var(--muted) 45%, var(--background)); }
.tracy-wo-psec[data-locked] .tracy-wo-psec-title { color: var(--muted-foreground); }
.tracy-wo-psec-lock { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--muted-foreground); }
.tracy-wo-media-strip { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-media-strip .tracy-wo-tile { position: relative; border-radius: 6px; }
.tracy-wo-media-strip .tracy-wo-tile[data-video]::after { content: "\\25B6"; position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 12px; text-shadow: 0 1px 2px rgb(0 0 0 / 50%); pointer-events: none; }
.tracy-wo-media-more { display: grid; place-items: center; font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-details .tracy-wo-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-demo-block { display: flex; flex-direction: column; gap: 10px; }
.tracy-wo-demo-block-acts { gap: 6px; }
.tracy-wo-brief-note { display: block; margin-top: 2px; color: var(--muted-foreground); font-size: 12px; }
.tracy-wo-brief-steps { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; font-size: 13px; }
.tracy-wo-brief-steps li { display: flex; align-items: center; gap: 8px; }
.tracy-wo-brief-steps li > span:last-child { margin-left: auto; color: var(--muted-foreground); font-size: 12px; }
.tracy-wo-brief-steps li[data-state='waiting'] b { color: var(--muted-foreground); font-weight: 400; }
.tracy-wo-brief-steps li[data-state='failed'] > span:last-child { color: var(--destructive); }
.tracy-wo-brief-steps b { font-weight: 500; }
.tracy-wo-brief-steps .tracy-wo-icon.is-done { color: var(--success); }
.tracy-wo-brief-steps .tracy-wo-icon.is-failed { color: var(--destructive); }
.tracy-wo-brief-steps .tracy-wo-icon.is-waiting { color: var(--muted-foreground); }
.tracy-wo-details-cols { display: grid; grid-template-columns: minmax(0, 34fr) minmax(0, 66fr); gap: 16px; align-items: start; }
.tracy-wo-open { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 0; border: 0; background: transparent; color: var(--primary); font: inherit; font-size: 12.5px; white-space: nowrap; cursor: pointer; }
.tracy-wo-open svg { width: 14px; height: 14px; }
.tracy-wo-open:hover { text-decoration: underline; text-underline-offset: 2px; }
.tracy-wo-open:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-profile-card .tracy-wo-field dd > span:first-child { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tracy-wo-profile-card .tracy-wo-fields > .tracy-wo-field { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 2px 10px; align-items: baseline; }
.tracy-wo-stab { display: flex; flex-direction: column; min-width: 0; margin: 0; padding: 0; list-style: none; }
/* One line per source (#537): glyph, name and link on the left, the state pill pushed right, then the remove control. */
.tracy-wo-stab-row { display: flex; flex-direction: column; min-width: 0; }
.tracy-wo-stab-row[data-pending] { opacity: 0.55; }
.tracy-wo-stab-line { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 0; }
.tracy-wo-stab-name { flex: 0 0 var(--tracy-wo-stab-name-w, 140px); min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tracy-wo-stab-link { min-width: 0; overflow: hidden; color: var(--muted-foreground); font-size: 12px; white-space: nowrap; text-overflow: ellipsis; overflow-wrap: normal; }
.tracy-wo-stab-state { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex: none; min-width: 0; margin-left: auto; padding-left: 12px; font-size: 12.5px; line-height: 1.35; text-align: right; color: var(--muted-foreground); }
.tracy-wo-stab-detail { max-width: 34ch; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: var(--muted-foreground); opacity: 0.85; }
.tracy-wo-stab-act { margin: 0; padding: 0; border: 0; background: none; color: var(--primary); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
.tracy-wo-stab-act:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 2px; }
.tracy-wo-stab-act:disabled { color: var(--muted-foreground); cursor: default; }
.tracy-wo-stab-act:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-stab-remove { display: inline-grid; place-items: center; flex: none; width: 24px; height: 24px; margin: 0; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--muted-foreground); cursor: pointer; }
.tracy-wo-stab-remove > svg { width: 14px; height: 14px; }
.tracy-wo-stab-slot { flex: none; width: 24px; height: 24px; }
/* The trash always shows (owner, #537); it turns red on hover and while its dialog is open. */
.tracy-wo-stab-remove:hover:not(:disabled), .tracy-wo-stab-remove.is-on { color: var(--destructive); background: color-mix(in oklab, var(--destructive) 10%, transparent); }
.tracy-wo-stab-remove:focus-visible { outline: none; border-color: var(--ring); }
.tracy-wo-stab-remove:disabled { cursor: default; }
.tracy-wo-stab-notice { margin: 0 0 8px; font-size: 12px; text-align: right; }
.tracy-wo-stab-foot { padding-top: 8px; }
.tracy-wo-sprog { display: inline-flex; flex: none; gap: 2px; margin-right: 8px; vertical-align: middle; }
.tracy-wo-sprog > i { width: 14px; height: 5px; border-radius: 2px; background: var(--border); }
.tracy-wo-sprog > i[data-state='collected'] { background: var(--success); }
.tracy-wo-sprog > i[data-state='reading'] { background: var(--primary); }
.tracy-wo-sprog > i[data-state='failed'] { background: var(--destructive); }
.tracy-wo-addsrc { position: relative; display: inline-flex; flex: none; }
.tracy-wo-addsrc-btn[data-on] { border-color: color-mix(in oklab, var(--primary) 45%, var(--border)); color: var(--primary); }
.tracy-wo-addsrc-pop { position: absolute; top: calc(100% + 8px); right: 0; z-index: 30; display: flex; flex-direction: column; gap: 6px; width: min(400px, calc(100vw - 32px)); padding: 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--popover, var(--card, var(--background))); color: var(--popover-foreground, var(--foreground)); box-shadow: 0 8px 24px color-mix(in oklab, var(--foreground) 14%, transparent); text-align: left; white-space: normal; cursor: default; }
.tracy-wo-addsrc-label { font-size: 12.5px; font-weight: 600; }
.tracy-wo-addsrc-pop .tracy-wo-small { margin: 0; }
.tracy-wo-addsrc-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.tracy-wo-addsrc { align-items: center; gap: 8px; }
.tracy-wo-addsrc-btnwrap { display: inline-flex; }
.tracy-wo-addsrc-field { position: relative; display: flex; align-items: center; }
.tracy-wo-addsrc-glyph { position: absolute; left: 9px; display: inline-flex; color: var(--muted-foreground); pointer-events: none; }
.tracy-wo-addsrc-field[data-glyph] .tracy-wo-addsrc-input { padding-left: 30px; }
.tracy-wo-addsrc-field[data-checking] .tracy-wo-addsrc-input { padding-right: 132px; }
.tracy-wo-addsrc-checking { position: absolute; right: 9px; display: inline-flex; align-items: center; gap: 5px; max-width: 124px; color: var(--muted-foreground); font-size: 12px; white-space: nowrap; pointer-events: none; }
.tracy-wo-addsrc-checking > span { overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-addsrc-checking svg { width: 12px; height: 12px; flex: none; }
.tracy-wo-addsrc-notice { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: min(420px, 60vw); color: var(--muted-foreground); white-space: nowrap; }
.tracy-wo-addsrc-notice[data-phase="failed"] { color: var(--destructive); }
.tracy-wo-addsrc-notice svg { flex: none; }
.tracy-wo-addsrc-notice-text { flex: none; }
.tracy-wo-addsrc-notice[data-phase="failed"] .tracy-wo-addsrc-notice-text { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-addsrc-notice-link { min-width: 0; max-width: 180px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; opacity: .8; }
@container (max-width: 760px) {
  .tracy-wo-stab { --tracy-wo-stab-name-w: 110px; }
}
@container (max-width: 560px) {
  .tracy-wo-stab-name { flex: none; }
  .tracy-wo-stab-line { flex-wrap: wrap; row-gap: 2px; }
  .tracy-wo-stab-state { flex-wrap: wrap; row-gap: 2px; }
  .tracy-wo-stab-detail { max-width: none; white-space: normal; }
  .tracy-wo-stab-link { order: 9; flex-basis: 100%; padding-left: 30px; }
}
.tracy-wo-progress { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--card, var(--background)); }
.tracy-wo-progress-steps { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.tracy-wo-progress .tracy-wo-step { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 10px; padding: 0 0 12px; }
.tracy-wo-progress .tracy-wo-step:last-child { padding-bottom: 0; }
.tracy-wo-progress .tracy-wo-step[data-state='current'] { margin: 0 -8px 12px; padding: 8px; border-radius: 8px; background: color-mix(in oklab, var(--primary) 9%, var(--background)); }
.tracy-wo-progress .tracy-wo-step[data-state='current']:last-child { margin-bottom: 0; }
.tracy-wo-step-mark { position: relative; display: flex; flex-direction: column; align-items: center; align-self: stretch; padding-top: 0; }
.tracy-wo-step-mark > .tracy-wo-step-dot { margin: 0; }
.tracy-wo-step-ln { position: absolute; top: 22px; bottom: -12px; left: 50%; width: 1.5px; transform: translateX(-50%); background: var(--border); }
.tracy-wo-progress .tracy-wo-step:last-child .tracy-wo-step-ln, .tracy-wo-progress .tracy-wo-step[data-state='current'] .tracy-wo-step-ln { display: none; }
.tracy-wo-progress .tracy-wo-step[data-state='done'] .tracy-wo-step-ln { background: var(--success); }
.tracy-wo-step-dot { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; border: 1px solid var(--border); font-size: 11px; font-weight: 600; color: var(--muted-foreground); background: var(--background); }
.tracy-wo-step-dot svg { width: 12px; height: 12px; }
.tracy-wo-step[data-state='done'] .tracy-wo-step-dot { border-color: var(--success); background: var(--success); color: var(--background); }
.tracy-wo-step[data-state='current'] .tracy-wo-step-dot { border-color: var(--primary); color: var(--primary); background: var(--background); }
.tracy-wo-step-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tracy-wo-step-name { font-size: 13px; font-weight: 600; line-height: 20px; color: var(--foreground); }
.tracy-wo-step[data-state='future'] .tracy-wo-step-name { font-weight: 500; color: var(--muted-foreground); }
.tracy-wo-step-sub { font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tracy-wo-step[data-state='done'] .tracy-wo-step-sub { color: color-mix(in oklab, var(--success) 75%, var(--foreground)); }
.tracy-wo-step[data-state='current'] .tracy-wo-step-line { color: var(--foreground); }
.tracy-wo-step[data-failed] .tracy-wo-step-line { color: var(--destructive); }
.tracy-wo-step-act { display: flex; margin-top: 8px; }
.tracy-wo-subpage { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-subpage[data-section='profile'] > .tracy-wo-psec { padding: 0; border: 0; background: transparent; }
.tracy-wo-src-logo { flex: none; display: grid; place-items: center; width: 20px; height: 20px; color: var(--muted-foreground); }
.tracy-wo-src-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; }
.tracy-wo-src-link:hover { color: var(--foreground); }
.tracy-wo-facts-act { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; border: 0; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 12px; line-height: 16px; cursor: pointer; white-space: nowrap; }
.tracy-wo-facts-act:hover:not(:disabled) { color: var(--foreground); text-decoration: underline; }
.tracy-wo-facts-act:disabled { opacity: 0.5; cursor: default; }
.tracy-wo-facts-act:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-facts-act svg { width: 12px; height: 12px; }
/* The source chip after each value (design A): small, muted, one word; the title names the source in full. */
.tracy-wo-sc { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 0 5px 0 4px; border: 1px solid var(--border); border-radius: 5px; background: var(--card, var(--background)); color: color-mix(in oklab, var(--muted-foreground) 75%, var(--card, var(--background))); font-size: 10.5px; font-weight: 400; line-height: 16px; letter-spacing: 0; white-space: nowrap; vertical-align: 1px; cursor: default; }
.tracy-wo-sc svg { flex: none; width: 10px; height: 10px; }
.tracy-wo-sc:hover { color: var(--foreground); border-color: color-mix(in oklab, var(--muted-foreground) 60%, var(--card, var(--background))); }
.tracy-wo-sc[data-word='you'] { background: var(--muted); color: var(--muted-foreground); }
.tracy-wo-sc[data-word='none'] { border-style: dashed; }
.tracy-wo-facts-bdg { position: absolute; right: 5px; bottom: 5px; z-index: 1; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; background: rgb(0 0 0 / 50%); color: white; pointer-events: auto; }
.tracy-wo-facts-bdg svg { width: 11px; height: 11px; }
.tracy-wo-facts-logo[data-neutral] { background: var(--muted); color: var(--muted-foreground); border: 1px solid var(--border); }
.tracy-wo-facts-logo img { width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-note { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid color-mix(in oklab, var(--warning) 40%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--warning) 12%, var(--background)); font-size: 12.5px; }
.tracy-wo-facts-about { margin: 0; white-space: pre-line; line-height: 1.6; overflow-wrap: anywhere; }
.tracy-wo-facts-people { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-avatar { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: color-mix(in oklab, var(--primary) 12%, var(--background)); color: var(--primary); font-weight: 600; font-size: 13px; }
.tracy-wo-facts-person { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.tracy-wo-facts-person small { font-size: 11.5px; color: var(--muted-foreground); }
.tracy-wo-facts-swatches { display: flex; flex-wrap: wrap; gap: 12px; margin: 4px 0 0; padding: 0; list-style: none; font-size: 12.5px; }
.tracy-wo-facts-swatches li { display: inline-flex; align-items: center; gap: 6px; }
.tracy-wo-facts-swatches li > span { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--border); }
.tracy-wo-facts-filters { display: flex; gap: 4px; flex: 1 1 auto; flex-wrap: wrap; justify-content: flex-end; }
.tracy-wo-facts-filters button { padding: 2px 10px; border: 0; border-radius: 999px; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 12px; cursor: pointer; }
.tracy-wo-facts-filters button[aria-pressed='true'] { background: var(--muted); color: var(--foreground); font-weight: 500; }
.tracy-wo-facts-filters button:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; }
.tracy-wo-facts-owner { position: absolute; left: 6px; bottom: 6px; }
@container (max-width: 719px) {
  .tracy-wo-details-cols { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@container (max-width: 560px) {
  .tracy-wo-media-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tracy-wo-profile-card .tracy-wo-fields > .tracy-wo-field { grid-template-columns: minmax(0, 1fr); }
}
` +
  PROGRESS_BAND_CSS +
  FACTS_BANDS_CSS +
  FACTS_OWNER_CSS +
  FACTS_SAVED_CSS +
  SUB_PAGE_HEADER_CSS +
  PAGE_HEADER_CSS

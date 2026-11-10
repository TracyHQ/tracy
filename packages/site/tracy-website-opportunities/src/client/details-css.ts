/**
 * Layout of the Details page (#517): the sticky header, the two columns of section cards (layout C), the Progress
 * card and its one line strip on a sub-page (stepper style D), the sub-page with its pager, the Demo site block and
 * the Business brief table. Scoped under `.tracy-wo-details`, reading only Tracy tokens. The
 * section card rules are repeated here so Details keeps its look when the Inspector's rules go. No backtick may appear
 * inside the template below.
 */
import { PROGRESS_BAND_CSS } from './progress-band-css.ts'
import { STEP_NODE_CSS } from './step-node-css.ts'
export const DETAILS_CSS =
  `
.tracy-wo-details { gap: 12px; }
.tracy-wo-details .tracy-wo-insp-sec { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; }
.tracy-wo-details .tracy-wo-insp-sec-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tracy-wo-details-head { position: sticky; top: 0; z-index: 4; display: flex; flex-direction: column; gap: 6px; margin: -12px -12px 0; padding: 8px 12px 10px; background: var(--background); border-bottom: 1px solid var(--border); }
.tracy-wo-details-head-top { display: flex; align-items: center; }
.tracy-wo-details-back { margin-left: -8px; }
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
.tracy-wo-psec-more { display: flex; flex-direction: column; gap: 12px; }
.tracy-wo-psec-more .tracy-wo-insp-sec { padding: 12px 0 0; border: 0; border-top: 1px solid var(--border); border-radius: 0; }
.tracy-wo-media-strip { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-media-strip .tracy-wo-tile { position: relative; border-radius: 6px; }
.tracy-wo-media-strip .tracy-wo-tile[data-video]::after { content: "\\25B6"; position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 12px; text-shadow: 0 1px 2px rgb(0 0 0 / 50%); pointer-events: none; }
.tracy-wo-media-more { display: grid; place-items: center; font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-details .tracy-wo-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-demo-block { display: flex; flex-direction: column; gap: 10px; }
.tracy-wo-demo-block-acts { gap: 6px; }
.tracy-wo-brief-table-wrap { overflow-x: auto; }
.tracy-wo-brief-table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 18px; }
.tracy-wo-brief-table th, .tracy-wo-brief-table td { text-align: left; vertical-align: top; padding: 9px 10px; border-top: 1px solid var(--border); }
.tracy-wo-brief-table thead th { border-top: 0; color: var(--muted-foreground); font-weight: 500; font-size: 12px; white-space: nowrap; }
.tracy-wo-brief-table tbody th { font-weight: 500; width: 20%; }
.tracy-wo-brief-table td:nth-child(3) { width: 24%; }
.tracy-wo-brief-table td:last-child { width: 80px; }
.tracy-wo-brief-table tr[data-off] th, .tracy-wo-brief-table tr[data-off] td { color: var(--muted-foreground); }
.tracy-wo-brief-note { display: block; margin-top: 2px; color: var(--muted-foreground); font-size: 12px; }
.tracy-wo-chip-ok { background: color-mix(in oklab, var(--success) 14%, transparent); color: color-mix(in oklab, var(--success) 70%, var(--foreground)); border-color: transparent; }
.tracy-wo-chip-brand { background: color-mix(in oklab, var(--primary) 12%, transparent); color: color-mix(in oklab, var(--primary) 80%, var(--foreground)); border-color: transparent; }
.tracy-wo-chip-bad { background: color-mix(in oklab, var(--destructive) 12%, transparent); color: var(--destructive); border-color: transparent; }
.tracy-wo-chip-mute { background: var(--muted); color: var(--muted-foreground); border-color: transparent; }
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
.tracy-wo-stab-row { display: flex; flex-direction: column; min-width: 0; border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent); }
.tracy-wo-stab-row:first-child { border-top: 0; }
.tracy-wo-stab-row[data-pending] { opacity: 0.55; }
.tracy-wo-stab-line { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 0; }
.tracy-wo-stab-name { flex: none; white-space: nowrap; }
.tracy-wo-stab-link { min-width: 0; overflow: hidden; color: var(--muted-foreground); font-size: 12px; white-space: nowrap; text-overflow: ellipsis; overflow-wrap: normal; }
.tracy-wo-stab-state { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: none; min-width: 0; margin-left: auto; padding-left: 12px; font-size: 12.5px; line-height: 1.35; text-align: right; color: var(--muted-foreground); }
.tracy-wo-stab-pill { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 2px 9px 2px 6px; border-radius: 999px; border: 1px solid var(--border); background: color-mix(in oklab, var(--foreground) 7%, transparent); color: var(--muted-foreground); font-size: 12px; line-height: 16px; font-weight: 500; white-space: nowrap; }
.tracy-wo-stab-pill[data-state='reading'] { border-color: color-mix(in oklab, var(--primary) 28%, transparent); background: color-mix(in oklab, var(--primary) 12%, transparent); color: var(--primary); font-weight: 600; }
.tracy-wo-stab-pill[data-state='collected'] { border-color: color-mix(in oklab, var(--success) 28%, transparent); background: color-mix(in oklab, var(--success) 12%, transparent); color: var(--success); }
.tracy-wo-stab-pill[data-state='failed'] { border-color: color-mix(in oklab, var(--destructive) 28%, transparent); background: color-mix(in oklab, var(--destructive) 12%, transparent); color: var(--destructive); }
.tracy-wo-stab-detail { font-size: 11.5px; color: var(--muted-foreground); opacity: 0.85; }
.tracy-wo-stab-ask { color: var(--foreground); }
.tracy-wo-stab-acts { display: inline-flex; gap: 10px; }
.tracy-wo-stab-act { margin: 0; padding: 0; border: 0; background: none; color: var(--primary); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
.tracy-wo-stab-act[data-danger] { color: var(--destructive); }
.tracy-wo-stab-act:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 2px; }
.tracy-wo-stab-act:disabled { color: var(--muted-foreground); cursor: default; }
.tracy-wo-stab-act:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-stab-remove { display: inline-grid; place-items: center; flex: none; width: 24px; height: 24px; margin: 0; padding: 0; border: 1px solid transparent; border-radius: 6px; background: none; color: var(--muted-foreground); cursor: pointer; opacity: 0; }
.tracy-wo-stab-remove > svg { width: 14px; height: 14px; }
.tracy-wo-stab-slot { flex: none; width: 24px; height: 24px; }
.tracy-wo-stab-row:hover .tracy-wo-stab-remove, .tracy-wo-stab-remove:focus-visible, .tracy-wo-stab-remove.is-on { opacity: 1; }
.tracy-wo-stab-remove:hover:not(:disabled) { color: var(--foreground); background: color-mix(in oklab, var(--muted) 60%, transparent); }
.tracy-wo-stab-remove:focus-visible { outline: none; border-color: var(--ring); }
.tracy-wo-stab-remove:disabled { cursor: default; }
@media (hover: none) { .tracy-wo-stab-remove { opacity: 1; } }
.tracy-wo-stab-notice { margin: 0 0 8px; font-size: 12px; text-align: right; }
.tracy-wo-stab-foot { border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent); padding-top: 8px; }
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
@container (max-width: 560px) {
  .tracy-wo-stab-line { flex-wrap: wrap; row-gap: 2px; }
  .tracy-wo-stab-link { order: 9; flex-basis: 100%; padding-left: 30px; }
  .tracy-wo-stab-remove { opacity: 1; }
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
.tracy-wo-progress-strip { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: color-mix(in oklab, var(--muted) 45%, var(--background)); }
.tracy-wo-progress-strip-steps { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; flex: 1 1 auto; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-progress-strip .tracy-wo-step { display: inline-flex; align-items: center; gap: 6px; }
.tracy-wo-progress-strip .tracy-wo-step-dot { width: 18px; height: 18px; font-size: 10px; }
.tracy-wo-progress-strip .tracy-wo-step-name { font-size: 12.5px; font-weight: 500; }
.tracy-wo-progress-strip .tracy-wo-step[data-state='current'] .tracy-wo-step-name { color: var(--primary); font-weight: 600; }
.tracy-wo-subpage { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-subpage-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.tracy-wo-pager { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 12px; margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border); }
.tracy-wo-pager-link { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; width: 100%; max-width: 240px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--foreground); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.tracy-wo-pager-link[data-next] { justify-self: end; align-items: flex-end; text-align: right; }
.tracy-wo-pager-link small { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; color: var(--muted-foreground); }
.tracy-wo-pager-link small svg { width: 12px; height: 12px; }
.tracy-wo-pager-link:hover { background: color-mix(in oklab, var(--foreground) 4%, var(--background)); }
.tracy-wo-pager-link:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.tracy-wo-subpage[data-section='profile'] > .tracy-wo-psec { padding: 0; border: 0; background: transparent; }
.tracy-wo-facts { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-facts-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.tracy-wo-facts-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tracy-wo-facts-card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--card, var(--background)); }
.tracy-wo-facts-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
.tracy-wo-facts-card-head > h3 { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; margin: 0; font-size: 13.5px; font-weight: 600; line-height: 20px; }
.tracy-wo-facts-card-head > button { flex: none; }
.tracy-wo-src-logo { flex: none; display: grid; place-items: center; width: 20px; height: 20px; color: var(--muted-foreground); }
.tracy-wo-src-link { color: inherit; text-decoration: underline; text-underline-offset: 2px; overflow-wrap: anywhere; }
.tracy-wo-src-link:hover { color: var(--foreground); }
.tracy-wo-facts-off { display: inline-block; margin-left: 6px; padding: 0 7px; border-radius: 999px; background: var(--muted); color: var(--muted-foreground); font-size: 11px; font-weight: 400; line-height: 16px; white-space: nowrap; }
.tracy-wo-facts-sub .tracy-wo-facts-off { margin-left: 0; }
.tracy-wo-facts-hours[data-off] { opacity: 0.6; }
.tracy-wo-facts-acts { display: inline-flex; align-items: center; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: 4px 6px; margin-left: auto; }
.tracy-wo-facts-people .tracy-wo-facts-act { margin-left: auto; }
.tracy-wo-facts-act { display: inline-flex; align-items: center; gap: 4px; padding: 2px 0; border: 0; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 12px; line-height: 16px; cursor: pointer; white-space: nowrap; }
.tracy-wo-facts-act:hover:not(:disabled) { color: var(--foreground); text-decoration: underline; }
.tracy-wo-facts-act:disabled { opacity: 0.5; cursor: default; }
.tracy-wo-facts-act:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-facts-act svg { width: 12px; height: 12px; }
.tracy-wo-facts-dot { color: var(--muted-foreground); opacity: 0.6; }
.tracy-wo-facts-aside { font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-facts-card[data-card='messages'] .tracy-wo-facts-card-head > h3 { flex: 0 1 auto; }
.tracy-wo-facts-card[data-card='messages'] .tracy-wo-facts-aside, .tracy-wo-facts-card[data-card='reviews'] .tracy-wo-facts-aside { flex: 1 1 auto; }
.tracy-wo-facts-card[data-card='reviews'] .tracy-wo-facts-card-head > h3 { flex: 0 1 auto; }
.tracy-wo-facts-card[data-card='reviews'] .tracy-wo-facts-aside { text-align: right; }
.tracy-wo-facts-cap { margin: 2px 0 0; font-size: 11.5px; line-height: 16px; color: var(--muted-foreground); }
.tracy-wo-facts-cap::before { content: ""; display: inline-block; width: 5px; height: 5px; margin-right: 6px; vertical-align: 2px; border-radius: 50%; background: color-mix(in oklab, var(--muted-foreground) 60%, transparent); }
/* The source chip after each value (design A): small, muted, one word; the title names the source in full. */
.tracy-wo-sc { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 0 5px 0 4px; border: 1px solid var(--border); border-radius: 5px; background: var(--card, var(--background)); color: color-mix(in oklab, var(--muted-foreground) 75%, var(--card, var(--background))); font-size: 10.5px; font-weight: 400; line-height: 16px; letter-spacing: 0; white-space: nowrap; vertical-align: 1px; cursor: default; }
.tracy-wo-sc svg { flex: none; width: 10px; height: 10px; }
.tracy-wo-sc:hover { color: var(--foreground); border-color: color-mix(in oklab, var(--muted-foreground) 60%, var(--card, var(--background))); }
.tracy-wo-sc[data-word='you'] { background: var(--muted); color: var(--muted-foreground); }
.tracy-wo-sc[data-word='none'] { border-style: dashed; }
.tracy-wo-facts-card-head > h3 > .tracy-wo-sc { margin-left: 0; }
.tracy-wo-facts-bdg { position: absolute; right: 5px; bottom: 5px; z-index: 1; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; background: rgb(0 0 0 / 50%); color: white; pointer-events: auto; }
.tracy-wo-facts-bdg svg { width: 11px; height: 11px; }
.tracy-wo-facts-empty { margin: 0; }
.tracy-wo-facts-edit { display: flex; flex-direction: column; gap: 10px; }
.tracy-wo-facts-field { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-facts-field > span:first-child { font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-facts-hero { display: flex; align-items: center; gap: 14px; min-width: 0; }
.tracy-wo-facts-logo { flex: none; display: grid; place-items: center; width: 56px; height: 56px; overflow: hidden; border-radius: 14px; font-size: 19px; font-weight: 700; letter-spacing: 0.02em; }
.tracy-wo-facts-logo[data-neutral] { background: var(--muted); color: var(--muted-foreground); border: 1px solid var(--border); }
.tracy-wo-facts-logo img { width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-hero-name { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-width: 0; }
.tracy-wo-facts-bn { font-size: 19px; font-weight: 600; line-height: 24px; overflow-wrap: anywhere; }
.tracy-wo-facts-sub { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; color: var(--muted-foreground); }
.tracy-wo-facts-sub b { color: var(--foreground); font-weight: 600; }
.tracy-wo-facts-stars { color: var(--warning); letter-spacing: 1px; }
.tracy-wo-facts-contacts { display: flex; flex-direction: column; margin: 4px 0 0; padding: 0; list-style: none; }
.tracy-wo-facts-contacts li { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
.tracy-wo-facts-contacts li:first-child { border-top: 0; }
.tracy-wo-facts-contacts li > .tracy-wo-icon { flex: none; box-sizing: content-box; width: 14px; height: 14px; padding: 6px; border-radius: 8px; background: var(--muted); color: var(--muted-foreground); }
.tracy-wo-facts-contacts li > span { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-top: 4px; overflow-wrap: anywhere; }
.tracy-wo-facts-block { display: block; }
.tracy-wo-facts-line { display: block; }
.tracy-wo-facts-line > * + * { margin-left: 6px; }
.tracy-wo-facts .tracy-wo-chip-warn, .tracy-wo-facts .tracy-wo-chip-ok, .tracy-wo-facts .tracy-wo-chip-mute, .tracy-wo-facts .tracy-wo-name-chip, .tracy-wo-facts .tracy-wo-edited { display: inline-flex; align-items: center; padding: 0 8px; border: 1px solid var(--border); border-radius: 999px; font-size: 11.5px; font-weight: 500; line-height: 18px; white-space: nowrap; }
.tracy-wo-facts .tracy-wo-chip-warn { border-color: transparent; background: color-mix(in oklab, var(--warning) 16%, transparent); color: color-mix(in oklab, var(--warning) 45%, var(--foreground)); }
.tracy-wo-facts .tracy-wo-chip-ok { border-color: transparent; background: color-mix(in oklab, var(--success) 14%, transparent); color: color-mix(in oklab, var(--success) 70%, var(--foreground)); }
.tracy-wo-facts .tracy-wo-chip-mute { border-color: transparent; background: var(--muted); color: var(--muted-foreground); }
.tracy-wo-facts-sub .tracy-wo-facts-act { color: var(--primary); }
.tracy-wo-facts-card[data-card='brand'] .tracy-wo-stack:has(> .tracy-wo-warn) { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.tracy-wo-facts-card[data-card='brand'] .tracy-wo-warn { color: var(--muted-foreground); font-size: 12.5px; }
.tracy-wo-facts-card[data-card='brand'] .tracy-wo-stack button, .tracy-wo-facts-card[data-card='media'] .tracy-wo-add-media button { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--foreground); font: inherit; font-size: 12px; line-height: 16px; cursor: pointer; }
.tracy-wo-facts-card[data-card='brand'] .tracy-wo-stack button:hover:not(:disabled), .tracy-wo-facts-card[data-card='media'] .tracy-wo-add-media button:hover:not(:disabled) { background: var(--muted); }
.tracy-wo-facts-card[data-card='media'] .tracy-wo-add-media button svg { width: 12px; height: 12px; }
.tracy-wo-facts-card[data-card='media'] .tracy-wo-add-media > span { font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-facts-hours { width: 100%; border-collapse: collapse; font-size: 13px; }
.tracy-wo-facts-hours th, .tracy-wo-facts-hours td { padding: 4px 0; text-align: left; vertical-align: top; border-bottom: 1px dashed var(--border); }
.tracy-wo-facts-hours tr:last-child th, .tracy-wo-facts-hours tr:last-child td { border-bottom: 0; }
.tracy-wo-facts-hours th { width: 40%; padding-right: 10px; font-weight: 400; color: var(--muted-foreground); }
.tracy-wo-facts-note { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 1px solid color-mix(in oklab, var(--warning) 40%, transparent); border-radius: 8px; background: color-mix(in oklab, var(--warning) 12%, var(--background)); font-size: 12.5px; }
.tracy-wo-facts-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-chips li { max-width: 100%; padding: 3px 11px; border: 1px solid var(--border); border-radius: 999px; background: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
.tracy-wo-facts-kv { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 0; font-size: 12.5px; }
.tracy-wo-facts-kv > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; }
.tracy-wo-facts-kv dt { color: var(--muted-foreground); }
.tracy-wo-facts-kv dd { margin: 0; }
.tracy-wo-facts-about { margin: 0; white-space: pre-line; line-height: 1.6; overflow-wrap: anywhere; }
.tracy-wo-facts-people { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-people li { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tracy-wo-facts-people li[data-off] .tracy-wo-facts-person > span { color: var(--muted-foreground); }
.tracy-wo-facts-avatar { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: color-mix(in oklab, var(--primary) 12%, var(--background)); color: var(--primary); font-weight: 600; font-size: 13px; }
.tracy-wo-facts-person { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; }
.tracy-wo-facts-person small { font-size: 11.5px; color: var(--muted-foreground); }
.tracy-wo-facts-swatches { display: flex; flex-wrap: wrap; gap: 12px; margin: 4px 0 0; padding: 0; list-style: none; font-size: 12.5px; }
.tracy-wo-facts-swatches li { display: inline-flex; align-items: center; gap: 6px; }
.tracy-wo-facts-swatches li > span { width: 16px; height: 16px; border-radius: 4px; border: 1px solid var(--border); }
.tracy-wo-facts-msgs { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; counter-reset: msg; }
.tracy-wo-facts-msgs li { counter-increment: msg; display: grid; grid-template-columns: 22px minmax(0, 1fr); column-gap: 8px; padding: 8px 0; border-top: 1px solid var(--border); }
.tracy-wo-facts-msgs li:first-child { border-top: 0; padding-top: 2px; }
.tracy-wo-facts-msgs li::before { content: counter(msg); grid-row: 1 / span 2; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--border); background: var(--muted); font-size: 11px; color: var(--muted-foreground); }
.tracy-wo-facts-msgs q { grid-column: 2; display: block; margin-top: 3px; padding-left: 8px; border-left: 2px solid var(--border); font-size: 12px; color: var(--muted-foreground); overflow-wrap: anywhere; }
.tracy-wo-facts-quotes { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.tracy-wo-facts-quotes li { display: flex; flex-direction: column; gap: 3px; padding: 8px 0; border-top: 1px solid var(--border); font-size: 12.5px; }
.tracy-wo-facts-quotes li:first-child { border-top: 0; padding-top: 0; }
.tracy-wo-facts-quotes small { font-size: 11.5px; color: var(--muted-foreground); }
.tracy-wo-facts-filters { display: flex; gap: 4px; flex: 1 1 auto; flex-wrap: wrap; justify-content: flex-end; }
.tracy-wo-facts-filters button { padding: 2px 10px; border: 0; border-radius: 999px; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 12px; cursor: pointer; }
.tracy-wo-facts-filters button[aria-pressed='true'] { background: var(--muted); color: var(--foreground); font-weight: 500; }
.tracy-wo-facts-filters button:focus-visible { outline: 1px solid var(--ring); outline-offset: 1px; }
.tracy-wo-facts-card[data-card='media'] .tracy-wo-facts-card-head { flex-wrap: wrap; }
.tracy-wo-facts-card[data-card='media'] .tracy-wo-facts-card-head > h3 { flex: 0 1 auto; }
.tracy-wo-facts-card[data-card='media'] .tracy-wo-add-media { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tracy-wo-facts-grid-media { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; margin: 4px 0 0; padding: 0; list-style: none; }
.tracy-wo-facts-grid-media > li { position: relative; aspect-ratio: 1 / 1; overflow: hidden; border-radius: 8px; background: var(--muted); }
.tracy-wo-facts-grid-media > li > a { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted-foreground); }
.tracy-wo-facts-grid-media > li > a:hover { color: var(--foreground); }
.tracy-wo-facts-grid-media > li > a svg { width: 28px; height: 28px; fill: currentColor; }
.tracy-wo-facts-grid-media .tracy-wo-add-tile, .tracy-wo-facts-grid-media .tracy-wo-add-tile > button { height: 100%; }
.tracy-wo-facts-grid-media img, .tracy-wo-facts-grid-media video { display: block; width: 100%; height: 100%; object-fit: cover; }
.tracy-wo-facts-card[data-card='brand'] .tracy-wo-row > * { max-width: 100%; white-space: normal; height: auto; }
.tracy-wo-facts-card[data-card='brand'] .tracy-wo-logo { width: 48px; height: 48px; }
.tracy-wo-facts-owner { position: absolute; left: 6px; bottom: 6px; }
.tracy-wo-add-tile { display: flex; flex-direction: column; gap: 4px; }
.tracy-wo-add-tile > button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 96px; border: 1px dashed var(--border); border-radius: 8px; background: color-mix(in oklab, var(--muted) 50%, var(--background)); color: var(--muted-foreground); font: inherit; font-size: 12.5px; cursor: pointer; }
.tracy-wo-add-tile > button:hover { color: var(--foreground); }
.tracy-wo-add-tile > button:focus-visible { outline: 1px solid var(--ring); outline-offset: -1px; }
.tracy-wo-facts-grid-media > li:first-child { background: transparent; }
.tracy-wo-facts-more > summary { cursor: pointer; color: var(--muted-foreground); }
.tracy-wo-facts-more[open] > summary { margin-bottom: 8px; }
@container (max-width: 640px) {
  .tracy-wo-facts-grid { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-facts-grid-media { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .tracy-wo-facts-kv > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
@container (max-width: 719px) {
  .tracy-wo-details-cols { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@container (max-width: 560px) {
  .tracy-wo-media-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tracy-wo-profile-card .tracy-wo-fields > .tracy-wo-field { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-pager { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .tracy-wo-pager > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; justify-self: center; }
}
` +
  STEP_NODE_CSS +
  PROGRESS_BAND_CSS

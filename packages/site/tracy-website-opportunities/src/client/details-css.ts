/**
 * Layout of the Details page (#517): the sticky header, the two columns of section cards (layout C), the Progress
 * card and its one line strip on a sub-page (stepper style D), the sub-page with its pager, the Demo site block and
 * the Business brief table. Scoped under `.tracy-wo-details`, reading only Tracy tokens. The
 * section card rules are repeated here so Details keeps its look when the Inspector's rules go. No backtick may appear
 * inside the template below.
 */
export const DETAILS_CSS = `
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
.tracy-wo-src-chip { flex: none; }
.tracy-wo-sources-at { font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-details-cols { display: grid; grid-template-columns: minmax(0, 34fr) minmax(0, 66fr); gap: 16px; align-items: start; }
.tracy-wo-open { flex: none; display: inline-flex; align-items: center; gap: 2px; padding: 0; border: 0; background: transparent; color: var(--primary); font: inherit; font-size: 12.5px; white-space: nowrap; cursor: pointer; }
.tracy-wo-open svg { width: 14px; height: 14px; }
.tracy-wo-open:hover { text-decoration: underline; text-underline-offset: 2px; }
.tracy-wo-open:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; border-radius: 2px; }
.tracy-wo-profile-card .tracy-wo-field dd > span:first-child { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.tracy-wo-profile-card .tracy-wo-fields > .tracy-wo-field { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 2px 10px; align-items: baseline; }
.tracy-wo-srcs[data-compact] { gap: 0; }
.tracy-wo-src-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 0; border: 0; border-top: 1px solid var(--border); border-radius: 0; background: transparent; }
.tracy-wo-src-line:first-child { border-top: 0; padding-top: 0; }
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
@container (max-width: 719px) {
  .tracy-wo-details-cols { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@container (max-width: 560px) {
  .tracy-wo-media-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tracy-wo-profile-card .tracy-wo-fields > .tracy-wo-field { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-pager { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .tracy-wo-pager > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; justify-self: center; }
}
`

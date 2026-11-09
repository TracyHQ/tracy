/**
 * Layout of the Details page (#517): the sticky header, the tab strip, the Demo site block and the Business brief
 * table. Scoped under `.tracy-wo-details`, reading only Tracy tokens. The section card rules are repeated here so
 * Details keeps its look when the Inspector's rules go. No backtick may appear inside the template below.
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
.tracy-wo-details-tabs { width: 100%; justify-content: flex-start; margin-bottom: -10px; }
.tracy-wo-details-tabs [data-slot='tabs-trigger'] { flex: none; padding-left: 10px; padding-right: 10px; }
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
.tracy-wo-stepper-wrap { container-type: inline-size; }
.tracy-wo-stepper { display: flex; align-items: flex-start; gap: 0; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--card, var(--background)); }
.tracy-wo-steps { display: flex; flex: 1 1 auto; min-width: 0; margin: 0; padding: 0; list-style: none; }
.tracy-wo-step { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding-right: 10px; }
.tracy-wo-step-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tracy-wo-step-dot { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 999px; corner-shape: round; border: 1px solid var(--border); font-size: 11px; font-weight: 600; color: var(--muted-foreground); background: var(--background); }
.tracy-wo-step-dot svg { width: 12px; height: 12px; }
.tracy-wo-step-ln { flex: 1 1 auto; height: 2px; border-radius: 2px; background: var(--border); }
.tracy-wo-step:last-child .tracy-wo-step-ln { display: none; }
.tracy-wo-step-name { font-size: 12.5px; font-weight: 500; color: var(--muted-foreground); }
.tracy-wo-step-sub { font-size: 11.5px; line-height: 15px; color: var(--muted-foreground); }
.tracy-wo-step[data-state='done'] .tracy-wo-step-dot { border-color: var(--success); background: var(--success); color: var(--background); }
.tracy-wo-step[data-state='done'] .tracy-wo-step-ln { background: var(--success); }
.tracy-wo-step[data-state='done'] .tracy-wo-step-name { color: var(--foreground); font-weight: 600; }
.tracy-wo-step[data-state='current'] .tracy-wo-step-dot { border-color: var(--primary); color: var(--primary); background: color-mix(in oklab, var(--primary) 10%, var(--background)); }
.tracy-wo-step[data-state='current'] .tracy-wo-step-name { color: var(--primary); font-weight: 600; }
.tracy-wo-step[data-state='current'] .tracy-wo-step-line { color: var(--foreground); }
.tracy-wo-step[data-failed] .tracy-wo-step-line { color: var(--destructive); }
.tracy-wo-stepper-act { flex: none; align-self: center; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; max-width: 280px; margin-left: 6px; padding-left: 12px; border-left: 1px solid var(--border); text-align: right; }
.tracy-wo-stepper-line { display: none; font-size: 12px; color: var(--foreground); }
@container (max-width: 620px) {
  .tracy-wo-stepper { flex-wrap: wrap; padding: 12px; }
  .tracy-wo-step { padding-right: 6px; }
  .tracy-wo-step-name { font-size: 11.5px; }
  .tracy-wo-step-line { display: none; }
  .tracy-wo-stepper-act { flex: 0 0 100%; max-width: none; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; margin: 12px 0 0; padding: 12px 0 0; border-left: 0; border-top: 1px solid var(--border); text-align: left; }
  .tracy-wo-stepper-line { display: block; flex: 1 1 180px; }
  .tracy-wo-stepper-error { flex: 1 1 100%; }
}
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
`

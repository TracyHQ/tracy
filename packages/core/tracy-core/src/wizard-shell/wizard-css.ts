/** Geometry for the approved page-per-step layout; all colours come from Tracy tokens. */
export const WIZARD_CSS = `

/* The panel is the scroller. A short step fills it; a long step grows without a nested scroll box. */
.tas-root.tas-wizard-card { display: flex; flex-direction: column; gap: 0; min-width: 0; height: auto; min-height: 100%; overflow: visible; padding-block: 24px 0; border: 0; border-radius: 0; box-shadow: none; }
/* Import keeps an existing stage wrapper around its wizard; only the inner root owns gutters. */
.tas-root:has(> .tas-root.tas-wizard-card) { padding: 0; }
.tas-root > .tas-root.tas-wizard-card { width: 100%; max-width: none; margin: 0; }
.tas-wizard-card > * { max-width: none; }
.tas-wizard-steps { flex: none; }
.tas-wizard-segments { display: flex; gap: 4px; width: 100%; }
.tas-wizard-segment { box-sizing: border-box; display: flex; align-items: center; flex: 1; min-width: 0; height: 16px; margin: 0; padding: 6px 0; border: 0; border-radius: 999px; background: transparent; box-shadow: none; }
.tas-wizard-segment > span { display: block; flex: 1; height: 4px; border-radius: 999px; background: color-mix(in oklab, var(--foreground) 10%, transparent); }
[data-ds-dark-theme] .tas-wizard-segment > span { background: color-mix(in oklab, var(--foreground) 14%, transparent); }
.tas-wizard-segment[data-active] > span { background: var(--primary); }
.tas-wizard-segment:enabled { cursor: pointer; }
.tas-wizard-segment:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
/* The button adds 6px below the visible bar; 4px more makes the metadata gap 10px. */
.tas-wizard-position { display: flex; align-items: baseline; gap: 8px; margin-top: 4px; font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tas-wizard-position b { font-weight: 500; color: var(--foreground); }
.tas-wizard-body { flex: 1 0 auto; min-width: 0; padding-block: 18px 24px; }
.tas-wizard-body > * { min-width: 0; width: 100%; max-width: 720px; }
.tas-wizard-card[data-wizard-step="design"] .tas-wizard-inline,
.tas-wizard-card[data-wizard-step="system"] .tas-wizard-inline { max-width: none; }
.tas-wizard-head { margin-bottom: 20px; }
.tas-wizard-title { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.25; letter-spacing: -0.01em; color: var(--foreground); }
.tas-wizard-title:focus { outline: none; }
.tas-wizard-desc { margin: 6px 0 0; font-size: 13px; line-height: 1.45; color: var(--muted-foreground); }
.tas-wizard-card > .tas-wizard-footer { position: sticky; bottom: 0; z-index: 4; flex: none; display: flex; align-items: center; gap: 8px; width: 100%; margin: auto 0 0; padding: 14px 16px 16px; border-top: 1px solid var(--border); background: var(--card); }
.tas-wizard-footer [data-slot="button"] { min-width: 0; white-space: nowrap; }
@container (min-width: 600px) {
  .tas-wizard-card > .tas-wizard-footer { padding-inline: 24px; }
}
@container (min-width: 900px) {
  .tas-wizard-card > .tas-wizard-footer { padding-inline: 32px; }
}
@container (max-width: 479px) {
  .tas-wizard-footer [data-slot="button"] { flex-shrink: 1; padding-inline: 10px; }
  .tas-wizard-card > .tas-wizard-footer, .tas-wizard-footer .tas-wizard-answered { font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tas-wizard-actions { gap: 4px; }
}
.tas-wizard-answered { font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tas-wizard-actions { min-width: 0; margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tas-wizard-inline [data-ask-layout="sections"] { padding: 0; }
.tas-wizard-inline .tas-ds-body { overflow: visible; padding: 8px 0 0; }
.tas-wizard-inline .tas-ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.tas-wizard-inline .tas-ds-card > span:first-child { width: 100%; height: auto; aspect-ratio: 16 / 10; }
.tas-wizard-inline .tas-ds-card [title] { font-size: 13px; font-weight: 500; line-height: 18px; }
.tas-wizard-inline .tas-ds-card [title] + span { font-size: 12px; line-height: 16px; }
.tas-gallery-preview button:focus-visible { outline: 1px solid var(--ring); outline-offset: 2px; }
.tas-wizard-inline .tas-ds-dot { width: 10px; height: 10px; }
.tas-wizard-inline [data-design-system-filter] [data-slot="input-group"] { min-width: 200px; }
.tas-wizard-inline .tas-ds-tools { padding: 0 0 8px; background: var(--card); }
/* Approved Customize and Review use the same readable content width and heading rhythm. */
.tas-wizard-card:is([data-wizard-step="customize"], [data-wizard-step="review"]) .tas-wizard-body > * { max-width: 760px; }
.tas-wizard-card:is([data-wizard-step="customize"], [data-wizard-step="review"]) .tas-wizard-head { margin-bottom: 22px; }
.tas-wizard-card:is([data-wizard-step="customize"], [data-wizard-step="review"]) .tas-wizard-desc { margin-top: 4px; line-height: 19px; }
.tas-wizard-card:is([data-wizard-step="customize"], [data-wizard-step="review"]) .tas-wizard-footer [data-slot="button"],
.tas-create-actions [data-slot="button"] { height: 36px; border-radius: 8px; }
@container (max-width: 479px) {
  .tas-wizard-answered { max-width: 90px; }
}
.tas-wizard-count { margin: 18px 0 0; font-size: 12px; color: var(--muted-foreground); }
`

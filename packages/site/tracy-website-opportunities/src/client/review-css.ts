/**
 * The seller's review steps on Details (#537): the Progress band (step list on the left, the current step on the
 * right, stacked on a narrow page), the sticky approval footer of the Profile and Business brief sub-pages, the
 * Add source form, the Add more upload, the Photos & video strip at the foot of the Profile card, and the Your site
 * block's waiting line. Reads only Tracy tokens. No backtick may appear inside the template below.
 */
export const REVIEW_CSS = `
.tracy-wo-band { display: grid; grid-template-columns: minmax(0, 34fr) minmax(0, 66fr); gap: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--card, var(--background)); overflow: hidden; }
.tracy-wo-band-list { display: flex; flex-direction: column; margin: 0; padding: 14px 16px; list-style: none; border-right: 1px solid var(--border); }
.tracy-wo-band .tracy-wo-step { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: start; gap: 10px; padding: 0 0 14px; }
.tracy-wo-band .tracy-wo-step:last-child { padding-bottom: 0; }
.tracy-wo-band .tracy-wo-step:last-child .tracy-wo-step-ln { display: none; }
.tracy-wo-band .tracy-wo-step[data-state='done'] .tracy-wo-step-ln { background: var(--success); }
.tracy-wo-band .tracy-wo-step-ln { bottom: -14px; }
.tracy-wo-band .tracy-wo-step[data-review] .tracy-wo-step-dot { border-color: var(--warning); color: color-mix(in oklab, var(--warning) 55%, var(--foreground)); }
.tracy-wo-band .tracy-wo-step[data-failed] .tracy-wo-step-dot { border-color: var(--destructive); color: var(--destructive); }
.tracy-wo-band .tracy-wo-step-sub[data-tone='ok'] { color: color-mix(in oklab, var(--success) 75%, var(--foreground)); }
.tracy-wo-band .tracy-wo-step-sub[data-tone='warn'] { color: color-mix(in oklab, var(--warning) 45%, var(--foreground)); font-weight: 500; }
.tracy-wo-band .tracy-wo-step-sub[data-tone='run'] { color: var(--primary); }
.tracy-wo-band .tracy-wo-step-sub[data-tone='error'] { color: var(--destructive); }
.tracy-wo-band .tracy-wo-step-sub[data-tone='mute'] { color: var(--muted-foreground); }
.tracy-wo-band-lock { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; line-height: 16px; color: var(--muted-foreground); }
.tracy-wo-band-lock .tracy-wo-icon { width: 12px; height: 12px; flex: none; }
.tracy-wo-band-stale { align-self: flex-start; margin-top: 4px; }
.tracy-wo-review-badge { align-self: flex-start; }
.tracy-wo-chip-warn { background: color-mix(in oklab, var(--warning) 16%, transparent); color: color-mix(in oklab, var(--warning) 45%, var(--foreground)); border-color: transparent; }
.tracy-wo-band-pane { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 14px 16px; background: color-mix(in oklab, var(--primary) 5%, var(--card, var(--background))); }
.tracy-wo-band-pane[data-review] { background: color-mix(in oklab, var(--warning) 8%, var(--card, var(--background))); }
.tracy-wo-band-kicker { font-size: 11.5px; font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; color: var(--muted-foreground); }
.tracy-wo-band-name { margin: 0; font-size: 16px; font-weight: 600; line-height: 22px; }
.tracy-wo-band-line { margin: 0; font-size: 13px; line-height: 19px; color: var(--foreground); }
.tracy-wo-band-running { display: flex; align-items: center; gap: 8px; margin: 4px 0 0; font-size: 13px; color: var(--muted-foreground); }
.tracy-wo-band-subs { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 0; padding: 0; list-style: none; font-size: 13px; }
.tracy-wo-band-subs li { display: flex; align-items: center; gap: 8px; }
.tracy-wo-band-subs li[data-state='done'] .tracy-wo-icon { color: var(--success); }
.tracy-wo-band-subs li[data-state='failed'] .tracy-wo-icon, .tracy-wo-band-subs li[data-state='failed'] .tracy-wo-band-sub-state { color: var(--destructive); }
.tracy-wo-band-subs li[data-state='waiting'] { color: var(--muted-foreground); }
.tracy-wo-band-sub-state { margin-left: auto; font-size: 12px; color: var(--muted-foreground); }
.tracy-wo-band-build .tracy-wo-progress { padding: 0; border: 0; background: transparent; }
.tracy-wo-band-acts { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: auto; padding-top: 10px; }
.tracy-wo-approve-end { height: 1px; }
.tracy-wo-approve { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 16px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--background); box-shadow: 0 -6px 12px -10px color-mix(in oklab, var(--foreground) 30%, transparent); }
.tracy-wo-approve-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1 1 260px; }
.tracy-wo-approve-hint { margin: 0; font-size: 13px; font-weight: 500; }
.tracy-wo-approve-acts { display: flex; gap: 8px; flex: none; margin-left: auto; }
.tracy-wo-add-source { align-self: flex-start; }
.tracy-wo-add-source-form { display: flex; flex-direction: column; gap: 6px; padding: 10px 0 0; border-top: 1px solid var(--border); }
.tracy-wo-add-source-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tracy-wo-add-source-row > input { flex: 1 1 220px; min-width: 0; }
.tracy-wo-add-media { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tracy-wo-profile-media { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border); }
.tracy-wo-profile-media-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.tracy-wo-profile-media-head > span { font-size: 12.5px; color: var(--muted-foreground); }
.tracy-wo-profile-media .tracy-wo-media-strip { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.tracy-wo-media-section { display: flex; flex-direction: column; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); scroll-margin-top: 80px; }
.tracy-wo-media-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.tracy-wo-media-section-head h3 { margin: 0; font-size: 14px; font-weight: 600; }
.tracy-wo-site-wait { margin: 0; display: flex; align-items: center; gap: 8px; color: var(--muted-foreground); }
.tracy-wo-site-wait .tracy-wo-icon { flex: none; }
.tracy-wo-details-chip { flex: none; }
.tracy-wo-subpage-acts { margin-left: auto; }
.tracy-wo-subpage-acts:has(form) { flex: 1 1 100%; margin-left: 0; }
@container (max-width: 719px) {
  .tracy-wo-band { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-band-list { border-right: 0; border-bottom: 1px solid var(--border); }
}
@container (max-width: 560px) {
  .tracy-wo-approve-acts { width: 100%; }
  .tracy-wo-approve-acts > :last-child { flex: 1 1 auto; }
  .tracy-wo-profile-media .tracy-wo-media-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`

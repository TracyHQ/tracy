/**
 * The brief view (#520) and the Site name on Tracy row (#519): the understanding cards in a two column grid (one on a
 * narrow tab), the Full brief control, and the inline name editor. Then the Site content brief checklist (#537,
 * option E, `brief-checklist.tsx`): a rail of five steps beside one step's pane, the rail above the pane under 900px
 * of content column. Reads only Tracy tokens. No backtick may appear inside the template below.
 */
export const BRIEF_VIEW_CSS = `
.tracy-wo-understands .tracy-wo-page-head { margin: 0; }
.tracy-wo-brief-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.tracy-wo-brief-card { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); }
.tracy-wo-brief-card h3 { margin: 0; font-size: 13px; font-weight: 600; }
.tracy-wo-brief-card ul { margin: 0; padding-left: 18px; list-style: disc; font-size: 13px; line-height: 18px; }
.tracy-wo-brief-card li { margin: 2px 0; overflow-wrap: anywhere; }
.tracy-wo-brief-full { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.tracy-wo-brief-full > summary { cursor: pointer; font-size: 13px; font-weight: 500; }
.tracy-wo-brief-full[open] > summary { margin-bottom: 8px; }
.tracy-wo-site-name input { max-width: 260px; }
.tracy-wo-site-name .tracy-wo-site-name-edit { height: auto; padding: 0; }
.tracy-wo-brief-check { container: wo-brief / inline-size; display: flex; flex-direction: column; gap: 10px; margin-top: 10px; }
.tracy-wo-brief-locked { margin: 0; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--muted); color: var(--foreground); font-size: 13px; line-height: 19px; }
.tracy-wo-brief-wrap { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 12px; align-items: start; }
.tracy-wo-brief-rail, .tracy-wo-brief-pane { border: 1px solid var(--border); border-radius: 12px; background: var(--card); }
.tracy-wo-brief-rail { padding: 8px; }
.tracy-wo-brief-rail h4 { margin: 4px 8px 8px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted-foreground); }
.tracy-wo-brief-rail ol { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-brief-st { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted-foreground); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.tracy-wo-brief-st:hover { background: color-mix(in oklab, var(--foreground) 4%, transparent); color: var(--foreground); }
.tracy-wo-brief-st:focus-visible { outline: none; border-color: var(--ring); }
.tracy-wo-brief-st[aria-current='step'] { background: color-mix(in oklab, var(--primary) 10%, transparent); color: var(--foreground); font-weight: 600; }
.tracy-wo-brief-ck { display: grid; place-items: center; flex: none; width: 18px; height: 18px; border: 1.5px solid var(--border); border-radius: 50%; font-size: 10px; font-weight: 700; line-height: 1; }
.tracy-wo-brief-ck svg { width: 10px; height: 10px; }
.tracy-wo-brief-st[aria-current='step'] .tracy-wo-brief-ck { border-color: var(--primary); color: var(--primary); }
.tracy-wo-brief-st[data-done] .tracy-wo-brief-ck { border-color: transparent; background: color-mix(in oklab, var(--success) 16%, transparent); color: color-mix(in oklab, var(--success) 70%, var(--foreground)); }
.tracy-wo-brief-nm { flex: 1; min-width: 0; line-height: 17px; }
.tracy-wo-brief-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tracy-wo-brief-foot { display: flex; flex-direction: column; gap: 6px; margin: 10px 6px 4px; padding-top: 10px; border-top: 1px solid var(--border); }
.tracy-wo-brief-foot .tracy-wo-approve { display: flex; flex-direction: column; align-items: stretch; gap: 6px; }
.tracy-wo-brief-foot .tracy-wo-approve-btn, .tracy-wo-brief-foot .tracy-wo-approve button { display: flex; width: 100%; justify-content: center; }
.tracy-wo-brief-foot small { color: var(--muted-foreground); font-size: 12px; text-align: center; }
.tracy-wo-brief-pane { overflow: hidden; }
.tracy-wo-brief-ph { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.tracy-wo-brief-ph h3 { margin: 0; font-size: 14px; font-weight: 600; }
.tracy-wo-brief-count { display: inline-flex; align-items: center; padding: 0 9px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted-foreground); font-size: 11.5px; font-weight: 500; line-height: 20px; white-space: nowrap; }
.tracy-wo-brief-ph .tracy-wo-brief-edit { margin-left: auto; }
.tracy-wo-brief-edit { display: inline-flex; align-items: center; gap: 4px; padding: 0 2px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: var(--primary); font: inherit; font-size: 12px; font-weight: 500; line-height: 20px; white-space: nowrap; cursor: pointer; }
.tracy-wo-brief-edit:hover { text-decoration: underline; }
.tracy-wo-brief-edit:focus-visible { outline: none; border-color: var(--ring); }
.tracy-wo-brief-edit svg { width: 12px; height: 12px; }
.tracy-wo-brief-it { display: grid; grid-template-columns: 140px minmax(0, 1fr) auto auto 34px; gap: 10px; align-items: start; padding: 8px 14px; border-top: 1px solid color-mix(in oklab, var(--border) 70%, transparent); font-size: 13px; }
.tracy-wo-brief-items > .tracy-wo-brief-it:first-child { border-top: 0; }
.tracy-wo-brief-it-lab { font-weight: 500; line-height: 20px; }
.tracy-wo-brief-it-v { display: flex; flex-direction: column; gap: 3px; min-width: 0; line-height: 20px; overflow-wrap: anywhere; white-space: pre-line; }
.tracy-wo-brief-it[data-off] .tracy-wo-brief-it-lab, .tracy-wo-brief-it[data-off] .tracy-wo-brief-it-v > span:first-child { color: var(--muted-foreground); }
.tracy-wo-brief-it .tracy-wo-brief-note { margin-top: 0; white-space: normal; }
.tracy-wo-brief-off { align-self: flex-start; padding: 0 8px; border-radius: 10px; background: color-mix(in oklab, var(--warning) 16%, transparent); color: color-mix(in oklab, var(--warning) 45%, var(--foreground)); font-size: 11.5px; font-weight: 500; line-height: 18px; white-space: normal; }
.tracy-wo-brief-src { display: inline-flex; align-items: center; padding: 0 7px; border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--muted-foreground); font-size: 11px; font-weight: 500; line-height: 18px; white-space: nowrap; }
.tracy-wo-brief-it > span:nth-child(3) { padding-top: 1px; }
.tracy-wo-brief-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; font-size: 12px; line-height: 17px; white-space: normal; }
.tracy-wo-brief-days b { display: block; overflow: hidden; color: var(--muted-foreground); font-size: 10.5px; font-weight: 500; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
.tracy-wo-brief-tiles { display: flex; flex-wrap: wrap; gap: 5px; }
.tracy-wo-brief-tiles img { width: 42px; height: 42px; border-radius: 6px; object-fit: cover; background: var(--muted); }
.tracy-wo-brief-brand { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tracy-wo-brief-logo { width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 8px; object-fit: contain; background: var(--muted); }
.tracy-wo-brief-swatch { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
.tracy-wo-brief-swatch i { display: inline-block; width: 14px; height: 14px; border: 1px solid var(--border); border-radius: 4px; }
.tracy-wo-brief-empty { margin: 0; padding: 12px 14px; }
.tracy-wo-brief-pf { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--border); background: var(--muted); font-size: 13px; }
.tracy-wo-brief-sp { margin-left: auto; }
@container wo-brief (max-width: 899px) {
  .tracy-wo-brief-wrap { grid-template-columns: minmax(0, 1fr); }
  .tracy-wo-brief-rail { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .tracy-wo-brief-rail h4 { display: none; }
  .tracy-wo-brief-rail ol { flex-direction: row; flex-wrap: wrap; gap: 4px 6px; }
  .tracy-wo-brief-st { width: auto; padding: 4px 8px; border-color: var(--border); }
  .tracy-wo-brief-foot { flex-direction: row; align-items: center; margin: 0 0 0 auto; padding: 0; border: 0; }
  .tracy-wo-brief-foot .tracy-wo-approve-btn, .tracy-wo-brief-foot .tracy-wo-approve button { width: auto; }
  .tracy-wo-brief-foot small { white-space: nowrap; }
  .tracy-wo-brief-it { grid-template-columns: 120px minmax(0, 1fr) auto auto 34px; }
  .tracy-wo-brief-tiles img:nth-child(n + 6) { display: none; }
  .tracy-wo-brief-days { grid-template-columns: repeat(4, minmax(0, 1fr)); row-gap: 6px; }
}
@container wo-brief (max-width: 560px) {
  .tracy-wo-brief-it { grid-template-columns: minmax(0, 1fr) auto 34px; }
  .tracy-wo-brief-it-lab { grid-column: 1 / -1; }
  .tracy-wo-brief-it > span:nth-child(3) { display: none; }
}
`

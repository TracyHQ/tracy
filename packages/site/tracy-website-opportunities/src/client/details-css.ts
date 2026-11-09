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
`

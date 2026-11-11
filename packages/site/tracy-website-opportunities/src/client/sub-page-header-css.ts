/**
 * The header of a Details sub-page (`sub-page-header.tsx`, #537): one title row and the thin three step progress
 * line under it. Tracy tokens only: the brand terracotta is --primary. No backtick may appear inside the template.
 */
export const SUB_PAGE_HEADER_CSS = `
.tracy-wo-subhead { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.tracy-wo-subhead-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tracy-wo-subhead-back { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: var(--muted); color: var(--foreground); cursor: pointer; }
.tracy-wo-subhead-back svg { width: 18px; height: 18px; }
.tracy-wo-subhead-back:hover { background: color-mix(in oklab, var(--foreground) 10%, var(--muted)); }
.tracy-wo-subhead-back:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.tracy-wo-subhead-title { margin: 0; font-size: 22px; line-height: 30px; font-weight: 600; white-space: nowrap; flex: none; }
.tracy-wo-subhead-chip { flex: none; display: inline-flex; align-items: center; padding: 0 9px; border: 1px solid var(--border); border-radius: 999px; background: var(--background); font-size: 11.5px; line-height: 20px; font-weight: 500; color: var(--muted-foreground); white-space: nowrap; }
.tracy-wo-subhead-count { flex: none; font-size: 12.5px; color: var(--muted-foreground); white-space: nowrap; }
.tracy-wo-subhead-acts { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-left: auto; min-width: 0; }
.tracy-wo-subhead-acts:empty { display: none; }
.tracy-wo-subhead-error { margin: 0; text-align: right; }
.tracy-wo-subhead-line { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 0; padding: 0; list-style: none; }
.tracy-wo-subhead-seg { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.tracy-wo-subhead-bar { display: block; height: 4px; border-radius: 2px; background: color-mix(in oklab, var(--foreground) 14%, var(--background)); }
.tracy-wo-subhead-label { display: flex; align-items: center; gap: 5px; font-size: 11.5px; line-height: 16px; color: color-mix(in oklab, var(--muted-foreground) 80%, var(--background)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tracy-wo-subhead-label svg { flex: none; width: 11px; height: 11px; color: var(--primary); }
.tracy-wo-subhead-seg[data-state='done'] .tracy-wo-subhead-bar { background: color-mix(in oklab, var(--primary) 40%, var(--background)); }
.tracy-wo-subhead-seg[data-state='done'] .tracy-wo-subhead-label { color: var(--muted-foreground); }
.tracy-wo-subhead-seg[data-state='current'] .tracy-wo-subhead-bar { background: var(--primary); }
.tracy-wo-subhead-seg[data-state='current'] .tracy-wo-subhead-label { color: var(--foreground); font-weight: 600; }
.tracy-wo-approve { display: flex; align-items: center; justify-content: flex-end; gap: 10px; min-width: 0; }
.tracy-wo-approve > p { margin: 0; min-width: 0; text-align: right; }
.tracy-wo-approve > button { flex: none; }
@container (max-width: 820px) {
  .tracy-wo-approve > p[data-note='hint'] { display: none; }
}
`

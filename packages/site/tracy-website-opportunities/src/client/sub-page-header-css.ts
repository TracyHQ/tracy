/**
 * The header of a Details sub-page (`sub-page-header.tsx`, #537): one title row and the one line description under
 * it. Tracy tokens only: the brand terracotta is --primary. No backtick may appear inside the template.
 */
export const SUB_PAGE_HEADER_CSS = `
.tracy-wo-subhead { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tracy-wo-subhead-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.tracy-wo-subhead-back { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%; background: var(--muted); color: var(--foreground); cursor: pointer; }
.tracy-wo-subhead-back svg { width: 18px; height: 18px; }
.tracy-wo-subhead-back:hover { background: color-mix(in oklab, var(--foreground) 10%, var(--muted)); }
.tracy-wo-subhead-back:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.tracy-wo-subhead-title { margin: 0; font-size: 22px; line-height: 30px; font-weight: 600; white-space: nowrap; flex: none; }
.tracy-wo-subhead-acts { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-left: auto; min-width: 0; }
.tracy-wo-subhead-acts:empty { display: none; }
.tracy-wo-subhead-desc { margin: 0 0 0 46px; font-size: 13px; line-height: 20px; color: var(--muted-foreground); }
.tracy-wo-subhead-error { margin: 0; text-align: right; }
.tracy-wo-approve { display: flex; align-items: center; justify-content: flex-end; gap: 10px; min-width: 0; }
.tracy-wo-approve > p { margin: 0; min-width: 0; text-align: right; }
.tracy-wo-approve > button { flex: none; }
`

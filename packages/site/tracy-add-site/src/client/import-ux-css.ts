/** The approved import panel's typography, markers and spacing, scoped away from create-site UI. */
export const IMPORT_UX_CSS = `
.tas-root[data-import-ux] {
  --card: #fff; --card-foreground: #0a0a0a; --foreground: #0a0a0a;
  --muted-foreground: #737373; --border: #e5e5e5; --input: #e5e5e5;
  --destructive: #e7000b; --warning: #9a6a00; --success: #2f7d4f;
  --import-input-background: transparent; --import-success-background: #eef7f1; --import-info: #2f5f9a;
  font-size: 14px; line-height: 1.45; background: var(--card);
}
[data-ds-dark-theme] .tas-root[data-import-ux], .dark .tas-root[data-import-ux],
:root[data-theme="dark"] .tas-root[data-import-ux] {
  --card: #181818; --card-foreground: #f2f2f2; --foreground: #f2f2f2;
  --muted-foreground: #a1a1a1; --border: #2c2c2c; --input: #2c2c2c;
  --destructive: #ff6467; --warning: #e2b44d; --success: #6cc58f;
  --import-input-background: #212121; --import-success-background: #16261c; --import-info: #7fa8e0;
}
.tas-root[data-import-ux] [data-slot="button"] { height: 32px; padding: 0 12px; border-radius: 10px; font-size: 14px; font-weight: 500; line-height: 1.45; }
.tas-root[data-import-ux] [data-slot="button"]:not(.bg-primary) { background: var(--card); border-color: var(--border); }
.tas-root[data-import-ux] [data-slot="button"][data-selected="1"] { border-color: var(--primary); background: color-mix(in oklab, var(--primary) 12%, var(--card)); }
.tas-root[data-import-ux] [data-slot="button"][data-selected] { height: 28px; padding: 0 10px; border-radius: 6px; font-weight: 400; }
.tas-root[data-import-ux] [data-slot="button"]:disabled { opacity: .45; }
.tas-root[data-import-ux] [role="radiogroup"] > label { border-radius: 10px; }
.tas-root[data-import-ux] [role="radio"] { border-radius: 50%; width: 16px; height: 16px; background: transparent; }
.tas-root[data-import-ux] [role="radio"] > span { border-radius: 50%; }
/* dsh applies superellipses globally; circular controls must opt out explicitly. */
.tas-root[data-import-ux], .tas-root[data-import-ux] *,
.tas-root[data-import-ux] *::before, .tas-root[data-import-ux] *::after { corner-shape: round; }
.tas-root[data-import-ux] [role="radiogroup"] > label > span > .text-xs { line-height: 1.45; }
.tas-root[data-import-ux] [data-import-way] > label > span > span:first-child { font-weight: 400; }
.tas-root[data-import-ux] > [role="radiogroup"] > label:first-of-type > span > span:first-child { color: var(--primary); }
.tas-root[data-import-ux] input:not([type="checkbox"], [type="radio"]) { height: 32px; border-radius: 10px; padding: 5px 10px; font-size: 14px; line-height: 1.45; background: var(--import-input-background); }
.tas-root[data-import-ux] input[aria-invalid="true"]:not(:focus-visible) { border-color: var(--border); box-shadow: 0 0 0 3px color-mix(in oklab, var(--destructive) 15%, transparent); }
.tas-root[data-import-ux] a:not([data-slot="button"]) { text-decoration: none; }
.tas-root[data-import-ux] a:not([data-slot="button"]):hover { text-decoration: underline; }
.tas-root[data-import-ux] [data-import-fields],
.tas-root[data-import-ux] [data-import-fields] > .grid > .flex { gap: 6px; }
.tas-root[data-import-ux] [data-import-fields] > .relative + [data-import-problem] { margin-top: 4px; }
.tas-root[data-import-ux] [data-import-fields] > div.grid { margin-top: 8px; }
.tas-root[data-import-ux] [data-import-fields] label,
.tas-root[data-import-ux] [data-import-fields] > .text-xs { line-height: 1.45; }
.tas-root[data-import-ux] [data-import-fields] label:has([role="checkbox"]) { margin-top: 4px; gap: 6px; }
.tas-root[data-import-ux] [role="checkbox"] { width: 14px; height: 14px; border-radius: 4px; }
.tas-root[data-import-ux] [data-import-preflight] { gap: 2px 14px; margin-top: 0; }
.tas-root[data-import-ux] [data-import-preflight] > li { gap: 6px; padding: 1px 0; line-height: 1.45; }
.tas-root[data-import-ux] [data-import-preflight] [data-state="ok"] { color: var(--foreground); }
.tas-root[data-import-ux] [data-import-preflight] [data-state="ok"] > svg,
.tas-root[data-import-ux] [data-preflight-icon="ok"] { color: var(--success); }
.tas-root[data-import-ux] [data-import-preflight] [data-state="warning"],
.tas-root[data-import-ux] [data-import-problem] > [data-severity="warning"],
.tas-root[data-import-ux] [data-preflight-icon="warning"] { color: var(--warning); }
.tas-root[data-import-ux] [data-import-preflight] [data-state="info"],
.tas-root[data-import-ux] [data-preflight-icon="info"],
.tas-root[data-import-ux] [data-import-problem] > [data-severity="info"] { color: var(--import-info); }
.tas-root[data-import-ux] [data-import-problem] > [role] { gap: 6px; line-height: 1.45; }
.tas-root[data-import-ux] .tas-import-head { display: flex; align-items: center; justify-content: space-between; height: auto; min-height: 0; padding: 7px 10px; font-size: 12px; font-weight: 400; line-height: 1.45; color: color-mix(in oklab, var(--foreground) 80%, transparent); }
.tas-root[data-import-ux] .tas-import-title { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 400; line-height: 1.45; color: inherit; }
.tas-root[data-import-ux] .tas-import-title > svg { color: var(--warning); }
.tas-root[data-import-ux] .tas-import-head > svg { color: var(--muted-foreground); }
.tas-root[data-import-ux] .tas-import-body { padding: 0 10px 9px; font-size: 12px; font-weight: 400; line-height: 1.5; color: var(--muted-foreground); }
.tas-root[data-import-ux] .tas-import-body > p { margin: 0 0 4px; }
.tas-root[data-import-ux] .tas-import-body > p:last-child { margin-bottom: 0; }
.tas-root[data-import-ux] .tas-import-body ol, .tas-root[data-import-ux] .tas-import-body ul { margin: 0; padding-left: 16px; }
.tas-root[data-import-ux] .tas-import-body li { margin: 0; }
.tas-root[data-import-ux] .tas-import-body li + li { margin-top: 2px; }
.tas-root[data-import-ux] .tas-import-body strong { color: var(--foreground); font-weight: 500; }
.tas-root[data-import-ux] .tas-import-body details { margin-top: 6px; color: var(--muted-foreground); }
.tas-root[data-import-ux] .tas-import-body summary { color: var(--muted-foreground); }
.tas-root[data-import-ux] .tas-import-body details ol { margin-top: 4px; }
.tas-root[data-import-ux] .tas-import-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
.tas-root[data-import-ux] [data-import-problem] [data-slot="button"] { display: inline-flex; align-items: center; height: 26px; padding: 0 9px; border-radius: 8px; font-size: 12px; font-weight: 500; text-decoration: none; }
.tas-root[data-import-ux] [data-import-problem] a[data-slot="button"] { color: var(--foreground); }
.tas-root[data-import-ux] [data-import-problem] a[data-slot="button"].bg-primary { color: var(--primary-foreground); }
.tas-root[data-import-ux] [data-import-progress] { gap: 0; margin-top: 0; }
.tas-root[data-import-ux] [data-import-progress] + [data-import-problem] { margin-top: 4px; }
.tas-root[data-import-ux] > [data-import-problem] { margin-top: 6px; }
.tas-root[data-import-ux] [data-import-problem="p52"] { margin-top: 6px; }
.tas-root[data-import-ux] [data-import-progress] > li { gap: 6px; padding: 1px 0; line-height: 1.45; }
.tas-root[data-import-ux] [data-import-step][data-state="done"] { color: var(--foreground); }
.tas-root[data-import-ux] [data-import-marker] { display: grid; place-items: center; flex: none; width: 14px; height: 14px; border-radius: 50%; font-size: 9px; font-weight: 700; }
.tas-root[data-import-ux] [data-state="done"] > [data-import-marker] { background: var(--import-success-background); color: var(--success); }
.tas-root[data-import-ux] [data-state="failed"] > [data-import-marker] { background: var(--destructive); color: var(--primary-foreground); }
.tas-root[data-import-ux] [data-state="pending"] > [data-import-marker] { border: 1.5px solid var(--border); }
.tas-root[data-import-ux] [data-state="running"] > [data-import-marker] { border: 2px solid var(--primary); border-right-color: transparent; animation: tas-import-spin 1s linear infinite; }
.tas-root[data-import-ux]:has([data-import-problem="p52"]) > [role="radiogroup"],
.tas-root[data-import-ux]:has([data-import-problem="p52"]) > [data-slot="separator"] { display: none; }
@keyframes tas-import-spin { to { transform: rotate(360deg); } }
`

// Stylesheet of report.html (light + dark).
export const CSS = `
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e2e1dc;--ok:#1f8a4c;--bad:#c62828;--warn:#b26a00;--core:#7a7a7a;--chip:#efeee9}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#151514;--card:#1e1e1c;--fg:#ecebe6;--muted:#a3a29b;--line:#34332f;--ok:#4cc27e;--bad:#ff6b6b;--warn:#f0a63a;--core:#9a9a9a;--chip:#2a2a27}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1500px;margin:0 auto;padding:24px 16px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 10px}
.muted{color:var(--muted)}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:10px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.kpi b{display:block;font-size:24px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.chip{display:inline-block;padding:0 7px;border-radius:9px;background:var(--chip);font-size:12px;white-space:nowrap}
.c-a,.c-b,.c-d{color:#fff}.c-a{background:#c62828}.c-b{background:#8e24aa}.c-d{background:#455a64}.c-c{background:var(--chip);color:var(--muted)}
.ok{color:var(--ok)}.bad{color:var(--bad)}
details.page{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:10px 0}
details.page>summary{cursor:pointer;padding:10px 14px;list-style:none;display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
details.page>summary::-webkit-details-marker{display:none}.pbody{padding:0 14px 14px}
.split{display:grid;grid-template-columns:minmax(0,560px) minmax(0,1fr);gap:16px}@media(max-width:900px){.split{grid-template-columns:1fr}}
.shot{position:relative;border:1px solid var(--line);align-self:start}.shot img{display:block;width:100%;height:auto}
.shot svg{position:absolute;inset:0;width:100%;height:100%}
.holes{font-size:13px}.holes li{margin:0 0 6px;word-break:break-word}.holes code{font-size:11px;color:var(--muted)}
.vp{display:flex;gap:16px;flex-wrap:wrap}.vp>div{flex:1 1 300px}.phone{max-width:300px}
.legend span{margin-right:14px}.box-ok{color:#1f8a4c}.box-bad{color:#e53935}
`

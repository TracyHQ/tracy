// The copy reading page's stylesheet: colour tokens on :root, redefined for dark mode, nothing external.
export const CSS = `
:root{color-scheme:light dark;--bg:#faf8f6;--surface:#fff;--ink:#1f1b18;--muted:#6b625b;--line:#e4ddd6;--accent:#bf5b3d;
--bad:#b3261e;--bad-bg:#fdeceb;--bad-line:#f0b8b4;--ok:#2e7d4f;--note:#f4efe9;--chip:#efe8e0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171412;--surface:#211d1a;--ink:#efe9e3;--muted:#a79d94;--line:#383129;--accent:#e08566;
--bad:#ff8a80;--bad-bg:#3a1f1d;--bad-line:#7a3a35;--ok:#7fd1a0;--note:#2a2521;--chip:#332d28}}
:root[data-theme="dark"]{--bg:#171412;--surface:#211d1a;--ink:#efe9e3;--muted:#a79d94;--line:#383129;--accent:#e08566;
--bad:#ff8a80;--bad-bg:#3a1f1d;--bad-line:#7a3a35;--ok:#7fd1a0;--note:#2a2521;--chip:#332d28}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:40px 0 12px;padding-top:8px;border-top:2px solid var(--line)}
h3{font-size:15px;margin:0;font-weight:650}
.muted{color:var(--muted)}.small{font-size:13px}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:8px 14px;min-width:110px}
.stat b{display:block;font-size:22px}.stat.bad{border-color:var(--bad-line);background:var(--bad-bg)}.stat.bad b{color:var(--bad)}
nav.toc{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
nav.toc a{background:var(--chip);color:var(--ink);text-decoration:none;border-radius:999px;padding:3px 12px;font-size:13px}
nav.toc a.bad{background:var(--bad-bg);color:var(--bad)}
.page-head{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;justify-content:space-between}
.seo{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0 16px}
.seo dt{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:6px}.seo dd{margin:2px 0 0}
.block{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin:16px 0;overflow:hidden}
.block>header{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:baseline}
.block.dim{opacity:.7}.block .body{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:0}
.shot{padding:12px;border-right:1px solid var(--line);background:var(--note)}
.shot img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:6px;background:#fff}
.shot .none{padding:24px 8px;text-align:center}
.slots{padding:8px 16px 14px;min-width:0}
.slot{padding:10px 0;border-top:1px solid var(--line)}.slot:first-child{border-top:0}
.slot.bad,.alt.bad,.copy.bad{background:var(--bad-bg);border:1px solid var(--bad-line);border-radius:8px;padding:10px;margin:6px 0}
.slot .id{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--muted)}
.note{background:var(--note);border-radius:6px;padding:6px 10px;margin:6px 0;font-size:13px}
.facts{display:flex;flex-direction:column;gap:3px;margin:4px 0}
.fact{font-size:12.5px}.fact code{background:var(--chip);border-radius:4px;padding:0 5px}.fact q{color:var(--muted)}
.text{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}.text p{margin:4px 0}.text.label{font-weight:600}
.count{font-size:12px;color:var(--muted)}.count.over{color:var(--bad);font-weight:700}
.chip{display:inline-block;background:var(--chip);border-radius:999px;padding:0 9px;font-size:12px;margin-right:4px}
.fail{color:var(--bad);font-size:13px;margin:3px 0}.fail b{font-family:ui-monospace,Menlo,monospace}
.empty{color:var(--bad);font-style:italic}.ret{color:var(--accent);font-style:italic}
.alt{margin:6px 0;padding:8px 0;border-top:1px dashed var(--line)}
table{border-collapse:collapse;width:100%;font-size:13.5px;background:var(--surface)}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{background:var(--note)}
ul.tight{margin:4px 0;padding-left:18px}
@media (max-width:760px){.block .body{grid-template-columns:1fr}.shot{border-right:0;border-bottom:1px solid var(--line)}}
`

// The review page's style sheet (#357): colours as tokens, a dark set for the system setting and for the toggle, and a
// layout that stacks at phone width without a horizontal page scroll.
export const STYLES = `
:root{color-scheme:light dark;--bg:#faf8f6;--surface:#fff;--ink:#1f1b18;--muted:#6b625b;--line:#e4ddd6;--accent:#bf5b3d;
--bad:#b3261e;--bad-bg:#fdeceb;--ok:#2e7d4f;--ok-bg:#e8f5ec;--warn:#8a5a00;--warn-bg:#fff4dc;--chip:#efe8e0;--on-accent:#fff}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171412;--surface:#211d1a;--ink:#efe9e3;--muted:#a79d94;--line:#383129;--accent:#e08566;
--bad:#ff8a80;--bad-bg:#3a1f1d;--ok:#7fd1a0;--ok-bg:#16301f;--warn:#f0c36a;--warn-bg:#352a12;--chip:#332d28;--on-accent:#1a1210}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#171412;--surface:#211d1a;--ink:#efe9e3;--muted:#a79d94;--line:#383129;--accent:#e08566;
--bad:#ff8a80;--bad-bg:#3a1f1d;--ok:#7fd1a0;--ok-bg:#16301f;--warn:#f0c36a;--warn-bg:#352a12;--chip:#332d28;--on-accent:#1a1210}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
main{max-width:1240px;margin:0 auto;padding:20px 16px 96px}
h1{font-size:24px;margin:0}h2{font-size:18px;margin:0}h3{font-size:15px;margin:0}
a{color:var(--accent)}.muted{color:var(--muted)}.small{font-size:13px}
header.top{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;margin-bottom:12px}
.btn{font:inherit;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:8px;padding:6px 12px;cursor:pointer;min-height:36px}
.btn:hover{border-color:var(--accent)}.btn[aria-pressed="true"],.btn.on{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}
.btn.bad[aria-pressed="true"]{background:var(--bad);border-color:var(--bad);color:var(--surface)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.stat b{display:block;font-size:22px}.stat.bad b{color:var(--bad)}
.tabs{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
.chip{display:inline-block;border-radius:99px;padding:1px 10px;font-size:12px;background:var(--chip);white-space:nowrap}
.chip.failed{background:var(--bad-bg);color:var(--bad)}.chip.ok{background:var(--ok-bg);color:var(--ok)}
.chip.unchecked{background:var(--warn-bg);color:var(--warn)}
section.row,article.frame{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin:0 0 16px;padding:14px;min-width:0}
.row-head{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;margin-bottom:10px}
.row-body{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:16px}
.shots{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:10px;min-width:0}
figure{margin:0;min-width:0}figcaption{font-size:12px;color:var(--muted);margin-bottom:4px}
.shot{max-height:520px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.shot img,figure img{display:block;max-width:100%;height:auto}
.shot img{width:100%;cursor:zoom-in}.shot img.full{width:auto;max-width:none;cursor:zoom-out}.crops img{cursor:zoom-in}.crops img.full{max-width:none;max-height:none;cursor:zoom-out}
.slot{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:8px 0;border-top:1px solid var(--line)}
.slot:first-child{border-top:0}.slot .id{font-family:ui-monospace,monospace;font-size:12px;color:var(--muted)}
.slot .val{grid-column:1/-1}.slot .why{grid-column:1/-1;color:var(--bad);font-size:13px}
.slot img.thumb{max-height:90px;border-radius:6px;border:1px solid var(--line)}
details{margin-top:8px}summary{cursor:pointer;color:var(--muted)}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:8px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid var(--line);margin-bottom:12px}
.frame-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
.crops{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,1fr);gap:10px;align-items:start}
.crops img{border:1px solid var(--line);border-radius:6px;max-height:340px;object-fit:contain}
.pics{display:flex;gap:10px;flex-wrap:wrap}.pics img{max-height:120px;border:1px solid var(--line);border-radius:6px}
.missing{padding:12px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);font-size:13px}
.near{margin:6px 0;padding:6px 10px;border-left:3px solid var(--line)}
.acts{display:flex;gap:8px;margin-top:10px}textarea{width:100%;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:8px;min-height:56px}
[hidden]{display:none!important}
@media (max-width:860px){.row-body,.frame-grid{grid-template-columns:minmax(0,1fr)}.stats{grid-template-columns:repeat(2,1fr)}}
@media (max-width:520px){.shots,.crops{grid-template-columns:minmax(0,1fr)}h1{font-size:20px}}
`

// Style and behaviour of the viewer page (light + dark, filters, image lightbox).
export const CSS = `
:root{--bg:#f6f6f4;--card:#fff;--fg:#1c1c1a;--muted:#6b6b66;--line:#e3e2dd;--head:#fafaf8;--blue:#2f7cf6;
--red:#d93036;--redbg:#fdecec;--amber:#b86e00;--amberbg:#fff4e0;--fact:#0f7b55;--factbg:#e3f5ec;--edit:#5b5bd6;--editbg:#ececfb}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1e1e1c;--fg:#ecebe6;--muted:#9a9a93;--line:#34342f;--head:#252522;
--red:#ff6369;--redbg:#3a1c1d;--amber:#f5b042;--amberbg:#352a14;--fact:#4cc38a;--factbg:#173126;--edit:#9b9bff;--editbg:#26264a}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
.wrap{max-width:1680px;margin:0 auto;padding:0 16px}
.top{padding:14px 0 4px}.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 0}
h1{font-size:20px;margin:0 0 2px}h2{font-size:16px;margin:0;display:flex;gap:8px;align-items:center}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.stats div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 12px;font-size:13px;color:var(--muted)}
.stats b{display:block;font-size:20px;color:var(--fg)}.stats .warn b{color:var(--red)}
.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.filters select,.filters input[type=search]{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);max-width:100%}
.filters input[type=search]{min-width:260px}.filters select{width:380px;max-width:100%}.legend{margin-top:10px}.rules{margin-top:2px}.legend summary{cursor:pointer;color:var(--muted)}.legend p,.legend ol{margin:6px 0;max-width:960px}
.comp{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:16px 0;padding:14px}
.comp>header{margin-bottom:10px}.grid{display:grid;grid-template-columns:minmax(280px,460px) 1fr;gap:16px;align-items:start}
.shots{position:sticky;top:64px;display:flex;flex-direction:column;gap:10px}
figure{margin:0}figure img{display:block;max-width:100%;max-height:70vh;border:1px solid var(--line);border-radius:6px;cursor:zoom-in;background:#fff}
figure.phone img{max-width:200px;max-height:50vh}figcaption{font-size:12px;color:var(--muted);margin-top:2px}
.tablewrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}
th{position:sticky;top:0;background:var(--head);text-align:left;font-weight:600;font-size:12px;color:var(--muted);padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
td.cell-key{min-width:170px}td.cell-role{min-width:150px}td.cell-fit{min-width:96px}td.cell-size{min-width:110px}td{padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top}
tr.lv-red td{background:var(--redbg)}tr.lv-amber td{background:var(--amberbg)}
.num{width:34px}.n{display:inline-block;min-width:24px;padding:0 5px;text-align:center;border-radius:4px;background:var(--blue);color:#fff;font-weight:700}
.n.red{background:var(--red)}.n.amber{background:#f5a524;color:#1c1c1a}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.key{font-weight:600;font-size:12px;word-break:break-all}
.small{font-size:12px}.muted{color:var(--muted)}.sample{max-width:260px;word-break:break-word}
.thumb{max-width:96px;max-height:64px;border:1px solid var(--line);border-radius:4px;background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0/12px 12px;cursor:zoom-in}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;font-weight:600;white-space:nowrap}
.pill.fact{background:var(--factbg);color:var(--fact)}.pill.edit{background:var(--editbg);color:var(--edit)}
.keep{color:var(--amber);font-weight:600}
.why{margin-top:4px;font-size:12px;font-weight:600}.why.red{color:var(--red)}.why.amber{color:var(--amber)}
.badge{font-size:12px;padding:1px 8px;border-radius:99px}.badge.red{background:var(--redbg);color:var(--red)}
details.extra>summary{cursor:pointer;list-style:revert}details.extra>summary h2{display:inline}
#lb{position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.85);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;cursor:zoom-out}
#lb[hidden]{display:none}#lb img{max-width:none;background:#fff}
@media (max-width:900px){.grid{grid-template-columns:1fr}.shots{position:static}.bar{position:static}.filters input[type=search]{min-width:0;width:100%}}
`

export const SCRIPT = `
const $=(id)=>document.getElementById(id);
function apply(){const pg=$('fPage').value,fl=$('fFlag').checked,im=$('fImg').checked,fa=$('fFact').checked,q=$('fQ').value.trim().toLowerCase();let n=0;
document.querySelectorAll('.comp').forEach(sec=>{let any=0;sec.querySelectorAll('tbody tr').forEach(tr=>{const ok=(!pg||tr.dataset.page===pg)&&(!fl||tr.dataset.flag==='1')&&(!im||tr.dataset.type==='image')&&(!fa||tr.dataset.fact==='1')&&(!q||tr.dataset.q.includes(q));tr.hidden=!ok;if(ok){any++;n++}});
sec.hidden=!any&&!(sec.classList.contains('extra')&&!pg&&!fl&&!im&&!fa&&!q)});$('shown').textContent=n+' slots shown';}
['fPage','fFlag','fImg','fFact','fQ'].forEach(id=>$(id).addEventListener('input',apply));apply();
document.addEventListener('click',e=>{const a=e.target.closest('a.zoom');if(a){e.preventDefault();$('lb').querySelector('img').src=a.href;$('lb').hidden=false}else if(e.target.closest('#lb'))$('lb').hidden=true});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('lb').hidden=true});
`

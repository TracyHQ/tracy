// The picture reading page's stylesheet: the copy reading page's tokens and base (light and dark), plus the frame cards.
import { CSS as BASE, ZOOM_JS } from '../../lib/reading-page-styles.js'

export { ZOOM_JS }

// Opens a "where" crop's full shot in a light box with the frame's box marked, scrolled to it. Without the script the
// link opens the bare shot.
export const WHERE_JS = `
(function(){var lb=null;function close(){if(lb){lb.remove();lb=null}}
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('.where-shot');
if(lb&&!a){if(!e.target.closest('.wl-inner')||e.target.closest('button'))close();return}if(!a)return;e.preventDefault();close();
var b=a.dataset.box.split(',').map(Number),s=a.dataset.size.split(',').map(Number);
lb=document.createElement('div');lb.className='lb wl';var inner=document.createElement('div');inner.className='wl-inner';
var im=document.createElement('img');im.src=a.getAttribute('href');im.alt='Whole shot';var m=document.createElement('span');m.className='wl-box';
m.style.left=(b[0]/s[0]*100)+'%';m.style.top=(b[1]/s[1]*100)+'%';m.style.width=(b[2]/s[0]*100)+'%';m.style.height=(b[3]/s[1]*100)+'%';
var x=document.createElement('button');x.type='button';x.textContent='\\u00d7';x.setAttribute('aria-label','Close');
inner.appendChild(im);inner.appendChild(m);lb.appendChild(inner);lb.appendChild(x);document.body.appendChild(lb);
im.addEventListener('load',function(){m.scrollIntoView({block:'center'})})});
document.addEventListener('keydown',function(e){if(e.key==='Escape')close()})})();
`
export const CSS = `${BASE}
.frame{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin:14px 0;overflow:hidden}
.frame>header{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:6px 10px;align-items:baseline}
.frame>header .id{font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:650;overflow-wrap:anywhere}
.chip.src{background:var(--accent);color:#fff}.chip.warn{background:var(--bad-bg);color:var(--bad)}
.frame.gap{border-color:var(--bad-line)}
.req{padding:10px 16px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:max-content minmax(0,1fr);gap:2px 12px;font-size:13.5px;margin:0}
.req dt{color:var(--muted)}.req dd{margin:0;overflow-wrap:anywhere}
.figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:12px 16px}
.fig{min-width:0}.fig h4{margin:0 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.fig .frame-img{position:relative;display:block;max-width:100%;background:var(--note);border:1px solid var(--line);border-radius:6px;overflow:hidden}
.fig img{display:block;max-width:100%;height:auto}
.zoom{all:unset;display:block;max-width:100%;cursor:zoom-in}.zoom:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.cut{position:absolute;border:2px solid var(--accent);box-shadow:0 0 0 1px #fff,0 0 0 9999px rgba(0,0,0,.35);pointer-events:none}
.gone{border:1px dashed var(--line);border-radius:6px;padding:18px 10px;text-align:center;color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.gone.bad{border-color:var(--bad-line);color:var(--bad);background:var(--bad-bg)}
.grounds{display:flex;flex-wrap:wrap;gap:8px}.ground{border:1px solid var(--line);border-radius:6px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:var(--muted)}
.ground.light{background:#fff;color:#555}.ground.dark{background:#16130f;color:#bbb}.ground img{max-width:72px;max-height:72px;width:auto}
.seen{padding:8px 16px 12px;font-size:13.5px;border-top:1px solid var(--line)}.seen .empty{color:var(--muted);font-style:italic}
.note.ret{color:var(--ink)}
.note.surface{margin:8px 16px}
.paint{margin-top:6px;font-size:12.5px}
.where{padding:12px 16px 4px;border-bottom:1px solid var(--line)}.where h4{margin:0 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.where h4 code,.where h4 .small{text-transform:none;letter-spacing:0}
.where .pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:6px}
.where figure{margin:0;min-width:0}.where figcaption{font-size:12px;color:var(--muted);margin-bottom:4px}
.where img{display:block;max-width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:var(--note)}
.where-shot{display:block;max-width:100%;cursor:zoom-in}.where-shot:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wl{cursor:default}.wl-inner{position:relative;max-width:1100px;margin:24px auto}.wl-inner img{width:100%;border-radius:0}
.wl-box{position:absolute;outline:4px solid #ff2bd6;box-shadow:0 0 0 9999px rgba(0,0,0,.35);pointer-events:none}
.around{padding:10px 16px 12px;border-bottom:1px solid var(--line);font-size:13.5px;background:var(--note)}
.around h4{margin:0 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.around h4 code{text-transform:none;letter-spacing:0}.around h5{margin:10px 0 4px;font-size:12px;color:var(--muted);font-weight:650}
.around .row{display:grid;grid-template-columns:210px minmax(0,1fr);gap:2px 12px;padding:3px 0;border-top:1px solid var(--line)}
.around .lab{color:var(--muted);font-size:12.5px}.around .val p{margin:0 0 4px;overflow-wrap:anywhere}.around .val p:last-child{margin:0}
.around .empty{color:var(--muted);font-style:italic}.around .alt{overflow-wrap:anywhere}
.around summary{cursor:pointer;list-style:none}.around summary::-webkit-details-marker{display:none}
.around .more{color:var(--accent);font-size:12px;white-space:nowrap}.around details[open] .cut-text,.around details[open] .more{display:none}
.sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:16px 0}
.sum .stat{min-width:0}.sum .stat.zero{opacity:.55}
@media (max-width:760px){.around .row{grid-template-columns:1fr}.req{grid-template-columns:1fr}.req dt{margin-top:6px}.figs{padding:12px}}
`

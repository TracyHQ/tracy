/**
 * The share page of a Website Opportunities demo with "See another look" (`demo-link-route.js`, switch `wo-demo-looks`):
 * the demo itself fills the window in a frame, and one small control at the bottom left lets the business owner see
 * the same demo in a few other design systems and press "I like this look".
 *
 * WHAT A LOOK IS: the demo's own page at its own address with the Design system preview's ticket
 * (`?tracy_ds_preview=<ticket>`, `lib/ds-preview-ticket.js`), which the site proxy answers wearing that system, scripts
 * running, NOTHING written to the demo (`sites/design-system-live-page.js`). The tickets come from
 * `GET /api/demo-links/:token/systems`; this page only swaps the frame's address and keeps the page the owner is on
 * (the look's frame tells this page where it is, `tracy-ds-at`, Tracy's origin only). "Current look" is the demo as
 * it was built, no ticket. A look is named by its number ("Look 2") and its palette, never by the library's name: the
 * owner is not a Tracy customer, and a well-known company's name on a look would read as that company's design.
 *
 * DESIGN.md §0 mode A without Tailwind: Tracy owns `<html>`, nothing builds the page, so the tokens are the page
 * shell's (`lib/page-shell.js` `SHELL_TOKENS`, `docs/references/page-shell-tokens.md`) and the dark side follows
 * `prefers-color-scheme`. Focus is one 1px stroke that changes colour, never a halo. The control comes before the
 * frame in the document, so a keyboard reaches it first, not after every link of the demo. The script is an
 * enhancement: without it the page is the demo in a frame and no control shows.
 *
 * 🔒 NO TEXT IN THE SCRIPT: every word comes from the page's data block, translated server-side (`demoLooks.*`).
 * No comments inside the CSS or script template literals: `check-language` reads a template literal as one string.
 */
import { escapeHtml } from '../lib/html.js'
import { bodyFontLinks, SHELL_TOKENS } from '../lib/page-shell.js'
import { DS_PREVIEW_PARAM } from '../lib/ds-preview-ticket.js'

const STYLE = `*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;height:100%;overflow:hidden}
body{background:var(--background);color:var(--foreground);
font:0.875rem/1.4285 "General Sans",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
-webkit-font-smoothing:antialiased}
:lang(vi) body,:lang(vi) button{font-family:"Be Vietnam Pro",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.dl-frame{position:fixed;inset:0;display:block;width:100%;height:100%;border:0;background:var(--background)}
.dl{position:fixed;left:16px;bottom:16px;z-index:2;max-width:calc(100vw - 32px)}
:where(.dl) button{font:inherit;cursor:pointer;outline:none}
.dl-open{display:inline-flex;align-items:center;height:2.75rem;padding:0 1rem;font-weight:500;border-radius:999px;
border:1px solid var(--border);background:var(--card);color:var(--card-foreground);box-shadow:var(--shadow-sm)}
.dl-panel{display:flex;flex-direction:column;gap:0.75rem;width:min(22rem,calc(100vw - 32px));max-height:calc(100dvh - 32px);
overflow:auto;padding:1rem;border-radius:var(--radius-xl);border:1px solid var(--border);background:var(--card);
color:var(--card-foreground);box-shadow:var(--shadow-sm)}
.dl-head{display:flex;align-items:center;justify-content:space-between;gap:0.5rem}
.dl-head h2{margin:0;font-size:0.9375rem;font-weight:600;letter-spacing:-0.01em}
.dl-close{display:grid;place-items:center;width:2.75rem;height:2.75rem;margin:-0.5rem -0.5rem -0.5rem 0;padding:0;
border-radius:var(--radius-md);border:1px solid transparent;background:transparent;color:var(--muted-foreground)}
.dl-close:hover{color:var(--foreground)}
.dl-list{display:grid;gap:0.375rem}
.dl-opt{display:flex;align-items:center;gap:0.625rem;width:100%;min-height:2.75rem;padding:0.5rem 0.75rem;text-align:left;
border-radius:var(--radius-md);border:1px solid var(--border);background:var(--background);color:var(--foreground)}
.dl-opt::before{content:"";flex:none;width:1rem;height:1rem;border-radius:999px;border:1px solid var(--muted-foreground);
background:var(--background)}
.dl-opt[aria-checked="true"]::before{border-color:var(--primary);background:radial-gradient(circle,var(--primary) 0 45%,var(--background) 50%)}
.dl-opt[aria-checked="true"]{border-color:var(--primary)}
.dl-name{flex:1;min-width:0;font-weight:500}
.dl-sw{display:flex;gap:3px}
.dl-sw i{display:block;width:1rem;height:1rem;border-radius:999px;border:1px solid var(--border)}
.dl-note{margin:0;font-size:0.75rem;color:var(--muted-foreground)}
.dl-like{height:2.75rem;padding:0 1rem;font-weight:500;border-radius:var(--radius-md);border:1px solid var(--foreground);
background:var(--foreground);color:var(--background)}
.dl-like:disabled{opacity:.5;cursor:default}
.dl-status{margin:0;min-height:1.25em;font-size:0.8125rem}
.dl-open:focus-visible,.dl-close:focus-visible,.dl-opt:focus-visible,.dl-like:focus-visible{border-color:var(--ring)}
.dl-opt[aria-checked="true"]:focus-visible{border-color:var(--ring)}`

const SCRIPT = `(function(){
var d;try{d=JSON.parse(document.getElementById('dl-data').textContent)}catch(x){return}
var root=document.querySelector('[data-demo-looks]'),frame=document.getElementById('dl-frame'),opener=document.getElementById('dl-open'),
panel=document.getElementById('dl-panel'),list=document.getElementById('dl-list'),like=document.getElementById('dl-like'),
status=document.getElementById('dl-status'),closer=document.getElementById('dl-close');
var looks=[],chosen='current',at=0,path=d.path,search=d.search,KEEP=45*60*1000;
function load(){return fetch(d.systems,{headers:{accept:'application/json'},credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(b){
if(!b||b.origin!==d.origin||!Array.isArray(b.systems)||!b.systems.length)return false;looks=[{id:'current'}].concat(b.systems);at=Date.now();return true}).catch(function(){return false})}
function look(id){for(var i=0;i<looks.length;i++)if(looks[i].id===id)return looks[i];return null}
function srcOf(l){var u=new URL(path,d.origin);u.search=search;if(l.id!=='current')u.searchParams.set(d.param,l.ticket);return u.href}
function nameOf(l){return l.id==='current'?d.words.current:d.words.numbered.replace('{n}',String(l.n))}
function mark(){var o=list.querySelectorAll('.dl-opt');for(var i=0;i<o.length;i++){var on=o[i].getAttribute('data-look')===chosen;
o[i].setAttribute('aria-checked',on?'true':'false');o[i].tabIndex=on?0:-1}}
function render(){list.textContent='';looks.forEach(function(l){var b=document.createElement('button');b.type='button';b.className='dl-opt';
b.setAttribute('role','radio');b.setAttribute('data-look',l.id);var n=document.createElement('span');n.className='dl-name';n.textContent=nameOf(l);b.appendChild(n);
if(l.colors&&l.colors.length){var s=document.createElement('span');s.className='dl-sw';s.setAttribute('aria-hidden','true');
l.colors.forEach(function(c){var i=document.createElement('i');i.style.backgroundColor=c;s.appendChild(i)});b.appendChild(s)}
b.addEventListener('click',function(){choose(l.id)});list.appendChild(b)});mark()}
function choose(id){if(id===chosen)return;if(id!=='current'&&Date.now()-at>KEEP){load().then(function(ok){if(ok){render();choose(id)}});return}
var l=look(id);if(!l)return;chosen=id;frame.src=srcOf(l);mark();status.textContent='';like.disabled=false}
function show(on){panel.hidden=!on;opener.hidden=on;opener.setAttribute('aria-expanded',on?'true':'false');
if(on){var c=list.querySelector('[aria-checked="true"]');if(c)c.focus()}else opener.focus()}
opener.addEventListener('click',function(){show(true)});closer.addEventListener('click',function(){show(false)});
panel.addEventListener('keydown',function(e){if(e.key==='Escape'){show(false);return}
var k={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[e.key];if(!k||!e.target.classList.contains('dl-opt'))return;e.preventDefault();
var i=-1;for(var j=0;j<looks.length;j++)if(looks[j].id===chosen)i=j;var next=looks[(i+k+looks.length)%looks.length];choose(next.id);
var b=list.querySelector('[data-look="'+next.id+'"]');if(b)b.focus()});
like.addEventListener('click',function(){like.disabled=true;status.textContent='';
fetch(d.pick,{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},credentials:'same-origin',body:JSON.stringify({id:chosen})})
.then(function(r){return r.json().catch(function(){return null})}).then(function(b){
if(b&&b.counted===true){status.textContent=d.words.sent;return}like.disabled=false;status.textContent=b&&b.reason==='OWN'?d.words.own:d.words.failed})
.catch(function(){like.disabled=false;status.textContent=d.words.failed})});
addEventListener('message',function(e){if(e.origin!==d.origin||e.source!==frame.contentWindow||!e.data||e.data.type!=='tracy-ds-at')return;
try{var u=new URL(e.data.href);if(u.origin!==d.origin)return;u.searchParams.delete(d.param);path=u.pathname;search=u.search}catch(x){}});
load().then(function(ok){if(!ok)return;render();root.hidden=false})})();`

/** JSON inside a `<script>`: nothing in it can close the element or start a comment. */
const scriptJson = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')

/**
 * The share page. PURE.
 * @param {{
 *   htmlLang: string,
 *   title: string,
 *   target: string,
 *   systemsUrl: string,
 *   pickUrl: string,
 *   words: { open: string, current: string, numbered: string, note: string, like: string, sent: string,
 *     own: string, failed: string, close: string, frameTitle: string }
 * }} p `target`: the demo page the link asked for (its address, path and query); `htmlLang`: `<html lang>`
 * @returns {string} a complete HTML document
 */
export function demoLookPage({ htmlLang, title, target, systemsUrl, pickUrl, words }) {
  const at = new URL(target)
  const data = {
    systems: systemsUrl,
    pick: pickUrl,
    origin: at.origin,
    path: at.pathname,
    search: at.search,
    param: DS_PREVIEW_PARAM,
    words: {
      current: words.current,
      numbered: words.numbered,
      sent: words.sent,
      own: words.own,
      failed: words.failed
    }
  }
  const e = escapeHtml
  return `<!doctype html><html lang="${e(htmlLang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
${bodyFontLinks(htmlLang)}
<title>${e(title)}</title>
<style>
${SHELL_TOKENS}${STYLE}</style></head><body>
<div class="dl" data-demo-looks hidden>
<section class="dl-panel" id="dl-panel" role="dialog" aria-labelledby="dl-title" hidden>
<div class="dl-head"><h2 id="dl-title">${e(words.open)}</h2><button type="button" class="dl-close" id="dl-close" aria-label="${e(words.close)}"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
<div class="dl-list" id="dl-list" role="radiogroup" aria-labelledby="dl-title"></div>
<p class="dl-note">${e(words.note)}</p>
<button type="button" class="dl-like" id="dl-like">${e(words.like)}</button>
<p class="dl-status" id="dl-status" role="status" aria-live="polite"></p>
</section>
<button type="button" class="dl-open" id="dl-open" aria-expanded="false" aria-controls="dl-panel">${e(words.open)}</button>
</div>
<iframe class="dl-frame" id="dl-frame" src="${e(at.href)}" title="${e(words.frameTitle)}"></iframe>
<script type="application/json" id="dl-data">${scriptJson(data)}</script>
<script>${SCRIPT}</script>
</body></html>`
}

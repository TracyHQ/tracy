/**
 * The live preview on a template's public page (issue #1762): the template's own demo, framed, the
 * way the in-app "Open preview" of Design inspiration frames it (`TemplateBody.tsx`). The visitor
 * clicks, scrolls and walks the demo's pages on the real thing, instead of reading screenshots.
 *
 * What is reused from the in-app preview, on purpose:
 *   - the frame address: the layout's `address` (else `path`) joined onto the demo URL, a truncated
 *     path read as the home page, `?theme=` set only when the demo has a dark side (`previewSrc`);
 *   - the Desktop / Phone switch and the Light | Dark switch (no page chips and no new tab link: the visitor walks the demo
 *     itself, and "View demo site" sits under "Use this template");
 *   - the desktop: a 1280 x 800 (16:10) layout viewport scaled to the column width, so the frame is a true desktop screen at any width;
 *   - the phone: a 390 x 844 layout viewport, scaled down when the column is short, in a 4 px bezel drawn OUTSIDE it, centred;
 *   - while the demo loads: the Tracy mark turning and "Loading the live demo…", the frame invisible
 *     until its `load`, then a 150 ms fade (Akemi's option B of 30/09: no poster under the frame);
 *   - 🔒 the frame is mounted ONLY after the `demo-frame` probe says this origin may frame the demo
 *     (`DemoThumb.tsx`, `lib/frame-allowed.js`): a refused frame still fires `load` and shows the
 *     browser's error page, which nothing on the page can tell from a demo. Refused, unreachable or
 *     silent for 25 s: the poster stays and the visitor is sent to a new tab instead;
 *   - the sandbox of the live frames in `preview-stage.tsx`: the demo's scripts run on its own
 *     origin, no form, no top navigation, popups (the demo's own new-tab links) allowed.
 *
 * SERVER FIRST. Before any script runs (and for a crawler) the block is the home shot through the
 * thumbnail door, and a link to the demo. The
 * script turns it live: at once when the block is near the screen on a wide screen, on a tap on a
 * narrow one (a phone should not run a whole demo site it did not ask for). One iframe, whose `src`
 * changes with the theme; nothing loads for a template with no demo.
 */
import { EYE_ICON } from './templates-button-icons.js'
import { createHash } from 'node:crypto'
import { escapeHtml } from '../lib/html.js'
import { TRACY_ICON_DATA_URI } from '../lib/tracy-icon.js'
import { WORDS } from './templates-words.js'

/** `preview-stage.tsx` LIVE_SANDBOX: the demo's own scripts on its own origin; no form, no top navigation. */
export const PREVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

/** An http(s) URL, or null. */
function httpUrl(value, base) {
  if (typeof value !== 'string' || value === '') return null
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

/** The demo page of one layout, as `previewSrc` builds it, without the per-load `?theme=`. */
function layoutAddress(demo, layout) {
  const named = layout?.address ?? layout?.path ?? '/'
  const where = typeof named === 'string' && named !== '' && !named.includes('…') ? named : '/'
  const url = httpUrl(where, demo)
  return url && url.origin === new URL(demo).origin ? url.href : demo
}

/**
 * The demo pages of a card, as text-and-link data: one `{ name, url }` per layout, the url built like
 * the preview's own address (no theme). Empty without a demo. A crawler reads these; the preview itself
 * has no page chips.
 */
export function demoPages(card) {
  const demo = httpUrl(card?.demo?.url)
  if (!demo) return []
  const layouts = Array.isArray(card.layouts) ? card.layouts : []
  return layouts
    .map((l) => ({
      name: typeof l?.label === 'string' && l.label ? l.label : String(l?.key ?? ''),
      url: layoutAddress(demo.href, l)
    }))
    .filter((p) => p.name !== '')
}

/**
 * The home address of a card's demo, as the in-app preview opens it (`previewSrc` on the home
 * layout: the layout named `home`, else the first), without a theme. Null when there is no demo.
 */
export function demoHome(card) {
  const demo = httpUrl(card?.demo?.url)
  if (!demo) return null
  const layouts = Array.isArray(card.layouts) ? card.layouts : []
  const home = layouts.find((l) => l?.key === 'home') ?? layouts[0]
  return layoutAddress(demo.href, home)
}

/** The demo address with the demo theme the visitor sees (`?theme=`), only for a card with a dark side. */
function withTheme(href, card) {
  if (card?.dark !== true) return href
  const url = new URL(href)
  url.searchParams.set('theme', card.defaultTheme === 'dark' ? 'dark' : 'light')
  return url.href
}

/**
 * The "View demo site" button for the information column: the same shape as "Use this template" but
 * an outline, opening the demo's home in a new tab. Empty without a demo. `data-base` lets the
 * preview script carry the Light | Dark choice onto the link.
 */
export function demoButton(template, w = WORDS) {
  const own = template?.card ?? {}
  // A demo named only on a platform entry still counts, as it did for the old "Live demo" row.
  const url = own.demo?.url ?? template?.platforms?.find((p) => p?.demo?.url)?.demo?.url
  const card = url === own.demo?.url ? own : { ...own, demo: { url } }
  const home = demoHome(card)
  if (!home) return ''
  return `<a class="btn btn-ghost" id="pv-demo" href="${escapeHtml(withTheme(home, card))}" data-base="${escapeHtml(home)}" target="_blank" rel="noopener">${EYE_ICON}${escapeHtml(w.viewDemo)}${EXTERNAL.replace('<svg ', '<svg class="ext" ')}</a>`
}

/**
 * What the page needs to frame this template's demo, or null when it has no demo to frame (no demo
 * URL, or no probe to ask first: a frame mounted without asking could be a refusal page).
 */
export function livePreview(template) {
  const card = template?.card ?? {}
  const demo = httpUrl(card.demo?.url)
  const probe = httpUrl(card.demo?.probe)
  if (!demo || !probe) return null
  return {
    demo: demoHome(card),
    probe: probe.href,
    dark: card.dark === true,
    defaultTheme: card.dark === true && card.defaultTheme === 'dark' ? 'dark' : 'light',
    frameOrigins: [demo.origin],
    connectOrigins: [probe.origin]
  }
}

const EXTERNAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"></path></svg>'
const MONITOR =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>'
const PHONE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"></rect><path d="M12 18h.01"></path></svg>'

/** lucide Sun and Moon, same inline-svg treatment as the device icons (styled by `.pv-dev svg`). */
const SUN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"></path></svg>'
const MOON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"></path></svg>'

const shortAddress = (href) => {
  const u = new URL(href)
  return `${u.host}${u.pathname === '/' ? '' : u.pathname}${u.search}`
}

/**
 * The Light | Dark pill of the demo, only for a template with a dark side. It drives the demo alone,
 * never the page theme; hidden until the frame is live, like the device switch.
 */
function themeSwitch(live, words) {
  if (!live.dark) return ''
  const w = words.preview
  const on = (t) => (live.defaultTheme === t ? 'true' : 'false')
  return `<div class="pv-dev pv-theme" role="group" aria-label="${escapeHtml(w.theme)}" hidden><button type="button" data-theme="light" aria-pressed="${on('light')}">${SUN}${escapeHtml(w.light)}</button><button type="button" data-theme="dark" aria-pressed="${on('dark')}">${MOON}${escapeHtml(w.dark)}</button></div>`
}

/**
 * The preview block.
 * @param {{name: string, live: ReturnType<typeof livePreview>, poster: string}} input - `poster` is
 *   the home shot's `<img>` (or placeholder) already built by the page.
 */
export function previewBlock({ name, live, poster, words = WORDS }) {
  const w = words.preview
  return `<section class="pv" id="pv" aria-label="${escapeHtml(w.label(name))}" data-probe="${escapeHtml(live.probe)}" data-dark="${live.dark}" data-theme="${live.defaultTheme}" data-sandbox="${PREVIEW_SANDBOX}" data-title="${escapeHtml(w.frameTitle(name))}">
<div class="pv-bar"><div class="pv-tools">${themeSwitch(live, words)}<div class="pv-dev" role="group" aria-label="${escapeHtml(w.device)}" hidden><button type="button" data-device="desktop" aria-pressed="true">${MONITOR}${escapeHtml(w.desktop)}</button><button type="button" data-device="phone" aria-pressed="false">${PHONE}${escapeHtml(w.phone)}</button></div></div></div>
<div class="pv-stage"><div class="pv-window"><div class="pv-chrome" aria-hidden="true"><i></i><i></i><i></i><span class="pv-addr">${escapeHtml(shortAddress(live.demo))}</span></div>
<div class="pv-view"><div class="pv-poster">${poster}</div>
<a class="pv-start btn btn-primary" href="${escapeHtml(live.demo)}" target="_blank" rel="noopener">${escapeHtml(w.start)}</a>
<div class="pv-loader" role="status"><img src="${TRACY_ICON_DATA_URI}" width="56" height="56" alt=""><span>${escapeHtml(w.loading)}</span></div>
<p class="pv-note" hidden>${escapeHtml(w.blocked)}</p></div></div></div></section>`
}

/** Turns the block live. ES5, no library; the page reads fine without it. */
const PREVIEW_BODY = `(function(){
var pv=document.getElementById("pv");if(!pv||!window.fetch||!window.URL)return;
var q=function(s){return pv.querySelector(s)};
var view=q(".pv-view"),start=q(".pv-start"),note=q(".pv-note"),demoA=document.getElementById("pv-demo"),dev=q(".pv-dev:not(.pv-theme)"),tsw=q(".pv-theme");
var devs=[].slice.call(dev.querySelectorAll("button")),ths=tsw?[].slice.call(tsw.querySelectorAll("button")):[];
var frame=null,state="idle",timer=null,cur=start.href;
var narrow=!!(window.matchMedia&&window.matchMedia("(max-width: 720px)").matches);
var device=narrow?"phone":"desktop";
pv.classList.add("js");if(narrow)pv.classList.add("tap");
var theme=pv.getAttribute("data-theme")==="dark"?"dark":"light";
function src(u){if(pv.getAttribute("data-dark")!=="true")return u;try{var x=new URL(u);x.searchParams.set("theme",theme);return x.href}catch(e){return u}}
function loading(on){pv.classList.toggle("loading",on);if(frame){if(on){frame.setAttribute("aria-hidden","true");frame.tabIndex=-1}else{frame.removeAttribute("aria-hidden");frame.removeAttribute("tabindex")}}clearTimeout(timer);if(on)timer=setTimeout(fail,25000)}
function fail(){state="failed";clearTimeout(timer);pv.classList.remove("loading","live","phone");pv.classList.add("failed");if(frame){frame.parentNode.removeChild(frame);frame=null}note.hidden=false;dev.hidden=true;if(tsw)tsw.hidden=true}
function fit(){if(!frame)return;var win=q(".pv-window"),stage=q(".pv-stage"),s,was=pv.classList.contains("phone");
/* Every pass starts from a clean state: no inline width or height left by the other device. The desktop height is read
   with the desktop classes on, so Phone can be sized to fit inside it. */
pv.classList.remove("phone");win.style.width="";view.style.height="";var hD=stage.offsetHeight;if(was)pv.classList.add("phone");
if(device==="phone"){win.style.width="";view.style.height="0px";var extra=stage.offsetHeight;
var aw=stage.clientWidth-(narrow?0:26)-8,ah=narrow?Math.max(420,window.innerHeight-160):hD-extra;s=Math.min(1,aw/390,ah/844);if(!(s>0))s=1;
win.style.width=Math.round(390*s+8)+"px";view.style.height=Math.round(844*s)+"px";frame.style.width="390px";frame.style.height="844px"}
else{s=view.clientWidth/1280;if(!(s>0))s=1;frame.style.width="1280px";frame.style.height="800px"}
frame.style.transform="scale("+s+")"}
function setDevice(d){device=d;pv.classList.toggle("phone",d==="phone");devs.forEach(function(b){b.setAttribute("aria-pressed",b.getAttribute("data-device")===d?"true":"false")});fit()}
function load(){if(!frame)return;loading(true);frame.src=src(cur)}
function mount(){state="live";frame=document.createElement("iframe");frame.className="pv-frame";frame.title=pv.getAttribute("data-title");frame.setAttribute("sandbox",pv.getAttribute("data-sandbox"));frame.setAttribute("referrerpolicy","no-referrer");
frame.addEventListener("load",function(){if(state==="live")loading(false)});view.appendChild(frame);pv.classList.add("live");dev.hidden=false;if(tsw)tsw.hidden=false;setDevice(device);load()}
function begin(){if(state!=="idle")return;state="asking";pv.classList.add("loading");
fetch(pv.getAttribute("data-probe")+"?origin="+encodeURIComponent(location.origin),{credentials:"omit"}).then(function(r){return r.ok?r.json():null}).then(function(b){if(state!=="asking")return;if(b&&b.framable===true)mount();else fail()},fail)}
devs.forEach(function(b){b.addEventListener("click",function(){setDevice(b.getAttribute("data-device"))})});
ths.forEach(function(b){b.addEventListener("click",function(){var n=b.getAttribute("data-theme");if(n===theme)return;theme=n;if(demoA)demoA.href=src(demoA.getAttribute("data-base"));ths.forEach(function(o){o.setAttribute("aria-pressed",o===b?"true":"false")});if(state==="live")load()})});
start.addEventListener("click",function(e){if(state==="failed")return;e.preventDefault();begin()});
window.addEventListener("resize",fit);
if(!narrow){if(window.IntersectionObserver){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.disconnect();begin()}})},{rootMargin:"200px"});io.observe(pv)}else begin()}
})();`

export const PREVIEW_SCRIPT = `<script>${PREVIEW_BODY}</script>`
/** The `script-src` source that lets exactly this script run. */
export const PREVIEW_SCRIPT_SOURCE = `'sha256-${createHash('sha256').update(PREVIEW_BODY).digest('base64')}'`

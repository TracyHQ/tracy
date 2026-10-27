/**
 * The running site's own page wearing one design system, served LIVE at the site's address with its
 * scripts running (17/10/2026: "the popup does not look like the page after Try on").
 *
 * The preview popup used to frame a static copy (`design-system-preview-page.js`, `srcDoc`, no script):
 * whatever a template lays out with JavaScript came out different — an Owl carousel's slides, a
 * gallery's stagger, a sticky header, lazy pictures. Now the popup frames the site itself at
 * `<site address>/?tracy_ds_preview=<ticket>` (`lib/ds-preview-ticket.js`, minted by the preview door after
 * its gates): the site proxy (`bar/route.js`) asks the site as nobody, and this file lays in the very
 * bytes an apply would write — the same emitter (`lib/ds-slot.js` `emitFor`), the same slot builder
 * (`slotOf`), the same WordPress global styles merge (`wearGlobalStyles`) the static preview used — then
 * the browser runs the page's own scripts on them, as it does after Try on.
 *
 * 🔒 NOTHING IS WRITTEN TO THE SITE: only the one response the ticket rides on changes (`no-store`,
 * `noindex`, no badge, no picker).
 *
 * The page also gets one small script of Tracy's ({@link frameScriptOf}) that keeps the ticket on every
 * same-site link followed inside the frame (so browsing keeps the look), sends a link to another host to
 * a new tab, tells the popup (Tracy's origin only) which page it is on and which side (light or dark) the
 * page is showing, again whenever that side changes (the page's own switch, a press), and takes the
 * popup's Light | Dark press. The side is read and set with the hook the contract names (`modeHook`,
 * {@link frameSidesOf}; `data-theme` on the root by default, the hook the slot's sides use): the popup's
 * switch lights the side the page really shows, not the side the system declares (18/10/2026: on JA
 * Vega under Moxie "Dark" was lit while the page, its template's default, opened light).
 */
import {
  emitFor as libraryEmitFor,
  googleFontFaces,
  modeHookOf as libraryModeHookOf
} from '../lib/ds-slot.js'
import { DS_PREVIEW_PARAM } from '../lib/ds-preview-ticket.js'
import { TEMPLATE_DEFAULT_ID } from './design-system-ids.js'
import { readThemeCss, slotOf, themeFoldersFor } from './design-system-preview-page.js'
import { themeFoldersOf, wearGlobalStyles } from './design-system-preview-wordpress.js'

/** How long one system's emitted bytes are kept: a library and its contracts change only on a deploy. */
const SLOT_KEEP_MS = 10 * 60_000
/** Emitted slots kept at most (the oldest goes first). */
const SLOT_KEPT_MAX = 64
/** How long a WordPress theme.json read may take. */
const THEME_WAIT_MS = 8_000

const attr = (/** @type {string} */ v) =>
  String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A slot a site already wears (Joomla's module, EmDash's layout): its fonts link and its style element. */
const WORN_SLOT =
  /(?:<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*"\s*\/?>\s*)?<style\b[^>]*\bid=["']tracy-ds-slot["'][^>]*>[\s\S]*?<\/style>/gi

/** A contract's hook (`modeHook`): attributes and classes the root carries together, or a `:has()` reaching the body (`sides.mjs` HOOK). */
const HOOK =
  /^(?:(?:\[[\w-]+(?:="[\w-]+")?\]|\.[\w-]+)+|:has\(>\s*body(?:\.[\w-]+|\[[\w-]+(?:="[\w-]+")?\])+\))$/

/**
 * How the frame's script reads and sets the side a page shows, from the contract's hook (`modeHookOf`):
 * `dark` the condition on the root that is true on the dark side; `auto` whether a root without
 * `data-theme` follows the OS (Tracy's default hook only, as `sides.mjs` `sidesOf`); `set` the marks a
 * press puts on (dark) or takes off (light), on the root or the body; null: `data-theme` light|dark on
 * the root. PURE.
 * @param {{ hook?: string, auto?: boolean }} [m]
 * @returns {{ dark: string, auto: boolean, set: { on: 'root' | 'body', cls: string[], attr: [string, string][] } | null }}
 */
export function frameSidesOf({ hook = '', auto = true } = {}) {
  const h = typeof hook === 'string' ? hook.trim() : ''
  if (h === '' || !HOOK.test(h)) return { dark: '[data-theme="dark"]', auto: auto !== false, set: null }
  const body = h.startsWith(':has(')
  const marks = body ? h.replace(/^:has\(>\s*body/, '').slice(0, -1) : h
  /** @type {string[]} */
  const cls = []
  /** @type {[string, string][]} */
  const attr = []
  for (const m of marks.matchAll(/\.([\w-]+)|\[([\w-]+)(?:="([\w-]+)")?\]/g)) {
    if (m[1]) cls.push(m[1])
    else attr.push([m[2], m[3] ?? ''])
  }
  return { dark: h, auto: false, set: { on: body ? 'body' : 'root', cls, attr } }
}

/**
 * The script the live page carries (see the file comment). Inline, so it needs nothing from the site;
 * a site whose own CSP forbids inline scripts still shows the look, only without these helps (the
 * popup then lights the side the system declares, as before).
 * @param {string} parentOrigin Tracy's origin, the only one it talks to
 * @param {string} ticket the frame's own `tracy_ds_preview` value
 * @param {ReturnType<typeof frameSidesOf>} [sides] how the page marks its dark side
 */
export function frameScriptOf(parentOrigin, ticket, sides = frameSidesOf()) {
  const js = `(function(){var s=document.currentScript,o=s.getAttribute('data-parent-origin'),t=s.getAttribute('data-ticket'),p=${JSON.stringify(DS_PREVIEW_PARAM)},d={};try{d=JSON.parse(s.getAttribute('data-sides')||'{}')}catch(x){}
var H=d.dark||'[data-theme="dark"]',A=d.auto===true,W=d.set||null,r=document.documentElement,last=null;
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';if(h===''||h.charAt(0)==='#'||/^(javascript|mailto|tel|sms):/i.test(h))return;var u;try{u=new URL(a.href,location.href)}catch(x){return}if(u.protocol!=='http:'&&u.protocol!=='https:')return;if(u.origin===location.origin){u.searchParams.set(p,t);a.href=u.href;if(a.target&&a.target!=='_self')a.target='_self'}else{a.target='_blank';a.rel='noopener noreferrer'}},true);
function side(){try{if(r.matches(H))return'dark';if(A&&!r.hasAttribute('data-theme')&&matchMedia('(prefers-color-scheme: dark)').matches)return'dark'}catch(x){}return'light'}
function put(m){if(!W){r.setAttribute('data-theme',m);return}var el=W.on==='body'?document.body:r,on=m==='dark';if(!el)return;(W.cls||[]).forEach(function(c){el.classList.toggle(c,on)});(W.attr||[]).forEach(function(a){if(on)el.setAttribute(a[0],a[1]);else el.removeAttribute(a[0])})}
function tell(){var m=side();if(m===last)return;last=m;try{parent.postMessage({type:'tracy-ds-side',theme:m},o)}catch(x){}}
addEventListener('message',function(e){if(e.origin!==o||!e.data||e.data.type!=='tracy-ds-theme')return;var m=e.data.theme;if(m==='light'||m==='dark'){put(m);tell()}});
try{var mo=new MutationObserver(tell);mo.observe(r,{attributes:true});if(document.body)mo.observe(document.body,{attributes:true});if(A)matchMedia('(prefers-color-scheme: dark)').addEventListener('change',tell)}catch(x){}
function at(){last=side();try{parent.postMessage({type:'tracy-ds-at',href:location.href,theme:last},o)}catch(x){}}
if(document.readyState==='complete')at();else addEventListener('load',at)})();`
  return `<script data-tracy-ds-preview="" data-parent-origin="${attr(parentOrigin)}" data-ticket="${attr(ticket)}" data-sides="${attr(JSON.stringify(sides))}">${js}</script>`
}

/**
 * The page wearing the slot, as the site would serve it after an apply: any slot it wears taken off
 * (Joomla, EmDash) or its WordPress global styles block rewritten as the merge prints it, the slot's
 * `bytes` last in the head, EmDash's root marked as wearing one, and the frame's script before
 * `</body>`. `bare`: the Template default card's page, the worn slot taken off and nothing laid in. PURE.
 * @param {string} html the page as the site served it
 * @param {{ platform: string, bytes: string, globalCss?: string | null, themeCss?: string | null,
 *   bare?: boolean, script: string }} p
 * @returns {string | null} null when the page cannot wear it here (no head; a WordPress page without its
 *   global styles block; a WordPress page wearing a system asked bare)
 */
export function liveWornHtmlOf(
  html,
  { platform, bytes, globalCss = null, themeCss = null, bare = false, script }
) {
  let page = html
  if (platform === 'wordpress') {
    if (bare) {
      if (page.includes('/* tracy-ds-slot:')) return null
    } else {
      if (typeof globalCss !== 'string' || typeof themeCss !== 'string') return null
      const worn = wearGlobalStyles(page, { globalCss, themeCss })
      if (worn === null) return null
      page = worn
    }
  } else {
    page = page.replace(WORN_SLOT, '')
  }
  const close = page.search(/<\/head\s*>/i)
  if (close < 0) return null
  page = page.slice(0, close) + bytes + page.slice(close)
  if (platform === 'emdash' && !bare)
    page = page.replace(/<html\b(?![^>]*\bdata-ds-worn)/i, '<html data-ds-worn=""')
  const end = page.toLowerCase().lastIndexOf('</body>')
  return end < 0 ? page + script : page.slice(0, end) + script + page.slice(end)
}

/**
 * The live pages of the site proxy's Design system branch.
 * @param {{ emitFor?: typeof libraryEmitFor, fontFaces?: typeof googleFontFaces,
 *   modeHookOf?: typeof libraryModeHookOf, now?: () => number }} [deps]
 */
export function designSystemLivePages({
  emitFor = libraryEmitFor,
  fontFaces = googleFontFaces,
  modeHookOf = libraryModeHookOf,
  now = Date.now
} = {}) {
  /** @type {Map<string, { at: number, slot: { bytes: string, globalCss: string | null } | null }>} */
  const slots = new Map()

  /** One system's slot through one contract, emitted once and kept a while. */
  async function slotFor(
    /** @type {string} */ platform,
    /** @type {string} */ contract,
    /** @type {string} */ id
  ) {
    const key = `${platform}\n${contract}\n${id}`
    const kept = slots.get(key)
    if (kept && now() - kept.at < SLOT_KEEP_MS) return kept.slot
    const out = await emitFor({ platform: /** @type {any} */ (platform), contract, id, fontFaces })
    const slot = out?.ok ? slotOf(out) : null
    slots.delete(key)
    slots.set(key, { at: now(), slot })
    while (slots.size > SLOT_KEPT_MAX) slots.delete(/** @type {string} */ (slots.keys().next().value))
    return slot
  }

  /**
   * The page the proxy read, wearing what the ticket names; null: the page as it is.
   * @param {{ html: string, claims: import('../lib/ds-preview-ticket.js').DsPreviewClaims, ticket: string,
   *   site: { platform?: string }, inner: URL, pub: URL, parentOrigin: string, fetchImpl: typeof fetch }} q
   */
  async function pageOf({ html, claims, ticket, site, inner, pub, parentOrigin, fetchImpl }) {
    const platform = String(site?.platform ?? '')
    if (!['wordpress', 'joomla', 'emdash'].includes(platform)) return null
    const script = frameScriptOf(parentOrigin, ticket, frameSidesOf(modeHookOf(claims.contract)))
    if (claims.id === TEMPLATE_DEFAULT_ID)
      return liveWornHtmlOf(html, { platform, bytes: '', bare: true, script })
    const slot = await slotFor(platform, claims.contract, claims.id)
    if (!slot) return null
    if (platform !== 'wordpress') return liveWornHtmlOf(html, { platform, ...slot, script })
    // WordPress: the page must be served by one of the judged template's theme folders, whose theme.json
    // the merge replaces (as the static preview reads it).
    const folder = themeFoldersOf(html).find((f) => themeFoldersFor(claims.template).includes(f))
    if (!folder) return null
    const themeCss = await readThemeCss({ inner, pub, folder, fetchImpl, waitMs: THEME_WAIT_MS })
    if (themeCss === null) return null
    return liveWornHtmlOf(html, { platform, ...slot, themeCss, script })
  }

  return { pageOf }
}

/**
 * The header, footer and the two small scripts of the public Templates pages (issue #1762), built to
 * match the tracy.ai marketing chrome (measured 26/10/2026): sticky 64px bar, centred menu, footer
 * with brand column, link columns, theme toggle and social icons. Pure functions, strings out.
 *
 * Every link to a page of the landing site is an absolute `https://tracy.ai/...` address; the only
 * local addresses are `/templates/` and the call to action.
 */
import { createHash } from 'node:crypto'
import { escapeHtml } from '../lib/html.js'
import { DOWNLOAD_ICON } from './templates-button-icons.js'
import { WEB_LANGUAGES } from '../lib/i18n/index.js'
import { LINKS, WORDS, landingPage } from './templates-words.js'

const LOGO = `<img src="${LINKS.logo}" alt="${escapeHtml(WORDS.siteName)}" width="85" height="26" decoding="async">`

/** Reads the saved theme before first paint so a returning visitor never sees a flash. */
const THEME_BOOT_BODY = `(function(){try{var t=localStorage.getItem("tracy-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`

/** The footer theme toggle and the mobile menu. The page reads fine without it. */
const CHROME_BODY = `(function(){
var root=document.documentElement;
var themeBtn=document.getElementById("themetoggle");
function isDark(){var t=root.getAttribute("data-theme");if(t)return t==="dark";return !!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)}
function label(){if(!themeBtn)return;var d=isDark();themeBtn.setAttribute("aria-pressed",d?"true":"false");themeBtn.setAttribute("aria-label",d?themeBtn.getAttribute("data-label-light"):themeBtn.getAttribute("data-label-dark"));themeBtn.setAttribute("title",d?themeBtn.getAttribute("data-title-light"):themeBtn.getAttribute("data-title-dark"))}
if(themeBtn){label();themeBtn.addEventListener("click",function(){var next=isDark()?"light":"dark";root.setAttribute("data-theme",next);try{localStorage.setItem("tracy-theme",next)}catch(e){}label()});
if(window.matchMedia){var mq=window.matchMedia("(prefers-color-scheme: dark)");var on=function(){if(!root.getAttribute("data-theme"))label()};if(mq.addEventListener)mq.addEventListener("change",on)}}
var pick=document.getElementById("langpick");
if(pick){pick.hidden=false;pick.addEventListener("change",function(){var v=pick.value;try{document.cookie="tracy_lang="+encodeURIComponent(v)+"; path=/; max-age=31536000; samesite=lax"+(location.protocol==="https:"?"; secure":"")}catch(e){}
var u=new URL(location.href);u.searchParams.delete("lang");location.assign(u.href)})}
var nav=document.querySelector("nav.top");var btn=document.getElementById("navtoggle");
if(nav&&btn){var set=function(open){nav.classList.toggle("open",open);btn.setAttribute("aria-expanded",open?"true":"false");btn.setAttribute("aria-label",open?btn.getAttribute("data-label-close"):btn.getAttribute("data-label-open"))};
btn.addEventListener("click",function(){set(!nav.classList.contains("open"))});
document.addEventListener("keydown",function(e){if(e.key==="Escape")set(false)});
document.addEventListener("click",function(e){if(nav.classList.contains("open")&&!nav.contains(e.target))set(false)})}
})();`

export const THEME_BOOT_SCRIPT = `<script>${THEME_BOOT_BODY}</script>`
export const CHROME_SCRIPT = `<script>${CHROME_BODY}</script>`

/** The `script-src` sources of the page's policy: the two inline scripts above, by hash, no `unsafe-inline`. */
export const INLINE_SCRIPT_SOURCES = [THEME_BOOT_BODY, CHROME_BODY].map(
  (body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`
)

/**
 * Same bar as tracy.ai, with the new menu: Free Templates, Help Center, Download app, Get Started.
 * `appOrigin` is the app's own address, so Get Started works when the page is served from another host.
 */
export function header(appOrigin = '', w = WORDS) {
  const n = w.nav
  return `<div class="nav-shell"><nav class="top" aria-label="${escapeHtml(n.label)}"><div class="nav-inner">
<a class="brand" href="${LINKS.home}">${LOGO}</a>
<div class="nav-links" id="navlinks"><a class="here" href="/templates/">${escapeHtml(n.templates)}</a><a href="${landingPage(w.lang, 'help')}">${escapeHtml(n.help)}</a><a class="btn btn-ghost btn-sm nav-dl-drop" href="${LINKS.download}">${DOWNLOAD_ICON}${escapeHtml(n.downloadApp)}</a><a class="btn btn-primary btn-sm nav-cta-drop" href="${appOrigin}/">${escapeHtml(n.getStarted)}</a></div>
<div class="nav-tools"><a class="btn btn-ghost btn-sm nav-dl" href="${LINKS.download}">${DOWNLOAD_ICON}${escapeHtml(n.downloadApp)}</a><a class="btn btn-primary btn-sm nav-cta" href="${appOrigin}/">${escapeHtml(n.getStarted)}</a></div>
<button class="navtoggle" type="button" id="navtoggle" aria-controls="navlinks" aria-expanded="false" aria-label="${escapeHtml(n.openMenu)}" data-label-open="${escapeHtml(n.openMenu)}" data-label-close="${escapeHtml(n.closeMenu)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg></button>
</div></nav></div>`
}

/** Each language in its own name, as the Settings picker lists them (`@tracy/core/interface-languages`); escapes keep the code file English. */
const LANGUAGE_NAMES = Object.freeze({
  en: 'English',
  vi: 'Ti\u1ebfng Vi\u1ec7t',
  de: 'Deutsch',
  it: 'Italiano',
  fr: 'Fran\u00e7ais',
  nl: 'Nederlands',
  zh: '\u4e2d\u6587',
  es: 'Espa\u00f1ol'
})

/** The language switcher: a select shown by the footer script (it writes the `tracy_lang` cookie and reloads). */
const languagePicker = (w) =>
  `<span class="langpick"><select id="langpick" hidden aria-label="${escapeHtml(w.footer.language)}">${WEB_LANGUAGES.map((id) => `<option value="${id}"${id === w.lang ? ' selected' : ''}>${LANGUAGE_NAMES[id]}</option>`).join('')}</select></span>`

/**
 * Same footer as tracy.ai: logo and blurb, three link columns, then the copyright with the theme toggle and language picker.
 * `appOrigin` is the app's own address, as for the header's Get Started.
 */
export function footer(year, w = WORDS, appOrigin = '') {
  const f = w.footer
  const link = (href, text) => `<a href="${href}">${escapeHtml(text)}</a>`
  const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`
  const t = f.theme
  return `<footer><div class="wrap foot-top">
<div class="foot-brand"><a class="brand" href="${LINKS.home}">${LOGO}</a><p class="foot-blurb">${escapeHtml(f.blurb)}</p></div>
<div class="foot-cols">
<div class="foot-col"><h3>${escapeHtml(f.product)}</h3>${link('/templates/', f.freeTemplates)}${link(LINKS.download, f.download)}${link(`${appOrigin}/`, f.webApp)}${link(landingPage(w.lang, 'help'), f.helpCenter)}</div>
<div class="foot-col"><h3>${escapeHtml(f.community)}</h3>${ext(LINKS.github, 'GitHub')}${ext(LINKS.discord, 'Discord')}${ext(LINKS.youtube, 'YouTube')}${ext(LINKS.x, 'X')}</div>
<div class="foot-col"><h3>${escapeHtml(f.legal)}</h3>${link(landingPage(w.lang, 'privacy'), f.privacy)}${link(landingPage(w.lang, 'terms'), f.terms)}</div>
</div></div>
<div class="wrap foot-bottom"><span class="muted">${escapeHtml(f.copyright(year))}</span>
<div class="foot-tools"><button class="themetoggle" type="button" id="themetoggle" aria-pressed="false" aria-label="${escapeHtml(t.toDark)}" title="${escapeHtml(t.titleDark)}" data-label-dark="${escapeHtml(t.toDark)}" data-label-light="${escapeHtml(t.toLight)}" data-title-dark="${escapeHtml(t.titleDark)}" data-title-light="${escapeHtml(t.titleLight)}"><svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg></button>${languagePicker(w)}</div></div></footer>`
}

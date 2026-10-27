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
import { LINKS, WORDS } from './templates-words.js'

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
<div class="nav-links" id="navlinks"><a class="here" href="/templates/">${escapeHtml(n.templates)}</a><a href="${LINKS.help}">${escapeHtml(n.help)}</a><a class="btn btn-ghost btn-sm nav-dl-drop" href="${LINKS.download}">${DOWNLOAD_ICON}${escapeHtml(n.downloadApp)}</a><a class="btn btn-primary btn-sm nav-cta-drop" href="${appOrigin}/">${escapeHtml(n.getStarted)}</a></div>
<div class="nav-tools"><a class="btn btn-ghost btn-sm nav-dl" href="${LINKS.download}">${DOWNLOAD_ICON}${escapeHtml(n.downloadApp)}</a><a class="btn btn-primary btn-sm nav-cta" href="${appOrigin}/">${escapeHtml(n.getStarted)}</a></div>
<button class="navtoggle" type="button" id="navtoggle" aria-controls="navlinks" aria-expanded="false" aria-label="${escapeHtml(n.openMenu)}" data-label-open="${escapeHtml(n.openMenu)}" data-label-close="${escapeHtml(n.closeMenu)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg></button>
</div></nav></div>`
}

const SOCIAL_ICONS = {
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136c-1.871-0.505-9.376-0.505-9.376-0.505s-7.505 0-9.377 0.505a3.017 3.017 0 0 0-2.121 2.136c-0.502 1.884-0.502 5.814-0.502 5.814s0 3.93 0.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871 0.505 9.376 0.505 9.376 0.505s7.505 0 9.377-0.505a3.015 3.015 0 0 0 2.122-2.136c0.501-1.884 0.501-5.814 0.501-5.814s0-3.93-0.502-5.814z m-13.953 9.382v-7.136l6.273 3.568-6.273 3.568z',
  discord:
    'M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.246.198.373.292a.077.077 0 0 1-.007.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.029 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c0.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z',
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'
}

const social = (href, title, icon) =>
  `<a href="${href}" target="_blank" rel="noopener" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="${SOCIAL_ICONS[icon]}"></path></svg></a>`

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

/** Same footer as tracy.ai, with the language switcher beside the theme toggle. */
export function footer(year, w = WORDS) {
  const f = w.footer
  const link = (href, text) => `<a href="${href}">${escapeHtml(text)}</a>`
  const t = f.theme
  return `<footer><div class="wrap foot-top">
<div class="foot-brand"><a class="brand" href="${LINKS.home}">${LOGO}</a><p class="foot-blurb">${escapeHtml(f.blurb)}</p>
<div class="foot-tools"><button class="themetoggle" type="button" id="themetoggle" aria-pressed="false" aria-label="${escapeHtml(t.toDark)}" title="${escapeHtml(t.titleDark)}" data-label-dark="${escapeHtml(t.toDark)}" data-label-light="${escapeHtml(t.toLight)}" data-title-dark="${escapeHtml(t.titleDark)}" data-title-light="${escapeHtml(t.titleLight)}"><svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg></button>${languagePicker(w)}</div></div>
<div class="foot-cols">
<div class="foot-col"><h3>${escapeHtml(f.product)}</h3>${link('/templates/', f.templateLibrary)}${link(LINKS.howItWorks, f.howItWorks)}${link(LINKS.whyTracy, f.whyTracy)}</div>
<div class="foot-col"><h3>${escapeHtml(f.resources)}</h3>${link(LINKS.help, f.helpCenter)}${link(LINKS.download, f.download)}</div>
<div class="foot-col"><h3>${escapeHtml(f.legal)}</h3>${link(LINKS.privacy, f.privacy)}${link(LINKS.terms, f.terms)}</div>
</div></div>
<div class="wrap foot-bottom"><span class="muted">${escapeHtml(f.copyright(year))}</span>
<div class="foot-socials">${social(LINKS.youtube, f.youtube, 'youtube')}${social(LINKS.discord, f.discord, 'discord')}${social(LINKS.x, f.x, 'x')}</div></div></footer>`
}

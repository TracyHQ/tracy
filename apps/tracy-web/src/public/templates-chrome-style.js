/**
 * The look of the public Templates pages that has to match tracy.ai (issue #1762): colour tokens,
 * the three fixed background layers, the sticky header, the hero type and the footer. Values are the
 * COMPUTED ones measured on tracy.ai on 26/10/2026 (the landing theme's inline CSS overrides the
 * `:root` of its stylesheet), not the stylesheet defaults.
 *
 * TOKENS (`docs/references/page-shell-tokens.md`): a server-rendered page cannot load `tokens.css`, so
 * the Tracy token NAMES (`--background`, `--foreground`, `--card`, `--muted-foreground`, `--primary`,
 * `--primary-foreground`, `--border`) are redeclared here with the landing values, plus the few extra
 * names the chrome needs. No rule below holds a raw colour: every theme difference lives in the two
 * token blocks. Never a `--dsw-alias-*`.
 *
 * Dark mode follows the visitor's choice first (`html[data-theme]`, set by the footer toggle and
 * remembered in localStorage `tracy-theme`) and the system setting otherwise, so the dark block is
 * written once and attached to both selectors.
 *
 * 🔒 NO COMMENTS INSIDE THE CSS STRINGS (same reason as `lib/page-shell.js`: a comment there is
 * shipped bytes, and `check-language` reads the literal as one string).
 */
import { LINKS } from './templates-words.js'

const LIGHT_TOKENS = `--background:#f2e8dd;--foreground:rgba(34,23,16,.92);--card:#fbf4ec;--muted-foreground:rgba(58,40,29,.66);--primary:#a3462a;--primary-hover:#8a3a22;--primary-fill:#bb593c;--primary-foreground:#fff;--primary-soft:rgba(187,89,60,.12);--border:rgba(72,45,30,.14);--border-strong:rgba(72,45,30,.26);--panel-2:rgba(255,253,250,.46);--veil:rgba(242,232,221,.36);--shadow:0 24px 60px -28px rgba(72,45,30,.30);--glow:rgba(255,226,205,.62);--glow2:rgba(255,206,178,.45);--glass:linear-gradient(rgba(163,70,42,.05),rgba(163,70,42,.05)),rgba(250,246,240,.55);--glass-border:rgba(163,70,42,.14);--shell:#f2e8dd;--nav-bg:radial-gradient(120% 150% at 12% 0%,rgba(187,89,60,.10),rgba(187,89,60,0) 60%),rgba(244,234,224,.94);--chrome-border:rgba(163,70,42,.16);--foot-bg:radial-gradient(120% 150% at 12% 0%,rgba(187,89,60,.10),rgba(187,89,60,0) 60%),linear-gradient(180deg,rgba(163,70,42,.08) 0%,rgba(163,70,42,.02) 100%);--logo-filter:none;--backdrop:url(${LINKS.backdropLight})`

const DARK_TOKENS = `--background:#14100e;--foreground:rgba(255,255,255,.9);--card:#1d1714;--muted-foreground:rgba(255,255,255,.6);--primary:#cf755a;--primary-hover:#da8f78;--primary-soft:rgba(207,117,90,.18);--border:rgba(255,255,255,.1);--border-strong:rgba(255,255,255,.2);--panel-2:rgba(28,22,19,.62);--veil:rgba(18,14,12,.24);--shadow:0 26px 70px -30px rgba(0,0,0,.85);--glow:rgba(235,140,100,.20);--glow2:rgba(255,180,130,.13);--glass:rgba(20,16,14,.45);--glass-border:rgba(255,255,255,.10);--shell:#1c1512;--nav-bg:rgba(28,21,18,.94);--chrome-border:rgba(255,255,255,.10);--foot-bg:rgba(28,22,19,.62);--logo-filter:invert(1) hue-rotate(180deg) brightness(1.08);--backdrop:url(${LINKS.backdropDark})`

export const TOKENS_CSS = `:root{color-scheme:light dark;${LIGHT_TOKENS};--link:var(--primary);--strong:var(--border-strong);--soft:var(--primary-soft)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK_TOKENS}}}
:root[data-theme="dark"]{${DARK_TOKENS}}
:root[data-theme="light"]{color-scheme:light}
:root[data-theme="dark"]{color-scheme:dark}
`

export const BACKGROUND_CSS = `@keyframes bgdrift{from{transform:scale(1.12) translate3d(-1.8%,-1.2%,0)}to{transform:scale(1.12) translate3d(1.8%,1.2%,0)}}
@keyframes glowdrift{0%{transform:translate3d(-8%,-6%,0) scale(1)}50%{transform:translate3d(9%,5%,0) scale(1.18)}100%{transform:translate3d(-8%,-6%,0) scale(1)}}
body::before{content:"";position:fixed;inset:0;z-index:-3;background-image:var(--backdrop);background-size:cover;background-position:center center;background-repeat:no-repeat;will-change:transform;animation:bgdrift 48s ease-in-out infinite alternate}
html::before{content:"";position:fixed;inset:-25%;z-index:-2;pointer-events:none;will-change:transform;background:radial-gradient(38% 46% at 28% 32%,var(--glow),transparent 68%),radial-gradient(34% 40% at 74% 70%,var(--glow2),transparent 70%);animation:glowdrift 38s ease-in-out infinite}
body::after{content:"";position:fixed;inset:0;z-index:-1;background:var(--veil)}
@media (prefers-reduced-motion:reduce){body::before,html::before{animation:none}body::before{transform:none}}
`

export const HEADER_CSS = `.nav-shell{position:sticky;top:0;z-index:999;height:64px;background-color:var(--shell)}
nav.top{position:sticky;top:0;z-index:1000;height:64px;background:var(--nav-bg);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--chrome-border)}
.nav-inner{display:flex;align-items:center;gap:26px;max-width:1200px;height:100%;margin:0 auto;padding:0 16px}
.brand{display:inline-flex;align-items:center}
.brand img{height:26px;width:auto;display:block;filter:var(--logo-filter)}
.nav-links{display:flex;gap:34px;align-items:center;justify-content:center}
.nav-links a{color:var(--foreground);font-size:15px;font-weight:500;line-height:24px}
.nav-links a:hover{color:var(--primary)}
.nav-links a.btn,.nav-links a.btn:hover{color:var(--primary-foreground)}
.nav-links .nav-cta-drop,.nav-links .nav-dl-drop{display:none}
.nav-tools{display:flex;align-items:center;gap:10px}
.nav-tools .ico,.nav-links .ico{width:15px;height:15px}
.navtoggle{display:none;align-items:center;justify-content:center;width:36px;height:36px;padding:0;flex-shrink:0;margin-left:10px;border-radius:10px;cursor:pointer;background:var(--panel-2);border:1px solid var(--border);color:var(--muted-foreground)}
.navtoggle svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round}
.navtoggle:hover{color:var(--foreground);border-color:var(--border-strong)}
.navtoggle:focus-visible,.themetoggle:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
@media (min-width:1081px){.nav-inner{gap:36px}.nav-links{justify-content:flex-start}.nav-tools{margin-left:auto}}
@media (max-width:1080px){.nav-inner{position:relative}.nav-tools{margin-left:auto}.nav-tools .nav-cta,.nav-tools .nav-dl{display:none}.navtoggle{display:inline-flex}
.nav-links{position:absolute;top:calc(100% + 13px);left:0;right:0;display:none;flex-direction:column;align-items:stretch;gap:34px;background:var(--card);border-bottom:1px solid var(--border);padding:6px 16px 16px;box-shadow:var(--shadow)}
nav.top.open .nav-links{display:flex}
.nav-links a:not(.btn){display:none}
nav.top.open .nav-links a:not(.btn){display:block;padding:14px 2px;font-size:16px;line-height:25.6px;border-bottom:1px solid var(--border)}
.nav-links .nav-cta-drop,.nav-links .nav-dl-drop{display:none;margin-top:14px;justify-content:center;padding:13px 20px;font-size:15px}
.nav-links .nav-cta-drop{margin-top:10px}
nav.top.open .nav-links .nav-cta-drop,nav.top.open .nav-links .nav-dl-drop{display:inline-flex}}
`

export const HERO_CSS = `.eyebrow{display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 12px;margin:0 0 20px;border-radius:999px;background:var(--primary-soft);color:var(--primary);font-size:13px;font-weight:600;line-height:1;letter-spacing:.02em}
.page-head{text-align:center;padding:74px 0 34px}
.page-head h1,.lost h1{font-size:clamp(34px,5.4vw,60px);line-height:1.12;letter-spacing:-.03em;overflow-wrap:anywhere;text-wrap:balance}
.page-head h1{max-width:900px;margin:0 auto}
.lead{font-size:clamp(16px,1.4vw,18px);line-height:1.55;color:var(--muted-foreground)}
.page-head .lead,.info .lead{color:var(--foreground)}
.page-head .lead{max-width:768px;margin:20px auto 0}
.page-head .crumbs{padding:0 0 22px}
`

export const FOOTER_CSS = `footer{margin-top:60px;padding:34px 0 48px;background:var(--foot-bg);border-top:1px solid var(--chrome-border);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
footer .wrap{padding-left:0;padding-right:0}
.foot-top{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,2.4fr);gap:44px;align-items:start;padding:52px 0 12px}
.foot-blurb{color:var(--muted-foreground);font-size:14.5px;line-height:1.65;margin:16px 0 0;max-width:330px}
.foot-tools{display:flex;align-items:center;gap:10px;margin-left:auto}
.themetoggle{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;flex-shrink:0;border-radius:999px;cursor:pointer;background:var(--panel-2);border:1px solid var(--border);color:var(--muted-foreground)}
.themetoggle:hover{color:var(--foreground);border-color:var(--border-strong)}
.themetoggle svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.themetoggle .i-sun{display:none}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .themetoggle .i-sun{display:block}:root:not([data-theme="light"]) .themetoggle .i-moon{display:none}}
:root[data-theme="dark"] .themetoggle .i-sun{display:block}
:root[data-theme="dark"] .themetoggle .i-moon{display:none}
.langpick select{height:38px;padding:0 30px 0 14px;border-radius:999px;border:1px solid var(--border);background:var(--panel-2);color:var(--muted-foreground);font:inherit;font-size:13.5px;cursor:pointer;max-width:170px}
.langpick select:hover{color:var(--foreground);border-color:var(--border-strong)}
.langpick select:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.foot-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}
.foot-col h3{font-family:inherit;font-size:14px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--foreground);margin:0 0 10px}
.foot-col a{display:block;color:var(--muted-foreground);font-size:14px;padding:7px 0}
.foot-col a:hover{color:var(--foreground)}
.foot-bottom{display:flex;align-items:center;gap:16px;margin-top:40px;padding:20px 0 30px;border-top:1px solid var(--border)}
.muted{color:var(--muted-foreground);font-size:13px}
@media (max-width:1151px){footer .wrap{padding-left:16px;padding-right:16px}}
@media (max-width:900px){.foot-top{grid-template-columns:1fr;gap:30px;padding-top:40px}}
@media (max-width:640px){.foot-cols{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.foot-bottom{flex-wrap:wrap}}
`

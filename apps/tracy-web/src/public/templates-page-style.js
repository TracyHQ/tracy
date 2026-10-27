/**
 * The stylesheet of the public Templates pages (issue #1762): the cards, galleries and detail blocks
 * from the mockup Akemi approved on 26/10/2026 (Fraunces headings, Inter body, terracotta accents),
 * wrapped in the tracy.ai chrome from `templates-chrome-style.js` (tokens, background, header, hero
 * type, footer). Everything here takes its colours from the tokens declared there, so each rule is
 * right in both themes with no per-theme pair.
 *
 * 🔒 NO COMMENTS INSIDE THE CSS STRING (same reason as `lib/page-shell.js`: a comment there is shipped
 * bytes, and `check-language` reads the literal as one string).
 */
import { BACKGROUND_CSS, FOOTER_CSS, HEADER_CSS, HERO_CSS, TOKENS_CSS } from './templates-chrome-style.js'

const BASE_CSS = `*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--background);color:var(--foreground);font:400 16px/1.6 "Inter",ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden}
h1,h2,h3{font-family:"Fraunces",Georgia,serif;font-weight:600;line-height:1.15;margin:0}
a{color:var(--primary);text-decoration:none}
a:hover{color:var(--primary-hover)}
a:focus-visible{outline:1px solid var(--primary);outline-offset:2px}
img{max-width:100%}
.wrap{max-width:1120px;margin:0 auto;padding:0 16px}
main.wrap{max-width:1152px}
main.wrap.wide{max-width:1312px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 20px;border-radius:8px;font-size:15px;font-weight:500;line-height:1;border:1px solid transparent;white-space:nowrap}
.btn-primary{background:var(--primary-fill);color:var(--primary-foreground)}
.btn-primary:hover{background:var(--primary);color:var(--primary-foreground)}
.btn-ghost{border-color:var(--strong);color:var(--foreground);background:var(--panel-2)}
.btn-ghost:hover{border-color:var(--primary);color:var(--foreground)}
.btn-sm{padding:8px 15px;font-size:14px}
.btn .ico{width:18px;height:18px;flex-shrink:0}
.badge .ico{width:15px;height:15px;flex-shrink:0}
.btn .ext{width:16px;height:16px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.crumbs{font-size:14px;color:var(--muted-foreground);padding-top:22px;margin-bottom:18px;overflow-wrap:anywhere}
.crumbs i{font-style:normal;margin:0 6px}
.split{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:40px;align-items:start;padding-bottom:8px}
.info{min-width:0}
.stage-col{min-width:0;padding-top:22px}
.info .lead{margin:12px 0 0}
.info h1{font-size:clamp(32px,3.4vw,42px);line-height:1.12;letter-spacing:-.03em;overflow-wrap:anywhere;text-wrap:balance;margin:0}
.badges{display:flex;gap:6px;flex-wrap:nowrap}
.badge{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:28px;height:28px;border-radius:999px;background:var(--soft);color:var(--foreground);font-size:12.5px;font-weight:600}
.cta{margin:18px 0 10px;display:grid;gap:10px;width:100%;justify-items:stretch}
.cta-label{margin:0 0 -2px;font-size:13.5px;font-weight:500;color:var(--muted-foreground)}
.cta-row{display:flex;gap:8px}
.cta-row .btn{flex:1 1 0;min-width:0}
.cta .btn{padding:11px 18px;font-size:15px;font-weight:600}
.dside{margin-top:18px;padding:2px 16px;background:var(--glass);border:1px solid var(--glass-border);border-radius:14px;box-shadow:0 18px 40px -34px color-mix(in oklab,var(--foreground) 40%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.facts{list-style:none;margin:0;padding:0}
.facts li{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;line-height:1.4}
.facts li:last-child{border-bottom:0}
.facts b{font-weight:600}
.facts span{color:var(--muted-foreground);text-align:right}
.facts span a{color:var(--primary);font-weight:500}
.hero-shot{aspect-ratio:16/10;border:1px solid var(--glass-border);border-radius:16px;overflow:hidden;box-shadow:0 30px 60px -40px color-mix(in oklab,var(--foreground) 55%,transparent);background:var(--card)}
.hero-shot img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.tabs{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:26px}
.filters{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;justify-content:space-between;margin-top:26px}
.filters .tabs{margin-top:0;justify-content:flex-start}
.ind{position:relative;display:inline-flex;align-items:center}
.ind::after{content:"";position:absolute;right:16px;top:50%;width:7px;height:7px;margin-top:-6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);pointer-events:none;color:var(--muted-foreground)}
.ind select{appearance:none;-webkit-appearance:none;cursor:pointer;font-family:inherit;padding:8px 38px 8px 16px;border-radius:999px;border:1px solid var(--strong);background:var(--panel-2);color:var(--foreground);font-size:14.5px;font-weight:500;line-height:1.3}
.ind select:hover{border-color:var(--primary)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.nomatch{text-align:center;margin-top:40px}
.linkbtn{font:inherit;color:var(--primary);background:none;border:0;padding:0;cursor:pointer;text-decoration:underline}
@media (max-width:640px){.filters{display:block}.filters .ind{display:flex;width:100%;margin-top:12px}.filters select{width:100%}}
.tabs[hidden],.tcard[hidden],.filters[hidden],.nomatch[hidden]{display:none}
.tab{cursor:pointer;font-family:inherit;padding:8px 16px;border-radius:999px;border:1px solid var(--strong);background:var(--panel-2);color:var(--foreground);font-size:14.5px;font-weight:500}
.tab{display:inline-flex;align-items:center}
.tab .ico{width:16px;height:16px;margin-right:6px;flex-shrink:0}
.tab b{font-weight:500;color:var(--muted-foreground);margin-left:4px}
.tab.on{background:var(--primary-fill);border-color:var(--primary-fill);color:var(--primary-foreground)}
.tab.on b{color:color-mix(in oklab,var(--primary-foreground) 80%,transparent)}
.sec{margin-top:72px}
.sec h2{font-size:clamp(26px,3.6vw,36px)}
.sub{color:var(--muted-foreground);margin:8px 0 22px}
.lays{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
figure{margin:0}
figcaption{font-size:14px;font-weight:500;margin-top:8px}
.lshot{aspect-ratio:16/10;overflow:hidden;border:1px solid var(--glass-border);border-radius:12px;background:var(--card)}
.lshot img,.tshot img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.noshot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;height:100%;padding:12px;text-align:center;background:var(--soft);color:var(--primary);font-family:"Fraunces",Georgia,serif;font-size:18px;line-height:1.25}
.noshot small{font:13px "Inter",sans-serif;color:var(--muted-foreground)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:22px}
.tcard{display:flex;flex-direction:column;background:var(--glass);border:1px solid var(--glass-border);box-shadow:0 18px 40px -34px color-mix(in oklab,var(--foreground) 40%,transparent);border-radius:14px;overflow:hidden;color:var(--foreground);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:transform .15s}
.tcard:hover{transform:translateY(-3px);color:var(--foreground)}
.tshot{aspect-ratio:16/10;overflow:hidden;background:var(--soft)}
.tbody{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px;flex:1}
.tbody h3{font-size:17px}
.tbody p{margin:0;color:var(--muted-foreground);font-size:14px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.tbody .tmeta{margin-top:auto;padding-top:4px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.tbody .tind{min-width:0;height:28px;line-height:28px;padding:0 10px;border-radius:999px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:var(--soft);color:var(--foreground);font-size:12.5px;font-weight:600}
.allt{margin:32px 0 0;text-align:center}
.lost{text-align:center;padding:96px 0 40px}
.lost .lead{margin:14px auto 26px;max-width:560px}
@media (max-width:1199px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:899px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:900px){.lays{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1024px){.split{grid-template-columns:1fr;gap:20px}.stage-col{padding-top:0}.dside{margin-top:20px}}
@media (max-width:599px){.grid{grid-template-columns:1fr}}
@media (max-width:560px){.sec{margin-top:56px}.lays{grid-template-columns:1fr}.tbody h3{font-size:18px}.cta .btn{flex:1 1 100%}}
@media (prefers-reduced-motion:reduce){.tcard{transition:none}.tcard:hover{transform:none}}
`

const PREVIEW_CSS = `.pv{margin-top:4px}
.pv-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:10px 16px;margin-bottom:12px}
.pv-tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pv-dev{display:flex;gap:2px;padding:2px;border-radius:999px;border:1px solid var(--strong);background:var(--panel-2)}
.pv-dev[hidden]{display:none}
.pv-dev button{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;border:0;background:transparent;color:var(--muted-foreground);font:500 13.5px "Inter",sans-serif;cursor:pointer}
.pv-dev button:hover{color:var(--foreground)}
.pv-dev button[aria-pressed="true"]{background:var(--foreground);color:var(--background)}
.pv-dev button:focus-visible,.pv-start:focus-visible{outline:1px solid var(--primary);outline-offset:2px}
.pv-dev svg{width:15px;height:15px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pv-window{position:relative;border:1px solid var(--glass-border);border-radius:16px;overflow:hidden;background:var(--card);box-shadow:0 30px 60px -40px color-mix(in oklab,var(--foreground) 55%,transparent)}
.pv-chrome{display:flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-bottom:1px solid var(--border);background:var(--panel-2)}
.pv-chrome i{width:10px;height:10px;border-radius:50%;background:var(--border-strong);flex-shrink:0}
.pv-addr{flex:1;min-width:0;margin-left:12px;padding:3px 12px;border-radius:999px;background:var(--background);color:var(--muted-foreground);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}
.pv-view{position:relative;aspect-ratio:16/10;width:100%;overflow:hidden;background:var(--background)}
.pv-poster{position:absolute;inset:0}
.pv-poster img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.pv-start{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);box-shadow:0 12px 30px -12px color-mix(in oklab,var(--foreground) 60%,transparent)}
.pv.js:not(.tap) .pv-start,.pv.loading .pv-start,.pv.live .pv-start{display:none}
.pv-loader{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--background);color:var(--muted-foreground);font-size:13px;opacity:0;pointer-events:none;transition:opacity .15s ease-out}
.pv-loader img{animation:pvspin 9s linear infinite}
.pv.loading .pv-loader{opacity:1}
@keyframes pvspin{to{transform:rotate(360deg)}}
.pv-frame{position:absolute;top:0;left:0;width:100%;height:100%;border:0;background:var(--background);transform-origin:top left;transition:opacity .15s ease-out}
.pv.loading .pv-frame{opacity:0;pointer-events:none}
.pv-note{position:absolute;left:16px;right:16px;bottom:16px;margin:0;padding:10px 14px;border-radius:10px;background:var(--card);border:1px solid var(--border);color:var(--foreground);font-size:14px;text-align:center}
.pv.live .pv-poster{visibility:hidden}
.pv.phone .pv-stage{padding:20px 12px;border:1px solid var(--glass-border);border-radius:16px;background:var(--glass)}
.pv.phone .pv-window{width:min(398px,100%);margin:0 auto;border:4px solid var(--border-strong);border-radius:28px}
.pv.phone .pv-chrome{display:none}
.pv.phone .pv-view{aspect-ratio:auto;height:844px}
@media (max-width:720px){.pv-bar{justify-content:stretch}.pv-tools{width:100%;justify-content:space-between;flex-wrap:nowrap;gap:8px}.pv-dev button{padding:5px 10px;font-size:13px}.pv-chrome{height:30px}.pv-chrome i{width:8px;height:8px}.pv-start{bottom:50%;transform:translate(-50%,50%)}.pv.phone .pv-stage{padding:0;border:0;background:none}}
@media (prefers-reduced-motion:reduce){.pv-loader img{animation:none}.pv-loader,.pv-frame{transition:none}}
`

export const TEMPLATES_CSS =
  TOKENS_CSS + BASE_CSS + PREVIEW_CSS + BACKGROUND_CSS + HEADER_CSS + HERO_CSS + FOOTER_CSS

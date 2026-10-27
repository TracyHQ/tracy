// Fixture of issue #56: at a mobile width each header has one drawer toggle, and the two say nothing
// alike. The source is written as the T4 header of JA Vega writes it — an icon-only
// `span.js-offcanvas-trigger.t4-offcanvas-toggle[data-offcanvas-trigger]` (no text, no aria-label)
// naming the `div.t4-offcanvas` at the end of the body, which js-offcanvas gives `aria-controls` and
// `aria-expanded` once it runs (`aria: false` leaves them out, as before the script runs); the site as
// core/navigation writes it — a button `aria-haspopup="dialog"` labelled "Open the menu" with the
// responsive container beside it inside the header. Both drawers open on a click, fixed to the right
// edge, and hold the same words: compared, they are clean.
// `site` options move the site away from the source: `wide` draws the drawer 343 px wide against the
// source's 300; `reorder` writes its items in another order; `sticky` has the drawer ignore Escape and
// its toggle (only a reload closes it); `search` adds a Search button over a panel that only a reload
// closes; `second` adds a second drawer toggle; `noPanel` has the toggle name a panel not in the page.
// At 1440 neither side shows a drawer toggle, and the desktop menus are plain links: nothing to open.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildContract, specHash } from '../visual/contract.mjs'

const ITEMS = ['Home', 'About us', 'Services', 'Contact']

const css = (x, o, side) => `body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}
html[data-theme=dark] body{color:rgb(236,234,228);background:rgb(16,18,20)}
main{padding:40px}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}
header{position:relative;background:rgb(255,255,255);height:64px}
html[data-theme=dark] header{background:rgb(30,32,34)}
.${x}-nav{display:flex;gap:24px;margin:0;padding:0 40px;list-style:none;height:64px;align-items:center}
.${x}-nav a{font-size:15px;color:inherit;text-decoration:none}
.${x}-toggle{display:none;position:absolute;right:16px;top:16px;width:32px;height:32px;padding:0;border:0;background:none;color:inherit;cursor:pointer}
.${x}-bars{display:block;width:24px;height:3px;margin:14px 4px;background:currentColor;box-shadow:0 -8px 0 currentColor,0 8px 0 currentColor}
.${x}-search-btn{display:none;position:absolute;right:64px;top:16px;font-size:15px;border:0;background:none;color:inherit}
.${x}-search{display:none;position:absolute;top:64px;left:0;right:0;padding:16px;background:rgb(255,255,255)}
.${x}-search.open{display:block}
@media (max-width:991px){.${x}-nav{display:none}.${x}-toggle{display:block}.${x}-search-btn{display:block}}
${side === 'source' ? `.${x}-panel{position:fixed}` : ''}
.${x}-panel{display:none;top:0;right:0;width:300px;height:100vh;box-sizing:border-box;padding:16px 24px;background:rgb(255,255,255);z-index:10}
html[data-theme=dark] .${x}-panel{background:rgb(30,32,34)}
.${x}-panel.open{display:block;position:fixed}
.${x}-panel ul{list-style:none;margin:48px 0 0;padding:0}
.${x}-panel a{display:block;font-size:18px;line-height:28px;color:inherit;text-decoration:none}
.${x}-close{position:absolute;right:16px;top:16px;width:32px;height:32px;font-size:24px;line-height:32px;border:0;padding:0;background:none;color:inherit}
${o.wide ? `.${x}-panel{width:343px}` : ''}`

const list = (o) => `<ul>${(o.reorder ? [...ITEMS].reverse() : ITEMS).map((w) => `<li><a href="/${w.toLowerCase().replace(/\W+/g, '-')}/">${w}</a></li>`).join('')}</ul>`
const desktop = (x) => `<ul class="${x}-nav">${ITEMS.map((w) => `<li><a href="/${w.toLowerCase().replace(/\W+/g, '-')}/">${w}</a></li>`).join('')}</ul>`

// The site's script: the dialog button opens the container beside it; Escape, the close button and
// the toggle again close it — unless `sticky`. The Search panel of `search` only ever opens.
const SITE_SCRIPT = (o) => `<script>
try{const m=document.cookie.match(/tracy_theme=(dark|light)/);if(m)document.documentElement.setAttribute('data-theme',m[1])}catch(e){}
document.addEventListener('click',(e)=>{
  const s=e.target.closest('.tracy-search-btn');if(s){document.getElementById('tracy-search').classList.add('open');s.setAttribute('aria-expanded','true');return}
  const c=e.target.closest('.tracy-close');if(c&&!${Boolean(o.sticky)}){c.closest('.tracy-panel').classList.remove('open');return}
  const b=e.target.closest('[aria-haspopup="dialog"]');if(!b)return;const p=b.nextElementSibling;const open=${o.sticky ? 'true' : "!p.classList.contains('open')"};p.classList.toggle('open',open)})
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!${Boolean(o.sticky)})for(const p of document.querySelectorAll('.tracy-panel.open'))p.classList.remove('open')})
</script>`

// js-offcanvas as T4 runs it: the trigger gets aria-controls/aria-expanded, a click on it (or on the
// close button) toggles the panel, Escape closes it.
const SOURCE_SCRIPT = (o) => `<script>
addEventListener('DOMContentLoaded',()=>{${o.aria === false ? '' : "for(const t of document.querySelectorAll('[data-offcanvas-trigger]')){t.setAttribute('aria-controls',t.dataset.offcanvasTrigger);t.setAttribute('aria-expanded','false')}"}})
const set=(p,open)=>{p.style.display=open?'block':'none';for(const t of document.querySelectorAll('[data-offcanvas-trigger="'+p.id+'"]'))if(t.hasAttribute('aria-expanded'))t.setAttribute('aria-expanded',String(open))}
document.addEventListener('click',(e)=>{const c=e.target.closest('.jv-close');if(c)return set(c.closest('.t4-offcanvas'),false);const t=e.target.closest('[data-offcanvas-trigger]');if(!t)return;const p=document.getElementById(t.dataset.offcanvasTrigger);if(p)set(p,p.style.display==='none')})
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')for(const p of document.querySelectorAll('.t4-offcanvas'))set(p,false)})
</script>`

const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
const MAIN = `<main><h1>Building the groundwork</h1>${words}</main><footer><p>Groundwork Ltd.</p></footer>`
const close = (x) => `<button class="${x}-close" type="button" aria-label="Close">×</button>`

export const sitePage = (o = {}) => {
  const toggle = (n) => `<button class="tracy-toggle" type="button" aria-haspopup="dialog" aria-label="Open the menu"${n ? ` style="right:${16 + 40 * n}px"` : ''}><span class="tracy-bars" aria-hidden="true"></span></button>`
  const drawer = `${toggle(0)}<div class="tracy-panel">${close('tracy')}${list(o)}</div>`
  const broken = '<button class="tracy-toggle" type="button" aria-expanded="false" aria-controls="tracy-nowhere" aria-label="Open the menu"><span class="tracy-bars" aria-hidden="true"></span></button>'
  const second = o.second ? `${toggle(1)}<div class="tracy-panel">${close('tracy')}${list(o)}</div>` : ''
  const search = o.search ? '<button class="tracy-search-btn" type="button" aria-expanded="false" aria-controls="tracy-search">Search</button><div class="tracy-search" id="tracy-search"><p>Popular: pricing</p></div>' : ''
  return `<!doctype html><html lang="en"><head><style>${css('tracy', o, 'site')}</style></head><body class="tracy-page-page"><header><nav class="wp-block-navigation">${desktop('tracy')}${o.noPanel ? broken : drawer}${second}</nav>${search}</header>${MAIN}${SITE_SCRIPT(o)}</body></html>`
}

export const sourcePage = (o = {}) =>
  `<!doctype html><html lang="en"><head><style>${css('jv', {}, 'source')}</style></head><body><header id="t4-header">${desktop('jv')}<span id="triggerButton" class="btn js-offcanvas-trigger t4-offcanvas-toggle d-lg-none jv-toggle" data-offcanvas-trigger="off-canvas-right-push"><i class="fa fa-bars toggle-bars jv-bars"></i></span></header>${MAIN}<div class="t4-offcanvas jv-panel" data-offcanvas-options='{"modifiers":"right,push"}' id="off-canvas-right-push" role="complementary" style="display:none;">${close('jv')}${list({})}</div>${SOURCE_SCRIPT(o)}</body></html>`

export function serve(dir) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (p.endsWith('/')) p += 'index.html'
      const file = path.join(dir, p)
      if (!existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end('<html lang="en"><body><main><h1>Not found</h1></main></body></html>')
        return
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(readFileSync(file))
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

/**
 * A spec, a site and a contract for one page (/about/) under `root` (a fresh directory in the OS
 * temporary directory when not given); the source export has a dark of its own (`data-theme=dark`),
 * so the dark axes open the drawer too. `menuPairs` is review.config.json `visual.menuPairs`.
 */
export function fixture(site = {}, source = {}, { root = null, menuPairs = null } = {}) {
  root = mkdtempSync(path.join(root ?? tmpdir(), 'i56-'))
  const siteDir = path.join(root, 'site')
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(siteDir, 'about'), { recursive: true })
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  writeFileSync(path.join(siteDir, 'about', 'index.html'), sitePage(site))
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), sourcePage(source))
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const pageMap = { locales: ['en'], defaultLocale: 'en', theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'About.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }] }
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
  const templates = { '/about/': 'page' }
  const reviewConfig = { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates, ...(menuPairs ? { visual: { menuPairs } } : {}) }
  const contract = buildContract({ pageMap, reference, reviewConfig, themeTemplates: new Set(['page']), specHash: specHash(spec), id: 'i56' })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  return { root, site: siteDir, spec, contractFile, contract }
}

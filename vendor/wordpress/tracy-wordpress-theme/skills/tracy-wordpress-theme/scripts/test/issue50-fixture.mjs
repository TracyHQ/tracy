// Fixture of issue #50: a page whose header owns menus that only show when opened — a mega panel
// (hover, plus a toggle naming it by aria-controls), a hover-only dropdown whose label carries quotes
// and a slash, a click-only search panel, and at 390 px a drawer behind a burger. The site and its
// rendered source write the header differently (other class names, the items in another DOM order,
// drawn in the same order by flex `order`), so a pair can only be made by the trigger's words.
// The mega item is written the two ways measured on JA Vega: the site as a mega-menu block (`div > a +
// button + div`, the button named only by a screen-reader span), the source as a T4 item (`li > a +
// div`, the link itself `aria-haspopup`, opened by hover — a link to its page, never clicked).
// `site` options move one side away from the source: `card` draws the open mega panel as an 880 px
// card with 12 px headings and no icons (the defect of the issue); `tall` draws it taller than the
// viewport; `clipHeader` has the header clip what hangs below it (every panel opens, boxes and styles
// unchanged, and none of it is seen); `iconColor` and `iconShape` draw the mega icons in another
// colour, or as discs, in the same boxes; the others break one trigger each. The source takes `dead` too: its mega item is then a
// link to its page that no hover opens.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildContract, specHash } from '../visual/contract.mjs'

const icon = '<svg class="ico" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="rgb(20,72,58)"/></svg>'
// The site wraps each title's and each link's words in a span (a link's words then have an inline
// box as wide as the words, where the source's block link is as wide as its column) and adds words
// only a screen reader gets; the source writes them bare. The words sit in the same place: no finding.
const col = (h, links, site) => `<div class="col">${icon}<h3>${site ? `<span style="display:block">${h}</span><span class="srt">(opens a section)</span>` : h}</h3>${links.map((l) => `<a href="/x/">${site ? `<span>${l}</span>` : l}</a>`).join('')}</div>`
const megaBody = (site) => `<div class="cols">${col('Consulting', ['Strategy reviews', 'Site audits'], site)}${col('Engineering', ['Structural design', 'Load testing'], site)}${col('Support', ['Maintenance plans'], site)}</div>`

const css = (x, o) => `body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}
main{padding:40px}h1{font-size:40px;line-height:44px}p{font-size:16px;line-height:24px}
header{position:relative;background:rgb(255,255,255);height:64px}
.${x}-nav{display:flex;gap:24px;margin:0;padding:0 40px;list-style:none;height:64px;align-items:center}
.${x}-nav > li{display:flex;align-items:center}
.${x}-nav a,.${x}-nav button,.${x}-burger{font-size:15px;color:rgb(20,23,26);text-decoration:none;background:none;border:0;padding:4px;font-family:Arial;cursor:pointer}
.srt{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
div.${x}-mega-item{display:flex;align-items:center}
.${x}-o1{order:1}.${x}-o2{order:2}.${x}-o3{order:3}.${x}-o4{order:4}.${x}-o5{order:5}.${x}-o6{order:6}
.${x}-drop-item{position:relative}
.${x}-drop{display:none;position:absolute;top:100%;left:0;margin:0;padding:12px;list-style:none;background:rgb(255,255,255);width:200px}
.${x}-drop-item:hover > .${x}-drop{display:block}
.${x}-mega{display:none;position:absolute;top:64px;left:0;right:0;background:rgb(255,255,255);padding:24px 40px}
${o.dead ? '' : `.${x}-mega-item:hover > .${x}-mega,`}.${x}-mega.open{display:block}
.${x}-mega .cols{display:flex;gap:32px}.${x}-mega .col a{display:block;font-size:15px;line-height:22px}
.${x}-mega h3{font-size:24px;line-height:30px;margin:8px 0}
.${x}-mega .ico{width:40px;height:40px;display:block}
.${x}-search,.${x}-lang,.${x}-shop,.${x}-contact{display:none;position:absolute;top:64px;right:40px;width:300px;padding:16px;background:rgb(255,255,255)}
.${x}-search.open,.${x}-lang.open,.${x}-shop.open,.${x}-contact.open{display:block}
.${x}-burger{display:none}
.${x}-drawer{display:none;position:absolute;top:64px;left:0;right:0;background:rgb(255,255,255);padding:16px}
.${x}-drawer.open{display:block}.${x}-drawer a{display:block;font-size:18px;line-height:28px}
@media (max-width:600px){.${x}-nav{display:none}.${x}-burger{display:block;position:absolute;right:16px;top:16px}}
.faq{display:none}.faq.open{display:block}
${o.tall ? `.${x}-mega .cols{min-height:1200px}` : ''}
${o.clipHeader ? 'header{overflow:hidden}' : ''}
${o.iconColor ? `.${x}-mega .ico rect{fill:rgb(180,40,40)}` : ''}
${o.iconShape ? `.${x}-mega .ico rect{rx:20px}` : ''}
${o.card ? `.${x}-mega{left:50%;right:auto;width:880px;margin-left:-440px;box-sizing:border-box}.${x}-mega h3{font-size:12px;line-height:16px}.${x}-mega .ico{display:none}` : ''}`

// A toggle opens the panel its aria-controls names; Escape closes every open panel but a `sticky`
// one, which a `data-open` control only ever opens. `jitter` keeps the Language panel moving while it
// is open (script-driven, so no freeze reaches it).
const SCRIPT = (o) => `<script>
document.addEventListener('click',(e)=>{const o=e.target.closest('[data-open]');if(o){document.getElementById(o.getAttribute('aria-controls')).classList.add('open');o.setAttribute('aria-expanded','true');return}const b=e.target.closest('[data-toggle]');if(!b)return;const p=document.getElementById(b.getAttribute('aria-controls'));if(!p)return;const open=!p.classList.contains('open');p.classList.toggle('open',open);b.setAttribute('aria-expanded',String(open))})
document.addEventListener('keydown',(e)=>{if(e.key!=='Escape')return;for(const p of document.querySelectorAll('.open:not(.sticky)'))p.classList.remove('open');for(const b of document.querySelectorAll('[data-toggle][aria-expanded="true"]'))b.setAttribute('aria-expanded','false')})
${o.jitter ? "let n=0;setInterval(()=>{const p=document.querySelector('[id$=\"-lang\"]');if(p&&p.classList.contains('open'))p.style.paddingTop=(16+(n++%2)*6)+'px'},40)" : ''}
</script>`

/** The header of one side. `x` is its class prefix; `order` the DOM order of the items (drawn in `o1..o6` order). */
function header(x, o, side) {
  const items = {
    services:
      side === 'site'
        ? `<li class="${x}-o2"><div class="${x}-mega-item"><a href="/services/">Our Services</a><button ${o.dead ? '' : 'data-toggle '}aria-expanded="false" aria-controls="${x}-m-services"><span class="srt">Show the Our Services menu</span><span aria-hidden="true">▾</span></button><div class="${x}-mega" id="${x}-m-services">${megaBody(true)}</div></div></li>`
        : `<li class="${x}-mega-item ${x}-o2"><a href="/services/" role="button" aria-haspopup="true" aria-expanded="false">Our Services</a><div class="${x}-mega">${megaBody(false)}</div></li>`,
    work: `<li class="${x}-drop-item ${x}-o1"><a href="/work/">Work &amp; "Cases" / 2026</a><ul class="${x}-drop"><li><a href="/w1/">Case studies</a></li><li><a href="/w2/">Clients</a></li></ul></li>`,
    about: `<li class="${x}-o3"><a href="/about/">About us</a></li>`,
    search: `<li class="${x}-o4"><button ${o.sticky ? 'data-open' : 'data-toggle'} aria-expanded="false" aria-controls="${o.brokenControls ? 'nowhere' : `${x}-search`}">Search</button><div class="${x}-search${o.sticky ? ' sticky' : ''}" id="${x}-search"><p>Popular: pricing</p></div></li>`,
    lang: `<li class="${x}-o5"><button data-toggle aria-expanded="false" aria-controls="${x}-lang">Language</button><div class="${x}-lang" id="${x}-lang"><a href="/de/">Deutsch</a></div></li>`,
    extra: side === 'site' ? `<li class="${x}-o6"><button data-toggle aria-expanded="false" aria-controls="${x}-shop">Shop</button><div class="${x}-shop" id="${x}-shop"><a href="/cart/">Cart</a></div></li>` : `<li class="${x}-o6"><button data-toggle aria-expanded="false" aria-controls="${x}-contact">Contact</button><div class="${x}-contact" id="${x}-contact"><a href="/mail/">Write to us</a></div></li>`
  }
  const order = side === 'site' ? ['services', 'work', 'about', 'search'] : ['search', 'about', 'work', 'services']
  if (o.lang) order.push('lang')
  if (o.extra) order.push('extra')
  const li = order.map((k) => items[k]).join('')
  const dupe = o.dupe ? items.work.replace(`${x}-o1`, `${x}-o6`).replace('/work/', '/work-2/') : ''
  return `<header><ul class="${x}-nav">${li}${dupe}</ul><button class="${x}-burger" data-toggle aria-expanded="false" aria-controls="${x}-drawer">Menu</button><div class="${x}-drawer" id="${x}-drawer"><a href="/">Home</a><a href="/about/">About us</a></div></header>`
}

const words = Array.from({ length: 24 }, (_, i) => `<p>Paragraph number ${i} with enough words to count as text.</p>`).join('')
// An accordion in the body and one in the footer: controls that expand something, outside the header.
const MAIN = `<main><h1>Building the groundwork</h1>${words}<button data-toggle aria-expanded="false" aria-controls="faq">Frequently asked</button><div id="faq" class="faq"><p>An answer that only shows when opened.</p></div></main>`
const FOOTER = '<footer><button data-toggle aria-expanded="false" aria-controls="foot-more">More links</button><div id="foot-more" class="faq"><a href="/legal/">Legal</a></div></footer>'

// `noScript` ships the page with no script at all (a Joomla error page); `inertScript` ships one that handles
// nothing, so the controls that need a script do not react while the CSS menus (hover) still open.
export const sitePage = (o = {}) => `<!doctype html><html lang="en"><head><style>${css('tracy', o)}</style></head><body class="tracy-page-page">${header('tracy', o, 'site')}${MAIN}${FOOTER}${o.noScript ? '' : SCRIPT(o)}</body></html>`
export const sourcePage = (o = {}) => `<!doctype html><html lang="en"><head><style>${css('jv', { dead: o.dead })}</style></head><body>${header('jv', { lang: o.lang, extra: o.extra, sticky: o.sticky }, 'source')}${MAIN}${FOOTER}${o.noScript ? '' : o.inertScript ? '<script>window.ready = true</script>' : SCRIPT({})}</body></html>`

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
 * A spec, a site and a contract for one page (/about/), the site drawn with `site` options; with
 * `second`, a second page of the same layout (/team/, not the layout's representative) drawn the same.
 */
export function fixture(site = {}, source = {}, { second = false, secondSource = source, secondSite = site } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'i50-'))
  const siteDir = path.join(root, 'site')
  const spec = path.join(root, 'spec')
  mkdirSync(path.join(siteDir, 'about'), { recursive: true })
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  writeFileSync(path.join(siteDir, 'about', 'index.html'), sitePage(site))
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), sourcePage(source))
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  const pageMap = { locales: ['en'], defaultLocale: 'en', pages: [{ file: 'About.html', view: 'page', title: 'Building the groundwork', path: '/about/', locale: 'en' }] }
  const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
  const templates = { '/about/': 'page' }
  if (second) {
    mkdirSync(path.join(siteDir, 'team'), { recursive: true })
    writeFileSync(path.join(siteDir, 'team', 'index.html'), sitePage(secondSite))
    writeFileSync(path.join(spec, 'reference', 'rendered', 'team--1440-light.html'), sourcePage(secondSource))
    pageMap.pages.push({ file: 'Team.html', view: 'page', title: 'Building the groundwork', path: '/team/', locale: 'en' })
    reference.pages.push({ page: 'Team.html', path: 'reference/rendered/team--1440-light.html' })
    templates['/team/'] = 'page'
  }
  const contract = buildContract({ pageMap, reference, reviewConfig: { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, mega: false, templates }, themeTemplates: new Set(['page']), specHash: specHash(spec), id: 'i50' })
  const contractFile = path.join(root, 'visual.contract.json')
  writeFileSync(contractFile, JSON.stringify(contract))
  return { root, site: siteDir, spec, contractFile, contract }
}

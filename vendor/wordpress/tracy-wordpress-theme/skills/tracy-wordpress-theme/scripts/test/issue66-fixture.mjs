// Fixture of issue #66: pages written as a T3 Framework (Bootstrap 3) source writes them — JA Morgan's
// markup, 26/09 — against a WordPress site page, for the selector profile of every tool.
//
// Source (T3):
//   t3HomePage     a home page built of sections only: no `<main>`, no `.t3-mainbody` — a topbar outside
//                  the header, a hero, `div.t3-section` bands whose titles are h3, a body accordion
//                  (`a[data-toggle="collapse"][href="#…"]` outside the header), a spotlight footer, and
//                  the header's three triggers: a hover mega dropdown (`li.dropdown > a[data-toggle=
//                  "dropdown"] + div.dropdown-menu`), Bootstrap 3's burger `button.navbar-toggle
//                  [data-toggle="collapse"][data-target=".t3-navbar-collapse"]` (shown under 768 px) and
//                  T3's `button.off-canvas-toggle[data-nav="#t3-off-canvas"]`, whose panel the page's
//                  script moves from the header to the end of the body, as T3's does.
//   t3ArticlePage  an article: a `.t3-masthead` title (h3), `.t3-mainbody` with the content (h2, h3) and a
//                  `.t3-sidebar` module (h3), the same topbar, header and footer.
// Site (WordPress): sitePage — `<main>` with the same words, a core/navigation-like header: a hover
// submenu "Home", a drawer button `aria-haspopup="dialog"` "Open the sidebar", and under 768 px a
// "Toggle navigation" button naming its panel by aria-controls.
// Failure cases: brokenHeaderPage — collapse targets that name two elements, none, or a selector that
// is not an id or a single class; an off-canvas toggle naming a missing panel; a panel already open; a
// hidden toggle; two toggles of one panel; a collapse link that leaves the page; a body accordion.
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Section titles the source and the site both show. */
export const SECTIONS = ['Morgan helps business performance', 'Fifteen years of experience in finance']
export const HERO = 'Business insights for people'
export const TOPBAR_WORDS = 'Call our advisers any weekday from nine until five'
export const OFFCANVAS_WORDS = 'Browse every service we offer from this side panel'
export const FOOTER_WORDS = 'Copyright Morgan Advisers all rights reserved worldwide'
export const SIDEBAR_WORDS = 'Quarterly market outlook published for our clients'
const para = (i) => `<p>Paragraph ${i} about the advisory work and the clients we serve.</p>`

const SOURCE_CSS = `body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);border:0}
.t3-topbar{height:32px;padding:0 40px;background:rgb(30,30,30);color:rgb(255,255,255)}
.t3-topbar h3,.t3-topbar p{margin:0;font-size:12px;line-height:16px}
.t3-header{position:relative;background:rgb(255,255,255);height:64px}
.collapse{display:none}.collapse.in{display:block}
.nav{list-style:none;margin:0;padding:0}
.t3-navbar .level0{display:flex;gap:24px;padding:0 40px;height:64px;align-items:center}
.t3-navbar .level0>li{position:relative}
.t3-navbar a{font-size:15px;color:inherit;text-decoration:none}
.dropdown-menu{display:none;position:absolute;left:0;top:100%;min-width:220px;padding:12px;background:rgb(255,255,255);z-index:5}
.dropdown-menu a{display:block;font-size:14px;line-height:28px}
.t3-navbar li.dropdown:hover>.dropdown-menu{display:block}
.navbar-toggle{display:none;position:absolute;right:64px;top:16px;width:32px;height:32px;padding:0;border:0;background:rgb(10,100,200);cursor:pointer}
.off-canvas-toggle{position:absolute;right:16px;top:16px;width:32px;height:32px;padding:0;border:0;background:rgb(10,100,200);cursor:pointer}
.bars{display:block;width:24px;height:3px;margin:14px 4px;background:rgb(255,255,255)}
.t3-navbar-collapse{position:absolute;top:64px;left:0;right:0;padding:12px 24px;background:rgb(255,255,255);z-index:5}
.t3-navbar-collapse a{display:block;font-size:16px;line-height:32px;color:inherit;text-decoration:none}
@media (min-width:768px){.t3-navbar.navbar-collapse.collapse{display:block}.t3-navbar-collapse.collapse.in{display:none}}
@media (max-width:767px){.navbar-toggle{display:block}.t3-navbar{display:none!important}}
.t3-off-canvas{display:none;position:fixed;top:0;right:0;width:300px;height:100vh;box-sizing:border-box;padding:16px 24px;background:rgb(255,255,255);z-index:10}
html.off-canvas-open .t3-off-canvas{display:block}
.t3-off-canvas a{display:block;font-size:18px;line-height:28px;color:inherit;text-decoration:none}
.t3-off-canvas .close{position:absolute;right:16px;top:16px;width:32px;height:32px;border:0;background:none}
.t3-hero{padding:40px;background:rgb(200,220,240)}
.t3-hero h1{margin:0;font-size:40px;line-height:48px}
.t3-section{padding:40px}.mod-bg-gray{background:rgb(235,235,235)}
.t3-section h3,.t3-masthead h3,.t3-mainbody h3{font-size:28px;line-height:36px;margin:0 0 12px}
.t3-mainbody h2{font-size:32px;line-height:40px}
.t3-masthead{padding:32px 40px;background:rgb(220,220,220)}
.t3-mainbody{display:flex;gap:32px;padding:40px}.t3-content{flex:2}.t3-sidebar{flex:1}
.t3-footer{padding:24px 40px;background:rgb(40,40,40);color:rgb(255,255,255)}
.t3-footer h3{font-size:18px}`

// T3's scripts as they behave: the off-canvas panel is moved to the body, its toggle (and Escape, and
// its close button) switch html.off-canvas-open; Bootstrap 3's collapse toggles `in` on the element
// its data-target (or href) selects.
const SOURCE_SCRIPT = `<script>
addEventListener('DOMContentLoaded',()=>{const oc=document.getElementById('t3-off-canvas');if(oc)document.body.appendChild(oc)})
document.addEventListener('click',(e)=>{
  if(e.target.closest('.t3-off-canvas .close')){document.documentElement.classList.remove('off-canvas-open');return}
  if(e.target.closest('.off-canvas-toggle[data-nav]')){document.documentElement.classList.toggle('off-canvas-open');return}
  const k=e.target.closest('[data-toggle="collapse"]');if(!k)return;e.preventDefault()
  let p=null;try{p=document.querySelector(k.getAttribute('data-target')||k.getAttribute('href'))}catch(x){}
  if(p)p.classList.toggle('in')})
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')document.documentElement.classList.remove('off-canvas-open')})
</script>`

const TOPBAR = `<div class="t3-topbar"><div class="topbar-left pull-left hidden-xs"><h3>Call us today</h3><p>${TOPBAR_WORDS}</p></div></div>`
const MEGA = `<li class="dropdown mega" data-level="1"><a class="dropdown-toggle" href="/" data-target="#" data-toggle="dropdown">Home</a><div class="nav-child dropdown-menu mega-dropdown-menu"><div class="mega-dropdown-inner"><ul class="mega-nav"><li><a href="/home/home-style-1">Home style one</a></li><li><a href="/home/home-style-2">Home style two</a></li></ul></div></div></li>`
const HEADER = `<header id="t3-header" class="t3-header"><nav id="t3-mainnav" class="navbar navbar-default t3-mainnav">
<div class="t3-navbar-collapse navbar-collapse collapse"><ul class="nav navbar-nav"><li><a href="/">Home</a></li><li><a href="/about-us">About us</a></li><li><a href="/contact">Contact</a></li></ul></div>
<div class="t3-navbar navbar-collapse collapse"><div class="t3-megamenu" data-responsive="true"><ul class="nav navbar-nav level0">${MEGA}<li><a href="/about-us">About us</a></li><li><a href="/contact">Contact</a></li></ul></div></div>
</nav>
<button type="button" class="navbar-toggle" data-toggle="collapse" data-target=".t3-navbar-collapse"><span class="sr-only">Toggle navigation</span><i class="bars"></i></button>
<button class="btn btn-primary off-canvas-toggle" type="button" data-pos="right" data-nav="#t3-off-canvas" data-effect="off-canvas-effect-4"><i class="bars"></i></button>
<div id="t3-off-canvas" class="t3-off-canvas"><div class="t3-off-canvas-header"><h2 class="t3-off-canvas-header-title">Sidebar</h2><button type="button" class="close" aria-hidden="true">×</button></div><div class="t3-off-canvas-body"><p>${OFFCANVAS_WORDS}</p><ul><li><a href="/services">Services</a></li><li><a href="/careers">Careers</a></li></ul></div></div>
</header>`
const FOOTER = `<footer id="t3-footer" class="wrap t3-footer"><div id="t3-spotlight" class="t3-spotlight-wrap t3-spotlight"><div class="t3-spotlight t3-footnav row"><div class="t3-module"><h3>Navigate.</h3><ul><li><a href="/about-us">About us</a></li></ul></div></div></div><div class="t3-copyright"><p>${FOOTER_WORDS}</p></div></footer>`
const ACCORDION = '<div class="acm-accordion panel-group"><div class="panel-heading"><a class="collapsed" role="button" data-toggle="collapse" href="#collapse-1" aria-expanded="false" aria-controls="collapse-1">What does an adviser do for a small firm</a></div><div id="collapse-1" class="panel-collapse collapse"><p>An adviser reads the accounts and plans the year ahead with you.</p></div></div>'

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${SOURCE_CSS}</style></head><body><div class="t3-wrapper">${body}</div>${SOURCE_SCRIPT}</body></html>`

/** A T3 home page of sections only (JA Morgan /home/home-style-1): no `<main>`, no `.t3-mainbody`. */
export const t3HomePage = () =>
  page(`${TOPBAR}${HEADER}<div class="wrap t3-hero"><div class="hero-item"><h1>${HERO}</h1></div></div>
<div id="t3-section-top" class="t3-section-wrap wrap">
<div class="t3-section section padding-top mod-bg-gray" id="Section101"><div class="section-inner"><div class="section-ct"><div class="section-title"><h3>${SECTIONS[0]}</h3></div>${para(1)}${para(2)}</div></div></div>
<div class="t3-section section mod-bg-white" id="Section102"><div class="section-inner"><div class="section-ct"><div class="section-title"><h3>${SECTIONS[1]}</h3></div>${para(3)}${ACCORDION}</div></div></div>
</div>${FOOTER}`)

/** The T3 home as JA Morgan draws it: the Bootstrap 3 burger is an icon with no words at all. */
const t3IconHomePage = () => t3HomePage().replace('<span class="sr-only">Toggle navigation</span>', '')

/** The T3 home with its header drawn as a `<div>`: no `header` or `banner` the menu census reads. */
const t3DivHeaderPage = () => t3HomePage().replace('<header id="t3-header"', '<div id="t3-header"').replace('</header>', '</div>')

/** T3 section bands with h3 titles only — no hero, no h1/h2: nothing the T4 lists read. */
export const t3SectionsPage = () =>
  page(`${TOPBAR}${HEADER}<div id="t3-section-top" class="t3-section-wrap wrap">
<div class="t3-section section mod-bg-gray"><div class="section-title"><h3>${SECTIONS[0]}</h3></div>${para(1)}</div>
<div class="t3-section section"><div class="section-title"><h3>${SECTIONS[1]}</h3></div>${para(3)}</div>
</div>${FOOTER}`)

/** A T3 article: masthead, `.t3-mainbody` with content and a sidebar module. */
export const t3ArticlePage = () =>
  page(`${TOPBAR}${HEADER}<div class="t3-masthead"><h3 class="masthead-title">About our company</h3></div>
<div id="t3-mainbody" class="container t3-mainbody"><div id="t3-content" class="t3-content"><div class="item-page"><h2>Our long history of service</h2>${para(4)}<h3>What we value most</h3>${para(5)}</div></div>
<div class="t3-sidebar t3-sidebar-right"><div class="t3-module module"><h3 class="module-title">Latest news</h3><ul><li>${SIDEBAR_WORDS}</li></ul></div></div></div>${FOOTER}`)

/** A page with nothing in it: no heading, no header, no identity. */
export const emptyPage = () => '<!doctype html><html lang="en"><head></head><body><div></body></html>'

const SITE_CSS = `body{margin:0;font-family:Arial;color:rgb(20,23,26);background:rgb(245,243,238)}
header{position:relative;background:rgb(255,255,255);height:64px}
.wp-block-navigation ul{display:flex;gap:24px;margin:0;padding:0 40px;list-style:none;height:64px;align-items:center}
.wp-block-navigation li{position:relative}
.wp-block-navigation a{font-size:15px;color:inherit;text-decoration:none}
.wp-block-navigation .sub{display:none;position:absolute;left:0;top:100%;min-width:220px;padding:12px;background:rgb(255,255,255);height:auto;flex-direction:column;gap:0;z-index:5}
.wp-block-navigation li:hover>.sub{display:block}
.sub a{display:block;font-size:14px;line-height:28px}
.menu-btn{display:none;position:absolute;right:64px;top:16px;width:32px;height:32px;padding:0;border:0;background:rgb(10,100,200)}
.drawer-btn{position:absolute;right:16px;top:16px;width:32px;height:32px;padding:0;border:0;background:rgb(10,100,200)}
.mobile{display:none;position:absolute;top:64px;left:0;right:0;padding:12px 24px;background:rgb(255,255,255);z-index:5}
.mobile.open{display:block}.mobile a{display:block;font-size:16px;line-height:32px;color:inherit;text-decoration:none}
.drawer{display:none;position:fixed;top:0;right:0;width:300px;height:100vh;box-sizing:border-box;padding:16px 24px;background:rgb(255,255,255);z-index:10}
.drawer.open{display:block}.drawer a{display:block;font-size:18px;line-height:28px;color:inherit;text-decoration:none}
@media (max-width:767px){.wp-block-navigation{display:none}.menu-btn{display:block}}
main h1{margin:0;padding:40px;font-size:40px;line-height:48px;background:rgb(200,220,240)}
section{padding:40px}.band-gray{background:rgb(235,235,235)}
section h3{font-size:28px;line-height:36px;margin:0 0 12px}
footer{padding:24px 40px;background:rgb(40,40,40);color:rgb(255,255,255)}`

const SITE_SCRIPT = `<script>
document.addEventListener('click',(e)=>{
  const d=e.target.closest('[aria-haspopup="dialog"]');if(d){d.nextElementSibling.classList.toggle('open');return}
  const m=e.target.closest('[aria-controls]');if(m){const p=document.getElementById(m.getAttribute('aria-controls'));const o=!p.classList.contains('open');p.classList.toggle('open',o);m.setAttribute('aria-expanded',String(o))}})
document.addEventListener('keydown',(e)=>{if(e.key==='Escape')for(const p of document.querySelectorAll('.open'))p.classList.remove('open')})
</script>`

/** The WordPress port of the home page: `<main>`, core/navigation-like header, a drawer and a mobile menu. */
export const sitePage = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${SITE_CSS}</style></head><body class="tracy-page-page">
<header class="wp-block-template-part"><nav class="wp-block-navigation"><ul><li><a href="/">Home</a><ul class="sub"><li><a href="/home/home-style-1">Home style one</a></li><li><a href="/home/home-style-2">Home style two</a></li></ul></li><li><a href="/about-us">About us</a></li><li><a href="/contact">Contact</a></li></ul></nav>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-mobile" aria-label="Toggle navigation"></button><div class="mobile" id="site-mobile"><a href="/">Home</a><a href="/about-us">About us</a><a href="/contact">Contact</a></div>
<button class="drawer-btn" type="button" aria-haspopup="dialog" aria-label="Open the sidebar"></button><div class="drawer"><p>${OFFCANVAS_WORDS}</p><a href="/services">Services</a><a href="/careers">Careers</a></div>
</header>
<main><h1>${HERO}</h1><section class="band-gray"><h3>${SECTIONS[0]}</h3>${para(1)}${para(2)}</section><section><h3>${SECTIONS[1]}</h3>${para(3)}</section></main>
<footer><h3>Navigate.</h3><p>${FOOTER_WORDS}</p></footer>${SITE_SCRIPT}</body></html>`

/** A header of toggles that name no single panel, a hidden one, an open one, two of one panel, a link that leaves. */
export const brokenHeaderPage = () =>
  page(`<header class="t3-header" style="height:auto">
<button type="button" data-toggle="collapse" data-target=".dup">Duplicate target</button><div class="dup collapse"><a href="#a">A</a></div><div class="dup collapse"><a href="#b">B</a></div>
<button type="button" data-toggle="collapse" data-target=".nothing-here">Absent target</button>
<button type="button" data-toggle="collapse" data-target="div > .x">Complex target</button>
<button type="button" class="off-canvas-toggle" style="position:static" data-nav="#nowhere">Missing panel</button>
<button type="button" data-toggle="collapse" data-target="#already">Already open</button><div id="already" class="collapse in"><a href="#c">C</a></div>
<button type="button" data-toggle="collapse" data-target="#hid" style="display:none">Hidden toggle</button><div id="hid" class="collapse"><a href="#d">D</a></div>
<button type="button" class="off-canvas-toggle" style="position:static" data-nav="#shared">First owner</button><button type="button" class="off-canvas-toggle" style="position:static" data-nav="#shared">Second owner</button>
<a data-toggle="collapse" href="/elsewhere/">Leaves the page</a>
<button type="button" aria-expanded="false" aria-controls="pa pb">Two controls</button><div id="pa" class="collapse"><a href="#f">F</a></div><div id="pb" class="collapse"><a href="#g">G</a></div>
<button type="button" data-toggle="collapse" data-target="#twin">Duplicate id</button><div id="twin" class="collapse"><a href="#h">H</a></div><div id="twin" class="collapse"><a href="#i">I</a></div>
<button type="button" aria-expanded="false" aria-controls="twin">Duplicate aria id</button>
<button type="button" class="off-canvas-toggle" style="position:static" aria-controls="pc" data-nav="#pd">Conflicting refs</button><div id="pc" class="collapse"><a href="#j">J</a></div><div id="pd" class="t3-off-canvas"><a href="#k">K</a></div>
<button type="button" class="off-canvas-toggle" style="position:static" aria-controls="pe" data-nav="#pe">Agreeing refs</button>
</header><div id="shared" class="t3-off-canvas"><a href="#e">E</a></div><div id="pe" class="t3-off-canvas"><a href="#l">L</a></div>
<div class="t3-section"><h3>Body</h3>${ACCORDION}</div>`)

/** A provenance.json as the Joomla adapter writes it, with `framework` at source.template.css.framework. */
export const provenanceOf = (framework) => ({ adapter: 'from-joomla', source: { template: { name: 'fixture', css: { mode: 'framework', ...(framework === undefined ? {} : { framework }), evidence: [] } } } })

/**
 * Serve the fixture pages: /src/home/ (T3 home), /src/sections/ (T3 sections, no h1/h2), /src/article/
 * (T3 article), /src/icon/ (T3 home, icon-only burger), /src/broken/, /src/empty/, /site/home/, /site/sections/,
 * /site/article/, /site/icon/, /site/empty/.
 * With `mount` ('/src' or '/site') one side is served at the root of its own origin, as http-parity
 * resolves a route against an origin.
 */
export function serve(mount = '') {
  const routes = {
    '/src/home/': t3HomePage,
    '/src/sections/': t3SectionsPage,
    '/src/article/': t3ArticlePage,
    '/src/icon/': t3IconHomePage,
    '/src/broken/': brokenHeaderPage,
    '/src/empty/': emptyPage,
    '/src/divheader/': t3DivHeaderPage,
    '/site/home/': sitePage,
    '/site/sections/': sitePage,
    '/site/article/': sitePage,
    '/site/icon/': sitePage,
    '/site/empty/': emptyPage
  }
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      const p = mount + new URL(req.url, 'http://x').pathname
      const make = routes[p.endsWith('/') ? p : `${p}/`]
      res.writeHead(make ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' })
      res.end(make ? make() : '<html><body><main><h1>Not found</h1></main></body></html>')
    })
    srv.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) }))
  })
}

/**
 * A spec-pack (page-map, reference with the T3 home as the rendered source, provenance.json naming
 * `framework`), a built theme with templates/page.html and a review.config.json, for contract.mjs
 * initContract and a visual-qa run on /about/ (the site page is served there by `serveSite`).
 */
export function specFixture(root, framework) {
  const dir = mkdtempSync(path.join(root ?? tmpdir(), 'i66-'))
  const spec = path.join(dir, 'spec')
  const theme = path.join(dir, 'theme')
  const site = path.join(dir, 'site')
  mkdirSync(path.join(spec, 'reference', 'rendered'), { recursive: true })
  mkdirSync(path.join(theme, 'templates'), { recursive: true })
  mkdirSync(path.join(site, 'about'), { recursive: true })
  writeFileSync(path.join(theme, 'templates', 'page.html'), '<!-- wp:post-content /-->')
  writeFileSync(path.join(site, 'about', 'index.html'), sitePage())
  writeFileSync(path.join(spec, 'reference', 'rendered', 'about--1440-light.html'), t3HomePage())
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ locales: ['en'], defaultLocale: 'en', theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }, pages: [{ file: 'About.html', view: 'page', title: HERO, path: '/about/', locale: 'en' }] }))
  writeFileSync(path.join(spec, 'reference.json'), JSON.stringify({ pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }))
  writeFileSync(path.join(spec, 'sections.json'), JSON.stringify({ slotBlock: 'tracy-base/slot', acm: [], custom: [], other: [] }))
  writeFileSync(path.join(spec, 'content.json'), '{}')
  if (framework !== null) writeFileSync(path.join(spec, 'provenance.json'), JSON.stringify(provenanceOf(framework)))
  const config = path.join(dir, 'review.config.json')
  writeFileSync(config, JSON.stringify({ containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, mega: false, templates: { '/about/': 'page' } }))
  return { dir, spec, theme, site, config }
}

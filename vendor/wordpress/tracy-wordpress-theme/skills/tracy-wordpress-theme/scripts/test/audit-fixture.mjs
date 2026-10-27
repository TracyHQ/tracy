// Fixtures for the audit-class tests (audit-*.test.mjs): a minimal spec the seeder reads, and the small pages the
// content checks run on. Each class has a defective and a corrected form side by side.
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { join } from 'node:path'

const body = (t) => `<!-- wp:paragraph --><p>${t}</p><!-- /wp:paragraph -->`

/** A spec with two categories and `posts`; `posts` default to one article shared by alias across both. */
export function writeSharedSpec(dir, posts = null) {
  const pm = [
    { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page' },
    { file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404' }
  ]
  const page = (i) => ({ ...pm[i], parent: null, status: 'publish', content: body(pm[i].title), meta: {}, images: [] })
  const post = (slug, category, articleId, extra = {}) => ({
    slug,
    path: `/${category}/${slug}`,
    category,
    title: 'Shared Story',
    content: body('One article the demo shows in two categories.'),
    images: [],
    joomla: { articleId: String(articleId), alias: 'shared-story', catid: category },
    ...extra
  })
  const content = {
    site: { name: 'Fake', tagline: 'Site', locales: ['en'], defaultLocale: 'en' },
    pages: [page(0), page(1)],
    posts: posts ?? [post('shared-story', 'blogs', 10), post('shared-story', 'news', 20)],
    categories: [
      { id: '8', title: 'Blogs', wpSlug: 'blogs', parent: null, description: '' },
      { id: '9', title: 'News', wpSlug: 'news', parent: null, description: '' }
    ],
    archives: [],
    images: []
  }
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify({ locales: ['en'], defaultLocale: 'en', pages: pm }))
  writeFileSync(join(dir, 'content.json'), JSON.stringify(content))
  writeFileSync(join(dir, 'sections.json'), JSON.stringify({ acm: [], custom: [], other: [] }))
  writeFileSync(join(dir, 'menus.json'), JSON.stringify({ menus: [] }))
  writeFileSync(join(dir, 'redirects.json'), JSON.stringify({ rules: [] }))
  writeFileSync(join(dir, 'patterns.map.json'), JSON.stringify({ types: {} }))
  return post
}

export const card = (title, extra = '') => `<article class="blog-item"><h3><a href="/${title.toLowerCase().replace(/\W+/g, '-')}/">${title}</a></h3>${extra}</article>`

export const listingPage = (titles, { wrap = (x) => x } = {}) =>
  `<!doctype html><html><head><title>Blog</title></head><body><main><h2>Latest</h2><div class="list">${wrap(titles.map((t) => card(t)).join(''))}</div></main></body></html>`

/** A site footer: the audited defect is "Joomla!" in the copyright line. */
export const footerPage = (footer, main = '<p>Welcome to the demo.</p>') =>
  `<!doctype html><html><head><title>Home</title></head><body><header><nav><a href="/">Home</a></nav></header><main>${main}</main><footer>${footer}</footer></body></html>`

// ─────────────────────────────────────────────── browser fixtures: one page per class, a source form and defective forms

const doc = (head, body, script = '') =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture</title><style>*{box-sizing:border-box}body{margin:0;font:16px/1.4 sans-serif;background:#fff;color:#111}html[data-theme=dark] body{background:#10131a;color:#eee}${head}</style></head><body>${body}<script>${script}</script></body></html>`

/** The drawer: Home, Services (Web, Apps (iOS, Android (Native, Hybrid))), About. `variant`: src | good | overlap | drill | contrast */
export function drawerPage(variant) {
  const coverish = ['cover', 'coverinert', 'coverdouble'].includes(variant)
  const sub = (variant === 'overlap' ? 'position:absolute;top:0;left:0;right:0;background:#ccd;z-index:2;' : '')
  const css = `
  header{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid #ccc}
  #burger{width:44px;height:44px}
  #nav{display:none;position:fixed;top:0;right:0;width:300px;height:100%;background:#fff;overflow:auto;padding:12px}
  #nav.open{display:block}
  html[data-theme=dark] #nav{background:#10131a}
  #nav a{display:block;padding:10px;color:#111;text-decoration:none}
  html[data-theme=dark] #nav a{color:${variant === 'contrast' ? '#3a3f4a' : '#eee'}}
  #nav ul{list-style:none;margin:0;padding:0}
  #nav li{position:relative}
  #nav li>ul{display:none;${sub}}
  #nav li.open>ul{display:${variant === 'noopen' ? 'none' : 'block'}${variant === 'zero' ? ';height:0;overflow:hidden' : ''}}
  ${variant === 'partial' ? '#nav ul ul ul ul li:last-child{display:none}' : ''}
  ${coverish ? '#nav li.open>ul{position:fixed;top:0;left:0;width:300px;height:100%;background:#fff;z-index:5;padding:12px;overflow:auto}html[data-theme=dark] #nav li.open>ul{background:#10131a}#nav li>ul>li.back-row{min-height:44px}#nav li>ul>li.back-row button{width:100%;text-align:left;padding:10px;border:0;background:none;font:inherit}' : ''}
  #nav li>.sub{position:absolute;right:0;top:0;width:44px;height:44px;cursor:pointer}
  #nav li{min-height:44px}
  #nav .back{display:none;padding:10px;cursor:pointer}
  #nav.drilled .back{display:block}`
  // Apps (iOS, Android (Native, Hybrid)); `multi*` variants give Services a second expandable sibling, reordered, renamed, missing or unmatchable
  const sb = (n) => `<button class="sub" aria-expanded="false" aria-label="${n} submenu">+</button>`
  const apps = (name) => `<li><a href="/apps">${name}</a>${sb(name)}<ul><li><a href="/ios">iOS</a></li><li><a href="/android">Android</a>${sb('Android')}<ul><li><a href="/native">Native</a></li><li><a href="/hybrid">Hybrid</a></li>${variant === 'depthdeep' ? `<li><a href="/deep">Deep</a>${sb('Deep')}<ul><li><a href="/deep/leaf">Leaf</a></li></ul></li>` : ''}</ul></li></ul></li>`
  const company = (name, leaves = ['Team', 'Careers']) => `<li><a href="/company">${name}</a>${sb(name)}<ul>${leaves.map((l) => `<li><a href="/c/${l.toLowerCase()}">${l}</a></li>`).join('')}</ul></li>`
  const web = '<li><a href="/web">Web</a></li>'
  const multi = (v) => ({ multisrc: web + apps('Apps') + company('Company'), multigood: web + apps('Apps') + company('Company'), multireorder: company('Company') + web + apps('Platforms'), multimissing: web + apps('Platforms'), multiambig: web + apps('Alpha') .replace('iOS', 'One').replace('Android', 'Two').replace('Native', 'Three').replace('Hybrid', 'Four') + company('Beta', ['Five', 'Six']) })[v]
  const html = `<header><a href="/" class="logo">Brand</a><button id="burger" aria-label="Menu" aria-controls="nav" aria-expanded="false">☰</button></header>
  <nav id="nav"><div class="back" role="button">‹ Back</div><ul id="root">
   <li><a href="/">Home</a></li>
   <li>${variant === 'linkparent' ? '<a href="/services" role="button" aria-haspopup="true" aria-expanded="false" class="dropdown-toggle">Services</a>' : '<a href="/services">Services</a>'}${variant === 'noparent' ? '' : variant === 'linkparent' ? '<span class="sub sub-menu-toggle" aria-label="Services submenu">+</span>' : '<button class="sub" aria-expanded="false" aria-label="Services submenu">+</button>'}
     ${variant === 'noparent' ? '<!--' : ''}<ul>${variant.startsWith('multi') ? multi(variant) : `<li><a href="/web">Web</a></li>${apps('Apps')}`}</ul>${variant === 'noparent' ? '-->' : ''}</li>
   <li><a href="/about">About</a></li></ul></nav>`
  const drill = variant === 'drill'
  const renamed = variant === 'renamed' ? (h) => h.replace('>Web<', '>Websites<').replace('>Apps<', '>Applications<') : (h) => h
  const coverJs = coverish ? `
  document.querySelectorAll('#nav li > ul').forEach((ul)=>{
    const make=(live)=>{ const li=document.createElement('li'); li.className='back-row'; const b=document.createElement('button'); b.type='button'; b.textContent='‹ Back'; if(live) b.addEventListener('click',(e)=>{ e.stopPropagation(); const parent=ul.parentElement; parent.classList.remove('open'); const t=parent.querySelector(':scope > .sub'); if(t) t.setAttribute('aria-expanded','false') }); li.appendChild(b); return li };
    ul.insertBefore(make(${variant !== 'coverinert'}), ul.firstChild);
    ${variant === 'coverdouble' ? "if (ul.querySelector('ul')) ul.insertBefore(make(true), ul.firstChild);" : ''}
  });` : ''
  const js = `
  const nav=document.getElementById('nav');
  document.getElementById('burger').addEventListener('click',()=>{ if(${variant === 'rooterror'}) { nav.remove(); return } nav.classList.toggle('open') });
  document.querySelectorAll('#nav .sub').forEach((b)=>b.addEventListener('click',(e)=>{
    const li=b.parentElement; li.classList.toggle('open'); b.setAttribute('aria-expanded', li.classList.contains('open') ? 'true' : 'false');
    ${drill ? "li.parentElement.querySelectorAll(':scope > li').forEach((s)=>{ if(s!==li) s.style.display = li.classList.contains('open') ? 'none' : ''; }); li.querySelector(':scope > a').style.display = li.classList.contains('open') ? 'none' : ''; b.style.display = li.classList.contains('open') ? 'none' : ''; nav.classList.toggle('drilled', li.classList.contains('open'));" : ''}
  }));${coverJs}`
  return doc(css, renamed(html), js)
}

/** A primary nav with one submenu. `variant`: src | good | small | cover | link */
export function touchPage(variant) {
  const size = variant === 'small' ? 14 : 32
  const css = `header{height:64px;display:flex;align-items:center;padding:0 24px;gap:24px}
  nav ul{list-style:none;display:flex;gap:24px;margin:0;padding:0}
  nav li{position:relative;display:flex;align-items:center}
  nav li>ul{display:none;position:absolute;top:100%;left:0;background:#eee;flex-direction:column;gap:0;min-width:160px;z-index:5}
  nav li.open>ul{display:flex}
  nav li>ul a{display:block;padding:12px}
  .chev{width:${size}px;height:${size}px;padding:0}
  .cover{position:absolute;left:0;top:0;width:100%;height:100%;z-index:4}`
  const toggle = variant === 'link' ? `<a class="chev" href="/products" aria-label="Products submenu" aria-expanded="false" data-key="1">v</a>` : `<button class="chev" aria-expanded="false" aria-label="Products submenu">v</button>`
  const html = `<header><a href="/" class="logo">Brand</a><nav><ul>
    <li><a href="/about">About</a></li>
    <li><a href="/products">Products</a>${toggle}${variant === 'cover' ? '<a class="cover" href="/products" aria-label="Products"></a>' : ''}
      <ul><li><a href="/p1">Product one</a></li><li><a href="/p2">Product two</a></li></ul></li></ul></nav></header>`
  const js = variant === 'link' ? `document.querySelector('.chev').addEventListener('keydown',(e)=>{ if(e.key==='Enter') e.currentTarget.parentElement.classList.toggle('open') })` : `document.querySelector('.chev').addEventListener('click',(e)=>{ e.currentTarget.parentElement.classList.toggle('open') })`
  return doc(css, html, js)
}

/** A dark toggle. `variant`: src | good | stale (the first click lands on the state the page is already in) */
export function togglePage(variant) {
  const js = `
  let n = 0;
  document.getElementById('t').addEventListener('click', () => {
    n++;
    const root = document.documentElement;
    const dark = ${variant === 'stale' ? "n === 2" : "n % 2 === 1"};
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
  });`
  return doc('header{padding:16px}', `<header><button id="t" class="theme-toggle" aria-label="Toggle dark mode">◐</button></header><main><p>Hello world</p></main>`, js)
}

/** A carousel of four slides. `variant`: src | good | stacked | nocontrols | partial */
export function carouselPage(variant) {
  const slides = ['Alpha', 'Beta', 'Gamma', 'Delta']
  if (variant === 'stacked') return doc('img,.slide{display:block;height:80px}', `<main><div class="gallery">${slides.map((s) => `<div class="slide">${s}</div>`).join('')}</div></main>`)
  const arrowy = variant.startsWith('arrows') || variant.startsWith('inert')
  const dots = variant === 'nocontrols' || arrowy ? [] : variant === 'partial' ? slides.slice(0, 2) : slides
  const css = `.swiper{width:600px;height:120px;overflow:hidden;margin:20px auto;position:relative}
  .track{display:flex;width:2400px;transition:transform .2s}
  .swiper-slide{width:600px;height:120px;flex:none;font-size:32px;display:flex;align-items:center;justify-content:center;background:#def}
  .dots{display:flex;gap:12px;justify-content:center}
  .swiper-pagination-bullet{width:24px;height:24px;border-radius:50%;background:#99a;border:0}
  ${variant === 'inertcss' ? '@keyframes roll{0%,20%{transform:translateX(0)}25%,45%{transform:translateX(-600px)}50%,70%{transform:translateX(-1200px)}75%,95%{transform:translateX(-1800px)}100%{transform:translateX(0)}} .track{animation:roll 20s infinite}' : ''}`
  const html = `<main><div class="swiper"><div class="track">${slides.map((s) => `<div class="swiper-slide">${s}</div>`).join('')}</div></div>
  <div class="dots swiper-pagination">${dots.map((d, i) => `<button class="swiper-pagination-bullet" data-i="${i}" aria-label="Go to slide ${i + 1}"></button>`).join('')}</div>
  ${variant === 'arrowslate' ? '' : variant.startsWith('inert') ? '<div class="ctl"><button class="arrow a-one" data-d="1">A</button><button class="arrow a-two" data-d="-1">B</button></div>' : arrowy ? (variant === 'arrowsprevlast' ? '<div class="ctl"><button class="arrow" data-d="1">›</button><button class="arrow" data-d="-1">‹</button></div>' : '<div class="ctl"><button class="arrow a-one" data-d="1">A</button><button class="arrow a-two" data-d="-1">B</button></div>') : ''}</main>`
  // arrows step one slide; `arrowsauto` also advances by itself, so autoplay alone shows every slide
  const arrowJs = "document.querySelectorAll('.arrow').forEach((b)=>b.addEventListener('click',()=>go(at+(+b.dataset.d))));"
  // a library-style per-instance API: `.swiper.swiper.autoplay.stop()` pauses THIS carousel's autoplay (nothing global)
  const api = "const SW=document.querySelector('.swiper'); let iv; SW.swiper={autoplay:{stop(){clearInterval(iv)}}};"
  const extra = {
    arrowsswiper: `${api} iv=setInterval(()=>go(at+1), 2000);`,
    inertswiper: `${api} iv=setInterval(()=>go(at+1), 2000);`,
    // arrows and the instance exist only after 1.5 s (a library that initialises late)
    arrowslate: `setTimeout(()=>{ document.querySelector('main').insertAdjacentHTML('beforeend', '<div class="ctl"><button class="arrow" data-d="-1">‹</button><button class="arrow" data-d="1">›</button></div>'); ${arrowJs} }, 1500);`,
    // the page's autoplay starts after any baseline: 2.5 s after load, inert arrows, with / without a pause API
    inertlatestart: `${api} setTimeout(()=>{ iv=setInterval(()=>go(at+1), 700) }, 2500);`,
    // the page's own pause: its autoplay skips a step while focus is inside the carousel's section
    inertfocus: "setInterval(()=>{ if(document.querySelector('.swiper').parentElement.contains(document.activeElement)) return; go(at+1) }, 2000);",
    arrowsfocus: "setInterval(()=>{ if(document.querySelector('.swiper').parentElement.contains(document.activeElement)) return; go(at+1) }, 2000);",
    inertlatefree: "setTimeout(()=>{ setInterval(()=>go(at+1), 1000) }, 2500);",
    // a slow timer that has nothing to do with the carousel, working arrows, no pause API
    arrowsunrelated: "setInterval(()=>{ document.title = String(Date.now()) }, 5000);",
    // a one-shot slow timer that touches nothing of the carousel, working arrows
    arrowsoneshot: "setTimeout(()=>{ document.title = 'ready' }, 1500);",
    // delayed autoplay: a one-shot starts a 1 s interval after 4 s; the arrows are inert, there is no pause API
    inertdelayedauto: "setTimeout(()=>{ setInterval(()=>go(at+1), 1000) }, 4000);",
    // a one-shot timer 20 s away: it could start an autoplay later than the run can wait
    arrowsfartimer: "setTimeout(()=>{ document.title = 'late' }, 20000);",
    // an empty slider-like root before the real carousel (it has no readable items) and arrows that swap their DOM order after every press
    arrowsreorder: "document.querySelector('main').insertAdjacentHTML('afterbegin', '<div class=swiper style=height:40px></div>'); const ctl=document.querySelector('.ctl'); ctl.addEventListener('click',()=>{ ctl.appendChild(ctl.firstElementChild) });"
  }[variant]
  const js = `let at=0; const go=(i)=>{at=(i+4)%4; document.querySelector('.track').style.transform='translateX(-'+(at*600)+'px)'};
  document.querySelectorAll('.swiper-pagination-bullet').forEach((b)=>b.addEventListener('click',()=>go(+b.dataset.i)));
  ${variant.startsWith('inert') || variant === 'arrowslate' ? '' : arrowJs}
  ${extra ?? (variant === 'arrowsauto' || variant === 'inertslow' ? 'setInterval(()=>go(at+1), 2000)' : variant === 'inertfast' ? 'setInterval(()=>go(at+1), 300)' : '')}`
  return doc(css, html, js)
}

/** A header band. `variant`: src | good | tall2 (+2 px) | tall3 (+3 px) | shifted (button 10 px right) | nobutton | nocurrent */
export function headerPage(variant) {
  const h = variant === 'tall2' ? 82 : variant === 'tall3' ? 83 : 80
  const css = `header{height:${h}px;display:flex;align-items:center;padding:0 40px;gap:20px;border-bottom:1px solid #ccc}
  .logo{font-weight:700;font-size:22px;width:120px}
  nav{flex:1}nav ul{list-style:none;display:flex;gap:24px;margin:0;padding:0}
  nav a{color:#333;text-decoration:none;padding:4px 0}
  ${['nocurrent', 'markedonly', 'stylesonly', 'ctaonly', 'nonav'].includes(variant) ? '' : 'nav a.current{font-weight:700;color:#0050d0;border-bottom:2px solid #0050d0}'}
  ${variant === 'stylesonly' ? 'nav a.about{font-weight:700;color:#0050d0;border-bottom:2px solid #0050d0}' : ''}
  ${variant === 'wrongsection' ? 'nav a.current{font-weight:400;color:#333;border:0}nav a.other{font-weight:700;color:#0050d0;border-bottom:2px solid #0050d0}' : ''}
  nav a.cta{background:#d22;color:#fff;padding:4px 12px}
  .btn-primary{padding:8px 16px;background:#0050d0;color:#fff;text-decoration:none;width:110px;text-align:center;${variant === 'shifted' ? 'position:relative;left:10px;' : ''}}
  .theme-toggle,.search{width:32px;height:32px}`
  const nav = `<nav><ul><li><a href="/">Home</a></li><li><a ${['nocurrent', 'ctaonly', 'wrongsection'].includes(variant) ? '' : variant === 'stylesonly' ? 'class="about" ' : 'class="current" aria-current="page" '}href="/about">About</a></li><li><a ${variant === 'wrongsection' ? 'class="other" aria-current="page" ' : ''}href="/contact">Contact</a></li>${variant === 'ctaonly' ? '<li><a class="cta" href="/donate">Donate</a></li>' : ''}</ul></nav>`
  const body = `<header><a class="logo" href="/" rel="home">Brand</a>${variant === 'nonav' ? '' : nav}
   <button class="search" aria-label="Search">⌕</button><button class="theme-toggle" aria-label="Toggle dark mode">◐</button>${variant === 'nobutton' ? '' : '<a class="btn-primary" href="/join">Join</a>'}</header><main><p>Body</p></main>`
  return doc(css, body)
}


/**
 * A header as the live ports render it. `variant`: src (a Joomla band: wrapper with 40 px of spacing below the painted
 * header, "brand" and social icons, a Subscribe button) | wp (a block theme: `wp-custom-logo` on <body>, social links
 * "logos-only" BEFORE the site title in the DOM, a core button, no spacing wrapper) | wptall (the same, 12 px taller)
 */
export function realHeaderPage(variant) {
  const src = variant === 'src'
  const css = `${src ? '.band{padding-bottom:40px}' : ''}
  header{height:${variant === 'wptall' ? 92 : 80}px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;border-bottom:2px solid #111}
  .social{display:flex;gap:12px;list-style:none;margin:0;padding:0;width:120px}
  .site-name{font-weight:700;font-size:20px}
  .subscribe{padding:8px 16px;background:#0050d0;color:#fff;text-decoration:none;width:110px;text-align:center}`
  const social = src ? '<div class="social acm-social"><a href="#" aria-label="Facebook">f</a><a href="#" aria-label="Instagram">i</a></div>' : '<ul class="social wp-block-social-links is-style-logos-only"><li class="wp-social-link"><a href="#" aria-label="Facebook">f</a></li><li class="wp-social-link"><a href="#" aria-label="Instagram">i</a></li></ul>'
  const title = src ? '<div class="navbar-brand logo-text"><a href="/"><span class="site-name">Brand</span></a></div>' : '<p class="site-name wp-block-site-title"><a href="/" rel="home">Brand</a></p>'
  const button = src ? '<a class="btn btn-primary subscribe" href="/subscribe">Subscribe</a>' : '<div class="wp-block-button"><a class="wp-block-button__link subscribe" href="/subscribe">Subscribe</a></div>'
  const html = `<div ${src ? 'id="t4-header" class="band t4-header"' : 'class="wp-block-template-part"'}><header class="${src ? 'header-block' : 'je-header'}">${social}${title}${button}</header></div><main><p>Body</p></main>`
  return doc(css, html).replace('<body>', src ? '<body>' : '<body class="home wp-custom-logo wp-theme-x">')
}

/**
 * A desktop header as the Impact ports render it. `variant`: src (Joomla: tight image logo, "Pages" an <a href="javascript:;">,
 * a finder search in a <search> element, no menu button) | wp (block theme: the logo's <figure> is 32 px wider than its image,
 * "Pages" an <a> without href beside a "Pages submenu" button, a core search block, no menu button)
 */
export function deskHeaderPage(variant) {
  const src = variant === 'src'
  const img = '<img alt="Impact" width="208" height="60" style="display:block" src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27208%27 height=%2760%27%3E%3Crect width=%27208%27 height=%2760%27 fill=%27%23369%27/%3E%3C/svg%3E">'
  const css = `header{height:100px;display:flex;align-items:center;gap:24px;padding:0 32px;border-bottom:1px solid #ccc}
  .figure{margin:0;width:${src ? 208 : 240}px}.figure img{display:block}
  nav ul{display:flex;gap:24px;list-style:none;margin:0;padding:0}nav li{display:flex;align-items:center;gap:4px}
  nav .sub{width:30px;height:30px}.finder{width:48px;height:48px;margin-left:auto}`
  const logo = src ? `<div class="navbar-brand logo-image"><a href="/">${img}</a></div>` : `<figure class="wp-block-image jim-logo figure"><a href="/">${img}</a></figure>`
  const pages = src ? '<li><a href="javascript:;" class="nav-header nav-link dropdown-toggle" role="button" aria-haspopup="true" aria-expanded="false">Pages</a></li>' : '<li><a class="wp-block-navigation-item__content">Pages</a><button class="sub" aria-label="Pages submenu" aria-controls="sm" aria-expanded="false">v</button></li>'
  const search = src ? '<search class="finder"><form class="mod-finder" aria-label="search"><input type="text" name="q" style="width:40px"></form></search>' : '<form class="wp-block-search finder" role="search"><button type="submit" aria-label="Search">⌕</button></form>'
  return doc(css, `<header>${logo}<nav><ul><li><a href="/">Home</a></li>${pages}<li><a href="/contact">Contact</a></li></ul></nav>${search}</header><main><p>Body</p></main>`)
}

/** A carousel whose slides are the children of a scroll-snap list (no library classes). `variant`: src | track | trackstatic */
export function trackCarouselPage(variant) {
  const slides = ['Alpha', 'Beta', 'Gamma', 'Delta']
  const css = `.lead{width:600px;margin:20px auto}
  .items{display:flex;list-style:none;margin:0;padding:0;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none}
  .items li{flex:none;width:600px;height:120px;scroll-snap-align:start;display:flex;align-items:center;justify-content:center;font-size:32px;background:#def}
  .nav{display:flex;gap:12px;justify-content:center}.nav button{width:44px;height:44px}`
  const nav = variant === 'trackstatic' ? '' : '<div class="slider-nav"><button class="slider-prev" aria-label="Previous slide">‹</button><button class="slider-next" aria-label="Next slide">›</button></div>'
  const html = `<main><section class="lead" aria-roledescription="carousel" aria-label="Featured"><ul class="items">${slides.map((x) => `<li>${x}</li>`).join('')}</ul>${nav}</section></main>`
  const js = `const t=document.querySelector('.items');const go=(d)=>{t.scrollBy({left:d*600,behavior:'auto'})};
  const n=document.querySelector('.slider-next'),p=document.querySelector('.slider-prev');if(n){n.addEventListener('click',()=>go(1));p.addEventListener('click',()=>go(-1))}`
  return doc(css, html, js)
}

/**
 * A contact page as two CMSs write it. `variant`: src (Joomla: "Name *" labels, Subject, optional "send a copy",
 * a finder search form without role=search) | wp (CF7: "Your name" labels, no Subject, no copy box, a hidden-input
 * block search) | wpfixed (CF7 with Subject and the copy box)
 */
export function contactPage(variant) {
  const src = variant === 'src'
  const css = 'form{max-width:420px;margin:16px auto;display:grid;gap:10px} input,textarea{padding:6px} label{display:block} button{padding:10px}'
  const search = src
    ? '<form class="mod-finder js-finder-searchform form-search" action="/index.php/smart-search" method="get"><input type="text" name="q" aria-label="Search" class="form-control"></form>'
    : '<form role="search" class="wp-block-search" action="/" method="get"><input type="search" name="s" aria-label="Search" style="display:none"><button type="submit" aria-label="Search">⌕</button></form>'
  const lab = (x, req) => (src ? `${x}${req ? ' *' : ''}` : `Your ${x.toLowerCase()}`)
  const subject = src || variant === 'wpfixed' ? `<label>${src ? 'Subject *' : 'Subject'} <input type="text" name="subject" required></label>` : ''
  const copy = src || variant === 'wpfixed' ? '<label><input type="checkbox" name="copy"> Send a copy to yourself</label>' : ''
  // a long consent label (live: well past 80 characters): the site prefixes a heading and makes the box required, the source leaves it optional
  const consentText = 'By submitting this form you agree to the Privacy Policy of this website and the way your details are stored and used by the organisation'
  const consent = variant === 'consentsrc' ? `<label><input type="checkbox" name="consent"> ${consentText}</label>` : variant === 'consentwp' ? `<label><input type="checkbox" name="consent" required> Privacy Note * ${consentText}</label>` : ''
  const html = `${search}<main><form action="${src ? '/index.php/contact' : '/contact/#wpcf7-f69'}" method="post" id="f">
   <label>${lab('Name', true)} <input type="text" name="n" required></label>
   <label>${lab('Email', true)} <input type="email" name="e" required></label>
   ${subject}
   <label>Your message <textarea name="m" required></textarea></label>
   ${copy}
   ${consent}
   <button type="submit">${src ? 'Send message' : 'Send'}</button></form></main>`
  return doc(css, html, "document.getElementById('f').addEventListener('submit',(e)=>e.preventDefault())")
}

/** A header whose call to action is hidden below 1200 px on the source. `variant`: src | good | shown | srcwide | wrap | wrapnested | br | brsrc | wrapsrc | hiddencopy */
export function responsivePage(variant) {
  const hideBelow = ['src', 'good', 'shown_hide'].includes(variant)
  const narrow = ['wrap', 'wrapnested', 'wrapsrc', 'shown'].includes(variant)
  const css = `header{display:flex;align-items:center;gap:16px;padding:0 24px;height:80px;border-bottom:1px solid #ccc}
  .logo{width:100px;font-weight:700}
  nav{flex:1}nav ul{display:flex;gap:16px;list-style:none;margin:0;padding:0}
  .theme-toggle{width:34px;height:34px}
  .btn-primary{display:inline-block;padding:6px 10px;background:#0a7;color:#fff;text-decoration:none;width:${narrow ? 70 : 150}px;text-align:center;line-height:20px}
  ${hideBelow ? '@media (max-width:1199.98px){.btn-primary{display:none}}' : ''}
  .copy{display:none;width:30px}`
  const label = variant === 'wrapnested' ? '<span><span>Donate</span> <span>now</span></span>' : ['br', 'brsrc'].includes(variant) ? 'Donate<br>now' : 'Donate now'
  const body = `<header><a class="logo" href="/" rel="home">Brand</a><nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li></ul></nav>
   <button class="theme-toggle" aria-label="Toggle dark mode">◐</button>
   <a class="btn-primary" href="/donate">${label}</a>${variant === 'hiddencopy' ? '<a class="btn-primary copy" href="/donate">Donate now now now now now</a>' : ''}</header><main><p>Body</p></main>`
  return doc(css, body)
}

/** A contact form. `variant`: src | good | extra | gate | gate-flat | cf7 | cf7src | noreq | ambig | cf7life | cf7urlenc | cf7twice | cf7sameunit | cf7nomarker | cf7dupmarker | cf7wrong | cf7other | cf7analytics | cf7otherform | cf7late | cf7latepinged (see cf7Handlers) */
export function formPage(variant) {
  const gateJs = ['gate', 'gate-flat'].includes(variant)
  const bReq = variant === 'extra' ? 'required' : ''
  const bWrap = (inner) => (variant === 'cf7' ? `<span class="wpcf7-form-control wpcf7-acceptance">${inner}</span>` : variant === 'cf7src' ? `<span class="wpcf7-form-control wpcf7-acceptance optional">${inner}</span>` : inner)
  const css = `form{max-width:420px;margin:24px auto;display:grid;gap:10px} input,textarea{padding:6px} label{display:block}
  button[type=submit]{padding:10px;background:#0a7;color:#fff;border:1px solid #076;cursor:pointer}
  ${gateJs ? (variant === 'gate' ? 'button[type=submit]:disabled{opacity:.45;cursor:not-allowed}' : 'button[type=submit]:disabled{cursor:not-allowed}') : ''}`
  const name = variant === 'ambig' ? '<label>Your name <input type="text" name="n" required></label><label>Your name <input type="text" name="n2" required></label>' : `<label>Your name <input type="text" name="n" ${variant === 'noreq' ? '' : 'required'}></label>`
  // `samepost`: the handler refuses (copy box empty) but first posts a validation request to the form's own action carrying the typed text;
  // `delayed`: the handler stops the event and sends the request 900 ms later; `otherform`: the press also submits a second form on the page, which goes through.
  // `cf7*`: Contact Form 7 forms, whose handler stops the event and posts FormData(form) to the plugin's feedback endpoint. The form carries `_wpcf7` (the plugin
  // form id, shared by every embed of it) and `_wpcf7_unit_tag` (the marker of THIS instance). Variants break exactly one thing each — see cf7Handlers below.
  const cf7 = ['cf7life', 'cf7urlenc', 'cf7twice', 'cf7sameunit', 'cf7nomarker', 'cf7dupmarker', 'cf7wrong', 'cf7other', 'cf7analytics', 'cf7otherform', 'cf7late', 'cf7latepinged'].includes(variant)
  const UNIT = 'wpcf7-f69-p1-o1'
  const unitInputs = variant === 'cf7nomarker' ? '' : variant === 'cf7dupmarker' ? `<input type="hidden" name="_wpcf7_unit_tag" value="${UNIT}"><input type="hidden" name="_wpcf7_unit_tag" value="${UNIT}">` : `<input type="hidden" name="_wpcf7_unit_tag" value="${UNIT}">`
  const second = variant === 'cf7twice' || variant === 'cf7sameunit' || variant === 'cf7otherform'
    ? `<div class="wpcf7"><form action="/post" method="post" id="g"><input type="hidden" name="_wpcf7" value="69"><input type="hidden" name="_wpcf7_unit_tag" value="${variant === 'cf7sameunit' ? UNIT : 'wpcf7-f69-p1-o2'}"><label>News email <input type="email" name="ne"></label><button type="submit" id="go2">Join</button></form></div>`
    : ''
  const secondPlain = ['twice', 'twiceextra'].includes(variant) ? `<form action="/post" method="post" id="g"><label>News email <input type="email" name="ne" ${variant === 'twiceextra' ? 'required' : ''}></label><button type="submit">Join</button></form>` : ''
  const html = `<main>${cf7 ? '<div class="wpcf7">' : ''}<form action="/post" method="post" id="f">
   ${cf7 ? `<input type="hidden" name="_wpcf7" value="69">${unitInputs}` : ''}
   ${name}
   <label>Your email <input type="email" name="e" required></label>
   <label>Message <textarea name="m" required></textarea></label>
   ${variant.startsWith('phone') ? '<label>Phone <input type="text" name="phone"></label>' : ''}
   <label><input type="checkbox" name="agree" required> I agree to the privacy policy</label>
   ${bWrap(`<label><input type="checkbox" name="copy" ${bReq}> Send a copy to yourself</label>`)}
   <button type="submit" id="go" ${gateJs ? 'disabled' : ''}>Send</button></form>${cf7 ? '</div>' : ''}${second}${secondPlain}${variant === 'otherform' ? '<form action="/news" method="post" id="g"><label>News email <input type="email" name="ne"></label><button type="submit">Join</button></form>' : ''}</main>`
  // `customblock`: an enabled submit whose handler refuses unless the copy box is ticked (no required attribute, no disabled button);
  // `phonereq`: its handler refuses while the optional phone is empty
  const guardJs = variant === 'customblock' || variant === 'bgblock' ? "if(!e.target.copy.checked){ e.preventDefault(); return }" : variant === 'phonereq' ? "if(!e.target.phone.value){ e.preventDefault(); return }" : ''
  // `bgblock` / `bgping`: a page script posts an analytics ping on every press of the submit, whatever the form does with it
  const ping = variant === 'bgblock' || variant === 'bgping' ? "document.getElementById('go').addEventListener('click',()=>{ fetch('/analytics',{method:'POST',body:'ping=1'}) });" : ''
  const EP = (id) => `/wp-json/contact-form-7/v1/contact-forms/${id}/feedback`
  const wire = (id, body) => `document.getElementById('${id}').addEventListener('submit',(e)=>{ e.preventDefault(); const f=e.target; const fd=new FormData(f); ${body} });`
  const post = (ep = EP(69), how = 'fd') => `fetch('${ep}',{method:'POST',body:${how}});`
  const cf7Handlers = {
    // the supported lifecycle: own endpoint, body = FormData(form) (multipart) or its urlencoded form
    cf7life: wire('f', post()),
    cf7urlenc: wire('f', post(EP(69), 'new URLSearchParams(fd)')),
    // two embeds of the same plugin form share the id and the endpoint; each carries its own unit tag
    cf7twice: `${wire('f', post())}${wire('g', post())}`,
    cf7sameunit: `${wire('f', post())}${wire('g', post())}`,
    // one thing broken each: no marker in the form; a duplicated marker; another form's marker in the body; another form's endpoint; a ping to the endpoint that is not the form's body
    cf7nomarker: wire('f', post()),
    cf7dupmarker: wire('f', post()),
    cf7wrong: wire('f', "fd.set('_wpcf7_unit_tag','wpcf7-f69-p9-o9'); " + post()),
    cf7other: wire('f', post(EP(70))),
    cf7analytics: `document.getElementById('f').addEventListener('submit',(e)=>{ e.preventDefault() }); document.getElementById('go').addEventListener('click',()=>{ fetch('${EP(69)}',{method:'POST',body:'x'}) });`,
    // another form's press: the handler of this form refuses and sends nothing, while the second form (same plugin id, its own unit tag) submits at the same time
    cf7otherform: `document.getElementById('f').addEventListener('submit',(e)=>{ e.preventDefault() }); ${wire('g', post())} document.getElementById('go').addEventListener('click',()=>{ document.getElementById('g').requestSubmit() });`,
    // a response that crosses attempts: the first press is refused and its request is sent 3 s later, inside the next press's window
    cf7late: "let n=0; document.getElementById('f').addEventListener('submit',(e)=>{ e.preventDefault(); const fd=new FormData(e.target); if(n++===0) setTimeout(()=>fetch('" + EP(69) + "',{method:'POST',body:fd}),3000) });",
    // the first press sends an unrelated analytics write at once and its marked feedback request 3 s later: that late request is not a later press's submission
    cf7latepinged: "let n=0; document.getElementById('f').addEventListener('submit',(e)=>{ e.preventDefault(); const fd=new FormData(e.target); fetch('/analytics',{method:'POST',body:'x'}); if(n++===0) setTimeout(()=>fetch('" + EP(69) + "',{method:'POST',body:fd}),3000) });"
  }
  const special = {
    samepost: "document.getElementById('f').addEventListener('submit',(e)=>{ fetch('/post',{method:'POST',body:'validate=Audit text'}); if(!e.target.copy.checked){ e.preventDefault() } });",
    delayed: "document.getElementById('f').addEventListener('submit',(e)=>{ e.preventDefault(); setTimeout(()=>fetch('/post',{method:'POST',body:'x'}),900) });",
    ...cf7Handlers,
    otherform: "document.getElementById('f').addEventListener('submit',(e)=>{ if(!e.target.copy.checked){ e.preventDefault() } }); document.getElementById('go').addEventListener('click',()=>{ document.getElementById('g').requestSubmit() });"
  }[variant]
  const js = special ?? `${ping}document.getElementById('f').addEventListener('submit',(e)=>{ ${guardJs} fetch('/post',{method:'POST',body:'x'}); });
  ${gateJs ? "const f=document.getElementById('f'); const sync=()=>{ document.getElementById('go').disabled = !(f.agree.checked && f.copy.checked) }; f.addEventListener('change', sync);" : ''}`
  return doc(css, html, js)
}

const PAGES = { deskheader: deskHeaderPage, realheader: realHeaderPage, trackcarousel: trackCarouselPage, contact: contactPage, drawer: drawerPage, touch: touchPage, toggle: togglePage, carousel: carouselPage, header: headerPage, responsive: responsivePage, form: formPage }

/** Serves `/<page>/<variant>` from the fixtures above. Returns { origin, close }. */
export async function fixtureServer() {
  const writes = []
  const server = createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      writes.push(`${req.method} ${req.url}`)
      res.statusCode = 204
      return res.end()
    }
    const [, page, variant] = req.url.split('?')[0].split('/')
    const make = PAGES[page]
    if (!make) {
      res.statusCode = 404
      return res.end('not found')
    }
    res.setHeader('content-type', 'text/html')
    res.end(make(variant ?? 'src'))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { origin: `http://127.0.0.1:${server.address().port}`, writes, close: () => new Promise((r) => server.close(r)) }
}

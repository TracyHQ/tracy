#!/usr/bin/env node
// Build qa.contract.json for Tracy Business from the extracted source data, the seed and the
// template config. Every expected string is a literal from the SOURCE (source-data.json), never
// from the running site; archive titles come from the seed's taxonomy labels, which build-seed.mjs
// itself copied from the source filter chips. Design expectations are the values written in
// tasks/emdash-northgate/visual-contract.md (the source <style>), evaluated per viewport.
//   node tools/build-qa-contract.mjs <source-data.json> <source-dir> [--config template.config.json]
//        [--seed seed/seed.json] [--out qa.contract.json]
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { initContract, filesUnder } from './qa-contract.mjs'
import { deriveShots } from './fast-gate.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const [dataFile, sourceDir] = args
if (!dataFile || !sourceDir) {
  console.error(
    'usage: build-qa-contract.mjs <source-data.json> <source-dir> [--config f] [--seed f] [--out f]'
  )
  process.exit(2)
}
const config = JSON.parse(readFileSync(opt('--config', 'template.config.json'), 'utf8'))
const seed = JSON.parse(readFileSync(opt('--seed', 'seed/seed.json'), 'utf8'))
const D = JSON.parse(readFileSync(dataFile, 'utf8')).data
const term = (tax, slug, locale) =>
  seed.taxonomies.find((t) => t.id === `tax:${tax}:${locale}`).terms.find((t) => t.slug === slug).label

const c = initContract(sourceDir, config)
c.source.reference = 'vendor/joomla/html/tracy_business (Claude Design canvas export, EN + RU/)'
// Design fonts are Latin-only (HANDOFF-2026-09-13): Lee chose reference parity with the Joomla
// build, i.e. the system fallback chain for Cyrillic instead of a bundled Cyrillic face. The
// families below are what macOS renders for that chain; another OS needs its own approved list.
c.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'input', 'label'],
  platform: 'macOS (Chrome); the design ships Archivo + Newsreader, Latin only',
  allowed: {
    en: ['Archivo SemiBold', 'Newsreader 16pt 16pt', '.SF NS', 'Menlo', 'Apple Symbols'],
    ru: ['Archivo SemiBold', 'Newsreader 16pt 16pt', 'Georgia', '.SF NS', 'Menlo', 'Apple Symbols']
  }
}
// Viewports × themes from initContract: 1440/768/390 × light/dark (1280 dropped 2026-09-14).
const W = { 1440: 1440, 768: 768, 390: 390 }
const clamp = (min, vw, max) => (w) => Math.min(max, Math.max(min, (vw / 100) * w))
const px = (n) => `${Math.round(n * 1000) / 1000}px`
const perVariant = (fn) => Object.fromEntries(c.variants.map((v) => [v.id, fn(v)]))
const heading = (id, size, tracking) => ({
  id,
  selector: 'main h1',
  source: 'Home.html',
  styles: perVariant((v) => ({
    'font-family': 'Newsreader',
    'font-weight': '400',
    'font-size': px(size(W[v.width])),
    'letter-spacing': px(size(W[v.width]) * tracking)
  }))
})
c.design.rules = [
  {
    id: 'body-font',
    selector: 'body',
    source: 'Home.html',
    styles: perVariant(() => ({ 'font-family': 'Archivo', 'font-size': '16px' }))
  },
  {
    id: 'theme-surface',
    selector: 'body',
    source: 'Home.html',
    styles: perVariant((v) =>
      v.theme === 'dark'
        ? { 'background-color': 'rgb(16, 18, 20)', color: 'rgb(236, 234, 228)' }
        : { 'background-color': 'rgb(245, 243, 238)', color: 'rgb(20, 23, 26)' }
    )
  },
  {
    id: 'container',
    selector: 'header .container-site',
    source: 'Home.html',
    styles: perVariant(() => ({
      'max-width': '1240px',
      'min-height': '84px',
      'padding-left': '32px',
      'padding-right': '32px'
    }))
  },
  {
    id: 'nav-link',
    selector: 'header nav a',
    source: 'Home.html',
    styles: perVariant(() => ({ 'font-size': '14.5px' }))
  },
  {
    id: 'eyebrow',
    selector: 'main .eyebrow',
    source: 'Home.html',
    styles: perVariant(() => ({
      'font-size': '12px',
      'letter-spacing': '2.16px',
      'text-transform': 'uppercase',
      color: 'rgb(218, 90, 42)'
    }))
  },
  {
    id: 'btn-primary',
    // The hero CTA: the band button further down is the 17px/34px variant of the same class.
    selector: 'main a.btn-primary >> nth=0',
    source: 'Home.html',
    styles: perVariant(() => ({
      'background-color': 'rgb(218, 90, 42)',
      'border-radius': '0px',
      'padding-top': '15px',
      'padding-left': '28px'
    }))
  },
  heading('h1-hero', clamp(38, 5.4, 64), -0.025),
  heading('h1-page', clamp(32, 4.2, 50), -0.025),
  heading('h1-list', clamp(32, 4, 48), -0.025), // News, Contact (source: blog.h1, ct.h1)
  heading('h1-kit', clamp(30, 3.7, 44), -0.025), // Search, kit pages, style guide (source: sr.h1, gd.h1, res.*.h1)
  heading('h1-article', clamp(34, 4.4, 52), -0.028),
  heading('h1-section', clamp(28, 3.4, 40), -0.02),
  // Roles beyond h1, measured from the SOURCE render (Home.html at 1440, tools/_dom2 probe 13/09):
  // these make `design.coverage` below classify every visible text/button role.
  {
    id: 'h2-font',
    selector: 'main h2:not(.prose-article h2)',
    source: 'Home.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Newsreader', 'font-weight': '400' }))
  },
  {
    id: 'h2-prose',
    selector: 'main .prose-article h2',
    source: 'Article.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo', 'font-weight': '600' }))
  },
  {
    id: 'h2-guide',
    selector: 'main h2',
    source: 'Style guide.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo', 'font-weight': '700' }))
  },
  {
    id: 'p-card',
    selector: 'main article > p',
    source: 'Home.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo' }))
  },
  {
    id: 'p-lede',
    selector: 'main article > p',
    source: 'Article.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Newsreader' }))
  },
  {
    id: 'p-article',
    selector: 'main .prose-article p',
    source: 'Article.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo' }))
  },
  {
    id: 'h3-font',
    selector: 'main h3',
    source: 'Home.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo', 'font-weight': '600' }))
  },
  {
    id: 'p-font',
    selector: 'main p:not(blockquote p):not(.prose-article p):not(article > p)',
    source: 'Home.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo' }))
  },
  {
    id: 'footer-link',
    selector: 'footer a',
    source: 'Home.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo' }))
  },
  {
    id: 'btn-forest',
    selector: 'header a.btn-forest',
    source: 'Home.html',
    styles: perVariant(() => ({
      'background-color': 'rgb(20, 72, 58)',
      color: 'rgb(255, 255, 255)',
      'font-size': '14px',
      'font-weight': '600'
    }))
  },
  {
    id: 'btn-any',
    selector: 'main [class*=btn-]',
    source: 'Home.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo', 'font-weight': '600' }))
  },
  {
    id: 'chip',
    selector: 'main [class*=chip]',
    source: 'Projects.html',
    optional: true,
    styles: perVariant(() => ({ 'font-family': 'Archivo' }))
  }
]
// Coverage: every VISIBLE element of these roles must be measured by some rule or a parity pair;
// anything left over is a component the contract forgot (visual-review-method.md).
c.design.coverage = [
  { selector: 'main h1, main h2, main h3', properties: ['font-family', 'font-weight'] },
  { selector: 'main p:not(blockquote p), footer a', properties: ['font-family'] },
  { selector: 'header nav a', properties: ['font-size'] },
  { selector: 'header a.btn-forest, main [class*=btn-]', properties: ['font-family', 'font-weight'] },
  { selector: 'main [class*=chip]', properties: ['font-family'] }
]
// Parity: the same logical element on the source render (served from the design folder) and on
// the site, diffed with tolerance. Content ids resolve per page/locale by the source's literal text;
// the canvas export has no classes, so structural pairs use inline-style attributes where needed.
c.design.parity = {
  // no line-height: the canvas export leaves it `normal` where the template sets a value; heading line-heights are covered by rules
  properties: [
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'padding-top',
    'padding-left',
    'border-bottom-color',
    'border-bottom-width'
  ],
  hexTolerance: 8,
  pxTolerance: 0.5,
  sourceTheme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' } },
  selectors: {
    h1: { content: 'h1' },
    lede: { content: 'lede' },
    navSecond: { site: 'header nav a >> nth=1', source: 'header nav a:nth-of-type(2)' },
    // States a settled screenshot never shows: the active item and the pointer state.
    // Kit/system pages mark the Resources trigger (a button, `.is-active`) rather than a link.
    navActive: {
      site: 'header nav a[aria-current=page], header nav .nav-link.is-active',
      source: 'header nav a[style*="rgb(218, 90, 42)"]'
    },
    navHover: { site: 'header nav a >> nth=1', source: 'header nav a:nth-of-type(2)', hover: true },
    headerCtaHover: {
      site: 'header a.btn-forest',
      source: 'header > div > div > a:last-of-type',
      hover: true
    },
    footerLinkHover: { site: 'footer a >> nth=0', source: 'footer a', hover: true },
    headerCta: { site: 'header a.btn-forest', source: 'header > div > div > a:last-of-type' },
    // `.btn-primary` on any element: the style guide shows the button as a specimen, not a link.
    // The kit Form's CTA is a submit <button> in the source, not a link (the browser serialises its
    // inline `#DA5A2A` as `rgb(218, 90, 42)`, so one substring matches both).
    heroCta: {
      // `.ec-form-submit` is the forms plugin's submit (contact page), styled as the primary button.
      site: 'main .btn-primary, main .ec-form-submit >> nth=0',
      source: 'main a[style*="218, 90, 42"], main button[style*="218, 90, 42"]'
    },
    h2First: { site: 'main h2 >> nth=0', source: 'main h2' },
    h3First: { site: 'main h3 >> nth=0', source: 'main h3' },
    footerLink: { site: 'footer a >> nth=0', source: 'footer a' }
  }
}
// Pictures: the rendered source page promises N images (Claude Design's <image-slot src>), the site
// must show N decoded <img> and no `.photo-placeholder` (qa-7 missed six missing kit pictures).
// Accent borders are deliberate marks in both themes (active nav underline, link underlines, quote
// rules): the dark scanner must not read them as a leaked light border.
c.design.accentBorders = [
  'rgb(218, 90, 42)',
  'rgb(127, 191, 166)',
  'rgb(94, 138, 121)',
  'rgb(20, 72, 58)',
  // status colours (form error border, alert left rules on the style guide), the same in both themes
  'rgb(192, 57, 43)',
  'rgb(46, 125, 50)',
  'rgb(200, 137, 27)'
]
c.design.images = { scope: 'main', sourceSlot: 'image-slot[src]', placeholder: '.photo-placeholder' }
// Colour swatches on the kit slides/style guide show the paper token as a specimen: in dark mode the
// white-surface scanner reads them as a leaked light surface. Matched by their fixed-height swatch
// classes only; any other light surface still fails.
c.design.exceptions = [
  {
    kind: 'scan:white-surface',
    match: String.raw`h-\[(30|88)px\].*border-line`,
    reason: 'colour swatch showing the paper token (kit slides, style guide)',
    decision: 'tasks/emdash-northgate/DECISIONS.md D31 (2026-09-14)'
  }
]
// Contract revision: bump when the criteria change (r11: LICENSE joins the shipped file set; r12: image census on
// derived pages counts placeholders only, kit nav/CTA parity selectors, error-border accent, swatch exception;
// r13: visual stages + render inputs/per-page view+collections for evidence reuse; r14: 1280 dropped, layouts +
// visual.shots with consumers, designSystem sets, stages by layout) (receipts quote contractHash; a changed contract
// expires them by design). 2 = coverage + parity + exceptions added on 2026-09-13. r15: visual.shots derived
// from the contract (deriveShots) — adds the Russian source at 390-light, which the source has; r16: the
// design source moved to vendor/joomla/html/tracy_business and travels in git, so the inventory no longer
// carries the machine's .DS_Store / .teamshare (a clone would have failed `--source` on the missing files).
c.revision = 16
c.interactions = {
  resources: {
    trigger: 'header button[aria-expanded]',
    panel: '[data-slot=popover-content]',
    link: '[data-slot=popover-content] a',
    open: 'click',
    fullWidth: true,
    inner: '[data-slot=popover-content] > div',
    maxInnerWidth: 1240
  }
}
const COMMON = ['body-font', 'theme-surface', 'container', 'nav-link']
// Routes without a canvas page of their own (source[] points at the family's list page).
const DERIVED = new Set([
  'service',
  'projects-sector',
  'project',
  'news-category',
  'news-tag',
  'article',
  'terms',
  'privacy',
  'sitemap',
  'search',
  'not-found'
])
const ALL = c.variants.map((v) => v.id)
// Visual stages in the order Lee set (2026-09-14): light desktop → light responsive → dark desktop →
// dark responsive. A stage is measured only after the previous one is clean; light done well leaves
// dark with little to fix. Render inputs + per-page view/collections let a page's evidence be
// reused across runs when nothing that reaches its pixels changed (visual-lib pageHash).
c.visual = {
  stages: [
    { id: 'light-desktop', variants: ['1440-light'] },
    { id: 'light-responsive', variants: ['768-light', '390-light'] },
    { id: 'dark-desktop', variants: ['1440-dark'] },
    { id: 'dark-responsive', variants: ['768-dark', '390-dark'] }
  ],
  // Pictures are taken per LAYOUT (a view, its representative page), never per page, and only when a
  // lens consumes them (Lee, 2026-09-14: a picture nobody opens is disk garbage). Measurement stays
  // per page. The rules are DERIVED from the contract once pages, locales and fonts are known
  // (deriveShots, fast-gate.mjs): default locale on every stage, its source on the light stages, and a
  // locale with a risk of its own (script, longer text, other fonts) at the narrowest width beside its
  // own source — nothing here names a language. Source rules carry `ownSourceOnly`: a layout whose
  // canvas has no page of its own (`layouts[].hasSource: false`) gets no source picture — a Terms page
  // paired with the Home render confused every reviewer of round 1.
  shots: [],
  renderInputs: [
    'src/styles/**',
    'src/layouts/**',
    'src/components/**',
    'src/lib/**',
    'astro.config.mjs',
    'template.config.json',
    'package.json',
    'public/**'
  ]
}
// Which view renders each route (the router's own conditions, src/pages/[...path].astro) and which
// collections that view reads — the seed slices that can change the page.
const VIEW = {
  home: 'Home',
  about: 'About',
  services: 'Services',
  service: 'Service',
  projects: 'Projects',
  'projects-sector': 'Projects',
  project: 'Project',
  news: 'News',
  'news-category': 'News',
  'news-tag': 'News',
  article: 'Article',
  careers: 'Careers',
  investors: 'Investors',
  contact: 'Contact',
  search: 'Search',
  'not-found': 'NotFound',
  'kit-newsletter': 'Kit',
  'kit-email': 'Kit',
  'kit-form': 'Kit',
  'kit-slides': 'Kit',
  'kit-style-guide': 'Kit',
  terms: 'Page',
  privacy: 'Page',
  sitemap: 'Sitemap'
}
const readsOf = (file) => {
  const text = readFileSync(file, 'utf8')
  return [
    ...new Set([...text.matchAll(/getEmDash(?:Entry|Collection)\(["']([a-z_]+)["']/g)].map((m) => m[1]))
  ]
}
const renderOf = (id) => {
  const view = `src/views/${VIEW[id]}.astro`
  if (!existsSync(view)) throw new Error(`route ${id}: no view ${view}`)
  // `site` is read by the chrome on every page; the mega menu also shows the latest projects/posts.
  const collections = [...new Set([...readsOf(view), ...readsOf('src/lib/chrome.ts'), 'site'])].sort()
  return { view, collections }
}
// Route table. `h1`/`lede` are source literals per locale; `file` is the canvas page (RU under RU/).
const L = { en: { P: '', file: (n) => `${n}.html` }, ru: { P: '/ru', file: (n) => `RU/${n}_ru.html` } }
const src = (locale) => ({
  hero: D[locale.toUpperCase()].hero,
  blog: D[locale.toUpperCase()].blog,
  art: D[locale.toUpperCase()].art,
  ct: D[locale.toUpperCase()].ct,
  sr: D[locale.toUpperCase()].sr,
  nf: D[locale.toUpperCase()].nf,
  gd: D[locale.toUpperCase()].gd,
  ft: D[locale.toUpperCase()].ft,
  AB: D[`AB_${locale.toUpperCase()}`],
  SV: D[`SV_${locale.toUpperCase()}`],
  PJ: D[`PJ_${locale.toUpperCase()}`],
  CAR: D[`CAR_${locale.toUpperCase()}`],
  IR: D[`IR_${locale.toUpperCase()}`],
  RES: D[`RES_${locale.toUpperCase()}`]
})
const routes = (locale) => {
  const S = src(locale)
  return [
    {
      id: 'home',
      path: '/',
      file: 'Home',
      h1: `${S.hero.h1a} ${S.hero.h1b}`,
      lede: S.hero.p,
      rule: 'h1-hero',
      states: ['default', 'resources'],
      extra: [
        {
          id: 'cta',
          selector: 'main a.btn-primary >> nth=0',
          owner: 'derived',
          binding: 'home.cta1 → services page route',
          attribute: 'href',
          expected: `${L[locale].P}/services`
        }
      ]
    },
    { id: 'about', path: '/about', file: 'About', h1: S.AB.h1, lede: S.AB.lede, rule: 'h1-page' },
    { id: 'services', path: '/services', file: 'Services', h1: S.SV.h1, lede: S.SV.lede, rule: 'h1-page' },
    {
      id: 'service',
      path: '/services/general-contracting',
      file: 'Services',
      h1: S.SV.services[0].t,
      lede: S.SV.services[0].d,
      rule: 'h1-page',
      binding: 'services.<slug>.title / .description (D12: composed from the service card)'
    },
    { id: 'projects', path: '/projects', file: 'Projects', h1: S.PJ.h1, lede: S.PJ.lede, rule: 'h1-page' },
    {
      id: 'projects-sector',
      path: '/projects/sector/production',
      file: 'Projects',
      h1: term('sector', 'production', locale),
      lede: S.PJ.lede,
      rule: 'h1-page',
      owner: 'derived',
      binding: 'taxonomy sector term label (source filter chip)'
    },
    {
      id: 'project',
      path: '/projects/elektra-lipetsk',
      file: 'Project detail',
      h1: S.RES.pr.h1,
      lede: S.RES.pr.lede,
      rule: 'h1-page'
    },
    { id: 'news', path: '/news', file: 'News', h1: S.blog.h1, lede: S.blog.sub, rule: 'h1-list' },
    {
      id: 'news-category',
      path: '/news/category/engineering',
      file: 'News',
      h1: term('category', 'engineering', locale),
      lede: S.blog.sub,
      rule: 'h1-list',
      owner: 'derived',
      binding: 'taxonomy category term label (source filter chip)'
    },
    {
      id: 'news-tag',
      path: '/news/tag/vibration',
      file: 'Article',
      h1: term('tag', 'vibration', locale),
      lede: S.blog.sub,
      rule: 'h1-list',
      owner: 'derived',
      binding: 'taxonomy tag term label (source article tag)'
    },
    {
      id: 'article',
      path: '/news/four-common-mistakes-in-heavy-machine-foundation-design',
      file: 'Article',
      h1: S.art.h1,
      lede: S.art.lede,
      rule: 'h1-article'
    },
    { id: 'careers', path: '/careers', file: 'Careers', h1: S.CAR.h1, lede: S.CAR.lede, rule: 'h1-page' },
    {
      id: 'investors',
      path: '/investors',
      file: 'Investor relations',
      h1: S.IR.h1,
      lede: S.IR.lede,
      rule: 'h1-page'
    },
    { id: 'contact', path: '/contact', file: 'Contact', h1: S.ct.h1, lede: S.ct.sub, rule: 'h1-list' },
    {
      id: 'search',
      path: '/search',
      // The canvas shows the results state (count line, result list, section filter, pagination);
      // a query that hits seeded content in each locale puts the site in the same state. Without it
      // the shot is the empty state and every results-side finding is the harness's own doing.
      query: { en: 'building', ru: 'корпус' },
      file: 'Search',
      h1: S.sr.h1,
      rule: 'h1-kit'
    },
    {
      id: 'not-found',
      path: '/404',
      file: '404',
      h1: S.nf.h1,
      lede: S.nf.p,
      rule: 'h1-section',
      status: 404
    },
    {
      id: 'kit-newsletter',
      path: '/kit/newsletter',
      file: 'Newsletter',
      h1: S.RES.nl.h1,
      lede: S.RES.nl.sub,
      rule: 'h1-kit'
    },
    {
      id: 'kit-email',
      path: '/kit/email',
      file: 'Email',
      h1: S.RES.em.h1,
      lede: S.RES.em.sub,
      rule: 'h1-kit'
    },
    { id: 'kit-form', path: '/kit/form', file: 'Form', h1: S.RES.fm.h1, lede: S.RES.fm.sub, rule: 'h1-kit' },
    {
      id: 'kit-slides',
      path: '/kit/slides',
      file: 'Slide',
      h1: S.RES.dk.h1,
      lede: S.RES.dk.sub,
      rule: 'h1-kit'
    },
    {
      id: 'kit-style-guide',
      path: '/kit/style-guide',
      file: 'Style guide',
      h1: S.gd.h1,
      lede: S.gd.sub,
      rule: 'h1-kit'
    },
    {
      id: 'terms',
      path: '/terms',
      file: 'Home',
      h1: S.ft.legalLinks[0],
      rule: 'h1-page',
      binding: 'pages.terms.title (footer legal link; body is gap G1)'
    },
    {
      id: 'privacy',
      path: '/privacy',
      file: 'Home',
      h1: S.ft.legalLinks[1],
      rule: 'h1-page',
      binding: 'pages.privacy.title (footer legal link; body is gap G1)'
    },
    {
      id: 'sitemap',
      path: '/sitemap',
      file: 'Home',
      h1: S.ft.legalLinks[2],
      rule: 'h1-page',
      owner: 'derived',
      binding: 'footer legal link label; body composed from menus + collections'
    }
  ]
}
c.pages = []
for (const locale of c.locales) {
  for (const r of routes(locale)) {
    const file = L[locale].file(r.file)
    const content = [
      {
        id: 'h1',
        selector: 'main h1',
        source: file,
        owner: r.owner ?? 'field',
        binding: r.binding ?? `${r.id}.title`,
        attribute: 'text',
        expected: r.h1
      }
    ]
    if (r.lede)
      content.push({
        id: 'lede',
        selector: 'main h1 ~ p >> nth=0',
        source: file,
        owner: r.owner ?? 'field',
        binding: r.binding ?? `${r.id}.lede`,
        attribute: 'text',
        expected: r.lede
      })
    for (const e of r.extra ?? []) content.push({ source: file, ...e })
    c.pages.push({
      id: `${locale}-${r.id}`,
      path:
        (r.path === '/' ? L[locale].P || '/' : `${L[locale].P}${r.path}`) +
        (r.query?.[locale] ? `?q=${encodeURIComponent(r.query[locale])}` : ''),
      locale,
      status: r.status ?? 200,
      identity: 'main h1',
      source: [file],
      variants: ALL,
      render: renderOf(r.id),
      states: r.states ?? ['default'],
      rules: [
        ...COMMON,
        r.rule,
        ...(r.id === 'home' ? ['eyebrow', 'btn-primary'] : []),
        ...(r.id === 'article'
          ? ['h2-prose', 'h2-font', 'p-article', 'p-lede']
          : r.id === 'kit-style-guide'
            ? ['h2-guide', 'p-card']
            : ['h2-font', 'p-card']),
        'h3-font',
        'p-font',
        'footer-link',
        'btn-forest',
        'btn-any',
        'chip'
      ],
      // Derived pages (detail, archive, generated) are measured against the canvas page of their family:
      // chrome parity holds, heading/lede/CTA parity would compare different roles.
      parity: DERIVED.has(r.id)
        ? ['navSecond', 'navHover', 'headerCta', 'headerCtaHover', 'footerLink', 'footerLinkHover']
        : undefined,
      // A derived page's picture count is data (a sector with two projects, a title-only Terms page);
      // what must still hold is "no placeholder where a picture belongs".
      images: DERIVED.has(r.id) ? 'placeholders' : undefined,
      content
    })
  }
}
// Every canvas page is converted (kit pages included); scripts, images and decks are assets.
for (const f of c.source.files)
  if (f.disposition === 'converted' && !c.pages.some((p) => p.source.includes(f.path)))
    throw new Error(`converted source without a page: ${f.path}`)
// ── layouts: what the eyes look at. One representative page per layout (a view; kit pages are each
// their own layout because the Kit view dispatches to a different component per page). The
// representative is the heaviest member: the base list page for list views (longest lists), the
// route's own page otherwise. Pictures are taken for representatives only; every page is still measured.
const layoutKeyOf = (r) => (r.id.startsWith('kit-') ? r.id : VIEW[r.id])
const BASE = { Projects: 'projects', News: 'news', Page: 'terms' }
{
  const groups = new Map()
  for (const p of c.pages) {
    const rid = p.id.replace(/^[a-z]{2}-/, '')
    const key = layoutKeyOf({ id: rid })
    p.layout = key
    if (!groups.has(key))
      groups.set(key, { id: key, view: VIEW[rid] ? `src/views/${VIEW[rid]}.astro` : undefined, pages: [] })
    groups.get(key).pages.push(p.id)
  }
  c.layouts = [...groups.values()].map((g) => {
    const en = g.pages.filter((id) => id.startsWith(`${c.defaultLocale}-`))
    const base = BASE[g.id] ? `${c.defaultLocale}-${BASE[g.id]}` : null
    const representative = en.includes(base) ? base : en[0]
    const rep = c.pages.find((p) => p.id === representative)
    // A layout has its own source render when its representative's canvas page is not a family stand-in.
    const NO_OWN_SOURCE = new Set(['service', 'search', 'not-found', 'terms', 'privacy', 'sitemap'])
    const hasSource = !NO_OWN_SOURCE.has(representative.replace(/^[a-z]{2}-/, ''))
    return { id: g.id, view: g.view, representative, pages: g.pages, states: rep.states, hasSource }
  })
}
// ── design system: the sets every page must draw from, generated from tokens.css (both themes) and the
// contract's own rules; checked on all 48 pages by the off-system scanner — including the 22 pages the
// canvas never drew, which is the point (a customer's new page is held by the system, not by a mock).
{
  const css = readFileSync('src/styles/tokens.css', 'utf8')
  const block = (re) => (css.match(re) ?? [null, ''])[1]
  const light = block(/@theme\s*{([\s\S]*?)\n}/)
  const dark = block(/html\[data-theme="dark"\]\s*{([\s\S]*?)\n}/)
  const vars = (text) =>
    Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
  const L = vars(light),
    D = { ...L, ...vars(dark) }
  const resolve = (v, table, depth = 0) =>
    depth > 5 ? v : v.replace(/var\(--([a-z0-9-]+)\)/g, (_, n) => resolve(table[n] ?? '', table, depth + 1))
  const toRgb = (v) => {
    const t = v.trim().toLowerCase()
    const hex = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/)
    if (hex) {
      const h = hex[1].length === 3 ? [...hex[1]].map((ch) => ch + ch).join('') : hex[1]
      return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
    }
    const rgb = t.match(/^rgba?\(([^)]+)\)$/)
    if (rgb) {
      const parts = rgb[1].split(',').map((x) => x.trim())
      return parts.length === 4 && Number(parts[3]) < 0.99 /* the canvas writes .996 for opaque */
        ? `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${Number(parts[3])})`
        : `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`
    }
    return null
  }
  const palette = (table) =>
    [
      ...new Set(
        Object.entries(table)
          .filter(([k]) => k.startsWith('color-'))
          .map(([, v]) => toRgb(resolve(v, table)))
          .filter(Boolean)
      )
    ].sort()
  // The canvas is the type scale's only witness: every font-size its pages set inline (31 values, 9–34px)
  // plus the rules' clamp() results at each width. A size outside this set never came from the design.
  const sourceSizes = [
    ...new Set(
      c.source.files
        .filter((f) => /\.html?$/i.test(f.path))
        .flatMap((f) =>
          [...readFileSync(path.join(sourceDir, f.path), 'utf8').matchAll(/font-size:\s*([\d.]+)px/g)].map(
            (m) => `${Number(m[1])}px`
          )
        )
    )
  ]
  // Fluid sizes: `font-size:clamp(a, vw, b)` — any value between a and b is the design's.
  const ranges = [
    ...new Set(
      c.source.files
        .filter((f) => /\.html?$/i.test(f.path))
        .flatMap((f) =>
          [
            ...readFileSync(path.join(sourceDir, f.path), 'utf8').matchAll(
              /font-size:\s*clamp\(([\d.]+)px,[^,]+,([\d.]+)px\)/g
            )
          ].map((m) => `${Number(m[1])}-${Number(m[2])}`)
        )
    )
  ]
    .map((r) => r.split('-').map(Number))
    .sort((a, b) => a[0] - b[0])
  const sizes = [
    ...new Set([
      ...sourceSizes,
      ...c.design.rules.flatMap((r) =>
        Object.values(r.styles ?? {})
          .map((st) => st['font-size'])
          .filter(Boolean)
      )
    ])
  ].sort((a, b) => parseFloat(a) - parseFloat(b))
  c.designSystem = {
    source:
      'src/styles/tokens.css (@theme + html[data-theme=dark]); font sizes: every inline font-size of the canvas + design.rules',
    colors: { light: palette(L), dark: palette(D) },
    // Text and borders may also be fully transparent or the two absolutes the source uses for contrast.
    colorsAlways: ['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', 'rgb(0, 0, 0)'],
    fonts: c.fonts.allowed,
    type: { sizes, ranges, tolerance: 0.5 },
    // 0 everywhere except circles (avatars, dots): `50%` in the canvas, `rounded-full` (9999px) on the site.
    radius: ['0px', 'full'],
    // Which computed properties the scanner reads, and where. Spacing has no declared scale in this
    // design (15/32/12px live in the mock itself), so it is not checked — see TODO §7.3.
    check: {
      colors: [
        'color',
        'background-color',
        'border-top-color',
        'border-bottom-color',
        'border-left-color',
        'border-right-color'
      ],
      type: ['font-size'],
      radius: ['border-top-left-radius'],
      scope: 'header, main, footer'
    }
  }
}
c.distribution.include = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'template.config.json',
  'astro.config.mjs',
  'tsconfig.json',
  'components.json',
  'emdash-env.d.ts',
  'Dockerfile',
  'public',
  'seed',
  'src',
  'tools',
  'tests',
  'docs',
  'README.md',
  'AGENTS.md',
  'PROVENANCE.md',
  'LICENSE',
  'artifact.json',
  '.env.example'
]
c.distribution.required = [
  // What the fleet needs to turn the zip into a running site: tracy-host unzips it to app.new/ and
  // runs `docker build` there. Without these two the release packs, uploads, and dies on the host
  // (measured 16/09/2026 with tracy-saas: "app.new/Dockerfile: no such file").
  'Dockerfile',
  'tools/docker-entrypoint.sh',
  'tools/qa.mjs',
  'tools/qa-contract.mjs',
  'tools/distribution.mjs',
  'tools/qa-receipt.mjs',
  'tools/admin-session.mjs',
  'tools/admin-roundtrip.mjs',
  'tools/recovery-check.mjs',
  'tools/forms-check.mjs',
  'tools/clean-install.sh',

  'public/favicon.svg',
  'seed/seed.json',
  'seed/media-map.json',
  'seed/field-map.json',
  ...filesUnder('.', 'seed/media')
]
c.capabilities = ['i18n', 'forms', 'smtp', 'audit-log', 'search', 'seo', 'media']
c.pending = []
c.visual.shots = deriveShots(c)
writeFileSync(opt('--out', 'qa.contract.json'), JSON.stringify(c, null, 2) + '\n')
console.log(
  JSON.stringify({
    pages: c.pages.length,
    variants: c.variants.length,
    rules: c.design.rules.length,
    sourceFiles: c.source.files.length
  })
)

#!/usr/bin/env node
// Builds qa.contract.json for JA Nova. Every DECISION (pages, roles, interactions, strings) is in ingest/contract-spec.json;
// every NUMBER and every expected string is MEASURED ON THE SOURCE (the live Joomla site) into ingest/source-measures.json by a
// measuring script kept outside the package (it needs the running source). This script only joins the two, so the contract is
// reproducible without a browser:
//   node tools/qa-contract.mjs init <snapshot-folder> qa.contract.json --config template.config.json   # once: hashes the source files
//   node ingest/build-contract.mjs [--out qa.contract.json]
//   node tools/qa-contract.mjs qa.contract.json --source <snapshot-folder>
import { withPatches } from '../tools/qa-contract.mjs'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'qa.contract.json'
const contract = JSON.parse(readFileSync(OUT, 'utf8'))
const config = JSON.parse(readFileSync('template.config.json', 'utf8'))
const spec = JSON.parse(readFileSync('ingest/contract-spec.json', 'utf8'))
const measures = JSON.parse(readFileSync('ingest/source-measures.json', 'utf8'))

const srcFile = (p) => (p === '/' ? 'index.html' : `${p.slice(1)}/index.html`)
const VARIANTS = spec.variants
contract.variants = contract.variants.filter((v) => VARIANTS.includes(v.id))
const ALL = contract.variants.map((v) => v.id)
const UI_PAGES = [...spec.pages]

// ── source ─────────────────────────────────────────────────────────────────────────────────────────────────
contract.source.kind = 'url'
contract.source.parity = 'two-sided'
contract.design.theme = config.qa.theme

// ── rules: styles measured on the source, per variant ─────────────────────────────────────────────────────
const roleById = Object.fromEntries(spec.roles.map((r) => [r[0], r]))
const pageRoles = (pg) => (pg.bare ? pg.roles : [...spec.base, ...pg.roles])
const styles = {} // role -> variant -> styles
for (const pg of UI_PAGES)
  for (const v of ALL)
    for (const id of pageRoles(pg)) {
      const m = measures.pages[pg.id]?.[v]?.[id]
      if (!m) continue
      const have = ((styles[id] ??= {})[v] ??= m.styles)
      if (JSON.stringify(have) !== JSON.stringify(m.styles))
        console.warn(`warning: role ${id} differs on the source between pages (${pg.id}, ${v}); the first page wins`)
    }
const used = new Set(UI_PAGES.flatMap(pageRoles))
contract.design.rules = [...used].map((id) => {
  const [, selector, , , optional] = roleById[id]
  const rule = { id, selector, source: 'index.html', styles: styles[id] ?? {} }
  if (optional) rule.optional = true
  else if (Object.keys(rule.styles).length !== ALL.length) {
    // a required role must have a value everywhere it is used; on a variant where the source lacks it, repeat nothing: fail loudly
    const missing = ALL.filter((v) => !rule.styles[v])
    const pages = UI_PAGES.filter((pg) => pageRoles(pg).includes(id)).map((pg) => pg.id)
    throw new Error(`rule ${id} has no source element on ${missing.join(', ')} (pages: ${pages.join(', ')})`)
  }
  return rule
})
// the first page that carries a rule is where it is read from
for (const rule of contract.design.rules) {
  const pg = UI_PAGES.find((p) => pageRoles(p).includes(rule.id))
  rule.source = srcFile(pg.src)
}

// ── content: strings the SOURCE says (never read back from the running site) ──────────────────────────────
const F = (pgId, [id, selector, , owner, binding, attribute = 'text']) => {
  const expected = measures.content[pgId]?.[id]
  if (typeof expected !== 'string') throw new Error(`no source string for ${pgId}/${id}`)
  return { id, selector: `${selector} >> nth=0`, source: srcFile(UI_PAGES.find((p) => p.id === pgId).src), owner, binding, attribute, expected }
}
const q = (s) => `"${s.replaceAll('"', '\\"')}"`

// ── interactions ───────────────────────────────────────────────────────────────────────────────────────────
contract.interactions = {
  offcanvas: {
    trigger: '[data-nv-oc-open]',
    panel: '#nv-offcanvas',
    link: '#nv-offcanvas .nv-oc-nav a[href="/services"]',
    open: 'click',
    fullWidth: false
  },
  dropdown: {
    trigger: '.nv-nav > ul > li.has-sub:nth-child(2) > a',
    panel: '.nv-nav > ul > li.has-sub:nth-child(2) > .nv-sub',
    link: '.nv-nav > ul > li.has-sub:nth-child(2) .nv-sub a[href="/career"]',
    open: 'hover'
  },
  accordion: {
    trigger: '.nv-acc-group > :nth-child(2) .nv-acc-btn',
    panel: '.nv-acc-group > :nth-child(2) .nv-acc-panel',
    link: '.nv-acc-action a',
    open: 'click'
  },
  'pricing-tabs': {
    trigger: '.nv-pricing-tab >> nth=1',
    panel: '.nv-pricing-pane >> nth=1',
    link: '.nv-pricing-pane >> nth=1 >> .nv-blk-btn',
    open: 'click'
  },
  'show-more': {
    trigger: '[data-collapse-toggle] >> nth=0',
    panel: '.nv-collapse >> nth=0',
    link: '.nv-collapse >> nth=0 >> a',
    open: 'click'
  }
}

// ── pages ──────────────────────────────────────────────────────────────────────────────────────────────────
const PARITY = (pg) => (pg.bare ? ['ground'] : ['nav', 'footerTitle', 'ground', ...(pg.id === 'home' ? ['heroTitle'] : [])])
const common = { locale: 'en', states: ['default'] }
const mk = (pg, over = {}) => ({
  id: `en-${pg.id}`,
  path: pg.path,
  ...common,
  variants: ALL,
  status: pg.status ?? 200,
  identity: pg.identity ?? `h1:text-is(${q(measures.content[pg.id].h1 ?? measures.content[pg.id].title)})`,
  source: [srcFile(pg.src)],
  rules: pageRoles(pg),
  parity: PARITY(pg),
  content: pg.content.map((c) => F(pg.id, c)),
  ...over
})
contract.pages = UI_PAGES.map((pg) => {
  // 404: the source answers with h2 where the port has the h1; identity is the code span
  if (pg.id === 'not-found') return mk(pg, { identity: '.nv-err-code' })
  return mk(pg)
})
// A state belongs to a page and runs at every variant of that page, but a panel is only there at its own width (the hamburger below
// 992px, the drop-down above): each state therefore gets a twin of Home, told apart by a query the site ignores.
const home = UI_PAGES.find((p) => p.id === 'home')
const D = ALL.filter((v) => v.startsWith('1440'))
const M = ALL.filter((v) => v.startsWith('390'))
const twin = (suffix, key, variants, state, pg = home) =>
  mk(pg, { id: `en-${pg.id}-${suffix}`, path: `${pg.path}?ui=${key}`, variants, states: ['default', state] })
const careerPg = UI_PAGES.find((p) => p.id === 'career')
contract.pages.push(
  twin('offcanvas', 'menu', M, 'offcanvas'),
  twin('dropdown', 'nav', D, 'dropdown'),
  twin('accordion', 'faq', ALL, 'accordion'),
  twin('pricing', 'plans', ALL, 'pricing-tabs'),
  twin('show-more', 'positions', ALL, 'show-more', careerPg)
)

// ── layouts: eyes look per layout (one representative page), the machine measures per page ───────────────
const ids = (re) => contract.pages.filter((p) => re.test(p.id)).map((p) => p.id)
const layout = (id, view, rep, pages, family, states = ['default']) => ({
  id,
  view,
  representative: rep,
  pages,
  states,
  ...(family ? { family } : {}),
  hasSource: true
})
const stateOf = (suffix) => contract.pages.find((p) => p.id.endsWith(`-${suffix}`)).states
contract.layouts = [
  layout('Home', 'src/views/Home.astro', 'en-home', ['en-home', 'en-home-offcanvas', 'en-home-dropdown', 'en-home-accordion', 'en-home-pricing'], undefined, ['default', 'offcanvas', 'dropdown', 'accordion', 'pricing-tabs']),
  layout('Page', 'src/views/Page.astro', 'en-about', ['en-about', 'en-career', 'en-career-show-more', 'en-services', 'en-project'], undefined, ['default', 'show-more']),
  layout('Service', 'src/views/Service.astro', 'en-svc-illustration', ids(/^en-svc-/), 'detail'),
  layout('BlogList', 'src/views/BlogList.astro', 'en-blog', ['en-blog', 'en-project-illustration', 'en-project-branding', 'en-project-ui-ux-design'], 'list'),
  layout('Post', 'src/views/Post.astro', 'en-post', ['en-post', 'en-project-detail'], 'detail'),
  layout('Contact', 'src/views/Contact.astro', 'en-contact', ['en-contact'], 'form'),
  layout('Search', 'src/views/Search.astro', 'en-search', ['en-search'], 'form'),
  layout('NotFound', 'src/views/NotFound.astro', 'en-not-found', ['en-not-found'])
]
void stateOf

// ── parity: the same logical element on the source render and on the site ─────────────────────────────────
contract.design.parity = {
  selectors: {
    nav: { site: '.nv-nav > ul > li:nth-child(1) > a', source: '.t4-megamenu .nav-item:nth-child(1) > a' },
    footerTitle: { site: '.nv-footer-title', source: '#t4-footer .module-title' },
    heroTitle: { site: '.nv-hero-title', source: '.hero-title' },
    ground: 'body'
  },
  properties: ['font-size', 'font-weight', 'letter-spacing', 'padding-top', 'padding-left'],
  hexTolerance: 8,
  pxTolerance: 1
}
contract.design.images = { scope: 'body', placeholder: null }
contract.design.exceptions = []
delete contract.design.coverage
contract.fonts = {
  selectors: ['h1', 'h2', 'h3', 'p', 'a', 'button', 'span', 'li'],
  platform: 'Chromium (Playwright). Local files served by Astro (src/fonts.json): Golos Text 400, 500 and 700.',
  allowed: { en: ['Golos Text'] }
}
contract.capabilities = ['audit-log', 'seo', 'media', 'forms']
contract.reviews.forms = { mode: 'required' }
contract.visual = {
  stages: [
    { id: 'light-desktop', variants: ['1440-light'] },
    { id: 'light-responsive', variants: ['390-light'] },
    { id: 'dark-desktop', variants: ['1440-dark'] },
    { id: 'dark-responsive', variants: ['390-dark'] }
  ],
  shots: [
    { stages: ['light-desktop'], side: 'site', locales: ['en'], consumers: ['layout', 'typography', 'color', 'images', 'interaction'] },
    { stages: ['light-responsive'], side: 'site', locales: ['en'], consumers: ['layout', 'typography', 'images'] },
    { stages: ['dark-desktop'], side: 'site', locales: ['en'], consumers: ['color', 'layout'] },
    { stages: ['dark-responsive'], side: 'site', locales: ['en'], consumers: ['layout', 'color'] },
    { stages: ['light-desktop', 'light-responsive'], side: 'source', locales: ['en'], consumers: ['layout', 'typography', 'images'], ownSourceOnly: true }
  ],
  fastGate: {
    add: [
      { page: 'en-contact', reason: 'Contact draws the form box (own components, not shared with the other pages)' },
      { page: 'en-search', reason: 'Search draws its own result list (own components)' },
      { page: 'en-career', reason: 'Career draws the collapsible position cards (own component)' }
    ]
  },
  renderInputs: [
    'src/styles/**',
    'src/layouts/Base.astro',
    'src/components/**',
    'src/lib/**',
    'astro.config.mjs',
    'template.config.json',
    'seed/seed.json',
    'public/**'
  ]
}

// ── source files: converted when a page reads them, otherwise excluded with the reason ───────────────────
const mapped = new Set(contract.pages.flatMap((p) => p.source))
const REASONS = [
  [/(^|\/)(login-form|registration-form)\//, 'visitor accounts are not ported: a customer site has no front-end sign-in'],
  [/^(error-page|offline-pages|typography|featured-articles)\//, 'demo page of the source (error and offline pages, typography, featured list): not ported'],
  [/^(author-listting|tags)\//, 'author and tag listings of the source blog: the port lists posts under the blog and the project categories only'],
  [/^category-blog\/[^/]+\//, 'one more article of the blog: one detail view serves them all, the representative is the first article'],
  [/^category-blog\/index~/, 'a further page of the blog list: the same view as the first page'],
  [/^project\/(branding|illustration|ui-ux-design)\/[^/]+\//, 'one more project of a category: one detail view serves them all, the representative is Packaging Design'],
  [/^index\.php\//, 'the same page as its SEF twin'],
  [/.*/, 'no built page reads this file']
]
for (const f of contract.source.files)
  if (mapped.has(f.path)) {
    f.disposition = 'converted'
    delete f.reason
  } else if (f.disposition === 'converted' || f.disposition === 'excluded') {
    f.disposition = 'excluded'
    f.reason = REASONS.find(([re]) => re.test(f.path))[1]
  }

// ── distribution ───────────────────────────────────────────────────────────────────────────────────────────
contract.pending = []
contract.revision = (contract.revision ?? 0) + 1
contract.distribution = {
  include: withPatches([
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
    'public/nova/**',
    'seed',
    'src',
    'tools',
    'ingest',
    'contract',
    'tests',
    'docs',
    'README.md',
    'AGENTS.md',
    'PROVENANCE.md',
    'LICENSE',
    'artifact.json',
    '.env.example'
  ]),
  required: [
    'tools/qa.mjs',
    'tools/qa-contract.mjs',
    'tools/distribution.mjs',
    'tools/qa-receipt.mjs',
    'tools/admin-session.mjs',
    'tools/admin-roundtrip.mjs',
    'tools/recovery-check.mjs',
    'tools/clean-install.sh',
    'tools/personalize.mjs',
    'tools/forms.json',
    'public/favicon.svg',
    'seed/seed.json',
    'seed/media-map.json',
    'seed/field-map.json',
    'seed/questions.json',
    'seed/personalize.json'
  ].filter((p) => existsSync(p) || p === 'public/favicon.svg')
}
writeFileSync(OUT, JSON.stringify(contract, null, 2) + '\n')
console.log(`build-contract: ${contract.pages.length} pages, ${contract.design.rules.length} rules x ${ALL.length} variants, revision ${contract.revision}`)

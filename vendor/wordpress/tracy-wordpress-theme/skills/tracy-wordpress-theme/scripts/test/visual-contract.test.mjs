import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { testBase } from './lib/test-root.mjs'
import path from 'node:path'
import * as contractMod from '../visual/contract.mjs'
import { buildContract, validateContract, parityFromPatterns, specHash, STAGES, LENSES } from '../visual/contract.mjs'

const pageMap = {
  locales: ['en', 'ru'],
  defaultLocale: 'en',
  source: { kind: 'html' },
  pages: [
    { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en', sections: [{ modules: ['hero'] }] },
    { file: 'About.html', view: 'page', title: 'About', path: '/about', locale: 'en', sections: [{ modules: ['hero'] }] },
    { file: 'Article.html', view: 'single', title: 'Post', path: '/article', locale: 'en' },
    { file: '404.html', view: '404', title: 'Not found', path: '/404', locale: 'en' },
    { file: 'RU/About_ru.html', view: 'page', title: 'О компании', path: '/ru/about', locale: 'ru' },
    { file: 'x.html', view: 'category', title: 'x', path: '/news', locale: 'en', synthetic: true }
  ]
}
const reference = { pages: [{ page: 'About.html', path: 'reference/rendered/about--1440-light.html' }] }
// The template WordPress serves each page is evidence the contract needs (contract.mjs templateFromBody);
// these fixtures declare it the way a dossier's review.config.json can.
const reviewConfig = { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' }, templates: { '/': 'front-page', '/about': 'page', '/article': 'single', '/404': '404', '/ru/about': 'page' } }
// …and a built theme with those files (contract.mjs checks every template in it).
const themeTemplates = new Set(Object.values(reviewConfig.templates))
const seedReport = {
  routes: [
    { path: '/about', status: 200 },
    { path: '/ru/%d0%be-%d0%ba/', pagemapPath: '/ru/about', status: 200 },
    { path: '/article', status: 301, location: 'http://x/first-post/' }
  ]
}
const patternsMap = {
  types: {
    hero: {
      pattern: 'wp-x/section-hero',
      root: '.wtb-hero',
      fields: {
        heading: { block: 'core/heading', path: 'hero.heading', attr: 'content' },
        headingLevel: { block: 'core/heading', path: 'hero.heading', attr: 'level' },
        ctas: { block: 'core/button', path: 'hero.cta.<n>', attr: 'text+href', repeat: 'ctas' }
      }
    }
  }
}
const patternFiles = {
  hero: `<!-- wp:heading {"level":1,"className":"wtb-hero__heading big","metadata":{"role":"content","name":"hero.heading"}} -->
<h1></h1>
<!-- /wp:heading -->
<!-- wp:button {"className":"is-style-orange","metadata":{"role":"content","name":"hero.cta.1"}} -->`
}
const build = () => buildContract({ pageMap, reference, reviewConfig, themeTemplates, patternsMap, patternFiles, seedReport, specHash: 'sha256:abc', id: 't' })

test('contract: pages take their real seeded path, layouts come from the view with a default-locale representative, a synthetic page is skipped', () => {
  const c = build()
  assert.equal(c.pages.length, 5)
  const by = Object.fromEntries(c.pages.map((p) => [p.id, p]))
  assert.equal(by['ru-about'].path, '/ru/%d0%be-%d0%ba/')
  assert.equal(by['en-article'].path, '/first-post/')
  assert.equal(by['en-404'].status, 404)
  assert.equal(by['en-about'].identity.body, 'tracy-page-page')
  assert.equal(by['en-home'].identity.body, 'tracy-page-home')
  assert.equal(by['en-about'].sourceRendered, 'reference/rendered/about--1440-light.html')
  const page = c.layouts.find((l) => l.id === 'page')
  assert.deepEqual(page.pages, ['en-about', 'ru-about'])
  assert.equal(page.representative, 'en-about')
  assert.equal(page.template, 'templates/page.html')
  assert.deepEqual(c.visual.stages.map((s) => s.id), STAGES.map((s) => s.id))
  assert.equal(c.design.theme.storage.key, 'tracy_theme')
  // #75: the skipped synthetic page is reported, never counted as covered — validation names it until --pairs gives it a rule.
  assert.deepEqual(validateContract(c), ['unpaired synthetic page /news (category) has no source pair — give --pairs a rule for it'])
  assert.deepEqual(validateContract(buildContract({ pageMap: { ...pageMap, pages: pageMap.pages.filter((p) => !p.synthetic) }, reference, reviewConfig, themeTemplates, patternsMap, patternFiles, seedReport, specHash: 'sha256:abc', id: 't' })), [])
})

test('contract binds effective reference.kind and rejects none/source contradictions', () => {
  const brief = buildContract({
    pageMap: { defaultLocale: 'en', locales: ['en'], pages: [{ file: 'Brief.html', view: 'front-page', title: 'Brief', path: '/' }] },
    reference: { kind: 'none', pages: [] },
    reviewConfig: { containers: { none: 'no declared source grid' }, templates: { '/': 'front-page' } },
    themeTemplates: new Set(['front-page']), specHash: 'sha256:brief', id: 'brief'
  })
  assert.equal(brief.pages[0].referenceKind, 'none')
  assert.deepEqual(validateContract(brief), [])
  assert.match(validateContract({ ...brief, pages: [{ ...brief.pages[0], sourceRoute: '/' }] }).join(' | '), /reference\.kind=none cannot carry a source/)
  for (const referenceKind of ['html', 'url']) {
    assert.equal(validateContract({ ...brief, pages: [{ ...brief.pages[0], referenceKind }] }).some((error) => /declares a source but the contract carries none/.test(error)), false)
  }
  const specDir = mkdtempSync(path.join(testBase(), 'brief-reference-'))
  const pm = { defaultLocale: 'en', locales: ['en'], pages: [{ file: 'Brief.html', view: 'front-page', title: 'Brief', path: '/' }] }
  const ref = { kind: 'none', pages: [] }
  for (const [file, value] of Object.entries({ 'page-map.json': pm, 'reference.json': ref, 'sections.json': {}, 'content.json': {} })) writeFileSync(path.join(specDir, file), JSON.stringify(value))
  const bound = buildContract({ pageMap: pm, reference: ref, reviewConfig: { containers: { none: 'none' }, templates: { '/': 'front-page' } }, themeTemplates: new Set(['front-page']), specHash: specHash(specDir), id: 'bound-none' })
  assert.deepEqual(validateContract(bound, { specDir }), [])
  assert.match(validateContract({ ...bound, pages: [{ ...bound.pages[0], referenceKind: 'url' }] }, { specDir }).join(' | '), /does not match reference\.json kind none/)
})

test('contract: parity pairs come from the pattern files — the class of the block named metadata.name under the type root; level fields are skipped', () => {
  const pairs = parityFromPatterns(patternsMap, patternFiles)
  assert.deepEqual(pairs, [
    { key: 'hero.heading', site: '.wtb-hero .wtb-hero__heading', sourceRole: 'heading', type: 'hero' },
    { key: 'hero.ctas', site: '.wtb-hero .is-style-orange', sourceRole: 'ctas', type: 'hero' }
  ])
})

test('contract: the validator refuses each defect by name', () => {
  const cases = [
    ['pending decision', (c) => c.pending.push({ what: 'font' }), /pending must be empty/],
    ['locale not declared', (c) => (c.pages[0].locale = 'de'), /locale de not declared/],
    ['state not declared', (c) => c.pages[0].states.push('drawer'), /state drawer not declared/],
    ['coverage empty', (c) => (c.design.coverage = []), /coverage is empty/],
    ['rule without a variant', (c) => c.design.rules.push({ id: 'btn', selector: '.b', source: 'x', styles: { '1440-light': {} } }), /no styles for variant 1440-dark/],
    ['exception without a decision', (c) => c.design.exceptions.push({ kind: 'scan:contrast', match: 'x', reason: 'looks fine' }), /cited decision/],
    ['representative not in layout', (c) => (c.layouts[0].representative = 'nope'), /representative nope is not one of its pages/],
    ['stage order changed', (c) => c.visual.stages.reverse(), /visual.stages must be/],
    ['picture nobody consumes', (c) => (c.visual.shots[0].consumers = []), /no consumers/],
    ['duplicate route', (c) => (c.pages[1].path = c.pages[0].path), /duplicate route/]
  ]
  for (const [name, mutate, re] of cases) {
    const c = build()
    mutate(c)
    const errors = validateContract(c)
    assert.ok(errors.some((e) => re.test(e)), `${name}: expected ${re}, got ${JSON.stringify(errors)}`)
  }
})

test('contract: bound to one spec-pack — a changed sections.json fails the hash check; a missing rendered source is named', () => {
  const dir = mkdtempSync(path.join(testBase(), 'spec-'))
  for (const f of ['page-map.json', 'sections.json', 'content.json']) writeFileSync(path.join(dir, f), '{}')
  mkdirSync(path.join(dir, 'reference', 'rendered'), { recursive: true })
  const c = buildContract({ pageMap, reference, reviewConfig, themeTemplates, seedReport, specHash: specHash(dir), id: 't' })
  const errors = validateContract(c, { specDir: dir })
  assert.ok(errors.some((e) => /rendered source .* not found/.test(e)), JSON.stringify(errors))
  assert.ok(!errors.some((e) => /source.hash/.test(e)))
  writeFileSync(path.join(dir, 'sections.json'), '{"changed":1}')
  assert.ok(validateContract(c, { specDir: dir }).some((e) => /does not match the spec-pack/.test(e)))
})

test('contract: five lenses, four variants', () => {
  assert.deepEqual([...LENSES], ['layout', 'typography', 'color', 'images', 'interaction'])
  assert.equal(build().variants.length, 4)
})

test('contract: present malformed visual exception lists are refused by field name', () => {
  for (const [field, value] of [['exceptions', {}], ['menuPairs', null], ['exceptions', 'bad']]) {
    assert.throws(() => buildContract({ pageMap, reference, reviewConfig: { ...reviewConfig, visual: { [field]: value } }, themeTemplates, patternsMap, patternFiles, seedReport, specHash: 'sha256:abc', id: 't' }), new RegExp(`visual\\.${field}.*list`))
  }
})

// WordPress has no search PAGE, it has a search query: `/search` redirects to the locale root, so
// following the redirect (right for `/article` → the first post) would put the search view on top
// of the home page — two contract pages on one route, and the results never measured.
test('a search view is measured at its query, and without a term the duplicate names what is missing', () => {
  const map = {
    locales: ['en', 'ru'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: [
      { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en', sections: [] },
      { file: 'Search.html', view: 'search', title: 'Search', path: '/search', locale: 'en', sections: [] },
      { file: 'RU/Home_ru.html', view: 'front-page', title: 'Главная', path: '/ru', locale: 'ru', sections: [] },
      { file: 'RU/Search_ru.html', view: 'search', title: 'Поиск', path: '/ru/search', locale: 'ru', sections: [] }
    ]
  }
  const routes = {
    routes: [
      { path: '/', status: 200 },
      { path: '/search', status: 301, location: 'http://x/' },
      { path: '/ru', status: 200 },
      { path: '/ru/search', status: 301, location: 'http://x/ru/' }
    ]
  }
  const withTerm = buildContract({
    pageMap: map,
    reference,
    reviewConfig: { ...reviewConfig, search: { en: 'pre-engineered+building', ru: 'быстровозводимый корпус' } },
    seedReport: routes,
    specHash: 'sha256:x'
  })
  const pathOf = (id) => withTerm.pages.find((p) => p.id === id)?.path
  assert.equal(pathOf('en-search'), '/?s=pre-engineered+building')
  assert.equal(pathOf('ru-search'), '/ru/?s=быстровозводимый корпус')
  assert.deepEqual(validateContract(withTerm).filter((e) => /duplicate route/.test(e)), [])

  // Without a term BOTH search pages are wrong, and only one of them happens to collide with a
  // home page (`/` against `/`; RU lands on `/ru/` beside a home at `/ru`) — so the rule is its
  // own, not a side effect of the duplicate check.
  const without = buildContract({ pageMap: map, reference, reviewConfig, seedReport: routes, specHash: 'sha256:x' })
  const errors = validateContract(without).filter((e) => /search view is a QUERY/.test(e))
  assert.deepEqual(
    errors.map((e) => e.split(':')[0]),
    ['page en-search', 'page ru-search'],
    errors.join('\n')
  )
})

// The source export goes dark through its own hook. The contract carries it so the runner renders
// the source in dark beside a dark site; without it the comparison is dark against light and every
// colour differs.
test('the contract records how the SOURCE goes dark, and says so when the export has none', () => {
  const withHook = buildContract({
    pageMap: { ...pageMap, theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } } },
    reference,
    reviewConfig,
    seedReport,
    specHash: 'sha256:x'
  })
  assert.equal(withHook.source.darkHook, 'attr:data-theme=dark')
  const withClass = buildContract({
    pageMap: { ...pageMap, theme: { hook: { selector: 'html', className: 'is-dark', darkValue: 'is-dark' } } },
    reference,
    reviewConfig,
    seedReport,
    specHash: 'sha256:x'
  })
  assert.equal(withClass.source.darkHook, 'class:is-dark')
  const none = buildContract({ pageMap: { ...pageMap, theme: {} }, reference, reviewConfig, seedReport, specHash: 'sha256:x' })
  assert.equal(none.source.darkHook, null)
})

test('the page-map\'s declaration that the source has no dark of its own is carried as source.darkDerived, only when nothing puts the source into dark (ja-restaurant S-32)', () => {
  const mk = (theme, extra = {}) => buildContract({ pageMap: { ...pageMap, pages: pageMap.pages.filter((p) => !p.synthetic), theme }, reference, reviewConfig, themeTemplates, patternsMap, patternFiles, seedReport, specHash: 'sha256:abc', id: 't', ...extra })
  const derived = mk({ darkDerived: true, hook: null })
  assert.equal(derived.source.darkDerived, true)
  assert.deepEqual(validateContract(derived), [])
  // not declared, or a dark switch on the source (the export's hook, a live source's request cookie): its dark is measured
  assert.equal('darkDerived' in mk({ hook: null }).source, false)
  assert.equal('darkDerived' in mk({ darkDerived: true, hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } }).source, false)
  assert.equal('darkDerived' in mk({ darkDerived: true, hook: null }, { sourceDarkRequestHook: 'cookie:theme=dark' }).source, false)
  // a hand-edited contract that says both, or anything but true, is refused
  assert.ok(validateContract({ ...derived, source: { ...derived.source, darkHook: 'attr:data-theme=dark' } }).some((e) => /source\.darkDerived says the source has no dark/.test(e)))
  assert.ok(validateContract({ ...derived, source: { ...derived.source, darkDerived: 'yes' } }).some((e) => /source\.darkDerived "yes" is not true/.test(e)))
})

test('source.darkDerived stands only on a contract fresh for the spec-pack being read, whose page-map still declares it (review of S-32/S-40)', async () => {
  const { darkDerivedProblems, bindingsFrom } = await import('../lib/canonical.mjs')
  const dir = mkdtempSync(path.join(testBase(), 'dark-derived-'))
  const pm = { ...pageMap, pages: pageMap.pages.filter((p) => !p.synthetic), theme: { darkDerived: true, hook: null } }
  for (const [f, v] of [['page-map.json', pm], ['sections.json', {}], ['content.json', {}]]) writeFileSync(path.join(dir, f), JSON.stringify(v))
  const c = buildContract({ pageMap: pm, reference, reviewConfig, themeTemplates, patternsMap, patternFiles, seedReport, specHash: specHash(dir), bindings: bindingsFrom({ specDir: dir }), id: 't' })
  assert.deepEqual(darkDerivedProblems(c, { specDir: dir }), [])
  // no spec-pack to check it against, no specHash binding, a declaration with a dark switch: it does not stand
  assert.match(darkDerivedProblems(c).join(), /no spec-pack/)
  assert.match(darkDerivedProblems({ ...c, bindings: {} }, { specDir: dir }).join(), /no specHash binding/)
  assert.match(darkDerivedProblems({ ...c, source: { ...c.source, darkHook: 'attr:data-theme=dark' } }, { specDir: dir }).join(), /dark switch/)
  // the page-map moved on to a source with a dark of its own: the old contract is stale, its declaration closes nothing
  writeFileSync(path.join(dir, 'page-map.json'), JSON.stringify({ ...pm, theme: { hook: { selector: 'html', attribute: 'data-theme', lightValue: 'light', darkValue: 'dark' } } }))
  assert.match(darkDerivedProblems(c, { specDir: dir }).join(), /stale for the spec-pack/)
})

// Site decisions survive a regenerated contract only if they come from the dossier's config:
// `init` supersedes the canonical file, so an exception typed into it is gone on the next init.
test('rules, exceptions and coverage exclusions come from review.config.json visual.*', () => {
  const c = buildContract({
    pageMap,
    reference,
    reviewConfig: {
      ...reviewConfig,
      visual: {
        rules: [{ id: 'h1', selector: 'main h1', source: 'contract', styles: {} }],
        exceptions: [{ kind: 'examined-too-few', match: 'en-slide', reason: 'the slide page is div/span verbatim', decision: 'D24.1' }],
        coverageExclude: ['.tracy-aside *']
      }
    },
    seedReport,
    specHash: 'sha256:x'
  })
  assert.equal(c.design.rules[0].id, 'h1')
  assert.equal(c.design.exceptions[0].decision, 'D24.1')
  assert.match(c.design.coverage[0].selector, /:not\(\.tracy-aside \*\)$/)
  const bare = buildContract({ pageMap, reference, reviewConfig, themeTemplates, seedReport, specHash: 'sha256:x' })
  assert.deepEqual(bare.design.rules, [])
  assert.deepEqual(bare.design.exceptions, [])
})

// JA Vega M4 (26/09): the contract said `.tracy-mega__trigger/__panel` for a theme whose mega is
// `.jv-mega`, while the runner walked whatever `--mega-items` named. The contract now carries the
// selectors from review.config.json `mega`, the item included, and the runner reads them from it.
test('contract: interactions.mega carries the theme\'s mega selectors from review.config.json, the Tracy ones by default', () => {
  const byDefault = buildContract({ pageMap, reference, reviewConfig, themeTemplates, specHash: 'sha256:abc', id: 't' })
  assert.deepEqual(byDefault.interactions.mega, { items: '.tracy-mega', trigger: '.tracy-mega__trigger', panel: '.tracy-mega__panel', link: '.tracy-mega__panel a', open: 'hover' })
  const vega = buildContract({ pageMap, reference, reviewConfig: { ...reviewConfig, mega: { items: '.jv-mega', trigger: '.jv-mega__trigger', panel: '.jv-mega__panel' } }, specHash: 'sha256:abc', id: 't' })
  assert.deepEqual(vega.interactions.mega, { items: '.jv-mega', trigger: '.jv-mega__trigger', panel: '.jv-mega__panel', link: '.jv-mega__panel a', open: 'hover' })
  assert.ok(vega.pages.every((p) => p.states.includes('mega')))
  assert.deepEqual(buildContract({ pageMap, reference, reviewConfig: { ...reviewConfig, mega: false }, specHash: 'sha256:abc', id: 't' }).interactions, {})
  const half = buildContract({ pageMap, reference, reviewConfig: { ...reviewConfig, mega: { items: '.jv-mega' } }, specHash: 'sha256:abc', id: 't' })
  assert.ok(validateContract(half).some((e) => /interactions\.mega/.test(e)), 'an item without its trigger and panel is refused, not filled with another theme\'s classes')
})

test('contract: a category route the seeder built as a page is identified as a page, and still measured under its category layout', () => {
  const map = {
    locales: ['en'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: [
      { file: 'services.html', view: 'category', title: 'Services', path: '/services', locale: 'en' },
      { file: 'blog.html', view: 'category', title: 'Blog', path: '/blog', locale: 'en' }
    ]
  }
  const report = { routes: [{ path: '/services', status: 200, served: 'page' }, { path: '/blog', status: 200 }] }
  const c = buildContract({ pageMap: map, reference: { pages: [] }, reviewConfig, seedReport: report, specHash: 'sha256:abc', id: 't' })
  const by = Object.fromEntries(c.pages.map((p) => [p.id, p]))
  assert.equal(by['en-services'].identity.body, 'tracy-page-page', 'WordPress serves a page there, and the theme prints the page kind')
  assert.equal(by['en-services'].layout, 'category', 'the layout (coverage, representative) stays the view')
  assert.equal(by['en-blog'].identity.body, 'tracy-page-listing', 'no served mark (an older seed report): the view decides, as before')
  assert.deepEqual(c.layouts.map((l) => [l.id, l.pages.length]), [['category', 2]])
})

// ── JA Vega M4b (26/09): the template a layout names is the one WordPress serves ─────────────────
// `init` wrote `templates/<view>.html` for every view: six layouts named a file the theme does not
// have (page-login, page-register, page-account, category, author, tag — all served by page.html),
// and one `page` layout held pages served by page.html, page-article.html and page-service.html.
// The template of each page is read from what WordPress serves (the body class, resolved through
// the template hierarchy against the built theme's templates/) or declared in review.config.json
// `templates`; a page whose template is neither is pending, and a named file that is not in the
// built theme is an error.
const vegaMap = {
  locales: ['en'],
  defaultLocale: 'en',
  source: { kind: 'joomla' },
  pages: [
    { file: 'home', view: 'front-page', title: 'Home', path: '/', locale: 'en' },
    { file: 'login', view: 'page-login', title: 'Login Form', path: '/login-form', locale: 'en' },
    { file: 'typo', view: 'page', title: 'Typography', path: '/typography', locale: 'en' },
    { file: 'svc', view: 'page', title: 'Cloud', path: '/services/cloud', locale: 'en' },
    { file: 'svc2', view: 'page', title: 'Apps', path: '/services/apps', locale: 'en' },
    { file: 'blog', view: 'category', title: 'Blog', path: '/category-blog', locale: 'en' },
    { file: '404', view: '404', title: 'Not found', path: '/404', locale: 'en' }
  ]
}
const vegaServed = {
  'en-home': { template: 'front-page', from: 'site', evidence: 'home page page-template-default' },
  'en-login-form': { template: 'page', from: 'site', evidence: 'page page-template-default' },
  'en-typography': { template: 'page', from: 'site', evidence: 'page page-template-default' },
  'en-services-cloud': { template: 'page-service', from: 'site', evidence: 'page page-template-page-service' },
  'en-services-apps': { template: 'page-service', from: 'site', evidence: 'page page-template-page-service' },
  'en-category-blog': { template: 'page', from: 'site', evidence: 'page page-template-default' },
  'en-404': { template: '404', from: 'site', evidence: 'error404' }
}
const vegaTemplates = new Set(['404', 'front-page', 'index', 'page', 'page-service', 'single'])
const vegaConfig = { containers: { none: 'fixture without a container grid' }, hook: { type: 'attribute', name: 'data-theme' }, persistence: { type: 'cookie', key: 'tracy_theme' } }

test('contract: a layout is a view AND the template WordPress serves for it; one view on two templates is two layouts', () => {
  const c = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: vegaConfig, templates: vegaServed, themeTemplates: vegaTemplates, specHash: 'sha256:x', id: 'v' })
  assert.deepEqual(c.pending, [])
  const layouts = Object.fromEntries(c.layouts.map((l) => [l.id, l]))
  assert.deepEqual(Object.keys(layouts).sort(), ['404', 'category', 'front-page', 'page', 'page--page-service', 'page-login'])
  assert.equal(layouts['page-login'].template, 'templates/page.html', 'the file WordPress serves, not templates/page-login.html')
  assert.equal(layouts.category.template, 'templates/page.html')
  assert.deepEqual(layouts.page.pages, ['en-typography'])
  assert.deepEqual(layouts['page--page-service'].pages, ['en-services-cloud', 'en-services-apps'])
  assert.equal(layouts['page--page-service'].template, 'templates/page-service.html')
  assert.equal(layouts['page--page-service'].representative, 'en-services-cloud')
  assert.equal(layouts['page--page-service'].view, 'page')
  assert.equal(layouts.category.view, 'category', 'the family still comes from the view')
  const cloud = c.pages.find((p) => p.id === 'en-services-cloud')
  assert.equal(cloud.layout, 'page--page-service')
  assert.equal(cloud.view, 'page')
  assert.equal(cloud.template, 'templates/page-service.html')
  assert.equal(cloud.identity.body, 'tracy-page-page')
  assert.deepEqual(validateContract(c), [])
  // every layout's representative still gets its picture: one per template
  assert.ok(c.visual.shots.length > 0)
})

test('contract: a page whose served template is not known is pending, never guessed; a declared template not in the built theme is an error', () => {
  const partial = { ...vegaServed }
  delete partial['en-login-form']
  const c = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: vegaConfig, templates: partial, themeTemplates: vegaTemplates, specHash: 'sha256:x', id: 'v' })
  assert.ok(c.pending.some((x) => /en-login-form/.test(JSON.stringify(x)) && /template/.test(JSON.stringify(x))), JSON.stringify(c.pending))
  assert.equal(c.pages.find((p) => p.id === 'en-login-form').template, null)
  assert.ok(validateContract(c).some((e) => /pending/.test(e)))
  assert.ok(validateContract(c).some((e) => /layout page-login has no template/.test(e)), JSON.stringify(validateContract(c)))
  // nothing known at all (init without --site and no declared templates): pending, not templates/<view>.html
  const bare = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: vegaConfig, specHash: 'sha256:x', id: 'v' })
  assert.ok(bare.layouts.every((l) => l.template === null), JSON.stringify(bare.layouts))
  assert.ok(bare.pending.length > 0)
  // declared in review.config.json: taken, recorded as declared; a file the built theme lacks is refused
  const declared = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: { ...vegaConfig, templates: { '/login-form': 'page-login' } }, templates: partial, themeTemplates: vegaTemplates, specHash: 'sha256:x', id: 'v' })
  assert.ok(declared.pending.some((x) => /page-login/.test(JSON.stringify(x)) && /not in the built theme/.test(JSON.stringify(x))), JSON.stringify(declared.pending))
  // declared and served disagree: the contract does not pick one
  const clash = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: { ...vegaConfig, templates: { '/typography': 'page-service' } }, templates: vegaServed, themeTemplates: vegaTemplates, specHash: 'sha256:x', id: 'v' })
  assert.ok(clash.pending.some((x) => /en-typography/.test(JSON.stringify(x)) && /page-service/.test(JSON.stringify(x))), JSON.stringify(clash.pending))
})

test('contract: validation against the built theme names a template that is not there, and a layout whose template was never verified', () => {
  const dir = mkdtempSync(path.join(testBase(), 'built-'))
  mkdirSync(path.join(dir, 'templates'))
  for (const t of ['404', 'front-page', 'page']) writeFileSync(path.join(dir, 'templates', `${t}.html`), t)
  const c = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: vegaConfig, templates: vegaServed, themeTemplates: vegaTemplates, specHash: 'sha256:x', id: 'v' })
  const errors = validateContract(c, { themeDir: dir })
  assert.ok(errors.some((e) => /page--page-service.*templates\/page-service\.html.*not in the built theme/.test(e)), JSON.stringify(errors))
  // an older contract: templates/<view>.html with no record of where it came from
  const old = JSON.parse(JSON.stringify(c))
  for (const l of old.layouts) delete l.templateFrom
  assert.ok(validateContract(old).some((e) => /not verified/.test(e)), JSON.stringify(validateContract(old)))
})

test('template hierarchy: the served body class and the built theme decide the template file', () => {
  const t = contractMod.templateFromBody
  assert.equal(typeof t, 'function')
  const theme = new Set(['404', 'archive', 'front-page', 'home', 'index', 'page', 'page-contact', 'page-service', 'search', 'single'])
  assert.equal(t({ bodyClass: 'home wp-singular page-template-default page page-id-173', path: '/', templates: theme }).template, 'front-page')
  assert.equal(t({ bodyClass: 'wp-singular page-template-default page page-id-174', path: '/login-form/', templates: theme }).template, 'page')
  assert.equal(t({ bodyClass: 'page-template-default page page-id-174', path: '/login-form/', templates: new Set([...theme, 'page-login-form']) }).template, 'page-login-form', 'page-<slug> before page')
  assert.equal(t({ bodyClass: 'page-template page-template-page-service page page-id-192', path: '/services/cloud/', templates: theme }).template, 'page-service')
  assert.equal(t({ bodyClass: 'wp-singular post-template-default single single-post postid-117', path: '/blog/a-post/', templates: theme }).template, 'single')
  assert.equal(t({ bodyClass: 'archive category category-news category-4', path: '/category/news/', templates: theme }).template, 'archive')
  assert.equal(t({ bodyClass: 'search search-no-results', path: '/', templates: theme }).template, 'search')
  assert.equal(t({ bodyClass: 'error404', path: '/404', templates: theme }).template, '404')
  assert.equal(t({ bodyClass: 'blog', path: '/news/', templates: theme }).template, 'home')
  // an assigned template the built theme lacks, or a body class that names no known view, is not guessed
  assert.match(t({ bodyClass: 'page-template page-template-page-login page page-id-9', path: '/login/', templates: theme }).error, /page-login.*not in the built theme/)
  assert.match(t({ bodyClass: 'tracy tracy-page-page', path: '/x/', templates: theme }).error, /body class/)
})

test('contract init: the served template is read from the site, through redirects; a site that does not answer leaves the page pending', async () => {
  const { createServer } = await import('node:http')
  const body = { '/login-form/': 'wp-singular page-template-default page page-id-174', '/services/cloud/': 'page-template page-template-page-service page page-id-192' }
  const srv = createServer((req, res) => {
    const u = new URL(req.url, 'http://x')
    if (!u.pathname.endsWith('/')) {
      res.writeHead(301, { location: `${u.pathname}/` })
      return res.end()
    }
    const cls = body[u.pathname]
    res.writeHead(cls ? 200 : 500, { 'content-type': 'text/html' })
    res.end(cls ? `<!doctype html><html><body class="${cls}"><main></main></body></html>` : 'down')
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  try {
    const site = `http://127.0.0.1:${srv.address().port}`
    const pages = [{ id: 'a', path: '/login-form' }, { id: 'b', path: '/services/cloud' }, { id: 'c', path: '/gone' }]
    const got = await contractMod.servedTemplates({ site, pages, templates: new Set(['page', 'page-service', 'index']) })
    assert.equal(got.a.template, 'page')
    assert.equal(got.a.from, 'site')
    assert.match(got.a.evidence, /page-template-default/)
    assert.equal(got.b.template, 'page-service')
    assert.equal(got.c.template, undefined)
    assert.match(got.c.error, /500|body/)
  } finally {
    await new Promise((r) => srv.close(r))
  }
})

// Sol review (26/09): a template declared in review.config.json with no --built-theme was never looked
// for, and the contract validated. Declared or read, every template is checked in the built theme.
test('contract: a template declared in review.config.json is checked in the built theme — init without --built-theme is refused, a missing file is pending', async () => {
  const spec = mkdtempSync(path.join(testBase(), 'spec-'))
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify(vegaMap))
  writeFileSync(path.join(spec, 'sections.json'), JSON.stringify({ slotBlock: 'tracy-base/slot', acm: [], custom: [], other: [] }))
  writeFileSync(path.join(spec, 'content.json'), '{}')
  const configFile = path.join(spec, 'review.config.json')
  const declared = Object.fromEntries(Object.entries(vegaServed).map(([id, v]) => [id, v.template]))
  writeFileSync(configFile, JSON.stringify({ ...vegaConfig, templates: { ...declared, 'en-login-form': 'page-login' } }))
  await assert.rejects(contractMod.initContract({ specDir: spec, configFile }), /--built-theme/)
  const built = mkdtempSync(path.join(testBase(), 'built-'))
  mkdirSync(path.join(built, 'templates'))
  for (const t of vegaTemplates) writeFileSync(path.join(built, 'templates', `${t}.html`), t)
  const c = await contractMod.initContract({ specDir: spec, configFile, builtTheme: built })
  assert.ok(c.pending.some((x) => x.page === 'en-login-form' && /page-login.*not in the built theme/.test(x.why)), JSON.stringify(c.pending))
  assert.ok(validateContract(c, { themeDir: built }).length > 0)
  // every declared file there: valid, and recorded as checked
  writeFileSync(configFile, JSON.stringify({ ...vegaConfig, templates: declared }))
  const ok = await contractMod.initContract({ specDir: spec, configFile, builtTheme: built })
  assert.ok(ok.layouts.every((l) => l.templateChecked === true && l.templateFrom === 'config'), JSON.stringify(ok.layouts))
  assert.deepEqual(validateContract(ok), [])
  // a contract built from declared templates without the theme is not valid until the theme is seen
  const unseen = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: { ...vegaConfig, templates: { ...declared, 'en-login-form': 'page-login' } }, specHash: 'sha256:x', id: 'v' })
  assert.deepEqual(unseen.pending, [])
  const errors = validateContract(unseen)
  assert.ok(errors.some((e) => /page-login.*templates\/page-login\.html \(config\) was never checked against the built theme/.test(e)), JSON.stringify(errors))
  assert.ok(validateContract(unseen, { themeDir: built }).some((e) => /templates\/page-login\.html is not in the built theme/.test(e)))
})

test('contract: a page whose template or view is not its layout\'s is an error, and page-hash refuses to hash one of the two', async () => {
  const c = buildContract({ pageMap: vegaMap, reference: { pages: [] }, reviewConfig: vegaConfig, templates: vegaServed, themeTemplates: vegaTemplates, specHash: 'sha256:x', id: 'v' })
  assert.deepEqual(validateContract(c), [])
  const bent = JSON.parse(JSON.stringify(c))
  const cloud = bent.pages.find((p) => p.id === 'en-services-cloud')
  cloud.template = 'templates/page.html'
  let errors = validateContract(bent)
  assert.ok(errors.some((e) => /page en-services-cloud: template templates\/page\.html is not its layout page--page-service's templates\/page-service\.html/.test(e)), JSON.stringify(errors))
  const moved = JSON.parse(JSON.stringify(c))
  moved.pages.find((p) => p.id === 'en-typography').view = 'category'
  errors = validateContract(moved)
  assert.ok(errors.some((e) => /page en-typography: view category is not its layout page's view page/.test(e)), JSON.stringify(errors))
  const unsourced = JSON.parse(JSON.stringify(c))
  delete unsourced.pages.find((p) => p.id === 'en-typography').templateFrom
  assert.ok(validateContract(unsourced).some((e) => /page en-typography: .*not verified/.test(e)))
  const { themeFilesFor } = await import('../visual/page-hash.mjs')
  const built = mkdtempSync(path.join(testBase(), 'built-'))
  mkdirSync(path.join(built, 'templates'))
  for (const t of vegaTemplates) writeFileSync(path.join(built, 'templates', `${t}.html`), t)
  const layout = bent.layouts.find((l) => l.id === 'page--page-service')
  assert.throws(() => themeFilesFor({ themeDir: built, layout, template: cloud.template }), /page template templates\/page\.html is not its layout page--page-service's/)
})

// A page-map lists the SOURCE's module ids; the contract's sections are section TYPES, the keys of the patterns map.
test('contract: module ids are resolved through sections.json to type:style / sectionType; an id the dossier does not hold is pending, never looked up as a type', () => {
  const map = {
    locales: ['en'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: [
      { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en', sections: [{ position: 'top', modules: ['111', 'c-prose', 'hero:style-1', '222'] }] },
      { file: 'About.html', view: 'page', title: 'About', path: '/about', locale: 'en', sections: [{ modules: ['111'] }] }
    ]
  }
  const sections = {
    slotBlock: 'tracy-base/slot',
    acm: [{ id: '111', type: 'hero', style: 'style-1', title: 'Hero', position: 'top', scope: 'page', published: true, ordering: 1, showtitle: false, pages: [], spacing: { top: null, bottom: null }, moduleClass: '', itemGroup: {}, fields: {}, items: [] }],
    custom: [
      { id: 'c-prose', title: 'Prose', position: 'main', scope: 'page', ordering: 2, pages: [], showtitle: false, sectionType: 'prose', html: '', blocks: '', images: [] },
      { id: 'c-footer', title: 'Footer', position: 'footer', scope: 'all', ordering: 3, pages: ['ALL'], showtitle: false, sectionType: null, html: '', blocks: '', images: [] }
    ],
    other: [{ id: '222', title: 'Menu', position: 'nav', scope: 'all', ordering: 4, pages: [], module: 'mod_menu', params: {} }]
  }
  const types = { ...patternsMap.types, 'hero:style-1': patternsMap.types.hero, prose: { pattern: 'wp-x/section-prose', root: '.wtb-prose', fields: {} } }
  const c = buildContract({ pageMap: map, reference, reviewConfig, themeTemplates, patternsMap: { types }, patternFiles, specHash: 'sha256:x', sections })
  const by = Object.fromEntries(c.pages.map((p) => [p.id, p]))
  assert.deepEqual(by['en-home'].sections, ['hero:style-1', 'prose', 'hero:style-1'], 'ids resolve, a type key stays')
  assert.deepEqual(by['en-about'].sections, ['hero:style-1'])
  // the module with no type is named with its page; the unreferenced footer module (sectionType null) is not
  assert.deepEqual(c.pending.filter((x) => x.what === 'section').map((x) => [x.page, x.module]), [['en-home', '222']])
  assert.ok(!(c.unresolvedPatterns ?? []).some((u) => /^(111|222|c-prose)/.test(u)), JSON.stringify(c.unresolvedPatterns))
  assert.ok(validateContract(c).some((e) => /222/.test(e)), 'a pending module blocks validation')
  // an id the dossier does not hold is named even without a patterns map
  const missing = buildContract({ pageMap: map, reference, reviewConfig, themeTemplates, specHash: 'sha256:x', sections: { ...sections, acm: [] } })
  assert.deepEqual(missing.pending.filter((x) => x.what === 'section').map((x) => [x.page, x.module]).sort(), [['en-about', '111'], ['en-home', '111'], ['en-home', '222']])
  assert.ok(missing.pages.every((p) => !p.sections.includes('111')))
  // without a dossier a page-map of type keys keeps working as before
  const legacy = buildContract({ pageMap: { ...map, pages: [{ ...map.pages[0], sections: [{ modules: ['hero'] }] }] }, reference, reviewConfig, themeTemplates, patternsMap, patternFiles, specHash: 'sha256:x' })
  assert.deepEqual(legacy.pages[0].sections, ['hero'])
})

test('contract: a search view served at the page-map path is measured there with its term; a recorded redirect still lands on the query destination; home and search of one group do not collide', () => {
  const map = {
    locales: ['en'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: [
      { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en', sections: [] },
      { file: 'Search.html', view: 'search', title: 'Search', path: '/pages/j-pages/smart-search', locale: 'en', sections: [] }
    ]
  }
  const config = { ...reviewConfig, search: { default: 'steel' }, templates: { '/': 'front-page', '/pages/j-pages/smart-search?s=steel': 'search', '/?s=steel': 'search' } }
  const themeSet = new Set(['front-page', 'search'])
  const make = (routes, group = null, over = {}) => buildContract({ pageMap: map, reference, reviewConfig: config, themeTemplates: themeSet, seedReport: { routes }, specHash: 'sha256:x', group, ...over })
  const served = make([{ path: '/', status: 200 }, { path: '/pages/j-pages/smart-search', status: 200 }])
  assert.equal(served.pages.find((p) => p.view === 'search').path, '/pages/j-pages/smart-search?s=steel')
  const withPair = make([], null, { pairs: [{ from: '/Search.html', to: '/pages/j-pages/smart-search' }] })
  assert.equal(withPair.pages.find((p) => p.view === 'search').path, '/pages/j-pages/smart-search?s=steel')
  const redirected = make([{ path: '/', status: 200 }, { path: '/pages/j-pages/smart-search', status: 301, location: 'http://x/' }])
  assert.equal(redirected.pages.find((p) => p.view === 'search').path, '/?s=steel')
  // a group of home + search: the search page is chosen by its page-map path or its measured path, and the index holds both
  for (const r of [[{ path: '/', status: 200 }, { path: '/pages/j-pages/smart-search', status: 200 }], [{ path: '/', status: 200 }, { path: '/pages/j-pages/smart-search', status: 301, location: 'http://x/' }]]) {
    for (const asked of ['/pages/j-pages/smart-search', r[1].status === 200 ? '/pages/j-pages/smart-search?s=steel' : '/?s=steel']) {
      const g = make(r, { id: 'g1', pages: ['/', asked], dossier: '/d' })
      assert.deepEqual(g.pages.map((p) => p.id).sort(), ['en-home', 'en-pages-j-pages-smart-search'], asked)
    }
    // asking for the home page alone does not select the search view
    assert.deepEqual(make(r, { id: 'g1', pages: ['/'], dossier: '/d' }).pages.map((p) => p.id), ['en-home'])
  }
})

test('contract: a patterns-map key does not make an id the dossier lacks a section type; a pair that already carries ?s= gets exactly one s, the term is escaped, and no term fails validation', () => {
  const map = {
    locales: ['en'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: [
      { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en', sections: [{ modules: ['999'] }] },
      { file: 'Search.html', view: 'search', title: 'Search', path: '/search', locale: 'en', sections: [] }
    ]
  }
  const dossier = { slotBlock: 'tracy-base/slot', acm: [], custom: [], other: [] }
  const aliased = buildContract({ pageMap: map, reference, reviewConfig, themeTemplates, patternsMap: { types: { 999: patternsMap.types.hero } }, patternFiles, specHash: 'sha256:x', sections: dossier })
  assert.deepEqual(aliased.pages[0].sections, [])
  assert.deepEqual(aliased.pending.filter((x) => x.what === 'section').map((x) => [x.page, x.module]), [['en-home', '999']])
  const pairs = [{ from: '/Search.html', to: '/search?s=steel' }]
  const at = (term) => buildContract({ pageMap: map, reference, reviewConfig: { ...reviewConfig, templates: {}, search: term === undefined ? {} : { default: term } }, themeTemplates, specHash: 'sha256:x', pairs }).pages.find((p) => p.view === 'search')
  assert.equal(at('steel').path, '/search?s=steel')
  assert.equal(at('a&b#c').path, '/search?s=a%26b%23c')
  assert.equal(at(undefined).path, '/search')
  const noTerm = buildContract({ pageMap: map, reference, reviewConfig: { ...reviewConfig, templates: {} }, themeTemplates, specHash: 'sha256:x', pairs })
  assert.ok(validateContract(noTerm).some((e) => /search view is a QUERY/.test(e)))
})

test('contract: a pair that targets /?s=… belongs to the search view, never to the home page', () => {
  const map = {
    locales: ['en'],
    defaultLocale: 'en',
    source: { kind: 'html' },
    pages: [
      { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en', sections: [] },
      { file: 'Search.html', view: 'search', title: 'Search', path: '/search', locale: 'en', sections: [] }
    ]
  }
  const config = { ...reviewConfig, templates: {}, search: { default: 'steel' } }
  for (const pairs of [
    [{ from: '/search', to: '/?s=steel' }],
    [{ from: '/search', to: '/?s=steel' }, { from: '/', to: '/' }],
    [{ from: '/', to: '/' }, { from: '/search', to: '/?s=steel' }]
  ]) {
    const c = buildContract({ pageMap: map, reference, reviewConfig: config, themeTemplates, specHash: 'sha256:x', pairs, group: { id: 'g1', pages: ['/', '/search'], dossier: '/d' } })
    const by = Object.fromEntries(c.pages.map((p) => [p.view, p]))
    assert.equal(by['front-page'].path, '/')
    assert.equal(by.search.path, '/?s=steel')
    assert.equal(by['front-page'].source[0], 'Home.html')
    assert.equal(by.search.source[0], 'Search.html')
  }
  // an html source: the pairs read the exported FILE (`/Search.html`), and the seed report records the native-search redirect
  const html = [{ from: '/Home.html', to: '/' }, { from: '/Search.html', to: '/?s=steel' }]
  for (const pairs of [html, [...html].reverse()]) {
    const c = buildContract({ pageMap: map, reference, reviewConfig: config, themeTemplates, specHash: 'sha256:x', pairs, seedReport: { routes: [{ path: '/', status: 200 }, { path: '/search', status: 301, location: 'http://x/' }] }, group: { id: 'g1', pages: ['/', '/search'], dossier: '/d' } })
    const by = Object.fromEntries(c.pages.map((p) => [p.view, p]))
    assert.deepEqual([by['front-page'].path, by.search.path, c.pages.length], ['/', '/?s=steel', 2])
  }
  // a pair for /search?s=… (the search page's own path) still matches that page
  const own = buildContract({ pageMap: map, reference, reviewConfig: config, themeTemplates, specHash: 'sha256:x', pairs: [{ from: '/Search.html', to: '/search?s=steel' }] })
  assert.equal(own.pages.find((p) => p.view === 'search').path, '/search?s=steel')
})

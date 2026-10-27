import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import {
  loadInventory,
  articles,
  categories,
  menuTree,
  siteMenuTypes,
  acmInstances,
  moduleAssignments,
  routeViews,
  parseAcmSchema,
  parseMenuLink,
  slugify,
  fileForPath,
  assignedTo,
  mastheadFor
} from '../lib/joomla-inventory.mjs'
import { checkBlockMarkup, SLOT_BLOCK } from '../lib/html-to-blocks.mjs'
import {
  extractCssTokens,
  detectSectionType,
  PAGE_CATEGORIES,
  D2_CATEGORY_ALIASES,
  D2_ROUTE_RENAMES,
  resolveContentParams
} from '../ingest/from-joomla.mjs'
import { browserArgs, buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { validateSpecPack } from '../ingest/spec-pack.mjs'
import { computedAcmItemField } from '../ingest/joomla-php-scan.mjs'
import { recordText, resolveRecordPath } from '../lib/record-paths.mjs'
import { machine, withHome } from './lib/test-root.mjs'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const SKILL = join(here, '..', '..')
const FIXTURE = join(here, 'fixtures', 'joomla-min')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

// Scratch goes under THEME_PORT_TEST_ROOT (or TRACY_TEST_SCRATCH) when it is set (TMPDIR is left as it is), else the OS temp dir.
const SCRATCH = process.env.THEME_PORT_TEST_ROOT || process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
function tmp(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})

const inv = loadInventory(join(FIXTURE, 'inventory.json'))
const routes = readJson(join(FIXTURE, 'render-routes.json'))

// ── inventory helpers ─────────────────────────────────────────────────────────

test('joomla-inventory: counts and article normalisation', () => {
  const arts = articles(inv)
  assert.equal(arts.length, 2)
  const post = arts.find((a) => a.id === '3')
  assert.equal(post.status, 'publish')
  assert.equal(post.featured, true)
  assert.equal(
    post.images.intro,
    'images/demo/blog/blog-1.jpg',
    'escaped slashes in the images column are unescaped'
  )
  assert.equal(post.images.introAlt, 'A board')
})

test('joomla-inventory: category slugs keep the Joomla alias unless the alias is in the D2 retitle list', () => {
  const kept = categories(inv)
  assert.deepEqual(
    kept.map((c) => c.id),
    ['14', '15'],
    'ROOT and non-content extensions are excluded'
  )
  assert.deepEqual(
    kept.map((c) => c.wpSlug),
    ['pages', 'grid-layout'],
    'no retitle list: aliases stay'
  )
  const cats = categories(inv, { retitle: D2_CATEGORY_ALIASES })
  const services = cats.find((c) => c.id === '15')
  assert.equal(services.wpSlug, 'website-services', 'grid-layout is in the D2 table')
  assert.equal(services.joomlaAlias, 'grid-layout')
  assert.equal(cats.find((c) => c.id === '14').wpSlug, 'pages', 'pages is not in the D2 table')
  assert.equal(services.parentId, null, 'a child of ROOT has no WordPress parent')
})

test('joomla-inventory: slugify strips diacritics and never returns an empty slug', () => {
  assert.equal(slugify('About Zoë & Naïve'), 'about-zoe-and-naive')
  assert.equal(
    slugify('Stra\u00dfe \u0110\u1ecdc'),
    'stra-e-doc',
    'the d-with-stroke letter maps to d; a letter NFD cannot split becomes a separator'
  )
  assert.equal(slugify('Spacing & grid'), 'spacing-and-grid')
  assert.equal(slugify('  ---  '), 'untitled')
  assert.equal(fileForPath('/company/about'), 'company-about.html')
  assert.equal(fileForPath('/'), 'index.html')
})

test('joomla-inventory: menuTree nests by parent_id in lft order; admin menus are not site menus', () => {
  assert.deepEqual(siteMenuTypes(inv), ['tracy', 'utility'])
  const tree = menuTree(inv, 'tracy')
  assert.deepEqual(
    tree.map((i) => i.title),
    ['Home', 'Resources']
  )
  assert.equal(tree[0].home, true)
  assert.deepEqual(
    tree[1].children.map((i) => i.title),
    ['Blog']
  )
  assert.deepEqual(tree[1].children[0].target, {
    raw: 'index.php?option=com_content&view=category&layout=blog&id=15',
    option: 'com_content',
    view: 'category',
    layout: 'blog',
    id: '15',
    itemid: null
  })
  assert.equal(parseMenuLink('index.php?option=com_tags&view=tag&id[0]=2').id, '2')
})

test('joomla-inventory: moduleAssignments reads ALL and per-page rows', () => {
  const a = moduleAssignments(inv)
  assert.deepEqual(a.get('101'), { all: false, pages: ['247'], except: [] })
  assert.deepEqual(a.get('102'), { all: true, pages: [], except: [] })
})

test('joomla-inventory: ACM params — flat repeatable via schema, nested group flattened, media cleaned, empty items dropped', () => {
  const acmDir = join(FIXTURE, 'capture', 'templates', 'tracy', 'acm')
  const list = acmInstances(inv, { acmDir })
  assert.deepEqual(
    list.map((x) => x.id),
    ['101', '102']
  )
  const hero = list[0]
  assert.equal(hero.type, 'hero')
  assert.equal(hero.style, 'style-1')
  assert.equal(hero.position, 'masthead')
  assert.deepEqual(hero.pages, ['247'])
  assert.deepEqual(hero.fields, {
    title: 'A better website',
    'btn-1-link': 'index.php?Itemid=248',
    'hero-image': 'images/demo/hero.png'
  })
  assert.deepEqual(hero.items, [{ note: 'Note one' }, { note: 'Note two' }])
  const carousel = list[1]
  assert.deepEqual(carousel.pages, ['ALL'])
  assert.deepEqual(carousel.fields, { heading: 'The essentials', ground: 'gray', title: '[Fixture] Product - Carousel' })
  assert.equal(carousel.itemGroup, 'slide')
  assert.deepEqual(
    carousel.items,
    [
      {
        'slide-title': 'One',
        'slide-text': 'First',
        'slide-link': 'index.php?option=com_content&view=article&id=3'
      },
      { 'slide-title': 'Two', 'slide-text': 'Second', 'slide-link': '' }
    ],
    'parallel arrays zip into items; the all-empty third slide is dropped'
  )
})

test('joomla-inventory: ACM heuristic without a schema still zips repeatables', () => {
  const [hero, carousel] = acmInstances(inv)
  assert.deepEqual(
    hero.items,
    [{ note: 'Note one' }, { note: 'Note two' }],
    'an array longer than one is repeatable'
  )
  assert.equal(carousel.items.length, 2, 'nested keys are always repeatable')
})

test('joomla-inventory: parseAcmSchema separates flat and nested repeatables', () => {
  const schema = parseAcmSchema(
    readFileSync(join(FIXTURE, 'capture/templates/tracy/acm/carousel/tmpl/style-1.xml'), 'utf8')
  )
  assert.deepEqual([...schema.flat], [])
  assert.deepEqual([...schema.nested.slide], ['slide-title', 'slide-text', 'slide-link'])
  const hero = parseAcmSchema(
    readFileSync(join(FIXTURE, 'capture/templates/tracy/acm/hero/tmpl/style-1.xml'), 'utf8')
  )
  assert.deepEqual([...hero.flat], ['note'])
})

test('joomla-inventory: routeViews classifies views, keeps Joomla paths verbatim, turns wrapper into a gap', () => {
  const views = routeViews(inv, routes, { retitle: D2_CATEGORY_ALIASES, routeRenames: D2_ROUTE_RENAMES })
  const byPath = Object.fromEntries(views.map((v) => [v.joomlaPath, v]))
  assert.equal(byPath['/'].wpView, 'front-page', 'the home item is the front page whatever its Joomla view')
  assert.equal(byPath['/'].wpPath, '/')
  assert.equal(byPath['/resources/blog'].wpView, 'category')
  assert.equal(
    byPath['/resources/blog'].wpPath,
    '/resources/blog',
    'the route path is the URL contract; only the category term slug is retitled'
  )
  assert.equal(byPath['/resources/blog'].categorySlug, 'website-services')
  assert.equal(byPath['/company/about'].wpView, 'page')
  assert.equal(
    byPath['/company/about'].wpSlug,
    'about',
    'post_name is the last path segment, not the article title'
  )
  assert.equal(byPath['/company/about'].wpPath, '/company/about')
  assert.equal(byPath['/search'].wpView, 'search')
  assert.equal(byPath['/pages/wrapper'].kind, 'gap')
  assert.equal(byPath['/pages/wrapper'].redirectTo, '/')
  const renamed = routeViews(inv, [{ id: '254', path: '/resources/mag-procurement' }], {
    routeRenames: { '/resources/mag-procurement': '/resources/website-planning' }
  })
  assert.equal(renamed[0].wpPath, '/resources/website-planning', 'only the three D2 mag routes move')
  assert.equal(renamed[0].wpSlug, 'website-planning')
})

test('from-joomla: detectSectionType reads data-od-block, then a tracy-* root class, then the title', () => {
  assert.equal(
    detectSectionType('<section data-od-block="hero" class="wrap">x</section>', 'anything'),
    'hero'
  )
  assert.equal(detectSectionType('<section data-od-block="value">x</section>', ''), 'pillars')
  assert.equal(detectSectionType('<section data-od-block="how">x</section>', ''), 'how-it-works')
  assert.equal(detectSectionType('<section data-od-block="inline-cta">x</section>', ''), 'cta-inline')
  assert.equal(detectSectionType('<section data-od-block="statistics">x</section>', ''), 'proof')
  assert.equal(detectSectionType('<section data-od-block="final-cta">x</section>', ''), 'cta-final')
  assert.equal(detectSectionType('<section class="section tracy-steps">x</section>', ''), 'how-it-works')
  assert.equal(detectSectionType('<div class="tracy-plans">x</div>', ''), 'pricing')
  assert.equal(detectSectionType('<div class="tracy-zig">x</div>', ''), 'features')
  assert.equal(
    detectSectionType('<section>x</section>', 'OpenDesign · Landing · social proof'),
    'social-proof'
  )
  assert.equal(detectSectionType('<section>x</section>', 'Onepage · about'), null, 'no signal, no guess')
  assert.equal(detectSectionType('', ''), null)
})

test('from-joomla: extractCssTokens keeps resolved values from :root and the dark remap only', () => {
  const css = readFileSync(join(FIXTURE, 'capture/templates/tracy/css/styles/base.css'), 'utf8')
  const t = extractCssTokens(css)
  assert.equal(t.light['--bg'], '#ffffff')
  assert.equal(t.dark['--bg'], '#000000', 'the trailing comment is stripped')
  assert.equal(t.light['--focus-ring'], undefined, 'color-mix(var()) is not a resolved value')
  assert.equal(t.light['--tracy-ring'], undefined)
  assert.equal(t.light['--font-body'], '"SF Pro Text", Inter, sans-serif')
})

// ── the adapter end to end ────────────────────────────────────────────────────

test('from-joomla: the fixture becomes a spec-pack that validates', () => {
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  assert.deepEqual(result.counts, {
    routes: 6,
    pages: 7,
    wpPages: 4,
    posts: 1,
    categories: 2,
    menus: 2,
    sections: 2,
    customModules: 3,
    gaps: 1,
    redirects: 1,
    syntheticParents: 1,
    sectionsDetected: 1
  })
  assert.ok(validateSpecPack(out, { pageFloor: 4 }).ok, 'the written pack validates independently')

  const map = readJson(join(out, 'page-map.json'))
  assert.equal(map.template.name, 'tracy-base')
  assert.deepEqual(map.templateParts, ['header', 'footer'])
  assert.deepEqual(map.theme.palette.light, {
    primary: '#0071e3',
    secondary: '#f5f5f7',
    body_bg: '#ffffff',
    text: '#1d1d1f'
  })
  assert.deepEqual(map.theme.palette.dark, {
    primary: '#2997ff',
    secondary: '#1d1d1f',
    body_bg: '#000000',
    text: '#f8f8f8'
  })
  assert.deepEqual(map.theme.fonts, { body: 'SF Pro Text', heading: 'SF Pro Display' })
  assert.deepEqual(
    map.pages.map((p) => [p.file, p.view]),
    [
      ['index.html', 'front-page'],
      ['resources-blog.html', 'category'],
      ['company-about.html', 'page'],
      ['contact.html', 'page-contact'],
      ['search.html', 'search'],
      ['single.html', 'single'],
      ['404.html', '404']
    ]
  )
  assert.deepEqual(
    map.gaps.map((g) => [g.joomlaPath, g.redirectTo]),
    [['/pages/wrapper', '/']],
    'gaps are not pages'
  )
  assert.deepEqual(map.pages.find((p) => p.file === 'index.html').sections, [
    { position: 'masthead', via: 'layout', modules: ['101'] },
    { position: 'section-1', via: 'layout', modules: ['105', '106'] }
  ])

  const ref = readJson(join(out, 'reference.json'))
  assert.equal(ref.kind, 'url')
  assert.deepEqual(ref.viewports, [1440, 390])
  assert.equal(
    ref.pages.find((r) => r.page === 'company-about.html').url,
    'http://127.0.0.1:8217/company/about',
    'reference URLs are the Joomla paths'
  )
  assert.equal(
    map.pages.find((p) => p.file === 'resources-blog.html').path,
    '/resources/blog',
    'the route path survives even though the category term is retitled'
  )

  const content = readJson(join(out, 'content.json'))
  const homeRoute = content.pages.find((page) => page.path === '/')
  assert.equal(Object.hasOwn(homeRoute, 'featured'), false, 'without the featured-order menu setting, the route keeps its earlier shape')
  const contact = content.pages.find((page) => page.path === '/contact')
  assert.deepEqual(contact.pageHeading, {
    hidden: true,
    from: 'menu item params show_page_heading 0'
  })
  assert.equal(contact.contact.name, 'Fixture Contact Person')
  assert.equal(contact.contact.position, 'Studio Director')
  assert.equal(contact.contact.telephone, '+1 555 0100')
  assert.equal(contact.contact.email, 'contact@example.test')
  assert.equal(contact.contact.misc, '<p>Visits by appointment.</p>')
  assert.equal(Object.hasOwn(content.pages.find((page) => page.path === '/company/about'), 'contact'), false)
  assert.equal(content.pages.find((page) => page.path === '/company/about').pageHeading.text, 'Fixture Article Heading')
  assert.equal(Object.hasOwn(content.archives.find((archive) => archive.path === '/search'), 'pageHeading'), false, 'show_page_heading 1 without page_heading declares no extra heading')
  assert.equal(content.archives.find((archive) => archive.path === '/resources/blog').pageHeading.text, 'Fixture Resources Heading')
  const sections = readJson(join(out, 'sections.json'))
  assert.equal(content.site.name, 'Fixture')
  const about = content.pages.find((p) => p.file === 'company-about.html')
  assert.equal(about.slug, 'about', 'post_name is the last segment of the kept Joomla path')
  assert.equal(about.path, '/company/about')
  assert.equal(about.parent, '/company')
  assert.equal(about.synthetic, false)
  assert.equal(about.contentKind, 'blocks')
  assert.match(about.content, /<p>Who we <strong>are<\/strong>\.<\/p>/)
  assert.match(
    about.content,
    new RegExp(`<!-- wp:${SLOT_BLOCK} \\{"position":"product-page"\\} /-->`),
    'the loadposition marker survives into the page'
  )
  assert.deepEqual(about.sections, [{ position: 'product-page', via: 'loadposition', modules: ['102'] }])
  const home = content.pages.find((p) => p.file === 'index.html')
  assert.equal(home.contentKind, 'sections', 'a mod_custom-driven page is handed over section by section')
  assert.equal(
    home.contentMarkup,
    `<!-- wp:${SLOT_BLOCK} {"position":"masthead"} /-->\n<!-- wp:${SLOT_BLOCK} {"position":"section-1"} /-->`,
    'the slot-marker form is kept alongside'
  )
  assert.deepEqual(
    home.content.map((e) => e.kind),
    ['slot', 'section', 'html']
  )
  assert.deepEqual(home.content[0], { kind: 'slot', position: 'masthead', modules: ['101'] })
  assert.deepEqual(home.content[1], {
    kind: 'section',
    sectionType: 'proof',
    moduleId: '105',
    title: 'OpenDesign · Landing · statistics',
    position: 'section-1',
    html: '<section class="section" data-od-block="statistics" style="padding:1px"><p>3 clients</p></section>'
  })
  assert.equal(home.content[2].moduleId, '106')
  assert.match(home.content[2].blocks, /^<!-- wp:html -->/, 'an undetected module stays opaque HTML')
  assert.ok(
    result.notes.some((n) => /mod_custom #106/.test(n)),
    'and is named in the notes'
  )
  assert.equal(sections.custom.find((m) => m.id === '105').sectionType, 'proof')
  const company = content.pages.find((p) => p.path === '/company')
  assert.ok(company, 'a parent page is synthesised so /company/about keeps its path')
  assert.equal(company.synthetic, true)
  assert.equal(company.slug, 'company')
  assert.equal(company.title, 'Company', 'no menu item owns /company, so the segment is title-cased')
  assert.equal(company.parent, null)
  assert.equal(company.content, '')
  assert.match(company.syntheticReason, /\/company\/about/)
  assert.equal(content.pages.filter((p) => p.synthetic).length, 1)
  assert.equal(content.posts.length, 1)
  const post = content.posts[0]
  assert.equal(post.slug, 'website-strategy', 'post slug from the title, not the stale alias')
  assert.equal(post.category, 'website-services')
  assert.equal(post.path, '/resources/blog/website-strategy', 'post paths hang off the kept category route')
  assert.equal(post.featuredImage, 'images/demo/blog/blog-1.jpg')
  assert.match(
    post.content,
    /<!-- wp:more -->\n<!--more-->\n<!-- \/wp:more -->/,
    'intro and full text are separated by the more block'
  )
  assert.deepEqual(
    post.images.map((i) => i.file),
    ['blog-1.jpg']
  )
  for (const item of [...content.pages, ...content.posts])
    if (typeof item.content === 'string')
      assert.ok(checkBlockMarkup(item.content).ok, `${item.file ?? item.slug} has balanced block markup`)
  assert.deepEqual(content.unresolvedLinks, [])

  assert.equal(sections.slotBlock, SLOT_BLOCK)
  assert.equal(sections.acm.length, 2)
  assert.ok(sections.acm.every((row) => !Object.hasOwn(row, 'computedFields') && !Object.hasOwn(row, 'unresolvedComputedFields')), 'layouts without ACM loop values gain no computed keys')
  assert.deepEqual(sections.acm[0].pages, [{ file: 'index.html', wpPath: '/', menuId: '247', via: 'layout' }])
  assert.equal(
    sections.acm[0].fields['btn-1-link'],
    '/company/about',
    'Itemid links resolve to WordPress paths'
  )
  assert.equal(
    sections.acm[1].items[0]['slide-link'],
    '/resources/blog/website-strategy',
    'article links resolve to the post path'
  )
  assert.equal(sections.custom[0].sectionType, null, 'footer chrome is never a page section')
  assert.deepEqual(sections.acm[1].pages, [
    { file: 'company-about.html', wpPath: '/company/about', menuId: '248', via: 'loadposition' }
  ])
  assert.equal(sections.custom[0].scope, 'footer')
  assert.match(sections.custom[0].blocks, /href="\/company\/about"/)

  const menus = readJson(join(out, 'menus.json'))
  assert.deepEqual(
    menus.menus.map((m) => m.menutype),
    ['tracy', 'utility'],
    'the administrator menu is not exported'
  )
  const tracy = menus.menus[0]
  assert.deepEqual(
    tracy.items.map((i) => i.label),
    ['Home', 'Resources']
  )
  assert.deepEqual(
    tracy.items[1].children.map((i) => [i.label, i.url, i.page]),
    [['Blog', '/resources/blog', 'resources-blog.html']]
  )
  assert.equal(
    menus.menus[1].items.find((i) => i.label === 'Wrapper').url,
    '/',
    'a gap item points at its redirect target'
  )

  const redirects = readJson(join(out, 'redirects.json'))
  assert.deepEqual(
    redirects.rules.map((r) => [r.from, r.to]),
    [['/pages/wrapper', '/']],
    'gaps only — no route in the fixture is a D2 rename'
  )
  assert.deepEqual(
    redirects.categorySlugs,
    [{ id: '15', title: 'Website services', joomlaAlias: 'grid-layout', wpSlug: 'website-services' }],
    'only the D2 aliases move'
  )

  const design = readJson(join(out, 'design-contract.json'))
  assert.deepEqual(design.theme, {
    selector: 'html',
    attribute: 'data-theme',
    lightValue: 'light',
    darkValue: 'dark'
  })
  assert.deepEqual(
    design.variants.map((v) => v.id),
    ['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark']
  )
  assert.equal(design.source.reference, 'http://127.0.0.1:8217')
  assert.equal(design.tokens['desktop-dark']['--bg'], '#000000')
  assert.equal(design.rules.find((r) => r.id === 'band-rhythm').styles['mobile-light'].paddingTop, '40px')

  const contract = readJson(join(out, 'content-contract.json'))
  assert.equal(contract.mode, 'demo')
  assert.equal(contract.facts['site.name'].value, 'Fixture')
  assert.equal(contract.facts['site.tagline'].value, 'A tiny Joomla site')
  assert.ok(contract.facts['demo.disclosure'])

  const spec = readFileSync(join(out, 'design-spec.md'), 'utf8')
  assert.equal((spec.match(/`TODO`/g) ?? []).length, 0)
  assert.match(spec, /`html\[data-theme="dark"\]`/)
  const prov = readJson(join(out, 'provenance.json'))
  assert.equal(prov.adapter, 'from-joomla')
  assert.equal(prov.generatedAt, '2026-01-01T00:00:00.000Z')
  assert.ok(existsSync(join(out, 'design-spec.md')))
})

test('from-joomla: ACM loop counters become computed item fields only when printed', () => {
  const fixture = readFileSync(join(here, 'fixtures', 'acm-computed-number.php'), 'utf8')
  const makePack = (flag, expression = null) => {
    const j6 = tmp('acm-counter-')
    cpSync(FIXTURE, j6, { recursive: true })
    const php = expression ? fixture.replace('$number = sprintf("%02d", $i + 1);', `$number = ${expression};`) : fixture
    const layout = join(j6, 'capture/templates/tracy/acm/carousel/tmpl/style-1.php')
    writeFileSync(layout, php)
    const inventoryPath = join(j6, 'inventory.json')
    const inventory = readJson(inventoryPath)
    const module = inventory.modules.find((row) => row.id === '102')
    const params = JSON.parse(module.params)
    const config = JSON.parse(params['jatools-config'])
    config.carousel['carousel[feature-count-item]'] = [flag]
    params['jatools-config'] = JSON.stringify(config)
    module.params = JSON.stringify(params)
    writeFileSync(inventoryPath, JSON.stringify(inventory))
    const out = join(j6, 'pack')
    buildSpecPack({ j6Dir: j6, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
    return readJson(join(out, 'sections.json')).acm.find((row) => row.id === '102')
  }

  const printed = makePack('0')
  assert.deepEqual(printed.items.map((item) => item.number), ['01', '02'])
  assert.deepEqual(printed.computedFields, ['number'])
  const hidden = makePack('1')
  assert.deepEqual(hidden.items.map((item) => item.number), ['', ''])
  assert.deepEqual(hidden.computedFields, ['number'])
  const unresolved = makePack('0', 'intval($i) + 1')
  assert.deepEqual(unresolved.unresolvedComputedFields, [{ field: 'number', reason: 'unsupported computed expression: intval($i) + 1' }])
  assert.equal(Object.hasOwn(unresolved.items[0], 'number'), false, 'unsupported expressions are never guessed')
})

const counterFixture = readFileSync(join(here, 'fixtures', 'acm-computed-number.php'), 'utf8')
const counterItems = [{ 'slide-title': 'One' }, { 'slide-title': 'Two' }]
const counterScan = (source, values = {}, rows = counterItems) => computedAcmItemField(source, rows, { 'feature-count-item': '0', ...values })
const elseCounterLayout = `<?php $countItem = $helper->count('slide-title'); for ($i = 0; $i < $countItem; $i++) : $number = sprintf("%02d", $i + 1); if ($helper->get('flag') == 0) : ?>skip<?php else: ?><h1><?php echo $number ?></h1><?php endif; endfor; ?>`

test('joomla-php-scan: supported counter expressions preserve the loop ordinal', () => {
  assert.deepEqual(counterScan(counterFixture).values, ['01', '02'])
  assert.deepEqual(counterScan(counterFixture.replace('sprintf("%02d", $i + 1)', '$i + 1')).values, ['1', '2'])
  assert.deepEqual(counterScan(counterFixture.replace('sprintf("%02d", $i + 1)', "str_pad($i + 1, 3, '0', STR_PAD_LEFT)")).values, ['001', '002'])
  assert.match(counterScan(counterFixture.replace('sprintf("%02d", $i + 1)', 'intval($i) + 1')).unresolved, /unsupported computed expression/)
})

test('joomla-php-scan: numbering is unresolved when the source loop bound does not prove item count', () => {
  const oneItemLoop = counterFixture.replace("$countItem = $helper->count('slide-title');", '$countItem = 1;')
  assert.match(counterScan(oneItemLoop).unresolved, /bound .* cannot be proven/)
})

test('joomla-php-scan: a bound variable reassignment invalidates the item count proof', () => {
  const reassigned = counterFixture.replace("$countItem = $helper->count('slide-title');", "$countItem = $helper->count('slide-title');\n$countItem = 1;")
  assert.match(counterScan(reassigned).unresolved, /assigned more than once/)
})

test('joomla-php-scan: an echo in else follows the else branch and nested guards stay unresolved', () => {
  assert.deepEqual(counterScan(elseCounterLayout, { flag: 0 }).values, ['', ''])
  const nested = elseCounterLayout.replace("if ($helper->get('flag') == 0) : ?>skip<?php else:", "if ($helper->get('flag') == 0) : ?><?php if ($helper->get('second')) : ?>skip<?php else:")
    .replace('<?php endif; endfor;', '<?php endif; endif; endfor;')
  assert.match(counterScan(nested, { flag: 0, second: 1 }).unresolved, /nested or multiple guards/)
})

test('joomla-php-scan: a same-field guard elsewhere is ignored in favor of the echo enclosing branch', () => {
  const source = `<?php if ($helper->get('flag') == 1) : ?>unrelated<?php endif; $countItem = $helper->count('slide-title'); for ($i = 0; $i < $countItem; $i++) : $number = sprintf("%02d", $i + 1); if ($helper->get('flag') == 0) : ?><h1><?php echo $number ?></h1><?php endif; endfor; ?>`
  assert.deepEqual(counterScan(source, { flag: 0 }).values, ['01', '02'])
})

test('joomla-php-scan: a computed counter assignment outside the loop is unresolved', () => {
  const outside = counterFixture
    .replace("$countItem = $helper->count('slide-title');", "$countItem = $helper->count('slide-title');\n$number = sprintf(\"%02d\", $i + 1);")
    .replace('  $number = sprintf("%02d", $i + 1);\n', '')
  assert.match(counterScan(outside).unresolved, /assigned outside the item loop/)
})

test('joomla-php-scan: the accepted Impact style-5 shape numbers items and honors its inverted flag', () => {
  assert.deepEqual(counterScan(counterFixture, { 'feature-count-item': '0' }).values, ['01', '02'])
  assert.deepEqual(counterScan(counterFixture, { 'feature-count-item': '1' }).values, ['', ''])
})

test('joomla-php-scan: loose numeric comparison follows PHP 8 nonnumeric string behavior', () => {
  const layout = counterFixture.replace("$helper->get('feature-count-item') != 1", "$helper->get('flag') == 0")
  assert.deepEqual(counterScan(layout, { flag: 'abc' }).values, ['', ''])
  const boolLayout = counterFixture.replace("$helper->get('feature-count-item') != 1", "$helper->get('flag') == false")
  assert.deepEqual(counterScan(boolLayout, { flag: '0' }).values, ['01', '02'], 'PHP treats the string 0 as false')
})

test('joomla-php-scan: PHP-looking loop text in HTML is not scanned as executable code', () => {
  const htmlText = '<div>for ($i = 0; $i < $countItem; $i++) : $number = sprintf("%02d", $i + 1); if ($helper->get(\'flag\') != 1) : echo $number; endif; endfor;</div>'
  assert.equal(counterScan(htmlText), null)
})

test('joomla-php-scan: an unsupported ternary print guard is reported unresolved', () => {
  const ternary = `<?php $countItem = $helper->count('slide-title'); for ($i = 0; $i < $countItem; $i++) : $number = sprintf("%02d", $i + 1); echo $helper->get('flag') ? $number : ''; endfor; ?>`
  assert.match(counterScan(ternary, { flag: 1 }).unresolved, /guard|branch|ternary/)
})

test('joomla-php-scan: an unused index calculation does not hide a later printed counter', () => {
  const unused = counterFixture.replace('$number = sprintf', '$unused = $i + 1;\n  $number = sprintf')
  assert.deepEqual(counterScan(unused).values, ['01', '02'])
})

test('from-joomla: a contact route without a dumped record gets no contact key; show_page_heading 1 without custom text gets no heading key', () => {
  const dir = tmp('fj-contact-no-record-')
  cpSync(FIXTURE, dir, { recursive: true })
  const inventoryPath = join(dir, 'inventory.json')
  const inventory = readJson(inventoryPath)
  inventory.contact_details = []
  writeFileSync(inventoryPath, JSON.stringify(inventory))
  const out = join(tmp('fj-contact-no-record-pack-'), 'pack')
  buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  const content = readJson(join(out, 'content.json'))
  const contact = content.pages.find((page) => page.path === '/contact')
  assert.equal(Object.hasOwn(contact, 'contact'), false)
  assert.equal(Object.hasOwn(content.archives.find((archive) => archive.path === '/search'), 'pageHeading'), false)
})

test('from-joomla: T4 row attributes are carried as a frame; rows without attributes keep their old shape', () => {
  const dir = tmp('fj-row-frame-')
  cpSync(FIXTURE, dir, { recursive: true })
  const layoutPath = join(dir, 'capture', 'templates', 'tracy', 'etc', 'layout', 'home.json')
  const layout = readJson(layoutPath)
  const section = layout.layout.sections.find((row) => row.name === 'section-1')
  section.class = 'bg-light sec-spacing-lg'
  section.background_image = 'images/rows/hero.jpg'
  section.background_color = '#eeeeee'
  section.spacing = 'large'
  writeFileSync(layoutPath, JSON.stringify(layout))
  const out = join(tmp('fj-row-frame-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const home = readJson(join(out, 'content.json')).pages.find((page) => page.path === '/')
  assert.deepEqual(home.content[1].frame, { classes: ['bg-light', 'sec-spacing-lg'], background: { image: 'images/rows/hero.jpg', color: '#eeeeee' }, spacing: 'large' })
  assert.equal(Object.hasOwn(home.content[0], 'frame'), false, 'the header row has no attributes and no frame key')
})

test('from-joomla: a component row frame survives replacement by body entries', () => {
  const dir = tmp('fj-component-row-frame-')
  cpSync(FIXTURE, dir, { recursive: true })
  const layoutPath = join(dir, 'capture', 'templates', 'tracy', 'etc', 'layout', 'default.json')
  const layout = readJson(layoutPath)
  const main = layout.layout.sections.find((row) => row.name === 'Main')
  main.class = 'md:bg-light'
  main.background_image = 'assets/article-hero.jpg'
  writeFileSync(layoutPath, JSON.stringify(layout))
  const out = join(tmp('fj-component-row-frame-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const page = readJson(join(out, 'content.json')).pages.find((entry) => entry.path === '/company/about')
  assert.equal(page.contentKind, 'sections')
  assert.ok(page.content.some((entry) => entry.frame?.classes.includes('md:bg-light') && entry.frame.background.image === 'assets/article-hero.jpg'))
})

test('from-joomla: related items carry only articles evidenced by shared source metakey terms', () => {
  const dir = tmp('fj-related-items-')
  cpSync(FIXTURE, dir, { recursive: true })
  const path = join(dir, 'inventory.json')
  const inventory = readJson(path)
  for (const article of inventory.content) {
    article.access = '1'
    article.publish_down = '2027-01-01 00:00:00'
    article.language = 'en-GB'
  }
  inventory.content[0].metakey = 'planning, web design'
  inventory.content[0].title = 'Zulu article'
  inventory.content[1].metakey = 'Web Design, hosting'
  inventory.content[1].title = 'Zulu article'
  inventory.content[1].ordering = '7'
  inventory.content.push(
    { ...inventory.content[1], id: '51', title: 'Alpha article', state: '1', ordering: '1' },
    { ...inventory.content[1], id: '52', title: 'Draft article', state: '0', ordering: '0' },
    { ...inventory.content[1], id: '53', title: 'Private article', access: '2', ordering: '0' },
    { ...inventory.content[1], id: '54', title: 'Other language', language: 'fr-FR', ordering: '0' },
    { ...inventory.content[1], id: '55', title: 'Future article', publish_up: '2027-01-01 00:00:00', ordering: '0' },
    { ...inventory.content[1], id: '56', title: 'Expired article', publish_down: '2025-01-01 00:00:00', ordering: '0' }
  )
  inventory.modules.push({ id: '990', title: 'Related', module: 'mod_related_items', position: 'sidebar-l', published: '1', client_id: '0', ordering: '1', showtitle: '1', params: JSON.stringify({ count: '1', ordering: 'a.title', ordering_direction: 'ASC' }), content: '' })
  writeFileSync(path, JSON.stringify(inventory))
  const out = join(tmp('fj-related-items-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const spec = readJson(join(out, 'sections.json'))
  assert.deepEqual(spec.other.find((module) => module.id === '990').relatedByArticle['3'], ['51'], 'public, active, same-language matches sort by source title and honor count')
  const missing = readJson(path)
  missing.content[0].language = null
  writeFileSync(path, JSON.stringify(missing))
  const missingOut = join(tmp('fj-related-items-missing-out-'), 'pack')
  buildSpecPack({ j6Dir: dir, out: missingOut, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  const unavailable = readJson(join(missingOut, 'sections.json')).other.find((module) => module.id === '990')
  assert.deepEqual(unavailable.relatedByArticle, {})
  assert.ok(unavailable.relatedUnavailable.includes('language'))
})

test('from-joomla: post records carry Joomla hit counts alongside ordering', () => {
  const dir = tmp('fj-hits-')
  cpSync(FIXTURE, dir, { recursive: true })
  const inventoryPath = join(dir, 'inventory.json')
  const inventory = readJson(inventoryPath)
  const article = inventory.content.find((entry) => entry.id === '3')
  article.hits = '37'
  article.created = '2020-03-04 05:06:07'
  article.publish_up = '2021-04-05 06:07:08'
  writeFileSync(inventoryPath, JSON.stringify(inventory))
  const out = join(tmp('fj-hits-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const post = readJson(join(out, 'content.json')).posts.find((article) => article.joomla.articleId === '3')
  assert.equal(post.joomla.ordering, 1)
  assert.equal(post.joomla.hits, 37)
  assert.equal(post.date, '2021-04-05 06:07:08', 'WordPress date keeps Joomla publish_up precedence')
  assert.equal(post.joomla.created, '2020-03-04 05:06:07', 'the distinct Joomla creation timestamp remains available')
})

test('from-joomla: ACM module title and subtitle are fields, and archive intro uses menu over category over global', () => {
  const dir = tmp('fj-source-values-')
  cpSync(FIXTURE, dir, { recursive: true })
  const path = join(dir, 'inventory.json')
  const inventory = readJson(path)
  const module = inventory.modules.find((entry) => entry.id === '101')
  const params = JSON.parse(module.params)
  const cfg = JSON.parse(params['jatools-config'])
  cfg.hero['hero[subtitle]'] = 'A useful supporting line'
  params['jatools-config'] = JSON.stringify(cfg)
  module.params = JSON.stringify(params)
  inventory.categories.find((entry) => entry.id === '15').params = JSON.stringify({ show_intro: '1' })
  inventory.menu.find((entry) => entry.id === '254').params = JSON.stringify({ show_intro: '0' })
  inventory.menu.find((entry) => entry.id === '247').params = JSON.stringify({ orderby_pri: 'front' })
  inventory.content_frontpage = [{ content_id: '3', ordering: '7' }]
  writeFileSync(path, JSON.stringify(inventory))
  writeFileSync(join(dir, 'content-params.json'), JSON.stringify({ show_category_title: '1', show_description: '1', maxLevel: '1', show_intro: '1' }))
  const out = join(tmp('fj-source-values-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const sections = readJson(join(out, 'sections.json'))
  const hero = sections.acm.find((entry) => entry.id === '101')
  assert.equal(hero.fields.title, 'A better website', 'an ACM title field takes precedence over the module title')
  assert.equal(hero.fields.subtitle, 'A useful supporting line')
  const blog = readJson(join(out, 'content.json')).archives.find((entry) => entry.path === '/resources/blog')
  assert.equal(blog.display.showIntro, false)
  assert.equal(blog.display.from.showIntro, 'menu')
  const post = readJson(join(out, 'content.json')).posts.find((entry) => entry.joomla.articleId === '3')
  assert.equal(post.joomla.featuredOrdering, 7)
  const home = readJson(join(out, 'content.json')).pages.find((entry) => entry.path === '/')
  assert.deepEqual(home.featured.order, ['3'], 'the featured home route declares the frontpage ordering')
  assert.equal(home.featured.orderBy, 'featuredOrdering')
  inventory.menu.find((entry) => entry.id === '254').params = JSON.stringify({ show_intro: '' })
  writeFileSync(path, JSON.stringify(inventory))
  const inheritedOut = join(tmp('fj-source-values-inherited-'), 'pack')
  const inherited = buildSpecPack({ j6Dir: dir, out: inheritedOut, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(inherited.validation.ok, true, inherited.validation.problems.join('\n'))
  const categoryWins = readJson(join(inheritedOut, 'content.json')).archives.find((entry) => entry.path === '/resources/blog')
  assert.equal(categoryWins.display.showIntro, true)
  assert.equal(categoryWins.display.from.showIntro, 'category', 'category params override the global when the menu says Use Global')
})

test('from-joomla: missing or invalid frontpage ordering is omitted and reported', () => {
  for (const row of [{ content_id: '3' }, { content_id: '3', ordering: 'not-a-number' }]) {
    const dir = tmp('fj-frontpage-invalid-')
    cpSync(FIXTURE, dir, { recursive: true })
    const path = join(dir, 'inventory.json')
    const inventory = readJson(path)
    inventory.menu.find((entry) => entry.id === '247').params = JSON.stringify({ orderby_pri: 'front' })
    inventory.content_frontpage = [row]
    writeFileSync(path, JSON.stringify(inventory))
    const out = join(tmp('fj-frontpage-invalid-out-'), 'pack')
    const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
    assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
    const content = readJson(join(out, 'content.json'))
    const home = content.pages.find((page) => page.path === '/')
    const post = content.posts.find((article) => article.joomla.articleId === '3')
    assert.equal(Object.hasOwn(home.featured, 'order'), false)
    assert.equal(Object.hasOwn(home.featured, 'orderBy'), false)
    assert.equal(Object.hasOwn(post.joomla, 'featuredOrdering'), false)
    assert.ok(home.notes.some((note) => /ordering values are missing or invalid/.test(note)))
  }
})

test('from-joomla: CLI runs, validates, and refuses to clobber a pack without --force', async () => {
  const scratch = tmp('fj-cli-')
  const out = join(scratch, 'pack')
  const cli = join(SKILL, 'scripts/ingest/from-joomla.mjs')
  const { stderr } = await run(
    'node',
    [cli, FIXTURE, '--out', out, '--page-floor', '4', '--site-url', 'http://joomla.test/', ...browserArgs(FIXTURE, scratch, 'http://joomla.test/')],
    { cwd: SKILL }
  )
  assert.match(stderr, /spec-pack OK — 7 pages/)
  assert.equal(
    readJson(join(out, 'reference.json')).pages[0].url,
    'http://joomla.test/',
    'the site url is trimmed and used for references'
  )
  await assert.rejects(
    run('node', [cli, FIXTURE, '--out', out, '--page-floor', '4'], { cwd: SKILL }),
    /already exists/
  )
  await run('node', [cli, FIXTURE, '--out', out, '--page-floor', '4', '--force', ...browserArgs(FIXTURE, scratch)], { cwd: SKILL })
})

test('from-joomla: the post-vs-page rule is the category list plus menu targets', () => {
  assert.deepEqual(PAGE_CATEGORIES, ['Website pages', 'Studio resources'])
})

/** A copy of the fixture whose "About" article (#45) carries extra fields in `attribs`. */
function fixtureWithFields() {
  const dir = tmp('fj-fields-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  const about = raw.content.find((r) => String(r.id) === '45')
  about.attribs = JSON.stringify({
    article_layout: 'tracy:services',
    show_title: '',
    link_titles: '',
    'benefits-title': 'Why us',
    services_benefits: {
      services_benefits0: { benefits_title: 'Fixture benefit', benefits_desc: 'Fast & calm delivery.', benefits_img: 'images/benefit-1.png' },
      services_benefits1: { benefits_title: 'Second <b>benefit</b>', benefits_desc: '' }
    },
    rating: ''
  })
  writeFileSync(invPath, JSON.stringify(raw))
  return dir
}

test('joomla-inventory: an article keeps its layout and the extra fields of its attribs, core options left out', () => {
  const arts = articles(loadInventory(join(fixtureWithFields(), 'inventory.json')))
  const about = arts.find((a) => a.id === '45')
  assert.equal(about.layout, 'tracy:services')
  assert.deepEqual(Object.keys(about.fields), ['benefits-title', 'services_benefits'], 'show_*/link_* options and empty values are not fields')
  assert.equal(about.fields.services_benefits.services_benefits0.benefits_title, 'Fixture benefit')
  assert.deepEqual(arts.find((a) => a.id === '3').fields, {}, 'no attribs, no fields')
})

test('from-joomla: article fields reach content.json; a field named in --article-fields becomes editable blocks, the rest is reported', () => {
  const j6Dir = fixtureWithFields()
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const about = readJson(join(out, 'content.json')).pages.find((p) => p.path === '/company/about')
  assert.equal(about.joomla.layout, 'tracy:services')
  assert.equal(about.joomla.fields.services_benefits.services_benefits0.benefits_title, 'Fixture benefit', 'the raw fields survive normalisation')
  assert.doesNotMatch(JSON.stringify(about.content), /Fixture benefit/, 'not named: not placed')
  assert.ok(
    result.notes.some((n) => /article fields not placed/.test(n) && /services_benefits/.test(n) && /benefits-title/.test(n)),
    'an unplaced field is reported'
  )

  const out2 = join(tmp('fj-'), 'pack')
  const placed = buildSpecPack({
    j6Dir,
    out: out2,
    pageFloor: 4,
    now: '2026-01-01T00:00:00.000Z',
    articleFields: { services_benefits: { className: 'services-benefits' }, 'benefits-title': 'skip' }
  })
  assert.equal(placed.validation.ok, true, placed.validation.problems.join('\n'))
  const page = readJson(join(out2, 'content.json')).pages.find((p) => p.path === '/company/about')
  const markup = typeof page.content === 'string' ? page.content : page.contentMarkup
  assert.match(markup, /<!-- wp:group \{"layout":\{"type":"constrained"\},"className":"services-benefits"\} -->\n<div class="wp-block-group services-benefits">/)
  assert.equal((markup.match(/"className":"services-benefits__item"/g) ?? []).length, 2, 'a group per subform row')
  assert.match(markup, /<!-- wp:heading \{"level":4,"className":"services-benefits__title"\} -->\n<h4 class="wp-block-heading services-benefits__title">Fixture benefit<\/h4>/)
  assert.match(markup, /<p class="services-benefits__desc">Fast &amp; calm delivery.<\/p>/)
  assert.match(markup, /Second <b>benefit<\/b>/, 'inline markup of a field is kept')
  assert.match(
    markup,
    /<!-- wp:image \{"sizeSlug":"full","className":"services-benefits__img"\} -->\n<figure class="wp-block-image size-full services-benefits__img"><img src="[^"]*benefit-1\.png"/,
    'a field image keeps its class on the core/image block'
  )
  assert.doesNotMatch(markup, /wp:html/, 'field text is never core/html')
  assert.doesNotMatch(markup, /Why us/, 'a skipped field is left out on purpose')
  assert.ok(checkBlockMarkup(markup).ok)
  assert.ok(!placed.notes.some((n) => /article fields not placed/.test(n)), 'every field is accounted for')
})

test('from-joomla: --article-fields naming a file that does not exist exits 2', async () => {
  const cli = join(SKILL, 'scripts/ingest/from-joomla.mjs')
  const out = join(tmp('fj-cli-'), 'pack')
  await assert.rejects(
    run('node', [cli, FIXTURE, '--out', out, '--page-floor', '4', '--article-fields', join(out, 'missing.json')], { cwd: SKILL }),
    (e) => e.code === 2 && /--article-fields/.test(e.stderr)
  )
  assert.equal(existsSync(out), false, 'nothing written')
})

test('from-joomla: --article-fields naming a file that holds null or a list exits 2', async () => {
  const cli = join(SKILL, 'scripts/ingest/from-joomla.mjs')
  for (const body of ['null', '[]']) {
    const dir = tmp('fj-cli-')
    const cfg = join(dir, 'fields.json')
    writeFileSync(cfg, body)
    const out = join(dir, 'pack')
    await assert.rejects(
      run('node', [cli, FIXTURE, '--out', out, '--page-floor', '4', '--article-fields', cfg], { cwd: SKILL }),
      (e) => e.code === 2 && /--article-fields: expected an object/.test(e.stderr),
      `${body} is not a field config`
    )
    assert.equal(existsSync(out), false, 'nothing written')
  }
})

test('from-joomla: an "Error page" article the site serves at its own route is a page, not the 404 body', () => {
  const dir = tmp('fj-error-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  raw.content.find((r) => String(r.id) === '45').title = 'Error Page'
  writeFileSync(invPath, JSON.stringify(raw))
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const content = readJson(join(out, 'content.json'))
  assert.deepEqual(content.pages.filter((p) => p.joomla?.articleId === '45').map((p) => [p.path, p.view, p.status]), [['/company/about', 'page', 'publish']], 'one page, served at its route, not a second draft of the same article')
  const nf = readJson(join(out, 'page-map.json')).pages.find((p) => p.view === '404')
  assert.equal(nf.title, 'Not found')
  assert.equal(nf.source.articleId, null)
})

/**
 * A copy of the fixture with the JA Vega shape of #10: `database-security` is a child of both
 * `services` and `portfolio`. The services child holds one article that is a menu page; the
 * portfolio child holds a post. `mutate(raw)` edits the raw inventory before it is written.
 */
function fixtureWithTwinCategories(mutate = null, extraRoutes = []) {
  const dir = tmp('fj-twins-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  const cat = (id, parent, lft, path, title) => ({ id, parent_id: parent, lft, rgt: String(Number(lft) + 1), level: path.includes('/') ? '2' : '1', path, extension: 'com_content', title, alias: path.split('/').pop(), description: '', published: '1' })
  raw.categories.push(
    cat('30', '1', '10', 'services', 'Services'),
    cat('31', '30', '11', 'services/database-security', 'Database Security'),
    cat('32', '1', '14', 'portfolio', 'Portfolio'),
    cat('33', '32', '15', 'portfolio/database-security', 'Database Security')
  )
  const art = (id, catid, alias, title) => ({ id, title, alias, introtext: `<p>${title} body text for the fixture.</p>`, fulltext: '', state: '1', catid, created: '2024-01-01 00:00:00', created_by: '42', created_by_alias: '', modified: '2024-01-01 00:00:00', publish_up: '2024-01-01 00:00:00', images: '{}', metadesc: '', ordering: '1', featured: '0', language: '*' })
  raw.content.push(art('60', '31', 'database-security', 'Database Security service'), art('61', '33', 'project-sentinel', 'Project Sentinel'))
  const item = (id, path, link, parent = '1') => ({ id, menutype: 'tracy', title: path, alias: path.split('/').pop(), path, link, type: 'component', published: '1', parent_id: parent, level: path.includes('/') ? '2' : '1', template_style_id: '11', params: '{}', lft: '40', rgt: '41', home: '0', client_id: '0' })
  raw.menu.push(
    item('400', 'services', 'index.php?option=com_content&view=category&layout=blog&id=30'),
    item('401', 'services/database-security', 'index.php?option=com_content&view=article&id=60', '400'),
    item('402', 'portfolio', 'index.php?option=com_content&view=category&layout=blog&id=32'),
    item('403', 'portfolio/database-security', 'index.php?option=com_content&view=category&layout=blog&id=33', '402')
  )
  mutate?.(raw)
  writeFileSync(invPath, JSON.stringify(raw))
  const routesPath = join(dir, 'render-routes.json')
  writeFileSync(
    routesPath,
    JSON.stringify([
      ...readJson(routesPath),
      { id: '400', path: '/services' },
      { id: '401', path: '/services/database-security' },
      { id: '402', path: '/portfolio' },
      { id: '403', path: '/portfolio/database-security' },
      ...extraRoutes
    ])
  )
  return dir
}

test('from-joomla: two child categories with one alias under different parents stay distinct, in any inventory order (#10)', () => {
  const build = (mutate) => {
    const out = join(tmp('fj-'), 'pack')
    const result = buildSpecPack({ j6Dir: fixtureWithTwinCategories(mutate), out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
    assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
    return readJson(join(out, 'content.json'))
  }
  const content = build()
  const slugs = content.categories.map((c) => c.wpSlug)
  assert.equal(new Set(slugs).size, slugs.length, `category slugs are unique: ${slugs.join(', ')}`)
  const byId = new Map(content.categories.map((c) => [c.id, c]))
  assert.equal(byId.get('31').wpSlug, 'services-database-security', 'a clashing alias takes its full Joomla path')
  assert.equal(byId.get('33').wpSlug, 'portfolio-database-security')
  assert.equal(byId.get('31').joomlaAlias, 'database-security', 'the alias survives')
  assert.equal(byId.get('31').parent, 'services')
  assert.equal(byId.get('33').parent, 'portfolio')
  assert.equal(byId.get('30').wpSlug, 'services', 'an alias no other category shares is kept')
  const post = content.posts.find((p) => p.joomla.articleId === '61')
  assert.equal(post.category, 'portfolio-database-security', 'the post is filed under the portfolio child')
  assert.equal(post.path, '/portfolio/database-security/project-sentinel')
  const archive = (path) => content.archives.find((a) => a.path === path)
  assert.equal(archive('/portfolio/database-security').category, 'portfolio-database-security')
  assert.equal(archive('/services').category, 'services')
  assert.ok(!content.posts.some((p) => ['services', 'services-database-security'].includes(p.category)), 'no post lands under services')

  const reversed = build((raw) => raw.categories.reverse())
  assert.deepEqual(
    reversed.categories.map((c) => [c.id, c.wpSlug, c.parent]).sort(),
    content.categories.map((c) => [c.id, c.wpSlug, c.parent]).sort(),
    'the rule does not depend on the order of the inventory'
  )
})

test('from-joomla: a disambiguated category slug that still collides is a named error, never a silent merge (#10)', () => {
  const dir = fixtureWithTwinCategories((raw) =>
    raw.categories.push({ id: '34', parent_id: '1', lft: '20', rgt: '21', level: '1', path: 'services-database-security', extension: 'com_content', title: 'Clash', alias: 'services-database-security', description: '', published: '1' })
  )
  assert.throws(
    () => buildSpecPack({ j6Dir: dir, out: join(tmp('fj-'), 'pack'), pageFloor: 4, now: '2026-01-01T00:00:00.000Z' }),
    /category slug collision: "services-database-security".*#31.*#34|category slug collision: "services-database-security".*#34.*#31/
  )
})

test('from-joomla: two routes whose files collide keep their own paths; only the file name is disambiguated', () => {
  const dir = fixtureWithTwinCategories(
    (raw) =>
      raw.menu.push({ id: '404', menutype: 'tracy', title: 'Flat', alias: 'portfolio-database-security', path: 'portfolio-database-security', link: 'index.php?option=com_content&view=article&id=3', type: 'component', published: '1', parent_id: '1', level: '1', template_style_id: '11', params: '{}', lft: '50', rgt: '51', home: '0', client_id: '0' }),
    [{ id: '404', path: '/portfolio-database-security' }]
  )
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const pm = readJson(join(out, 'page-map.json')).pages
  const nested = pm.find((p) => p.source?.menuId === '403')
  const flat = pm.find((p) => p.source?.menuId === '404')
  assert.equal(nested.path, '/portfolio/database-security')
  assert.equal(flat.path, '/portfolio-database-security', 'the route keeps its Joomla path')
  assert.notEqual(nested.file, flat.file, 'the files differ')
  assert.ok(result.notes.some((n) => /portfolio-database-security\.html/.test(n) && /file/.test(n)), 'the renamed file is reported')
})

test('from-joomla: article-field config skips a subfield and numbers the rows the way the layout prints them', () => {
  const j6Dir = fixtureWithFields()
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({
    j6Dir,
    out,
    pageFloor: 4,
    now: '2026-01-01T00:00:00.000Z',
    articleFields: { services_benefits: { className: 'services-benefits', skip: ['benefits_img'], number: { pad: 2 } }, 'benefits-title': 'skip' }
  })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const page = readJson(join(out, 'content.json')).pages.find((p) => p.path === '/company/about')
  const markup = typeof page.content === 'string' ? page.content : page.contentMarkup
  assert.doesNotMatch(markup, /benefit-1\.png|wp:image/, 'the skipped image subfield is not drawn')
  assert.ok(!(page.images ?? []).some((i) => i.file === 'benefit-1.png'), 'nor listed for upload')
  const rows = [...markup.matchAll(/<p class="services-benefits__number">(\d+)<\/p>/g)].map((m) => m[1])
  assert.deepEqual(rows, ['01', '02'], 'one number per row, in row order, padded')
  assert.ok(markup.indexOf('>01<') < markup.indexOf('Fixture benefit'), 'the number opens its row')
  assert.ok(checkBlockMarkup(markup).ok)
  assert.ok(!result.notes.some((n) => /article fields not placed/.test(n)), 'a skipped subfield is on purpose, not unplaced')
  const typo = buildSpecPack({ j6Dir, out: join(tmp('fj-'), 'pack'), pageFloor: 4, now: '2026-01-01T00:00:00.000Z', articleFields: { services_benefits: { skip: ['benefit_img'] }, 'benefits-title': 'skip' } })
  assert.ok(typo.notes.some((n) => /skip names subfields no article has/.test(n) && /services_benefits\.benefit_img/.test(n)), 'a skip that matches nothing is reported')
  const wrongField = buildSpecPack({ j6Dir, out: join(tmp('fj-'), 'pack'), pageFloor: 4, now: '2026-01-01T00:00:00.000Z', articleFields: { service_benefits: { skip: ['benefits_img'], number: { pad: 2 } }, 'benefits-title': 'skip' } })
  assert.ok(
    wrongField.notes.some((n) => /names fields no article has/.test(n) && /service_benefits/.test(n)),
    'a config for a field name no article has is reported, its skip with it'
  )
  assert.ok(!wrongField.notes.some((n) => /names fields no article has/.test(n) && /benefits-title/.test(n)), 'a field that exists is not reported')
  assert.ok(wrongField.notes.some((n) => /article fields not placed/.test(n) && /services_benefits/.test(n)), 'and the field meant stays reported as unplaced')
  for (const bad of [{ skip: 'benefits_img' }, { skip: [1] }, { number: true }, { number: { pad: 0 } }, { number: { pad: 2, start: 1 } }])
    assert.throws(() => buildSpecPack({ j6Dir, out: join(tmp('fj-'), 'pack'), pageFloor: 4, articleFields: { services_benefits: bad } }), /--article-fields: field "services_benefits"/, JSON.stringify(bad))
})

test('from-joomla: an archive route carries the masthead description the source prints for its menu item', () => {
  const dir = tmp('fj-masthead-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  raw.modules.push({
    id: '500',
    title: 'Masthead',
    content: '',
    ordering: '1',
    position: 'masthead',
    published: '1',
    module: 'mod_jamasthead',
    showtitle: '0',
    client_id: '0',
    params: JSON.stringify({
      'default-title': 'Fixture site',
      'default-description': 'The default masthead line.',
      menuitem_config: { item_id: [['254']], title: ['Blog'], description: ['The blog masthead line.'], background: [''] }
    })
  })
  raw.modules_menu.push({ moduleid: '500', menuid: '-247' })
  writeFileSync(invPath, JSON.stringify(raw))
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const archives = readJson(join(out, 'content.json')).archives
  const blog = archives.find((a) => a.path === '/resources/blog')
  const search = archives.find((a) => a.path === '/search')
  assert.equal(blog.excerpt, 'The blog masthead line.', 'the row naming the menu item wins')
  assert.deepEqual(blog.masthead, { module: '500', title: 'Blog', description: 'The blog masthead line.', via: 'menuitem_config' })
  assert.equal(search.excerpt, 'The default masthead line.', 'a menu item no row names takes the default')
  assert.equal(search.masthead.via, 'default')
})

test('joomla-inventory: mastheadFor reads the row that names the item, else the default; an empty row description stays empty; off the item, none', () => {
  const module = {
    id: '128',
    module: 'mod_jamasthead',
    published: true,
    assignment: { all: false, pages: [], except: ['101'] },
    params: {
      'default-title': 'Site',
      'default-description': 'Default line.',
      menuitem_config: { item_id: [['113'], ['120', '132']], title: ['Blog', 'Work'], description: ['Blog line. ', ''] }
    }
  }
  assert.deepEqual(mastheadFor(module, '113'), { module: '128', title: 'Blog', description: 'Blog line.', via: 'menuitem_config' })
  assert.deepEqual(mastheadFor(module, '132'), { module: '128', title: 'Work', description: '', via: 'menuitem_config' }, 'a declared empty description is not the default')
  assert.deepEqual(mastheadFor(module, '174'), { module: '128', title: 'Site', description: 'Default line.', via: 'default' })
  assert.equal(mastheadFor(module, '101'), null, 'the excluded item has no masthead')
  assert.equal(mastheadFor({ ...module, published: false }, '113'), null)
  assert.equal(mastheadFor({ ...module, module: 'mod_custom' }, '113'), null)
  assert.equal(assignedTo({ all: true, pages: [], except: [] }, '5'), true)
  assert.equal(assignedTo({ all: false, pages: ['5'], except: [] }, '6'), false, 'positive ids are "only these"')
  assert.equal(assignedTo({ all: false, pages: [], except: ['5'] }, '6'), true, 'negative ids alone are "all except these"')
})

// ── #18: trashed categories, module spacing, archive display options ─────────

test('joomla-inventory: a trashed category takes no part in slug disambiguation and is not exported, in any inventory order (#18 item 1)', () => {
  const row = (id, parent, lft, path, published) => ({ id, parent_id: parent, lft, rgt: String(Number(lft) + 1), level: path.includes('/') ? '2' : '1', path, extension: 'com_content', title: path.split('/').pop(), alias: path.split('/').pop(), description: '', published })
  const base = [
    row('30', '1', '10', 'services', '1'),
    row('31', '30', '11', 'services/database-security', '-2'),
    row('32', '1', '14', 'portfolio', '1'),
    row('33', '32', '15', 'portfolio/database-security', '1'),
    row('34', '32', '17', 'portfolio/draft-work', '0')
  ]
  for (const order of [base, [...base].reverse()]) {
    const cats = categories({ ...inv, categories: [...inv.categories, ...order] })
    const byId = new Map(cats.map((c) => [c.id, c]))
    assert.equal(byId.has('31'), false, 'the trashed category is not exported')
    assert.equal(byId.get('33').wpSlug, 'database-security', 'no live category shares the alias, so it stays')
    assert.equal(byId.get('33').parentId, '32')
    assert.equal(byId.get('34').published, false, 'an unpublished (not trashed) category is still exported')
  }
  // A real collision among live categories is still disambiguated.
  const live = categories({ ...inv, categories: [...inv.categories, ...base.map((c) => (c.id === '31' ? { ...c, published: '1' } : c))] })
  assert.equal(live.find((c) => c.id === '31').wpSlug, 'services-database-security')
  assert.equal(live.find((c) => c.id === '33').wpSlug, 'portfolio-database-security')
  // A live category under a trashed parent has no parent to hang from: a named error.
  assert.throws(
    () => categories({ ...inv, categories: [...inv.categories, row('40', '1', '30', 'old', '-2'), row('41', '40', '31', 'old/kept', '1')] }),
    /category #41 \(old\/kept\).*parent #40 \(old\) is trashed/
  )
})

test('from-joomla: a trashed twin category does not rename the live one; its posts, archive and redirects keep the alias (#18 item 1)', () => {
  const build = (mutate) => {
    const dir = fixtureWithTwinCategories((raw) => {
      raw.categories.find((c) => c.id === '31').published = '-2'
      raw.content.find((a) => a.id === '60').state = '-2'
      mutate?.(raw)
    })
    const out = join(tmp('fj-'), 'pack')
    const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
    assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
    return { content: readJson(join(out, 'content.json')), redirects: readJson(join(out, 'redirects.json')), notes: result.notes }
  }
  const { content, redirects } = build()
  const byId = new Map(content.categories.map((c) => [c.id, c]))
  assert.equal(byId.has('31'), false, 'the trashed category is not in content.json')
  assert.equal(byId.get('33').wpSlug, 'database-security')
  const post = content.posts.find((p) => p.joomla.articleId === '61')
  assert.equal(post.category, 'database-security')
  assert.equal(post.path, '/portfolio/database-security/project-sentinel')
  assert.equal(content.archives.find((a) => a.path === '/portfolio/database-security').category, 'database-security')
  assert.ok(!JSON.stringify(redirects).includes('portfolio-database-security'), 'no redirect names the disambiguated slug')
  const reversed = build((raw) => raw.categories.reverse()).content
  assert.deepEqual(
    reversed.categories.map((c) => [c.id, c.wpSlug, c.parent]).sort(),
    content.categories.map((c) => [c.id, c.wpSlug, c.parent]).sort()
  )
  // A published article left in a trashed category is not served by Joomla: no post, and a note.
  const orphan = build((raw) =>
    raw.content.push({ ...raw.content.find((a) => a.id === '61'), id: '62', catid: '31', alias: 'left-behind', title: 'Left behind' })
  )
  assert.equal(orphan.content.posts.some((p) => p.joomla.articleId === '62'), false, 'no post, under any category')
  assert.ok(orphan.notes.some((n) => /#62/.test(n) && /trashed/.test(n) && /#31/.test(n)), 'the skipped article is reported')
})

const acmModule = (id, outer) => {
  const hero = inv.modules.find((m) => String(m.id) === '101')
  const params = { ...JSON.parse(hero.params), ...outer }
  return { ...hero, id, params: JSON.stringify(params) }
}

test('joomla-inventory: an ACM instance keeps its module spacing and class suffix; nothing is guessed when the params are absent (#18 item 4)', () => {
  const list = acmInstances({
    ...inv,
    modules: [
      acmModule('115', { 'top-space': 'large', 'bottom-space': 'medium', moduleclass_sfx: '' }),
      acmModule('136', { 'top-space': 'medium', 'bottom-space': 'medium', moduleclass_sfx: ' bg-light' }),
      acmModule('153', { 'top-space': 'blank', 'bottom-space': 'blank' }),
      acmModule('154', {})
    ]
  })
  const byId = Object.fromEntries(list.map((a) => [a.id, a]))
  assert.deepEqual(byId['115'].spacing, { top: 'large', bottom: 'medium' })
  assert.equal(byId['115'].moduleClass, '')
  assert.deepEqual(byId['136'].spacing, { top: 'medium', bottom: 'medium' })
  assert.equal(byId['136'].moduleClass, 'bg-light', 'the suffix is trimmed, not invented')
  assert.deepEqual(byId['153'].spacing, { top: 'blank', bottom: 'blank' }, 'blank is a value of its own')
  assert.deepEqual(byId['154'].spacing, { top: null, bottom: null }, 'absent params stay absent')
  assert.equal(byId['154'].moduleClass, '')
})

test('from-joomla: sections.json carries spacing and class suffix per instance, ACM and custom alike (#18 item 4)', () => {
  const dir = tmp('fj-space-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  const set = (id, outer) => {
    const m = raw.modules.find((x) => String(x.id) === id)
    m.params = JSON.stringify({ ...JSON.parse(m.params || '{}'), ...outer })
  }
  set('101', { 'top-space': 'large', 'bottom-space': 'medium' })
  set('102', { 'top-space': 'medium', 'bottom-space': 'medium', moduleclass_sfx: ' bg-light' })
  set('105', { 'top-space': 'blank', 'bottom-space': 'large', moduleclass_sfx: 'section-border-top  extra' })
  writeFileSync(invPath, JSON.stringify(raw))
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const sections = readJson(join(out, 'sections.json'))
  const acm = Object.fromEntries(sections.acm.map((a) => [a.id, a]))
  assert.deepEqual([acm['101'].spacing, acm['101'].moduleClass], [{ top: 'large', bottom: 'medium' }, ''])
  assert.deepEqual([acm['102'].spacing, acm['102'].moduleClass], [{ top: 'medium', bottom: 'medium' }, 'bg-light'])
  const custom = Object.fromEntries(sections.custom.map((c) => [c.id, c]))
  assert.deepEqual([custom['105'].spacing, custom['105'].moduleClass], [{ top: 'blank', bottom: 'large' }, 'section-border-top extra'])
  assert.deepEqual([custom['106'].spacing, custom['106'].moduleClass], [{ top: null, bottom: null }, ''])
})

/**
 * A fixture copy with the blog menu item's params, (when given) a content-params.json and (when
 * given) an extensions table as joomla-dump.mjs writes it.
 */
function fixtureWithDisplay({ menuParams = {}, global = undefined, extensions = undefined } = {}) {
  const dir = tmp('fj-display-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  raw.menu.find((m) => m.id === '254').params = JSON.stringify(menuParams)
  if (extensions !== undefined) raw.extensions = extensions
  writeFileSync(invPath, JSON.stringify(raw))
  const file = join(dir, 'content-params.json')
  if (global === undefined) rmSync(file, { force: true })
  else writeFileSync(file, JSON.stringify(global))
  return dir
}
const blogArchive = (dir, opts = {}) => {
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z', ...opts })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  return readJson(join(out, 'content.json')).archives.find((a) => a.path === '/resources/blog')
}

test('from-joomla: a category archive records the title, description and subcategory options it resolved, and where each came from (#18 item 5)', () => {
  const inherited = blogArchive(fixtureWithDisplay({ menuParams: { show_category_title: '', show_description: '' }, global: { show_category_title: '0', show_description: '0', maxLevel: '-1' } }))
  assert.deepEqual(inherited.display, {
    showTitle: false,
    showDescription: false,
    maxLevel: -1,
    from: { showTitle: 'global', showDescription: 'global', maxLevel: 'global' }
  })
  const menu = blogArchive(fixtureWithDisplay({ menuParams: { show_category_title: '1', show_description: 0, maxLevel: '0' }, global: { show_category_title: '0', show_description: '1', maxLevel: '-1' } }))
  assert.deepEqual(menu.display, {
    showTitle: true,
    showDescription: false,
    maxLevel: 0,
    from: { showTitle: 'menu', showDescription: 'menu', maxLevel: 'menu' }
  }, 'the menu item wins over the global; the number 0 and the string "0" are both off')
  const numbers = blogArchive(fixtureWithDisplay({ menuParams: {}, global: { show_category_title: 1, show_description: 0, maxLevel: 2 } }))
  assert.deepEqual([numbers.display.showTitle, numbers.display.showDescription, numbers.display.maxLevel], [true, false, 2])
  const explicit = blogArchive(fixtureWithDisplay({ menuParams: { show_category_title: '0', show_description: '0', maxLevel: '1' } }))
  assert.deepEqual(explicit.display.from, { showTitle: 'menu', showDescription: 'menu', maxLevel: 'menu' }, 'a menu item that sets every option needs no global')
  const viaOption = blogArchive(fixtureWithDisplay({ menuParams: {}, global: { show_category_title: '1', show_description: '1', maxLevel: '-1' } }), { contentParams: { show_category_title: '0', show_description: '0', maxLevel: '0' } })
  assert.deepEqual([viaOption.display.showTitle, viaOption.display.maxLevel], [false, 0], 'the contentParams option replaces the file')
})

test('from-joomla: an inherited archive option with no global com_content config is a named error, never a default (#18 item 5)', () => {
  const dir = fixtureWithDisplay({ menuParams: { show_category_title: '', show_description: '1', maxLevel: '0' } })
  assert.throws(
    () => blogArchive(dir),
    (e) => /show_category_title/.test(e.message) && /254/.test(e.message) && /--content-params/.test(e.message)
  )
  const partial = fixtureWithDisplay({ menuParams: {}, global: { show_category_title: '0', show_description: '0' } })
  assert.throws(() => blogArchive(partial), /maxLevel/, 'a global that lacks the option is not a value')
  const bad = fixtureWithDisplay({ menuParams: {}, global: { show_category_title: 'yes', show_description: '0', maxLevel: '0' } })
  assert.throws(() => blogArchive(bad), /show_category_title/, 'a value that is not 0/1 is not guessed')
})

test('from-joomla CLI: --content-params reads the global com_content options from a file (#18 item 5)', async () => {
  const dir = fixtureWithDisplay({ menuParams: {} })
  const cfg = join(tmp('fj-cfg-'), 'com_content.json')
  writeFileSync(cfg, JSON.stringify({ show_category_title: '0', show_description: '1', maxLevel: '0' }))
  const scratch = tmp('fj-cli-')
  const out = join(scratch, 'pack')
  const cli = join(SKILL, 'scripts/ingest/from-joomla.mjs')
  await run('node', [cli, dir, '--out', out, '--page-floor', '4', '--content-params', cfg, ...browserArgs(dir, scratch)], { cwd: SKILL })
  const blog = readJson(join(out, 'content.json')).archives.find((a) => a.path === '/resources/blog')
  assert.deepEqual([blog.display.showTitle, blog.display.showDescription, blog.display.maxLevel], [false, true, 0])
  await assert.rejects(
    run('node', [cli, dir, '--out', join(tmp('fj-cli-'), 'pack'), '--page-floor', '4'], { cwd: SKILL }),
    /show_category_title/
  )
})

test('from-joomla: an explicit --content-params that is not an object exits 2 and never falls back to <j6-dir>/content-params.json (#18 item 5)', async () => {
  // The fallback file would resolve every option: a silent fallback would build a pack.
  const dir = fixtureWithDisplay({ menuParams: {}, global: { show_category_title: '1', show_description: '1', maxLevel: '-1' } })
  const cli = join(SKILL, 'scripts/ingest/from-joomla.mjs')
  for (const body of ['null', '[]', '3']) {
    const cfg = join(tmp('fj-cfg-'), 'com_content.json')
    writeFileSync(cfg, body)
    const out = join(tmp('fj-cli-'), 'pack')
    await assert.rejects(
      run('node', [cli, dir, '--out', out, '--page-floor', '4', '--content-params', cfg], { cwd: SKILL }),
      (e) => e.code === 2 && /--content-params: .*expected an object/.test(e.stderr),
      `${body} is not a com_content config`
    )
    assert.equal(existsSync(out), false, 'nothing written')
  }
  assert.throws(() => blogArchive(dir, { contentParams: null }), /--content-params: expected an object .*got null/, 'the API option null is given, not omitted')
  assert.equal(blogArchive(dir, { contentParams: undefined }).display.maxLevel, -1, 'an omitted option reads the file')
})

/** The #__extensions rows of a dump: com_content with `params` (the column, a JSON string), a module without. */
const dumpedExtensions = (params, more = []) => [
  { extension_id: '19', name: 'com_content', type: 'component', element: 'com_content', folder: '', client_id: '1', enabled: '1', ...(params === undefined ? {} : { params }) },
  { extension_id: '120', name: 'mod_menu', type: 'module', element: 'mod_menu', folder: '', client_id: '0', enabled: '1' },
  ...more
]

test('from-joomla: the global com_content options come from the dump\'s extensions table when no override is given, and the source is recorded', () => {
  const dir = fixtureWithDisplay({ menuParams: {}, extensions: dumpedExtensions(JSON.stringify({ show_category_title: '0', show_description: '1', maxLevel: '2' })) })
  const out = join(tmp('fj-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const blog = readJson(join(out, 'content.json')).archives.find((a) => a.path === '/resources/blog')
  assert.deepEqual([blog.display.showTitle, blog.display.showDescription, blog.display.maxLevel], [false, true, 2])
  assert.deepEqual(blog.display.from, { showTitle: 'global', showDescription: 'global', maxLevel: 'global' })
  assert.match(result.contentParamsFrom, /inventory\.json \(extensions, com_content extension_id 19\)/)
  // the record names the same file as the result, written as a kept record writes a path (lib/record-paths.mjs)
  assert.equal(readJson(join(out, 'provenance.json')).source.contentParams, recordText(result.contentParamsFrom))
})

test('from-joomla: content-params precedence — the option, then content-params.json, then the inventory; the first that applies is the only one read', () => {
  const inv = { extensions: dumpedExtensions(JSON.stringify({ maxLevel: '3' })) }
  const dir = tmp('fj-prec-')
  assert.deepEqual(resolveContentParams(dir, undefined, inv), { params: { maxLevel: '3' }, from: `${join(dir, 'inventory.json')} (extensions, com_content extension_id 19)` })
  writeFileSync(join(dir, 'content-params.json'), JSON.stringify({ maxLevel: '1' }))
  assert.deepEqual(resolveContentParams(dir, undefined, inv), { params: { maxLevel: '1' }, from: join(dir, 'content-params.json') })
  assert.deepEqual(resolveContentParams(dir, { maxLevel: '0' }, inv).params, { maxLevel: '0' })
  // a selected source that is bad throws; nothing falls through to the next one
  writeFileSync(join(dir, 'content-params.json'), '[]')
  assert.throws(() => resolveContentParams(dir, undefined, inv), /content-params\.json: expected an object .*got a list/)
  writeFileSync(join(dir, 'content-params.json'), '{"maxLevel":')
  assert.throws(() => resolveContentParams(dir, undefined, inv), /content-params\.json: /)
  assert.throws(() => resolveContentParams(dir, null, inv), /expected an object .*got null/)
  // a link or a directory is not read as the override, and a dangling link is not "absent"
  rmSync(join(dir, 'content-params.json'))
  symlinkSync(join(dir, 'nowhere.json'), join(dir, 'content-params.json'))
  assert.throws(() => resolveContentParams(dir, undefined, inv), /not a regular file/)
  rmSync(join(dir, 'content-params.json'))
  mkdirSync(join(dir, 'content-params.json'))
  assert.throws(() => resolveContentParams(dir, undefined, inv), /not a regular file/)
  rmSync(join(dir, 'content-params.json'), { recursive: true })
  writeFileSync(join(dir, 'content-params.json'), `{"pad":"${'x'.repeat(1024 * 1024)}"}`)
  assert.throws(() => resolveContentParams(dir, undefined, inv), /bytes, over the 1048576/)
  rmSync(join(dir, 'content-params.json'))
  // a legacy inventory (no extensions table) gives no options, and says so
  assert.deepEqual(resolveContentParams(dir, undefined, { content: [] }), { params: null, from: null })
})

test('from-joomla: an extensions table whose com_content row is missing, doubled, unexported or not an object is a named error, never a fallback', () => {
  const dir = tmp('fj-ext-')
  const cases = [
    ['no com_content row', dumpedExtensions(undefined).slice(1), /no com_content component row/],
    ['two com_content rows', dumpedExtensions('{}', [{ extension_id: '900', name: 'com_content', type: 'component', element: 'com_content', params: '{}' }]), /2 com_content component rows \(extension_id 19, 900\)/],
    ['params not exported', dumpedExtensions(undefined), /extension_id 19\) params: not exported/],
    ['params null', dumpedExtensions(null), /params: not exported/],
    ['params not JSON', dumpedExtensions('{"maxLevel":'), /params: not JSON/],
    ['params a list', dumpedExtensions('[1]'), /params: expected an object .*got a list/],
    ['params an object, not the column', dumpedExtensions({ maxLevel: '1' }), /expected the column as the database holds it/]
  ]
  for (const [label, extensions, re] of cases) assert.throws(() => resolveContentParams(dir, undefined, { extensions }), re, label)
  // an empty object is an object: it resolves, and an inherited option it does not set is still an error
  assert.deepEqual(resolveContentParams(dir, undefined, { extensions: dumpedExtensions('{}') }).params, {})
  const empty = fixtureWithDisplay({ menuParams: {}, extensions: dumpedExtensions('{}') })
  assert.throws(() => blogArchive(empty), /show_category_title.*they do not set it/)
  // an override beside the dump is read instead of a broken extensions table
  const overridden = fixtureWithDisplay({ menuParams: {}, global: { show_category_title: '1', show_description: '1', maxLevel: '-1' }, extensions: dumpedExtensions(undefined) })
  assert.equal(blogArchive(overridden).display.maxLevel, -1)
})

test('from-joomla: the pack records the dump it was read from without the machine\'s layout, and the records still name the files', () => {
  const m = machine()
  // a dump outside the repository (a data directory under home), the pack inside it (the dossier's spec/)
  const dump = join(m.data, 'j6')
  cpSync(FIXTURE, dump, { recursive: true })
  const out = join(m.dossier, 'spec')
  const result = withHome(m.home, () => buildSpecPack({ j6Dir: dump, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' }))
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  const prov = readJson(join(out, 'provenance.json'))
  assert.equal(prov.source.path, '~/data/site/j6')
  assert.equal(prov.source.inventory, '~/data/site/j6/inventory.json')
  const contract = readJson(join(out, 'content-contract.json'))
  assert.equal(contract.sources.joomla.reference, '~/data/site/j6/inventory.json')
  assert.equal(readJson(join(out, 'adapter-coverage.json')).source.path, '~/data/site/j6')
  assert.equal(resolveRecordPath(prov.source.inventory, m.opts), join(dump, 'inventory.json'), 'the recorded path resolves to the dump')
  assert.equal(resolveRecordPath(contract.sources.joomla.reference, m.opts), join(dump, 'inventory.json'))
  for (const f of ['provenance.json', 'content-contract.json', 'adapter-coverage.json', 'page-map.json', 'design-contract.json'])
    assert.ok(!readFileSync(join(out, f), 'utf8').includes(m.home), `${f} names the home directory`)
  // the working directory plays no part, and a dump kept inside the repository is written relative to its root
  const inRepo = join(m.repo, 'data', 'j6')
  cpSync(FIXTURE, inRepo, { recursive: true })
  const out2 = join(m.repo, 'tasks', 'other', 'spec')
  const cwd = process.cwd()
  try {
    process.chdir(m.root)
    withHome(m.home, () => buildSpecPack({ j6Dir: inRepo, out: out2, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' }))
  } finally {
    process.chdir(cwd)
  }
  assert.equal(readJson(join(out2, 'provenance.json')).source.path, 'data/j6')
  assert.equal(readJson(join(out2, 'content-contract.json')).sources.joomla.reference, 'data/j6/inventory.json')
  assert.equal(readJson(join(out2, 'adapter-coverage.json')).source.path, 'data/j6')
})

test('from-joomla: a dump and a pack named by relative paths are recorded from the repository root and home, not from the working directory', () => {
  const m = machine()
  const dump = join(m.data, 'j6')
  cpSync(FIXTURE, dump, { recursive: true })
  const inRepo = join(m.repo, 'data', 'j6')
  cpSync(FIXTURE, inRepo, { recursive: true })
  const cwd = process.cwd()
  const built = (from, j6Dir, out) => {
    process.chdir(from)
    try {
      const result = withHome(m.home, () => buildSpecPack({ j6Dir: relative(from, j6Dir), out: relative(from, out), pageFloor: 4, now: '2026-01-01T00:00:00.000Z' }))
      assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
    } finally {
      process.chdir(cwd)
    }
    return { prov: readJson(join(out, 'provenance.json')), contract: readJson(join(out, 'content-contract.json')), coverage: readJson(join(out, 'adapter-coverage.json')) }
  }
  // started in the data directory: the dump is `j6`, the pack `../../work/repo/tasks/site/spec`
  const a = built(m.data, dump, join(m.dossier, 'spec'))
  assert.deepEqual([a.prov.source.path, a.prov.source.inventory, a.prov.source.siteConfig ?? null], ['~/data/site/j6', '~/data/site/j6/inventory.json', null])
  assert.equal(a.contract.sources.joomla.reference, '~/data/site/j6/inventory.json')
  assert.equal(a.coverage.source.path, '~/data/site/j6')
  // started in a dossier of the repository: a dump kept in the repository is written from its root, never as `../../data/j6`
  const b = built(m.dossier, inRepo, join(m.repo, 'tasks', 'two', 'spec'))
  assert.equal(b.prov.source.path, 'data/j6')
  assert.equal(b.prov.source.inventory, 'data/j6/inventory.json')
  assert.equal(b.contract.sources.joomla.reference, 'data/j6/inventory.json')
  assert.equal(b.coverage.source.path, 'data/j6')
  assert.match(b.prov.source.contentParams ?? 'data/j6/', /^data\/j6\//)
})

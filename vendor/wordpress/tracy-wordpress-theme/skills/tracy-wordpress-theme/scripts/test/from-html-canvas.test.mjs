// from-html on a Claude Design canvas export: the literals are read from the AST, every page is
// bound statically (EN and RU without a browser), and the pack the seeder consumes comes out
// whole. The render path (Playwright) is exercised on the same fixture with its offline runtime
// stub and skipped when no Chromium can launch.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { JSDOM } from 'jsdom'
import {
  isCanvasExport,
  splitCanvasPage,
  parseDataScript,
  localeDictionaries,
  evaluateComponent,
  bindTemplate,
  resolveBinding,
  isClosure
} from '../lib/canvas-export.mjs'
import { detectSectionType, extractMenus, extractMain, resolveRelative, contactFacts, linkLabel, sectionItems, textOf } from '../lib/html-content.mjs'
import { viewForName, pathFor, resolveAtWidth, baseName } from '../ingest/from-html.mjs'
import { addPassingDomBrowserFixture } from './dom-source-font-fixtures.mjs'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const SKILL = join(here, '..', '..')
const FIXTURE = join(here, 'fixtures', 'canvas-min')
const CLI = join(SKILL, 'scripts/ingest/from-html.mjs')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))

const tmps = []
const tmp = (prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})

// ── the data script, read without running it ─────────────────────────────────

const home = readFileSync(join(FIXTURE, 'Home.html'), 'utf8')
const homeRu = readFileSync(join(FIXTURE, 'RU/Home_ru.html'), 'utf8')

test('canvas: detection needs both the <x-dc> template and the text/x-dc script', () => {
  assert.equal(isCanvasExport(home), true)
  assert.equal(isCanvasExport('<html><body><h1>x</h1></body></html>'), false)
  assert.equal(isCanvasExport('<script type="text/x-dc">const A = 1</script>'), false)
})

test('canvas: a page splits into title, template, helmet, script, state.page, locale and data-props defaults', () => {
  const p = splitCanvasPage(home)
  assert.equal(p.title, 'Northgate Industrial — Home')
  assert.equal(p.page, 'home')
  assert.equal(p.locale, 'en')
  assert.deepEqual(p.props, { lang: 'ru', showTopbar: true })
  assert.match(p.helmet, /<style>/)
  assert.doesNotMatch(p.template, /<helmet/)
  assert.match(p.template, /\{\{ t\.hero\.h1a \}\}/)
  assert.equal(splitCanvasPage(homeRu).locale, 'ru')
})

test('canvas: literal declarations are read, a call expression is listed as unsupported and never evaluated', () => {
  const parsed = parseDataScript(splitCanvasPage(home).script)
  assert.deepEqual(Object.keys(parsed.data), ['RU', 'EN', 'AB_RU', 'AB_EN'])
  assert.equal(parsed.data.EN.hero.h1a, 'Building the ground for')
  assert.equal(parsed.data.RU.nav[1], 'О компании')
  assert.deepEqual(
    parsed.unsupported.map((u) => [u.name, u.reason]),
    [['COMPUTED', 'CallExpression']]
  )
  assert.ok(parsed.classNode, 'the page class is found')
})

test('canvas: locale dictionaries pair by name — EN is `t`, AB_EN is `ab`', () => {
  const dicts = localeDictionaries(parseDataScript(splitCanvasPage(home).script).data)
  assert.deepEqual(Object.keys(dicts).sort(), ['en', 'ru'])
  assert.deepEqual(Object.keys(dicts.en).sort(), ['ab', 't'])
  assert.equal(dicts.ru.ab.h1, 'О компании')
})

test('canvas: renderVals() is evaluated as a pure subset — nav labels, active flags, and handlers that navigate become {$href}', () => {
  const p = splitCanvasPage(home)
  const { vals, meta, unresolved } = evaluateComponent(parseDataScript(p.script), { props: p.props })
  assert.equal(meta.page, 'home')
  assert.equal(meta.locale, 'en')
  assert.deepEqual(
    vals.nav.map((n) => [n.label, n.active]),
    [
      ['Home', true],
      ['About', false]
    ]
  )
  assert.ok(isClosure(vals.goAbout))
  assert.deepEqual(vals.goAbout.call([undefined]), { $href: './About.html' })
  assert.deepEqual(
    vals.ftCompany.map((x) => [x.label, x.onClick.call([undefined]).$href]),
    [
      ['About us', './About.html'],
      ['Home', './Home.html']
    ]
  )
  assert.deepEqual(vals.setRu.call([undefined]), { $href: './RU/Home_ru.html' })
  assert.equal(vals.isHome, true)
  assert.equal(vals.isAbout, false)
  assert.equal(vals.showTopbar, true, 'this.props.showTopbar ?? true reads the data-props default')
  assert.equal(vals.megaOpen, false)
  assert.equal(unresolved.length, 0)
  // the RU page: same script, other locale
  const r = splitCanvasPage(homeRu)
  const ru = evaluateComponent(parseDataScript(r.script), { props: r.props })
  assert.equal(ru.meta.locale, 'ru')
  assert.equal(ru.vals.t.hero.h1a, 'Строим основание для')
  assert.deepEqual(ru.vals.goAbout.call([undefined]), { $href: './About_ru.html' })
})

test('canvas: page override — the same script evaluated for another page flips the is* flags', () => {
  const p = splitCanvasPage(home)
  const { vals } = evaluateComponent(parseDataScript(p.script), { props: p.props, page: 'about' })
  assert.equal(vals.isHome, false)
  assert.equal(vals.isAbout, true)
  assert.deepEqual(
    vals.nav.map((n) => n.active),
    [false, true]
  )
})

test("canvas: the binding mini-language matches the runtime's — paths, ===, !, literals", () => {
  const vals = { a: { b: 'x' }, n: 2, flag: false }
  assert.equal(resolveBinding(vals, 'a.b'), 'x')
  assert.equal(resolveBinding(vals, "a.b === 'x'"), true)
  assert.equal(resolveBinding(vals, '!flag'), true)
  assert.equal(resolveBinding(vals, 'n !== 2'), false)
  assert.equal(resolveBinding(vals, '(a.b)'), 'x')
  assert.equal(resolveBinding(vals, 'missing.path'), undefined)
})

test('canvas: the static binder fills text, expands sc-for, keeps the sc-if branch the value (or the hint) selects, and turns navigating handlers into href', () => {
  const p = splitCanvasPage(home)
  const { vals } = evaluateComponent(parseDataScript(p.script), { props: p.props })
  const { html, unresolved } = bindTemplate(p.template, vals, { title: p.title, head: p.helmet, lang: 'en' })
  assert.equal(unresolved.length, 0, 'every binding of the fixture resolves')
  assert.doesNotMatch(html, /\{\{/)
  const doc = new JSDOM(html).window.document
  assert.equal(doc.documentElement.getAttribute('lang'), 'en')
  assert.equal(doc.querySelector('h1').textContent.replace(/\s+/g, ' ').trim(), 'Building the ground for factories')
  // sc-for over t.stats → three figures; sc-for over nav → two links with real hrefs
  assert.equal(doc.querySelectorAll('main section:first-of-type > div > div').length, 3)
  assert.deepEqual(
    [...doc.querySelectorAll('header nav > a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]),
    [
      ['Home', './Home.html'],
      ['About', './About.html'],
      ['More', '#']
    ]
  )
  // sc-if: isHome true → the home main; isAbout false → no about main; hint keeps the topbar
  assert.equal(doc.querySelectorAll('main').length, 1)
  assert.ok(doc.querySelector('main #sec-services'))
  assert.match(doc.body.textContent, /Hotline: 8 800 550-67-89/)
  // image-slot survives as the element the DOM pass converts
  assert.equal(doc.querySelector('image-slot#tp-hero').getAttribute('placeholder'), 'Site photo')
  // the helmet CSS is in <head>, no on* attributes survive
  assert.match(doc.head.innerHTML, /html\[data-theme="dark"\] body/)
  assert.equal(doc.querySelectorAll('[onclick]').length, 0)
})

test('canvas: an unresolved binding stays visible as {{ … }} and is reported, never invented', () => {
  const { html, unresolved } = bindTemplate('<p>{{ t.nope }} and {{ ok }}</p><sc-if value="{{ gone }}"><b>hidden</b></sc-if><sc-if value="{{ gone }}" hint-placeholder-val="{{ true }}"><i>shown</i></sc-if>', { t: {}, ok: 'fine' })
  assert.match(html, /\{\{ t\.nope \}\} and fine/)
  assert.doesNotMatch(html, /hidden/)
  assert.match(html, /shown/)
  assert.deepEqual(
    unresolved.map((u) => [u.expr, u.count]).sort(),
    [
      ['gone', 2],
      ['t.nope', 1]
    ]
  )
})

// ── DOM → content heuristics ─────────────────────────────────────────────────

const el = (html) => new JSDOM(`<body>${html}</body>`).window.document.body.firstElementChild

test('sections: type comes from id/class tokens, then structure, then the heading', () => {
  assert.equal(detectSectionType(el('<section id="sec-services"><h2>Anything</h2></section>')), 'services')
  assert.equal(detectSectionType(el('<section><h2>Where we work</h2><p>Four regions.</p><img src="map.png"></section>')), 'text', '"work" alone is not a portfolio')
  assert.equal(detectSectionType(el('<section><h2>Selected work</h2><p>Three sites.</p></section>')), 'projects')
  assert.equal(detectSectionType(el('<section><h1>Big</h1><p>x</p></section>'), { first: true }), 'hero')
  assert.equal(detectSectionType(el('<section><h1>Big</h1><p>x</p></section>'), { first: false }), 'text')
  assert.equal(detectSectionType(el('<section><div><b>380+</b><span>Projects</span></div><div><b>22 years</b><span>Experience</span></div><div><b>0</b><span>Incidents</span></div></section>')), 'stats')
  assert.equal(detectSectionType(el('<section><label>Name</label><input><label>Email</label><input></section>')), 'form')
  assert.equal(detectSectionType(el('<section><h2>Need a quote?</h2><p>Send drawings.</p><a href="/contact">Talk to us</a></section>')), 'cta')
  assert.equal(detectSectionType(el('<section><h2>Руководство</h2><div><img src="a.png"><b>A</b><p>CEO</p></div><div><img src="b.png"><b>B</b><p>CTO</p></div></section>')), 'team')
  assert.equal(detectSectionType(el('<div><a href="/">Home</a> / <span>Contact</span></div>'), { first: true }), 'breadcrumb')
  assert.equal(detectSectionType(el('<section><h2>History</h2><div><b>2004</b><p>Founded.</p></div><div><b>2010</b><p>Grew.</p></div></section>')), 'text')
  assert.equal(detectSectionType(el('<section><div><b>2004</b></div><div><b>2010</b></div></section>')), null, 'no heading, no shape: unknown stays unknown')
})

test('menus: header nav, a bar above the header, footer columns by heading; dead and decorated labels handled', () => {
  const doc = new JSDOM(`<body><div><a href="/careers">Careers</a><a href="/investors">Investors</a></div>
    <header><nav><a href="/">Home</a><a href="/about">About</a><a href="#">Resources ▼</a></nav></header>
    <main><h1>x</h1></main>
    <footer><div class="grid"><div><p>About text</p></div><div><div>Company</div><a href="/about">About us</a><a href="/projects">Projects</a></div><div><span>Contact</span><a href="/contact"><span>Book</span><span>a survey</span></a><a href="#">Telegram</a></div></div><div><a href="#">Terms</a><a href="#">Privacy</a></div></footer></body>`).window.document
  const menus = extractMenus(doc)
  assert.deepEqual(
    menus.map((m) => [m.id, m.region, m.items.map((i) => `${i.label}→${i.href}`)]),
    [
      ['header', 'header', ['Home→/', 'About→/about', 'Resources→#']],
      ['topbar', 'topbar', ['Careers→/careers', 'Investors→/investors']],
      ['footer-company', 'footer', ['About us→/about', 'Projects→/projects']],
      ['footer-contact', 'footer', ['Book→/contact', 'Telegram→#']],
      ['footer-legal', 'footer', ['Terms→#', 'Privacy→#']]
    ]
  )
  assert.equal(linkLabel(el('<a><span>Newsletter</span><span>Digest email template</span></a>')), 'Newsletter')
})

test('main: a stack of sections is decomposed with fields, items and images; a plain document becomes block markup', () => {
  const doc = new JSDOM(`<body><main>
    <section id="sec-services"><div style="text-transform:uppercase">What we do</div><h2>Four lines</h2><p>Intro.</p>
      <div><article><div>01</div><h3>Roads</h3><p>Earthworks.</p></article><article><div>02</div><h3>Frames</h3><p>Steel.</p></article></div>
      <a href="/services">All services</a></section>
    <section><h2>News</h2><img src="/wp-content/uploads/a.png" alt="A"></section>
  </main></body>`).window.document
  const main = extractMain(doc, { idPrefix: 'p-en', view: 'page' })
  assert.equal(main.mode, 'sections')
  const [svc, news] = main.sections
  assert.equal(svc.id, 'p-en-1')
  assert.equal(svc.type, 'services')
  assert.deepEqual([svc.fields.eyebrow, svc.fields.heading, svc.fields.intro, svc.fields.ctas[0].href], ['What we do', 'Four lines', 'Intro.', '/services'])
  assert.deepEqual(
    svc.items.map((i) => [i.title, i.text]),
    [
      ['Roads', 'Earthworks.'],
      ['Frames', 'Steel.']
    ]
  )
  assert.equal(news.type, 'news')
  assert.deepEqual(news.images, [{ src: '/wp-content/uploads/a.png', file: 'a.png', alt: 'A' }])
  const plain = extractMain(new JSDOM('<body><main><h1>Guide</h1><p>Text</p></main></body>').window.document, { idPrefix: 'g', view: 'page' })
  assert.equal(plain.mode, 'blocks')
  assert.match(plain.markup, /<!-- wp:heading \{"level":1\} -->/)
})

test('main: a <br> inside a heading or a paragraph is a space in fields and items, not nothing', () => {
  const doc = new JSDOM(`<body><main>
    <section><h1><span>Building the groundwork for</span><br><em>next-generation plants</em></h1>
      <p>Design–build<br>main contractor.</p>
      <div><div><div>380+</div><div>Projects<br>delivered</div></div><div><div>22 years</div><div>Industry<br>experience</div></div></div>
    </section>
  </main></body>`).window.document
  const [hero] = extractMain(doc, { idPrefix: 'h', view: 'front-page' }).sections
  assert.equal(hero.fields.heading, 'Building the groundwork for next-generation plants')
  assert.equal(hero.title, 'Building the groundwork for next-generation plants')
  assert.equal(hero.fields.intro, 'Design–build main contractor.')
  assert.deepEqual(
    hero.items.map((i) => [i.title, i.text]),
    [
      ['380+', 'Projects delivered'],
      ['22 years', 'Industry experience']
    ]
  )
  assert.equal(textOf(el('<h2>for<br>next</h2>')), 'for next')
  assert.equal(textOf(el('<h2>for <br> next</h2>')), 'for next', 'surrounding whitespace collapses to one space')
})

test('main: a chip strip is the filter row, not the item set; the cards behind it are the items', () => {
  // The Northgate Home "Selected projects" block: a heading, four filter chips and an "All
  // projects" link in the head row, then a lead <article> (inner <div>) and two <article>s that
  // wrap their text in an <a>.
  const doc = new JSDOM(`<body><main>
    <section id="sec-projects"><div>
      <div><h2>Selected projects</h2>
        <div>
          <span style="cursor: pointer;"><span>All</span></span><span style="cursor: pointer;"><span>Factories</span></span><span style="cursor: pointer;"><span>Infrastructure</span></span><span style="cursor: pointer;"><span>M&amp;E</span></span>
          <a href="/projects"><span>All projects</span> →</a>
        </div>
      </div>
      <div>
        <article><div><img src="/wp-content/uploads/factory-ru-1.png" alt="Project photo"></div>
          <div><div>Factory · 2025</div><h3>Elektra appliance plant, Lipetsk SEZ</h3><p>Main contractor for 62,000 m² of cleanroom space.</p><a href="/projects/elektra">Read the case study →</a></div></article>
        <article><div><img src="/wp-content/uploads/proj-ru-2.png" alt="Project photo"></div>
          <a href="/projects/vorsino"><div>Infrastructure · 2024</div><h3>Vorsino Industrial Park, phase 3</h3><p>48 ha of earthworks.</p></a></article>
        <article><div><img src="/wp-content/uploads/proj-ru-3.png" alt="Project photo"></div>
          <a href="/projects/obninsk"><div>M&amp;E · 2024</div><h3>110 kV Obninsk-2 substation</h3><p>Energisation in nine months.</p></a></article>
      </div>
    </div></section>
  </main></body>`).window.document
  const [projects] = extractMain(doc, { idPrefix: 'home-en', view: 'front-page' }).sections
  assert.equal(projects.type, 'projects')
  assert.deepEqual(projects.fields.filters, ['All', 'Factories', 'Infrastructure', 'M&E'])
  assert.deepEqual(
    projects.items.map((i) => [i.title, i.meta, i.img, i.href]),
    [
      ['Elektra appliance plant, Lipetsk SEZ', 'Factory · 2025', '/wp-content/uploads/factory-ru-1.png', '/projects/elektra'],
      ['Vorsino Industrial Park, phase 3', 'Infrastructure · 2024', '/wp-content/uploads/proj-ru-2.png', '/projects/vorsino'],
      ['110 kV Obninsk-2 substation', 'M&E · 2024', '/wp-content/uploads/proj-ru-3.png', '/projects/obninsk']
    ]
  )
  assert.equal(projects.items[0].text, 'Main contractor for 62,000 m² of cleanroom space.')
  // A strip with nothing behind it: no items, the chips still recorded.
  const only = sectionItems(el('<section><h2>Tags</h2><div><a href="#"><b>A</b></a><a href="#"><b>B</b></a><a href="#"><b>C</b></a></div></section>'))
  assert.deepEqual(only, { items: [], filters: ['A', 'B', 'C'], elements: [] })
  // Seven labels are a list, not a strip; a card row keeps `filters` empty.
  const seven = sectionItems(el(`<section><ul>${'ABCDEFG'.split('').map((x) => `<li><a href="#"><b>${x}</b></a></li>`).join('')}</ul></section>`))
  assert.equal(seven.items.length, 7)
  assert.deepEqual(seven.filters, [])
  // Not strips: a stat's figure + caption (nothing interactive), a form's two buttons (a pair),
  // a table's header row (cells), slide numbers (no letters).
  const stat = sectionItems(el('<section><div><div><div><span>380+</span></div><div><span>Projects delivered</span></div></div><div><div><span>22 years</span></div><div><span>Industry experience</span></div></div></div></section>'))
  assert.deepEqual(stat.filters, [])
  assert.equal(stat.items.length, 2)
  assert.deepEqual(sectionItems(el('<section><form><input><input><div><button><span>Send request</span></button><button type="reset"><span>Clear form</span></button></div></form></section>')).filters, [])
  assert.deepEqual(sectionItems(el('<section><table><tr><th><b>Metric</b></th><th><b>2024</b></th><th><b>2025</b></th><th><b>Change</b></th></tr></table></section>')).filters, [])
  assert.deepEqual(sectionItems(el('<section><div><a href="#"><b>01</b></a><a href="#"><b>02</b></a><a href="#"><b>03</b></a></div></section>')).filters, [])
})

test('contact facts: email and phone are found as words, the address follows its label', () => {
  const doc = new JSDOM('<body><main><div><div>Head office</div><div>Vorsino Park, plot 12</div><div>Kaluga Region, 249020</div></div><div><div>Sales</div><div>sales@example.test</div></div><span>8 800 550-67-89</span></main></body>').window.document
  assert.deepEqual(contactFacts(doc), { email: 'sales@example.test', phone: '8 800 550-67-89', address: 'Vorsino Park, plot 12, Kaluga Region, 249020', hours: null })
})

test('names → views, paths, relative refs, clamp() at a width', () => {
  assert.equal(viewForName('Home.html'), 'front-page')
  assert.equal(viewForName('News'), 'home')
  assert.equal(viewForName('Article'), 'single')
  assert.equal(viewForName('Search'), 'search')
  assert.equal(viewForName('404'), '404')
  assert.equal(viewForName('Contact'), 'page-contact')
  assert.equal(viewForName('Style guide'), 'page-style-guide')
  assert.equal(viewForName('Investor relations'), 'page')
  assert.equal(viewForName('Slide'), 'page-slide')
  assert.equal(baseName('RU/Home_ru.html', 'ru'), 'Home')
  assert.equal(pathFor('front-page', 'Home', 'ru', 'en'), '/ru')
  assert.equal(pathFor('page', 'Investor relations', 'en', 'en'), '/investor-relations')
  assert.equal(pathFor('page', 'About', 'ru', 'en'), '/ru/about')
  assert.equal(resolveRelative('../img/x.png', 'RU/Home_ru.html'), 'img/x.png')
  assert.equal(resolveRelative('./About.html', 'Home.html'), 'About.html')
  assert.equal(resolveRelative('https://x.test/a', 'Home.html'), null)
  assert.equal(resolveAtWidth('clamp(38px,5.4vw,64px)', 1440), '64px')
  assert.equal(resolveAtWidth('clamp(38px,5.4vw,64px)', 390), '38px')
  assert.equal(resolveAtWidth('clamp(38px,5.4vw,64px)', 1000), '54px')
  assert.equal(resolveAtWidth('var(--x)', 1440), null)
})

// ── the CLI, no browser ──────────────────────────────────────────────────────

test('from-html canvas (no render): the full pack, EN + RU, validates as a website scope', async () => {
  const out = join(tmp('fh-cv-'), 'pack')
  const { stderr: ingest } = await run('node', [CLI, FIXTURE, '--out', out, '--scope', 'website'], { cwd: SKILL })
  addPassingDomBrowserFixture(out)
  const { stderr, stdout } = await run('node', [join(SKILL, 'scripts/ingest/spec-pack.mjs'), '--validate', out], { cwd: SKILL })
  assert.match(ingest, /shape C \(Claude Design canvas export\)/)
  assert.match(`${stdout}${stderr}`, /spec-pack OK — 3 pages/)
  for (const f of ['page-map', 'content', 'sections', 'menus', 'redirects', 'design-contract', 'content-contract', 'reference', 'provenance', 'source-fonts'])
    assert.ok(existsSync(join(out, `${f}.json`)), `${f}.json`)
  assert.ok(existsSync(join(out, 'design-spec.md')))

  const map = readJson(join(out, 'page-map.json'))
  assert.deepEqual(map.locales, ['en', 'ru'])
  assert.equal(map.defaultLocale, 'en')
  assert.equal(map.template.name, 'northgate-industrial')
  assert.deepEqual(map.theme.palette.light, { primary: '#14483A', secondary: '#DA5A2A', body_bg: '#F5F3EE', text: '#14171A' })
  assert.deepEqual(map.theme.palette.dark, { primary: '#7FBFA6', secondary: '#DA5A2A', body_bg: '#101214', text: '#ECEAE4' })
  assert.deepEqual(map.theme.fonts, { body: 'Archivo', heading: 'Newsreader' })
  const byFile = Object.fromEntries(map.pages.map((p) => [p.file, p]))
  assert.equal(byFile['Home.html'].view, 'front-page')
  assert.equal(byFile['Home.html'].path, '/')
  assert.deepEqual(byFile['Home.html'].translations, { ru: 'RU/Home_ru.html' })
  assert.equal(byFile['RU/Home_ru.html'].translationOf, 'Home.html')
  assert.equal(byFile['RU/Home_ru.html'].path, '/ru')
  assert.equal(byFile['About.html'].view, 'page')
  assert.deepEqual(byFile['About.html'].translations, {}, 'About has no RU counterpart in the fixture')
  assert.equal(map.scope.mode, 'website')

  const content = readJson(join(out, 'content.json'))
  // The chrome's wordmark is shorter than the <title> ("NORTHGATE" under "Northgate Industrial —
  // About"): the site name is what the visitor reads on every page, in the title's own casing.
  assert.equal(content.site.name, 'Northgate')
  assert.equal(content.site.tagline, 'Industrial infrastructure')
  const homeEn = content.pages.find((p) => p.file === 'Home.html')
  assert.equal(homeEn.contentKind, 'sections')
  assert.deepEqual(
    homeEn.content.map((e) => [e.kind, e.sectionType]),
    [
      ['section', 'hero'],
      ['section', 'services'],
      ['section', 'cta'],
      ['section', 'news']
    ]
  )
  assert.match(homeEn.content[0].html, /Building the ground for/)
  assert.match(homeEn.content[0].html, /<img src="\/wp-content\/uploads\/hero\.png" alt="Site photo"/, 'image-slot became an img with the uploads path')
  assert.match(homeEn.content[0].html, /href="\/about"/, 'the navigating handler became a WordPress path')
  const homeRuPage = content.pages.find((p) => p.file === 'RU/Home_ru.html')
  assert.equal(homeRuPage.locale, 'ru')
  assert.equal(homeRuPage.slug, 'ru')
  assert.match(homeRuPage.content[0].html, /Строим основание для/)
  const about = content.pages.find((p) => p.file === 'About.html')
  assert.equal(about.contentKind, 'blocks')
  assert.match(about.content, /Download the deck \(PDF\)/)
  assert.match(about.content, /href="\/wp-content\/uploads\/deck\.pdf"/)
  assert.deepEqual(content.assets, [{ file: 'deck.pdf', original: 'decks/deck.pdf', kind: 'document' }])
  assert.deepEqual(
    content.images.map((i) => i.original).sort(),
    ['img/hero.png', 'img/news-1.png', 'img/news-2.png']
  )
  assert.deepEqual(content.unresolvedLinks, ['./About_ru.html', './RU/About_ru.html'], 'the RU About page does not exist; its links (RU nav, EN language switch) are listed, not guessed')
  assert.deepEqual(content.posts, [], 'cards are read on a listing page (home/category view); the front page has none')
  assert.deepEqual(content.categories, [])

  const sections = readJson(join(out, 'sections.json'))
  assert.deepEqual(sections.acm, [])
  const svc = sections.custom.find((s) => s.id === 'home-en-2')
  assert.equal(svc.sectionType, 'services')
  assert.deepEqual([svc.fields.eyebrow, svc.fields.heading], ['What we do', 'Two core services'])
  assert.deepEqual(
    svc.items.map((i) => i.title),
    ['Infrastructure', 'Buildings']
  )
  assert.deepEqual(svc.pages, [{ file: 'Home.html', wpPath: '/' }])
  assert.deepEqual(
    sections.custom.filter((s) => /^footnav-/.test(s.position)),
    [],
    'the Company column has a heading, so it is the footer-company menu and not a synthesised footnav block as well'
  )

  const menus = readJson(join(out, 'menus.json'))
  const tracy = menus.menus.find((m) => m.menutype === 'tracy')
  assert.deepEqual(
    tracy.items.map((i) => [i.label, i.url, i.page]),
    [
      ['Home', '/', 'Home.html'],
      ['About', '/about', 'About.html']
    ]
  )
  const tracyRu = menus.menus.find((m) => m.menutype === 'tracy-ru')
  assert.deepEqual(
    tracyRu.items.map((i) => [i.label, i.url]),
    [['Главная', '/ru']],
    'the RU About link points at a page that is not in the export, so it is not a menu item'
  )
  assert.deepEqual(
    menus.menus.filter((m) => m.region === 'footer').map((m) => [m.menutype, m.locale, m.title]),
    [
      ['footer-company', 'en', 'Company'],
      ['footer-company-ru', 'ru', 'Компания (RU)']
    ],
    'the RU column takes the EN menutype of its column, not a slug of its Russian heading'
  )

  const design = readJson(join(out, 'design-contract.json'))
  assert.deepEqual(design.pending, [])
  assert.ok(['typography', 'color', 'layout', 'component'].every((c) => design.rules.some((r) => r.category === c)))
  assert.equal(design.tokens['desktop-light']['--text-h1'], '64px')
  assert.equal(design.tokens['mobile-dark']['--color-bg'], '#101214')
  assert.equal(design.rules.find((r) => r.id === 'primary-button').styles['desktop-light'].backgroundColor, '#14483A')

  const contract = readJson(join(out, 'content-contract.json'))
  assert.equal(contract.mode, 'demo')
  assert.equal(contract.facts['site.name'].value, 'Northgate')
  assert.equal(contract.surfaces.length, 3)

  const prov = readJson(join(out, 'provenance.json'))
  assert.equal(prov.adapter, 'from-html')
  assert.equal(prov.source.kind, 'canvas-export')
  assert.deepEqual(prov.source.dataLocales.sort(), ['en', 'ru'])
  assert.deepEqual(prov.counts.pagesByLocale, { en: 2, ru: 1 })
  assert.equal(prov.counts.rendered, 0)
  const codes = prov.gaps.map((g) => g.code)
  assert.ok(codes.includes('unsupported-literals'), 'COMPUTED = someCall() is reported')
  assert.ok(codes.includes('documents'))
  assert.ok(codes.includes('dead-chrome-links'))
  assert.ok(prov.gaps.find((g) => g.code === 'dead-chrome-links').items.includes('header:More'))

  const ref = readJson(join(out, 'reference.json'))
  assert.equal(ref.kind, 'html')
  for (const r of ref.pages) {
    assert.ok(existsSync(join(out, r.path)), r.path)
    assert.ok(existsSync(join(out, r.static)), r.static)
  }
  assert.ok(existsSync(join(out, 'reference', 'support.js')), 'the runtime travels with the reference pages')
  assert.ok(existsSync(join(out, 'assets', 'img', 'hero.png')))
  assert.doesNotMatch(readFileSync(join(out, 'reference/static/RU/Home_ru.html'), 'utf8'), /\{\{/)
  // the design-spec has no open slot
  assert.doesNotMatch(readFileSync(join(out, 'design-spec.md'), 'utf8'), /`TODO`/)
})

test('from-html canvas: template scope reports the views the small export lacks, and --strict makes that exit 1', async () => {
  const out = join(tmp('fh-cvt-'), 'pack')
  const { stderr } = await run('node', [CLI, FIXTURE, '--out', out], { cwd: SKILL })
  assert.match(stderr, /spec-pack INVALID/)
  assert.match(stderr, /required view "single"/)
  await assert.rejects(run('node', [CLI, FIXTURE, '--out', out, '--force', '--strict'], { cwd: SKILL }), (e) => e.code === 1)
})

test('from-html plain folder: the raw-min fixture now gets content, sections and menus too', async () => {
  const out = join(tmp('fh-raw2-'), 'pack')
  await run('node', [CLI, join(here, 'fixtures', 'raw-min'), '--out', out], { cwd: SKILL })
  const content = readJson(join(out, 'content.json'))
  assert.ok(content.pages.length >= 1)
  assert.ok(existsSync(join(out, 'sections.json')))
  assert.ok(existsSync(join(out, 'menus.json')))
  assert.ok(existsSync(join(out, 'redirects.json')))
  const prov = readJson(join(out, 'provenance.json'))
  assert.equal(prov.source.kind, 'html-folder')
})

// ── the CLI, with a browser ──────────────────────────────────────────────────

let chromiumOk = false
test.before(async () => {
  try {
    const { chromium } = await import('playwright')
    const b = await chromium.launch()
    await b.close()
    chromiumOk = true
  } catch {
    chromiumOk = false
  }
})

test('from-html canvas --render: the filled DOM replaces the static one, chrome links are probed, styles are measured', async (t) => {
  if (!chromiumOk) return t.skip('no Chromium (npx playwright install chromium)')
  const out = join(tmp('fh-cvr-'), 'pack')
  const source = join(tmp('fh-cvr-source-'), 'fixture')
  cpSync(FIXTURE, source, { recursive: true })
  for (const file of ['Home.html', 'About.html', 'RU/Home_ru.html']) {
    const path = join(source, file)
    const html = readFileSync(path, 'utf8').replaceAll('Archivo', 'Arial').replaceAll('Newsreader', 'Arial')
    writeFileSync(path, html)
  }
  const { stderr } = await run('node', [CLI, source, '--out', out, '--scope', 'website', '--render', '--strict'], { cwd: SKILL, timeout: 120000 })
  assert.match(stderr, /spec-pack OK — 3 pages/)
  assert.match(stderr, /probed \d+ chrome link\(s\), \d+ navigate/)
  const ref = readJson(join(out, 'reference.json'))
  const homeRef = ref.pages.find((r) => r.page === 'Home.html')
  assert.equal(homeRef.path, 'reference/rendered/home--1440-light.html')
  assert.deepEqual(Object.keys(homeRef.shots).sort(), ['1440-dark', '1440-light', '390-dark', '390-light'])
  for (const shot of Object.values(homeRef.shots)) assert.ok(existsSync(join(out, shot)), shot)
  const snapshot = readFileSync(join(out, homeRef.path), 'utf8')
  assert.match(snapshot, /Building the ground for/)
  assert.doesNotMatch(snapshot, /<x-dc/)
  const map = readJson(join(out, 'page-map.json'))
  assert.ok(map.pages.every((p) => p.source.rendered === true))
  const menus = readJson(join(out, 'menus.json'))
  const tracy = menus.menus.find((m) => m.menutype === 'tracy')
  assert.deepEqual(
    tracy.items.map((i) => [i.label, i.url]),
    [
      ['Home', '/'],
      ['About', '/about']
    ],
    'href="#" links resolved by probing their handlers'
  )
  const design = readJson(join(out, 'design-contract.json'))
  assert.equal(design.rules.find((r) => r.id === 'body-type').styles['desktop-light'].fontFamily, 'Arial, system-ui, sans-serif', 'computed, not declared')
  assert.equal(design.rules.find((r) => r.id === 'body-colors').styles['desktop-dark'].backgroundColor, 'rgb(16, 18, 20)')
  assert.equal(design.rules.find((r) => r.id === 'link-color').styles['desktop-light'].color, '#14483A', 'declared colours beat sampled ones')
  assert.equal(design.rules.find((r) => r.id === 'section-rhythm').styles['desktop-light'].paddingTop, '88px')
  assert.match(design.pages[0].url, /^http:\/\/127\.0\.0\.1:\d+\/About\.html$/)
  const prov = readJson(join(out, 'provenance.json'))
  assert.equal(prov.counts.rendered, 3)
  assert.ok(prov.source.serve.origin)
  const fontReport = readJson(join(out, 'source-fonts.json'))
  assert.equal(fontReport.browser.pages.length, map.pages.length * 2)
  assert.equal(new Set(fontReport.browser.pages.map((p) => `${p.route}@${p.width}`)).size, map.pages.length * 2)
})

test('sectionFields: an eyebrow whose uppercase style sits on a pill wrapper, not on the text span', async () => {
  const { JSDOM } = await import('jsdom')
  const { sectionFields } = await import('../lib/html-content.mjs')
  const doc = new JSDOM(
    '<section><div style="display:inline-flex; letter-spacing: 0.14em; text-transform: uppercase"><span style="width:6px"></span><span class="sc-interp">Established 2004</span></div><h1>Building the groundwork</h1><p>Design-build main contractor for industrial parks.</p></section>'
  ).window.document
  assert.equal(sectionFields(doc.querySelector('section')).eyebrow, 'Established 2004')
})

test('postCategories: the eyebrows of default-locale posts name top-level categories beside news; a secondary-locale post takes its pair\'s and lends its title', async () => {
  const { postCategories } = await import('../ingest/from-html.mjs')
  const { listingCards } = await import('../lib/html-content.mjs')
  const doc = new JSDOM(`<main><article><div><img src="a.png"></div><div><span>Featured · Disclosure</span></div><h2><a href="#">Tender won</a></h2><p>Contract signed.</p><div>12.08.2026</div></article>
    <article><div>Engineering</div><h3>Foundation mistakes</h3><p>Notes.</p><div>28 Jul 2026</div></article><article><h3>Plain card</h3><p>No eyebrow.</p></article></main>`).window.document
  const cards = listingCards(doc)
  assert.deepEqual(cards.map((c) => [c.title, c.eyebrow, c.meta]), [['Tender won', 'Featured · Disclosure', '12.08.2026'], ['Foundation mistakes', 'Engineering', '28 Jul 2026'], ['Plain card', null, null]])
  const posts = [
    { slug: 'tender-won', locale: 'en', categoryName: 'Disclosure' },
    { slug: 'foundation-mistakes', locale: 'en', categoryName: 'Engineering' },
    { slug: 'plain', locale: 'en', categoryName: null },
    { slug: 'tender-ru', locale: 'ru', categoryName: 'Раскрытие' },
    { slug: 'mistakes-ru', locale: 'ru', categoryName: 'Инженерия' },
    { slug: 'plain-ru', locale: 'ru', categoryName: null }
  ]
  const categories = postCategories(posts, { locales: ['en', 'ru'], defaultLocale: 'en' })
  assert.deepEqual(posts.map((p) => [p.slug, p.category]), [['tender-won', 'disclosure'], ['foundation-mistakes', 'engineering'], ['plain', 'news'], ['tender-ru', 'disclosure'], ['mistakes-ru', 'engineering'], ['plain-ru', 'news']])
  assert.deepEqual(
    categories.map((c) => [c.id, c.title, c.parent, c.postCount, c.titles ?? null]),
    [
      ['news', 'News', null, 2, null],
      ['disclosure', 'Disclosure', null, 2, { ru: 'Раскрытие' }],
      ['engineering', 'Engineering', null, 2, { ru: 'Инженерия' }]
    ]
  )
  assert.ok(!posts.some((p) => 'categoryName' in p))
  assert.deepEqual(postCategories([], {}), [])
})

test('sectionItems: a stat caption with a year in it is the item text, not its meta; a date or a "Factory · 2025" line is', () => {
  const doc = new JSDOM(`<section><div>
    <div><div style="font-size:38px">380+</div><div>Projects delivered</div></div>
    <div><div style="font-size:38px">22 years</div><div>Industry experience</div></div>
    <div><div style="font-size:38px">0</div><div>Serious incidents in 2025</div></div>
  </div></section>`).window.document
  const { items } = sectionItems(doc.querySelector('section'))
  assert.deepEqual(items.map((i) => [i.title, i.text, i.meta]), [
    ['380+', 'Projects delivered', null],
    ['22 years', 'Industry experience', null],
    ['0', 'Serious incidents in 2025', null]
  ])
  const cards = new JSDOM(`<section><div>
    <article><h3>Elektra plant</h3><p>Main contractor for the plant.</p><div>Factory · 2025</div></article>
    <article><h3>Vorsino phase 3</h3><p>48 ha of earthworks.</p><div>Infrastructure · 2024</div></article>
    <article><h3>Deck</h3><p>The corporate deck.</p><div>PDF · 14 KB</div></article>
  </div></section>`).window.document
  assert.deepEqual(sectionItems(cards.querySelector('section')).items.map((i) => i.meta), ['Factory · 2025', 'Infrastructure · 2024', 'PDF · 14 KB'])
})

test('sectionItems: a team card\'s middle line — the role — is the item meta; a two-line row has none', () => {
  const doc = new JSDOM(`<section><h2>Leadership</h2><div>
    <div><div><img src="/wp-content/uploads/a.png" alt=""></div><div>Andrey Kulagin</div><div>Chief Executive Officer</div><div>With the company since 2007, started as a site manager.</div></div>
    <div><div><img src="/wp-content/uploads/b.png" alt=""></div><div>Sergey Trofimov</div><div>Lead Project Engineer</div><div>Owns structural design and the technical solution on every project.</div></div>
    <div><div><img src="/wp-content/uploads/c.png" alt=""></div><div>Olga Barsukova</div><div>Production Director</div><div>The Vorsino plant and delivery logistics to site.</div></div>
  </div></section>`).window.document
  assert.deepEqual(
    sectionItems(doc.querySelector('section')).items.map((i) => [i.title, i.meta, i.text]),
    [
      ['Andrey Kulagin', 'Chief Executive Officer', 'With the company since 2007, started as a site manager.'],
      ['Sergey Trofimov', 'Lead Project Engineer', 'Owns structural design and the technical solution on every project.'],
      ['Olga Barsukova', 'Production Director', 'The Vorsino plant and delivery logistics to site.']
    ]
  )
  const rows = new JSDOM(`<section><h2>Where we work</h2><div>
    <div><span>Vorsino, Kaluga Region</span><span>Head office, steel plant</span></div>
    <div><span>Yekaterinburg</span><span>Urals division</span></div>
    <div><span>Kazan</span><span>Volga division</span></div>
  </div></section>`).window.document
  assert.deepEqual(sectionItems(rows.querySelector('section')).items.map((i) => [i.title, i.meta, i.text]), [
    ['Vorsino, Kaluga Region', null, 'Head office, steel plant'],
    ['Yekaterinburg', null, 'Urals division'],
    ['Kazan', null, 'Volga division']
  ])
})

test('extractMain: a link inside a card is the card\'s, not a section CTA; a cta band\'s own buttons still are', () => {
  const doc = new JSDOM(`<body><main>
    <section><div><h2>Selected projects</h2><div><span>All</span><span>Factories</span><span>Infrastructure</span><a href="/projects">All projects →</a></div></div>
      <div>
        <article><img src="/wp-content/uploads/1.png" alt=""><div>Factory · 2025</div><h3>Elektra plant</h3><p>Main contractor for the plant.</p><a href="/projects/elektra">Read the case study →</a></article>
        <article><img src="/wp-content/uploads/2.png" alt=""><a href="/projects/vorsino"><div>Infrastructure · 2024</div><h3>Vorsino phase 3</h3><p>48 ha of earthworks.</p></a></article>
        <article><img src="/wp-content/uploads/3.png" alt=""><a href="/projects/obninsk"><div>M&amp;E · 2024</div><h3>Obninsk-2</h3><p>Installation and energisation.</p></a></article>
      </div></section>
    <section><h2>Need a budget estimate?</h2><p>Send the outline.</p><div><a href="/contact">Request a quote</a><a href="/services">Services</a></div></section>
  </main></body>`).window.document
  const [projects, band] = extractMain(doc, { idPrefix: 'p-en', view: 'page' }).sections
  assert.deepEqual(projects.fields.ctas, [{ text: 'All projects →', href: '/projects' }])
  assert.deepEqual(projects.items.map((i) => i.href), ['/projects/elektra', '/projects/vorsino', '/projects/obninsk'])
  assert.equal(band.type, 'cta')
  assert.deepEqual(band.fields.ctas.map((c) => c.text), ['Request a quote', 'Services'])
})

test('detectSectionType: a table of rows with three or more cells is not stats; four links under a heading are not a cta band', () => {
  const table = new JSDOM(`<section><h2>Key figures</h2><p>Consolidated IFRS figures, RUB bn.</p><div>
    <div><div>Metric</div><div>2024</div><div>2025</div><div>Change</div></div>
    <div><div>Revenue</div><div>31.2</div><div>38.7</div><div>+24%</div></div>
    <div><div>EBITDA</div><div>4.1</div><div>5.6</div><div>+37%</div></div>
    <div><div>Net profit</div><div>2.3</div><div>3.2</div><div>+39%</div></div>
  </div></section>`).window.document
  assert.equal(detectSectionType(table.querySelector('section')), null, 'a table keeps every column only as core/html')
  // Three cells — name, description, figure — are a pricing row, and rows are items of a text section.
  const pricing = new JSDOM(`<section><h2>Indicative pricing</h2><p>Ranges for early budgeting.</p><div>
    <div><div><div>Class A warehouse</div><div>Frame, envelope, floors</div></div><div>from ₽48,000/m²</div></div>
    <div><div><div>Production building</div><div>With crane beams</div></div><div>from ₽62,000/m²</div></div>
    <div><div><div>Steel frame only</div><div>Fabrication, erection</div></div><div>from ₽145,000/t</div></div>
  </div></section>`).window.document
  assert.equal(detectSectionType(pricing.querySelector('section')), 'text')
  const stats = new JSDOM(`<section><div>
    <div><div>380+</div><div>Projects delivered</div></div><div><div>22 years</div><div>Experience</div></div><div><div>0</div><div>Serious incidents</div></div>
  </div></section>`).window.document
  assert.equal(detectSectionType(stats.querySelector('section')), 'stats')
  const links = new JSDOM(`<section><div><h2>Corporate governance</h2><div><a href="#">Charter and internal documents</a><a href="#">Board composition</a><a href="#">Dividend policy</a><a href="#">Anti-corruption policy</a></div></div></section>`).window.document
  assert.equal(detectSectionType(links.querySelector('section')), null, 'a list of links renders through the links shape')
  const band = new JSDOM(`<section><h2>Price your facility</h2><p>Send the outline.</p><a href="/contact">Get a quote</a><a href="/services">Services</a></section>`).window.document
  assert.equal(detectSectionType(band.querySelector('section')), 'cta')
})

test('extractMain: on the contact page the head-office card moves from the form column into the hero, as its items', () => {
  const doc = new JSDOM(`<body><main>
    <section id="sec-contact"><h1>Contact</h1><p>Request a quote or book a site survey.</p></section>
    <div style="display:grid"><div>
        <div><span>i</span><p>Fields marked * are required.</p></div>
        <div><label>Full name *</label><input type="text" placeholder="Ivan Petrov"></div>
        <div><label>Email *</label><input type="email" placeholder="you@company.ru"></div>
        <button>Send request</button>
      </div><div style="display:flex">
        <div style="background:#14171a"><div><span class="sc-interp">Head office</span></div><div><span class="sc-interp">Vorsino Industrial Park, plot 12</span><br><span class="sc-interp">Kaluga Region, 249020</span></div>
          <div><div><span>Hotline</span><span>8 800 550-67-89</span></div><div><span><span class="sc-interp">Sales</span></span><span>sales@northgate-ind.ru</span></div><div><span>Office hours</span><span><span class="sc-interp">Mon–Fri, 9:00–18:00 (MSK)</span></span></div></div></div>
        <div><img src="/wp-content/uploads/map.png" alt="Map"></div>
        <div><div>Social profiles</div><p>Project progress and open roles.</p><div>
          <a href="#"><span>Telegram</span><span>@northgate_ind</span><span>Site progress and tender announcements</span><span>t.me/northgate_ind</span></a>
          <a href="#"><span>VK</span><span>vk.com/northgate.ind</span><span>Company news and life on site</span><span>vk.com/northgate.ind</span></a>
          <a href="#"><span>LinkedIn</span><span>/company/northgate-industrial</span><span>Corporate updates in English</span><span>linkedin.com/company/northgate-industrial</span></a>
        </div></div>
      </div></div>
  </main></body>`).window.document
  const [hero, form] = extractMain(doc, { idPrefix: 'contact-en', view: 'page-contact' }).sections
  assert.equal(hero.type, 'contact')
  assert.deepEqual(hero.items.map((i) => [i.title, i.text, i.meta]), [
    ['Head office', 'Vorsino Industrial Park, plot 12 Kaluga Region, 249020', null],
    ['Hotline', '8 800 550-67-89', null],
    ['Sales', 'sales@northgate-ind.ru', null],
    ['Office hours', 'Mon–Fri, 9:00–18:00 (MSK)', null]
  ])
  assert.match(hero.html, /Head office/)
  assert.doesNotMatch(form.html, /Head office|Vorsino Industrial Park/)
  assert.equal(form.type, 'form')
  assert.deepEqual(form.items.map((i) => i.title), ['Telegram', 'VK', 'LinkedIn'])
  assert.deepEqual(form.images.map((i) => i.file), ['map.png'])
})

// A process list under a heading that names a project or a service ("How we run a project") is
// the numbered-card shape, not what its heading says: read as `projects` the ordinal took the
// picture card's title slot, the title the text slot, the body the meta slot (full-2, 15/09).
test('detectSectionType: numbered rows are services whatever the heading says; a figure row is still stats and a bare number is not an ordinal', () => {
  const rows = (nums) => `<section><div><h2>How we run a project</h2>
    ${nums.map((n, i) => `<div><div>${n}</div><div><div>Step ${i + 1} title</div><div>What happens in step ${i + 1}, at some length.</div></div></div>`).join('')}
  </div></section>`
  const steps = new JSDOM(rows(['01', '02', '03', '04'])).window.document.querySelector('section')
  assert.equal(detectSectionType(steps), 'services')
  assert.deepEqual(sectionItems(steps).items.map((i) => [i.meta, i.title, i.text])[1], ['02', 'Step 2 title', 'What happens in step 2, at some length.'])
  // Dotted and worded ordinals count too; a run that does not start at 1 or skips is not a count.
  assert.equal(detectSectionType(new JSDOM(rows(['1.', '2.', '3.'])).window.document.querySelector('section')), 'services')
  assert.equal(detectSectionType(new JSDOM(rows(['Step 1', 'Step 2', 'Step 3'])).window.document.querySelector('section')), 'services')
  assert.equal(detectSectionType(new JSDOM(rows(['02', '03', '04'])).window.document.querySelector('section')), 'projects')
  // Figures with captions: stats, and the bare "19" stays the item title.
  const stats = new JSDOM(`<section><div>
    <div><div style="font-size:38px">640</div><div>People on payroll</div></div>
    <div><div style="font-size:38px">34</div><div>Engineers</div></div>
    <div><div style="font-size:38px">19</div><div>Open roles</div></div>
  </div></section>`).window.document.querySelector('section')
  assert.equal(detectSectionType(stats), 'stats')
  assert.deepEqual(sectionItems(stats).items.map((i) => [i.title, i.text, i.meta])[2], ['19', 'Open roles', null])
})

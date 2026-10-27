// #28 (JA Vega M4d): two source fields in one line, a template for a post, the Joomla authors and
// an archive's per-page count — each through the seeder and the from-joomla adapter.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, mkdirSync, symlinkSync, chmodSync, existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import {
  renderAcm,
  composedFields,
  postAuthors,
  declaredAuthors,
  ownerOf,
  buildArchiveContent,
  archivePerPage,
  postTemplate,
  singleViewRules,
  postWithRoute,
  buildPageContent,
  parseArgs,
  runSeed,
  AVATAR_PLUGIN,
  installAvatarPlugin,
  checkAuthorAvatars
} from '../seed.mjs'
import { parseBlocks, findAll } from '../lib/block-fill.mjs'
import { archivePaging, authors as joomlaAuthors } from '../lib/joomla-inventory.mjs'
import { checkArticlePosts } from '../ingest/from-joomla.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { fakeSite } from './lib/fake-site.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, 'fixtures', 'joomla-min')
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

// ── item 4: two fields composed into one editable block ─────────────────────────

const LINE = '<!-- wp:paragraph {"metadata":{"role":"content","name":"clients.desc"}} -->\n<p>Placeholder line</p>\n<!-- /wp:paragraph -->'
const lineMap = (fields) => ({ types: { 'clients:style-1': { pattern: 'demo/line', fields } } })
const render = (fields, values, pattern = LINE) =>
  renderAcm({ id: '136', type: 'clients', style: 'style-1', fields: values, items: [] }, lineMap(fields), { 'demo/line': pattern }, () => null)
const DESC = {
  'short-desc-accent': { block: 'core/paragraph', path: 'clients.desc', attr: 'content', part: 1, wrap: 'span', wrapClass: 'jv-accent' },
  'short-desc': { block: 'core/paragraph', path: 'clients.desc', attr: 'content', part: 2 }
}

test('#28 item 4: two declared fields land in one paragraph, in part order, the accent in its span', () => {
  // Declared tail first: the order is the parts', not the map's.
  const { markup } = render({ 'short-desc': DESC['short-desc'], 'short-desc-accent': DESC['short-desc-accent'] }, { 'short-desc': 'drive success through  trusted collaboration', 'short-desc-accent': 'Our partners' })
  const paragraphs = findAll(parseBlocks(markup), (b) => b.name === 'core/paragraph')
  assert.equal(paragraphs.length, 1, markup)
  assert.equal(paragraphs[0].attrs.metadata.role, 'content', 'the block stays editable')
  assert.match(markup, /<p><span class="jv-accent">Our partners<\/span> drive success through trusted collaboration<\/p>/)
})

test('#28 item 4: a field value is text — markup in it is escaped, never injected', () => {
  const { markup } = render(DESC, { 'short-desc-accent': '<b>20K+</b> USER', 'short-desc': 'HAVE SIGNED UP & grow' })
  assert.match(markup, /<span class="jv-accent">&lt;b&gt;20K\+&lt;\/b&gt; USER<\/span> HAVE SIGNED UP &amp; grow/)
  assert.doesNotMatch(markup, /<b>/)
})

test('#28 item 4: an empty part is left out with its wrap; every part empty removes the block', () => {
  const tailOnly = render(DESC, { 'short-desc-accent': '  ', 'short-desc': 'drive success' }).markup
  assert.match(tailOnly, /<p>drive success<\/p>/)
  assert.doesNotMatch(tailOnly, /<span/)
  const accentOnly = render(DESC, { 'short-desc-accent': 'Our partners', 'short-desc': null }).markup
  assert.match(accentOnly, /<p><span class="jv-accent">Our partners<\/span><\/p>/)
  const none = render(DESC, { 'short-desc-accent': '', 'short-desc': '' }).markup
  assert.equal(findAll(parseBlocks(none), (b) => b.name === 'core/paragraph').length, 0)
})

test('#28 item 4: repeated parts compose per item', () => {
  const pattern =
    '<!-- wp:group {"metadata":{"name":"hero.item.1"}} -->\n<div class="wp-block-group">\n<!-- wp:paragraph {"metadata":{"role":"content","name":"hero.avatar-title.1"}} -->\n<p>x</p>\n<!-- /wp:paragraph -->\n</div>\n<!-- /wp:group -->'
  const map = {
    types: {
      'hero:style-1': {
        pattern: 'demo/hero',
        item: 'hero.item.<n>',
        fields: {
          'avatar-title-accent': { block: 'core/paragraph', path: 'hero.avatar-title.<n>', attr: 'content', repeat: 'items', part: 1, wrap: 'em' },
          'avatar-title': { block: 'core/paragraph', path: 'hero.avatar-title.<n>', attr: 'content', repeat: 'items', part: 2 }
        }
      }
    }
  }
  const items = [
    { 'avatar-title-accent': '2K+', 'avatar-title': 'happy clients' },
    { 'avatar-title-accent': '', 'avatar-title': 'no accent here' }
  ]
  const { markup } = renderAcm({ id: '111', type: 'hero', style: 'style-1', fields: {}, items }, map, { 'demo/hero': pattern }, () => null)
  assert.match(markup, /<p><em>2K\+<\/em> happy clients<\/p>/)
  assert.match(markup, /<p>no accent here<\/p>/)
})

test('#28 item 4: a map that would lose a field is an error, not a silent overwrite', () => {
  const content = (extra = {}) => ({ block: 'core/paragraph', path: 'clients.desc', attr: 'content', ...extra })
  const throwsWith = (fields, re) => assert.throws(() => composedFields({ fields }, 'clients:style-1'), re)
  throwsWith({ a: content(), b: content() }, /write the same block's text; declare `part`/)
  throwsWith({ a: content({ part: 1 }), b: content() }, /every text field drawn into it declares `part`/)
  throwsWith({ a: content({ part: 1 }), b: content({ part: 1 }) }, /the same part/)
  throwsWith({ a: content({ part: 0 }) }, /positive integer/)
  throwsWith({ a: content({ part: 1, wrap: 'div' }) }, /wrap must be one of/)
  throwsWith({ a: content({ part: 1, wrap: 'span', wrapClass: 'x" onclick="y' }) }, /class tokens/)
  throwsWith({ a: content({ wrap: 'span' }) }, /`wrap` needs a `part`/)
  throwsWith({ a: { block: 'core/button', path: 'clients.desc', attr: 'url', part: 1 } }, /attr url cannot/)
  assert.throws(() => render({ a: content(), b: content() }, { a: 'x', b: 'y' }), /patterns map clients:style-1: block clients.desc/)
})

test('#28 item 4: a map without parts fills as before', () => {
  const { markup } = render({ 'short-desc': { block: 'core/paragraph', path: 'clients.desc', attr: 'content' } }, { 'short-desc': 'Only <one> field' })
  assert.match(markup, /<p>Only &lt;one&gt; field<\/p>/)
  assert.equal(composedFields(lineMap({ a: { block: 'core/image', path: 'x', attr: 'src' }, b: { block: 'core/image', path: 'x', attr: 'alt' } }).types['clients:style-1']).size, 0, 'a src and its alt on one block are not text parts')
})

// ── a whole seed against the fake site ───────────────────────────────────────────

const CARDS_QUERY = '<!-- wp:query {"queryId":1,"query":{"perPage":6,"inherit":true},"className":"tracy-query"} -->'

function seedFixture({ posts, authors, archives = [], categories = [] }) {
  const root = tmp('i28-seed-')
  const spec = join(root, 'spec')
  mkdirSync(spec, { recursive: true })
  const home = { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', parent: null, status: 'publish', content: '<!-- wp:paragraph --><p>Home.</p><!-- /wp:paragraph -->', meta: {}, images: [] }
  const files = {
    'page-map.json': { pages: [home, { file: 'single.html', path: '/single', title: 'Single', view: 'single' }, ...archives.map((a) => ({ file: a.file, path: a.path, title: a.title, view: a.view }))] },
    'content.json': { site: { name: 'Fixture' }, pages: [home], posts, ...(authors ? { authors } : {}), categories, archives, images: [] },
    'sections.json': { acm: [], custom: [], other: [] },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [] },
    'patterns.map.json': { types: {} }
  }
  for (const [name, value] of Object.entries(files)) writeFileSync(join(spec, name), JSON.stringify(value))
  const opts = () => parseArgs(['--spec', spec, '--wp', 'fake', '--theme', 'fixture', '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img', '--base-url', 'http://x', '--report', join(root, 'report.json')])
  return { spec, opts, write: (name, value) => writeFileSync(join(spec, name), JSON.stringify(value)) }
}
const seed = (site, fx) => runSeed(fx.opts(), { runner: site.wp, fetch: async () => ({ status: 200, headers: new Map() }) })
const post = (slug, extra = {}) => ({ slug, path: `/news/${slug}`, title: slug, category: 'news', content: `<!-- wp:paragraph --><p>The ${slug} article body.</p><!-- /wp:paragraph -->`, images: [], ...extra })
const NEWS = [{ title: 'News', wpSlug: 'news', description: '' }]
// The site's answer to WP_Theme::get_post_templates(): the template is declared for posts (#33 M6-9
// checks it before a post is written).
const POST_TEMPLATES = { page: ['page-no-sidebar'], post: ['page-no-sidebar'] }

// ── item 6: a post carries the template it declares ─────────────────────────────

test('#28 item 6: a post that declares a template gets it, stays in its category, and a second seed changes nothing', async () => {
  const fx = seedFixture({ posts: [post('biometrics', { meta: { _wp_page_template: 'page-no-sidebar' } }), post('plain')], categories: NEWS })
  const site = fakeSite()
  site.postTemplates = POST_TEMPLATES
  const first = await seed(site, fx)
  const bio = site.post((p) => p.post_name === 'biometrics')
  assert.equal(bio.meta._wp_page_template, 'page-no-sidebar')
  const news = [...site.terms.values()].find((t) => t.slug === 'news')
  assert.equal(bio.post_category, String(news.term_id), 'the post is still filed in the category its listing reads')
  assert.equal(site.post((p) => p.post_name === 'plain').meta._wp_page_template, undefined, 'a post that declares none gets none')
  assert.equal(first.counts.posts.created, 2)
  const second = await seed(site, fx)
  assert.deepEqual(second.counts.posts, { created: 0, updated: 0, skipped: 2 })
  assert.equal([...site.posts.values()].filter((p) => p.post_type === 'post').length, 2)
})

test('#28 item 6: a template the theme does not have is noted, never written or dropped silently', () => {
  const report = { notes: [] }
  assert.equal(postTemplate({ slug: 'x', meta: { _wp_page_template: 'page-nope' } }, new Set(['page-article']), report), undefined)
  assert.match(report.notes[0].note, /template "page-nope" does not exist in the theme/)
  assert.equal(postTemplate({ slug: 'x', meta: { _wp_page_template: 'page-article' } }, new Set(['page-article']), report), 'page-article')
  assert.equal(postTemplate({ slug: 'x' }, new Set(), report), undefined)
  assert.equal(report.notes.length, 1)
})

test('#28 item 6: a single view that names its article lands on that post, or nowhere', () => {
  const posts = [{ slug: 'first', joomla: { articleId: '3' } }, { slug: 'biometrics', joomla: { articleId: '7' } }]
  const urls = new Map([['first', '/first/'], ['biometrics', '/biometrics/']])
  const notes = []
  const rules = singleViewRules([{ path: '/blog-detail', view: 'single', source: { articleId: '7' } }, { path: '/gone', view: 'single', source: { articleId: '99' } }], posts, urls, [], notes)
  assert.deepEqual(rules, [{ from: '/blog-detail', to: '/biometrics/', status: 301 }], 'not the first post of the locale')
  assert.match(notes.find((n) => n.page === '/gone').note, /article 99 is not a seeded post; no redirect written/)
  assert.deepEqual(singleViewRules([{ path: '/biometrics', view: 'single', source: { articleId: '7' } }], posts, urls, []), [], 'no rule from the post to itself')
})

/**
 * The joomla-min fixture plus a second blog article (#4) and a menu item that opens the first
 * (#3) on its own, as the source's `/blog-detail` opens one article of its blog.
 */
function fixtureWithArticleRoute(mutate = null) {
  const dir = tmp('i28-fj-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  const three = raw.content.find((r) => String(r.id) === '3')
  raw.content.push({ ...three, id: '4', title: 'Second article', alias: 'second-article', introtext: '<p>The second blog article of the fixture.</p>', ordering: '2' })
  raw.menu.push({ id: '290', menutype: 'tracy', title: 'Blog detail', alias: 'blog-detail', path: 'blog-detail', link: 'index.php?option=com_content&view=article&id=3', type: 'component', published: '1', parent_id: '1', level: '1', template_style_id: '11', params: '{}', lft: '60', rgt: '61', home: '0', client_id: '0' })
  mutate?.(raw)
  writeFileSync(invPath, JSON.stringify(raw))
  const routesPath = join(dir, 'render-routes.json')
  writeFileSync(routesPath, JSON.stringify([...readJson(routesPath), { id: '290', path: '/blog-detail' }]))
  return dir
}
const pack = (dir, opts = {}) => {
  const out = join(tmp('i28-pack-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z', ...opts })
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  return { result, content: readJson(join(out, 'content.json')), pageMap: readJson(join(out, 'page-map.json')), provenance: readJson(join(out, 'provenance.json')) }
}

test('#28 item 6: from-joomla keeps a menu-routed article as a post when --article-posts names it; the default is unchanged', () => {
  const dir = fixtureWithArticleRoute()
  const before = pack(dir)
  assert.equal(before.content.posts.some((p) => p.joomla.articleId === '3'), false, 'default: a menu-routed article is a page')
  assert.equal(before.content.pages.find((p) => p.path === '/blog-detail')?.joomla.articleId, '3')

  const kept = pack(dir, { articlePosts: { 3: { template: 'page-article' } } })
  const p = kept.content.posts.find((x) => x.joomla.articleId === '3')
  assert.ok(p, 'the article is a post, so its category blog lists it')
  assert.deepEqual(p.meta, { _wp_page_template: 'page-article' })
  assert.equal(p.category, kept.content.categories.find((c) => c.id === '15').wpSlug)
  assert.equal(kept.content.pages.some((x) => x.path === '/blog-detail'), false, 'no page takes the post\'s place')
  const route = kept.pageMap.pages.find((x) => x.path === '/blog-detail')
  assert.equal(route.view, 'single')
  assert.equal(route.source.articleId, '3', 'the menu path names its article for the seeder\'s redirect')
  assert.ok(kept.result.notes.some((n) => /route \/blog-detail \(menu item 290\) opens article #3 .*kept as a post .*on template page-article/.test(n)))
})

test('#28 item 6: a config path that is missing, a directory, a pipe, empty or not JSON exits 2 before any write', () => {
  const cli = join(here, '..', 'ingest', 'from-joomla.mjs')
  const dir = tmp('fj-cfg-')
  const fifo = join(dir, 'pipe.json')
  const fifoOk = spawnSync('mkfifo', [fifo]).status === 0
  writeFileSync(join(dir, 'empty.json'), '')
  writeFileSync(join(dir, 'bad.json'), '{"12": ')
  const cases = [
    ['missing.json', /does not exist/],
    ['.', /is not a file/],
    ...(fifoOk ? [['pipe.json', /is not a file/]] : []),
    ['empty.json', /Unexpected end of JSON input/],
    ['bad.json', /JSON/]
  ]
  for (const flag of ['--article-posts', '--article-fields', '--content-params'])
    for (const [name, why] of cases) {
      const out = join(dir, `pack-${flag.slice(2)}-${name}`)
      const r = spawnSync(process.execPath, [cli, FIXTURE, '--out', out, '--page-floor', '4', flag, join(dir, name)], { encoding: 'utf8', timeout: 60000 })
      assert.equal(r.error, undefined, `${flag} ${name}: ${r.error?.message}`)
      assert.equal(r.status, 2, `${flag} ${name}: ${r.stderr}`)
      assert.match(r.stderr, new RegExp(`${flag}: `), `${flag} ${name}`)
      assert.match(r.stderr, why, `${flag} ${name}`)
      assert.equal(existsSync(out), false, `${flag} ${name}: nothing written`)
    }
})

test('#28 item 6: --article-posts with a bad shape or an unknown article is an error', () => {
  assert.throws(() => checkArticlePosts({ 3: 'page-article' }), /takes \{ "template"/)
  assert.throws(() => checkArticlePosts({ abc: {} }), /not an article id/)
  assert.throws(() => checkArticlePosts({ 3: { template: 'Page Article' } }), /takes \{ "template"/)
  assert.throws(() => checkArticlePosts([], { required: true }), /expected an object/)
  assert.throws(() => pack(fixtureWithArticleRoute(), { articlePosts: { 999: {} } }), /article 999 is not in the inventory/)
})

test('#28 item 6: the modules of the menu route go with the kept post — around its body, as the page drew them', () => {
  const dir = fixtureWithArticleRoute((raw) => {
    const carousel = raw.modules.find((m) => m.id === '102')
    raw.modules.push({ ...carousel, id: '146', title: '[Fixture] Related', position: 'related-articles', ordering: '1' })
    raw.modules_menu.push({ moduleid: '146', menuid: '290' })
  })
  const asPage = pack(dir)
  const page = asPage.content.pages.find((x) => x.path === '/blog-detail')
  assert.ok(page.sections.some((x) => x.modules.includes('146')), 'the fixture\'s route shows module 146')
  const kept = pack(dir, { articlePosts: { 3: { template: 'page-article' } } })
  const p = kept.content.posts.find((x) => x.joomla.articleId === '3')
  assert.equal(p.route.path, '/blog-detail')
  assert.deepEqual(p.route.modules, ['146'])
  assert.equal(p.route.contentKind, page.contentKind)
  // The page's composition with the post's body in place of the article.
  const slot = '<!-- wp:tracy-base/slot {"position":"related-articles"} /-->'
  assert.equal(p.route.content, ['<!-- wp:tracy-base/post-body /-->', slot].join('\n'))
  assert.ok(page.content.includes(slot))
  assert.ok(kept.result.notes.some((n) => /route's modules 146 are seeded around the post's body/.test(n)))
  const other = kept.content.posts.find((x) => x.joomla.articleId === '4')
  assert.equal(other.route, undefined, 'a post no menu route opens carries none')
})

test('#28 item 6: a seeded post renders its route\'s modules around its own body; a second seed changes nothing', async () => {
  const related = '<!-- wp:heading -->\n<h2 class="wp-block-heading">Related articles</h2>\n<!-- /wp:heading -->'
  const route = { path: '/blog-detail', contentKind: 'sections', content: [{ kind: 'body' }, { kind: 'blocks', markup: related }], aside: [] }
  const fx = seedFixture({ posts: [post('biometrics', { route, meta: { _wp_page_template: 'page-no-sidebar' } }), post('plain')], categories: NEWS })
  const site = fakeSite()
  site.postTemplates = POST_TEMPLATES
  await seed(site, fx)
  const bio = site.post((p) => p.post_name === 'biometrics')
  assert.ok(bio.content.indexOf('The biometrics article body.') !== -1, 'the article body stays')
  assert.ok(bio.content.indexOf('Related articles') > bio.content.indexOf('The biometrics article body.'), 'the module after the body, as the route drew it')
  assert.equal(bio.content.includes('post-body'), false, 'the marker never reaches the site')
  assert.equal(site.post((p) => p.post_name === 'plain').content.includes('Related articles'), false)
  const second = await seed(site, fx)
  assert.deepEqual(second.counts.posts, { created: 0, updated: 0, skipped: 2 })

  // A blocks route with the body and a sidebar module on the other side.
  const blocks = { path: '/blog-detail', contentKind: 'blocks', content: `${related}\n<!-- wp:tracy-base/post-body /-->` }
  assert.match(postWithRoute({ slug: 'x', route: blocks }, '<p>B</p>', { spec: { sections: { acm: [], custom: [], other: [] }, content: { categories: [] } }, patternsMap: { types: {} }, patterns: {}, log: [], sections: [], rewrite: (m) => m, media: () => null }), /Related articles[^]*<p>B<\/p>/)
})

test('#28 item 6: a route that is malformed or loses the post\'s body stops the seed', () => {
  const ctx = { spec: { sections: { acm: [], custom: [], other: [] }, content: { categories: [] } }, patternsMap: { types: {} }, patterns: {}, log: [], sections: [], rewrite: (m) => m, media: () => null }
  const heading = '<!-- wp:heading -->\n<h2 class="wp-block-heading">R</h2>\n<!-- /wp:heading -->'
  assert.equal(postWithRoute({ slug: 'x' }, 'B', ctx), 'B')
  assert.throws(() => postWithRoute({ slug: 'x', route: { path: 'blog-detail', contentKind: 'blocks', content: '' } }, 'B', ctx), /must be \{ path/)
  assert.throws(() => postWithRoute({ slug: 'x', route: { path: '/d', contentKind: 'sections', content: 'nope' } }, 'B', ctx), /takes a list of entries/)
  assert.throws(() => postWithRoute({ slug: 'x', route: { path: '/d', contentKind: 'blocks', content: heading } }, 'B', ctx), /names the post's body 0 times/)
  assert.throws(() => postWithRoute({ slug: 'x', route: { path: '/d', contentKind: 'sections', content: [{ kind: 'body' }, { kind: 'body' }] } }, 'B', ctx), /names the post's body 2 times/)
})

const routeCtx = (other = [], terms = new Map()) => ({
  spec: { sections: { acm: [], custom: [], other }, content: { categories: [{ id: '15', wpSlug: 'grid-layout' }] } },
  patternsMap: { types: {} },
  patterns: {},
  log: [],
  sections: [],
  terms,
  rewrite: (m) => m,
  media: () => null
})
const RELATED = { id: '147', title: 'Related articles', module: 'mod_articles_category', position: 'related-articles', ordering: 1, params: { catid: ['15'], count: 3 } }
const BREADCRUMBS = { id: '148', title: 'Crumbs', module: 'mod_breadcrumbs', position: 'related-articles', ordering: 2, params: {} }

test('#28 item 6: a route whose layout rows are sections carries its menu-assigned modules too — a related-articles module is in the post\'s route', () => {
  const dir = fixtureWithArticleRoute((raw) => {
    // The menu item's layout has a section row above the article: a mod_custom there makes the
    // route section-driven; the related module sits at a position the layout draws after the body, assigned to the menu item.
    raw.template_styles.push({ id: '12', template: 'tracy', client_id: '0', home: '0', title: 'Tracy — base · Article', params: JSON.stringify({ 'typelist-site': 'default', 'typelist-theme': 'base', 'typelist-layout': 'article' }) })
    raw.menu.find((m) => m.id === '290').template_style_id = '12'
    raw.modules.push({ id: '145', title: 'Stats', content: '<section class="section" data-od-block="statistics"><p>3 clients</p></section>', ordering: '1', position: 'section-2', published: '1', module: 'mod_custom', showtitle: '0', client_id: '0', params: '{}' })
    raw.modules.push({ id: '147', title: 'Related articles', content: '', ordering: '1', position: 'related-articles', published: '1', module: 'mod_articles_category', showtitle: '1', client_id: '0', params: JSON.stringify({ catid: ['15'], count: '3' }) })
    raw.modules_menu.push({ moduleid: '145', menuid: '290' }, { moduleid: '147', menuid: '290' })
  })
  writeFileSync(
    join(dir, 'capture/templates/tracy/etc/layout/article.json'),
    JSON.stringify({ layout: { sections: [{ type: 'row', name: 'Top', contents: [{ type: 'positions', name: 'section-2', positions: 'section-2' }] }, { type: 'row', name: 'Main', contents: [{ type: 'component', name: '' }] }, { type: 'row', name: 'Bottom', contents: [{ type: 'positions', name: 'related-articles', positions: 'related-articles' }] }] } })
  )
  const asPage = pack(dir)
  const page = asPage.content.pages.find((x) => x.path === '/blog-detail')
  assert.equal(page.contentKind, 'sections')
  const slot = { kind: 'slot', position: 'related-articles', modules: ['147'] }
  assert.deepEqual(page.content.at(-1), slot, 'the page draws the menu-assigned module too, after the body')
  const kept = pack(dir, { articlePosts: { 3: {} } })
  const p = kept.content.posts.find((x) => x.joomla.articleId === '3')
  assert.equal(p.route.contentKind, 'sections')
  assert.deepEqual(p.route.modules, ['145', '147'])
  const kinds = p.route.content.map((e) => e.kind)
  assert.ok(kinds.indexOf('body') < p.route.content.findIndex((e) => e.kind === 'slot' && e.position === 'related-articles'), kinds.join(','))
  assert.deepEqual(p.route.content.at(-1), slot)
})

test('#28 item 6: a list module at a route slot is drawn in the post; one the seeder cannot draw is named in the log', () => {
  const terms = new Map([['grid-layout', { id: 9 }]])
  const body = '<p>The article.</p>'
  for (const route of [
    { path: '/blog-detail', contentKind: 'sections', content: [{ kind: 'body' }, { kind: 'slot', position: 'related-articles', modules: ['147'] }, { kind: 'slot', position: 'related-articles', modules: ['148'] }], modules: ['147', '148'] },
    { path: '/blog-detail', contentKind: 'blocks', content: '<!-- wp:tracy-base/post-body /-->\n<!-- wp:tracy-base/slot {"position":"related-articles"} /-->', modules: ['147', '148'] }
  ]) {
    const ctx = routeCtx([RELATED, BREADCRUMBS], terms)
    const out = postWithRoute({ slug: 'x', route }, body, ctx)
    const queries = findAll(parseBlocks(out), (b) => b.name === 'core/query')
    assert.equal(queries.length, 1, `${route.contentKind}: the related module is drawn once\n${out}`)
    assert.deepEqual(queries[0].attrs.query.taxQuery, { category: [9] })
    assert.equal(queries[0].attrs.query.perPage, 3)
    assert.ok(out.indexOf('Related articles') > out.indexOf('The article.'), 'after the body, where the route put it')
    assert.ok(ctx.log.some((l) => l.post === 'x' && l.module === '148' && /mod_breadcrumbs at related-articles\) is not drawn/.test(l.note)), JSON.stringify(ctx.log))
    assert.equal(ctx.log.some((l) => l.post === 'x' && l.module === '147'), false)
  }
  // A module the spec does not hold, or a category not seeded, is said too — never a silent gap.
  const ctx = routeCtx([RELATED], new Map())
  postWithRoute({ slug: 'y', route: { path: '/d', contentKind: 'sections', content: [{ kind: 'body' }, { kind: 'slot', position: 'related-articles', modules: ['147'] }], modules: ['147', '999'] } }, body, ctx)
  assert.ok(ctx.log.some((l) => l.module === '147' && /no seeded category/.test(l.note)))
  assert.ok(ctx.log.some((l) => l.post === 'y' && l.module === '147' && /is not drawn/.test(l.note)))
  assert.ok(ctx.log.some((l) => l.post === 'y' && l.module === '999' && /not in the spec's sections/.test(l.note)))
})

test('#28 item 6: two list modules at one position keep the section between them, each at its own slot', () => {
  const terms = new Map([['grid-layout', { id: 9 }]])
  const SECOND = { ...RELATED, id: '149', title: 'More articles', ordering: 2, params: { catid: ['15'], count: 2 } }
  const section = { kind: 'blocks', markup: '<!-- wp:paragraph -->\n<p>Between the lists</p>\n<!-- /wp:paragraph -->' }
  const content = [{ kind: 'body' }, { kind: 'slot', position: 'related-articles', modules: ['147'] }, section, { kind: 'slot', position: 'related-articles', modules: ['149'] }]
  const ctx = routeCtx([RELATED, SECOND], terms)
  const out = postWithRoute({ slug: 'x', route: { path: '/blog-detail', contentKind: 'sections', content, modules: ['147', '149'] } }, '<p>The article.</p>', ctx)
  const queries = findAll(parseBlocks(out), (b) => b.name === 'core/query')
  assert.deepEqual(queries.map((q) => q.attrs.query.perPage), [3, 2], out)
  const at = (text) => out.indexOf(text)
  assert.ok(at('The article.') < at('Related articles') && at('Related articles') < at('Between the lists') && at('Between the lists') < at('More articles'), out)
  // A module no slot at the position names is still drawn, at its first slot — never lost.
  const ctx2 = routeCtx([RELATED, SECOND], terms)
  const out2 = postWithRoute({ slug: 'y', route: { path: '/blog-detail', contentKind: 'sections', content: [{ kind: 'body' }, { kind: 'slot', position: 'related-articles', modules: ['147'] }, section], modules: ['147', '149'] } }, '<p>B</p>', ctx2)
  assert.equal(findAll(parseBlocks(out2), (b) => b.name === 'core/query').length, 2, out2)
  assert.ok(out2.indexOf('More articles') < out2.indexOf('Between the lists'), out2)
  assert.throws(
    () => postWithRoute({ slug: 'z', route: { path: '/d', contentKind: 'sections', content: [{ kind: 'body' }, { kind: 'slot', position: 'p', modules: '147' }] } }, 'B', routeCtx()),
    /post z: route \/d: content\[1\]: a "slot" entry's modules must be a list of module ids/
  )
})

test('#28 item 6: a route with a malformed aside, module list or entry stops the seed and names the post and the field', () => {
  const route = (extra) => ({ path: '/d', contentKind: 'sections', content: [{ kind: 'body' }], ...extra })
  const run = (extra) => () => postWithRoute({ slug: 'x', route: route(extra) }, 'B', routeCtx())
  assert.throws(run({ aside: '147' }), /post x: route \/d: aside must be a list of module ids/)
  assert.throws(run({ aside: [{}] }), /aside must be a list of module ids/)
  assert.throws(run({ aside: [''] }), /aside must be a list of module ids/)
  assert.throws(run({ modules: 'x' }), /post x: route \/d: modules must be a list of module ids/)
  assert.throws(run({ content: [{ kind: 'body' }, { kind: 'widget' }] }), /post x: route \/d: content\[1\]: kind must be one of body, slot, section, html, blocks \(got "widget"\)/)
  assert.throws(run({ content: [{ kind: 'body' }, null] }), /content\[1\]: kind must be one of/)
  assert.throws(run({ content: [{ kind: 'body' }, { kind: 'slot' }] }), /content\[1\]: a "slot" entry needs position as a string/)
  assert.throws(run({ content: [{ kind: 'body' }, { kind: 'section', moduleId: '1' }] }), /a "section" entry needs html as a string/)
  assert.throws(run({ content: [{ kind: 'html', moduleId: '1' }, { kind: 'body' }] }), /content\[0\]: a "html" entry needs blocks as a string/)
  assert.throws(run({ content: [{ kind: 'blocks' }, { kind: 'body' }] }), /a "blocks" entry needs markup as a string/)
  assert.equal(postWithRoute({ slug: 'x', route: route({ aside: [], modules: [] }) }, 'B', routeCtx()), 'B')
  // A page's entry of a kind the seeder does not know is named in the log, not dropped silently.
  const ctx = routeCtx()
  buildPageContent({ path: '/p', contentKind: 'sections', content: [{ kind: 'blocks', markup: '<p>A</p>' }, { kind: 'widget' }] }, ctx)
  assert.ok(ctx.log.some((l) => l.page === '/p' && /unknown kind "widget"/.test(l.reason)))
})

// ── item 7: authors by source identity, with their pictures ────────────────────────

test('#28 item 7: a declared author wins over the byline; two people of one name stay two', () => {
  const authors = [
    { id: 'joomla-user-50', name: 'Sam Example', login: 'sam' },
    { id: 'joomla-user-51', name: 'Sam Example', login: 'sam' },
    { id: 'joomla-user-52', name: '' }
  ]
  const posts = [
    { slug: 'a', author: { id: 'joomla-user-50', alias: '' } },
    { slug: 'b', author: { id: 'joomla-user-51', alias: '' } },
    { slug: 'c', author: { id: 'joomla-user-52', alias: '' } },
    { slug: 'd', author: { id: 'joomla-user-50', alias: 'Guest Writer' } }
  ]
  const facts = new Map(posts.map((p) => [p.slug, { head: { author: p.slug === 'c' ? { name: 'Byline Person' } : null } }]))
  const notes = []
  const { users, byPost } = postAuthors(posts, facts, { siteName: 'Fixture', authors, notes })
  const userOf = (slug) => users.find((u) => u.login === byPost.get(slug))
  assert.equal(userOf('a').sourceId, 'joomla-user-50')
  assert.equal(userOf('b').sourceId, 'joomla-user-51')
  assert.notEqual(byPost.get('a'), byPost.get('b'), 'one name, two people, two users')
  assert.deepEqual([userOf('a').display, userOf('b').display], ['Sam Example', 'Sam Example'])
  assert.equal(userOf('c').display, 'Byline Person', 'an author without a name falls back to the byline')
  assert.ok(notes.some((n) => /content.authors entry without a name/.test(n.note)))
  assert.ok(notes.some((n) => n.post === 'c' && /not in content.authors/.test(n.note)))
  assert.equal(userOf('d').display, 'Guest Writer', 'a Joomla alias is what the source prints instead of the user')
  assert.throws(() => declaredAuthors([{ id: 'x', name: 'A' }, { id: 'x', name: 'B' }]), /listed twice/)
  assert.throws(() => declaredAuthors({}), /must be a list/)
})

test('#28 item 7: a translation with an author of its own is theirs; one without takes its pair\'s', () => {
  const authors = [{ id: 'joomla-user-50', name: 'Ann Writer' }, { id: 'joomla-user-51', name: 'Bao Translator' }]
  const posts = [
    { slug: 'a', locale: 'en', category: 'news', author: { id: 'joomla-user-50', alias: '' } },
    { slug: 'a-vi', locale: 'vi', category: 'news', translationOf: 'a', author: { id: 'joomla-user-51', alias: '' } },
    { slug: 'a-fr', locale: 'fr', category: 'news', translationOf: 'a', author: { joomlaUserId: '0', alias: '' } }
  ]
  const facts = new Map(posts.map((p) => [p.slug, { head: { author: p.slug === 'a-vi' ? { name: 'Bảo', role: 'Biên dịch' } : null } }])) // language-allow: data: Vietnamese byline
  const { users, byPost } = postAuthors(posts, facts, { defaultLocale: 'en', authors })
  const userOf = (slug) => users.find((u) => u.login === byPost.get(slug))
  assert.equal(userOf('a').sourceId, 'joomla-user-50')
  assert.equal(userOf('a-vi').sourceId, 'joomla-user-51', 'the secondary-locale post names its own author')
  assert.equal(userOf('a-fr').sourceId, 'joomla-user-50', 'no identity of its own: the pair decides')
  assert.deepEqual(userOf('a-vi').bios, { vi: 'Biên dịch' }) // language-allow: data: Vietnamese byline
})

test('#28 item 7: a translation before its pair still takes the pair\'s author; one with an alias is its own byline', () => {
  const authors = [{ id: 'joomla-user-50', name: 'Ann Writer' }]
  const posts = [
    { slug: 'a-fr', locale: 'fr', category: 'news', translationOf: 'a', author: { joomlaUserId: '0', alias: '' } },
    { slug: 'a-vi', locale: 'vi', category: 'news', translationOf: 'a', author: { id: 'joomla-user-50', alias: 'Bảo Dịch' } }, // language-allow: data: Vietnamese byline
    { slug: 'a', locale: 'en', category: 'news', author: { id: 'joomla-user-50', alias: '' } }
  ]
  const facts = new Map(posts.map((p) => [p.slug, { head: { author: p.slug === 'a-fr' ? { name: 'Anne', role: 'Rédactrice' } : null } }])) // language-allow: data: Vietnamese byline
  const { users, byPost } = postAuthors(posts, facts, { defaultLocale: 'en', authors, siteName: 'Fixture' })
  const userOf = (slug) => users.find((u) => u.login === byPost.get(slug))
  assert.equal(userOf('a').sourceId, 'joomla-user-50')
  assert.equal(userOf('a-fr').sourceId, 'joomla-user-50', 'listed before its pair, it still takes the pair\'s author, not editorial')
  assert.deepEqual(userOf('a').bios, { fr: 'Rédactrice' }) // language-allow: data: Vietnamese byline
  assert.equal(userOf('a-vi').display, 'Bảo Dịch', 'the alias is what the translation prints: its own byline') // language-allow: data: Vietnamese byline
  assert.equal(userOf('a-vi').sourceId, undefined)
  assert.equal(users.some((u) => u.login === 'editorial'), false)
  // The same posts in any order give the same users and the same filing.
  const again = postAuthors([posts[2], posts[0], posts[1]], facts, { defaultLocale: 'en', authors, siteName: 'Fixture' })
  assert.deepEqual([...again.byPost].sort(), [...byPost].sort())
})

test('#28 item 7: a translation with an identity or an alias of its own never takes its pair\'s author; its role is its user\'s biography in its locale', () => {
  const authors = [{ id: 'joomla-user-50', name: 'Ann Writer' }]
  const posts = [
    { slug: 'a-vi', locale: 'vi', category: 'news', translationOf: 'a', author: { id: 'joomla-user-99', alias: '' } },
    { slug: 'a-fr', locale: 'fr', category: 'news', translationOf: 'a', author: { id: 'joomla-user-98', alias: '' } },
    { slug: 'a', locale: 'en', category: 'news', author: { id: 'joomla-user-50', alias: '' } },
    { slug: 'b', locale: 'en', category: 'news', author: { id: 'joomla-user-50', alias: 'Bao Dich' } },
    { slug: 'b-vi', locale: 'vi', category: 'news', translationOf: 'b', author: { id: 'joomla-user-50', alias: 'Bao Dich' } }
  ]
  const heads = { 'a-vi': { name: 'Chi Dich', role: 'Biên tập' }, 'a-fr': { name: null, role: 'Rédaction' }, b: { name: null, role: 'Translator' }, 'b-vi': { name: null, role: 'Biên dịch' } } // language-allow: data: Vietnamese byline
  const facts = new Map(posts.map((p) => [p.slug, { head: { author: heads[p.slug] ?? null } }]))
  for (const order of [posts, [...posts].reverse()]) {
    const notes = []
    const { users, byPost } = postAuthors(order, facts, { defaultLocale: 'en', authors, siteName: 'Fixture', notes })
    const userOf = (slug) => users.find((u) => u.login === byPost.get(slug))
    assert.equal(userOf('a').sourceId, 'joomla-user-50')
    assert.notEqual(byPost.get('a-vi'), byPost.get('a'), 'an author id not declared is not the pair\'s author')
    assert.equal(userOf('a-vi').display, 'Chi Dich', 'the undeclared id keeps the byline road')
    assert.equal(userOf('a-vi').sourceId, undefined)
    assert.deepEqual(userOf('a-vi').bios, { vi: 'Biên tập' }) // language-allow: data: Vietnamese byline
    assert.ok(notes.some((n) => n.post === 'a-vi' && /author joomla-user-99 is not in content.authors/.test(n.note)))
    assert.equal(byPost.get('a-fr'), 'editorial', 'an undeclared id and no name in the byline: the editorial user, not the pair\'s')
    assert.deepEqual(userOf('a-fr').bios, { fr: 'Rédaction' }) // language-allow: data: Vietnamese byline
    assert.equal(userOf('a').bios, undefined, 'the pair\'s user gets no role from translations that are not its')
    assert.equal(byPost.get('b-vi'), byPost.get('b'), 'one alias, one byline user')
    assert.equal(userOf('b-vi').description, 'Translator')
    assert.deepEqual(userOf('b-vi').bios, { vi: 'Biên dịch' }, 'the alias translation\'s role is that user\'s biography in its locale') // language-allow: data: Vietnamese byline
  }
})

test('#28 item 7: a seeded alias translation writes its role as the user\'s description_<locale>; an undeclared id is not filed under the pair\'s author', async () => {
  const authors = [{ id: 'joomla-user-50', name: 'Ann Writer' }]
  const byline = (name, role) => [
    `<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">T</h1>\n<!-- /wp:heading -->`,
    `<!-- wp:html -->\n<div><div>${name ? `<div>${name}</div>` : ''}<div>${role} · 28 Jul 2026 · 7 min read</div></div></div>\n<!-- /wp:html -->`,
    '<!-- wp:paragraph -->\n<p>Body.</p>\n<!-- /wp:paragraph -->'
  ].join('\n')
  const withByline = (slug, locale, author, name, role, extra = {}) =>
    post(slug, { title: 'T', locale, author, content: byline(name, role), source: { dateText: `${role} · 28 Jul 2026 · 7 min read` }, ...extra })
  const posts = [
    withByline('b-vi', 'vi', { id: 'joomla-user-50', alias: 'Bao Dich' }, null, 'Biên dịch', { translationOf: 'b' }), // language-allow: data: Vietnamese byline
    withByline('a-vi', 'vi', { id: 'joomla-user-99', alias: '' }, 'Chi Dich', 'Biên tập', { translationOf: 'a' }), // language-allow: data: Vietnamese byline
    withByline('a', 'en', { id: 'joomla-user-50', alias: '' }, null, 'Writer'),
    withByline('b', 'en', { id: 'joomla-user-50', alias: 'Bao Dich' }, null, 'Translator')
  ]
  const fx = seedFixture({ posts, authors, categories: NEWS })
  const map = JSON.parse(readFileSync(join(fx.spec, 'page-map.json'), 'utf8'))
  fx.write('page-map.json', { ...map, defaultLocale: 'en', locales: ['en', 'vi'] })
  const site = fakeSite()
  await seed(site, fx)
  const userByDisplay = (display) => [...site.users.values()].find((u) => u.display_name === display)
  const authorOf = (slug) => Number(site.post((p) => p.post_name === slug).post_author)
  const bao = userByDisplay('Bao Dich')
  assert.ok(bao, 'the alias is a user')
  assert.equal(authorOf('b-vi'), bao.ID)
  assert.equal(bao.description, 'Translator')
  assert.equal(site.userMeta.get(bao.ID)?.description_vi, 'Biên dịch', 'Polylang\'s biography on the vi pages') // language-allow: data: Vietnamese byline
  const chi = userByDisplay('Chi Dich')
  assert.ok(chi, 'the undeclared id keeps its byline')
  assert.equal(authorOf('a-vi'), chi.ID)
  assert.notEqual(authorOf('a-vi'), authorOf('a'))
  assert.equal(site.userMeta.get(authorOf('a'))?.description_vi, undefined, 'the pair\'s author gets no vi role that is not theirs')
})

test('#28 item 7: a byline never takes the editorial login, a declared login or another byline\'s, whatever the order of the posts', () => {
  const authors = [{ id: 'joomla-user-50', name: 'Sam Declared', login: 'sam' }]
  const posts = [
    { slug: 'ed', author: { alias: 'Editorial' } },
    { slug: 'stub', author: {} },
    { slug: 'sam', author: { alias: 'Sam' } },
    { slug: 'sam-byline', author: { alias: 'Sam Byline' } },
    { slug: 'sam-byline-2', author: { alias: 'Sam Byline 2' } },
    { slug: 'decl', author: { id: 'joomla-user-50' } }
  ]
  const facts = new Map(posts.map((p) => [p.slug, { head: { author: null } }]))
  const runs = [posts, [...posts].reverse(), [posts[3], posts[4], posts[2], posts[5], posts[1], posts[0]]].map((order) =>
    postAuthors(order, facts, { siteName: 'Fixture', authors })
  )
  for (const { users, byPost } of runs) {
    const userOf = (slug) => users.find((u) => u.login === byPost.get(slug))
    const logins = users.map((u) => u.login)
    assert.equal(new Set(logins).size, logins.length, 'one login, one user')
    assert.equal(new Set(users.map(ownerOf)).size, users.length, 'one identity, one user')
    assert.equal(userOf('stub').display, 'Fixture Editorial')
    assert.equal(ownerOf(userOf('stub')), 'tracy:editorial')
    assert.equal(userOf('ed').display, 'Editorial', 'the byline "Editorial" is a user of its own')
    assert.notEqual(byPost.get('ed'), 'editorial')
    assert.notEqual(ownerOf(userOf('ed')), 'tracy:editorial', 'and is never taken for the seeder\'s editorial user')
    assert.equal(userOf('decl').sourceId, 'joomla-user-50')
    assert.equal(byPost.get('decl'), 'sam')
    const names = ['sam', 'sam-byline', 'sam-byline-2'].map((slug) => userOf(slug).display)
    assert.deepEqual(names, ['Sam', 'Sam Byline', 'Sam Byline 2'], 'three bylines, three users')
    assert.equal(byPost.get('sam-byline'), 'sam-byline', 'a byline whose own login is free keeps it')
    assert.equal(byPost.get('sam-byline-2'), 'sam-byline-2')
  }
  // The same posts in any order give the same logins, users and identities.
  const shape = ({ users, byPost }) => JSON.stringify([[...byPost].sort(), users.map((u) => [u.login, u.display, ownerOf(u)]).sort()])
  assert.equal(new Set(runs.map(shape)).size, 1)
})

test('#28 item 7: a spec without authors keeps the byline road', () => {
  const { users, byPost } = postAuthors([{ slug: 'a', author: { joomlaUserId: '50', alias: '' } }], new Map([['a', { head: { author: null } }]]), { siteName: 'Fixture' })
  assert.equal(byPost.get('a'), 'editorial')
  assert.equal(users[0].display, 'Fixture Editorial')
})

test('#28 item 7: seeded authors are found by identity — a rename updates the user, the avatar is imported once and checked where WordPress draws it', async () => {
  const authors = [{ id: 'joomla-user-50', name: 'Dev', login: 'jvadmin', avatar: 'images/authors/item-1.jpg', avatarAlt: 'Dev' }]
  const posts = [post('one', { author: { id: 'joomla-user-50', alias: '' } }), post('two', { author: { id: 'joomla-user-50', alias: '' } })]
  const fx = seedFixture({ posts, authors, categories: NEWS })
  const site = fakeSite()
  const first = await seed(site, fx)
  const users = [...site.users.values()]
  assert.deepEqual(users.map((u) => [u.user_login, u.display_name]), [['jvadmin', 'Dev']])
  const uid = users[0].ID
  assert.equal(site.userMeta.get(uid).tracy_source_author, 'joomla-user-50')
  const avatarId = Number(site.userMeta.get(uid).tracy_avatar)
  assert.equal(site.posts.get(avatarId)?.post_type, 'attachment', 'the avatar is an imported attachment')
  assert.equal(site.post((p) => p.post_name === 'one').post_author, uid)
  // The seeder puts the plugin that draws the picture on the site; get_avatar_url answers it.
  assert.equal(site.avatarHook, false, 'nothing in the theme draws it')
  assert.equal(site.muPlugins.get(AVATAR_PLUGIN.file), readFileSync(AVATAR_PLUGIN.source, 'utf8'))
  assert.deepEqual(first.authors.plugin, { file: `wp-content/mu-plugins/${AVATAR_PLUGIN.file}`, action: 'written' })
  assert.equal(first.authors.avatars[0].rendered, true)
  assert.match(first.authors.avatars[0].drawn, new RegExp(`/uploads/${site.posts.get(avatarId).post_name}-96x96`))
  assert.equal(first.notes.some((n) => /author avatars/.test(n.note)), false)

  // Renamed at the source.
  fx.write('content.json', { ...readJson(join(fx.spec, 'content.json')), authors: [{ ...authors[0], name: 'Dev Team' }] })
  const attachments = () => [...site.posts.values()].filter((p) => p.post_type === 'attachment').length
  const before = attachments()
  const second = await seed(site, fx)
  assert.equal(site.users.size, 1, 'the renamed author is the same user')
  assert.equal(site.users.get(uid).display_name, 'Dev Team')
  assert.equal(attachments(), before, 'the avatar is not imported twice')
  assert.equal(second.authors.avatars[0].rendered, true)
  assert.equal(second.authors.plugin.action, 'same', 'the plugin is written once')
  const third = await seed(site, fx)
  assert.deepEqual(third.counts.authors, { created: 0, updated: 0, skipped: 1 })
})

test('#28 item 7: the avatar plugin is the mechanism, not a stored meta — a plugin the site does not take leaves the avatars not drawn and says so', async () => {
  const authors = [{ id: 'joomla-user-50', name: 'Dev', login: 'jvadmin', avatar: 'images/authors/item-1.jpg' }]
  const fx = seedFixture({ posts: [post('one', { author: { id: 'joomla-user-50', alias: '' } })], authors, categories: NEWS })
  const site = fakeSite()
  const phpEval = site.wp.phpEval
  site.wp.phpEval = (code, o) => (code.includes('WPMU_PLUGIN_DIR') ? 'failed' : phpEval(code, o))
  const report = await seed(site, fx)
  assert.equal(site.muPlugins.size, 0)
  assert.equal(report.authors.plugin.action, 'failed')
  assert.equal(report.authors.avatars[0].rendered, false)
  assert.ok(report.notes.some((n) => /must-use plugin tracy-author-avatars\.php was not written/.test(n.note)))
  assert.ok(report.notes.some((n) => /author avatars imported .* but not drawn/.test(n.note)))
})

test('#28 item 7: the avatar plugin reads tracy_avatar through pre_get_avatar_data and nothing else', () => {
  const php = readFileSync(AVATAR_PLUGIN.source, 'utf8')
  assert.match(php, /^<\?php/)
  assert.match(php, /Plugin Name: /)
  assert.match(php, /add_filter\(\s*'pre_get_avatar_data',\s*'tracy_author_avatar_data',\s*10,\s*2\s*\)/)
  assert.match(php, /get_user_meta\(\s*\$user->ID,\s*'tracy_avatar',\s*true\s*\)/)
  assert.match(php, /wp_get_attachment_image_src\(/)
  assert.match(php, /\$args\['found_avatar'\]\s*=\s*true/)
  assert.doesNotMatch(php, /update_|delete_|\$wpdb|file_put_contents|wp_remote/, 'it only reads')
})

// The PHP the seeder runs, run by a real PHP with the WordPress calls it makes stubbed.
const phpOk = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0
const runPhp = (code) => {
  const r = spawnSync('php', ['-d', 'display_errors=stderr', '-r', code], { encoding: 'utf8', timeout: 30000 })
  if (r.error || r.status !== 0) throw new Error(`php: ${r.error?.message ?? r.stderr}`)
  return r.stdout
}
const pluginInstallCode = () => {
  let code = null
  installAvatarPlugin({ dryRun: false, phpEval: (c) => ((code = c), 'written') }, { notes: [] })
  return code
}

test('#28 item 7: the plugin is written whole or not at all — never through a link, onto a directory or half-written', (t) => {
  if (!phpOk) return t.skip('no php on PATH')
  const code = pluginInstallCode()
  const install = (dir) => runPhp(`define('WPMU_PLUGIN_DIR', ${JSON.stringify(dir)});function wp_mkdir_p($d){return is_dir($d)||@mkdir($d,0777,true);}${code}`)
  const want = readFileSync(AVATAR_PLUGIN.source, 'utf8')
  const root = tmp('tracy-mu-')
  const mu = join(root, 'mu-plugins')
  const target = join(mu, AVATAR_PLUGIN.file)
  assert.equal(install(mu), 'written', 'a missing directory is made')
  assert.equal(readFileSync(target, 'utf8'), want)
  assert.equal(install(mu), 'same')
  writeFileSync(target, '<?php // an older copy')
  assert.equal(install(mu), 'written', 'a different copy is replaced')
  assert.equal(readFileSync(target, 'utf8'), want)
  assert.deepEqual(readdirSync(mu), [AVATAR_PLUGIN.file], 'no temporary file is left')

  // A link at the target is not written through.
  const outside = join(root, 'outside.php')
  writeFileSync(outside, 'outside')
  const linked = join(root, 'linked')
  mkdirSync(linked)
  symlinkSync(outside, join(linked, AVATAR_PLUGIN.file))
  assert.equal(install(linked), 'failed')
  assert.equal(readFileSync(outside, 'utf8'), 'outside')
  // Nor through a link at the temporary name.
  const tmpLinked = join(root, 'tmp-linked')
  mkdirSync(tmpLinked)
  symlinkSync(outside, join(tmpLinked, `${AVATAR_PLUGIN.file}.tmp`))
  assert.equal(install(tmpLinked), 'failed')
  assert.equal(readFileSync(outside, 'utf8'), 'outside')
  // A directory where the file goes.
  const dirAt = join(root, 'dir-at')
  mkdirSync(join(dirAt, AVATAR_PLUGIN.file), { recursive: true })
  assert.equal(install(dirAt), 'failed')
  // A pipe where the file goes: refused, not replaced and never opened.
  const fifoAt = join(root, 'fifo-at')
  mkdirSync(fifoAt)
  if (spawnSync('mkfifo', [join(fifoAt, AVATAR_PLUGIN.file)]).status === 0) {
    assert.equal(install(fifoAt), 'failed')
    assert.deepEqual(readdirSync(fifoAt), [AVATAR_PLUGIN.file])
  }
  // A directory that cannot be written leaves nothing behind (root ignores modes).
  if (process.getuid?.() !== 0) {
    const ro = join(root, 'ro')
    mkdirSync(ro)
    chmodSync(ro, 0o555)
    try {
      assert.equal(install(ro), 'failed')
      assert.equal(existsSync(join(ro, AVATAR_PLUGIN.file)), false)
    } finally {
      chmodSync(ro, 0o755)
    }
  }
})

test('#28 item 7: the plugin answers the attachment of the user asked about, else leaves the default avatar', (t) => {
  if (!phpOk) return t.skip('no php on PATH')
  const stubs = `
class WP_User { public $ID; function __construct($id){ $this->ID = $id; } }
class WP_Post { public $post_author; function __construct($a){ $this->post_author = $a; } }
class WP_Comment { public $user_id; function __construct($u){ $this->user_id = $u; } }
$GLOBALS['filters'] = array();
function add_filter($h, $cb, $p = 10, $n = 1) { $GLOBALS['filters'][$h][] = $cb; }
$GLOBALS['meta'] = array(7 => '901', 8 => '902', 9 => '');
function get_userdata($id) { return isset($GLOBALS['meta'][$id]) ? new WP_User($id) : false; }
function get_user_by($f, $v) { return ($f === 'email' && $v === 'seven@example.invalid') ? new WP_User(7) : false; }
function get_user_meta($id, $k, $single) { return $k === 'tracy_avatar' ? ($GLOBALS['meta'][$id] ?? '') : ''; }
function wp_get_attachment_image_src($a, $size) { return $a === 901 ? array('http://x/wp-content/uploads/item-1-' . $size[0] . 'x' . $size[1] . '.jpg', $size[0], $size[1]) : false; }
`
  const ask = `
include ${JSON.stringify(AVATAR_PLUGIN.source)};
$cb = $GLOBALS['filters']['pre_get_avatar_data'][0];
$out = array();
foreach (array('id' => 7, 'user' => new WP_User(7), 'post' => new WP_Post(7), 'comment' => new WP_Comment(7), 'email' => 'seven@example.invalid', 'gone' => 8, 'none' => 9, 'nobody' => 42, 'guest' => new WP_Comment(0), 'empty' => '') as $k => $v) {
  $r = $cb(array('size' => 64), $v);
  $out[$k] = isset($r['found_avatar']) ? $r['url'] : null;
}
echo json_encode($out);`
  const got = JSON.parse(runPhp(stubs + ask))
  const drawn = 'http://x/wp-content/uploads/item-1-64x64.jpg'
  assert.deepEqual(got, { id: drawn, user: drawn, post: drawn, comment: drawn, email: drawn, gone: null, none: null, nobody: null, guest: null, empty: null })
})

test('#28 item 7: an avatar is drawn only when WordPress answers that attachment — a look-alike file or no answer is not', () => {
  const avatars = [{ login: 'a', user: 1, attachment: 11, url: 'http://site/wp-content/uploads/item-1.jpg' }]
  const check = (answer) => {
    const report = { notes: [] }
    const wp = { dryRun: false, phpEval: () => (typeof answer === 'function' ? answer() : answer) }
    return { out: checkAuthorAvatars(wp, avatars, report)[0], report }
  }
  const at = (url) => JSON.stringify({ 1: url })
  for (const url of ['http://site/wp-content/uploads/item-1.jpg', 'https://cdn/wp-content/uploads/item-1-96x96.jpg?v=2', 'http://site/wp-content/uploads/item-1-scaled.jpg'])
    assert.equal(check(at(url)).out.rendered, true, url)
  for (const url of ['http://site/wp-content/uploads/item-10.jpg', 'http://site/wp-content/uploads/item-1-2.jpg', 'http://site/wp-content/uploads/item-1-96x96.png', 'https://secure.gravatar.com/avatar/1?s=96']) {
    const { out, report } = check(at(url))
    assert.equal(out.rendered, false, url)
    assert.ok(report.notes.some((n) => /but not drawn/.test(n.note)), url)
  }
  // Scaled originals match their resized copies too.
  const scaled = checkAuthorAvatars({ dryRun: false, phpEval: () => at('http://site/wp-content/uploads/big-150x150.jpg') }, [{ ...avatars[0], url: 'http://site/wp-content/uploads/big-scaled.jpg' }], { notes: [] })
  assert.equal(scaled[0].rendered, true)
  // No answer, or one that is not JSON: unknown, never drawn.
  for (const answer of ['not json', () => { throw new Error('wp eval timed out') }]) {
    const { out, report } = check(answer)
    assert.equal(out.rendered, null)
    assert.ok(report.notes.some((n) => /get_avatar_url could not be read/.test(n.note)))
  }
  assert.equal(check('{}').out.rendered, false, 'a user missing from the answer is not drawn')
})

test('#28 item 7: a login made unique for one author is never another author\'s login', () => {
  const authors = [
    { id: 'joomla-user-51', name: 'Sam', login: 'sam' },
    { id: 'joomla-user-60', name: 'Sam Three', login: 'sam-joomla-user-50' },
    { id: 'joomla-user-50', name: 'Sam', login: 'sam' },
    { id: 'editorial-1', name: 'Ed', login: 'editorial' }
  ]
  const declared = declaredAuthors(authors)
  const logins = [...declared.values()].map((d) => d.login)
  assert.equal(new Set(logins).size, logins.length, `logins must be unique: ${logins.join(', ')}`)
  assert.equal(declared.get('joomla-user-60').login, 'sam-joomla-user-50', 'a username is kept when no one else has it')
  assert.equal(declared.get('joomla-user-50').login, 'sam-joomla-user-50-2')
  assert.equal(declared.get('joomla-user-51').login, 'sam-joomla-user-51')
  assert.equal(declared.get('editorial-1').login, 'editorial-editorial-1')
  // Same answer whatever the order.
  const again = declaredAuthors([...authors].reverse())
  for (const [id, d] of declared) assert.equal(again.get(id).login, d.login)
  const posts = [
    { slug: 'a', author: { id: 'joomla-user-50', alias: '' } },
    { slug: 'b', author: { id: 'joomla-user-60', alias: '' } },
    { slug: 'c', author: { id: 'joomla-user-51', alias: '' } }
  ]
  const { users, byPost } = postAuthors(posts, new Map(posts.map((p) => [p.slug, { head: { author: null } }])), { authors })
  assert.equal(new Set(['a', 'b', 'c'].map((x) => byPost.get(x))).size, 3, 'three people, three users')
  assert.deepEqual(['a', 'b', 'c'].map((x) => users.find((u) => u.login === byPost.get(x)).sourceId), ['joomla-user-50', 'joomla-user-60', 'joomla-user-51'])
})

test('#28 item 7: a login another identity holds is passed over, at every login tried', async () => {
  const authors = [{ id: 'joomla-user-50', name: 'Sam', login: 'sam' }]
  const fx = seedFixture({ posts: [post('one', { author: { id: 'joomla-user-50', alias: '' } })], authors, categories: NEWS })
  const site = fakeSite()
  site.users = new Map([
    [1, { ID: 1, user_login: 'sam', display_name: 'Other Sam', description: '' }],
    [2, { ID: 2, user_login: 'sam-joomla-user-50', display_name: 'Third', description: '' }]
  ])
  site.userMeta.set(1, { tracy_source_author: 'joomla-user-99' })
  site.userMeta.set(2, { tracy_source_author: 'joomla-user-77' })
  const report = await seed(site, fx)
  assert.deepEqual([site.userMeta.get(1).tracy_source_author, site.userMeta.get(2).tracy_source_author], ['joomla-user-99', 'joomla-user-77'], 'no one else\'s identity is overwritten')
  assert.deepEqual([site.users.get(1).display_name, site.users.get(2).display_name], ['Other Sam', 'Third'])
  const mine = [...site.users.values()].find((u) => site.userMeta.get(u.ID)?.tracy_source_author === 'joomla-user-50')
  assert.equal(mine.user_login, 'sam-joomla-user-50-2')
  assert.equal(site.post((p) => p.post_name === 'one').post_author, mine.ID)
  assert.ok(report.notes.some((n) => /login sam \(author joomla-user-99\), sam-joomla-user-50 \(author joomla-user-77\) belongs to another user; this author is sam-joomla-user-50-2/.test(n.note)))
  // A second seed finds it by identity: no new user.
  const size = site.users.size
  await seed(site, fx)
  assert.equal(site.users.size, size)
})

/**
 * The fake site's runner as createRunner (lib/wp-cli.mjs) behaves: a non-zero exit throws unless
 * the call allows it, and `json` refuses what is not JSON. `intercept(args)` may answer first.
 */
function strictRunner(site, intercept = () => null) {
  const inner = site.wp.run
  const run = (args, o = {}) => {
    const r = intercept(args.map(String)) ?? inner(args, o)
    if (r.code !== 0 && !o.allowFail) throw new Error(`wp ${args.slice(0, 4).join(' ')} failed (${r.code}): ${r.stderr || r.stdout}`)
    return r
  }
  const out = (args, o) => run(args, o).stdout.trim()
  const json = (args, o) => {
    const text = out(args.some((a) => String(a).startsWith('--format=')) ? args : [...args, '--format=json'], o)
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch (e) {
      throw new Error(`wp ${args.slice(0, 3).join(' ')}: not JSON: ${text.slice(0, 200)}`)
    }
  }
  site.wp = { ...site.wp, run, out, json, phpEval: (code, o) => out(['eval', code], o) }
}

/** A site with users the seeder did not make: `admin` (install), `editorial` and `jane-doe` (an earlier seed, no identity). */
function foreignUsers(site) {
  site.users = new Map([
    [1, { ID: 1, user_login: 'admin', display_name: 'Site Owner', description: 'The owner' }],
    [2, { ID: 2, user_login: 'admin-joomla-user-42', display_name: 'Someone', description: '' }],
    [3, { ID: 3, user_login: 'editorial', display_name: 'Old Editorial', description: '' }],
    [4, { ID: 4, user_login: 'jane-doe', display_name: 'Jane (manual)', description: 'Hand made' }]
  ])
  site.userRoles = new Map([[1, ['administrator']], [2, ['editor']], [3, ['author']], [4, ['author']]])
  site.userEmails = new Map([[1, 'owner@example.com'], [2, 'someone@example.com'], [3, 'editorial@example.invalid'], [4, 'jane@example.com']])
  site.userMeta.set(1, { first_name: 'Site' })
  site.userMeta.set(4, { nickname: 'jane' })
  const id = site.nextId++
  site.posts.set(id, { ID: id, post_type: 'post', post_name: 'hello-world', post_title: 'Hello world', post_status: 'publish', post_author: 1, meta: {}, content: '' })
  const snap = () => JSON.stringify([1, 2, 3, 4].map((i) => [site.users.get(i), site.userRoles.get(i), site.userEmails.get(i), site.userMeta.get(i) ?? {}]).concat([site.posts.get(id).post_author]))
  return snap
}

test('#28 item 7: a user the seeder did not create is never adopted — not updated, not marked, given no post', async () => {
  const authors = [{ id: 'joomla-user-42', name: 'Joomla Admin', login: 'admin', description: 'Imported' }]
  const posts = [
    post('one', { author: { id: 'joomla-user-42', alias: '' } }),
    post('two', { author: { id: 'joomla-user-42', alias: 'Jane Doe' } }),
    post('three')
  ]
  const fx = seedFixture({ posts, authors, categories: NEWS })
  const site = fakeSite()
  const snap = foreignUsers(site)
  strictRunner(site)
  const before = snap()
  const report = await seed(site, fx)
  assert.equal(snap(), before, 'admin, the other users, their roles, meta and posts are as they were')
  const foreign = ['1', '2', '3', '4']
  assert.equal(site.calls.some((c) => c[0] === 'user' && ((c[1] === 'update' && foreign.includes(c[2])) || (c[1] === 'meta' && c[2] !== 'get' && c[2] !== 'list' && foreign.includes(c[3])))), false, 'no user command writes to them')
  const byOwner = (o) => [...site.users.values()].find((u) => site.userMeta.get(u.ID)?.tracy_source_author === o)
  const author = byOwner('joomla-user-42')
  const jane = byOwner('tracy:byline:jane-doe')
  const editorial = byOwner('tracy:editorial')
  assert.deepEqual([author.user_login, jane.user_login, editorial.user_login], ['admin-joomla-user-42-2', 'jane-doe-tracy', 'editorial-tracy'])
  assert.deepEqual([author.display_name, jane.display_name], ['Joomla Admin', 'Jane Doe'])
  assert.deepEqual(['one', 'two', 'three'].map((s) => site.post((p) => p.post_name === s).post_author), [author.ID, jane.ID, editorial.ID])
  const byIdentity = (list) => [...list].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  assert.deepEqual(
    byIdentity(report.authors.users.map((m) => [m.identity, m.login, m.user])),
    byIdentity([['joomla-user-42', author.user_login, author.ID], ['tracy:byline:jane-doe', jane.user_login, jane.ID], ['tracy:editorial', editorial.user_login, editorial.ID]]),
    'the report maps each identity to the login and user it got'
  )
  assert.ok(report.notes.some((n) => /login admin \(user #1, not the seeder's\), admin-joomla-user-42 \(user #2, not the seeder's\) belongs to another user; this author is admin-joomla-user-42-2/.test(n.note)))
  assert.ok(report.notes.some((n) => /login editorial \(user #3, not the seeder's\) belongs to another user; this author is editorial-tracy/.test(n.note)))

  // Seeded again, then renamed at the source: the seeder's users are found by identity, no new
  // user, and the others are still untouched.
  const size = site.users.size
  const again = await seed(site, fx)
  assert.equal(site.users.size, size)
  assert.deepEqual(again.counts.authors, { created: 0, updated: 0, skipped: 3 })
  fx.write('content.json', { ...readJson(join(fx.spec, 'content.json')), authors: [{ ...authors[0], name: 'Joomla Admin Renamed' }] })
  await seed(site, fx)
  assert.equal(site.users.size, size)
  assert.equal(site.users.get(author.ID).display_name, 'Joomla Admin Renamed')
  assert.equal(snap(), before)
})

test('#28 item 7: logins passed over for a foreign user are the same whatever order the authors come in', async () => {
  const run = async (order) => {
    const authors = [{ id: 'u-1', name: 'One', login: 'admin' }, { id: 'u-2', name: 'Two', login: 'admin-u-1' }]
    const fx = seedFixture({ posts: [post('one', { author: { id: 'u-1', alias: '' } }), post('two', { author: { id: 'u-2', alias: '' } })], authors: order ? authors : [...authors].reverse(), categories: NEWS })
    const site = fakeSite()
    const snap = foreignUsers(site)
    const before = snap()
    await seed(site, fx)
    assert.equal(snap(), before)
    const login = (o) => [...site.users.values()].find((u) => site.userMeta.get(u.ID)?.tracy_source_author === o).user_login
    return [login('u-1'), login('u-2')]
  }
  const forward = await run(true)
  assert.deepEqual(forward, ['admin-u-1-2', 'admin-u-1'], 'u-1 never takes the login u-2 starts from')
  assert.deepEqual(await run(false), forward)
})

test('#28 item 7: an ownership query that fails or answers nonsense stops the seed; a user that appears under the login is not taken', async () => {
  const authors = [{ id: 'joomla-user-42', name: 'Joomla Admin', login: 'admin' }]
  const make = () => seedFixture({ posts: [post('one', { author: { id: 'joomla-user-42', alias: '' } })], authors, categories: NEWS })
  for (const [label, answer] of [
    ['a failed query', { code: 1, stdout: '', stderr: 'Error: Error establishing a database connection.' }],
    ['a malformed answer', { code: 0, stdout: '{"ID":1}', stderr: '' }],
    ['no answer', { code: 0, stdout: '', stderr: '' }]
  ]) {
    const site = fakeSite()
    const snap = foreignUsers(site)
    const before = snap()
    strictRunner(site, (args) => (args[0] === 'user' && args[1] === 'list' && args.some((a) => a.startsWith('--meta_key=')) ? answer : null))
    await assert.rejects(seed(site, make()), /user list .*failed|did not answer a list/, label)
    assert.equal(snap(), before, label)
    assert.equal([...site.users.values()].length, 4, `${label}: no user created`)
  }
  // The login is free when looked at and taken when created (another process): the seed stops.
  const site = fakeSite()
  const snap = foreignUsers(site)
  strictRunner(site, (args) => {
    if (args[0] === 'user' && args[1] === 'create') site.users.set(99, { ID: 99, user_login: args[2], display_name: 'Racer', description: '' })
    return null
  })
  const before = snap()
  await assert.rejects(seed(site, make()), /user create .*already exists/)
  assert.equal(snap(), before)
  assert.deepEqual(site.users.get(99), { ID: 99, user_login: 'admin-joomla-user-42-2', display_name: 'Racer', description: '' })
  assert.equal(site.userMeta.get(99), undefined, 'the user that appeared is not marked')
})

test('#28 item 7: an author id in the seeder\'s own namespace is left out, never mistaken for its users', () => {
  const notes = []
  const declared = declaredAuthors([{ id: 'tracy:editorial', name: 'Fake' }, { id: 'tracy:byline:x', name: 'X' }, { id: 'ok', name: 'Ok' }], notes)
  assert.deepEqual([...declared.keys()], ['ok'])
  assert.equal(notes.filter((n) => /`tracy:` namespace/.test(n.note)).length, 2)
})

test('#28 item 7: each post is filed under its declared user', async () => {
  const authors = [{ id: 'joomla-user-50', name: 'Dev', login: 'jvadmin' }, { id: 'joomla-user-51', name: 'Dev', login: 'jvadmin' }]
  const fx = seedFixture({ posts: [post('one', { author: { id: 'joomla-user-50', alias: '' } }), post('two', { author: { id: 'joomla-user-51', alias: '' } })], authors, categories: NEWS })
  const site = fakeSite()
  await seed(site, fx)
  const users = [...site.users.values()]
  assert.deepEqual(users.map((u) => u.user_login).sort(), ['jvadmin-joomla-user-50', 'jvadmin-joomla-user-51'])
  const bySource = (id) => users.find((u) => site.userMeta.get(u.ID).tracy_source_author === id).ID
  assert.equal(site.post((p) => p.post_name === 'one').post_author, bySource('joomla-user-50'))
  assert.equal(site.post((p) => p.post_name === 'two').post_author, bySource('joomla-user-51'))
})

/** The joomla-min fixture with #__users and #__user_profiles rows (and columns a dump must never carry). */
function fixtureWithUsers({ users = true } = {}) {
  return fixtureWithArticleRoute((raw) => {
    if (!users) return
    raw.users = [
      { id: '42', name: 'Dev', username: 'jvadmin', block: '0', password: '$2y$10$secret', email: 'dev@example.com', otpKey: 'k' },
      { id: '43', name: 'Nobody', username: 'nobody', block: '0' }
    ]
    raw.user_profiles = [
      { user_id: '42', profile_key: 'profile.user_avatar', profile_value: '"images\\/joomlart\\/authors\\/item-1.jpg#joomlaImage:\\/\\/local-images\\/x.jpg"', ordering: '1' },
      { user_id: '42', profile_key: 'profile.phone', profile_value: '"555"', ordering: '2' }
    ]
  })
}

test('#28 item 7: from-joomla carries the authors the posts name — identity, name, username, picture — and nothing else of a user', () => {
  const { content, result } = pack(fixtureWithUsers())
  assert.deepEqual(content.authors, [
    {
      id: 'joomla-user-42',
      joomlaUserId: '42',
      name: 'Dev',
      login: 'jvadmin',
      avatar: 'images/joomlart/authors/item-1.jpg',
      avatarAlt: 'Dev',
      provenance: { name: '#__users.name', login: '#__users.username', avatar: '#__user_profiles.profile.user_avatar' }
    }
  ])
  assert.doesNotMatch(JSON.stringify(content), /secret|dev@example\.com/)
  // The contact page intentionally carries the contact's telephone, so the phone check covers author records only.
  assert.doesNotMatch(JSON.stringify({
    authors: content.authors,
    pageAuthors: content.pages.map((p) => p.author),
    postAuthors: content.posts.map((p) => p.author),
    archiveAuthors: content.archives.map((a) => a.author)
  }), /555/)
  assert.deepEqual(content.posts[0].author, { id: 'joomla-user-42', joomlaUserId: '42', alias: '' })
  assert.ok(result.notes.some((n) => /^authors: 1 from #__users/.test(n)))
  assert.ok(!result.notes.some((n) => /no #__users table/.test(n)))
  assert.deepEqual(joomlaAuthors({ users: [{ id: '9', name: ' A ', username: 'a', block: '1' }] }), [{ id: '9', name: 'A', username: 'a', blocked: true, avatar: null }])
})

test('#28 item 7: without #__users the pack is as before and says so', () => {
  const { content, result } = pack(fixtureWithUsers({ users: false }))
  assert.equal('authors' in content, false)
  assert.deepEqual(content.posts[0].author, { joomlaUserId: '42', alias: '' })
  assert.ok(result.notes.some((n) => /no #__users table/.test(n)))
})

// ── item 9: an archive's per-page count ─────────────────────────────────────────

const archiveCtx = () => ({
  patterns: { 'tracy/cards': `${CARDS_QUERY}\n<div class="wp-block-query tracy-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->` },
  terms: new Map([['news', { id: 5, slug: 'news', name: 'News' }]]),
  spec: { content: { categories: [{ title: 'News', wpSlug: 'news', description: '' }] } },
  descendants: () => [],
  categoryUrl: () => '/news',
  rewrite: (x) => x
})
const queryOf = (markup) => parseBlocks(markup).find((b) => b.name === 'core/query')

test('#28 item 9: a declared perPage reaches the query, and the query gets a pager', () => {
  for (const view of ['category', 'date', 'tag', 'author', 'search']) {
    const markup = buildArchiveContent({ path: '/news', view, category: 'news', perPage: 7 }, archiveCtx())
    const q = queryOf(markup)
    assert.equal(q.attrs.query.perPage, 7, view)
    assert.equal(findAll([q], (b) => b.name === 'core/query-pagination').length, 1, `${view}: one pager`)
    assert.match(markup, /<!-- wp:query-pagination-numbers \/-->/)
  }
})

test('#28 item 9: a pattern with its own pager keeps it; an undeclared perPage keeps 12 and the old bytes', () => {
  const ctx = archiveCtx()
  ctx.patterns['tracy/cards'] = ctx.patterns['tracy/cards'].replace('<!-- /wp:post-template -->', '<!-- /wp:post-template -->\n<!-- wp:query-pagination {"className":"own"} -->\n<!-- wp:query-pagination-next /-->\n<!-- /wp:query-pagination -->')
  const own = queryOf(buildArchiveContent({ path: '/news', view: 'category', category: 'news', perPage: 7 }, ctx))
  assert.deepEqual(findAll([own], (b) => b.name === 'core/query-pagination').map((b) => b.attrs.className), ['own'])
  const plain = buildArchiveContent({ path: '/news', view: 'category', category: 'news' }, archiveCtx())
  assert.equal(queryOf(plain).attrs.query.perPage, 12)
  assert.doesNotMatch(plain, /query-pagination/)
})

test('#28 item 9: a perPage that is not a positive integer is refused', () => {
  for (const bad of [0, -1, 1.5, '7', true]) assert.throws(() => archivePerPage({ path: '/news', perPage: bad }), /perPage must be a positive integer/, JSON.stringify(bad))
  assert.equal(archivePerPage({ path: '/news' }), null)
  assert.equal(archivePerPage({ path: '/news', perPage: null }), null)
})

test('#28 item 9: a seeded category archive pages at its declared count', async () => {
  const posts = Array.from({ length: 9 }, (_, i) => post(`p${i + 1}`))
  const archive = { file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 7 }
  const fx = seedFixture({ posts, categories: NEWS, archives: [archive] })
  const site = fakeSite()
  await seed(site, fx)
  const page = site.page((p) => p.post_name === 'news')
  const q = queryOf(page.content)
  assert.equal(q.attrs.query.perPage, 7)
  assert.equal(findAll([q], (b) => b.name === 'core/query-pagination').length, 1)
})

test('#28 item 9: archivePaging resolves leading + intro from the menu item, else the global options; links stay apart', () => {
  assert.deepEqual(archivePaging({ num_leading_articles: '1', num_intro_articles: '6', num_links: '' }, { num_links: '2' }, 'w'), {
    perPage: 7,
    leading: 1,
    intro: 6,
    links: 2,
    from: { leading: 'menu', intro: 'menu', links: 'global' },
    missing: []
  })
  assert.deepEqual(archivePaging({ num_intro_articles: '4' }, {}, 'w'), { perPage: null, missing: ['num_leading_articles', 'num_links'] })
  assert.throws(() => archivePaging({ num_leading_articles: 'x', num_intro_articles: '4' }, {}, 'menu item 1'), /menu item 1: "num_leading_articles" \(menu\) is "x"/)
})

/** The joomla-min fixture with the blog menu item's paging params and global options. */
function fixtureWithPaging(menuParams, global) {
  const dir = tmp('i28-paging-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  raw.menu.find((m) => m.id === '254').params = JSON.stringify(menuParams)
  writeFileSync(invPath, JSON.stringify(raw))
  const paramsPath = join(dir, 'content-params.json')
  writeFileSync(paramsPath, JSON.stringify({ ...readJson(paramsPath), ...global }))
  return dir
}

test('#28 item 9: from-joomla declares a category blog\'s perPage from its counts, never from the articles shown', () => {
  const blog = (r) => r.content.archives.find((a) => a.path === '/resources/blog')
  const set = pack(fixtureWithPaging({ num_leading_articles: '1', num_intro_articles: '6', num_links: '' }, { num_links: '2' }))
  assert.equal(blog(set).perPage, 7)
  assert.deepEqual(blog(set).paging, { leading: 1, intro: 6, links: 2, from: { leading: 'menu', intro: 'menu', links: 'global' } })
  assert.ok(set.result.notes.some((n) => /archive \/resources\/blog: 7 cards a page .* 2 link-only titles/.test(n)))
  const unset = pack(fixtureWithPaging({}, {}))
  assert.equal('perPage' in blog(unset), false, 'the fixture has 1 article in the category; that is not a limit')
  assert.ok(unset.result.notes.some((n) => /archive \/resources\/blog: num_leading_articles, num_intro_articles, num_links set neither by menu item 254/.test(n)))
})

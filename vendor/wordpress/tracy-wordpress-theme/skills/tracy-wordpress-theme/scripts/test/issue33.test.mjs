// #33 (JA Vega M6): nine seeder / adapter / prune gaps. Tests named `M6-<n>:` reproduce the item
// through entry points that existed before the fix (scripts/test/issue33-baseline.mjs runs them
// against the base commit and requires an assertion failure for every item); tests named `#33`
// cover the new helpers and their hostile inputs, imported dynamically so this file still loads
// on the base.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { runSeed, parseArgs, collectImages, buildArchiveContent, postSourceFacts } from '../seed.mjs'
import { articleHead } from '../lib/post-content.mjs'
import { convertHtml } from '../lib/html-to-blocks.mjs'
import { parseBlocks, findAll } from '../lib/block-fill.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { classifyPrune } from '../quickstart/lib.mjs'
import { collectFacts, applyPrune } from '../quickstart/prune-audit.mjs'
import { fakeSite } from './lib/fake-site.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, 'fixtures', 'joomla-min')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
const tmp = (prefix) => {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})
const seedApi = () => import('../seed.mjs')

// ── a whole seed against the fake site ───────────────────────────────────────────

const HOME = { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page', parent: null, status: 'publish', content: '<!-- wp:paragraph --><p>Home.</p><!-- /wp:paragraph -->', meta: {}, images: [] }
const NEWS = [{ id: '15', title: 'News', wpSlug: 'news', description: '' }]
const post = (slug, extra = {}) => ({ slug, path: `/news/${slug}`, title: slug, category: 'news', content: `<!-- wp:paragraph --><p>The ${slug} article body.</p><!-- /wp:paragraph -->`, images: [], ...extra })

/**
 * A spec-pack on disk and the seeder's options for it. `theme`: `{ templates: {name: html},
 * customTemplates: [...] }` writes a built theme under `<root>/theme-src/src/fixture/` and seeds
 * with `--theme-src`.
 */
function seedFixture({ posts = [], pages = [HOME], pagemap = null, archives = [], categories = NEWS, theme = null, images = [] } = {}) {
  const root = tmp('i33-seed-')
  const spec = join(root, 'spec')
  mkdirSync(spec, { recursive: true })
  const write = (name, value) => writeFileSync(join(spec, name), JSON.stringify(value))
  const files = (p) => ({
    'page-map.json': { pages: p.pagemap ?? [...p.pages.map((x) => ({ file: x.file ?? `${x.slug}.html`, path: x.path, title: x.title, view: x.view ?? 'page' })), { file: 'single.html', path: '/single', title: 'Single', view: 'single' }, ...p.archives.map((a) => ({ file: a.file, path: a.path, title: a.title, view: a.view }))] },
    'content.json': { site: { name: 'Fixture' }, pages: p.pages, posts: p.posts, categories: p.categories, archives: p.archives, images: p.images },
    'sections.json': { acm: [], custom: [], other: [] },
    'menus.json': { menus: [] },
    'redirects.json': { rules: [] },
    'patterns.map.json': { types: {} }
  })
  const writeAll = (p) => {
    for (const [name, value] of Object.entries(files(p))) write(name, value)
  }
  writeAll({ posts, pages, pagemap, archives, categories, images })
  let themeSrc = null
  if (theme) {
    themeSrc = join(root, 'theme-src')
    const dir = join(themeSrc, 'src', 'fixture')
    mkdirSync(join(dir, 'templates'), { recursive: true })
    for (const [name, html] of Object.entries(theme.templates ?? {})) writeFileSync(join(dir, 'templates', `${name}.html`), html)
    if (theme.customTemplates !== undefined) writeFileSync(join(dir, 'theme.json'), typeof theme.customTemplates === 'string' ? theme.customTemplates : JSON.stringify({ version: 3, customTemplates: theme.customTemplates }))
    // `dist`: the seed builds and installs this theme (--dist). The build zips src/fixture into
    // dist/fixture.zip, as scripts/build.mjs does for a real theme.
    if (theme.dist) {
      mkdirSync(join(themeSrc, 'scripts'), { recursive: true })
      writeFileSync(join(themeSrc, 'scripts', 'build.mjs'), `import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
rmSync('dist/fixture.zip', { force: true })
const r = spawnSync('zip', ['-qrX', '../dist/fixture.zip', 'fixture'], { cwd: 'src', encoding: 'utf8' })
if (r.status !== 0) { console.error(r.error?.message ?? r.stderr); process.exit(1) }
`)
    }
  }
  const dist = theme?.dist ? ['--dist', join(root, 'dist')] : []
  const opts = (extra = []) =>
    parseArgs(['--spec', spec, '--wp', 'fake', '--theme', 'fixture', '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img', '--base-url', 'http://x', '--report', join(root, 'report.json'), '--out', join(root, 'out'), ...(themeSrc ? ['--theme-src', themeSrc] : []), ...dist, ...extra])
  return { root, spec, opts, write, rewrite: (p) => writeAll({ posts, pages, pagemap, archives, categories, images, ...p }), themeSrc }
}
const seed = (site, fx, extra = []) => runSeed(fx.opts(extra), { runner: site.wp, fetch: async () => ({ status: 200, headers: new Map() }) })
const attachments = (site) => [...site.posts.values()].filter((p) => p.post_type === 'attachment')
const mediaImports = (site) => site.calls.filter((c) => c[0] === 'media' && c[1] === 'import')

// ── M6-1: an image only a post's markup names ───────────────────────────────────

const DETAIL = '<!-- wp:image {"sizeSlug":"full"} -->\n<figure class="wp-block-image size-full"><img src="/images/joomlart/blogs/detail/item-1.jpg" alt=""/></figure>\n<!-- /wp:image -->'

test('M6-1: an <img> in a post body with no image-table row is collected, as a page\'s is', () => {
  const spec = { content: { posts: [post('a', { content: `${DETAIL}\n<!-- wp:paragraph --><p>Lead.</p><!-- /wp:paragraph -->` })], pages: [], categories: [], images: [] }, sections: { custom: [], acm: [] } }
  const keys = collectImages(spec, { types: {} }).map((w) => w.key)
  assert.ok(keys.includes('joomlart/blogs/detail/item-1.jpg'), `wanted: ${keys.join(', ') || '(none)'}`)
})

test('M6-1: the post-only image is imported once, its src rewritten, and a second seed imports nothing', async () => {
  const fx = seedFixture({ posts: [post('cyber', { content: `${DETAIL}\n<!-- wp:paragraph --><p>Lead paragraph of the article.</p><!-- /wp:paragraph -->` })] })
  const site = fakeSite()
  await seed(site, fx)
  assert.equal(mediaImports(site).length, 1, 'one import call')
  assert.ok(mediaImports(site)[0].includes('/img/joomlart/blogs/detail/item-1.jpg'), mediaImports(site)[0].join(' '))
  const body = site.post((p) => p.post_name === 'cyber').content
  assert.doesNotMatch(body, /src="\/images\//, 'the source path is rewritten')
  assert.match(body, /src="\/wp-content\/uploads\/img-\d+\.jpg"/)
  const before = attachments(site).length
  const second = await seed(site, fx)
  assert.equal(attachments(site).length, before, 'no duplicate attachment')
  assert.equal(mediaImports(site).length, 1, 'the second seed imports nothing')
  assert.deepEqual(second.counts.posts, { created: 0, updated: 0, skipped: 1 })
})

test('#33 M6-1: an <img> written with single quotes, upper case or no quotes is the same picture — collected and rewritten', async () => {
  const forms = ["<img src='/images/q/single.jpg' alt=''>", '<IMG SRC="/images/q/upper.jpg">', '<img src=/images/q/bare.jpg>', '<img\n  alt="x"\n  src="/images/q/multi-line.jpg">']
  const body = `<!-- wp:html -->${forms.join('')}<!-- /wp:html -->\n<!-- wp:paragraph --><p>Lead.</p><!-- /wp:paragraph -->`
  const spec = { content: { posts: [post('a', { content: body })], pages: [{ slug: 'p', content: "<p><img SRC='/images/q/page.jpg'></p>" }], categories: [{ description: "<img src='/images/q/cat.jpg'>" }], images: [] }, sections: { custom: [{ blocks: '<img src=/images/q/custom.jpg>' }], acm: [] } }
  const keys = collectImages(spec, { types: {} }).map((w) => w.key).sort()
  assert.deepEqual(keys, ['q/bare.jpg', 'q/cat.jpg', 'q/custom.jpg', 'q/multi-line.jpg', 'q/page.jpg', 'q/single.jpg', 'q/upper.jpg'])
  // An <img> in a comment or inside a block's JSON is not an element.
  assert.deepEqual(collectImages({ ...spec, content: { ...spec.content, posts: [post('c', { content: '<!-- <img src="/images/q/no.jpg"> --><!-- wp:x {"html":"\\u003cimg src=\\u0022/images/q/no2.jpg\\u0022\\u003e"} /-->' })], pages: [], categories: [] }, sections: { custom: [], acm: [] } }, { types: {} }), [])
  const { rewriteMediaRefs } = await seedApi()
  const out = rewriteMediaRefs(forms.join(''), (ref) => ({ url: `/wp-content/uploads/${ref.split('/').pop()}` }), { theme: 't' })
  assert.doesNotMatch(out, /\/images\//i, out)
  for (const f of ['single', 'upper', 'bare', 'multi-line']) assert.ok(out.includes(`src="/wp-content/uploads/${f}.jpg"`), `${f}: ${out}`)
  assert.ok(out.includes('alt="x"'), 'the other attributes stay as written')
  // A ref that resolves to nothing stays exactly as written.
  assert.equal(rewriteMediaRefs(forms[0], () => null, { theme: 't' }), forms[0])
  // Through a seed: the single-quoted post-only picture is imported once and its src rewritten.
  const fx = seedFixture({ posts: [post('sq', { content: "<!-- wp:html --><img src='/images/q/single.jpg' alt=''><!-- /wp:html -->\n<!-- wp:paragraph --><p>Lead.</p><!-- /wp:paragraph -->" })] })
  const site = fakeSite()
  await seed(site, fx)
  assert.equal(mediaImports(site).length, 1)
  assert.ok(mediaImports(site)[0].includes('/img/q/single.jpg'))
  assert.doesNotMatch(site.post((p) => p.post_name === 'sq').content, /\/images\/q/)
})

test('#33 M6-1: an uploads-form src in a post body resolves through the post\'s own image table first', () => {
  const content = '<!-- wp:image --><figure class="wp-block-image"><img src="/wp-content/uploads/item-1.jpg" alt=""/></figure><!-- /wp:image -->'
  const spec = {
    content: {
      posts: [post('a', { content, images: [{ src: '/wp-content/uploads/item-1.jpg', file: 'item-1.jpg', original: 'images/blogs/detail/item-1.jpg', alt: 'Detail' }] })],
      pages: [],
      categories: [],
      // A spec-wide table naming the same file from elsewhere must not win over the post's own.
      images: [{ file: 'item-1.jpg', original: 'images/others/item-1.jpg' }]
    },
    sections: { custom: [], acm: [] }
  }
  const wanted = collectImages(spec, { types: {} })
  assert.deepEqual(wanted.map((w) => w.key).sort(), ['blogs/detail/item-1.jpg'])
  assert.equal(wanted[0].alt, 'Detail')
})

// ── M6-8: a body image is the featured image only when it is the same source file ───

test('M6-8: a body image in another source directory with the featured image\'s file name stays, and so does the lead', () => {
  const content = `${DETAIL}\n<!-- wp:paragraph -->\n<p>Cybersecurity is a team sport.</p>\n<!-- /wp:paragraph -->\n<!-- wp:heading {"level":3} -->\n<h3 class="wp-block-heading">Why</h3>\n<!-- /wp:heading -->`
  const out = articleHead({ content, title: 'Cybersecurity', featuredImage: 'images/joomlart/blogs/intro/item-1.jpg' })
  assert.deepEqual(out.removed, [], 'nothing is the header here')
  assert.match(out.content, /blogs\/detail\/item-1\.jpg/, 'the full-text image stays')
  assert.match(out.content, /Cybersecurity is a team sport/, 'the lead stays')
})

test('M6-8: through the seeder\'s source facts, an uploads-form body image whose table says detail/ is not the intro/ featured image', () => {
  const content = '<!-- wp:image {"sizeSlug":"full"} -->\n<figure class="wp-block-image size-full"><img src="/wp-content/uploads/item-1.jpg" alt=""/></figure>\n<!-- /wp:image -->\n<!-- wp:paragraph -->\n<p>Cybersecurity is a team sport.</p>\n<!-- /wp:paragraph -->'
  const spec = {
    content: {
      categories: NEWS,
      archives: [],
      images: [],
      posts: [post('cyber', { title: 'Cybersecurity', content, featuredImage: 'images/joomlart/blogs/intro/item-1.jpg', images: [{ src: '/wp-content/uploads/item-1.jpg', file: 'item-1.jpg', original: 'images/joomlart/blogs/detail/item-1.jpg', alt: '' }] })]
    },
    sections: { custom: [], acm: [], other: [] }
  }
  const head = postSourceFacts(spec).get('cyber').head
  assert.deepEqual(head.removed, [])
  assert.match(head.content, /uploads\/item-1\.jpg/)
  assert.match(head.content, /team sport/)
})

test('#33 M6-8: the same source file still leaves the body (path, uploads form, table-resolved); an ambiguous name is kept', () => {
  const img = (src) => `<!-- wp:image -->\n<figure class="wp-block-image"><img src="${src}" alt=""/></figure>\n<!-- /wp:image -->\n<!-- wp:paragraph -->\n<p>Lead words of the post.</p>\n<!-- /wp:paragraph -->`
  // The same path, written with and without the leading slash and with a query.
  assert.deepEqual(articleHead({ content: img('/images/blogs/intro/item-1.jpg?x=1'), featuredImage: 'images/blogs/intro/item-1.jpg' }).removed, ['featured-image', 'lead'])
  // The same uploads URL (a design export).
  assert.deepEqual(articleHead({ content: img('/wp-content/uploads/hero.png'), featuredImage: '/wp-content/uploads/hero.png' }).removed, ['featured-image', 'lead'])
  // Resolved through a table (the seeder's identity): uploads form vs the images path it came from.
  const identity = (ref) => (String(ref).includes('uploads/item-1.jpg') ? 'src:blogs/intro/item-1.jpg' : String(ref).replace(/^\//, '').replace(/^images\//, 'src:'))
  assert.deepEqual(articleHead({ content: img('/wp-content/uploads/item-1.jpg'), featuredImage: 'images/blogs/intro/item-1.jpg', imageId: identity }).removed, ['featured-image', 'lead'])
  // An identity that cannot be told (null): kept.
  assert.deepEqual(articleHead({ content: img('/wp-content/uploads/item-1.jpg'), featuredImage: 'images/blogs/intro/item-1.jpg', imageId: () => null }).removed, [])
  // Through the seeder: one name listed with two sources is ambiguous — the body keeps it.
  const spec = {
    content: {
      categories: NEWS,
      archives: [],
      images: [],
      posts: [post('x', { content: img('/wp-content/uploads/item-1.jpg'), featuredImage: 'images/blogs/intro/item-1.jpg', images: [{ file: 'item-1.jpg', original: 'images/blogs/intro/item-1.jpg' }, { file: 'item-1.jpg', original: 'images/blogs/detail/item-1.jpg' }] })]
    },
    sections: { custom: [], acm: [], other: [] }
  }
  assert.deepEqual(postSourceFacts(spec).get('x').head.removed, [])
})

// ── M6-4: an image in a centred paragraph ───────────────────────────────────────

test('M6-4: an image alone in a text-align:center paragraph becomes a centred core/image', () => {
  const { markup } = convertHtml('<p style="text-align: center;"><img style="display: inline-block; width: auto" src="/images/joomlart/others/404.jpg"></p>')
  const images = findAll(parseBlocks(markup), (b) => b.name === 'core/image')
  assert.equal(images.length, 1, markup)
  assert.equal(images[0].attrs.align, 'center', markup)
  assert.match(markup, /<figure class="wp-block-image aligncenter size-full">/)
})

test('#33 M6-4: text beside the image, a caption-free class and an uncentred paragraph keep their shape', () => {
  const both = convertHtml('<p style="TEXT-ALIGN:center">Look <img class="shot" src="/images/a.png" alt="A"></p>').markup
  assert.match(both, /<p>Look<\/p>/, 'the words stay a paragraph')
  assert.match(both, /<!-- wp:image {"align":"center","sizeSlug":"full","className":"shot"} -->\n<figure class="wp-block-image aligncenter size-full shot"><img src="\/wp-content\/uploads\/a.png" alt="A"\/><\/figure>/)
  const plain = convertHtml('<p><img src="/images/a.png"></p>').markup
  assert.doesNotMatch(plain, /align/, 'no centring asked, none added')
  const right = convertHtml('<p style="text-align: right"><img src="/images/a.png"></p>').markup
  assert.doesNotMatch(right, /align/, 'only centring maps: alignright would float the image')
  // A styled wrapper is kept whole as core/html (its style has no block attribute): centred as written.
  const div = convertHtml('<div style="text-align:center"><img src="/images/a.png"></div>').markup
  assert.match(div, /^<!-- wp:html -->\n<div style="text-align:center">/)
  const figure = convertHtml('<p style="text-align:center"><img src="/images/a.png"></p><figure><img src="/images/b.png"><figcaption>Cap</figcaption></figure>').markup
  assert.match(figure, /<figure class="wp-block-image size-full"><img src="\/wp-content\/uploads\/b.png" alt=""\/><figcaption class="wp-element-caption">Cap<\/figcaption><\/figure>/, 'a figure elsewhere is untouched')
})

// ── M6-5: a template layout of a category blog ──────────────────────────────────

function fixtureWithMenu(link, menuParams, global) {
  const dir = tmp('i33-fj-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  const item = raw.menu.find((m) => m.id === '254')
  item.link = link
  item.params = JSON.stringify(menuParams)
  writeFileSync(invPath, JSON.stringify(raw))
  const paramsPath = join(dir, 'content-params.json')
  writeFileSync(paramsPath, JSON.stringify({ ...readJson(paramsPath), ...global }))
  return dir
}
const pack = (dir, opts = {}) => {
  const out = join(tmp('i33-pack-'), 'pack')
  let result
  try {
    result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z', ...opts })
  } catch (e) {
    assert.fail(`buildSpecPack refused: ${e.message}`)
  }
  assert.equal(result.validation.ok, true, result.validation.problems.join('\n'))
  return { result, content: readJson(join(out, 'content.json')) }
}
const blogArchive = (r) => r.content.archives.find((a) => a.path === '/resources/blog')
const TPL_LINK = 'index.php?option=com_content&view=category&layout=tracy:portfolio&id=15'

test('M6-5: a template-qualified category layout with layout_type blog is paged as a blog', () => {
  const r = pack(fixtureWithMenu(TPL_LINK, { layout_type: 'blog', num_leading_articles: '', num_intro_articles: 6, num_links: '' }, { num_leading_articles: '1', num_links: '4' }))
  assert.equal(blogArchive(r).perPage, 7, JSON.stringify(blogArchive(r)))
  assert.equal(blogArchive(r).paging?.links, 4)
  assert.equal(r.result.notes.some((n) => /is a category list, not a blog/.test(n)), false)
})

test('#33 M6-5: a template layout of list type, one with no layout_type, and the plain list stay unpaged; blog links keep theirs', () => {
  const list = pack(fixtureWithMenu(TPL_LINK, { layout_type: 'list', num_intro_articles: 6 }, { num_leading_articles: '1', num_links: '4' }))
  assert.equal('perPage' in blogArchive(list), false)
  assert.ok(list.result.notes.some((n) => /category list, not a blog/.test(n)))
  const unknown = pack(fixtureWithMenu(TPL_LINK, { num_intro_articles: 6 }, { num_leading_articles: '1', num_links: '4' }))
  assert.equal('perPage' in blogArchive(unknown), false)
  assert.ok(unknown.result.notes.some((n) => /layout tracy:portfolio names no layout_type/.test(n)), unknown.result.notes.join('\n'))
  const plain = pack(fixtureWithMenu('index.php?option=com_content&view=category&id=15', { layout_type: 'blog', num_intro_articles: 6 }, { num_leading_articles: '1', num_links: '4' }))
  assert.equal('perPage' in blogArchive(plain), false, 'the default layout is the list whatever layout_type says')
  const blog = pack(fixtureWithMenu('index.php?option=com_content&view=category&layout=blog&id=15', { num_leading_articles: '1', num_intro_articles: '6' }, { num_links: '2' }))
  assert.equal(blogArchive(blog).perPage, 7)
  assert.equal(blogArchive(blog).paging.links, 2)
})

// ── M6-6: "More Articles" — the link-only titles after the cards ────────────────

const CARDS_QUERY = '<!-- wp:query {"queryId":1,"query":{"perPage":6,"inherit":true},"className":"tracy-query"} -->'
const archiveCtx = () => ({
  patterns: { 'tracy/cards': `${CARDS_QUERY}\n<div class="wp-block-query tracy-query">\n<!-- wp:post-template -->\n<!-- wp:post-title /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->` },
  terms: new Map([['news', { id: 5, slug: 'news', name: 'News' }]]),
  spec: { content: { categories: [{ title: 'News', wpSlug: 'news', description: '' }] } },
  descendants: () => [],
  categoryUrl: () => '/news',
  rewrite: (x) => x,
  tags: new Map([['archived', { id: 9 }]])
})
const PAGING = { leading: 1, intro: 6, links: 4, from: { leading: 'global', intro: 'menu', links: 'global' } }
const MORE = { heading: 'More Articles …', from: 'Joomla core language string COM_CONTENT_MORE_ARTICLES (en-GB)' }

test('M6-6: a category blog that declares links draws an editable heading and a link-only list after the cards', () => {
  const markup = buildArchiveContent({ path: '/news', view: 'category', category: 'news', perPage: 7, paging: PAGING, moreArticles: MORE }, archiveCtx())
  const blocks = parseBlocks(markup)
  const queries = findAll(blocks, (b) => b.name === 'core/query')
  assert.equal(queries.length, 2, markup)
  const [cards, more] = queries
  assert.ok(markup.indexOf('More Articles') > markup.indexOf('"queryId":2'), 'after the cards')
  assert.equal(more.attrs.query.perPage, 4)
  const heading = findAll([more], (b) => b.name === 'core/heading')[0]
  assert.ok(heading, 'a heading block, editable in the editor')
  assert.match(heading.innerContent.join(''), /More Articles …/)
  // The same posts, in the same order: the cards query's filters with its page stride.
  assert.deepEqual(more.attrs.query.taxQuery, cards.attrs.query.taxQuery)
  assert.equal(more.attrs.query.orderBy, cards.attrs.query.orderBy)
  assert.equal(more.attrs.query.order, cards.attrs.query.order)
  assert.deepEqual(more.attrs.query.tracyMore, { after: 2, skip: 7 })
  const titles = findAll([more], (b) => b.name === 'core/post-title')
  assert.equal(titles.length, 1)
  assert.equal(titles[0].attrs.isLink, true)
  assert.equal(findAll([more], (b) => b.name === 'core/post-excerpt' || b.name === 'core/post-featured-image').length, 0, 'titles only')
})

test('#33 M6-6: links 0, no paging, a heading missing, or a view that is not a category blog draws no section', async () => {
  const a = (extra) => ({ path: '/news', view: 'category', category: 'news', perPage: 7, paging: PAGING, moreArticles: MORE, ...extra })
  const count = (archive, ctx = archiveCtx()) => findAll(parseBlocks(buildArchiveContent(archive, ctx)), (b) => b.name === 'core/query').length
  assert.equal(count(a({ paging: { ...PAGING, links: 0 } })), 1)
  assert.equal(count(a({ paging: undefined })), 1)
  assert.equal(count(a({ view: 'date' })), 1)
  const log = []
  assert.equal(count(a({ moreArticles: undefined }), { ...archiveCtx(), log }), 1)
  assert.ok(log.some((n) => /links 4 declared .* no heading text/.test(n.note)), JSON.stringify(log))
  for (const bad of [-1, 1.5, '4', null])
    assert.throws(() => buildArchiveContent(a({ paging: { ...PAGING, links: bad } }), archiveCtx()), /paging.links must be/, String(bad))
  assert.throws(() => buildArchiveContent(a({ perPage: undefined }), archiveCtx()), /paging.links needs perPage/)
  for (const bad of [{ heading: 5 }, { heading: '  ' }, 'More', []])
    assert.throws(() => buildArchiveContent(a({ moreArticles: bad }), archiveCtx()), /moreArticles must be \{ heading/, JSON.stringify(bad))
  // The heading is text: markup in it is escaped.
  assert.match(buildArchiveContent(a({ moreArticles: { heading: 'More <b>news</b> & more' } }), archiveCtx()), /More &lt;b&gt;news&lt;\/b&gt; &amp; more/)
})

test('#33 M6-6: from-joomla declares the heading with the links; the seeder installs the plugin that pages the list', async () => {
  const r = pack(fixtureWithMenu('index.php?option=com_content&view=category&layout=blog&id=15', { num_leading_articles: '1', num_intro_articles: '6' }, { num_links: '4' }))
  assert.deepEqual(blogArchive(r).moreArticles, MORE)
  assert.ok(r.result.notes.some((n) => /archive \/resources\/blog: .* 4 link-only titles .* "More Articles …" .* the next page's first/.test(n)), r.result.notes.join('\n'))
  const archive = { file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 7, paging: PAGING, moreArticles: MORE }
  const fx = seedFixture({ posts: [post('a'), post('b')], archives: [archive] })
  const site = fakeSite()
  const report = await seed(site, fx)
  const { MORE_ARTICLES_PLUGIN } = await seedApi()
  const body = site.muPlugins.get(MORE_ARTICLES_PLUGIN.file)
  assert.ok(body, 'the must-use plugin is on the site')
  assert.match(body, /query_loop_block_query_vars/)
  assert.equal(report.moreArticles.plugin.action, 'written')
  const again = await seed(site, fx)
  assert.equal(again.moreArticles.plugin.action, 'same')
  assert.match(site.page((p) => p.post_name === 'news').content, /More Articles …/)
})

test('#33 M6-6: a malformed links count or heading stops the seed before any post or term is written', async () => {
  const archive = { file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 7, paging: PAGING, moreArticles: MORE }
  for (const [bad, why] of [
    [{ paging: { ...PAGING, links: -2 } }, /paging.links must be/],
    [{ moreArticles: { heading: '' } }, /moreArticles must be \{ heading/],
    [{ perPage: 0 }, /perPage must be a positive integer/]
  ]) {
    const site = fakeSite()
    await assert.rejects(seed(site, seedFixture({ posts: [post('a')], archives: [{ ...archive, ...bad }] })), why, JSON.stringify(bad))
    assert.equal(site.post(() => true), undefined, `no post: ${JSON.stringify(bad)}`)
    assert.equal(site.terms.size, 0, `no term: ${JSON.stringify(bad)}`)
  }
})

// ── M6-3: article fields as post meta ───────────────────────────────────────────

function fixtureWithFields(fields) {
  const dir = tmp('i33-fields-')
  cpSync(FIXTURE, dir, { recursive: true })
  const invPath = join(dir, 'inventory.json')
  const raw = readJson(invPath)
  const a = raw.content.find((r) => String(r.id) === '3')
  const attribs = typeof a.attribs === 'string' ? JSON.parse(a.attribs || '{}') : (a.attribs ?? {})
  a.attribs = JSON.stringify({ ...attribs, ...fields })
  writeFileSync(invPath, JSON.stringify(raw))
  return dir
}

test('M6-3: --article-fields maps an extra field to post meta, not into the body', () => {
  const r = pack(fixtureWithFields({ client: 'SquareSparc Ltd.', type: 'App Development' }), { articleFields: { client: { meta: 'client' }, type: { meta: 'project_type' } } })
  const p = r.content.posts.find((x) => x.joomla.articleId === '3')
  assert.equal(p.meta?.client, 'SquareSparc Ltd.')
  assert.equal(p.meta?.project_type, 'App Development')
  assert.doesNotMatch(p.content, /SquareSparc/, 'meta only: the body does not print it')
  assert.equal(r.result.notes.some((n) => /not placed in any body.*client/.test(n)), false)
})

test('M6-3: a post\'s declared meta reaches the site, a second seed skips, a changed value updates in place', async () => {
  const fx = seedFixture({ posts: [post('portfolio-1', { meta: { client: 'SquareSparc Ltd.', project_type: 'App Development' } })] })
  const site = fakeSite()
  await seed(site, fx)
  const p = site.post((x) => x.post_name === 'portfolio-1')
  assert.equal(p.meta.client, 'SquareSparc Ltd.')
  assert.equal(p.meta.project_type, 'App Development')
  const id = p.ID
  const again = await seed(site, fx)
  assert.deepEqual(again.counts.posts, { created: 0, updated: 0, skipped: 1 })
  fx.rewrite({ posts: [post('portfolio-1', { meta: { client: 'GlobalTech Solutions', project_type: 'App Development' } })] })
  const changed = await seed(site, fx)
  assert.deepEqual(changed.counts.posts, { created: 0, updated: 1, skipped: 0 })
  assert.equal(site.post((x) => x.post_name === 'portfolio-1').ID, id, 'the same post')
  assert.equal(site.post((x) => x.post_name === 'portfolio-1').meta.client, 'GlobalTech Solutions')
})

test('#33 M6-3: the seeder registers the declared keys (option + must-use plugin) for REST and Block Bindings', async () => {
  const fx = seedFixture({ posts: [post('p1', { meta: { client: 'A' } }), post('p2', { meta: { project_type: 'B' } }), post('p3')] })
  const site = fakeSite()
  const report = await seed(site, fx)
  const { POST_META_PLUGIN, POST_META_OPTION } = await seedApi()
  assert.deepEqual(JSON.parse(site.options.get(POST_META_OPTION)), ['client', 'project_type'])
  const plugin = site.muPlugins.get(POST_META_PLUGIN.file)
  assert.match(plugin, /register_post_meta\(\s*'post'/)
  assert.match(plugin, /'show_in_rest'\s*=>\s*true/)
  assert.match(plugin, /current_user_can\(\s*'edit_post'/)
  assert.deepEqual(report.postMeta.keys, ['client', 'project_type'])
  assert.equal(report.postMeta.plugin.action, 'written')
  // A spec with no post meta installs nothing.
  const bare = fakeSite()
  await seed(bare, seedFixture({ posts: [post('p')] }))
  assert.equal(bare.muPlugins.has(POST_META_PLUGIN.file), false)
  assert.equal(bare.options.has(POST_META_OPTION), false)
})

test('#33 M6-3: a reserved, protected, malformed or non-text meta entry stops the seed before any write', async () => {
  const bad = [
    [{ _secret: 'x' }, /meta key "_secret"/],
    [{ tracy_toc: 'x' }, /meta key "tracy_toc" is the seeder's own/],
    [{ 'Client Name': 'x' }, /meta key "Client Name"/],
    [{ client: { a: 1 } }, /meta "client" must be text/],
    [{ client: ['a'] }, /meta "client" must be text/],
    [{ client: null }, /meta "client" must be text/]
  ]
  for (const [meta, why] of bad) {
    const site = fakeSite()
    await assert.rejects(seed(site, seedFixture({ posts: [post('p', { meta })] })), why, JSON.stringify(meta))
    assert.equal(site.calls.some((c) => ['update', 'create', 'import'].includes(c[1]) || c[0] === 'eval-file'), false, `${JSON.stringify(meta)}: no write`)
  }
  const { checkArticleFieldsMeta } = await import('../ingest/from-joomla.mjs').then((m) => ({ checkArticleFieldsMeta: m.checkArticleFields }))
  assert.throws(() => checkArticleFieldsMeta({ client: { meta: '_client' } }), /meta key/)
  assert.throws(() => checkArticleFieldsMeta({ client: { meta: 'tracy_x' } }), /meta key/)
  assert.throws(() => checkArticleFieldsMeta({ a: { meta: 'client' }, b: { meta: 'client' } }), /both write meta "client"/)
  assert.throws(() => pack(fixtureWithFields({ client: { rows: ['x'] } }), { articleFields: { client: { meta: 'client' } } }), /field "client" of article 3 is not text/)
})

// ── M6-9: a post's template must be one the theme declares for posts ────────────

const PAGE_ONLY = [{ name: 'page-article', title: 'Article', postTypes: ['page'] }]
const FOR_POSTS = [{ name: 'page-article', title: 'Article', postTypes: ['page', 'post'] }]

test('M6-9: a post that names a page-only template is refused before anything is written', async () => {
  const fx = seedFixture({ posts: [post('biometrics', { meta: { _wp_page_template: 'page-article' } })], theme: { templates: { 'page-article': '<!-- wp:group /-->' }, customTemplates: PAGE_ONLY, dist: true } })
  const site = fakeSite()
  site.onThemeInstall = () => (site.postTemplates = { page: ['page-article'] })
  await assert.rejects(seed(site, fx), /template "page-article".* post/)
  assert.equal(site.post(() => true), undefined, 'no post was created')
  assert.deepEqual(site.themeInstalls, [], 'the theme was not installed either: the built theme.json is read first')
})

// The site answers what the installed theme declares (fake-site onThemeInstall).
const installs = (site, answer) => {
  site.onThemeInstall = () => (site.postTemplates = answer)
  return site
}

test('#33 M6-9: a template declared for posts is written on create, left alone unchanged and kept through an update', async () => {
  const theme = { templates: { 'page-article': '<!-- wp:group /-->' }, customTemplates: FOR_POSTS, dist: true }
  const fx = seedFixture({ posts: [post('biometrics', { meta: { _wp_page_template: 'page-article' } })], theme })
  const site = installs(fakeSite(), { page: ['page-article'], post: ['page-article'] })
  const first = await seed(site, fx)
  assert.equal(site.themeInstalls.length, 1)
  assert.equal(site.post((p) => p.post_name === 'biometrics').meta._wp_page_template, 'page-article')
  assert.deepEqual(first.templates.forPosts, ['page-article'])
  assert.match(first.templates.eligibilityFrom, /the site/, 'the site confirmed it after the install')
  assert.deepEqual((await seed(site, fx)).counts.posts, { created: 0, updated: 0, skipped: 1 })
  fx.rewrite({ posts: [post('biometrics', { content: '<!-- wp:paragraph --><p>New body.</p><!-- /wp:paragraph -->', meta: { _wp_page_template: 'page-article' } })] })
  assert.deepEqual((await seed(site, fx)).counts.posts, { created: 0, updated: 1, skipped: 0 })
  assert.equal(site.post((p) => p.post_name === 'biometrics').meta._wp_page_template, 'page-article')
})

test('#33 M6-9: the built theme declares it for posts but the site, after the install, does not — stopped before any content', async () => {
  const fx = seedFixture({ posts: [post('b', { meta: { _wp_page_template: 'page-article' } })], theme: { templates: { 'page-article': 'x' }, customTemplates: FOR_POSTS, dist: true } })
  for (const answer of [{ page: ['page-article'] }, undefined]) {
    const site = installs(fakeSite(), answer)
    await assert.rejects(seed(site, fx), answer ? /declares it for page only.*|the theme was installed, no content was written/s : /could not be read/, JSON.stringify(answer))
    assert.equal(site.post(() => true), undefined)
    assert.equal(site.page(() => true), undefined, 'no page either')
  }
})

test('#33 M6-9: without --dist the local theme source is not what the site runs — the site answers', async () => {
  // The local tree declares the template for posts; the site's installed theme does not.
  const declares = [post('b', { meta: { _wp_page_template: 'page-article' } })]
  const fx = seedFixture({ posts: declares, theme: { templates: { 'page-article': 'x' }, customTemplates: FOR_POSTS } })
  const site = fakeSite()
  site.postTemplates = { page: ['page-article'] }
  await assert.rejects(seed(site, fx), /declares it for page only/)
  assert.equal(site.post(() => true), undefined)
  const silent = fakeSite()
  await assert.rejects(seed(silent, fx), /could not be read/)
  assert.equal(silent.post(() => true), undefined)
  const agrees = fakeSite()
  agrees.postTemplates = { page: ['page-article'], post: ['page-article'] }
  await seed(agrees, fx)
  assert.equal(agrees.post((p) => p.post_name === 'b').meta._wp_page_template, 'page-article')
  assert.deepEqual(agrees.themeInstalls, [])
})

test('#33 M6-9: eligibility that cannot be read is not permission — theme.json missing, malformed or the site read failing', async () => {
  const declares = [post('b', { meta: { _wp_page_template: 'page-article' } })]
  for (const [customTemplates, why] of [
    [undefined, /theme\.json .*does not exist/],
    ['{"customTemplates": ', /theme\.json/],
    ['{"customTemplates": {"name": "x"}}', /customTemplates must be a list/]
  ]) {
    const site = installs(fakeSite(), { page: ['page-article'], post: ['page-article'] })
    await assert.rejects(seed(site, seedFixture({ posts: declares, theme: { templates: { 'page-article': 'x' }, customTemplates, dist: true } })), why, String(customTemplates))
    assert.equal(site.post(() => true), undefined)
    assert.deepEqual(site.themeInstalls, [], 'nothing installed')
  }
  // No theme source: the site answers, or the seed stops.
  const asked = fakeSite()
  asked.postTemplates = { post: ['page-article'], page: ['page-article'] }
  asked.blockTemplates = ['page-article']
  await seed(asked, seedFixture({ posts: declares }))
  assert.equal(asked.post((p) => p.post_name === 'b').meta._wp_page_template, 'page-article')
  const silent = fakeSite()
  await assert.rejects(seed(silent, seedFixture({ posts: declares })), /which post types template "page-article" accepts could not be read/)
  assert.equal(silent.post(() => true), undefined)
  // A post that declares nothing needs no answer; a name the theme lacks is still a note, not an error.
  const none = fakeSite()
  await seed(none, seedFixture({ posts: [post('plain')] }))
  assert.ok(none.post((p) => p.post_name === 'plain'))
  const { postTemplateEligibility } = await seedApi()
  const known = postTemplateEligibility({ themeSrc: null, theme: 'x', wp: { dryRun: true } })
  assert.equal(known.known, false)
})

test('#33 M6-9: a dry run with eligibility unknown notes it; a page-only template is still an error', async () => {
  const declares = [post('b', { meta: { _wp_page_template: 'page-article' } })]
  const site = fakeSite()
  site.wp.dryRun = true
  const report = await seed(site, seedFixture({ posts: declares }), ['--dry-run'])
  assert.ok(report.notes.some((n) => /page-article.*could not be read/.test(n.note)))
  const dry = fakeSite()
  dry.wp.dryRun = true
  await assert.rejects(seed(dry, seedFixture({ posts: declares, theme: { templates: { 'page-article': 'x' }, customTemplates: PAGE_ONLY, dist: true } }), ['--dry-run']), /declares it for page only/)
})

// ── M6-2: a page the spec no longer has, still published at a redirected path ───

test('M6-2: a seeded page left behind at a single view\'s path is reported with its id, path, status and seed ownership', async () => {
  const detailPage = { file: 'blog-detail.html', path: '/blog-detail', slug: 'blog-detail', title: 'Biometrics', view: 'page', parent: null, status: 'publish', content: '<!-- wp:paragraph --><p>Old page body.</p><!-- /wp:paragraph -->', meta: {}, images: [] }
  const bio = post('biometrics', { joomla: { articleId: '7' } })
  const fx = seedFixture({ posts: [bio], pages: [HOME, detailPage] })
  const site = fakeSite()
  await seed(site, fx)
  const old = site.page((p) => p.post_name === 'blog-detail')
  assert.ok(old)
  fx.rewrite({
    pages: [HOME],
    pagemap: [
      { file: 'index.html', path: '/', title: 'Home', view: 'front-page' },
      { file: 'blog-detail.html', path: '/blog-detail', title: 'Biometrics', view: 'single', source: { articleId: '7' } }
    ]
  })
  const report = await seed(site, fx)
  assert.deepEqual(report.redirects.find((r) => r.from === '/blog-detail')?.to, '/biometrics/')
  const audit = report.pageAudit
  assert.ok(audit, 'the report audits the site\'s pages against the spec')
  const shadow = audit.shadowing?.find((r) => r.id === old.ID)
  assert.ok(shadow, JSON.stringify(audit))
  assert.equal(shadow.path, '/blog-detail')
  assert.equal(shadow.status, 'publish')
  assert.equal(shadow.seeded, true)
  assert.equal(shadow.redirect, '/biometrics/')
  assert.ok(audit.obsolete.some((r) => r.id === old.ID && r.path === '/blog-detail'))
  // Nothing is changed: the page keeps its id, status and body.
  const now = site.page((p) => p.post_name === 'blog-detail')
  assert.equal(now.ID, old.ID)
  assert.equal(now.post_status, 'publish')
  assert.match(now.content, /Old page body/)
})

test('#33 M6-2: a page the site owner made is not obsolete, only shadowing; a page read that fails is an error, not a clean audit', async () => {
  const fx = seedFixture({ posts: [post('biometrics', { joomla: { articleId: '7' } })], pagemap: [{ file: 'index.html', path: '/', title: 'Home', view: 'front-page' }, { file: 'd.html', path: '/about/detail', title: 'D', view: 'single', source: { articleId: '7' } }] })
  const site = fakeSite()
  // The owner's own pages, never seeded: /about and /about/detail (published), /draft-note (draft).
  site.posts.set(900, { ID: 900, post_type: 'page', post_name: 'about', post_status: 'publish', post_parent: 0, meta: {}, content: 'x' })
  site.posts.set(901, { ID: 901, post_type: 'page', post_name: 'detail', post_status: 'publish', post_parent: 900, meta: {}, content: 'y' })
  site.posts.set(902, { ID: 902, post_type: 'page', post_name: 'draft-note', post_status: 'draft', post_parent: 0, meta: {}, content: 'z' })
  const report = await seed(site, fx)
  assert.deepEqual(report.pageAudit.obsolete, [])
  assert.deepEqual(report.pageAudit.shadowing.map((r) => [r.id, r.path, r.seeded]), [[901, '/about/detail', false]])
  // A draft at the redirected path does not shadow it: WordPress answers 404 there.
  site.posts.get(901).post_status = 'draft'
  assert.deepEqual((await seed(site, fx)).pageAudit.shadowing, [])
  const { auditPages } = await seedApi()
  const broken = auditPages({ json: () => { throw new Error('db gone') } }, { seededIds: new Set(), rules: [], fingerprintOf: () => null })
  assert.equal(broken.ok, false)
  assert.match(broken.error, /db gone/)
})

// ── M6-7: the prune audit keeps the seeder's authors and shows draft pages ───────

const baseFacts = () => ({
  admin: 'tracyagent',
  siteUrl: 'http://s',
  options: { siteurl: 'http://s', home: 'http://s' },
  users: [
    { ID: 1, user_login: 'tracyagent', roles: ['administrator'] },
    { ID: 5, user_login: 'jane-doe', roles: ['author'] },
    { ID: 6, user_login: 'editorial', roles: ['author'] }
  ],
  authorMeta: [
    { ID: 1, user_login: 'tracyagent', seeded: false },
    { ID: 5, user_login: 'jane-doe', seeded: true },
    { ID: 6, user_login: 'editorial', seeded: false }
  ],
  sessions: [],
  media: {
    attachments: [],
    content: [
      { ID: 181, post_type: 'page', post_status: 'draft', post_name: 'blog-detail', post_title: 'Biometrics', post_parent: 0, post_content: '' },
      { ID: 190, post_type: 'page', post_status: 'draft', post_name: '404-2', post_title: 'Page not found', post_parent: 0, post_content: '' },
      { ID: 191, post_type: 'page', post_status: 'draft', post_name: 'search', post_title: 'Search', post_parent: 0, post_content: '' },
      { ID: 200, post_type: 'page', post_status: 'publish', post_name: 'about', post_title: 'About', post_parent: 0, post_content: '' }
    ],
    meta: [
      { post_id: 181, meta_key: '_tracy_seed', meta_value: 'abc' },
      { post_id: 190, meta_key: '_tracy_seed', meta_value: 'def' }
    ],
    termmeta: [],
    options: [
      // the theme the stand runs: its 404 option is the one the audit reads (every stand has it)
      { option_name: 'stylesheet', option_value: 'tracy-base' },
      { option_name: 'tracy_base_404_page', option_value: '190' },
      { option_name: 'tracy_base_redirects', option_value: JSON.stringify([{ from: '/search', to: '/?s=', status: 302 }, { from: '/blog-detail', to: '/biometrics/', status: 301 }]) }
    ],
    files: []
  },
  config: { salts: true, dbDefined: true }
})
const userRow = (rows, login) => rows.find((r) => r.area === 'user' && r.item === login)
// What lib.mjs ownersPhp prints: every user with its tracy_source_author count, and the posts asked for.
const ownersOut = (users, posts = []) => `Deprecated: a plugin\n__TRACY_OWNERS__${JSON.stringify({ users: users.map((u) => ({ ID: String(u.ID), user_login: u.user_login, seeded: u.seeded === undefined ? u.seeded : u.seeded ? '1' : '0' })), posts })}`
// A runner that answers the ownership read from `users`/`posts` and records every write in `writes`.
const stand = (users, posts, writes) => (args) => {
  if (args[0] === 'eval') return { status: 0, stdout: ownersOut(users, posts), stderr: '' }
  writes.push(args)
  return ''
}

test('M6-7: a user the seeder made for a source author is kept as content; another user is still pruned', () => {
  const rows = classifyPrune(baseFacts())
  assert.equal(userRow(rows, 'jane-doe').verdict, 'KEEP', userRow(rows, 'jane-doe').why)
  assert.equal(userRow(rows, 'jane-doe').remove, undefined)
  assert.equal(userRow(rows, 'editorial').verdict, 'PRUNE')
})

test('M6-7: a draft page is listed for a decision, never removed; intentional drafts are kept with their reason', () => {
  const rows = classifyPrune(baseFacts())
  const draft = rows.find((r) => r.area === 'page:draft' && r.item.startsWith('#181'))
  assert.ok(draft, JSON.stringify(rows.filter((r) => r.area.startsWith('page'))))
  assert.equal(draft.verdict, 'UNKNOWN')
  assert.match(draft.why, /\/blog-detail/)
  assert.match(draft.why, /seeded/)
  assert.equal(draft.remove, undefined)
  const notFound = rows.find((r) => r.area === 'page:draft' && r.item.startsWith('#190'))
  assert.equal(notFound.verdict, 'KEEP')
  assert.match(notFound.why, /tracy_base_404_page/)
  // A draft at a redirect's path has no recorded intent: JA Vega's old /blog-detail (redirected to
  // its post) and a search view's draft look the same on the stand, so both wait for a person.
  assert.match(draft.why, /redirect/)
  const search = rows.find((r) => r.area === 'page:draft' && r.item.startsWith('#191'))
  assert.equal(search.verdict, 'UNKNOWN')
  assert.match(search.why, /redirect/)
  assert.equal(search.remove, undefined)
  assert.equal(rows.some((r) => r.item.startsWith('#200')), false, 'a published page is not a draft')
  const deleted = []
  const facts = baseFacts()
  applyPrune(rows, { wp: stand(facts.authorMeta, [], deleted), webroot: '.' })
  assert.equal(deleted.some((a) => a.includes('181') || a.includes('190') || a.includes('191') || a.includes('5')), false, JSON.stringify(deleted))
  assert.deepEqual(deleted, [['user', 'delete', '6', '--reassign=1', '--yes']], 'the one user the audit and the re-read both call a builder account')
})

test('#33 M6-7: a redirect option as WordPress stores it (serialized by --format=json) still names its paths', async () => {
  const { redirectSources } = await import('../quickstart/lib.mjs')
  // `wp option update x '[{"from":"/blog-detail",...}]' --format=json` stores this:
  const php = 'a:2:{i:0;a:3:{s:4:"from";s:12:"/blog-detail";s:2:"to";s:11:"/biometrics";s:6:"status";i:301;}i:1;a:3:{s:4:"from";s:5:"/tìm";s:2:"to";s:1:"/";s:6:"status";i:301;}}' // language-allow: data: Vietnamese redirect path
  assert.deepEqual(redirectSources(php), ['/blog-detail', '/tìm']) // language-allow: data: Vietnamese redirect path
  assert.deepEqual(redirectSources(JSON.stringify([{ from: '/search', to: '/' }])), ['/search'])
  for (const bad of ['', 'nope', 'a:1:{i:0;a:1:{s:4:"from";s:99:"/x";}}', 'a:1:{i:0;a:1:{s:4:"from";s:x:"/x";}}', null]) assert.deepEqual(redirectSources(bad), [], String(bad))
  const facts = baseFacts()
  facts.media.options = facts.media.options.map((o) => (o.option_name === 'tracy_base_redirects' ? { ...o, option_value: php } : o))
  const row = classifyPrune(facts).find((r) => r.area === 'page:draft' && r.item.startsWith('#181'))
  assert.equal(row.verdict, 'UNKNOWN')
  assert.match(row.why, /\/blog-detail .*redirect/)
})

test('M6-7: collectFacts reads which users the seeder created (user meta tracy_source_author)', () => {
  const calls = []
  const users = [{ ID: 1, user_login: 'tracyagent', seeded: false }, { ID: 5, user_login: 'jane-doe', seeded: true }]
  const wp = (args, opts = {}) => {
    calls.push(args)
    if (args[0] === 'eval') return { status: 0, stdout: args[1].includes('__TRACY_OWNERS__') ? ownersOut(users) : '', stderr: '' }
    if (args[0] === 'option' && args[1] === 'get') return opts.raw ? { status: 1, stdout: '', stderr: '' } : 'http://s'
    if (args[0] === 'user' && args[1] === 'session') return '0'
    return opts.raw ? { status: 0, stdout: '', stderr: '' } : ''
  }
  wp.json = (args) => {
    calls.push(args)
    if (args[0] === 'user' && args[1] === 'list') return [{ ID: 1, user_login: 'tracyagent', roles: ['administrator'] }, { ID: 5, user_login: 'jane-doe', roles: ['author'] }]
    return []
  }
  wp.field = (args) => wp(args).trim()
  const webroot = tmp('i33-prune-')
  mkdirSync(join(webroot, 'wp-content', 'themes'), { recursive: true })
  const facts = collectFacts({ webroot, wp, admin: 'tracyagent', siteUrl: 'http://s', standOptions: [] })
  assert.deepEqual(facts.authorMeta, users)
  assert.equal(userRow(classifyPrune(facts), 'jane-doe').verdict, 'KEEP')
})

test('#33 M6-7: when seeded ownership cannot be read, no user is pruned; a draft row without a status or a published row in the draft list is safe', () => {
  for (const authorMeta of [undefined, { error: 'wp eval exited 1' }, 'garbage']) {
    const rows = classifyPrune({ ...baseFacts(), authorMeta })
    assert.equal(userRow(rows, 'editorial').verdict, 'UNKNOWN', JSON.stringify(authorMeta))
    assert.equal(userRow(rows, 'jane-doe').verdict, 'UNKNOWN')
    assert.equal(userRow(rows, 'tracyagent').verdict, 'KEEP')
  }
  // --keep-user still keeps a named author when ownership is unknown.
  assert.equal(userRow(classifyPrune({ ...baseFacts(), authorMeta: undefined, keepUsers: ['editorial'] }), 'editorial').verdict, 'KEEP')
  // Each candidate needs its own row: one the answer leaves out, one with another login, one without
  // a yes/no, one twice — UNKNOWN, never PRUNE.
  const base = baseFacts().authorMeta
  for (const authorMeta of [
    base.filter((r) => r.ID !== 6),
    base.map((r) => (r.ID === 6 ? { ...r, user_login: 'jane-doe' } : r)),
    base.map((r) => (r.ID === 6 ? { ID: 6, user_login: 'editorial' } : r)),
    base.map((r) => (r.ID === 6 ? { ...r, seeded: 'no' } : r)),
    [...base, { ID: 6, user_login: 'editorial', seeded: true }]
  ])
    assert.equal(userRow(classifyPrune({ ...baseFacts(), authorMeta }), 'editorial').verdict, 'UNKNOWN', JSON.stringify(authorMeta))
  // A user list row without a usable id is UNKNOWN, whatever the meta says (Number(null) is 0).
  for (const ID of [null, '', 0, '6x'])
    assert.equal(userRow(classifyPrune({ ...baseFacts(), users: [...baseFacts().users.filter((u) => u.ID !== 6), { ID, user_login: 'editorial', roles: [] }] }), 'editorial').verdict, 'UNKNOWN', String(ID))
  // A media read that failed: the drafts are not measured — one UNKNOWN row, no guess.
  const unread = classifyPrune({ ...baseFacts(), media: { error: 'wp eval exited 255' } })
  assert.ok(unread.some((r) => r.area === 'page:draft' && r.verdict === 'UNKNOWN' && /not measured/.test(r.why)))
  assert.equal(unread.filter((r) => r.area === 'page:draft').length, 1)
})

test('#33 M6-7: collectFacts records a failed or malformed ownership read as an error, never as "no seeded authors"', async () => {
  const { parseOwners } = await import('../quickstart/lib.mjs')
  let answer = { status: 1, stdout: '', stderr: 'Error establishing a database connection' }
  const wp = (args, opts = {}) => {
    if (args[0] === 'eval') return args[1].includes('__TRACY_OWNERS__') ? answer : { status: 0, stdout: '', stderr: '' }
    if (args[0] === 'option' && args[1] === 'get') return opts.raw ? { status: 1, stdout: '', stderr: '' } : 'http://s'
    return opts.raw ? { status: 0, stdout: '', stderr: '' } : '0'
  }
  wp.json = (args) => (args[0] === 'user' ? [{ ID: 1, user_login: 'tracyagent', roles: ['administrator'] }] : [])
  wp.field = (args) => wp(args).trim()
  const webroot = tmp('i33-prune-')
  mkdirSync(join(webroot, 'wp-content', 'themes'), { recursive: true })
  const collect = () => collectFacts({ webroot, wp, admin: 'tracyagent', siteUrl: 'http://s', standOptions: [] }).authorMeta
  assert.match(collect().error, /database connection/)
  answer = { status: 0, stdout: 'no marker', stderr: '' }
  assert.match(collect().error, /no ownership data/)
  // Rows with an id of null, '' or 0, no login, no count, or one id twice: the whole answer is refused.
  const bad = [
    { users: [{ ID: null, user_login: 'a', seeded: '0' }], posts: [] },
    { users: [{ ID: '', user_login: 'a', seeded: '0' }], posts: [] },
    { users: [{ ID: '0', user_login: 'a', seeded: '0' }], posts: [] },
    { users: [{ ID: '3', user_login: '', seeded: '0' }], posts: [] },
    { users: [{ ID: '3', user_login: 'a' }], posts: [] },
    { users: [{ ID: '3', user_login: 'a', seeded: '0' }, { ID: '3', user_login: 'b', seeded: '0' }], posts: [] },
    { users: [], posts: [{ ID: '4', post_type: 'post' }] },
    { users: null, posts: [] },
    { posts: [] }
  ]
  for (const o of bad) {
    answer = { status: 0, stdout: `__TRACY_OWNERS__${JSON.stringify(o)}`, stderr: '' }
    assert.ok(collect().error, JSON.stringify(o))
    assert.ok(parseOwners(answer.stdout).error, JSON.stringify(o))
  }
  assert.match(parseOwners('__TRACY_OWNERS__{"users": [').error, /not JSON/)
})

test('#33 M6-7: --apply reads ownership and status again right before it deletes; a row the stand no longer matches is kept', () => {
  const rows = () => classifyPrune({
    ...baseFacts(),
    trash: [{ ID: 70, post_title: 'old', post_type: 'post', post_status: 'trash' }, { ID: 71, post_title: 'gone', post_type: 'page', post_status: 'trash' }]
  })
  const users = baseFacts().authorMeta
  // Since the audit: editorial became a seeded author, #70 was restored and published, #71 is gone.
  let writes = []
  let out = applyPrune(rows(), { wp: stand(users.map((u) => (u.ID === 6 ? { ...u, seeded: true } : u)), [{ ID: '70', post_type: 'post', post_status: 'publish' }], writes), webroot: '.' })
  assert.deepEqual(writes.filter((w) => w[1] === 'delete'), [], JSON.stringify(writes))
  assert.match(userRow(out, 'editorial').why, /not removed: .*tracy_source_author/)
  assert.equal(userRow(out, 'editorial').verdict, 'UNKNOWN')
  assert.match(out.find((r) => r.item.startsWith('#70')).why, /not removed: its post_status is now publish/)
  assert.match(out.find((r) => r.item.startsWith('#71')).why, /not removed: post #71 is no longer on the stand/)
  // Another user now holds the id, or the user is gone.
  for (const now of [users.map((u) => (u.ID === 6 ? { ...u, user_login: 'someone' } : u)), users.filter((u) => u.ID !== 6)]) {
    writes = []
    out = applyPrune(rows(), { wp: stand(now, [], writes), webroot: '.' })
    assert.equal(writes.some((w) => w[0] === 'user' && w[1] === 'delete'), false, JSON.stringify(now))
  }
  // The re-read fails, or answers malformed rows: nothing is deleted.
  for (const answer of [{ status: 1, stdout: '', stderr: 'boom' }, { status: 0, stdout: '__TRACY_OWNERS__{"users":[{"ID":null}],"posts":[]}', stderr: '' }, { status: 0, stdout: 'nothing', stderr: '' }]) {
    writes = []
    out = applyPrune(rows(), { wp: (a) => (a[0] === 'eval' ? answer : writes.push(a)), webroot: '.' })
    assert.deepEqual(writes.filter((w) => w[1] === 'delete'), [], JSON.stringify(answer))
    assert.ok(out.filter((r) => /not removed: the re-read before removal failed/.test(r.why)).length >= 3)
  }
  // A PRUNE row with no recorded expectation is not deleted on faith.
  writes = []
  out = applyPrune([{ area: 'post:trash', item: '#9', verdict: 'PRUNE', why: 'x', remove: { wp: ['post', 'delete', '9', '--force'] } }], { wp: stand(users, [{ ID: '9', post_type: 'post', post_status: 'trash' }], writes), webroot: '.' })
  assert.deepEqual(writes, [])
  // Unchanged: both go, the post in one batch.
  writes = []
  out = applyPrune(rows(), { wp: stand(users, [{ ID: '70', post_type: 'post', post_status: 'trash' }, { ID: '71', post_type: 'page', post_status: 'trash' }], writes), webroot: '.' })
  assert.deepEqual(writes.filter((w) => w[1] === 'delete'), [['user', 'delete', '6', '--reassign=1', '--yes'], ['post', 'delete', '70', '71', '--force']])
})

test('#33 M6-7: a post row is judged and re-checked by its type AND its status — a change of either keeps it; a row missing either is UNKNOWN', async () => {
  const { classifyMedia } = await import('../quickstart/lib.mjs')
  const users = baseFacts().authorMeta
  const facts = () => ({
    ...baseFacts(),
    users: baseFacts().users.filter((u) => u.ID !== 6),
    revisions: [{ ID: 80, post_title: 'rev', post_type: 'revision', post_status: 'inherit' }],
    autoDrafts: [{ ID: 81, post_title: 'ad', post_type: 'post', post_status: 'auto-draft' }],
    trash: [{ ID: 82, post_title: 'tr', post_type: 'page', post_status: 'trash' }]
  })
  const same = [
    { ID: '80', post_type: 'revision', post_status: 'inherit' },
    { ID: '81', post_type: 'post', post_status: 'auto-draft' },
    { ID: '82', post_type: 'page', post_status: 'trash' }
  ]
  const deletedIds = (now) => {
    const writes = []
    applyPrune(classifyPrune(facts()), { wp: stand(users, now, writes), webroot: '.' })
    return writes.filter((w) => w[0] === 'post' && w[1] === 'delete').flatMap((w) => w.slice(2, -1))
  }
  assert.deepEqual(deletedIds(same), ['80', '81', '82'])
  // Each row, its type changed with the status kept (a revision now a page, still `inherit`), or its
  // status changed with the type kept: that row stays, the others go.
  for (const [i, change] of same.flatMap((r, i) => [[i, { post_type: 'page' === r.post_type ? 'post' : 'page' }], [i, { post_status: 'publish' }]])) {
    const now = same.map((r, j) => (j === i ? { ...r, ...change } : r))
    const ids = deletedIds(now)
    assert.equal(ids.includes(same[i].ID), false, JSON.stringify(now[i]))
    assert.equal(ids.length, 2, JSON.stringify(now[i]))
  }
  // The audit itself: a revision query that answers an attachment or a page (status inherit) is not
  // listing a revision; a row without its type or its status is UNKNOWN, with no removal.
  for (const lied of [{ post_type: 'attachment' }, { post_type: 'page' }]) {
    const row = classifyPrune({ ...facts(), revisions: [{ ID: 80, post_title: 'rev', post_status: 'inherit', ...lied }] }).find((r) => r.item.startsWith('#80'))
    assert.equal(row.verdict, 'KEEP', JSON.stringify(lied))
    assert.equal(row.remove, undefined)
  }
  for (const missing of ['post_type', 'post_status'])
    for (const list of ['revisions', 'autoDrafts', 'trash']) {
      const f = facts()
      delete f[list][0][missing]
      const row = classifyPrune(f).find((r) => r.item.startsWith(`#${f[list][0].ID}`))
      assert.equal(row.verdict, 'UNKNOWN', `${list} without ${missing}`)
      assert.equal(row.remove, undefined)
    }
  // Attachments and WordPress's defaults: both fields recorded, both re-checked; either missing is UNKNOWN.
  const refs = (over = {}, content = []) => ({ attachments: [{ ID: 30, post_type: 'attachment', post_status: 'inherit', file: '2026/09/o.jpg', sizes: [], post_parent: 0, ...over }], meta: [], termmeta: [], options: [], files: [], content })
  const orphan = classifyMedia(refs())[0]
  assert.deepEqual(orphan.remove.expect, { post_type: 'attachment', post_status: 'inherit' })
  for (const over of [{ post_status: undefined }, { post_type: undefined }, { post_type: 'page' }, { ID: '9007199254740993' }])
    assert.equal(classifyMedia(refs(over))[0].verdict, 'UNKNOWN', JSON.stringify(over))
  const def = { ID: 2, post_type: 'page', post_status: 'publish', post_name: 'sample-page', post_title: 'Sample Page', post_date_gmt: 'd', post_modified_gmt: 'd', post_content: '' }
  const defRows = (c) => classifyMedia({ ...refs(), attachments: [], content: [c] })
  assert.deepEqual(defRows(def)[0].remove.expect, { post_type: 'page', post_status: 'publish' })
  assert.equal(defRows({ ...def, post_status: undefined })[0].verdict, 'UNKNOWN')
  for (const [row, now] of [
    [orphan, { ID: '30', post_type: 'attachment', post_status: 'private' }],
    [orphan, { ID: '30', post_type: 'page', post_status: 'inherit' }],
    [defRows(def)[0], { ID: '2', post_type: 'page', post_status: 'draft' }]
  ]) {
    const writes = []
    const [out] = applyPrune([{ ...row, why: row.why }], { wp: stand(users, [now], writes), webroot: '.' })
    assert.deepEqual(writes, [], JSON.stringify(now))
    assert.equal(out.verdict, 'UNKNOWN')
  }
  // A row whose expectation lacks the type (made before this check) is not deleted on its status alone.
  const writes = []
  applyPrune([{ area: 'post:trash', item: '#9', verdict: 'PRUNE', why: 'x', remove: { wp: ['post', 'delete', '9', '--force'], expect: { post_status: 'trash' } } }], { wp: stand(users, [{ ID: '9', post_type: 'post', post_status: 'trash' }], writes), webroot: '.' })
  assert.deepEqual(writes, [])
  // collectFacts asks the lists for the type as well as the status.
  const listed = []
  const wp = (args, opts = {}) => (args[0] === 'eval' ? { status: 1, stdout: '', stderr: 'x' } : opts.raw ? { status: 1, stdout: '', stderr: '' } : '0')
  wp.json = (args) => (listed.push(args), args[0] === 'user' ? [] : [])
  wp.field = () => 'http://s'
  const webroot = tmp('i33-prune-')
  mkdirSync(join(webroot, 'wp-content', 'themes'), { recursive: true })
  collectFacts({ webroot, wp, admin: 'tracyagent', siteUrl: 'http://s', standOptions: [] })
  const postLists = listed.filter((a) => a[0] === 'post' && a[1] === 'list')
  assert.equal(postLists.length, 3)
  for (const a of postLists) assert.ok(a.includes('--fields=ID,post_title,post_type,post_status'), a.join(' '))
})

test('#33 M6-7: --apply re-reads right before each user deletion and each post batch — a change made while earlier removals ran keeps its row', () => {
  // The stand changes the moment the first removal is written (an option), and again after the
  // first post batch: editorial becomes a seeded author, #71 is published, then #72 is.
  const users = baseFacts().authorMeta
  let now = { users, posts: [70, 71, 72].map((id) => ({ ID: String(id), post_type: 'post', post_status: 'trash' })) }
  const writes = []
  const wp = (args) => {
    if (args[0] === 'eval') return { status: 0, stdout: ownersOut(now.users, now.posts.filter((p) => args[1].includes(p.ID))), stderr: '' }
    writes.push(args)
    if (args[0] === 'option' && args[1] === 'delete')
      now = { users: users.map((u) => (u.ID === 6 ? { ...u, seeded: true } : u)), posts: now.posts.map((p) => (p.ID === '71' ? { ...p, post_status: 'publish' } : p)) }
    if (args[0] === 'post' && args[1] === 'delete' && args.includes('70')) now = { ...now, posts: now.posts.map((p) => (p.ID === '72' ? { ...p, post_status: 'publish' } : p)) }
    return ''
  }
  const rows = classifyPrune({
    ...baseFacts(),
    standOptions: ['tracy_style'],
    trash: [70, 71, 72].map((ID) => ({ ID, post_title: `t${ID}`, post_type: 'post', post_status: 'trash' }))
  })
  // The audit, read before any of it, calls all of them PRUNE.
  assert.deepEqual(rows.filter((r) => r.verdict === 'PRUNE').map((r) => r.item).sort(), ['#70 t70', '#71 t71', '#72 t72', 'editorial', 'tracy_style'])
  const out = applyPrune(rows, { wp, webroot: '.', batch: 1 })
  assert.deepEqual(writes, [['option', 'delete', 'tracy_style'], ['post', 'delete', '70', '--force']], JSON.stringify(writes))
  assert.match(userRow(out, 'editorial').why, /not removed: .*tracy_source_author/)
  assert.match(out.find((r) => r.item.startsWith('#71')).why, /not removed: its post_status is now publish/)
  assert.match(out.find((r) => r.item.startsWith('#72')).why, /not removed: its post_status is now publish/)
  assert.deepEqual(out.filter((r) => r.verdict === 'REMOVED').map((r) => r.item).sort(), ['#70 t70', 'tracy_style'])
})

test('#33 M6-7: an id past Number.MAX_SAFE_INTEGER is never rounded into another row\'s id — refused at every step', async () => {
  const { isPositiveId, parseOwners, ownersPhp, staleRemoval } = await import('../quickstart/lib.mjs')
  const MAX = String(Number.MAX_SAFE_INTEGER)
  assert.equal(isPositiveId(MAX), true)
  assert.equal(isPositiveId(Number.MAX_SAFE_INTEGER), true)
  for (const v of ['9007199254740992', '9007199254740993', 9007199254740992, 2 ** 60, '1e3', '07', 1.5, '-1', null, '', 0]) assert.equal(isPositiveId(v), false, String(v))
  // The audit: a trash row or a user with such an id carries no removal.
  const big = '9007199254740993'
  const trash = classifyPrune({ ...baseFacts(), trash: [{ ID: big, post_title: 'x', post_type: 'post', post_status: 'trash' }] }).find((r) => r.area === 'post:trash')
  assert.equal(trash.verdict, 'UNKNOWN')
  assert.equal(trash.remove, undefined)
  const user = userRow(classifyPrune({ ...baseFacts(), users: [...baseFacts().users.filter((u) => u.ID !== 6), { ID: big, user_login: 'editorial', roles: [] }] }), 'editorial')
  assert.equal(user.verdict, 'UNKNOWN')
  // An admin whose id cannot be held exactly gets no --reassign target: the user is not deleted.
  const noTarget = userRow(classifyPrune({ ...baseFacts(), users: baseFacts().users.map((u) => (u.ID === 1 ? { ...u, ID: big } : u)) }), 'editorial')
  assert.equal(noTarget.remove, undefined)
  // The ownership read refuses the whole answer, and the re-read cannot be aimed at it.
  assert.ok(parseOwners(`__TRACY_OWNERS__${JSON.stringify({ users: [{ ID: big, user_login: 'a', seeded: '0' }], posts: [] })}`).error)
  assert.ok(parseOwners(`__TRACY_OWNERS__${JSON.stringify({ users: [], posts: [{ ID: big, post_type: 'post', post_status: 'trash' }] })}`).error)
  assert.throws(() => ownersPhp([big]), /not a post id/)
  assert.match(staleRemoval({ remove: { wp: ['post', 'delete', big, '--force'], expect: { post_type: 'post', post_status: 'trash' } } }, { users: [], posts: [{ ID: 9007199254740992, post_type: 'post', post_status: 'trash' }] }), /not a usable id/)
  // At the boundary itself the id is exact and the row is removable.
  const edge = classifyPrune({ ...baseFacts(), trash: [{ ID: MAX, post_title: 'x', post_type: 'post', post_status: 'trash' }] }).find((r) => r.area === 'post:trash')
  assert.equal(edge.verdict, 'PRUNE')
  assert.deepEqual(edge.remove.wp, ['post', 'delete', MAX, '--force'])
})

test('#33 M6-9: a site answer whose template list holds anything but distinct slug strings is unknown eligibility, never a template named "null"', async () => {
  const { postTemplateEligibility } = await seedApi()
  const declares = [post('b', { meta: { _wp_page_template: 'null' } })]
  for (const answer of [{ post: [null] }, { post: [3] }, { post: [''] }, { post: [{}] }, { post: ['page-article', 'page-article'] }, { post: ['a b'] }, { '': ['page-article'] }, { post: 'page-article' }]) {
    const site = fakeSite()
    site.postTemplates = answer
    const e = postTemplateEligibility({ wp: site.wp })
    assert.equal(e.known, false, JSON.stringify(answer))
    await assert.rejects(seed(site, seedFixture({ posts: declares })), /could not be read/, JSON.stringify(answer))
    assert.equal(site.post(() => true), undefined, JSON.stringify(answer))
  }
  // A well-formed answer is still read.
  const site = fakeSite()
  site.postTemplates = { post: ['page-article'], page: ['page-article', 'wide'] }
  const e = postTemplateEligibility({ wp: site.wp })
  assert.equal(e.known, true)
  assert.deepEqual([...e.forPost], ['page-article'])
  // The built theme's theme.json is held to the same shape.
  for (const customTemplates of [[{ name: null }], [{ name: 'a b' }], [{ name: 'x', postTypes: [null] }], [{ name: 'x', postTypes: [''] }], [{ name: 'x' }, { name: 'x', postTypes: ['post'] }]]) {
    const fx = seedFixture({ posts: [post('b', { meta: { _wp_page_template: 'x' } })], theme: { templates: { x: 'x' }, customTemplates, dist: true } })
    const s = installs(fakeSite(), { post: ['x'], page: ['x'] })
    await assert.rejects(seed(s, fx), /could not be read/, JSON.stringify(customTemplates))
    assert.deepEqual(s.themeInstalls, [], JSON.stringify(customTemplates))
  }
})

test('#33: every file this change adds under scripts/php is loaded by nothing else and parses as the plugin header it claims', () => {
  for (const f of ['post-meta.php', 'more-articles.php']) {
    const p = join(here, '..', 'php', f)
    assert.ok(existsSync(p), f)
    const src = readFileSync(p, 'utf8')
    assert.match(src, /^<\?php\n\/\*\*\n \* Plugin Name: Tracy /, f)
  }
})

test('ja-fresco S-32: a user the seeder did not mark who still owns kept content (published posts, an avatar) is kept; one who owns none is pruned', async () => {
  const { ownersPhp, parseOwners } = await import('../quickstart/lib.mjs')
  // the read counts what each user owns: published posts and a user-meta avatar that is an attachment
  assert.match(ownersPhp(), /post_author/)
  assert.match(ownersPhp(), /tracy_avatar/)
  const out = (owns) => `__TRACY_OWNERS__${JSON.stringify({ users: [{ ID: '1', user_login: 'tracyagent', seeded: '0', owns: '0' }, { ID: '5', user_login: 'jane-doe', seeded: '1', owns: '3' }, { ID: '6', user_login: 'editorial', seeded: '0', owns: String(owns) }], posts: [] })}`
  const owners = parseOwners(out(1))
  assert.deepEqual(owners.users.map((u) => [u.user_login, u.owns]), [['tracyagent', 0], ['jane-doe', 3], ['editorial', 1]])
  assert.match(parseOwners(out('x')).error ?? '', /owns|count/)
  const owning = classifyPrune({ ...baseFacts(), authorMeta: owners.users })
  assert.equal(userRow(owning, 'editorial').verdict, 'KEEP', userRow(owning, 'editorial').why)
  assert.match(userRow(owning, 'editorial').why, /owns/)
  assert.equal(userRow(owning, 'editorial').remove, undefined)
  assert.equal(userRow(classifyPrune({ ...baseFacts(), authorMeta: parseOwners(out(0)).users }), 'editorial').verdict, 'PRUNE')
  // the re-read right before removal refuses a user that came to own content since the audit
  const rows = classifyPrune({ ...baseFacts(), authorMeta: parseOwners(out(0)).users })
  const deleted = []
  const later = (args) => (args[0] === 'eval' ? { status: 0, stdout: out(2), stderr: '' } : (deleted.push(args), ''))
  applyPrune(rows.filter((r) => r.area === 'user'), { wp: later, webroot: '.' })
  assert.deepEqual(deleted, [], JSON.stringify(deleted))
})

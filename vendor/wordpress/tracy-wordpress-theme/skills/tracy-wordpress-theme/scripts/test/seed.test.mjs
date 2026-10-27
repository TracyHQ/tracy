import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { JSDOM } from 'jsdom'
import {
  parseArgs,
  imageKey,
  collectImages,
  renderAcm,
  buildPageContent,
  buildArchiveContent,
  childPagesOutside,
  buildCategoryIndex,
  instancesForPage,
  buildNavigation,
  footerLinks,
  fillNavigationRefs,
  namedNavigationRefs,
  navBlockMenutype,
  fingerprint,
  introText,
  renderAside,
  withAside,
  acmFromModule,
  rewriteBrandTokens,
  loadPalette,
  redirectsOption,
  postsPage,
  notFoundPage,
  notFoundOption,
  pageLead,
  pageExcerpt,
  bodyLead,
  megaLabels,
  withoutMegaItems,
  mediaImportArgs,
  dedupePostSlugs,
  singleViewRules,
  routeTargets,
  resolveMedia,
  pageImageTables,
  sectionsOfPage,
  mediaRouteCollisions,
  checkCategorySlugs
} from '../seed.mjs'
import { checkMarkup, parseBlocks, serializeBlocks } from '../lib/block-fill.mjs'
import { splitCommand } from '../lib/wp-cli.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/block-fill/${name}`, import.meta.url), 'utf8')

const patternsMap = {
  types: {
    'demo:style-1': {
      pattern: 'tracy-base/section-demo',
      root: '.demo',
      item: 'demo.item.<n>',
      fields: {
        eyebrow: { block: 'core/paragraph', path: 'demo.eyebrow', attr: 'content', repeat: null },
        heading: { block: 'core/heading', path: 'demo.heading', attr: 'content', repeat: null },
        'heading-level': { block: 'core/heading', path: 'demo.heading', attr: 'level', repeat: null },
        surface: { block: 'core/group', path: 'root', attr: 'className', repeat: null },
        'btn-text': { block: 'core/button', path: 'demo.btn', attr: 'text', repeat: null },
        'btn-link': { block: 'core/button', path: 'demo.btn', attr: 'url', repeat: null },
        action: { block: 'core/paragraph', path: 'demo.action', attr: 'content', repeat: null },
        link: { block: 'core/paragraph', path: 'demo.action', attr: 'href', repeat: null },
        media: { block: 'core/image', path: 'demo.media', attr: 'src', repeat: null },
        'media-alt': { block: 'core/image', path: 'demo.media', attr: 'alt', repeat: null },
        features: { block: 'core/list', path: 'demo.list', attr: 'innerBlocks', repeat: null },
        'first-open': { block: 'core/details', path: 'demo.item.1', attr: 'showContent', repeat: null },
        'one-at-a-time': { block: 'core/details', path: 'demo.item.*', attr: 'name', repeat: null },
        question: { block: 'core/details', path: 'demo.item.<n>', attr: 'summary', repeat: 'entries' },
        answer: { block: 'core/paragraph', path: 'demo.answer.<n>', attr: 'content', repeat: 'entries' }
      }
    }
  }
}
const patterns = {
  'tracy-base/section-demo': fixture('acm-pattern.html'),
  'tracy/cards':
    '<!-- wp:query {"queryId":1,"query":{"perPage":6,"inherit":true},"className":"tracy-query"} -->\n<div class="wp-block-query tracy-query">\n<!-- wp:post-template -->\n<!-- wp:post-terms {"term":"category"} /-->\n<!-- wp:post-excerpt {"excerptLength":24} /-->\n<!-- /wp:post-template -->\n</div>\n<!-- /wp:query -->'
}
const media = (ref) =>
  imageKey(ref) === 'demo/a.jpg' ? { url: '/wp-content/uploads/2026/09/a.jpg', id: 77 } : null

const instance = {
  id: '1',
  type: 'demo',
  style: 'style-1',
  position: 'about-page',
  published: true,
  ordering: 1,
  scope: 'page',
  pages: [{ wpPath: '/about' }],
  fields: {
    eyebrow: '',
    heading: 'Hello',
    'heading-level': 'h3',
    surface: 'canvas',
    'btn-text': 'Go',
    'btn-link': '/go',
    action: 'More',
    link: '/more',
    media: 'images/demo/a.jpg',
    'media-alt': 'An image',
    features: 'x\ny',
    'first-open': '0',
    'one-at-a-time': '0'
  },
  items: [
    { question: 'Q1', answer: 'A1' },
    { question: 'Q2', answer: 'A2' },
    { question: 'Q3', answer: 'A3' }
  ]
}

test('seed: parseArgs requires the five inputs and derives out/report', () => {
  const o = parseArgs([
    '--spec',
    '/tmp/spec',
    '--wp',
    'wp --path=x',
    '--theme',
    't',
    '--patterns-map',
    '/m.json',
    '--images',
    '/img',
    '--dry-run'
  ])
  assert.equal(o.out, '/tmp/seed')
  assert.equal(o.report, '/tmp/seed/report.json')
  assert.equal(o.dryRun, true)
  assert.throws(() => parseArgs(['--spec', '/x']), /--wp is required/)
  assert.deepEqual(splitCommand('docker compose -p "tracy base" run --rm -T cli'), [
    'docker',
    'compose',
    '-p',
    'tracy base',
    'run',
    '--rm',
    '-T',
    'cli'
  ])
})

test('seed: imageKey normalises Joomla refs and upload paths', () => {
  assert.equal(
    imageKey('images/demo/blog/blog-10.jpg#joomlaImage://local-images/demo/blog/blog-10.jpg?width=1'),
    'demo/blog/blog-10.jpg'
  )
  assert.equal(imageKey('/images/tracy-demo/x.png'), 'tracy-demo/x.png')
  assert.deepEqual(imageKey('/wp-content/uploads/error-page.png'), { basename: 'error-page.png' })
  assert.equal(imageKey('https://example.com/a.png'), null)
  assert.equal(imageKey(''), null)
})

test('seed: collectImages gathers featured images, category images and mapped ACM src fields with their alt', () => {
  const spec = {
    content: {
      posts: [{ featuredImage: 'images/demo/blog/b.jpg', featuredImageAlt: 'B' }],
      pages: [{ images: [{ original: '/images/tracy-demo/w.png', alt: 'W' }] }],
      categories: [{ description: '<p><img src="images/demo/misc/c.jpg"></p>' }]
    },
    sections: { custom: [], acm: [instance] }
  }
  const got = collectImages(spec, patternsMap)
  assert.deepEqual(got.map((w) => `${w.key}|${w.alt}`).sort(), [
    'demo/a.jpg|An image',
    'demo/blog/b.jpg|B',
    'demo/misc/c.jpg|',
    'tracy-demo/w.png|W'
  ])
})

test('seed: renderAcm fills every mapped field, repeats items and drops empty leaves', () => {
  const { markup, notes } = renderAcm(instance, patternsMap, patterns, media)
  assert.deepEqual(notes, [])
  assert.equal(checkMarkup(markup), true)
  assert.doesNotMatch(markup, /demo\.eyebrow/, 'an empty content field removes its block')
  assert.match(markup, /<h3 class="wp-block-heading">Hello<\/h3>/)
  assert.match(markup, /className":"tracy-section demo bg-bg"/, 'surface canvas: band classes off, bg-bg on')
  assert.match(markup, /href="\/go">Go<\/a>/)
  assert.match(markup, /<p class="action"><a href="\/more">More →<\/a><\/p>/, 'the trailing arrow is kept')
  assert.match(markup, /<img src="\/wp-content\/uploads\/2026\/09\/a.jpg" alt="An image" class="wp-image-77"/)
  assert.match(markup, /<li>x<\/li>[\s\S]*<li>y<\/li>/)
  assert.doesNotMatch(markup, /<li>c<\/li>/)
  assert.equal((markup.match(/<!-- wp:details/g) ?? []).length, 3)
  assert.match(
    markup,
    /<summary>Q3<\/summary><!-- wp:paragraph[^\n]*"name":"demo.answer.3"[^\n]*\n<p class="a">A3<\/p>/
  )
  assert.doesNotMatch(markup, /open>/, 'first-open "0" closes every item')
  assert.doesNotMatch(markup, /name="acc"/, 'one-at-a-time "0" drops the shared name')
  assert.equal((markup.match(/demo\.spotlight/g) ?? []).length, 1, 'an item-1-only block is not cloned')
})

test('seed: ACM subtitle fills a declared subtitle slot and is reported when the pattern has no mapping', () => {
  const patternsMap = { types: { 'hero:style-1': { pattern: 'tracy/section-hero', fields: { subtitle: { block: 'core/paragraph', path: 'hero.subtitle', attr: 'content' } } } } }
  const patterns = { 'tracy/section-hero': '<!-- wp:group {"metadata":{"name":"hero.root"}} --><div class="wp-block-group"><!-- wp:paragraph {"metadata":{"name":"hero.subtitle"}} --><p></p><!-- /wp:paragraph --></div><!-- /wp:group -->' }
  const instance = { id: '101', type: 'hero', style: 'style-1', fields: { title: 'Module title', subtitle: 'Supporting line' }, items: [] }
  const mapped = renderAcm(instance, patternsMap, patterns, () => null)
  assert.match(mapped.markup, /Supporting line/)
  assert.match(mapped.notes.join(' '), /hero\.title: no field mapping/)
  const withoutSlot = renderAcm(instance, { types: { 'hero:style-1': { pattern: 'tracy/section-hero', fields: {} } } }, patterns, () => null)
  assert.match(withoutSlot.notes.join(' '), /hero\.subtitle: no field mapping/)
})

test('seed: buildPageContent replaces slot markers, appends unmarked positions in order and adds the CF7 shortcode', () => {
  const spec = {
    sections: {
      acm: [
        instance,
        { ...instance, id: '2', position: 'section-2', ordering: 1 },
        { ...instance, id: '3', position: 'masthead', ordering: 1 },
        { ...instance, id: '4', position: 'about-page', ordering: 0, published: false },
        { ...instance, id: '5', position: 'about-page', ordering: 2, pages: [{ wpPath: '/elsewhere' }] }
      ],
      custom: []
    }
  }
  const ctx = {
    spec,
    patternsMap,
    patterns,
    media,
    rewrite: (m) => m,
    cf7: { id: 9, title: 'Contact' },
    log: [],
    sections: [],
    terms: new Map()
  }
  const page = {
    path: '/about',
    view: 'page-contact',
    contact: {
      id: '77',
      name: 'Fixture Contact Person',
      position: 'Studio Director',
      street: '17 Sample Street',
      suburb: 'Sampletown',
      state: 'CA',
      postcode: '90210',
      country: 'United States',
      telephone: '+1 555 0100',
      email: 'contact@example.test',
      webpage: 'https://example.test/',
      misc: '<p>Visits by appointment.</p>'
    },
    contentKind: 'blocks',
    content:
      '<!-- wp:paragraph -->\n<p>Intro</p>\n<!-- /wp:paragraph -->\n<!-- wp:tracy-base/slot {"position":"about-page"} /-->\n<!-- wp:paragraph -->\n<p>Outro</p>\n<!-- /wp:paragraph -->'
  }
  const out = buildPageContent(page, ctx)
  assert.equal(checkMarkup(out), true)
  assert.doesNotMatch(out, /tracy-base\/slot/)
  for (const text of ['Fixture Contact Person', 'Studio Director', '17 Sample Street', 'Sampletown', 'CA', '90210', 'United States', '+1 555 0100', 'contact@example.test', 'https://example.test/', 'Visits by appointment.'])
    assert.ok(out.includes(text), `contact body carries ${text}`)
  assert.match(out, /href="mailto:contact@example\.test"/)
  const order = ['<p>Intro</p>', '<p>Outro</p>', 'demo bg-bg', '[contact-form-7 id="9" title="Contact"]'].map(
    (s) => out.indexOf(s)
  )
  assert.ok(order[0] < order[1], 'body order kept')
  assert.equal(
    (out.match(/<!-- wp:group \{"tagName":"section"/g) ?? []).length,
    3,
    'one marked instance, two unmarked (masthead, section-2); unpublished and other-page ones skipped'
  )
  assert.ok(
    out.indexOf('[contact-form-7') > out.lastIndexOf('<!-- /wp:group -->'),
    'the form follows the last section'
  )
  assert.equal(ctx.sections.length, 3)
  assert.equal(instancesForPage(spec, page).size, 3)
})

test('seed: contact URLs escape quotes in every generated href attribute', () => {
  const ctx = {
    spec: { sections: { acm: [], custom: [] } },
    patternsMap,
    patterns,
    media,
    rewrite: (m) => m,
    cf7: null,
    log: [],
    sections: [],
    terms: new Map()
  }
  const page = {
    path: '/contact',
    view: 'page-contact',
    contentKind: 'blocks',
    content: '',
    contact: {
      email: `person"onmouseover="alert('email')'@example.test`,
      webpage: `https://example.test/"onmouseover="alert('web')'`,
      links: [{ label: 'Other', url: `https://links.test/"onmouseover="alert('link')'` }]
    }
  }
  const out = buildPageContent(page, ctx)
  const anchors = [...new JSDOM(out).window.document.querySelectorAll('a')]
  assert.equal(anchors.length, 3)
  assert.deepEqual(anchors.map((anchor) => [...anchor.attributes].map((attribute) => attribute.name)), [['href'], ['href'], ['href']])
  assert.deepEqual(anchors.map((anchor) => anchor.getAttribute('href')), [
    `mailto:${page.contact.email}`,
    page.contact.webpage,
    page.contact.links[0].url
  ])
  assert.match(out, /&#39;/)
})

test('seed: buildPageContent on a sections page fills library patterns and falls back to core/html when it cannot', () => {
  const lib = { ...patterns, 'tracy/section-faq': fixture('library-faq.html') }
  const ctx = {
    spec: { sections: { acm: [], custom: [] } },
    patternsMap,
    patterns: lib,
    media,
    rewrite: (m) => m,
    cf7: null,
    log: [],
    sections: [],
    terms: new Map()
  }
  const page = {
    path: '/',
    view: 'front-page',
    contentKind: 'sections',
    content: [
      { kind: 'section', sectionType: 'faq', moduleId: '10', html: fixture('module-faq.html') },
      {
        kind: 'section',
        sectionType: 'faq',
        moduleId: '11',
        html: '<section><h2>A</h2><h3>B</h3><p>x</p></section>'
      },
      { kind: 'section', sectionType: 'nothing', moduleId: '12', html: '<section><p>y</p></section>' },
      { kind: 'html', moduleId: '13', blocks: '<!-- wp:html -->\n<div>raw</div>\n<!-- /wp:html -->' }
    ]
  }
  const out = buildPageContent(page, ctx)
  assert.equal(checkMarkup(out), true)
  assert.deepEqual(
    ctx.sections.map((s) => `${s.module}:${s.kind}`),
    ['10:library', '11:fallback', '12:fallback', '13:html']
  )
  assert.match(ctx.sections[1].reason, /heading "B"/)
  assert.equal(ctx.sections[2].reason, 'no such library pattern')
  assert.equal((out.match(/<!-- wp:html -->/g) ?? []).length, 3)
})

test('seed: a row frame wraps its cells once and preserves classes and background image', () => {
  const ctx = { spec: { sections: { acm: [], custom: [], other: [] } }, patternsMap, patterns, media: () => null, rewrite: (m) => m, log: [], sections: [], terms: new Map() }
  const frame = { classes: ['bg-light', 'md:bg-light', 'sec-spacing-lg', 7], background: { image: 'assets/hero.jpg' } }
  const out = buildPageContent({ path: '/', contentKind: 'sections', content: [
    { kind: 'blocks', markup: '<!-- wp:paragraph --><p>One</p><!-- /wp:paragraph -->', row: 'hero', frame },
    { kind: 'blocks', markup: '<!-- wp:paragraph --><p>Two</p><!-- /wp:paragraph -->', row: 'hero', frame },
    { kind: 'blocks', markup: '<!-- wp:paragraph --><p>Plain</p><!-- /wp:paragraph -->' }
  ] }, ctx)
  assert.equal((out.match(/<!-- wp:group/g) ?? []).length, 1)
  assert.match(out, /"className":"bg-light md:bg-light sec-spacing-lg"/)
  assert.match(out, /"backgroundImage":\{"url":"assets\/hero\.jpg"\}/, 'the image is a core/group style value')
  assert.match(out, /background-image:url\('assets\/hero\.jpg'\)/)
  assert.ok(ctx.log.some((row) => /class names; not applied/.test(row.note)))
  assert.ok(ctx.log.some((row) => /assets\/hero\.jpg.*was not imported/.test(row.note)))
  assert.match(out, /<p>Plain<\/p>/)
  assert.equal(checkMarkup(out), true)
})

test('seed: category modules apply source ordering/count; related items require an evidenced explicit list', () => {
  const spec = { content: { categories: [{ id: '18', wpSlug: 'planning' }], posts: [{ title: 'Shared article', path: '/shared/', joomla: { articleId: '8' } }] }, sections: { other: [
    { id: '1', module: 'mod_articles_category', position: 'side', title: 'Category', params: { catid: ['18'], count: 2, article_ordering: 'a.title', article_ordering_direction: 'ASC' } },
    { id: '2', module: 'mod_related_items', position: 'side', title: 'Related', relatedByArticle: { '3': ['8'] }, params: {} },
    { id: '3', module: 'mod_related_items', position: 'side', title: 'No evidence', relatedByArticle: { '3': [] }, params: {} },
    { id: '4', module: 'mod_related_items', position: 'side', title: 'Missing source filter data', relatedUnavailable: ['access'], params: {} }
  ] } }
  const ctx = { spec, terms: new Map([['planning', { id: 4 }]]), log: [], currentArticleId: '3' }
  const category = renderAside(['1'], ctx, '/article')
  assert.match(category, /"perPage":2/)
  assert.match(category, /"order":"asc","orderBy":"title"/)
  assert.match(category, /"taxQuery":\{"category":\[4\]\}/)
  const related = renderAside(['2'], ctx, '/article')
  assert.match(related, /<a href="\/shared\/">Shared article<\/a>/)
  assert.doesNotMatch(related, /<!-- wp:query/)
  const absent = renderAside(['3'], ctx, '/article')
  assert.equal(absent, '')
  assert.match(ctx.log.at(-1).note, /no related articles evidenced/)
  assert.equal(renderAside(['4'], ctx, '/article'), '')
  assert.match(ctx.log.at(-1).note, /access.*nothing drawn/)
})

test('seed: category Joomla ordering falls back when featured ordering overrides menu_order', () => {
  const module = { id: '1', module: 'mod_articles_category', position: 'side', title: 'Category', params: { catid: ['18'], count: 5, article_ordering: 'a.ordering', article_ordering_direction: 'ASC' } }
  const build = (post) => {
    const ctx = {
      spec: { content: { categories: [{ id: '18', wpSlug: 'planning' }], posts: [post] }, sections: { other: [module] } },
      terms: new Map([['planning', { id: 4 }]]), log: []
    }
    return { output: renderAside(['1'], ctx, '/article'), ctx }
  }
  const conflict = build({ title: 'Featured post', path: '/featured/', category: 'planning', joomla: { articleId: '8', catid: '18', ordering: 4, featuredOrdering: 2 } })
  assert.doesNotMatch(conflict.output, /"orderBy":"menu_order"/)
  assert.match(conflict.ctx.log[0].note, /source ordering cannot be expressed/)

  const ordinary = build({ title: 'Ordinary post', path: '/ordinary/', category: 'planning', joomla: { articleId: '9', catid: '18', ordering: 4 } })
  assert.match(ordinary.output, /"orderBy":"menu_order"/)
  assert.equal(ordinary.ctx.log.length, 0)
})

test('seed: buildArchiveContent writes heading, description, child pages, subcategories and a descendant-aware query', () => {
  const spec = {
    content: {
      categories: [
        { title: 'Journal', wpSlug: 'journal', parent: null, description: '<p>Ideas for planning.</p>' },
        {
          title: 'Website services',
          wpSlug: 'website-services',
          parent: 'journal',
          description: '<div><img src="images/demo/misc/sam-4.jpg" alt="Desk"></div><p>Planning and care.</p>'
        },
        { title: 'Content guides', wpSlug: 'content-guides', parent: 'journal', description: '' }
      ],
      archives: []
    }
  }
  const terms = new Map([
    ['journal', { id: 5, slug: 'journal', name: 'Journal', description: 'Ideas for planning.' }],
    [
      'website-services',
      { id: 6, slug: 'website-services', name: 'Website services', description: 'Planning and care.' }
    ],
    ['content-guides', { id: 7, slug: 'content-guides', name: 'Content guides', description: '' }]
  ])
  const descendants = (slug) => spec.content.categories.filter((c) => c.parent === slug).map((c) => c.wpSlug)
  const ctx = {
    spec,
    patterns,
    terms,
    descendants,
    categoryUrl: (slug) => `/cat/${slug}/`,
    rewrite: (m) => m.replace('/wp-content/uploads/sam-4.jpg', '/uploads/2026/09/sam-4.jpg')
  }
  const cat = buildArchiveContent({ path: '/x', view: 'category', category: 'journal' }, ctx, {
    selfId: 40,
    hasChildPages: true
  })
  assert.equal(checkMarkup(cat), true)
  assert.match(cat, /<h2 class="wp-block-heading tracy-eyebrow">Journal<\/h2>/)
  assert.match(cat, /<p>Ideas for planning.<\/p>/)
  assert.match(cat, /"postType":"page","parents":\[40\]/, 'child pages listed through the parent id')
  assert.match(
    cat,
    /<h3 class="wp-block-heading"><a href="\/cat\/website-services\/">Website services<\/a><\/h3>/
  )
  assert.match(
    cat,
    /<img src="\/uploads\/2026\/09\/sam-4.jpg" alt="Desk"/,
    'a category image goes through the media rewrite'
  )
  assert.match(
    cat,
    /"taxQuery":\{"category":\[5,6,7\]\}/,
    'the block filter excludes children, so they are listed'
  )
  assert.match(cat, /"inherit":false/)
  assert.doesNotMatch(
    buildArchiveContent({ path: '/x', view: 'category', category: 'journal' }, ctx),
    /"parents"/,
    'no id, no child query'
  )
  assert.match(buildArchiveContent({ view: 'date' }, ctx), /^<!-- wp:archives/)
  assert.match(buildArchiveContent({ view: 'search' }, ctx), /^<!-- wp:search/)
  assert.match(buildArchiveContent({ view: 'tag' }, ctx), /^<!-- wp:tag-cloud/)
  assert.throws(
    () => buildArchiveContent({ path: '/y', view: 'category', category: 'missing' }, ctx),
    /not seeded/
  )
  const index = buildCategoryIndex(ctx)
  assert.equal(checkMarkup(index), true)
  assert.match(
    index,
    /<h2 class="wp-block-heading"><a href="\/cat\/journal\/">Journal<\/a><\/h2>[\s\S]*<h3 class="wp-block-heading"><a href="\/cat\/content-guides\/">Content guides<\/a><\/h3>/
  )
})

test('seed: buildNavigation resolves pages, routes account items to wp-login.php and nests headings', () => {
  const pagesByPath = new Map([
    ['/resources/sign-in', { view: 'page-login' }],
    ['/account/profile', { view: 'page-account' }],
    ['/product', { view: 'page' }]
  ])
  const resolve = (url) => (url === '/product' ? { id: 5, url: 'http://s/product/' } : null)
  const items = [
    { label: 'Product', url: '/product', published: true, children: [] },
    {
      label: 'Resources',
      url: null,
      published: true,
      children: [
        { label: 'Sign in', url: '/resources/sign-in', published: true, children: [] },
        { label: 'Profile', url: '/account/profile', published: true, children: [] },
        { label: 'Hidden', url: '/x', published: false, children: [] },
        { label: 'Ext', url: 'https://example.com', published: true, children: [] }
      ]
    }
  ]
  const out = buildNavigation(items, resolve, pagesByPath)
  assert.equal(checkMarkup(out), true)
  assert.match(
    out,
    /<!-- wp:navigation-link \{"label":"Product","type":"page","id":5,"url":"http:\/\/s\/product\/","kind":"post-type"\} \/-->/
  )
  assert.match(out, /<!-- wp:navigation-submenu \{"label":"Resources"\} -->/)
  assert.match(out, /"label":"Sign in","url":"\/wp-login.php","kind":"custom"/)
  assert.match(out, /"label":"Profile","url":"\/wp-admin\/profile.php","kind":"custom"/)
  assert.doesNotMatch(out, /Hidden/)
  assert.match(out, /"label":"Ext","url":"https:\/\/example.com","kind":"custom"/)
})

// #44: a seeded page for an account view wins over its wp-login.php target (Q9 is the fallback).
const issue44 = JSON.parse(
  readFileSync(new URL('./fixtures/issue44/account-navigation.json', import.meta.url), 'utf8')
)
const issue44Pages = (drop = []) =>
  new Map(Object.entries(issue44.pages).filter(([path]) => !drop.includes(path)))
const issue44Resolve = (seeded) => (url) => seeded[url] ?? null
const navLink = (label, attrs) =>
  `<!-- wp:navigation-link ${JSON.stringify({ label, ...attrs })} /-->`

test('seed: issue44 account items point at their seeded pages', () => {
  const out = buildNavigation(issue44.items, issue44Resolve(issue44.seeded), issue44Pages())
  assert.equal(checkMarkup(out), true)
  for (const [label, path] of [
    ['Login Form', '/login-form'],
    ['Registration Form', '/registration-form'],
    ['Lost Password', '/lost-password'],
    ['Profile', '/profile'],
    ['Product', '/product']
  ]) {
    const { id, url } = issue44.seeded[path]
    assert.ok(out.includes(navLink(label, { type: 'page', id, url, kind: 'post-type' })), label)
  }
  assert.doesNotMatch(out, /wp-login\.php|wp-admin/)
  assert.match(out, /<!-- wp:navigation-submenu \{"label":"Account"\} -->/)
  assert.doesNotMatch(out, /Hidden/)
  assert.ok(out.includes(navLink('Elsewhere', { url: '/not-declared', kind: 'custom' })))
  assert.ok(out.includes(navLink('Ext', { url: 'https://example.com', kind: 'custom' })))
})

test('seed: issue44 account views with no seeded page keep the Q9 core targets', () => {
  const { '/product': product } = issue44.seeded
  const out = buildNavigation(issue44.items, issue44Resolve({ '/product': product }), issue44Pages())
  assert.equal(checkMarkup(out), true)
  for (const [label, url] of [
    ['Login Form', '/wp-login.php'],
    ['Registration Form', '/wp-login.php?action=register'],
    ['Lost Password', '/wp-login.php?action=lostpassword'],
    ['Profile', '/wp-admin/profile.php']
  ])
    assert.ok(out.includes(navLink(label, { url, kind: 'custom' })), label)
  assert.ok(out.includes(navLink('Product', { type: 'page', ...product, kind: 'post-type' })))
  assert.ok(out.includes(navLink('Elsewhere', { url: '/not-declared', kind: 'custom' })))
})

test('seed: issue44 a page-map without the account views keeps the source URLs', () => {
  const accounts = ['/login-form', '/registration-form', '/lost-password', '/profile']
  const out = buildNavigation(issue44.items, issue44Resolve({}), issue44Pages(accounts))
  for (const [label, url] of [
    ['Login Form', '/login-form'],
    ['Registration Form', '/registration-form'],
    ['Lost Password', '/lost-password'],
    ['Profile', '/profile']
  ])
    assert.ok(out.includes(navLink(label, { url, kind: 'custom' })), label)
  assert.doesNotMatch(out, /wp-login\.php|wp-admin/)
})

test('seed: issue44 footer columns take the same precedence', () => {
  const links = footerLinks(
    '<ul><li><a href="/login-form">Login Form</a></li><li><a href="/profile">Profile</a></li></ul>'
  )
  const seeded = buildNavigation(links, issue44Resolve(issue44.seeded), issue44Pages())
  assert.ok(seeded.includes(navLink('Login Form', { type: 'page', ...issue44.seeded['/login-form'], kind: 'post-type' })))
  assert.ok(seeded.includes(navLink('Profile', { type: 'page', ...issue44.seeded['/profile'], kind: 'post-type' })))
  const unseeded = buildNavigation(links, issue44Resolve({}), issue44Pages())
  assert.ok(unseeded.includes(navLink('Login Form', { url: '/wp-login.php', kind: 'custom' })))
  assert.ok(unseeded.includes(navLink('Profile', { url: '/wp-admin/profile.php', kind: 'custom' })))
})

test('seed: issue44 edge inputs keep their output and errors propagate', () => {
  assert.equal(buildNavigation([], issue44Resolve(issue44.seeded), issue44Pages()), '')
  assert.equal(
    buildNavigation([{ label: 'Heading', url: null, published: true }], issue44Resolve({}), issue44Pages()),
    '<!-- wp:navigation-link {"label":"Heading"} /-->'
  )
  assert.equal(
    buildNavigation([{ label: 'Off', url: '/login-form', published: false }], issue44Resolve(issue44.seeded), issue44Pages()),
    ''
  )
  const boom = () => {
    throw new Error('resolver failed')
  }
  assert.throws(() => buildNavigation(issue44.items, boom, issue44Pages()), /resolver failed/)
  assert.throws(() => buildNavigation([null], issue44Resolve({}), issue44Pages()), TypeError)
})

test('seed: footerLinks reads a mod_custom list and fillNavigationRefs fills navigation refs in order', () => {
  const links = footerLinks(
    '<!-- wp:list -->\n<ul class="wp-block-list">\n<!-- wp:list-item -->\n<li><a href="/product">Product</a></li>\n<!-- /wp:list-item -->\n<!-- wp:list-item -->\n<li><a href="/pricing">Pricing</a></li>\n<!-- /wp:list-item -->\n</ul>\n<!-- /wp:list -->'
  )
  assert.deepEqual(
    links.map((l) => `${l.label}=${l.url}`),
    ['Product=/product', 'Pricing=/pricing']
  )
  const part =
    '<!-- wp:navigation {"className":"a","overlayMenu":"never"} /-->\n<!-- wp:navigation {"className":"b"} /-->\n<!-- wp:navigation {"className":"c"} /-->'
  const filled = fillNavigationRefs(part, [11, 12])
  assert.match(filled, /^<!-- wp:navigation \{"ref":11,"className":"a","overlayMenu":"never"\} \/-->/)
  assert.match(filled, /\{"ref":12,"className":"b"\}/)
  assert.match(
    filled,
    /<!-- wp:navigation \{"className":"c"\} \/-->$/,
    'a navigation with no ref to give keeps its markup'
  )
})

test('seed: a part whose navigation blocks are named nav.<menutype> takes each menu by name, not by position', () => {
  // The wp-tracy-business header: a topbar menu, then the main menu — two blocks, two menus.
  const header = [
    '<!-- wp:navigation {"className":"tracy-topbar__nav","overlayMenu":"never","metadata":{"name":"nav.topbar"}} /-->',
    '<!-- wp:paragraph --><p>brand</p><!-- /wp:paragraph -->',
    '<!-- wp:navigation {"className":"tracy-nav","overlayMenu":"mobile","metadata":{"name":"nav.tracy"}} /-->'
  ].join('\n')
  const menus = [
    { menutype: 'tracy', locale: 'en', items: [] },
    { menutype: 'topbar', locale: 'en', items: [] },
    { menutype: 'footer-company', locale: 'en', items: [] },
    { menutype: 'tracy-ru', locale: 'ru', items: [] },
    { menutype: 'topbar-ru', locale: 'ru', items: [] }
  ]
  const navs = { tracy: 21, topbar: 22, 'footer-company': 23, 'tracy-ru': 31, 'topbar-ru': 32, 'tracy-footer-1': 41 }
  const named = namedNavigationRefs(menus, navs, 'en')
  assert.deepEqual(named, { tracy: 21, topbar: 22, 'footer-company': 23 }, 'the RU twins and the synthesised footer columns stay out')
  assert.deepEqual(namedNavigationRefs(menus, navs, 'ru'), { 'tracy-ru': 31, 'topbar-ru': 32 })
  assert.deepEqual(namedNavigationRefs([{ menutype: 'tracy', items: [] }], navs, 'en'), { tracy: 21 }, 'a menu with no locale belongs to every locale')
  assert.equal(navBlockMenutype({ metadata: { name: 'nav.footer-contact' } }), 'footer-contact')
  assert.equal(navBlockMenutype({ metadata: { name: 'Top bar' } }), null)
  assert.equal(navBlockMenutype({ className: 'x' }), null)

  const missing = []
  const filled = fillNavigationRefs(header, [navs.tracy], named, missing)
  assert.match(filled, /^<!-- wp:navigation \{"ref":22,"className":"tracy-topbar__nav","overlayMenu":"never","metadata":\{"name":"nav.topbar"\}\} \/-->/, 'the topbar block takes the topbar menu, not the first ref')
  assert.match(filled, /\{"ref":21,"className":"tracy-nav","overlayMenu":"mobile","metadata":\{"name":"nav.tracy"\}\}/)
  assert.deepEqual(missing, [])

  // A named block the spec has no menu for keeps its markup and is reported; the unnamed block
  // next to it still takes the positional ref.
  const footer = [
    '<!-- wp:navigation {"className":"a","metadata":{"name":"nav.footer-company"}} /-->',
    '<!-- wp:navigation {"className":"b","metadata":{"name":"nav.footer-contact"}} /-->',
    '<!-- wp:navigation {"className":"c"} /-->'
  ].join('\n')
  const miss = []
  const out = fillNavigationRefs(footer, [41], named, miss)
  assert.match(out, /\{"ref":23,"className":"a"/)
  assert.match(out, /<!-- wp:navigation \{"className":"b","metadata":\{"name":"nav.footer-contact"\}\} \/-->/)
  assert.match(out, /\{"ref":41,"className":"c"\}/)
  assert.deepEqual(miss, ['footer-contact'])
})

test('seed: fingerprint is stable for equal input and changes with content', () => {
  assert.equal(fingerprint({ a: 1, content: 'x' }), fingerprint({ a: 1, content: 'x' }))
  assert.notEqual(fingerprint({ a: 1, content: 'x' }), fingerprint({ a: 1, content: 'y' }))
})

test('seed: introText takes the plain text before the read-more; renderAside draws sidebar modules as content', () => {
  assert.equal(
    introText(
      '<!-- wp:paragraph -->\n<p>Hi <strong>there</strong>.</p>\n<!-- /wp:paragraph -->\n<!-- wp:more -->\n<!--more-->\n<!-- /wp:more -->\n<!-- wp:paragraph -->\n<p>Rest</p>\n<!-- /wp:paragraph -->'
    ),
    'Hi there.'
  )
  assert.equal(introText('<!-- wp:paragraph -->\n<p>No more tag</p>\n<!-- /wp:paragraph -->'), '')
  const spec = {
    content: {
      categories: [
        { id: '17', title: 'Insights', wpSlug: 'insights', parent: null },
        {
          id: '18',
          title: 'Planning',
          wpSlug: 'planning',
          parent: 'insights',
          description: '<p>Plan well.</p>'
        }
      ]
    },
    sections: {
      other: [
        {
          id: '220',
          module: 'mod_articles_categories',
          position: 'sidebar-l',
          title: '[Tracy] Magazine — Sections',
          params: { parent: '17' }
        },
        {
          id: '221',
          module: 'mod_articles_category',
          position: 'sidebar-l',
          title: '[Tracy] Magazine — Latest',
          params: { catid: ['18'], count: 6 }
        },
        { id: '9', module: 'mod_finder', position: 'sidebar-l', title: 'Search', params: {} },
        { id: '10', module: 'mod_articles_category', position: 'sidebar-l', title: '[Tracy] Magazine — Before<br/>after & <tag>', params: { catid: ['18'], count: 2 } }
      ]
    }
  }
  const ctx = {
    spec,
    terms: new Map([
      ['insights', { id: 3, slug: 'insights' }],
      ['planning', { id: 4, slug: 'planning' }]
    ]),
    categoryUrl: (s) => `/c/${s}/`,
    rewrite: (m) => m,
    log: []
  }
  const aside = renderAside(['220', '221', '9'], ctx, '/x')
  assert.equal(checkMarkup(aside), true)
  assert.match(
    aside,
    /<h2 class="wp-block-heading tracy-eyebrow">Sections<\/h2>[\s\S]*<h3 class="wp-block-heading"><a href="\/c\/planning\/">Planning<\/a><\/h3>/
  )
  assert.match(aside, /<h2 class="wp-block-heading tracy-eyebrow">Latest<\/h2>/)
  assert.match(aside, /"perPage":6[^\n]*"taxQuery":\{"category":\[4\]\}/)
  // #74 S-31: mod_finder now has a block type (a WordPress search block), so it is drawn, not skipped with a note.
  assert.match(aside, /<!-- wp:search /)
  assert.equal(ctx.log.length, 0)
  for (const [i, br] of ['</br>', '<br>', '<br/>'].entries()) {
    spec.sections.other[3].title = `[Tracy] Magazine — Before${br}after & <tag>`
    const output = renderAside(['10'], ctx, '/x')
    assert.match(output, /Before <br>after &amp; &lt;tag&gt;/, `spelling ${i}`)
    assert.doesNotMatch(output, /&lt;br\/?&gt;/)
  }
  const page = withAside('<!-- wp:paragraph -->\n<p>Body</p>\n<!-- /wp:paragraph -->', aside, 'left')
  assert.equal(checkMarkup(page), true)
  assert.match(page, /^<!-- wp:columns[\s\S]*tracy-page__sidebar[\s\S]*<p>Body<\/p>/)
  assert.equal(withAside('x', '', 'left'), 'x')
})

test('seed: acmFromModule turns an OpenDesign testimonials / team block into the matching ACM instance', () => {
  const testimonials = `<section data-od-block="testimonials" class="section"><div class="wrap"><div class="section-head"><span class="kicker">The people</span><h2>Shared standard.</h2><p>Meet the people.</p></div>
    <div class="grid-3">
      <div><div><p>Quote one.</p><div style="display:flex"><span>AM</span><div><div>Alex Morgan</div><div>Marketing lead</div></div></div></div></div>
      <div><div><p>Quote two.</p><div style="display:flex"><span>JL</span><div><div>Jordan Lee</div><div>Operations lead</div></div></div></div></div>
    </div></div><p class="od-demo-note">Illustrative.</p></section>`
  const t = acmFromModule(testimonials, '236')
  assert.equal(t.instance.type, 'testimonials')
  assert.deepEqual(t.instance.fields, { eyebrow: 'The people', heading: 'Shared standard.', columns: '2' })
  assert.deepEqual(t.instance.items[1], {
    quote: 'Quote two.',
    'quote-name': 'Jordan Lee',
    'quote-role': 'Operations lead',
    'quote-avatar': ''
  })
  assert.deepEqual(t.extras, { intro: 'Meet the people.', note: 'Illustrative.' })
  const team = `<section data-od-block="team"><div class="wrap"><div class="section-head"><span class="kicker">People</span><h2>Team</h2><p>Intro.</p></div><div class="op-team">
    <article><img src="/images/demo/members/mem-1.jpg" alt="Portrait"><h3>Adam Hale</h3><p class="op-role">Design Director</p><p>Shapes the direction.</p></article></div></div></section>`
  const m = acmFromModule(team, '246')
  assert.equal(m.instance.type, 'team')
  assert.deepEqual(m.instance.items[0], {
    'member-portrait': '/images/demo/members/mem-1.jpg',
    'member-name': 'Adam Hale',
    'member-role': 'Design Director',
    'member-bio': 'Shapes the direction.',
    'member-link': ''
  })
  assert.equal(acmFromModule('<section data-od-block="hero"><h1>x</h1></section>'), null)
  assert.equal(
    rewriteBrandTokens(
      'border:var(--brand-line-width) solid var(--brand-color-border-secondary);font-family:var(--display-family)'
    ),
    'border:1px solid var(--wp--preset--color--border-soft);font-family:inherit'
  )
  const unknown = new Set()
  assert.equal(rewriteBrandTokens('x:var(--brand-nope)', unknown), 'x:var(--brand-nope)')
  assert.deepEqual([...unknown], ['nope'])
})

test('collectImages resolves an uploads-form ref through the spec image table', async () => {
  const { collectImages } = await import('../seed.mjs')
  const spec = {
    content: {
      posts: [{ featuredImage: '/wp-content/uploads/art-hero-2.png', featuredImageAlt: 'hero' }],
      pages: [],
      categories: [],
      images: [{ src: '/wp-content/uploads/art-hero-2.png', file: 'art-hero-2.png', original: 'img/art-hero-2.png', alt: 'Art' }]
    },
    sections: { custom: [], acm: [] }
  }
  const wanted = collectImages(spec, { types: {} })
  assert.deepEqual(wanted, [{ key: 'img/art-hero-2.png', alt: 'hero' }])
  const unknown = collectImages({ ...spec, content: { ...spec.content, images: [] } }, { types: {} })
  assert.deepEqual(unknown, [])
})

test('wpPostName mirrors sanitize_title: ASCII kept, others percent-encoded, cut at 200 encoded chars', async () => {
  const { wpPostName } = await import('../seed.mjs')
  assert.equal(wpPostName('Four common mistakes'), 'four-common-mistakes')
  assert.equal(wpPostName('choosing-sandwich-roof-panels'), 'choosing-sandwich-roof-panels')
  const ru = wpPostName('выбор-сэндвич-панелей-для-кровли-цеха')
  assert.match(ru, /^%d0%b2%d1%8b%d0%b1%d0%be%d1%80-/)
  assert.ok(ru.length <= 200)
  // 40 Cyrillic letters = 240 encoded chars: cut before the 200th, never mid-%xx.
  const long = wpPostName('а'.repeat(40))
  assert.equal(long.length, 198)
  assert.ok(!/%.?$/.test(long) || /%[0-9a-f]{2}$/.test(long))
})

test('wpPostName of a TITLE is what sanitize_title stores: punctuation and angle quotes dropped, accents folded, the 200 budget counts the dropped quotes', async () => {
  // Every expected value is `wp eval 'echo sanitize_title(...)'` on WordPress 7.1 (stand 8237, 14/09).
  const { wpPostName } = await import('../seed.mjs')
  assert.equal(
    wpPostName('Работа в «Норткейт»'),
    '%d1%80%d0%b0%d0%b1%d0%be%d1%82%d0%b0-%d0%b2-%d0%bd%d0%be%d1%80%d1%82%d0%ba%d0%b5%d0%b9%d1%82'
  )
  assert.equal(wpPostName('Café Nº1: a.b_c – d — e & f’s "g"'), 'cafe-no1-a-b_c-d-e-fs-g') // language-allow: data: accented title to slugify
  // «Электра», ОЭЗ «Липецк»: the quotes are cut from the result but were counted toward 200 first.
  assert.equal(
    wpPostName('Завод бытовой техники «Электра», ОЭЗ «Липецк»'),
    '%d0%b7%d0%b0%d0%b2%d0%be%d0%b4-%d0%b1%d1%8b%d1%82%d0%be%d0%b2%d0%be%d0%b9-%d1%82%d0%b5%d1%85%d0%bd%d0%b8%d0%ba%d0%b8-%d1%8d%d0%bb%d0%b5%d0%ba%d1%82%d1%80%d0%b0-%d0%be%d1%8d%d0%b7'
  )
  // ё stays ё (remove_accents leaves Cyrillic alone); the 200 cut lands mid-word.
  assert.equal(
    wpPostName('Четыре типичные ошибки в расчёте фундаментов под тяжёлые станки'),
    '%d1%87%d0%b5%d1%82%d1%8b%d1%80%d0%b5-%d1%82%d0%b8%d0%bf%d0%b8%d1%87%d0%bd%d1%8b%d0%b5-%d0%be%d1%88%d0%b8%d0%b1%d0%ba%d0%b8-%d0%b2-%d1%80%d0%b0%d1%81%d1%87%d1%91%d1%82%d0%b5-%d1%84%d1%83%d0%bd%d0%b4'
  )
})

test('wpPostName keeps an ASCII menutype and encodes a Cyrillic one the way WordPress stores it', async () => {
  const { wpPostName } = await import('../seed.mjs')
  assert.equal(wpPostName('footer-company'), 'footer-company')
  assert.equal(wpPostName('footer-компания-ru'), 'footer-%d0%ba%d0%be%d0%bc%d0%bf%d0%b0%d0%bd%d0%b8%d1%8f-ru')
})

test('seed: buildPageContent maps inline colour literals to presets on the core/html path only, and reports the counts', () => {
  const lib = { ...patterns, 'tracy/section-faq': fixture('library-faq.html') }
  const palette = [
    { slug: 'bg', color: '#f5f3ee' },
    { slug: 'surface-warm', color: '#eceae4' },
    { slug: 'fg', color: '#14171a' }
  ]
  const mkCtx = (pal) => ({
    spec: { sections: { acm: [], custom: [] } },
    patternsMap,
    patterns: lib,
    media,
    rewrite: (m) => m,
    cf7: null,
    log: [],
    sections: [],
    terms: new Map(),
    palette: pal,
    inlineColors: []
  })
  const faq = fixture('module-faq.html').replace('<h2', '<h2 style="color: rgb(20, 23, 26)"')
  const page = {
    path: '/about/',
    view: 'page',
    contentKind: 'sections',
    content: [
      { kind: 'section', sectionType: 'faq', moduleId: '10', html: faq },
      {
        kind: 'section',
        sectionType: 'nothing',
        moduleId: '12',
        html: '<section style="background: rgb(237,234,226); color: rgb(20,23,26)"><p style="color: #ff0000">y</p></section>'
      },
      {
        kind: 'html',
        moduleId: '13',
        blocks: '<!-- wp:html -->\n<div style="background-color: #f5f3ee">raw</div>\n<!-- /wp:html -->'
      }
    ]
  }
  const plain = buildPageContent(page, mkCtx([]))
  const ctx = mkCtx(palette)
  const out = buildPageContent(page, ctx)
  assert.equal(checkMarkup(out), true)
  assert.deepEqual(
    ctx.sections.map((s) => `${s.module}:${s.kind}`),
    ['10:library', '12:fallback', '13:html']
  )
  // The library-filled section is the same markup with or without a palette.
  const libraryPart = (m) => m.slice(0, m.indexOf('<!-- wp:html -->'))
  assert.equal(libraryPart(out), libraryPart(plain))
  assert.match(
    out,
    /<section style="background: var\(--wp--preset--color--surface-warm\); color: var\(--wp--preset--color--fg\)"><p style="color: #ff0000">y<\/p><\/section>/
  )
  assert.match(out, /<div style="background-color: var\(--wp--preset--color--bg\)">raw<\/div>/)
  assert.deepEqual(ctx.inlineColors, [{ page: '/about/', replaced: 3, kept: 1 }])
  // Idempotent: seeding the rewritten page again changes nothing and reports nothing replaced.
  const again = mkCtx(palette)
  const rerun = buildPageContent(
    { ...page, content: [{ kind: 'html', moduleId: '13', blocks: out.slice(out.indexOf('<!-- wp:html -->')) }] },
    again
  )
  assert.equal(rerun, out.slice(out.indexOf('<!-- wp:html -->')))
  assert.deepEqual(again.inlineColors, [{ page: '/about/', replaced: 0, kept: 1 }])
})

test('seed: loadPalette layers the contract, the overlay tokens.css and the built theme.json, and names each in the report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seed-palette-'))
  const spec = join(dir, 'spec')
  mkdirSync(spec)
  writeFileSync(
    join(spec, 'design-contract.json'),
    JSON.stringify({
      variants: [{ id: 'desktop-light', mode: 'light', width: 1440 }],
      tokens: { 'desktop-light': { '--bg': 'rgb(245, 243, 238)', '--fg': '#14171a' } },
      rules: []
    })
  )
  const themeSrc = join(dir, 'theme')
  mkdirSync(join(themeSrc, 'overlays', 't'), { recursive: true })
  mkdirSync(join(themeSrc, 'src', 't'), { recursive: true })
  writeFileSync(join(themeSrc, 'overlays', 't', 'tokens.css'), ':root {\n  --bg: #f5f3ee;\n  --surface-warm: #eceae4;\n  --text-base: 16px;\n}\n')
  writeFileSync(
    join(themeSrc, 'src', 't', 'theme.json'),
    JSON.stringify({ settings: { color: { palette: [{ slug: 'surface-warm', color: '#ECEAE4' }, { slug: 'accent', color: '#14483a' }] } } })
  )
  const report = { notes: [] }
  const palette = loadPalette({ spec, theme: 't', themeSrc }, report)
  assert.deepEqual(palette, [
    { slug: 'bg', color: '#f5f3ee' },
    { slug: 'fg', color: '#14171a' },
    { slug: 'surface-warm', color: '#eceae4' },
    { slug: 'accent', color: '#14483a' }
  ])
  assert.equal(report.palette.presets, 4)
  assert.deepEqual(
    report.palette.sources.map((s) => s.slice(dir.length + 1)),
    ['spec/design-contract.json', 'theme/overlays/t/tokens.css', 'theme/src/t/theme.json']
  )
  const empty = { notes: [] }
  assert.deepEqual(loadPalette({ spec: join(dir, 'nowhere'), theme: 't' }, empty), [])
  assert.match(empty.notes[0].note, /no colour palette/)
})

test('seed: the redirects option is named after the theme slug, as its template_redirect hook reads it', () => {
  assert.equal(redirectsOption('tracy-base'), 'tracy_base_redirects')
  assert.equal(redirectsOption('wp-tracy-business'), 'wp_tracy_business_redirects')
})

test('seed: the posts page lead is the intro of its h1 section, unless the spec gives an excerpt', () => {
  const spec = {
    sections: {
      custom: [
        { id: 'news-en-2', pages: [{ file: 'News.html', wpPath: '/news' }], fields: { headingLevel: 1, intro: 'Project updates and field notes.' } },
        { id: 'news-en-3', pages: [{ file: 'News.html', wpPath: '/news' }], fields: { headingLevel: null, intro: 'Tender news.' } }
      ]
    }
  }
  assert.equal(pageLead({ path: '/news', file: 'News.html', view: 'home' }, spec), 'Project updates and field notes.')
  assert.equal(pageLead({ path: '/news', excerpt: 'Given.' }, spec), 'Given.')
  assert.equal(pageLead({ path: '/about' }, spec), '')
})

test('seed: every page carries an excerpt of its own — the spec\'s, else its h1 lead, else the first paragraph of its body', () => {
  const spec = {
    sections: {
      custom: [
        { id: 'projects-en-2', pages: [{ file: 'Projects.html', wpPath: '/projects' }], fields: { headingLevel: 1, intro: '380 projects since 2004.' } }
      ]
    }
  }
  // A typed page: its h1 section's intro, not the title and not the whole flattened page.
  assert.equal(pageExcerpt({ path: '/projects', file: 'Projects.html', view: 'page' }, spec), '380 projects since 2004.')
  // A page whose body is the export's verbatim markup has no typed section: the first sentence
  // of the body, with the h1 above it skipped — the search view printed the title twice without
  // this, then the module map ("topbar logo menu header-cta hero") that follows it.
  const styleGuide = {
    path: '/style-guide',
    file: 'Style guide.html',
    view: 'page-style-guide',
    content:
      '<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">Style guide &amp; module positions</h1>\n<!-- /wp:heading -->\n' +
      '<!-- wp:paragraph -->\n<p>Reference for whoever installs the template: position names, type scale and colours.</p>\n<!-- /wp:paragraph -->\n' +
      '<!-- wp:html -->\n<div><div>topbar</div><div>logo</div><div>menu</div></div>\n<!-- /wp:html -->'
  }
  assert.equal(pageExcerpt(styleGuide, spec), 'Reference for whoever installs the template: position names, type scale and colours.')
  // The spec's own excerpt still wins, and a page with neither gets nothing rather than machine text.
  assert.equal(pageExcerpt({ path: '/x', excerpt: 'Given.', content: '<p>Not this one at all thanks</p>' }, spec), 'Given.')
  assert.equal(pageExcerpt({ path: '/x', content: '<p>Too short</p>' }, spec), '')
  // A break between two source elements is a space here too: `stripTags` reads `<br>` as one.
  assert.equal(
    bodyLead('<p>Building the groundwork for<br>next-generation plants across the country</p>'),
    'Building the groundwork for next-generation plants across the country'
  )
})

test('seed: page_for_posts is the page-map page with view home in the default locale, or nothing', () => {
  const pages = [
    { path: '/', view: 'front-page', locale: 'en' },
    { path: '/ru/news', view: 'home', locale: 'ru' },
    { path: '/news', view: 'home', locale: 'en' },
    { path: '/old-news', view: 'home', locale: 'en', synthetic: true }
  ]
  assert.equal(postsPage(pages, 'en')?.path, '/news')
  assert.equal(postsPage(pages, 'ru')?.path, '/ru/news')
  assert.equal(postsPage(pages, null)?.path, '/ru/news', 'no default locale: the first one')
  assert.equal(postsPage([{ path: '/resources/blog', view: 'category' }], 'en'), null)
})

test('seed: a mega-menu block in the header owns its label; the menu item of that name is dropped, twins by position', () => {
  const part = '<!-- wp:navigation {"metadata":{"name":"nav.tracy"}} /-->\n<!-- wp:wp-tracy-business/mega-menu {"label":"Resources"} -->\n<div>x</div>\n<!-- /wp:wp-tracy-business/mega-menu -->'
  assert.deepEqual(megaLabels(part), ['Resources'])
  const menus = [
    { menutype: 'tracy', locale: 'en', items: [{ label: 'Home' }, { label: 'Resources', children: [{ label: 'A' }] }, { label: 'Contact' }] },
    { menutype: 'tracy-ru', locale: 'ru', items: [{ label: 'Главная' }, { label: 'Ресурсы', children: [{ label: 'A' }] }, { label: 'Контакты' }] },
    { menutype: 'topbar', locale: 'en', items: [{ label: 'Careers' }] }
  ]
  const out = withoutMegaItems(menus, ['resources'], 'en')
  assert.deepEqual(out[0].items.map((i) => i.label), ['Home', 'Contact'])
  assert.deepEqual(out[1].items.map((i) => i.label), ['Главная', 'Контакты'])
  assert.deepEqual(out[2].items.map((i) => i.label), ['Careers'])
  assert.equal(withoutMegaItems(menus, [], 'en'), menus, 'no mega block: the menus pass through untouched')
})

test('seed: the 404 page of the default locale is named in <theme>_404_page', () => {
  const pages = [
    { path: '/ru/404', view: '404', locale: 'ru' },
    { path: '/404', view: '404', locale: 'en' },
    { path: '/', view: 'front-page', locale: 'en' }
  ]
  assert.equal(notFoundPage(pages, 'en')?.path, '/404')
  assert.equal(notFoundPage([{ path: '/', view: 'front-page' }], 'en'), null)
  assert.equal(notFoundOption('wp-tracy-business'), 'wp_tracy_business_404_page')
})

test('postSourceFacts: date, category, excerpt, tags and sticky come from the source when the spec lacks them; derivedCategories makes them top-level terms beside the listing term', async () => {
  const { postSourceFacts, derivedCategories } = await import('../seed.mjs')
  const html = (s) => `<!-- wp:html -->\n${s}\n<!-- /wp:html -->`
  const spec = {
    content: {
      categories: [{ id: 'news', title: 'News', wpSlug: 'news', parent: null }],
      posts: [
        {
          slug: 'four',
          title: 'Four common mistakes',
          category: 'news',
          locale: 'en',
          date: null,
          excerpt: '',
          featuredImage: '/wp-content/uploads/art-hero-2.png',
          joomla: { ordering: 12 },
          source: { dateText: 'Head of Structures · 28 Jul 2026 · 7 min read' },
          content: [
            html('<div><span>Engineering</span></div>'),
            '<!-- wp:heading {"level":1} -->\n<h1 class="wp-block-heading">Four common mistakes</h1>\n<!-- /wp:heading -->',
            '<!-- wp:paragraph -->\n<p>Get one load wrong.</p>\n<!-- /wp:paragraph -->',
            html('<div><div>Sergey</div><div>Head of Structures · 28 Jul 2026 · 7 min read</div><a href="#">in</a></div>'),
            html('<div><img src="/wp-content/uploads/art-hero-2.png"></div>'),
            html('<div><p>Body.</p></div>'),
            html('<div><span>Tags:</span> <a href="#">structures</a> <a href="#">vibration</a></div>')
          ].join('\n')
        },
        { slug: 'tender', title: 'Northgate wins the tender', category: 'news', locale: 'en', date: null, excerpt: 'Card text.', synthetic: true, joomla: { ordering: 4, featuredOrdering: 2 }, source: { card: true, dateText: '12 Aug 2026 · 4 min read' }, content: '<!-- wp:paragraph -->\n<p>Card text.</p>\n<!-- /wp:paragraph -->' },
        { slug: 'undated', title: 'Undated post', category: 'news', locale: 'en', date: null, excerpt: '', source: {}, content: '' },
        { slug: 'four-ru', title: 'Четыре ошибки', category: 'news', locale: 'ru', date: '2026-07-28 09:00:00', excerpt: '', source: { dateText: '28.07.2026' }, content: html('<div><span>Инженерия</span></div>') }
      ]
    },
    sections: {
      custom: [
        { id: 'news-en-2', html: '<section><article><div><span>Featured · Disclosure</span></div><h2><a href="#">Northgate wins the tender</a></h2><p>The RUB 1.2bn package.</p><div>12 Aug 2026 · 4 min read</div></article><article><div><span>Engineering</span></div><h3>Four common mistakes</h3><p>Field notes from 12 plants.</p><div>28 Jul 2026</div></article></section>' }
      ]
    }
  }
  const facts = postSourceFacts(spec, { i18n: 'polylang', defaultLocale: 'en' })
  const four = facts.get('four')
  assert.equal(four.date, '2026-07-28 00:00:00')
  assert.equal(four.categorySlug, 'engineering')
  assert.equal(four.categoryName, 'Engineering')
  assert.equal(four.head.lead, 'Get one load wrong.')
  assert.equal(four.card.text, 'Field notes from 12 plants.')
  assert.deepEqual(four.tags, ['structures', 'vibration'])
  assert.equal(four.sticky, false)
  assert.equal(four.menuOrder, 12, 'ordinary Joomla ordering populates WordPress menu_order')
  assert.deepEqual(four.head.removed, ['eyebrow', 'title', 'lead', 'byline', 'featured-image', 'tags'])
  assert.doesNotMatch(four.head.content, /<h1|art-hero-2|Tags:|7 min read|Get one load wrong/)
  assert.match(four.head.content, /Body\./)
  const tender = facts.get('tender')
  assert.equal(tender.menuOrder, 2, 'featured ordering takes precedence when declared')
  assert.equal(tender.date, '2026-08-12 00:00:00')
  assert.equal(tender.categorySlug, 'disclosure', 'the card eyebrow, without its Featured prefix')
  assert.equal(tender.sticky, true, 'the featured card is the sticky post')
  assert.equal(tender.head.content, '', 'a card stub: its one paragraph is the excerpt')
  assert.equal(tender.head.lead, 'Card text.')
  assert.equal(facts.get('undated').date, '2026-07-27 00:00:00', 'one day before the earliest dated post')
  const ru = facts.get('four-ru')
  assert.equal(ru.date, '2026-07-28 09:00:00', 'a spec date is kept')
  assert.equal(ru.categorySlug, `${encodeURIComponent('инженерия').toLowerCase()}-ru`)
  assert.deepEqual(
    derivedCategories(spec.content.posts, facts, { i18n: 'polylang', defaultLocale: 'en' }).map((c) => [c.wpSlug, c.title, c.parent, c.locale]),
    [
      ['engineering', 'Engineering', null, 'en'],
      ['disclosure', 'Disclosure', null, 'en'],
      [`${encodeURIComponent('инженерия').toLowerCase()}-ru`, 'Инженерия', null, 'ru']
    ],
    'top-level: a categories block that lists top-level terms (the sidebar, the filter chips) shows them, and the breadcrumb has no second "News" step'
  )
  // Without Polylang: no suffix, no locale.
  const plain = derivedCategories(spec.content.posts, postSourceFacts(spec), {})
  assert.deepEqual(plain.map((c) => [c.wpSlug, c.parent, c.locale ?? null]), [['engineering', null, null], ['disclosure', null, null], [encodeURIComponent('инженерия').toLowerCase(), null, null]])
  // A spec whose category already names the eyebrow derives nothing.
  const named = { ...spec, content: { ...spec.content, categories: [{ id: 'engineering', title: 'Engineering', wpSlug: 'engineering', parent: null, titles: { ru: 'Инженерия' } }], posts: [{ ...spec.content.posts[0], category: 'engineering' }, { ...spec.content.posts[3], category: 'engineering' }] } }
  assert.equal(postSourceFacts(named).get('four').categorySlug, null)
  assert.equal(postSourceFacts(named, { i18n: 'polylang', defaultLocale: 'en' }).get('four-ru').categorySlug, null, 'the RU eyebrow is the category\'s RU title: nothing derived, the post goes in engineering-ru')
})

test('postSourceFacts: posts sharing one date are seeded one second apart in source order; the report note keeps the source date', async () => {
  const { postSourceFacts } = await import('../seed.mjs')
  const post = (slug) => ({ slug, title: slug, category: 'news', locale: 'en', date: '2021-09-14 00:00:00', excerpt: '', source: {}, content: '' })
  const spec = { content: { categories: [{ id: 'news', title: 'News', wpSlug: 'news', parent: null }], posts: ['a', 'b', 'c'].map(post) }, sections: { custom: [] } }
  const facts = postSourceFacts(spec, {})
  assert.deepEqual(['a', 'b', 'c'].map((s) => facts.get(s).date), ['2021-09-14 00:00:02', '2021-09-14 00:00:01', '2021-09-14 00:00:00'])
  assert.deepEqual(['a', 'b', 'c'].map((s) => facts.get(s).sourceDate), Array(3).fill('2021-09-14 00:00:00'))
  // idempotent: the fingerprint of a post includes post_date, so the same input must give the same dates
  const again = postSourceFacts(spec, {})
  assert.deepEqual(['a', 'b', 'c'].map((s) => again.get(s).date), ['a', 'b', 'c'].map((s) => facts.get(s).date))
})

test('liveLinks: a dead link that prints its own address gets it; other dead links stay', async () => {
  const { liveLinks } = await import('../seed.mjs')
  const html = `<!-- wp:html -->
<div><a href="#" class="scp3"><span>Telegram</span><span>@northgate_ind</span><span>Site progress</span><span>t.me/northgate_ind</span></a>
<a href="#"><span>LinkedIn</span><span>linkedin.com/company/northgate-industrial</span></a>
<a href="#">All projects →</a><a href="/about">About</a><a href="#"><span>Version</span><span>2.0</span></a></div>
<!-- /wp:html -->`
  const out = liveLinks(html)
  assert.match(out, /<a href="https:\/\/t\.me\/northgate_ind" class="scp3" target="_blank" rel="noopener">/)
  assert.match(out, /<a href="https:\/\/linkedin\.com\/company\/northgate-industrial" target="_blank" rel="noopener">/)
  assert.match(out, /<a href="#">All projects →<\/a>/)
  assert.match(out, /<a href="\/about">About<\/a>/)
  assert.match(out, /<a href="#"><span>Version<\/span>/)
  assert.equal(liveLinks('<div><a href="/x">x</a></div>'), '<div><a href="/x">x</a></div>', 'nothing to do: untouched bytes')
})

test('specForms: the contact form per locale, and a newsletter form from the one-field subscribe box', async () => {
  const { specForms } = await import('../seed.mjs')
  const spec = {
    content: { pages: [{ path: '/contact', view: 'page-contact' }, { path: '/newsletter', view: 'page-newsletter' }, { path: '/news', view: 'home' }] },
    sections: {
      custom: [
        { id: 'contact-en-3', sectionType: 'form', locale: 'en', pages: [{ wpPath: '/contact' }], html: '<div><label>Full name *</label><input type="text" placeholder="Ivan"><label>Email *</label><input type="email"><button>Send request</button></div>' },
        // The news sidebar: a search box AND a subscribe card — two controls, not the newsletter form.
        { id: 'news-en-3', sectionType: 'form', locale: 'en', pages: [{ wpPath: '/news' }], html: '<aside><div><input type="text" placeholder="Enter a keyword…"><button>⌕</button></div><div><input type="text" placeholder="Work email"><button>Subscribe</button></div></aside>' },
        { id: 'newsletter-en-4', sectionType: 'text', locale: 'en', pages: [{ wpPath: '/newsletter' }], html: '<div><p>Get our industry brief.</p><input type="text" placeholder="Work email"><button>Subscribe</button></div>' },
        { id: 'newsletter-ru-4', sectionType: 'text', locale: 'ru', pages: [{ wpPath: '/ru/newsletter' }], html: '<div><input type="text" placeholder="Рабочая почта"><button>Подписаться</button></div>' }
      ]
    }
  }
  const forms = specForms(spec, { defaultLocale: 'en' })
  assert.deepEqual(forms.map((f) => [f.key, f.title, f.locale, f.kind, f.section]), [
    ['contact', 'Contact', 'en', 'contact', 'contact-en-3'],
    ['newsletter', 'Newsletter', 'en', 'newsletter', 'newsletter-en-4'],
    ['newsletter-ru', 'Newsletter (ru)', 'ru', 'newsletter', 'newsletter-ru-4']
  ])
  const nl = forms[1]
  assert.deepEqual(nl.fields.map((f) => [f.kind, f.name]), [['email', 'email-1']])
  assert.match(nl.form, /\[email\* email-1 placeholder "Work email"\]/)
  assert.match(nl.form, /\[submit "Subscribe"\]/)
  const mixedRequired = specForms({
    content: { pages: [{ path: '/newsletter', view: 'page-newsletter' }] },
    sections: { custom: [{ id: 'mixed-newsletter', sectionType: 'form', pages: [{ wpPath: '/newsletter' }], html: '<form><label>Name</label><input name="name" type="text"><label>Email</label><input name="email" type="email" required><button>Subscribe</button></form>' }] }
  })[0]
  assert.deepEqual(mixedRequired.fields.map((f) => [f.kind, f.required]), [['text', false], ['email', true]])
  assert.match(mixedRequired.form, /\[text name\]/)
  assert.match(mixedRequired.form, /\[email\* email\]/)
  // No subscribe box anywhere: only the contact form.
  const none = specForms({ ...spec, sections: { custom: spec.sections.custom.slice(0, 1) } }, { defaultLocale: 'en' })
  assert.deepEqual(none.map((f) => f.key), ['contact'])
})

test('searchViewRules: a search view is a draft page and a redirect to its locale root, where the theme carries ?s= over', async () => {
  const { searchViewRules, routeTargets } = await import('../seed.mjs')
  const pages = [
    { view: 'search', path: '/search', locale: 'en' },
    { view: 'search', path: '/ru/search', locale: 'ru' },
    { view: 'page', path: '/about', locale: 'en' }
  ]
  const notes = []
  assert.deepEqual(searchViewRules(pages, [{ from: '/ru/search', to: '/ru/' }], notes), [{ from: '/search', to: '/', status: 301 }])
  assert.equal(notes.length, 1)
  assert.deepEqual(searchViewRules(pages, [], []), [
    { from: '/search', to: '/', status: 301 },
    { from: '/ru/search', to: '/ru', status: 301 }
  ])
  const targets = routeTargets(pages, new Map(), {})
  assert.deepEqual(targets.map((t) => [t.path, t.expect]), [['/search', '301|200'], ['/ru/search', '301|200'], ['/about', 200]])
})

test('searchViewRules: a map that serves the search view at its own path gets no redirect, and its route is probed for 200', async () => {
  const { searchViewRules, routeTargets } = await import('../seed.mjs')
  const pages = [
    { view: 'search', path: '/pages/search' },
    { view: 'page', path: '/pages' }
  ]
  const views = { search: { servedAtPath: true } }
  const notes = []
  assert.deepEqual(searchViewRules(pages, [], notes, views), [])
  assert.equal(notes.length, 0)
  assert.deepEqual(routeTargets(pages, new Map(), { views }).map((t) => [t.path, t.expect]), [['/pages/search', 200], ['/pages', 200]])
  // without the declaration (and with other views declared): exactly as before
  const other = { 'page-account': { expect: { status: 303 } } }
  assert.deepEqual(searchViewRules(pages, [], [], other), [{ from: '/pages/search', to: '/pages', status: 301 }])
  assert.deepEqual(routeTargets(pages, new Map(), { views: other })[0], { path: '/pages/search', expect: '301|200' })
})

test('postAuthors: a named byline is a user of its own, a post without one takes the editorial user; a translation shares its pair\'s', async () => {
  const { postAuthors } = await import('../seed.mjs')
  const posts = [
    { slug: 'four', locale: 'en', category: 'news' },
    { slug: 'tender', locale: 'en', category: 'news' },
    { slug: 'four-ru', locale: 'ru', category: 'news' },
    { slug: 'tender-ru', locale: 'ru', category: 'news' }
  ]
  const facts = new Map([
    ['four', { head: { author: { name: 'Sergey Trofimov', role: 'Head of Structures' } } }],
    ['tender', { head: { author: { name: null, role: 'Communications' } } }],
    ['four-ru', { head: { author: { name: 'Сергей Трофимов', role: 'Начальник отдела КЖ/КМ' } } }],
    ['tender-ru', { head: { author: null } }]
  ])
  const { users, byPost } = postAuthors(posts, facts, { siteName: 'Northgate Industrial', defaultLocale: 'en' })
  assert.deepEqual(users, [
    // The translation's byline gives the user its role in that locale (Polylang's per-language
    // biography, `description_ru`), and no second user.
    { login: 'sergey-trofimov', display: 'Sergey Trofimov', description: 'Head of Structures', email: 'sergey-trofimov@example.invalid', bios: { ru: 'Начальник отдела КЖ/КМ' } },
    { login: 'editorial', display: 'Northgate Industrial Editorial', description: 'Communications', email: 'editorial@example.invalid' }
  ])
  assert.deepEqual([...byPost], [['four', 'sergey-trofimov'], ['tender', 'editorial'], ['four-ru', 'sergey-trofimov'], ['tender-ru', 'editorial']])
  // Two different roles behind the editorial posts: the user carries none. (A translation's
  // role is its pair's in another language, and does not count as a second one.)
  const mixed = new Map([...facts, ['tender-ru', { head: { author: { name: null, role: 'Пресс-служба' } } }], ['hours', { head: { author: { name: null, role: 'Site office' } } }]])
  assert.equal(postAuthors([...posts, { slug: 'hours', locale: 'en', category: 'news' }], mixed, { siteName: 'Northgate', defaultLocale: 'en' }).users[1].description, '')
  // No site name, no byline anywhere: one editorial user named after nothing but the word.
  const plain = postAuthors([{ slug: 'a', locale: 'en' }], new Map([['a', { head: { author: null } }]]), {})
  assert.deepEqual(plain.users.map((u) => [u.login, u.display]), [['editorial', 'Editorial']])
})

test('pageTitle: the short menu label is the page title; the long h1 stays in the hero. A card label, a 404, no label: the spec title', async () => {
  const { pageTitle } = await import('../seed.mjs')
  const menus = [
    { menutype: 'tracy', region: 'header', locale: 'en', items: [
      { label: 'About', url: '/about', children: [] },
      { label: 'News', url: '/news', children: [] },
      { label: 'Resources', url: null, children: [{ label: 'Email', url: '/email', children: [] }, { label: 'Elektra plant, Lipetsk SEZ 62,000 m² · 2025', url: '/project-detail', children: [] }, { label: 'Vorsino IP, phase 3 48 ha · 2024', url: '/project-detail', children: [] }, { label: '404', url: '/404', children: [] }] }
    ] },
    { menutype: 'topbar', region: 'topbar', locale: 'en', items: [{ label: 'Investors', url: '/investor-relations', children: [] }] },
    { menutype: 'footer-company', region: 'footer', locale: 'en', items: [{ label: 'About us', url: '/about', children: [] }, { label: 'Careers', url: '/careers', children: [] }, { label: 'Investor relations', url: '/investor-relations', children: [] }] },
    { menutype: 'tracy-ru', region: 'header', locale: 'ru', items: [{ label: 'О компании', url: '/ru/about', children: [] }] }
  ]
  const title = (page) => pageTitle(page, menus)
  assert.equal(title({ path: '/about', title: 'Building Russian industrial infrastructure since 2004', view: 'page', locale: 'en' }), 'About', 'the header wins over the footer')
  assert.equal(title({ path: '/careers', title: 'Working at Northgate', view: 'page', locale: 'en' }), 'Careers', 'a footer label when the header has none')
  assert.equal(title({ path: '/investor-relations', title: 'Investor and shareholder information', view: 'page', locale: 'en' }), 'Investor relations', 'the footer before the top bar')
  // The posts page too: the theme's home.title filler reads tracy_page_heading before the title,
  // so the crumb and the tab say "News" while the page still prints the source's h1 (fast-8).
  assert.equal(title({ path: '/news', title: 'News & engineering notes', view: 'home', locale: 'en' }), 'News')
  assert.equal(title({ path: '/email', title: 'Transactional emails', view: 'page-email', locale: 'en' }), 'Email')
  assert.equal(title({ path: '/ru/about', title: 'Строим промышленную инфраструктуру', view: 'page', locale: 'ru' }), 'О компании')
  assert.equal(title({ path: '/project-detail', title: 'Elektra appliance plant, Lipetsk SEZ', view: 'page', locale: 'en' }), 'Elektra appliance plant, Lipetsk SEZ', 'two card labels for one url are not a name')
  assert.equal(title({ path: '/404', title: 'We could not find that page', view: '404', locale: 'en' }), 'We could not find that page')
  assert.equal(title({ path: '/services', title: 'Full-cycle contracting', view: 'page', locale: 'en' }), 'Full-cycle contracting', 'no label: the spec title')
})

test('newsCardsOfPosts: a news card that is a post shows the post\'s featured image; a card of the mock keeps its own', async () => {
  const { newsCardsOfPosts } = await import('../seed.mjs')
  const section = {
    id: 'home-en-6',
    sectionType: 'news',
    locale: 'en',
    items: [
      { title: 'Four common mistakes in heavy machine foundation design', img: '/wp-content/uploads/news-2.png', alt: 'News photo' },
      { title: '500,000 work hours with zero lost-time incidents', img: '/wp-content/uploads/safety-1.png', alt: 'News photo' },
      { title: 'Northgate wins the tender', img: '/wp-content/uploads/blog-feat-2.png', alt: 'News photo' }
    ]
  }
  const posts = [
    { title: 'Four common mistakes in heavy machine foundation design', locale: 'en', featuredImage: '/wp-content/uploads/art-hero-2.png', featuredImageAlt: 'Press foundation' },
    { title: 'Четыре типичные ошибки', locale: 'ru', featuredImage: '/wp-content/uploads/art-hero-2.png' },
    { title: 'Northgate wins the tender', locale: 'en', featuredImage: '/wp-content/uploads/blog-feat-2.png' },
    { title: '500,000 work hours without an incident in Kaluga', locale: 'en', featuredImage: '/wp-content/uploads/safety-2.png' }
  ]
  const { section: shown, notes } = newsCardsOfPosts(section, posts)
  assert.deepEqual(shown.items.map((it) => [it.img, it.alt]), [
    ['/wp-content/uploads/art-hero-2.png', 'Press foundation'],
    ['/wp-content/uploads/safety-1.png', 'News photo'],
    ['/wp-content/uploads/blog-feat-2.png', 'News photo']
  ])
  assert.equal(notes.length, 1, 'one swap, one note; a card already showing the post\'s picture is not a note')
  assert.match(notes[0], /art-hero-2\.png/)
  assert.equal(section.items[0].img, '/wp-content/uploads/news-2.png', 'the spec section is not changed in place')
})

test('nameCategoriesFromListing: a filter label that is a category\'s plural names it; a filter with no category is a note', async () => {
  const { nameCategoriesFromListing, listingFilters } = await import('../seed.mjs')
  const spec = {
    content: { archives: [{ path: '/news' }, { path: '/ru/news' }] },
    sections: {
      custom: [
        { id: 'news-en-2', locale: 'en', pages: [{ file: 'News.html', wpPath: '/news' }], fields: { filters: ['All', 'Disclosures', 'Engineering', 'Projects', 'Careers'] } },
        { id: 'news-ru-2', locale: 'ru', pages: [{ file: 'RU/News_ru.html', wpPath: '/ru/news' }], fields: { filters: ['Все', 'Раскрытие', 'Вакансии'] } },
        { id: 'home-en-3', locale: 'en', pages: [{ file: 'Home.html', wpPath: '/' }], fields: { filters: ['All', 'Factories', 'Infrastructure'] } }
      ]
    }
  }
  const filters = listingFilters(spec)
  assert.deepEqual([...filters], [['en', ['Disclosures', 'Engineering', 'Projects', 'Careers']], ['ru', ['Раскрытие', 'Вакансии']]], 'the home page projects chips are not a listing')
  const categories = [
    { wpSlug: 'news', title: 'News', locale: 'en' },
    { wpSlug: 'disclosure', title: 'Disclosure', locale: 'en' },
    { wpSlug: 'company', title: 'Company', locale: 'en' },
    { wpSlug: 'disclosure-ru', title: 'Раскрытие', locale: 'ru' }
  ]
  const notes = []
  nameCategoriesFromListing(categories, filters, { defaultLocale: 'en', notes })
  assert.deepEqual(categories.map((c) => c.title), ['News', 'Disclosures', 'Company', 'Раскрытие'])
  assert.equal(notes.filter((n) => n.category === 'disclosure').length, 1)
  assert.match(notes.find((n) => n.locale === 'en').note, /Careers/)
  assert.match(notes.find((n) => n.locale === 'ru').note, /Вакансии/)
  // No Polylang: categories carry no locale and are the default locale's.
  const plain = [{ wpSlug: 'disclosure', title: 'Disclosure' }]
  nameCategoriesFromListing(plain, new Map([['en', ['Disclosures']]]), { defaultLocale: 'en' })
  assert.equal(plain[0].title, 'Disclosures')
})

test('applyCopyFixes: a fix rewrites every string of the spec but never an id, a path or a file name, and counts its hits', async () => {
  const { applyCopyFixes } = await import('../seed.mjs')
  const spec = {
    content: {
      pages: [{ path: '/404', slug: 'on the right', content: '<p>pick one of the sections on the right.</p>' }],
      assets: [{ file: 'Corporate Deck 2028.pdf', original: 'decks/Corporate Deck 2028.pdf' }]
    },
    sections: {
      custom: [{ id: '404-en-1', html: '<p>Try a search, or pick one of the sections on the right.</p>', fields: { intro: 'Try a search, or pick one of the sections on the right.', items: [{ title: 'Corporate Deck 2028 — full slide library', href: '/wp-content/uploads/Corporate Deck 2028.pdf' }] } }]
    }
  }
  const fixes = applyCopyFixes(spec, [
    { find: 'pick one of the sections on the right', replace: 'pick one of the sections below' },
    { find: 'Corporate Deck 2028 — full slide library', replace: 'Corporate deck 2028 — full slide library' },
    { find: 'nothing says this', replace: 'x' }
  ])
  assert.deepEqual(fixes.map((f) => f.hits), [3, 1, 0])
  assert.equal(spec.content.pages[0].content, '<p>pick one of the sections below.</p>')
  assert.equal(spec.content.pages[0].slug, 'on the right', 'a slug is a name, not copy')
  assert.equal(spec.sections.custom[0].fields.intro, 'Try a search, or pick one of the sections below.')
  assert.equal(spec.sections.custom[0].fields.items[0].title, 'Corporate deck 2028 — full slide library')
  assert.equal(spec.sections.custom[0].fields.items[0].href, '/wp-content/uploads/Corporate Deck 2028.pdf', 'the PDF keeps its name')
  assert.equal(spec.content.assets[0].file, 'Corporate Deck 2028.pdf')
})

test('mediaImportArgs: a batch with an svg lets that one import accept svg through --exec; a batch without one is the plain call', () => {
  assert.deepEqual(mediaImportArgs([{ key: 'blog/a.jpg' }], '/img'), ['media', 'import', '/img/blog/a.jpg', '--porcelain'])
  const args = mediaImportArgs([{ key: 'blog/a.jpg' }, { key: 'icons/b.SVG' }], '/img')
  assert.deepEqual(args.slice(0, 5), ['media', 'import', '/img/blog/a.jpg', '/img/icons/b.SVG', '--porcelain'])
  assert.equal(args.length, 6)
  assert.match(args[5], /^--exec=WP_CLI::add_wp_hook\('upload_mimes', [^]*\$m\['svg'\] = 'image\/svg\+xml'/)
  assert.match(args[5], /add_wp_hook\('wp_check_filetype_and_ext'/)
  assert.doesNotMatch(args[5], /add_filter|update_option|define\(/, 'nothing that outlives the call')
})

test('dedupePostSlugs: two source articles on one slug — the one whose alias is the slug keeps it, the other takes its own alias', () => {
  const posts = [
    { slug: 'five-minute-mttr-story', title: 'A', joomla: { articleId: '77', alias: 'five-minute-mttr' } },
    { slug: 'five-minute-mttr-story', title: 'A', joomla: { articleId: '100', alias: 'five-minute-mttr-story' } },
    { slug: 'budgets', title: 'B', joomla: { articleId: '110', alias: 'budgets' } },
    { slug: 'budgets', title: 'B again', joomla: { articleId: '331', alias: 'budgets-2026' } },
    { slug: 'lonely', title: 'C', joomla: { articleId: '5', alias: 'lonely' } },
    { slug: 'twin', title: 'D' },
    { slug: 'twin', title: 'D2' },
    { slug: 'ru-twin', title: 'E', locale: 'en', joomla: { alias: 'ru-twin' } },
    { slug: 'ru-twin', title: 'E', locale: 'ru', joomla: { alias: 'ru-twin' } }
  ]
  const notes = dedupePostSlugs(posts)
  assert.deepEqual(posts.map((p) => p.slug), ['five-minute-mttr', 'five-minute-mttr-story', 'budgets', 'budgets-2026', 'lonely', 'twin', 'twin', 'ru-twin', 'ru-twin'])
  assert.equal(notes.length, 4, 'two renamed, two clashes with no alias or id to take')
  assert.match(notes[2].note, /D2 has no alias/)
  assert.match(notes[3].note, /E has no alias/, 'one slug space for the site: the ru twin is a clash too (Polylang free cannot share a slug)')
  assert.deepEqual(dedupePostSlugs([{ slug: 'a' }, { slug: 'b' }]), [], 'no clash, no change')
})

test('singleViewRules: a Joomla SEF address lands on the article it names; one that names none, on the first post of its locale', () => {
  const posts = [
    { slug: 'first', joomla: { articleId: '76' } },
    { slug: 'profiling', joomla: { articleId: '134' } }
  ]
  const urls = new Map([['first', '/first/'], ['profiling', '/profiling/']])
  const pages = [
    { view: 'single', path: '/index.php/product/blog/134-continuous-profiling-intro' },
    { view: 'single', path: '/services/website-care' },
    { view: 'single', path: '/blog/999-gone' }
  ]
  assert.deepEqual(
    singleViewRules(pages, posts, urls, []).map((r) => `${r.from} -> ${r.to}`),
    ['/index.php/product/blog/134-continuous-profiling-intro -> /profiling/', '/services/website-care -> /first/', '/blog/999-gone -> /first/']
  )
})

test('routeTargets: a view the map declares an answer for is probed for that answer; the rest keep their defaults', () => {
  const pages = [
    { view: 'page-account', path: '/pages/profile' },
    { view: 'page', path: '/about' },
    { view: 'single', path: '/a' }
  ]
  assert.deepEqual(routeTargets(pages, new Map()), [
    { path: '/pages/profile', expect: 200 },
    { path: '/about', expect: 200 },
    { path: '/a', expect: '301|200' }
  ])
  const views = { 'page-account': { expect: { status: 303, to: '/pages/login' } }, 'page-contact': { block: 'x/f' } }
  assert.deepEqual(routeTargets(pages, new Map(), { views })[0], { path: '/pages/profile', expect: 303, to: '/pages/login' })
  assert.deepEqual(routeTargets(pages, new Map(), { views })[1], { path: '/about', expect: 200 })
})

test('seed: a category listing leaves archived posts and non-category child pages out', () => {
  const spec = {
    content: {
      categories: [
        { id: '15', title: 'Website services', wpSlug: 'website-services', parent: null, description: '' },
        { id: '16', title: 'Guides', wpSlug: 'guides', parent: 'website-services', description: '' },
        { id: '14', title: 'Pages', wpSlug: 'pages', parent: null, description: '' }
      ],
      archives: []
    }
  }
  const terms = new Map([
    ['website-services', { id: 6, slug: 'website-services', name: 'Website services', description: '' }],
    ['guides', { id: 7, slug: 'guides', name: 'Guides', description: '' }]
  ])
  const ctx = {
    spec,
    patterns,
    terms,
    tags: new Map([['archived', { id: 9, slug: 'archived' }]]),
    descendants: (slug) => spec.content.categories.filter((c) => c.parent === slug).map((c) => c.wpSlug),
    categoryUrl: (slug) => `/cat/${slug}/`,
    rewrite: (m) => m
  }
  const archive = { path: '/services', view: 'category', category: 'website-services' }
  const out = buildArchiveContent(archive, ctx, { selfId: 40, hasChildPages: true, excludeChildIds: [81] })
  assert.match(
    out,
    /"taxQuery":\{"include":\{"category":\[6,7\]\},"exclude":\{"post_tag":\[9\]\}\}/,
    'archived posts are excluded with the include/exclude taxQuery shape'
  )
  assert.match(out, /"parents":\[40\][^}]*"exclude":\[81\]/, 'the menu page filed under the parent is left out by id')

  const pages = [
    { path: '/services/strategy', parent: '/services', joomla: { catid: '15' } },
    { path: '/services/guide', parent: '/services', joomla: { catid: '16' } },
    { path: '/services/service-detail', parent: '/services', joomla: { catid: '14' } },
    { path: '/services/synthetic', parent: '/services' }
  ]
  assert.deepEqual(
    childPagesOutside({ path: '/services', archive }, pages, spec).map((p) => p.path),
    ['/services/service-detail'],
    'descendant categories count as inside; a page with no source category is kept'
  )
})

// ---------------------------------------------------------------- issue #9 (JA Vega M4)

/** A category "Services" whose articles all became child pages, and one with posts below it. */
function listingCtx(postCategories, publishedPostsIn = () => 0) {
  const spec = {
    content: {
      categories: [
        { id: '9', title: 'Services', wpSlug: 'services', parent: null, description: '' },
        { id: '10', title: 'Journal', wpSlug: 'journal', parent: null, description: '' },
        { id: '11', title: 'Notes', wpSlug: 'notes', parent: 'journal', description: '' }
      ],
      archives: []
    }
  }
  const terms = new Map([
    ['services', { id: 5, slug: 'services', name: 'Services', description: '' }],
    ['journal', { id: 6, slug: 'journal', name: 'Journal', description: '' }],
    ['notes', { id: 7, slug: 'notes', name: 'Notes', description: '' }]
  ])
  return {
    spec,
    patterns,
    terms,
    postCategories,
    publishedPostsIn,
    descendants: (slug) => spec.content.categories.filter((c) => c.parent === slug).map((c) => c.wpSlug),
    categoryUrl: (slug) => `/cat/${slug}/`,
    rewrite: (m) => m
  }
}

test('seed: a category listing whose articles all became child pages has no post query ("Nothing here yet.")', () => {
  const ctx = listingCtx(new Set(['notes']))
  const services = buildArchiveContent({ path: '/services', view: 'category', category: 'services' }, ctx, { selfId: 40, hasChildPages: true })
  assert.match(services, /"postType":"page","parents":\[40\]/, 'the child pages are listed')
  assert.doesNotMatch(services, /"taxQuery"/, 'no published post in the category or below it: no post query')
  const journal = buildArchiveContent({ path: '/journal', view: 'category', category: 'journal' }, ctx, { selfId: 41, hasChildPages: true })
  assert.match(journal, /"taxQuery":\{"category":\[6,7\]\}/, 'a post in a descendant category keeps the query')
  assert.match(
    buildArchiveContent({ path: '/services', view: 'category', category: 'services' }, ctx),
    /"taxQuery":\{"category":\[5\]\}/,
    'no child pages: the listing is the post query, empty or not'
  )
  assert.match(
    buildArchiveContent({ path: '/services', view: 'category', category: 'services' }, listingCtx(undefined), { selfId: 40, hasChildPages: true }),
    /"taxQuery"/,
    'unknown post categories: the query stays'
  )
  assert.match(
    buildArchiveContent({ path: '/services', view: 'category', category: 'services' }, listingCtx(new Set(), () => 1), { selfId: 40, hasChildPages: true }),
    /"taxQuery"/,
    'a post WordPress holds in the category (the site owner\'s): the query stays'
  )
  assert.match(
    buildArchiveContent({ path: '/services', view: 'category', category: 'services' }, listingCtx(new Set(), () => null), { selfId: 40, hasChildPages: true }),
    /"taxQuery"/,
    'a count WordPress could not give: the query stays'
  )
  // A category the site owner added under Services (not in the spec) holds their post: the block
  // leaves children out, so it is named in the filter, else the post never shows.
  const owned = listingCtx(new Set(), () => 1)
  owned.terms.set('services-news', { id: 12, slug: 'services-news', parent: 'services', name: 'News', description: '' })
  owned.terms.set('services-news-2026', { id: 13, slug: 'services-news-2026', parent: 'services-news', name: '2026', description: '' })
  assert.match(
    buildArchiveContent({ path: '/services', view: 'category', category: 'services' }, owned, { selfId: 40, hasChildPages: true }),
    /"taxQuery":\{"category":\[5,12,13\]\}/,
    'every category the site holds below it is in the query'
  )
})

test('seed: sampleReferences names what still points at an install sample', async () => {
  const { sampleReferences } = await import('../seed.mjs')
  const samples = [
    { ID: 1, post_name: 'hello-world' },
    { ID: 2, post_name: 'sample-page' }
  ]
  const refs = sampleReferences(samples, {
    options: { page_on_front: '0', page_for_posts: '2' },
    contents: [
      { ID: 1, post_content: '<a href="http://x/sample-page/">self-made</a>' },
      { ID: 7, post_content: '<!-- wp:navigation-link {"id":1,"kind":"post-type"} /-->' },
      { ID: 8, post_content: '<a href="/?page_id=2">x</a> {"id":12} ?p=10 href="/hello-worlds/"' }
    ],
    menuItems: new Map([[2, ['40']]])
  })
  assert.deepEqual(Object.fromEntries(refs), {
    1: ['content of #7'],
    2: ['option page_for_posts', 'menu item #40', 'content of #1, #8']
  })
  // A custom navigation link keeps the address in its attributes only, escaped slashes or not.
  const nav = sampleReferences(samples, {
    contents: [
      { ID: 20, post_content: '<!-- wp:navigation-link {"label":"About","url":"http://x/sample-page/","kind":"custom"} /-->' },
      { ID: 21, post_content: '<!-- wp:navigation-link {"label":"News","url":"http:\\/\\/x\\/2026\\/09\\/01\\/hello-world\\/","kind":"custom"} /-->' }
    ]
  })
  assert.deepEqual(Object.fromEntries(nav), { 1: ['content of #21'], 2: ['content of #20'] })
  assert.equal(
    sampleReferences(samples, { contents: [{ ID: 9, post_content: '"id":12 ?p=11 /hello-worlds/ {"url":"http://x/sample-pages/"}' }] }).size,
    0,
    'near misses are not references'
  )
})

test('seed: pageMenuOrder numbers child pages in source order — Joomla articles by ordering then id, an explicit menuOrder wins', async () => {
  const { pageMenuOrder } = await import('../seed.mjs')
  const art = (path, id, ordering = 0) => ({ path, parent: '/services', joomla: { articleId: String(id), ordering } })
  const pages = [
    { path: '/', parent: null },
    art('/services/managed', 79),
    art('/services/software', 78),
    { path: '/services/overview', parent: '/services' },
    art('/services/it', 75),
    art('/services/security', 13),
    art('/services/cloud', 77, -1),
    { path: '/services', parent: null },
    { path: '/services/pinned', parent: '/services', menuOrder: 50 },
    { path: null, parent: null, view: '404' }
  ]
  const order = pageMenuOrder(pages)
  const at = (p) => order.get(pages.find((x) => x.path === p))
  assert.deepEqual(
    ['/services/cloud', '/services/security', '/services/overview', '/services/it', '/services/software', '/services/managed'].map(at),
    [1, 2, 3, 4, 5, 6],
    'article pages take the article slots in (ordering, id) order; a non-article page keeps its slot'
  )
  assert.equal(at('/services/pinned'), 50)
  assert.deepEqual([at('/'), at('/services')], [undefined, undefined], 'top-level pages keep WordPress\'s 0 (their order is the navigation)')
  assert.equal(order.has(pages.at(-1)), false, 'a page with no path is no one\'s sibling')
})

test('seed: installSamples finds only WordPress\'s untouched "Hello world!" and "Sample Page"', async () => {
  const { installSamples } = await import('../seed.mjs')
  const row = (ID, post_type, post_name, post_title, modified = '2026-09-01 10:00:00') => ({
    ID,
    post_type,
    post_name,
    post_title,
    post_status: 'publish',
    post_date: '2026-09-01 10:00:00',
    post_modified: modified
  })
  const rows = [
    row(1, 'post', 'hello-world', 'Hello world!'),
    row(2, 'page', 'sample-page', 'Sample Page'),
    row(3, 'page', 'sample-page-2', 'Sample Page'),
    row(4, 'post', 'hello-world', 'Hello world!', '2026-09-02 08:00:00'),
    row(5, 'page', 'sample-page', 'Our sample page'),
    row(6, 'post', 'hello-world', 'Hello world!')
  ]
  assert.deepEqual(
    installSamples(rows, { keepIds: new Set([6]) }).map((r) => r.ID),
    [1, 2],
    'edited (4), renamed (5), another slug (3) and one the spec seeds (6) are content'
  )
})

test('seed: a synthetic 404 view is the not-found page; with no source page a draft is made from the page-map title', async () => {
  const { notFoundDraft } = await import('../seed.mjs')
  const pm = [
    { path: '/', view: 'front-page' },
    { file: '404.html', path: '/404', view: '404', title: 'Page not found', synthetic: true }
  ]
  assert.equal(notFoundPage(pm)?.path, '/404', 'a synthetic view 404 counts')

  const draft = notFoundDraft(notFoundPage(pm), [{ path: '/about', wpSlug: 'about', parent: null }])
  assert.equal(draft.created, true)
  assert.equal(draft.page.status, 'draft')
  assert.equal(draft.page.path, null, 'no path: the draft never answers a route')
  assert.equal(draft.page.wpSlug, 'page-not-found')
  assert.equal(draft.page.title, 'Page not found')
  assert.match(draft.page.content, /<h1 class="wp-block-heading">Page not found<\/h1>/)

  const src = { path: null, view: '404', file: '404.html', title: 'Error page', wpSlug: 'error-page', parent: null, status: 'publish', content: '<!-- wp:paragraph --><p>Gone.</p><!-- /wp:paragraph -->' }
  const routed = { path: '/error-page', view: 'page', wpSlug: 'error-page', parent: null }
  const own = notFoundDraft(notFoundPage(pm), [routed, src])
  assert.equal(own.created, false)
  assert.equal(own.page, src, 'the source\'s own not-found page is used')
  assert.equal(src.status, 'draft')
  assert.equal(src.wpSlug, 'error-page-404', 'a slug shared with a routed page would make both one post')

  const pmPage = { file: '404.html', path: '/404', view: '404', title: 'Missing' }
  assert.equal(notFoundDraft(pmPage, [{ ...pmPage, wpSlug: '404', parent: null }]), null, 'a seeded page at the 404 path is the page already')
})

test('seed: routeTargets marks an archive route the seeder built as a page (served: page)', () => {
  const pages = [
    { path: '/services', view: 'category' },
    { path: '/blog', view: 'home' },
    { path: '/about', view: 'page' }
  ]
  const targets = routeTargets(pages, new Map(), { servedAsPage: new Set(['/services']) })
  assert.deepEqual(targets, [
    { path: '/services', expect: 200, served: 'page' },
    { path: '/blog', expect: 200 },
    { path: '/about', expect: 200 }
  ])
})

test('seed: resolveMedia takes an uploads-form name from the nearest image table that lists it, whatever the import order; two sources at that level are a problem, not a pick', () => {
  const files = {
    'blogs/intro/item-1.jpg': { id: 1, url: '/u/blogs-item-1.jpg', file: 'item-1.jpg' },
    'others/item-1.jpg': { id: 2, url: '/u/others-item-1.jpg', file: 'item-1.jpg' },
    'solo/only.png': { id: 3, url: '/u/only.png', file: 'only.png' }
  }
  const reversed = { files: Object.fromEntries(Object.entries(files).reverse()) }
  const index = { files }
  const own = [{ file: 'item-1.jpg', original: 'images/others/item-1.jpg' }]
  for (const idx of [index, reversed]) {
    assert.equal(resolveMedia(idx, '/wp-content/uploads/item-1.jpg', [own]).hit.id, 2, 'the owner\'s table decides, in either index order')
    assert.equal(resolveMedia(idx, '/wp-content/uploads/item-1.jpg', [[], own]).hit.id, 2, 'an empty nearer tier passes to the next')
  }
  assert.equal(resolveMedia(index, 'images/blogs/intro/item-1.jpg', [own]).hit.id, 1, 'an exact source path is its own key')
  const noTable = resolveMedia(index, '/wp-content/uploads/item-1.jpg', [])
  assert.equal(noTable.hit, null, 'no table and two imported files of the name: nothing is guessed')
  assert.match(noTable.problem, /ambiguous.*blogs\/intro\/item-1\.jpg.*others\/item-1\.jpg/)
  const twins = resolveMedia(index, '/wp-content/uploads/item-1.jpg', [[...own, { file: 'item-1.jpg', original: 'images/blogs/intro/item-1.jpg' }]])
  assert.equal(twins.hit, null)
  assert.match(twins.problem, /its image table lists others\/item-1\.jpg, blogs\/intro\/item-1\.jpg/)
  assert.equal(resolveMedia(index, '/wp-content/uploads/only.png', []).hit.id, 3, 'a single file of the name needs no table')
  const missing = resolveMedia(index, '/wp-content/uploads/gone.jpg', [[{ file: 'gone.jpg', original: 'images/x/gone.jpg' }]])
  assert.equal(missing.hit, null)
  assert.match(missing.problem, /x\/gone\.jpg was not imported/)
  assert.deepEqual(resolveMedia(index, 'https://cdn.example/x.jpg', [own]), { hit: null, key: null })
  // An entry that lists the name but not its source is no licence to search the site by name: the
  // one imported only.png belongs to someone else as far as this table can say.
  for (const blind of [{ file: 'only.png' }, { file: 'only.png', src: '/wp-content/uploads/only.png' }]) {
    const r = resolveMedia(index, '/wp-content/uploads/only.png', [[blind]])
    assert.equal(r.hit, null, JSON.stringify(blind))
    assert.match(r.problem, /only\.png: its image table lists it without a source path/)
  }
  const half = resolveMedia(index, '/wp-content/uploads/item-1.jpg', [[...own, { file: 'item-1.jpg' }]])
  assert.equal(half.hit, null, 'one blind twin beside a sourced entry is not settled by the sourced one')
  assert.match(half.problem, /without a source path/)
})

test('seed: sectionsOfPage compares only the identities both sides carry; a module on every page is not one page\'s section', () => {
  const spec = {
    sections: {
      custom: [
        { id: 'footer', pages: ['ALL'], images: [{ file: 'f.png', original: 'images/f.png' }] },
        { id: 'own', pages: [{ file: 'category-blog.html', wpPath: '/category-blog' }], images: [{ file: 'o.png', original: 'images/o.png' }] },
        { id: 'other', pages: [{ file: 'about.html' }] }
      ]
    }
  }
  assert.deepEqual(sectionsOfPage({ path: '/author-listing' }, spec).map((c) => c.id), [], 'a page without a file matches nothing through undefined')
  assert.deepEqual(sectionsOfPage({ path: '/x', file: 'category-blog.html' }, spec).map((c) => c.id), ['own'])
  assert.deepEqual(sectionsOfPage({ path: '/category-blog' }, spec).map((c) => c.id), ['own'])
  assert.deepEqual(pageImageTables({ path: '/category-blog', images: [{ file: 'p.png' }] }, spec).map((t) => t.map((i) => i.file)), [['p.png'], ['o.png'], ['f.png']], 'own, then its sections, then every-page modules')
  const archive = (excerpt) => ({ path: '/category-blog', synthetic: true, archive: { path: '/category-blog', ...(excerpt === undefined ? {} : { excerpt }) } })
  assert.equal(pageExcerpt(archive('Masthead line.'), spec), 'Masthead line.')
  assert.equal(pageExcerpt(archive(''), spec), '', 'declared empty stays empty')
  assert.equal(pageExcerpt(archive(undefined), { sections: { custom: [{ id: 'own', pages: [{ wpPath: '/category-blog' }], html: '<p>A module sentence that is long enough to be a lead.</p>' }] } }), '', 'a listing built as a page reads no module text')
  assert.equal(pageExcerpt({ path: '/p', excerpt: '', content: '<p>Its own body sentence is long enough here.</p>', archive: { excerpt: 'Declared.' } }, spec), 'Declared.', 'a spec page at an archive route takes the declared excerpt before its body')
})

test('seed: mediaRouteCollisions names an unattached attachment whose slug is a top-level route', () => {
  const sources = new Map([[7, 'pics/404.png'], [8, 'pics/about.png'], [9, 'pics/team.png']])
  const rows = [
    { ID: '7', post_name: '404', post_parent: '0' },
    { ID: '8', post_name: 'about', post_parent: '12' },
    { ID: '9', post_name: 'team', post_parent: '0' }
  ]
  assert.deepEqual(mediaRouteCollisions(rows, sources, ['/', '/404', '/about', '/company/team']), [{ attachment: 7, source: 'pics/404.png', slug: '404', route: '/404' }], 'an attached file and a nested route do not collide')
  assert.deepEqual(mediaRouteCollisions(rows, sources, ['/services']), [])
})

test('seed: checkCategorySlugs throws on one slug twice in one locale, and allows it across locales', () => {
  assert.throws(() => checkCategorySlugs([{ id: '10', wpSlug: 'a' }, { id: '17', wpSlug: 'a' }]), /category slug "a" is shared by #10 and #17/)
  assert.doesNotThrow(() => checkCategorySlugs([{ id: '10', wpSlug: 'a', locale: 'en' }, { id: '11', wpSlug: 'a', locale: 'ru' }, { id: '12', wpSlug: 'b' }]))
})

// ── #18 ───────────────────────────────────────────────────────────────────────

test('seed: a percent-encoded image ref resolves to the file the adapter listed and is rewritten to the attachment URL (#18 item 2)', async () => {
  const index = {
    files: {
      'joomlart/services/icons/paint bucket.png': { id: 9, url: '/wp-content/uploads/2026/09/paint-bucket.png', file: 'paint bucket.png' },
      'joomlart/other/paint bucket.png': { id: 10, url: '/wp-content/uploads/2026/09/paint-bucket-1.png', file: 'paint bucket.png' }
    }
  }
  const table = [{ src: '/wp-content/uploads/paint%20bucket.png', file: 'paint bucket.png', original: 'images/joomlart/services/icons/paint bucket.png', alt: '' }]
  // The image table's uploads-form src is a URL too.
  const bySrc = resolveMedia(index, '/wp-content/uploads/paint bucket.png', [[{ src: '/images/joomlart/services/icons/paint%20bucket.png' }]])
  assert.equal(bySrc.hit?.id, 9)
  // collectImages finds the source path of a percent-encoded <img> the markup holds.
  const spec = {
    content: { posts: [], pages: [{ content: '<img src="/wp-content/uploads/paint%20bucket.png">' }], categories: [], images: table },
    sections: { custom: [], acm: [] }
  }
  assert.deepEqual(collectImages(spec, { types: {} }), [{ key: 'joomlart/services/icons/paint bucket.png', alt: '' }])
  const notes = []
  const media = (ref, owner = []) => {
    const r = resolveMedia(index, ref, owner)
    if (r.problem) notes.push(r.problem)
    return r.hit
  }
  const { rewriteMediaRefs } = await import('../seed.mjs')
  assert.equal(typeof rewriteMediaRefs, 'function', 'the markup rewrite is a function of its own')
  const markup = '<li><img src="/wp-content/uploads/paint%20bucket.png" alt=""></li><img src="images/joomlart/services/icons/paint%20bucket.png">'
  const out = rewriteMediaRefs(markup, (ref) => media(ref, [table]), { theme: 't' })
  assert.equal(
    out,
    '<li><img src="/wp-content/uploads/2026/09/paint-bucket.png" alt=""></li><img src="/wp-content/uploads/2026/09/paint-bucket.png">',
    'both the uploads form and the images path reach the attachment'
  )
  assert.deepEqual(notes, [])
  // Same basename in two places: the page's own table decides; no table → ambiguous, left as written.
  const bare = rewriteMediaRefs('<img src="/wp-content/uploads/paint%20bucket.png">', (ref) => media(ref, []), { theme: 't' })
  assert.equal(bare, '<img src="/wp-content/uploads/paint%20bucket.png">')
  assert.match(notes.join('\n'), /paint bucket\.png is ambiguous/)
  assert.equal(imageKey('images/../../etc/passwd.png'), null, 'a path that leaves the images tree names no image')
  assert.equal(imageKey('images/a/./../b.png'), null)
})

test('seed: an image whose file name holds # or ? is imported by that name and its encoded URL is rewritten to the attachment (#18 item 2)', async () => {
  const { rewriteImageSrc } = await import('../lib/html-to-blocks.mjs')
  const { rewriteMediaRefs } = await import('../seed.mjs')
  const index = {
    files: {
      'icons/hash#tag.png': { id: 21, url: '/wp-content/uploads/2026/09/hashtag.png', file: 'hash#tag.png' },
      'icons/hash': { id: 22, url: '/wp-content/uploads/2026/09/hash.png', file: 'hash' },
      'icons/what?.png': { id: 23, url: '/wp-content/uploads/2026/09/what.png', file: 'what?.png' }
    }
  }
  // The adapter's image table entries, as html-to-blocks writes them for the encoded <img> srcs.
  const table = ['images/icons/hash%23tag.png', 'images/icons/what%3F.png'].map((ref) => ({ ...rewriteImageSrc(ref), alt: '' }))
  assert.deepEqual(table.map((i) => [i.src, i.original]), [
    ['/wp-content/uploads/hash%23tag.png', 'images/icons/hash#tag.png'],
    ['/wp-content/uploads/what%3F.png', 'images/icons/what?.png']
  ])
  const spec = {
    content: { posts: [], pages: [{ content: table.map((i) => `<img src="${i.src}">`).join(''), images: table }], categories: [], images: [] },
    sections: { custom: [], acm: [] }
  }
  assert.deepEqual(
    collectImages(spec, { types: {} }).map((w) => w.key).sort(),
    ['icons/hash#tag.png', 'icons/what?.png'],
    'the import asks for the files by their names on disk, not the name cut at # or ?'
  )
  const notes = []
  const media = (ref) => {
    const r = resolveMedia(index, ref, [table])
    if (r.problem) notes.push(r.problem)
    return r.hit
  }
  const markup = '<img src="/wp-content/uploads/hash%23tag.png"><img src="images/icons/hash%23tag.png"><img src="/wp-content/uploads/what%3F.png">'
  assert.equal(
    rewriteMediaRefs(markup, media, { theme: 't' }),
    '<img src="/wp-content/uploads/2026/09/hashtag.png"><img src="/wp-content/uploads/2026/09/hashtag.png"><img src="/wp-content/uploads/2026/09/what.png">'
  )
  assert.deepEqual(notes, [])
  // An unencoded # in a URL is still a fragment.
  assert.equal(imageKey('images/icons/hash#tag.png'), 'icons/hash')
})

test('seed: renderAcm puts the module spacing and class suffix on the section root, block and HTML alike, per instance (#18 item 4)', () => {
  const large = { ...instance, id: '115', spacing: { top: 'large', bottom: 'medium' }, moduleClass: '' }
  const light = { ...instance, id: '136', spacing: { top: 'medium', bottom: 'medium' }, moduleClass: 'bg-light' }
  const blank = { ...instance, id: '153', spacing: { top: 'blank', bottom: 'blank' }, moduleClass: '' }
  const none = { ...instance, id: '154', spacing: { top: null, bottom: null }, moduleClass: '' }
  const root = (markup) => {
    const first = markup.split('\n').slice(0, 2)
    return { attrs: JSON.parse(first[0].replace(/^<!-- wp:group /, '').replace(/ -->$/, '')), html: first[1] }
  }
  const a = root(renderAcm(large, patternsMap, patterns, media).markup)
  assert.equal(a.attrs.className, 'tracy-section demo bg-bg top-large bottom-medium')
  assert.match(a.html, /^<section class="wp-block-group tracy-section demo bg-bg top-large bottom-medium">/)
  const b = root(renderAcm(light, patternsMap, patterns, media).markup)
  assert.equal(b.attrs.className, 'tracy-section demo bg-bg bg-light top-medium bottom-medium', 'the suffix first, then spacing, as the source prints it')
  assert.match(b.html, /class="wp-block-group tracy-section demo bg-bg bg-light top-medium bottom-medium"/)
  assert.equal(root(renderAcm(blank, patternsMap, patterns, media).markup).attrs.className, 'tracy-section demo bg-bg top-blank bottom-blank')
  assert.equal(root(renderAcm(none, patternsMap, patterns, media).markup).attrs.className, 'tracy-section demo bg-bg', 'no value, no class')
  const withAnchor = renderAcm(large, { ...patternsMap, anchorConvention: true }, patterns, media).markup
  assert.match(withAnchor.split('\n')[1], /class="wp-block-group tracy-section demo bg-bg top-large bottom-medium" id="acm-demo-115"/, 'the anchor stays')
  const again = renderAcm(large, patternsMap, patterns, media).markup
  assert.equal(again, renderAcm(large, patternsMap, patterns, media).markup, 'stable')
  assert.equal(serializeBlocks(parseBlocks(again)), again, 'serialises back to itself')
})

test('seed: a custom module section keeps its spacing and class suffix on its root, or on one wrapper when it is several blocks (#18 item 4)', () => {
  const ctx = {
    spec: {
      sections: {
        acm: [],
        custom: [
          { id: '13', spacing: { top: 'large', bottom: 'large' }, moduleClass: 'section-border-top' },
          { id: '14', spacing: { top: 'blank', bottom: null }, moduleClass: '' },
          { id: '15', spacing: { top: null, bottom: null }, moduleClass: '' }
        ]
      }
    },
    patternsMap,
    patterns,
    media,
    rewrite: (m) => m,
    cf7: null,
    log: [],
    sections: [],
    terms: new Map()
  }
  const page = {
    path: '/',
    view: 'front-page',
    contentKind: 'sections',
    content: [
      { kind: 'html', moduleId: '13', blocks: '<!-- wp:group {"className":"intro"} -->\n<div class="wp-block-group intro"><!-- wp:paragraph -->\n<p>one</p>\n<!-- /wp:paragraph --></div>\n<!-- /wp:group -->' },
      { kind: 'html', moduleId: '14', blocks: '<!-- wp:html -->\n<div>raw</div>\n<!-- /wp:html -->' },
      { kind: 'html', moduleId: '15', blocks: '<!-- wp:paragraph -->\n<p>plain</p>\n<!-- /wp:paragraph -->' }
    ]
  }
  const out = buildPageContent(page, ctx)
  assert.equal(checkMarkup(out), true)
  assert.match(out, /<!-- wp:group \{"className":"intro section-border-top top-large bottom-large"\} -->\n<div class="wp-block-group intro section-border-top top-large bottom-large">/)
  assert.match(
    out,
    /<!-- wp:group \{"className":"top-blank"\} -->\n<div class="wp-block-group top-blank">\n<!-- wp:html -->\n<div>raw<\/div>\n<!-- \/wp:html -->\n<\/div>\n<!-- \/wp:group -->/,
    'a core/html section is wrapped: its HTML is the author\'s, not a block root'
  )
  assert.match(out, /<!-- wp:paragraph -->\n<p>plain<\/p>/, 'nothing declared, nothing added')
})

test('seed: buildArchiveContent follows the archive display options — title, description and subcategory depth — and keeps the post query (#18 item 5)', () => {
  const spec = {
    content: {
      categories: [
        { title: 'Portfolio', wpSlug: 'portfolio', parent: null, description: '<p>Pellentesque nec.</p>' },
        { title: 'Database Security', wpSlug: 'database-security', parent: 'portfolio', description: '<p>Child text.</p>' },
        { title: 'Audits', wpSlug: 'audits', parent: 'database-security', description: '' }
      ],
      archives: []
    }
  }
  const terms = new Map([
    ['portfolio', { id: 5, slug: 'portfolio', name: 'Portfolio', description: 'Pellentesque nec.' }],
    ['database-security', { id: 6, slug: 'database-security', name: 'Database Security', description: 'Child text.' }],
    ['audits', { id: 7, slug: 'audits', name: 'Audits', description: '' }]
  ])
  const below = (slug) => spec.content.categories.filter((c) => c.parent === slug).flatMap((c) => [c.wpSlug, ...below(c.wpSlug)])
  const ctx = { spec, patterns, terms, descendants: below, categoryUrl: (slug) => `/cat/${slug}/`, rewrite: (m) => m }
  const build = (display) => buildArchiveContent({ path: '/portfolio', view: 'category', category: 'portfolio', ...(display ? { display } : {}) }, ctx, { selfId: 40, hasChildPages: true })
  const from = { showTitle: 'global', showDescription: 'global', maxLevel: 'menu' }
  const hidden = build({ showTitle: false, showDescription: false, maxLevel: 0, from })
  assert.equal(checkMarkup(hidden), true)
  assert.doesNotMatch(hidden, /tracy-eyebrow/, 'no title when the source hides it')
  assert.doesNotMatch(hidden, /Pellentesque/, 'no description when the source hides it')
  assert.doesNotMatch(hidden, /Database Security|Child text/, 'maxLevel 0: no subcategory list')
  const noIntro = build({ showTitle: false, showDescription: false, maxLevel: 0, showIntro: false, from })
  assert.doesNotMatch(noIntro, /core\/post-excerpt/, 'the source can hide intro text on every archive card')
  assert.match(hidden, /"taxQuery":\{"category":\[5,6,7\]\}/, 'the posts of every category below are still listed')
  assert.match(hidden, /"parents":\[40\]/, 'the child pages are still listed')
  const one = build({ showTitle: true, showDescription: true, maxLevel: 1, from })
  assert.match(one, /<h2 class="wp-block-heading tracy-eyebrow">Portfolio<\/h2>/)
  assert.match(one, /Pellentesque/)
  assert.match(one, /<h3 class="wp-block-heading"><a href="\/cat\/database-security\/">Database Security<\/a><\/h3>/)
  assert.doesNotMatch(one, /Audits/, 'maxLevel 1: direct children only')
  const all = build({ showTitle: false, showDescription: true, maxLevel: -1, from })
  assert.match(all, /<h4 class="wp-block-heading"><a href="\/cat\/audits\/">Audits<\/a><\/h4>/, 'maxLevel -1: every level, one heading level deeper each')
  assert.equal(build({ showTitle: true, showDescription: true, maxLevel: 2, from }).includes('/cat/audits/'), true)
  assert.equal(build(null), buildArchiveContent({ path: '/portfolio', view: 'category', category: 'portfolio' }, ctx, { selfId: 40, hasChildPages: true }), 'a spec without display options keeps the earlier output')
  assert.match(build(null), /tracy-eyebrow[\s\S]*Pellentesque[\s\S]*Database Security/)
  assert.throws(() => build({ showTitle: 'no', showDescription: false, maxLevel: 0, from }), /display\.showTitle/)
  assert.throws(() => build({ showTitle: true, showDescription: false, maxLevel: '0', from }), /display\.maxLevel/)
})

test('seed: a featured route with Joomla frontpage ordering uses the featured posts in menu_order', () => {
  const ctx = { patterns, terms: new Map(), rewrite: (markup) => markup, log: [] }
  const output = buildArchiveContent({ path: '/', view: 'featured', featuredOrdering: ['3', '8'], featuredDrawn: true }, ctx)
  assert.match(output, /"sticky":"only"/)
  assert.match(output, /"orderBy":"menu_order"/)
  assert.match(output, /"order":"asc"/)
  const notDrawn = buildArchiveContent({ path: '/news', view: 'featured', featuredOrdering: ['3', '8'], featuredDrawn: false }, ctx)
  assert.doesNotMatch(notDrawn, /<!-- wp:query\b/, 'no post list is drawn when the source layout has no featured component')
  assert.deepEqual(ctx.log.at(-1), { page: '/news', note: 'featured view: the source layout does not draw the featured component; no post list drawn' })

  const withoutFeaturedData = buildArchiveContent({ path: '/', view: 'featured' }, ctx)
  assert.match(withoutFeaturedData, /<!-- wp:query\b/, 'a spec without featured-ordering data keeps the existing post query')
})

test('seed: a featured home page appends the featured-only ordered query', () => {
  const ctx = {
    spec: { sections: { acm: [], custom: [], other: [] } },
    patternsMap: { types: {} }, patterns, media, rewrite: (markup) => markup,
    log: [], sections: [], terms: new Map()
  }
  const output = buildPageContent({ path: '/', view: 'front-page', contentKind: 'blocks', content: '', featured: { drawn: true, orderBy: 'featuredOrdering' } }, ctx)
  assert.match(output, /"sticky":"only"/)
  assert.match(output, /"orderBy":"menu_order"/)
  const notDrawn = buildPageContent({ path: '/', view: 'front-page', contentKind: 'blocks', content: '', featured: { drawn: false, orderBy: 'featuredOrdering' } }, ctx)
  assert.doesNotMatch(notDrawn, /"sticky":"only"/)
})

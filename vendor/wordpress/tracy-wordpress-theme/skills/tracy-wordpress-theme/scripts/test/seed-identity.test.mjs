// A whole seed against the fake site, on the identities the seeder resolves by name: an image the
// adapter rewrote to /wp-content/uploads/<basename> (#14 item 1), the excerpt of an archive route
// the seeder builds as a page (#14 item 6), an attachment whose slug takes a route (#14 item 8) and
// two categories that share one slug (#10).
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs, runSeed } from '../seed.mjs'
import { fakeSite } from './lib/fake-site.mjs'

const body = (t) => `<!-- wp:paragraph --><p>${t}</p><!-- /wp:paragraph -->`
const img = (file) => `<!-- wp:image {"sizeSlug":"full"} --><figure class="wp-block-image size-full"><img src="/wp-content/uploads/${file}" alt=""/></figure><!-- /wp:image -->`

/**
 * A home page, two service pages whose body names `item-1.jpg` — each with its own image table —
 * a post whose featured image is another `item-1.jpg` (imported first), a page naming `x.jpg`
 * that its own table lists twice, two archive routes and a 404 page. The footer module is on
 * every page (`pages: ['ALL']`). `edit(content, pagemap)` changes the spec before it is written.
 */
function writeSpec(dir, edit = null) {
  const pm = [
    { file: 'index.html', path: '/', slug: 'home', title: 'Home', view: 'front-page' },
    { file: 'services-a.html', path: '/services-a', slug: 'services-a', title: 'Service A', view: 'page' },
    { file: 'services-b.html', path: '/services-b', slug: 'services-b', title: 'Service B', view: 'page' },
    { file: 'twins.html', path: '/twins', slug: 'twins', title: 'Twins', view: 'page' },
    { file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404' },
    { file: 'category-blog.html', path: '/category-blog', slug: 'category-blog', title: 'Category Blog', view: 'category' },
    { file: 'author-listing.html', path: '/author-listing', slug: 'author-listing', title: 'Author Listing', view: 'author' }
  ]
  const page = (i, extra = {}) => ({ ...pm[i], parent: null, status: 'publish', content: body(pm[i].title), meta: {}, images: [], ...extra })
  const content = {
    site: { name: 'Fake', tagline: 'Site', locales: ['en'], defaultLocale: 'en' },
    pages: [
      page(0),
      page(1, { content: body('Service A lead text for the page.') + img('item-1.jpg'), images: [{ src: '/wp-content/uploads/item-1.jpg', file: 'item-1.jpg', original: 'images/others/item-1.jpg', alt: '' }] }),
      page(2, { content: body('Service B lead text for the page.') + img('item-1.jpg'), images: [{ src: '/wp-content/uploads/item-1.jpg', file: 'item-1.jpg', original: 'images/others/item-1.jpg', alt: '' }] }),
      page(3, {
        content: body('Twins lead text for the page here.') + img('x.jpg'),
        images: [
          { src: '/wp-content/uploads/x.jpg', file: 'x.jpg', original: 'images/one/x.jpg', alt: '' },
          { src: '/wp-content/uploads/x.jpg', file: 'x.jpg', original: 'images/two/x.jpg', alt: '' }
        ]
      }),
      page(4, { content: body('Nothing here, the page you asked for is gone.') + img('404.png'), images: [{ src: '/wp-content/uploads/404.png', file: '404.png', original: 'images/pics/404.png', alt: '' }] })
    ],
    posts: [
      {
        slug: 'post-a',
        path: '/category-blog/post-a',
        category: 'blogs',
        title: 'Post A',
        featuredImage: 'images/blogs/item-1.jpg',
        content: body('Post A has its own item one.') + img('item-1.jpg') + img('chart.png'),
        images: [
          { src: '/wp-content/uploads/item-1.jpg', file: 'item-1.jpg', original: 'images/blogs/item-1.jpg', alt: '' },
          { src: '/wp-content/uploads/chart.png', file: 'chart.png', original: 'images/blogs/chart.png', alt: 'A chart' }
        ]
      }
    ],
    categories: [{ id: '8', title: 'Blogs', wpSlug: 'blogs', parent: null, description: '' }],
    archives: [
      { file: 'category-blog.html', view: 'category', path: '/category-blog', title: 'Category Blog', category: 'blogs', sections: [], aside: [] },
      { file: 'author-listing.html', view: 'author', path: '/author-listing', title: 'Author Listing', category: null, excerpt: 'Masthead line for the authors.', sections: [], aside: [] }
    ],
    images: []
  }
  const sections = {
    acm: [],
    custom: [
      {
        id: '126',
        title: 'Company',
        position: 'footinfo-1',
        scope: 'page',
        pages: ['ALL'],
        html: '<div><p>ADD: 4517 Washington Ave. Manchester, Kentucky 39495 P: 951-925-0780</p></div>',
        images: []
      }
    ],
    other: []
  }
  edit?.(content, pm)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'page-map.json'), JSON.stringify({ locales: ['en'], defaultLocale: 'en', pages: pm }))
  writeFileSync(join(dir, 'content.json'), JSON.stringify(content))
  writeFileSync(join(dir, 'sections.json'), JSON.stringify(sections))
  writeFileSync(join(dir, 'menus.json'), JSON.stringify({ menus: [] }))
  writeFileSync(join(dir, 'redirects.json'), JSON.stringify({ rules: [] }))
  writeFileSync(join(dir, 'patterns.map.json'), JSON.stringify({ types: {} }))
}

const fetchOk = async () => ({ status: 200, headers: new Map() })

async function seed(site, { root = mkdtempSync(join(tmpdir(), 'seed-identity-')), edit = null, n = 1 } = {}) {
  const spec = join(root, 'spec')
  writeSpec(spec, edit)
  const opts = parseArgs([
    '--spec', spec, '--wp', 'fake', '--theme', 'wp-tracy-business',
    '--patterns-map', join(spec, 'patterns.map.json'), '--images', '/img',
    '--base-url', 'http://x', '--report', join(root, `report-${n}.json`)
  ])
  const stderr = console.error
  console.error = () => {}
  try {
    return await runSeed(opts, { runner: site.wp, fetch: fetchOk })
  } finally {
    console.error = stderr
  }
}

/** The URL the fake gives an attachment: its guid, host stripped. */
const urlOf = (site, id) => `/wp-content/uploads/${site.posts.get(id).post_name}.jpg`

test('seed: an uploads-form image resolves through the image table of the page or post that names it, not the first file of that name (#14 item 1)', async () => {
  const site = fakeSite()
  const imported = []
  site.attachmentName = (file) => {
    imported.push(file)
    return null
  }
  const report = await seed(site)
  const media = new Map([...site.posts.values()].filter((p) => p.post_type === 'attachment').map((p) => [p.ID, p]))
  assert.ok(imported.indexOf('/img/blogs/item-1.jpg') < imported.indexOf('/img/others/item-1.jpg'), 'the post\'s item-1.jpg is imported first — the global lookup would find it first')
  const idOf = (key) => [...media.keys()][imported.indexOf(`/img/${key}`)]
  const others = urlOf(site, idOf('others/item-1.jpg'))
  const blogs = urlOf(site, idOf('blogs/item-1.jpg'))
  for (const path of ['/services-a', '/services-b']) {
    const content = site.page((p) => p.post_name === path.slice(1)).content
    assert.ok(content.includes(`src="${others}"`), `${path} shows its own others/item-1.jpg`)
    assert.ok(!content.includes(`src="${blogs}"`), `${path} does not show the blog's item-1.jpg`)
  }
  const post = site.post((p) => p.post_name === 'post-a')
  assert.equal(Number(post.meta._thumbnail_id), idOf('blogs/item-1.jpg'), 'the post\'s featured image is its own item-1.jpg')
  assert.ok(imported.includes('/img/blogs/chart.png'), 'an image only a post body names is imported too')
  assert.ok(post.content.includes(`src="${urlOf(site, idOf('blogs/chart.png'))}"`), 'and the post body shows it')
  const twins = site.page((p) => p.post_name === 'twins').content
  assert.ok(twins.includes('src="/wp-content/uploads/x.jpg"'), 'an ambiguous reference is left as written, not guessed')
  assert.ok(
    report.notes.some((n) => n.page === '/twins' && /x\.jpg/.test(n.note) && /one\/x\.jpg/.test(n.note) && /two\/x\.jpg/.test(n.note)),
    'and the report names both candidates'
  )
})

test('seed: a page\'s featured image becomes its _thumbnail_id, as a post\'s does (category listings draw it)', async () => {
  const site = fakeSite()
  const imported = []
  site.attachmentName = (file) => {
    imported.push(file)
    return null
  }
  await seed(site, { edit: (content) => (content.pages[1].featuredImage = 'images/others/item-1.jpg') })
  const media = [...site.posts.values()].filter((p) => p.post_type === 'attachment').map((p) => p.ID)
  const page = site.page((p) => p.post_name === 'services-a')
  assert.equal(Number(page.meta._thumbnail_id), media[imported.indexOf('/img/others/item-1.jpg')], 'the page\'s own others/item-1.jpg')
  assert.equal(site.page((p) => p.post_name === 'services-b').meta._thumbnail_id, undefined, 'a page without a featured image gets none')
})

test('seed: an archive route the seeder builds as a page takes the archive\'s excerpt, never the text of a module on every page (#14 item 6)', async () => {
  const site = fakeSite()
  await seed(site)
  const excerpt = (slug) => site.page((p) => p.post_name === slug).post_excerpt
  const blogPage = site.page((p) => p.post_name === 'category-blog')
  const authors = site.page((p) => p.post_name === 'author-listing')
  assert.ok(blogPage && authors, 'both archive pages are seeded')
  assert.doesNotMatch(String(excerpt('category-blog') ?? ''), /Washington/, 'the footer module is not the archive\'s excerpt')
  assert.equal(excerpt('category-blog') ?? '', '', 'an archive that declares no description has none')
  assert.equal(excerpt('author-listing'), 'Masthead line for the authors.', 'the archive\'s own description is its excerpt')
})

test('seed: an attachment whose slug takes a page-map route is reported with its cause, on the first run and on the next (#14 item 8)', async () => {
  const site = fakeSite()
  site.attachmentName = (file) => (file.endsWith('/404.png') ? '404' : null)
  const root = mkdtempSync(join(tmpdir(), 'seed-identity-'))
  const first = await seed(site, { root })
  const id = [...site.posts.values()].find((p) => p.post_type === 'attachment' && p.post_name === '404').ID
  const expected = [{ attachment: id, source: 'pics/404.png', slug: '404', route: '/404' }]
  assert.equal(first.mediaRoutes?.ok, false, 'a collision is not a clean result')
  assert.deepEqual(first.mediaRoutes.collisions, expected)
  const second = await seed(site, { root, n: 2 })
  assert.equal(second.mediaRoutes?.ok, false, 'a reused attachment is checked too')
  assert.deepEqual(second.mediaRoutes.collisions, expected)
  assert.equal(site.posts.get(id).post_name, '404', 'the attachment is reported, not renamed')

  const clean = fakeSite()
  const report = await seed(clean)
  assert.equal(report.mediaRoutes.ok, true, 'no collision: a clean result')
  assert.deepEqual(report.mediaRoutes.collisions, [])
  assert.equal(report.mediaRoutes.checked, report.media.files, 'that says what it checked')
  assert.ok(report.mediaRoutes.routeSlugs > 0, 'and how many route slugs it looked up across the site')

  // An attachment the seeder never imported (an editor's upload, an old run's media.json lost)
  // takes the route all the same: the site is read, not only media.json.
  const foreign = fakeSite()
  foreign.posts.set(9001, { ID: 9001, post_type: 'attachment', post_name: '404', post_parent: 0, post_status: 'inherit', meta: {} })
  const theirs = await seed(foreign)
  assert.equal(theirs.mediaRoutes.ok, false, 'an attachment outside media.json is checked too')
  assert.deepEqual(theirs.mediaRoutes.collisions, [{ attachment: 9001, source: null, slug: '404', route: '/404' }])

  // A read that answers but leaves out attachments media.json names is not a clean result.
  const hollow = fakeSite()
  hollow.emptyAttachmentList = 1
  const partial = await seed(hollow)
  assert.equal(partial.mediaRoutes.ok, false, 'an empty answer for known ids is never a clean result')
  assert.match(partial.mediaRoutes.error, /left out attachments? .* of media\.json/)

  const blind = fakeSite()
  blind.failAttachmentList = 1
  const failed = await seed(blind)
  assert.equal(failed.mediaRoutes.ok, false, 'a lookup that fails is never a clean result')
  assert.match(failed.mediaRoutes.error, /database connection/)
})

test('seed: two spec categories on one slug are an error that names both, not a merge (#10)', async () => {
  const site = fakeSite()
  await assert.rejects(
    () =>
      seed(site, {
        edit: (content) => {
          content.categories.push(
            { id: '10', title: 'Database Security', wpSlug: 'database-security', parent: 'blogs', description: '' },
            { id: '17', title: 'Database Security', wpSlug: 'database-security', parent: null, description: '' }
          )
        }
      }),
    /category slug "database-security" is shared by #10 and #17/
  )
  assert.equal([...site.terms.values()].length, 0, 'nothing is written before the check')
})

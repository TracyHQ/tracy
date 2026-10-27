// Issue #68 — seeder: media/page slug collisions, nested home path, non-idempotent category names,
// unregistered patterns, non-SEF links. Each item has a fixture that failed before its fix.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakeSite } from './lib/fake-site.mjs'
import { seedSpec, body } from './lib/seeder-spec.mjs'
import { sameTermName, nonSefPath, missingRequiredPatterns, reservedRouteSlugs, localizePages } from '../seed.mjs'

test('media: a new attachment on the slug of a page route is renamed, not left to take the page\'s slug', async () => {
  const site = fakeSite()
  site.attachmentName = (file) => (file.endsWith('/about-us.jpg') ? 'about-us' : null)
  const report = await seedSpec(site, {
    edit: (s) => {
      s.content.pages[1].content += '<img src="/wp-content/uploads/about-us.jpg" alt="">'
      s.content.pages[1].images = [{ src: '/wp-content/uploads/about-us.jpg', file: 'about-us.jpg', original: 'images/about-us.jpg', alt: '' }]
    }
  })
  const att = [...site.posts.values()].find((p) => p.post_type === 'attachment')
  assert.equal(att.post_name, 'about-us-image', 'the attachment gave the slug up')
  assert.equal(site.page((p) => p.post_name === 'about-us')?.post_name, 'about-us', 'the page keeps its own slug')
  assert.equal(report.mediaRoutes.ok, true, 'no collision is left to report')
  assert.ok(report.notes.some((n) => /renamed "about-us-image"/.test(n.note ?? '')), 'and the report says so')
})

test('media: an attachment the seeder did not import stays on the route slug and is reported', async () => {
  const site = fakeSite()
  site.posts.set(9001, { ID: 9001, post_type: 'attachment', post_name: 'about-us', post_parent: 0, post_status: 'inherit', meta: {} })
  const report = await seedSpec(site)
  assert.equal(site.posts.get(9001).post_name, 'about-us', 'an editor\'s upload is not renamed')
  assert.equal(report.mediaRoutes.ok, false)
})

test('reservedRouteSlugs: top-level routes, the first segment of a nested route and the front page slug', () => {
  const spec = {
    pagemap: { pages: [{ path: '/', slug: 'home' }, { path: '/home/home-style-1', slug: 'home-style-1' }, { path: '/blog', slug: 'blog' }] },
    content: { pages: [{ path: '/about-us/contact', slug: 'contact' }], archives: [] }
  }
  assert.deepEqual([...reservedRouteSlugs(spec)].sort(), ['about-us', 'blog', 'home', 'home-front'], 'the front page slug a /home/... route displaces is reserved too')
  const plain = { pagemap: { pages: [{ path: '/', slug: 'home' }, { path: '/blog', slug: 'blog' }] }, content: { pages: [], archives: [] } }
  assert.deepEqual([...reservedRouteSlugs(plain)].sort(), ['blog', 'home'])
})

test('reservedRouteSlugs: a nested route whose first segment only normalizes to the front slug reserves the displaced slug', () => {
  const spec = { pagemap: { pages: [{ path: '/', slug: 'home' }, { path: '/hôme/x', slug: 'x' }] }, content: { pages: [], archives: [] } } // language-allow: data: accented path
  assert.ok(reservedRouteSlugs(spec).has('home-front'))
  const pages = [
    { path: '/', slug: 'home', parent: null },
    { path: '/hôme', slug: 'hôme', parent: null, synthetic: true }, // language-allow: data: accented path
    { path: '/hôme/x', slug: 'x', parent: '/hôme' } // language-allow: data: accented path
  ]
  localizePages(pages)
  assert.ok(reservedRouteSlugs(spec).has(pages[0].wpSlug), 'the slug localizePages files the front page under is reserved')
})

test('pages: the front page gives its slug to the parent a nested /home/... route needs', () => {
  const pages = [
    { path: '/', slug: 'home', parent: null },
    { path: '/home', slug: 'home', parent: null, synthetic: true },
    { path: '/home/home-style-1', slug: 'home-style-1', parent: '/home' }
  ]
  const notes = localizePages(pages)
  assert.equal(pages[0].wpSlug, 'home-front')
  assert.equal(pages[1].wpSlug, 'home', 'the parent keeps the slug its path names')
  assert.equal(notes.length, 1)
  const alone = [{ path: '/', slug: 'home', parent: null }, { path: '/about', slug: 'about', parent: null }]
  localizePages(alone)
  assert.equal(alone[0].wpSlug, 'home', 'no collision: unchanged, so a settled site does not move')
})

test('seed: a home page and a nested /home/... route get distinct slugs and the child sits under the parent', async () => {
  const site = fakeSite()
  await seedSpec(site, {
    edit: (s) => {
      s['page-map'].pages.push({ file: 'h1.html', path: '/home/home-style-1', slug: 'home-style-1', title: 'Home Style 1', view: 'page' })
      s.content.pages.push({ ...s['page-map'].pages[2], parent: '/home', status: 'publish', content: body('Style'), meta: {}, images: [] })
    }
  })
  const homes = [...site.posts.values()].filter((p) => p.post_type === 'page' && /^home/.test(p.post_name)).map((p) => p.post_name).sort()
  assert.deepEqual(homes, ['home', 'home-front', 'home-style-1'])
  const parent = site.page((p) => p.post_name === 'home')
  assert.equal(site.page((p) => p.post_name === 'home-style-1').post_parent, parent.ID)
})

test('seed: an imported image named like the displaced front page slug does not take it; a repeat seed finds the front page again', async () => {
  const site = fakeSite()
  site.attachmentName = (file) => (file.endsWith('/home-front.jpg') ? 'home-front' : null)
  const edit = (s) => {
    s['page-map'].pages.push({ file: 'h1.html', path: '/home/home-style-1', slug: 'home-style-1', title: 'Home Style 1', view: 'page' })
    s.content.pages.push({ ...s['page-map'].pages[2], parent: '/home', status: 'publish', content: body('Style'), meta: {}, images: [] })
    s.content.pages[0].content += '<img src="/wp-content/uploads/home-front.jpg" alt="">'
    s.content.pages[0].images = [{ src: '/wp-content/uploads/home-front.jpg', file: 'home-front.jpg', original: 'images/home-front.jpg', alt: '' }]
  }
  const root = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'i68f-'))
  await seedSpec(site, { root, edit })
  assert.equal(site.page((p) => p.post_name === 'home-front')?.post_type, 'page', 'the front page got its slug, not "home-front-2"')
  const second = await seedSpec(site, { root, edit, n: 2 })
  assert.equal(second.counts.pages.created, 0, 'the repeat seed found the front page')
  assert.equal(second.counts.pages.updated, 0)
})

test('categories: a name with & is stored encoded and a repeat seed changes nothing', async () => {
  const site = fakeSite()
  const edit = (s) => s.content.categories.push({ id: '3', title: 'Design & Build', wpSlug: 'design-build', parent: null, description: '' })
  const root = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'i68-'))
  const first = await seedSpec(site, { root, edit })
  assert.equal(first.counts.categories.created, 1)
  const second = await seedSpec(site, { root, edit, n: 2 })
  assert.equal(second.counts.categories.updated, 0, 'no update of an unchanged category')
  assert.equal(second.counts.categories.skipped, 1)
})

test('sameTermName: entity forms compare equal, different names do not', () => {
  assert.ok(sameTermName('Design &amp; Build', 'Design & Build'))
  assert.ok(sameTermName('Tom &#038; Jerry', 'Tom & Jerry'))
  assert.ok(sameTermName('a', 'a'))
  assert.ok(!sameTermName('Design &amp; Build', 'Design and Build'))
  assert.ok(!sameTermName(undefined, 'x'))
})

test('patterns: a pattern the map names that the site does not register stops the seed before any page is written', async () => {
  const site = fakeSite()
  await assert.rejects(
    seedSpec(site, {
      edit: (s) => {
        s['patterns.map'] = { types: { 'hero:one': { pattern: 'tracy-base/renamed-hero', fields: {} } } }
        s.sections.acm.push({ id: '1', type: 'hero', style: 'one', position: 'top', pages: ['ALL'], fields: {}, items: [] })
      }
    }),
    /not registered on the site: tracy-base\/renamed-hero/
  )
  assert.equal([...site.posts.values()].filter((p) => p.post_type === 'page').length, 0, 'no page was written')
})

test('missingRequiredPatterns: layouts pick the pattern; unmapped types and registered patterns are not missing', () => {
  const map = { types: { 'a:1': { pattern: 'p/a' }, 'b:1': { pattern: 'p/b', layouts: { wide: 'p/b-wide', '*': 'p/b' } }, 'c:1': { pattern: 'p/c' } } }
  const acm = [{ type: 'a', style: '1' }, { type: 'b', style: '1', fields: { layout: 'wide' } }, { type: 'c', style: '1' }, { type: 'zz', style: '9' }]
  assert.deepEqual(missingRequiredPatterns(map, acm, { 'p/c': 'x' }), ['p/a', 'p/b-wide'])
  assert.deepEqual(missingRequiredPatterns(map, [], {}), [])
})

test('links: Joomla non-SEF addresses name the same route as the SEF ones', () => {
  assert.equal(nonSefPath('index.php/home/home-style-1'), '/home/home-style-1')
  assert.equal(nonSefPath('/index.php/home/home-style-1/'), '/home/home-style-1')
  assert.equal(nonSefPath('/index.php/about?x=1'), '/about')
  assert.equal(nonSefPath('/index.php'), null)
  assert.equal(nonSefPath('/about'), null)
  assert.equal(nonSefPath('/myindex.php/x'), null)
})

test('options: a site with no tagline settles — the repeat seed updates no option', async () => {
  const site = fakeSite()
  const root = (await import('node:fs')).mkdtempSync((await import('node:path')).join((await import('node:os')).tmpdir(), 'i68-'))
  const edit = (s) => delete s.content.site.tagline
  await seedSpec(site, { root, edit })
  const second = await seedSpec(site, { root, edit, n: 2 })
  assert.equal(second.counts.options.updated, 0)
  assert.equal(site.options.get('blogdescription'), '')
})

// Issue #92 (first half) — a second seed run on an unchanged spec settles at +0 ~0, and its route check
// passes. One fixture per case; each failed on the code before its fix.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fakeSite } from './lib/fake-site.mjs'
import { seedSpec, body } from './lib/seeder-spec.mjs'
import { dedupePostSlugs, planPostRows, freeAttachmentSlug, singleViewRules, buildNavigation, renderAcm } from '../seed.mjs'

const scratch = () => mkdtempSync(join(process.env.TRACY_TEST_SCRATCH || tmpdir(), 'i92-'))
/** Every group's created/updated of a report, for "nothing changed" checks. */
const changes = (report) => Object.fromEntries(Object.entries(report.counts).map(([k, v]) => [k, `+${v.created} ~${v.updated}`]))
const settled = (report) => Object.entries(report.counts).filter(([, v]) => v.created || v.updated).map(([k, v]) => `${k} +${v.created} ~${v.updated}`)

async function twice(site, edit, extraArgs = []) {
  const root = scratch()
  try {
    const first = await seedSpec(site, { root, edit, extraArgs })
    const second = await seedSpec(site, { root, edit, n: 2, extraArgs })
    return { first, second }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

// ── 1. Pager text with no labels ────────────────────────────────────────────────────────────────
const pagerArchive = (s, labels) => {
  s['page-map'].pages.push({ file: 'news.html', path: '/news', slug: 'news', title: 'News', view: 'category' })
  s.content.categories.push({ id: '1', title: 'News', wpSlug: 'news', parent: null, description: '' })
  s.content.archives.push({ file: 'news.html', path: '/news', title: 'News', view: 'category', category: 'news', perPage: 7, paging: { leading: 1, intro: 6, links: 0, ...(labels ? { labels } : {}) } })
}

test('#92-1 pager text: no paging.labels is `{}` on the first run and WordPress hands back `[]`; the repeat run changes nothing', async () => {
  const site = fakeSite()
  const { first, second } = await twice(site, (s) => pagerArchive(s))
  assert.equal(first.counts.options.created > 0, true)
  assert.equal(site.options.get('tracy_joomla_pager_text'), '{}', 'the first run writes what it always wrote')
  assert.deepEqual(settled(second), [], 'nothing is created or updated')
  assert.equal(site.calls.filter((c) => c[0] === 'option' && c[1] === 'update' && c[2] === 'tracy_joomla_pager_text').length, 1, 'and nothing is written again')
})

test('#92-1 pager text: declared labels still update, and dropping them after a run still clears them (and then settles)', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    const labels = { start: 'First', previous: 'Prev', next: 'Next', end: 'Last' }
    await seedSpec(site, { root, edit: (s) => pagerArchive(s, labels) })
    const same = await seedSpec(site, { root, edit: (s) => pagerArchive(s, labels), n: 2 })
    assert.deepEqual(settled(same), [])
    const changed = await seedSpec(site, { root, edit: (s) => pagerArchive(s, { ...labels, next: 'More' }), n: 3 })
    assert.deepEqual(JSON.parse(site.options.get('tracy_joomla_pager_text')).next, 'More')
    assert.equal(changes(changed).options, '+0 ~1')
    const dropped = await seedSpec(site, { root, edit: (s) => pagerArchive(s), n: 4 })
    assert.equal(changes(dropped).options, '+0 ~1', 'removing the words is a change')
    assert.deepEqual(JSON.parse(site.options.get('tracy_joomla_pager_text')), {})
    const again = await seedSpec(site, { root, edit: (s) => pagerArchive(s), n: 5 })
    assert.deepEqual(settled(again), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 2. Author biography with HTML ───────────────────────────────────────────────────────────────
const withAuthor = (description) => (s) => {
  s.content.authors = [{ id: '5', name: 'Ada', description }]
  s.content.posts.push({ slug: 'p', path: '/p', category: null, title: 'P', content: body('x'), images: [], author: { id: '5' } })
}

test('#92-2 author biography with HTML: WordPress stores it filtered; the repeat run compares what it will store and writes nothing', async () => {
  const site = fakeSite()
  const { first, second } = await twice(site, withAuthor('<p>Ada writes <b>code</b> & <script>x()</script>notes.</p>'))
  assert.equal(changes(first).authors, '+1 ~0')
  assert.ok(!/<p>|<script>/.test([...site.users.values()].find((u) => u.user_login.startsWith('ada')).description), 'the site holds the filtered text')
  assert.deepEqual(settled(second), [])
  assert.equal(site.calls.filter((c) => c[0] === 'user' && c[1] === 'update').length, 0, 'and no user update was issued')
  assert.equal(site.calls.filter((c) => c[0] === 'user' && c[1] === 'create').every((c) => c.some((a) => a.startsWith('--description=<p>'))), true, 'the first run still writes the biography as the spec has it')
})

test('#92-2 author biography: a real change of the text still updates, and then settles', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: withAuthor('<p>One <b>line</b></p>') })
    const changed = await seedSpec(site, { root, edit: withAuthor('<p>Another <b>line</b></p>'), n: 2 })
    assert.equal(changes(changed).authors, '+0 ~1')
    const again = await seedSpec(site, { root, edit: withAuthor('<p>Another <b>line</b></p>'), n: 3 })
    assert.deepEqual(settled(again), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-2 author biography: when the site cannot be asked what it would store, the raw comparison stays (a write, never a silent skip)', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: withAuthor('<p>Ada</p>') })
    const run = site.wp.run
    site.wp.run = (args, opts) => (args[0] === 'eval' && String(args[1]).includes('pre_user_description') ? { code: 1, stdout: '', stderr: 'boom' } : run(args, opts))
    const second = await seedSpec(site, { root, edit: withAuthor('<p>Ada</p>'), n: 2 })
    assert.equal(changes(second).authors, '+0 ~1')
    assert.ok(second.notes.some((n) => /biograph/i.test(n.note ?? '') && /not read|could not/i.test(n.note ?? '')), 'and the report says the filter was not read')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 3. Distinct articles that share a Joomla alias ─────────────────────────────────────────────
const article = (articleId, extra = {}) => ({ slug: 'shared-story', path: `/news/${articleId}-shared-story`, category: null, title: `Story ${articleId}`, content: body(`Words of ${articleId}`), images: [], joomla: { articleId: String(articleId), alias: 'shared-story' }, ...extra })

test('dedupePostSlugs: distinct articles on one alias — the lowest article id keeps the slug, each other takes `<slug>-<articleId>`, in any order', () => {
  const run = (list) => {
    const posts = list.map((p) => ({ ...p }))
    dedupePostSlugs(posts)
    return Object.fromEntries(posts.map((p) => [p.joomla.articleId, p.slug]))
  }
  const posts = [article(30), article(10), article(20)]
  const expected = { 10: 'shared-story', 20: 'shared-story-20', 30: 'shared-story-30' }
  assert.deepEqual(run(posts), expected)
  assert.deepEqual(run([...posts].reverse()), expected, 'the order of the spec decides nothing')
  assert.deepEqual(run([article(30), article(10), article(20), article(77, { slug: 'shared-story-20', joomla: { articleId: '77', alias: 'shared-story-20' } })]), { 10: 'shared-story', 20: 'shared-story-20-2', 30: 'shared-story-30', 77: 'shared-story-20' }, 'a name the spec already holds is not taken')
  assert.deepEqual(run([article(5, { slug: 'a b', joomla: { articleId: '5', alias: 'a-b' } }), article(6, { slug: 'a-b', joomla: { articleId: '6', alias: 'a-b' } })]), { 5: 'a b', 6: 'a-b-6' }, 'the slug after normalization is what clashes')
})

test('dedupePostSlugs: two groups that want the same free alias — the lower article id gets it, in either order of the spec', () => {
  const mk = (slug, id, alias) => ({ slug, title: `T${id}`, joomla: { articleId: String(id), alias } })
  // `a` and `b` each hold two posts; the second of each has the alias `wanted`, which no post holds yet.
  const list = [mk('a', 1, 'a'), mk('a', 40, 'wanted'), mk('b', 2, 'b'), mk('b', 30, 'wanted')]
  const run = (posts) => {
    const copy = posts.map((p) => ({ ...p, joomla: { ...p.joomla } }))
    dedupePostSlugs(copy)
    return Object.fromEntries(copy.map((p) => [p.joomla.articleId, p.slug]))
  }
  const expected = { 1: 'a', 2: 'b', 30: 'wanted', 40: 'a-40' }
  assert.deepEqual(run(list), expected)
  assert.deepEqual(run([...list].reverse()), expected)
  assert.deepEqual(run([list[2], list[3], list[0], list[1]]), expected)
})

test('dedupePostSlugs: slugs are one space for the site, whatever the language — Polylang free cannot share a slug', () => {
  const mk = (locale, id, alias = 'same') => ({ slug: 'same', locale, title: `T${id}`, joomla: { articleId: String(id), alias } })
  const posts = [mk('en', 1), mk('ru', 2)]
  dedupePostSlugs(posts)
  assert.deepEqual(posts.map((p) => p.slug), ['same', 'same-2'], 'the second language takes a name of its own')
  const collide = [mk('en', 1), { ...mk('ru', 5, 'same'), slug: 'other' }, mk('en', 9)]
  dedupePostSlugs(collide)
  assert.equal(new Set(collide.map((p) => p.slug)).size, 3, 'no two posts end on one name')
})

test('#92-3 distinct articles on one alias: each its own post and slug, a repeat run changes nothing, the redirect and the menu name the right post', async () => {
  const site = fakeSite()
  const edit = (s) => {
    s.content.posts.push(article(20), article(10))
    s['page-map'].pages.push({ file: 'a.html', path: '/news/20-shared-story', slug: 'a', title: 'A', view: 'single' })
    s.menus.menus = [{ menutype: 'main', title: 'Main', items: [{ label: 'Story 20', url: '/news/20-shared-story', published: true, children: [] }] }]
  }
  const { first, second } = await twice(site, edit)
  const posts = [...site.posts.values()].filter((p) => p.post_type === 'post')
  assert.deepEqual(posts.map((p) => p.post_name).sort(), ['shared-story', 'shared-story-20'])
  assert.deepEqual(settled(second), [], `the repeat run settles (first: ${JSON.stringify(changes(first))})`)
  const byTitle = Object.fromEntries(posts.map((p) => [p.post_title, p]))
  assert.equal(byTitle['Story 10'].post_name, 'shared-story')
  assert.equal(byTitle['Story 20'].post_name, 'shared-story-20')
  assert.match(byTitle['Story 20'].content, /Words of 20/)
  assert.match(byTitle['Story 10'].content, /Words of 10/)
  assert.deepEqual(second.redirects.filter((r) => r.from === '/news/20-shared-story').map((r) => r.to), ['/shared-story-20/'])
  const nav = [...site.posts.values()].find((p) => p.post_type === 'wp_navigation')
  assert.equal(nav.content.includes(`"id":${byTitle['Story 20'].ID}`) || nav.content.includes('/news/20-shared-story'), true)
})

const state = (site) => JSON.stringify([[...site.posts], [...site.options], [...(site.users ?? new Map())]])
const row = (id, title, name, meta = { _tracy_seed: 'old' }) => ({ ID: id, post_type: 'post', post_title: title, post_name: name, post_status: 'publish', post_parent: 0, content: body(`Words of ${title.replace('Story ', '')}`), meta })
const livePosts = (site) => [...site.posts.values()].filter((p) => p.post_type === 'post' && p.post_status !== 'trash')

test('#92-3 the group keeps its ids and names when the spec is written in the other order, and each row names its article', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(20), article(10)) })
    const ids = Object.fromEntries(livePosts(site).map((p) => [p.post_name, p.ID]))
    assert.deepEqual(livePosts(site).map((p) => p.meta._tracy_source_article).sort(), ['10', '20'])
    const reversed = await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(10), article(20)), n: 2 })
    assert.deepEqual(settled(reversed), [])
    assert.deepEqual(Object.fromEntries(livePosts(site).map((p) => [p.post_name, p.ID])), ids)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

for (const [label, rows] of [
  ['rows an older seeder made (no identity), titles and fingerprints as the seeder writes them', [row(900, 'Story 10', 'shared-story'), row(901, 'Story 20', 'shared-story-2')]],
  ['a row that names another article', [row(900, 'Story 10', 'shared-story', { _tracy_seed: 'x', _tracy_source_article: '99' }), row(901, 'Story 20', 'shared-story-20', { _tracy_seed: 'x', _tracy_source_article: '20' })]],
  ['an unidentified row on the second article\'s slug only', [row(901, 'Story 20', 'shared-story-20')]]
]) {
  test(`#92-3 ${label} at a slug the group wants: the seed stops naming article, slug and row, and nothing is written`, async () => {
    const site = fakeSite()
    for (const r of rows) site.posts.set(r.ID, r)
    site.nextId = 1000
    const before = state(site)
    const held = rows.find((r) => !r.meta._tracy_source_article || r.meta._tracy_source_article === '99')?.ID ?? rows[0].ID
    const err = await seedSpec(site, { edit: (s) => s.content.posts.push(article(20), article(10)) }).then(() => null, (e) => e)
    assert.ok(err, 'the seed was refused')
    assert.match(err.message, new RegExp(`article (10|20) \\("Story (10|20)"\\) wants the slug shared-story(-20)?, which post ${held}\\b`))
    assert.equal(state(site), before, 'ids, names, content, meta, options and users are as they were')
    assert.equal(site.calls.filter((c) => (c[0] === 'post' && c[1] !== 'list' && c[1] !== 'meta') || (c[0] === 'option' && c[1] === 'update') || c[0] === 'user' || c[0] === 'theme').length, 0, 'no write was issued')
  })
}

test('#92-3 an article alone at its slug with its own identity is updated in place, then settles', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(10), article(20)) })
    const id10 = livePosts(site).find((p) => p.post_title === 'Story 10').ID
    const edit = (s) => s.content.posts.push(article(10, { content: body('Words of 10, revised') }))
    const changed = await seedSpec(site, { root, edit, n: 2 })
    assert.equal(changes(changed).posts, '+0 ~1')
    assert.match(site.posts.get(id10).content, /revised/)
    assert.equal(livePosts(site).length, 2, 'and the other article\'s row is left alone')
    assert.deepEqual(settled(await seedSpec(site, { root, edit, n: 3 })), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-3 a row is the article\'s by its identity, not its name: renamed in WordPress, it is still updated and the repeat run changes nothing', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    const edit = (s) => s.content.posts.push(article(10), article(20))
    await seedSpec(site, { root, edit })
    const stored = livePosts(site).find((p) => p.post_title === 'Story 20')
    stored.post_name = 'shared-story-20-by-hand'
    const again = await seedSpec(site, { root, edit, n: 2 })
    assert.deepEqual(settled(again), [])
    assert.equal(livePosts(site).length, 2)
    assert.equal(site.posts.get(stored.ID).post_name, 'shared-story-20-by-hand', 'the stored name is read back, not rewritten')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-3 an old group shrunk to one new article never writes over the old rows (no identity): the seed stops and nothing changes', async () => {
  const site = fakeSite()
  for (const r of [row(900, 'Story 10', 'shared-story'), row(901, 'Story 20', 'shared-story-2')]) site.posts.set(r.ID, r)
  site.nextId = 1000
  const before = state(site)
  await assert.rejects(seedSpec(site, { edit: (s) => s.content.posts.push(article(5)) }), /article 5[^]*shared-story[^]*post 900/)
  assert.equal(state(site), before)
})

test('#92-3 every post with a source article id carries it, so a lone article is found by it later', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    const edit = (s) => s.content.posts.push(article(7, { slug: 'solo', joomla: { articleId: '7', alias: 'solo' } }))
    await seedSpec(site, { root, edit })
    assert.equal(livePosts(site)[0].meta._tracy_source_article, '7')
    assert.deepEqual(settled(await seedSpec(site, { root, edit, n: 2 })), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('freeAttachmentSlug: it looks past the first 20 names while every one is held', () => {
  const held = new Set(Array.from({ length: 25 }, (_, i) => (i ? `pic-image-${i + 1}` : 'pic-image')))
  const wp = { phpEval: (code, opts) => {
    assert.deepEqual(opts, { mutate: false })
    assert.match(code, /WHERE post_name IN/)
    const names = JSON.parse(Buffer.from(/base64_decode\('([^']+)'/.exec(code)[1], 'base64').toString())
    return JSON.stringify(names.filter((name) => held.has(name)).map((post_name, ID) => ({ ID: String(ID + 1), post_name })))
  } }
  assert.equal(freeAttachmentSlug(wp, 'pic', new Set()), 'pic-image-26')
})

test('freeAttachmentSlug sees a private attachment holding the candidate slug without filtering statuses', () => {
  let query
  const wp = { phpEval: (code) => {
    query = code
    const names = JSON.parse(Buffer.from(/base64_decode\('([^']+)'/.exec(code)[1], 'base64').toString())
    return JSON.stringify(names.includes('pic-image') ? [{ ID: '88', post_name: 'pic-image', post_type: 'attachment', post_status: 'private' }] : [])
  } }
  assert.equal(freeAttachmentSlug(wp, 'pic', new Set()), 'pic-image-2')
  assert.match(query, /WHERE post_name IN/)
  assert.doesNotMatch(query, /WHERE[^;]*post_status\s*=/)
})

test('ACM style attr is explicitly unresolved and leaves pattern markup unchanged across renders', () => {
  const instance = { id: 'progress-7', type: 'progress', style: 'style-1', fields: { width: '72%' }, items: [] }
  const patternsMap = { types: { 'progress:style-1': { pattern: 'test/progress', fields: { width: { block: 'core/group', path: 'progress.bar', attr: 'style', repeat: null } } } } }
  const pattern = '<!-- wp:group {"metadata":{"name":"progress.bar"}} --><div class="wp-block-group"></div><!-- /wp:group -->'
  const first = renderAcm(instance, patternsMap, { 'test/progress': pattern }, () => null)
  const second = renderAcm(instance, patternsMap, { 'test/progress': pattern }, () => null)
  assert.equal(first.markup, pattern)
  assert.equal(second.markup, first.markup)
  assert.deepEqual(first.unresolvedSeedResults, [{ kind: 'unsupported-style-attribute', section: 'progress-7', field: 'progress.width', sourceValue: '72%' }])
  assert.deepEqual(second.unresolvedSeedResults, first.unresolvedSeedResults)
  assert.ok(!first.notes.some((note) => note.includes('attr style not handled')))
  const missing = renderAcm(instance, {
    types: { 'progress:style-1': { pattern: 'test/progress', fields: { width: { block: 'core/group', path: 'progress.missing', attr: 'style', repeat: null } } } }
  }, { 'test/progress': pattern }, () => null)
  assert.deepEqual(missing.unresolvedSeedResults, first.unresolvedSeedResults)
  assert.ok(missing.notes.some((note) => note.includes('block progress.missing not in pattern')))
  const unmappedTarget = renderAcm(instance, {
    types: { 'progress:style-1': { pattern: 'test/progress', fields: { width: { attr: 'style' } } } }
  }, { 'test/progress': pattern }, () => null)
  assert.deepEqual(unmappedTarget.unresolvedSeedResults, first.unresolvedSeedResults)
})

test('renderAcm early returns always include an empty unresolved result list', () => {
  const instance = { id: 'missing', type: 'progress', style: 'style-1', fields: {}, items: [] }
  assert.deepEqual(renderAcm(instance, { types: {} }, {}, () => null), {
    markup: null,
    notes: ['no pattern mapped for progress:style-1'],
    unresolvedSeedResults: []
  })
  assert.deepEqual(renderAcm(instance, { types: { 'progress:style-1': { pattern: 'test/progress', fields: {} } } }, {}, () => null), {
    markup: null,
    notes: ['pattern test/progress is not registered on the site'],
    unresolvedSeedResults: []
  })
})

test('seed report names style attr as unresolved and the repeat run settles at +0 ~0', async () => {
  const site = fakeSite()
  const root = scratch()
  const pattern = '<!-- wp:group {"metadata":{"name":"progress.bar"}} --><div class="wp-block-group"></div><!-- /wp:group -->'
  site.registeredPatterns = { 'wp-tracy-business/progress': pattern }
  try {
    const edit = (s) => {
      s['patterns.map'] = { types: { 'progress:style-1': { pattern: 'wp-tracy-business/progress', fields: { width: { block: 'core/group', path: 'progress.bar', attr: 'style', repeat: null } } } } }
      s.sections.acm.push({ id: 'progress-7', type: 'progress', style: 'style-1', position: 'main', published: true, scope: 'page', pages: [{ wpPath: '/' }], fields: { width: '72%' }, items: [] })
      s.content.pages[0].contentKind = 'sections'
      s.content.pages[0].content = [{ kind: 'slot', position: 'main', modules: ['progress-7'] }]
      s.content.pages[0].modules = ['progress-7']
    }
    const summary = []
    const first = await seedSpec(site, { root, edit, logs: summary })
    assert.deepEqual(first.unresolvedSeedResults, [{ page: '/', module: 'progress-7', kind: 'unsupported-style-attribute', section: 'progress-7', field: 'progress.width', sourceValue: '72%' }])
    const blockPage = site.page((p) => p.content.includes('wp:group'))
    assert.ok(blockPage?.content.includes(pattern), 'the pattern block stays unchanged')
    assert.ok(first.notes.some((n) => n.name === 'unsupported-style-attribute' && n.sourceValue === '72%'))
    assert.ok(summary.some((line) => /unresolved seed results 1/.test(line)), 'the run summary counts the unresolved result')
    const second = await seedSpec(site, { root, edit, n: 2 })
    assert.deepEqual(settled(second), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('planPostRows: several rows that name one article, or one row wanted by two posts, stop the plan', () => {
  const post = (id, slug, extra = {}) => ({ slug, title: `T${id}`, joomla: { articleId: String(id) }, ...extra })
  const rows = [{ ID: 1, post_name: 'a', post_title: 'x' }, { ID: 2, post_name: 'b', post_title: 'y' }]
  assert.throws(() => planPostRows([post(5, 'a')], rows, () => '5'), /several rows[^]*1[^]*2/)
  assert.throws(() => planPostRows([{ slug: 'a', title: 'P' }, { slug: 'a', title: 'Q' }], rows.slice(0, 1), () => null), /two posts of the spec/)
  assert.throws(() => planPostRows([post(5, 'a')], rows.slice(0, 1), () => null), /article 5[^]*slug a[^]*post 1[^]*no article identity/, 'a post with a source article id never takes a row without identity')
  const plan = planPostRows([post(5, 'z')], rows, (id) => (id === 2 ? '5' : null))
  assert.equal(plan.get([...plan.keys()][0]).ID, 2, 'the row that names the article is taken wherever it is')
})

test('fake site: `post_type=any` leaves attachments out, as WordPress does', () => {
  const site = fakeSite()
  site.posts.set(1, row(1, 'Story 1', 'story-1'))
  site.posts.set(2, { ...row(2, 'Pic', 'story-1-image'), post_type: 'attachment' })
  const list = (type) => JSON.parse(site.wp.run(['post', 'list', `--post_type=${type}`, '--post_status=any', '--fields=ID,post_name', '--format=json']).stdout).map((r) => r.ID)
  assert.deepEqual(list('any'), [1])
  assert.deepEqual(list('attachment'), [2])
})


test('#92-3 a changed set of articles never writes over the post of an article that left: the row is named and nothing is written', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(10), article(20)) })
    const before = [...site.posts.values()].filter((p) => p.post_type === 'post').map((p) => [p.ID, p.post_name, p.content])
    // Article 10 leaves the spec, article 5 arrives on the same alias; 20 stays.
    await assert.rejects(seedSpec(site, { root, edit: (s) => s.content.posts.push(article(5), article(20)), n: 2 }), /Story 5[^]*shared-story[^]*article 10/)
    assert.deepEqual([...site.posts.values()].filter((p) => p.post_type === 'post').map((p) => [p.ID, p.post_name, p.content]), before, 'no post was written')
    // The row trashed, the same spec seeds: article 5 gets its own post.
    const gone = [...site.posts.values()].find((p) => p.post_title === 'Story 10')
    gone.post_status = 'trash'
    await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(5), article(20)), n: 3 })
    const live = [...site.posts.values()].filter((p) => p.post_type === 'post' && p.post_status !== 'trash')
    assert.deepEqual(live.map((p) => p.post_title).sort(), ['Story 20', 'Story 5'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-3 a group that shrinks to one new article never writes over the post of an article that left: the row is named and nothing is written', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(10), article(20)) })
    const before = [...site.posts.values()].filter((p) => p.post_type === 'post').map((p) => [p.ID, p.post_name, p.content])
    // Both leave; article 5 alone takes the alias, so there is no group any more.
    await assert.rejects(seedSpec(site, { root, edit: (s) => s.content.posts.push(article(5)), n: 2 }), /Story 5[^]*shared-story[^]*article 10/)
    assert.deepEqual([...site.posts.values()].filter((p) => p.post_type === 'post').map((p) => [p.ID, p.post_name, p.content]), before, 'no post was written')
    // An article that stays alone keeps its own row (the meta names it), whatever the group was.
    const alone = await seedSpec(site, { root, edit: (s) => s.content.posts.push(article(10)), n: 3 })
    assert.equal(alone.counts.posts.created, 0)
    assert.equal([...site.posts.values()].filter((p) => p.post_type === 'post' && p.post_title === 'Story 10').length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-3 two distinct articles with one alias AND one title seed twice: the same ids and names, +0 ~0 the second time', async () => {
  const site = fakeSite()
  const edit = (s) => s.content.posts.push(article(10, { title: 'Same title' }), article(20, { title: 'Same title' }))
  const { second } = await twice(site, edit)
  const posts = [...site.posts.values()].filter((p) => p.post_type === 'post')
  assert.deepEqual(posts.map((p) => p.post_name).sort(), ['shared-story', 'shared-story-20'])
  assert.deepEqual(settled(second), [])
  assert.equal(posts.length, 2)
  // and again, in the other order of the spec
  const reversed = await seedSpec(site, { edit: (s) => s.content.posts.push(article(20, { title: 'Same title' }), article(10, { title: 'Same title' })), n: 9 })
  assert.deepEqual(settled(reversed), [])
})

test('#92-3 the same alias in two locales is one slug space, with or without Polylang: two posts, two names, a repeat run changes nothing', async () => {
  const site = fakeSite()
  const { second } = await twice(site, (s) => {
    s.content.posts.push(article(10, { locale: 'en' }), article(20, { locale: 'ru' }))
  })
  assert.deepEqual([...site.posts.values()].filter((p) => p.post_type === 'post').map((p) => p.post_name).sort(), ['shared-story', 'shared-story-20'])
  assert.deepEqual(settled(second), [])
})

test('#92-3 under Polylang the same alias in two languages is still one slug: two posts, two names, a repeat run changes nothing', async () => {
  const site = fakeSite({ languages: [{ slug: 'en', locale: 'en_US', name: 'EN' }, { slug: 'ru', locale: 'ru_RU', name: 'RU' }] })
  site.defaultLang = 'en'
  const { second } = await twice(site, (s) => {
    s['page-map'].locales = ['en', 'ru']
    s.content.site.locales = ['en', 'ru']
    s.content.posts.push(article(10, { locale: 'en' }), article(20, { locale: 'ru' }))
  }, ['--i18n', 'polylang'])
  assert.deepEqual([...site.posts.values()].filter((p) => p.post_type === 'post').map((p) => p.post_name).sort(), ['shared-story', 'shared-story-20'])
  assert.deepEqual(settled(second), [])
})

// ── 4. A single view the theme serves at its path ───────────────────────────────────────────────
test('singleViewRules: a map that serves the single view at its own path writes no rule; without it the rule is as before', () => {
  const posts = [{ slug: 'first', joomla: { articleId: '76' } }]
  const urls = new Map([['first', '/first/']])
  const pages = [{ view: 'single', path: '/blog/detail' }]
  const notes = []
  assert.deepEqual(singleViewRules(pages, posts, urls, [], notes, { single: { servedAtPath: true } }), [])
  assert.equal(notes.length, 0)
  assert.deepEqual(singleViewRules(pages, posts, urls, [], [], { search: { servedAtPath: true } }).map((r) => r.from), ['/blog/detail'])
  assert.deepEqual(singleViewRules(pages, posts, urls, []).map((r) => r.from), ['/blog/detail'])
})

test('#92-4 single view served at its path: no recorded rule, no 301 expectation — the route is probed for 200 and passes', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    const edit = (s) => {
      s.content.posts.push(article(10))
      s['page-map'].pages.push({ file: 'd.html', path: '/blog/detail', slug: 'detail', title: 'Detail', view: 'single' })
      s['patterns.map'].views = { single: { servedAtPath: true } }
    }
    const report = await seedSpec(site, { root, edit })
    assert.equal(report.redirects.some((r) => r.from === '/blog/detail'), false)
    const probes = report.routes.filter((r) => r.path === '/blog/detail')
    assert.deepEqual(probes.map((r) => [r.expect, r.ok]), [[200, true]], 'one probe, for 200')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── 5. A menu item on a draft page ──────────────────────────────────────────────────────────────
test('buildNavigation: a page that is not public is a custom link, not a post-type link WordPress would drop', () => {
  const pages = new Map()
  const asked = []
  const nav = buildNavigation(
    [{ label: 'Secret', url: '/secret', published: true, children: [{ label: 'Inner', url: '/inner', published: true, children: [] }] }],
    (url) => (url === '/secret' ? { id: 7, url: '/secret/', status: 'draft' } : { id: 8, url: '/inner/', status: 'publish' }),
    pages,
    (item, status) => asked.push([item.label, status])
  )
  assert.doesNotMatch(nav, /"id":7/)
  assert.match(nav, /"label":"Secret","url":"\/secret","kind":"custom"/)
  assert.match(nav, /"label":"Inner","type":"page","id":8/, 'a published child stays a page link')
  assert.deepEqual(asked, [['Secret', 'draft']])
})

test('#92-5 menu item on a draft page: kept as a custom link, the page stays a draft, the report names menu, item and status', async () => {
  const site = fakeSite()
  const { first, second } = await twice(site, (s) => {
    s['page-map'].pages.push({ file: 'secret.html', path: '/secret', slug: 'secret', title: 'Secret', view: 'page' })
    s.content.pages.push({ file: 'secret.html', path: '/secret', slug: 'secret', title: 'Secret', view: 'page', parent: null, status: 'draft', content: body('Secret'), meta: {}, images: [] })
    s.menus.menus = [{ menutype: 'main', title: 'Main', items: [{ label: 'Secret', url: '/secret', published: true, children: [] }, { label: 'About', url: '/about-us', published: true, children: [] }] }]
  })
  const draft = site.page((p) => p.post_name === 'secret')
  const nav = [...site.posts.values()].find((p) => p.post_type === 'wp_navigation' && p.post_name === 'main')
  assert.equal(draft.post_status, 'draft', 'no page is published to save a menu item')
  assert.ok(!nav.content.includes(`"id":${draft.ID}`))
  assert.match(nav.content, /"label":"Secret","url":"\/secret","kind":"custom"/)
  assert.match(nav.content, /"label":"About","type":"page"/)
  assert.ok(first.notes.some((n) => /main/.test(n.menu ?? '') && /Secret/.test(n.note) && /draft/.test(n.note)), 'the note names the menu, the item and the status')
  assert.deepEqual(settled(second), [])
})

// ── 6. An attachment on a route's slug that is reused ────────────────────────────────────────────
const withImage = (s) => {
  s.content.pages[1].content += '<img src="/wp-content/uploads/about-us.jpg" alt="">'
  s.content.pages[1].images = [{ src: '/wp-content/uploads/about-us.jpg', file: 'about-us.jpg', original: 'images/about-us.jpg', alt: '' }]
}

test('#92-6 a reused attachment on a route slug is renamed like a new one; the repeat run neither imports nor renames again', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: withImage })
    const att = [...site.posts.values()].find((p) => p.post_type === 'attachment')
    // The state an earlier seeder left: the attachment holds the page's slug.
    att.post_name = 'about-us'
    const second = await seedSpec(site, { root, edit: withImage, n: 2 })
    assert.equal(site.posts.get(att.ID).post_name, 'about-us-image')
    assert.equal([...site.posts.values()].filter((p) => p.post_type === 'attachment').length, 1, 'nothing is imported again')
    assert.equal(second.mediaRoutes.ok, true)
    assert.ok(second.notes.some((n) => /attachment \d+ took the slug "about-us"/.test(n.note ?? '') && /renamed "about-us-image"/.test(n.note)))
    const renames = site.calls.filter((c) => c[0] === 'post' && c[1] === 'update' && c.includes('--post_name=about-us-image')).length
    const third = await seedSpec(site, { root, edit: withImage, n: 3 })
    assert.equal(site.calls.filter((c) => c[0] === 'post' && c[1] === 'update' && c.includes('--post_name=about-us-image')).length, renames, 'no second rename')
    assert.equal(third.mediaRoutes.ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-6 a reused attachment on /404 is refused with the exact rename; an attachment outside the index is named the same way', async () => {
  const site = fakeSite()
  site.attachmentName = (file) => (file.endsWith('/404.png') ? '404' : null)
  const root = scratch()
  try {
    const edit = (s) => {
      s['page-map'].pages.push({ file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404' })
      s.content.pages.push({ file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404', parent: null, status: 'draft', content: body('Gone'), meta: {}, images: [] })
      s.content.pages[1].content += '<img src="/wp-content/uploads/404.png" alt="">'
      s.content.pages[1].images = [{ src: '/wp-content/uploads/404.png', file: '404.png', original: 'images/404.png', alt: '' }]
    }
    await seedSpec(site, { root, edit })
    const second = await seedSpec(site, { root, edit, n: 2 })
    const att = [...site.posts.values()].find((p) => p.post_type === 'attachment')
    assert.equal(second.mediaRoutes.ok, false, 'a route that is shadowed is not a clean seed')
    assert.deepEqual(second.mediaRoutes.fix, [`wp post update ${att.ID} --post_name=404-image`])
    assert.ok(second.notes.some((n) => /404-image/.test(n.note ?? '') && new RegExp(`attachment ${att.ID}`).test(n.note)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-6 the name an attachment is renamed to is free: not a route, not held by another post; the report names what the site confirmed', async () => {
  const site = fakeSite()
  const root = scratch()
  try {
    await seedSpec(site, { root, edit: withImage })
    const att = [...site.posts.values()].find((p) => p.post_type === 'attachment')
    att.post_name = 'about-us'
    // `about-us-image` is held by a post, `about-us-image-2` is a route of the spec, `about-us-image-3` is another attachment's.
    site.posts.set(952, { ID: 952, post_type: 'attachment', post_title: 'Other', post_name: 'about-us-image-3', post_status: 'inherit', post_parent: 0, content: '', meta: {} })
    site.posts.set(950, { ID: 950, post_type: 'post', post_title: 'Held', post_name: 'about-us-image', post_status: 'publish', post_parent: 0, content: '', meta: {} })
    const edit = (s) => {
      withImage(s)
      s['page-map'].pages.push({ file: 'x.html', path: '/about-us-image-2', slug: 'about-us-image-2', title: 'X', view: 'page' })
      s.content.pages.push({ file: 'x.html', path: '/about-us-image-2', slug: 'about-us-image-2', title: 'X', view: 'page', parent: null, status: 'publish', content: body('X'), meta: {}, images: [] })
    }
    const second = await seedSpec(site, { root, edit, n: 2 })
    assert.equal(site.posts.get(att.ID).post_name, 'about-us-image-4')
    assert.equal(second.mediaRoutes.ok, true)
    assert.ok(second.notes.some((n) => /renamed "about-us-image-4"/.test(n.note ?? '')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('#92-6 a rename the site did not take stops the seed; the fix for a collision names a free slug', async () => {
  const stuck = fakeSite()
  const root = scratch()
  try {
    await seedSpec(stuck, { root, edit: withImage })
    const att = [...stuck.posts.values()].find((p) => p.post_type === 'attachment')
    att.post_name = 'about-us'
    const run = stuck.wp.run
    stuck.wp.run = (args, opts) => (args[0] === 'post' && args[1] === 'update' && args.some((a) => a.startsWith('--post_name=')) ? { code: 0, stdout: '', stderr: '' } : run(args, opts))
    await assert.rejects(seedSpec(stuck, { root, edit: withImage, n: 2 }), /attachment \d+[^]*about-us-image[^]*about-us/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  const site = fakeSite()
  site.attachmentName = (file) => (file.endsWith('/404.png') ? '404' : null)
  const root2 = scratch()
  try {
    site.posts.set(951, { ID: 951, post_type: 'page', post_title: 'Held', post_name: '404-image', post_status: 'publish', post_parent: 0, content: '', meta: {} })
    const edit = (s) => {
      s['page-map'].pages.push({ file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404' })
      s.content.pages.push({ file: '404.html', path: '/404', slug: '404', title: 'Not found', view: '404', parent: null, status: 'draft', content: body('Gone'), meta: {}, images: [] })
      s.content.pages[1].content += '<img src="/wp-content/uploads/404.png" alt="">'
      s.content.pages[1].images = [{ src: '/wp-content/uploads/404.png', file: '404.png', original: 'images/404.png', alt: '' }]
    }
    const report = await seedSpec(site, { root: root2, edit })
    const att = [...site.posts.values()].find((p) => p.post_type === 'attachment')
    assert.deepEqual(report.mediaRoutes.fix, [`wp post update ${att.ID} --post_name=404-image-2`])
  } finally {
    rmSync(root2, { recursive: true, force: true })
  }
})

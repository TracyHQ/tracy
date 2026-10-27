import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createAgentDemoInventory,
  compareAgentInventory,
  expandPatterns,
  picturesWhere
} from '../src/sites/agent-demo-inventory.js'
import { topBlocks } from '../../../packages/tools/tracy-site-tools/src/host/wp-blocks.mjs'

// Levain: no collected logo, so the native site title occupies one of the two brand slots.
test('a no-logo WordPress header may use its site title in the same frozen brand slot only', () => {
  const logo = '<!-- wp:site-logo {"className":"jr-logo jr-logo--light"} /-->'
  const title = '<!-- wp:site-title {"level":0} /-->'
  const body = `<!-- wp:group {"className":"logo"} --><div class="wp-block-group logo">${logo}${logo}<!-- wp:paragraph --><p>Bakery</p><!-- /wp:paragraph --></div><!-- /wp:group -->`
  const inventory = (content, key = 'header') => ({
    complete: true,
    records: [
      {
        key: `templatePart/${key}`,
        identity: { kind: 'templatePart', key },
        publication: { status: 'publish' },
        routes: [],
        relations: {},
        data: { content },
        editorialFields: ['content']
      }
    ]
  })
  const before = inventory(body)
  const after = inventory(body.replace(logo, title))
  const policy = { allowWordPressSiteTitle: true }
  assert.equal(compareAgentInventory(before, after).pass, false)
  const allowed = compareAgentInventory(before, after, policy)
  assert.equal(allowed.pass, true)
  assert.deepEqual(allowed.brandFallbacks, [
    { record: 'templatePart/header', field: 'content', path: [0, 0] }
  ])
  assert.equal(compareAgentInventory(before, after, { allowWordPressSiteTitle: false }).pass, false)
  for (const changed of [
    body.replace(logo, logo + title),
    body.replace(logo, ''),
    body.replace(logo, title).replace('class="wp-block-group logo"', 'class="wp-block-group other"'),
    body.replace(logo, title).replace('wp:paragraph', 'wp:heading'),
    body.replace(logo, '<!-- wp:paragraph --><p>Bakery</p><!-- /wp:paragraph -->'),
    body.replace(logo, title).replace('"className":"logo"', '"className":"other"')
  ])
    assert.equal(compareAgentInventory(before, inventory(changed), policy).pass, false)
  assert.equal(
    compareAgentInventory(inventory(body, 'sidebar'), inventory(body.replace(logo, title), 'sidebar'), policy)
      .pass,
    false
  )
  const outside = body.replace('"className":"logo"', '"className":"content"')
  assert.equal(
    compareAgentInventory(inventory(outside), inventory(outside.replace(logo, title)), policy).pass,
    false
  )
  assert.equal(compareAgentInventory(after, before, policy).pass, false)
  assert.equal(before.records[0].data.content, body)
  assert.equal(after.records[0].data.content, body.replace(logo, title))
})

function php(
  platform = 'joomla',
  { missingRelations = false, repeatPage = false, parts = [], dump = null } = {}
) {
  const calls = []
  const rows = Array.from({ length: platform === 'joomla' ? 101 : 2 }, (_, i) => ({
    id: i + 1,
    state: i % 2,
    url: `https://site.test/item-${i + 1}`
  }))
  const read = createAgentDemoInventory({
    siteReader: async () => ({
      base: 'https://site.test',
      text: async () => JSON.stringify({ post: { rest_base: 'posts' } })
    }),
    checkGrant: async () => {},
    siteAccess: async () => {
      throw Error('not EmDash')
    },
    applyFor:
      () =>
      async ({ action, params }) => {
        calls.push({ action, params })
        assert.ok(['content.list', 'content.get', 'db.tables', 'db.dump'].includes(action))
        if (action === 'db.tables')
          return { tables: missingRelations ? [] : ['native_posts', 'native_term_relationships'] }
        if (action === 'db.dump')
          return {
            sql_b64: Buffer.from(dump?.sql ?? 'INSERT custom taxonomy edge').toString('base64'),
            rows: dump?.rows ?? 1,
            total: dump?.rows ?? 1,
            done: true
          }
        if (action === 'content.list')
          return {
            items:
              params.kind === (platform === 'joomla' ? 'module' : 'post')
                ? rows.slice(repeatPage ? 0 : params.offset, (repeatPage ? 0 : params.offset) + params.limit)
                : params.kind === 'templatePart' && params.offset === 0
                  ? parts.map(({ key }) => ({ key }))
                  : []
          }
        if (params.kind === 'templatePart') return { item: parts.find((p) => p.key === params.key)?.item }
        if (params.kind === 'option') return { item: { key: params.key, value: 'Template text' } }
        if (params.kind === 'moduleAssignment') return { item: { module_id: params.id, menu_ids: [3, 9] } }
        if (params.kind === 'post')
          return {
            item: {
              id: params.id,
              post_status: params.id === 1 ? 'publish' : 'draft',
              post_title: 'Old title',
              post_content: '<div class="cards"><img src="old.jpg"><p>Old copy</p></div>',
              post_parent: 0,
              ...(!missingRelations ? { post_category: [3, 9], tags_input: [] } : {})
            }
          }
        return {
          item: {
            id: params.id,
            published: params.id % 2,
            title: 'Old title',
            content: '<div class="cards"><img src="old.jpg"><p>Old copy</p></div>',
            params: JSON.stringify({ cards: [{ _rowId: 'stable', heading: 'Old heading' }] })
          }
        }
      }
  })
  return { read, calls, site: { site_key: 'site.test', platform } }
}

test('Joomla inventory pages beyond100 and retains unpublished modules plus native menu assignments', async () => {
  const { read, calls, site } = php()
  const before = await read({ site, email: 'owner@test' })
  assert.equal(before.complete, true)
  const reorder = (value) =>
    Array.isArray(value)
      ? value.map(reorder)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .reverse()
              .map(([k, v]) => [k, reorder(v)])
          )
        : value
  assert.equal(compareAgentInventory(before, reorder(before)).pass, true)
  assert.equal(before.records.length, 101)
  assert.ok(calls.some((call) => call.params.kind === 'module' && call.params.offset === 100))
  assert.equal(before.records[1].publication.status, 0)
  assert.deepEqual(before.records[0].relations.moduleAssignment.menu_ids, [3, 9])
  const changed = structuredClone(before)
  changed.records[0].data.title = 'New title'
  changed.records[0].data.content = '<div class="cards"><img src="new.jpg"><p>New copy</p></div>'
  assert.equal(compareAgentInventory(before, changed).pass, true)
  for (const mutate of [
    (r) => {
      r.publication.status = 0
    },
    (r) => {
      r.relations.moduleAssignment.menu_ids = [3]
    },
    (r) => {
      r.data.params.cards.push({ _rowId: 'new', heading: 'New' })
    },
    (r) => {
      r.data.params.cards[0]._rowId = 'changed'
    },
    (r) => {
      r.routes = ['/other']
    }
  ]) {
    const after = structuredClone(before)
    mutate(after.records[0])
    const verdict = compareAgentInventory(before, after)
    assert.equal(verdict.pass, false)
    // the failure names the record and the part that moved, so the build can put it back
    const named = verdict.detail.find((d) => d.record)
    assert.equal(named?.record, before.records[0].key, JSON.stringify(verdict.detail))
    assert.ok(['publication', 'relations', 'shape', 'routes'].includes(named.part), JSON.stringify(named))
  }
  const fewer = structuredClone(before)
  const gone = fewer.records.pop()
  assert.deepEqual(
    compareAgentInventory(before, fewer).detail.find((d) => d.record),
    { record: gone.key, problem: 'missing' }
  )
})

test('native repeated pagination is refused rather than counted as complete', async () => {
  const { read, site } = php('joomla', { repeatPage: true })
  await assert.rejects(read({ site, email: 'owner@test' }), /PAGINATION_REQUIRED/)
})

test('WordPress snapshots all native post statuses and detects unavailable term edges explicitly', async () => {
  const supported = php('wordpress')
  const inventory = await supported.read({ site: supported.site, email: 'owner@test' })
  assert.equal(inventory.complete, true)
  assert.deepEqual(
    inventory.records.filter((r) => r.identity.kind === 'post').map((r) => r.publication.status),
    ['publish', 'draft']
  )
  assert.deepEqual(inventory.records[0].relations.post_category, [3, 9])
  const missing = php('wordpress', { missingRelations: true })
  await assert.rejects(missing.read({ site: missing.site, email: 'owner@test' }), /INVENTORY_UNAVAILABLE/)
})

// Local round 31, 25/10/2026 (Levain, WordPress): the build wrote the sidebar part for its heading; WordPress filed the
// stored part under the theme and an area (36 → 38 rows) and its theme file gave way to the stored row.
test('WordPress: a template part the build stores is the same part, and the rows WordPress files it under are not the site’s relations', async () => {
  const sql = (tuples) =>
    `INSERT INTO \`native_term_relationships\` VALUES ${tuples.map((t) => `(${t.map((v) => `'${v}'`).join(',')})`).join(',')};\n`
  const posts = [
    [1, 3, 0],
    [1, 9, 0],
    [2, 3, 0]
  ]
  const read = (stored, extra = []) => {
    const all = [...posts, ...extra]
    const part = stored
      ? { id: stored, title: 'sidebar', content: '<!-- wp:pattern {"slug":"t/part-sidebar"} /-->' }
      : {
          id: 0,
          title: 'sidebar',
          content: '<!-- wp:pattern {"slug":"t/part-sidebar"} /-->',
          source: 'theme',
          file: 'wp-content/themes/t/parts/sidebar.html'
        }
    const f = php('wordpress', {
      parts: [{ key: 'sidebar', item: part }],
      dump: { sql: sql(all), rows: all.length }
    })
    return f.read({ site: f.site, email: 'owner@test' })
  }
  const before = await read(0)
  const rows = (inventory) => inventory.records.find((r) => r.identity.kind === 'taxonomyRelations').relations
  assert.equal(rows(before).own.rows, 3)
  const written = await read(511, [
    [511, 20, 0],
    [511, 21, 0]
  ])
  assert.equal(rows(written).rows, 5)
  const verdict = compareAgentInventory(before, written)
  assert.equal(verdict.pass, true, JSON.stringify(verdict.detail))
  // A post filed under one more category is still a changed relation.
  const filed = await read(511, [
    [511, 20, 0],
    [511, 21, 0],
    [2, 9, 0]
  ])
  assert.equal(compareAgentInventory(before, filed).pass, false)
  // A starting inventory read before the site's own rows were told apart is compared by every row, as it was read.
  const asRead = structuredClone(before)
  delete rows(asRead).own
  assert.equal(compareAgentInventory(asRead, await read(0)).pass, true)
  assert.equal(compareAgentInventory(asRead, written).pass, false)
  // A dump whose rows do not all parse tells nothing apart.
  const odd = php('wordpress', { dump: { sql: 'INSERT custom taxonomy edge', rows: 1 } })
  assert.equal(rows(await odd.read({ site: odd.site, email: 'owner@test' })).own, undefined)
})

function emdash({ trash = false } = {}) {
  const urls = []
  const all = [
    { id: 'a', slug: 'home', locale: 'en', status: 'published' },
    { id: 'b', slug: 'home', locale: 'vi', status: 'draft' },
    { id: 'outside-seed', slug: 'extra', locale: 'en', status: 'archived' }
  ]
  const read = createAgentDemoInventory({
    checkGrant: async () => {},
    siteReader: async () => null,
    applyFor: () => {
      throw Error('no PHP')
    },
    siteAccess: async () => ({ origin: 'https://native.test', token: 'private-test-token' }),
    fetchImpl: async (url, init) => {
      assert.equal(init.method, 'GET')
      urls.push(String(url))
      const u = new URL(url),
        p = u.pathname
      let data
      if (p === '/_emdash/api/schema/collections')
        data = { items: [{ slug: 'pages', urlPattern: '/{slug}' }] }
      else if (p === '/_emdash/api/schema/collections/pages')
        data = {
          item: {
            fields: [
              { slug: 'body', type: 'text' },
              { slug: 'related', type: 'reference', validation: { relation: 'related' } }
            ]
          }
        }
      else if (p === '/_emdash/api/content/pages/trash')
        data = {
          items: trash
            ? [{ id: 'trash', slug: 'trashed', locale: 'en', status: 'draft', data: { body: 'Trash' } }]
            : []
        }
      else if (p === '/_emdash/api/content/pages')
        data = {
          items: u.searchParams.has('cursor') ? all.slice(2) : all.slice(0, 2),
          ...(!u.searchParams.has('cursor') ? { nextCursor: 'second' } : {})
        }
      else if (p.startsWith('/_emdash/api/content/pages/')) {
        const item = all.find((row) => p.endsWith('/' + row.id))
        data = { item: { ...item, liveData: { body: 'Old text' }, references: { related: ['a'] } } }
      } else if (p === '/_emdash/api/menus') data = [{ id: 'menu', name: 'main', locale: 'en' }]
      else if (p === '/_emdash/api/menus/main')
        data = {
          id: 'menu',
          name: 'main',
          locale: 'en',
          items: [{ id: 'link', parentId: null, contentId: 'a', url: '/home', position: 0, label: 'Home' }]
        }
      else throw Error(p)
      return Response.json({ success: true, data })
    }
  })
  return { read, urls, site: { site_key: 'site.test', platform: 'emdash' } }
}

test('EmDash discovers live collections and cursor pages, all locales/statuses, extra entries and menu relations', async () => {
  const { read, site, urls } = emdash()
  const before = await read({ site, email: 'owner@test' })
  assert.equal(before.complete, true)
  assert.equal(before.records.length, 4)
  assert.ok(before.records.some((row) => row.identity.id === 'outside-seed'))
  assert.ok(before.records.some((row) => row.identity.locale === 'vi' && row.publication.status === 'draft'))
  assert.ok(urls.some((url) => url.includes('cursor=second')))
  assert.ok(urls.some((url) => url.includes('status=all')))
  const after = structuredClone(before)
  after.records[0].relations.related = ['outside-seed']
  assert.equal(compareAgentInventory(before, after).pass, false)
})

test('EmDash trash endpoint missing storageless edges is an explicit capability gap', async () => {
  const { read, site } = emdash({ trash: true })
  const inventory = await read({ site, email: 'owner@test' })
  assert.equal(inventory.complete, false)
  assert.ok(inventory.coverage.some((row) => row.reason === 'trash-api-omits-storageless-reference-edges'))
})

// Pilot 24/10/2026: a JA module's settings are one JSON string, its picture `…jpg#joomlaImage://…`; changing the hero
// photo and words read as a changed structure.
test('a module config held as JSON keeps its structure when the build changes its photo and words', () => {
  const record = (image, title, items = 2) => ({
    key: 'module/112',
    identity: { kind: 'module', id: 112 },
    publication: { published: 1 },
    routes: [],
    relations: {},
    editorialFields: ['title', 'content', 'params'],
    data: {
      title: 'Hero',
      params: {
        'jatools-config': JSON.stringify({
          ':type': 'ja_fresco:hero',
          hero: {
            'hero[image-decor]': [image],
            'hero[title]': [title],
            'hero[items]': Array.from({ length: items }, (_, i) => `Item ${i}`)
          }
        })
      }
    }
  })
  const inventory = (r) => ({ complete: true, records: [r] })
  const before = inventory(
    record(
      'images/joomlart/hero/item-1.jpg#joomlaImage://local-images/joomlart/hero/item-1.jpg?width=1920&height=1080',
      'Restaurant & Fresco'
    )
  )
  assert.equal(
    compareAgentInventory(before, inventory(record('images/tracy-content/ab12.jpg', 'Death & Co'))).pass,
    true
  )
  assert.equal(
    compareAgentInventory(before, inventory(record('images/tracy-content/ab12.jpg', 'Death & Co', 3))).pass,
    false
  )
})

// Dev 24/10/2026: a dental build's only failing check was three serialisations and a real link.
test('a link made real, a pasted comment gone and a void tag closed another way keep the structure', () => {
  const record = (link, html) => ({
    key: 'module/131',
    identity: { kind: 'module', id: 131 },
    publication: { published: 1 },
    routes: [],
    relations: {},
    editorialFields: ['title', 'content', 'params'],
    data: {
      title: 'Social',
      content: html,
      params: {
        'jatools-config': JSON.stringify({
          social: { 'social-intro[link]': [link], 'social-intro[title]': ['Facebook'] }
        })
      }
    }
  })
  const inventory = (r) => ({ complete: true, records: [r] })
  const before = inventory(
    record('#', '<p>Call us</p>\r\n<p><!--(figmeta)abc--></p><p><img src="a.png" alt="Logo" /></p>')
  )
  const after = inventory(
    record('https://www.facebook.com/place', '<p>Call us</p>\r\n<p></p><p><img src="b.jpg" alt="Elite"></p>')
  )
  assert.equal(
    compareAgentInventory(before, after).pass,
    true,
    JSON.stringify(compareAgentInventory(before, after).detail)
  )
  const moreParagraphs = inventory(
    record('#', '<p>Call us</p><p>Two</p><p>Three</p><p><img src="a.png" alt="Logo"></p>')
  )
  assert.equal(compareAgentInventory(before, moreParagraphs).pass, false)
})

// Local stand 24/10/2026: a tagline the template left empty and the build wrote read as a changed structure.
test('an empty editorial field the build fills keeps the structure; a technical one changed does not', () => {
  const record = (value, layout) => ({
    key: 'option/blogdescription',
    identity: { kind: 'option', id: 'blogdescription' },
    publication: {},
    routes: [],
    relations: {},
    editorialFields: ['value'],
    data: { value, layout }
  })
  const inventory = (r) => ({ complete: true, records: [r] })
  assert.equal(
    compareAgentInventory(
      inventory(record('', 'a')),
      inventory(record('Modern Italian in the West Village', 'a'))
    ).pass,
    true
  )
  assert.equal(compareAgentInventory(inventory(record('', 'a')), inventory(record('', 'b'))).pass, false)
})

// David 24/10/2026: the template's showcase pages are kept and made the business's — named and addressed anew.
test('a showcase page and its menu entry may be renamed and readdressed; removing one or moving another still fails', () => {
  const inventory = (records) => ({ complete: true, records })
  const nav = (links) => ({
    key: 'post/133',
    identity: { kind: 'post', id: 133 },
    publication: {},
    routes: [],
    relations: {},
    editorialFields: [],
    data: {
      post_type: 'wp_navigation',
      post_content: links
        .map(
          (l) =>
            `<!-- wp:navigation-link ${JSON.stringify({ label: l[0], type: 'page', id: l[1], url: l[2], kind: 'post-type' })} /-->`
        )
        .join('\n')
    }
  })
  const page = (id, route, title) => ({
    key: `post/${id}`,
    identity: { kind: 'post', id },
    publication: { status: 'publish' },
    routes: [route],
    relations: {},
    editorialFields: ['post_title'],
    data: { post_type: 'page', post_name: route.replaceAll('/', ''), post_title: title }
  })
  const before = inventory([
    nav([
      ['Menu', 98, 'http://x.test/menu/'],
      ['Blue Color', 150, 'http://x.test/explore/themes/blue-color/']
    ]),
    page(98, '/menu/', 'Menu'),
    page(150, '/explore/themes/blue-color/', 'Blue Color')
  ])
  const adapted = inventory([
    nav([
      ['Menu', 98, 'http://x.test/menu/'],
      ['Catering', 150, 'http://x.test/catering/']
    ]),
    page(98, '/menu/', 'Menu'),
    page(150, '/catering/', 'Catering')
  ])
  assert.equal(
    compareAgentInventory(before, adapted).pass,
    true,
    JSON.stringify(compareAgentInventory(before, adapted).detail)
  )
  const removed = inventory([
    nav([['Menu', 98, 'http://x.test/menu/']]),
    page(98, '/menu/', 'Menu'),
    page(150, '/explore/themes/blue-color/', 'Blue Color')
  ])
  assert.equal(compareAgentInventory(before, removed).pass, false)
  const moved = inventory([
    nav([
      ['Menu', 98, 'http://x.test/our-menu/'],
      ['Catering', 150, 'http://x.test/catering/']
    ]),
    page(98, '/our-menu/', 'Menu'),
    page(150, '/catering/', 'Catering')
  ])
  assert.equal(compareAgentInventory(before, moved).pass, false)
})

test('a Joomla showcase menu item may be renamed; unpublishing it still fails', () => {
  const item = (title, path, published = 1) => ({
    key: 'menuItem/120',
    identity: { kind: 'menuItem', id: 120 },
    publication: { published },
    routes: [],
    relations: {},
    editorialFields: ['title'],
    data: {
      id: 120,
      parent_id: 102,
      level: 2,
      type: 'component',
      title,
      path,
      alias: path.split('/').at(-1),
      link: 'index.php?option=com_users&view=login',
      published
    }
  })
  const inventory = (r) => ({ complete: true, records: [r] })
  const before = inventory(item('Login', 'pages/user-page/login'))
  assert.equal(
    compareAgentInventory(before, inventory(item('Patient sign-in', 'pages/patient-sign-in'))).pass,
    true
  )
  assert.equal(
    compareAgentInventory(before, inventory(item('Login', 'pages/user-page/login', 0))).pass,
    false
  )
})

// Local stand 24/10/2026, an EmDash bakery: a related project renamed, a label rewritten, a menu written again.
test('EmDash: a relation renamed, a label–value row relabelled and a menu written again keep the structure', () => {
  const inventory = (records) => ({ complete: true, records })
  const home = (title) => ({
    key: 'home/1@en',
    identity: { collection: 'home', id: '1' },
    publication: {},
    routes: ['/'],
    relations: { project_big: { children: [{ id: 'p1', slug: 'p-one', title, collection: 'projects' }] } },
    editorialFields: ['quote'],
    data: { quote: [{ key: title.startsWith('E') ? 'Share price' : 'Phone', value: 'x', _rowId: 'r1' }] }
  })
  const menu = (ids, labels) => ({
    key: 'menu/m1@en',
    identity: { collection: 'menu', id: 'm1' },
    publication: {},
    routes: [],
    relations: ids.map((id) => ({ id, url: null, parentId: null, contentId: null })),
    editorialFields: ['label', 'items'],
    data: {
      id: 'm1',
      name: 'main',
      items: ids.map((id, i) => ({ id, type: 'custom', label: labels[i], parentId: null }))
    }
  })
  const before = inventory([home('Elektra plant'), menu(['a', 'b'], ['About', 'News'])])
  const after = inventory([home('Kouign amann'), menu(['x', 'y'], ['Our story', 'Journal'])])
  assert.equal(
    compareAgentInventory(before, after).pass,
    true,
    JSON.stringify(compareAgentInventory(before, after).detail)
  )
  assert.equal(
    compareAgentInventory(before, inventory([home('Kouign amann'), menu(['x'], ['Our story'])])).pass,
    false
  )
})

test('a long field that changed is shown where it parts', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/1',
        identity: { kind: 'post', id: 1 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { post_content: content }
      }
    ]
  })
  const head = `<div class="masthead">${'x'.repeat(300)}`
  const r = compareAgentInventory(page(`${head}<div class="a"></div>`), page(`${head}<div class="b"></div>`))
  const d = r.detail.find((x) => x.record === 'post/1')
  assert.equal(r.pass, false)
  assert.match(d.was, /class=\\"a\\"/)
  assert.match(d.now, /class=\\"b\\"/)
})

// Local stand 24/10/2026, an EmDash bakery: empty legal pages filled, a page body rewritten (new Portable Text keys),
// a report dated anew — all copy; a block's own field changed is still structure.
test('EmDash: an empty body filled, a rich-text body rewritten and a date changed keep the structure', () => {
  const page = (content, date) => ({
    complete: true,
    records: [
      {
        key: 'pages/p1@en',
        identity: { collection: 'pages', id: 'p1' },
        publication: {},
        routes: ['/privacy'],
        relations: {},
        editorialFields: ['title', 'content', 'reports'],
        data: { title: 'Privacy', content, reports: [{ date, title: 'Q1', _rowId: 'r1' }], layout: 'narrow' }
      }
    ]
  })
  const block = (key, text) => ({
    _type: 'block',
    _key: key,
    style: 'normal',
    children: [{ _type: 'span', text }]
  })
  const compare = (a, b) => compareAgentInventory(a, b)
  assert.equal(
    compare(page([], '28 Mar 2026'), page([block('a', 'We keep'), block('b', 'your data')], '24 Oct 2026'))
      .pass,
    true
  )
  assert.equal(
    compare(page([block('k2t', 'Old')], 'x'), page([block('kee', 'New'), block('kef', 'More')], 'x')).pass,
    true
  )
  const moved = page([], 'x')
  moved.records[0].data.layout = 'wide'
  assert.equal(compare(page([], 'x'), moved).pass, false)
})

// Local stand 24/10/2026, a dental practice on Joomla: a contact's link relabelled "facebook" → "Facebook".
test('Joomla: a contact link relabelled keeps the structure; its address removed does not', () => {
  const contact = (params) => ({
    complete: true,
    records: [
      {
        key: 'contact/1',
        identity: { kind: 'contact', id: 1 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { params }
      }
    ]
  })
  const before = contact({ linka: 'https://facebook.com/x', linka_name: 'facebook', show_links: '1' })
  assert.equal(
    compareAgentInventory(
      before,
      contact({ linka: 'https://facebook.com/y', linka_name: 'Facebook', show_links: '1' })
    ).pass,
    true
  )
  assert.equal(
    compareAgentInventory(before, contact({ linka_name: 'Facebook', show_links: '1' })).pass,
    false
  )
})

// lrsweep rig, JA Spa j6 (24/10/2026): Claude Cowork's `content.list` gives a menu item no `url`, so the item that opens
// /index.php/contact had no route, and the residue sweep said "the site has no Contact page" for 17 links. Its route
// is read off its own row (`path`, `home`, `type`) in the address form the site's other rows show.
function joomlaMenus({ articleUrls, menuItems }) {
  return createAgentDemoInventory({
    siteReader: async () => ({ base: 'https://site.test', text: async () => '{}' }),
    checkGrant: async () => {},
    siteAccess: async () => {
      throw Error('not EmDash')
    },
    applyFor:
      () =>
      async ({ action, params }) => {
        if (action === 'db.tables') return { tables: [] }
        if (action === 'content.list') {
          const rows =
            params.kind === 'article'
              ? articleUrls.map((url, i) => ({ id: i + 1, state: 1, url }))
              : params.kind === 'menuItem'
                ? menuItems
                : []
          return { items: rows.slice(params.offset, params.offset + params.limit) }
        }
        if (params.kind === 'menuItem') return { item: menuItems.find((m) => m.id === params.id) }
        if (params.kind === 'article') return { item: { id: params.id, state: 1, title: 'Old title' } }
        return { item: { id: params.id } }
      }
  })
}
const MENU = [
  {
    id: 101,
    menutype: 'mainmenu',
    path: 'homepage',
    link: 'index.php?option=com_content&view=article&id=1',
    type: 'component',
    published: 1,
    home: 1,
    language: '*',
    client_id: 0
  },
  {
    id: 105,
    menutype: 'mainmenu',
    path: 'page/blog',
    link: 'index.php?option=com_content&view=category&layout=blog&id=8',
    type: 'component',
    published: 1,
    home: 0,
    language: '*',
    client_id: 0
  },
  {
    id: 112,
    menutype: 'mainmenu',
    path: 'contact',
    link: 'index.php?option=com_contact&view=contact&id=1',
    type: 'component',
    published: 1,
    home: 0,
    language: '*',
    client_id: 0
  },
  {
    id: 113,
    menutype: 'mainmenu',
    path: 'elsewhere',
    link: 'https://example.org/',
    type: 'url',
    published: 1,
    home: 0,
    language: '*',
    client_id: 0
  },
  {
    id: 114,
    menutype: 'mainmenu',
    path: 'old-offers',
    link: 'index.php?option=com_content&view=article&id=9',
    type: 'component',
    published: 0,
    home: 0,
    language: '*',
    client_id: 0
  }
]
const menuRoutes = (inventory) =>
  Object.fromEntries(
    inventory.records.filter((r) => r.identity.kind === 'menuItem').map((r) => [r.identity.id, r.routes])
  )

test('a Joomla menu item with no url takes its route in the site address form: SEF through index.php', async () => {
  const read = joomlaMenus({
    articleUrls: ['https://site.test/index.php', 'https://site.test/index.php/page/blog/2-a-post'],
    menuItems: MENU
  })
  const inventory = await read({ site: { site_key: 'site.test', platform: 'joomla' }, email: 'owner@test' })
  assert.deepEqual(menuRoutes(inventory), {
    101: ['/index.php'],
    105: ['/index.php/page/blog'],
    112: ['/index.php/contact'],
    113: [],
    114: []
  })
})

test('a Joomla menu item with no url takes its route in the site address form: SEF with URL rewriting', async () => {
  const read = joomlaMenus({
    articleUrls: ['https://site.test/', 'https://site.test/page/blog/2-a-post'],
    menuItems: MENU
  })
  const inventory = await read({ site: { site_key: 'site.test', platform: 'joomla' }, email: 'owner@test' })
  assert.deepEqual(menuRoutes(inventory)[112], ['/contact'])
  assert.deepEqual(menuRoutes(inventory)[101], ['/'])
})

test('a Joomla menu item keeps the url its row gives, and gets no route when no row shows the address form', async () => {
  const withUrl = MENU.map((m) =>
    m.id === 112 ? { ...m, url: 'https://site.test/index.php/get-in-touch' } : m
  )
  const one = await joomlaMenus({
    articleUrls: ['https://site.test/index.php/page/blog/2-a-post'],
    menuItems: withUrl
  })({
    site: { site_key: 'site.test', platform: 'joomla' },
    email: 'owner@test'
  })
  assert.deepEqual(menuRoutes(one)[112], ['/index.php/get-in-touch'])
  // Non-SEF addresses (`index.php?option=…`) say nothing of a path: nothing is guessed.
  const none = await joomlaMenus({
    articleUrls: ['https://site.test/index.php?option=com_content&view=article&id=2&Itemid=105'],
    menuItems: MENU
  })({ site: { site_key: 'site.test', platform: 'joomla' }, email: 'owner@test' })
  assert.deepEqual(menuRoutes(none)[112], [])
})

// Local stand 24/10/2026: an EmDash bakery filled four of its template's five client logos with its own logo and two
// sketches, the list's length being held as structure.
test('a list of other organisations’ marks may shrink to the business’s own, never to none; other lists keep their count', () => {
  const mark = (id) => ({ logo: { id, provider: 'emdash', mimeType: 'image/png' }, name: 'x' })
  const card = (id) => ({ image: { id, provider: 'emdash', mimeType: 'image/jpeg' }, title: 'x' })
  const home = (data) => ({
    complete: true,
    records: [
      {
        key: 'home/1@en',
        identity: { collection: 'home', id: '1' },
        publication: {},
        routes: ['/'],
        relations: {},
        editorialFields: ['client_logos', 'gallery'],
        data
      }
    ]
  })
  const before = home({
    client_logos: [1, 2, 3, 4, 5].map((n) => mark(`l${n}`)),
    gallery: [card('g1'), card('g2')]
  })
  const kept = home({ client_logos: [mark('jbf')], gallery: [card('a'), card('b')] })
  assert.equal(
    compareAgentInventory(before, kept).pass,
    true,
    JSON.stringify(compareAgentInventory(before, kept).detail)
  )
  assert.equal(
    compareAgentInventory(before, home({ client_logos: [], gallery: [card('a'), card('b')] })).pass,
    false
  )
  assert.equal(
    compareAgentInventory(before, home({ client_logos: [mark('jbf')], gallery: [card('a')] })).pass,
    false
  )
})

// Local round 18, 25/10/2026: an EmDash bakery build failed native-structure on what follows its own words.
test('EmDash: a reading time and a table of contents that follow the text, a lede written where there was none and a status a visitor reads keep the structure; a machine status does not', () => {
  const record = (key, data, editorialFields) => ({
    key,
    identity: { collection: key.split('/')[0], id: key },
    publication: {},
    routes: [],
    relations: {},
    editorialFields,
    data
  })
  const site = (post, investors) => ({
    complete: true,
    records: [
      record('posts/1@en', post, ['title', 'lede', 'body']),
      record('investors/1@en', investors, ['title'])
    ]
  })
  const body = (text) => [{ _type: 'block', _key: 'k', children: [{ _type: 'span', text }] }]
  const before = site(
    {
      title: 'Plant news',
      body: body('Old'),
      reading_time: 0,
      toc: [
        { label: 'One', _rowId: 'r1' },
        { label: 'Two', _rowId: 'r2' }
      ],
      state: 'published'
    },
    {
      title: 'Investors',
      dividends: [{ status: 'Paid 22 Jul 2026', _rowId: 'd1' }],
      phase: { status: 'open' }
    }
  )
  const after = site(
    {
      title: 'Croissant week',
      lede: 'Laminated by hand',
      body: body('New'),
      reading_time: 2,
      toc: [{ label: 'Butter', _rowId: 'n1' }],
      state: 'published'
    },
    {
      title: 'Orders',
      dividends: [{ status: 'Available at the counter', _rowId: 'd1' }],
      phase: { status: 'open' }
    }
  )
  const result = compareAgentInventory(before, after)
  assert.equal(result.pass, true, JSON.stringify(result.detail))
  const closed = site(after.records[0].data, { ...after.records[1].data, phase: { status: 'closed' } })
  assert.equal(compareAgentInventory(before, closed).pass, false)
})

// Local round 19, 25/10/2026: a WordPress image block given the business's photo names the new attachment in its class.
test('WordPress: a picture replaced in an image block keeps the structure; another class does not', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/1',
        identity: { kind: 'post', id: 1 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { post_content: content }
      }
    ]
  })
  const block = (id, extra = '') =>
    `<figure class="wp-block-image size-full${extra}"><img src="/a.jpg" alt="x" class="wp-image-${id}"></figure>`
  assert.equal(compareAgentInventory(page(block(65)), page(block(199))).pass, true)
  assert.equal(compareAgentInventory(page(block(65)), page(block(199, ' is-style-rounded'))).pass, false)
})

// Local round 20, 25/10/2026: an EmDash mail sample's sender "Name <no-reply@…>" read as a tag.
test('an address in angle brackets is words; a tag is still structure', () => {
  const page = (from) => ({
    complete: true,
    records: [
      {
        key: 'pages/1@en',
        identity: { collection: 'pages', id: '1' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['sample'],
        data: { sample: { from } }
      }
    ]
  })
  const same = compareAgentInventory(
    page('Northgate <no-reply@northgate-ind.ru>'),
    page('b. patisserie <contact@bpatisserie.com>')
  )
  assert.equal(same.pass, true, JSON.stringify(same.detail))
  assert.equal(compareAgentInventory(page('Shop <div>x</div>'), page('Shop <p>x</p>')).pass, false)
})

// Local round 20, 25/10/2026 (b. patisserie, EmDash): six template networks became the business's two; vacancies'
// `type` rewritten for a bakery.
test('a list of the business’s own profiles takes the business’s length; a type a visitor reads is words, a machine type is not', () => {
  const site = (data) => ({
    complete: true,
    records: [
      {
        key: 'site/1@en',
        identity: { collection: 'site', id: '1' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data
      }
    ]
  })
  const link = (n) => ({ label: n, url: `https://${n}.example/x` })
  const before = site({
    social: ['a', 'b', 'c', 'd', 'e', 'f'].map(link),
    job: { type: 'Full-time · 15/15 rotation' },
    other: { type: 'Full-time' },
    block: { type: 'image' }
  })
  const after = site({
    social: [link('facebook'), link('instagram')],
    job: { type: 'Full-time · early mornings' },
    other: { type: 'Part-time' },
    block: { type: 'image' }
  })
  assert.equal(
    compareAgentInventory(before, after).pass,
    true,
    JSON.stringify(compareAgentInventory(before, after).detail)
  )
  assert.equal(compareAgentInventory(before, site({ ...after.records[0].data, social: [] })).pass, false)
  assert.equal(
    compareAgentInventory(before, site({ ...after.records[0].data, block: { type: 'video' } })).pass,
    false
  )
})

// Local round 20, 25/10/2026 (Levain, WordPress): the brief says a price the research lacks stays empty, and the
// emptied `dish-price` paragraphs failed native-structure.
test('a text element emptied keeps the structure; one removed does not', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/1',
        identity: { kind: 'post', id: 1 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['post_content'],
        data: { post_content: content }
      }
    ]
  })
  const dish = (price) => `<h3 class="dish-name">Cookie</h3><p class="dish-price">${price}</p>`
  assert.equal(compareAgentInventory(page(dish('$9.95')), page(dish(''))).pass, true)
  assert.equal(
    compareAgentInventory(page(dish('$9.95')), page('<h3 class="dish-name">Cookie</h3>')).pass,
    false
  )
})

// Local round 20, 25/10/2026 (Levain, WordPress): a price left "—" and three lines of hours written as one.
test('a text element holding only a dash is words, and line breaks inside words are not structure', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/1',
        identity: { kind: 'post', id: 1 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['post_content'],
        data: { post_content: content }
      }
    ]
  })
  const dish = (price) => `<h3 class="dish-name">Cookie</h3><p class="dish-price">${price}</p>`
  assert.equal(compareAgentInventory(page(dish('$9.95')), page(dish('—'))).pass, true)
  const hours = (text) => `<p class="hp-info">${text}</p>`
  assert.equal(
    compareAgentInventory(
      page(hours('Mon to Fri<br>12 noon<br>to 11 pm')),
      page(hours('Every day, 8am to 8pm<br>'))
    ).pass,
    true
  )
  assert.equal(
    compareAgentInventory(page(hours('Mon<br>Tue')), page('<div class="hp-info">Every day</div>')).pass,
    false
  )
})

// Local round 24, 25/10/2026 (Levain, WordPress): the header part written back without its last newline.
test('blank space around and between tags is no structure; a lost block still is', () => {
  const part = (content) => ({
    complete: true,
    records: [
      {
        key: 'templatePart/header',
        identity: { kind: 'templatePart', id: 'header' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { title: 'Header', content }
      }
    ]
  })
  const group =
    '<!-- wp:group -->\n<div class="wp-block-group">\n<!-- wp:site-title /-->\n</div>\n<!-- /wp:group -->'
  assert.equal(compareAgentInventory(part(`${group}\n`), part(group)).pass, true)
  assert.equal(compareAgentInventory(part(group), part(group.replace(/>\n</g, '><'))).pass, true)
  assert.equal(
    compareAgentInventory(
      part(group),
      part('<!-- wp:group -->\n<div class="wp-block-group"></div>\n<!-- /wp:group -->')
    ).pass,
    false
  )
})

// Local round 28, 25/10/2026 (Levain, WordPress): a slide's new photo written without the attachment's class.
test('a WordPress picture written without its wp-image class is the same picture; a lost figure is not', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/97',
        identity: { kind: 'post', id: 97 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { post_type: 'page', post_content: content }
      }
    ]
  })
  const slide = (img) =>
    `<!-- wp:image {"id":24} --><figure class="wp-block-image size-full img-bg">${img}</figure><!-- /wp:image -->`
  const was = page(slide('<img src="/a.jpg" alt="" class="wp-image-24">'))
  assert.equal(compareAgentInventory(was, page(slide('<img src="/b.jpg" alt="Cookies">'))).pass, true)
  assert.equal(
    compareAgentInventory(was, page(slide('<img src="/b.jpg" alt="" class="wp-image-310">'))).pass,
    true
  )
  assert.equal(compareAgentInventory(was, page(slide(''))).pass, false)
  // Darkened inline (local round 29): a style attribute is the look, judged by look-kept.
  assert.equal(
    compareAgentInventory(was, page(slide('<img src="/b.jpg" alt="" style="filter:brightness(.35)">'))).pass,
    true
  )
})

// Local round 24, 25/10/2026 (Levain, WordPress): the template tag "Fish" renamed "Breads" for the bakery.
test('a WordPress tag renamed is the same tag; a post given more tags differs', () => {
  // A post carries its tags by name among its relations and in its own data (local round 31: the data's names failed).
  const post = (tags) => ({
    complete: true,
    records: [
      {
        key: 'post/79',
        identity: { kind: 'post', id: 79 },
        publication: {},
        routes: [],
        relations: { tags_input: tags, post_category: [3] },
        editorialFields: [],
        data: { post_type: 'post', tags_input: tags }
      }
    ]
  })
  assert.equal(compareAgentInventory(post(['Fish', 'menus']), post(['Breads', 'Cookies'])).pass, true)
  assert.equal(compareAgentInventory(post(['Fish']), post(['Breads', 'Cookies'])).pass, false)
  // Local round 36: the row's own lists of categories and tags name them too.
  const listed = (tags, categories) => ({
    complete: true,
    records: [
      {
        key: 'post/81',
        identity: { kind: 'post', id: 81 },
        publication: {},
        routes: [],
        relations: { 'list:tags': tags, 'list:categories': categories },
        editorialFields: [],
        data: { post_type: 'post' }
      }
    ]
  })
  assert.equal(
    compareAgentInventory(listed(['fish'], ['Restaurant News']), listed(['menus'], ['Bakery News'])).pass,
    true
  )
  assert.equal(
    compareAgentInventory(listed(['fish'], ['News']), listed(['menus', 'gifts'], ['News'])).pass,
    false
  )
})

// Local round 25, 25/10/2026 (b. patisserie, EmDash): a key the build added, set null to take it out again.
test('a key holding null is a key left out; a key holding a value is not', () => {
  const page = (sample) => ({
    complete: true,
    records: [
      {
        key: 'pages/1@en',
        identity: { kind: 'pages', id: '1' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { template: 'kit-email', sample }
      }
    ]
  })
  assert.equal(
    compareAgentInventory(page({ list: ['a', 'b'] }), page({ list: ['a', 'b'], ctaUrl: null })).pass,
    true
  )
  assert.equal(
    compareAgentInventory(page({ list: ['a', 'b'] }), page({ list: ['a', 'b'], ctaUrl: '/contact' })).pass,
    false
  )
})

// Local round 21, 25/10/2026 (b. patisserie, EmDash): a figure emptied and a cell set to "—" where the research had none.
test('EmDash: a field emptied or set to a dash is words; a technical value emptied still differs', () => {
  const site = (data) => ({
    complete: true,
    records: [
      {
        key: 'investors/1@en',
        identity: { collection: 'investors', id: '1' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['rows'],
        data
      }
    ]
  })
  const before = site({ rows: [{ change: '+2.3%', d: 'Paid 22 Jul' }], anchor: 'reports' })
  assert.equal(
    compareAgentInventory(before, site({ rows: [{ change: '', d: '—' }], anchor: 'reports' })).pass,
    true
  )
  assert.equal(
    compareAgentInventory(before, site({ rows: [{ change: '', d: '—' }], anchor: '' })).pass,
    false
  )
})

// Local round 21, 25/10/2026 (b. patisserie, EmDash): project galleries the template left empty, filled.
test('EmDash: a list the template left empty may be filled; a list that had rows keeps its count', () => {
  const project = (gallery) => ({
    complete: true,
    records: [
      {
        key: 'projects/1@en',
        identity: { collection: 'projects', id: '1' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['gallery'],
        data: { gallery }
      }
    ]
  })
  const shot = (id) => ({ caption: 'x', image: { id, provider: 'emdash', mimeType: 'image/jpeg' } })
  assert.equal(compareAgentInventory(project([]), project([shot('a'), shot('b')])).pass, true)
  assert.equal(compareAgentInventory(project([shot('t')]), project([shot('a'), shot('b')])).pass, false)
})

// Local round 21, 25/10/2026 (Levain, WordPress): template news posts rewritten in fewer paragraphs.
test('WordPress: an article rewritten in other paragraphs keeps the structure; a page’s layout does not', () => {
  const record = (post_type, post_content) => ({
    complete: true,
    records: [
      {
        key: 'post/76',
        identity: { kind: 'post', id: 76 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['post_title', 'post_content', 'post_excerpt'],
        data: { post_type, post_content }
      }
    ]
  })
  const long = '<p>One</p><p><strong>Two</strong> more</p><p><strong>Three</strong> more</p>'
  const short = '<p>Uno</p><p>Dos</p>'
  assert.equal(compareAgentInventory(record('post', long), record('post', short)).pass, true)
  assert.equal(compareAgentInventory(record('page', long), record('page', short)).pass, false)
})

// Local round 22, 25/10/2026 (b. patisserie, EmDash): picture fields written with the import's file path.
// Local round 36 (26/10/2026): an EmDash build wrote picture fields as `{id, alt}`; four checks failed on their shape.
test('EmDash: a picture written as its library id with its alt is the same picture; another object is not', () => {
  const page = (image) => ({
    complete: true,
    records: [
      {
        key: 'pages/home@en',
        identity: { collection: 'pages', id: 'home', slug: 'home', locale: 'en' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { sample: { image } }
      }
    ]
  })
  const before = page({
    id: '01M5AJ2XRAF4BV0Z4RPTCH58MQ',
    provider: 'local',
    mimeType: 'image/jpeg',
    src: '/x.jpg'
  })
  assert.equal(
    compareAgentInventory(before, page({ id: '01M5TPQBS5G51XJX01DTTSPYPG', alt: 'Croissants' })).pass,
    true
  )
  assert.equal(compareAgentInventory(before, page({ id: 'hero', label: 'Croissants' })).pass, false)
  // Round 37: written as the bare id inside a JSON field, it is still that picture; a word there is not.
  assert.equal(compareAgentInventory(before, page('01M5TWDK7PT6Y86T0AJXTCHY80')).pass, true)
  assert.equal(compareAgentInventory(before, page('Croissants')).pass, false)
})

test('EmDash: a picture field holding an external src of the library is still a picture', () => {
  const home = (hero_image) => ({
    complete: true,
    records: [
      {
        key: 'home/1@en',
        identity: { collection: 'home', id: '1' },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: [],
        data: { hero_image }
      }
    ]
  })
  const library = { id: '01M5AJ', provider: 'local', mimeType: 'image/jpeg', width: 10, height: 10 }
  const external = { provider: 'external', id: '', src: '/_emdash/api/media/file/01M5R3.jpg' }
  assert.equal(compareAgentInventory(home(library), home(external)).pass, true)
  assert.equal(compareAgentInventory(home(library), home('plain words')).pass, false)
})

// Local round 22, 25/10/2026 (Levain, WordPress): a navigation's items differed only as newlines, and a phone wrapped
// in its tel: link read as a changed paragraph.
test('WordPress: block names stay structure while their attributes are not, and a link inside words is words', () => {
  const page = (content, editorialFields = ['post_content']) => ({
    complete: true,
    records: [
      {
        key: 'post/133',
        identity: { kind: 'post', id: 133 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields,
        data: { post_type: 'wp_navigation', post_content: content }
      }
    ]
  })
  const link = (label, id) => `<!-- wp:navigation-link {"label":"${label}","id":${id},"url":"/x/${id}"} /-->`
  const menu = (...items) => items.join('\n')
  const renamed = compareAgentInventory(
    page(menu(link('Home', 1), link('About', 2))),
    page(menu(link('Accueil', 9), link('Nous', 8)))
  )
  assert.equal(renamed.pass, true, JSON.stringify(renamed.detail))
  const more = compareAgentInventory(
    page(menu(link('Home', 1), link('About', 2))),
    page(menu(link('Home', 1), link('About', 2), link('Shop', 3)))
  )
  assert.equal(more.pass, false)
  assert.match(JSON.stringify(more.detail), /wp:navigation-link/)
  const phone = (inner) => `<p><span class="highlight">Call</span> ${inner}</p>`
  assert.equal(
    compareAgentInventory(
      page(phone('(084) 555-0110')),
      page(phone('<a href="tel:+12125550110">212 555 0110</a>'))
    ).pass,
    true
  )
})

// Local round 23, 25/10/2026 (Levain, WordPress): rewritten words that dropped the template's italics.
test('emphasis inside words is words; an element taken out is not', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/101',
        identity: { kind: 'post', id: 101 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['post_content'],
        data: { post_type: 'page', post_content: content }
      }
    ]
  })
  const before = page('<p><i>Happy hours</i> every day</p><p>Two</p>')
  assert.equal(compareAgentInventory(before, page('<p>Cookie club every month</p><p>Deux</p>')).pass, true)
  assert.equal(compareAgentInventory(before, page('<p>Cookie club every month</p>')).pass, false)
})

// Local round 26, 25/10/2026 (Levain, WordPress): four checks spent looking for the block of wp-image-35.
test('picturesWhere names the record and the WordPress block of each template picture, numbered as the outline is', () => {
  const body =
    '<!-- wp:paragraph --><p>Intro</p><!-- /wp:paragraph -->\n' +
    'loose words between blocks\n' +
    '<!-- wp:group --><div class="wp-block-group"><!-- wp:image {"id":30} --><figure class="wp-block-image"><img src="/wp-content/uploads/2026/10/chef.png" class="wp-image-30"></figure><!-- /wp:image --></div><!-- /wp:group -->\n' +
    '<!-- wp:group --><div><!-- wp:image {"id":35} --><figure class="wp-block-image size-full"><img src="/wp-content/uploads/2026/10/intro-3-1.jpg" class="wp-image-35"></figure><!-- /wp:image --></div><!-- /wp:group -->'
  const inventory = {
    records: [
      { key: 'post/12', data: { post_content: '<!-- wp:paragraph --><p>Other</p><!-- /wp:paragraph -->' } },
      { key: 'post/97', data: { post_content: body } },
      { key: 'media/01M5', data: { image: { src: '/_emdash/api/media/file/01M5RC2EGMD1.jpg' } } }
    ]
  }
  const checks = [
    { id: 'pages-load', pass: true, detail: [] },
    {
      id: 'no-demo-pictures',
      pass: false,
      detail: [
        {
          file: 'wp-content/uploads/2026/10/intro-3-1-768x768.jpg',
          selector: 'figure.wp-block-image.size-full > img.wp-image-35'
        },
        { file: 'wp-content/uploads/2026/10/chef.png', selector: 'figure > img' },
        { file: '_emdash/api/media/file/01M5RC2EGMD1.jpg', selector: 'img' },
        { file: 'wp-content/uploads/2026/10/nowhere.jpg', selector: 'img' }
      ]
    }
  ]
  const [kept, pictures] = picturesWhere(checks, inventory)
  assert.equal(kept, checks[0])
  // The outline counts the loose words as a position: paragraph 0, words 1, chef group 2, intro group 3.
  assert.deepEqual(
    topBlocks(body).map((b) => b.name),
    ['core/paragraph', null, 'core/group', 'core/group']
  )
  assert.deepEqual(pictures.detail[0].in, { record: 'post/97', block: 3 })
  assert.deepEqual(pictures.detail[1].in, { record: 'post/97', block: 2 })
  assert.deepEqual(pictures.detail[2].in, { record: 'media/01M5' })
  // Local round 35: a picture no record holds is a setting's, and says how that is changed.
  assert.match(
    pictures.detail[3].in.setting,
    /a template setting picks it[\s\S]*attachmentId[\s\S]*kind:"option"/
  )
  assert.match(pictures.detail[3].in.setting, /template\.siteSettings[\s\S]*operation:"set"[\s\S]*site_logo/)
  assert.deepEqual(picturesWhere(checks, null), checks)
  // One template file on two pages: the page the read saw it on names its own record (local round 27).
  const twice = {
    records: [
      { key: 'post/97', routes: ['/'], data: { post_content: body } },
      { key: 'post/99', routes: ['/about-us/'], data: { post_content: body } }
    ]
  }
  const onAbout = picturesWhere(
    [
      {
        id: 'no-demo-pictures',
        pass: false,
        detail: [{ page: '/about-us', file: 'x/intro-3-1.jpg', selector: 'img.wp-image-35' }]
      }
    ],
    twice
  )
  assert.deepEqual(onAbout[0].detail[0].in, { record: 'post/99', block: 3 })
  // Local round 36: a record with its identity names the swap of that block's picture, never a retyped block.
  const [swapped] = picturesWhere(
    [
      {
        id: 'no-demo-pictures',
        pass: false,
        detail: [{ page: '/', file: 'wp-content/uploads/2026/10/chef.png', selector: 'img' }]
      }
    ],
    {
      records: [
        { key: 'post/97', identity: { kind: 'post', id: 97 }, routes: ['/'], data: { post_content: body } }
      ]
    }
  )
  // A list's thumbnail is the post's featured picture (local round 37).
  const [thumb] = picturesWhere(
    [
      {
        id: 'no-demo-pictures',
        pass: false,
        detail: [
          {
            page: '/gallery/',
            file: 'wp-content/uploads/2026/10/chef-300x300.png',
            selector: 'div.item-image > img.attachment-large.size-large'
          }
        ]
      }
    ],
    {
      records: [
        { key: 'post/97', identity: { kind: 'post', id: 97 }, routes: [], data: { post_content: body } }
      ]
    }
  )
  assert.deepEqual(thumb.detail[0].in, {
    record: 'post/97',
    featured: 'content.update {kind:"postmeta", id:97, key:"_thumbnail_id", fields:{value:<attachmentId>}}'
  })
  assert.equal(
    swapped.detail[0].in.swap,
    'content.get {kind:"post", id:97, outline:true} gives rev; content.update {kind:"post", id:97, rev, blocks:{"2":{pictures:{"chef.png":{path, attachmentId}}}}}'
  )
  // A file is named whole (local round 31): `banner-1` is not the anchor `acm-text-banner-130`, and a picture no record
  // holds is named a setting's; its sized copy is the same file.
  const banner = {
    records: [
      { key: 'post/106', routes: ['/blog/'], data: { post_content: '<div id="acm-text-banner-130"></div>' } },
      { key: 'post/12', data: { post_content: '<img src="/wp-content/uploads/2026/10/rest-1-768x384.jpg">' } }
    ]
  }
  const [named] = picturesWhere(
    [
      {
        id: 'no-demo-pictures',
        pass: false,
        detail: [
          { page: '/blog/', file: 'wp-content/uploads/2026/10/banner-1.jpg', selector: 'img' },
          { page: '/', file: 'wp-content/uploads/2026/10/rest-1.jpg', selector: 'img' },
          { page: '/', file: 'wp-content/uploads/2026/10/rest-10.jpg', selector: 'img' }
        ]
      }
    ],
    banner
  )
  assert.ok(named.detail[0].in.setting)
  assert.deepEqual(named.detail[1].in, { record: 'post/12' })
  assert.ok(named.detail[2].in.setting)
})

// Plan "10/10" §5 (David 26/10/2026): local round 31 left posts at the template's own addresses and dates
// (`/how-the-gop-and-dems-differ-on-restaurant-issues/`, 27 September 2021); an article's address and date are the
// build's, a page's address is not.
test("an article's address and date are the build's on every CMS; a page's address, its count and its publication are not", () => {
  const inventory = (records) => ({ complete: true, records })
  const wp = (type, slug, date, status = 'publish') => ({
    key: `post/${type === 'page' ? 9 : 79}`,
    identity: { kind: 'post', id: type === 'page' ? 9 : 79 },
    publication: { status },
    routes: [`/${slug}/`],
    relations: {},
    editorialFields: ['post_title', 'post_content'],
    data: {
      post_type: type,
      post_title: 'A title',
      post_content: '<!-- wp:paragraph --><p>Words</p><!-- /wp:paragraph -->',
      post_name: slug,
      post_date: date,
      post_date_gmt: date,
      post_author: '1'
    }
  })
  const before = inventory([
    wp('post', 'how-the-gop-and-dems-differ-on-restaurant-issues', '2021-09-27 10:00:00'),
    wp('page', 'about-us', '2021-09-27 10:00:00')
  ])
  const rewritten = inventory([
    wp('post', 'our-cookie-club', '2026-10-26 09:00:00'),
    wp('page', 'about-us', '2021-09-27 10:00:00')
  ])
  assert.equal(compareAgentInventory(before, rewritten).pass, true)
  // a page keeps its address: menus and buttons point at it
  const page = inventory([
    wp('post', 'our-cookie-club', '2026-10-26 09:00:00'),
    wp('page', 'our-story', '2021-09-27 10:00:00')
  ])
  assert.equal(compareAgentInventory(before, page).pass, false)
  // the author, the status and the count stay held
  const author = inventory([
    {
      ...wp('post', 'our-cookie-club', '2026-10-26'),
      data: { ...wp('post', 'x', 'y').data, post_author: '2' }
    },
    wp('page', 'about-us', '2021-09-27 10:00:00')
  ])
  assert.equal(compareAgentInventory(before, author).pass, false)
  const draft = inventory([
    wp('post', 'our-cookie-club', '2026-10-26', 'draft'),
    wp('page', 'about-us', '2021-09-27 10:00:00')
  ])
  assert.equal(compareAgentInventory(before, draft).pass, false)
  // EmDash: an entry outside pages carries its slug in its identity and route; a page does not move
  const em = (collection, slug, date) => ({
    key: `${collection}/01J@en`,
    identity: { collection, id: '01J', slug, locale: 'en' },
    publication: { status: 'published', deletedAt: null, scheduledAt: null, draft: false },
    routes: [{ pattern: `/${collection}/${slug}`, locale: 'en' }],
    relations: {},
    editorialFields: ['title'],
    data: { title: 'A title', publishedAt: date }
  })
  assert.equal(
    compareAgentInventory(
      inventory([em('posts', 'lorem-news', '2021-01-01')]),
      inventory([em('posts', 'croissants-at-dawn', '2026-10-26')])
    ).pass,
    true
  )
  assert.equal(
    compareAgentInventory(inventory([em('pages', 'about', 'x')]), inventory([em('pages', 'story', 'x')]))
      .pass,
    false
  )
  // Joomla: an article's alias, created and publish_up dates and its byline alias
  const jo = (alias, created, byline) => ({
    key: 'article/12',
    identity: { kind: 'article', id: 12 },
    publication: { state: 1 },
    routes: [`/blog/${alias}`],
    relations: {},
    editorialFields: ['title', 'introtext'],
    data: { title: 'A title', alias, created, publish_up: created, created_by_alias: byline, created_by: 42 }
  })
  assert.equal(
    compareAgentInventory(
      inventory([jo('template-news', '2019-05-01', '')]),
      inventory([jo('our-new-menu', '2026-10-26', 'Death & Co')])
    ).pass,
    true
  )
})

// Local round 33 (26/10/2026, WordPress JA Restaurant): the sidebar part held only a pattern reference; the build
// expanded it into the stored part to change "Most Read", and native-structure failed it at every check.
test('a pattern is read as the blocks it inserts: an expanded part keeps its structure, an added block does not', async () => {
  const pattern =
    '<!-- wp:group --><div class="wp-block-group t3-module module"><!-- wp:heading --><h3 class="module-title">Most Read</h3><!-- /wp:heading --><!-- wp:pattern {"slug":"t/latest"} /--></div><!-- /wp:group -->'
  const latest = '<!-- wp:paragraph --><p>More Articles …</p><!-- /wp:paragraph -->'
  const read = async (key) => ({ 't/part-sidebar': pattern, 't/latest': latest })[key] ?? null
  const ref = '<!-- wp:pattern {"slug":"t/part-sidebar"} /-->'
  const expanded = await expandPatterns(ref, read)
  assert.equal(expanded, pattern.replace('<!-- wp:pattern {"slug":"t/latest"} /-->', latest))
  // a pattern the plugin cannot read stays the reference it was
  assert.equal(
    await expandPatterns('<!-- wp:pattern {"slug":"t/gone"} /-->', read),
    '<!-- wp:pattern {"slug":"t/gone"} /-->'
  )
  const part = (content, extra = {}) => ({
    key: 'templatePart/sidebar',
    identity: { kind: 'templatePart', key: 'sidebar' },
    publication: { status: 'template' },
    routes: [],
    relations: {},
    editorialFields: ['content'],
    data: { content, ...extra },
    ...extra.record
  })
  const inventory = (records, patternsRead = true) => ({
    complete: true,
    ...(patternsRead ? { patternsRead } : {}),
    records
  })
  const before = inventory([part(expanded)])
  const written = expanded.replace('Most Read', 'Popular stories').replace('More Articles …', 'More stories')
  assert.equal(compareAgentInventory(before, inventory([part(written)])).pass, true)
  const added = written.replace(
    '</div><!-- /wp:group -->',
    '<!-- wp:image --><figure class="wp-block-image"><img src="x.jpg" alt=""/></figure><!-- /wp:image --></div><!-- /wp:group -->'
  )
  assert.equal(compareAgentInventory(before, inventory([part(added)])).pass, false)
  // A frozen inventory read before patterns were holds an untouched part to its reference as read.
  const old = inventory([part(ref)], false)
  const untouched = { ...part(expanded), patternsAsRead: { content: ref } }
  assert.equal(compareAgentInventory(old, inventory([untouched])).pass, true)
})

// Plan "10/10" §5 (David 26/10/2026): local round 31 shipped the template's empty OpenTable group as an orange band; a
// button to the business's real way in, put inside it, keeps the structure; filling a decorative box does not.
test('a service box the template left empty may be filled; a decorative box, or the box itself, may not change', () => {
  const page = (content) => ({
    key: 'post/100',
    identity: { kind: 'post', id: 100 },
    publication: { status: 'publish' },
    routes: ['/'],
    relations: {},
    editorialFields: ['post_title', 'post_content'],
    data: { post_type: 'page', post_title: 'Home', post_content: content }
  })
  const inventory = (content) => ({ complete: true, records: [page(content)] })
  const empty =
    '<!-- wp:group {"className":"acm-opentable"} --><div class="wp-block-group acm-opentable"><!-- wp:group {"className":"ot-form"} --><div class="wp-block-group ot-form"></div><!-- /wp:group --></div><!-- /wp:group --><!-- wp:group {"className":"jr-band"} --><div class="wp-block-group jr-band"></div><!-- /wp:group -->'
  const button =
    '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="tel:+19174643769">Call 917.464.3769</a></div><!-- /wp:button --></div><!-- /wp:buttons -->'
  const before = inventory(empty)
  const filled = empty.replace(
    '<div class="wp-block-group ot-form"></div>',
    `<div class="wp-block-group ot-form">${button}</div>`
  )
  assert.equal(compareAgentInventory(before, inventory(filled)).pass, true)
  const band = empty.replace(
    '<div class="wp-block-group jr-band"></div>',
    `<div class="wp-block-group jr-band">${button}</div>`
  )
  assert.equal(compareAgentInventory(before, inventory(band)).pass, false)
  const gone = empty.replace(
    '<!-- wp:group {"className":"ot-form"} --><div class="wp-block-group ot-form"></div><!-- /wp:group -->',
    ''
  )
  assert.equal(compareAgentInventory(before, inventory(gone)).pass, false)
})

// Offline/error pages put a full stop after emphasized text, as its own text node.
test('punctuation beside rewritten inline words is copy; its containing native frame still counts', () => {
  const page = (content) => ({
    complete: true,
    records: [
      {
        key: 'post/119',
        identity: { kind: 'post', id: 119 },
        publication: {},
        routes: [],
        relations: {},
        editorialFields: ['post_content'],
        data: { post_content: content }
      }
    ]
  })
  const before = page(
    '<center>Each <strong>JA Joomla Template</strong> has its own <strong>Offline page style</strong>.</center>'
  )
  assert.equal(
    compareAgentInventory(before, page('<center>The bakery <strong>will be back</strong> soon.</center>'))
      .pass,
    true
  )
  assert.equal(
    compareAgentInventory(before, page('<center>The bakery will be back soon.</center>')).pass,
    true
  )
  assert.equal(compareAgentInventory(before, page('<div>The bakery will be back soon.</div>')).pass, false)
  assert.equal(
    compareAgentInventory(before, page('<center>The bakery will be back soon.</center><p>New frame</p>'))
      .pass,
    false
  )
})

test('Joomla article image alt and caption are copy; alignment, keys and types remain structure', () => {
  const inventory = (images) => ({
    complete: true,
    records: [
      {
        key: 'article/1',
        identity: { kind: 'article', id: 1 },
        publication: { state: 1 },
        routes: ['/news/example'],
        relations: {},
        editorialFields: ['title'],
        data: { title: 'A story', images: JSON.stringify(images) }
      }
    ]
  })
  const images = {
    image_intro: 'images/a.jpg',
    image_intro_alt: '',
    image_intro_caption: '',
    image_fulltext: 'images/b.jpg',
    image_fulltext_alt: '',
    image_fulltext_caption: '',
    float_intro: 'left'
  }
  const before = inventory(images)
  const edited = {
    ...images,
    image_intro_alt: 'Oysters at Via Carota',
    image_intro_caption: 'At the table',
    image_fulltext_alt: 'A bowl of artichokes',
    image_fulltext_caption: 'Seasonal vegetables'
  }
  assert.equal(compareAgentInventory(before, inventory(edited)).pass, true)
  assert.equal(
    compareAgentInventory(inventory(edited), inventory({ ...edited, image_intro_alt: 'Fresh oysters' })).pass,
    true
  )
  for (const changed of [
    { ...edited, float_intro: 'right' },
    { ...edited, image_intro_alt: true },
    { ...edited, arbitrary_layout: 'different' }
  ])
    assert.equal(compareAgentInventory(before, inventory(changed)).pass, false)
  const removed = { ...edited }
  delete removed.image_fulltext_caption
  assert.equal(compareAgentInventory(before, inventory(removed)).pass, false)
})

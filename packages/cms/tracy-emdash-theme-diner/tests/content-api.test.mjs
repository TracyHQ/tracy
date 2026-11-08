import test from 'node:test'
import assert from 'node:assert/strict'
import { queryOf, envelope, cursorCodec, MAX_BYTES } from '../tools/content-api/reader.mjs'
const options = {
  mapping: {
    chrome: { collection: 'site', slug: 's' },
    collections: {
      pages: { type: 'page', urlPattern: '/{slug}' },
      site: { type: 'shared', urlPattern: null }
    }
  },
  types: [
    {
      name: 'pages',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'rows', type: 'group' }
      ]
    },
    { name: 'site', fields: [{ name: 'title', type: 'text' }] }
  ],
  locales: ['en', 'fr'],
  defaultLocale: 'en'
}
const key = 'fixture-only-not-a-production-secret',
  identity = { user: 'u', role: 4, scopes: ['content:read'] }
const row = (id, collection = 'pages') => ({
  collection,
  item: {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    locale: 'en',
    slug: id,
    status: 'published',
    data: { title: 'Live ' + id, rows: [{ text: 'same' }, { text: 'same' }] }
  }
})
const read = (rows, q = { limit: 1 }, who = identity) =>
  envelope(rows, q, options, who, key, 'https://example.test')
test('query rejects ambiguous or unsupported input', () => {
  for (const q of [
    '?limit=01',
    '?limit=1&limit=2',
    '?locale[]=en',
    '?cursor=',
    '?type=any',
    '?id=x',
    '?unknown=1'
  ])
    assert.throws(() => queryOf(new URL('https://example.test/' + q), options.locales))
})
test('entry ID survives slug/value change; recreated entry differs', () => {
  const a = row('a'),
    first = read([a]).contents[0]
  a.item.slug = 'new'
  a.item.data.title = 'edited'
  assert.equal(read([a]).contents[0].id, first.id)
  a.item.id = 'b'
  assert.notEqual(read([a]).contents[0].id, first.id)
})
test('structured data is unresolved, never index/hash-derived row IDs', () => {
  const a = row('a'),
    id = read([a]).contents[0].id,
    r = read([a], { id, limit: 30 })
  assert.equal(r.completeness.status, 'partial')
  assert.ok(r.completeness.unresolved.some((x) => x.code === 'REPEATER_IDENTITY_UNSUPPORTED'))
  assert.deepEqual(r.contents[0].blocks, [])
  assert.deepEqual(
    r.contents[0].fields.map((f) => f.key),
    ['title']
  )
})
test('cursor binds full scope revision including a shared edit outside page filter', () => {
  const rows = [row('a'), row('b'), row('s', 'site')],
    q = { type: 'page', limit: 1 }
  const first = read(rows, q),
    next = { ...q, cursor: first.pagination.nextCursor }
  assert.equal(read(rows, next).snapshot.revision, first.snapshot.revision)
  rows[2].item.data.title = 'changed'
  assert.throws(() => read(rows, next), { status: 409 })
})
test('cursor binds principal/filter and rejects expired/tampered signatures', () => {
  const rows = [row('a'), row('b')],
    first = read(rows),
    cursor = first.pagination.nextCursor
  assert.throws(() => read(rows, { limit: 1, cursor }, { ...identity, role: 1 }), { status: 400 })
  assert.throws(() => read(rows, { limit: 2, cursor }), { status: 400 })
  assert.throws(() => read(rows, { limit: 1, cursor: cursor + 'x' }), { status: 400 })
  const codec = cursorCodec(key),
    old = codec.decode(cursor)
  old.expires = 0
  assert.throws(() => read(rows, { limit: 1, cursor: codec.encode(old) }), { status: 409 })
})
test('oversized scalar returns field identity, never silently truncates', () => {
  const rows = [row('a')],
    id = read(rows).contents[0].id
  rows[0].item.data.title = 'x'.repeat(MAX_BYTES)
  assert.throws(
    () => read(rows, { id, limit: 30 }),
    (e) => e.status === 413 && e.field.contentId === id && e.field.key === 'title'
  )
})

test('chrome references only the explicit template binding, not every shared record', () => {
  const rows = [row('a'), row('s', 'site'), row('unbound', 'site')],
    id = read(rows, { type: 'page', limit: 1 }).contents[0].id
  const c = read(rows, { id, limit: 30 }).contents[0]
  assert.equal(c.blocks.length, 1)
  assert.equal(c.blocks[0].sharedContentId, read([rows[1]]).contents[0].id)
})

test('chrome may name several entries; each one is a shared occurrence on a page', () => {
  const opts = structuredClone(options)
  opts.mapping.chrome = [
    { collection: 'site', slug: 's' },
    { collection: 'site', slug: 'footer' }
  ]
  const rows = [row('a'), row('s', 'site'), row('footer', 'site'), row('unbound', 'site')]
  const run = (q) => envelope(rows, q, opts, identity, key, 'https://example.test')
  const id = run({ type: 'page', limit: 1 }).contents[0].id
  const c = run({ id, limit: 30 }).contents[0]
  assert.equal(c.blocks.filter((b) => b.key === 'site-chrome').length, 2)
})

test('urlField takes a page path from its data; a value that is not a path falls back to the pattern', () => {
  const opts = structuredClone(options)
  opts.mapping.collections.pages = { type: 'page', urlPattern: '/{slug}', urlField: 'path' }
  const a = row('features')
  a.item.data.path = '/product/features'
  const b = row('plain')
  b.item.data.path = 'not-a-path'
  const urls = envelope([a, b], { type: 'page', limit: 30 }, opts, identity, key, 'https://example.test')
    .contents.map((c) => c.url)
    .sort()
  assert.deepEqual(urls, ['https://example.test/plain', 'https://example.test/product/features'])
})

test('identified repeaters paginate with stable IDs and expire on reorder', () => {
  const opts = structuredClone(options)
  opts.identifiedFields = ['pages.rows']
  opts.types[0].fields[1].fields = [{ name: 'text', type: 'text' }]
  const a = row('a')
  a.item.data.rows = Array.from({ length: 4 }, (_, i) => ({
    _rowId: `00000000-0000-4000-8000-00000000000${i}`,
    text: 'same'
  }))
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test', 'persistent-site-seed')
  const id = run({ limit: 30 }).contents[0].id,
    first = run({ id, limit: 2 }),
    next = new URL(first.contents[0].links.next, 'https://example.test')
  assert.equal(first.contents[0].detailState, 'partial')
  const second = run(queryOf(next, opts.locales))
  assert.deepEqual(
    second.contents[0].blocks[0].items.map((i) => i.position),
    [2, 3]
  )
  assert.equal(second.contents[0].blocks[0].itemsPagination.nextCursor, null)
  assert.equal(second.contents[0].detailState, 'partial')
  const before = first.contents[0].blocks[0].items[0].id
  a.item.data.rows.reverse()
  assert.throws(() => run(queryOf(next, opts.locales)), { status: 409 })
  assert.equal(run({ id, limit: 100 }).contents[0].blocks[0].items[3].id, before)
  const moved = envelope(
    [a],
    { id, limit: 100 },
    opts,
    identity,
    'rotated-cursor-key',
    'https://moved.test',
    'persistent-site-seed'
  )
  assert.equal(moved.site.id, first.site.id)
  assert.equal(moved.contents[0].id, id)
  const fork = envelope([a], { limit: 30 }, opts, identity, key, 'https://example.test', 'fork-seed')
  assert.notEqual(fork.site.id, first.site.id)
  assert.notEqual(fork.contents[0].id, id)
})
test('oversized body discovers signed block scan with explicit terminal partial state', () => {
  const opts = structuredClone(options)
  opts.mapping.collections.pages.bodyField = 'html'
  opts.identifiedFields = ['pages.rows']
  opts.types[0].fields[1].fields = [{ name: 'text', type: 'text' }]
  const a = row('a')
  a.item.data.html = 'x'.repeat(MAX_BYTES)
  a.item.data.rows = [{ _rowId: '00000000-0000-4000-8000-000000000000', text: 'live' }]
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test', 'site-seed'),
    id = run({ limit: 30 }).contents[0].id
  let error
  try {
    run({ id, limit: 30 })
  } catch (e) {
    error = e
  }
  assert.equal(error.status, 413)
  const q = queryOf(new URL(error.extras.links.firstBlock), opts.locales),
    block = run(q).contents[0]
  assert.equal(block.detailState, 'partial')
  assert.equal(block.blocksPagination.nextCursor, null)
  assert.equal(block.blocks[0].items[0].fields[0].value, 'live')
  assert.throws(() => run({ ...q, blockId: 'other' }), { status: 400 })
  a.item.data.title = 'change'
  assert.throws(() => run(q), { status: 409 })
})
test('images: the field keeps its key and URL, images[] names the block and item that hold it', () => {
  const opts = structuredClone(options)
  opts.identifiedFields = ['pages.rows']
  opts.types[0].fields.push({ name: 'hero_image', type: 'image' }, { name: 'plain_image', type: 'image' })
  opts.types[0].fields[1].fields = [
    { name: 'logo', type: 'image' },
    { name: 'text', type: 'text' }
  ]
  const local = (id, extra = {}) => ({
    id,
    provider: 'local',
    filename: `${id}.png`,
    meta: { storageKey: `${id}.key.png`, caption: 'not an alt' },
    ...extra
  })
  const a = row('a')
  a.item.data.hero_image = local('hero', { alt: 'Stored alt', width: 1600, height: 1000 })
  a.item.data.plain_image = 'https://cdn.example.test/p.jpg'
  a.item.data.rows = [
    { _rowId: '00000000-0000-4000-8000-000000000001', logo: local('logo-1', { width: 0 }), text: 'one' },
    { _rowId: '00000000-0000-4000-8000-000000000002', logo: local('hero'), text: 'two' },
    { _rowId: '00000000-0000-4000-8000-000000000003', logo: null, text: 'three' }
  ]
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test', 'seed')
  const id = run({ limit: 30 }).contents[0].id,
    c = run({ id, limit: 30 }).contents[0]
  const hero = c.fields.find((f) => f.key === 'hero_image')
  assert.deepEqual(hero, {
    key: 'hero_image',
    type: 'image',
    value: 'https://example.test/_emdash/api/media/file/hero.key.png',
    slotKey: null,
    semanticKey: null
  })
  assert.equal(c.fields.find((f) => f.key === 'plain_image').value, 'https://cdn.example.test/p.jpg')
  const block = c.blocks.find((b) => b.key === 'rows')
  assert.deepEqual(
    block.items.map((i) => i.fields.find((f) => f.key === 'logo').value),
    [
      'https://example.test/_emdash/api/media/file/logo-1.key.png',
      'https://example.test/_emdash/api/media/file/hero.key.png',
      null
    ]
  )
  const bySrc = new Map(c.images.map((m) => [m.src, m]))
  const heroImage = bySrc.get(hero.value)
  assert.equal(c.images.length, 3, 'one entry per stored media, the hero is used twice')
  assert.deepEqual([heroImage.alt, heroImage.width, heroImage.height], ['Stored alt', 1600, 1000])
  assert.deepEqual(
    new Set(heroImage.usages.map((u) => JSON.stringify(u))),
    new Set([
      JSON.stringify({ contentId: id, blockId: null, itemId: null }),
      JSON.stringify({ contentId: id, blockId: block.id, itemId: block.items[1].id })
    ])
  )
  const logo = bySrc.get('https://example.test/_emdash/api/media/file/logo-1.key.png')
  assert.deepEqual([logo.alt, logo.width, logo.height], [null, null, null], 'never invented')
  assert.deepEqual(logo.usages, [{ contentId: id, blockId: block.id, itemId: block.items[0].id }])
  // The listing stays light: no images in summaries.
  assert.equal(run({ limit: 30 }).contents[0].images, undefined)
  // An item page lists only the usages it can resolve.
  const first = run({ id, limit: 1 }).contents[0]
  assert.deepEqual(
    first.images.flatMap((m) => m.usages.map((u) => u.itemId)).sort(),
    [null, null, first.blocks.find((b) => b.key === 'rows').items[0].id].sort()
  )
  // An image value with no address is declared, not guessed.
  a.item.data.hero_image = { id: 'x', provider: 's3' }
  const bad = run({ id, limit: 30 })
  assert.ok(bad.completeness.unresolved.some((u) => u.code === 'FIELD_UNSUPPORTED' && u.key === 'hero_image'))
  assert.equal(
    bad.contents[0].fields.find((f) => f.key === 'hero_image'),
    undefined
  )
})

test('prose (multi-line text) reads as text, at the top level and inside a repeater', () => {
  // Site models type long copy as `prose` (hero text, band text, a service card's text). It is a
  // plain string; leaving it out made that copy invisible to content.read (46 fields in Business).
  const opts = structuredClone(options)
  opts.identifiedFields = ['pages.rows']
  opts.types[0].fields.push({ name: 'hero_text', type: 'prose' }, { name: 'launched', type: 'date' })
  opts.types[0].fields[1].fields = [
    { name: 'title', type: 'text' },
    { name: 'text', type: 'prose' }
  ]
  const a = row('a')
  a.item.data.hero_text = 'Design–build main contractor.\nTurnkey, on schedule.'
  a.item.data.launched = '2026-01-01'
  a.item.data.rows = [
    { _rowId: '00000000-0000-4000-8000-000000000001', title: 'Earthworks', text: 'Roads and water.' }
  ]
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test', 'seed')
  const id = run({ limit: 30 }).contents[0].id
  const r = run({ id, limit: 30 })
  const c = r.contents[0]
  assert.deepEqual(
    c.fields.find((f) => f.key === 'hero_text'),
    {
      key: 'hero_text',
      type: 'text',
      value: 'Design–build main contractor.\nTurnkey, on schedule.',
      slotKey: null,
      semanticKey: null
    }
  )
  const item = c.blocks.find((b) => b.key === 'rows').items[0]
  assert.equal(item.fields.find((f) => f.key === 'text').value, 'Roads and water.')
  const unresolved = r.completeness.unresolved.map((u) => u.key)
  assert.ok(!unresolved.includes('hero_text') && !unresolved.includes('rows.text'), 'prose is supported')
  // A type the reader still does not project stays declared, never guessed.
  assert.ok(unresolved.includes('launched'))
})

// Byte budget (`maxBytes`): pages by content against the UTF-8 of the JSON answer.
const bytesOf = (r) => Buffer.byteLength(JSON.stringify(r))
// Three pages whose listing summaries are ~2 KB, ~40 KB and ~3 KB, in the reader's own order.
const sized = () => {
  const rows = [row('a'), row('b'), row('c')]
  const order = read(rows, { limit: 30 }).contents.map((c) => c.slug)
  const byPosition = [1900, 40000, 2900]
  for (const r of rows) r.item.data.title = 'x'.repeat(byPosition[order.indexOf(r.item.slug)])
  const ids = read(rows, { limit: 30, maxBytes: MAX_BYTES }).contents.map((c) => c.id)
  return { rows, ids }
}
test('budget conformance: 2 KB, 40 KB, 3 KB at maxBytes 8192 page by content, the big one cut', () => {
  const { rows, ids } = sized()
  const q = { type: 'page', limit: 30, maxBytes: 8192 }
  const one = read(rows, q)
  assert.deepEqual(
    one.contents.map((c) => c.id),
    [ids[0]]
  )
  assert.equal(one.pagination.total, 3)
  assert.equal(one.pagination.budget, 8192)
  assert.equal(one.contents[0].truncated, undefined)
  assert.ok(one.pagination.nextCursor)
  const two = read(rows, { ...q, cursor: one.pagination.nextCursor })
  assert.deepEqual(
    two.contents.map((c) => c.id),
    [ids[1]]
  )
  assert.equal(two.contents[0].truncated, true)
  assert.equal(two.contents[0].title.length, 4096, 'the longest text is cut to maxBytes/2 characters')
  assert.equal(two.pagination.total, 3)
  const three = read(rows, { ...q, cursor: two.pagination.nextCursor })
  assert.deepEqual(
    three.contents.map((c) => c.id),
    [ids[2]]
  )
  assert.equal(three.pagination.nextCursor, null)
  for (const page of [one, two, three]) {
    assert.ok(bytesOf(page) <= 8192, `${bytesOf(page)} bytes`)
    assert.equal(page.pagination.bytes, bytesOf(page))
  }
  const seen = [one, two, three].flatMap((p) => p.contents.map((c) => c.id))
  assert.equal(new Set(seen).size, one.pagination.total)
})
test('budget: a detail read cuts the longest field, flags it, keeps the revision', () => {
  const opts = structuredClone(options)
  opts.types[0].fields.push({ name: 'body', type: 'text' }, { name: 'note', type: 'text' })
  const a = row('a')
  delete a.item.data.rows
  a.item.data.body = 'y'.repeat(40000)
  a.item.data.note = 'kept whole'
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test')
  const id = run({ limit: 30 }).contents[0].id
  const whole = run({ id, limit: 30, maxBytes: MAX_BYTES }).contents[0]
  const page = run({ id, limit: 30, maxBytes: 8192 })
  const c = page.contents[0]
  assert.ok(bytesOf(page) <= 8192)
  assert.equal(c.truncated, true)
  const body = c.fields.find((f) => f.key === 'body')
  assert.equal(body.truncated, true)
  assert.equal(body.value, 'y'.repeat(4096))
  const note = c.fields.find((f) => f.key === 'note')
  assert.deepEqual([note.value, note.truncated], ['kept whole', undefined])
  assert.equal(c.revision, whole.revision)
  assert.equal(whole.truncated, undefined)
  assert.equal(whole.fields.find((f) => f.key === 'body').value.length, 40000)
  // Multi-byte text is cut on code-point boundaries and further, until the answer fits.
  a.item.data.body = '😀'.repeat(40000)
  const wide = run({ id, limit: 30, maxBytes: 8192 })
  const cut = wide.contents[0].fields.find((f) => f.key === 'body').value
  assert.ok(bytesOf(wide) <= 8192, `${bytesOf(wide)} bytes`)
  assert.ok(cut.length > 0 && cut.isWellFormed() && Array.from(cut).length <= 4096)
})
test('budget: default 65536; limit still applies; out of range or malformed is refused by name', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`))
  for (const r of rows) r.item.data.title = 'z'.repeat(9000)
  const first = read(rows, { limit: 30 })
  assert.equal(first.pagination.budget, 65536)
  assert.ok(bytesOf(first) <= 65536)
  assert.ok(first.contents.length > 1 && first.contents.length < 12)
  assert.equal(read(rows, { limit: 2, maxBytes: MAX_BYTES }).contents.length, 2)
  assert.equal(queryOf(new URL('https://example.test/?maxBytes=8192'), options.locales).maxBytes, 8192)
  assert.equal(queryOf(new URL('https://example.test/'), options.locales).maxBytes, undefined)
  for (const v of ['8191', '262145', '1.5', '08192', 'abc', '-9000'])
    assert.throws(
      () => queryOf(new URL('https://example.test/?maxBytes=' + v), options.locales),
      (e) =>
        e.status === 400 &&
        e.code === 'CONTENT_BAD_QUERY' &&
        e.field === 'maxBytes' &&
        /8192 to 262144/.test(e.extras.message)
    )
})
test('budget: the cursor is not bound to maxBytes; a scan at any budget covers total once', () => {
  const rows = Array.from({ length: 9 }, (_, i) => row(`s${i}`))
  for (const r of rows) r.item.data.title = 'w'.repeat(3000)
  const budgets = [8192, 16384, 8192, 262144]
  const seen = []
  // The relay resends the same filters beside the cursor on every page.
  let page = read(rows, { type: 'page', limit: 30, maxBytes: budgets[0] }),
    turn = 0
  for (;;) {
    assert.ok(bytesOf(page) <= budgets[turn % budgets.length])
    seen.push(...page.contents.map((c) => c.id))
    if (!page.pagination.nextCursor) break
    const maxBytes = budgets[++turn % budgets.length]
    page = read(rows, { type: 'page', limit: 30, maxBytes, cursor: page.pagination.nextCursor })
  }
  assert.ok(turn >= 3, `${turn + 1} pages`)
  assert.equal(seen.length, 9)
  assert.equal(new Set(seen).size, page.pagination.total)
})
test('budget: without an explicit maxBytes nothing is cut, as before the budget existed', () => {
  // Listing: the default budget only decides how many whole contents fit.
  const rows = [row('a'), row('b')]
  for (const r of rows) r.item.data.title = 'q'.repeat(70000)
  const list = read(rows, { limit: 30 })
  assert.equal(list.contents.length, 1)
  assert.equal(list.contents[0].truncated, undefined)
  assert.equal(list.contents[0].title.length, 70000)
  assert.equal(list.pagination.bytes, bytesOf(list))
  // Detail: the 256 KiB ceiling as before; a 100 KB field comes back whole.
  const opts = structuredClone(options)
  opts.types[0].fields.push({ name: 'body', type: 'text' })
  const a = row('a')
  delete a.item.data.rows
  a.item.data.body = 'y'.repeat(100000)
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test')
  const id = run({ limit: 30 }).contents[0].id
  const detail = run({ id, limit: 30 })
  assert.equal(detail.pagination.budget, MAX_BYTES)
  assert.equal(detail.contents[0].truncated, undefined)
  assert.equal(detail.contents[0].fields.find((f) => f.key === 'body').value.length, 100000)
  // Beyond the ceiling the refusal is the old one, with or without maxBytes.
  a.item.data.body = 'y'.repeat(MAX_BYTES)
  for (const q of [
    { id, limit: 30 },
    { id, limit: 30, maxBytes: 8192 }
  ])
    assert.throws(
      () => run(q),
      (e) => e.status === 413 && e.field.key === 'body'
    )
})
test('prose: a plain string is one text value, Portable Text one value per block keyed by its _key', () => {
  const opts = structuredClone(options)
  opts.identifiedFields = ['pages.rows']
  opts.types[0].fields.push({ name: 'lede', type: 'prose' }, { name: 'content', type: 'prose' })
  opts.types[0].fields[1].fields = [{ name: 'text', type: 'prose' }]
  const span = (text, _key = 's') => ({ _type: 'span', _key, text, marks: [] })
  const a = row('a')
  a.item.data.lede = 'A long\nlede.'
  a.item.data.rows = [{ _rowId: '00000000-0000-4000-8000-000000000001', text: 'Row prose' }]
  a.item.data.content = [
    {
      _type: 'block',
      _key: 'k1',
      style: 'normal',
      markDefs: [],
      children: [span('First '), span('para', 't')]
    },
    { _type: 'block', _key: 'k2', style: 'h2', markDefs: [], children: [span('Heading')] },
    { _type: 'image', _key: 'k3', asset: { id: 'x' } },
    { _type: 'block', _key: 'k4', style: 'normal', listItem: 'bullet', children: [span('Item')] }
  ]
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test', 'site-seed')
  const id = run({ limit: 30 }).contents[0].id
  const c = run({ id, limit: 30 }).contents[0]
  const byKey = Object.fromEntries(c.fields.map((f) => [f.key, f]))
  assert.deepEqual(byKey.lede, {
    key: 'lede',
    type: 'text',
    value: 'A long\nlede.',
    slotKey: null,
    semanticKey: null
  })
  assert.equal(byKey['content.k1'].value, 'First para')
  assert.equal(byKey['content.k1'].type, 'text')
  assert.equal(byKey['content.k2'].value, 'Heading')
  assert.equal(byKey['content.k4'].value, 'Item')
  assert.equal(byKey['content.k3'], undefined, 'an image block is not text')
  assert.equal(byKey.content, undefined)
  assert.equal(c.blocks[0].items[0].fields[0].value, 'Row prose')
  // A paragraph keeps its id when another one is inserted above it.
  a.item.data.content.unshift({ _type: 'block', _key: 'k0', style: 'normal', children: [span('New')] })
  const again = run({ id, limit: 30 }).contents[0]
  assert.equal(again.fields.find((f) => f.key === 'content.k1').value, 'First para')
})

test('prose: blocks without a usable _key are unresolved, never index-derived', () => {
  const opts = structuredClone(options)
  opts.types[0].fields.push({ name: 'content', type: 'prose' })
  const block = (_key, text) => ({
    _type: 'block',
    _key,
    style: 'normal',
    children: [{ _type: 'span', text }]
  })
  const a = row('a')
  a.item.data.content = [
    block('dup', 'one'),
    block('dup', 'two'),
    block(undefined, 'three'),
    block('a.b', 'dot'),
    block('ok', 'kept')
  ]
  const run = (q) => envelope([a], q, opts, identity, key, 'https://example.test', 'site-seed')
  const id = run({ limit: 30 }).contents[0].id
  const r = run({ id, limit: 30 })
  assert.deepEqual(
    r.contents[0].fields.filter((f) => f.key.startsWith('content')).map((f) => f.key),
    ['content.ok']
  )
  assert.ok(r.completeness.unresolved.some((u) => u.code === 'PROSE_IDENTITY_INVALID' && u.key === 'content'))
  // Something that is neither a string nor Portable Text stays unsupported.
  a.item.data.content = { html: '<p>x</p>' }
  const odd = run({ id, limit: 30 })
  assert.ok(odd.completeness.unresolved.some((u) => u.code === 'FIELD_UNSUPPORTED' && u.key === 'content'))
})

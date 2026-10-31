// The native read behind content.read: sourceRows() takes the records from native list pages and
// fetches an entry on its own only when a draft overlay could make the GET differ. Its answer must
// be the one the per-entry scan gave (same records, same bytes, so the same revisions, totals,
// first rows and cursors), over a 2000-record scope with drafts, in both scopes and for a caller
// whose native GET hides draft fields.
import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceRows, envelope, project, hasher, ContentError } from '../tools/content-api/reader.mjs'

const options = {
  mapping: {
    chrome: { collection: 'site', slug: 'site' },
    collections: {
      pages: { type: 'page', urlPattern: '/{slug}' },
      posts: { type: 'article', urlPattern: '/news/{slug}' },
      site: { type: 'shared', urlPattern: null }
    }
  },
  types: [
    {
      name: 'pages',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'hero', type: 'image' }
      ]
    },
    { name: 'posts', fields: [{ name: 'title', type: 'text' }] },
    { name: 'site', fields: [{ name: 'title', type: 'text' }] }
  ],
  locales: ['en', 'fr'],
  defaultLocale: 'en'
}
const collections = Object.keys(options.mapping.collections)

// 2000 records as EmDash 0.38 maps a row (key order included); every 50th has a pending draft,
// every 70th is unpublished. `stripDrafts` is the native GET for a caller without read_drafts.
function source({ stripDrafts = false } = {}) {
  const store = Object.fromEntries(collections.map((c) => [c, []]))
  const revisions = new Map()
  for (let n = 1; n <= 2000; n++) {
    const collection = n % 50 === 7 ? 'site' : n % 3 ? 'pages' : 'posts'
    const id = `01K${String(n).padStart(23, '0')}`
    const at = new Date(Date.UTC(2026, 8, 1) + n * 1000).toISOString()
    const locale = n % 2 ? 'en' : 'fr'
    const draft = n % 50 === 0 ? `REV${id}` : null
    if (draft) revisions.set(draft, { title: `Draft ${n}` })
    store[collection].push({
      id,
      type: collection,
      slug: collection === 'site' ? 'site' : `entry-${n}`,
      status: n % 70 === 0 ? 'draft' : 'published',
      data: {
        title: `Entry ${n}`,
        ...(collection === 'pages' ? { hero: { id: `m${n}`, src: `/img/${n}.png`, alt: null } } : {})
      },
      authorId: null,
      primaryBylineId: null,
      createdAt: at,
      updatedAt: at,
      publishedAt: at,
      scheduledAt: null,
      liveRevisionId: `L${id}`,
      draftRevisionId: draft,
      version: 1,
      locale,
      translationGroup: `${collection}-${Math.ceil(n / 2)}`,
      bylines: [],
      byline: null
    })
  }
  const calls = { list: 0, get: 0 }
  const wire = (value) => JSON.parse(JSON.stringify(value))
  const visible = (collection) =>
    store[collection].filter((e) => !stripDrafts || e.status === 'published').toReversed()
  return {
    calls,
    list: async (collection, cursor) => {
      calls.list++
      const all = visible(collection)
      const from = cursor ? Number(cursor) : 0
      const items = all.slice(from, from + 100)
      return wire({
        items,
        nextCursor: from + 100 < all.length ? String(from + 100) : null,
        total: all.length
      })
    },
    get: async (collection, id) => {
      calls.get++
      let item = wire(store[collection].find((e) => e.id === id))
      if (item.draftRevisionId) {
        const liveData = item.data
        item = { ...item, data: { ...liveData, ...revisions.get(item.draftRevisionId) }, liveData }
      }
      if (stripDrafts) {
        if (item.status !== 'published') throw new ContentError(503, 'CONTENT_SOURCE_UNAVAILABLE')
        if (item.liveData) item.data = item.liveData
        delete item.liveData
        delete item.draftRevisionId
      }
      return wire({ item, _rev: 'rev' })
    }
  }
}

// The scan route.mjs ran before sourceRows(): one native GET per listed entry.
async function perEntryRows({ list, get }, published) {
  const rows = []
  for (const collection of collections) {
    let cursor
    do {
      const page = await list(collection, cursor)
      for (const entry of page.items) {
        const { item } = await get(collection, entry.id)
        if (item.draftRevisionId && !item.liveData) throw new ContentError(503, 'CONTENT_SOURCE_UNAVAILABLE')
        if (published) {
          if (item.status !== 'published') continue
          item.data = item.liveData ?? item.data
          item.draftRevisionId = null
          delete item.liveData
        }
        rows.push({ collection, item })
      }
      cursor = page.nextCursor
    } while (cursor)
  }
  return rows
}

const key = 'fixture-only-not-a-production-secret'
const identity = { contentPrincipal: null, contentScope: 'published', user: 'u', role: 50, scopes: [] }
const origin = 'https://example.test'
const probes = [
  { limit: 1 },
  ...['page', 'article', 'shared', 'generic'].map((type) => ({ type, limit: 1 }))
].map((q) => ({ ...q, maxBytes: 8192 }))

for (const [label, published, stripDrafts] of [
  ['published scope', true, false],
  ['editorial scope', false, false],
  ['caller without read_drafts', true, true]
]) {
  test(`sourceRows gives the per-entry scan's records, byte for byte: ${label}`, async () => {
    const before = source({ stripDrafts })
    const after = source({ stripDrafts })
    const expected = await perEntryRows(before, published)
    const rows = await sourceRows({ collections, list: after.list, get: after.get, published })
    assert.equal(JSON.stringify(rows), JSON.stringify(expected))
    assert.equal(after.calls.list, before.calls.list)
    if (stripDrafts)
      // The first GET differs from its list item, so every entry is read natively, as before.
      assert.equal(after.calls.get, before.calls.get)
    else assert.equal(after.calls.get, 40 + collections.length, 'one GET per draft, plus one shape check per collection')

    const now = Date.now
    Date.now = () => 1790000000000
    try {
      const read = (r, q) => {
        const answer = envelope(r, q, options, identity, key, origin, 'seed')
        answer.snapshot.readAt = null
        return JSON.stringify(answer)
      }
      for (const q of probes) {
        const first = read(expected, q)
        assert.equal(read(rows, q), first)
        const cursor = JSON.parse(first).pagination.nextCursor
        if (cursor) assert.equal(read(rows, { ...q, cursor }), read(expected, { ...q, cursor }))
      }
      const listed = JSON.parse(read(expected, { limit: 100 })).contents
      for (const c of listed.filter((_, i) => i % 9 === 0))
        assert.equal(read(rows, { id: c.id, limit: 30 }), read(expected, { id: c.id, limit: 30 }))
    } finally {
      Date.now = now
    }
  })
}

test('a listing summary is the full projection with its detail dropped', async () => {
  const s = source()
  const rows = await sourceRows({ collections, list: s.list, get: s.get, published: true })
  const hash = hasher('seed')
  const full = new Map(
    rows.map(({ item, collection }) => {
      const { content } = project(item, collection, options, hash, origin)
      for (const k of ['bodyHtml', 'tags', 'fields', 'blocks', 'images', 'relations']) delete content[k]
      return [content.id, { ...content, detailState: 'summary' }]
    })
  )
  const page = envelope(rows, { limit: 100 }, options, identity, key, origin, 'seed')
  assert.equal(page.contents.length, 100)
  for (const c of page.contents) assert.deepEqual(c, full.get(c.id))
})

test('a draft whose overlay failed still fails closed', async () => {
  const s = source()
  const get = async (collection, id) => {
    const answer = await s.get(collection, id)
    delete answer.item.liveData
    return answer
  }
  await assert.rejects(sourceRows({ collections, list: s.list, get, published: true }), {
    status: 503,
    code: 'CONTENT_SOURCE_UNAVAILABLE'
  })
})

test('reference-free schema avoids per-entry hydration and retains exact native revisions', async () => {
  for (const published of [true, false]) {
    const s = source()
    const get = async (collection, id) => {
      const answer = await s.get(collection, id)
      if (answer.item.translationGroup) answer.item.references = {}
      return answer
    }
    const expected = await perEntryRows({ list: s.list, get }, published)
    s.calls.get = 0
    const rows = await sourceRows({ collections, list: s.list, get, published, referenceFree: new Set(collections) })
    assert.equal(JSON.stringify(rows), JSON.stringify(expected))
    assert.equal(s.calls.get, 43)
  }
})
test('a reference collection falls back independently without disabling safe sibling collections', async () => {
  const s = source()
  const get = async (collection, id) => {
    const answer = await s.get(collection, id)
    if (answer.item.translationGroup) answer.item.references = collection === 'pages' ? { child: { children: [{ id: 'real-child' }] } } : {}
    return answer
  }
  const expected = await perEntryRows({ list: s.list, get }, true)
  s.calls.get = 0
  const rows = await sourceRows({ collections, list: s.list, get, published: true, referenceFree: new Set(['posts', 'site']) })
  assert.equal(JSON.stringify(rows), JSON.stringify(expected))
  assert(s.calls.get < 1500)
})

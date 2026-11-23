// tools/personalize.mjs, a seed's picture path where the importer put a picture (TracyHQ/tracy#572), and the upload of a
// drawn picture sent to the origin EmDash names (TracyHQ/tracy#532). JA Restaurant and JA Diner keep
// `images/joomlart/slideshow/slide-1.jpg` at a `seed/media-map.json` spot; the importer replaces it with the picture it
// placed on the site, and Apply rewrote the row from the seed: the source path won over the imported picture and the site
// answered 404 at /images/joomlart/... . The upload door is either the site's own route (the bearer goes with it) or a
// signed URL on the storage's origin (the bearer never leaves the site). Unit cases, so the kit and every template carry the
// same file.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { keepImportedPictures, keepSiteRowKeys, uploadPicture, uploadRequest } from '../tools/personalize.mjs'

// The value the importer writes at a spot (`seed-apply.mjs` `media()`): the item's file name rides along.
const pic = (id, filename) => ({
  provider: 'local',
  id,
  src: `/_emdash/api/media/file/${id}.jpg`,
  ...(filename ? { filename } : {})
})
const seedData = {
  items: [
    { title: 'Slide one', image: 'images/joomlart/slideshow/slide-1.jpg' },
    { title: 'Slide two', image: 'images/joomlart/slideshow/slide-2.jpg' }
  ]
}
const live = {
  items: [
    { title: 'Slide one', image: pic('m1', 'slide-1.jpg') },
    { title: 'Slide two', image: pic('m2', 'slide-2.jpg') }
  ]
}
// `seed/media-map.json`: each spot names the item whose file the importer put there.
const targets = [
  { path: 'items[0].image', file: 'slide-1.jpg' },
  { path: 'items[1].image', file: 'slide-2.jpg' }
]

test('a seed picture path at a media-map spot keeps the picture the importer placed on the site', () => {
  const fields = {
    items: [
      { title: 'Fresh bread', image: 'images/joomlart/slideshow/slide-1.jpg' },
      { title: 'Warm soup', image: 'images/joomlart/slideshow/slide-2.jpg' }
    ]
  }
  const out = keepImportedPictures(fields, live, seedData, targets)
  assert.deepEqual(out.items[0], { title: 'Fresh bread', image: pic('m1', 'slide-1.jpg') })
  assert.deepEqual(out.items[1], { title: 'Warm soup', image: pic('m2', 'slide-2.jpg') })
  // The run's own value is not changed in place.
  assert.equal(fields.items[0].image, 'images/joomlart/slideshow/slide-1.jpg')
  // And keepSiteRowKeys, which runs after it, keeps the imported picture instead of the path.
  const written = keepSiteRowKeys(out.items, live.items)
  assert.deepEqual(written[0].image, pic('m1', 'slide-1.jpg'))
})

test('a picture the run chose itself (drawn, uploaded, emptied) still wins', () => {
  const drawn = pic('drawn-1')
  const fields = {
    items: [
      { title: 'Fresh bread', image: drawn },
      { title: 'Warm soup', image: '' }
    ]
  }
  const out = keepImportedPictures(fields, live, seedData, targets)
  assert.deepEqual(out.items[0].image, drawn)
  assert.equal(out.items[1].image, '')
})

test('a row moved up keeps its own picture: a path is matched by value, not by row', () => {
  const fields = {
    items: [
      { title: 'Slide two, now first', image: 'images/joomlart/slideshow/slide-2.jpg' },
      { title: 'Slide one, now second', image: 'images/joomlart/slideshow/slide-1.jpg' }
    ]
  }
  const out = keepImportedPictures(fields, live, seedData, targets)
  assert.deepEqual(out.items[0].image, pic('m2', 'slide-2.jpg'))
  assert.deepEqual(out.items[1].image, pic('m1', 'slide-1.jpg'))
  // One row cut: the one left keeps the picture of the row it was.
  const cut = keepImportedPictures(
    { items: [{ title: 'Only two', image: 'images/joomlart/slideshow/slide-2.jpg' }] },
    live,
    seedData,
    targets
  )
  assert.deepEqual(cut.items, [{ title: 'Only two', image: pic('m2', 'slide-2.jpg') }])
})

test('nothing to put back: no spot, no seed data, or a site that still holds the path', () => {
  const fields = { items: [{ title: 'x', image: 'images/joomlart/slideshow/slide-1.jpg' }] }
  assert.equal(keepImportedPictures(fields, live, seedData, []), fields)
  assert.equal(keepImportedPictures(fields, live, undefined, targets), fields)
  assert.equal(keepImportedPictures(fields, seedData, seedData, targets), fields)
  // A path at a field the spot names, top level: outside a list the spot cannot move, a value without a name is paired.
  const top = keepImportedPictures(
    { hero: 'images/joomlart/hero.jpg' },
    { hero: pic('h') },
    { hero: 'images/joomlart/hero.jpg' },
    ['hero']
  )
  assert.deepEqual(top.hero, pic('h'))
})

test('two Applies that move rows: each path keeps its own picture on the second run too (review of #572)', () => {
  const A = 'images/joomlart/slideshow/slide-1.jpg'
  const B = 'images/joomlart/slideshow/slide-2.jpg'
  const seed = {
    items: [
      { title: 'A', image: A },
      { title: 'B', image: B }
    ]
  }
  const imported = {
    items: [
      { title: 'A', image: pic('media-a', 'slide-1.jpg') },
      { title: 'B', image: pic('media-b', 'slide-2.jpg') }
    ]
  }
  const moved = {
    items: [
      { title: 'B', image: B },
      { title: 'A', image: A }
    ]
  }
  const run1 = keepImportedPictures(moved, imported, seed, targets)
  assert.deepEqual(
    run1.items.map((r) => r.image.id),
    ['media-b', 'media-a']
  )
  // The site now holds run 1's rows; run 2 writes the same order from the seed again, and then the seed's own order.
  const site = { items: run1.items.map((r, i) => keepSiteRowKeys([r], [imported.items[i]])[0]) }
  const run2 = keepImportedPictures(moved, site, seed, targets)
  assert.deepEqual(
    run2.items.map((r) => r.image.id),
    ['media-b', 'media-a']
  )
  const back = keepImportedPictures(seed, site, seed, targets)
  assert.deepEqual(
    back.items.map((r) => r.image.id),
    ['media-a', 'media-b']
  )
})

test('a picture without the file name is never paired inside a list: the path is left, moved or not', () => {
  const A = 'images/joomlart/slideshow/slide-1.jpg'
  const B = 'images/joomlart/slideshow/slide-2.jpg'
  const seed = {
    items: [
      { title: 'A', image: A },
      { title: 'B', image: B }
    ]
  }
  const moved = {
    items: [
      { title: 'B', image: B },
      { title: 'A', image: A }
    ]
  }
  // Even the first Apply after import, rows in seed order: a list's row can have moved, so no position is trusted.
  const fresh = {
    items: [
      { title: 'A', image: pic('media-a') },
      { title: 'B', image: pic('media-b') }
    ]
  }
  assert.deepEqual(
    keepImportedPictures(moved, fresh, seed, targets).items.map((r) => r.image),
    [B, A]
  )
  // After an Apply moved the rows: the path is left rather than a picture swapped.
  const after = {
    items: [
      { title: 'B', image: pic('media-b') },
      { title: 'A', image: pic('media-a') }
    ]
  }
  assert.deepEqual(
    keepImportedPictures(moved, after, seed, targets).items.map((r) => r.image),
    [B, A]
  )
  // A row with no key but the picture proves nothing either.
  const bare = keepImportedPictures(
    { g: [{ image: B }] },
    { g: [{ image: pic('x') }] },
    { g: [{ image: A }] },
    ['g[0].image']
  )
  assert.deepEqual(bare.g, [{ image: B }])
  // Two pictures with the item's name (a server that renamed one): not one picture, so not chosen by name.
  const twice = {
    items: [
      { title: 'Z', image: pic('m1', 'slide-1.jpg') },
      { title: 'Y', image: pic('m3', 'slide-1.jpg') }
    ]
  }
  assert.deepEqual(
    keepImportedPictures(moved, twice, seed, targets).items.map((r) => r.image),
    [B, A]
  )
})

test('one picture goes to one seed path: a name two source files share names neither (review of #572, round 2)', () => {
  const A = 'images/joomlart/a/cover.jpg'
  const B = 'images/joomlart/b/cover.jpg'
  const seed = {
    items: [
      { title: 'A', image: A },
      { title: 'B', image: B }
    ]
  }
  const spots = [
    { path: 'items[0].image', file: 'a/cover.jpg' },
    { path: 'items[1].image', file: 'b/cover.jpg' }
  ]
  // The library kept the second upload as cover-2.jpg (`ensureUniqueFilename`): `cover.jpg` finds media-a only.
  const fresh = {
    items: [
      { title: 'A', image: pic('media-a', 'cover.jpg') },
      { title: 'B', image: pic('media-b', 'cover-2.jpg') }
    ]
  }
  // The name says neither, and a spot in a list is not paired by position: both keep their source path, never media-a twice.
  assert.deepEqual(
    keepImportedPictures(seed, fresh, seed, spots).items.map((r) => r.image),
    [A, B]
  )
  // Rows moved since: the same.
  const after = {
    items: [
      { title: 'B', image: pic('media-b', 'cover-2.jpg') },
      { title: 'A', image: pic('media-a', 'cover.jpg') }
    ]
  }
  const moved = {
    items: [
      { title: 'B', image: B },
      { title: 'A', image: A }
    ]
  }
  assert.deepEqual(
    keepImportedPictures(moved, after, seed, spots).items.map((r) => r.image),
    [B, A]
  )
  // One file at two spots whose seed paths differ: its picture is given by name to neither, and in a list not by position.
  const one = [
    { path: 'items[0].image', file: 'x/cover.jpg' },
    { path: 'items[1].image', file: 'x/cover.jpg' }
  ]
  const same = {
    items: [
      { title: 'A', image: pic('media-x', 'cover.jpg') },
      { title: 'Q', image: pic('media-x', 'cover.jpg') }
    ]
  }
  assert.deepEqual(
    keepImportedPictures(seed, same, seed, one).items.map((r) => r.image),
    [A, B]
  )
  // Outside a list a spot cannot move, but a picture is still one seed path's at most.
  const top = keepImportedPictures(
    { hero: 'images/joomlart/a/cover.jpg', side: 'images/joomlart/b/cover.jpg' },
    { hero: pic('media-x'), side: pic('media-x') },
    { hero: 'images/joomlart/a/cover.jpg', side: 'images/joomlart/b/cover.jpg' },
    ['hero', 'side']
  )
  assert.deepEqual(top, { hero: 'images/joomlart/a/cover.jpg', side: 'images/joomlart/b/cover.jpg' })
})

test('rows alike in every other value, swapped, never swap pictures (review of #572, round 3)', () => {
  const A = 'images/joomlart/a/cover.jpg'
  const B = 'images/joomlart/b/cover.jpg'
  const seed = {
    items: [
      { title: 'Dish', image: A },
      { title: 'Dish', image: B }
    ]
  }
  const spots = [
    { path: 'items[0].image', file: 'a/cover.jpg' },
    { path: 'items[1].image', file: 'b/cover.jpg' }
  ]
  // The site's rows were swapped; both still read "Dish", as the seed's rows do.
  const swapped = {
    items: [
      { title: 'Dish', image: pic('media-b', 'cover-2.jpg') },
      { title: 'Dish', image: pic('media-a', 'cover.jpg') }
    ]
  }
  const out = keepImportedPictures(seed, swapped, seed, spots)
  assert.deepEqual(
    out.items.map((r) => r.image),
    [A, B]
  )
  // Without names, the same: no picture is taken from a position in a list.
  const unnamed = {
    items: [
      { title: 'Dish', image: pic('media-b') },
      { title: 'Dish', image: pic('media-a') }
    ]
  }
  assert.deepEqual(
    keepImportedPictures(seed, unnamed, seed, targets).items.map((r) => r.image),
    [A, B]
  )
})

// EmDash 1.1.0 `MediaRepository.findAvailableFilename` (src/database/repositories/media.ts:438), which the importer's
// upload asks for (`ensureUniqueFilename: true`): a name the library holds, in any case, becomes `<stem>-<n><ext>`, n >= 2.
const libraryName = (/** @type {Set<string>} */ names, /** @type {string} */ filename) => {
  const has = (/** @type {string} */ c) => names.has(c.toLowerCase())
  let out = filename
  if (has(filename)) {
    const dot = filename.lastIndexOf('.')
    const [stem, ext] = dot > 0 ? [filename.slice(0, dot), filename.slice(dot)] : [filename, '']
    let n = 2
    while (has(`${stem}-${n}${ext}`)) n += 1
    out = `${stem}-${n}${ext}`
  }
  names.add(out.toLowerCase())
  return out
}

// The names JA Restaurant and JA Diner share between two different files, each in another entry (TracyHQ/tracy, after
// #36): Restaurant gallery/ and features-intro/ intro-1..5,8.jpg; Diner blog/, slideshow/ and features/ item-1..4.jpg.
// A seed and a media map of the templates' shape, holding only those spots.
const listEntry = (collection, slug, field, dir, names) => ({
  entry: {
    slug,
    data: {
      [field]: names.map((n, i) => ({ title: `${slug} ${i + 1}`, image: `images/joomlart/${dir}/${n}` }))
    }
  },
  collection,
  items: names.map((n, i) => ({
    key: `${dir}-${n}`,
    file: `${dir}/${n}`,
    mime: 'image/jpeg',
    targets: [{ collection, slug, path: `${field}[${i}].image` }]
  }))
})
const template = (parts) => {
  const seed = { defaultLocale: 'en', content: {} }
  const mediaMap = { items: [] }
  for (const p of parts) {
    ;(seed.content[p.collection] ??= []).push(p.entry)
    mediaMap.items.push(...p.items)
  }
  return { seed, mediaMap }
}
const intro = ['intro-1.jpg', 'intro-2.jpg', 'intro-3.jpg', 'intro-4.jpg', 'intro-5.jpg', 'intro-8.jpg']
const item = ['item-1.jpg', 'item-2.jpg', 'item-3.jpg', 'item-4.jpg']
const restaurant = template([
  listEntry('pages', 'gallery', 'photos', 'gallery', intro),
  listEntry('pages', 'home', 'intro', 'features-intro', intro)
])
const diner = template([
  ...item.map((n, i) => ({
    entry: { slug: `post-${i + 1}`, data: { title: `Post ${i + 1}`, image: `images/joomlart/blog/${n}` } },
    collection: 'posts',
    items: [
      {
        key: `blog-${n}`,
        file: `blog/${n}`,
        mime: 'image/jpeg',
        targets: [{ collection: 'posts', slug: `post-${i + 1}`, path: 'image' }]
      }
    ]
  })),
  listEntry('pages', 'home', 'slides', 'slideshow', item),
  listEntry('pages', 'about', 'features', 'features', item)
])

test('a picture the library renamed (`intro-4-2.jpg`) is still found by its source name: every spot gets its own', () => {
  for (const [name, { seed, mediaMap }] of Object.entries({ restaurant, diner })) {
    // The import: one upload per media-map item, in map order, each named by the library; the value at each spot.
    const names = new Set()
    const live = structuredClone(seed.content)
    const pictureOf = new Map()
    for (const m of mediaMap.items) {
      const value = pic(`media-${m.key}`, libraryName(names, m.file.split('/').pop()))
      pictureOf.set(m.key, value)
      for (const t of m.targets) {
        const entry = live[t.collection].find((e) => e.slug === t.slug)
        const parts = t.path.replace(/\[(\d+)\]/g, '.$1').split('.')
        const holder = parts.slice(0, -1).reduce((node, k) => node[k], entry.data)
        holder[parts[parts.length - 1]] = value
      }
    }
    // The library did rename: the case is the one reported, not a lucky order.
    assert.ok(
      [...names].some((n) => /-\d+\.jpg$/.test(n) && !/^(intro|item)-\d+\.jpg$/.test(n)),
      name
    )
    // Apply writes every entry back from the seed, as personalize groups the spots (`pictureSpotsOf`).
    for (const [collection, entries] of Object.entries(seed.content))
      for (const e of entries) {
        const spots = mediaMap.items.flatMap((m) =>
          m.targets
            .filter((t) => t.collection === collection && t.slug === e.slug)
            .map((t) => ({ path: t.path, file: m.file, key: m.key }))
        )
        const liveData = live[collection].find((x) => x.slug === e.slug).data
        const out = keepImportedPictures(e.data, liveData, e.data, spots)
        for (const s of spots) {
          const parts = s.path.replace(/\[(\d+)\]/g, '.$1').split('.')
          const got = parts.reduce((node, k) => node[k], out)
          assert.deepEqual(got, pictureOf.get(s.key), `${name} ${collection}/${e.slug} ${s.path}`)
        }
      }
  }
})

test('a name that fits two source files of the entry, as itself and as the library’s rename, is used for neither', () => {
  const seed = { items: [{ image: 'images/joomlart/a/item.jpg' }, { image: 'images/joomlart/b/item-2.jpg' }] }
  const spots = [
    { path: 'items[0].image', file: 'a/item.jpg' },
    { path: 'items[1].image', file: 'b/item-2.jpg' }
  ]
  // `item-2.jpg` is b's own name and the library's second `item.jpg`: it says neither, and a keeps its path.
  const live = { items: [{ image: pic('m-x', 'item-2.jpg') }, { image: pic('m-y', 'item-2-2.jpg') }] }
  assert.deepEqual(
    keepImportedPictures(seed, live, seed, spots).items.map((r) => r.image),
    ['images/joomlart/a/item.jpg', pic('m-y', 'item-2-2.jpg')]
  )
  // Only the ambiguous name on the site: both keep their path.
  const only = { items: [{ image: pic('m-x', 'item-2.jpg') }, { image: pic('m-z') }] }
  assert.deepEqual(
    keepImportedPictures(seed, only, seed, spots).items.map((r) => r.image),
    ['images/joomlart/a/item.jpg', 'images/joomlart/b/item-2.jpg']
  )
  // EmDash counts from 2: `item-1.jpg` is no rename of `item.jpg`, so with sources item.jpg and item-1.jpg it is item-1's.
  const one = { items: [{ image: 'images/joomlart/a/item.jpg' }, { image: 'images/joomlart/b/item-1.jpg' }] }
  const oneSpots = [
    { path: 'items[0].image', file: 'a/item.jpg' },
    { path: 'items[1].image', file: 'b/item-1.jpg' }
  ]
  const held = { items: [{ image: pic('m-a', 'item.jpg') }, { image: pic('m-b', 'item-1.jpg') }] }
  assert.deepEqual(
    keepImportedPictures(one, held, one, oneSpots).items.map((r) => r.image.id),
    ['m-a', 'm-b']
  )
  // Nor is a name with another suffix: `item-x.jpg`, `item-02.jpg`.
  const odd = { items: [{ image: pic('m-c', 'item-02.jpg') }, { image: pic('m-d', 'item-x.jpg') }] }
  assert.deepEqual(
    keepImportedPictures(one, odd, one, oneSpots).items.map((r) => r.image),
    ['images/joomlart/a/item.jpg', 'images/joomlart/b/item-1.jpg']
  )
})

test('the upload to the site’s own route carries the bearer; a signed URL on another origin never does', () => {
  const site = 'http://127.0.0.1:4321'
  const own = uploadRequest(
    { uploadUrl: '/_emdash/api/media/m1/upload', headers: { 'x-extra': '1' } },
    { site, token: 'T', mime: 'image/jpeg' }
  )
  assert.equal(own.url.href, `${site}/_emdash/api/media/m1/upload`)
  assert.equal(own.init.method, 'PUT')
  assert.equal(own.init.redirect, 'error')
  assert.equal(own.init.headers.get('authorization'), 'Bearer T')
  assert.equal(own.init.headers.get('x-emdash-request'), '1')
  assert.equal(own.init.headers.get('content-type'), 'image/jpeg')
  assert.equal(own.init.headers.get('x-extra'), '1')

  const signed = uploadRequest(
    {
      uploadUrl: 'https://bucket.example.com/m1?X-Amz-Signature=abc',
      method: 'PUT',
      headers: { 'x-amz-acl': 'private', Authorization: 'leak', 'X-EmDash-Request': '1' }
    },
    { site, token: 'T', mime: 'image/png' }
  )
  assert.equal(signed.url.origin, 'https://bucket.example.com')
  assert.equal(signed.init.headers.get('authorization'), null)
  assert.equal(signed.init.headers.get('x-emdash-request'), null)
  assert.equal(signed.init.headers.get('x-amz-acl'), 'private')
  assert.equal(signed.init.headers.get('content-type'), 'image/png')
  assert.equal(signed.init.redirect, 'error')

  // An absolute URL on the site's own origin is the site's door too.
  const absolute = uploadRequest(
    { uploadUrl: `${site}/_emdash/api/media/m2/upload` },
    { site, token: 'T', mime: 'image/jpeg' }
  )
  assert.equal(absolute.init.headers.get('authorization'), 'Bearer T')
})

test('uploadPicture sends the bytes where uploadRequest says, then confirms', async () => {
  const calls = []
  const api = async (method, route, body) => {
    calls.push([method, route, body])
    if (route === '/_emdash/api/media/upload-url')
      return {
        mediaId: 'm9',
        uploadUrl: 'https://bucket.example.com/m9?sig=1',
        headers: { 'x-amz-acl': 'private' }
      }
    return {}
  }
  const puts = []
  const fetchImpl = async (url, init) => {
    puts.push({ url: String(url), init })
    return { ok: true, status: 200 }
  }
  const bytes = Buffer.from('picture')
  await uploadPicture(
    api,
    'T',
    { bytes, mime: 'image/jpeg', filename: 'p.jpg', alt: 'A picture' },
    {
      fetchImpl,
      site: 'http://127.0.0.1:4321'
    }
  )
  assert.equal(puts.length, 1)
  assert.equal(puts[0].url, 'https://bucket.example.com/m9?sig=1')
  assert.equal(puts[0].init.headers.get('authorization'), null)
  assert.equal(puts[0].init.body, bytes)
  assert.ok(calls.some(([m, r]) => m === 'POST' && r === '/_emdash/api/media/m9/confirm'))

  await assert.rejects(
    uploadPicture(
      api,
      'T',
      { bytes, mime: 'image/jpeg', filename: 'p.jpg', alt: '' },
      {
        fetchImpl: async () => ({ ok: false, status: 403 }),
        site: 'http://127.0.0.1:4321'
      }
    ),
    /upload p\.jpg → HTTP 403/
  )
})

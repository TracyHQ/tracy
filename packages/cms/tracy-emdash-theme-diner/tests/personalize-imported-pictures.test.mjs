// tools/personalize.mjs on THIS template's whole seed, against a site whose pictures the importer has placed. This seed
// keeps the source's picture path at every spot the importer fills (`images/joomlart/slideshow/slide-1.jpg` at
// `slideshow/slideshow items[0].image`, `seed/media-map.json`), and the site holds the imported picture there instead. A
// list or an object the run writes from the seed carries that path, and the path is no file on the site: measured
// 11/11/2026 on dev (JA Restaurant 1.0.2, a site made through Add site; JA Diner holds such paths too), the home slideshow, the offer cards and the menu
// pages showed 33 broken pictures at /images/joomlart/... while the demo site, never personalized, showed all of them.
// The picture is found by the file name the importer writes into the value (`seed-apply.mjs` `filename`), not by the row
// it sits in: after an Apply that moved rows, pairing by row gave each path another row's picture (review of #572).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { keepImportedPictures } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const media = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'media-map.json'), 'utf8'))

/** The value the importer writes at a spot (`seed-apply.mjs` `media()`): the item's file name rides along. */
const picture = (key, filename) => ({
  id: `01MEDIA-${key}`,
  src: `/_emdash/api/media/file/${key}.jpg`,
  alt: '',
  ...(filename ? { filename } : {})
})
const steps = (where) => where.replace(/\[(\d+)\]/g, '.$1').split('.')
const at = (data, where) => steps(where).reduce((node, part) => node?.[part], data)

/** Set `value` at a media-map path (`items[0].image`) inside `data`. */
function place(data, where, value) {
  const parts = steps(where)
  let node = data
  for (const [i, part] of parts.entries()) {
    if (i === parts.length - 1) node[part] = value
    else node = node[part] ??= /^\d+$/.test(parts[i + 1]) ? [] : {}
  }
}

/** `collection/slug/locale` → { path → picture }: what the importer leaves on the site. */
const placed = new Map()
for (const item of media.items)
  for (const t of item.targets) {
    const k = `${t.collection}/${t.slug}/${t.locale ?? 'en'}`
    if (!placed.has(k)) placed.set(k, {})
    placed.get(k)[t.path] = picture(item.key.replace(/\W+/g, '-'), path.basename(item.file))
  }

/** Every entry of the seed, its pictures placed as the importer leaves them. */
function importedSite() {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) {
      const locale = e.locale ?? 'en'
      const data = structuredClone(e.data)
      for (const [where, pic] of Object.entries(placed.get(`${collection}/${e.slug}/${locale}`) ?? {}))
        place(data, where, pic)
      mock.state.addEntry(collection, e.slug, locale, data)
    }
  return mock
}

/**
 * A model that rewrites every row it is handed (`blocks`: the slideshow's lines, the cards' titles) and gives nothing
 * else, so the lists written from the seed's rows reach the site.
 */
async function rowsModel() {
  let rows = 0
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    let user = null
    try {
      user = JSON.parse(body.messages.at(-1).content)
    } catch {
      user = null
    }
    let answer = {}
    if (Array.isArray(user?.rows)) {
      rows += 1
      answer = {
        rows: user.rows.map((row) =>
          Object.fromEntries(Object.entries(row).map(([k, v]) => [k, `${String(v)} at Pho Hanoi`]))
        )
      }
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, rows: () => rows, close: () => server.close() }
}

async function run(mock, answers, model = null) {
  const site = await mock.listen()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-imported-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  try {
    return await new Promise((resolve) => {
      execFile(
        'node',
        [
          TOOL,
          '--answers-json',
          JSON.stringify(answers),
          '--site',
          site,
          '--token-file',
          path.join(dir, 'token'),
          '--receipts',
          path.join(dir, 'r.json'),
          '--json',
          ...(model ? [] : ['--no-model']),
          '--no-images'
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            OPENROUTER_API_KEY: '',
            DEEPSEEK_API_KEY: '',
            TRACY_MODEL_URL: model?.url ?? '',
            ...(model ? { TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' } : {})
          },
          maxBuffer: 64 * 1024 * 1024
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    })
  } finally {
    await mock.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

const A = 'images/demo/a.jpg'
const B = 'images/demo/b.jpg'
const unitSeed = {
  items: [
    { image: A, title: 'A' },
    { image: B, title: 'B' }
  ],
  cover: 'images/demo/cover.jpg'
}
const unitSite = {
  items: [
    { image: picture('a', 'a.jpg'), title: 'A' },
    { image: picture('b', 'b.jpg'), title: 'B' }
  ],
  cover: picture('cover', 'cover.jpg')
}
// `seed/media-map.json`: each spot names the item whose file the importer put there.
const unitSpots = [
  { path: 'items[0].image', file: A },
  { path: 'items[1].image', file: B },
  { path: 'cover', file: 'images/demo/cover.jpg' }
]
const ids = (data) => data.items.map((row) => row.image?.id ?? row.image)

test('keepImportedPictures: a seed picture path the site holds an imported picture for keeps the picture', () => {
  const written = {
    // rewritten words over the seed's rows, the second row moved up: its path still names its own picture
    items: [{ image: B, title: 'Bun cha' }],
    cover: 'images/demo/cover.jpg'
  }
  assert.deepEqual(keepImportedPictures(written, unitSite, unitSeed, unitSpots), {
    items: [{ image: picture('b', 'b.jpg'), title: 'Bun cha' }],
    cover: picture('cover', 'cover.jpg')
  })
  // A picture the run chose (drawn, uploaded, emptied) is not a seed path, and still wins.
  const drawn = { items: [{ image: picture('drawn'), title: 'A' }], cover: '' }
  assert.deepEqual(keepImportedPictures(drawn, unitSite, unitSeed, unitSpots), drawn)
  // A site the importer never reached holds the path itself: nothing to keep, the value is left as written.
  assert.deepEqual(keepImportedPictures(written, unitSeed, unitSeed, unitSpots), written)
  // A field outside the media map is never touched.
  assert.deepEqual(keepImportedPictures({ title: A }, unitSite, unitSeed, unitSpots), { title: A })
})

test('keepImportedPictures: two Applies that move rows give each path its own picture both times (review of PR 572)', () => {
  const moved = {
    items: [
      { image: B, title: 'B' },
      { image: A, title: 'A' }
    ],
    cover: 'images/demo/cover.jpg'
  }
  // Apply 1 writes the rows in another order: each path finds its picture by name.
  const run1 = keepImportedPictures(moved, unitSite, unitSeed, unitSpots)
  assert.deepEqual(ids(run1), ['01MEDIA-b', '01MEDIA-a'])
  // The site now holds Apply 1's rows, B's picture in row 0; Apply 2 writes from the seed again, in either order.
  assert.deepEqual(ids(keepImportedPictures(moved, run1, unitSeed, unitSpots)), ['01MEDIA-b', '01MEDIA-a'])
  assert.deepEqual(ids(keepImportedPictures(unitSeed, run1, unitSeed, unitSpots)), ['01MEDIA-a', '01MEDIA-b'])
})

test('keepImportedPictures: a list spot whose picture carries no usable name keeps the source path', () => {
  const nameless = {
    items: [
      { image: picture('a'), title: 'A' },
      { image: picture('b'), title: 'B' }
    ],
    cover: picture('cover')
  }
  // A row can have moved, so a list spot is never paired by position; a spot in no list (`cover`) cannot move.
  assert.deepEqual(keepImportedPictures(unitSeed, nameless, unitSeed, unitSpots), {
    ...unitSeed,
    cover: picture('cover')
  })
  // Two source files of the entry that share a name: the name says neither, and both keep the path.
  const shared = [
    { path: 'items[0].image', file: 'images/one/cover.jpg' },
    { path: 'items[1].image', file: 'images/two/cover.jpg' }
  ]
  const site = {
    items: [
      { image: picture('a', 'cover.jpg'), title: 'A' },
      { image: picture('b', 'cover-2.jpg'), title: 'B' }
    ]
  }
  assert.deepEqual(ids(keepImportedPictures(unitSeed, site, unitSeed, shared)), [A, B])
})

/**
 * The library's names for a fresh import of THIS seed: `seed-apply.mjs` uploads `seed/media-map.json` in order with
 * `deduplicate` and `ensureUniqueFilename`. A byte-identical file reuses the item already uploaded; any other file whose
 * name the library holds (any case) is kept as `<stem>-<n><ext>`, n = 2, 3, ... (EmDash `findAvailableFilename`).
 */
function libraryNames() {
  const taken = new Set()
  const byHash = new Map()
  return media.items.map((item) => {
    const bytes = readFileSync(path.join(ROOT, 'seed', item.copied ?? `media/${item.file}`))
    const hash = createHash('sha1').update(bytes).digest('hex')
    if (byHash.has(hash)) return byHash.get(hash)
    const base = path.basename(item.file)
    const dot = base.lastIndexOf('.')
    const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, '']
    let name = base
    for (let n = 2; taken.has(name.toLowerCase()); n += 1) name = `${stem}-${String(n)}${ext}`
    taken.add(name.toLowerCase())
    const uploaded = { id: `01MEDIA-${hash.slice(0, 12)}`, filename: name }
    byHash.set(hash, uploaded)
    return uploaded
  })
}

test('every seed picture path finds its own picture under the names a fresh import gives the library, rows moved or not', () => {
  const names = libraryNames()
  // Names the library renamed: what a bare-name match never finds (JA Restaurant intro-*.jpg, JA Diner item-*.jpg).
  assert.ok(
    names.some((u, i) => u.filename !== path.basename(media.items[i].file)),
    'this seed holds a name the library renames'
  )
  /** `collection/slug/locale` → the entry's spots as `main()` passes them, and the picture each must end with. */
  const entries = new Map()
  for (const [i, item] of media.items.entries())
    for (const t of item.targets) {
      const k = `${t.collection}/${t.slug}/${t.locale ?? seed.defaultLocale ?? 'en'}`
      if (!entries.has(k)) entries.set(k, [])
      entries.get(k).push({ path: t.path, file: item.file, uploaded: names[i] })
    }
  const wrong = []
  let checked = 0
  for (const [k, spots] of entries) {
    const [collection, slug, locale] = k.split('/')
    const seedData = (seed.content?.[collection] ?? []).find(
      (e) => e.slug === slug && (e.locale ?? seed.defaultLocale ?? 'en') === locale
    )?.data
    if (!seedData) continue
    // The site as the importer leaves it: the seed's data, each spot holding the value `seed-apply.mjs` writes.
    const live = structuredClone(seedData)
    for (const s of spots)
      place(live, s.path, {
        id: s.uploaded.id,
        src: `/_emdash/api/media/file/${s.uploaded.id}.jpg`,
        alt: '',
        filename: s.uploaded.filename
      })
    // The same site after an Apply that moved rows: every list holding a spot in reverse order.
    const moved = structuredClone(live)
    for (const s of spots) {
      const parts = steps(s.path)
      const i = parts.findIndex((part) => /^\d+$/.test(part))
      if (i > 0) {
        const list = at(moved, parts.slice(0, i).join('.'))
        if (Array.isArray(list) && !list.reversed) {
          list.reverse()
          Object.defineProperty(list, 'reversed', { value: true })
        }
      }
    }
    const given = spots.map(({ path: where, file }) => ({ path: where, file }))
    // Apply writes the entry from the seed again, on the fresh site and on the moved one.
    for (const [when, site] of [
      ['fresh', live],
      ['moved', moved]
    ]) {
      const out = keepImportedPictures(structuredClone(seedData), site, seedData, given)
      for (const s of spots) {
        const was = at(seedData, s.path)
        if (typeof was !== 'string' || was === '') continue
        checked += 1
        const now = at(out, s.path)
        if (now?.id !== s.uploaded.id)
          wrong.push(`${when} ${k} ${s.path} = ${JSON.stringify(now?.id ?? now)}`)
      }
    }
  }
  assert.ok(checked > 50, `the seed holds source paths at media-map spots (${String(checked)})`)
  assert.deepEqual(wrong, [], 'every source path ends with its own picture')
})

/** The pictures the importer placed that the site no longer holds after the run, and how many it still holds. */
function lostPictures(mock) {
  const lost = []
  let kept = 0
  for (const e of mock.state.entries.values())
    for (const [where, pic] of Object.entries(placed.get(`${e.collection}/${e.slug}/${e.locale}`) ?? {})) {
      // A row the run took away is no picture lost: the demo's claims (`facts`: its chefs, its guests' quotes, its
      // history) are emptied for a customer who described the business.
      const row = steps(where).slice(0, -1).join('.')
      if (row !== '' && at(e.live, row) === undefined) continue
      kept += 1
      if (JSON.stringify(at(e.live, where)) !== JSON.stringify(pic))
        lost.push(`${e.collection}/${e.slug}/${e.locale} ${where} = ${JSON.stringify(at(e.live, where))}`)
    }
  return { lost, kept }
}

for (const [mode, withModel] of [
  ['with no model', false],
  ['with a model rewriting the rows', true]
])
  test(`a described business keeps every picture the importer placed, ${mode}`, async () => {
    const mock = importedSite()
    const model = withModel ? await rowsModel() : null
    try {
      const out = await run(
        mock,
        { name: 'Pho Hanoi', about: 'A Vietnamese noodle restaurant in Hanoi serving pho and bun cha.' },
        model
      )
      assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
      if (model) assert.ok(model.rows() > 0, 'the model was handed rows to rewrite')
    } finally {
      model?.close()
    }
    const { lost, kept } = lostPictures(mock)
    assert.ok(kept > 50, `the site holds the importer's pictures (${String(kept)})`)
    assert.deepEqual(lost, [], 'every imported picture stays where the importer put it')
  })

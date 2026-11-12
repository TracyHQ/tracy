// tools/personalize.mjs on THIS template's whole seed, against a site whose pictures the importer has placed. This seed
// keeps the source's picture path at every spot the importer fills (`images/joomlart/slideshow/slide-1.jpg` at
// `slideshow/slideshow items[0].image`, `seed/media-map.json`), and the site holds the imported picture there instead. A
// list or an object the run writes from the seed carries that path, and the path is no file on the site: measured
// 11/11/2026 on dev (JA Restaurant 1.0.2, a site made through Add site), the home slideshow, the offer cards and the menu
// pages showed 33 broken pictures at /images/joomlart/... while the demo site, never personalized, showed all of them.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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

const picture = (key) => ({ id: `01MEDIA-${key}`, src: `/_emdash/api/media/file/${key}.jpg`, alt: '' })
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
    placed.get(k)[t.path] = picture(item.key.replace(/\W+/g, '-'))
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
  }
}

test('keepImportedPictures: a seed picture path the site holds an imported picture for keeps the picture', () => {
  const seedData = {
    items: [
      { image: 'images/demo/a.jpg', title: 'A' },
      { image: 'images/demo/b.jpg', title: 'B' }
    ],
    cover: 'b.jpg'
  }
  const live = {
    items: [
      { image: picture('a'), title: 'A' },
      { image: picture('b'), title: 'B' }
    ],
    cover: picture('cover')
  }
  const targets = ['items[0].image', 'items[1].image', 'cover']
  const written = {
    // rewritten words over the seed's rows, the second row moved up: its path still names its own picture
    items: [{ image: 'images/demo/b.jpg', title: 'Bun cha' }],
    cover: 'b.jpg'
  }
  assert.deepEqual(keepImportedPictures(written, live, seedData, targets), {
    items: [{ image: picture('b'), title: 'Bun cha' }],
    cover: picture('cover')
  })
  // A picture the run chose (drawn, uploaded, emptied) is not a seed path, and still wins.
  const drawn = { items: [{ image: picture('drawn'), title: 'A' }], cover: '' }
  assert.deepEqual(keepImportedPictures(drawn, live, seedData, targets), drawn)
  // A site the importer never reached holds the path itself: nothing to keep, the value is left as written.
  assert.deepEqual(keepImportedPictures(written, seedData, seedData, targets), written)
  // A field outside the media map is never touched.
  assert.deepEqual(keepImportedPictures({ title: 'images/demo/a.jpg' }, live, seedData, targets), {
    title: 'images/demo/a.jpg'
  })
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
  test(`a described restaurant keeps every picture the importer placed, ${mode}`, async () => {
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

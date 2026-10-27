// tools/personalize.mjs with THIS template's rules and FULL answers (TCH #1013): a card list rewritten for the business keeps
// the pictures the importer placed in its rows. The seed carries the words only (seed-apply.mjs uploads the pictures after
// it, media-map `items[0].tile_image`), so a list written whole from the seed dropped them: measured 11/10/2026 on dev on
// Tracy Business /careers, the same door every template writes through.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { keepSiteRowKeys } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))
const PICTURE = { id: '01MEDIATILE', src: '/_emdash/api/media/file/tile.png', alt: '' }

test('keepSiteRowKeys: a written row keeps the keys only the site holds; a key it names still wins', () => {
  const live = [{ title: 'Demo', image: PICTURE }, { title: 'Demo 2' }]
  assert.deepEqual(keepSiteRowKeys([{ title: 'New' }, { title: 'New 2' }], live), [
    { title: 'New', image: PICTURE },
    { title: 'New 2' }
  ])
  assert.deepEqual(keepSiteRowKeys([{ title: 'New', image: null }, { title: 'x' }], live)[0].image, null)
  // Another length: the rows the site has keep their pictures by position (TCH #1013, 11/10/2026: a changed length lost them).
  assert.deepEqual(
    keepSiteRowKeys([{ title: 'Only one' }], live),
    [{ title: 'Only one', image: PICTURE }],
    'another length: the rows both lists have keep the site\u2019s keys'
  )
  assert.equal(keepSiteRowKeys('words', live), 'words')
})

test('FULL answers: the home bento keeps its tile picture under the rewritten tile', async () => {
  const mock = createMockEmdash()
  for (const coll of ['site', 'bento'])
    for (const e of seed.content[coll] ?? []) {
      if ((e.locale ?? 'en') !== 'en') continue
      const data = structuredClone(e.data)
      if (coll === 'bento' && e.slug === 'home-bento')
        data.items[0] = { ...data.items[0], tile_image: PICTURE }
      mock.state.addEntry(coll, e.slug, 'en', data)
    }
  const site = await mock.listen()
  const model = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const user = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages.at(-1).content)
    const say = (v) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(v) } }] }))
    }
    if (Array.isArray(user.rows))
      return say({
        rows: user.rows.map((row, i) =>
          Object.fromEntries(Object.keys(row).map((k) => [k, `Bakery ${k} ${String(i)}`]))
        )
      })
    if (Array.isArray(user.fields))
      return say(
        Object.fromEntries(user.fields.map((f) => [f.key ?? f.name, `Bakery ${String(f.key ?? f.name)}`]))
      )
    return say({})
  })
  const modelUrl = await new Promise((r) =>
    model.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${model.address().port}/v1/chat`))
  )
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-structure-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  const answers = {
    name: 'Tamarind & Co',
    about: 'A family bakery in Dubai baking sourdough every morning.',
    languages: ['en']
  }
  try {
    const out = await new Promise((resolve) =>
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
          '--no-images'
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            TRACY_MODEL_URL: modelUrl,
            TRACY_MODEL_KEY: 'k',
            TRACY_MODEL_NAME: 'm',
            OPENROUTER_API_KEY: '',
            DEEPSEEK_API_KEY: ''
          },
          maxBuffer: 64 * 1024 * 1024
        },
        (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
      )
    )
    assert.ok([0, 3].includes(out.code), out.stderr.slice(-2000))
    const bento = [...mock.state.entries.values()].find(
      (e) => e.collection === 'bento' && e.slug === 'home-bento'
    )
    assert.match(String(bento.live.items[0].tile_title), /^Bakery tile_title/, 'the tile is rewritten')
    assert.deepEqual(bento.live.items[0].tile_image, PICTURE, 'and keeps its picture')
  } finally {
    await mock.close()
    await new Promise((r) => model.close(r))
  }
})

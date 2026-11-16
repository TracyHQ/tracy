// tools/personalize.mjs on THIS template's whole seed, for a root written in another language whose copy the model did not
// write: the template's words of each rich-text `copy` field are translated part by part (LANG-2), and what the view draws
// from the blocks stays — the "Meet Our Team" button of FeaturesIntro.astro (a block that is one link) and the link inside
// the home welcome. Flattened to one span per block, the button was gone and the link with it (review, 16/11/2026).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')
const seed = JSON.parse(readFileSync(path.join(ROOT, 'seed', 'seed.json'), 'utf8'))

/** A model that writes no copy and translates every label or text it is handed by putting "VI " before it. */
async function translatingModel() {
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
    const answer =
      user?.labels && typeof user.labels === 'object'
        ? Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `VI ${String(v)}`]))
        : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, close: () => server.close() }
}

async function run(mock, answers, model) {
  const site = await mock.listen()
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-rich-'))
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
          '--no-images'
        ],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            OPENROUTER_API_KEY: '',
            DEEPSEEK_API_KEY: '',
            TRACY_SEED_TEXT_PROVIDER: '',
            TRACY_MODEL_URL: model.url,
            TRACY_MODEL_KEY: 'k-test',
            TRACY_MODEL_NAME: 'm-test'
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

const textOf = (blocks) => blocks.flatMap((b) => (b.children ?? []).map((c) => c.text)).join('')

test('a root written in Vietnamese: the rich-text copy is translated, its button and its links kept', async () => {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale ?? 'en', structuredClone(e.data))
  const model = await translatingModel()
  try {
    const result = await run(
      mock,
      {
        name: 'Trattoria Lume',
        about: 'An Italian trattoria in Da Nang.',
        sector: 'restaurant',
        languages: ['vi']
      },
      model
    )
    assert.ok([0, 3].includes(Number(result.code)), `${result.code}: ${result.stderr.slice(-400)}`)
    const live = (collection, slug) =>
      [...mock.state.entries.values()].find(
        (e) => e.collection === collection && e.slug === slug && e.locale === 'en'
      ).live
    const demo = (collection, slug) => seed.content[collection].find((e) => e.slug === slug).data

    const about = live('features_intro', 'about-us').description
    const demoAbout = demo('features_intro', 'about-us').description
    const button = demoAbout.find((b) => textOf([b]) === 'Meet Our Team')
    assert.deepEqual(
      about.find((b) => b._key === button._key),
      button,
      'the button block stays as it is'
    )
    assert.match(
      textOf(about.filter((b) => b._key !== button._key)),
      /^VI Get started/,
      'the text is translated'
    )

    const hero = live('hero', 'welcome-to-res-bar-restaurant').hero_intro
    const demoHero = demo('hero', 'welcome-to-res-bar-restaurant').hero_intro
    assert.match(textOf(hero), /^VI Since 1982/, 'the welcome is translated')
    assert.deepEqual(hero[0].markDefs, demoHero[0].markDefs, 'its link definition stays')
    assert.deepEqual(
      hero[0].children.filter((c) => c.marks.length > 0).map((c) => [c.text, c.marks]),
      [['4 5th Avenue at St. Marks Place, Cathedral District', ['l3']]],
      'the linked words keep their mark'
    )

    // A rewrite body the model did not write takes the template's words translated, and its emphasis stays.
    const slug = '4-habits-that-can-improve-your-customer-service'
    const body = live('posts', slug).body
    const demoBody = demo('posts', slug).body
    const strong = (blocks) =>
      blocks.flatMap((b) => (b.children ?? []).filter((c) => c.marks?.includes('strong')).map((c) => c.text))
    assert.ok(strong(demoBody).length > 0, 'the demo body has emphasis')
    assert.match(textOf(body), /VI /, 'the body is translated')
    assert.deepEqual(strong(body), strong(demoBody), 'every emphasis stays on its words')
  } finally {
    model.close()
  }
})

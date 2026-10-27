// tools/personalize.mjs, the template's sample pages (`samples` in seed/personalize.json: the kit's newsletter, email, form,
// slides and style guide) on a root written in another language (TCH #1013, task 12, K3): their content stays as the template
// has it, but in the site's language. A template that ships that language gives its own edition's words (the demo brand
// swapped, as everywhere); one that does not has the words translated by the model, and nothing else changes. Written against
// its own tiny seed (as `personalize-journal.test.mjs` is), so the kit and every template carry the same file.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { factsFrom, planFrom, sampleLeavesOf } from '../tools/personalize.mjs'
import { createMockEmdash } from './mock-emdash.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = path.join(ROOT, 'tools', 'personalize.mjs')

const kit = (locale, words) => ({
  slug: 'kit-email',
  locale,
  data: {
    title: words.title,
    template: 'kit-email',
    sample: {
      h1: words.title,
      list: [{ t: words.item, d: '24 h' }],
      from: `${words.from}: Northgate <no-reply@northgate.example>`
    }
  }
})
const seed = {
  defaultLocale: 'en',
  content: {
    site: [{ slug: 'site', locale: 'en', data: { brand_name: 'DEMO WORKS' } }],
    pages: [
      kit('en', { title: 'Transactional emails', item: 'Request received', from: 'From' }),
      kit('vi', { title: 'Email giao dịch', item: 'Đã nhận yêu cầu', from: 'Từ' }),
      { slug: 'terms', locale: 'en', data: { title: 'Terms' } }
    ]
  },
  menus: []
}
const map = {
  identity: [{ collection: 'site', slug: 'site', field: 'brand_name', value: '{NAME}' }],
  replace: [{ find: 'Northgate', with: '{name}' }],
  samples: [{ collection: 'pages', slug: 'kit-email' }]
}
const SEED_DIR = mkdtempSync(path.join(tmpdir(), 'personalize-samples-seed-'))
writeFileSync(path.join(SEED_DIR, 'seed.json'), JSON.stringify(seed))
writeFileSync(path.join(SEED_DIR, 'personalize.json'), JSON.stringify(map))

const NO_MODEL = {
  OPENROUTER_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  TRACY_MODEL_URL: '',
  TRACY_SEED_TEXT_PROVIDER: ''
}
const facts = factsFrom({ name: 'Golden Crust' })

test('a root written in a language the template ships: the sample page takes that edition’s words, the demo brand swapped', () => {
  const { patches, samples } = planFrom(map, seed, facts, { writtenAs: { en: 'vi' } })
  const p = patches.get('pages/kit-email/en')
  assert.equal(p.fields.title, 'Email giao dịch')
  assert.deepEqual(p.fields.sample, {
    h1: 'Email giao dịch',
    list: [{ t: 'Đã nhận yêu cầu', d: '24 h' }],
    from: 'Từ: Golden Crust <no-reply@northgate.example>'
  })
  assert.equal(p.fields.template, undefined, 'a value every edition shares is not written')
  assert.deepEqual(samples, { borrowed: ['pages/kit-email/en'], translate: [] })
  assert.equal(patches.get('pages/terms/en'), undefined, 'a page the map does not name as a sample is left')
})

test('a root in its own language, or in one the template does not ship: no edition is borrowed', () => {
  const own = planFrom(map, seed, facts)
  assert.deepEqual(own.samples, { borrowed: [], translate: [] })
  assert.equal(own.patches.get('pages/kit-email/en')?.fields.title, undefined)
  const unshipped = planFrom(map, seed, facts, { writtenAs: { en: 'sw' } })
  assert.deepEqual(unshipped.samples, { borrowed: [], translate: ['pages/kit-email/en'] })
})

test('the words of a sample are the values that differ between editions; an id, a number or an address is not', () => {
  const root = seed.content.pages[0]
  const leaves = sampleLeavesOf(root.data, [seed.content.pages[1].data])
  assert.deepEqual(
    leaves.map((l) => l.text),
    [
      'Transactional emails',
      'Transactional emails',
      'Request received',
      'From: Northgate <no-reply@northgate.example>'
    ]
  )
  // With no other edition to compare with, every label-like value is words, but never an id-like key.
  assert.ok(!sampleLeavesOf(root.data, []).some((l) => l.text === 'kit-email'))
})

/** A model that translates every label as `sw:<label>`. */
async function modelServer() {
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const user = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages[1].content)
    const answer = user.labels
      ? Object.fromEntries(Object.entries(user.labels).map(([k, v]) => [k, `sw:${v}`]))
      : Array.isArray(user.fields)
        ? Object.fromEntries(user.fields.map((f) => [f.key, 'sw copy']))
        : {}
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) } }] }))
  })
  const url = await new Promise((r) =>
    server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { url, close: () => server.close() }
}

function site() {
  const mock = createMockEmdash()
  for (const [collection, rows] of Object.entries(seed.content))
    for (const e of rows) mock.state.addEntry(collection, e.slug, e.locale, e.data)
  return mock
}

function run(url, answers, env) {
  const dir = mkdtempSync(path.join(tmpdir(), 'personalize-samples-'))
  writeFileSync(path.join(dir, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  const args = [
    TOOL,
    '--seed',
    SEED_DIR,
    '--site',
    url,
    '--token-file',
    path.join(dir, 'token'),
    '--receipts',
    path.join(dir, 'receipts.json'),
    '--json',
    '--no-images',
    '--answers-json',
    JSON.stringify(answers)
  ]
  return new Promise((resolve) => {
    execFile(
      'node',
      args,
      { cwd: ROOT, env: { ...process.env, ...NO_MODEL, ...env }, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  })
}

const liveKit = (mock) =>
  [...mock.state.entries.values()].find(
    (e) => e.collection === 'pages' && e.slug === 'kit-email' && e.locale === 'en'
  )

test('a site in Vietnamese, no model: the kit page on the site is the template’s Vietnamese edition', async () => {
  const mock = site()
  const url = await mock.listen()
  try {
    const r = await run(url, { name: 'Golden Crust', languages: ['vi'] }, {})
    assert.deepEqual(JSON.parse(r.stdout).errors, [], r.stderr)
    const k = liveKit(mock)
    assert.equal(k.status, 'published')
    assert.equal(k.live.title, 'Email giao dịch')
    assert.equal(k.live.sample.list[0].t, 'Đã nhận yêu cầu')
    assert.equal(k.live.template, 'kit-email')
  } finally {
    await mock.close()
  }
})

test('a site in a language the template does not ship: the kit page’s words are translated, its shape kept', async () => {
  const mock = site()
  const url = await mock.listen()
  const model = await modelServer()
  try {
    const r = await run(
      url,
      { name: 'Golden Crust', languages: ['sw'] },
      { TRACY_MODEL_URL: model.url, TRACY_MODEL_KEY: 'k-test', TRACY_MODEL_NAME: 'm-test' }
    )
    assert.deepEqual(JSON.parse(r.stdout).errors, [], r.stderr)
    const k = liveKit(mock).live
    assert.equal(k.title, 'sw:Transactional emails')
    assert.equal(k.sample.h1, 'sw:Transactional emails')
    assert.deepEqual(k.sample.list, [{ t: 'sw:Request received', d: '24 h' }])
    assert.equal(k.template, 'kit-email', 'the layout id is not a word')
  } finally {
    await mock.close()
    model.close()
  }
})

test('a site in a language the template does not ship and no model: the report says the kit page keeps its words', async () => {
  const mock = site()
  const url = await mock.listen()
  try {
    const r = await run(url, { name: 'Golden Crust', languages: ['sw'] }, {})
    const report = JSON.parse(r.stdout)
    assert.deepEqual(report.errors, [], r.stderr)
    assert.ok(report.skipped.some((s) => s.rule === 'sample pages/kit-email/en'))
    assert.equal(liveKit(mock).live.title, 'Transactional emails')
  } finally {
    await mock.close()
  }
})

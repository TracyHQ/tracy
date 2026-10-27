/**
 * The EmDash tool's model calls, made before the site exists and answered from memory once it does
 * (`brief-engines/emdash-preload.mjs`) — proven with the REAL tool (`personalize.mjs`), the template's own mock of the
 * EmDash admin API and a model that answers deterministically: a recorded-then-replayed run must leave the site exactly
 * as a direct run does, asking the model nothing the second time.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const THEME = path.resolve(HERE, '../../../packages/cms/tracy-emdash-theme-business')
const TOOL = path.join(THEME, 'tools', 'personalize.mjs')
const SEED = path.join(THEME, 'seed')
const PRELOAD = path.resolve(HERE, '../src/sites/brief-engines/emdash-preload.mjs')
const { createMockEmdash } = await import(path.join(THEME, 'tests', 'mock-emdash.mjs'))
const seed = JSON.parse(readFileSync(path.join(SEED, 'seed.json'), 'utf8'))

const scratch = []
const dir = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'preload-'))
  scratch.push(d)
  writeFileSync(path.join(d, 'token'), 'ec_pat_0123456789abcdef0123456789abcdef\n')
  return d
}
after(() => {
  for (const d of scratch) rmSync(d, { recursive: true, force: true })
})

/** A site that first-run setup seeded from the template's own seed. */
function seededMock() {
  const mock = createMockEmdash()
  for (const coll of ['site', 'home', 'about', 'contact', 'services_page'])
    for (const e of seed.content[coll]) mock.state.addEntry(coll, e.slug, e.locale, e.data)
  const post = seed.content.posts.find((e) => e.locale === 'en' && /Northgate/.test(e.data.title))
  mock.state.addEntry('posts', post.slug, 'en', post.data)
  return mock
}

/** What a visitor and an editor would find, in an order that does not depend on how the run was scheduled. */
const snapshot = (mock) =>
  JSON.stringify({
    entries: [...mock.state.entries.values()]
      .map((e) => ({ k: `${e.collection}/${e.slug}/${e.locale}`, status: e.status, live: e.live }))
      .sort((a, b) => a.k.localeCompare(b.k)),
    settings: mock.state.settings ?? null,
    terms: [...mock.state.terms.entries()].sort(([a], [b]) => a.localeCompare(b))
  })

/** A model that answers every shape the tool asks, the same way every time, and counts what it was asked. */
async function startModel() {
  const state = { calls: 0 }
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    state.calls += 1
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const user = JSON.parse(body.messages[1].content)
    const say = (value) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }))
    }
    if (Array.isArray(user.rows))
      return say({
        rows: user.rows.map((row, i) => Object.fromEntries(Object.keys(row).map((k) => [k, `${k} ${i}`])))
      })
    if (Array.isArray(user.terms))
      return say(Object.fromEntries(user.terms.map((t) => [t.slug, `L ${t.slug}`])))
    if (Array.isArray(user.fields) && user.fields[0]?.name !== undefined)
      return say(Object.fromEntries(user.fields.map((f) => [f.name, { label: `F ${f.name}` }])))
    if (Array.isArray(user.entries)) {
      const rewritten = {}
      for (const e of user.entries) rewritten[e.key] = { title: `R ${e.key}` }
      return say(rewritten)
    }
    // A body asked again on its own, its parts counted (`rewriteBody`, g60).
    if (Array.isArray(user.parts)) return say({ body: user.parts.map((p) => `Part ${p.part}`) })
    return say(Object.fromEntries(user.fields.map((f) => [f.key, `W ${f.key.split('.').pop()}`])))
  })
  const url = await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1/chat`))
  )
  return { state, url, close: () => new Promise((resolve) => server.close(resolve)) }
}

function runTool({ site, cwd, modelUrl, preload = null, extra = [], name = 'Granite Works' }) {
  const work = dir()
  const env = {
    ...process.env,
    TRACY_MODEL_URL: modelUrl,
    TRACY_MODEL_KEY: 'k',
    TRACY_MODEL_NAME: 'm',
    ...preload?.env
  }
  delete env.TRACY_SEED_TEXT_PROVIDER
  delete env.OPENROUTER_API_KEY
  delete env.DEEPSEEK_API_KEY
  const args = [
    ...(preload ? ['--import', PRELOAD] : []),
    TOOL,
    '--answers-json',
    JSON.stringify({
      name,
      about: 'We build granite worktops for kitchens.',
      contact: '12 Quarry Lane · +44 20 7946 0000',
      email: 'hello@granite.example'
    }),
    '--site',
    site,
    '--token-file',
    path.join(work, 'token'),
    '--seed',
    SEED,
    '--receipts',
    path.join(work, 'receipts.json'),
    '--no-images',
    '--hide-chrome-only',
    '--json',
    ...extra
  ]
  return new Promise((resolve) =>
    execFile(
      'node',
      args,
      { cwd: cwd ?? THEME, env, maxBuffer: 128 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  )
}

const fetchCache = (stderr) => {
  const m = /fetch-cache (\w+): hits=(\d+) misses=(\d+) kept=(\d+)/.exec(stderr)
  return m ? { mode: m[1], hits: Number(m[2]), misses: Number(m[3]), kept: Number(m[4]) } : null
}

test('recorded before the site exists and replayed against it, the run leaves the site as a direct run does and asks the model nothing', async () => {
  const model = await startModel()
  try {
    // A — the tool as it has always run: the model is asked while the site is written.
    const direct = seededMock()
    const directSite = await direct.listen()
    const a = await runTool({ site: directSite, modelUrl: model.url })
    assert.ok([0, 3].includes(a.code), `direct run failed (${a.code}): ${a.stderr.slice(0, 600)}`)
    const directCalls = model.state.calls
    assert.ok(directCalls > 10, `the tool asks the model many times: ${directCalls}`)

    // B — the same run before there is a site: the model is asked for real, the "site" is the stand-in's.
    const cache = path.join(dir(), 'answers.jsonl')
    const before = model.state.calls
    const b = await runTool({
      site: 'http://emdash-warmup.invalid',
      modelUrl: model.url,
      preload: {
        env: {
          TRACY_FETCH_MODE: 'record',
          TRACY_FETCH_CACHE: cache,
          TRACY_FETCH_SITE: 'http://emdash-warmup.invalid',
          TRACY_FETCH_SEED: SEED
        }
      }
    })
    assert.ok([0, 3].includes(b.code), `record run failed (${b.code}): ${b.stderr.slice(0, 600)}`)
    const recorded = fetchCache(b.stderr)
    assert.ok(recorded && recorded.kept === model.state.calls - before, JSON.stringify(recorded))
    assert.ok(
      recorded.kept >= directCalls - 2,
      `the recorded run asked what the direct run asked: ${recorded.kept} of ${directCalls}`
    )
    assert.ok(existsSync(cache))

    // C — the site is up: the same run, every model call answered from memory, the writes real.
    const replayed = seededMock()
    const replayedSite = await replayed.listen()
    const callsBefore = model.state.calls
    const c = await runTool({
      site: replayedSite,
      modelUrl: model.url,
      preload: {
        env: { TRACY_FETCH_MODE: 'replay', TRACY_FETCH_CACHE: cache, TRACY_FETCH_SITE: replayedSite }
      }
    })
    assert.ok([0, 3].includes(c.code), `replay run failed (${c.code}): ${c.stderr.slice(0, 600)}`)
    const stats = fetchCache(c.stderr)
    assert.equal(model.state.calls, callsBefore, 'the model was not asked again')
    assert.ok(stats && stats.hits === recorded.kept && stats.misses === 0, JSON.stringify(stats))
    assert.equal(snapshot(replayed), snapshot(direct), 'the replayed site is the directly written site')
    assert.equal(JSON.parse(c.stdout).language.hidden.length, JSON.parse(a.stdout).language.hidden.length)
    await direct.close()
    await replayed.close()
  } finally {
    await model.close()
  }
})

test('a question the recorded run never asked goes to the model live: a miss is slower, never wrong', async () => {
  const model = await startModel()
  try {
    const cache = path.join(dir(), 'answers.jsonl')
    const b = await runTool({
      site: 'http://emdash-warmup.invalid',
      modelUrl: model.url,
      preload: {
        env: {
          TRACY_FETCH_MODE: 'record',
          TRACY_FETCH_CACHE: cache,
          TRACY_FETCH_SITE: 'http://emdash-warmup.invalid',
          TRACY_FETCH_SEED: SEED
        }
      }
    })
    assert.ok([0, 3].includes(b.code), b.stderr.slice(0, 400))
    // The customer changed the name between the two runs: every question is different.
    const site = seededMock()
    const url = await site.listen()
    const before = model.state.calls
    const c = await runTool({
      site: url,
      modelUrl: model.url,
      name: 'Slate & Sons',
      preload: { env: { TRACY_FETCH_MODE: 'replay', TRACY_FETCH_CACHE: cache, TRACY_FETCH_SITE: url } }
    })
    assert.ok([0, 3].includes(c.code), c.stderr.slice(0, 400))
    const stats = fetchCache(c.stderr)
    assert.ok(stats.misses > 10 && stats.hits === 0, JSON.stringify(stats))
    assert.equal(model.state.calls - before, stats.misses, 'each miss was asked live')
    const home = [...site.state.entries.values()].find((e) => e.collection === 'home' && e.locale === 'en')
    assert.match(JSON.stringify(home.live), /Slate & Sons/, 'and the site carries the new name')
    await site.close()
  } finally {
    await model.close()
  }
})

/** A script that asks `url` the same question `times` times and prints what it was told. */
const asker = (url, times) =>
  `const out = []; for (let i = 0; i < ${times}; i++) { try { const r = await fetch(${JSON.stringify(url)}, { method: 'POST', body: JSON.stringify({ q: 1 }) }); out.push(r.ok ? await r.text() : 'HTTP ' + r.status) } catch (e) { out.push('ERR') } } console.log(JSON.stringify(out))`

function runScript(script, env) {
  return new Promise((resolve) =>
    execFile(
      'node',
      ['--import', PRELOAD, '--input-type=module', '-e', script],
      { env: { ...process.env, ...env } },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })
    )
  )
}

test('the same question asked twice is answered in the order it was answered, and a failure is never kept', async () => {
  let n = 0
  const server = http.createServer(async (req, res) => {
    for await (const _ of req);
    n += 1
    if (n === 1) {
      res.writeHead(503)
      return res.end('busy')
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ answer: n }))
  })
  const url = await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/ask`))
  )
  const cache = path.join(dir(), 'answers.jsonl')
  const env = { TRACY_FETCH_CACHE: cache, TRACY_FETCH_SITE: 'http://site.invalid' }
  const recorded = await runScript(asker(url, 3), { ...env, TRACY_FETCH_MODE: 'record' })
  assert.deepEqual(JSON.parse(recorded.stdout), ['HTTP 503', '{"answer":2}', '{"answer":3}'])
  assert.equal(readFileSync(cache, 'utf8').trim().split('\n').length, 2, 'the 503 was not kept')
  await new Promise((resolve) => server.close(resolve))
  // The model is gone: the first two questions are answered from memory, in order; the third is a miss with nobody to ask.
  const replayed = await runScript(asker(url, 3), { ...env, TRACY_FETCH_MODE: 'replay' })
  assert.deepEqual(JSON.parse(replayed.stdout), ['{"answer":2}', '{"answer":3}', 'ERR'])
  assert.match(replayed.stderr, /hits=2 misses=1/)
})

test('without its settings the preload does nothing at all', async () => {
  const r = await runScript('console.log(typeof fetch, fetch.name)', {})
  assert.match(r.stdout, /function/)
  assert.doesNotMatch(r.stderr, /fetch-cache/)
})

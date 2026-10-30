import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { VERSION, cacheKey, cacheServer } from '../ci/turbo-cache-server.mjs'

const RUNTIME = 'runtime-token-SECRETMARKER'
const TWIRP = '/twirp/github.actions.results.api.v1.CacheService/'

/**
 * A fake of the GitHub Actions cache service v2: the three Twirp calls `@actions/cache` 4.x makes
 * (JSON, lowerCamelCase, int64 as a string) and the Azure blob behind the signed URLs.
 * `fail` makes every Twirp call answer 500.
 */
async function fakeService() {
  const entries = new Map() // key → { version, data?, size? }
  const calls = []
  const state = { fail: false }
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    const url = new URL(req.url ?? '/', 'http://fake')
    const json = (status, obj) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(obj))
    }
    if (url.pathname.startsWith('/blob/')) {
      const key = decodeURIComponent(url.pathname.slice('/blob/'.length))
      calls.push(`${req.method ?? ''} blob ${key}`)
      if (url.searchParams.get('sig') !== 'ok') return json(403, {})
      if (req.method === 'PUT') {
        if (req.headers['x-ms-blob-type'] !== 'BlockBlob') return json(400, {})
        entries.get(key).data = body
        return json(201, {})
      }
      const e = entries.get(key)
      return e?.data ? (res.writeHead(200), res.end(e.data)) : json(404, {})
    }
    const method = url.pathname.startsWith(TWIRP) ? url.pathname.slice(TWIRP.length) : ''
    calls.push(method)
    if (req.method !== 'POST' || req.headers.authorization !== `Bearer ${RUNTIME}`)
      return json(401, { code: 'unauthenticated' })
    if (state.fail) return json(500, { code: 'internal' })
    const r = JSON.parse(body.toString())
    const base = `http://127.0.0.1:${String(server.address().port)}/blob/${encodeURIComponent(r.key)}?sig=ok`
    if (method === 'GetCacheEntryDownloadURL') {
      const e = entries.get(r.key)
      assert.deepEqual(r.restoreKeys, [])
      if (!e || e.version !== r.version || e.size === undefined) return json(200, { ok: false })
      return json(200, { ok: true, signedDownloadUrl: base, matchedKey: r.key })
    }
    if (method === 'CreateCacheEntry') {
      if (entries.has(r.key))
        return json(409, {
          code: 'already_exists',
          msg: 'cache entry with the same key, version, and scope already exists'
        })
      entries.set(r.key, { version: r.version })
      return json(200, { ok: true, signedUploadUrl: base })
    }
    if (method === 'FinalizeCacheEntryUpload') {
      const e = entries.get(r.key)
      assert.equal(typeof r.sizeBytes, 'string')
      if (!e?.data || Number(r.sizeBytes) !== e.data.length) return json(200, { ok: false, message: 'size' })
      e.size = Number(r.sizeBytes)
      return json(200, { ok: true, entryId: '1' })
    }
    return json(404, { code: 'bad_route' })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const seed = (key, data) =>
    entries.set(key, { version: VERSION, data: Buffer.from(data), size: data.length })
  return {
    url: `http://127.0.0.1:${String(server.address().port)}/`,
    entries,
    calls,
    state,
    seed,
    close: () => server.close()
  }
}

async function serve(svc, options = {}) {
  const logs = []
  const server = cacheServer({
    resultsUrl: svc.url,
    runtimeToken: RUNTIME,
    token: 'T',
    log: (l) => logs.push(l),
    ...options
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { base: `http://127.0.0.1:${String(server.address().port)}`, logs, close: () => server.close() }
}

const auth = { authorization: 'Bearer T' }

test('HEAD is one lookup: a stored hash is 200, an unknown one 404, nothing downloaded', async (t) => {
  const svc = await fakeService()
  const s = await serve(svc)
  t.after(() => (s.close(), svc.close()))
  svc.seed(cacheKey('ci', 'aaaa'), 'cached')
  assert.equal(cacheKey('ci', 'aaaa'), 'turbo-ci-aaaa')
  const head = (h) => fetch(`${s.base}/v8/artifacts/${h}?teamId=ci`, { method: 'HEAD', headers: auth })
  assert.equal((await head('aaaa')).status, 200)
  assert.deepEqual(svc.calls, ['GetCacheEntryDownloadURL'])
  assert.equal((await head('bbbb')).status, 404)
  assert.deepEqual(svc.calls, ['GetCacheEntryDownloadURL', 'GetCacheEntryDownloadURL'])
})

test('GET returns the stored artifact; PUT stores a new hash and accepts an existing one', async (t) => {
  const svc = await fakeService()
  const s = await serve(svc)
  t.after(() => (s.close(), svc.close()))
  svc.seed('turbo-ci-aaaa', 'cached')
  const get = await fetch(`${s.base}/v8/artifacts/aaaa?slug=ci`, { headers: auth })
  assert.equal(get.status, 200)
  assert.equal(await get.text(), 'cached')
  assert.equal((await fetch(`${s.base}/v8/artifacts/zzzz?teamId=ci`, { headers: auth })).status, 404)

  const put = (h, body) =>
    fetch(`${s.base}/v8/artifacts/${h}?teamId=ci`, { method: 'PUT', headers: auth, body })
  svc.calls.length = 0
  assert.equal((await put('cccc', 'new artifact')).status, 202)
  assert.deepEqual(svc.calls, ['CreateCacheEntry', 'PUT blob turbo-ci-cccc', 'FinalizeCacheEntryUpload'])
  assert.equal(svc.entries.get('turbo-ci-cccc').data.toString(), 'new artifact')
  assert.equal(svc.entries.get('turbo-ci-cccc').version, VERSION)
  assert.equal(
    await (await fetch(`${s.base}/v8/artifacts/cccc?teamId=ci`, { headers: auth })).text(),
    'new artifact'
  )

  // Immutable: the service answers 409 for a key it holds, and that is a success, with no upload.
  svc.calls.length = 0
  assert.equal((await put('aaaa', 'other')).status, 202)
  assert.deepEqual(svc.calls, ['CreateCacheEntry'])
  assert.equal(svc.entries.get('turbo-ci-aaaa').data.toString(), 'cached')
})

test('a cache service that fails is a miss for reads and a skipped write, never a crash', async (t) => {
  const svc = await fakeService()
  const s = await serve(svc)
  t.after(() => (s.close(), svc.close()))
  svc.seed('turbo-ci-aaaa', 'cached')
  svc.state.fail = true
  assert.equal(
    (await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { method: 'HEAD', headers: auth })).status,
    404
  )
  assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { headers: auth })).status, 404)
  const put = await fetch(`${s.base}/v8/artifacts/dddd?teamId=ci`, {
    method: 'PUT',
    headers: auth,
    body: 'x'
  })
  assert.equal(put.status, 502)
  assert.equal(svc.entries.has('turbo-ci-dddd'), false)
  assert.ok(s.logs.some((l) => /HTTP 500/.test(l)))

  // An unreachable service too (nothing listens on the URL any more).
  svc.close()
  assert.equal(
    (await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { method: 'HEAD', headers: auth })).status,
    404
  )
  assert.ok(!s.logs.join('\n').includes(RUNTIME), 'the runtime token is never logged')
})

test('read-only (a fork) answers a PUT without writing; no bearer, no answer; no key climbs out', async (t) => {
  const svc = await fakeService()
  const s = await serve(svc, { readOnly: true })
  t.after(() => (s.close(), svc.close()))
  const put = await fetch(`${s.base}/v8/artifacts/eeee?teamId=ci`, {
    method: 'PUT',
    headers: auth,
    body: 'x'
  })
  assert.equal(put.status, 202)
  assert.equal(svc.calls.length, 0)
  assert.equal((await fetch(`${s.base}/v8/artifacts/status`, { headers: auth })).status, 200)
  assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { method: 'HEAD' })).status, 401)
  assert.equal(
    (await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { headers: { authorization: 'Bearer x' } })).status,
    401
  )
  assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa?teamId=..`, { headers: auth })).status, 400)
  assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa?teamId=a,b`, { headers: auth })).status, 400)
  assert.equal((await fetch(`${s.base}/v8/artifacts/aaaa`, { headers: auth })).status, 400)
  assert.equal(svc.calls.length, 0)
})

test('the action starts the server detached with the runtime token, exports Turbo’s env, never prints the token', async (t) => {
  const svc = await fakeService()
  const dir = mkdtempSync(join(tmpdir(), 'turbo-cache-action-'))
  let pid = 0
  t.after(() => {
    if (pid) process.kill(pid)
    svc.close()
    rmSync(dir, { recursive: true, force: true })
  })
  const action = new URL('../../.github/actions/turbo-cache/', import.meta.url)
  const yml = readFileSync(new URL('action.yml', action), 'utf8')
  assert.match(yml, /using: node24\n\s+main: start\.mjs/)
  assert.doesNotMatch(yml, /secrets\.|TURBO_CACHE_S3/)
  const event = join(dir, 'event.json')
  const start = (env) => {
    writeFileSync(join(dir, 'env'), '')
    return spawnSync(process.execPath, [new URL('start.mjs', action).pathname], {
      // Not the checkout: the action's own path finds the server, whatever the working directory.
      cwd: dir,
      encoding: 'utf8',
      timeout: 20_000,
      env: { PATH: process.env.PATH, GITHUB_ENV: join(dir, 'env'), RUNNER_TEMP: dir, ...env }
    })
  }
  const exported = () =>
    Object.fromEntries(
      readFileSync(join(dir, 'env'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => l.split(/=(.*)/s).slice(0, 2))
    )

  // No runtime token (a `run` step's environment): a warning, the job goes on, no TURBO_API.
  const bare = start({})
  assert.equal(bare.status, 0)
  assert.match(bare.stdout, /::warning::Turbo remote cache: .*local cache only/)
  assert.equal(exported().TURBO_API, undefined)
  assert.equal(exported().TURBO_TELEMETRY_DISABLED, '1')

  // A fork's pull request: up, but read-only.
  writeFileSync(
    event,
    JSON.stringify({
      repository: { full_name: 'o/r' },
      pull_request: { head: { repo: { full_name: 'x/r' } } }
    })
  )
  const port = 43_000 + Math.floor(Math.random() * 900)
  const run = start({
    ACTIONS_RUNTIME_TOKEN: RUNTIME,
    ACTIONS_RESULTS_URL: svc.url,
    INPUT_PORT: String(port),
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: event
  })
  assert.equal(run.status, 0, run.stdout + run.stderr)
  pid = Number(/server pid (\d+)/.exec(run.stdout)?.[1])
  assert.match(run.stdout, /read-only: a fork/)
  assert.ok(!(run.stdout + run.stderr).includes(RUNTIME), 'the runtime token is printed')
  const env = exported()
  assert.equal(env.TURBO_API, `http://127.0.0.1:${String(port)}`)
  assert.equal(env.TURBO_TEAM, 'tracy-ci')
  assert.match(run.stdout, new RegExp(`::add-mask::${env.TURBO_TOKEN}`))
  svc.seed('turbo-tracy-ci-aaaa', 'cached')
  const headers = { authorization: `Bearer ${env.TURBO_TOKEN}` }
  assert.equal(
    (await fetch(`${env.TURBO_API}/v8/artifacts/aaaa?teamId=tracy-ci`, { method: 'HEAD', headers })).status,
    200
  )
  const put = await fetch(`${env.TURBO_API}/v8/artifacts/bbbb?teamId=tracy-ci`, {
    method: 'PUT',
    headers,
    body: 'x'
  })
  assert.equal(put.status, 202)
  assert.equal(svc.entries.has('turbo-tracy-ci-bbbb'), false)
})

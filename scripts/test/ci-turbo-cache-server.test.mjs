import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { VERSION, actionsCache, cacheKey, cacheServer, redact } from '../ci/turbo-cache-server.mjs'

const RUNTIME = 'runtime-token-SECRETMARKER'
const TWIRP = '/twirp/github.actions.results.api.v1.CacheService/'

/**
 * A fake of the GitHub Actions cache service v2: the three Twirp calls `@actions/cache` 4.x makes
 * and the Azure blob behind the signed URLs. The wire format is the real one: requests in proto
 * field names (`toJson({ useProtoFieldName: true, emitDefaultValues: false })` in the generated
 * client — so an empty `restore_keys` is absent), answers in proto names too (what a Twirp server
 * emits; the first CI run read `signedUploadUrl` from them and never wrote), int64 as a string.
 * `fail` makes every Twirp call answer 500; `failWith` answers that status and body instead.
 */
async function fakeService() {
  const entries = new Map() // key → { version, data?, size? }
  const calls = []
  const state = { fail: false, failWith: null }
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
        if (req.headers['x-ms-blob-type'] !== 'BlockBlob' || !req.headers['x-ms-version'])
          return json(400, {})
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
    if (req.headers['content-type'] !== 'application/json') return json(415, { code: 'malformed' })
    if (state.fail) return json(500, { code: 'internal' })
    if (state.failWith) return res.writeHead(state.failWith.status), res.end(state.failWith.body)
    const r = JSON.parse(body.toString())
    for (const camel of ['restoreKeys', 'sizeBytes', 'signedUploadUrl'])
      assert.equal(r[camel], undefined, `${camel} is not a field the client sends`)
    const base = `http://127.0.0.1:${String(server.address().port)}/blob/${encodeURIComponent(r.key)}?sig=ok`
    if (method === 'GetCacheEntryDownloadURL') {
      const e = entries.get(r.key)
      assert.equal(r.restore_keys, undefined)
      if (!e || e.version !== r.version || e.size === undefined) return json(200, { ok: false })
      return json(200, { ok: true, signed_download_url: base, matched_key: r.key })
    }
    if (method === 'CreateCacheEntry') {
      if (entries.has(r.key))
        return json(409, {
          code: 'already_exists',
          msg: 'cache entry with the same key, version, and scope already exists'
        })
      entries.set(r.key, { version: r.version })
      return json(200, { ok: true, signed_upload_url: base })
    }
    if (method === 'FinalizeCacheEntryUpload') {
      const e = entries.get(r.key)
      assert.equal(typeof r.size_bytes, 'string')
      if (!e?.data || Number(r.size_bytes) !== e.data.length) return json(200, { ok: false, message: 'size' })
      e.size = Number(r.size_bytes)
      return json(200, { ok: true, entry_id: '1' })
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

test('redact strips every URL query, masks the token and any bearer, and cuts to 500 bytes', () => {
  const sas = 'https://acct.blob.core.windows.net/c/turbo-ci-aaaa?sv=2024-11-04&sig=SIGMARKER&se=1'
  const out = redact(`PUT ${sas} failed for ${RUNTIME}; Authorization: Bearer abc.def`, [RUNTIME])
  assert.equal(
    out,
    'PUT https://acct.blob.core.windows.net/c/turbo-ci-aaaa?<query removed> failed for ***; Authorization: Bearer ***'
  )
  assert.equal(Buffer.byteLength(redact('x'.repeat(2000))), 500 + Buffer.byteLength('…'))
})

test('every cache-service failure is logged — which call, status, body start — and never the token or a signature', async (t) => {
  const svc = await fakeService()
  const s = await serve(svc)
  t.after(() => (s.close(), svc.close()))
  const put = (h) =>
    fetch(`${s.base}/v8/artifacts/${h}?teamId=ci`, { method: 'PUT', headers: auth, body: 'x' })
  const leak = `https://acct.blob.core.windows.net/c/k?sig=SIGMARKER Bearer ${RUNTIME}`

  // CreateCacheEntry refused, its answer echoing a signed URL and the token.
  svc.state.failWith = { status: 403, body: JSON.stringify({ code: 'permission_denied', msg: leak }) }
  assert.equal((await put('aaaa')).status, 502)
  // GetCacheEntryDownloadURL refused: a miss, and a log line.
  assert.equal(
    (await fetch(`${s.base}/v8/artifacts/aaaa?teamId=ci`, { method: 'HEAD', headers: auth })).status,
    404
  )
  svc.state.failWith = null

  // The signed upload URL refused by the blob store (Azure answers XML).
  const fetchImpl = (url, init) =>
    String(url).includes('/blob/') && init?.method === 'PUT'
      ? Promise.resolve(
          new Response(`<Error><Code>AuthenticationFailed</Code><Url>${String(url)}</Url></Error>`, {
            status: 403
          })
        )
      : fetch(url, init)
  const failures = []
  const cache = actionsCache({
    resultsUrl: svc.url,
    runtimeToken: RUNTIME,
    fetchImpl,
    onFailure: (f) => failures.push(f)
  })
  await assert.rejects(cache.write('turbo-ci-bbbb', Buffer.from('x')), /upload: HTTP 403/)
  // An unreachable service: a network failure, still a named call.
  const down = actionsCache({
    resultsUrl: 'http://127.0.0.1:9/',
    runtimeToken: RUNTIME,
    onFailure: (f) => failures.push(f)
  })
  assert.equal(await down.lookup('turbo-ci-cccc').catch(() => 'threw'), 'threw')
  assert.deepEqual(
    failures.map((f) => `${f.call} ${String(f.status)}`),
    ['upload 403', 'GetCacheEntryDownloadURL network']
  )
  assert.match(failures[0].url, /^http:\/\/127\.0\.0\.1:\d+\/blob\/turbo-ci-bbbb$/)
  assert.match(failures[0].body, /AuthenticationFailed/)

  const all = s.logs.join('\n') + JSON.stringify(failures)
  assert.match(
    all,
    /cache-service failure: CreateCacheEntry HTTP 403 http:\/\/127\.0\.0\.1:\d+\/twirp\/[^ ]*CreateCacheEntry — .*permission_denied/
  )
  assert.match(all, /cache-service failure: GetCacheEntryDownloadURL HTTP 403/)
  assert.ok(!all.includes(RUNTIME), 'the runtime token is logged')
  assert.ok(!all.includes('SIGMARKER') && !all.includes('sig=ok'), 'a signed URL query is logged')
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

  // A same-repository run whose write fails: the failure is in $RUNNER_TEMP/turbo-cache.log, the
  // file the workflow prints at the end of the job, without the token or a signature.
  process.kill(pid)
  pid = 0
  rmSync(join(dir, 'turbo-cache.log'), { force: true })
  const rw = start({
    ACTIONS_RUNTIME_TOKEN: RUNTIME,
    ACTIONS_RESULTS_URL: svc.url,
    INPUT_PORT: String(port + 1),
    GITHUB_EVENT_NAME: 'push'
  })
  assert.equal(rw.status, 0, rw.stdout + rw.stderr)
  pid = Number(/server pid (\d+)/.exec(rw.stdout)?.[1])
  const rwEnv = exported()
  svc.state.failWith = {
    status: 400,
    body: JSON.stringify({ msg: `bad https://x.blob.core.windows.net/c?sig=SIGMARKER ${RUNTIME}` })
  }
  const failed = await fetch(`${rwEnv.TURBO_API}/v8/artifacts/cccc?teamId=tracy-ci`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${rwEnv.TURBO_TOKEN}` },
    body: 'x'
  })
  assert.equal(failed.status, 502)
  const log = readFileSync(join(dir, 'turbo-cache.log'), 'utf8')
  assert.match(log, /listening \(read-write\)/)
  assert.match(
    log,
    /cache-service failure: CreateCacheEntry HTTP 400 .*x\.blob\.core\.windows\.net\/c\?<query removed>/
  )
  assert.ok(!log.includes(RUNTIME) && !log.includes('SIGMARKER') && !log.includes(rwEnv.TURBO_TOKEN))
})

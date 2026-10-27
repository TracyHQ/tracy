#!/usr/bin/env node
/**
 * The webroot read on a slow customer uplink (#1566) and what it tells the wizard while it runs
 * (#1567), driven through the real `exportFiles` and the real upload cursor book.
 *
 * #1566 (QA, 21/10/2026): parts of 8 MiB, each PUT by the site's component with its own 120 s cURL
 * limit, need a sustained ~70 KB/s; on an uplink of 38–133 KB/s one part failed again and again
 * until the run stopped. Asking the same 8 MiB of the same road again cannot work, so a part that
 * runs out of time is asked smaller (5 MiB, the store's floor) and then carried in the answer
 * (`inline`), where no 120 s limit of the component's applies and this side waits as long as the
 * part's size needs.
 *
 * #1567: the progress counted files only, so a slow but healthy read sat still for half an hour.
 * The read now says the bytes sent, the site's total when its engine can tell it
 * (`site.fingerprint`), and when the part on its way started.
 *
 * The engine, the store and the relay are a small in-memory world; `fetch` is mocked.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const realFetch = globalThis.fetch
const realHome = process.env.DSH_HOME
const MIB = 1024 * 1024
const ENDPOINT = 'https://site.test/index.php?option=com_claudecowork&task=api.exec'
const SITE = 'site.test'

let exporter
let buildDir
const homes = []

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-files-slow-build-'))
  const built = await esbuild.build({
    entryPoints: [path.join(pkgRoot, 'src/host/export.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    write: false
  })
  const file = path.join(buildDir, 'export.mjs')
  writeFileSync(file, built.outputFiles[0].text)
  exporter = await import(pathToFileURL(file).href)
})

after(() => {
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

beforeEach(() => {
  const home = mkdtempSync(path.join(tmpdir(), 'tch-files-slow-home-'))
  homes.push(home)
  process.env.DSH_HOME = home
})

/** The store's side of the read: a multipart upload this side signs parts of. */
function store() {
  const parts = new Map()
  let finished = null
  return {
    parts,
    get finished() {
      return finished
    },
    artifacts: {
      begin: async () => ({ key: 'webroot/1.tar', uploadId: 'up-1' }),
      signPart: async (_key, _id, n) => `https://store.test/part/${n}?sig=${Math.random()}`,
      finish: async (_key, _id, list) => {
        finished = list
      },
      abandon: async () => undefined,
      remove: async () => undefined,
      signPut: async () => ({ key: 'db', url: 'https://store.test/db' })
    }
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * The engine: `pack(params, n)` answers the n-th `files.pack` call (or throws, as an aborted fetch
 * does); `fingerprint` answers `site.fingerprint`. Every call is logged.
 */
function engine({ pack, fingerprint }) {
  const calls = []
  const stored = store()
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    if (url === ENDPOINT) {
      const { action, params } = JSON.parse(init.body)
      calls.push({ action, params, at: Date.now() })
      if (action === 'site.fingerprint')
        return fingerprint ? json(fingerprint(params)) : json({ ok: false, error: 'unknown_action' })
      if (action === 'files.pack') {
        const packs = calls.filter((c) => c.action === 'files.pack').length
        return json(await pack(params, packs))
      }
      throw new TypeError(`unexpected action ${action}`)
    }
    if (url.startsWith('https://store.test/part/') && init.method === 'PUT') {
      stored.parts.set(url, Buffer.from(init.body))
      return new Response(null, { status: 200, headers: { etag: `"etag-${stored.parts.size}"` } })
    }
    throw new TypeError(`unexpected fetch ${init.method ?? 'GET'} ${url}`)
  }
  return { calls, stored }
}

const packed = (params, { done, files = 1, bytes = params.target_bytes ?? 8 * MIB }) => ({
  ok: true,
  etag: params.inline ? '' : `etag-${Math.random()}`,
  ...(params.inline ? { part_b64: Buffer.from('tar bytes').toString('base64') } : {}),
  files,
  bytes,
  next_path: done ? '' : `big/file-${files}.zip`,
  next_offset: done ? 0 : 4096,
  next_size: done ? 0 : 900 * MIB,
  done
})

// ── #1566 ────────────────────────────────────────────────────────────────────────────────────────

test('#1566: a part the component could not PUT in time goes inline at the same size, and the read finishes', async () => {
  const { calls, stored } = engine({
    pack: (params, n) => {
      // A second call on the PUT road would be the same failure again: stop the read quickly.
      if (!params.inline && n >= 2) return { ok: false, error: 'stopped_by_test' }
      // The component's own 120 s cURL limit, relayed as its own failure with no HTTP status.
      if (!params.inline)
        return {
          ok: false,
          error: 'upload_failed',
          message:
            'cURL error 28: Operation timed out after 120001 milliseconds with 3145728 out of 8388608 bytes sent'
        }
      return packed(params, { done: n >= 3 })
    }
  })
  const result = await exporter.exportFiles(ENDPOINT, 'token', stored.artifacts, SITE)

  const packs = calls.filter((c) => c.action === 'files.pack').map((c) => c.params)
  assert.deepEqual(
    packs.map((p) => [p.inline === true ? 'inline' : 'put', p.target_bytes / MIB]),
    [
      ['put', 8],
      ['inline', 8],
      // Kept for the rest of the read: the uplink that was slow for one part is slow for the next.
      // The size never changes: R2 refuses to complete parts of different sizes (InvalidPart).
      ['inline', 8]
    ]
  )
  // Every attempt takes its own number: the retry of part 1 went under 2.
  assert.deepEqual(
    stored.finished.map((p) => p.PartNumber),
    [2, 3]
  )
  assert.equal(new Set(packs.slice(0, 2).map((p) => `${p.path}:${p.offset}`)).size, 1)
  assert.equal(result.parts, 2)
})

/**
 * The store as R2 keeps a multipart upload: the last PUT to a number wins, and complete checks each
 * listed ETag against what that number holds and that every part but the last has one size.
 */
function r2Store() {
  const held = new Map()
  let archive = null
  let finished = null
  const etag = (bytes) => `"${createHash('md5').update(bytes).digest('hex')}"`
  return {
    held,
    get archive() {
      return archive
    },
    get finished() {
      return finished
    },
    put(n, bytes) {
      held.set(n, bytes)
      return etag(bytes)
    },
    artifacts: {
      begin: async () => ({ key: 'webroot/1.tar', uploadId: 'up-1' }),
      signPart: async (_key, _id, n) => `https://store.test/part/${n}`,
      finish: async (_key, _id, list) => {
        finished = list
        for (const [i, part] of list.entries()) {
          const bytes = held.get(part.PartNumber)
          if (!bytes || etag(bytes) !== `"${part.ETag.replace(/"/g, '')}"`) throw new Error('InvalidPart')
          if (i < list.length - 1 && bytes.length !== held.get(list[0].PartNumber).length)
            throw new Error('InvalidPart: non-trailing parts differ in size')
        }
        archive = Buffer.concat(list.map((part) => held.get(part.PartNumber)))
      },
      abandon: async () => undefined,
      remove: async () => undefined,
      signPut: async () => ({ key: 'db', url: 'https://store.test/db' })
    }
  }
}

test('#1566: a late PUT from a call this side gave up on cannot replace the retried part', async () => {
  const store = r2Store()
  const part = (name) => Buffer.from(name.padEnd(16, '.'))
  let late
  let packs = 0
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    if (url === ENDPOINT) {
      const { action, params } = JSON.parse(init.body)
      if (action === 'site.fingerprint') return json({ ok: false, error: 'unknown_action' })
      packs += 1
      const n = Number(params.put_url?.split('/').pop())
      if (packs === 1) {
        // Still packing when this side stops waiting: its PUT, of what the file held then, lands later.
        late = () => store.put(n, part('stale-a'))
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      }
      const name = params.path === '' ? 'fresh-a' : 'fresh-b'
      const done = params.path !== ''
      const body = part(name)
      return json({
        ok: true,
        etag: '',
        part_b64: params.inline ? body.toString('base64') : undefined,
        files: 1,
        bytes: body.length,
        next_path: done ? '' : 'b',
        next_offset: 0,
        done
      })
    }
    if (url.startsWith('https://store.test/part/') && init.method === 'PUT') {
      const tag = store.put(Number(url.split('/').pop()), Buffer.from(init.body))
      // The abandoned call's PUT arrives after the retry already stored its part.
      late?.()
      late = undefined
      return new Response(null, { status: 200, headers: { etag: tag } })
    }
    throw new TypeError(`unexpected fetch ${init.method ?? 'GET'} ${url}`)
  }

  const result = await exporter.exportFiles(ENDPOINT, 'token', store.artifacts, SITE)
  assert.equal(result.parts, 2)
  assert.equal(store.archive.toString(), `${part('fresh-a')}${part('fresh-b')}`)
  // The abandoned number holds the stale bytes, and nothing names it.
  assert.equal(store.held.get(1).toString(), part('stale-a').toString())
})

/** An engine and store world for the part-number tests: parts named by their cursor, fixed size. */
function numberWorld(store, { pack, putPart }) {
  const part = (name) => Buffer.from(name.padEnd(16, '.'))
  const answer = (params) => {
    const done = params.path !== ''
    const body = part(params.path === '' ? 'fresh-a' : 'fresh-b')
    return json({
      ok: true,
      etag: params.inline ? '' : store.put(Number(params.put_url.split('/').pop()), body).replace(/"/g, ''),
      ...(params.inline ? { part_b64: body.toString('base64') } : {}),
      files: 1,
      bytes: body.length,
      next_path: done ? '' : 'b',
      next_offset: 0,
      done
    })
  }
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    if (url === ENDPOINT) {
      const { action, params } = JSON.parse(init.body)
      if (action === 'site.fingerprint') return json({ ok: false, error: 'unknown_action' })
      return (await pack?.(params)) ?? answer(params)
    }
    if (url.startsWith('https://store.test/part/') && init.method === 'PUT') {
      const n = Number(url.split('/').pop())
      const custom = await putPart?.(n, Buffer.from(init.body))
      if (custom) return custom
      return new Response(null, { status: 200, headers: { etag: store.put(n, Buffer.from(init.body)) } })
    }
    throw new TypeError(`unexpected fetch ${init.method ?? 'GET'} ${url}`)
  }
  return { part }
}

test('#1566: a number reserved before a call dsh never saw end is not used again by Continue', async () => {
  const store = r2Store()
  let late
  const world = numberWorld(store, {
    pack: (params) => {
      if (params.path !== 'b' || late) return undefined
      // dsh is replaced while the component packs part 2: the call never ends on this side, and
      // the component's PUT of what the file held then lands after the Continue stored its part.
      late = () => store.put(Number(params.put_url.split('/').pop()), world.part('stale-b'))
      return new Promise(() => {})
    }
  })
  void exporter.exportFiles(ENDPOINT, 'token', store.artifacts, SITE)
  await new Promise((resolve) => {
    const wait = () => (late ? resolve() : setTimeout(wait, 10))
    wait()
  })
  const book = JSON.parse(
    readFileSync(path.join(process.env.DSH_HOME, 'tracy-add-site', 'uploads.json'), 'utf8')
  )
  assert.equal(book[SITE].nextPart, 3, 'part 2 was reserved on disk before the call')

  // Continue: a new read from the cursor on disk (the dsh that comes back).
  const result = await exporter.exportFiles(ENDPOINT, 'token', store.artifacts, SITE)
  late()
  assert.equal(result.parts, 2)
  await store.artifacts.finish('webroot/1.tar', 'up-1', store.finished)
  assert.equal(store.archive.toString(), `${world.part('fresh-a')}${world.part('fresh-b')}`)
  assert.deepEqual(
    store.finished.map((p) => p.PartNumber),
    [1, 3]
  )
})

test('#1566: an inline PUT that throws after sending is retried under a new number', async () => {
  const store = r2Store()
  let late
  let thrown = false
  const world = numberWorld(store, {
    putPart: (n, bytes) => {
      if (late) {
        // The retry's PUT is stored first; the first PUT, sent but unanswered, lands after it.
        const stale = late
        late = undefined
        const tag = store.put(n, bytes)
        stale()
        return new Response(null, { status: 200, headers: { etag: tag } })
      }
      if (thrown) return undefined
      thrown = true
      late = () => store.put(n, world.part('stale-a'))
      throw new TypeError('fetch failed')
    }
  })
  const result = await exporter.exportFiles(ENDPOINT, 'token', store.artifacts, SITE, undefined, {
    inline: true
  })
  assert.equal(result.parts, 2)
  assert.equal(store.archive.toString(), `${world.part('fresh-a')}${world.part('fresh-b')}`)
  assert.deepEqual(
    store.finished.map((p) => p.PartNumber),
    [2, 3]
  )
})

test('#1566: a slow part waits as long as its size needs at a slow uplink, not a fixed two minutes', () => {
  const SLOW = 16 * 1024 // bytes per second
  // Inline, the part travels base64 in the answer: 4/3 of its size.
  assert.ok(exporter.packTimeoutMs(true, 8 * MIB) >= ((8 * MIB * 4) / 3 / SLOW) * 1000)
  // On the PUT road the component's own 120 s limit answers first; this side waits past it.
  assert.ok(exporter.packTimeoutMs(false, 8 * MIB) > 120_000)
})

// ── #1567 ────────────────────────────────────────────────────────────────────────────────────────

test('#1567: the read says the bytes sent, the site total and when the part on its way started', async () => {
  const { stored } = engine({
    fingerprint: () => ({
      ok: true,
      fingerprint: { files: { count: 1200, bytes: 30 * MIB, next_after: null } }
    }),
    pack: (params, n) => packed(params, { done: n >= 3, files: 400, bytes: 8 * MIB })
  })
  const events = []
  const before = Date.now()
  await exporter.exportFiles(ENDPOINT, 'token', stored.artifacts, SITE, (progress) => events.push(progress))

  assert.ok(events.length > 0)
  assert.ok(
    events.every((e) => e.total === 30 * MIB),
    'every progress names the total the site reported'
  )
  const done = events.filter((e) => e.retrying === undefined).map((e) => [e.parts, e.bytes])
  assert.deepEqual(done.at(-1), [3, 24 * MIB])
  // Before each part goes, the time it started is told, so a long part shows as moving.
  const sending = events.filter((e) => typeof e.partStartedAt === 'number')
  assert.ok(sending.length >= 3)
  assert.ok(sending.every((e) => e.partStartedAt >= before))
})

test('#1567: an engine that cannot tell its total still reads, with no total', async () => {
  const { stored } = engine({ pack: (params, n) => packed(params, { done: n >= 2 }) })
  const events = []
  const result = await exporter.exportFiles(ENDPOINT, 'token', stored.artifacts, SITE, (p) => events.push(p))
  assert.equal(result.parts, 2)
  assert.ok(events.every((e) => e.total === undefined))
})

// ── #1616 ────────────────────────────────────────────────────────────────────────────────────────

/** Runs `body` with every timer of the retry ladder and the call pacing cut to zero. */
async function withoutWaits(body) {
  const realSetTimeout = globalThis.setTimeout
  globalThis.setTimeout = (fn, _ms, ...args) => realSetTimeout(fn, 0, ...args)
  try {
    return await body()
  } finally {
    globalThis.setTimeout = realSetTimeout
  }
}

/** The site went down while part 3 was read: parts 1 and 2 land, then every call meets `failure`. */
function goesDownAtPart3(failure) {
  const calls = []
  const stored = store()
  const abandoned = []
  stored.artifacts.abandon = async (...args) => void abandoned.push(args)
  globalThis.fetch = async (url, init = {}) => {
    url = String(url)
    if (url === ENDPOINT) {
      const { action, params } = JSON.parse(init.body)
      calls.push({ action, params })
      if (action === 'site.fingerprint') return json({ ok: false, error: 'unknown_action' })
      const packs = calls.filter((c) => c.action === 'files.pack').length
      if (packs <= 2) return json({ ...packed(params, { done: false, files: packs }), etag: `etag-${packs}` })
      return failure()
    }
    throw new TypeError(`unexpected fetch ${init.method ?? 'GET'} ${url}`)
  }
  return { calls, stored, abandoned }
}

const cursorBook = () =>
  JSON.parse(readFileSync(path.join(process.env.DSH_HOME, 'tracy-add-site', 'uploads.json'), 'utf8'))[SITE]

test('#1616: a Cloudflare tunnel whose origin went down mid-files is site_offline, retried, cursor kept', async () => {
  const world = goesDownAtPart3(
    () =>
      // The page the edge answered for a quick tunnel whose origin refused connections (measured).
      new Response(readFileSync(path.join(here, 'fixtures/cloudflare-tunnel-origin-down-502.html'), 'utf8'), {
        status: 502,
        headers: {
          'content-type': 'text/html; charset=UTF-8',
          server: 'cloudflare',
          'cf-ray': '8d1f2e3a4b5c6d7e-AMS',
          'retry-after': '60'
        }
      })
  )
  await withoutWaits(() =>
    assert.rejects(exporter.exportFiles(ENDPOINT, 'token', world.stored.artifacts, SITE), (error) => {
      assert.equal(error.name, 'ExportFailed')
      assert.equal(error.reason, 'site_offline')
      assert.equal(error.detail, 'cloudflare 502')
      return true
    })
  )
  const packs = world.calls.filter((c) => c.action === 'files.pack')
  assert.equal(packs.length, 2 + 6, 'part 3 was asked on every rung of the part ladder')
  assert.deepEqual(world.abandoned, [], 'the upload is not abandoned')
  assert.equal(cursorBook()?.uploadId, 'up-1', 'the cursor stays, so Start again goes on from it')
})

test('#1616: a socket the site closes on every attempt is site_offline once the ladder runs out', async () => {
  const world = goesDownAtPart3(() => {
    throw new TypeError('fetch failed', {
      cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
    })
  })
  await withoutWaits(() =>
    assert.rejects(exporter.exportFiles(ENDPOINT, 'token', world.stored.artifacts, SITE), (error) => {
      assert.equal(error.reason, 'site_offline')
      assert.equal(error.detail, 'UND_ERR_SOCKET')
      return true
    })
  )
  assert.equal(world.calls.filter((c) => c.action === 'files.pack').length, 2 + 6)
  assert.equal(cursorBook()?.uploadId, 'up-1')
})

test("#1616: the site's own PHP 500 mid-files is still site_resource_limit", async () => {
  const world = goesDownAtPart3(
    () =>
      new Response('<b>Fatal error</b>: Maximum execution time of 30 seconds exceeded', {
        status: 500,
        headers: { 'content-type': 'text/html' }
      })
  )
  await withoutWaits(() =>
    assert.rejects(exporter.exportFiles(ENDPOINT, 'token', world.stored.artifacts, SITE), (error) => {
      assert.equal(error.reason, 'site_resource_limit')
      return true
    })
  )
  assert.equal(cursorBook()?.uploadId, 'up-1')
})

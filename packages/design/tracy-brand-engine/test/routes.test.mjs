/**
 * The host half over real HTTP: `apply()` is given a fake cordis context whose `webServer.register`
 * mounts the route on a Node server, and every door is knocked on the way the browser does. The
 * extraction itself is not run here (it needs a site); a brand is seeded on disk with `writeDirection`
 * and injected no-op harvesters, exactly the tree the routes then read.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { prefetchFromHtml } from '@tracy/od-brand-engine'

import { apply, inject, name } from '../lib/index.js'
import { NO_ENRICH, writeDirection } from '../src/host/pipeline.mjs'

const HTML = `<!doctype html><html><head><title>Acme Tools | Hand tools</title>
<style>body{font-family:Fraunces,serif;color:#222;background:#fff} a{color:#b7410e}</style></head>
<body><h1>Tools that outlive their owners.</h1><p>Forged in Sheffield.</p></body></html>`

let siteDir
let server
let base
let tool

before(async () => {
  siteDir = mkdtempSync(path.join(tmpdir(), 'tracy-brand-routes-'))
  const dir = path.join(siteDir, 'Brand', 'acme.example')
  const material = await prefetchFromHtml(HTML, '', 'https://acme.example/', dir)
  await writeDirection(material, {
    url: 'https://acme.example/',
    host: 'acme.example',
    kind: 'reference',
    dir,
    enrich: {
      ...NO_ENRICH,
      imagery: async (_u, imageryDir, slot) => {
        mkdirSync(imageryDir, { recursive: true })
        writeFileSync(path.join(imageryDir, 'cover-0.jpg'), Buffer.from([0xff, 0xd8, 0xff]))
        slot.samples = [{ file: 'imagery/cover-0.jpg', kind: 'cover' }]
        return { changed: true }
      }
    }
  })
  mkdirSync(path.join(dir, 'logos'), { recursive: true })
  writeFileSync(path.join(dir, 'logos', 'favicon-0.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

  let handler = null
  const ctx = {
    effect: (fn) => fn(),
    webServer: {
      register: (route) => {
        handler = route
        return () => undefined
      }
    },
    tools: {
      register: (t) => {
        tool = t
        return () => undefined
      }
    }
  }
  // Test injection: the fork doors extract for real, against the fake site below, with no browser.
  apply(ctx, {
    siteDir,
    fetch: (url, init) => forkFetch(url, init),
    enrich: NO_ENRICH,
    reconScriptsDir: path.join(siteDir, 'no-scripts')
  })
  assert.ok(handler, 'a route was registered')
  server = http.createServer((req, res) => {
    if (req.url.startsWith(handler.path)) handler.handler(req, res)
    else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}/api/tracy-brand-engine`
})

after(() => {
  server?.close()
  rmSync(siteDir, { recursive: true, force: true })
})

test('identity: cordis name and the two injected services', () => {
  assert.equal(name, 'tracy-brand-engine')
  assert.deepEqual(inject, ['webServer', 'tools'])
})

test('GET brands: the seeded reference, with the brand.json summary the card draws from', async () => {
  const res = await fetch(`${base}/brands`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.brands.length, 1)
  const b = body.brands[0]
  assert.equal(b.id, 'brand:acme.example')
  assert.equal(b.kind, 'reference')
  assert.equal(b.category, 'Reference')
  assert.equal(b.brand.name, 'Acme Tools')
  assert.equal(b.brand.display, 'Fraunces')
  assert.deepEqual(b.brand.imagery, ['imagery/cover-0.jpg'])
  assert.ok(b.brand.colors.some((c) => c.role === 'accent' && c.hex === '#b7410e'))
})

test('GET brands/<host>/logos|imagery/<file>: the bytes with their type; traversal and other dirs are 404', async () => {
  const logo = await fetch(`${base}/brands/acme.example/logos/favicon-0.png`)
  assert.equal(logo.status, 200)
  assert.equal(logo.headers.get('content-type'), 'image/png')
  assert.equal((await logo.arrayBuffer()).byteLength, 4)
  const img = await fetch(`${base}/brands/acme.example/imagery/cover-0.jpg`)
  assert.equal(img.status, 200)
  assert.equal(img.headers.get('content-type'), 'image/jpeg')
  for (const bad of [
    'brands/acme.example/logos/missing.png',
    'brands/acme.example/logos/..%2F..%2Fbrand.json',
    'brands/acme.example/logos/brand.json',
    'brands/acme.example/fonts/x.woff2',
    'brands/..%2Fetc/logos/passwd.png',
    'brands/127.0.0.1/logos/a.png'
  ]) {
    const res = await fetch(`${base}/${bad}`)
    assert.equal(res.status, 404, bad)
  }
})

test('POST extract: an input that is not a public site is refused before any job starts', async () => {
  for (const url of ['localhost', 'file:///etc/passwd', '127.0.0.1', 'javascript:alert(1)']) {
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    })
    assert.equal(res.status, 400, url)
    assert.equal((await res.json()).code, 'BAD_URL')
  }
  // No siteKey on this machine and no url: nothing to extract.
  const empty = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}'
  })
  assert.equal(empty.status, 400)
})

test('GET extract/<host>: a measurement on disk answers even with no job in this process', async () => {
  // The card is seeded on disk and this process has never run a job for it — the shape a lane is in
  // after a restart mid-poll. Answering 404 there would tell the caller to redo finished work.
  const res = await fetch(`${base}/extract/acme.example`)
  assert.equal(res.status, 200)
  const job = await res.json()
  assert.equal(job.state, 'done')
  assert.equal(job.phase, 'full')
  assert.deepEqual(
    job.steps.map((s) => s.step),
    ['on-disk']
  )
  assert.equal(job.manifest.id, 'brand:acme.example')

  // A host with nothing on disk and no job is still 404.
  const nothing = await fetch(`${base}/extract/nobody.example`)
  assert.equal(nothing.status, 404)
  assert.equal((await nothing.json()).code, 'NO_JOB')
  assert.equal((await fetch(`${base}/nope`)).status, 404)
  assert.equal((await fetch(`${base}/brands`, { method: 'PUT' })).status, 404)
})

test('POST extract: a site measured in the last 30 days is handed back, not measured again', async () => {
  const before = JSON.parse(
    readFileSync(path.join(siteDir, 'Brand', 'acme.example', 'manifest.json'), 'utf8')
  )
  // `acme.example` is not in the fake site map, so anything that actually ran would fail — the
  // 200 below is proof that nothing did.
  const res = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://acme.example/', kind: 'reference' })
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.reused, true)
  assert.equal(body.state, 'done')
  assert.equal(body.manifest.id, 'brand:acme.example')
  const after = JSON.parse(readFileSync(path.join(siteDir, 'Brand', 'acme.example', 'manifest.json'), 'utf8'))
  assert.equal(after.source.extractedAt, before.source.extractedAt, 'the folder was not rewritten')
})

test('POST extract: a measurement older than 30 days is not reused', async () => {
  const file = path.join(siteDir, 'Brand', 'acme.example', 'manifest.json')
  const kept = readFileSync(file, 'utf8')
  const aged = JSON.parse(kept)
  aged.source.extractedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
  writeFileSync(file, JSON.stringify(aged, null, 2))
  try {
    // Nothing serves acme.example, so the run this starts fails — which is the point: it RAN.
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://acme.example/', kind: 'reference' })
    })
    assert.equal(res.status, 202)
    assert.equal((await res.json()).reused, undefined)
    const job = await untilDone('acme.example')
    assert.equal(job.state, 'failed', 'it tried to measure a site that is not there')
    // 🔒 And the card that was already there survived the attempt. Before this, a failed
    // re-measurement deleted the folder it was refreshing.
    assert.ok(existsSync(file), 'the previous measurement is still on disk')
    assert.ok(existsSync(path.join(siteDir, 'Brand', 'acme.example', 'components.html')))
    assert.equal(
      existsSync(path.join(siteDir, 'Brand', 'acme.example.prev')),
      false,
      'nothing is left standing aside'
    )
  } finally {
    writeFileSync(file, kept)
  }
})

test('POST extract: a deep request is not answered by a measurement with no crawl', async () => {
  // `acme.example` was seeded without pages. A caller that asked for the crawl must not be handed
  // a folder that has none — depth is the one thing a fresh measurement cannot stand in for.
  const res = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://acme.example/', kind: 'reference', deep: true })
  })
  assert.equal(res.status, 202)
  assert.equal((await res.json()).reused, undefined)
  await untilDone('acme.example')
})

test('a lock held by another writer stops a second one starting, and a stale lock does not', async () => {
  const locks = path.join(siteDir, 'Brand', '.locks')
  mkdirSync(locks, { recursive: true })
  const held = path.join(locks, 'locked.example')
  writeFileSync(held, '999 held-by-a-test\n')
  try {
    // 🔒 The guard is against the PUBLISHER, not a second extraction: `sync-brands.sh` copies these
    // folders out on a timer, and `extractBrand` empties one before refilling it.
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://locked.example/', kind: 'reference' })
    })
    assert.equal(res.status, 202)
    const job = await res.json()
    assert.equal(job.state, 'running')
    assert.deepEqual(
      job.steps.map((s) => s.step),
      ['waiting-for-writer']
    )
    assert.equal(existsSync(path.join(siteDir, 'Brand', 'locked.example')), false, 'nothing was written')
  } finally {
    rmSync(held, { force: true })
  }

  // A lock older than the longest an extraction can run belonged to a process that died holding it.
  writeFileSync(held, '999 stale\n')
  const old = Date.now() - 5 * 60 * 1000 - 150_000 - 90_000
  utimesSync(held, old / 1000, old / 1000)
  try {
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://locked.example/', kind: 'reference' })
    })
    assert.equal(res.status, 202)
    assert.notDeepEqual(
      (await res.json()).steps.map((s) => s.step),
      ['waiting-for-writer'],
      'a stale lock is ignored, not waited on'
    )
    await untilDone('locked.example')
  } finally {
    rmSync(held, { force: true })
  }
})

test('tool tracy_brand: list and read answer from the folder; read of an unknown host says NOT_EXTRACTED', async () => {
  assert.equal(tool.name, 'tracy_brand')
  const list = await tool.execute({ action: 'list' })
  assert.equal(list.ok, true)
  assert.equal(list.brands[0].id, 'brand:acme.example')
  const read = await tool.execute({ action: 'read', url: 'acme.example' })
  assert.equal(read.ok, true)
  assert.equal(read.brand.name, 'Acme Tools')
  assert.equal(read.manifest.kind, 'reference')
  assert.match(read.material, /^# Brand material/)
  const none = await tool.execute({ action: 'read', url: 'nobody.example' })
  assert.deepEqual([none.ok, none.code], [false, 'NOT_EXTRACTED'])
  const bad = await tool.execute({ action: 'read', url: 'localhost' })
  assert.deepEqual([bad.ok, bad.code], [false, 'BAD_URL'])
  const nosite = await tool.execute({ action: 'read' })
  assert.deepEqual([nosite.ok, nosite.code], [false, 'NO_SITE'], 'no MCP_TRACY_SITE_KEY on the test machine')
  const what = await tool.execute({ action: 'dance', url: 'acme.example' })
  assert.equal(what.code, 'BAD_ACTION')
})

test('DELETE brands/<host>: the folder is gone and the list is empty', async () => {
  const res = await fetch(`${base}/brands/acme.example`, { method: 'DELETE' })
  assert.equal(res.status, 200)
  const list = await (await fetch(`${base}/brands`)).json()
  assert.deepEqual(list.brands, [])
  assert.equal((await fetch(`${base}/brands/..%2Fetc`, { method: 'DELETE' })).status, 400)
})

/**
 * "Fork a site" doors. The site is a fake served by the `fetch` the test injected into `apply()`'s
 * config (see `before`), so the extraction runs end to end with no network and no browser.
 */
const FORK_SITE = {
  'https://fork.example/':
    '<!doctype html><html><head><title>Fork Co | Cranes</title><link rel="stylesheet" href="/f.css"></head>' +
    '<body><nav><a href="/cranes/">Cranes</a><a href="/about">About</a></nav><h1>Cranes that lift more.</h1></body></html>',
  'https://fork.example/f.css':
    'body{font-family:Fraunces,serif;color:#222;background:#fff} a{color:#0b6e4f}',
  'https://fork.example/cranes/':
    '<html><head><title>Cranes</title></head><body><h1>Every crane</h1></body></html>',
  'https://fork.example/about':
    '<html><head><title>About</title></head><body><h1>Since 1970</h1></body></html>',
  // A second site for the seat-folder test below: `jobs` is process-wide, so a host the earlier
  // tests measured would answer from memory and prove nothing about the folder.
  'https://seat.example/':
    '<!doctype html><html><head><title>Seat Co | Chairs</title><link rel="stylesheet" href="/s.css"></head>' +
    '<body><h1>Chairs that last.</h1></body></html>',
  'https://seat.example/s.css': 'body{font-family:Fraunces,serif;color:#222;background:#fff} a{color:#7a1f1f}'
}
const forkFetch = async (url) => {
  const body = FORK_SITE[url]
  if (body === undefined) return new Response('', { status: 404 })
  return new Response(body, {
    status: 200,
    headers: { 'content-type': url.endsWith('.css') ? 'text/css' : 'text/html' }
  })
}

/**
 * How long a job may take before the test calls it hung. A DEADLINE, not an iteration count,
 * and a generous one: the old `100 × 50 ms` ceiling was a claim about one laptop. Measured
 * 14/09 on the shared CI runner (4 cores, `node --test` running other files beside this one):
 * `start-from` takes 1.1–1.2 s on a quiet run and blew through 5 s on a busy one — and the four
 * tests after it, which read the state it leaves, went red in single-digit milliseconds with no
 * hint of the cause (#72). A job that truly hangs still fails here, sixty seconds later, well
 * inside the runner's `--test-timeout=120000`.
 */
const JOB_DEADLINE_MS = 60_000

async function untilDone(host) {
  const deadline = Date.now() + JOB_DEADLINE_MS
  while (Date.now() < deadline) {
    const job = await (await fetch(`${base}/extract/${host}`)).json()
    if (job.state === 'done' || job.state === 'failed') return job
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`job for ${host} did not finish within ${JOB_DEADLINE_MS} ms`)
}

test('POST start-from: crawls the site into pages/, extracts the direction, and leaves docs/agents/start-from.json', async () => {
  const res = await fetch(`${base}/start-from`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://fork.example/' })
  })
  assert.equal(res.status, 202)
  const started = await res.json()
  assert.equal(started.ok, true)
  assert.equal(started.host, 'fork.example')
  assert.equal(started.kind, 'reference')
  const job = await untilDone('fork.example')
  assert.equal(job.state, 'done', JSON.stringify(job.error))
  assert.equal(job.manifest.source.pages, true)
  assert.equal(job.manifest.counts.pages, 3)
  assert.match(
    job.manifest.source.recon,
    /^skipped:no-(browser|scripts)$/,
    'no browser here, and the test names a scripts dir that does not exist — a note either way'
  )
  assert.ok(existsSync(path.join(siteDir, 'Brand', 'fork.example', 'pages', 'pages.json')))
  const startFrom = JSON.parse(readFileSync(path.join(siteDir, 'docs', 'agents', 'start-from.json'), 'utf8'))
  assert.equal(startFrom.schemaVersion, 'tracy-start-from/v1')
  assert.equal(startFrom.url, 'https://fork.example/')
  assert.equal(startFrom.host, 'fork.example')
  assert.equal(startFrom.id, 'brand:fork.example')
  assert.equal(startFrom.mode, 'rewrite')
  assert.match(startFrom.at, /^\d{4}-\d{2}-\d{2}T/)
})

test('POST start-from twice: a fresh extraction is reused, not redone; a non-site is refused', async () => {
  const before = JSON.parse(
    readFileSync(path.join(siteDir, 'Brand', 'fork.example', 'manifest.json'), 'utf8')
  )
  const res = await fetch(`${base}/start-from`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://fork.example/' })
  })
  assert.equal(res.status, 200)
  const again = await res.json()
  assert.equal(again.ok, true)
  assert.equal(again.reused, true)
  const after = JSON.parse(readFileSync(path.join(siteDir, 'Brand', 'fork.example', 'manifest.json'), 'utf8'))
  assert.equal(after.source.extractedAt, before.source.extractedAt, 'the folder was not rewritten')

  const bad = await fetch(`${base}/start-from`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'localhost' })
  })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).code, 'BAD_URL')
})

test('tool tracy_brand read: a forked site answers with its page list', async () => {
  const read = await tool.execute({ action: 'read', url: 'fork.example' })
  assert.equal(read.ok, true)
  assert.equal(read.pages.length, 3)
  assert.deepEqual(Object.keys(read.pages[0]).sort(), ['file', 'h1', 'title', 'url'])
  assert.equal(read.pages[0].h1, 'Cranes that lift more.')
  assert.equal(read.recon, undefined, 'no recon evidence on this machine')
  const plain = await tool.execute({ action: 'read', url: 'acme.example' }).catch(() => null)
  assert.ok(plain === null || plain.pages === undefined, 'a plain extraction has no page list')
})

test('GET jobs: every job the host remembers, newest first — a failed fork is listed with its error', async () => {
  const res = await fetch(`${base}/jobs`)
  assert.equal(res.status, 200)
  const { jobs } = await res.json()
  assert.ok(Array.isArray(jobs) && jobs.length >= 1)
  assert.ok(jobs.some((j) => j.host === 'fork.example' && j.state === 'done'))
  await fetch(`${base}/start-from`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://nobody.example/' })
  })
  await untilDone('nobody.example')
  const again = await (await fetch(`${base}/jobs`)).json()
  const failed = again.jobs.find((j) => j.host === 'nobody.example')
  assert.equal(failed?.state, 'failed')
  assert.equal(failed?.error?.code, 'NO_MATERIAL')
  assert.equal(again.jobs[0].host, 'nobody.example', 'newest first')
})

test('POST extract deep: the quick card lands first (phase quick), the crawl + recon swap in after (phase full) without the card going missing', async () => {
  const host = 'fork.example'
  // The fork tests above already measured this host with its crawl, so a plain deep request is
  // answered from disk — which is exactly what `refresh` exists to get past.
  const reused = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: `https://${host}/`, kind: 'reference', deep: true })
  })
  assert.equal(reused.status, 200)
  assert.equal((await reused.json()).reused, true)

  const res = await fetch(`${base}/extract`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: `https://${host}/`, kind: 'reference', deep: true, refresh: true })
  })
  assert.equal(res.status, 202)
  const brandDir = path.join(siteDir, 'Brand', host)
  const lock = path.join(siteDir, 'Brand', '.locks', host)
  let sawQuick = false
  let sawLock = false
  let job
  // Same deadline as `untilDone`, for the same reason: 200 × 25 ms was the other machine-sized
  // ceiling in this file.
  const deadline = Date.now() + JOB_DEADLINE_MS
  while (Date.now() < deadline) {
    if (existsSync(lock)) sawLock = true
    job = await (await fetch(`${base}/extract/${host}`)).json()
    if (job.phase === 'quick') {
      sawQuick = true
      // The quick card must be readable while the deep pass runs.
      assert.ok(
        existsSync(path.join(brandDir, 'tokens.css')),
        'quick tokens.css present during the deep pass'
      )
    }
    if (job.state === 'done' || job.state === 'failed') break
    await new Promise((r) => setTimeout(r, 25))
  }
  assert.equal(job.state, 'done')
  assert.equal(job.phase, 'full')
  assert.ok(
    sawQuick || job.steps.some((s) => s.step.startsWith('deep:')),
    'a deep pass ran after the quick one'
  )
  assert.ok(
    existsSync(path.join(brandDir, 'pages', 'pages.json')),
    'the deep pass left the crawl beside the card'
  )
  assert.equal(existsSync(path.join(siteDir, '.brand-deep')), false, 'the side folder is gone')
  // The write lock spans both passes and is released at the end — the publisher on the fleet host
  // reads it to know this folder is being rewritten right now.
  assert.ok(sawLock, 'the lock was held while the measurement ran')
  assert.equal(existsSync(lock), false, 'and released when it ended')
})

/**
 * ONE DSH, MANY SITES (ADR 0014). This `apply()` pins no `siteDir`: the door must take the folder
 * from the header the gate stamps (`x-dsh-allowed-folders`, `@tracy/core/site-dir`), and only fall
 * back to where dsh stands when there is none. Measured 14/09 before this landed: the host dsh
 * stands at `/site`, and every extraction died `EACCES mkdir /site/Brand`.
 */
test('POST extract with the gate header writes Brand/ into the seat folder, and reads answer from there', async () => {
  const seatDir = mkdtempSync(path.join(tmpdir(), 'tracy-brand-seat-'))
  let handler = null
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (route) => ((handler = route), () => undefined) },
    tools: { register: () => () => undefined }
  }
  apply(ctx, {
    fetch: (url, init) => forkFetch(url, init),
    enrich: NO_ENRICH,
    reconScriptsDir: path.join(seatDir, 'no-scripts')
  })
  const server2 = http.createServer((req, res) => handler.handler(req, res))
  await new Promise((r) => server2.listen(0, '127.0.0.1', r))
  const base2 = `http://127.0.0.1:${server2.address().port}/api/tracy-brand-engine`
  const stamped = { 'x-dsh-allowed-folders': JSON.stringify([seatDir]) }
  try {
    // A host this process has never measured, and nothing on disk anywhere: 404 both ways.
    assert.equal((await fetch(`${base2}/extract/seat.example`, { headers: stamped })).status, 404)

    // The fork door: it crawls through the injected `fetch`, so the whole measurement runs offline
    // (the quick pass of a plain `extract` reaches for the real network). Every write it makes —
    // Brand/<host>/, docs/agents/start-from.json — must land in the seat folder.
    const started = await fetch(`${base2}/start-from`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...stamped },
      body: JSON.stringify({ url: 'https://seat.example/' })
    })
    assert.equal(started.status, 202, await started.text())
    const deadline = Date.now() + JOB_DEADLINE_MS
    let job
    while (Date.now() < deadline) {
      job = await (await fetch(`${base2}/extract/seat.example`, { headers: stamped })).json()
      if (job.state === 'done' || job.state === 'failed') break
      await new Promise((r) => setTimeout(r, 50))
    }
    assert.equal(job.state, 'done', JSON.stringify(job.error ?? job))
    assert.ok(
      existsSync(path.join(seatDir, 'Brand', 'seat.example', 'brand.json')),
      'the card is in the seat folder'
    )
    assert.ok(
      existsSync(path.join(seatDir, 'docs', 'agents', 'start-from.json')),
      'so is the start-from note'
    )
    assert.equal(existsSync(path.join(process.cwd(), 'Brand')), false, 'nothing was written where dsh stands')

    // The list door reads the same folder — and without the header it does not see this seat's card.
    const listed = await (await fetch(`${base2}/brands`, { headers: stamped })).json()
    assert.deepEqual(
      listed.brands.map((b) => b.id),
      ['brand:seat.example']
    )
    const unstamped = await (await fetch(`${base2}/brands`)).json()
    assert.equal(
      unstamped.brands.some((b) => b.id === 'brand:seat.example'),
      false
    )

    // A header that names a relative path or is not JSON is ignored, never obeyed.
    for (const bad of ['relative', 'not json', JSON.stringify(['../elsewhere'])]) {
      const res = await fetch(`${base2}/brands`, { headers: { 'x-dsh-allowed-folders': bad } })
      assert.equal(res.status, 200, bad)
      assert.equal(
        (await res.json()).brands.some((b) => b.id === 'brand:seat.example'),
        false,
        bad
      )
    }
  } finally {
    server2.close()
    rmSync(seatDir, { recursive: true, force: true })
  }
})

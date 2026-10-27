/**
 * Concurrent imports in one dsh process write the same JSON books. On 20/10/2026 a Joomla import
 * failed with `ENOENT … rename uploads.json.1.tmp` while a WordPress import was uploading parts,
 * and the book afterwards held only the other site's entry: both runs shared one temp name and
 * each read-modify-write overwrote the other's. These tests run many writers at once per book.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { forgetUpload, heldUpload, rememberUpload } from '../src/host/resume.ts'
import { forgetToken, rememberToken, rememberedToken } from '../src/host/tokens.ts'
import { forgetHandover, rememberHandover, rememberPartial, takeOrSweep } from '../src/host/handover.ts'
import { reportImportResult } from '../src/host/operation-signal.ts'

let home
let previousHome

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), 'tracy-book-race-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

const SITES = ['revista.example.com', 'alumni.example.org', 'third.example.net']
const ROUNDS = 40
const bookDir = () => path.join(home, 'tracy-add-site')
const book = async (name) => JSON.parse(await readFile(path.join(bookDir(), name), 'utf8'))
const noTempLeft = async () =>
  assert.deepEqual(
    (await readdir(bookDir())).filter((name) => name.endsWith('.tmp')),
    []
  )

const cursor = (part) => ({
  key: 'k',
  uploadId: 'u',
  parts: Array.from({ length: part }, (_, i) => ({ PartNumber: i + 1, ETag: `e${i + 1}` })),
  cursor: { path: 'a.php', offset: part, size: 10 },
  files: part,
  bytes: part,
  startedAt: Date.now()
})

test('upload cursors of several sites written at once all survive, none throws', async () => {
  await Promise.all(
    SITES.map(async (site) => {
      for (let part = 1; part <= ROUNDS; part++) await rememberUpload(site, cursor(part))
    })
  )
  const uploads = await book('uploads.json')
  assert.deepEqual(Object.keys(uploads).sort(), [...SITES].sort())
  for (const site of SITES) assert.equal((await heldUpload(site)).parts.length, ROUNDS)
  await noTempLeft()
})

test('forgetting one site while others write keeps the others', async () => {
  await rememberUpload('gone.example.com', cursor(1))
  await Promise.all([
    forgetUpload('gone.example.com'),
    ...SITES.map(async (site) => {
      for (let part = 1; part <= ROUNDS; part++) await rememberUpload(site, cursor(part))
    })
  ])
  assert.deepEqual(Object.keys(await book('uploads.json')).sort(), [...SITES].sort())
  await noTempLeft()
})

test('site tokens written and forgotten at once keep every remembered site', async () => {
  await rememberToken('gone.example.com', { token: 't', webRootUrl: 'https://gone/', platform: 'joomla' })
  await Promise.all([
    forgetToken('gone.example.com'),
    ...SITES.flatMap((site) =>
      Array.from({ length: ROUNDS }, (_, i) =>
        rememberToken(site, { token: `t${i}`, webRootUrl: `https://${site}/`, platform: 'wordpress' })
      )
    )
  ])
  assert.deepEqual(Object.keys(await book('site-tokens.json')).sort(), [...SITES].sort())
  for (const site of SITES) assert.equal((await rememberedToken(site)).webRootUrl, `https://${site}/`)
  await noTempLeft()
})

test('handover lines of several sites written at once all survive', async () => {
  await rememberPartial('gone.example.com', 'db-gone')
  await Promise.all([
    forgetHandover('gone.example.com'),
    ...SITES.flatMap((site) =>
      Array.from({ length: ROUNDS }, (_, i) =>
        i % 2
          ? rememberPartial(site, `db-${site}`)
          : rememberHandover(site, { webrootKey: `w-${site}`, dbKey: `db-${site}`, liveSite: site })
      )
    )
  ])
  assert.deepEqual(Object.keys(await book('handovers.json')).sort(), [...SITES].sort())
  await noTempLeft()
})

test('the same import result queued twice at once does not lose its temp file', async () => {
  const previousFetch = globalThis.fetch
  const previousWarn = console.warn
  const warnings = []
  globalThis.fetch = async () => new Response('', { status: 503 })
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    const notice = {
      origin: 'http://tracy-web:8080',
      siteKey: 'import.example.com',
      cookie: 'tracy_sess=private-fixture',
      result: { run_id: crypto.randomUUID(), state: 'done', step: 'handing_over', reason: null, seconds: 1 }
    }
    await Promise.all(Array.from({ length: 20 }, () => reportImportResult(notice)))
    assert.deepEqual(
      warnings.filter((line) => line.includes('could not queue')),
      []
    )
    const dir = path.join(bookDir(), 'operation-results')
    assert.deepEqual(await readdir(dir), [`${notice.result.run_id}.json`])
  } finally {
    globalThis.fetch = previousFetch
    console.warn = previousWarn
  }
})

test('a new line written for the same site while the sweep deletes the old dump is kept', async () => {
  await rememberPartial('alumni.example.org', 'db-old')
  let release
  const paused = new Promise((resolve) => {
    release = resolve
  })
  let reached
  const inRemove = new Promise((resolve) => {
    reached = resolve
  })
  const removed = []
  const sweep = takeOrSweep('alumni.example.org', async (key) => {
    removed.push(key)
    reached()
    await paused
  })
  // Wait until the sweep has read the book and is inside `remove`, then a new run writes its own dump.
  await inRemove
  await rememberPartial('alumni.example.org', 'db-new')
  release()
  assert.equal(await sweep, undefined)
  assert.deepEqual(removed, ['db-old'])
  assert.deepEqual((await book('handovers.json'))['alumni.example.org'], { pending: { dbKey: 'db-new' } })
})

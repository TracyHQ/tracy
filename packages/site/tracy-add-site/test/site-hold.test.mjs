#!/usr/bin/env node
/**
 * The hold a Remove of an unfinished import takes on this host (`src/host/hold.ts`,
 * `src/host/hold-door.ts`) — PR #1598 part 2 — driven through the REAL `startRun` and books.
 *
 * tracy-web deletes an unfinished import only after this host said no read of the site is going
 * and holds it. The check and the hold are one synchronous step, and `startRun` refuses a held site,
 * so a start (first start, retry or Continue) racing a hold never both win. The hold is on disk, so
 * a restarted dsh keeps it; it lapses by itself; `forget` takes the site's runs, cursor and code.
 *
 * Same world as `run-interrupted.test.mjs`: the host files bundled with esbuild, a temporary
 * `DSH_HOME` per test, and a fresh module instance standing for a dsh that just started. `fetch`
 * never answers, so a started read stays `running` at its sign-in.
 */
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const esbuild = createRequire(import.meta.url)('esbuild')

const realFetch = globalThis.fetch
const realHome = process.env.DSH_HOME
let buildDir
let hostFile
let instances = 0
const homes = []

before(async () => {
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-site-hold-build-'))
  const built = await esbuild.build({
    stdin: {
      contents: `
        export { answerHold } from './src/host/hold-door.ts'
        export { HOLD_TTL_MS, SiteHeld, isHeld, signedByTracy } from './src/host/hold.ts'
        export { restoreRuns, runForSite, startRun } from './src/host/run.ts'
        export { rememberUpload, heldUpload } from './src/host/resume.ts'
        export { rememberToken, rememberedToken } from './src/host/tokens.ts'
        export { rememberHandover, rememberPartial } from './src/host/handover.ts'
      `,
      resolveDir: pkgRoot,
      loader: 'ts'
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    write: false
  })
  hostFile = path.join(buildDir, 'host.mjs')
  writeFileSync(hostFile, built.outputFiles[0].text)
})

after(() => {
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
  for (const dir of homes) rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  // A site that never answers: a read started here stays running at its sign-in.
  globalThis.fetch = () => new Promise(() => {})
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-site-hold-home-'))
  homes.push(dir)
  mkdirSync(path.join(dir, 'tracy-add-site'), { recursive: true })
  process.env.DSH_HOME = dir
})

/** A dsh that just started: a module instance with nothing in memory, on this test's `DSH_HOME`. */
async function freshDsh() {
  instances += 1
  return import(`${pathToFileURL(hostFile).href}?instance=${instances}`)
}

const SITE = 'old-shop.example.com'
const start = (dsh, extra = {}) =>
  dsh.startRun({
    siteKey: SITE,
    platform: 'wordpress',
    adminUrl: `https://${SITE}/wp-admin`,
    username: 'admin',
    password: 'synthetic-password',
    origin: 'https://cowork.example.test',
    cookie: 'tracy_sess=synthetic',
    ...extra
  })
const book = (name) =>
  JSON.parse(readFileSync(path.join(process.env.DSH_HOME, 'tracy-add-site', name), 'utf8'))

test('a read running here: the hold is refused, nothing is held', async () => {
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  const run = start(dsh)
  const answer = await dsh.answerHold({ op: 'hold', siteKey: SITE })
  assert.deepEqual(answer, { status: 409, body: { code: 'RUN_ACTIVE', runId: run.id } })
  assert.equal(dsh.isHeld(SITE), false)
})

test('an idle site is held, and no start, retry or Continue begins under the hold — after a restart too', async () => {
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  const held = await dsh.answerHold({ op: 'hold', siteKey: SITE })
  assert.equal(held.status, 200)
  assert.equal(held.body.held, true)
  assert.throws(() => start(dsh), dsh.SiteHeld)
  assert.throws(() => start(dsh, { retryOf: 'old-run' }), dsh.SiteHeld)
  assert.equal(dsh.runForSite(SITE), undefined, 'no run was opened')
  assert.ok(book('holds.json')[SITE], 'the hold is on disk')

  const restarted = await freshDsh()
  await restarted.restoreRuns()
  assert.equal(restarted.isHeld(SITE), true)
  assert.throws(() => start(restarted), restarted.SiteHeld)

  const released = await restarted.answerHold({ op: 'release', siteKey: SITE })
  assert.equal(released.status, 200)
  assert.equal(start(restarted).state, 'running', 'once released, a start opens its read again')
})

test('a start and a hold asked in the same moment: exactly one of them wins', async () => {
  // `during`: the start arrives while the hold is still reading the books (its awaits).
  for (const when of ['before', 'during', 'after']) {
    const dsh = await freshDsh()
    await dsh.restoreRuns()
    let started = false
    const tryStart = () => {
      try {
        start(dsh)
        started = true
      } catch (error) {
        if (!(error instanceof dsh.SiteHeld)) throw error
      }
    }
    if (when === 'before') tryStart()
    const holding = dsh.answerHold({ op: 'hold', siteKey: SITE })
    if (when === 'during') await new Promise((resolve) => setImmediate(() => resolve(tryStart())))
    const answer = await holding
    if (when === 'after') tryStart()
    const heldWon = answer.status === 200
    assert.equal(heldWon !== started, true, `${when}: hold ${answer.status}, started ${started}`)
  }
})

test('the sweep asks for quiet: a run changed or a part landed within it refuses the hold', async () => {
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  await dsh.rememberUpload(SITE, {
    key: 'sites/old-shop/webroot-1.tar',
    uploadId: 'up-1',
    parts: [{ PartNumber: 1, ETag: '"e1"' }],
    cursor: { path: 'index.php', offset: 0, size: 10 },
    files: 1,
    bytes: 10,
    startedAt: Date.now() - 2 * 60 * 60_000,
    updatedAt: Date.now() - 60 * 60_000
  })
  const quiet = 6.5 * 60 * 60_000
  const recent = await dsh.answerHold({ op: 'hold', siteKey: SITE, quietForMs: quiet })
  assert.equal(recent.status, 409)
  assert.equal(recent.body.code, 'RECENT_ACTIVITY')
  assert.equal(dsh.isHeld(SITE), false)
  const hourQuiet = await dsh.answerHold({ op: 'hold', siteKey: SITE, quietForMs: 30 * 60_000 })
  assert.equal(hourQuiet.status, 200)
})

test('forget takes the site’s runs, cursor, code and handover line; the hold named the store keys and stays as a tombstone', async () => {
  const first = await freshDsh()
  await first.restoreRuns()
  start(first)
  // `runs.json` is written behind the start (`persist`); let it land.
  for (let i = 0; i < 50; i++) {
    try {
      if (Object.values(book('runs.json')).some((run) => run.siteKey === SITE)) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  // The dsh that ran it is gone: its read is interrupted, kept in runs.json.
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  assert.equal(dsh.runForSite(SITE).error, 'interrupted')
  await dsh.rememberUpload(SITE, {
    key: 'sites/old-shop/webroot-1.tar',
    uploadId: 'up-1',
    parts: [],
    cursor: { path: '', offset: 0, size: 0 },
    files: 0,
    bytes: 0,
    startedAt: Date.now()
  })
  await dsh.rememberToken(SITE, {
    token: 't'.repeat(32),
    webRootUrl: `https://${SITE}`,
    platform: 'wordpress'
  })
  await dsh.rememberUpload('other.example.com', {
    key: 'sites/other/webroot.tar',
    uploadId: 'up-2',
    parts: [],
    cursor: { path: '', offset: 0, size: 0 },
    files: 0,
    bytes: 0,
    startedAt: Date.now()
  })

  // `handovers.json`: a dump from a run that died half way for this site, a finished read for another.
  await dsh.rememberPartial(SITE, 'sites/old-shop/db-partial.sql.gz')
  await dsh.rememberHandover('other.example.com', {
    webrootKey: 'sites/other/webroot.tar.gz',
    dbKey: 'sites/other/db.sql.gz',
    liveSite: 'https://other.example.com'
  })

  assert.deepEqual(await dsh.answerHold({ op: 'forget', siteKey: SITE }), {
    status: 409,
    body: { code: 'NOT_HELD' }
  })
  const held = await dsh.answerHold({ op: 'hold', siteKey: SITE })
  assert.equal(held.status, 200)
  // The store keys are named by the hold, before anything is forgotten: tracy-web deletes them first.
  assert.deepEqual(held.body.upload, { key: 'sites/old-shop/webroot-1.tar', uploadId: 'up-1' })
  assert.deepEqual(held.body.archives, ['sites/old-shop/db-partial.sql.gz'], 'the pending dump too')
  const forgotten = await dsh.answerHold({ op: 'forget', siteKey: SITE })
  assert.deepEqual(forgotten, { status: 200, body: { forgotten: true } })
  assert.equal(dsh.runForSite(SITE), undefined)
  assert.equal(
    Object.values(book('runs.json')).some((run) => run.siteKey === SITE),
    false,
    'no line of the site is left in runs.json'
  )
  assert.equal(await dsh.heldUpload(SITE), undefined)
  assert.equal(await dsh.rememberedToken(SITE), undefined)
  assert.ok(await dsh.heldUpload('other.example.com'), 'another site’s cursor is untouched')
  assert.equal(SITE in book('handovers.json'), false, 'no line of the site is left in handovers.json')
  assert.ok(book('handovers.json')['other.example.com']?.result, 'another site’s handover is untouched')
  // The hold stays as a tombstone: a /new/ tab left open cannot start a read of the removed site.
  assert.equal(dsh.isHeld(SITE), true)
  assert.throws(() => start(dsh), dsh.SiteHeld)
  assert.throws(() => start(dsh, { retryOf: 'old-run' }), dsh.SiteHeld)
  assert.equal(dsh.isHeld(SITE, Date.now() + dsh.HOLD_TTL_MS + 1), false, 'until it lapses')
})

test('a finished import deleted by the site delete: forget then release, and the same address starts again at once', async () => {
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  assert.equal((await dsh.answerHold({ op: 'hold', siteKey: SITE })).status, 200)
  assert.deepEqual(await dsh.answerHold({ op: 'forget', siteKey: SITE }), {
    status: 200,
    body: { forgotten: true }
  })
  assert.deepEqual(await dsh.answerHold({ op: 'release', siteKey: SITE }), {
    status: 200,
    body: { released: true }
  })
  // No tombstone: neither in memory nor in `holds.json`, so a restarted dsh does not find one.
  assert.equal(dsh.isHeld(SITE), false)
  assert.equal(SITE in book('holds.json'), false)
  const restarted = await freshDsh()
  await restarted.restoreRuns()
  assert.equal(restarted.isHeld(SITE), false)
  start(restarted)
  assert.equal(restarted.runForSite(SITE)?.state, 'running', 'the new read is not refused by a hold')
})

test('a hold nobody released lapses by itself', async () => {
  const dsh = await freshDsh()
  await dsh.restoreRuns()
  await dsh.answerHold({ op: 'hold', siteKey: SITE })
  assert.equal(dsh.isHeld(SITE, Date.now() + dsh.HOLD_TTL_MS + 1), false)
})

test('only tracy-web may hold: the seat secret’s signature over the exact body, fresh and used once', () => {
  return freshDsh().then((dsh) => {
    const secret = 'seat-secret'
    const body = JSON.stringify({ op: 'hold', siteKey: SITE })
    const path = '/api/tracy-add-site/hold'
    const timestamp = String(Date.now())
    const nonce = 'n1'
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}\n${nonce}\nPOST\n${path}\n${createHash('sha256').update(body).digest('hex')}`)
      .digest('hex')
    const call = (over = {}) =>
      dsh.signedByTracy({ secret, path, body, timestamp, nonce, signature, ...over })
    assert.equal(call({ nonce: 'other' }), false, 'a different nonce is a different signature')
    assert.equal(call({ body: JSON.stringify({ op: 'forget', siteKey: SITE }) }), false)
    assert.equal(call({ secret: null }), false, 'no secret on this host: nobody may')
    assert.equal(call({ timestamp: String(Date.now() - 5 * 60_000) }), false)
    assert.equal(call(), true)
    assert.equal(call(), false, 'a replay is refused')
  })
})

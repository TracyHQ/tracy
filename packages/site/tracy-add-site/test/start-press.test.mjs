#!/usr/bin/env node
/**
 * A start that a later press superseded never opens a read (#1665 follow-up), driven through the
 * REAL `startRun` and its run book.
 *
 * Every start is sent right after a press of tracy-web's claim door, and carries that press's
 * identity (`press`, strictly increasing per claim). A wizard that takes over an idle claim also
 * names the press it took over from (`after`). `startRun` answers the site's latest run, and opens
 * none, to a start whose press is not newer than one a run already carries, or to a take-over whose
 * superseded press turned out to have a run after all. So a start delayed past another tab's whole
 * read — in either order — joins that read instead of opening a second one, also after a restart.
 *
 * Same world as `site-hold.test.mjs`: the host files bundled with esbuild, a temporary `DSH_HOME`
 * per test, and a fresh module instance standing for a dsh that just started. `fetch` refuses at
 * once, so a started read ends (`error`) as soon as it tries its sign-in.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  buildDir = mkdtempSync(path.join(tmpdir(), 'tch-start-press-build-'))
  const built = await esbuild.build({
    stdin: {
      contents: `export { forgetSiteRuns, restoreRuns, runForSite, runStatus, startRun } from './src/host/run.ts'`,
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

after(async () => {
  // A read that ended still writes its book line in the background: let it land before the clean-up.
  await new Promise((resolve) => setTimeout(resolve, 200))
  globalThis.fetch = realFetch
  if (realHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = realHome
  if (buildDir) rmSync(buildDir, { recursive: true, force: true })
  for (const dir of homes) rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  // A site that refuses at once: a read started here ends at its sign-in.
  globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'))
  const dir = mkdtempSync(path.join(tmpdir(), 'tch-start-press-home-'))
  homes.push(dir)
  mkdirSync(path.join(dir, 'tracy-add-site'), { recursive: true })
  process.env.DSH_HOME = dir
})

/** A dsh that just started: a module instance with nothing in memory, on this test's `DSH_HOME`. */
async function freshDsh() {
  instances += 1
  const dsh = await import(`${pathToFileURL(hostFile).href}?instance=${instances}`)
  await dsh.restoreRuns()
  return dsh
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

/** Until the run is no longer `running`, and its book line is written. */
async function ended(dsh, id) {
  for (let i = 0; i < 200 && dsh.runStatus(id)?.state === 'running'; i++)
    await new Promise((resolve) => setTimeout(resolve, 5))
  assert.notEqual(dsh.runStatus(id)?.state, 'running', 'the read did not end')
  await new Promise((resolve) => setTimeout(resolve, 50))
}

// Press identities as tracy-web issues them: microseconds since the epoch, one claim's presses
// strictly increasing (`sites/route.js`, the import claim).
const A = '1761264000000000'
const B = '1761264150000000'
const LATER = '1761264300000000'

test('a start delayed past a take-over read that ended joins that read and opens none (A late after B)', async () => {
  const dsh = await freshDsh()
  // B pressed 150 s after A, found no run, and took over from A's press.
  const b = start(dsh, { press: B, after: A })
  await ended(dsh, b.id)
  // A's start, held up on its way, lands now.
  const late = start(dsh, { press: A })
  assert.equal(late.id, b.id, 'a superseded start opened a second read')
  assert.equal(dsh.runForSite(SITE).id, b.id)
})

test('a take-over start delayed past the read it took over from joins that read (B late after A)', async () => {
  const dsh = await freshDsh()
  const a = start(dsh, { press: A })
  await ended(dsh, a.id)
  const late = start(dsh, { press: B, after: A })
  assert.equal(late.id, a.id, 'a take-over opened a read after the one it superseded')
})

test('a take-over supersedes every press up to the one it names: A late, B pressed without a start, C took over', async () => {
  const dsh = await freshDsh()
  // A's start (press A) was held up; B pressed (press B) and sent nothing; C took over after B.
  const a = start(dsh, { press: A })
  await ended(dsh, a.id)
  const c = start(dsh, { press: LATER, after: B })
  assert.equal(c.id, a.id, 'a take-over opened a read after one of a press it superseded')
  // A late plain start older than a run's press is still joined; the same press twice is one read.
  assert.equal(start(dsh, { press: A }).id, a.id)
})

test('after Remove forgets the site, a take-over under the new claim opens a read again', async () => {
  const dsh = await freshDsh()
  const a = start(dsh, { press: A })
  await ended(dsh, a.id)
  await dsh.forgetSiteRuns(SITE)
  assert.equal(dsh.runForSite(SITE), undefined)
  const again = start(dsh, { press: LATER, after: B })
  assert.notEqual(again.id, a.id)
  await ended(dsh, again.id)
})

test('the same press arriving twice opens one read, even after the first ended', async () => {
  const dsh = await freshDsh()
  const first = start(dsh, { press: A })
  await ended(dsh, first.id)
  assert.equal(start(dsh, { press: A }).id, first.id)
})

test('after a restart the press identities still hold: a late start joins the read restored from the book', async () => {
  const before = await freshDsh()
  const b = start(before, { press: B, after: A })
  await ended(before, b.id)
  const after = await freshDsh()
  assert.equal(after.runForSite(SITE)?.id, b.id, 'the run was restored from the book')
  assert.equal(start(after, { press: A }).id, b.id)
})

test('a newer press opens a new read after one ended, with or without retryOf; a press-less start is as before', async () => {
  const dsh = await freshDsh()
  const first = start(dsh, { press: A })
  await ended(dsh, first.id)
  // The same wizard pressing again (its start was refused or its read failed), or a Retry.
  const retry = start(dsh, { press: B, retryOf: first.id })
  assert.notEqual(retry.id, first.id)
  await ended(dsh, retry.id)
  const again = start(dsh, { press: LATER })
  assert.notEqual(again.id, retry.id)
  await ended(dsh, again.id)
  // A wizard from before press identities: unchanged behaviour.
  const plain = start(dsh)
  assert.notEqual(plain.id, again.id)
  await ended(dsh, plain.id)
})

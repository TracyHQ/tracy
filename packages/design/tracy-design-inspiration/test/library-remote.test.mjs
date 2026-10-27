/**
 * The library from one place (tasks/todo-thu-vien-mot-cho.md): the host reads the 152 systems
 * over HTTP from the public page's static files, keyed by the vendor commit its manifest names,
 * and keeps what it read on disk so the second process, and the lane with no network, still
 * have it. What is pinned: one manifest fetch decides the commit; the catalog is fetched once per
 * commit; a system file is fetched once and then read from disk; a manifest that cannot be
 * fetched falls back to the last commit on disk; nothing on disk and no network is null; a new
 * commit on refresh is a new library without touching the old cache.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'

import { openRemoteLibrary, LIBRARY_FILES } from '../src/host/library-remote.mjs'

const URL_BASE = 'https://cowork.example/design-inspiration'
let cacheDir

/** A fake public page: a manifest, a catalog, two systems with a few files; counts every hit. */
function fakePage(commit, systems = ['acme', 'zen']) {
  const hits = []
  const files = new Map()
  files.set('data/manifest.json', JSON.stringify({ vendorCommit: commit, count: systems.length }))
  files.set(
    'data/catalog.json',
    JSON.stringify({
      count: systems.length,
      systems: systems.map((id) => ({
        id,
        name: id.toUpperCase(),
        category: 'Test',
        nav: 'top-left',
        hero: 'split',
        dark: true
      }))
    })
  )
  files.set('data/artifact-slots/landing.json', JSON.stringify({ slots: [{ id: 'h1', role: 'headline' }] }))
  for (const id of systems) {
    files.set(`systems/${id}/tokens.css`, `:root{--x:${id}@${commit}}`)
    files.set(`systems/${id}/DESIGN.md`, `# ${id}\n`)
    files.set(`systems/${id}/components.html`, `<h1>${id}</h1>`)
    files.set(
      `systems/${id}/slots.json`,
      JSON.stringify({ slots: [{ id: 'h1', role: 'headline', text: id }] })
    )
    files.set(`systems/${id}/system/artifacts/landing.html`, `<main>${id} landing</main>`)
    files.set(
      `systems/${id}/artifact-slots/landing.json`,
      JSON.stringify({ slots: [{ id: 'h1', role: 'headline', text: `${id} landing` }] })
    )
  }
  const fetch = async (url) => {
    const rel = String(url).slice(`${URL_BASE}/`.length).replace(/\?.*$/, '')
    hits.push(rel)
    const body = files.get(rel)
    if (body === undefined) return new Response('no', { status: 404 })
    return new Response(body, { status: 200 })
  }
  return { fetch, hits }
}

before(() => {
  cacheDir = mkdtempSync(path.join(tmpdir(), 'tracy-design-library-'))
})
after(() => {
  rmSync(cacheDir, { recursive: true, force: true })
})

test('the manifest names the commit; the catalog is fetched once and kept on disk under it', async () => {
  const page = fakePage('abc1234')
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  assert.ok(lib)
  assert.equal(lib.commit, 'abc1234')
  assert.equal(lib.url, URL_BASE)
  assert.deepEqual(
    lib.systems.map((s) => s.id),
    ['acme', 'zen']
  )
  assert.ok(lib.ids.has('zen'))
  assert.deepEqual(page.hits, ['data/manifest.json', 'data/catalog.json'])
  assert.ok(existsSync(path.join(cacheDir, 'abc1234', 'data', 'catalog.json')))
  assert.equal(readFileSync(path.join(cacheDir, 'current'), 'utf8').trim(), 'abc1234')

  // Same commit, second process: the catalog comes from disk.
  const again = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  assert.equal(again.commit, 'abc1234')
  assert.deepEqual(page.hits, ['data/manifest.json', 'data/catalog.json', 'data/manifest.json'])
})

test('a system file is fetched once, then read from disk; the list of files is closed; an unknown id is null', async () => {
  const page = fakePage('abc1234')
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  const css = await lib.read('acme', 'tokens.css')
  assert.equal(css?.toString(), ':root{--x:acme@abc1234}')
  const cssAgain = await lib.read('acme', 'tokens.css')
  assert.equal(cssAgain?.toString(), ':root{--x:acme@abc1234}')
  assert.equal(page.hits.filter((h) => h === 'systems/acme/tokens.css').length, 1)
  assert.ok(existsSync(path.join(cacheDir, 'abc1234', 'systems', 'acme', 'tokens.css')))

  assert.equal(
    (await lib.read('acme', 'system/artifacts/landing.html'))?.toString(),
    '<main>acme landing</main>'
  )
  assert.deepEqual(JSON.parse((await lib.read('acme', 'slots.json')).toString()).slots[0].text, 'acme')
  assert.deepEqual(
    JSON.parse((await lib.read('acme', 'artifact-slots/landing.json')).toString()).slots[0].text,
    'acme landing'
  )
  assert.equal(await lib.read('acme', 'artifact-slots/nope.json'), null)
  assert.equal(await lib.read('nope', 'tokens.css'), null)
  assert.equal(await lib.read('acme', '../../etc/passwd'), null)
  assert.equal(await lib.read('acme', 'package.json'), null)
  assert.ok(LIBRARY_FILES.includes('DESIGN.md'))

  // A file the page does not have is null and not cached as anything.
  assert.equal(await lib.read('zen', 'preview/colors.html'), null)
  assert.ok(!existsSync(path.join(cacheDir, 'abc1234', 'systems', 'zen', 'preview', 'colors.html')))
})

test('the shared artifact slot map is one file per kind, cached like the rest', async () => {
  const page = fakePage('abc1234')
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  const slots = await lib.artifactSlots('landing')
  assert.deepEqual(slots, [{ id: 'h1', role: 'headline' }])
  assert.deepEqual(await lib.artifactSlots('landing'), slots)
  assert.equal(page.hits.filter((h) => h === 'data/artifact-slots/landing.json').length, 1)
  assert.deepEqual(await lib.artifactSlots('poster'), [])
})

test('no network: the last commit on disk serves; nothing on disk is null', async () => {
  const dead = async () => {
    throw new Error('ENOTFOUND')
  }
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: dead })
  assert.ok(lib)
  assert.equal(lib.commit, 'abc1234')
  assert.equal(lib.offline, true)
  assert.equal((await lib.read('acme', 'tokens.css'))?.toString(), ':root{--x:acme@abc1234}')
  // A file never fetched cannot be read offline.
  assert.equal(await lib.read('zen', 'DESIGN.md'), null)

  const empty = mkdtempSync(path.join(tmpdir(), 'tracy-design-library-empty-'))
  try {
    assert.equal(await openRemoteLibrary({ url: URL_BASE, cacheDir: empty, fetch: dead }), null)
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
})

test('a new commit on the page is a new library; the old cache stays until swept', async () => {
  const page = fakePage('def5678', ['acme', 'zen', 'neo'])
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  assert.equal(lib.commit, 'def5678')
  assert.equal(lib.systems.length, 3)
  assert.equal((await lib.read('acme', 'tokens.css'))?.toString(), ':root{--x:acme@def5678}')
  assert.equal(readFileSync(path.join(cacheDir, 'current'), 'utf8').trim(), 'def5678')
  assert.ok(existsSync(path.join(cacheDir, 'abc1234')))
})

test('a manifest the page answers with something else than JSON is treated as no network', async () => {
  const html = async () => new Response('<html>maintenance</html>', { status: 200 })
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: html })
  assert.ok(lib)
  assert.equal(lib.offline, true)
  assert.equal(lib.commit, 'def5678')
})

test('a stale cache from an unknown commit does not pretend: current is what the manifest last said', async () => {
  mkdirSync(path.join(cacheDir, 'zzz'), { recursive: true })
  writeFileSync(path.join(cacheDir, 'zzz', 'stray'), 'x')
  const page = fakePage('def5678', ['acme', 'zen', 'neo'])
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  assert.equal(lib.commit, 'def5678')
})

test('the same system file read many times at once, before it is cached, answers every reader', async () => {
  // Two requests opening the same system on a cold cache used to share `<file>.<pid>.tmp`: one
  // rename moved it away and the other threw ENOENT.
  const page = fakePage('race0001')
  const lib = await openRemoteLibrary({ url: URL_BASE, cacheDir, fetch: page.fetch })
  const bodies = await Promise.all(Array.from({ length: 20 }, () => lib.read('zen', 'components.html')))
  for (const body of bodies) assert.equal(body?.toString(), '<h1>zen</h1>')
  assert.deepEqual(
    readdirSync(path.join(cacheDir, lib.commit, 'systems', 'zen')).filter((n) => n.endsWith('.tmp')),
    []
  )
})

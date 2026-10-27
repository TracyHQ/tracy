/**
 * The Listing section's Pages list (Templates page, Akemi 10/10/2026): a page added by hand takes its key
 * from its path, a path that is empty or another page's is caught before Save listing, rows move up
 * and down and are removed, and one page's shoot lands on that page only.
 *
 * What is pinned here is `src/cms/demo-card-pages.ts`, bundled in memory; the shooting itself
 * (`POST /api/ops/templates/<template>/capture`) is the server's, tested in apps/tracy-web.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let mod

before(async () => {
  const built = await rootRequire('esbuild').build({
    entryPoints: [path.join(pkgRoot, 'src/cms/demo-card-pages.ts')],
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent'
  })
  const code = built.outputFiles[0].text
  mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
})

const page = (key, path, label = key, shots = {}) => ({ key, label, path, shots })

test('a key follows the path the way the server keys a drafted layout', () => {
  assert.equal(mod.keyFromPath('/'), 'home')
  assert.equal(mod.keyFromPath(' / '), 'home')
  assert.equal(mod.keyFromPath('/about-us'), 'about-us')
  assert.equal(mod.keyFromPath('/company/About/'), 'company-about')
  assert.equal(mod.keyFromPath('/index.php/our-services'), 'index-php-our-services')
  assert.equal(mod.keyFromPath('/?id=7'), 'id-7')
  assert.equal(mod.keyFromPath('/***'), 'page')
  assert.match(mod.keyFromPath(`/${'a'.repeat(60)}`), /^a{40}$/)
})

test('a key is unique among the pages', () => {
  assert.equal(mod.uniqueKey('about', ['home']), 'about')
  assert.equal(mod.uniqueKey('about', ['home', 'about']), 'about-2')
  assert.equal(mod.uniqueKey('about', ['about', 'about-2']), 'about-3')
})

test('an empty, slashless or shared path is said on its row; a sound one is not', () => {
  const rows = [
    page('home', '/'),
    page('about', '/about'),
    page('new-page', ''),
    page('new-page-2', '/about/'),
    page('x', 'contact'),
    page('y', '/blog', '')
  ]
  const paths = mod.pathProblems(rows)
  assert.equal(paths[0], null)
  assert.match(paths[1], /already uses \/about/)
  assert.match(paths[2], /Give this page a path/)
  assert.match(paths[3], /already uses \/about/, 'a trailing slash is the same page')
  assert.match(paths[4], /starts with \//)
  assert.equal(paths[5], null)
  const all = mod.pageProblems(rows)
  assert.match(all[5], /label/, 'an empty label is caught after the path')
  assert.equal(all[0], null)
})

test('rows move up and down, and stay put at either end', () => {
  const rows = [page('a', '/a'), page('b', '/b'), page('c', '/c')]
  assert.deepEqual(
    mod.moveLayout(rows, 1, -1).map((l) => l.key),
    ['b', 'a', 'c']
  )
  assert.deepEqual(
    mod.moveLayout(rows, 1, 1).map((l) => l.key),
    ['a', 'c', 'b']
  )
  assert.deepEqual(
    mod.moveLayout(rows, 0, -1).map((l) => l.key),
    ['a', 'b', 'c']
  )
  assert.deepEqual(
    mod.moveLayout(rows, 2, 1).map((l) => l.key),
    ['a', 'b', 'c']
  )
  assert.deepEqual(
    rows.map((l) => l.key),
    ['a', 'b', 'c'],
    'the input is not changed'
  )
  assert.deepEqual(
    mod.removeLayout(rows, 1).map((l) => l.key),
    ['a', 'c']
  )
})

test('the home page is the one at /', () => {
  assert.equal(mod.isHome(page('home', '/')), true)
  assert.equal(mod.isHome(page('about', '/about')), false)
})

test("one page's shoot lands on that page only, found by key", () => {
  const stored = [
    { key: 'about', width: 1440, file: 'ja-titan-about-1440.png' },
    { key: 'about', width: 390, file: 'ja-titan-about-390.png' },
    { key: 'other', width: 1440, file: 'ja-titan-other-1440.png' }
  ]
  const got = mod.shotsFor(stored, 'about')
  assert.deepEqual(got, { desktop: 'ja-titan-about-1440.png', mobile: 'ja-titan-about-390.png' })
  // The rows were reordered while the shoot ran: the pictures still go to "about".
  const rows = [
    page('about', '/about', 'About', { desktop: 'old-1440.png', mobile: 'old-390.png' }),
    page('home', '/', 'Home', { desktop: 'home-1440.png' })
  ]
  const merged = mod.mergePageShots(rows, 'about', got)
  assert.deepEqual(merged[0].shots, got)
  assert.equal(merged[1], rows[1], 'every other page is the same object')
  assert.equal(merged[0].label, 'About')
})

test('a shape the shoot did not bring back keeps the picture the page had', () => {
  const rows = [page('about', '/about', 'About', { desktop: 'old-1440.png', mobile: 'old-390.png' })]
  const got = mod.shotsFor([{ key: 'about', width: 1440, file: 'new-1440.png' }], 'about')
  assert.deepEqual(mod.mergePageShots(rows, 'about', got)[0].shots, {
    desktop: 'new-1440.png',
    mobile: 'old-390.png'
  })
  assert.deepEqual(mod.mergePageShots(rows, 'about', {}), rows, 'nothing back, nothing changes')
  assert.deepEqual(mod.mergePageShots(rows, 'gone', got), rows, 'a page removed meanwhile is not re-added')
})

/**
 * Template Customization Question Readiness, rule REL-2 (`src/lib/template-customization-question-readiness/`):
 * the release's `tracy_site_pages.json` must equal the page list regenerated from its own demo
 * content, compared in both directions, with the demo's real front page as the one home.
 *
 * Fixtures are cut from the real release assets of `JoomlArt-Products/ja-products` (09/10/2026):
 * only the menu rows, pages, header part, navigation and options the rule reads. The settings and
 * current page lists are the published files byte for byte; the old Essence list is reformatted.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkRelease } from '../src/lib/template-customization-question-readiness/index.js'
import {
  directoryReleaseSource,
  localPackSource,
  releaseCacheDir,
  releaseCacheSource
} from '../src/lib/template-customization-question-readiness/release-source.js'
import { releaseContent } from '../src/lib/template-customization-question-readiness/readers/release-content.js'
import { themeZipsInOrder } from '../src/lib/template-customization-question-readiness/readers/theme-zips.js'

const FIXTURES = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'template-customization-question-readiness'
)
const ESSENCE_J6 = 'quickstart/ja-essence/j6'

/** A release source that serves `overrides` (name -> text) over a real one: the fake the check accepts. */
function withFiles(source, overrides) {
  return {
    ...source,
    names: async () => [...new Set([...(await source.names()), ...Object.keys(overrides)])].sort(),
    read: async (name) => (name in overrides ? Buffer.from(overrides[name]) : source.read(name))
  }
}

const rel2 = async (source) => {
  const report = await checkRelease(source, { only: ['REL-2'] })
  assert.equal(report.results.length, 1)
  return { report, result: report.results[0] }
}

const essencePages = () =>
  JSON.parse(readFileSync(path.join(releaseCacheDir(FIXTURES, ESSENCE_J6), 'tracy_site_pages.json'), 'utf8'))

test('JA Essence Joomla 1.0.2: the current list of 13 pages passes', async () => {
  const { report, result } = await rel2(releaseCacheSource(FIXTURES, ESSENCE_J6))
  assert.deepEqual(
    { template: report.template, cms: report.cms, version: report.version, tag: report.tag },
    { template: 'ja_essence', cms: 'joomla', version: '1.0.2', tag: ESSENCE_J6 }
  )
  assert.equal(result.status, 'pass', result.message)
  assert.equal(result.owner, 'template')
  assert.match(result.message, /lists the 13 pages of the main menu, home "home-3"/)
})

test('JA Essence Joomla 1.0.2: the old list of 2 pages (Home, Contact) fails, naming every missing page', async () => {
  const old = readFileSync(path.join(FIXTURES, 'old-site-pages', 'ja-essence-j6-1.0.2.json'), 'utf8')
  const { result } = await rel2(
    withFiles(releaseCacheSource(FIXTURES, ESSENCE_J6), { 'tracy_site_pages.json': old })
  )
  assert.equal(result.status, 'fail')
  assert.match(result.message, /lists 2 pages, the main menu has 13/)
  for (const label of [
    'Category Style 1',
    'Category Style 2',
    'Category Style 3',
    'Category Style 4',
    'Detail › Layout 1',
    'Detail › Layout 2',
    'Detail › Layout 3',
    'Detail › Video',
    'Detail › Gallery',
    'Category Blog',
    'Featured Articles'
  ])
    assert.ok(result.message.includes(label), `missing page "${label}" is named`)
  assert.doesNotMatch(result.message, /not a content page/)
  // tracy-dev 0.7.1 has no site-pages command (12/10/2026): the tool is on a draft branch only.
  assert.doesNotMatch(result.fix, /tracy-dev site-pages/)
  assert.match(result.fix, /feat\/site-pages-file/)
  assert.match(
    result.fix,
    /node plugins\/tracy-dev\/lib\/site-pages\.mjs --release 'quickstart\/ja-essence\/j6' --out \./
  )
  assert.match(
    result.fix,
    /gh release upload 'quickstart\/ja-essence\/j6' tracy_site_pages\.json --clobber -R JoomlArt-Products\/ja-products/
  )
})

test('a page that is not on the main menu, or a system page, fails the other direction', async () => {
  const doc = essencePages()
  doc.pages.push({ id: 'pages/j-pages/login-form', label: 'Login Form' })
  const source = withFiles(releaseCacheSource(FIXTURES, ESSENCE_J6), {
    'tracy_site_pages.json': JSON.stringify(doc)
  })
  const { result } = await rel2(source)
  assert.equal(result.status, 'fail')
  assert.match(
    result.message,
    /not a content page of the main menu: Login Form \(pages\/j-pages\/login-form\)/
  )
  assert.doesNotMatch(result.message, /missing:/)
})

test('a home that is not the demo front page fails', async () => {
  const doc = essencePages()
  for (const p of doc.pages) delete p.home
  doc.pages.find((p) => p.id === 'contact').home = true
  doc.pages = doc.pages.filter((p) => p.id !== 'home-3')
  const source = withFiles(releaseCacheSource(FIXTURES, ESSENCE_J6), {
    'tracy_site_pages.json': JSON.stringify(doc)
  })
  const { result } = await rel2(source)
  assert.equal(result.status, 'fail')
  assert.match(result.message, /home is "contact" but the demo's front page is "home-3"/)
})

test('no file, or a file the schema refuses (two homes), fails', async () => {
  const real = releaseCacheSource(FIXTURES, ESSENCE_J6)
  const without = {
    ...real,
    names: async () => (await real.names()).filter((n) => n !== 'tracy_site_pages.json')
  }
  assert.match((await rel2(without)).result.message, /carries no tracy_site_pages\.json/)
  // The PAGE rules that read the list say REL-2's fix, not their own, when it is missing
  // (Tracy Apple Joomla 1.3.0 on dev, 12/10/2026: PAGE-1 told the admin to declare translations).
  const { results } = await checkRelease(without, { only: ['REL-2', 'PAGE-1', 'PAGE-4', 'PAGE-7'] })
  const rel2Fix = results.find((r) => r.id === 'REL-2').fix
  for (const r of results.filter((x) => x.id !== 'REL-2')) {
    assert.match(r.message, /no tracy_site_pages\.json \(see REL-2\)/, r.id)
    assert.equal(r.fix, rel2Fix, r.id)
  }
  const doc = essencePages()
  doc.pages[1].home = true
  const twoHomes = await rel2(withFiles(real, { 'tracy_site_pages.json': JSON.stringify(doc) }))
  assert.equal(twoHomes.result.status, 'fail')
  assert.match(twoHomes.result.message, /exactly one page must be home: true \(found 2\)/)
})

test('JA Essence WordPress 1.0.9: the header navigation (ref 155) regenerates the 13 pages of the file', async () => {
  const { report, result } = await rel2(releaseCacheSource(FIXTURES, 'quickstart/ja-essence/wp7'))
  assert.equal(report.cms, 'wordpress')
  assert.equal(result.status, 'pass', result.message)
  assert.match(result.message, /lists the 13 pages of the main menu, home "home-3"/)
})

test('Tracy Business EmDash 1.7.2: menus.primary regenerates the 6 pages of the file (topbar pages not asked)', async () => {
  const { report, result } = await rel2(releaseCacheSource(FIXTURES, 'tracy-business/emdash-0.x'))
  assert.equal(report.cms, 'emdash')
  assert.equal(result.status, 'pass', result.message)
  assert.match(result.message, /lists the 6 pages of the main menu, home "home"/)
})

test('an Akeeba bundle cannot be read statically: live-only, not a pass', async () => {
  const setting = {
    schemaVersion: 'tracy-setting/v1',
    platform: 'joomla',
    label: 'Tracy Base',
    version: '1.0.0',
    cms: '6.1.1',
    install: { bundle: { file: 'tracy-base.jpa', sha256: 'a'.repeat(64) } }
  }
  const source = withFiles(directoryReleaseSource(path.join(FIXTURES, 'old-site-pages')), {
    'tracy_setting.json': JSON.stringify(setting),
    'tracy_site_pages.json': JSON.stringify({ pages: [{ id: 'home', label: 'Home', home: true }] })
  })
  const { result } = await rel2(source)
  assert.equal(result.status, 'live-only')
  assert.match(result.message, /Akeeba bundle/)
})

test('a rule not written for the CMS is not-applicable; a release without a setting cannot be checked', async () => {
  const onlyWordpress = {
    id: 'X-1',
    title: 'A WordPress rule',
    platforms: ['wordpress'],
    owner: 'tracy',
    run: async () => ({})
  }
  const report = await checkRelease(releaseCacheSource(FIXTURES, ESSENCE_J6), { rules: [onlyWordpress] })
  assert.deepEqual(
    report.results.map((r) => [r.id, r.status, r.owner]),
    [['X-1', 'not-applicable', 'tracy']]
  )
  await assert.rejects(
    checkRelease(directoryReleaseSource(path.join(FIXTURES, 'old-site-pages'))),
    /no tracy_setting\.json/
  )
})

test('release sources: a local pack is tagged local/<slug>/<cms>; no name reaches outside its folder', async () => {
  const pack = localPackSource(FIXTURES, 'quickstart_ja-essence_j6', 'x')
  assert.equal(pack.tag, 'local/quickstart_ja-essence_j6/x')
  assert.throws(() => localPackSource(FIXTURES, '..', 'j6'), /not a pack folder name/)
  const cache = releaseCacheSource(FIXTURES, ESSENCE_J6)
  assert.equal(await cache.read('../old-site-pages/ja-essence-j6-1.0.2.json'), null)
  assert.equal(await cache.read('not-there.json'), null)
  assert.ok((await cache.names()).includes('ja-essence-j6-database-1.0.2.sql.gz'))
})

test('theme zips: the release version first, else the newest by semantic version (JA Kinetic 1.0.7 keeps 1.0.0..1.1.9)', async () => {
  const names = [
    'wp-ja-kinetic-1.0.0.zip',
    'wp-ja-kinetic-1.0.10.zip',
    'wp-ja-kinetic-1.1.9.zip',
    'wp-ja-kinetic-1.0.7.zip',
    'manifest.json'
  ]
  assert.deepEqual(themeZipsInOrder(names, 'wp-ja-kinetic', '1.0.7'), [
    'wp-ja-kinetic-1.0.7.zip',
    'wp-ja-kinetic-1.1.9.zip',
    'wp-ja-kinetic-1.0.10.zip',
    'wp-ja-kinetic-1.0.0.zip'
  ])
  assert.deepEqual(themeZipsInOrder(names, 'wp-ja-kinetic', '2.0.0').slice(0, 2), [
    'wp-ja-kinetic-1.1.9.zip',
    'wp-ja-kinetic-1.0.10.zip'
  ])
  // The shared themeFile reader opens the zips in that order.
  const opened = []
  const source = {
    where: 'test',
    tag: null,
    names: async () => names,
    read: async (/** @type {string} */ n) => (opened.push(n), null)
  }
  await releaseContent(source, { version: '1.0.7', install: {} }).themeFile(
    'wp-ja-kinetic',
    'parts/header.html'
  )
  assert.equal(opened[0], 'wp-ja-kinetic-1.0.7.zip')
})

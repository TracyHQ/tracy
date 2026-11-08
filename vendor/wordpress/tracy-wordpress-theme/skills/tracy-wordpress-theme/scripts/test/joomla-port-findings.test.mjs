// Findings of the JA Restaurant → EmDash port (SF-3, 5, 6, 7, 8, 13) in the Joomla extraction tools.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { crawlRoutes, routeUrlStyle } from '../ingest/joomla-capture.mjs'
import { loadInventory, menuTree } from '../lib/joomla-inventory.mjs'
import { buildSiteModel } from '../ingest/site-model.mjs'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { familyStack, primaryFamily, hasStrayParen, analyzeStatic, familiesOfFontUrl } from '../ingest/source-font.mjs'
import { memoryReader, style, item } from './source-font-fixtures.mjs'
import { routeViews } from '../lib/joomla-inventory.mjs'
import { trashedMenuIds } from '../lib/menu-trash.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const SKILL = join(here, '..', '..')
const FIXTURE = join(here, 'fixtures', 'joomla-min')
const FAKE_DOCKER = join(here, 'fixtures', 'issue41', 'fake-docker.mjs')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
function tmp(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})

test('SF-3: joomla-dump starts docker with the caller’s DOCKER_HOST, not an empty one', () => {
  const dir = tmp('pf-dh-')
  const inv = readJson(join(FIXTURE, 'inventory.json'))
  const db = Object.fromEntries(Object.entries(inv).map(([t, rows]) => [`jm_${t}`, rows]))
  db.jm_extensions = [{ extension_id: '19', name: 'com_content', type: 'component', element: 'com_content', folder: '', client_id: '1', enabled: '1', params: '{}', manifest_cache: '{}' }]
  writeFileSync(join(dir, 'db.json'), JSON.stringify(db))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin', 'docker'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_DOCKER)} "$@"\n`, { mode: 0o755 })
  const log = join(dir, 'env.log')
  spawnSync(process.execPath, [join(SKILL, 'scripts/ingest/joomla-dump.mjs'), '--out', join(dir, 'j6'), '--container', 'fake-db', '--password', 'pw-x', '--prefix', 'jm_'], {
    encoding: 'utf8',
    timeout: 60000,
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, FAKE_JOOMLA_DB: join(dir, 'db.json'), FAKE_DOCKER_ENVLOG: log, DOCKER_HOST: 'unix:///run/example/docker.sock' }
  })
  const seen = new Set(readFileSync(log, 'utf8').split('\n').filter(Boolean))
  assert.deepEqual([...seen], ['unix:///run/example/docker.sock'])
})

async function pageServer() {
  const hits = []
  const server = createServer((req, res) => {
    hits.push(req.url)
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<html><head></head><body>x</body></html>')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  test.after(() => server.closeAllConnections?.() ?? server.close())
  return { hits, base: new URL(`http://127.0.0.1:${server.address().port}/`) }
}

test('SF-5: routeUrlStyle follows sef / sef_rewrite, and --capture requests the addresses the site serves', async () => {
  assert.equal(routeUrlStyle({ sef: '1', sef_rewrite: '1' }), 'path')
  assert.equal(routeUrlStyle({ sef: '1', sef_rewrite: '0' }), 'index.php')
  assert.equal(routeUrlStyle({ sef: '0', sef_rewrite: '0' }), 'itemid')
  assert.equal(routeUrlStyle({}), 'path', 'unknown configuration keeps bare paths')
  const routes = [{ id: '1', path: '/' }, { id: '7', path: '/about/team' }]
  for (const [urls, want] of [['path', ['/', '/about/team']], ['index.php', ['/', '/index.php/about/team']], ['itemid', ['/index.php?Itemid=1', '/index.php?Itemid=7']]]) {
    const s = await pageServer()
    const got = await crawlRoutes(routes, s.base, { passes: 1, urls })
    assert.deepEqual([...s.hits].sort(), [...want].sort(), urls)
    assert.deepEqual(got.map((r) => r.path), ['/', '/about/team'], 'the record keeps the bare path')
  }
})

function runPack(mutate = (inv) => inv) {
  const dir = tmp('pf-fj-')
  const src = join(dir, 'src')
  cpSync(FIXTURE, src, { recursive: true })
  const inv = mutate(readJson(join(FIXTURE, 'inventory.json')))
  writeFileSync(join(src, 'inventory.json'), JSON.stringify(inv))
  const out = join(dir, 'pack')
  buildSpecPack({ j6Dir: src, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  return { out, inv }
}

test('SF-6: trashed menu items (and what hangs under them) are not exported; unpublished ones stay with published: false', () => {
  const base = loadInventory(join(FIXTURE, 'inventory.json'))
  const item = (id, parent, published, path) => ({ id, menutype: 'tracy', title: `t${id}`, alias: `a${id}`, path, link: 'index.php?option=com_content&view=article&id=1', type: 'component', published, parent_id: parent, level: '1', template_style_id: '0', params: '{}', lft: String(100 + Number(id)), rgt: String(101 + Number(id)), home: '0', client_id: '0' })
  const inv = { ...base, menu: [...base.menu, item('900', '1', '-2', ''), item('901', '900', '1', 'x/y'), item('902', '1', '0', 'draft')] }
  const ids = (list) => list.flatMap((i) => [i.id, ...ids(i.children)])
  const got = ids(menuTree(inv, 'tracy'))
  assert.ok(!got.includes('900') && !got.includes('901'), 'trashed item and its child are gone')
  assert.ok(got.includes('902'), 'unpublished stays')
  const { out } = runPack((i) => ({ ...i, menu: [...i.menu, item('900', '1', '-2', ''), item('902', '1', '0', 'draft')] }))
  const flat = readJson(join(out, 'menus.json')).menus.flatMap((m) => ids(m.items))
  assert.ok(!flat.includes('900') && flat.includes('902'))
  const cov = readFileSync(join(out, existsSync(join(out, 'adapter-coverage.json')) ? 'adapter-coverage.json' : 'coverage.json'), 'utf8')
  assert.match(cov, /trashed \(published -2\)/)
})

test('SF-7/SF-8: site-model.json carries the mod_custom content with its placement, and media holds every cited image', () => {
  const { out } = runPack((inv) => ({
    ...inv,
    modules: [...inv.modules, { id: '190', title: 'Top bar hours', content: '<p>Open daily</p><img src="/images/bar/clock.png" alt="">', ordering: '1', position: 'top-bar', published: '1', module: 'mod_custom', showtitle: '0', client_id: '0', params: '{}' }],
    modules_menu: [...inv.modules_menu, { moduleid: '190', menuid: '247' }]
  }))
  const model = readJson(join(out, 'site-model.json'))
  const mods = model.records.filter((r) => r.type === 'modules')
  assert.ok(model.types.some((t) => t.name === 'modules'))
  const top = mods.find((r) => r.values.title === 'Top bar hours')
  assert.ok(top, 'the module is a record')
  assert.equal(top.values.position, 'top-bar')
  assert.match(top.values.content, /Open daily/)
  assert.deepEqual(JSON.parse(top.values.placement), model.routes.map((r) => r.path).filter((p) => p === '/'), 'placed on the home route only')
  const footer = mods.find((r) => r.values.position === 'footnav-1')
  assert.deepEqual(JSON.parse(footer.values.placement), ['ALL'])
  assert.ok(model.media.some((m) => m.file === 'clock.png' && m.usedBy.some((u) => u.startsWith('modules/'))), 'module image is in media')
})

test('SF-8: images of section items (slides, avatars) are in media[]', () => {
  const model = buildSiteModel({
    tpl: { site: {} },
    wpPages: [],
    arts: [],
    isPageArticle: () => false,
    postPath: () => '/',
    sectionsAcm: [{ id: '1', type: 'slider', title: 'Slides', published: true, fields: { title: 'x' }, items: [{ image: 'images/a.jpg', caption: 'c' }, { image: 'images/b.jpg' }] }]
  })
  assert.deepEqual(model.media.map((m) => m.file).sort(), ['a.jpg', 'b.jpg'])
  assert.equal(model.records.find((r) => r.type === 'slider').values.items[0].image, 'a.jpg')
})

test('SF-13: a stray ) in a font family is read past and flagged, a function is left alone', () => {
  assert.deepEqual(familyStack('"Teko)", sans-serif'), ['Teko', 'sans-serif'])
  assert.equal(primaryFamily('Teko)'), 'Teko')
  assert.equal(hasStrayParen('Teko)'), true)
  assert.equal(hasStrayParen('"Teko", sans-serif'), false)
  assert.equal(hasStrayParen('var(--font)'), false)
  assert.equal(primaryFamily('var(--font), Arial'), 'Arial')
})

test('review: an item image is a media entry whatever its field is called, and single-quoted module HTML is read', () => {
  const model = buildSiteModel({
    tpl: { site: {} },
    wpPages: [],
    arts: [],
    isPageArticle: () => false,
    postPath: () => '/',
    sectionsAcm: [{ id: '1', type: 'team', title: 'Team', published: true, fields: { title: 'x', backdrop: 'images/back.webp' }, items: [{ avatar: 'images/person.png', name: 'Ann', link: 'images/doc.png' }] }],
    customModules: [{ id: '5', title: 'Custom', position: 'p', html: "<img src='images/custom.jpg'><a href=\"images/other.png\">x</a>", placement: ['ALL'] }]
  })
  assert.deepEqual(model.media.map((m) => m.file).sort(), ['back.webp', 'custom.jpg', 'other.png', 'person.png'])
  const team = model.records.find((r) => r.type === 'team')
  assert.equal(team.values.items[0].avatar, 'person.png')
  assert.equal(team.values.items[0].link, 'images/doc.png', 'a link field stays a url')
  assert.match(model.records.find((r) => r.type === 'modules').values.content, /src='custom\.jpg'/)
})

const ASSETS = (file) => `<?xml version="1.0"?><assets><stylesheets><file>${file}</file></stylesheets></assets>`
const t3 = (files) => ({ templates: [{ dir: 'tpl', framework: 'T3' }], styles: [style()], menu: [item()], googleListText: null, reader: memoryReader(files) })

test('review: a stray ) in a font URL and in a T3 declaration is read past, loaded, and reported on the role', () => {
  assert.deepEqual(familiesOfFontUrl('https://fonts.googleapis.com/css?family=Teko)'), ['Teko'])
  const r = analyzeStatic(t3({ 'templates/tpl/less/variables.less': '@font-family-base: "Teko)", sans-serif;', 'templates/tpl/etc/assets.xml': ASSETS('https://fonts.googleapis.com/css?family=Teko)') }))
  const body = r.styles[0].roles.find((x) => x.role === 'body')
  assert.equal(body.family, 'Teko')
  assert.equal(body.verdict, 'loaded')
  assert.match(body.malformed, /stray '\)'/)
})

test('review: a published child of a trashed menu item is not a route, a page or an export', () => {
  const base = loadInventory(join(FIXTURE, 'inventory.json'))
  const row = (id, parent, published, path) => ({ id, menutype: 'tracy', title: `t${id}`, alias: `a${id}`, path, link: 'index.php?option=com_content&view=featured', type: 'component', published, parent_id: parent, level: '1', template_style_id: '0', params: '{}', lft: String(100 + Number(id)), rgt: String(101 + Number(id)), home: '0', client_id: '0' })
  const menu = [...base.menu, row('900', '1', '-2', 'gone'), row('901', '900', '1', 'gone/child')]
  assert.deepEqual([...trashedMenuIds(menu)].sort(), ['900', '901'])
  const [e] = routeViews({ ...base, menu }, [{ id: '901', path: '/gone/child' }])
  assert.equal(e.kind, 'gap')
  assert.match(e.reason, /trashed/)
  // the dump: the same inventory through joomla-dump.mjs writes no route for either
  const dir = tmp('pf-dr-')
  const db = Object.fromEntries(Object.entries({ ...base, menu }).map(([t, rows]) => [`jm_${t}`, rows]))
  db.jm_extensions = [{ extension_id: '19', name: 'com_content', type: 'component', element: 'com_content', folder: '', client_id: '1', enabled: '1', params: '{}', manifest_cache: '{}' }]
  writeFileSync(join(dir, 'db.json'), JSON.stringify(db))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'bin', 'docker'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_DOCKER)} "$@"\n`, { mode: 0o755 })
  const r = spawnSync(process.execPath, [join(SKILL, 'scripts/ingest/joomla-dump.mjs'), '--out', join(dir, 'j6'), '--container', 'fake-db', '--password', 'pw-x', '--prefix', 'jm_'], { encoding: 'utf8', timeout: 60000, env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, FAKE_JOOMLA_DB: join(dir, 'db.json') } })
  assert.equal(r.status, 0, r.stderr)
  const paths = readJson(join(dir, 'j6', 'render-routes.json')).map((x) => x.path)
  assert.ok(paths.length > 0 && !paths.some((p) => p.startsWith('/gone')), paths.join())
})

test('review: a field’s type does not depend on an empty first value (item fields and top-level fields)', () => {
  const model = buildSiteModel({
    tpl: { site: {} },
    wpPages: [],
    arts: [],
    isPageArticle: () => false,
    postPath: () => '/',
    sectionsAcm: [
      { id: '1', type: 'team', title: 'A', published: true, fields: { banner: '' }, items: [{ avatar: '' }, { avatar: 'images/person.png' }] },
      { id: '2', type: 'team', title: 'B', published: true, fields: { banner: 'images/wide.jpg' }, items: [] }
    ]
  })
  const team = model.types.find((t) => t.name === 'team')
  assert.equal(team.fields.find((f) => f.name === 'banner').type, 'image')
  assert.equal(team.fields.find((f) => f.name === 'items').fields.find((f) => f.name === 'avatar').type, 'image')
  assert.deepEqual(model.media.map((m) => m.file).sort(), ['person.png', 'wide.jpg'])
})

test('review: the first non-empty value settles a field’s type; later values never change it, and images in a text field stay text', () => {
  const model = buildSiteModel({
    tpl: { site: {} },
    wpPages: [],
    arts: [],
    isPageArticle: () => false,
    postPath: () => '/',
    sectionsAcm: [
      { id: '1', type: 'crew', title: 'A', published: true, fields: { banner: 'Hello team', intro: '<p>Hi</p>' }, items: [{ avatar: 'Alice' }, { avatar: 'images/late.png' }] },
      { id: '2', type: 'crew', title: 'B', published: true, fields: { banner: 'images/b.jpg', intro: 'images/c.jpg' }, items: [] }
    ]
  })
  const crew = model.types.find((t) => t.name === 'crew')
  const type = (n) => crew.fields.find((f) => f.name === n).type
  assert.equal(type('banner'), 'text', 'text then image stays text')
  assert.equal(type('intro'), 'prose', 'prose then image stays prose')
  assert.equal(crew.fields.find((f) => f.name === 'items').fields[0].type, 'text')
  assert.deepEqual(model.media, [], 'images in fields settled as text are plain values, not media')
  const b = model.records.find((r) => r.slug === 'b')
  assert.equal(b.values.banner, 'images/b.jpg', 'the value is kept as written')
})

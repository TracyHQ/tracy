import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync, mkdtempSync, rmSync, cpSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, statSync, renameSync, readlinkSync, chmodSync, realpathSync } from 'node:fs'
import { join, dirname, relative, resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir, hostname } from 'node:os'
import { COVERAGE_FILE, COVERAGE_KINDS, COVERAGE_STATUSES, checkInventoryShape, checkRenderRoutes, validationGapItems, captureReader } from '../ingest/from-joomla.mjs'
import { browserArgs, buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { SITE_CONFIG_FIELDS } from '../lib/joomla-inventory.mjs'

const run = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const SKILL = join(here, '..', '..')
const FIXTURE = join(here, 'fixtures', 'joomla-coverage')
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const ARTIFACTS = process.env.P2_COVERAGE_ARTIFACTS || null

// Scratch goes under P2_COVERAGE_ARTIFACTS when it is set (TMPDIR is left as it is), else the OS temp dir.
const SCRATCH = ARTIFACTS ? join(ARTIFACTS, 'p2-scratch') : tmpdir()
const tmps = []
function tmp(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
  try {
    if (ARTIFACTS && !readdirSync(SCRATCH).length) rmSync(SCRATCH, { recursive: true })
  } catch {}
})

/** A copy of the fixture to change one thing in. */
function fixtureCopy() {
  const d = tmp('cov-src-')
  cpSync(FIXTURE, d, { recursive: true })
  return d
}
const build = (j6Dir, extra = {}) => buildSpecPack({ j6Dir, out: join(tmp('cov-out-'), 'spec'), pageFloor: 1, now: '2026-09-28T00:00:00.000Z', ...extra })

let built = null
function fixtureReport() {
  if (!built) {
    const result = build(FIXTURE)
    built = { result, report: readJson(join(result.out, COVERAGE_FILE)), out: result.out }
    if (ARTIFACTS) {
      mkdirSync(ARTIFACTS, { recursive: true })
      writeFileSync(join(ARTIFACTS, 'p2-fixture-adapter-coverage.json'), JSON.stringify(built.report, null, 2) + '\n')
    }
  }
  return built
}
// Every entry of the tree: a file by its hash, a link by its target, anything else by its kind — a
// link added, retargeted or removed is a change, as a file's bytes are.
const hashTree = (root) => {
  const out = {}
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isSymbolicLink()) out[relative(root, p)] = `symlink:${readlinkSync(p)}`
      else if (d.isDirectory()) walk(p)
      else if (d.isFile()) out[relative(root, p)] = createHash('sha256').update(readFileSync(p)).digest('hex')
      else out[relative(root, p)] = 'special'
    }
  }
  walk(root)
  return out
}

const itemOf = (report, id) => {
  const i = report.items.find((x) => x.id === id)
  assert.ok(i, `coverage has ${id}`)
  return i
}

/**
 * Resolve a target reference against the written pack: `null` for a free-text target, else
 * whether the named record exists.
 */
function targetExists(out, ref) {
  const m = ref.match(/^([a-z-]+\.json)#(.+)$/)
  if (!m) return null
  const [, file, rest] = m
  const data = readJson(join(out, file))
  // `list[key=value]`: a record of that list whose key has that value
  const sel = rest.match(/^([a-z]+)\[([a-zA-Z]+)=(.*)\]$/)
  if (sel) return (data[sel[1]] ?? []).some((x) => String(x[sel[2]]) === sel[3])
  const [head, ...tail] = rest.split('/')
  const key = tail.join('/')
  if (file === 'page-map.json' && head === 'pages') return data.pages.some((p) => p.file === key)
  if (file === 'page-map.json' && head === 'theme') return Boolean(data.theme)
  if (file === 'content.json' && head === 'pages') return data.pages.some((p) => p.file === key)
  if (file === 'content.json' && head === 'archives') return data.archives.some((a) => a.file === key)
  if (file === 'content.json' && head === 'categories') return data.categories.some((c) => c.wpSlug === key)
  if (file === 'content.json' && head === 'site') return Boolean(data.site)
  if (file === 'sections.json') return (data[head] ?? []).some((x) => x.id === key)
  if (file === 'menus.json') {
    const menu = data.menus.find((x) => x.menutype === head)
    if (!menu) return false
    if (!key) return true
    const flat = (list) => list.flatMap((i) => [i, ...flat(i.children ?? [])])
    return flat(menu.items).some((i) => i.id === key)
  }
  if (file === 'design-contract.json') return Boolean(data[head])
  throw new Error(`test cannot resolve target ${ref}`)
}

// ── the fixture: every source entity accounted for ───────────────────────────

test('adapter coverage: the fixture census has one entity per render route and per inventory row, the pack beside it validates', () => {
  const { report, result } = fixtureReport()
  const inv = readJson(join(FIXTURE, 'inventory.json'))
  const routes = readJson(join(FIXTURE, 'render-routes.json'))
  assert.equal(result.validation.ok, true, result.validation.problems?.join('; '))
  assert.equal(report.spec.valid, true)
  const kinds = (k) => report.items.filter((i) => i.kind === k)
  assert.equal(kinds('route').length, routes.length)
  assert.deepEqual(kinds('route').map((i) => i.source.menuId).sort(), routes.map((r) => r.id).sort())
  for (const [kind, table] of [['menu-item', 'menu'], ['article', 'content'], ['category', 'categories'], ['module', 'modules'], ['template-style', 'template_styles']]) {
    assert.equal(kinds(kind).length, inv[table].length, `${kind} entries = #__${table} rows`)
    assert.deepEqual(kinds(kind).map((i) => i.source.id).sort(), inv[table].map((r) => String(r.id)).sort(), `${kind}: every row, excluded ones included`)
  }
  assert.deepEqual(report.denominators, { routes: routes.length, tables: { menu: inv.menu.length, content: inv.content.length, categories: inv.categories.length, modules: inv.modules.length, template_styles: inv.template_styles.length } })
  // layouts and blocks: every captured layout file, every block a layout names, the mega menu
  const layoutDir = join(FIXTURE, 'capture/templates/cov/etc/layout')
  assert.deepEqual(kinds('layout').map((i) => i.title).sort(), readdirSync(layoutDir).map((f) => f.replace(/\.json$/, '')).sort())
  assert.deepEqual(kinds('layout-block').map((i) => i.id).sort(), ['layout-block-file:unused-block.html', 'layout-block:footer', 'layout-block:mainnav', 'layout-cell:default#Spacer.0', 'megamenu:default'])
  // every captured block file is an entry, the ones no layout draws included
  const blockDir = join(FIXTURE, 'capture/templates/cov/html/layouts/t4/block')
  for (const f of readdirSync(blockDir)) assert.ok(kinds('layout-block').some((i) => i.source.file?.endsWith(`block/${f}`)), f)
  // every declared script: an animation library it names, or an asset entry of its own
  const jsDir = join(FIXTURE, 'capture/templates/cov/js')
  for (const f of readdirSync(jsDir)) assert.ok(report.items.some((i) => (i.kind === 'asset' && i.id.endsWith(`js/${f}`)) || (i.kind === 'animation' && i.source.declared.some((d) => d.includes(`js/${f}`)))), `js/${f}`)
  const assets = readJson(join(FIXTURE, 'capture/templates/cov/etc/assets.json')).assets
  for (const k of Object.keys(assets)) assert.ok(report.items.some((i) => i.id.endsWith(`etc/assets.json#${k}`) || (i.kind === 'animation' && i.source.declared.some((d) => d.endsWith(`assets.${k}`)))), k)
  // identities are unique; statuses and kinds come from the declared lists; non-mapped items say why
  assert.equal(new Set(report.items.map((i) => i.id)).size, report.items.length)
  for (const i of report.items) {
    assert.ok(COVERAGE_KINDS.includes(i.kind), i.id)
    assert.ok(COVERAGE_STATUSES.includes(i.status), i.id)
    if (i.status !== 'mapped') assert.ok(i.reason && i.reason.length > 10, `${i.id} (${i.status}) carries a reason`)
    else assert.equal(i.reason, null, `${i.id} is mapped without an unresolved reason`)
    assert.ok(i.source && typeof i.source === 'object', `${i.id} has source evidence`)
  }
  // the summary is the items, counted
  assert.equal(report.summary.total, report.items.length)
  for (const k of COVERAGE_KINDS) {
    assert.equal(report.summary.byKind[k].total, kinds(k).length, k)
    for (const s of COVERAGE_STATUSES) assert.equal(report.summary.byKind[k][s], kinds(k).filter((i) => i.status === s).length, `${k}/${s}`)
  }
  for (const s of COVERAGE_STATUSES) assert.equal(report.summary.byStatus[s], report.items.filter((i) => i.status === s).length, s)
  assert.deepEqual(result.coverage, report.summary, 'buildSpecPack returns the summary it wrote')
})

test('adapter coverage: the fixture known unsupported, partial and skipped items carry the status, criticality and reason stated', () => {
  const { report } = fixtureReport()
  const expect = [
    // [id, status, critical, reason pattern]
    ['route:252:/wrapper', 'unsupported', true, /no WordPress core equivalent for com_wrapper\/wrapper.*redirects 301 to \//],
    ['route:257:/missing', 'unsupported', true, /article #999, which the inventory does not hold/],
    ['article:47', 'unsupported', true, /page category \(Website pages\) that no render route opens/],
    ['content:field:faq', 'unsupported', true, /drawn in no body \(\/about\)/],
    ['content:body:46@landing.html', 'unsupported', false, /no component row/],
    ['module:202', 'unsupported', true, /ACM instance not decoded \(jatools-config is not JSON/],
    ['module:204', 'unsupported', true, /no stage-2 mapping for module type mod_finder/],
    // The default layout is read only partly, so whether it draws this position on / is unknown. Stage 2 carries related-item data, but missing metakey values leave membership partial.
    ['module:205', 'partial', false, /article metakey values are absent from the dump; related article membership cannot be evidenced/],
    ['module:207', 'unsupported', true, /mod_articles_latest/],
    ['module:209', 'unsupported', true, /placement unknown on 8 route\(s\) \(block markup .*footer\.html not captured or not inspected\)/],
    ['module:212', 'unsupported', true, /\{loadmodule\} loads it \(article:45\)/],
    // module:215 (menuid -248, "every page except About") is placed since #67: assignedTo reads the negative row — see the mapped list below
    ['module:220', 'partial', true, /masthead on 6 page route\(s\)/],
    ['module:203', 'partial', false, /kept as core\/html because no section type matched \(index\.html\)/],
    ['module:217', 'partial', false, /menu type "nonexistent"/],
    ['module:218', 'partial', false, /layout override cov:slider/],
    ['module:219', 'partial', false, /ACM type "gallery" is not in the captured template.*config keys the ACM normaliser does not read: odd-key/],
    ['template-style:23', 'unsupported', true, /template "protostar", which is not the captured one/],
    ['template-style:20', 'partial', false, /sub-layout "detail" is not read/],
    ['layout:detail', 'unsupported', false, /sub-layout of the article views of 3 route\(s\)/],
    ['layout-cell:default#Spacer.0', 'unsupported', true, /cell type "spacer"/],
    ['layout-block:footer', 'unsupported', false, /footer\.html is not captured/],
    ['layout-block:mainnav', 'partial', false, /elements logo, megamenu/],
    ['megamenu:default', 'partial', false, /positions mega-1, module ids 210/],
    ['animation:aos', 'unsupported', false, /used in 1 place\(s\)/],
    ['animation:owl-carousel', 'skipped-by-rule', false, /no inspected file or inventory row uses it/],
    ['animation:wow', 'skipped-by-rule', false, /no inspected file or inventory row uses it/],
    ['asset:capture/templates/cov/etc/assets.json#js.lightbox', 'unsupported', false, /no animation signature recognises/],
    ['asset:capture/templates/cov/js/template.js', 'unsupported', false, /what it does on which routes is not traced/],
    ['layout-block-file:unused-block.html', 'skipped-by-rule', false, /no captured layout file draws/],
    ['menu-item:252', 'partial', false, /301 target \//],
    ['menu-item:255', 'partial', false, /which no render route captured/],
    ['article:45', 'partial', false, /faq.*\{loadmodule mod_custom,Promo\}/],
    ['article:46', 'partial', false, /layout "landing" of the route has no component row/],
    ['article:4', 'skipped-by-rule', false, /trashed/],
    ['article:5', 'skipped-by-rule', false, /category #16 is trashed/],
    ['module:211', 'skipped-by-rule', false, /no position/],
    ['module:213', 'skipped-by-rule', false, /not published/],
    ['module:214', 'skipped-by-rule', false, /position "sidebar-x" is in no layout/],
    ['module:216', 'skipped-by-rule', false, /administrator module/],
    ['menu-item:1', 'skipped-by-rule', false, /root/],
    ['menu-item:100', 'skipped-by-rule', false, /administrator menu item/],
    ['menu-item:254', 'skipped-by-rule', false, /not published/],
    ['category:16', 'skipped-by-rule', false, /trashed/],
    ['layout:unused', 'skipped-by-rule', false, /no render route uses it/]
  ]
  for (const [id, status, critical, reason] of expect) {
    const i = itemOf(report, id)
    assert.equal(i.status, status, `${id} status`)
    assert.equal(i.critical, critical, `${id} critical`)
    assert.match(i.reason, reason, `${id} reason`)
  }
  // mapped items the fixture maps
  for (const id of ['route:247:/', 'route:248:/about', 'article:3', 'article:48', 'module:201', 'module:206', 'module:208', 'module:210', 'module:215', 'category:15', 'template-style:21', 'menu-item:256'])
    assert.equal(itemOf(report, id).status, 'mapped', id)
  // the override draws section-cta on /special; the mega menu draws module 210 by id
  assert.deepEqual(itemOf(report, 'module:206').impact.via, ['override html/com_content/article/special.php'])
  assert.deepEqual(itemOf(report, 'module:210').impact.via, ['megamenu default'])
  // {loadmodule} in article 45 draws module 212 on the route that opens the article
  assert.deepEqual(itemOf(report, 'module:212').impact.routes, ['/about'])
  assert.deepEqual(itemOf(report, 'module:212').impact.loadedBy, ['article:45'])
  // the unknown section reuses the adapter's own note
  assert.ok(itemOf(report, 'module:203').notes.some((n) => n.startsWith('mod_custom modules kept as core/html because no section type matched')))
  assert.match(itemOf(report, 'content:field:faq').notes[0], /^article fields not placed in any body/)
  // the six-table inventory holds no extension census, and the report says so
  assert.ok(report.inspection.limitations.some((l) => /no extensions table/.test(l)))
})

test('adapter coverage: critical items come first, then unsupported, partial, skipped-by-rule, mapped, each group in identity order', () => {
  const { report } = fixtureReport()
  const rank = (i) => [i.critical ? 0 : 1, COVERAGE_STATUSES.indexOf(i.status), COVERAGE_KINDS.indexOf(i.kind)]
  for (let k = 1; k < report.items.length; k++) {
    const a = rank(report.items[k - 1]),
      b = rank(report.items[k])
    const cmp = a.map((v, j) => v - b[j]).find((d) => d !== 0) ?? 0
    assert.ok(cmp < 0 || (cmp === 0 && report.items[k - 1].id.localeCompare(report.items[k].id, 'en', { numeric: true }) < 0), `${report.items[k - 1].id} before ${report.items[k].id}`)
  }
  const firstPlain = report.items.findIndex((i) => !i.critical)
  assert.ok(firstPlain > 0 && report.items.slice(firstPlain).every((i) => !i.critical), 'every critical item is listed before the first non-critical one')
  assert.equal(report.items[0].status, 'unsupported')
  assert.deepEqual(report.summary.critical.ids, report.items.slice(0, firstPlain).map((i) => i.id))
  // a critical routed module with no mapping is among the first
  assert.ok(report.summary.critical.ids.includes('module:204'))
})

test('adapter coverage: every target reference the fixture report names exists in the written pack', () => {
  const { report, out } = fixtureReport()
  let resolved = 0
  for (const i of report.items)
    for (const ref of i.target) {
      const ok = targetExists(out, ref)
      if (ok === null) continue
      assert.equal(ok, true, `${i.id}: target ${ref} exists`)
      resolved++
    }
  assert.ok(resolved > 40, `${resolved} targets resolved`)
  // mapped content entities point at their record
  assert.ok(itemOf(report, 'article:3').target.includes('content.json#posts[path=/news/a-news-post]'))
  assert.ok(itemOf(report, 'module:203').target.includes('sections.json#custom/203'))
  assert.ok(itemOf(report, 'module:204').target.includes('sections.json#other/204'), 'raw preservation is named, and the status is still unsupported')
})

test('adapter coverage: affected instances and routes are distinct counts, recomputed from the items; an ALL module and an exclusion count once', () => {
  const { report } = fixtureReport()
  const distinct = (subset) => ({
    items: subset.length,
    instances: new Set(subset.filter((i) => i.kind === 'module').map((i) => i.id)).size,
    routes: new Set(subset.flatMap((i) => i.impact.routes)).size,
    possibleRoutes: new Set(subset.flatMap((i) => [...i.impact.routes, ...(i.impact.unknown ?? [])])).size
  })
  for (const [key, subset] of [
    ['unsupported', report.items.filter((i) => i.status === 'unsupported')],
    ['partial', report.items.filter((i) => i.status === 'partial')],
    ['critical', report.items.filter((i) => i.critical)]
  ]) {
    const got = report.summary.affected[key]
    assert.deepEqual({ items: got.items, instances: got.instances, routes: got.routes, possibleRoutes: got.possibleRoutes }, distinct(subset), key)
    assert.equal(got.routeList.length, got.routes)
    assert.equal(got.possibleRouteList.length, got.possibleRoutes)
    assert.ok(got.routeList.every((p) => got.possibleRouteList.includes(p)), `${key}: known routes are possible routes`)
    assert.equal(new Set(got.routeList).size, got.routeList.length)
  }
  // module 207 (ALL, mega menu) renders on all 9 routes: one instance, nine distinct routes
  assert.equal(itemOf(report, 'module:207').impact.routes.length, 9)
  assert.equal(report.summary.moduleTypes.mod_articles_latest.instances, 1)
  assert.equal(report.summary.moduleTypes.mod_articles_latest.routes, 9)
  // module 215 is assigned to every page except /about (menuid -248): /about is not among its routes
  assert.ok(!itemOf(report, 'module:215').impact.routes.includes('/about'))
  assert.ok(itemOf(report, 'module:215').impact.routes.includes('/'))
  // a gap route is counted as the route's own loss, not again as a module's missing placement
  assert.ok(!itemOf(report, 'module:215').impact.missing.includes('/wrapper'))
  // mod_ja_acm instances by ACM kind
  assert.deepEqual(report.summary.acmKinds['hero/style-1'].instances, 2)
  assert.deepEqual(report.summary.acmKinds['(not decoded)'].unsupported, 1)
  // module type totals add up to the module rows
  assert.equal(Object.values(report.summary.moduleTypes).reduce((n, t) => n + t.instances, 0), readJson(join(FIXTURE, 'inventory.json')).modules.length)
})

test('adapter coverage: nothing emitted-less is silent — every lost content portion is an unsupported item', () => {
  const { report, out } = fixtureReport()
  const content = readJson(join(out, 'content.json'))
  const prov = readJson(join(out, 'provenance.json'))
  // each page that carries droppedContent has its content:body item
  for (const p of content.pages.filter((x) => x.droppedContent)) assert.equal(itemOf(report, `content:body:${p.joomla.articleId}@${p.file}`).status, 'unsupported')
  // each unplaced field the provenance note lists has its content:field item
  const note = prov.notes.find((n) => n.startsWith('article fields not placed'))
  assert.ok(note)
  for (const i of report.items.filter((x) => x.kind === 'content' && x.id.startsWith('content:field:'))) assert.ok(note.includes(i.source.field), i.id)
  // every live, non-trashed article is emitted, or unsupported with a reason
  const emitted = new Set([...content.pages.map((p) => p.joomla?.articleId), ...content.posts.map((p) => p.joomla.articleId)].filter(Boolean))
  for (const i of report.items.filter((x) => x.kind === 'article')) {
    if (i.status === 'skipped-by-rule') continue
    assert.equal(emitted.has(i.source.id), i.status !== 'unsupported', i.id)
  }
})

// ── inputs that must fail, and inspection that must say what it did not read ──

test('adapter coverage: malformed inventory and routes fail naming the file, and no coverage is written', () => {
  const cases = [
    ['inventory.json is a directory', (d) => (rmSync(join(d, 'inventory.json')), mkdirSync(join(d, 'inventory.json'))), /inventory\.json: not a regular file/],
    ['inventory.json is not JSON', (d) => writeFileSync(join(d, 'inventory.json'), '{ nope'), /inventory\.json: /],
    ['inventory.json is a list', (d) => writeFileSync(join(d, 'inventory.json'), '[]'), /inventory\.json: expected an object of tables/],
    ['a table that is not a list', (d) => editInv(d, (inv) => (inv.modules = { 1: {} })), /table "modules" is object, not a list of rows/],
    ['a row that is not an object', (d) => editInv(d, (inv) => inv.content.push('x')), /content\[7\] is not a row object/],
    ['a row without its key', (d) => editInv(d, (inv) => delete inv.menu[2].id), /menu\[2\] has no id/],
    ['a duplicate primary key', (d) => editInv(d, (inv) => inv.modules.push({ ...inv.modules[0] })), /modules\[\d+\] repeats id 201 of modules\[0\]/],
    ['a duplicate module assignment', (d) => editInv(d, (inv) => inv.modules_menu.push({ ...inv.modules_menu[0] })), /modules_menu\[19\] repeats moduleid\/menuid \S+ of modules_menu\[0\]/],
    ['a required table the dump lacks', (d) => editInv(d, (inv) => delete inv.modules_menu), /no "modules_menu" table/],
    ['none of the six tables', (d) => writeFileSync(join(d, 'inventory.json'), '{}'), /no "content", "categories", "menu", "modules", "modules_menu", "template_styles" tables/],
    ['an extensions table that is not a list', (d) => editInv(d, (inv) => (inv.extensions = { mod_menu: 1 })), /table "extensions" is object, not a list of rows/],
    ['an extension row without its element', (d) => editInv(d, (inv) => (inv.extensions = [{ extension_id: 1, type: 'module' }])), /extensions\[0\] has no element/],
    ['an extension row twice', (d) => editInv(d, (inv) => (inv.extensions = [{ extension_id: 7, type: 'module', element: 'mod_menu' }, { extension_id: 7, type: 'module', element: 'mod_menu' }])), /extensions\[1\] repeats extension 7/],
    ['a theme key that leaves the capture', (d) => editInv(d, (inv) => (inv.template_styles.find((t) => t.id === '20').params = JSON.stringify({ 'typelist-theme': '../../x' }))), /typelist-theme "\.\.\/\.\.\/x" is not a plain file name/],
    ['routes that are not a list', (d) => writeFileSync(join(d, 'render-routes.json'), '{}'), /render-routes\.json: expected a list/],
    ['an empty route list', (d) => writeFileSync(join(d, 'render-routes.json'), '[]'), /render-routes\.json: the list is empty/],
    ['a route listed twice', (d) => writeFileSync(join(d, 'render-routes.json'), JSON.stringify([{ id: '247', path: '/' }, { id: '247', path: '/' }])), /route \/ \(menu item 247\) is listed twice/],
    ['a route without a path', (d) => writeFileSync(join(d, 'render-routes.json'), JSON.stringify([{ id: '247' }])), /routes\[0\] is not \{ id, path \}/],
    ['a template name that leaves the capture', (d) => editInv(d, (inv) => (inv.template_styles[1].template = '../cov')), /not a plain directory name/],
    ['a layout file that is not JSON', (d) => writeFileSync(join(d, 'capture/templates/cov/etc/layout/detail.json'), '{'), /etc\/layout\/detail\.json: /],
    ['a navigation file that is not JSON', (d) => writeFileSync(join(d, 'capture/templates/cov/etc/navigation/default.json'), '{"mega_settings": "{"}'), /etc\/navigation\/default\.json: /]
  ]
  function editInv(d, fn) {
    const inv = readJson(join(d, 'inventory.json'))
    fn(inv)
    writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  }
  for (const [what, breakIt, message] of cases) {
    const d = fixtureCopy()
    breakIt(d)
    const out = join(tmp('cov-bad-'), 'spec')
    assert.throws(() => buildSpecPack({ j6Dir: d, out, pageFloor: 1 }), message, what)
    assert.equal(existsSync(join(out, COVERAGE_FILE)), false, `${what}: no coverage report`)
  }
  // the checks alone
  assert.throws(() => checkInventoryShape({ content: [], menu: [] }, 'x'), /x: no "categories", "modules", "modules_menu", "template_styles" tables/)
  assert.deepEqual(checkInventoryShape({ content: [], categories: [], menu: [], modules: [], modules_menu: [], template_styles: [] }, 'x').missingTables, ['extensions'])
  assert.throws(() => checkRenderRoutes(null, 'r.json'), /r\.json: expected a list/)
})

test('adapter coverage: a dump file that is a link is refused naming it — inventory, routes, content params, site config — and the hash manifest records links', () => {
  for (const f of ['inventory.json', 'render-routes.json', 'content-params.json', 'site-config.json']) {
    const d = fixtureCopy()
    const away = join(tmp('cov-link-'), f)
    if (existsSync(join(d, f))) {
      renameSync(join(d, f), away)
    } else writeFileSync(away, JSON.stringify({ sitename: 'Read through a link' }))
    symlinkSync(away, join(d, f))
    const out = join(tmp('cov-out-'), 'spec')
    assert.throws(() => buildSpecPack({ j6Dir: d, out, pageFloor: 1 }), new RegExp(`${f.replace('.', '\\.')}: not a regular file \\(a link, a directory or a pipe is not read\\)`), f)
    assert.equal(existsSync(join(out, COVERAGE_FILE)), false, `${f}: no report`)
    assert.equal(hashTree(d)[f], `symlink:${away}`, `${f}: the manifest holds the link, so a measurement sees it`)
  }
})

test('adapter coverage: an extensions table gives one entry per row — a plugin element in two folders is two entries — and each reference lands once', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  inv.extensions = [
    { extension_id: 1, type: 'component', element: 'com_content', client_id: 1, enabled: 1 },
    { extension_id: 2, type: 'module', element: 'mod_finder', client_id: 0, enabled: 1 },
    { extension_id: 3, type: 'module', element: 'mod_menu', client_id: 0, enabled: 1 },
    { extension_id: 4, type: 'module', element: 'mod_menu', client_id: 1, enabled: 1 },
    { extension_id: 5, type: 'plugin', folder: 'content', element: 'joomla', client_id: 0, enabled: 1 },
    { extension_id: 6, type: 'plugin', folder: 'system', element: 'joomla', client_id: 0, enabled: 0 },
    { extension_id: 7, type: 'template', element: 'cov', client_id: 0, enabled: 1 }
  ]
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const report = readJson(join(build(d).out, COVERAGE_FILE))
  const ext = report.items.filter((i) => i.kind === 'extension')
  const fromRows = ext.filter((i) => i.source.from === '#__extensions')
  assert.deepEqual(fromRows.map((i) => i.id).sort(), inv.extensions.map((r) => `extension:${r.extension_id}`).sort(), 'one entry per #__extensions row')
  assert.ok(!report.inspection.limitations.some((l) => /no extensions table/.test(l)))
  // the two joomla plugins stay two entries, unused
  assert.equal(itemOf(report, 'extension:5').status, 'skipped-by-rule')
  assert.equal(itemOf(report, 'extension:6').source.folder, 'system')
  // mod_finder (unmapped, routed) rolls up to its row; the site mod_menu row takes the references, the admin one none
  assert.equal(itemOf(report, 'extension:2').status, 'unsupported')
  assert.deepEqual(itemOf(report, 'extension:2').source.members, ['module:204'])
  assert.ok(itemOf(report, 'extension:3').source.members.length > 0)
  assert.deepEqual(itemOf(report, 'extension:4').source.members, [])
  assert.ok(itemOf(report, 'extension:1').source.members.length > 0)
  // a referenced element with no row of its type is its own entry, and says so
  for (const i of ext.filter((x) => x.source.from !== '#__extensions')) assert.match(i.source.from, /no #__extensions row of this type and element/)
  assert.ok(ext.some((i) => i.id === 'extension:mod_articles_latest'))
  // every module instance lands in exactly one extension entry
  const members = ext.flatMap((i) => i.source.members.filter((m) => m.startsWith('module:')))
  assert.equal(new Set(members).size, members.length)
})

test('adapter coverage: a module loaded by {loadmodule} affects the routes of what loads it, through a module that loads it too', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  // module 203 (mod_custom, on /) loads module 211 (no position) by id
  inv.modules.find((m) => m.id === '203').content += '<p>{loadmoduleid 211}</p>'
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const report = readJson(join(build(d).out, COVERAGE_FILE))
  const m211 = itemOf(report, 'module:211')
  assert.equal(m211.status, 'unsupported')
  assert.equal(m211.critical, true)
  assert.deepEqual(m211.impact.loadedBy, ['module:203'])
  assert.deepEqual(m211.impact.routes, itemOf(report, 'module:203').impact.routes)
  assert.ok(m211.impact.routes.length > 0)
  assert.ok(report.summary.affected.critical.routeList.includes(m211.impact.routes[0]))
})

test('adapter coverage: {loadmodule} routes — an article opened by two routes, a marker repeated, and a load cycle count each route and loader once and terminate', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  // article 45 (/about) is opened by a second menu item too, and loads module 212 three times over
  Object.assign(inv.menu.find((m) => m.id === '255'), { link: 'index.php?option=com_content&view=article&id=45' })
  inv.content.find((c) => c.id === '45').introtext += '{loadmoduleid 212}{loadmoduleid 212}'
  // 212 and 211 (both without a position) load each other; 221 and 222 load only each other
  inv.modules.find((m) => m.id === '212').content += '{loadmoduleid 211}'
  inv.modules.find((m) => m.id === '211').content += '{loadmoduleid 212}'
  const base = inv.modules.find((m) => m.id === '211')
  inv.modules.push({ ...base, id: '221', title: 'Ring A', content: '<p>A</p>{loadmoduleid 222}' }, { ...base, id: '222', title: 'Ring B', content: '<p>B</p>{loadmoduleid 221}' })
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const routes = readJson(join(d, 'render-routes.json'))
  routes.push({ id: '255', path: '/uncaptured' })
  writeFileSync(join(d, 'render-routes.json'), JSON.stringify(routes))
  const report = readJson(join(build(d).out, COVERAGE_FILE))
  const m212 = itemOf(report, 'module:212')
  assert.deepEqual(m212.impact.loadedBy, ['article:45', 'module:211'], 'each loader once')
  assert.deepEqual(m212.impact.routes, ['/about', '/uncaptured'])
  // through the cycle, 211 is drawn where 212 is
  assert.deepEqual(itemOf(report, 'module:211').impact.loadedBy, ['module:212'])
  assert.deepEqual(itemOf(report, 'module:211').impact.routes, ['/about', '/uncaptured'])
  // a ring no route reaches: both stay unsupported with no route, and the run ends
  for (const id of ['module:221', 'module:222']) {
    assert.equal(itemOf(report, id).status, 'unsupported')
    assert.deepEqual(itemOf(report, id).impact.routes, [])
  }
  // the aggregates count each route once
  const crit = report.summary.affected.critical
  assert.equal(crit.routeList.filter((p) => p === '/uncaptured').length, 1)
  assert.equal(crit.routes, new Set(report.items.filter((i) => i.critical).flatMap((i) => i.impact.routes)).size)
})

test('adapter coverage: a module {loadmodule} loads is never called drawn nowhere — not with no assignment row, not with an unmapped type on an undrawn position', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  // 214 (mod_login, position sidebar-x that no layout draws, assigned to /landing), 217 (mod_menu,
  // with its #__modules_menu rows removed) and 211 (no position, its #__modules_menu rows removed
  // too) are all loaded by article 45 (/about)
  inv.content.find((c) => c.id === '45').introtext += '{loadmoduleid 214}{loadmoduleid 217}{loadmoduleid 211}'
  inv.modules_menu = inv.modules_menu.filter((r) => !['217', '211'].includes(String(r.moduleid)))
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const report = readJson(join(build(d).out, COVERAGE_FILE))
  const m214 = itemOf(report, 'module:214')
  assert.equal(m214.status, 'unsupported', 'an unmapped type on an undrawn position that is loaded is not skipped')
  assert.equal(m214.critical, true)
  assert.deepEqual(m214.impact.loadedBy, ['article:45'])
  assert.deepEqual(m214.impact.routes, ['/about'], 'drawn where the article that loads it is')
  assert.match(m214.reason, /also loaded by \{loadmodule\} in article:45/)
  const m217 = itemOf(report, 'module:217')
  assert.equal(m217.status, 'unsupported', 'a module with no assignment row that is loaded is not skipped')
  assert.equal(m217.critical, true)
  assert.deepEqual(m217.impact.loadedBy, ['article:45'])
  assert.deepEqual(m217.impact.routes, [], 'not claimed as drawn: the assignment filter is not traced')
  assert.deepEqual(m217.impact.unknown, ['/about'], 'the route of its loader is a possible route')
  assert.match(m217.reason, /#__modules_menu has no row.*\{loadmodule\} loads it in article:45/)
  // no position and no assignment row: the assignment is looked at first, as with a position
  const m211 = itemOf(report, 'module:211')
  assert.equal(m211.status, 'unsupported')
  assert.equal(m211.critical, true)
  assert.deepEqual(m211.impact.loadedBy, ['article:45'])
  assert.equal(m211.impact.loadedUnassigned, true)
  assert.deepEqual(m211.impact.routes, [], 'not claimed as drawn: the assignment filter is not traced')
  assert.deepEqual(m211.impact.unknown, ['/about'], 'the route of its loader is a possible route')
  assert.match(m211.reason, /no position and assigned to no menu item.*\{loadmodule\} loads it in article:45/)
  // both reach the aggregates: 214 in routes, 217 in possible routes
  assert.ok(report.summary.affected.critical.routeList.includes('/about'))
  assert.ok(report.summary.affected.critical.possibleRouteList.includes('/about'))
  // unloaded, the same two stay skipped by rule, each with its reason
  const plain = readJson(join(build(FIXTURE).out, COVERAGE_FILE))
  assert.equal(itemOf(plain, 'module:214').status, 'skipped-by-rule')
})

test('adapter coverage: a subfield an --article-fields "skip" leaves out while it holds a value has its own entry, with the rest of the field drawn', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  // article 45's faq gains an empty subfield: skipping it leaves nothing out, so it has no entry
  inv.content.find((c) => c.id === '45').attribs = JSON.stringify({ show_title: '1', faq: [{ question: 'Why?', answer: 'Because.', note: '' }] })
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const report = readJson(join(build(d, { articleFields: { faq: { skip: ['answer', 'note'] } } }).out, COVERAGE_FILE))
  const answer = itemOf(report, 'content:field:faq.answer')
  assert.equal(answer.status, 'skipped-by-rule')
  assert.deepEqual(answer.source, { table: '#__content.attribs', field: 'faq', subfield: 'answer', articles: ['45'] })
  assert.deepEqual(answer.impact.routes, ['/about'])
  assert.match(answer.reason, /"skip": "answer".*the rest of the field is drawn/)
  assert.equal(report.items.some((i) => i.id === 'content:field:faq.note'), false, 'an empty subfield left out is no content lost')
  assert.equal(report.items.some((i) => i.id === 'content:field:faq'), false, 'the field itself is drawn')
  // a whole field skipped keeps its one entry, and no subfield entry
  const whole = readJson(join(build(d, { articleFields: { faq: 'skip' } }).out, COVERAGE_FILE))
  assert.equal(itemOf(whole, 'content:field:faq').status, 'skipped-by-rule')
  assert.equal(whole.items.some((i) => i.id.startsWith('content:field:faq.')), false)
})

test('adapter coverage: a params column that is not JSON is named, never read as an empty mapping', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  inv.modules.find((m) => m.id === '218').params = '{"catid": ['
  inv.menu.find((m) => m.id === '251').params = '{oops'
  inv.content.find((c) => c.id === '3').attribs = 'not json'
  inv.template_styles.find((t) => t.id === '21').params = '{'
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const { out } = build(d)
  const report = readJson(join(out, COVERAGE_FILE))
  assert.equal(itemOf(report, 'module:218').status, 'unsupported')
  assert.match(itemOf(report, 'module:218').reason, /params column is not valid JSON/)
  assert.equal(itemOf(report, 'menu-item:251').status, 'unsupported')
  assert.equal(itemOf(report, 'article:3').status, 'partial')
  assert.match(itemOf(report, 'article:3').reason, /attribs column is not valid JSON/)
  // the style that lost its params lost its layout too: the route it served falls back to the default
  assert.match(itemOf(report, 'template-style:21').reason, /params column is not valid JSON/)
})

test('adapter coverage: a missing template capture and a layout the capture lacks are unknowns, not zero findings', () => {
  const d = fixtureCopy()
  const inv = readJson(join(d, 'inventory.json'))
  inv.template_styles.find((t) => t.id === '21').params = JSON.stringify({ 'typelist-layout': 'gone' })
  writeFileSync(join(d, 'inventory.json'), JSON.stringify(inv))
  const report = readJson(join(build(d).out, COVERAGE_FILE))
  assert.equal(itemOf(report, 'route:249:/landing').status, 'partial')
  assert.match(itemOf(report, 'route:249:/landing').reason, /layout "gone" is not in the capture/)
  assert.match(itemOf(report, 'module:207').reason, /placement unknown on .*layout gone not captured/)
  assert.match(itemOf(report, 'template-style:21').reason, /layout "gone" is not captured/)
  // no capture at all
  const bare = fixtureCopy()
  rmSync(join(bare, 'capture'), { recursive: true })
  const r2 = readJson(join(build(bare).out, COVERAGE_FILE))
  assert.ok(r2.inspection.limitations.some((l) => /template capture capture\/templates\/cov is absent/.test(l)))
  assert.equal(r2.inspection.capture.filesRead, 0)
  assert.equal(r2.items.filter((i) => i.kind === 'layout').length, 0)
  // every routed module is of unknown placement, and an unmapped one stays critical
  assert.equal(itemOf(r2, 'module:204').status, 'unsupported')
  assert.equal(itemOf(r2, 'module:204').critical, true)
  assert.deepEqual(itemOf(r2, 'module:204').impact.unknown, ['/about'])
})

test('adapter coverage: symbolic links, special files and oversized captured files are reported as not inspected, never followed or read', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const outside = join(tmp('cov-outside-'), 'nav.json')
  writeFileSync(outside, readFileSync(join(tpl, 'etc/navigation/default.json')))
  rmSync(join(tpl, 'etc/navigation/default.json'))
  symlinkSync(outside, join(tpl, 'etc/navigation/default.json'))
  symlinkSync(tmpdir(), join(tpl, 'html/linked-dir'))
  writeFileSync(join(tpl, 'html/big.php'), `<?php /* ${'x'.repeat(1024 * 1024 + 10)} */ ?>{loadposition main-bottom}`)
  execFileSync('mkfifo', [join(tpl, 'html/pipe.php')])
  const { out } = build(d)
  const report = readJson(join(out, COVERAGE_FILE))
  const skipped = report.inspection.capture.skipped
  const reasonOf = (p) => skipped.find((x) => x.path === `capture/templates/cov/${p}`)?.reason
  assert.match(reasonOf('etc/navigation/default.json'), /symbolic link; not followed/)
  assert.match(reasonOf('html/linked-dir'), /symbolic link; not followed/)
  assert.match(reasonOf('html/big.php'), /larger than 1048576 bytes; not read/)
  assert.match(reasonOf('html/pipe.php'), /not a regular file/)
  assert.equal(new Set(skipped.map((x) => `${x.path} ${x.reason}`)).size, skipped.length, 'each file reported once')
  // the navigation it did not read is unknown, not empty
  assert.equal(itemOf(report, 'megamenu:default').status, 'unsupported')
  assert.match(itemOf(report, 'megamenu:default').reason, /is not captured/)
  // module 210, which only the mega menu draws, is now of unknown placement — not "drawn nowhere"
  const m210 = itemOf(report, 'module:210')
  assert.equal(m210.impact.unknown.length, 9)
  assert.match(JSON.stringify(m210), /mega menu\) not captured or not inspected/)
})

test('adapter coverage: the reads before the census go through the same bounded reader — site, layout, ACM schema, css and the capture root', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const away = tmp('cov-away-')
  // a site file linked out of the capture: its value never reaches the pack
  writeFileSync(join(away, 'site.json'), JSON.stringify({ site_name: 'Read through a link' }))
  rmSync(join(tpl, 'etc/site/default.json'))
  symlinkSync(join(away, 'site.json'), join(tpl, 'etc/site/default.json'))
  // a layout that is a FIFO: never opened (the run would block), the route's layout is unknown
  rmSync(join(tpl, 'etc/layout/landing.json'))
  execFileSync('mkfifo', [join(tpl, 'etc/layout/landing.json')])
  // an ACM tmpl directory linked out of the capture: the schema is not read
  cpSync(join(tpl, 'acm/hero/tmpl'), join(away, 'tmpl'), { recursive: true })
  rmSync(join(tpl, 'acm/hero/tmpl'), { recursive: true })
  symlinkSync(join(away, 'tmpl'), join(tpl, 'acm/hero/tmpl'))
  // an oversized theme css: its tokens are not read
  writeFileSync(join(tpl, 'css/styles/default.css'), `:root{--fg:#111}/* ${'x'.repeat(1024 * 1024)} */`)
  const { out } = build(d)
  const report = readJson(join(out, COVERAGE_FILE))
  const reasonOf = (p) => report.inspection.capture.skipped.find((x) => x.path === `capture/templates/cov/${p}`)?.reason
  assert.match(reasonOf('etc/site/default.json'), /symbolic link; not followed/)
  assert.notEqual(readJson(join(out, 'content.json')).site.name, 'Read through a link')
  assert.match(reasonOf('etc/layout/landing.json'), /not a regular file/)
  assert.match(itemOf(report, 'route:249:/landing').reason, /layout "landing" is not in the capture/)
  assert.match(reasonOf('acm/hero/tmpl'), /symbolic link; not followed/)
  assert.match(itemOf(report, 'module:201').reason ?? '', /no acm\/hero\/tmpl\/style-1\.xml schema/)
  assert.match(reasonOf('css/styles/default.css'), /larger than 1048576 bytes/)
  assert.equal(readJson(join(out, 'provenance.json')).source.template.tokens, null)
  // the capture root reached through a linked directory: nothing under it is read
  const d2 = fixtureCopy()
  cpSync(join(d2, 'capture/templates'), join(away, 'templates'), { recursive: true })
  rmSync(join(d2, 'capture/templates'), { recursive: true })
  symlinkSync(join(away, 'templates'), join(d2, 'capture/templates'))
  const r2 = readJson(join(build(d2).out, COVERAGE_FILE))
  assert.equal(r2.inspection.capture.filesRead, 0)
  assert.match(r2.inspection.capture.skipped.find((x) => x.path === 'capture/templates')?.reason ?? '', /on the way to the template capture is a symbolic link/)
  assert.ok(r2.inspection.limitations.some((l) => /template capture capture\/templates\/cov is absent or not a directory/.test(l)))
})

test('adapter coverage: a capture directory swapped while it is read — before an open, between an open and its checks, during a listing — is reported and nothing read through it is kept', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const away = tmp('cov-swap-')
  cpSync(join(tpl, 'etc'), join(away, 'etc'), { recursive: true })
  writeFileSync(join(away, 'etc/site/default.json'), JSON.stringify({ site_name: 'Read through a swap' }))
  // 1. a directory already seen becomes a link to outside the capture: the next read refuses it
  let r = captureReader(tpl, d)
  assert.ok(r.read('etc/global.json'), 'etc is pinned by a first read')
  renameSync(join(tpl, 'etc'), join(tpl, 'etc-was'))
  symlinkSync(join(away, 'etc'), join(tpl, 'etc'))
  assert.equal(r.read('etc/site/default.json'), null)
  assert.deepEqual(r.entries('etc'), [])
  assert.deepEqual(r.list('etc'), [])
  assert.ok(r.inspection.skipped.some((x) => x.path.endsWith('cov/etc') && /symbolic link; not followed/.test(x.reason)))
  // 2. the same, replaced by another real directory: the pinned identity differs
  rmSync(join(tpl, 'etc'))
  cpSync(join(away, 'etc'), join(tpl, 'etc'), { recursive: true })
  assert.equal(r.read('etc/site/default.json'), null)
  assert.equal(r.isDir('etc/layout'), false)
  assert.ok(r.inspection.skipped.some((x) => x.path.endsWith('cov/etc') && /changed while the capture was read/.test(x.reason)))
  rmSync(join(tpl, 'etc'), { recursive: true })
  renameSync(join(tpl, 'etc-was'), join(tpl, 'etc'))
  // 3. swapped between the open and the checks after it: the text read is dropped
  let swapped = false
  const swap = (p) => {
    if (swapped || !p.includes(`${join('etc', 'site')}`)) return
    swapped = true
    renameSync(join(tpl, 'etc'), join(tpl, 'etc-was'))
    symlinkSync(join(away, 'etc'), join(tpl, 'etc'))
  }
  r = captureReader(tpl, d, { afterOpen: swap })
  assert.ok(r.read('etc/global.json'))
  assert.equal(r.read('etc/site/default.json'), null)
  assert.ok(r.inspection.skipped.some((x) => /changed while the capture was read|symbolic link/.test(x.reason)))
  rmSync(join(tpl, 'etc'))
  renameSync(join(tpl, 'etc-was'), join(tpl, 'etc'))
  // 4. swapped during a listing: the names read are not returned
  swapped = false
  r = captureReader(tpl, d, { afterOpen: (p) => (p.endsWith(join('etc', 'site')) ? swap(p) : null) })
  assert.ok(r.isDir('etc/site'))
  assert.deepEqual(r.entries('etc/site'), [])
  // the walk after the listing names what it met there: etc is now a link
  assert.ok(r.inspection.skipped.some((x) => x.path.endsWith('cov/etc') && /symbolic link; not followed/.test(x.reason)), JSON.stringify(r.inspection.skipped))
  rmSync(join(tpl, 'etc'))
  renameSync(join(tpl, 'etc-was'), join(tpl, 'etc'))
  // 5. the template capture itself swapped for a link: nothing more is read
  r = captureReader(tpl, d)
  assert.ok(r.read('etc/global.json'))
  renameSync(tpl, `${tpl}-was`)
  symlinkSync(`${tpl}-was`, tpl)
  assert.equal(r.read('etc/site/default.json'), null)
  assert.ok(r.inspection.skipped.some((x) => /the template capture is a symbolic link/.test(x.reason)))
  rmSync(tpl)
  renameSync(`${tpl}-was`, tpl)
})

test('adapter coverage: a capture directory swapped for a link after it is opened and put back before the check after — the file and the listing come from the directory opened, never through the link', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const away = tmp('cov-swap-back-')
  cpSync(join(tpl, 'etc'), join(away, 'etc'), { recursive: true })
  writeFileSync(join(away, 'etc/site/default.json'), JSON.stringify({ site_name: 'Read through a swap' }))
  writeFileSync(join(away, 'etc/site/OUTSIDE.json'), '{}')
  const inside = readFileSync(join(tpl, 'etc/site/default.json'), 'utf8')
  const names = readdirSync(join(tpl, 'etc/site')).sort()
  let swaps = 0
  let armed = false // one race per operation: the walk after it opens etc/site too
  const hooks = {
    // once etc/site is open, etc becomes a link out of the capture…
    afterOpen: (p) => {
      if (!armed || !p.endsWith(join('etc', 'site'))) return
      armed = false
      swaps++
      renameSync(join(tpl, 'etc'), join(tpl, 'etc-was'))
      symlinkSync(join(away, 'etc'), join(tpl, 'etc'))
    },
    // …and is put back before the walk that checks the path again
    beforeRecheck: () => {
      if (!existsSync(join(tpl, 'etc-was'))) return
      rmSync(join(tpl, 'etc'))
      renameSync(join(tpl, 'etc-was'), join(tpl, 'etc'))
    }
  }
  const r = captureReader(tpl, d, hooks)
  armed = true
  assert.equal(r.read('etc/site/default.json')?.text, inside, 'the file of the directory opened')
  armed = true
  assert.deepEqual(r.entries('etc/site').map((e) => e.name), names, 'the names of the directory opened')
  assert.equal(swaps, 2, 'both the read and the listing were raced')
  assert.deepEqual(r.inspection.skipped, [], 'nothing changed at the check: nothing to report')
})

test('adapter coverage: a captured file replaced after it is opened, or while it is read, is reported and what was read dropped', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const file = join(tpl, 'etc/site/default.json')
  const fileReal = realpathSync(file) // the reader names paths from the dump's real path
  for (const [label, hook] of [
    ['after its open', 'afterOpen'],
    ['before the check after the read', 'beforeRecheck']
  ]) {
    let fired = 0
    const r = captureReader(tpl, d, {
      [hook]: (p) => {
        if (fired || p !== fileReal) return
        fired++
        // the same name, another file: written beside it and renamed over it
        writeFileSync(`${file}.new`, JSON.stringify({ site_name: 'Replaced' }))
        renameSync(`${file}.new`, file)
      }
    })
    assert.equal(r.read('etc/site/default.json'), null, `${label}: nothing read is kept`)
    // a fresh reader sees the file now there, whole
    assert.equal(captureReader(tpl, d).read('etc/site/default.json')?.text, JSON.stringify({ site_name: 'Replaced' }), label)
    assert.equal(fired, 1, label)
    assert.deepEqual(r.inspection.skipped, [{ path: relative(realpathSync(d), realpathSync(file)), reason: 'changed while the capture was read; not read' }], label)
    writeFileSync(file, readFileSync(join(FIXTURE, 'capture/templates/cov/etc/site/default.json')))
    // a fresh reader sees the file now there, whole
  }
})

test('adapter coverage: a capture entry that cannot be inspected (EACCES) is reported with its error, never taken for absent', { skip: process.getuid?.() === 0 ? 'root reads through the permission bits' : false }, () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const site = join(tpl, 'etc/site')
  // listable but not searchable: the directory opens, a name under it cannot be looked up
  chmodSync(site, 0o444)
  try {
    const r = captureReader(tpl, d)
    const at = relative(realpathSync(d), join(realpathSync(tpl), 'etc/site/default.json'))
    assert.equal(r.read('etc/site/default.json'), null, 'read')
    assert.equal(r.exists('etc/site/default.json'), false, 'exists')
    assert.equal(r.read('etc/site/default.json/x'), null, 'a path through it')
    const reasons = r.inspection.skipped.map((x) => `${x.path}: ${x.reason}`)
    assert.ok(reasons.length >= 3, reasons.join('\n'))
    for (const x of r.inspection.skipped) assert.match(x.reason, /could not be inspected \(EACCES\); not read/, x.path)
    assert.ok(r.inspection.skipped.some((x) => x.path === at), reasons.join('\n'))
    // the census through buildSpecPack reports it too
    const out = join(tmp('cov-eacces-'), 'spec')
    buildSpecPack({ j6Dir: d, out, pageFloor: 1, now: '2026-09-28T00:00:00.000Z' })
    const report = readJson(join(out, COVERAGE_FILE))
    assert.ok(JSON.stringify(report).includes('could not be inspected (EACCES)'), 'the report names the entry it could not inspect')
  } finally {
    chmodSync(site, 0o755)
  }
})

test('adapter coverage: a capture entry seen — looked up, listed or opened — and then gone is reported as changed, never taken for absent', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const at = (p) => relative(realpathSync(d), join(realpathSync(tpl), p))
  const put = () => cpSync(join(FIXTURE, 'capture/templates/cov/etc'), join(tpl, 'etc'), { recursive: true })
  const changedAt = (r, p, label) => assert.deepEqual(r.inspection.skipped, [{ path: at(p), reason: 'changed while the capture was read; not read' }], label)
  // a file listed, then deleted before it is read
  let r = captureReader(tpl, d)
  assert.ok(r.entries('etc/site').some((e) => e.name === 'default.json'))
  rmSync(join(tpl, 'etc/site/default.json'))
  assert.equal(r.read('etc/site/default.json'), null)
  changedAt(r, 'etc/site/default.json', 'listed, then gone')
  put()
  // a file found by exists(), then deleted before it is read
  r = captureReader(tpl, d)
  assert.equal(r.exists('etc/site/default.json'), true)
  rmSync(join(tpl, 'etc/site/default.json'))
  assert.equal(r.read('etc/site/default.json'), null)
  changedAt(r, 'etc/site/default.json', 'looked up, then gone')
  put()
  // a directory pinned by a read, then deleted: what is under it is not taken for absent
  r = captureReader(tpl, d)
  assert.ok(r.read('etc/site/default.json'))
  rmSync(join(tpl, 'etc/site'), { recursive: true })
  assert.equal(r.read('etc/site/other.json'), null)
  assert.equal(r.exists('etc/site'), false)
  assert.deepEqual(r.entries('etc/site'), [])
  assert.ok(r.inspection.skipped.length >= 3 && r.inspection.skipped.every((x) => x.path === at('etc/site') && x.reason === 'changed while the capture was read; not read'), JSON.stringify(r.inspection.skipped))
  put()
  // a directory pinned, then replaced by a file of the same name
  r = captureReader(tpl, d)
  assert.ok(r.read('etc/site/default.json'))
  rmSync(join(tpl, 'etc/site'), { recursive: true })
  writeFileSync(join(tpl, 'etc/site'), '{}')
  assert.equal(r.read('etc/site/other.json'), null)
  changedAt(r, 'etc/site', 'a directory become a file')
  rmSync(join(tpl, 'etc/site'))
  put()
  // deleted between the read or the listing and the walk after it
  for (const [label, run, gone, where] of [
    ['a file read', (x) => x.read('etc/site/default.json'), 'etc/site/default.json', 'etc/site/default.json'],
    ['a directory read through', (x) => x.read('etc/site/default.json'), 'etc/site', 'etc/site'],
    ['a directory listed', (x) => x.entries('etc/site'), 'etc/site', 'etc/site']
  ]) {
    let fired = 0
    r = captureReader(tpl, d, {
      beforeRecheck: () => {
        if (fired++) return
        rmSync(join(tpl, gone), { recursive: true })
      }
    })
    const got = run(r)
    assert.ok(got === null || (Array.isArray(got) && got.length === 0), label)
    changedAt(r, where, label)
    put()
  }
})

test('adapter coverage: an entry that cannot be inspected at the walk after a read or a listing is reported with its error code, not as a change', { skip: process.getuid?.() === 0 ? 'root reads through the permission bits' : false }, () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  const etc = join(tpl, 'etc')
  const at = relative(realpathSync(d), join(realpathSync(tpl), 'etc/site'))
  for (const [label, run] of [
    ['a file read', (x) => x.read('etc/site/default.json')],
    ['a directory listed', (x) => x.entries('etc/site')]
  ]) {
    let fired = 0
    const r = captureReader(tpl, d, {
      // etc stays listable but not searchable: etc/site cannot be looked up on the walk after
      beforeRecheck: () => (fired++ ? null : chmodSync(etc, 0o444))
    })
    try {
      const got = run(r)
      assert.ok(got === null || (Array.isArray(got) && got.length === 0), label)
    } finally {
      chmodSync(etc, 0o755)
    }
    assert.equal(fired, 1, label)
    assert.deepEqual(r.inspection.skipped, [{ path: at, reason: 'could not be inspected (EACCES); not read' }], label)
  }
})

test('adapter coverage: the file walk stops at the file limit — nothing past it is walked or reported', () => {
  const d = tmp('cov-many-')
  const root = join(d, 'capture/templates/many')
  mkdirSync(join(root, 'a'), { recursive: true })
  for (let i = 0; i < 5001; i++) writeFileSync(join(root, 'a', `f${String(i).padStart(5, '0')}.txt`), '')
  mkdirSync(join(root, 'z'))
  symlinkSync(tmpdir(), join(root, 'z', 'link'))
  const r = captureReader(root, d)
  const files = r.list('')
  assert.equal(files.length, 5000)
  assert.equal(files[0], 'a/f00000.txt')
  assert.deepEqual(r.inspection.skipped.map((x) => x.reason), ['more than 5000 files; the rest is not inspected'])
})

// ── output ─────────────────────────────────────────────────────────────────────

test('adapter coverage: an existing pack is refused without --force and its report kept; a failed rerun leaves no report of the earlier run; no temporary file stays', () => {
  const out = join(tmp('cov-out-'), 'spec')
  buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1, now: '2026-09-28T00:00:00.000Z' })
  const first = readFileSync(join(out, COVERAGE_FILE), 'utf8')
  assert.throws(() => buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1 }), /spec-pack already exists/)
  assert.equal(readFileSync(join(out, COVERAGE_FILE), 'utf8'), first, 'the refused run leaves the report as it was')
  assert.deepEqual(readdirSync(out).filter((f) => f.endsWith('.tmp')), [])
  // a --force rerun that fails after the pack was started: the earlier report is gone, not presented as this run's
  rmSync(join(out, 'design-spec.md'))
  mkdirSync(join(out, 'design-spec.md'))
  assert.throws(() => buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1, force: true }), /EISDIR|directory/)
  assert.equal(existsSync(join(out, COVERAGE_FILE)), false)
  // an output path the report cannot take fails the run, naming it
  const out2 = join(tmp('cov-out-'), 'spec')
  buildSpecPack({ j6Dir: FIXTURE, out: out2, pageFloor: 1 })
  rmSync(join(out2, COVERAGE_FILE))
  mkdirSync(join(out2, COVERAGE_FILE))
  writeFileSync(join(out2, COVERAGE_FILE, 'keep'), 'x')
  assert.throws(() => buildSpecPack({ j6Dir: FIXTURE, out: out2, pageFloor: 1, force: true }), /adapter-coverage\.json/)
  assert.deepEqual(readdirSync(out2).filter((f) => f.endsWith('.tmp')), [])
})

test('adapter coverage: a design-spec subprocess that fails fails the run — no coverage report is published and the lock is released', () => {
  const dir = tmp('cov-inject-')
  const fail = join(dir, 'fail.cjs')
  writeFileSync(fail, "process.stderr.write('injected design-spec failure\\n'); process.exit(3)\n")
  const out = join(dir, 'spec')
  // Only the subprocess starts under the preload: this process read NODE_OPTIONS when it started.
  const saved = process.env.NODE_OPTIONS
  process.env.NODE_OPTIONS = `--require "${fail}"`
  try {
    assert.throws(() => buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1 }), /injected design-spec failure|status 3/)
  } finally {
    if (saved === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = saved
  }
  assert.equal(existsSync(join(out, COVERAGE_FILE)), false, 'no report of a run that failed')
  assert.equal(existsSync(`${out}.lock`), false, 'the lock is released')
})

test('adapter coverage: one run at a time writes a pack — a held lock refuses a second --force run before it writes, and a lock of a run that is gone is named', () => {
  const out = join(tmp('cov-lock-'), 'spec')
  buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1, now: '2026-09-28T00:00:00.000Z' })
  const lock = `${out}.lock`
  assert.equal(existsSync(lock), false, 'a finished run releases its lock')
  const snapshot = () => Object.fromEntries(readdirSync(out, { recursive: true }).filter((f) => statSync(join(out, f)).isFile()).map((f) => [f, readFileSync(join(out, f), 'utf8')]))
  const before = snapshot()
  // a live writer (this process) holds the lock: the second run touches nothing
  writeFileSync(lock, JSON.stringify({ pid: process.pid, host: hostname(), at: 'now' }))
  assert.throws(() => buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1, force: true }), /another from-joomla run is writing this spec-pack \(pid \d+\)/)
  assert.deepEqual(snapshot(), before, 'the pack and its report are as the first run left them')
  assert.ok(existsSync(lock), 'the refused run does not remove the holder\'s lock')
  // a lock whose process is gone is not taken over silently
  const gone = execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
  writeFileSync(lock, JSON.stringify({ pid: Number(gone), host: hostname(), at: 'then' }))
  assert.throws(() => buildSpecPack({ j6Dir: FIXTURE, out, pageFloor: 1, force: true }), /a lock left by a run that is gone \(pid \d+\).*Remove .*spec\.lock/)
  assert.deepEqual(snapshot(), before)
  rmSync(lock)
  // a run that fails still releases the lock
  const bad = fixtureCopy()
  writeFileSync(join(bad, 'render-routes.json'), '[]')
  assert.throws(() => buildSpecPack({ j6Dir: bad, out, pageFloor: 1, force: true }), /the list is empty/)
  assert.equal(existsSync(lock), false)
})

test('adapter coverage CLI: prints the coverage line on success; bad arguments exit 2 and write no report', async () => {
  const scratch = tmp('cov-cli-')
  const out = join(scratch, 'spec')
  const { stderr } = await run(process.execPath, [join(SKILL, 'scripts/ingest/from-joomla.mjs'), FIXTURE, '--out', out, '--page-floor', '1', ...browserArgs(FIXTURE, scratch)], { cwd: SKILL })
  assert.match(stderr, /adapter coverage \(adapter-coverage\.json\): \d+ entities · \d+ unsupported · \d+ partial · \d+ skipped-by-rule · \d+ mapped · \d+ critical/)
  assert.ok(existsSync(join(out, COVERAGE_FILE)))
  const out2 = join(tmp('cov-cli-'), 'spec')
  for (const args of [[FIXTURE], [FIXTURE, '--out', out2, '--page-floor', '0'], [FIXTURE, '--out', out2, '--content-params', join(FIXTURE, 'nope.json')]]) {
    await assert.rejects(run(process.execPath, [join(SKILL, 'scripts/ingest/from-joomla.mjs'), ...args], { cwd: SKILL }), (e) => e.code === 2, args.join(' '))
    assert.equal(existsSync(join(out2, COVERAGE_FILE)), false)
  }
})

// ── JA Vega: the measured port, read-only (enabled by P2_COVERAGE_SOURCE) ─────

const VEGA = process.env.P2_COVERAGE_SOURCE || null


const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex')

/**
 * The repairs a dump made before its exporter carried these inputs may get before it is measured,
 * each added beside it and exported read-only from the running source: content-params.json (the
 * com_content row of the database) and, when `siteEvidenceFile` is given, site-config.json (the
 * public configuration.php fields). `baselineFile` is the dump's manifest taken before the repair
 * (`{ root, files: { <relative path>: <sha256> } }`); `evidenceFile` what the params export saw
 * (`{ container, database, prefix, query, rows: [{ extension_id, type, element, params }], file: { path, sha256 } }`);
 * `siteEvidenceFile` what the configuration export saw
 * (`{ container, dbContainer, composeProject: { web, db }, fields, answer, file: { path, sha256 } }`).
 * Every file of the baseline is byte-identical, the only files added are those repairs, each hash is
 * the one its export wrote, each value is what the source answered, and each export read the stand
 * the dump names. Throws on any difference.
 */
function checkAdditiveRepair(src, baselineFile, evidenceFile, siteEvidenceFile = null) {
  const baseline = readJson(baselineFile)
  assert.ok(baseline && typeof baseline.files === 'object', `${baselineFile}: expected { root, files }`)
  assert.equal(resolve(baseline.root), resolve(src), `${baselineFile} is the manifest of ${baseline.root}, not ${src}`)
  const added = ['content-params.json', ...(siteEvidenceFile ? ['site-config.json'] : [])]
  for (const f of added) assert.ok(!Object.hasOwn(baseline.files, f), `${baselineFile} already holds ${f}: the repair is not an addition`)
  const now = hashTree(src)
  for (const [rel, sum] of Object.entries(baseline.files)) assert.equal(now[rel], sum, `${rel} changed since the baseline`)
  assert.deepEqual(Object.keys(now).filter((rel) => !Object.hasOwn(baseline.files, rel)).sort(), added, `the repair adds ${added.join(' and ')} and nothing else`)
  const evidence = readJson(evidenceFile)
  const dump = readJson(join(src, 'dump.json'))
  assert.equal(evidence.database, dump.database, 'the export read the database the dump names')
  assert.equal(evidence.prefix, dump.prefix, 'the export read the table prefix the dump names')
  assert.equal(evidence.container, dump.source?.container, 'the export read the container the dump names')
  assert.match(evidence.query, new RegExp(`^SELECT .* FROM \`${dump.prefix}extensions\` WHERE .*element = 'com_content'`), 'a SELECT on the extensions table, filtered to com_content')
  assert.equal(evidence.rows?.length, 1, 'the export answered exactly one com_content row')
  const [row] = evidence.rows
  assert.deepEqual([row.type, row.element], ['component', 'com_content'])
  assert.equal(resolve(evidence.file.path), resolve(join(src, 'content-params.json')))
  assert.equal(evidence.file.sha256, now['content-params.json'], 'content-params.json is the file the export wrote')
  assert.deepEqual(readJson(join(src, 'content-params.json')), JSON.parse(row.params), 'content-params.json holds the params the SELECT returned')
  const repair = { baseline: baselineFile, evidence: evidenceFile, extensionId: row.extension_id, sha256: evidence.file.sha256 }
  if (!siteEvidenceFile) return repair
  const site = readJson(siteEvidenceFile)
  assert.equal(site.dbContainer, dump.source?.container, 'the configuration export names the database container the dump names')
  assert.ok(site.composeProject?.web && site.composeProject.web === site.composeProject.db, `${site.container} and ${site.dbContainer} are one compose project (the stand the dump was taken from)`)
  assert.deepEqual(site.fields, SITE_CONFIG_FIELDS, 'the configuration export asked for the public allow-list, nothing else')
  const answer = JSON.parse(site.answer)
  assert.deepEqual(Object.keys(answer).filter((k) => !SITE_CONFIG_FIELDS.includes(k)), [], 'the configuration export answered allow-listed fields only')
  const asStrings = Object.fromEntries(SITE_CONFIG_FIELDS.filter((k) => Object.hasOwn(answer, k) && answer[k] !== null).map((k) => [k, typeof answer[k] === 'boolean' ? (answer[k] ? '1' : '0') : String(answer[k])]))
  assert.equal(resolve(site.file.path), resolve(join(src, 'site-config.json')))
  assert.equal(site.file.sha256, now['site-config.json'], 'site-config.json is the file the export wrote')
  assert.deepEqual(readJson(join(src, 'site-config.json')), asStrings, 'site-config.json holds the fields configuration.php answered')
  return { ...repair, siteConfig: { evidence: siteEvidenceFile, sha256: site.file.sha256, fields: Object.keys(asStrings) } }
}

/**
 * The read-only measurement of one dump: ingest into `outRoot/spec` with the adapter's own
 * content-params resolution (an explicit `paramsOverride` file only when given), reconcile the
 * coverage with the raw tables, check the report's own invariants (`checkCoverageReport`: every
 * gate problem a critical `validation-gap` item, the critical items first, the summary recomputed
 * from the items) and write `outRoot/p2-ja-vega-counts.json` (the params source, the spec verdict,
 * its problems and their causes included). The spec verdict is reported as it is, valid or not:
 * the downstream gate still refuses an invalid pack; the measurement accepts the coverage only.
 */
function measureDump(src, outRoot, { pageFloor, paramsOverride = null, repair = null } = {}) {
  assert.ok(existsSync(join(src, 'inventory.json')) && existsSync(join(src, 'render-routes.json')), `${src}: inventory.json and render-routes.json are required`)
  // Options kept outside the dump must come from the same database: a dump.json beside them naming
  // the dump's own database, prefix, source and site.
  const inside = !paramsOverride || relative(src, paramsOverride).split(/[\\/]/)[0] !== '..'
  let overrideOrigin = null
  if (paramsOverride && !inside) {
    const theirs = join(dirname(paramsOverride), 'dump.json')
    assert.ok(existsSync(theirs) && existsSync(join(src, 'dump.json')), `${paramsOverride}: options from outside ${src} need a dump.json beside them and in the dump to show they are the same database`)
    const same = (d) => JSON.stringify({ database: d.database, prefix: d.prefix, source: d.source, siteUrl: d.siteUrl })
    assert.equal(same(readJson(theirs)), same(readJson(join(src, 'dump.json'))), `${paramsOverride} was exported from another database than ${src}`)
    overrideOrigin = `${theirs} (${same(readJson(theirs))})`
  }
  const snapshot = () => ({ ...hashTree(src), ...(inside ? {} : { [paramsOverride]: sha256(paramsOverride) }) })
  const before = snapshot()
  const mtimeBefore = statSync(src).mtimeMs
  rmSync(outRoot, { recursive: true, force: true })
  const out = join(outRoot, 'spec')
  let result
  try {
    result = buildSpecPack({ j6Dir: src, out, now: new Date().toISOString(), ...(paramsOverride ? { contentParams: readJson(paramsOverride) } : {}), ...(pageFloor ? { pageFloor } : {}) })
  } catch (e) {
    // no stale counts of an earlier run survive a run that could not build
    throw new Error(`${src}: the ingest failed before any coverage was counted: ${e.message}`)
  }
  const report = readJson(join(out, COVERAGE_FILE))
  assert.deepEqual(snapshot(), before, 'no source byte changed')
  assert.equal(statSync(src).mtimeMs, mtimeBefore, 'nothing was added to the source directory')
  const inv = readJson(join(src, 'inventory.json'))
  const routes = readJson(join(src, 'render-routes.json'))
  const raw = { routes: routes.length, menu: inv.menu.length, content: inv.content.length, categories: inv.categories.length, modules: inv.modules.length, template_styles: inv.template_styles.length }
  assert.deepEqual(report.denominators, { routes: raw.routes, tables: { menu: raw.menu, content: raw.content, categories: raw.categories, modules: raw.modules, template_styles: raw.template_styles } })
  const kinds = (k) => report.items.filter((i) => i.kind === k)
  for (const [kind, n] of [['route', raw.routes], ['menu-item', raw.menu], ['article', raw.content], ['category', raw.categories], ['module', raw.modules], ['template-style', raw.template_styles]]) assert.equal(kinds(kind).length, n, kind)
  assert.equal(new Set(report.items.map((i) => i.id)).size, report.items.length)
  for (const i of report.items) if (i.status !== 'mapped') assert.ok(i.reason, i.id)
  if (!Array.isArray(inv.extensions)) assert.ok(report.inspection.limitations.some((l) => /no extensions table/.test(l)), 'the report does not claim an extension census the dump cannot give')
  // the report carries the gate's verdict as it is, one cause entry and one gap item per problem
  assert.equal(report.spec.valid, result.validation.ok)
  assert.deepEqual(report.spec.problems, result.validation.problems ?? [])
  checkCoverageReport(report)
  const counts = {
    source: src,
    contentParams: { from: result.contentParamsFrom, override: paramsOverride ? { file: paramsOverride, origin: overrideOrigin ?? 'the dump directory' } : null, repair },
    siteName: { value: readJson(join(out, 'content.json')).site.name, from: readJson(join(out, 'provenance.json')).source.siteName ?? null },
    raw,
    spec: report.spec,
    byStatus: report.summary.byStatus,
    byKind: report.summary.byKind,
    critical: { count: report.summary.critical.count, byKind: report.summary.critical.byKind, ids: report.summary.critical.ids },
    affected: Object.fromEntries(Object.entries(report.summary.affected).map(([k, v]) => [k, { items: v.items, instances: v.instances, routes: v.routes, possibleRoutes: v.possibleRoutes }])),
    moduleTypes: report.summary.moduleTypes,
    acmKinds: report.summary.acmKinds,
    inspection: { filesRead: report.inspection.capture.filesRead, skipped: report.inspection.capture.skipped, limitations: report.inspection.limitations }
  }
  writeFileSync(join(outRoot, 'p2-ja-vega-counts.json'), JSON.stringify(counts, null, 2) + '\n')
  console.log(JSON.stringify({ contentParams: counts.contentParams.from, byStatus: counts.byStatus, critical: counts.critical.count, affected: counts.affected, spec: report.spec }))
  return counts
}

/**
 * The invariants a coverage report holds whatever the spec verdict: one critical, unsupported
 * `validation-gap` item per gate problem (none on a valid pack), each linked from `spec.causes`, with
 * the exact problem, a reason and evidence, an untraced cause said to be unknown; critical items
 * first; the summary equal to the items counted again. Throws on the first difference.
 */
function checkCoverageReport(report) {
  const { spec, items, summary } = report
  assert.equal(typeof spec?.valid, 'boolean', 'spec.valid is reported')
  assert.ok(Array.isArray(spec.problems) && Array.isArray(spec.causes), 'spec.problems and spec.causes are lists')
  assert.equal(spec.valid, spec.problems.length === 0, 'spec.valid agrees with its problems')
  assert.deepEqual(spec.causes.map((x) => x.problem), spec.problems, 'one cause entry per problem, in order')
  for (const i of items) {
    assert.ok(COVERAGE_KINDS.includes(i.kind), `${i.id}: kind ${i.kind} is a coverage kind`)
    assert.ok(COVERAGE_STATUSES.includes(i.status), `${i.id}: status ${i.status} is a coverage status`)
  }
  const gaps = items.filter((i) => i.kind === 'validation-gap')
  assert.equal(gaps.length, spec.problems.length, `${gaps.length} validation-gap items for ${spec.problems.length} spec-pack problems`)
  const byId = new Map(items.map((i) => [i.id, i]))
  assert.equal(byId.size, items.length, 'item identities are unique')
  assert.equal(new Set(spec.causes.map((x) => x.coverageId)).size, spec.causes.length, 'each problem links its own gap item')
  for (const x of spec.causes) {
    const g = byId.get(x.coverageId)
    assert.ok(g && g.kind === 'validation-gap', `${x.problem}: linked to a validation-gap item (${x.coverageId})`)
    assert.equal(g.status, 'unsupported', `${g.id} is unsupported`)
    assert.equal(g.critical, true, `${g.id} is critical`)
    assert.equal(g.source.problem, x.problem, `${g.id} carries the exact problem`)
    assert.equal(g.source.cause, x.cause, `${g.id} carries the traced cause`)
    assert.ok(Array.isArray(g.source.evidence) && g.source.artifact !== undefined, `${g.id} carries its evidence`)
    for (const p of g.source.evidence) assert.ok(isAbsolute(p) || !p.startsWith('..'), `${g.id}: evidence ${p} is relative to the dump, or absolute outside it`)
    assert.ok(typeof g.reason === 'string' && g.reason.includes(x.problem), `${g.id} gives the problem as its reason`)
    if (x.cause == null) assert.match(g.reason, /cause unknown/, `${g.id}: an untraced cause is said to be unknown`)
    else assert.ok(g.reason.includes(x.cause), `${g.id} gives the cause`)
    assert.ok(Array.isArray(g.impact?.routes) && typeof g.impact.scope === 'string', `${g.id} states its route scope`)
  }
  const firstPlain = items.findIndex((i) => !i.critical)
  if (firstPlain >= 0) assert.ok(items.slice(firstPlain).every((i) => !i.critical), 'critical items come first')
  for (const i of items) if (i.status !== 'mapped') assert.ok(i.reason, i.id)
  // the summary is the items counted again — every map whole, no key more or less than the items give
  assert.deepEqual(Object.keys(summary).sort(), ['acmKinds', 'affected', 'byKind', 'byStatus', 'critical', 'moduleTypes', 'total'], 'summary: the same sections')
  const tally = (subset) => Object.fromEntries(COVERAGE_STATUSES.map((s) => [s, subset.filter((i) => i.status === s).length]))
  assert.equal(summary.total, items.length)
  assert.deepEqual(summary.byStatus, tally(items))
  assert.deepEqual(Object.keys(summary.byKind ?? {}).sort(), [...COVERAGE_KINDS].sort(), 'byKind: the same kinds')
  for (const k of COVERAGE_KINDS) assert.deepEqual(summary.byKind[k], { total: items.filter((i) => i.kind === k).length, ...tally(items.filter((i) => i.kind === k)) }, k)
  const critical = items.filter((i) => i.critical)
  assert.deepEqual(Object.keys(summary.critical).sort(), ['byKind', 'count', 'ids'], 'critical: the same fields')
  assert.equal(summary.critical.count, critical.length)
  assert.deepEqual(summary.critical.ids, critical.map((i) => i.id))
  const kindCount = {}
  for (const i of critical) kindCount[i.kind] = (kindCount[i.kind] ?? 0) + 1
  assert.deepEqual(summary.critical.byKind, kindCount, 'critical.byKind')
  const routesOf = (subset) => [...new Set(subset.flatMap((i) => i.impact?.routes ?? []))].sort()
  const possibleOf = (subset) => [...new Set(subset.flatMap((i) => [...(i.impact?.routes ?? []), ...(i.impact?.unknown ?? [])]))].sort()
  assert.deepEqual(Object.keys(summary.affected).sort(), ['critical', 'partial', 'unsupported'], 'affected: the same groups')
  for (const [k, subset] of [['unsupported', items.filter((i) => i.status === 'unsupported')], ['partial', items.filter((i) => i.status === 'partial')], ['critical', critical]]) {
    const routeList = routesOf(subset)
    const possibleRouteList = possibleOf(subset)
    assert.deepEqual(
      summary.affected[k],
      { items: subset.length, instances: new Set(subset.filter((i) => i.kind === 'module').map((i) => i.id)).size, routes: routeList.length, routeList, possibleRoutes: possibleRouteList.length, possibleRouteList },
      `affected.${k}`
    )
  }
  // module types and ACM kinds: module instances only, each group counted again
  const groupOf = (keyOf) => {
    const out = {}
    for (const i of items.filter((x) => x.kind === 'module')) {
      const key = keyOf(i)
      if (key) (out[key] ??= []).push(i)
    }
    return Object.fromEntries(
      Object.entries(out).map(([key, v]) => [key, { instances: v.length, ...tally(v), critical: v.filter((i) => i.critical).length, routes: routesOf(v).length, possibleRoutes: possibleOf(v).length }])
    )
  }
  const sameGroups = (actual, expected, label) => {
    assert.deepEqual(Object.keys(actual ?? {}).sort(), Object.keys(expected).sort(), `${label}: the same groups`)
    for (const key of Object.keys(expected)) assert.deepEqual(actual[key], expected[key], `${label}.${key}`)
  }
  sameGroups(summary.moduleTypes, groupOf((i) => i.source.module), 'moduleTypes')
  sameGroups(summary.acmKinds, groupOf((i) => (i.source.module === 'mod_ja_acm' ? (i.source.acm ? `${i.source.acm.type}/${i.source.acm.style ?? '?'}` : '(not decoded)') : null)), 'acmKinds')
}

test('adapter coverage: a pack the spec-pack gate refuses is measured with spec.valid false — each problem a critical validation-gap item traced to its cause', () => {
  const d = fixtureCopy()
  const tpl = join(d, 'capture/templates/cov')
  // the source declares no site name and its theme css (the tokens, the dark palette) is not captured
  const site = readJson(join(tpl, 'etc/site/default.json'))
  writeFileSync(join(tpl, 'etc/site/default.json'), JSON.stringify({ ...site, site_name: '' }))
  rmSync(join(tpl, 'css/styles/default.css'))
  const outRoot = tmp('cov-invalid-')
  const counts = measureDump(d, outRoot, { pageFloor: 1 })
  assert.deepEqual(readJson(join(outRoot, 'p2-ja-vega-counts.json')), counts)
  assert.equal(counts.spec.valid, false)
  assert.ok(counts.spec.problems.length >= 2, 'several problems at once')
  for (const x of counts.spec.causes) assert.ok(x.cause, `${x.problem}: traced`)
  const report = readJson(join(outRoot, 'spec', COVERAGE_FILE))
  const gapOf = (re) => {
    const x = report.spec.causes.find((c) => re.test(c.problem))
    assert.ok(x, `a problem matching ${re}`)
    return itemOf(report, x.coverageId)
  }
  const name = gapOf(/identity\.name must reference a fact/)
  assert.match(name.reason, /capture\/templates\/cov\/etc\/site\/default\.json declares site_name ""/)
  assert.ok(name.source.evidence.includes('capture/templates/cov/etc/site/default.json'))
  assert.equal(name.source.artifact, 'content-contract.json')
  const secondary = gapOf(/palette\.light\.secondary is missing/)
  assert.match(secondary.reason, /css\/styles\/default\.css is not in the template capture/)
  assert.ok(secondary.source.evidence.includes('capture/templates/cov/css/styles/default.css'))
  // a site-wide gap affects every routed page, each once; the raw denominators are unchanged
  const routes = readJson(join(d, 'render-routes.json'))
  const pages = [...new Set(report.items.filter((i) => i.kind === 'route' && !/redirects 301/.test(i.reason ?? '')).flatMap((i) => i.impact.routes))].sort()
  assert.deepEqual(name.impact, { routes: pages, scope: 'site-wide' })
  assert.equal(report.denominators.routes, routes.length)
  assert.equal(counts.byKind['validation-gap'].total, counts.spec.problems.length)
  assert.equal(counts.byKind.module.total, readJson(join(d, 'inventory.json')).modules.length, 'gap items do not count as module instances')
  assert.deepEqual(report.items.slice(0, counts.spec.problems.length).map((i) => i.kind), counts.spec.problems.map(() => 'validation-gap'), 'the gate problems lead the critical items')
  // the CLI gate still refuses the same pack
  assert.throws(() => execFileSync(process.execPath, [join(SKILL, 'scripts/ingest/spec-pack.mjs'), '--validate', join(outRoot, 'spec'), '--page-floor', '1'], { stdio: 'pipe' }), (e) => e.status === 1)
  // options kept outside the dump are refused unless they come from the same database
  const elsewhere = tmp('cov-params-')
  cpSync(join(d, 'content-params.json'), join(elsewhere, 'content-params.json'))
  assert.throws(() => measureDump(FIXTURE, tmp('cov-invalid-'), { pageFloor: 1, paramsOverride: join(elsewhere, 'content-params.json') }), /need a dump\.json beside them/)
})

test('adapter coverage: a tagline the source declares empty is an absent-in-source fact — the pack validates, nothing is filled in', () => {
  const d = fixtureCopy()
  const siteFile = join(d, 'capture/templates/cov/etc/site/default.json')
  writeFileSync(siteFile, JSON.stringify({ ...readJson(siteFile), site_slogan: '' }))
  const outRoot = tmp('cov-absent-')
  const counts = measureDump(d, outRoot, { pageFloor: 1 })
  assert.equal(counts.spec.valid, true, JSON.stringify(counts.spec.problems))
  const contract = readJson(join(outRoot, 'spec', 'content-contract.json'))
  assert.deepEqual(contract.facts['site.tagline'], { value: '', status: 'absent-in-source', source: 'joomla-identity' })
  assert.equal(contract.sources['joomla-identity'].reference, 'capture/templates/cov/etc/site/default.json')
  assert.match(contract.sources['joomla-identity'].note, /declares site_slogan ""/)
  assert.equal(readJson(join(outRoot, 'spec', 'content.json')).site.tagline ?? '', '', 'no tagline is invented')
})

test('adapter coverage: a source that does not declare the tagline at all is a critical gap with the cause traced, not an absence', () => {
  const d = fixtureCopy()
  const siteFile = join(d, 'capture/templates/cov/etc/site/default.json')
  const { site_slogan: _, ...rest } = readJson(siteFile)
  writeFileSync(siteFile, JSON.stringify(rest))
  const outRoot = tmp('cov-invalid-')
  const counts = measureDump(d, outRoot, { pageFloor: 1 })
  assert.equal(counts.spec.valid, false)
  const x = counts.spec.causes.find((c) => /identity\.summary must reference a fact/.test(c.problem))
  assert.match(x.cause, /capture\/templates\/cov\/etc\/site\/default\.json declares site_slogan null; configuration\.php has no tagline setting/)
  const g = itemOf(readJson(join(outRoot, 'spec', COVERAGE_FILE)), x.coverageId)
  assert.deepEqual([g.kind, g.status, g.critical], ['validation-gap', 'unsupported', true])
  assert.equal(readJson(join(outRoot, 'spec', 'content-contract.json')).facts['site.tagline'], undefined, 'no fact, no absence claimed')
})

test('adapter coverage: validation-gap items — several problems, an unknown cause, a page scope, an unknown scope, stable identities', () => {
  const causes = [
    { problem: 'content-contract.json: identity.name must reference a fact', cause: 'etc/site declares site_name ""' },
    { problem: 'design-spec.md still has 2 unresolved `TODO` slot(s) on line(s): 4, 5', cause: null },
    { problem: 'design-contract.json has no page for about.html', cause: null },
    { problem: 'reference.json.kind "x" must be one of html | url | image | none', cause: null },
    { problem: 'content-contract.json: identity.summary must reference a fact', cause: 'no tagline' }
  ]
  const ctx = { siteRoutes: ['/b', '/a', '/a'], routesOfPage: (f) => (f === 'about.html' ? ['/about', '/about'] : []), evidenceOf: (p) => (/identity/.test(p) ? ['capture/x/etc/site/default.json'] : []) }
  const gaps = validationGapItems(causes, ctx)
  assert.deepEqual(gaps.map((g) => g.id), ['validation-gap:content-contract.json:1', 'validation-gap:design-spec.md:1', 'validation-gap:design-contract.json:1', 'validation-gap:reference.json:1', 'validation-gap:content-contract.json:2'])
  assert.deepEqual(validationGapItems(causes, ctx), gaps, 'the same problems give the same items')
  for (const [k, g] of gaps.entries()) {
    assert.equal(g.critical, true)
    assert.equal(g.source.problem, causes[k].problem)
    assert.ok(g.reason.includes(causes[k].problem))
  }
  assert.match(gaps[1].reason, /cause unknown: the adapter traces this problem to no source input/)
  assert.deepEqual(gaps[0].impact, { routes: ['/a', '/b'], scope: 'site-wide' })
  assert.deepEqual(gaps[1].impact, { routes: ['/a', '/b'], scope: 'site-wide' })
  assert.deepEqual(gaps[2].impact, { routes: ['/about'], scope: 'page about.html' })
  assert.deepEqual(gaps[3].impact.routes, [])
  assert.match(gaps[3].impact.scope, /^unknown/)
  assert.deepEqual(gaps[0].source.evidence, ['capture/x/etc/site/default.json'])
  assert.deepEqual(validationGapItems([], ctx), [], 'a valid pack has no gap items')
})

test('adapter coverage: the measurement refuses a report whose gate problems are missing, unlinked or misclassified', () => {
  const { report } = fixtureReport()
  assert.equal(report.spec.valid, true)
  assert.equal(report.items.filter((i) => i.kind === 'validation-gap').length, 0, 'a valid pack has no gap items')
  checkCoverageReport(report)
  // an invalid report built for the check: no tagline declared (an empty one would be a fact) and no theme css
  const d = fixtureCopy()
  const siteFile = join(d, 'capture/templates/cov/etc/site/default.json')
  const { site_slogan: _, ...rest } = readJson(siteFile)
  writeFileSync(siteFile, JSON.stringify(rest))
  rmSync(join(d, 'capture/templates/cov/css/styles/default.css'))
  const r = readJson(join(build(d).out, COVERAGE_FILE))
  assert.ok(r.spec.problems.length >= 2, 'several problems at once')
  checkCoverageReport(r)
  const gapId = r.spec.causes[0].coverageId
  const edit = (f) => {
    const x = structuredClone(r)
    f(x)
    return x
  }
  const recount = (x) => {
    const t = (sub) => Object.fromEntries(COVERAGE_STATUSES.map((s) => [s, sub.filter((i) => i.status === s).length]))
    x.summary.total = x.items.length
    x.summary.byStatus = t(x.items)
    for (const k of COVERAGE_KINDS) x.summary.byKind[k] = { total: x.items.filter((i) => i.kind === k).length, ...t(x.items.filter((i) => i.kind === k)) }
  }
  for (const [label, f, re] of [
    ['a missing gap', (x) => ((x.items = x.items.filter((i) => i.id !== gapId)), recount(x)), /validation-gap items for/],
    ['an unlinked problem', (x) => (x.spec.causes[0].coverageId = 'route:0:/'), /linked to a validation-gap item/],
    ['two problems on one gap', (x) => (x.spec.causes[1].coverageId = gapId), /links its own gap item/],
    ['a partial gap', (x) => ((x.items.find((i) => i.id === gapId).status = 'partial'), recount(x)), /is unsupported/],
    ['a gap that is not critical', (x) => (x.items.find((i) => i.id === gapId).critical = false), /is critical/],
    ['another problem', (x) => (x.items.find((i) => i.id === gapId).source.problem = 'else'), /carries the exact problem/],
    ['a valid verdict with problems', (x) => (x.spec.valid = true), /spec\.valid agrees with its problems/],
    ['a summary that is not the items', (x) => (x.summary.byStatus.unsupported += 1), /Expected values to be strictly deep-equal/],
    ['a kind bucket no item gives', (x) => (x.summary.byKind.invented = { total: 1, unsupported: 1, partial: 0, 'skipped-by-rule': 0, mapped: 0 }), /byKind: the same kinds/],
    ['a kind bucket dropped', (x) => delete x.summary.byKind.extension, /byKind: the same kinds/],
    ['an item of an unknown kind', (x) => (x.items.find((i) => i.id === gapId).kind = 'invented'), /is a coverage kind/],
    ['an item of an unknown status', (x) => (x.items.at(-1).status = 'invented'), /is a coverage status/],
    ['a status bucket no item gives', (x) => (x.summary.byStatus.invented = 0), /Expected values to be strictly deep-equal/],
    ['an affected group no status gives', (x) => (x.summary.affected.invented = x.summary.affected.partial), /affected: the same groups/],
    ['a summary section no item gives', (x) => (x.summary.invented = {}), /summary: the same sections/],
    ['a critical field no item gives', (x) => (x.summary.critical.invented = 1), /critical: the same fields/],
    ['a route count that is not its list', (x) => (x.summary.affected.critical.routes += 1), /affected\.critical/],
    ['a route missing from a list', (x) => x.summary.affected.unsupported.routeList.pop(), /affected\.unsupported/],
    ['a possible route count that is not its list', (x) => (x.summary.affected.partial.possibleRoutes += 1), /affected\.partial/],
    ['a possible route missing from a list', (x) => x.summary.affected.critical.possibleRouteList.pop(), /affected\.critical/],
    ['critical items of a kind miscounted', (x) => (x.summary.critical.byKind['validation-gap'] += 1), /critical\.byKind/],
    ['a critical kind dropped', (x) => delete x.summary.critical.byKind.module, /critical\.byKind/],
    ['a module type miscounted', (x) => (Object.values(x.summary.moduleTypes)[0].instances += 1), /moduleTypes\./],
    ['a module type dropped', (x) => delete x.summary.moduleTypes[Object.keys(x.summary.moduleTypes)[0]], /moduleTypes: the same groups/],
    ['a module type with its routes miscounted', (x) => (Object.values(x.summary.moduleTypes)[0].possibleRoutes += 1), /moduleTypes\./],
    ['an ACM kind miscounted', (x) => (Object.values(x.summary.acmKinds)[0].critical += 1), /acmKinds\./],
    ['an ACM kind dropped', (x) => delete x.summary.acmKinds[Object.keys(x.summary.acmKinds)[0]], /acmKinds: the same groups/]
  ])
    assert.throws(() => checkCoverageReport(edit(f)), re, label)
})

test('adapter coverage: an additive repair is checked — only content-params.json added, every other byte as the baseline, the file the SELECT answered from the dump\'s own database', () => {
  const d = fixtureCopy()
  rmSync(join(d, 'content-params.json'))
  writeFileSync(join(d, 'dump.json'), JSON.stringify({ database: 'joomla', prefix: 'tr_', source: { container: 'src-db-1' } }))
  const dir = tmp('cov-repair-')
  const baseline = join(dir, 'before.json')
  writeFileSync(baseline, JSON.stringify({ root: d, files: hashTree(d) }))
  const params = JSON.stringify({ show_category_title: '1', show_description: '0', maxLevel: '-1' })
  writeFileSync(join(d, 'content-params.json'), JSON.stringify(JSON.parse(params), null, 2) + '\n')
  const evidence = {
    container: 'src-db-1',
    database: 'joomla',
    prefix: 'tr_',
    query: "SELECT JSON_OBJECT('extension_id', CAST(`extension_id` AS CHAR), 'type', type, 'element', element, 'params', CAST(`params` AS CHAR)) FROM `tr_extensions` WHERE type = 'component' AND element = 'com_content'",
    rows: [{ extension_id: '19', type: 'component', element: 'com_content', params }],
    file: { path: join(d, 'content-params.json'), sha256: sha256(join(d, 'content-params.json')) }
  }
  const evidenceFile = join(dir, 'evidence.json')
  const withEvidence = (edit) => (writeFileSync(evidenceFile, JSON.stringify(edit(structuredClone(evidence)))), evidenceFile)
  assert.equal(checkAdditiveRepair(d, baseline, withEvidence((e) => e)).extensionId, '19')
  for (const [label, edit, re] of [
    ['another database', (e) => ({ ...e, database: 'other' }), /the database the dump names/],
    ['another container', (e) => ({ ...e, container: 'x-db-1' }), /the container the dump names/],
    ['not a com_content SELECT', (e) => ({ ...e, query: 'SELECT params FROM `tr_extensions`' }), /filtered to com_content/],
    ['two rows', (e) => ({ ...e, rows: [...e.rows, e.rows[0]] }), /exactly one com_content row/],
    ['another hash', (e) => ({ ...e, file: { ...e.file, sha256: '0'.repeat(64) } }), /the file the export wrote/],
    ['other params', (e) => ({ ...e, rows: [{ ...e.rows[0], params: '{"maxLevel":"3"}' }] }), /the params the SELECT returned/]
  ])
    assert.throws(() => checkAdditiveRepair(d, baseline, withEvidence(edit)), re, label)
  withEvidence((e) => e)
  // a changed source byte, or a second added file, is not an additive repair
  const inv = readFileSync(join(d, 'inventory.json'))
  writeFileSync(join(d, 'inventory.json'), Buffer.concat([inv, Buffer.from(' ')]))
  assert.throws(() => checkAdditiveRepair(d, baseline, evidenceFile), /inventory\.json changed since the baseline/)
  writeFileSync(join(d, 'inventory.json'), inv)
  writeFileSync(join(d, 'extra.json'), '{}')
  assert.throws(() => checkAdditiveRepair(d, baseline, evidenceFile), /adds content-params\.json and nothing else/)
  rmSync(join(d, 'extra.json'))
  // a baseline taken after the repair proves nothing
  const late = join(dir, 'late.json')
  writeFileSync(late, JSON.stringify({ root: d, files: hashTree(d) }))
  assert.throws(() => checkAdditiveRepair(d, late, evidenceFile), /already holds content-params\.json/)
  // the repaired dump is measured through the adapter's own resolution
  const outRoot = tmp('cov-repaired-')
  const counts = measureDump(d, outRoot, { pageFloor: 1, repair: checkAdditiveRepair(d, baseline, evidenceFile) })
  assert.equal(counts.contentParams.from, join(d, 'content-params.json'))
  assert.equal(counts.contentParams.override, null)
  assert.equal(counts.spec.valid, true)

  // site-config.json, added the same way from the web container of the same stand, names the site
  // when the template does not
  const tplSite = join(d, 'capture/templates/cov/etc/site/default.json')
  const blankSite = { ...readJson(tplSite), site_name: '' }
  const siteAnswer = { sitename: 'Coverage Global', MetaDesc: 'd', offline: false, list_limit: 20 }
  const siteText = JSON.stringify({ sitename: 'Coverage Global', MetaDesc: 'd', offline: '0', list_limit: '20' }, null, 2) + '\n'
  const siteEvidence = {
    container: 'src-web-1',
    dbContainer: 'src-db-1',
    composeProject: { web: 'src', db: 'src' },
    fields: SITE_CONFIG_FIELDS,
    answer: JSON.stringify(siteAnswer),
    file: { path: join(d, 'site-config.json'), sha256: createHash('sha256').update(siteText).digest('hex') }
  }
  const siteEvidenceFile = join(dir, 'site-evidence.json')
  const withSite = (edit) => (writeFileSync(siteEvidenceFile, JSON.stringify(edit(structuredClone(siteEvidence)))), siteEvidenceFile)
  // the template's etc/site file is a baseline file: blank it before the baseline is taken
  writeFileSync(tplSite, JSON.stringify(blankSite))
  const baseline2 = join(dir, 'before2.json')
  rmSync(join(d, 'content-params.json'))
  writeFileSync(baseline2, JSON.stringify({ root: d, files: hashTree(d) }))
  writeFileSync(join(d, 'content-params.json'), JSON.stringify(JSON.parse(params), null, 2) + '\n')
  withEvidence((e) => e)
  assert.throws(() => checkAdditiveRepair(d, baseline2, evidenceFile, withSite((e) => e)), /adds content-params\.json and site-config\.json and nothing else/, 'the evidence without the file')
  writeFileSync(join(d, 'site-config.json'), siteText)
  assert.throws(() => checkAdditiveRepair(d, baseline2, evidenceFile), /adds content-params\.json and nothing else/, 'the file without its evidence')
  assert.equal(checkAdditiveRepair(d, baseline2, evidenceFile, withSite((e) => e)).siteConfig.fields.join(), 'sitename,MetaDesc,offline,list_limit')
  for (const [label, edit, re] of [
    ['another stand', (e) => ({ ...e, composeProject: { web: 'other', db: 'src' } }), /one compose project/],
    ['another database container', (e) => ({ ...e, dbContainer: 'x-db-1' }), /the database container the dump names/],
    ['a wider field list', (e) => ({ ...e, fields: [...e.fields, 'password'] }), /the public allow-list, nothing else/],
    ['a secret in the answer', (e) => ({ ...e, answer: JSON.stringify({ ...siteAnswer, secret: 'x' }) }), /allow-listed fields only/],
    ['another hash', (e) => ({ ...e, file: { ...e.file, sha256: '0'.repeat(64) } }), /the file the export wrote/],
    ['another answer', (e) => ({ ...e, answer: JSON.stringify({ ...siteAnswer, sitename: 'Else' }) }), /the fields configuration\.php answered/]
  ])
    assert.throws(() => checkAdditiveRepair(d, baseline2, evidenceFile, withSite(edit)), re, label)
  const repaired = measureDump(d, tmp('cov-repaired-'), { pageFloor: 1, repair: checkAdditiveRepair(d, baseline2, evidenceFile, withSite((e) => e)) })
  assert.deepEqual(repaired.siteName, { value: 'Coverage Global', from: 'site-config.json sitename' })
  assert.equal(repaired.spec.valid, true)
})

test('adapter coverage: JA Vega dump — read-only ingest, coverage reconciled with the raw tables, counts written for the handoff', { skip: VEGA ? false : 'set P2_COVERAGE_SOURCE=<j6 dir> to measure a real dump' }, () => {
  // The global com_content options come through the adapter's own resolution (an override file,
  // the dump's content-params.json, the extensions table of its inventory); P2_COVERAGE_CONTENT_PARAMS
  // is an explicit override only. A content-params.json added to the dump after it was taken is
  // checked against the manifest from before (P2_COVERAGE_SOURCE_BASELINE) and the export's record
  // (P2_COVERAGE_PARAMS_EVIDENCE); without them it is measured as the dump's own file.
  // A site-config.json added the same way is checked against the configuration export's record:
  // P2_COVERAGE_SITE_CONFIG_EVIDENCE, else p2-ja-vega-site-config-export.json beside the params record.
  const baseline = process.env.P2_COVERAGE_SOURCE_BASELINE || null
  const evidence = process.env.P2_COVERAGE_PARAMS_EVIDENCE || null
  assert.equal(Boolean(baseline), Boolean(evidence), 'P2_COVERAGE_SOURCE_BASELINE and P2_COVERAGE_PARAMS_EVIDENCE go together')
  const besideParams = evidence ? join(dirname(evidence), 'p2-ja-vega-site-config-export.json') : null
  const siteEvidence = process.env.P2_COVERAGE_SITE_CONFIG_EVIDENCE || (besideParams && existsSync(besideParams) ? besideParams : null)
  const repair = baseline ? checkAdditiveRepair(VEGA, baseline, evidence, siteEvidence) : null
  measureDump(VEGA, ARTIFACTS ? join(ARTIFACTS, 'p2-ja-vega') : tmp('cov-vega-'), { paramsOverride: process.env.P2_COVERAGE_CONTENT_PARAMS || null, repair })
  if (repair) assert.deepEqual(checkAdditiveRepair(VEGA, baseline, evidence, siteEvidence), repair, 'the measurement changed nothing the repair check covers')
})

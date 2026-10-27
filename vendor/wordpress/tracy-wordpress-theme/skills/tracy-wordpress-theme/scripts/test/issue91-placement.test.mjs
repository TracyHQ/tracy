// Issue #91 (placement) — a module assigned to a menu item is placed on a route only where the source draws its
// position on THAT route (its layout, blocks, sub-layout, mega menu, overrides, {loadposition}); where the route's
// layout was read in full and does not draw it, the module is recorded as orphaned, not turned into content; where the
// layout was read only partly, it stays unknown. Fixture: the issue67 T3 capture.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const T3 = join(here, 'fixtures', 'issue67', 't3')
const SCRATCH = process.env.TRACY_TEST_SCRATCH || tmpdir()
const tmps = []
const tmp = (prefix) => {
  mkdirSync(SCRATCH, { recursive: true })
  const d = mkdtempSync(join(SCRATCH, prefix))
  tmps.push(d)
  return d
}
test.after(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true })
})
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const TPL = (dir) => join(dir, 'capture', 'templates', 'ja_t3')

const build = (edit) => {
  const dir = tmp('i91-t3-')
  cpSync(T3, dir, { recursive: true })
  const inv = readJson(join(dir, 'inventory.json'))
  const routes = readJson(join(dir, 'render-routes.json'))
  edit(inv, routes, dir)
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(routes))
  const out = join(tmp('i91-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  const coverage = readJson(join(out, 'adapter-coverage.json'))
  const content = readJson(join(out, 'content.json'))
  const pm = readJson(join(out, 'page-map.json'))
  return {
    notes: result.notes,
    pm,
    content,
    sections: readJson(join(out, 'sections.json')),
    coverage,
    row: (id) => (coverage.items ?? coverage.entities).find((i) => i.id === id),
    page: (path) => content.pages.find((p) => p.joomlaPath === path),
    pmPage: (path) => pm.pages.find((p) => p.source?.joomlaPath === path)
  }
}
const custom = (inv, id, position) => ({ ...inv.modules.find((m) => m.id === '21'), id, title: `Module ${id}`, position, content: `<p>Words ${id}</p>` })
const article = (inv, id, catid) => ({ ...inv.content.find((a) => a.id === '20'), id, title: `Article ${id}`, alias: `article-${id}`, catid, introtext: `<p>Body ${id}.</p>` })
const menu = (inv, id, alias, articleId, style) => ({ ...inv.menu.find((m) => m.id === '202'), id, alias, path: alias, title: alias, template_style_id: style, link: `index.php?option=com_content&view=article&id=${articleId}` })
const style = (inv, id, layout) => inv.template_styles.push({ ...inv.template_styles.find((t) => t.id === '9'), id, home: '0', title: layout, params: JSON.stringify({ t3_template: '1', mainlayout: layout, skip_component_content: [] }) })

/** A T4 layout `name` of the rows given as position lists, with the component after the first row; read in full. */
const t4Layout = (dir, name, rows) =>
  writeFileSync(
    join(TPL(dir), 'etc', 'layout', `${name}.json`),
    JSON.stringify({ layout: { sections: [{ name: 'top', contents: [{ type: 'positions', positions: rows[0] }, { type: 'component' }] }, ...rows.slice(1).map((r) => ({ name: r, contents: [{ type: 'positions', positions: r }] }))] } })
  )
/** A layout whose outer block is not captured: what it draws beyond `hero` is unknown. */
const partLayout = (dir, name) => {
  writeFileSync(join(TPL(dir), 'etc', 'layout', `${name}.ini`), '[hero]\nposition="hero"\n')
  writeFileSync(join(TPL(dir), 'tpls', `${name}.php`), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('ghost') ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody') ?>\n")
}
/** Route /landing: its layout draws `hero` and the component, no sidebar. */
const withLanding = (inv, routes, dir) => {
  t4Layout(dir, 'landing', ['hero'])
  style(inv, '11', 'landing')
  inv.content.push(article(inv, '40', '14'))
  inv.menu.push(menu(inv, '601', 'landing', '40', '11'))
  routes.push({ id: '601', path: '/landing' })
}

test('a sidebar-position module on a route whose layout prints no sidebar is not in aside; it is orphaned once, with its position', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    t4Layout(dir, 'sided', ['hero', 'sidebar-r'])
    style(inv, '13', 'sided')
    inv.content.push(article(inv, '43', '14'))
    inv.menu.push(menu(inv, '603', 'sided', '43', '13'))
    routes.push({ id: '603', path: '/sided' })
    inv.modules.push(custom(inv, '61', 'sidebar-r'))
    inv.modules_menu.push({ moduleid: '61', menuid: '601' }, { moduleid: '61', menuid: '603' })
  })
  assert.deepEqual(b.page('/landing').aside, [])
  assert.deepEqual(b.page('/landing').orphaned.filter((o) => o.module === '61'), [{ position: 'sidebar-r', module: '61' }])
  assert.match(b.page('/landing').notes.join('\n'), /does not draw \(not rendered on the Joomla site\): [^\n]*sidebar-r#61/)
  assert.ok(b.row('module:61').impact.undrawn.includes('/landing'), 'coverage reaches the same answer on the same route')
  assert.ok(!b.row('module:61').impact.placed.includes('/landing'))
  assert.deepEqual(b.page('/sided').aside, ['61'], 'the route whose layout draws the sidebar keeps it')
  assert.ok(b.row('module:61').impact.placed.includes('/sided'))
  // The fixture's default layout is read only partly, so module 24 on the skipped route is unknown (see below for the layout read in full).
  assert.ok(b.row('module:24').impact.unknown.includes('/skipped'))
})

test('a module at a position no layout draws is no menu-assignment slot, whether assigned to the page or to all pages', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    inv.modules.push(custom(inv, '62', 'contact-positive'), custom(inv, '63', 'follow-us'))
    inv.modules_menu.push({ moduleid: '62', menuid: '601' }, { moduleid: '62', menuid: '202' }, { moduleid: '63', menuid: '0' })
  })
  assert.ok(!b.pmPage('/landing').sections.some((s) => s.via === 'menu-assignment'), 'no slot for a position nothing draws')
  assert.ok(!JSON.stringify(b.page('/landing').content).includes('contact-positive'), 'not in the content')
  assert.ok(b.page('/landing').orphaned.some((o) => o.module === '62' && o.position === 'contact-positive'))
  assert.ok(b.page('/landing').orphaned.some((o) => o.module === '63' && o.position === 'follow-us'), 'an all-pages module is reported too')
  assert.deepEqual(b.page('/landing').orphaned.filter((o) => o.module === '62').length, 1, 'once per module and route')
  assert.ok(!b.row('module:62').impact.placed.includes('/landing'))
  assert.ok(b.row('module:62').impact.undrawn.includes('/landing'))
  assert.ok(!(b.sections.custom.find((m) => m.id === '63').pages ?? []).includes('ALL'), 'the module is not advertised as placed on all pages')
})

test('a position another layout draws stays orphaned; the same module is placed on the route whose layout draws it', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    inv.modules.push(custom(inv, '64', 'masthead'))
    inv.modules_menu.push({ moduleid: '64', menuid: '601' }, { moduleid: '64', menuid: '202' })
  })
  assert.ok(b.page('/landing').orphaned.some((o) => o.module === '64'))
  assert.ok(!b.pmPage('/landing').sections.some((s) => s.modules.includes('64')))
  assert.ok(b.pmPage('/plain').sections.some((s) => s.position === 'masthead' && s.via === 'layout' && s.modules.includes('64')))
  assert.ok(!(b.page('/plain').orphaned ?? []).some((o) => o.module === '64'))
})

test('a position the route\'s layout does draw is still placed in its slot', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    inv.modules.push(custom(inv, '65', 'hero'))
    inv.modules_menu.push({ moduleid: '65', menuid: '601' })
  })
  assert.ok(b.pmPage('/landing').sections.some((s) => s.position === 'hero' && s.modules.includes('65')))
  assert.ok(!(b.page('/landing').orphaned ?? []).some((o) => o.module === '65'))
  assert.ok(b.row('module:65').impact.placed.includes('/landing'))
})

test('a layout read only partly leaves the position unknown: the module is placed and the gap is named, never orphaned', () => {
  const b = build((inv, routes, dir) => {
    partLayout(dir, 'partial')
    style(inv, '12', 'partial')
    inv.content.push(article(inv, '41', '14'))
    inv.menu.push(menu(inv, '602', 'partial', '41', '12'))
    routes.push({ id: '602', path: '/partial' })
    inv.modules.push(custom(inv, '66', 'mystery'))
    inv.modules_menu.push({ moduleid: '66', menuid: '602' })
  })
  assert.ok(b.pmPage('/partial').sections.some((s) => s.via === 'menu-assignment' && s.modules.includes('66')))
  assert.ok(!(b.page('/partial').orphaned ?? []).some((o) => o.module === '66'))
  assert.match(b.page('/partial').notes.join('\n'), /read only partly[^\n]*mystery#66/)
  assert.ok(b.row('module:66').impact.unknown.includes('/partial'))
  assert.ok(!(b.row('module:66').impact.undrawn ?? []).includes('/partial'))
})

test('a module the article loads by id is not orphaned where its position is undrawn', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    inv.content.find((a) => a.id === '40').introtext = '<p>Body.</p>{loadmoduleid 67}'
    inv.modules.push(custom(inv, '67', 'contact-positive'))
    inv.modules_menu.push({ moduleid: '67', menuid: '601' })
  })
  assert.ok(!(b.page('/landing').orphaned ?? []).some((o) => o.module === '67'))
  assert.ok(b.row('module:67').impact.placed.includes('/landing'), 'the article body draws it')
  assert.ok(!b.row('module:67').impact.undrawn.includes('/landing'), 'coverage does not call a route undrawn where the body draws the module')
})

test('an archive route reports what it leaves out too: the orphan is on the archive entry and in the module row', () => {
  const b = build((inv, routes, dir) => {
    t4Layout(dir, 'landing', ['hero'])
    style(inv, '11', 'landing')
    inv.menu.push({ ...inv.menu.find((m) => m.id === '302'), id: '604', alias: 'listing', path: 'listing', title: 'listing', template_style_id: '11' })
    routes.push({ id: '604', path: '/listing' })
    inv.modules.push(custom(inv, '68', 'contact-positive'))
    inv.modules_menu.push({ moduleid: '68', menuid: '604' })
  })
  const archive = b.content.archives.find((a) => a.joomlaPath === '/listing')
  assert.deepEqual(archive.orphaned.filter((o) => o.module === '68'), [{ position: 'contact-positive', module: '68' }])
  assert.ok(!archive.sections.some((s) => s.modules.includes('68')))
  assert.ok(b.row('module:68').impact.undrawn.includes('/listing'))
  assert.match((b.row('module:68').notes ?? []).join('\n'), /does not draw/)
})

test('an all-pages module at a position the style\'s sub-layout draws is placed; the same module is not placed where the evidence does not show it', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    t4Layout(dir, 'sub', ['aboveart'])
    const st = inv.template_styles.find((t) => t.id === '11')
    st.params = JSON.stringify({ ...JSON.parse(st.params), 'sub-layout': 'sub' })
    inv.modules.push(custom(inv, '69', 'aboveart'))
    inv.modules_menu.push({ moduleid: '69', menuid: '0' })
  })
  assert.ok(b.pmPage('/landing').sections.some((s) => s.position === 'aboveart' && s.modules.includes('69')))
  assert.ok(b.row('module:69').impact.placed.includes('/landing'))
  assert.ok(!b.row('module:69').impact.placed.includes('/plain'))
})

test('a module the mega menu draws by id does not bring along another module at its position; an undrawn non-custom module is not advertised', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    mkdirSync(join(TPL(dir), 'html', 'layouts', 't4', 'block'), { recursive: true })
    mkdirSync(join(TPL(dir), 'etc', 'navigation'), { recursive: true })
    writeFileSync(join(TPL(dir), 'html', 'layouts', 't4', 'block', 'nav.html'), '<header><jdoc:include type="element" name="megamenu" /></header>')
    writeFileSync(join(TPL(dir), 'etc', 'navigation', 'default.json'), JSON.stringify({ mega_settings: { rows: [{ type: 'module', module_id: '70' }] } }))
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.json'), JSON.stringify({ layout: { sections: [{ name: 'h', contents: [{ type: 'block', name: 'nav', block: 'nav' }] }, { name: 'r', contents: [{ type: 'positions', positions: 'hero' }, { type: 'component' }] }] } }))
    inv.modules.push(custom(inv, '70', 'shared-pos'), { ...custom(inv, '71', 'shared-pos'), module: 'mod_articles_latest', params: '{}' })
    inv.modules_menu.push({ moduleid: '70', menuid: '601' }, { moduleid: '71', menuid: '601' })
  })
  const slots = b.pmPage('/landing').sections.filter((s) => s.position === 'shared-pos')
  assert.ok(!slots.some((s) => s.modules.includes('71')), 'the sibling at the position is not drawn')
  assert.ok(b.page('/landing').orphaned.some((o) => o.module === '71' && o.position === 'shared-pos'))
  assert.ok(!(b.sections.other.find((m) => m.id === '71').pages ?? []).some((p) => p.menuId === '601'), 'not advertised on the route it was left out of')
})

test('a module the article loads by id does not hide a sibling at the same undrawn position: the sibling is orphaned once', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    inv.content.find((a) => a.id === '40').introtext = '<p>Body.</p>{loadmoduleid 72}'
    inv.modules.push(custom(inv, '72', 'contact-positive'), custom(inv, '73', 'contact-positive'))
    inv.modules_menu.push({ moduleid: '72', menuid: '601' }, { moduleid: '73', menuid: '601' })
  })
  assert.deepEqual(b.page('/landing').orphaned.filter((o) => o.position === 'contact-positive').map((o) => o.module), ['73'])
  assert.ok(b.row('module:73').impact.undrawn.includes('/landing'))
  assert.ok(!b.row('module:72').impact.undrawn.includes('/landing'))
})

test('an all-pages sidebar module that a captured block draws is placed in aside', () => {
  const b = build((inv, routes, dir) => {
    withLanding(inv, routes, dir)
    mkdirSync(join(TPL(dir), 'html', 'layouts', 't4', 'block'), { recursive: true })
    writeFileSync(join(TPL(dir), 'html', 'layouts', 't4', 'block', 'side.html'), '<aside><jdoc:include type="modules" name="sidebar-r" /></aside>')
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.json'), JSON.stringify({ layout: { sections: [{ name: 'r', contents: [{ type: 'positions', positions: 'hero' }, { type: 'component' }, { type: 'block', name: 'side', block: 'side' }] }] } }))
    inv.modules.push(custom(inv, '74', 'sidebar-r'))
    inv.modules_menu.push({ moduleid: '74', menuid: '0' })
  })
  assert.deepEqual(b.page('/landing').aside, ['74'])
})

test('a partly read layout leaves a sidebar unknown on a skipped route: it is placed and the gap is named', () => {
  const b = build((inv, routes, dir) => {
    inv.modules.push(custom(inv, '75', 'sidebar-r'))
    inv.modules_menu.push({ moduleid: '75', menuid: '201' })
  })
  assert.ok(b.page('/skipped').aside.includes('75'))
  assert.match(b.page('/skipped').notes.join('\n'), /not known[^\n]*sidebar-r#75/)
  assert.ok(!(b.page('/skipped').orphaned ?? []).some((o) => o.module === '75'))
})

test('a sidebar the mainbody names is orphaned on a skipped route when the whole layout was read; unknown when it was read only partly', () => {
  const full = build((inv, routes, dir) => {
    writeFileSync(join(TPL(dir), 'tpls', 'default.php'), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody') ?>\n")
  })
  assert.deepEqual(full.page('/skipped').aside, [])
  assert.ok(full.page('/skipped').orphaned.some((o) => o.module === '24' && o.position === 'sidebar-1'))
  assert.ok(full.row('module:24').impact.undrawn.includes('/skipped'))
  const partial = build((inv, routes, dir) => {
    writeFileSync(join(TPL(dir), 'tpls', 'default.php'), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('ghost') ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody') ?>\n")
  })
  assert.deepEqual(partial.page('/skipped').aside, ['24'])
  assert.ok(!(partial.page('/skipped').orphaned ?? []).some((o) => o.module === '24'))
  assert.match(partial.page('/skipped').notes.join('\n'), /not known[^\n]*sidebar-1#24/)
  assert.ok(partial.row('module:24').impact.unknown.includes('/skipped'))
  assert.ok(!(partial.row('module:24').impact.undrawn ?? []).includes('/skipped'))
})

// Issue #81 — adapter coverage carries body visibility per (menu item, route): a layout with no component
// row draws no body, two menu items may share a pathname while one draws the body and the other does not,
// and a post's {loadmoduleid} conversion certifies nothing about a route. Fixture: the issue67 T3 capture.
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

/** The T3 fixture with `edit(inv, routes, dir)` applied, built; returns the pack's page-map, content and coverage. */
const build = (edit) => {
  const dir = tmp('i81-t3-')
  cpSync(T3, dir, { recursive: true })
  const inv = readJson(join(dir, 'inventory.json'))
  const routes = readJson(join(dir, 'render-routes.json'))
  edit(inv, routes, dir)
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(routes))
  const out = join(tmp('i81-out-'), 'pack')
  const result = buildSpecPack({ j6Dir: dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  const coverage = readJson(join(out, 'adapter-coverage.json'))
  return { notes: result.notes, pm: readJson(join(out, 'page-map.json')), content: readJson(join(out, 'content.json')), coverage, row: (id) => (coverage.items ?? coverage.entities).find((i) => i.id === id) }
}
const article = (inv, id, catid, introtext) => ({ ...inv.content.find((a) => a.id === '20'), id, title: `Article ${id}`, alias: `article-${id}`, catid, introtext })
const menu = (inv, id, alias, articleId, style = '0') => ({ ...inv.menu.find((m) => m.id === '202'), id, alias, path: alias, title: alias, template_style_id: style, link: `index.php?option=com_content&view=article&id=${articleId}` })
const custom = (inv, id, position, content = `<p>Words ${id}</p>`) => ({ ...inv.modules.find((m) => m.id === '21'), id, title: `Module ${id}`, position, content })
const skipList = (inv, ids) => {
  const st = inv.template_styles.find((t) => t.id === '9')
  st.params = JSON.stringify({ ...JSON.parse(st.params), skip_component_content: [...JSON.parse(st.params).skip_component_content, ...ids] })
}

test('a layout with no component row: its body loads and {loadposition} are drawn nowhere, independently drawn modules stay', () => {
  const { pm, row } = build((inv, routes, dir) => {
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\n\n[footer-1]\nposition="footer-1"\n')
    writeFileSync(join(TPL(dir), 'tpls', 'landing.php'), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('footer') ?>\n")
    inv.template_styles.push({ ...inv.template_styles.find((t) => t.id === '9'), id: '11', home: '0', title: 'landing', params: JSON.stringify({ t3_template: '1', mainlayout: 'landing', skip_component_content: [] }) })
    inv.content.push(article(inv, '40', '14', '<p>Landing body.</p>{loadposition bodyonly}{loadmoduleid 42}'))
    inv.menu.push(menu(inv, '601', 'landing', '40', '11'))
    inv.modules.push(custom(inv, '41', 'bodyonly'), custom(inv, '42', ''))
    inv.modules_menu.push({ moduleid: '41', menuid: '0' })
    routes.push({ id: '601', path: '/landing' })
  })
  const p = pm.pages.find((x) => x.source?.joomlaPath === '/landing')
  assert.ok(p, 'the landing route is a page')
  assert.equal(p.sections.some((s) => s.via === 'loadposition' || s.via === 'loadmoduleid'), false, 'no slot from a body nobody prints')
  assert.ok(!row('module:41').impact.routes.includes('/landing'), 'body-only {loadposition}')
  assert.deepEqual(row('module:41').impact.placed, [], 'and never placed')
  assert.deepEqual(row('module:42').impact.loadedBy ?? [], [], 'nothing that draws a body loads it')
  assert.equal(row('module:42').status, 'skipped-by-rule')
  assert.ok(row('module:21').impact.routes.includes('/landing'), 'the hero band is drawn outside the body')
})

for (const order of ['visible-first', 'skipped-first']) {
  test(`two menu items on one pathname keep their own visibility (${order}): the visible one loads and places, the skipped one claims nothing`, () => {
    const { row } = build((inv, routes) => {
      inv.content.push(article(inv, '43', '14', '<p>Shared.</p>{loadposition bodyonly}{loadmoduleid 44}'))
      inv.content.push(article(inv, '50', '14', '<p>Only skipped.</p>{loadmoduleid 51}'))
      const visible = menu(inv, '702', 'shared-b', '43')
      const skipped = menu(inv, '701', 'shared-a', '43')
      inv.menu.push(...(order === 'visible-first' ? [visible, skipped] : [skipped, visible]))
      inv.menu.push(menu(inv, '703', 'only-skipped-a', '50'), menu(inv, '704', 'only-skipped-b', '50'))
      skipList(inv, ['701', '703', '704'])
      inv.modules.push(custom(inv, '44', ''), custom(inv, '45', 'bodyonly'), custom(inv, '51', ''))
      inv.modules_menu.push({ moduleid: '45', menuid: '0' })
      const r = [{ id: '702', path: '/shared' }, { id: '701', path: '/shared' }, { id: '703', path: '/only-skipped' }, { id: '704', path: '/only-skipped' }]
      routes.push(...(order === 'visible-first' ? r : [r[1], r[0], r[2], r[3]]))
    })
    assert.deepEqual(row('module:44').impact.loadedBy, ['article:43'], 'the visible route keeps the loader')
    assert.ok(row('module:44').impact.unknown.includes('/shared'))
    assert.ok(row('module:45').impact.routes.includes('/shared'), 'the body {loadposition} is drawn on the visible route')
    assert.deepEqual(row('module:45').impact.missing, [], 'and placed there')
    assert.deepEqual(row('module:51').impact.loadedBy ?? [], [], 'every route of the article skips the body')
    assert.ok(!(row('module:51').impact.unknown ?? []).includes('/only-skipped'))
  })
}

test('a post loading a module: its drawn routes decide loadedBy, and the resolution names that route', () => {
  const { row, coverage } = build((inv, routes) => {
    inv.content.push(article(inv, '46', '15', '<p>Post.</p>{loadmoduleid 47}'))
    inv.content.push(article(inv, '48', '15', '<p>Unrouted post.</p>{loadmoduleid 49}'))
    inv.menu.push(menu(inv, '705', 'a-post', '46'))
    inv.modules.push(custom(inv, '47', ''), custom(inv, '49', ''))
    routes.push({ id: '705', path: '/a-post' })
  })
  assert.deepEqual(row('module:47').impact.loadedBy, ['article:46'])
  assert.ok(row('module:47').impact.routes.concat(row('module:47').impact.unknown).includes('/a-post'))
  assert.match(row('article:46').detail.remarks.join(' '), /\{loadmoduleid 47\} resolved on \/a-post:/)
  assert.deepEqual(row('module:49').impact.loadedBy ?? [], [], 'an unrouted post invents no loader')
  assert.ok(coverage)
})

test('control: a layout that is not captured stays uncertain, not invisible — the body is still taken as drawn and the loader kept', () => {
  const { row } = build((inv, routes) => {
    inv.template_styles.push({ ...inv.template_styles.find((t) => t.id === '9'), id: '12', home: '0', title: 'nolayout', params: JSON.stringify({ t3_template: '1', mainlayout: 'not-captured', skip_component_content: [] }) })
    inv.content.push(article(inv, '52', '14', '<p>Body.</p>{loadmoduleid 53}{loadmoduleid 53}'))
    inv.menu.push(menu(inv, '706', 'unknown-layout', '52', '12'))
    inv.modules.push(custom(inv, '53', ''))
    routes.push({ id: '706', path: '/unknown-layout' })
  })
  assert.deepEqual(row('module:53').impact.loadedBy, ['article:52'], 'a repeated marker is one loader')
})

// A layout captured only in part proves nothing about the body or its positions: each form below must keep the body drawn,
// keep loaders and body positions, leave positions it does not see unknown (never undrawn, never orphaned), and say why — in the
// limitations, the layout row and the page notes together. The second item of each entry is the cause the limitation names.
const T3_LANDING_PHP = "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody') ?>\n"
const t3Main = (mainbody, php = T3_LANDING_PHP) => (dir) => {
  writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\n')
  writeFileSync(join(TPL(dir), 'tpls', 'landing.php'), php)
  writeFileSync(join(TPL(dir), 'tpls', 'blocks', 'mainbody.php'), mainbody)
}
const t4Layout = (sections, blocks = {}) => (dir) => {
  mkdirSync(join(TPL(dir), 'html', 'layouts', 't4', 'block'), { recursive: true })
  for (const [n, text] of Object.entries(blocks)) writeFileSync(join(TPL(dir), 'html', 'layouts', 't4', 'block', `${n}.html`), text)
  writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.json'), typeof sections === 'string' ? sections : JSON.stringify(sections))
}
const t4Cells = (...contents) => ({ layout: { sections: [{ name: 'row', contents }] } })
const INCOMPLETE = {
  't3-template-php-missing': [(dir) => {
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\n')
    rmSync(join(TPL(dir), 'tpls', 'default.php'))
  }, /not captured/, { elsewhere: false }],
  't3-computed-block': [(dir) => {
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\n')
    writeFileSync(join(TPL(dir), 'tpls', 'landing.php'), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock($name) ?>\n<?php $this->loadBlock('hero') ?>\n")
  }, /not a literal block name/],
  't3-unread-outer-block': [t3Main('<div class="plain"></div>', "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('ghost') ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody') ?>\n"), /ghost\.php is not captured/],
  't3-loadblock-without-terminator': [t3Main('<div class="plain"></div>', "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody')"), /loadBlock call the reader cannot parse/],
  't3-dynamic-php-include': [t3Main("<?php defined('_JEXEC') or die; ?>\n<div class=\"plain\"></div>\n<?php include $this->templatePath . '/body.php'; ?>\n"), /does not follow \(include\)/],
  't3-require-once-in-mainbody': [t3Main("<?php require_once __DIR__ . '/body.php'; ?>\n<div></div>\n"), /does not follow \(require_once\)/],
  't3-layout-helper-render': [t3Main("<?php echo JLayoutHelper::render('joomla.body', []); ?>\n"), /JLayoutHelper/],
  't3-heredoc-mainbody': [t3Main("<?php $x = <<<EOT\n<jdoc:include type=\"component\" />\nEOT;\n?>\n<div></div>\n"), /heredoc/],
  't3-malformed-component-tag': [t3Main('<div class="plain"></div>\n<jdoc:include type="component"\n'), /cannot parse \(the tag is not closed\)/],
  't3-computed-component-type': [t3Main('<jdoc:include type="<?php echo $t ?>" />\n'), /computes its type/],
  't3-component-tag-in-php-string': [t3Main("<?php echo '<jdoc:include type=\"component\" />'; ?>\n"), /inside a PHP string/],
  't3-unknown-jdoc-include-tag': [t3Main('<jdoc:include-extra type="component" />\n'), /jdoc:include-extra/],
  't4-null-root': [t4Layout('null'), /root is null/],
  't4-array-root': [t4Layout('[]'), /root is a list/],
  't4-scalar-root': [t4Layout('5'), /root is number/],
  't4-string-root': [t4Layout('"rows"'), /root is string/],
  't4-layout-not-an-object': [t4Layout({ layout: [] }), /"layout" is missing or not an object/],
  't4-sections-malformed': [t4Layout({ layout: { sections: 'rows' } }), /"layout.sections" is missing or not a list/],
  't4-sections-empty': [t4Layout({ layout: { sections: [] } }), /"layout.sections" is empty/],
  't4-row-without-contents': [t4Layout({ layout: { sections: [{ name: 'row', contents: 'x' }] } }), /not an object with a contents list/],
  't4-row-null': [t4Layout({ layout: { sections: [null] } }), /section 0 is not an object/],
  't4-cell-null': [t4Layout(t4Cells(null, { type: 'positions', positions: 'hero' })), /cell 0 is not an object/],
  't4-positions-empty': [t4Layout(t4Cells({ type: 'positions', positions: '' })), /without a readable list of position names/],
  't4-positions-missing': [t4Layout(t4Cells({ type: 'positions' })), /without a readable list of position names/],
  't4-positions-array': [t4Layout(t4Cells({ type: 'positions', positions: ['hero'] })), /without a readable list of position names/],
  't4-positions-bad-name': [t4Layout(t4Cells({ type: 'positions', positions: 'hero, bad<name' })), /without a readable list of position names/],
  't4-block-without-name': [t4Layout(t4Cells({ type: 'block' })), /without a plain block name/],
  't4-block-not-captured': [t4Layout(t4Cells({ type: 'block', name: 'ghost' })), /ghost\.html is not captured/],
  't4-block-draws-component': [t4Layout(t4Cells({ type: 'block', name: 'body', block: 'body' }), { body: '<main><jdoc:include type="component" /></main>' }), /includes the component/],
  't4-block-unparsed-include': [t4Layout(t4Cells({ type: 'block', name: 'body', block: 'body' }), { body: '<main><jdoc:include name="x" /></main>' }), /without a literal type/],
  't4-block-unclosed-include': [t4Layout(t4Cells({ type: 'block', name: 'body', block: 'body' }), { body: '<main><jdoc:include type="element" name="x"' }), /cannot parse \(the tag is not closed\)/],
  't4-block-php': [t4Layout(t4Cells({ type: 'block', name: 'body', block: 'body' }), { body: '<?php echo $x; ?><main></main>' }), /PHP in the block markup/],
  't4-block-other-include-tag': [t4Layout(t4Cells({ type: 'block', name: 'body', block: 'body' }), { body: '<jdoc:include-more type="component" />' }), /jdoc:include-more/],
  't4-unsupported-cell': [t4Layout(t4Cells({ type: 'positions', positions: 'hero' }, { type: 'block', name: 'custom-body' })), /not captured/],
  't4-unknown-cell-type': [t4Layout(t4Cells({ type: 'positions', positions: 'hero' }, { type: 'widget' })), /unsupported type "widget"/]
}
const wide = (inv, routes) => {
  inv.template_styles.push({ ...inv.template_styles.find((t) => t.id === '9'), id: '11', home: '0', title: 'landing', params: JSON.stringify({ t3_template: '1', mainlayout: 'landing', skip_component_content: [] }) })
  inv.content.push(article(inv, '40', '14', '<p>Landing body.</p>{loadposition bodyonly}{loadmoduleid 42}'))
  inv.menu.push(menu(inv, '601', 'landing', '40', '11'))
  // 41: a body {loadposition}; 42: a body {loadmoduleid}; 43: a position no layout draws; 44: a position the default layout draws (masthead), which landing does not name.
  inv.modules.push(custom(inv, '41', 'bodyonly'), custom(inv, '42', ''), custom(inv, '43', 'mystery'), custom(inv, '44', 'masthead'))
  inv.modules_menu.push({ moduleid: '41', menuid: '0' }, { moduleid: '43', menuid: '0' }, { moduleid: '44', menuid: '601' })
  routes.push({ id: '601', path: '/landing' })
}
const pageNotes = (b) => (b.content.pages.find((x) => x.joomlaPath === '/landing')?.notes ?? []).join('\n')
const LANDING_LIMITATION = /layout "landing" is captured but not read completely/
const consistent = (b, cause, { elsewhere = true } = {}) => {
  const p = b.pm.pages.find((x) => x.source?.joomlaPath === '/landing')
  assert.ok(p, 'the landing route is a page')
  const notes = pageNotes(b)
  assert.ok(p.sections.some((s) => s.via === 'loadposition'), 'the body {loadposition} stays a slot')
  assert.ok(b.row('module:41').impact.routes.includes('/landing'), 'body {loadposition} is drawn where the body is not proven absent')
  assert.deepEqual(b.row('module:42').impact.loadedBy, ['article:40'], 'the loader is kept')
  assert.notEqual(b.row('module:42').status, 'skipped-by-rule')
  for (const id of ['module:43', 'module:44']) {
    assert.ok((b.row(id).impact.unknown ?? []).includes('/landing'), `${id}: a position the unread part may draw is unknown`)
    assert.ok(!(b.row(id).impact.undrawn ?? []).includes('/landing'), `${id}: not undrawn`)
  }
  assert.doesNotMatch(notes, /does not draw|not rendered|never renders the article body/, 'the page notes claim no absence')
  if (elsewhere) assert.match(notes, /read only partly/, 'and name the unread layout where a module sits at a position another layout draws')
  const lim = b.coverage.inspection.limitations.filter((l) => LANDING_LIMITATION.test(l))
  assert.equal(lim.length, 1, 'the uncertainty is explicit')
  assert.match(lim[0], cause, 'and names its cause')
  const reason = b.row('layout:landing').reason ?? ''
  assert.doesNotMatch(reason, /renders no article body|not placed/, 'the layout row claims neither an absent body nor unplaced positions')
  assert.match(reason, /not known|read only partly/)
  assert.ok(!b.content.pages.find((x) => x.joomlaPath === '/landing').droppedContent, 'nothing is recorded as dropped for a body that may be drawn')
}
for (const [form, [setup, cause, opts]] of Object.entries(INCOMPLETE))
  test(`incomplete layout evidence (${form}): body, loaders, positions, notes, limitations and the layout row agree`, () => {
    consistent(build((inv, routes, dir) => {
      setup(dir)
      wide(inv, routes)
    }), cause, opts)
  })

test('control: words such as include/render in HTML text and in PHP strings are not unsupported PHP: a fully read componentless mainbody stays absent', () => {
  const b = build((inv, routes, dir) => {
    t3Main("<?php defined('_JEXEC') or die; $label = 'include and render'; ?>\n<p>Please include this, then render it. <!-- <jdoc:include type=\"component\" /> --></p>\n")(dir)
    wide(inv, routes)
  })
  assert.equal(b.pm.pages.find((x) => x.source?.joomlaPath === '/landing').sections.some((s) => s.via === 'loadposition'), false)
  assert.ok((b.row('module:44').impact.undrawn ?? []).includes('/landing'))
  assert.ok(!b.coverage.inspection.limitations.some((l) => LANDING_LIMITATION.test(l)))
  assert.match(b.row('layout:landing').reason ?? '', /no component row: the source renders no article body/)
  assert.match(pageNotes(b), /does not draw \(not rendered on the Joomla site\): [^\n]*masthead#44/)
})

test('an INI line the reader cannot parse leaves positions unknown, not the body: the body is proven absent by the fully read mainbody', () => {
  const b = build((inv, routes, dir) => {
    t3Main('<div class="plain"></div>')(dir)
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\nthis is not an ini line\n')
    wide(inv, routes)
  })
  assert.equal(b.pm.pages.find((x) => x.source?.joomlaPath === '/landing').sections.some((s) => s.via === 'loadposition'), false)
  for (const id of ['module:43', 'module:44']) {
    assert.ok((b.row(id).impact.unknown ?? []).includes('/landing'))
    assert.ok(!(b.row(id).impact.undrawn ?? []).includes('/landing'))
  }
  const lim = b.coverage.inspection.limitations.filter((l) => LANDING_LIMITATION.test(l))
  assert.equal(lim.length, 1)
  assert.match(lim[0], /not a \[section\] or key/)
  assert.doesNotMatch(lim[0], /whether its page draws the article body is not known/, 'the body is not in doubt')
  assert.match(b.row('layout:landing').reason ?? '', /no article body/)
  assert.doesNotMatch(b.row('layout:landing').reason ?? '', /not placed/)
})

test('a body include written under a condition is read but not certain: kept, loader kept, the limitation names the condition', () => {
  const b = build((inv, routes, dir) => {
    t3Main('<?php if ($x) : ?><jdoc:include type="component" /><?php endif; ?>\n')(dir)
    wide(inv, routes)
  })
  const lim = b.coverage.inspection.limitations.filter((l) => LANDING_LIMITATION.test(l))
  assert.equal(lim.length, 1)
  assert.match(lim[0], /under a condition the reader does not evaluate/)
  assert.deepEqual(b.row('module:42').impact.loadedBy, ['article:40'])
  assert.ok(b.row('module:41').impact.routes.includes('/landing'))
  assert.ok((b.row('module:43').impact.undrawn ?? []).includes('/landing'), 'positions were read in full')
})

test('a return guard the reader does not support keeps the body, and says the guard is unsupported', () => {
  const b = build((inv, routes, dir) => {
    t3Main('<?php if ($this->foo()) return; ?>\n<jdoc:include type="component" />\n')(dir)
    wide(inv, routes)
  })
  const lim = b.coverage.inspection.limitations.filter((l) => LANDING_LIMITATION.test(l))
  assert.equal(lim.length, 1)
  assert.match(lim[0], /return guard the reader does not support/)
  assert.deepEqual(b.row('module:42').impact.loadedBy, ['article:40'])
})

test('positions in another layout: orphaned only where this layout was read in full; unknown where it was read partly', () => {
  const full = build((inv, routes, dir) => {
    t3Main('<div class="plain"></div>')(dir)
    wide(inv, routes)
  })
  const fullNotes = pageNotes(full)
  assert.match(fullNotes, /does not draw \(not rendered on the Joomla site\): [^\n]*masthead#44/)
  assert.ok((full.row('module:44').impact.undrawn ?? []).includes('/landing'))
  const partial = build((inv, routes, dir) => {
    t3Main('<div class="plain"></div>', "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('ghost') ?>\n<?php $this->loadBlock('mainbody') ?>\n")(dir)
    wide(inv, routes)
  })
  const partialNotes = pageNotes(partial)
  assert.doesNotMatch(partialNotes, /not rendered/)
  assert.match(partialNotes, /masthead#44/)
  assert.ok((partial.row('module:44').impact.unknown ?? []).includes('/landing'))
})

test('control: a T4 layout read completely (positions and a captured block with no component include) proves the body absent', () => {
  const { row, coverage } = build((inv, routes, dir) => {
    mkdirSync(join(TPL(dir), 'html', 'layouts', 't4', 'block'), { recursive: true })
    writeFileSync(join(TPL(dir), 'html', 'layouts', 't4', 'block', 'nav.html'), '<header><jdoc:include type="element" name="logo" /></header>')
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.json'), JSON.stringify({ layout: { sections: [{ name: 'h', contents: [{ type: 'block', name: 'nav', block: 'nav' }] }, { name: 'r', contents: [{ type: 'positions', positions: 'hero' }] }] } }))
    inv.template_styles.push({ ...inv.template_styles.find((t) => t.id === '9'), id: '11', home: '0', title: 'landing', params: JSON.stringify({ t3_template: '1', mainlayout: 'landing', skip_component_content: [] }) })
    inv.content.push(article(inv, '40', '14', '<p>Landing body.</p>{loadmoduleid 42}'))
    inv.menu.push(menu(inv, '601', 'landing', '40', '11'))
    inv.modules.push(custom(inv, '42', ''))
    routes.push({ id: '601', path: '/landing' })
  })
  assert.deepEqual(row('module:42').impact.loadedBy ?? [], [])
  assert.ok(!coverage.inspection.limitations.some((l) => LANDING_LIMITATION.test(l)))
})

const landing = (inv, routes) => {
  inv.template_styles.push({ ...inv.template_styles.find((t) => t.id === '9'), id: '11', home: '0', title: 'landing', params: JSON.stringify({ t3_template: '1', mainlayout: 'landing', skip_component_content: [] }) })
  inv.content.push(article(inv, '40', '14', '<p>Landing body.</p>{loadposition bodyonly}{loadmoduleid 42}'))
  inv.menu.push(menu(inv, '601', 'landing', '40', '11'))
  inv.modules.push(custom(inv, '41', 'bodyonly'), custom(inv, '42', ''), custom(inv, '43', 'mystery'))
  inv.modules_menu.push({ moduleid: '41', menuid: '0' }, { moduleid: '43', menuid: '0' })
  routes.push({ id: '601', path: '/landing' })
}

test('a T3 layout whose mainbody is read completely and draws no component: the body is absent, no uncertainty, positions are known', () => {
  const { pm, row, coverage } = build((inv, routes, dir) => {
    writeFileSync(join(TPL(dir), 'tpls', 'blocks', 'mainbody.php'), "<?php defined('_JEXEC') or die; ?>\n<div class=\"plain\"></div>\n")
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\n')
    writeFileSync(join(TPL(dir), 'tpls', 'landing.php'), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('mainbody') ?>\n")
    landing(inv, routes)
  })
  const p = pm.pages.find((x) => x.source?.joomlaPath === '/landing')
  assert.ok(p)
  assert.equal(p.sections.some((s) => s.via === 'loadposition' || s.via === 'loadmoduleid'), false, 'no body, no body-derived slot')
  assert.ok(!row('module:41').impact.routes.includes('/landing'))
  assert.deepEqual(row('module:42').impact.loadedBy ?? [], [])
  assert.ok(row('module:43').impact.undrawn.includes('/landing'), 'a position the fully read layout does not draw is undrawn, not unknown')
  assert.ok(!(row('module:43').impact.unknown ?? []).includes('/landing'))
  assert.ok(!coverage.inspection.limitations.some((l) => LANDING_LIMITATION.test(l)), 'a layout whose body is proven absent is not uncertain')
  assert.match(row('layout:landing').reason ?? '', /no component row: the source renders no article body/)
})

test('a T3 layout read only partly: a module at a position it is not seen to draw is unknown, not undrawn, and the layout row does not claim an absent body', () => {
  const { row } = build((inv, routes, dir) => {
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.ini'), '[hero]\nposition="hero"\n')
    writeFileSync(join(TPL(dir), 'tpls', 'landing.php'), "<?php defined('_JEXEC') or die; ?>\n<?php $this->loadBlock($name) ?>\n<?php $this->loadBlock('hero') ?>\n")
    landing(inv, routes)
  })
  assert.ok((row('module:43').impact.unknown ?? []).includes('/landing'))
  assert.ok(!row('module:43').impact.undrawn.includes('/landing'))
  assert.doesNotMatch(row('layout:landing').reason ?? '', /renders no article body/)
})

test('a T4 layout read only partly: a position it is not seen to draw is unknown, and the layout row says the body is not known', () => {
  const { row } = build((inv, routes, dir) => {
    writeFileSync(join(TPL(dir), 'etc', 'layout', 'landing.json'), JSON.stringify({ layout: { sections: [{ name: 'row', contents: [{ type: 'positions', positions: 'hero' }, { type: 'block', name: 'custom-body' }] }] } }))
    landing(inv, routes)
  })
  assert.ok((row('module:43').impact.unknown ?? []).includes('/landing'))
  assert.ok(!row('module:43').impact.undrawn.includes('/landing'))
  assert.doesNotMatch(row('layout:landing').reason ?? '', /renders no article body/)
})

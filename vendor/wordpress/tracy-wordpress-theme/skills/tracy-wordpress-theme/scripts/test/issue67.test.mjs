// Issue #67 — the Joomla adapter reads a T3 Framework source (JA Morgan): layout INI + tpls, the
// style's mainlayout and skip_component_content, "all pages except" module assignments, compiled CSS
// per route, LESS palette, module frame params, nested ACM groups and links. One describe block per
// slice; fixtures under scripts/test/fixtures/issue67/ (sanitized, minimal: no captured template code).
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { buildPack as buildSpecPack } from './source-font-fixtures.mjs'
import { importPath, inlineImports, leadingImports } from '../ingest/joomla-imports.mjs'
import { lessDeclarations, lessItems, lessPalette, resolveLess } from '../ingest/joomla-less.mjs'
import { mergeDesigns, routeGroups } from '../ingest/joomla-design-merge.mjs'
import { expandAcmNested, normaliseAcmModules, sefRoutePath, t3SectionFrame } from '../ingest/joomla-normalize.mjs'
import { parseLayoutIni, readT3Layout, styleOfItem, t3StyleSettings } from '../ingest/joomla-layout.mjs'
import { scanPhp } from '../ingest/joomla-php-scan.mjs'

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
/** A fresh copy of the T3 fixture the test may edit. */
const copyT3 = () => {
  const dir = tmp('i67-t3-')
  cpSync(T3, dir, { recursive: true })
  return dir
}
const build = (j6Dir) => {
  const out = join(tmp('i67-out-'), 'pack')
  const result = buildSpecPack({ j6Dir, out, pageFloor: 4, now: '2026-01-01T00:00:00.000Z' })
  return { out, notes: result.notes, pm: readJson(join(out, 'page-map.json')), content: readJson(join(out, 'content.json')), coverage: readJson(join(out, 'adapter-coverage.json')) }
}
const page = (pm, file) => pm.pages.find((p) => p.file === file)
const positions = (pm, file) => page(pm, file).sections.map((s) => s.position)
const TPL = (dir) => join(dir, 'capture', 'templates', 'ja_t3')

// A reader over an in-memory capture, the shape captureReader has (read → { path, text } | null).
const memReader = (files) => ({ read: (rel) => (Object.hasOwn(files, rel) ? { path: `capture/${rel}`, text: files[rel] } : null) })

// ── slice 1: T3 layouts and assignments ───────────────────────────────────────

test('layout INI: sections, positions, comments; a line that is neither is a problem, not read', () => {
  const r = parseLayoutIni('; comment\n[hero]\nxs="hidden"\nposition="hero"\n\n[b1@footnav]\nlg=col-lg-2\nposition="footer-1"\ngarbage line\n')
  assert.deepEqual(r.sections.map((s) => s.position), ['hero', 'footer-1'])
  assert.equal(r.sections[0].props.xs, 'hidden')
  assert.equal(r.sections[1].props.lg, 'col-lg-2')
  assert.equal(r.problems.length, 1)
  assert.match(r.problems[0], /line 9/)
  assert.deepEqual(parseLayoutIni('key="x"\n').sections, [])
  assert.equal(parseLayoutIni('key="x"\n').problems.length, 1, 'a key before any [section] is a problem')
  assert.equal(parseLayoutIni('[a]\n'.repeat(5000)).sections.length, 0, 'a file of thousands of lines is not a layout')
})

test('T3 layout: the page draws positions in the order tpls/*.php loads the blocks, not the INI order', () => {
  const files = {
    'etc/layout/x.ini': '[topbar-left]\nposition="topbar-left"\n[section-top]\nposition="section-top"\n[hero]\nposition="hero"\n[sidebar-1]\nposition="sidebar-1"\n[spare]\nposition="spare"\n',
    'tpls/x.php': "<?php $this->loadBlock('topbar') ?>\n<?php $this->loadBlock('hero') ?>\n<?php $this->loadBlock('sections-top') ?>\n<?php $this->loadBlock('mainbody') ?>\n",
    'tpls/blocks/topbar.php': "<?php if ($this->countModules('topbar-left')) : ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('topbar-left') ?>\" /><?php endif ?>",
    'tpls/blocks/hero.php': "<?php if ($this->countModules('hero')) : ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('hero') ?>\" style=\"T3none\"/><?php endif ?>",
    'tpls/blocks/sections-top.php': "<?php if ($this->countModules('section-top')) : ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('section-top') ?>\" /><?php endif ?>",
    'tpls/blocks/mainbody.php': "<?php if (is_array($this->getParam('skip_component_content')) && in_array(JFactory::getApplication()->input->getInt('Itemid'), $this->getParam('skip_component_content')) && JFactory::getApplication()->input->getString('option') !== \"com_config\") return; $sidebar1 = 'sidebar-1'; ?><jdoc:include type=\"component\" />"
  }
  const t3 = readT3Layout(memReader(files), 'x')
  assert.deepEqual(
    t3.order.map((o) => (o.kind === 'component' ? 'component' : `${o.name}${o.chrome ? '*' : ''}`)),
    ['topbar-left*', 'hero', 'section-top', 'component'],
    'hero comes before section-top and the component follows them; the topbar is chrome'
  )
  assert.deepEqual(t3.sidebars, ['sidebar-1'])
  assert.equal(t3.skipRule, true)
  assert.deepEqual(t3.undrawn, ['spare'], 'an INI position no block draws is listed, not placed')
  assert.deepEqual(t3.gaps, [])
})

test('T3 layout: computed block names, missing block files and missing tpls are named gaps, never guessed', () => {
  const ini = '[a]\nposition="a"\n'
  const dyn = readT3Layout(memReader({ 'etc/layout/x.ini': ini, 'tpls/x.php': "<?php $this->loadBlock($name) ?><?php $this->loadBlock('gone') ?>" }), 'x')
  assert.equal(dyn.order.filter((o) => o.kind === 'position').length, 0)
  assert.ok(dyn.gaps.some((g) => /loadBlock\(\$name\) is not a literal block name/.test(g)))
  assert.ok(dyn.gaps.some((g) => /tpls\/blocks\/gone\.php is not captured/.test(g)))
  assert.deepEqual(dyn.undrawn, ['a'])
  const bare = readT3Layout(memReader({ 'etc/layout/x.ini': ini }), 'x')
  assert.ok(bare.gaps.some((g) => /order the page draws its positions is not known/.test(g)))
  assert.equal(readT3Layout(memReader({}), 'x'), null, 'no INI: not a T3 layout')
  assert.equal(readT3Layout(memReader({ 'etc/layout/x.ini': ini }), '../x'), null, 'a layout name that is not a plain name is refused')
})

test('T3 layout: blocks nest; a block loaded twice is placed once and named a gap', () => {
  const files = {
    'etc/layout/x.ini': '[a]\nposition="a"\n[outer-pos]\nposition="outer-pos"\n[inner-pos]\nposition="inner-pos"\n',
    'tpls/x.php': "<?php $this->loadBlock('outer') ?><?php $this->loadBlock('outer') ?>",
    'tpls/blocks/outer.php': "<?php $this->loadBlock('inner') ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('outer-pos') ?>\" />",
    'tpls/blocks/inner.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('inner-pos') ?>\" />"
  }
  const nested = readT3Layout(memReader(files), 'x')
  assert.deepEqual(nested.order.filter((o) => o.kind === 'position').map((o) => o.name), ['inner-pos', 'outer-pos'], 'text order: the nested block is loaded before outer-pos is named')
  assert.ok(nested.gaps.some((g) => /outer\.php is loaded more than once/.test(g)), 'a repeated block is a named gap, not silently merged')
  // A block that loads itself does not loop.
  const cyc = { 'etc/layout/x.ini': '[p]\nposition="p"\n', 'tpls/x.php': "<?php $this->loadBlock('a') ?>", 'tpls/blocks/a.php': "<?php $this->loadBlock('a') ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('p') ?>\" />" }
  assert.deepEqual(readT3Layout(memReader(cyc), 'x').order.filter((o) => o.kind === 'position').map((o) => o.name), ['p'])
})

test('style settings: mainlayout and skip_component_content of the template styles; a bad list is flagged, not guessed', () => {
  const inv = {
    template_styles: [
      { id: '9', template: 'ja_t3', client_id: '0', home: '1', params: '{"mainlayout":"default","skip_component_content":["1","2"]}' },
      { id: '10', template: 'ja_t3', client_id: '0', home: '0', params: '{"mainlayout":"home-2","skip_component_content":"nope"}' },
      { id: '11', template: 'other', client_id: '0', home: '0', params: '{"mainlayout":"x"}' },
      { id: '12', template: 'ja_t3', client_id: '1', home: '0', params: '{"mainlayout":"admin"}' },
      { id: '13', template: 'ja_t3', client_id: '0', home: '0', params: '{"typelist-layout":"t4"}' }
    ]
  }
  const s = t3StyleSettings(inv, 'ja_t3')
  assert.deepEqual([...s.keys()], ['9', '10'])
  assert.deepEqual([...s.get('9').skip], ['1', '2'])
  assert.equal(s.get('10').skip.size, 0)
  assert.ok(s.get('10').skipInvalid)
  assert.equal(styleOfItem(s, '0').id, '9', 'style 0 is the default style')
  assert.equal(styleOfItem(s, '10').mainlayout, 'home-2')
  assert.equal(styleOfItem(new Map(), '0'), null)
})

test('T3 pages: each route draws its own style’s mainlayout; hero comes before section-top; the chrome is not placed', () => {
  const { pm } = build(T3)
  assert.equal(page(pm, 'index.html').layout, 'default')
  assert.equal(page(pm, 'home-2.html').layout, 'home-2', 'style #10 names mainlayout home-2')
  assert.deepEqual(positions(pm, 'plain.html'), ['hero', 'masthead', 'section-top', 'section-bottom'])
  for (const f of ['index.html', 'plain.html', 'home-2.html'])
    assert.ok(positions(pm, f).indexOf('hero') < positions(pm, f).indexOf('section-top'), `${f}: hero before section-top`)
  for (const f of ['index.html', 'plain.html', 'skipped.html'])
    assert.ok(!positions(pm, f).includes('topbar-left'), 'the topbar position is chrome, not page content')
})

test('T3 pages: skip_component_content drops the article body and the sidebars of the listed menu items only', () => {
  const { content, pm } = build(T3)
  const byFile = (f) => content.pages.find((p) => p.file === f)
  assert.match(byFile('skipped.html').droppedContent, /Skipped body text/)
  assert.doesNotMatch(byFile('skipped.html').contentMarkup ?? '', /Skipped body text/)
  assert.ok(byFile('skipped.html').notes.some((n) => /skip_component_content of template style #9/.test(n)))
  assert.equal(byFile('plain.html').droppedContent, null)
  assert.match(byFile('plain.html').contentMarkup, /Plain body text/)
  // Style #10 lists 128 too, style #9 does not.
  assert.match(byFile('home-2.html').droppedContent, /Home two body/)
  assert.equal(page(pm, 'plain.html').sections.flatMap((s) => s.modules).includes('24'), false, 'a sidebar module is an aside, not a section')
  assert.deepEqual(byFile('plain.html').aside, ['24'], 'the sidebar module of a page that draws its component')
  // The fixture's default layout is read only partly (a computed loadBlock), so whether anything unread draws sidebar-1 on the skipped page is not known:
  // the sidebar module is placed and the page names the gap (a layout read in full proves it undrawn: see issue91-placement.test.mjs).
  assert.deepEqual(byFile('skipped.html').aside, ['24'], 'unknown, not proven undrawn')
  assert.ok(byFile('skipped.html').notes.some((n) => /not known[^\n]*sidebar-1#24/.test(n)))
})

test('module assignments: all, positive and "all except" (negative menuid) place modules where Joomla draws them', () => {
  const { pm } = build(T3)
  const mods = (file, pos) => page(pm, file).sections.find((s) => s.position === pos)?.modules ?? []
  assert.deepEqual(mods('plain.html', 'masthead'), ['95'], 'all-except module shows on a page it does not exclude')
  assert.deepEqual(mods('skipped.html', 'masthead'), [], 'excluded page 201')
  assert.deepEqual(mods('home-2.html', 'masthead'), [], 'excluded page 128')
  assert.deepEqual(mods('index.html', 'masthead'), ['95'], 'the home page is not excluded')
  assert.deepEqual(mods('plain.html', 'section-bottom'), ['23', '25'], 'menuid 0 and a positive row, by ordering')
  assert.deepEqual(mods('index.html', 'section-bottom'), ['23'], 'a positive row shows only on its page')
  assert.deepEqual(mods('skipped.html', 'hero'), ['21'], 'menuid 0 is every page')
})

test('T3 coverage: the layout is captured (INI), T3 gaps and undrawn positions are named on the layout row', () => {
  const { coverage } = build(T3)
  const items = coverage.items ?? coverage.entities ?? []
  const layout = items.find((i) => i.kind === 'layout' && i.id === 'layout:default')
  assert.ok(layout, 'a layout row for etc/layout/default.ini')
  assert.match(layout.reason ?? '', /unused-spot|no literal block draws/)
  const route = items.find((i) => i.kind === 'route' && i.id.startsWith('route:202:'))
  assert.doesNotMatch(route.reason ?? '', /not in the capture/, 'the T3 layout counts as captured')
})

test('T3 hostile input: a layout INI that is a symlink is not read; the route says the layout is not captured', () => {
  const dir = copyT3()
  const ini = join(TPL(dir), 'etc', 'layout', 'default.ini')
  const target = join(dir, 'elsewhere.ini')
  writeFileSync(target, '[hero]\nposition="hero"\n')
  unlinkSync(ini)
  symlinkSync(target, ini)
  const { pm, coverage } = build(dir)
  assert.equal(page(pm, 'plain.html').sections.filter((s) => s.via === 'layout').length, 0, 'nothing is placed from a layout that was not read')
  const route = (coverage.items ?? coverage.entities).find((i) => i.kind === 'route' && i.id.startsWith('route:202:'))
  assert.match(route.reason, /layout "default" is not in the capture/)
  assert.ok(existsSync(target))
})

test('T3 hostile input: a computed loadBlock is a named gap; the component is kept, not dropped on a guess; a bad skip list skips nothing', () => {
  const dir = copyT3()
  const tpl = TPL(dir)
  writeFileSync(join(tpl, 'tpls', 'default.php'), "<?php $this->loadBlock($x) ?><?php $this->loadBlock('hero') ?>")
  const inv = readJson(join(dir, 'inventory.json'))
  inv.template_styles[0].params = JSON.stringify({ mainlayout: 'default', skip_component_content: { 0: 201 } })
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  const { pm, content, coverage, notes } = build(dir)
  // The layout is read only partly (a computed loadBlock), so whether it draws the sidebar module's position is unknown:
  // the module is placed as a page extra, not by the layout, and the page says so.
  assert.deepEqual(page(pm, 'plain.html').sections.filter((s) => s.via === 'layout').map((s) => s.position), ['hero'], 'only the literal block is placed by the layout')
  const layout = (coverage.items ?? coverage.entities).find((i) => i.id === 'layout:default')
  assert.match(layout.reason, /loadBlock\(\$x\) is not a literal block name/)
  assert.match(layout.reason, /component is assumed/)
  const skipped = content.pages.find((p) => p.file === 'skipped.html')
  assert.equal(skipped.droppedContent ?? null, null, 'no skip list and no mainbody read: the body is kept')
  assert.match(skipped.contentMarkup, /Skipped body text/)
  assert.ok(notes.some((n) => /template style #9: skip_component_content .* is not a list of menu item ids/.test(n)))
})

test('T3 layout: the INI position of a section is the position drawn; a section with no position or none at all is a gap', () => {
  const files = {
    'etc/layout/x.ini': '[hero]\nposition="banner-top"\n[nopos]\nposition=""\n',
    'tpls/x.php': "<?php $this->loadBlock('b') ?>",
    'tpls/blocks/b.php': "<?php $this->countModules('hero') ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('hero') ?>\" /><jdoc:include type=\"modules\" name=\"<?php $this->_p('nopos') ?>\" /><jdoc:include type=\"modules\" name=\"<?php $this->_p('ghost') ?>\" /><jdoc:include type=\"modules\" name=\"literal\" />"
  }
  const t3 = readT3Layout(memReader(files), 'x')
  assert.deepEqual(t3.order.filter((o) => o.kind === 'position').map((o) => o.name), ['banner-top', 'literal'], 'the mapped position, not the section name; a literal jdoc name stays')
  assert.ok(t3.gaps.some((g) => /\[nopos\] has no position=/.test(g)))
  assert.ok(t3.gaps.some((g) => /no \[ghost\] section/.test(g)))
})

test('T3 layout: a loadBlock name built by concatenation is a gap, not its literal prefix', () => {
  const files = {
    'etc/layout/x.ini': '[a]\nposition="a"\n',
    'tpls/x.php': "<?php $this->loadBlock('header/header'.$themeInfo); ?><?php $this->loadBlock('mainbody') ?>",
    'tpls/blocks/header/header.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('a') ?>\" />",
    'tpls/blocks/mainbody.php': '<jdoc:include type="component" />'
  }
  const t3 = readT3Layout(memReader(files), 'x')
  assert.deepEqual(t3.order.filter((o) => o.kind === 'position'), [], 'header/header is not read for a name only $themeInfo knows')
  assert.ok(t3.gaps.some((g) => /is not a literal block name/.test(g)))
  assert.ok(t3.order.some((o) => o.kind === 'component' && !o.assumed))
})

test('T3 layout: a mainbody that draws no component omits it; one whose nested block is unread keeps it, assumed', () => {
  const base = { 'etc/layout/x.ini': '[a]\nposition="a"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const none = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<?php $this->loadBlock("inner") ?>', 'tpls/blocks/inner.php': '<p>static</p>' }), 'x')
  assert.equal(none.order.some((o) => o.kind === 'component'), false)
  assert.ok(none.gaps.some((g) => /draws no <jdoc:include type="component">/.test(g)))
  const viaNested = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': "<?php $this->loadBlock('inner') ?>", 'tpls/blocks/inner.php': '<jdoc:include type="component" />' }), 'x')
  assert.equal(viaNested.order.some((o) => o.kind === 'component' && !o.assumed), true)
  const unread = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': "<?php $this->loadBlock('missing') ?>" }), 'x')
  const c = unread.order.find((o) => o.kind === 'component')
  assert.equal(c?.assumed, true)
  assert.ok(unread.gaps.some((g) => /missing\.php is not captured/.test(g)))
})

test('PHP scan: comments are not executed text; control structures, one-statement bodies and short-circuits are conditional', () => {
  const src = "<?php // $this->loadBlock('a')\n# $this->loadBlock('b')\n/* $this->loadBlock('c') */ ?><!-- <jdoc:include type=\"component\" /> -->\n<?php $u = 'http://x'; $this->loadBlock('d'); ?>"
  const s = scanPhp(src)
  assert.deepEqual([...s.text.matchAll(/loadBlock\('(\w)'\)/g)].map((m) => m[1]), ['d'], 'only the load outside every comment is left, and a // inside a string is not a comment')
  assert.equal(s.text.length, src.length, 'offsets are unchanged')
  assert.doesNotMatch(s.text, /jdoc:include/)
  const at = (t, needle) => {
    const x = scanPhp(t)
    return { c: x.conditional(t.indexOf(needle)), s: x.shortCircuited(t.indexOf(needle)) }
  }
  assert.equal(at("<?php if ($a) : ?><jdoc:include type=\"component\" /><?php endif ?>", '<jdoc').c, true, 'alt syntax')
  assert.equal(at("<?php if ($a) { ?><jdoc:include /><?php } else { ?><jdoc:include /><?php } ?>", '<jdoc').c, true, 'braces')
  assert.equal(at("<?php if ($a) : ?>x<?php else : ?><jdoc:include /><?php endif ?>", '<jdoc').c, true, 'else branch')
  assert.equal(at("<?php if ($a) : ?>x<?php endif ?><jdoc:include />", '<jdoc').c, false, 'after endif it runs again')
  assert.equal(at("<?php if ($a) return; ?><jdoc:include />", '<jdoc').c, false, 'a one-statement body ends at its `;`')
  assert.equal(at("<?php if ($a) $this->loadBlock('x'); ?>", '$this').c, true, 'a one-statement body is conditional')
  assert.equal(at("<?php $ok && $this->loadBlock('x'); ?>", '$this').s, true, 'short-circuit')
  assert.equal(at("<?php $a ? $this->loadBlock('x') : null; ?>", '$this').s, true, 'ternary')
  assert.equal(at("<?php $this->loadBlock('x'); ?>", '$this').s, false)
  assert.equal(at("<?php foreach ($a as $b) { $this->loadBlock('x'); } $this->loadBlock('y'); ?>", "loadBlock('y')").c, false, 'the loop body closes')
  assert.equal(scanPhp("<?php $t = <<<EOT\nx\nEOT;\n$this->loadBlock('x'); ?>").unscanned, true, 'a heredoc is not followed')
  assert.doesNotThrow(() => scanPhp('<?php if ((( "unterminated'))
})

test('T3 layout: an include or a load in a comment is not read; one under a condition is a gap, the component is assumed', () => {
  const base = { 'etc/layout/x.ini': '[a]\nposition="a"\n[b]\nposition="b"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const commented = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<!-- <jdoc:include type="component" /> --><?php // $this->loadBlock("inner") ?>', 'tpls/blocks/inner.php': '<jdoc:include type="component" />' }), 'x')
  assert.equal(commented.order.some((o) => o.kind === 'component'), false, 'a commented include is not the component')
  assert.ok(commented.gaps.some((g) => /draws no <jdoc:include type="component">/.test(g)))
  const cond = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<?php if ($this->x()) : ?><jdoc:include type="component" /><?php endif ?>' }), 'x')
  const c = cond.order.find((o) => o.kind === 'component')
  assert.equal(c?.assumed, true, 'a conditional include is kept, assumed')
  assert.ok(cond.gaps.some((g) => /is written under a condition the reader does not evaluate; the component is assumed/.test(g)))
  const load = readT3Layout(memReader({ ...base, 'tpls/x.php': "<?php if ($x) $this->loadBlock('hero'); ?>\n<?php $this->loadBlock('mainbody') ?>", 'tpls/blocks/hero.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('a') ?>\" />", 'tpls/blocks/mainbody.php': '<jdoc:include type="component" />' }), 'x')
  assert.ok(load.gaps.some((g) => /loadBlock\('hero'\) is written under a condition/.test(g)))
  const commentedLoad = readT3Layout(memReader({ ...base, 'tpls/x.php': "<?php /* $this->loadBlock('hero') */ $this->loadBlock('mainbody') ?>", 'tpls/blocks/hero.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('a') ?>\" />", 'tpls/blocks/mainbody.php': '<jdoc:include type="component" />' }), 'x')
  assert.deepEqual(commentedLoad.order.filter((o) => o.kind === 'position'), [], 'a commented load places nothing')
})

test('T3 layout: an include written inside a PHP string is a gap, never a component event', () => {
  const base = { 'etc/layout/x.ini': '[a]\nposition="a"\n[b]\nposition="b"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const str = `<?php $unused = '<jdoc:include type="component" />'; ?>`
  const alone = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': str }), 'x')
  assert.equal(alone.order.some((o) => o.kind === 'component' && !o.assumed), false, 'a string alone places no observed component')
  assert.ok(alone.gaps.some((g) => /inside a PHP string/.test(g)))
  assert.equal(alone.body.state, 'unknown', 'an include in a string may still be printed: the body is not proven absent')
  const before = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': `${str}<jdoc:include type="modules" name="<?php $this->_p('a') ?>" /><jdoc:include type="component" />` }), 'x')
  assert.deepEqual(before.order.map((o) => o.name ?? o.kind), ['a', 'component'], 'the real include keeps its position after a')
  assert.notEqual(before.order.find((o) => o.kind === 'component').assumed, true)
  assert.ok(before.gaps.some((g) => /inside a PHP string/.test(g)))
})

test('T3 layout: the mainbody positions and the blocks it loads are placed in text order; a sidebar is the INI position of its section', () => {
  const files = {
    'etc/layout/x.ini': '[content-top]\nposition="content-mass-top"\n[sidebar-1]\nposition="right-col"\n[sidebar-2]\n[content-bottom]\nposition="content-bottom"\n',
    'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>",
    'tpls/blocks/mainbody.php': "<?php $s1 = 'sidebar-1'; $s2 = 'sidebar-2'; // 'sidebar-3' is not used\n$this->loadBlock('mainbody/inner') ?>",
    'tpls/blocks/mainbody/inner.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('content-top') ?>\" /><jdoc:include type=\"component\" /><jdoc:include type=\"modules\" name=\"<?php $this->_p('content-bottom') ?>\" /><?php $this->_p('sidebar-1') ?>"
  }
  const t3 = readT3Layout(memReader(files), 'x')
  assert.deepEqual(t3.order.map((o) => (o.kind === 'component' ? 'component' : o.name)), ['content-mass-top', 'component', 'content-bottom'], 'positions inside the mainbody blocks surround the component, in text order; the sidebar is aside')
  assert.deepEqual(t3.sidebars, ['right-col'], 'the sidebar is the section position, not the section name; a commented name is not one')
  assert.ok(t3.gaps.some((g) => /sidebar "sidebar-2" has no position= in the layout INI/.test(g)), JSON.stringify(t3.gaps))
  assert.ok(!t3.order.some((o) => o.kind === 'position' && o.name === 'right-col'), 'a sidebar is not a page position')
  assert.deepEqual(t3.undrawn, [], 'every INI position with a position is drawn')
})

// ── slice 2: compiled CSS per route, imports, LESS palette ────────────────────

const SHEET = (o = {}) =>
  `body{font-family:"Open Sans",Arial,sans-serif;font-size:${o.size ?? '16px'};line-height:1.5;color:${o.text ?? '#333333'};background-color:#ffffff}
h1{font-size:40px;font-weight:700;line-height:1.2}
a{color:${o.link ?? '#0055aa'}}
.container{max-width:1170px;padding-left:15px;padding-right:15px}
.btn{border-radius:4px;font-weight:600;padding-top:6px;padding-right:12px;padding-bottom:6px;padding-left:12px}
${o.extra ?? ''}`
const writeCapture = (dir, rel, text) => {
  const f = join(dir, 'capture', rel)
  mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, text)
}
/** The T3 fixture with compiled sheets and per-route stylesheet records. `records`: route id → hrefs. */
const withCss = ({ sheets = {}, records = {}, less = null } = {}) => {
  const dir = copyT3()
  for (const [name, text] of Object.entries(sheets)) writeCapture(dir, `t3-assets/css/${name}`, text)
  const routes = readJson(join(dir, 'render-routes.json')).map((r) => (records[r.id] ? { ...r, stylesheets: records[r.id] } : r))
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(routes))
  for (const [rel, text] of Object.entries(less ?? {})) writeCapture(dir, `templates/ja_t3/${rel}`, text)
  return dir
}
const css = (out) => readJson(join(out, 'provenance.json')).source.template.css
const styleOf = (out, id) => css(out).styles.find((s) => s.id === id)
const ruleOf = (out, role) => readJson(join(out, 'design-contract.json')).rules?.find((r) => r.role === role)

test('CSS per route: two sheet lists agree on a value → it is published; where they differ it is left out, named', () => {
  const A = '/t3-assets/css/css-a.css'
  const B = '/t3-assets/css/css-b.css'
  const dir = withCss({
    sheets: { 'css-a.css': SHEET({ link: '#0055aa' }), 'css-b.css': SHEET({ link: '#aa0000' }) },
    records: { 101: [A], 202: [A], 128: [B], 201: [B] }
  })
  const { out } = build(dir)
  const st = styleOf(out, '9')
  assert.equal(st.routeGroups.length, 2, 'two cascades: one per served sheet list')
  const body = st.rules.find((r) => r.selector === 'body')
  assert.ok(body, `the body rule both lists give is published: ${JSON.stringify(st.rules)}`)
  assert.ok(!st.rules.some((r) => r.selector === 'a'), 'the link colour differs between the lists: not published')
  assert.ok(st.gaps.some((g) => /are served different template or compiled sheets \(2 lists over 3 route/.test(g)))
  assert.ok(st.gaps.some((g) => /a color: the route groups resolve different values/.test(g) || /link-color/.test(g)), JSON.stringify(st.gaps))
})

test('CSS per route: a recorded sheet the capture lacks may override the sheets read, wherever it is linked', () => {
  const A = '/t3-assets/css/css-a.css'
  const X = '/media/vendor/x.css?1'
  const build1 = (list) => styleOf(build(withCss({ sheets: { 'css-a.css': SHEET() }, records: { 101: list, 202: list, 128: list, 201: list } })).out, '9')
  const after = build1([A, X])
  assert.deepEqual(after.rules, [], 'linked after the compiled sheet, the missing one may override its colours: none is published')
  assert.ok(after.gaps.some((g) => /\/media\/vendor\/x\.css, which .* link, is not in the capture; its rules could override the values of the sheets read \(capture\/t3-assets\/css\/css-a\.css\)/.test(g)), JSON.stringify(after.gaps))
  assert.ok(after.gaps.some((g) => /css-a\.css: read, but its rules are not published/.test(g)))
  const first = build1([X, A])
  assert.deepEqual(first.rules, [], 'linked before the compiled sheet, the missing one can still win by specificity or !important: none is published')
  assert.ok(first.gaps.some((g) => /\/media\/vendor\/x\.css.*whether linked before or after it/.test(g)), 'and the missing sheet is named')
})

test('CSS per route: a recorded sheet outside the template is read from the capture in its cascade place, and its rules win over the earlier sheet', () => {
  const A = '/t3-assets/css/css-a.css'
  const X = '/media/vendor/x.css'
  const build1 = (order) => {
    const dir = withCss({ sheets: { 'css-a.css': SHEET({ link: '#0055aa' }) }, records: { 101: order, 202: order, 128: order, 201: order } })
    writeCapture(dir, 'media/vendor/x.css', 'a{color:#aa0000}')
    return build(dir).out
  }
  const after = build1([A, X])
  assert.ok(styleOf(after, '9').sheets.some((x) => x.path === 'capture/media/vendor/x.css' && x.status === 'read'), JSON.stringify(styleOf(after, '9').sheets))
  const fromOf = (out) => styleOf(out, '9').rules.find((r) => r.selector === 'a')?.from
  const before = build1([X, A])
  assert.deepEqual(fromOf(after), ['capture/media/vendor/x.css'], 'linked after the compiled sheet, its colour wins')
  assert.deepEqual(fromOf(before), ['capture/t3-assets/css/css-a.css'], 'linked before it, the compiled sheet wins')
})

test('CSS per route: a group whose sheet is not in the capture leaves nothing established across the style', () => {
  const A = '/t3-assets/css/css-a.css'
  const dir = withCss({ sheets: { 'css-a.css': SHEET() }, records: { 101: [A], 202: [A], 128: ['/t3-assets/css/css-missing.css'], 201: ['/t3-assets/css/css-missing.css'] } })
  const { out } = build(dir)
  const st = styleOf(out, '9')
  assert.deepEqual(st.rules, [], 'no value is published: one list is not fully read')
  assert.ok(st.gaps.some((g) => /no design value is established across the style's routes/.test(g)), JSON.stringify(st.gaps))
  assert.ok(st.gaps.some((g) => /css-missing\.css.*is not in the capture/.test(g)))
})

test('CSS per route: an unrecorded page does not let another list stand for it (existing guarantee kept)', () => {
  const A = '/t3-assets/css/css-a.css'
  const dir = withCss({ sheets: { 'css-a.css': SHEET() }, records: { 101: [A], 202: [A], 128: [A] } })
  const { out } = build(dir)
  const unresolved = styleOf(out, '9').unresolvedPages
  assert.ok(unresolved.includes('skipped.html') && unresolved.includes('404.html'), 'the route with no record and the synthetic 404 page')
  assert.ok(!unresolved.includes('index.html') && !unresolved.includes('plain.html'), 'recorded pages are placed')
})

test('@import: a captured leading import is followed and its rules count; an uncaptured one keeps the sheet unresolved (an icon font is not exempt)', () => {
  const A = '/t3-assets/css/css-a.css'
  const followed = withCss({ sheets: { 'css-a.css': `@import url('/t3-assets/css/parts/base.css');\n.btn{border-radius:4px}\n` }, records: { 101: [A], 202: [A], 128: [A], 201: [A] } })
  writeCapture(followed, 't3-assets/css/parts/base.css', SHEET())
  const ok = styleOf(build(followed).out, '9')
  const sheet = ok.sheets.find((x) => x.path.endsWith('css-a.css'))
  assert.deepEqual(sheet.imports.map((i) => [i.status, i.path]), [['followed', 't3-assets/css/parts/base.css']])
  assert.ok(ok.rules.some((r) => r.selector === 'body'), 'the imported sheet supplied the body rule')
  const missing = withCss({ sheets: { 'css-a.css': `@import url('/plugins/system/t3/fonts/font-awesome/css/font-awesome-base.css');\n${SHEET()}` }, records: { 101: [A], 202: [A], 128: [A], 201: [A] } })
  const bad = styleOf(build(missing).out, '9')
  assert.deepEqual(bad.rules, [], 'an import of a file that is not captured is not skipped for its name')
  assert.ok(bad.gaps.some((g) => /@import \/plugins\/system\/t3\/fonts\/font-awesome\/css\/font-awesome-base\.css is not followed \(.*not in the capture/.test(g)), JSON.stringify(bad.gaps))
})

test('@import reader: plain paths only; cycles, depth, conditions, traversal, foreign origins, encoded separators and non-css are left', () => {
  const files = {
    'a/one.css': "@import 'two.css';\n.one{color:#111}",
    'a/two.css': "@import 'one.css';\n.two{color:#222}",
    'a/deep.css': '.deep{color:#333}'
  }
  const read = (rel) => (Object.hasOwn(files, rel) ? { text: files[rel] } : null)
  const opts = { read, basePath: '/' }
  const cyc = inlineImports(files['a/one.css'], 'a/one.css', opts)
  assert.deepEqual(cyc.imports.map((i) => i.status), ['left', 'followed'].reverse().length ? ['left', 'followed'] : [])
  assert.match(cyc.imports.find((i) => i.status === 'left').reason, /cycle/)
  for (const [target, why] of [
    ['https://cdn.example/x.css', /another origin/],
    ['//cdn.example/x.css', /another origin/],
    ['../../x.css', /leaves the capture/],
    ['a/%2e%2e/x.css', /not a plain name/],
    ['a%2Fx.css', /not a plain name/],
    ['x.css?v=1', /query or fragment/],
    ['a\\x.css', /outside plain path segments/],
    ['x.png', /not a \.css/],
    ['', /empty/]
  ])
    assert.match(importPath(target, 'a/s.css', '/').why ?? '', why, target)
  assert.match(importPath('/other/x.css', 'a/s.css', '/sub').why, /outside the source site's base path/)
  assert.equal(importPath('/sub/a/deep.css', 's.css', '/sub').rel, 'a/deep.css')
  assert.equal(importPath('deep.css', 'a/s.css', null).rel, 'a/deep.css')
  assert.match(importPath('/a/deep.css', 's.css', null).why, /base path is unknown/)
  const cond = inlineImports("@import url(deep.css) screen and (min-width:100px);\n.x{color:red}", 'a/s.css', opts)
  assert.match(cond.imports[0].reason, /conditional/)
  assert.match(cond.text, /@import/, 'a left import stays in the text, where the CSS reader reports it')
  // depth: a chain longer than the limit is not followed to its end
  const chain = {}
  for (let i = 0; i < 8; i++) chain[`c${i}.css`] = `@import 'c${i + 1}.css';\n.c${i}{color:#000}`
  chain['c8.css'] = '.end{color:#000}'
  const deep = inlineImports(chain['c0.css'], 'c0.css', { read: (r) => (chain[r] ? { text: chain[r] } : null), basePath: '/' })
  assert.ok(deep.imports.some((i) => /deeper than 4/.test(i.reason ?? '')))
  assert.deepEqual(leadingImports("/* c */ @import url(\"a.css\");\n@import 'b.css' print;\n.x{}").imports.map((i) => [i.target, i.tail]), [['a.css', ''], ['b.css', 'print']])
})

test('route groups: sheet lists that differ only by sheets outside the capture or query strings are one group; the unrecorded pages join every group', () => {
  const servedList = (hrefs) => ({ ordered: hrefs.filter((h) => h.includes('t3-assets')).map((h) => ({ name: h })) })
  const served = [
    { page: 'a.html', route: '/a', hrefs: ['/t3-assets/1.css', '/x.css'] },
    { page: 'b.html', route: '/b', hrefs: ['/y.css', '/t3-assets/1.css'] },
    { page: 'c.html', route: '/c', hrefs: ['/t3-assets/2.css'] },
    { page: 'd.html', route: '/d', hrefs: null }
  ]
  const g = routeGroups(served, { tplName: 't', origin: null, basePath: '/', servedList })
  assert.equal(g.length, 2)
  assert.deepEqual(g[0].routes, ['/a', '/b'])
  assert.ok(g.every((x) => x.served.some((p) => p.page === 'd.html')))
  assert.equal(routeGroups([{ page: 'a', hrefs: null }], { servedList }), null)
})

test('design merge: values stand only when every group gives the same at every variant; a group with no design voids the rest', () => {
  const variants = [{ id: 'v1' }, { id: 'v2' }]
  const roles = [{ role: 'r', category: 'c' }]
  const rule = (font, sel = 'body') => ({ role: 'r', category: 'c', selector: sel, styles: { v1: { fontSize: font, color: '#000' }, v2: { fontSize: font, color: '#000' } }, from: ['x.css'] })
  const d = (rules, tokens = {}) => ({ rules, tokens: { v1: tokens, v2: tokens }, gaps: [], unresolvedTokens: [] })
  const same = mergeDesigns([{ label: 'g1', design: d([rule('16px')], { '--a': '1', '--b': '2' }) }, { label: 'g2', design: d([rule('18px')], { '--a': '1', '--b': '3' }) }], { variants, roles })
  assert.deepEqual(same.rules[0].styles.v1, { color: '#000' }, 'only the agreed property is kept')
  assert.deepEqual(same.tokens.v1, { '--a': '1' })
  assert.ok(same.gaps.some((g) => /fontSize: the route groups resolve different values/.test(g)))
  assert.ok(same.gaps.some((g) => /1 token\(s\) are not the same/.test(g)))
  const sel = mergeDesigns([{ label: 'g1', design: d([rule('16px', 'body')]) }, { label: 'g2', design: d([rule('16px', 'html')]) }], { variants, roles })
  assert.deepEqual(sel.rules, [])
  const open = mergeDesigns([{ label: 'g1', design: d([rule('16px')]) }, { label: 'g2', design: d([]), unplaced: 'a sheet is not read' }], { variants, roles })
  assert.deepEqual(open.rules, [])
  assert.match(open.gaps[0], /no design value is established across the style's routes: g2/)
  const partial = mergeDesigns([{ label: 'g1', design: d([rule('16px')]) }, { label: 'g2', design: d([rule('16px')], { '--z': '1' }) }], { variants, roles })
  assert.equal(partial.rules.length, 1)
})

test('LESS palette: declarations, theme overrides (variables.less, variables-custom.less), references; expressions and cycles are unresolved, never computed', () => {
  const text = `// c\n@brand-primary: #d93030; // note\n@link-color: @brand-primary;\n@x: darken(@brand-primary, 10%);\n@a: @b;\n@b: @a;\n@font-family-base: "PT Root", Helvetica, sans-serif;\n@body-bg: #fff;\n.rule { @inner: #000; color: @brand-primary; }\n@url: "http://x.example/a"; /* block */ @late: 2px;`
  const d = lessDeclarations(text)
  assert.deepEqual(d.map((x) => x.name), ['brand-primary', 'link-color', 'x', 'a', 'b', 'font-family-base', 'body-bg', 'url', 'late'], 'a variable inside a rule block is not top-level; a // inside a string is not a comment')
  assert.equal(d[0].line, 2)
  const vars = new Map(d.map((x) => [x.name, { ...x, file: 'v.less' }]))
  assert.equal(resolveLess('link-color', vars).value, '#d93030')
  assert.deepEqual(resolveLess('link-color', vars).chain, ['link-color', 'brand-primary'])
  assert.match(resolveLess('x', vars).why, /expression/)
  assert.match(resolveLess('a', vars).why, /cycle/)
  assert.match(resolveLess('nope', vars).why, /not declared/)
  const reader = { read: (rel) => ({ 'less/variables.less': { path: 'c/less/variables.less', text }, 'less/themes/dark/variables-custom.less': { path: 'c/less/themes/dark/variables-custom.less', text: '@brand-primary: #123456;' } }[rel] ?? null) }
  const p = lessPalette(reader, 'dark', { validColor: (v) => /^#/.test(v) })
  assert.equal(p.values.primary.value, '#123456', 'the theme’s variables-custom.less wins')
  assert.equal(p.values.primary.from.file, 'c/less/themes/dark/variables-custom.less')
  assert.equal(p.values.link.value, '#123456', 'a reference follows the override (LESS is lazy)')
  assert.equal(p.values.body_bg.value, '#fff')
  assert.equal(p.values.fontBody.value, '"PT Root", Helvetica, sans-serif')
  assert.equal(lessPalette({ read: () => null }, null), null, 'no captured file: no palette')
  assert.ok(lessPalette(reader, '../x').gaps.some((g) => /not a plain directory name/.test(g)))
  assert.ok(lessPalette(reader, 'gone').gaps.some((g) => /no less\/themes\/gone/.test(g)))
  assert.throws(() => lessDeclarations('@a: 1;'.repeat(20001)), /not a variables file/)
})

test('LESS @import: a captured import is followed in place (later wins); one that is not read leaves the earlier declarations unknown', () => {
  const files = (o) => ({ read: (rel) => (Object.hasOwn(o, rel) ? { path: `c/${rel}`, text: o[rel] } : null) })
  assert.deepEqual(lessItems("@import 'a';\n@x: 1;").map((i) => i.import ?? i.name), ["'a'", 'x'])
  assert.deepEqual(lessDeclarations("@import 'a';\n@x: 1;").map((i) => i.name), ['x'], 'the declarations reader is unchanged')
  const isColor = (v) => /^#/.test(v)
  // imported before the declaration: the declaration wins; imported after it: the import wins
  const before = lessPalette(files({ 'less/variables.less': "@import 'parts/brand';\n@brand-primary: #111111;", 'less/parts/brand.less': '@brand-primary: #222222;\n@brand-secondary: #333333;' }), null, { validColor: isColor })
  assert.equal(before.values.primary.value, '#111111')
  assert.equal(before.values.secondary.value, '#333333', 'a variable only the import declares is read')
  const after = lessPalette(files({ 'less/variables.less': "@brand-primary: #111111;\n@import 'parts/brand.less';", 'less/parts/brand.less': '@brand-primary: #222222;' }), null, { validColor: isColor })
  assert.equal(after.values.primary.value, '#222222')
  assert.equal(after.values.primary.from.file, 'c/less/parts/brand.less')
  // an import the capture lacks: what was declared before it is withheld, named; what follows stands
  const gone = lessPalette(files({ 'less/variables.less': "@brand-primary: #111111;\n@import 'missing';\n@brand-secondary: #333333;" }), null, { validColor: isColor })
  assert.equal(gone.values.primary, undefined)
  assert.match(gone.unresolved.find((u) => u.key === 'primary').why, /may be overridden by @import 'missing'.*not read/)
  assert.equal(gone.values.secondary.value, '#333333')
  assert.ok(gone.gaps.some((g) => /@import 'missing' \(c\/less\/variables\.less:2\): less\/missing\.less is not in the capture/.test(g)))
  // an import that is there but cannot be read (more statements than a variables file has) may override any variable: the earlier ones are withheld, named
  const big = lessPalette(files({ 'less/variables.less': "@brand-primary: #111111;\n@import 'parts/big';\n@brand-secondary: #333333;", 'less/parts/big.less': '@a: 1;\n'.repeat(20001) }), null, { validColor: isColor })
  assert.equal(big.values.primary, undefined, 'an unreadable import leaves the earlier value unknown')
  assert.match(big.unresolved.find((u) => u.key === 'primary').why, /may be overridden by c\/less\/parts\/big\.less/)
  assert.ok(big.gaps.some((g) => /parts\/big\.less: more than 20000 statements: not a variables file; not read: the variables declared before it are not known to stand/.test(g)), JSON.stringify(big.gaps))
  assert.equal(big.values.secondary.value, '#333333', 'what follows the import stands')
  const custom = lessPalette(files({ 'less/variables.less': '@brand-primary: #111111;', 'less/variables-custom.less': '@a: 1;\n'.repeat(20001) }), null, { validColor: isColor })
  assert.equal(custom.values.primary, undefined, 'an unreadable override file leaves the base value unknown')
  // an optional import that is absent is not an override; a css import declares no variable
  const opt = lessPalette(files({ 'less/variables.less': "@brand-primary: #111111;\n@import (optional) 'missing';\n@import 'x.css';" }), null, { validColor: isColor })
  assert.equal(opt.values.primary.value, '#111111')
  // hostile targets, a cycle and a chain that is too deep are named, never followed out of the template
  for (const target of ["'../../etc/passwd'", "'http://x.example/a.less'", "'@{dir}/a'", "'a' screen", "url(@x)", "'a%2Fb'"]) {
    const h = lessPalette(files({ 'less/variables.less': `@brand-primary: #111111;\n@import ${target};` }), null, { validColor: isColor })
    assert.equal(h.values.primary, undefined, target)
    assert.ok(h.gaps.some((g) => g.includes('@import')), target)
  }
  const cyc = lessPalette(files({ 'less/variables.less': "@import 'a';\n@brand-primary: #111111;", 'less/a.less': "@import 'variables';\n@brand-secondary: #222222;" }), null, { validColor: isColor })
  assert.equal(cyc.values.primary.value, '#111111', 'an import that is being read is not read again')
  const chain = {}
  for (let i = 0; i < 12; i++) chain[`less/c${i}.less`] = `@import 'c${i + 1}';`
  chain['less/variables.less'] = "@brand-primary: #111111;\n@import 'c0';"
  const deep = lessPalette(files(chain), null, { validColor: isColor })
  assert.equal(deep.values.primary, undefined)
  assert.ok(deep.gaps.some((g) => /nested deeper than 8/.test(g)))
})

test('LESS palette in the pack: the palette and body font come from LESS when the sheets resolve none; provenance names the file and line', () => {
  const dir = withCss({ less: { 'less/variables.less': '@brand-primary: #d93030;\n@brand-secondary: #1b3060;\n@body-bg: #fff;\n@text-color: #777;\n@font-family-base: "PT Root", Arial, sans-serif;\n' } })
  const { out, pm, notes } = build(dir)
  assert.deepEqual(pm.theme.palette.light, { primary: '#d93030', secondary: '#1b3060', body_bg: '#fff', text: '#777' })
  assert.equal(pm.theme.fonts.body, 'PT Root')
  assert.ok(notes.some((n) => /palette from LESS.*primary #d93030 ← capture\/templates\/ja_t3\/less\/variables\.less:1 @brand-primary/.test(n)), JSON.stringify(notes.filter((n) => /LESS/.test(n))))
  assert.equal(css(out).less.values.secondary.from.line, 2)
})

test('LESS palette in the pack: an expression stays unresolved and is named; nothing is computed for it', () => {
  const dir = withCss({ less: { 'less/variables.less': '@brand-primary: darken(#d93030, 10%);\n@brand-secondary: @brand-primary;\n' } })
  const { pm, notes } = build(dir)
  assert.equal(pm.theme.palette.light.primary ?? null, null)
  assert.equal(pm.theme.palette.light.secondary ?? null, null)
  assert.ok(notes.some((n) => /LESS @brand-primary \(primary\) is not read: .*expression/.test(n)))
})

// ── slice 3: module frame params, nested ACM groups, links, slugs, article addresses ──

const sections = (out) => readJson(join(out, 'sections.json'))

test('T3Section frame: a module at a T3Section position carries the params the chrome reads, with their provenance', () => {
  const { out } = build(T3)
  const custom = (id) => sections(out).custom.find((c) => c.id === id)
  const f = custom('22').frame
  assert.equal(f.chrome, 'T3Section')
  assert.equal(f.classes, 't3-section section padding-top border-bottom mod-bg-white', 'the class list modChrome_T3Section prints ("0" is off)')
  assert.deepEqual([f.colorModule, f.backgroundImage, f.backgroundPosition, f.width, f.subHeading, f.headerTag], ['white', 'images/bg.jpg', 'center', 'container', 'Our work', 'h2'])
  assert.deepEqual([f.paddingTop, f.paddingBottom, f.borderTop, f.borderBottom], [true, false, false, true])
  assert.ok(f.set.includes('sub-heading') && f.from)
  assert.equal(custom('23').frame.width, 'container-fluid')
  assert.equal(custom('23').frame.paddingTop, false, 'padding-top "0" is off')
  assert.equal(custom('21').frame, undefined, 'the hero position is drawn with T3none: no frame')
  assert.equal(sections(out).acm.find((a) => a.id === '98').frame.chrome, 'T3Section', 'an ACM module at the same position too')
})

test('T3Section frame reader: PHP truthiness, defaults, and hostile values', () => {
  const f = t3SectionFrame({ 'padding-top': 0, 'padding-bottom': '', 'border-top': '1', 'border-bottom': 'yes', 'module-width': '2', moduleclass_sfx: ' x ', bootstrap_size: '4', 'color-module': 'dark', header_tag: '' })
  assert.deepEqual([f.paddingTop, f.paddingBottom, f.borderTop, f.borderBottom, f.width], [false, false, true, true, 'container-fluid'])
  assert.equal(f.classes, 't3-section section x col-sm-4 border-bottom border-top mod-bg-dark')
  assert.equal(f.headerTag, 'h3')
  const bare = t3SectionFrame(undefined)
  assert.equal(bare.classes, 't3-section section')
  assert.deepEqual(bare.set, [])
  assert.equal(t3SectionFrame({ 'color-module': { a: 1 }, 'sub-heading': ['x'] }).subHeading, '', 'a value that is not text is not read as text')
})

test('ACM nested groups: an object under type[G] becomes the field lists, never "[object Object]"', () => {
  const { out } = build(T3)
  const a = sections(out).acm.find((x) => x.id === '98')
  assert.deepEqual(a.items.map((i) => i.title), ['First slide', 'Second slide'])
  assert.equal(a.itemGroup, 'data')
  assert.doesNotMatch(JSON.stringify(a), /object Object/)
  assert.ok(!('rows' in a.fields) && !('cols' in a.fields), 'the editor layout keys are not fields')
})

test('ACM nested groups: the reader names what it drops and refuses to stringify what it cannot expand', () => {
  const params = (block) => JSON.stringify({ 'jatools-config': JSON.stringify({ ':type': 'x:list', list: block }) })
  assert.equal(expandAcmNested(params({ 'list[a]': ['1'] })), null, 'nothing nested: untouched')
  assert.equal(expandAcmNested('{}'), null)
  assert.equal(expandAcmNested('not json'), null)
  const r = expandAcmNested(params({ 'jatools-layout-list': 'style-1', 'list[data]': { 'list[data][t]': ['a', 'b'], rows: 2, 'other[data][t]': ['z'], deep: { d: { e: { f: { g: 1 } } } } } }))
  const cfg = JSON.parse(r.params)['jatools-config']
  assert.deepEqual(cfg.list['list[data][t]'], ['a', 'b'])
  assert.ok(!('list[data]' in cfg.list))
  assert.deepEqual(r.dropped.map((d) => d.name).sort(), ['other[data][t]', 'rows'], 'a sub-key that is not under its parent key is not a field')
  // a group whose name is not the module type (JA Morgan testimonials: type "testimonials", group "testimonial-intro")
  const named = JSON.parse(expandAcmNested(params({ 'testimonial-intro[data]': { 'testimonial-intro[data][title]': ['a'], 'testimonial-intro[data][img]': ['b'], rows: 1 } })).params)['jatools-config']
  assert.deepEqual(named.list, { 'testimonial-intro[data][title]': ['a'], 'testimonial-intro[data][img]': ['b'] })
  assert.ok(r.unread.some((u) => /deeper than 3/.test(u.why)))
  const inv = { modules: [{ id: '1', module: 'mod_ja_acm', client_id: '0', title: 't', params: params({ 'list[data]': { 'list[data][t]': ['a'] } }) }, { id: '2', module: 'mod_custom', client_id: '0', params: '{}' }, { id: '3', module: 'mod_ja_acm', client_id: '1', params: params({ 'list[d]': { 'list[d][t]': ['a'] } }) }] }
  const n = normaliseAcmModules(inv)
  assert.equal(n.notes.length, 1, 'only the site ACM module with a nested group changes')
  assert.equal(n.inv.modules[1], inv.modules[1])
  assert.equal(n.inv.modules[2], inv.modules[2], 'an administrator module is left as it is')
  assert.match(inv.modules[0].params, /list\[data\]\\":\{/, 'the input is not modified')
})

test('links: a SEF address written with index.php/ resolves to the route, else it is kept and listed', () => {
  assert.equal(sefRoutePath('index.php/home/home-style-1'), '/home/home-style-1')
  assert.equal(sefRoutePath('/index.php/a/b/?x=1#y'), '/a/b')
  assert.equal(sefRoutePath('index.php/a/page.html'), '/a/page')
  for (const bad of ['index.php?Itemid=1', 'index.php/', 'index.php/../x', 'index.php/a//b', 'index.php/a%2Fb', 'index.php/a\\b', 'other/index.php/x', null, ''])
    assert.equal(sefRoutePath(bad), null, String(bad))
  const { out, content } = build(T3)
  const a = sections(out).acm.find((x) => x.id === '98')
  assert.deepEqual(a.items.map((i) => i['btn-link']), ['/home/home-style-1', '/plain'], 'the SEF form and the Itemid form both resolve')
  // an unknown SEF route is kept as written and listed
  const dir = copyT3()
  const inv = readJson(join(dir, 'inventory.json'))
  inv.modules.find((m) => m.id === '98').params = inv.modules.find((m) => m.id === '98').params.replace('index.php/home/home-style-1', 'index.php/nowhere/page')
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  const bad = build(dir)
  assert.equal(sections(bad.out).acm.find((x) => x.id === '98').items[0]['btn-link'], 'index.php/nowhere/page')
  assert.ok(bad.content.unresolvedLinks.includes('index.php/nowhere/page'))
  assert.ok(!content.unresolvedLinks.includes('index.php/home/home-style-1'))
})

test('front page slug: a home alias that is the first segment of other routes becomes front-page (no parent-page collision)', () => {
  const { content, notes } = build(T3)
  assert.equal(content.pages.find((p) => p.file === 'index.html').slug, 'front-page')
  assert.ok(notes.some((n) => /slug "home" is the first path segment of other routes \(\/home\/home-style-1\)/.test(n)))
  assert.equal(content.pages.find((p) => !p.file)?.slug, 'home', 'the synthetic parent of /home/… keeps the slug')
  // no nested route under it: the slug is left alone
  const dir = copyT3()
  const inv = readJson(join(dir, 'inventory.json'))
  inv.menu = inv.menu.filter((m) => m.id !== '301')
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(readJson(join(dir, 'render-routes.json')).filter((r) => r.id !== '301')))
  assert.equal(build(dir).content.pages.find((p) => p.file === 'index.html').slug, 'home')
})

test('article address: the representative single page is drawn at <category>/<id>-<alias>, the alias alone only when sef_ids removes IDs', () => {
  const { pm, notes } = build(T3)
  const single = page(pm, 'single.html')
  assert.equal(single.source.joomlaPath, '/blog/20-blog-post')
  assert.ok(notes.some((n) => /single\.html reference URL ends in 20-blog-post: com_content sef_ids is not set/.test(n)))
  const dir = copyT3()
  writeFileSync(join(dir, 'content-params.json'), JSON.stringify({ show_title: '1', show_category_title: '1', show_description: '1', maxLevel: '1', show_subcat_desc: '1', sef_ids: '1' }))
  const ids = build(dir)
  assert.equal(page(ids.pm, 'single.html').source.joomlaPath, '/blog/blog-post')
  assert.ok(ids.notes.some((n) => /ends in blog-post: com_content sef_ids removes IDs/.test(n)))
})

test('PHP scan + T3 layout: a form inside a string is not executed; a position under a condition it does not understand is a gap; blocks nest in text order', () => {
  const ini = '[hero]\nposition="hero"\n[a]\nposition="a"\n[b]\nposition="b"\n[c]\nposition="c"\n'
  // A string that holds a load / countModules / include is not a load, a position or (for loadBlock) anything.
  const strings = {
    'etc/layout/x.ini': ini,
    'tpls/x.php': `<?php $note = "$this->loadBlock('hero');"; echo 'x'; $this->loadBlock('a') ?>`,
    'tpls/blocks/hero.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('hero') ?>\" />",
    'tpls/blocks/a.php': `<?php $t = '<jdoc:include type="modules" name="b" />'; echo '<jdoc:include type="modules" name="c" />'; ?><jdoc:include type="modules" name="a" />`
  }
  const r = readT3Layout(memReader(strings), 'x')
  assert.deepEqual(r.order.filter((o) => o.kind === 'position').map((o) => o.name), ['a'], 'neither the string load nor the string positions are placed')
  assert.ok(r.gaps.some((g) => /inside a PHP string/.test(g)), 'an include printed from a string is named, not read')
  // countModules / _c name a position in a condition or a class: they draw nothing, so a guard alone places no position and orders none.
  const guard = {
    'etc/layout/x.ini': ini,
    'tpls/x.php': "<?php $this->loadBlock('g1') ?>",
    'tpls/blocks/g1.php': "<?php if ($this->countModules('hero')) : ?><?php $this->loadBlock('g2') ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('hero') ?>\" /><?php endif ?><?php if ($this->countModules('a')) : ?><?php endif ?>",
    'tpls/blocks/g2.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('b') ?>\" />"
  }
  const g = readT3Layout(memReader(guard), 'x')
  assert.deepEqual(g.order.filter((o) => o.kind === 'position').map((o) => o.name), ['b', 'hero'], 'the nested block loaded before the include comes first; a guard with no include ("a") places nothing')
  assert.ok(g.undrawn.includes('a'), 'the position only asked about is undrawn')
  // A short-circuit or ternary before the include is not evaluated: named, read as drawn.
  const sc = readT3Layout(memReader({ 'etc/layout/x.ini': ini, 'tpls/x.php': "<?php $this->loadBlock('s') ?>", 'tpls/blocks/s.php': "<?php $ok && print('<jdoc:include type=\"modules\" name=\"hero\" />'); echo $ok ? '' : ''; ?>" }), 'x')
  assert.ok(sc.order.every((o) => o.name !== 'hero'), 'an include printed from a string is not placed')
  assert.match(sc.gaps.join('\n'), /inside a PHP string/, 'a short-circuit or ternary that prints the tag is named')
  const scan = scanPhp(`<?php $s = "loadBlock('h')"; $this->loadBlock('h'); ?>`)
  assert.equal(scan.inString(scan.text.indexOf('loadBlock')), true)
  assert.equal(scan.inString(scan.text.lastIndexOf('loadBlock')), false)
  // A guard that only asks countModules is understood; any other condition, else and foreach are gaps.
  const cond = {
    'etc/layout/x.ini': ini,
    'tpls/x.php': "<?php $this->loadBlock('b1') ?>",
    'tpls/blocks/b1.php': [
      `<?php if ($this->countModules('hero')): ?><jdoc:include type="modules" name="<?php $this->_p('hero') ?>" /><?php endif ?>`,
      `<?php if ($user->guest): ?><jdoc:include type="modules" name="<?php $this->_p('a') ?>" /><?php else: ?><jdoc:include type="modules" name="<?php $this->_p('b') ?>" /><?php endif ?>`,
      `<?php foreach ($x as $y) { ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('c') ?>\" /><?php } ?>`
    ].join('\n')
  }
  const c = readT3Layout(memReader(cond), 'x')
  const cg = c.gaps.join('\n')
  assert.ok(!/position "hero" is drawn under a condition/.test(cg), 'a countModules guard is understood')
  assert.match(cg, /position "a" is drawn under a condition the reader does not evaluate \(\(\$user->guest\)\)/)
  assert.match(cg, /position "b" is drawn under a condition the reader does not evaluate \(else\)/)
  assert.match(cg, /position "c" is drawn under a condition/)
  // Source order inside a non-mainbody block: a position named before a nested load comes before its positions.
  const order = {
    'etc/layout/x.ini': ini,
    'tpls/x.php': "<?php $this->loadBlock('outer') ?>",
    'tpls/blocks/outer.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('a') ?>\" /><?php $this->loadBlock('inner') ?><jdoc:include type=\"modules\" name=\"<?php $this->_p('c') ?>\" />",
    'tpls/blocks/inner.php': "<jdoc:include type=\"modules\" name=\"<?php $this->_p('b') ?>\" />"
  }
  assert.deepEqual(readT3Layout(memReader(order), 'x').order.filter((o) => o.kind === 'position').map((o) => o.name), ['a', 'b', 'c'])
})

test('LESS text read whole or not at all: an unterminated final statement is read, an unclosed string, comment or block is refused and withholds what it could override', () => {
  const files = (o) => ({ read: (rel) => (Object.hasOwn(o, rel) ? { path: `c/${rel}`, text: o[rel] } : null) })
  const isColor = (v) => /^#/.test(v)
  // the last statement may end at the end of the text: an import there is followed, a declaration there is read
  assert.deepEqual(lessItems('@a: 1; @import "x"').map((i) => i.import ?? i.name), ['a', '"x"'])
  assert.deepEqual(lessItems('@a: 1;\n@b: 2').map((i) => i.name), ['a', 'b'])
  const tail = lessPalette(files({ 'less/variables.less': "@brand-primary: #111111; @import 'override'", 'less/override.less': '@brand-primary: #222222' }), null, { validColor: isColor })
  assert.equal(tail.values.primary.value, '#222222', 'the unterminated import is followed and its value wins')
  const gone = lessPalette(files({ 'less/variables.less': "@brand-primary: #111111; @import 'override'" }), null, { validColor: isColor })
  assert.equal(gone.values.primary, undefined, 'the unterminated import is not in the capture: the earlier colour is withheld')
  assert.match(gone.unresolved.find((u) => u.key === 'primary').why, /may be overridden by @import 'override'/)
  for (const bad of ['@brand-primary: #111111;\n@font: "Open', '@brand-primary: #111111;\n/* @brand-primary: #222222;', '@brand-primary: #111111;\n.a {\n  color: red;', '@brand-primary: #111111; } @brand-primary: #222222;']) {
    assert.throws(() => lessItems(bad), /not closed|closes no block/, bad)
    const r = lessPalette(files({ 'less/variables.less': '@brand-secondary: #333333;', 'less/variables-custom.less': bad }), null, { validColor: isColor })
    assert.equal(r.values.secondary, undefined, `the base value is withheld when the override file is malformed: ${JSON.stringify(bad)}`)
    assert.ok(r.gaps.some((g) => /variables-custom\.less: .*not read/.test(g)), JSON.stringify(r.gaps))
  }
})

test('T3 layout: a modules include whose name is computed or absent is a named gap, never dropped silently', () => {
  const ini = '[hero]\nposition="hero"\n'
  const r = readT3Layout(memReader({
    'etc/layout/x.ini': ini,
    'tpls/x.php': "<?php $this->loadBlock('h') ?>",
    'tpls/blocks/h.php': '<jdoc:include type="modules" name="<?php echo $position ?>" style="none" /><jdoc:include type="modules" style="none" /><jdoc:include type="modules" name="hero" />'
  }), 'x')
  assert.deepEqual(r.order.filter((o) => o.kind === 'position').map((o) => o.name), ['hero'])
  assert.equal(r.gaps.filter((g) => /names its position by a form the reader does not read/.test(g)).length, 2)
})

test('T3 layout: includes with missing, singular, or unknown types are reported; silent types stay silent', () => {
  const base = { 'etc/layout/x.ini': '[hero]\nposition="hero"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const read = (include) => readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': include }), 'x')

  const missing = read('<jdoc:include name="hero" />')
  assert.equal(missing.gaps.filter((g) => /has no type/.test(g)).length, 1)
  assert.match(missing.gaps.find((g) => /has no type/.test(g)), /whether it draws modules or the component is not known, nothing is placed for it/)
  assert.ok(missing.body.causes.some((c) => /has no type/.test(c)))
  assert.ok(missing.positionCauses.some((c) => /has no type/.test(c)))
  assert.ok(!missing.order.some((o) => o.kind === 'position'))

  const singular = read('<jdoc:include type="module" name="hero" />')
  assert.equal(singular.gaps.filter((g) => /type="module"/.test(g)).length, 1)
  assert.match(singular.gaps.find((g) => /type="module"/.test(g)), /module by name that is not read; nothing is placed for it/)
  assert.ok(!singular.body.causes.some((c) => /type="module"/.test(c)))
  assert.ok(singular.positionCauses.some((c) => /type="module"/.test(c)))
  assert.ok(!singular.order.some((o) => o.kind === 'position'))

  const unknown = read('<jdoc:include type="widget" name="hero" />')
  assert.equal(unknown.gaps.filter((g) => /unknown type "widget"/.test(g)).length, 1)
  assert.ok(unknown.body.causes.some((c) => /unknown type "widget"/.test(c)))
  assert.ok(unknown.positionCauses.some((c) => /unknown type "widget"/.test(c)))
  assert.ok(!unknown.order.some((o) => o.kind === 'position'))

  const head = read('<jdoc:include type="head" />')
  const empty = read('')
  assert.deepEqual(head.gaps, empty.gaps, 'head adds no reported gap')
  assert.deepEqual(head.body, empty.body, 'head adds no body uncertainty')
  assert.deepEqual(head.positionCauses, empty.positionCauses, 'head adds no position uncertainty')
})

test('T3 layout: include attributes are read by exact name, single- or double-quoted; decoys and unsupported forms are gaps', () => {
  const ini = '[hero]\nposition="hero"\n[side]\nposition="side"\n'
  const r = readT3Layout(memReader({
    'etc/layout/x.ini': ini,
    'tpls/x.php': "<?php $this->loadBlock('h') ?>",
    'tpls/blocks/h.php': [
      "<jdoc:include type='modules' name='hero' style='xhtml' />",
      '<jdoc:include data-type="modules" name="decoy1" />',
      '<jdoc:include type="modules" data-name="decoy2" />',
      "<jdoc:include data-name='x' type='modules' name=\"side\" />",
      '<jdoc:include type="<?php echo $t ?>" name="dyn" />',
      "<jdoc:include type='modules' name='bad />"
    ].join('')
  }), 'x')
  const placed = r.order.filter((o) => o.kind === 'position')
  assert.deepEqual(placed.map((o) => o.name), ['hero', 'side'])
  assert.equal(placed[0].chrome ?? placed[0].style ?? 'xhtml', 'xhtml')
  assert.equal(r.gaps.filter((g) => /names its position by a form the reader does not read/.test(g)).length, 1)
  assert.equal(r.gaps.filter((g) => /computes its type/.test(g)).length, 1)
  assert.equal(r.gaps.filter((g) => /cannot parse/.test(g)).length, 1)
  assert.ok(!r.order.some((o) => /decoy/.test(o.name ?? '')))
})

test('T3 layout: a component include is read by exact attribute name — single quotes count, data-type does not', () => {
  const base = { 'etc/layout/x.ini': '[a]\nposition="a"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const single = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': "<jdoc:include type='component' />" }), 'x')
  assert.ok(single.order.some((o) => o.kind === 'component' && !o.assumed), 'a single-quoted component include is the component')
  assert.ok(!single.gaps.some((g) => /draws no <jdoc:include type="component">/.test(g)))
  const decoy = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<jdoc:include data-type="component" />' }), 'x')
  assert.ok(!decoy.order.some((o) => o.kind === 'component' && !o.assumed), 'a data-type decoy is not the component')
  assert.equal(decoy.body.state, 'unknown', 'a missing exact type keeps the body unknown')
  assert.ok(decoy.gaps.some((g) => /has no type/.test(g)), 'a data-type decoy is an include with no exact type')
})

test('T3 layout: a ">" inside a quoted value does not end an include; a repeated or unclosed attribute is a parse gap, not an assumed component', () => {
  const base = { 'etc/layout/x.ini': '[a]\nposition="a"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const quoted = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<jdoc:include title="a>b" type="component" />' }), 'x')
  assert.ok(quoted.order.some((o) => o.kind === 'component' && !o.assumed), 'a > in a quoted title keeps the component include whole')
  const dup = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<jdoc:include data-type="component" data-type="other" />' }), 'x')
  assert.ok(!dup.order.some((o) => o.kind === 'component' && !o.assumed), 'no type attribute: no observed component')
  assert.equal(dup.body.state, 'unknown', 'an include the reader cannot parse leaves the body unknown, not absent')
  const open = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<jdoc:include type="component" title="x />' }), 'x')
  assert.ok(open.gaps.some((g) => /cannot parse/.test(g)), 'an unclosed quote is named')
  const mod = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': '<jdoc:include title="a>b" type="modules" name="hero" /><jdoc:include type="component" />' }), 'x')
  assert.ok(mod.order.some((o) => o.name === 'hero'), 'a modules include after a quoted > is placed')
})

test('T3 layout: a decoy in an attribute value or a repeated attribute is never the component; every unparsed include is a gap', () => {
  const base = { 'etc/layout/x.ini': '[a]\nposition="a"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const read = (body) => readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': body }), 'x')
  const comp = (r) => r.order.some((o) => o.kind === 'component' && !o.assumed)
  const text = read('<jdoc:include title="type=component" title="x" />')
  assert.ok(!comp(text), 'text spelling type=component in a repeated title is not a type attribute')
  assert.ok(text.gaps.some((g) => /cannot parse/.test(g)))
  const dup = read('<jdoc:include data-type="modules" data-type="x" />')
  assert.ok(dup.gaps.some((g) => /cannot parse/.test(g)), 'a repeated attribute is a parse gap even without the word modules')
  const nested = read(`<jdoc:include title="<jdoc:include type='component' />" type="modules" name="a" />`)
  assert.ok(!comp(nested), 'an include quoted inside another tag is not a component')
  assert.ok(nested.order.some((o) => o.name === 'a'), 'the enclosing modules include is still placed')
})

test('T3 layout: a jdoc:include quoted in another tag or a comment is not an include; jdoc:include-other is a named gap, not an include', () => {
  const base = { 'etc/layout/x.ini': '[main]\nposition="main"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const decoys = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': `<div title="<jdoc:include type='component' />"></div><!-- <jdoc:include type='component' /> -->` }), 'x')
  assert.ok(!decoys.order.some((o) => o.kind === 'component'), 'no component is proven by quoted or commented text')
  const other = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': "<jdoc:include-other type='component' /><jdoc:include type='component' />" }), 'x')
  assert.equal(other.order.filter((o) => o.kind === 'component').length, 1, 'only the exact tag draws the component')
  assert.ok(other.gaps.some((g) => /jdoc:include-other/.test(g)))
})

test('T3 layout: markup-like text inside a PHP string does not hide or fake an include (<script>, <!--, ?> in strings)', () => {
  const base = { 'etc/layout/x.ini': '[main]\nposition="main"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const comps = (php) => readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': php }), 'x').order.filter((o) => o.kind === 'component').length
  assert.equal(comps(`<?php $unused = '<script>'; ?><jdoc:include type="component" />`), 1, "a '<script>' string does not swallow the include")
  assert.equal(comps(`<?php $unused = '<!--'; ?><jdoc:include type="component" />`), 1, "a '<!--' string does not open a comment")
  assert.equal(comps(`<?php $u = "?>"; $v = '<!--'; // note ?><jdoc:include type="component" />`), 1, 'a ?> in a string does not end the block; a // comment ends at ?>')
  const echoed = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': `<?php echo '<jdoc:include type="modules" name="a" />'; ?>` }), 'x')
  assert.ok(!echoed.order.some((o) => o.name === 'a'), 'an include written in a PHP string places nothing')
  assert.ok(echoed.gaps.some((g) => /inside a PHP string/.test(g)), 'and is a named gap')
})

test('skip_component_content: only the return guard is a skip rule; a bare mention is a named gap', () => {
  const base = { 'etc/layout/x.ini': '[sidebar-1]\nposition="sidebar-1"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const mention = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': "<?php $skip = $this->getParam('skip_component_content'); ?><jdoc:include type=\"component\" />" }), 'x')
  assert.equal(mention.skipRule, false)
  assert.ok(mention.gaps.some((g) => /return guard or mentions skip_component_content/.test(g)), JSON.stringify(mention.gaps))
})

test('CSS per route: a missing sheet linked BEFORE a captured one withholds that sheet too', () => {
  const dir = withCss({ sheets: { 'css-a.css': SHEET() }, records: { 101: ['/media/vendor/x.css', '/t3-assets/css/css-a.css'], 202: ['/media/vendor/x.css', '/t3-assets/css/css-a.css'], 128: ['/media/vendor/x.css', '/t3-assets/css/css-a.css'], 201: ['/media/vendor/x.css', '/t3-assets/css/css-a.css'] } })
  const st = styleOf(build(dir).out, '9')
  assert.deepEqual(st.rules, [])
})

test('CSS imports: a comment marker inside a quoted string is text, not a comment', () => {
  const { rest } = leadingImports('@import "a.css";\n.x{font-family:"A/*B*/C"}')
  assert.match(rest, /"A\/\*B\*\/C"/)
})

test('skip_component_content: only the one source-cited guard is a skip rule; every other form is unknown with a named gap and the body kept', () => {
  const base = { 'etc/layout/x.ini': '[sidebar-1]\nposition="sidebar-1"\n', 'tpls/x.php': "<?php $this->loadBlock('mainbody') ?>" }
  const read = (cond) => readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': `<?php if (${cond}) return; ?><jdoc:include type="component" />` }), 'x')
  const isArr = "is_array($this->getParam('skip_component_content'))"
  const inArr = "in_array(JFactory::getApplication()->input->getInt('Itemid'), $this->getParam('skip_component_content'))"
  const cfg = `JFactory::getApplication()->input->getString('option') !== "com_config"`
  const full = `${isArr} && ${inArr} && ${cfg}`
  const known = (cond, label) => { const r = read(cond); assert.equal(r.skipRule, true, label); assert.ok(!r.gaps.some((g) => /return guard or mentions skip_component_content/.test(g)), label) }
  known(full, 'the source form')
  known(`${isArr}\n  && ${inArr} &&\n\t${cfg}`, 'line breaks and tabs outside strings')
  known(`${isArr}&&${inArr}&&JFactory::getApplication( )->input->getString('option')   !==   "com_config"`, 'spacing outside strings')
  const unknown = {
    'the in_array clause alone': inArr,
    'is_array + in_array': `${isArr} && ${inArr}`,
    'in_array + config exemption': `${inArr} && ${cfg}`,
    'appended && false': `${full} && false`,
    'appended || true': `${full} || true`,
    'an extra clause': `${full} && ${inArr}`,
    'a reordered clause': `${inArr} && ${isArr} && ${cfg}`,
    'mixed and + config': `${isArr} && ${inArr} && false and ${cfg}`,
    'inverse': `!(${full})`,
    'equality': `${isArr} && ${inArr} && JFactory::getApplication()->input->getString('option') === "com_config"`,
    'ternary': `${full} ? true : false`,
    'altered parameter literal': full.replace('skip_component_content', 'skip_component_ content'),
    'altered Itemid literal': full.replace("'Itemid'", "'Item id'"),
    'altered option literal': full.replace("'option'", "'Option'"),
    'altered com_config literal': full.replace('com_config', 'com_config '),
    'single quotes for com_config': full.replace('"com_config"', "'com_config'"),
    'double quotes for option': full.replace("'option'", '"option"')
  }
  for (const [label, cond] of Object.entries(unknown)) {
    const r = read(cond)
    assert.equal(r.skipRule, false, label)
    assert.ok(r.gaps.some((g) => /tpls\/blocks\/mainbody\.php has a return guard or mentions skip_component_content/.test(g)), `${label}: a named gap ${JSON.stringify(r.gaps)}`)
    assert.ok(r.order.some((o) => /component/.test(JSON.stringify(o))), `${label}: the component body is kept`)
  }
  // a guard that does not spell the parameter at all is still a pre-body return
  const other = read(`$this->getParam('skip_component_content') && false`)
  assert.equal(other.skipRule, false)
  const nb = readT3Layout(memReader({ ...base, 'tpls/blocks/mainbody.php': `<?php if ($x) { return; } ?><jdoc:include type="component" />` }), 'x')
  assert.ok(nb.gaps.some((g) => /return guard/.test(g)) && nb.order.some((o) => /component/.test(JSON.stringify(o))))
})

test('skipped route coverage: loaders and positions are claimed only from routes whose component body is drawn (page, retained post, unrouted and mixed-route article)', () => {
  const dir = copyT3()
  const inv = readJson(join(dir, 'inventory.json'))
  const art = (id) => inv.content.find((a) => a.id === id)
  const tmpl = art('20')
  const mk = (id, cat, introtext) => ({ ...tmpl, id, title: `Article ${id}`, alias: `article-${id}`, catid: cat, introtext })
  art('12').introtext = '<p>Skipped body text.</p>{loadposition bodyonly}{loadmoduleid 24}'
  art('13').introtext = '<p>Plain body text.</p>{loadmoduleid 29}{loadposition bodyonly2}'
  art('20').introtext = '<p>Post body.</p>{loadmoduleid 27}'
  inv.content.push(mk('30', '15', '<p>Unrouted body.</p>{loadmoduleid 28}'))
  const menu = (id, alias, articleId) => ({ ...inv.menu.find((m) => m.id === '202'), id, alias, path: alias, title: alias, link: `index.php?option=com_content&view=article&id=${articleId}` })
  inv.menu.push(menu('401', 'skipped-post', '20'), menu('402', 'plain-again', '13'))
  const style9 = inv.template_styles.find((t) => t.id === '9')
  style9.params = JSON.stringify({ ...JSON.parse(style9.params), skip_component_content: ['201', '401', '402'] })
  const custom = (id, position, content = `<p>Words ${id}</p>`) => ({ ...inv.modules.find((m) => m.id === '21'), id, title: `Module ${id}`, position, content })
  inv.modules.push(custom('27', 'loaded-by-post'), custom('28', 'loaded-by-unrouted'), custom('29', 'loaded-by-mixed'), custom('31', 'bodyonly'), custom('32', 'bodyonly2'), custom('33', 'mainbody-only'))
  for (const id of ['31', '32', '33']) inv.modules_menu.push({ moduleid: id, menuid: '0' })
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  const routes = readJson(join(dir, 'render-routes.json'))
  routes.push({ id: '401', path: '/skipped-post' }, { id: '402', path: '/plain-again' })
  writeFileSync(join(dir, 'render-routes.json'), JSON.stringify(routes))
  writeFileSync(join(TPL(dir), 'tpls', 'blocks', 'mainbody', 'no-sidebar.php'), '<?php defined(\'_JEXEC\') or die; ?><div id="t3-content"><jdoc:include type="modules" name="mainbody-only" /><jdoc:include type="component" /></div>')
  const { coverage } = build(dir)
  const row = (n) => (coverage.items ?? coverage.entities).find((i) => i.kind === 'module' && i.id === `module:${n}`)
  const loadedBy = (n) => row(n).impact.loadedBy ?? []
  // a module only a skipped post / an unrouted article loads is loaded by nobody
  assert.deepEqual(loadedBy('27'), [], 'a retained post on a skipped route')
  assert.deepEqual(loadedBy('28'), [], 'an article no route opens')
  // a mixed article: the module is loaded by it, and drawn on the drawn route only
  assert.deepEqual(loadedBy('29'), ['article:13'])
  assert.deepEqual(row('29').impact.unknown, ['/plain'], 'an unassigned module is only possibly drawn, and only where the body is drawn')
  // a body-only {loadposition}: on the skipped route it draws nothing
  assert.ok(!row('31').impact.routes.includes('/skipped'), 'loadposition in a skipped body')
  assert.deepEqual(row('32').impact.routes, ['/plain'], 'loadposition in a mixed article')
  // an actual mainbody position: not drawn on skipped routes, drawn on the rest
  assert.ok(row('33').impact.routes.includes('/plain'))
  for (const p of ['/skipped', '/skipped-post', '/plain-again']) assert.ok(!row('33').impact.routes.includes(p), `mainbody position on skipped ${p}`)
  // controls: outer chrome and independently drawn modules keep the skipped routes
  assert.ok(row('26').impact.routes.includes('/skipped'), 'topbar chrome')
  assert.ok(row('21').impact.routes.includes('/skipped'), 'hero band drawn outside mainbody')
  assert.deepEqual(loadedBy('24'), [], 'module 24 is loaded only by the skipped page body')
  assert.ok(!row('24').impact.routes.includes('/skipped'))
})

test('skipped route: the {loadposition} and {loadmoduleid} markers of a body that is never drawn place no module', () => {
  const dir = copyT3()
  const inv = readJson(join(dir, 'inventory.json'))
  const art = inv.content.find((a) => /Skipped body text/.test(a.introtext))
  art.introtext = '<p>Skipped body text.</p>{loadposition masthead}{loadmoduleid 24}'
  writeFileSync(join(dir, 'inventory.json'), JSON.stringify(inv))
  const { pm, coverage } = build(dir)
  const p = page(pm, 'skipped.html')
  assert.equal(p.sections.some((s) => s.via === 'loadposition' || s.via === 'loadmoduleid'), false, 'no slot from a body Joomla never prints')
  assert.doesNotMatch(JSON.stringify(coverage), /via.{0,5}loadmoduleid/)
  const row = (coverage.items ?? coverage.entities).find((i) => i.kind === 'module' && i.id === 'module:24')
  const skippedPath = pm.pages.find((x) => x.file === 'skipped.html').source.joomlaPath
  assert.ok(row, 'module 24 has a coverage row')
  assert.ok(!(row.impact.loadedBy ?? []).some((w) => /^article:/.test(w)), 'no article loads it: its only route never draws the body')
  assert.ok(!row.impact.routes.includes(skippedPath), 'the skipped route is not a route it is drawn on')
})

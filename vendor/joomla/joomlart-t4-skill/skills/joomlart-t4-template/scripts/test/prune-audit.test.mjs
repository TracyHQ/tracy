// prune-audit.mjs must flag the base quickstart's leftover DEFINITIONS (ACM dirs, layouts, profiles,
// overrides, the base template, an unchanged manifest) from data, not from names — and keep what a
// row, a style or a menu item actually uses. Fixture = a fake webroot + a facts.json standing in for
// the DB (the `--data` path); `--apply` must remove only PRUNE paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../quickstart/prune-audit.mjs', import.meta.url).pathname;
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'prune-audit-'));
  const T = join(root, 'templates', 'tb');
  const mk = (p, content = '') => { mkdirSync(join(T, p, '..'), { recursive: true }); writeFileSync(join(T, p), content); };
  for (const d of ['acm/tb-hero', 'acm/hero', 'acm/carousel']) { mkdirSync(join(T, d), { recursive: true }); mk(d + '/config.xml', '<form/>'); }
  mk('etc/layout/tb-home.json', '{}'); mk('etc/layout/tb-inner.json', '{}'); mk('etc/layout/default.json', '{}');
  mk('etc/site/tb.json', '{}'); mk('etc/site/base.json', '{}'); mk('etc/theme/tb.json', '{}'); mk('etc/navigation/tb.json', '{}'); mk('etc/navigation/onepage.json', '{}');
  mkdirSync(join(T, 'etc/presets'), { recursive: true }); mk('etc/presets/default.json', '{}');
  for (const d of ['html/com_content', 'html/com_users', 'html/mod_menu', 'html/mod_virtuemart_cart', 'html/plg_content_vote', 'html/layouts']) { mkdirSync(join(T, d), { recursive: true }); mk(d + '/default.php', '<?php'); }
  mk('css/styles/tb.css', ''); mk('css/styles/base.css', '');
  mk('language/en-GB/en-GB.tpl_tb.sys.ini', 'TPL_TB_XML_DESCRIPTION="Tracy Base is a responsive template"\n');
  mk('template_preview.png', 'SAME'); mk('template_thumbnail.png', 'SAME');
  const baseDir = join(root, 'base'); mkdirSync(join(baseDir, 'language/en-GB'), { recursive: true });
  writeFileSync(join(baseDir, 'template_preview.png'), 'SAME'); writeFileSync(join(baseDir, 'template_thumbnail.png'), 'OTHER');
  writeFileSync(join(baseDir, 'language/en-GB/en-GB.tpl_base.sys.ini'), 'TPL_BASE_XML_DESCRIPTION="Tracy Base is a responsive template"\n');
  const facts = {
    moduleTypes: ['tb-hero'], moduleNames: ['mod_menu', 'mod_ja_acm'], styleParams: [JSON.stringify({ 'typelist-layout': 'tb-home', 'sub-layout': 'tb-inner', 'typelist-site': 'tb', 'typelist-theme': 'tb', 'typelist-navigation': 'tb' })],
    menuOptions: ['com_content', 'com_contact'], plugins: ['plg_system_t4'],
    templates: [{ element: 'tb', id: 1, menuItems: 5, home: 1 }, { element: 'cassiopeia', id: 2, menuItems: 0, home: 0 }, { element: 'base', id: 3, menuItems: 0, home: 0 }],
    extensions: [{ type: 'plugin', element: 't4', folder: 'system', id: 10, params: '{}' }, { type: 'component', element: 'com_claudecowork', folder: '', id: 11, params: '{"token": "abcdefghijklmnop1234", "contract": "tracy-base\\/j6\\/1.0.0"}' }, { type: 'plugin', element: 'sef', folder: 'system', id: 12, params: '{}' }],
    manifest: { description: 'TPL_TB_XML_DESCRIPTION', author: 'JoomlArt', authorUrl: 'www.joomlart.com', copyright: '(C) J.O.O.M', creationDate: 'Sep 09, 2026', version: '1.0.0' },
    baseManifest: { description: 'TPL_BASE_XML_DESCRIPTION', author: 'JoomlArt', authorUrl: 'www.joomlart.com', copyright: '(C) J.O.O.M', creationDate: 'Sep 09, 2026', version: '1.0.0' },
  };
  writeFileSync(join(root, 'facts.json'), JSON.stringify(facts));
  return { root, T, baseDir, facts: join(root, 'facts.json') };
}
const run = (args) => { const r = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() }; };
const verdict = (json, area, item) => json.rows.find(r => r.area === area && r.item === item)?.verdict;

test('leftover definitions are PRUNE, used ones KEEP, decided from data', () => {
  const f = fixture();
  const r = run(['--webroot', f.root, '--template', 'tb', '--data', f.facts, '--base', 'base', '--base-dir', f.baseDir, '--json']);
  assert.equal(r.code, 1, r.out);
  const j = r.json;
  assert.equal(verdict(j, 'acm', 'tb-hero'), 'KEEP'); assert.equal(verdict(j, 'acm', 'hero'), 'PRUNE'); assert.equal(verdict(j, 'acm', 'carousel'), 'PRUNE');
  assert.equal(verdict(j, 'layout', 'tb-inner'), 'KEEP'); assert.equal(verdict(j, 'layout', 'default'), 'PRUNE');
  assert.equal(verdict(j, 'profile:site', 'base'), 'PRUNE'); assert.equal(verdict(j, 'profile:navigation', 'onepage'), 'PRUNE'); assert.equal(verdict(j, 'profile:presets', 'etc/presets'), 'PRUNE');
  assert.equal(verdict(j, 'override', 'com_content'), 'KEEP'); assert.equal(verdict(j, 'override', 'com_users'), 'PRUNE'); assert.equal(verdict(j, 'override', 'mod_menu'), 'KEEP'); assert.equal(verdict(j, 'override', 'mod_virtuemart_cart'), 'PRUNE'); assert.equal(verdict(j, 'override', 'plg_content_vote'), 'PRUNE'); assert.equal(verdict(j, 'override', 'layouts'), 'KEEP');
  assert.equal(verdict(j, 'template', 'base'), 'PRUNE'); assert.equal(verdict(j, 'template', 'cassiopeia'), 'KEEP'); assert.equal(verdict(j, 'template', 'tb'), 'KEEP');
  assert.equal(verdict(j, 'css:styles', 'base'), 'PRUNE'); assert.equal(verdict(j, 'css:styles', 'tb'), 'KEEP');
  assert.equal(verdict(j, 'extension', 'component:com_claudecowork'), 'UNKNOWN'); assert.equal(verdict(j, 'secret', 'com_claudecowork'), 'PRUNE'); assert.equal(verdict(j, 'contract', 'com_claudecowork'), 'PRUNE');
  assert.equal(verdict(j, 'identity', 'author'), 'PRUNE'); assert.equal(verdict(j, 'identity', 'creationDate'), 'PRUNE'); assert.equal(verdict(j, 'identity', 'description text'), 'PRUNE');
  assert.equal(verdict(j, 'identity', 'template_preview.png'), 'PRUNE'); assert.equal(verdict(j, 'identity', 'template_thumbnail.png'), 'KEEP');
  rmSync(f.root, { recursive: true, force: true });
});

test('--apply removes only PRUNE paths and leaves extensions to the operator', () => {
  const f = fixture();
  const r = run(['--webroot', f.root, '--template', 'tb', '--data', f.facts, '--apply', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.ok(!existsSync(join(f.T, 'acm/hero'))); assert.ok(existsSync(join(f.T, 'acm/tb-hero')));
  assert.ok(!existsSync(join(f.T, 'etc/layout/default.json'))); assert.ok(existsSync(join(f.T, 'etc/layout/tb-home.json')));
  assert.ok(!existsSync(join(f.T, 'html/com_users'))); assert.ok(existsSync(join(f.T, 'html/com_content')));
  assert.ok(!existsSync(join(f.T, 'etc/presets')));
  assert.match(r.out, /extension:remove 3/);
  rmSync(f.root, { recursive: true, force: true });
});

test('without a base to compare against, identity is UNKNOWN rather than silently clean', () => {
  const f = fixture();
  const facts = JSON.parse(readFileSync(f.facts, 'utf8')); facts.baseManifest = null; writeFileSync(f.facts, JSON.stringify(facts));
  const r = run(['--webroot', f.root, '--template', 'tb', '--data', f.facts, '--json']);
  const j = r.json; assert.ok(j, r.out);
  assert.equal(verdict(j, 'identity', 'manifest'), 'UNKNOWN');
  assert.equal(verdict(j, 'identity', 'description text'), 'UNKNOWN');
  rmSync(f.root, { recursive: true, force: true });
});

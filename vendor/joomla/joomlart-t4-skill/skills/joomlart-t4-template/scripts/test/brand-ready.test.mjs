// brand-ready.mjs must refuse a template that has nowhere to put a customer's brand ("Customize your
// site": logo pair, favicon, name), fix the three mechanical gaps with --fix, and pass a template that
// carries the shared layer — which is the point: a template built with this skill is ready by
// construction. The logo element itself is rendered through PHP (when PHP is on the machine) for the
// four cases a customer can produce: a light/dark pair, a light logo only, no logo, the template's SVG.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

const here = dirname(fileURLToPath(import.meta.url));
const skill = join(here, '..', '..');
const script = join(here, '..', 'quickstart', 'brand-ready.mjs');
const layer = join(skill, 'assets', 'shared-layer');

const PROFILE = '{"site_name":"JA Demo","site_logo":"images\\/demo\\/logo.png#joomlaImage:\\/\\/local-images\\/demo\\/logo.png?width=276&height=85","site_logo_small":"","other_faviconFile":""}';

function template({ shared = false } = {}) {
  const T = join(mkdtempSync(join(tmpdir(), 'brand-ready-')), 'ja_demo');
  const mk = (p, c) => { mkdirSync(dirname(join(T, p)), { recursive: true }); writeFileSync(join(T, p), c); };
  mk('templateDetails.xml', '<?xml version="1.0"?>\n<extension type="template" client="site">\n  <name>ja_demo</name>\n  <config>\n    <fields name="typelist-site">\n    </fields>\n  </config>\n</extension>\n');
  mk('language/en-GB/en-GB.tpl_ja_demo.ini', 'TPL_JA_DEMO="Demo"\n');
  mk('language/en-GB/en-GB.tpl_ja_demo.sys.ini', 'TPL_JA_DEMO_XML_DESCRIPTION="Demo"\n');
  mk('etc/site/default.json', PROFILE);
  mk('etc/site/dark.json', '{}');
  mk('index.php', '<?php defined(\'_JEXEC\') or die; ?><html><head><jdoc:include type="metas" /></head></html>');
  if (shared) {
    const r = spawnSync('bash', [join(skill, 'scripts', 'install-shared-layer.sh'), '--template', T], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const css = sass.compile(join(layer, 'scss', '_chrome.scss'), { loadPaths: [join(layer, 'scss')] }).css;
    // A partner-logo strip is content, not the brand: its filter is not the owner's logo repainted.
    mk('css/template.css', `${css}\n.logo-strip img { filter: grayscale(1); }\n`);
  }
  return T;
}
const run = (args) => {
  const r = spawnSync(process.execPath, [script, ...args, '--json'], { encoding: 'utf8' });
  let json = null; try { json = JSON.parse(r.stdout); } catch { /* reported below */ }
  return { code: r.status, out: r.stdout + r.stderr, json };
};
const verdicts = (j) => Object.fromEntries(j.rows.map((r) => [r.check, r.verdict]));

test('a template with no place for the brand is NOT READY, row by row', () => {
  const T = template();
  writeFileSync(join(T, 'index.php'), '<?php ?><link rel="icon" href="templates/ja_demo/favicon.png">');
  mkdirSync(join(T, 'css'), { recursive: true });
  writeFileSync(join(T, 'css', 'darkmode.css'), 'html[data-theme="dark"] .navbar-brand img { filter: invert(1) brightness(2); }\nhtml.t4-dark .logo-image img { content: url(../images/logo-dark.svg); }\n');
  const r = run(['--template', T]);
  assert.equal(r.code, 1, r.out);
  const v = verdicts(r.json);
  for (const c of ['logo-pair', 'drawer-pair', 'logo-field', 'logo-strings', 'profile-keys', 'pair-css', 'logo-height', 'logo-css', 'favicon']) assert.equal(v[c], 'FAIL', c);
  assert.match(r.json.rows.find((x) => x.check === 'logo-css').detail, /darkmode\.css/);
});

test('a standalone error page linking the template icon is a NOTE, not a FAIL', () => {
  const T = template({ shared: true });
  writeFileSync(join(T, 'error.php'), '<?php ?><link href="<?php echo $this->baseurl; ?>/templates/ja_demo/favicon.ico" rel="shortcut icon" />');
  const r = run(['--template', T, '--fix']);
  assert.equal(r.code, 0, r.out);
  const rows = r.json.rows.filter((x) => x.check === 'favicon');
  assert.deepEqual(rows.map((x) => x.verdict), ['OK', 'NOTE']);
  assert.match(rows[1].detail, /error\.php/);
});

test('--fix writes the field, the strings and the profile keys, and keeps the profile bytes', () => {
  const T = template();
  const r = run(['--template', T, '--fix']);
  const v = verdicts(r.json);
  assert.equal(v['logo-field'], 'FIXED'); assert.equal(v['logo-strings'], 'FIXED'); assert.equal(v['profile-keys'], 'FIXED');
  const prof = readFileSync(join(T, 'etc/site/default.json'), 'utf8');
  assert.equal(prof, PROFILE.replace('"site_logo_small":""', '"site_logo_small":"","site_logo_dark":""'));
  assert.equal(JSON.parse(readFileSync(join(T, 'etc/site/dark.json'), 'utf8')).site_logo_dark, '');
  assert.match(readFileSync(join(T, 'templateDetails.xml'), 'utf8'), /<field name="site_logo_dark" type="media"/);
  const again = verdicts(run(['--template', T]).json);
  assert.equal(again['logo-field'], 'OK'); assert.equal(again['logo-strings'], 'OK'); assert.equal(again['profile-keys'], 'OK');
});

test('the shared layer + --fix makes a template READY by construction', () => {
  const T = template({ shared: true });
  const r = run(['--template', T, '--fix']);
  assert.equal(r.code, 0, r.out);
  const v = verdicts(r.json);
  for (const c of ['logo-pair', 'drawer-pair', 'pair-css', 'logo-height', 'logo-css', 'favicon']) assert.equal(v[c], 'OK', `${c}: ${r.out}`);
  assert.equal(run(['--template', T]).code, 0);
});

test('database rows: an untitled home and a typed copyright fail; the site name in titles and mod_footer pass', () => {
  const T = template({ shared: true });
  run(['--template', T, '--fix']);
  const dir = mkdtempSync(join(tmpdir(), 'brand-facts-'));
  const facts = (f) => { const p = join(dir, `${Math.random()}.json`); writeFileSync(p, JSON.stringify(f)); return p; };
  const bad = run(['--template', T, '--data', facts({
    homeItems: [{ id: 101, language: '*', params: '{"page_title":""}' }],
    modules: [{ id: 7, module: 'mod_custom', title: 'Footer copyright', content: '<p>© 2024 JA Demo Company</p>' }]
  })]);
  assert.equal(bad.code, 1, bad.out);
  const vb = verdicts(bad.json);
  assert.equal(vb['home-title'], 'FAIL'); assert.equal(vb.copyright, 'FAIL');
  const good = run(['--template', T, '--data', facts({
    homeItems: [{ id: 101, language: '*', params: '{"page_title":""}' }], sitenamePagetitles: 2,
    modules: [{ id: 8, module: 'mod_footer', title: 'Footer', content: '' }]
  })]);
  assert.equal(good.code, 0, good.out);
  const titled = run(['--template', T, '--data', facts({ homeItems: [{ id: 101, language: '*', params: '{"page_title":"Demo Company"}' }], modules: [] })]);
  assert.equal(verdicts(titled.json)['home-title'], 'OK');
});

test('--sql-cmd: rows read from the database command, prefix applied, MySQL batch escapes undone', () => {
  const T = template({ shared: true });
  run(['--template', T, '--fix']);
  const dir = mkdtempSync(join(tmpdir(), 'brand-sql-'));
  // A stand-in for `mysql -N -B`: answers each query by the table it names, and refuses the wrong prefix.
  writeFileSync(join(dir, 'db.mjs'), `let q = ''; process.stdin.on('data', (d) => (q += d)).on('end', () => {
  if (!q.includes('zz_')) process.exit(3);
  if (q.includes('zz_menu')) console.log('101\\t*\\t{"page_title":"","menu_text":1}');
  if (q.includes('zz_modules')) console.log('7\\tmod_custom\\tFooter\\t<p>Line one</p>\\\\n<p>&copy; 2024 Demo Co</p>');
});`);
  writeFileSync(join(dir, 'configuration.php'), "<?php class JConfig { public $sitename_pagetitles = '0'; }");
  const r = run(['--template', T, '--webroot', dir, '--prefix', 'zz_', '--sql-cmd', `${process.execPath} ${join(dir, 'db.mjs')}`]);
  assert.equal(r.code, 1, r.out);
  const v = verdicts(r.json);
  assert.equal(v['home-title'], 'FAIL'); assert.equal(v.copyright, 'FAIL');
  assert.match(r.json.rows.find((x) => x.check === 'copyright').detail, /7 "Footer"/);
});

// ── the logo element itself, rendered ──────────────────────────────────────────────────────────
const php = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0;
const HARNESS = `<?php
namespace Joomla\\CMS { class Factory { static function getApplication() { return new class { function get($k, $d = null) { return 'Config Name'; } }; } } }
namespace Joomla\\CMS\\Uri { class Uri { static function root($pathOnly = false) { return $pathOnly ? '' : 'http://x.test/'; } } }
namespace T4\\Helper { class Metadata { static function cleanImageURL($u) { return (object) ['url' => explode('#', $u)[0]]; } } }
namespace {
  define('_JEXEC', 1); define('JPATH_ROOT', $argv[1]);
  $s = json_decode($argv[3], true);
  $settings = new class($s) { function __construct(public array $s) {} function get($k, $d = null) { return $this->s[$k] ?? $d; } };
  $params = new class($settings) { function __construct(public $settings) {} function get($k) { return $this->settings; } };
  $displayData = (object) ['doc' => (object) ['params' => $params], 'params' => []];
  include $argv[2];
}
`;
function render(settings) {
  const root = mkdtempSync(join(tmpdir(), 'brand-logo-'));
  mkdirSync(join(root, 'images'), { recursive: true });
  writeFileSync(join(root, 'images', 'mark.svg'), '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M0 0h1v1z"/></svg>');
  writeFileSync(join(root, 'harness.php'), HARNESS);
  const r = spawnSync('php', [join(root, 'harness.php'), root, join(layer, 'html/layouts/t4/element/logo.php'), JSON.stringify({ site_name: 'Probe Bakery', ...settings })], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.replace(/\s+/g, ' ');
}

test('logo.php: a pair prints the light logo in .d-light and the dark one in .d-dark', { skip: !php && 'php not installed' }, () => {
  const h = render({ site_logo: 'images/light.png#joomlaImage://x', site_logo_dark: 'images/dark.png' });
  assert.match(h, /<span class="d-light"><img class="logo-img" src="\/images\/light\.png" alt="Probe Bakery"><\/span>/);
  assert.match(h, /<span class="d-dark"><img class="logo-img" src="\/images\/dark\.png" alt="Probe Bakery"><\/span>/);
});

test('logo.php: a light logo alone shows the name as text in dark mode, never the light logo', { skip: !php && 'php not installed' }, () => {
  const h = render({ site_logo: 'images/light.png', site_logo_dark: '' });
  assert.match(h, /<span class="d-dark"><span class="logo-title site-name">Probe Bakery<\/span><\/span>/);
  assert.equal((h.match(/light\.png/g) ?? []).length, 1);
});

test('logo.php: no logo shows the name in both modes, and a dark logo without a light one is ignored', { skip: !php && 'php not installed' }, () => {
  const h = render({ site_logo: '', site_logo_dark: 'images/dark.png' });
  assert.match(h, /logo-text/); assert.match(h, /<span class="logo-title site-name">Probe Bakery<\/span>/);
  assert.doesNotMatch(h, /<img/);
});

test('logo.php: the template\'s SVG mark is inlined until a dark logo is set, then the pair takes over', { skip: !php && 'php not installed' }, () => {
  assert.match(render({ site_logo: 'images/mark.svg' }), /<span class="tracy-logo"><svg /);
  const pair = render({ site_logo: 'images/mark.svg', site_logo_dark: 'images/dark.png', site_logo_small: 'images/s.png' });
  assert.doesNotMatch(pair, /tracy-logo/);
  assert.match(pair, /<span class="d-light"><img class="logo-img-sm d-block d-sm-none" src="\/images\/s\.png"[^>]*><img class="logo-img d-none d-sm-block" src="\/images\/mark\.svg"/);
  assert.match(pair, /<span class="d-dark"><img class="logo-img-sm d-block d-sm-none" src="\/images\/dark\.png"/);
});

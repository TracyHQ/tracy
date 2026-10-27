/**
 * inc/asset-version.php with real PHP and no WordPress: a theme stylesheet's `ver` carries the file's
 * modification time, so the address changes when a look change rewrites the file (V5S-2, stage 6
 * acceptance v5 R05: `sections.css?ver=1.1.2` stayed cached ~10 minutes after the file changed).
 *
 *   node --test packages/cms/tracy-wordpress-theme/test/asset-version.test.mjs
 */
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHP_SKIP = phpSupport().skip

let php
before(() => {
  if (!PHP_SKIP) php = startPhp({ files: { cwd: PKG, paths: ['src/tracy/inc/asset-version.php'] } })
})
after(() => php?.stop())

/**
 * A parent theme and a child theme in a temporary directory, the handful of WordPress functions the
 * filter reads, then each step of `steps` (`{ src }` runs the filter; `{ write, bytes, mtime }`
 * rewrites a file and sets its modification time) — one output per `src` step.
 */
const PROBE = `
define('ABSPATH', '/');
$in   = json_decode(stream_get_contents(STDIN), true);
$base = sys_get_temp_dir() . '/tracy-asset-version-' . getmypid();
foreach (array('parent/assets/css', 'child/assets/css') as $d) { @mkdir("$base/$d", 0777, true); }
function get_stylesheet_directory_uri() { return 'https://site.example/wp-content/themes/child'; }
function get_stylesheet_directory() { return $GLOBALS['base'] . '/child'; }
function get_template_directory_uri() { return 'https://site.example/wp-content/themes/parent'; }
function get_template_directory() { return $GLOBALS['base'] . '/parent'; }
function wp_parse_url($url, $component = -1) { return parse_url((string) $url, $component); }
function add_query_arg($key, $value, $url) {
  $parts = explode('?', $url, 2);
  parse_str($parts[1] ?? '', $q);
  $q[$key] = $value;
  return $parts[0] . '?' . http_build_query($q);
}
function add_filter($name, $callback) { $GLOBALS['filters'][$name][] = $callback; }
require $in['file'];
$out = array();
foreach ($in['steps'] as $step) {
  if (isset($step['write'])) {
    file_put_contents("$base/" . $step['write'], $step['bytes']);
    touch("$base/" . $step['write'], $step['mtime']);
    clearstatcache();
    continue;
  }
  $src = $step['src'];
  foreach ($GLOBALS['filters']['style_loader_src'] ?? array() as $f) { $src = $f($src); }
  $out[] = $src;
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
`

function filter(steps) {
  const input = JSON.stringify({ file: path.join(php.root, 'src/tracy/inc/asset-version.php'), steps })
  const [out] = php.run([{ args: ['-r', PROBE], input }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  return JSON.parse(out.stdout)
}

const SECTIONS = 'https://site.example/wp-content/themes/parent/assets/css/sections.css?ver=1.1.2'

test('🔒 a look change that rewrites a theme stylesheet changes the address the page names (V5S-2)', {
  skip: PHP_SKIP
}, () => {
  const [before, afterWrite, afterUndo] = filter([
    { write: 'parent/assets/css/sections.css', bytes: 'h2{font-size:39.6px}', mtime: 1759200000 },
    { src: SECTIONS },
    { write: 'parent/assets/css/sections.css', bytes: 'h2{font-size:35.64px}', mtime: 1759200600 },
    { src: SECTIONS },
    // An undo puts the old bytes back; the address still moves, so no cache serves the copy between.
    { write: 'parent/assets/css/sections.css', bytes: 'h2{font-size:39.6px}', mtime: 1759201200 },
    { src: SECTIONS }
  ])
  assert.equal(before, `${SECTIONS}-1759200000`)
  assert.equal(afterWrite, `${SECTIONS}-1759200600`)
  assert.equal(afterUndo, `${SECTIONS}-1759201200`)
})

test('a child theme sheet reads its own file; no ver gets the time alone; the rest of the query stays', {
  skip: PHP_SKIP
}, () => {
  const got = filter([
    { write: 'child/assets/css/extra.css', bytes: 'a{}', mtime: 1759000000 },
    { src: 'https://site.example/wp-content/themes/child/assets/css/extra.css?ver=2.0.0&media=print' },
    { src: 'https://site.example/wp-content/themes/child/assets/css/extra.css' }
  ])
  assert.deepEqual(got, [
    'https://site.example/wp-content/themes/child/assets/css/extra.css?ver=2.0.0-1759000000&media=print',
    'https://site.example/wp-content/themes/child/assets/css/extra.css?ver=1759000000'
  ])
})

test('core, plugin and external sheets, a missing file and a path climbing out pass through untouched', {
  skip: PHP_SKIP
}, () => {
  const untouched = [
    'https://site.example/wp-includes/css/dist/block-library/style.min.css?ver=7.0',
    'https://site.example/wp-content/plugins/contact-form-7/includes/css/styles.css?ver=6.1',
    'https://fonts.example/css2?family=Inter',
    'https://site.example/wp-content/themes/parent/assets/css/missing.css?ver=1.1.2',
    'https://site.example/wp-content/themes/parent/../child/assets/css/extra.css?ver=1.1.2',
    'https://site.example/wp-content/themes/parent-other/style.css?ver=1'
  ]
  assert.deepEqual(filter(untouched.map((src) => ({ src }))), untouched)
})

test('every built theme loads the filter from functions.php and ships the same file', () => {
  const source = readFileSync(path.join(PKG, 'src', 'tracy', 'inc', 'asset-version.php'), 'utf8')
  const themes = readdirSync(path.join(PKG, 'src'), { withFileTypes: true }).filter((e) => e.isDirectory())
  assert.ok(themes.length >= 5)
  for (const { name } of themes) {
    const functions = readFileSync(path.join(PKG, 'src', name, 'functions.php'), 'utf8')
    assert.match(functions, /require_once __DIR__ \. '\/inc\/asset-version\.php';/, `${name}/functions.php`)
    const copy = readFileSync(path.join(PKG, 'src', name, 'inc', 'asset-version.php'), 'utf8')
    assert.equal(
      copy.replace(/@package [\w-]+/, ''),
      source.replace(/@package [\w-]+/, ''),
      `${name}/inc/asset-version.php`
    )
  }
})

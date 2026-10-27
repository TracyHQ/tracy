/**
 * The pure half of `dev-fleet.mjs`: what a site's compose file says, which CMS a site folder holds,
 * and where a Joomla site's write door is. `dev-fleet.mjs` itself starts a server on import, so the
 * parts a test can hold live in `dev-fleet-site.mjs`.
 *
 *   node --test scripts/test/dev-fleet-site.test.mjs
 */
import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { composeFor, componentDoor, platformOf, portOf, wordpressLanguageCall } from '../dev-fleet-site.mjs'

test('a WordPress site keeps the shape the agent tools read: web + cli, webroot at .webroot, site folder at /site/<label>', () => {
  const yml = composeFor('wordpress', 'shop', 8181, '/site', {})
  assert.match(yml, /^name: shop$/m)
  assert.match(yml, /image: wordpress:apache/)
  assert.match(yml, /image: wordpress:cli/)
  assert.match(yml, /127\.0\.0\.1:8181:80/)
  assert.match(yml, /\/site\/shop\/\.webroot:\/var\/www\/html/)
  assert.match(yml, /\/site\/shop:\/site\/shop/)
})

test('a Joomla site runs the image the fleet uses, the tr_ prefix the token read expects, and the cowork package rides the installer', () => {
  const yml = composeFor('joomla', 'shop', 8182, '/site', { extensions: 'https://example.test/pkg.zip' })
  assert.match(yml, /image: joomla:6-apache/)
  assert.match(yml, /JOOMLA_DB_PREFIX: tr_/)
  assert.match(yml, /JOOMLA_EXTENSIONS_URLS: https:\/\/example\.test\/pkg\.zip/)
  assert.match(yml, /127\.0\.0\.1:8182:80/)
  assert.match(yml, /\/site\/shop\/\.webroot:\/var\/www\/html/)
  assert.match(yml, /\/site\/shop:\/site\/shop/)
  assert.doesNotMatch(yml, /wordpress/)
})

test('a platform nobody builds here is refused by name', () => {
  assert.throws(() => composeFor('emdash', 'x', 1, '/site', {}), /emdash/)
})

test('the CMS of a site folder is read off the file its installer wrote', () => {
  const root = mkdtempSync(join(tmpdir(), 'dev-fleet-'))
  mkdirSync(join(root, 'wp', '.webroot'), { recursive: true })
  writeFileSync(join(root, 'wp', '.webroot', 'wp-config.php'), '<?php')
  mkdirSync(join(root, 'j', '.webroot'), { recursive: true })
  writeFileSync(join(root, 'j', '.webroot', 'configuration.php'), '<?php')
  mkdirSync(join(root, 'empty', '.webroot'), { recursive: true })
  assert.equal(platformOf(join(root, 'wp')), 'wordpress')
  assert.equal(platformOf(join(root, 'j')), 'joomla')
  assert.equal(platformOf(join(root, 'empty')), null)
})

test('the port a site answers on is read back from its own compose file', () => {
  assert.equal(portOf(composeFor('joomla', 'shop', 8190, '/site', {})), 8190)
  assert.equal(portOf('services: {}'), null)
})

test('the Joomla write door is the component endpoint the seat registry relays to', () => {
  assert.equal(
    componentDoor(8190),
    'http://127.0.0.1:8190/index.php?option=com_claudecowork&task=api.exec&format=json'
  )
})

// ── The stand-in for the WordPress plugin's `content.language` ────────────────────────────────────
//
// The PHP it hands to `wp eval` runs here against a fake Polylang (predefined rows as Polylang
// ships them), the same way the plugin's own tests hold the fixed door. Real PHP, not a string
// match: a stand-in that differs from the plugin is how local runs stop matching the fleet.

const PHP_IMAGE = 'php:8.3-cli-alpine'
const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).status === 0
const LOCAL_PHP = has('php')
const DOCKER_RUNS =
  !LOCAL_PHP &&
  has('docker') &&
  spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'ignore' }).status === 0

const FAKE_POLYLANG = `
class PLL_Settings { static function get_predefined_languages() { return [
  'en_US' => ['code' => 'en', 'name' => 'English', 'flag' => 'us'],
  'en_GB' => ['code' => 'en', 'name' => 'English', 'flag' => 'gb'],
  'de_DE' => ['code' => 'de', 'name' => 'Deutsch', 'flag' => 'de'],
  'de_AT' => ['code' => 'de', 'name' => 'Deutsch', 'flag' => 'at'],
  'pt_BR' => ['code' => 'pt', 'name' => 'Português do Brasil', 'flag' => 'br'],
  'pt_PT' => ['code' => 'pt', 'name' => 'Português', 'flag' => 'pt'],
  'vi' => ['code' => 'vi', 'name' => 'Tiếng Việt', 'flag' => 'vn'],
  'zh_CN' => ['code' => 'zh', 'name' => '中文 (中国)', 'flag' => 'cn'],
  'zh_TW' => ['code' => 'zh', 'name' => '中文 (台灣)', 'flag' => 'tw'],
]; } }
final class FakeLanguages { public $added = []; function add($a) { $GLOBALS['langs'][] = $a['slug']; $this->added[] = $a; return true; } }
final class FakeModel { public $languages; function __construct() { $this->languages = new FakeLanguages(); } }
final class FakePll { public $model; function __construct() { $this->model = new FakeModel(); } }
function PLL() { static $p = null; if ($p === null) { $p = new FakePll(); } return $p; }
function is_wp_error($x) { return false; }
function pll_languages_list() { return $GLOBALS['langs']; }
function pll_set_post_language($id, $slug) { $GLOBALS['posts'][$id] = $slug; }
function pll_save_post_translations($t) { $GLOBALS['saved'] = $t; }
`

/**
 * The stand-in's PHP for each named case, on a site whose Polylang already has `existing`, run in
 * ONE php process (a `docker run` each, without a local php, was most of this file's time). Each
 * case starts from a reset fake (languages, posts, saved translations, recorded adds) and its
 * output is buffered, so nothing one case does reaches the next.
 * @param {Record<string, {params: object, existing?: string[]}>} cases
 * @returns {Record<string, object>} per case: the door's refusal, or what the PHP said and did.
 */
function runLanguageDoors(cases) {
  const results = {}
  let script =
    `<?php $results = [];\n` +
    FAKE_POLYLANG +
    `function run_case($name, $existing, $body) {\n` +
    `  global $results;\n` +
    `  $GLOBALS['langs'] = $existing; $GLOBALS['posts'] = []; $GLOBALS['saved'] = null;\n` +
    `  PLL()->model->languages->added = [];\n` +
    `  ob_start(); $body(); $said = ob_get_clean();\n` +
    `  $results[$name] = ['said' => $said, 'added' => PLL()->model->languages->added, 'posts' => $GLOBALS['posts'], 'saved' => $GLOBALS['saved']];\n` +
    `}\n`
  for (const [name, { params, existing = [] }] of Object.entries(cases)) {
    const call = wordpressLanguageCall(params)
    if ('refusal' in call) {
      results[name] = { refusal: call.refusal }
      continue
    }
    script += `run_case(${JSON.stringify(name)}, ${JSON.stringify(existing)}, function () { ${call.php} });\n`
  }
  script += `echo json_encode($results);`
  const out = LOCAL_PHP
    ? spawnSync('php', [], { input: script, encoding: 'utf8' })
    : DOCKER_RUNS
      ? spawnSync('docker', ['run', '--rm', '-i', PHP_IMAGE, 'php'], { input: script, encoding: 'utf8' })
      : null
  assert.ok(out, 'the stand-in is PHP and this host can run neither: no `php` on PATH, and no docker daemon')
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  return { ...results, ...JSON.parse(out.stdout) }
}

const LANGUAGE_CASES = {
  portugueseSlug: {
    params: { id: 5, lang: 'pt-br', locale: 'pt_BR', translations: { en: 4, 'pt-br': 5 } },
    existing: ['en']
  },
  reuse: { params: { id: 7, lang: 'de', locale: 'de_DE', translations: {} }, existing: ['de'] },
  longReused: {
    params: { id: 8, lang: 'vi-vn', translations: { en: 1, 'vi-vn': 8 } },
    existing: ['en', 'vi']
  },
  longCreated: { params: { id: 9, lang: 'vi-vn', translations: {} }, existing: ['en'] },
  switcherPlaces: {
    params: { id: 2, lang: 'de', translations: { en: 1, de: 2, vi: 3, 'pt-br': 4 } },
    existing: ['en']
  },
  bareDefault: { params: { id: 1, lang: 'de', translations: {} } },
  fullVariant: { params: { id: 2, lang: 'pt-pt', translations: {} } },
  ambiguousPt: { params: { id: 3, lang: 'en', translations: { en: 2, pt: 3 } } },
  ambiguousZh: { params: { id: 3, lang: 'zh', translations: {} } }
}
/** @type {Record<string, any>} */
let door
before(() => {
  door = runLanguageDoors(LANGUAGE_CASES)
})

test('language door stand-in: a Portuguese slug is the full code Tracy sent, and an exact locale is taken as sent', () => {
  const r = door.portugueseSlug
  assert.equal(r.said, 'OK')
  assert.deepEqual(
    r.added.map((a) => [a.slug, a.locale, a.name, a.flag]),
    [['pt-br', 'pt_BR', 'Português do Brasil', 'br']]
  )
  assert.deepEqual(r.posts, { 5: 'pt-br' })
  assert.deepEqual(r.saved, { en: 4, 'pt-br': 5 })
})

test('language door stand-in: a language already on the site is reused as it is, no second copy', () => {
  const r = door.reuse
  assert.equal(r.said, 'OK')
  assert.deepEqual(r.added, [])
  assert.deepEqual(r.posts, { 7: 'de' })
})

test('language door stand-in: a language sent long is the short one — reused when the site has it, created at the short slug when not', () => {
  const reused = door.longReused
  assert.equal(reused.said, 'OK')
  assert.deepEqual(reused.added, [])
  assert.deepEqual(reused.posts, { 8: 'vi' })
  assert.deepEqual(reused.saved, { en: 1, vi: 8 })
  const created = door.longCreated
  assert.deepEqual(
    created.added.map((a) => [a.slug, a.locale]),
    [['vi', 'vi']]
  )
  assert.deepEqual(created.posts, { 9: 'vi' })
})

test('language door stand-in: languages created in one call take increasing switcher places after the existing ones', () => {
  const r = door.switcherPlaces
  assert.equal(r.said, 'OK')
  assert.deepEqual(
    r.added.map((a) => [a.slug, a.term_group]),
    [
      ['de', 1],
      ['vi', 2],
      ['pt-br', 3]
    ]
  )
})

test('language door stand-in: with no locale, a bare code gets the default table and a full code its own variant', () => {
  assert.deepEqual(
    door.bareDefault.added.map((a) => a.locale),
    ['de_DE']
  )
  assert.deepEqual(
    door.fullVariant.added.map((a) => [a.slug, a.locale]),
    [['pt-pt', 'pt_PT']]
  )
})

test('language door stand-in: a bare pt with no locale is refused naming both variants, and nothing is written', () => {
  const r = door.ambiguousPt
  assert.match(r.said, /"pt" names more than one language \(pt-br, pt-pt\)/)
  assert.deepEqual(r.added, [])
  assert.deepEqual(r.posts, [])
})

test('language door stand-in: a bare zh with no locale is refused naming both variants, and nothing is written', () => {
  const r = door.ambiguousZh
  assert.match(r.said, /"zh" names more than one language \(zh-cn, zh-tw\)/)
  assert.deepEqual(r.added, [])
  assert.deepEqual(r.posts, [])
})

test('language door stand-in: a locale that is not a WordPress locale, or a key that is not a code, never reaches PHP', () => {
  assert.match(wordpressLanguageCall({ id: 1, lang: 'vi', locale: "vi'; x" }).refusal, /WordPress locale/)
  assert.match(
    wordpressLanguageCall({ id: 1, lang: 'vi', translations: { 'v i': 1 } }).refusal,
    /language code/
  )
  assert.match(wordpressLanguageCall({ id: 0, lang: 'vi' }).refusal, /id required/)
})

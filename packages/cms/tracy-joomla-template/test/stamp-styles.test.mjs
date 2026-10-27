/**
 * `tpl_tracy_stamp_styles()` (resolve.php) with real PHP and a stand-in asset manager: every active
 * stylesheet of the template gets its file's modification time as its version, so a look change that
 * rewrites the file changes the address the page names (V5S-2, stage 6 acceptance v5 R05).
 *
 *   node --test packages/cms/tracy-joomla-template/test/stamp-styles.test.mjs
 *
 * The stand-in has exactly the WebAssetManager / WebAssetItem methods the function calls, with
 * Joomla's meaning: `registerStyle` under an existing name replaces that asset, and an asset declared
 * without a version reports `auto`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHP_SKIP = phpSupport().skip

let php
before(() => {
  if (!PHP_SKIP) php = startPhp({ files: { cwd: PKG, paths: ['src/tpl_tracy/resolve.php'] } })
})
after(() => php?.stop())

const PROBE = `
define('_JEXEC', 1);
$in   = json_decode(stream_get_contents(STDIN), true);
$root = sys_get_temp_dir() . '/tracy-stamp-' . getmypid();
foreach ($in['files'] as $rel => $mtime) {
  @mkdir(dirname("$root/$rel"), 0777, true);
  file_put_contents("$root/$rel", 'x');
  touch("$root/$rel", $mtime);
}
final class FakeAsset {
  public function __construct(public string $name, public string $uri, public string $version, public array $options, public array $attributes, public array $deps) {}
  public function getName(): string { return $this->name; }
  public function getUri($resolve = true): string { return $this->uri; }
  public function getVersion(): string { return $this->version; }
  public function getOptions(): array { return $this->options; }
  public function getAttributes(): array { return $this->attributes; }
  public function getDependencies(): array { return $this->deps; }
}
final class FakeWa {
  public array $assets = array();
  public function getAssets(string $type): array { return $type === 'style' ? $this->assets : array(); }
  public function registerStyle($name, $uri = '', $options = array(), $attributes = array(), $deps = array()) {
    $version = array_key_exists('version', $options) ? (string) $options['version'] : 'auto';
    unset($options['version']);
    $this->assets[$name] = new FakeAsset($name, $uri, $version, $options, $attributes, $deps);
    return $this;
  }
}
require $in['file'];
$wa = new FakeWa();
foreach ($in['assets'] as $a) {
  $wa->assets[$a['name']] = new FakeAsset($a['name'], $a['uri'], $a['version'] ?? 'auto', $a['options'] ?? array(), $a['attributes'] ?? array(), $a['deps'] ?? array());
}
tpl_tracy_stamp_styles($wa, $root);
$out = array();
foreach ($wa->assets as $name => $a) {
  $out[$name] = array('uri' => $a->uri, 'version' => $a->version, 'options' => $a->options, 'deps' => $a->deps);
}
echo json_encode($out, JSON_UNESCAPED_SLASHES);
`

function stamp(files, assets) {
  const input = JSON.stringify({ file: path.join(php.root, 'src/tpl_tracy/resolve.php'), files, assets })
  const [out] = php.run([{ args: ['-r', PROBE], input }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  return JSON.parse(out.stdout)
}

const MEDIA = 'media/templates/site/tpl_tracy/css'

test('🔒 a template stylesheet gets its file time as version, and a rewrite moves it (V5S-2)', {
  skip: PHP_SKIP
}, () => {
  const assets = [
    { name: 'template.tracy', uri: 'tracy.css', options: { assetSource: 'x' } },
    { name: 'template.sections', uri: 'sections.css', deps: ['template.tracy'] },
    {
      name: 'template.inspiration',
      uri: `${MEDIA}/inspirations/apple.css`,
      version: '0.1.0',
      deps: ['template.tracy']
    }
  ]
  const first = stamp(
    {
      [`${MEDIA}/tracy.css`]: 1759200000,
      [`${MEDIA}/sections.css`]: 1759200000,
      [`${MEDIA}/inspirations/apple.css`]: 1759100000
    },
    assets
  )
  assert.deepEqual(first['template.tracy'], {
    uri: 'tracy.css',
    version: '1759200000',
    options: { assetSource: 'x' },
    deps: []
  })
  assert.deepEqual(first['template.sections'], {
    uri: 'sections.css',
    version: '1759200000',
    options: [],
    deps: ['template.tracy']
  })
  assert.equal(first['template.inspiration'].version, '0.1.0-1759100000')
  // The look change rewrote sections.css: its address moves, the untouched sheet's does not.
  const second = stamp(
    {
      [`${MEDIA}/tracy.css`]: 1759200000,
      [`${MEDIA}/sections.css`]: 1759200600,
      [`${MEDIA}/inspirations/apple.css`]: 1759100000
    },
    assets
  )
  assert.equal(second['template.sections'].version, '1759200600')
  assert.equal(second['template.tracy'].version, '1759200000')
})

test('core, extension and external sheets, a missing file and a path climbing out are left alone', {
  skip: PHP_SKIP
}, () => {
  const assets = [
    { name: 'fontawesome', uri: 'system/joomla-fontawesome.css' },
    { name: 'cdn', uri: 'https://fonts.example/css2?family=Inter' },
    { name: 'gone', uri: 'gone.css' },
    { name: 'climb', uri: `${MEDIA}/../../../../../configuration.css` }
  ]
  const got = stamp({ 'media/system/css/joomla-fontawesome.css': 1759000000 }, assets)
  for (const a of assets) assert.equal(got[a.name].version, 'auto', a.name)
})

test('index.php and component.php stamp last, after every sheet is registered', () => {
  for (const file of ['index.php', 'component.php']) {
    const php = readFileSync(path.join(PKG, 'src', 'tpl_tracy', file), 'utf8')
    const at = php.indexOf('tpl_tracy_stamp_styles($wa, JPATH_ROOT);')
    assert.ok(at > 0, `${file} calls tpl_tracy_stamp_styles`)
    const head = php.slice(0, php.indexOf('?>'))
    assert.ok(
      head.lastIndexOf('registerAndUseStyle(') < at,
      `${file}: no sheet is registered after the stamp`
    )
    assert.ok(head.lastIndexOf('useStyle(') < at, `${file}: no sheet is used after the stamp`)
  }
})

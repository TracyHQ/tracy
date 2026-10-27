/**
 * inc/variations.php with real PHP and no WordPress: where a variation is read from (theme first,
 * then uploads) and which systems the site may wear (shipped rows plus the rows Tracy wrote).
 *
 *   node --test packages/cms/tracy-wordpress-theme/test/variations.test.mjs
 *
 * A brand's look is made at build time and cannot live in the theme directory (an update replaces
 * it), so `tracy_apply_inspiration()` falls back to `<uploads>/tracy/styles/<id>.json`, and the
 * catalogue merges `<uploads>/tracy/inspirations.json` (ADR 0023). PHP on PATH, else the
 * `php:8.3-cli` image with the fixture tarred in on stdin — the same two roads as render.test.mjs.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHP_IMAGE = 'php:8.3-cli'
const has = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).status === 0
const LOCAL_PHP = has('php')
const DOCKER_RUNS =
  !LOCAL_PHP && has('docker') && spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0

/** A stand-in for the three WordPress functions the helpers touch, then the helpers themselves. */
const probe = (base) => `<?php
define('ABSPATH', '/');
function get_theme_file_path(string $f): string { return ${JSON.stringify(base)} . '/theme/' . $f; }
function wp_upload_dir(): array { return array('basedir' => ${JSON.stringify(base)} . '/uploads'); }
function wp_json_file_decode(string $file, array $o = array()) { return json_decode((string) file_get_contents($file), true); }
require ${JSON.stringify(base)} . '/variations.php';
echo json_encode(array(
  'shipped' => tracy_variation_file('apple'),
  'written' => tracy_variation_file('brand-acme-com'),
  'nowhere' => tracy_variation_file('stripe'),
  'systems' => tracy_inspirations_merged(array('apple' => array('name' => 'Apple', 'category' => 'x', 'nav' => 'top-left', 'hero' => 'split', 'dark' => true))),
));
`

test('a variation is read from the theme first, then from uploads/tracy/styles; the catalogue merges uploads/tracy/inspirations.json', {
  skip: LOCAL_PHP || DOCKER_RUNS ? false : 'no php on PATH and no docker daemon'
}, () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-variations-'))
  mkdirSync(path.join(dir, 'theme', 'styles'), { recursive: true })
  mkdirSync(path.join(dir, 'uploads', 'tracy', 'styles'), { recursive: true })
  writeFileSync(path.join(dir, 'theme', 'styles', 'apple.json'), '{}')
  writeFileSync(path.join(dir, 'uploads', 'tracy', 'styles', 'brand-acme-com.json'), '{}')
  writeFileSync(
    path.join(dir, 'uploads', 'tracy', 'inspirations.json'),
    JSON.stringify({
      systems: {
        'brand-acme-com': { name: 'Acme', category: 'Brand', nav: 'top-left', hero: 'split', dark: false },
        apple: { name: 'Apple (written)', category: 'x', nav: 'centered', hero: 'cover', dark: false },
        'Bad Id': { name: 'nope' },
        nameless: {}
      }
    })
  )
  copyFileSync(path.join(PKG, 'src', 'tracy', 'inc', 'variations.php'), path.join(dir, 'variations.php'))
  const base = LOCAL_PHP ? dir : '/pkg'
  writeFileSync(path.join(dir, 'probe.php'), probe(base))
  const out = LOCAL_PHP
    ? spawnSync('php', [path.join(dir, 'probe.php')], { encoding: 'utf8' })
    : spawnSync(
        'docker',
        ['run', '--rm', '-i', PHP_IMAGE, 'sh', '-c', 'mkdir /pkg && tar -x -C /pkg && php /pkg/probe.php'],
        {
          encoding: 'utf8',
          input: spawnSync('tar', ['-c', '-C', dir, '.'], {
            env: { ...process.env, COPYFILE_DISABLE: '1' },
            maxBuffer: 16 * 1024 * 1024
          }).stdout
        }
      )
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  const got = JSON.parse(out.stdout)
  assert.equal(got.shipped, `${base}/theme/styles/apple.json`)
  assert.equal(got.written, `${base}/uploads/tracy/styles/brand-acme-com.json`)
  assert.equal(got.nowhere, null)
  assert.deepEqual(
    Object.keys(got.systems).sort(),
    ['apple', 'brand-acme-com'],
    'a bad id and a nameless row are ignored'
  )
  assert.equal(got.systems.apple.name, 'Apple (written)', 'a written row wins over the shipped one')
  assert.equal(got.systems['brand-acme-com'].category, 'Brand')
})

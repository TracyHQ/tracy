// The affected map: plan §5 blast radius, no empty selection, every tracked top-level entry classified.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { LAYERS } from '../build.mjs'
import { globToRegExp, loadMap, selectLayers, validateMap } from '../affected.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const map = loadMap()

describe('map shape', () => {
  test('the committed map validates', () => assert.deepEqual(validateMap(map), []))
  test('invalid maps are rejected with a reason', () => {
    const rule = { id: 'r', globs: ['a/**'], layers: ['api'], reason: 'why', source: 's' }
    const base = { unknown: map.unknown, rules: [rule] }
    assert.deepEqual(validateMap(base), [])
    assert.match(validateMap({ ...base, rules: [{ ...rule, globs: ['**'] }] }).join(), /catch-all/)
    assert.match(validateMap({ ...base, rules: [{ ...rule, globs: ['**/*'] }] }).join(), /catch-all/)
    assert.match(validateMap({ ...base, rules: [{ ...rule, layers: ['nope'] }] }).join(), /unknown layer/)
    assert.match(validateMap({ ...base, rules: [{ ...rule, reason: '' }] }).join(), /reason/)
    assert.match(validateMap({ ...base, rules: [{ ...rule, source: undefined }] }).join(), /source/)
    assert.match(validateMap({ ...base, rules: [rule, rule] }).join(), /duplicate/)
    assert.match(validateMap({ ...base, rules: [{ ...rule, layers: [] }] }).join(), /layers/)
    assert.match(validateMap({ rules: [rule] }).join(), /unknown\.layers/)
    assert.match(validateMap({ ...base, rules: [] }).join(), /non-empty/)
  })
  test('no rule of the committed map is a catch-all', () => {
    for (const r of map.rules)
      for (const g of r.globs) assert.ok(!['**', '**/*', '*', '*/**'].includes(g), `${r.id}: ${g}`)
  })
  test('globs behave: ** crosses directories, * does not, braces and ? work', () => {
    const t = (g, p) => globToRegExp(g).test(p)
    assert.ok(t('a/**', 'a/b/c.js'))
    assert.ok(!t('a/**', 'b/a/c.js'))
    assert.ok(t('**/Dockerfile', 'x/y/Dockerfile'))
    assert.ok(t('**/Dockerfile', 'Dockerfile'))
    assert.ok(t('a/*.js', 'a/b.js'))
    assert.ok(!t('a/*.js', 'a/b/c.js'))
    assert.ok(t('a/{x,y}.js', 'a/y.js'))
    assert.ok(!t('a/{x,y}.js', 'a/z.js'))
    assert.ok(t('a/?.js', 'a/b.js'))
    assert.ok(!t('a/?.js', 'a/bb.js'))
    assert.ok(!t('a.b', 'aXb'), 'dots are literal')
  })
})

describe('plan §5 blast radius', () => {
  const need = (path, layers) => {
    const got = selectLayers([path], map)
    assert.equal(got.perPath[0].unknown, false, `${path} must be classified`)
    for (const l of layers)
      assert.ok(got.layers.includes(l), `${path} must pull ${l}, got ${got.layers.join(',')}`)
    return got
  }
  test('session / seats / identity -> api, flows, harness, mail', () => {
    for (const p of [
      'apps/tracy-web/src/lib/session.js',
      'apps/tracy-web/src/seats/route.js',
      'apps/tracy-web/src/identity/route.js'
    ])
      need(p, ['api', 'flows', 'harness', 'mail'])
  })
  test('tokens / UI / locale -> ui + flows', () => {
    for (const p of [
      'packages/ui/tracy-ui/src/tokens.css',
      'packages/locale/tracy-locale-vi/vi/x.json',
      'apps/tracy-web/src/lib/i18n/strings.js',
      'packages/core/tracy-core/src/ui-switches/catalogue.json'
    ])
      need(p, ['ui', 'flows'])
  })
  test('native bundle / dsh pin / passwords -> harness, ui, flows, infra', () => {
    for (const p of [
      'packages/bundle/tracy-native/cordis.patch.yml',
      'vendor/tracy/deepseek-harness',
      'vendor/tracy/dsh-passwords/src/index.ts',
      'tch/profiles/native/package.json'
    ])
      need(p, ['harness', 'ui', 'flows', 'infra'])
  })
  test('fleet / host / Dockerfile / deploy -> infra, cms, flows', () => {
    for (const p of [
      'packages/fleet/tracy-fleet-operation/dsh/Dockerfile',
      'apps/tracy-host/src/app.js',
      'deploy/compose.yml',
      'apps/tracy-web/Dockerfile'
    ])
      need(p, ['infra', 'cms', 'flows'])
  })
  test('CMS contract / release -> cms, related, api, harness, flows', () => {
    for (const p of [
      'apps/tracy-web/src/lib/release-assets.js',
      'apps/tracy-web/src/quickstarts.json',
      'vendor/wordpress/tracy-wordpress-theme/x.php',
      'packages/cms/tracy-cms-sections/x.ts'
    ])
      need(p, ['cms', 'related', 'api', 'harness', 'flows'])
  })
  test('QA runner and schema -> every layer plus the selftest', () => {
    const got = need('tests/qa/contracts/case.schema.json', LAYERS)
    assert.ok(got.extras.includes('selftest'))
    assert.ok(need('tests/qa/lib/x.mjs', LAYERS).extras.includes('selftest'))
  })
  test("a layer's own files pull only that layer", () => {
    assert.deepEqual(selectLayers(['tests/qa/layers/mail/cases/a.json'], map).layers, ['mail'])
  })
  test('a specific rule is not shadowed by its directory fallback', () => {
    const got = selectLayers(['apps/tracy-web/src/seats/route.js'], map)
    assert.deepEqual(
      got.layers,
      ['api', 'flows', 'harness', 'mail'],
      'fallback `web-doors` (api, ui, flows) must not add ui'
    )
    assert.deepEqual(
      selectLayers(['apps/tracy-web/src/other/x.js'], map).layers,
      ['api', 'ui', 'flows'],
      'with no specific rule the fallback applies'
    )
  })
  test('several paths union their layers and explain each choice', () => {
    const got = selectLayers(['apps/tracy-web/src/seats/route.js', 'docs/adr/0001-x.md'], map)
    assert.deepEqual(got.layers, ['static', 'api', 'flows', 'harness', 'mail'])
    assert.equal(got.perPath.length, 2)
    assert.ok(got.perPath.every((p) => p.reason.length > 0 && p.rules.length > 0))
  })
})

describe('unknown paths widen, never narrow', () => {
  test('an unclassified path selects every layer and is listed as unknown', () => {
    const got = selectLayers(['brand-new-dir/file.txt'], map)
    assert.deepEqual(got.layers, LAYERS)
    assert.deepEqual(got.unknown, ['brand-new-dir/file.txt'])
  })
  test('empty, absolute and traversing paths are unknown, not silently dropped', () => {
    for (const p of ['', '/etc/passwd', '../outside', 'a/../../b']) {
      const got = selectLayers([p], map)
      assert.deepEqual(got.layers, LAYERS, p)
      assert.equal(got.perPath[0].unknown, true)
    }
  })
  test('asking about no paths is an error, not an empty selection', () => {
    assert.throws(() => selectLayers([], map), /no paths/)
    assert.throws(() => selectLayers(undefined, map), /no paths/)
  })
  test('no known path ever gets an empty layer list', () => {
    for (const p of [
      'README.md',
      'tests/qa/inventory/build.mjs',
      '.dev-logs/x.log',
      'gitpush-noti/x',
      'docs/a.md',
      'tasks/b.md',
      '.github/workflows/c.yml'
    ])
      assert.ok(selectLayers([p], map).layers.length > 0, p)
  })
})

describe('every tracked path is classified, top-level directories (hidden ones too) and files included', () => {
  const git = (...args) =>
    execFileSync('git', ['-C', REPO, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  const tracked = git('ls-files', '-z').split('\0').filter(Boolean)
  const top = new Set(tracked.map((f) => f.split('/')[0]))
  const dirs = git('ls-tree', '-d', '--name-only', 'HEAD').split('\n').filter(Boolean)
  test('git reports tracked entries (the test is not vacuous)', () => {
    assert.ok(tracked.length > 1000)
    for (const d of ['apps', 'packages', 'vendor', 'scripts', 'deploy', '.github', '.agents'])
      assert.ok(top.has(d), d)
  })
  test('each top-level directory has at least one glob rooted in it', () => {
    const roots = new Set(map.rules.flatMap((r) => r.globs.map((g) => g.split('/')[0])))
    for (const d of dirs) assert.ok(roots.has(d), `top-level directory "${d}" has no glob`)
  })
  test('no tracked file is unknown (a new directory fails here until the map classifies it)', () => {
    const unknown = selectLayers(tracked, map)
      .perPath.filter((p) => p.unknown)
      .map((p) => p.path)
    assert.deepEqual(unknown.slice(0, 10), [], `${unknown.length} tracked path(s) match no rule`)
  })
})

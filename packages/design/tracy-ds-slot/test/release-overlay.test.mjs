// release-batch.mjs builds a batch of releases from fixed template sources in one run: an overlay path
// with {slug} names one folder per release (TEXT-1 batch 2, 21/10/2026), and `overlays` lays each
// template's changed source files out as the webroot paths release-joomla.mjs copies.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { overlayOf, overlayProblem, sourceOverlay } from '../src/release-overlay.mjs'

const BATCH = fileURLToPath(new URL('../scripts/release-batch.mjs', import.meta.url))

test('one overlay folder serves one release; a {slug} path serves a batch', () => {
  assert.equal(overlayProblem(null, 8), null)
  assert.equal(overlayProblem('/o/ja-seven', 1), null)
  assert.match(String(overlayProblem('/o/ja-seven', 2)), /put \{slug\} in its path/)
  assert.equal(overlayProblem('/o/{slug}', 8), null)
  assert.equal(overlayOf('/o/{slug}/x', 'ja-nova'), '/o/ja-nova/x')
  assert.equal(overlayOf('/o/ja-seven', 'ja-seven'), '/o/ja-seven')
})

test("a template's source files map to its webroot folder, other templates' files left out", () => {
  const changed = [
    'products/joomlart/paid-templates/ja_seven/source/css/template.css',
    'products/joomlart/paid-templates/ja_seven/source/scss/_ds-bootstrap-roles.scss',
    'products/joomlart/paid-templates/ja_seventeen/source/css/template.css',
    'products/joomlart/paid-templates/ja_seven/docs/README.md'
  ]
  assert.deepEqual(sourceOverlay(changed, 'ja_seven'), [
    { from: changed[0], to: 'templates/ja_seven/css/template.css' },
    { from: changed[1], to: 'templates/ja_seven/scss/_ds-bootstrap-roles.scss' }
  ])
})

test('release-batch refuses one overlay folder for two releases', () => {
  const r = spawnSync(
    process.execPath,
    [BATCH, 'build', '--out', tmpdir(), '--overlay', '/nowhere', 'ja-seven', 'ja-nova'],
    { encoding: 'utf8' }
  )
  assert.equal(r.status, 1)
  assert.match(r.stderr, /one folder for 2 releases/)
})

test('release-batch overlays copies each changed source file, working tree included', () => {
  const work = mkdtempSync(join(tmpdir(), 'release-overlay-'))
  try {
    const repo = join(work, 'products-repo')
    const src = join(repo, 'products/joomlart/paid-templates/ja_fixture/source/css')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'template.css'), 'a{color:red}\n')
    writeFileSync(join(src, 'kept.css'), 'b{}\n')
    const git = (...a) => spawnSync('git', a, { cwd: repo, encoding: 'utf8' })
    git('init', '-q')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base')
    writeFileSync(join(src, 'template.css'), 'a{color:var(--ds-c-danger-text, red)}\n')
    const out = join(work, 'out')
    const r = spawnSync(
      process.execPath,
      [BATCH, 'overlays', '--out', out, '--products', repo, '--base', 'HEAD', 'ja-fixture'],
      { encoding: 'utf8' }
    )
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout.trim()).files, ['templates/ja_fixture/css/template.css'])
    assert.equal(
      readFileSync(join(out, 'overlay/ja-fixture/templates/ja_fixture/css/template.css'), 'utf8'),
      'a{color:var(--ds-c-danger-text, red)}\n'
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})

// The real-run harness's own logic: argument contract, exact asset selection, historical hash handling,
// failure judgement and cleanup. gh is a stub script; no network, no archive is read.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFECTS, expectedHash, judgeFailure, parse, selectAssets } from './source-font-real.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HARNESS = path.join(HERE, 'source-font-real.mjs')
const scratch = () => mkdtempSync(path.join(process.env.TRACY_TEST_SCRATCH ?? tmpdir(), 'sfr-test-'))
const base = ['--mode', 'static', '--gh', 'gh', '--repo', 'o/r', '--release', 'quickstart/ja-spa/j6', '--version', '1.0.2', '--expect', 'fail', '--artifact-root', '/x']

test('arguments: one release, one version, one outcome per run', () => {
  assert.equal(parse(base).version, '1.0.2')
  assert.equal(parse(base.map((v) => (v === '1.0.2' ? 'current-pin' : v))).version, 'current-pin')
  assert.throws(() => parse([...base, '--release', 'quickstart/ja-nova/j6']), /twice/)
  assert.throws(() => parse(base.filter((v, i) => !(v === '--expect' || base[i - 1] === '--expect'))), /--expect is required/)
  assert.throws(() => parse(base.map((v) => (v === 'fail' ? 'either' : v))), /pass or fail/)
  assert.throws(() => parse(base.map((v) => (v === '1.0.2' ? 'latest' : v))), /--version/)
  assert.throws(() => parse(base.map((v) => (v === 'static' ? 'browser' : v))), /--site/)
})

test('assets: exactly the named version, never a neighbour or another release', () => {
  const names = ['ja-spa-j6-webroot-1.0.2.tar.gz', 'ja-spa-j6-database-1.0.2.sql.gz', 'ja-spa-j6-webroot-1.0.4.tar.gz', 'ja-spa-j6-webroot-1.0.20.tar.gz', 'ja-spa-j6-webroot-1x0x2.tar.gz', 'ja-nova-j6-webroot-1.0.2.tar.gz']
  const got = selectAssets(names.map((name) => ({ name })), 'ja-spa-j6', '1.0.2').map((a) => a.name)
  assert.deepEqual(got, ['ja-spa-j6-webroot-1.0.2.tar.gz', 'ja-spa-j6-database-1.0.2.sql.gz'])
  assert.throws(() => selectAssets(names.map((name) => ({ name })), 'ja-spa-j6', '1.0.3'), /no ja-spa-j6-webroot-1\.0\.3/)
  assert.deepEqual(selectAssets([{ name: 'ja-nova-j6-quickstart-1.0.5.zip' }], 'ja-nova-j6', '1.0.5').length, 1)
})

test('hashes: SHA256SUMS history, else the digest recorded for the asset, else none — never the current manifest', () => {
  const h1 = 'a'.repeat(64)
  const h2 = 'b'.repeat(64)
  const sums = `${h1}  ja-spa-j6-webroot-1.0.2.tar.gz\n${h2}  ja-spa-j6-webroot-1.0.4.tar.gz\n`
  assert.deepEqual(expectedHash('ja-spa-j6-webroot-1.0.2.tar.gz', sums, { digest: `sha256:${h2}` }), { sha256: h1, from: 'SHA256SUMS' })
  assert.equal(expectedHash('ja-spa-j6-webroot-1.0.4.tar.gz', sums, null).sha256, h2)
  assert.equal(expectedHash('x.zip', sums, { digest: `sha256:${h1}` }).sha256, h1)
  assert.equal(expectedHash('x.zip', null, {}), null)
  assert.equal(expectedHash('x.zip', null, { digest: 'md5:zz' }), null)
  assert.throws(() => expectedHash('x.zip', `${h1}  x.zip\n${h2}  x.zip\n`, null), /different hashes/)
})

test('failure judgement: the expected finding, naming the SOURCE, a file and a key', () => {
  const f = { code: 'family-never-loaded', role: 'body', file: 'templates/ja_spa/etc/theme/default.json', jsonKey: 'body_font_family', family: 'Muli', style: { id: 13 }, key: 'k', message: 'SOURCE template ja_spa (style #13, site profile logo-light): Muli' }
  const want = DEFECTS['quickstart/ja-spa/j6@1.0.2']
  assert.equal(judgeFailure([f], want), null)
  assert.match(judgeFailure([], want), /no finding/)
  assert.match(judgeFailure([{ ...f, style: { id: 14 } }], want), /no family-never-loaded/)
  assert.match(judgeFailure([{ ...f, family: 'Mulish' }], want), /no family-never-loaded/)
  assert.match(judgeFailure([{ ...f, message: 'logo-light Muli' }], want), /SOURCE/)
  assert.match(judgeFailure([{ ...f, jsonKey: null }], want), /file\/key/)
  assert.equal(judgeFailure([f], undefined), null)
  assert.match(judgeFailure([{ ...f, file: null }], undefined), /file or page/)
  for (const k of ['quickstart/ja-essence/j6@1.0.3', 'quickstart/ja-voyara/j6@1.0.5']) assert.ok(DEFECTS[k].file && DEFECTS[k].jsonKey)
})

test('run: an unreachable release fails the run, names the cause and leaves no download directory', () => {
  const dir = scratch()
  try {
    const gh = path.join(dir, 'gh')
    writeFileSync(gh, '#!/bin/sh\necho "gh: unreachable" >&2\nexit 4\n')
    chmodSync(gh, 0o755)
    const root = path.join(dir, 'art')
    const tmp = process.env.TMPDIR
    const r = spawnSync(process.execPath, [HARNESS, ...base.map((v) => (v === 'gh' ? gh : v === '/x' ? root : v))], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stdout, /RESULT FAIL/)
    assert.match(r.stdout, /exited 4/)
    assert.deepEqual(readdirSync(root).filter((n) => n.startsWith('sf-real-')), [])
    assert.equal(process.env.TMPDIR, tmp)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('run: a version the release does not publish fails before anything is downloaded; each invocation is its own outcome', () => {
  const dir = scratch()
  try {
    const gh = path.join(dir, 'gh')
    writeFileSync(gh, `#!/bin/sh\nif [ "$2" = view ]; then echo '{"assets":[{"name":"ja-spa-j6-webroot-1.0.4.tar.gz"}]}'; exit 0; fi\necho "unexpected: $*" >&2; exit 9\n`)
    chmodSync(gh, 0o755)
    const root = path.join(dir, 'art')
    const r = spawnSync(process.execPath, [HARNESS, ...base.map((v) => (v === 'gh' ? gh : v === '/x' ? root : v))], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stdout, /no ja-spa-j6-webroot-1\.0\.2/)
    assert.ok(!/unexpected/.test(r.stdout))
    assert.ok(existsSync(root))
    assert.deepEqual(readdirSync(root).filter((n) => n.startsWith('sf-real-')), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

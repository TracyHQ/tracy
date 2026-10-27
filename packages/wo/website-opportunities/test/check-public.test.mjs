// The public-leak scanner (scripts/check-public.mjs). Switching this repository public exposes every commit, so the
// scanner must catch a leak in the tree, in packed output and in a pushed commit range. Every sample that must be
// caught is assembled from fragments, so this file never holds a literal the scanner would flag.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanText } from '../scripts/check-public.mjs'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-public.mjs')
const j = (...parts) => parts.join('')

const rulesOf = (text, path = 'src/x.js') => scanText(path, text).map((f) => f.rule)

const MUST_CATCH = [
  ['vietnamese', j('const label = "Tìm quán ', '\u0103n"')],
  ['vietnamese', j('// ch', '\u01b0a xong')],
  ['internal-name', j('see https://www.joom', 'lart.com/')],
  ['internal-name', j('JoomlA', 'rt templates')],
  ['internal-name', j('http://shop.tracy', '.test:8080/')],
  ['internal-name', j('https://cowork.tr', 'acy.site/ops')],
  ['internal-name', j('https://foo.tracy', '.site/')],
  ['internal-name', j('github.com/Tracy', 'HQ/tch/pull/1')],
  ['internal-name', j('see tas', 'ks/todo-wo-opensource.md')],
  ['internal-name', j('/Users/', 'jdoe/x')],
  ['internal-host', j('ssh mac', 'studio')],
  ['internal-host', j('ssh mac', 'mini-wifi')],
  ['internal-host', j('docker --context im', 'ac')],
  ['internal-host', j('ssh j-', 'ecosys')],
  ['internal-host', j('ssh j-', 'general-demo')],
  ['person', j('asked by Bri', 'an')],
  ['person', j('Le', 'e approved')],
  ['person', j('Ak', 'emi said')],
  ['person', j('author: davidd', '-lgtm')],
  ['private-ip', j('http://10', '.20.30.40:51710')],
  ['private-ip', j('host 172', '.20.3.4')],
  ['private-ip', j('192', '.168.7.20')],
  ['public-ip', j('ssh ubuntu@11', '.22.33.44')],
  ['secret', j('AKIA', 'IOSFODNN7EXAMPLE')],
  ['secret', j('token = "ghp_', 'a'.repeat(36), '"')],
  ['secret', j('github_pat_', '11ABCDEFG0', 'x'.repeat(60))],
  ['secret', j('key=AIza', 'SyA1b2C3d4E5f6G7h8', 'I9j0K1l2M3n4O5p6Q')],
  ['secret', j('sk_li', 've_', '4eC39HqLyjW', 'DarjtT1zdp7dc')],
  ['secret', j('-----BEGIN OPENSSH PRIV', 'ATE KEY-----')],
  ['secret', j('-----BEGIN PRIV', 'ATE KEY-----')],
  ['high-entropy', j('const k = "Zx8Qp', '2Lm9Vr4Tb7Nw', '1Kc6Hs3Jd5Fg0Ya"')]
]

const MUST_PASS = [
  'Find places that need a better website.',
  'Café crème à la française, señor, über', // other languages' accents are not Vietnamese
  'Tracy builds the demo at https://tracy.ai/wo',
  'listen on 127.0.0.1 and 0.0.0.0; example 192.0.2.10; metadata 169.254.169.254',
  'version 1.2.3, semver 10.4.0-rc.1',
  'Leeds and Brianna are not people names here; "imaculate" is not a host',
  'tasks.push(job); this.tasks/2',
  'sha256 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  'integrity aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'const sk = process.env.STRIPE_KEY // sk_live_ prefix check only',
  'j-query and j-cards are not host aliases'
]

for (const [rule, text] of MUST_CATCH) {
  test(`catches ${rule}: ${text.slice(0, 40)}`, () => {
    assert.ok(rulesOf(text).includes(rule), `expected ${rule} in ${JSON.stringify(rulesOf(text))}`)
  })
}

for (const text of MUST_PASS) {
  test(`passes clean text: ${text.slice(0, 40)}`, () => {
    assert.deepEqual(scanText('src/x.js', text), [])
  })
}

test('an npm lockfile integrity hash is not a key, but a key elsewhere in the lockfile still is', () => {
  const hash =
    'sha512-' +
    [
      'Ka7FkPn3Qx9L',
      'z2Rb8Wm4Tc6Y',
      'v1Hs5Ju0Ge7D',
      'd3Aa2Bb9Cc4E',
      'e8Ff1Gg6Hh5I',
      'i0Jj7Kk2Ll3M',
      'm'
    ].join('') +
    '=='
  const lock = `{\n  "node_modules/x": {\n    "integrity": "${hash}"\n  }\n}\n`
  assert.deepEqual(scanText('package-lock.json', lock), [])
  const key = ['Zx8Qw2Er5', 'Ty7Ui1Op3', 'As6Df9Gh4', 'Jk0Lz'].join('')
  const leaked = `{\n  "note": "${key}"\n}\n`
  assert.equal(scanText('package-lock.json', leaked).length, 1)
})

test('a Google place id is a public identifier, not a key', () => {
  const placeId = 'ChIJ' + ['N1t_tDeuEmsR', 'UsoyG83frY4'].join('')
  assert.deepEqual(scanText('t.test.mjs', `const id = '${placeId}'\n`), [])
})

test('reports the line number of each finding', () => {
  const findings = scanText('src/a.js', j('ok\nok\nssh mac', 'mini\n'))
  assert.deepEqual(
    findings.map((f) => [f.path, f.line, f.rule]),
    [['src/a.js', 3, 'internal-host']]
  )
})

test('flags a tracked env or key file by its path', () => {
  assert.deepEqual(rulesOf('A=1', '.env'), ['secret-file'])
  assert.deepEqual(rulesOf('A=1', 'deploy/.env.production'), ['secret-file'])
  assert.deepEqual(rulesOf('x', 'keys/id_ed25519'), ['secret-file'])
  assert.deepEqual(rulesOf('A=', '.env.example'), [])
})

// --- CLI over a real tree and a real history ---------------------------------------------------

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout.trim()
}

function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'check-public-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'ci@example.com')
  git(dir, 'config', 'user.name', 'CI')
  git(dir, 'config', 'commit.gpgsign', 'false')
  write(dir, files)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', 'feat: start')
  return dir
}

function write(dir, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true })
    writeFileSync(join(dir, name), text)
  }
}

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

test('cli: a clean tree exits 0', () => {
  const dir = repo({ 'src/a.js': 'export const a = 1\n', 'scripts/check-public.allow': '' })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 0, r.out)
})

test('cli: a leak exits 1 with file:line and the rule', () => {
  const dir = repo({ 'src/a.js': j('// one\n// ask Bri', 'an\n'), 'scripts/check-public.allow': '' })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /src\/a\.js:2 person/)
})

test('cli: an allowlist entry with a reason silences exactly that finding', () => {
  const allow = j('src/guard.js | private-ip | 10.0', '.0.1 | the SSRF guard test needs a private address\n')
  const dir = repo({
    'src/guard.js': j('block("10.0', '.0.1")\nblock("192.168', '.0.1")\n'),
    'scripts/check-public.allow': allow
  })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 1)
  assert.doesNotMatch(r.out, /guard\.js:1 /)
  assert.match(r.out, /guard\.js:2 private-ip/)
})

test('cli: an allowlist entry without a reason is refused', () => {
  const dir = repo({ 'src/a.js': 'x\n', 'scripts/check-public.allow': 'src/a.js | person | * |\n' })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /reason/)
})

test('cli: an allowlist entry that matches nothing is reported stale', () => {
  const dir = repo({ 'src/a.js': 'x\n', 'scripts/check-public.allow': 'src/a.js | person | * | old case\n' })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /stale/)
})

test('cli: a tracked .env file fails the tree scan', () => {
  const dir = repo({ '.env': 'X=1\n', 'scripts/check-public.allow': '' })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /\.env:0 secret-file/)
})

test('cli: --history catches a leak that a later commit deleted', () => {
  const dir = repo({ 'src/a.js': 'x\n', 'scripts/check-public.allow': '' })
  const base = git(dir, 'rev-parse', 'HEAD')
  write(dir, { 'src/a.js': j('x\nconst key = "AKIA', 'IOSFODNN7EXAMPLE"\n') })
  git(dir, 'commit', '-q', '-am', 'feat: add key')
  write(dir, { 'src/a.js': 'x\n' })
  git(dir, 'commit', '-q', '-am', 'fix: drop key')
  assert.equal(run(dir, '--root', dir).code, 0)
  const r = run(dir, '--root', dir, '--history', `${base}..HEAD`)
  assert.equal(r.code, 1)
  assert.match(r.out, /src\/a\.js:2 secret/)
})

test('cli: --history scans commit messages', () => {
  const dir = repo({ 'src/a.js': 'x\n', 'scripts/check-public.allow': '' })
  const base = git(dir, 'rev-parse', 'HEAD')
  write(dir, { 'src/a.js': 'y\n' })
  git(dir, 'commit', '-q', '-am', j('fix: as Bri', 'an asked'))
  const r = run(dir, '--root', dir, '--history', `${base}..HEAD`)
  assert.equal(r.code, 1)
  assert.match(r.out, /commit message person/)
})

test('cli: --dir scans a plain folder such as packed output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-public-dir-'))
  write(dir, { 'package/src/a.js': j('// xin chào b', '\u1ea1n\n') })
  const r = run(dir, '--dir', join(dir, 'package'))
  assert.equal(r.code, 1)
  assert.match(r.out, /src\/a\.js:1 vietnamese/)
})

test('cli: the allowlist quotes what it allows without flagging itself, but its reasons are scanned', () => {
  const ip = j('10.0', '.0.1')
  const dir = repo({
    'src/guard.js': `block("${ip}")\n`,
    'scripts/check-public.allow': `src/guard.js | private-ip | ${ip} | the guard test\n`
  })
  assert.equal(run(dir, '--root', dir).code, 0)
  write(dir, {
    'scripts/check-public.allow': `src/guard.js | private-ip | ${ip} | ${j('Bri', 'an')} asked\n`
  })
  const r = run(dir, '--root', dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /check-public\.allow:1 person/)
})

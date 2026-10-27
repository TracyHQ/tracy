import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'

import { createHash } from 'node:crypto'

import { compilePolicy, loadPolicy, scanRef } from '../opensource/scan.mjs'

const EMPTY_POLICY = { exclude: [], allow: [] }

function repoWith(files, { symlinks = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'os-scan-'))
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' })
  git('init', '-q')
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  for (const [path, target] of Object.entries(symlinks)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    symlinkSync(target, join(dir, path))
  }
  git('add', '-A')
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-qm', 'init')
  return dir
}

const scan = (repo, policy = EMPTY_POLICY) => scanRef({ repo, ref: 'HEAD', policy, gitleaks: false })
const hitsOf = (report, category) => report.hits.filter((h) => h.category === category)

test('a personal email is a blocking hit; reserved example domains are not', async () => {
  const repo = repoWith({
    'src/a.js': 'const to = "jane.doe@gmail.com"\nconst ok = "x@example.com"\nconst t = "a@x.test"\n'
  })
  const report = await scan(repo)
  const emails = hitsOf(report, 'email')
  assert.deepEqual(
    emails.map((h) => [h.path, h.line, h.match]),
    [['src/a.js', 1, 'jane.doe@gmail.com']]
  )
  assert.equal(report.blocking, 1)
})

test('excluded paths are not scanned; an allow entry clears a hit and records its reason', async () => {
  const repo = repoWith({
    'tasks/plan.md': 'ping ops@acme-real.com\n',
    'vendor/theme/demo.html': '<a href="mailto:sales@northgate-ind.ru">x</a>\n',
    'src/b.js': 'send("sales@northgate-ind.ru")\n'
  })
  const policy = {
    exclude: ['tasks/'],
    allow: [
      {
        path: 'vendor/theme/**',
        category: 'email',
        match: '@northgate-ind\\.ru$',
        kind: 'third-party-content',
        reason: 'fictional company in the template demo content'
      }
    ]
  }
  const report = await scan(repo, policy)
  const emails = hitsOf(report, 'email')
  assert.deepEqual(
    emails.map((h) => [h.path, h.allowed?.kind ?? null]),
    [
      ['src/b.js', null],
      ['vendor/theme/demo.html', 'third-party-content']
    ]
  )
  assert.equal(report.blocking, 1)
})

test('an email in a copyright or author notice is kept as attribution, not a blocking hit', async () => {
  const repo = repoWith({
    'vendor/lib/LICENSE': 'Copyright (c) 2020 Jane Doe <jane@janedoe.dev>\n',
    'vendor/lib/package.json': '{\n  "author": "Jane Doe <jane@janedoe.dev>"\n}\n',
    'vendor/lib/index.js': '/* contact jane@janedoe.dev for access */\n'
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'email').map((h) => [h.path, h.allowed?.kind ?? null]),
    [
      ['vendor/lib/LICENSE', 'attribution'],
      ['vendor/lib/index.js', null],
      ['vendor/lib/package.json', 'attribution']
    ]
  )
  assert.equal(report.blocking, 1)
})

test('loadPolicy rejects an allow entry without a reason or with an unknown kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'os-policy-'))
  const write = (allow) => {
    const p = join(dir, `p${Math.random()}.json`)
    writeFileSync(p, JSON.stringify({ exclude: [], allow }))
    return p
  }
  assert.throws(() => loadPolicy(write([{ path: 'a', category: 'email', kind: 'placeholder' }])), /reason/)
  assert.throws(() => loadPolicy(write([{ path: 'a', category: 'email', kind: 'ops', reason: 'x' }])), /kind/)
  assert.doesNotThrow(() =>
    loadPolicy(write([{ path: 'a', category: 'email', kind: 'placeholder', reason: 'x' }]))
  )
})

const sha = (s) => createHash('sha256').update(s).digest('hex')

test('loadPolicy refuses a secret allow that does not pin exact values on one exact path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'os-policy-'))
  const write = (allow) => {
    const p = join(dir, `p${Math.random()}.json`)
    writeFileSync(p, JSON.stringify({ exclude: [], allow }))
    return p
  }
  const base = { category: 'secret', kind: 'placeholder', reason: 'fake key in a test' }
  assert.throws(() => loadPolicy(write([{ ...base, path: 'test/a.js' }])), /secretSha256/)
  assert.throws(() => loadPolicy(write([{ ...base, path: 'test/a.js', secretSha256: [] }])), /secretSha256/)
  assert.throws(
    () => loadPolicy(write([{ ...base, path: 'test/a.js', secretSha256: ['not-a-hash'] }])),
    /secretSha256/
  )
  assert.throws(
    () => loadPolicy(write([{ ...base, path: 'test/**', secretSha256: [sha('x')] }])),
    /exact path/
  )
  assert.doesNotThrow(() => loadPolicy(write([{ ...base, path: 'test/a.js', secretSha256: [sha('x')] }])))
})

test('a secret allow clears only the pinned value: a new secret in the same file and rule blocks', () => {
  const rules = compilePolicy({
    exclude: [],
    allow: [
      {
        path: 'test/fixture.js',
        category: 'secret',
        match: '^(generic-api-key)$',
        secretSha256: [sha('fake-known-value')],
        kind: 'placeholder',
        reason: 'fake key in a test'
      }
    ]
  })
  const hit = (value) => ({
    category: 'secret',
    path: 'test/fixture.js',
    match: 'generic-api-key',
    secretSha256: sha(value)
  })
  assert.equal(rules.allowFor(hit('fake-known-value'))?.kind, 'placeholder')
  assert.equal(rules.allowFor(hit('a-new-real-looking-value')), undefined)
  assert.equal(rules.allowFor({ ...hit('fake-known-value'), path: 'src/other.js' }), undefined)
  assert.equal(rules.allowFor({ ...hit('fake-known-value'), secretSha256: undefined }), undefined)
})

test('a sealed-artifact allow clears only the pinned value it names', async () => {
  const repo = repoWith({
    'contracts/x/1.0.0/manifest.json':
      '{"url": "http://192.168.100.175:5178/a.tar.gz",\n "other": "http://10.1.2.3/b"}\n'
  })
  const policy = {
    exclude: [],
    allow: [
      {
        path: 'contracts/x/1.0.0/manifest.json',
        category: 'ip',
        match: '^192\\.168\\.100\\.175$',
        kind: 'sealed-artifact',
        reason: 'sha256-pinned manifest of a released quickstart'
      }
    ]
  }
  const ips = hitsOf(await scan(repo, policy), 'ip')
  assert.deepEqual(
    ips.map((h) => [h.match, h.allowed?.kind ?? null]),
    [
      ['192.168.100.175', 'sealed-artifact'],
      ['10.1.2.3', null]
    ]
  )
})

test('public and private IPs are hits; documentation ranges, loopback, CIDR blocks and versions are not', async () => {
  const repo = repoWith({
    'deploy/a.sh': [
      'ssh ubuntu@11.22.33.44',
      'HOST=192.168.50.60',
      'peer 10.20.30.40:22',
      'doc 203.0.113.7 and 198.51.100.2 and 192.0.2.10',
      'local 127.0.0.1 and 0.0.0.0',
      'block 10.0.0.0/8 and 172.16.0.0/12',
      'version 1.2.3.4.5 and v4.0.0.1',
      'mask 255.255.255.0'
    ].join('\n')
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'ip').map((h) => [h.line, h.match]),
    [
      [1, '11.22.33.44'],
      [2, '192.168.50.60'],
      [3, '10.20.30.40']
    ]
  )
})

test('machine paths are hits unless the user name is a placeholder', async () => {
  const repo = repoWith({
    'scripts/x.sh': 'cd /Users/somebody/TCH\nls /Volumes/BACKUP/data\nsee /Users/you/project\n'
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'machine-path').map((h) => h.match),
    ['/Users/somebody', '/Volumes/BACKUP']
  )
})

test('a home folder in its dash-escaped form is a machine path; a placeholder user is not', async () => {
  const at = (user) => ['', 'private', 'tmp', 'agent-1', `-Users-${user}-repo`, 'log'].join('/')
  const repo = repoWith({ 'results/run.jsonl': `${at('jdoe')}\n${at('you')}\nbuild-Users-guide.md\n` })
  assert.deepEqual(
    hitsOf(await scan(repo), 'machine-path').map((h) => [h.line, h.match]),
    [[1, '-Users-jdoe']]
  )
})

test('a real AWS account id in an ECR host or ARN is a hit; the documented example account is not', async () => {
  const id = ['4012', '3456', '7890'].join('')
  const repo = repoWith({
    'ci/a.yml': [
      `image: ${id}.dkr.ecr.us-east-1.amazonaws.com/app:1`,
      `role: arn:aws:iam::${id}:role/ci`,
      'image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/app:1',
      `order ${id} is not an account`
    ].join('\n')
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'cloud-account').map((h) => [h.line, h.match]),
    [
      [1, id],
      [2, id]
    ]
  )
  assert.equal(report.blocking, 2)
})

test('Vietnamese text is counted per file in its own category and does not fail the scan', async () => {
  const repo = repoWith({
    'docs/a.md': '# Tiêu đề\nĐây là tài liệu.\nplain english line\n',
    'src/b.js': '// Không dịch\n'
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'vietnamese').map((h) => [h.path, h.count]),
    [
      ['docs/a.md', 2],
      ['src/b.js', 1]
    ]
  )
  assert.equal(report.blocking, 0)
})

test('a phone number that could be real is a hit in test data; reserved and made-up shapes are not', async () => {
  // Assembled from fragments so this file does not hold a dialable number itself.
  const real = ['+971 58 ', '596 9', '059'].join('')
  const realE164 = ['+9112', '4401', '0021'].join('')
  const realWa = ['wa.me/8490', '7890', '268'].join('')
  const repo = repoWith({
    'apps/web/test/brief.test.mjs': [
      `phone: '${real}'`,
      `tel: '${realE164}'`,
      `link: 'https://${realWa}'`,
      "us: '+1 202 555 0160', uk: '+44 20 7946 0321', zeros: '+84 235 0000 777'",
      "straight: '+971 4 123 4567', short: '+84 123', date: '2026-10-24', version: 'v+1.2.3'"
    ].join('\n'),
    'packages/x/test/fixtures/page.html': `<a href="tel:${realE164}">call</a>\n`,
    'src/copy.js': `const sample = '${real}'\n`
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'phone').map((h) => [h.path, h.line, h.match]),
    [
      ['apps/web/test/brief.test.mjs', 1, real],
      ['apps/web/test/brief.test.mjs', 2, realE164],
      ['apps/web/test/brief.test.mjs', 3, realWa],
      ['packages/x/test/fixtures/page.html', 1, realE164]
    ]
  )
  assert.equal(report.blocking, 4)
})

test('archives, source maps, LFS pointers and symlinks are reported as files to review', async () => {
  const repo = repoWith(
    {
      'vendor/t/pkg.zip': 'PK\x03\x04fake',
      'fixtures/dump.sql': 'INSERT INTO t VALUES (1);\n',
      'lib/client.js': `x()\n//# ${['sourceMappingURL', 'data:'].join('=')}application/json;base64,eyJ9\n`,
      'lib/client.js.map': '{"version":3}',
      'media/big.psd': 'version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 12\n'
    },
    { symlinks: { 'AGENTS.md': 'CLAUDE.md' } }
  )
  const report = await scan(repo)
  const byCategory = (c) => hitsOf(report, c).map((h) => h.path)
  assert.deepEqual(byCategory('archive'), ['fixtures/dump.sql', 'vendor/t/pkg.zip'])
  assert.deepEqual(byCategory('source-map'), ['lib/client.js', 'lib/client.js.map'])
  assert.deepEqual(byCategory('lfs-pointer'), ['media/big.psd'])
  assert.deepEqual(
    hitsOf(report, 'symlink').map((h) => [h.path, h.match]),
    [['AGENTS.md', 'CLAUDE.md']]
  )
})

test('a submodule is reported with the commit it pins', async () => {
  const inner = repoWith({ 'a.txt': 'x\n' })
  const repo = repoWith({ 'README.md': 'hi\n' })
  execFileSync(
    'git',
    ['-C', repo, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', inner, 'vendor/sub'],
    { stdio: 'pipe' }
  )
  execFileSync('git', [
    '-C',
    repo,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@example.com',
    'commit',
    '-qm',
    'sub'
  ])
  const report = await scan(repo)
  const subs = hitsOf(report, 'submodule')
  assert.equal(subs.length, 1)
  assert.equal(subs[0].path, 'vendor/sub')
  assert.match(subs[0].match, /^[0-9a-f]{40}$/)
})

// Built at runtime so this file is not itself a finding.
const FAKE_GITHUB_TOKEN = ['ghp', 'R8x2Kq9LmZ4vT7nB3cW6yH1pD5sF0gJ8aE2u'].join('_')

// Only an explicit binary: the default one under scripts/opensource/.bin is git-ignored, so a suite
// that probed it would read a file no task hash can cover (turbo-config).
const GITLEAKS_PATH = process.env.GITLEAKS_BIN ?? ''

test('gitleaks findings are blocking secret hits, redacted, and honour exclusions', {
  skip:
    !(GITLEAKS_PATH && existsSync(GITLEAKS_PATH)) &&
    'set GITLEAKS_BIN (node scripts/opensource/install-gitleaks.mjs)'
}, async () => {
  const repo = repoWith({
    'src/config.js': `export const token = "${FAKE_GITHUB_TOKEN}"\n`,
    'tasks/notes.md': `token ${FAKE_GITHUB_TOKEN}\n`
  })
  const report = await scanRef({
    repo,
    ref: 'HEAD',
    policy: { exclude: ['tasks/'], allow: [] },
    gitleaks: GITLEAKS_PATH
  })
  const secrets = hitsOf(report, 'secret')
  assert.deepEqual(
    secrets.map((h) => [h.path, h.line]),
    [['src/config.js', 1]]
  )
  assert.ok(!JSON.stringify(report).includes(FAKE_GITHUB_TOKEN), 'the secret value never reaches the report')
  assert.equal(report.gitleaks.version, '8.28.0')
})

const needGitleaks = {
  skip:
    !(GITLEAKS_PATH && existsSync(GITLEAKS_PATH)) &&
    'set GITLEAKS_BIN (node scripts/opensource/install-gitleaks.mjs)'
}

test('gitleaks: a new secret inside an allowed fixture file is still blocked', needGitleaks, async () => {
  const known = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_')
  const repo = repoWith({
    'test/fixture.js': `export const a = "${known}"\nexport const b = "${FAKE_GITHUB_TOKEN}"\n`
  })
  const policy = {
    exclude: [],
    allow: [
      {
        path: 'test/fixture.js',
        category: 'secret',
        secretSha256: [sha(known)],
        kind: 'placeholder',
        reason: 'fake token in a test'
      }
    ]
  }
  const report = await scanRef({ repo, ref: 'HEAD', policy, gitleaks: GITLEAKS_PATH })
  assert.deepEqual(
    hitsOf(report, 'secret').map((h) => [h.line, h.allowed?.kind ?? null]),
    [
      [1, 'placeholder'],
      [2, null]
    ]
  )
  assert.equal(report.blocking, 1)
  const json = JSON.stringify(report)
  assert.ok(!json.includes(known) && !json.includes(FAKE_GITHUB_TOKEN), 'no secret value in the report')
})

test(
  'gitleaks: a long hex credential assigned to a key name is caught by the shipped config',
  needGitleaks,
  async () => {
    const hex = ['9f3c1a7e5b2d4f6081a3c5e7f9b1d3e5', 'a7c9e1f3b5d7f9a1'].join('')
    const repo = repoWith({
      'src/client.js': `const apiKey = "${hex}"\n`,
      'seed/data.json': `{\n  "storageKey": "${hex}"\n}\n`
    })
    const report = await scanRef({ repo, ref: 'HEAD', policy: EMPTY_POLICY, gitleaks: GITLEAKS_PATH })
    assert.deepEqual(
      hitsOf(report, 'secret').map((h) => h.path),
      ['seed/data.json', 'src/client.js']
    )
  }
)

const bsdtar = (() => {
  try {
    return execFileSync('tar', ['--version']).toString().includes('bsdtar')
  } catch {
    return false
  }
})()

test(
  'gitleaks: a file whose name looks compressed is still scanned, alone or inside a zip',
  needGitleaks,
  async () => {
    const files = { 'web/vitest.browser.config.ts': `export const token = "${FAKE_GITHUB_TOKEN}"\n` }
    const repo = repoWith(files)
    if (bsdtar) {
      execFileSync('tar', ['-a', '-cf', 'kit.zip', 'web/vitest.browser.config.ts'], { cwd: repo })
      execFileSync('git', ['-C', repo, 'add', 'kit.zip'])
      execFileSync('git', [
        '-C',
        repo,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        'commit',
        '-qm',
        'zip'
      ])
    }
    const report = await scanRef({ repo, ref: 'HEAD', policy: EMPTY_POLICY, gitleaks: GITLEAKS_PATH })
    assert.deepEqual(
      hitsOf(report, 'secret').map((h) => h.path),
      bsdtar ? ['kit.zip', 'web/vitest.browser.config.ts'] : ['web/vitest.browser.config.ts']
    )
  }
)

test('a scan that asks for gitleaks and cannot run it fails instead of passing', async () => {
  const repo = repoWith({ 'a.txt': 'x\n' })
  await assert.rejects(
    scanRef({ repo, ref: 'HEAD', policy: EMPTY_POLICY, gitleaks: '/nonexistent/gitleaks' }),
    /gitleaks/
  )
})

const CLI = new URL('../opensource/scan.mjs', import.meta.url).pathname
function runCli(args) {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], { stdio: 'pipe' }).toString() }
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` }
  }
}

test('the CLI exits 1 on a blocking hit and writes the JSON report', async () => {
  const repo = repoWith({ 'a.js': 'x = "bob@corp-real.com"\n' })
  const policy = join(repo, '..', `policy-${Date.now()}.json`)
  writeFileSync(policy, JSON.stringify(EMPTY_POLICY))
  const json = join(repo, '..', `report-${Date.now()}.json`)
  const r = runCli(['--repo', repo, '--policy', policy, '--json', json, '--no-gitleaks'])
  assert.equal(r.code, 1)
  assert.match(r.out, /email\s+1\s+0/)
  const { readFileSync } = await import('node:fs')
  assert.equal(JSON.parse(readFileSync(json, 'utf8')).hits[0].match, 'bob@corp-real.com')
})

test('the CLI never calls a scan without gitleaks clean', () => {
  const repo = repoWith({ 'a.txt': 'nothing here\n' })
  const policy = join(repo, '..', `policy-${Date.now()}-b.json`)
  writeFileSync(policy, JSON.stringify(EMPTY_POLICY))
  const r = runCli(['--repo', repo, '--policy', policy, '--no-gitleaks'])
  assert.equal(r.code, 2)
  assert.match(r.out, /INCOMPLETE/)
})

test('asset names, version strings, OIDs and well-known placeholder addresses are not hits', async () => {
  const repo = repoWith({
    'src/c.js': [
      'img = "logo@2x.png" + "hero@3x.webp"',
      'git -c url.git@github.com:.insteadOf=https://github.com/ ; remote git@gitlab.com:a/b',
      '"version": "6.1.3.1"',
      'ua = "Chrome/126.0.0.0 Safari/537.36"',
      'see rfc5246#section-7.4.1.2',
      "oid('2.5.29.17')",
      'd="M17.472 3.074.149.198"',
      'dns 1.1.1.1 8.8.8.8 example 93.184.216.34 fake 1.2.3.4',
      'real 45.67.89.12'
    ].join('\n')
  })
  const report = await scan(repo)
  assert.deepEqual(hitsOf(report, 'email'), [])
  assert.deepEqual(
    hitsOf(report, 'ip').map((h) => h.match),
    ['45.67.89.12']
  )
})

test('a schema migration is source, not a committed dump', async () => {
  const repo = repoWith({
    'apps/web/src/db/migrations/001-init.sql': 'create table t (id int);\n',
    'fixtures/backup.sql': 'INSERT INTO t VALUES (1);\n'
  })
  const report = await scan(repo)
  assert.deepEqual(
    hitsOf(report, 'archive').map((h) => h.path),
    ['fixtures/backup.sql']
  )
})

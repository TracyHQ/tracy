// scripts/opensource/export.mjs: the public tree comes from one commit, never from a working tree.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { exportTree, matchesRule, planTree } from '../opensource/export.mjs'

const EXPORT = fileURLToPath(new URL('../opensource/export.mjs', import.meta.url))
const SUB_SHA = '1111111111111111111111111111111111111111'

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'os-export-test-'))
  const repo = path.join(root, 'repo')
  const g = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
  execFileSync('git', ['init', '--quiet', repo])
  g('config', 'user.email', 'test@example.com')
  g('config', 'user.name', 'test')
  const put = (file, body) => {
    mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
    writeFileSync(path.join(repo, file), body)
  }
  put(
    'scripts/opensource/public-tree.json',
    JSON.stringify({ version: 3, exclude: ['tasks/', 'docs/secret.md', '**/*.local.json'] })
  )
  put('README.md', 'private readme\n')
  put('CLAUDE.md', 'internal notes\n')
  put('tasks/plan.md', 'internal plan\n')
  put('docs/secret.md', 'runbook\n')
  put('docs/public.md', 'public doc\n')
  put('apps/web/config.local.json', '{}\n')
  put('scripts/run.sh', '#!/bin/sh\necho hi\n')
  // `git archive` would drop this file and expand `$Format$`; the export must not.
  put('vendor/lib/.gitattributes', '.gitattributes export-ignore\nversion.txt export-subst\n')
  put('vendor/lib/version.txt', '$Format:%H$\n')
  put('scripts/opensource/overlay/CLAUDE.md', 'public notes\n')
  put('.github/workflows/private.yml', 'on: push\n')
  put('scripts/opensource/workflows/ci.yml', 'on: pull_request\n')
  put('.gitmodules', '[submodule "vendor/sub"]\n\tpath = vendor/sub\n\turl = https://example.com/sub.git\n')
  execFileSync('chmod', ['+x', path.join(repo, 'scripts/run.sh')])
  symlinkSync('../docs/public.md', path.join(repo, 'scripts/doc-link.md'))
  symlinkSync('../tasks/plan.md', path.join(repo, 'scripts/dangling-link.md'))
  g('add', '-A')
  g('update-index', '--add', '--cacheinfo', `160000,${SUB_SHA},vendor/sub`)
  g('commit', '--quiet', '-m', 'fixture')
  const sha = g('rev-parse', 'HEAD').trim()
  // Local, uncommitted state must never reach the export.
  put('README.md', 'edited in the working tree\n')
  put('untracked.txt', 'local only\n')
  return { root, repo, sha, g }
}

test('rules: directories, exact paths and globs', () => {
  assert.equal(matchesRule('tasks/a.md', 'tasks/'), true)
  assert.equal(matchesRule('tasksx/a.md', 'tasks/'), false)
  assert.equal(matchesRule('docs/x.md', 'docs/x.md'), true)
  assert.equal(matchesRule('docs/x.md.bak', 'docs/x.md'), false)
  assert.equal(matchesRule('artifacts/a/b', 'artifacts'), true)
  assert.equal(matchesRule('a/b/c.local.json', '**/*.local.json'), true)
  assert.equal(matchesRule('a/b/c.json', '**/*.local.json'), false)
})

test('an overlay may not bring back an excluded path', () => {
  assert.throws(
    () =>
      planTree([{ path: 'scripts/opensource/overlay/tasks/x.md', mode: '100644' }], { exclude: ['tasks/'] }),
    /excluded path/
  )
})

test('exports the commit, not the working tree: excludes, overlay, public workflows, manifest', () => {
  const { root, repo, sha } = fixture()
  try {
    const out = path.join(root, 'out')
    const m = exportTree({ repo, sha, out, log: () => {} })
    const read = (f) => readFileSync(path.join(out, f), 'utf8')

    assert.equal(read('README.md'), 'private readme\n', 'committed bytes, not the edited working tree')
    assert.equal(existsSync(path.join(out, 'untracked.txt')), false)
    assert.equal(existsSync(path.join(out, 'tasks')), false)
    assert.equal(existsSync(path.join(out, 'docs/secret.md')), false)
    assert.equal(existsSync(path.join(out, 'apps/web/config.local.json')), false)
    assert.equal(read('docs/public.md'), 'public doc\n')
    assert.equal(read('vendor/lib/.gitattributes').includes('export-ignore'), true)
    assert.equal(read('vendor/lib/version.txt'), '$Format:%H$\n')
    assert.equal(read('CLAUDE.md'), 'public notes\n', 'overlay replaces the internal file')
    assert.equal(existsSync(path.join(out, 'scripts/opensource/overlay')), false)
    assert.equal(existsSync(path.join(out, 'scripts/opensource/workflows')), false)
    assert.equal(existsSync(path.join(out, '.github/workflows/private.yml')), false)
    assert.equal(read('.github/workflows/ci.yml'), 'on: pull_request\n')
    assert.equal(lstatSync(path.join(out, 'scripts/run.sh')).mode & 0o111, 0o111)
    assert.equal(readlinkSync(path.join(out, 'scripts/doc-link.md')), '../docs/public.md')

    assert.equal(m.source.sha, sha)
    assert.equal(m.rules.version, 3)
    assert.deepEqual(m.submodules, [{ path: 'vendor/sub', sha: SUB_SHA, url: 'https://example.com/sub.git' }])
    assert.deepEqual(m.overlay, ['CLAUDE.md'])
    assert.deepEqual(m.workflows, { replaced: true, files: ['ci.yml'] })
    assert.equal(m.scan.status, 'unscanned')
    assert.match(m.warnings.join('\n'), /dangling-link\.md -> \.\.\/tasks\/plan\.md points at nothing/)
    const readme = m.files.find((f) => f.path === 'README.md')
    assert.equal(readme.sha256, createHash('sha256').update('private readme\n').digest('hex'))
    assert.equal(m.files.find((f) => f.path === 'CLAUDE.md').from, 'scripts/opensource/overlay/CLAUDE.md')
    assert.equal(
      m.files.some((f) => f.path.startsWith('tasks/')),
      false
    )
    assert.deepEqual(JSON.parse(readFileSync(`${out}.manifest.json`, 'utf8')), m)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses a non-empty output dir, a ref instead of a commit id, and an existing manifest', () => {
  const { root, repo, sha, g } = fixture()
  try {
    const busy = path.join(root, 'busy')
    mkdirSync(busy)
    writeFileSync(path.join(busy, 'x'), '')
    assert.throws(() => exportTree({ repo, sha, out: busy, log: () => {} }), /not empty/)
    g('branch', 'feature')
    assert.throws(
      () => exportTree({ repo, sha: 'feature', out: path.join(root, 'o1'), log: () => {} }),
      /commit id/
    )
    writeFileSync(path.join(root, 'o2.manifest.json'), '{}')
    assert.throws(
      () => exportTree({ repo, sha, out: path.join(root, 'o2'), log: () => {} }),
      /manifest already exists/
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a scanner runs on the finished tree; findings fail the CLI and land in the manifest', () => {
  const { root, repo, sha } = fixture()
  try {
    const scanner = path.join(root, 'scan.mjs')
    writeFileSync(
      scanner,
      "import { execFileSync } from 'node:child_process'\nimport { writeFileSync } from 'node:fs'\n" +
        'const arg = (n) => process.argv[process.argv.indexOf(n) + 1]\n' +
        "const files = execFileSync('git', ['-C', arg('--repo'), 'ls-tree', '-r', '--name-only', arg('--ref')]).toString().split('\\n')\n" +
        "const hit = files.includes('docs/public.md')\nwriteFileSync(arg('--json'), JSON.stringify({ hits: hit ? ['docs/public.md'] : [] }))\nprocess.exit(hit ? 1 : 0)\n"
    )
    const out = path.join(root, 'out')
    const gitleaks = path.join(root, 'gitleaks')
    writeFileSync(gitleaks, '')
    const r = spawnSync(
      process.execPath,
      [EXPORT, '--repo', repo, '--sha', sha, '--out', out, '--scanner', scanner],
      { encoding: 'utf8', env: { ...process.env, GITLEAKS_BIN: gitleaks } }
    )
    assert.equal(r.status, 1, r.stderr)
    const m = JSON.parse(readFileSync(`${out}.manifest.json`, 'utf8'))
    assert.equal(m.scan.status, 'findings')
    assert.deepEqual(m.scan.report, { hits: ['docs/public.md'] })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const runExport = (args, env = {}) =>
  spawnSync(process.execPath, [EXPORT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })

// A stand-in scanner: exits with the code it is told and writes a report shaped like scan.mjs's.
function fakeScanner(root, { code, gitleaksSkipped = false }) {
  const file = path.join(root, `scan-${code}-${gitleaksSkipped}.mjs`)
  writeFileSync(
    file,
    "import { writeFileSync } from 'node:fs'\n" +
      'const arg = (n) => process.argv[process.argv.indexOf(n) + 1]\n' +
      `const skipped = process.argv.includes('--no-gitleaks')\n` +
      `writeFileSync(arg('--json'), JSON.stringify({ hits: [], blocking: 0, gitleaks: skipped ? { skipped: true } : { version: '8.28.0' }, argv: process.argv.slice(2) }))\n` +
      `process.exit(skipped ? 2 : ${code})\n`
  )
  return file
}

test('the CLI fails closed when the commit carries no scanner', () => {
  const { root, repo, sha } = fixture()
  try {
    const out = path.join(root, 'out')
    const r = runExport(['--repo', repo, '--sha', sha, '--out', out])
    assert.equal(r.status, 2, r.stderr)
    assert.match(r.stderr, /UNSCANNED/)
    assert.equal(JSON.parse(readFileSync(`${out}.manifest.json`, 'utf8')).scan.status, 'unscanned')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the CLI fails closed when gitleaks is missing, unless --skip-gitleaks is passed and recorded', () => {
  const { root, repo, sha } = fixture()
  try {
    const scanner = fakeScanner(root, { code: 0 })
    const missing = { GITLEAKS_BIN: path.join(root, 'no-such-gitleaks') }

    const out1 = path.join(root, 'out1')
    const r1 = runExport(['--repo', repo, '--sha', sha, '--out', out1, '--scanner', scanner], missing)
    assert.equal(r1.status, 2, r1.stderr)
    assert.match(r1.stderr, /gitleaks/)
    const m1 = JSON.parse(readFileSync(`${out1}.manifest.json`, 'utf8'))
    assert.equal(m1.scan.status, 'failed')

    const out2 = path.join(root, 'out2')
    const r2 = runExport(
      ['--repo', repo, '--sha', sha, '--out', out2, '--scanner', scanner, '--skip-gitleaks'],
      missing
    )
    assert.equal(r2.status, 0, r2.stderr)
    assert.match(r2.stderr, /without gitleaks/)
    const m2 = JSON.parse(readFileSync(`${out2}.manifest.json`, 'utf8'))
    assert.equal(m2.scan.status, 'clean')
    assert.equal(m2.scan.gitleaksSkipped, true)
    assert.ok(m2.scan.report.argv.includes('--no-gitleaks'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a scanner that exits with anything but 0 or 1 fails the export instead of passing it', () => {
  const { root, repo, sha } = fixture()
  try {
    const gitleaks = path.join(root, 'gitleaks')
    writeFileSync(gitleaks, '')
    const out = path.join(root, 'out')
    const r = runExport(
      ['--repo', repo, '--sha', sha, '--out', out, '--scanner', fakeScanner(root, { code: 2 })],
      { GITLEAKS_BIN: gitleaks }
    )
    assert.equal(r.status, 2, r.stderr)
    assert.equal(JSON.parse(readFileSync(`${out}.manifest.json`, 'utf8')).scan.status, 'failed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

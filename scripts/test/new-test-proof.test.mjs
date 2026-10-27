#!/usr/bin/env node
/**
 * `scripts/ci/new-test-proof.mjs` on real Git repositories made for the purpose: a planted fix with
 * a test that catches it, one with a test that cannot fail, a test broken at the head, a test that
 * only fails to import, a fix with no test, the deadline, and cleanup after an interrupt.
 *
 * Every fixture repository and every scratch copy lives under `$TCH_TEST_ARTIFACTS_DIR` (the OS
 * temp directory otherwise) and is removed at the end.
 *
 *   node --test scripts/test/new-test-proof.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_BUDGET_SECONDS,
  SCRATCH_PREFIX,
  buildManifest,
  classifyPath,
  classifyRun,
  cleanupScratch,
  countCases,
  enforceProblem,
  failureKind,
  listChanges,
  measureGrowth,
  parseArgs,
  prove,
  renderSummary,
  restoreMirrors,
  runProcess,
  scratchLack,
  selectFixMerges,
  suiteCommand,
  verdictOf,
  wholenessProblem
} from '../ci/new-test-proof.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TOOL = join(ROOT, 'scripts/ci/new-test-proof.mjs')
const WORK = realpathSync(
  mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'new-test-proof-test-'))
)
after(() => rmSync(WORK, { recursive: true, force: true }))

const PACKAGE = JSON.stringify({
  type: 'module',
  scripts: {
    'test:workers':
      'node --test --test-timeout=120000 --test-force-exit apps/*/test/*.test.mjs scripts/test/*.test.mjs packages/*/*/test/*.test.mjs',
    'test:interop': 'node --import tsx --test scripts/test/*.test.ts'
  }
})

/** What the runner's summary would say of hand-made records: its counts, and success for exit 0. */
function summaryOf(records, exit) {
  const counts = { tests: 0, suites: 0, passed: 0, failed: 0, cancelled: 0, skipped: 0, todo: 0 }
  for (const r of records) {
    if (r.type !== 'pass' && r.type !== 'fail') continue
    if (r.kind === 'suite') counts.suites += 1
    else {
      counts.tests += 1
      if (r.skip !== undefined && r.skip !== false) counts.skipped += 1
      else if (r.todo !== undefined && r.todo !== false) counts.todo += 1
      else counts[r.type === 'pass' ? 'passed' : 'failed'] += 1
    }
  }
  return { type: 'summary', counts, success: exit === 0 }
}

/**
 * `classifyRun` on hand-made records. Records that end with the reporter's last line get the
 * summary a runner would have written for them; records without it are left cut short.
 */
function classify(records, end) {
  const ended = records.some((r) => r.type === 'end')
  return classifyRun(ended ? [summaryOf(records, end.exit), ...records] : records, end)
}

const HEADER = "import test from 'node:test'\nimport assert from 'node:assert/strict'\n"

let serial = 0
/**
 * A repository with two commits: `base` holds `baseFiles`, `head` holds them overlaid by
 * `headFiles` (`null` deletes a file).
 */
function fixture(baseFiles, headFiles, { title = 'fix: planted', beforeBase = () => {} } = {}) {
  serial += 1
  const repo = join(WORK, `repo-${String(serial)}`)
  mkdirSync(repo)
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_SYSTEM: '/dev/null'
      }
    }).trim()
  const write = (files) => {
    for (const [path, text] of Object.entries(files)) {
      const at = join(repo, path)
      if (text === null) rmSync(at)
      else {
        mkdirSync(dirname(at), { recursive: true })
        writeFileSync(at, text)
      }
    }
  }
  git('init', '-q', '-b', 'main')
  write({ 'package.json': PACKAGE, ...baseFiles })
  beforeBase(git)
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  const base = git('rev-parse', 'HEAD')
  write(headFiles)
  git('add', '-A')
  git('commit', '-q', '-m', title)
  const head = git('rev-parse', 'HEAD')
  const scratchRoot = join(WORK, `scratch-${String(serial)}`)
  mkdirSync(scratchRoot)
  return { repo, base, head, git, scratchRoot, out: join(WORK, `out-${String(serial)}`) }
}

const run = (f, extra = {}) =>
  prove({ repo: f.repo, base: f.base, head: f.head, scratchRoot: f.scratchRoot, out: f.out, ...extra })

const BUGGY = 'export const double = (n) => n + n + 1\n'
const FIXED = 'export const double = (n) => n * 2\n'
const REAL_TEST = `${HEADER}import { double } from '../src/double.mjs'\ntest('doubles', () => assert.equal(double(2), 4))\n`

test('a planted fix with a test that catches it is proved by an assertion', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    { 'apps/a/src/double.mjs': FIXED, 'apps/a/test/double.test.mjs': REAL_TEST }
  )
  const result = await run(f)
  assert.equal(result.overall, 'proved')
  const [row] = result.rows
  assert.deepEqual(
    {
      file: row.file,
      suite: row.suite,
      verdict: row.verdict,
      evidence: row.evidence,
      weak: row.weak,
      change: row.change
    },
    {
      file: 'apps/a/test/double.test.mjs',
      suite: 'workers',
      verdict: 'proved',
      evidence: 'assertion',
      weak: false,
      change: 'added'
    }
  )
  assert.equal(row.head.state, 'green')
  assert.equal(row.withoutFix.state, 'red')
  assert.deepEqual(row.head.command, {
    // The suite's own flags, minus `--test-force-exit` (it drops results; see `suiteCommand`).
    argv: ['node', '--test', '--test-timeout=120000', 'apps/a/test/double.test.mjs'],
    cwd: '.'
  })
  assert.deepEqual(result.manifest.revertedToBase, [
    { path: 'apps/a/src/double.mjs', action: 'restore-base' }
  ])
  assert.equal(result.enforceProblem, null)
  // The evidence is on disk, outside the repository, and nothing is left of the scratch copy.
  assert.deepEqual(JSON.parse(readFileSync(join(f.out, 'result.json'), 'utf8')).rows[0].verdict, 'proved')
  assert.match(readFileSync(join(f.out, 'summary.md'), 'utf8'), /proved \(assertion\)/)
  assert.ok(readdirSync(join(f.out, 'logs')).length === 2)
  assert.deepEqual(readdirSync(f.scratchRoot), [])
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: f.repo, encoding: 'utf8' }), '')
})

test('a planted fix with a test that cannot fail is unproved', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/double.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\ntest('is a function', () => assert.equal(typeof double, 'function'))\n`
    }
  )
  const result = await run(f)
  assert.equal(result.overall, 'unproved')
  assert.equal(result.rows[0].verdict, 'unproved')
  assert.equal(result.rows[0].withoutFix.state, 'green')
  assert.match(result.enforceProblem, /is unproved/)
})

test('a test that is red at the head is broken, and is not run a second time', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/double.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\ntest('wrong', () => assert.equal(double(2), 5))\n`
    }
  )
  const result = await run(f)
  assert.equal(result.rows[0].verdict, 'broken')
  assert.equal(result.rows[0].evidence, 'assertion')
  assert.equal(result.rows[0].withoutFix, null)
})

test('a test that only fails to import the new symbol is proved, marked as weaker evidence', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': FIXED },
    {
      'apps/a/src/double.mjs': `${FIXED}export const triple = (n) => n * 3\n`,
      'apps/a/test/triple.test.mjs': `${HEADER}import { triple } from '../src/double.mjs'\ntest('triples', () => assert.equal(triple(1), 3))\n`
    }
  )
  const result = await run(f)
  const [row] = result.rows
  assert.equal(row.verdict, 'proved')
  assert.equal(row.evidence, 'import-only')
  assert.equal(row.weak, true)
  assert.match(row.reason, /weaker evidence/)
  assert.match(renderSummary(result), /proved \(import-only, weaker\)/)
  // Proved only by a missing import is not enough for --enforce.
  assert.match(result.enforceProblem, /missing import/)
})

test('a new module the test imports, removed with the fix, is import-only too', async () => {
  const f = fixture(
    {},
    {
      'packages/x/y/src/new.mjs': 'export const one = 1\n',
      'packages/x/y/test/new.test.mjs': `${HEADER}import { one } from '../src/new.mjs'\ntest('one', () => assert.equal(one, 1))\n`
    }
  )
  const result = await run(f)
  assert.equal(result.rows[0].evidence, 'import-only')
  assert.deepEqual(result.manifest.revertedToBase, [{ path: 'packages/x/y/src/new.mjs', action: 'remove' }])
})

test('a fix with no test file is no-tests, and never makes a scratch copy', async () => {
  const f = fixture({ 'apps/a/src/double.mjs': BUGGY }, { 'apps/a/src/double.mjs': FIXED })
  const result = await run(f)
  assert.equal(result.overall, 'no-tests')
  assert.deepEqual(result.rows, [])
  assert.equal(result.counts['no-tests'], 1)
  assert.match(result.enforceProblem, /no executable test file/)
  assert.match(renderSummary(result), /no-tests/)
})

test('a regression catalogue case is not a test file; an unknown test path gets a row, not silence', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'tests/regression/cases/REG-PR-1-x.json': '{}\n',
      'tests/e2e-dev/test/journey.test.mjs': `${HEADER}test('x', () => {})\n`,
      'apps/a/test/e2e/wizard.test.mjs': `${HEADER}test('x', () => {})\n`
    }
  )
  const result = await run(f)
  assert.deepEqual(
    result.rows.map((r) => [r.file, r.verdict, r.reason]),
    [
      [
        'apps/a/test/e2e/wizard.test.mjs',
        'not-runnable',
        'needs a browser (the e2e suite opens one; this tool starts none)'
      ],
      ['tests/e2e-dev/test/journey.test.mjs', 'not-runnable', 'no CI suite this tool knows runs this path']
    ]
  )
  assert.deepEqual(result.manifest.catalogue, ['tests/regression/cases/REG-PR-1-x.json'])
  assert.equal(result.overall, 'not-runnable')
  assert.match(result.enforceProblem, /could not run/)
})

test('skipped cases are never read as unproved: all skipped, and green both ways with a skip', async () => {
  const gated = `${HEADER}const url = process.env.TEST_DATABASE_URL\ntest('db', { skip: url ? false : 'set TEST_DATABASE_URL' }, () => assert.ok(true))\n`
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/db.test.mjs': gated,
      'apps/a/test/mixed.test.mjs': `${gated}test('plain', () => assert.ok(true))\n`,
      // A skipped suite reports none of its cases; the plain case beside it must not hide that.
      'apps/a/test/suite.test.mjs': `${HEADER}import { describe } from 'node:test'\nconst url = process.env.TEST_DATABASE_URL\ndescribe('with a database', { skip: url ? false : 'set TEST_DATABASE_URL' }, () => {\n  test('db', () => assert.ok(true))\n})\ntest('plain', () => assert.ok(true))\n`,
      'apps/a/test/none.test.mjs': 'export {}\n'
    }
  )
  // An exported database is not ours to point the altered tree at: it must still be skipped.
  process.env.TEST_DATABASE_URL = 'postgres://not-ours.invalid/x'
  let result
  try {
    result = await run(f)
  } finally {
    delete process.env.TEST_DATABASE_URL
  }
  const by = Object.fromEntries(result.rows.map((r) => [r.file, r]))
  assert.equal(by['apps/a/test/db.test.mjs'].verdict, 'not-runnable')
  assert.match(by['apps/a/test/db.test.mjs'].reason, /^needs a database/)
  assert.equal(by['apps/a/test/mixed.test.mjs'].verdict, 'not-runnable')
  assert.match(
    by['apps/a/test/mixed.test.mjs'].reason,
    /not every case ran: 1 case\(s\) or suite\(s\) skipped/
  )
  assert.equal(by['apps/a/test/suite.test.mjs'].verdict, 'not-runnable')
  assert.match(
    by['apps/a/test/suite.test.mjs'].reason,
    /not every case ran: 1 case\(s\) or suite\(s\) skipped .*needs a database/
  )
  assert.equal(by['apps/a/test/none.test.mjs'].verdict, 'not-runnable')
  assert.match(by['apps/a/test/none.test.mjs'].reason, /no case ran/)
})

test('added, deleted and renamed files: the manifest restores and removes exactly what the fix did', async () => {
  const f = fixture(
    {
      'apps/a/src/old-name.mjs': 'export const v = 1\n',
      'apps/a/src/dropped.mjs': 'export const dropped = true\n',
      'apps/a/test/gone.test.mjs': `${HEADER}test('gone', () => {})\n`,
      'apps/a/test/helpers/data.mjs': 'export const data = 1\n'
    },
    {
      'apps/a/src/old-name.mjs': null,
      'apps/a/src/new-name.mjs': 'export const v = 1\n',
      'apps/a/src/dropped.mjs': null,
      'apps/a/test/gone.test.mjs': null,
      'apps/a/test/helpers/data.mjs': 'export const data = 2\n',
      'apps/a/test/shape.test.mjs': [
        HEADER,
        "import { existsSync } from 'node:fs'",
        "import { data } from './helpers/data.mjs'",
        'const at = (name) => new URL(`../src/${name}`, import.meta.url)',
        "test('the tree is the head', () => {",
        '  assert.equal(data, 2)',
        "  assert.ok(existsSync(at('new-name.mjs')), 'renamed file present')",
        "  assert.ok(!existsSync(at('old-name.mjs')), 'old name gone')",
        "  assert.ok(!existsSync(at('dropped.mjs')), 'deleted file gone')",
        '})',
        ''
      ].join('\n')
    }
  )
  const manifest = buildManifest(listChanges(f.repo, f.base, f.head))
  assert.deepEqual(manifest.revertedToBase, [
    { path: 'apps/a/src/dropped.mjs', action: 'restore-base' },
    { path: 'apps/a/src/new-name.mjs', action: 'remove' },
    { path: 'apps/a/src/old-name.mjs', action: 'restore-base' }
  ])
  assert.deepEqual(manifest.keptAtHead, [
    { path: 'apps/a/test/gone.test.mjs', role: 'test', state: 'absent' },
    { path: 'apps/a/test/helpers/data.mjs', role: 'support', state: 'head' },
    { path: 'apps/a/test/shape.test.mjs', role: 'test', state: 'head' }
  ])
  const result = await run(f)
  // Green at the head; without the fix the helper is still the head's (data === 2) and the three
  // product paths are back as they were, so the first product assertion is the one that fails.
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].verdict, 'proved')
  assert.match(result.rows[0].reason, /renamed file present/)
})

test('a workspace dependency resolves inside the scratch copy, never back into the checkout', async () => {
  const f = fixture(
    {
      'packages/x/lib/package.json': '{"name":"@fx/lib","type":"module","exports":"./index.mjs"}\n',
      'packages/x/lib/index.mjs': BUGGY
    },
    {
      'packages/x/lib/index.mjs': FIXED,
      'packages/x/app/package.json': '{"name":"@fx/app","type":"module"}\n',
      'packages/x/app/test/uses-lib.test.mjs': `${HEADER}import { double } from '@fx/lib'\ntest('doubles', () => assert.equal(double(2), 4))\n`
    }
  )
  // What `pnpm install` leaves in the checkout: an untracked link to the workspace package.
  mkdirSync(join(f.repo, 'packages/x/app/node_modules/@fx'), { recursive: true })
  symlinkSync('../../../lib', join(f.repo, 'packages/x/app/node_modules/@fx/lib'))
  writeFileSync(join(f.repo, '.git/info/exclude'), 'node_modules\n')
  const result = await run(f)
  // Linked to the checkout it would read the fixed lib in both runs and come out `unproved`.
  assert.equal(result.rows[0].verdict, 'proved')
  assert.equal(result.rows[0].evidence, 'assertion')
})

test('the scratch copy is a repository of its own: git lists the tree being run, the checkout is untouched', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/src/added.mjs': 'export const added = true\n',
      'apps/a/test/tracked.test.mjs': [
        HEADER,
        "import { execFileSync } from 'node:child_process'",
        "const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })",
        "test('git answers for this tree', () => {",
        "  assert.equal(git('diff', '--name-only'), '', 'the index matches the files')",
        "  assert.ok(git('ls-files').split('\\n').includes('apps/a/src/added.mjs'), 'the fix is tracked')",
        '  // What a test writes stays in the copy.',
        "  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'from a test')",
        '})',
        ''
      ].join('\n')
    }
  )
  const refs = () => f.git('for-each-ref') + f.git('rev-parse', 'HEAD') + f.git('count-objects', '-v')
  const before = refs()
  const result = await run(f)
  const [row] = result.rows
  assert.equal(row.head.state, 'green', JSON.stringify(row.head))
  assert.equal(row.verdict, 'proved')
  assert.match(row.reason, /the fix is tracked/)
  assert.equal(refs(), before, 'the checkout has no new ref, commit or object')
  assert.equal(f.git('status', '--porcelain'), '')
})

test('a missing program reported through an assertion is import evidence, not an assertion', async () => {
  const f = fixture(
    {},
    {
      'scripts/check-thing.mjs': 'process.exit(0)\n',
      'scripts/test/check-thing.test.mjs': `${HEADER}import { spawnSync } from 'node:child_process'\ntest('exits 0', () => {\n  const r = spawnSync(process.execPath, ['scripts/check-thing.mjs'], { encoding: 'utf8' })\n  assert.equal(r.status, 0, r.stderr)\n})\n`
    }
  )
  const result = await run(f)
  assert.deepEqual(
    [result.rows[0].verdict, result.rows[0].evidence, result.rows[0].weak],
    ['proved', 'import-only', true]
  )
})

test('a submodule is read only when the checkout holds the commit the tree pins; otherwise the row is not-runnable', async () => {
  const source = join(WORK, 'submodule-source')
  mkdirSync(source)
  const inSource = (...args) =>
    execFileSync('git', ['-c', 'user.name=f', '-c', 'user.email=f@example.invalid', ...args], {
      cwd: source,
      encoding: 'utf8'
    }).trim()
  inSource('init', '-q', '-b', 'main')
  writeFileSync(join(source, 'data.txt'), 'one\n')
  inSource('add', '-A')
  inSource('commit', '-q', '-m', 'one')
  const older = inSource('rev-parse', 'HEAD')
  writeFileSync(join(source, 'data.txt'), 'two\n')
  inSource('commit', '-q', '-am', 'two')
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/reads-fork.test.mjs': `${HEADER}import { readFileSync } from 'node:fs'\nimport { double } from '../src/double.mjs'\ntest('reads the fork', () => {\n  assert.equal(readFileSync('vendor/fork/data.txt', 'utf8'), 'two\\n')\n  assert.equal(double(2), 4)\n})\n`
    },
    {
      beforeBase: (git) =>
        git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', source, 'vendor/fork')
    }
  )
  const pinned = await run(f)
  assert.equal(pinned.rows[0].verdict, 'proved', JSON.stringify(pinned.rows[0]))
  assert.deepEqual(pinned.manifest.submodules, [{ path: 'vendor/fork', linkedAtHead: true }])

  // The checkout's copy moves to another commit: it is no longer the tree being measured.
  execFileSync('git', ['checkout', '-q', older], { cwd: join(f.repo, 'vendor/fork') })
  const moved = await run(f)
  assert.deepEqual(moved.manifest.submodules, [{ path: 'vendor/fork', linkedAtHead: false }])
  assert.equal(moved.rows[0].verdict, 'not-runnable')
  assert.match(moved.rows[0].reason, /lacks at the head \(vendor\/fork\/\)/)
})

test('what a test writes into the scratch copy never reaches the next run, at the head or without the fix', async () => {
  const f = fixture(
    {
      'apps/a/src/double.mjs': BUGGY,
      'apps/a/src/config.json': '{"mode":"shipped"}\n',
      '.gitignore': 'cache/\n'
    },
    {
      'apps/a/src/double.mjs': FIXED,
      // Runs first: leaves a generated file, an ignored cache, an edited tracked file and a commit.
      'apps/a/test/a-writer.test.mjs': [
        HEADER,
        "import { execFileSync } from 'node:child_process'",
        "import { mkdirSync, writeFileSync } from 'node:fs'",
        "import { double } from '../src/double.mjs'",
        "test('writes into the tree', () => {",
        "  writeFileSync('apps/a/src/generated.mjs', 'export const stale = true\\n')",
        "  mkdirSync('cache', { recursive: true })",
        "  writeFileSync('cache/double.json', '4')",
        '  writeFileSync(\'apps/a/src/config.json\', \'{"mode":"edited by a test"}\\n\')',
        "  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', 'from a test'])",
        '  assert.equal(double(2), 4)',
        '})',
        ''
      ].join('\n'),
      'apps/a/test/b-reader.test.mjs': [
        HEADER,
        "import { execFileSync } from 'node:child_process'",
        "import { existsSync, readFileSync } from 'node:fs'",
        "import { double } from '../src/double.mjs'",
        "const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })",
        "test('reads the tree git describes', () => {",
        "  assert.ok(!existsSync('apps/a/src/generated.mjs'), 'no generated file from another test')",
        "  assert.ok(!existsSync('cache'), 'no ignored cache from another test')",
        "  assert.equal(readFileSync('apps/a/src/config.json', 'utf8'), '{\"mode\":\"shipped\"}\\n')",
        "  assert.equal(git('diff', '--name-only'), '')",
        "  assert.equal(git('ls-files', '--others'), '')",
        "  assert.equal(git('log', '-1', '--format=%s'), 'fix: planted\\n', 'no commit from another test')",
        '  assert.equal(double(2), 4)',
        '})',
        ''
      ].join('\n'),
      // Green without the fix whenever its own head run left its marker behind.
      'apps/a/test/c-sticky.test.mjs': [
        HEADER,
        "import { existsSync, writeFileSync } from 'node:fs'",
        "import { double } from '../src/double.mjs'",
        "const seen = existsSync('apps/a/.seen')",
        "writeFileSync('apps/a/.seen', '')",
        "test('passes on a tree it has already run in', () => assert.ok(seen || double(2) === 4, 'first run on this tree'))",
        ''
      ].join('\n')
    }
  )
  const result = await run(f)
  const by = Object.fromEntries(result.rows.map((r) => [r.file.split('/').at(-1), r]))
  assert.equal(by['b-reader.test.mjs'].head.state, 'green', JSON.stringify(by['b-reader.test.mjs'].head))
  // Without the fix the reader fails on its LAST assertion: everything before it saw a clean tree.
  assert.match(by['b-reader.test.mjs'].reason, /4 !== 5|5 !== 4/)
  assert.deepEqual(
    result.rows.map((r) => [r.verdict, r.evidence]),
    [
      ['proved', 'assertion'],
      ['proved', 'assertion'],
      ['proved', 'assertion']
    ]
  )
  assert.match(by['c-sticky.test.mjs'].reason, /first run on this tree/)
  // Six runs, five reuses of the tree; the writer's four leftovers and the marker were taken out.
  assert.equal(result.manifest.treeResets.count, 5)
  assert.ok(result.manifest.treeResets.restoredFiles >= 2, JSON.stringify(result.manifest.treeResets))
  assert.ok(result.manifest.treeResets.removedPaths >= 4, JSON.stringify(result.manifest.treeResets))
})

test('a file that stays open is never judged from the run this tool ended: its suite’s own --test-force-exit run is, when whole', async () => {
  const many = Array.from(
    { length: 200 },
    (_, i) => `test('case ${String(i)}', () => assert.equal(double(2), 4))`
  ).join('\n')
  const counter = join(WORK, 'runs-of-shifting')
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      // An open timer: the process never exits on its own. CI ends it with --test-force-exit.
      'apps/a/test/open-handle.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\nsetInterval(() => {}, 1000)\ntest('doubles', () => assert.equal(double(2), 4))\ntest('still a function', () => assert.equal(typeof double, 'function'))\n`,
      // Stays open too, and registers one more case each time it is run: the second run cannot be
      // matched to the first, which is how a run that lost results looks.
      'apps/a/test/shifting.test.mjs': `${HEADER}import { appendFileSync, readFileSync } from 'node:fs'\nappendFileSync(${JSON.stringify(counter)}, 'x')\nsetInterval(() => {}, 1000)\nfor (let i = 0; i < readFileSync(${JSON.stringify(counter)}, 'utf8').length; i += 1) test('case ' + i, () => assert.ok(true))\n`,
      // Fails after its cases are done: seen here because the process is left to end by itself.
      'apps/a/test/late-error.test.mjs': `${HEADER}setTimeout(() => {\n  throw new Error('late teardown failure')\n}, 1500)\ntest('passes', () => assert.ok(true))\n`,
      'apps/a/test/two-hundred.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\n${many}\n`
    }
  )
  const started = Date.now()
  const result = await run(f)
  assert.ok(Date.now() - started < 90000, 'nowhere near the 180 s budget')
  const by = Object.fromEntries(result.rows.map((r) => [r.file.split('/').at(-1), r]))

  // Judged from the run node finished (with the suite's flag), which reported as many cases as the
  // lingering run had seen complete.
  const open = by['open-handle.test.mjs']
  assert.deepEqual([open.verdict, open.evidence], ['proved', 'assertion'], JSON.stringify(open))
  assert.deepEqual(
    [open.head.lingered, open.head.forceExit, open.head.state, open.head.exit, open.head.counts.passed],
    [true, true, 'green', 0, 2]
  )
  assert.ok(open.head.command.argv.includes('--test-force-exit'))
  assert.deepEqual(
    [
      open.withoutFix.state,
      open.withoutFix.exit,
      open.withoutFix.counts.failed,
      open.withoutFix.counts.passed
    ],
    ['red', 1, 1, 1]
  )

  const shifting = by['shifting.test.mjs']
  assert.equal(shifting.verdict, 'not-runnable')
  assert.match(shifting.reason, /with --test-force-exit node did not report every case: at the head/)
  assert.equal(shifting.head.state, 'incomplete')

  const late = by['late-error.test.mjs']
  assert.deepEqual([late.verdict, late.head.state, late.head.lingered], ['broken', 'red', false])
  assert.match(late.reason, /late teardown failure/)

  // Every one of the 200 cases is on record in both runs (with the flag node reported 181 and 190).
  const all = by['two-hundred.test.mjs']
  assert.deepEqual([all.head.counts.cases, all.head.counts.passed, all.head.lingered], [200, 200, false])
  assert.deepEqual([all.withoutFix.counts.cases, all.withoutFix.counts.failed], [200, 200])
  assert.ok(!all.head.command.argv.includes('--test-force-exit'))

  // A run this tool ended is never whole by itself, whatever it had reported.
  const end = { exit: null, signal: 'SIGKILL', timedOut: false, file: 'x.test.mjs', cwd: '/t', seconds: 1 }
  const pass = { type: 'pass', name: 'a', nesting: 0, line: 3, column: 1, kind: 'test' }
  const lingering = classify([pass], { ...end, lingered: true })
  assert.equal(lingering.state, 'incomplete')
  assert.equal(verdictOf(lingering, null).verdict, 'not-runnable')
  assert.match(verdictOf(lingering, null).reason, /does not exit on its own once its cases are done/)
  const green = classify([pass, { type: 'end' }], { ...end, exit: 0, signal: null })
  assert.equal(verdictOf(green, lingering).verdict, 'not-runnable')
})

test('a suite without --test-force-exit gives a lingering file no verdict', async () => {
  const f = fixture(
    {
      'package.json': JSON.stringify({
        type: 'module',
        scripts: { 'test:workers': 'node --test --test-timeout=120000 apps/*/test/*.test.mjs' }
      }),
      'apps/a/src/double.mjs': BUGGY
    },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/open-handle.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\nsetInterval(() => {}, 1000)\ntest('doubles', () => assert.equal(double(2), 4))\n`
    }
  )
  const result = await run(f)
  const [row] = result.rows
  assert.equal(row.verdict, 'not-runnable')
  assert.match(
    row.reason,
    /does not exit on its own once its cases are done, and its suite has no --test-force-exit/
  )
  assert.deepEqual([row.head.lingered, row.head.state], [true, 'incomplete'])
})

test('what a test leaves in node_modules never reaches the next run: only the recorded dependency links stay', async () => {
  const f = fixture(
    {
      'packages/x/lib/package.json': '{"name":"@fx/lib","type":"module","exports":"./index.mjs"}\n',
      'packages/x/lib/index.mjs': BUGGY,
      'packages/x/app/package.json': '{"name":"@fx/app","type":"module"}\n'
    },
    {
      'packages/x/lib/index.mjs': FIXED,
      // Green without the fix whenever an earlier run left its cache beside the dependency links,
      // in a node_modules of its own making, or behind a link it repointed.
      'packages/x/app/test/caches.test.mjs': [
        HEADER,
        "import { existsSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'",
        "import { double } from '@fx/lib'",
        "const places = ['packages/x/app/node_modules/.cache', 'packages/x/app/node_modules/@fx/.cache', 'node_modules/.cache', 'packages/x/lib/node_modules/.cache']",
        'const seen = places.filter((p) => existsSync(p))',
        'for (const p of places) mkdirSync(p, { recursive: true })',
        "writeFileSync('packages/x/app/node_modules/stray.txt', 'x')",
        "test('first run on this tree, and the fix is in', () => {",
        "  assert.deepEqual(seen, [], 'no cache of an earlier run')",
        '  assert.equal(double(2), 4)',
        '})',
        "test('repoints its own dependency for whoever runs next', () => {",
        "  unlinkSync('packages/x/app/node_modules/@fx/lib')",
        "  symlinkSync('/nonexistent', 'packages/x/app/node_modules/@fx/lib')",
        '})',
        ''
      ].join('\n'),
      'packages/x/app/test/z-after.test.mjs': `${HEADER}import { existsSync } from 'node:fs'\nimport { double } from '@fx/lib'\ntest('finds its dependency and no leftovers', () => {\n  assert.ok(!existsSync('node_modules'), 'no node_modules a test made')\n  assert.ok(!existsSync('packages/x/app/node_modules/stray.txt'), 'no stray file beside the links')\n  assert.equal(double(2), 4)\n})\n`
    }
  )
  mkdirSync(join(f.repo, 'packages/x/app/node_modules/@fx'), { recursive: true })
  symlinkSync('../../../lib', join(f.repo, 'packages/x/app/node_modules/@fx/lib'))
  writeFileSync(join(f.repo, '.git/info/exclude'), 'node_modules\n')
  const result = await run(f)
  const by = Object.fromEntries(result.rows.map((r) => [r.file.split('/').at(-1), r]))
  assert.equal(by['z-after.test.mjs'].head.state, 'green', JSON.stringify(by['z-after.test.mjs'].head))
  assert.deepEqual(
    result.rows.map((r) => [r.verdict, r.evidence]),
    [
      ['proved', 'assertion'],
      ['proved', 'assertion']
    ],
    JSON.stringify(result.rows.map((r) => r.reason))
  )
  assert.match(by['caches.test.mjs'].reason, /4 !== 5|5 !== 4/)
  assert.match(by['z-after.test.mjs'].reason, /4 !== 5|5 !== 4/)
  assert.ok(
    result.manifest.treeResets.dependencyLinksRebuilt >= 3,
    JSON.stringify(result.manifest.treeResets)
  )
  assert.ok(result.manifest.treeResets.removedPaths >= 2, JSON.stringify(result.manifest.treeResets))

  // The record is exact: a foreign entry, a changed target and a missing link each rebuild the mirror.
  const tree = join(WORK, 'mirror-tree')
  mkdirSync(join(tree, 'pkg'), { recursive: true })
  const mirrors = [
    {
      dir: 'pkg/node_modules',
      dirs: ['@s'],
      links: [
        { at: 'a', target: '/x/a' },
        { at: '@s/b', target: '/x/b' }
      ]
    }
  ]
  assert.equal(restoreMirrors(tree, mirrors), 4, 'nothing there yet: the directory, its scope and both links')
  assert.equal(restoreMirrors(tree, mirrors), 0)
  writeFileSync(join(tree, 'pkg/node_modules/@s/cache.json'), '{}')
  assert.equal(restoreMirrors(tree, mirrors), 1)
  unlinkSync(join(tree, 'pkg/node_modules/a'))
  symlinkSync('/elsewhere', join(tree, 'pkg/node_modules/a'))
  assert.equal(restoreMirrors(tree, mirrors), 2, 'the foreign link, and the recorded one it replaced')
  rmSync(join(tree, 'pkg/node_modules/@s'), { recursive: true })
  writeFileSync(join(tree, 'pkg/node_modules/@s'), 'a file where a directory was')
  assert.ok(restoreMirrors(tree, mirrors) >= 1)
  assert.deepEqual(readdirSync(join(tree, 'pkg/node_modules')).sort(), ['@s', 'a'])
  assert.equal(restoreMirrors(tree, mirrors), 0)
})

test('a file that did not run whole is neither proved nor unproved: a skipped or todo case may be the test of the fix', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      // Another case goes red without the fix; the case written for the fix is the skipped one.
      'apps/a/test/skip-and-red.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\ntest('the fix', { skip: 'needs the stand' }, () => assert.equal(double(3), 6))\ntest('other', () => assert.equal(double(2), 4))\n`,
      'apps/a/test/todo-and-red.test.mjs': `${HEADER}import { double } from '../src/double.mjs'\ntest.todo('the fix')\ntest('other', () => assert.equal(double(2), 4))\n`,
      'apps/a/test/todo-and-green.test.mjs': `${HEADER}test('the fix', { todo: true }, () => assert.fail('not yet'))\ntest('other', () => assert.ok(true))\n`
    }
  )
  const result = await run(f)
  const by = Object.fromEntries(result.rows.map((r) => [r.file.split('/').at(-1), r]))
  assert.equal(by['skip-and-red.test.mjs'].withoutFix.state, 'red')
  assert.equal(by['skip-and-red.test.mjs'].verdict, 'not-runnable')
  assert.match(
    by['skip-and-red.test.mjs'].reason,
    /not every case ran: 1 case\(s\) or suite\(s\) skipped .*needs the stand/
  )
  assert.equal(by['todo-and-red.test.mjs'].withoutFix.state, 'red')
  assert.equal(by['todo-and-red.test.mjs'].verdict, 'not-runnable')
  assert.match(by['todo-and-red.test.mjs'].reason, /not every case ran: 1 marked todo/)
  assert.equal(by['todo-and-green.test.mjs'].verdict, 'not-runnable')
  assert.match(by['todo-and-green.test.mjs'].reason, /1 marked todo/)
  assert.equal(result.overall, 'not-runnable')
  assert.match(result.enforceProblem, /could not run/)

  // The same rules on hand-made runs, a todo suite included.
  const end = { exit: 0, signal: null, timedOut: false, file: 'x.test.mjs', cwd: '/t', seconds: 1 }
  const pass = { type: 'pass', name: 'a', nesting: 0, line: 3, column: 1, kind: 'test' }
  const failed = {
    type: 'fail',
    name: 'b',
    nesting: 0,
    line: 4,
    column: 1,
    kind: 'test',
    error: { cause: { code: 'ERR_ASSERTION', message: 'x' } }
  }
  const green = classify([pass, { type: 'end' }], end)
  const red = classify([pass, failed, { type: 'end' }], { ...end, exit: 1 })
  assert.equal(verdictOf(green, red).verdict, 'proved')
  const todoSuite = { type: 'pass', name: 'later', nesting: 0, line: 9, column: 1, kind: 'suite', todo: true }
  for (const extra of [{ ...pass, name: 's', skip: 'why' }, { ...pass, name: 't', todo: true }, todoSuite]) {
    const partialHead = classify([pass, extra, { type: 'end' }], end)
    assert.equal(partialHead.state, 'green')
    assert.equal(verdictOf(partialHead, red).verdict, 'not-runnable', JSON.stringify(extra))
    assert.equal(verdictOf(partialHead, green).verdict, 'not-runnable')
    // Only the run without the fix skipped (a guard that depends on the fix): still not whole.
    assert.equal(
      verdictOf(green, classify([pass, failed, extra, { type: 'end' }], { ...end, exit: 1 })).verdict,
      'not-runnable'
    )
  }
})

test('a failure to load is classified from the error itself, and only a shown lack of the copy is not-runnable at the head', async () => {
  const kind = (cause) => failureKind({ cause })
  assert.equal(kind({ name: 'SyntaxError', message: "Unexpected token '}'" }), 'import')
  assert.equal(
    kind({
      name: 'SyntaxError',
      message: "The requested module './a.mjs' does not provide an export named 'b'"
    }),
    'import'
  )
  assert.equal(kind({ name: 'TransformError', message: 'Transform failed with 1 error' }), 'import')
  assert.equal(kind({ name: 'Error', code: 'ERR_MODULE_NOT_FOUND', message: 'x' }), 'import')
  assert.equal(kind({ name: 'Error', code: 'ERR_UNKNOWN_FILE_EXTENSION', message: 'x' }), 'import')
  assert.equal(kind({ name: 'SyntaxError', message: 'Unexpected token < in JSON at position 0' }), 'other')
  assert.equal(kind({ name: 'AssertionError', code: 'ERR_ASSERTION', message: '1 !== 2' }), 'assertion')
  assert.equal(kind({ name: 'TypeError', message: 'x is not a function' }), 'other')

  const f = fixture(
    { 'apps/a/src/double.mjs': FIXED, 'apps/a/src/shape.mjs': 'export const shape = (n) => n\n' },
    {
      'apps/a/src/double.mjs': `${FIXED}export const triple = (n) => n * 3\n`,
      // Without the fix the module it loads on demand no longer links: compile evidence, not `other`.
      'apps/a/test/dynamic.test.mjs': `${HEADER}test('loads on demand', async () => {\n  const { uses } = await import('./helpers/uses-triple.mjs')\n  assert.equal(uses(1), 3)\n})\n`,
      'apps/a/test/helpers/uses-triple.mjs':
        "import { triple } from '../../src/double.mjs'\nexport const uses = (n) => triple(n)\n",
      // Broken by its own import, whatever the fix does.
      'apps/a/test/own-typo.test.mjs': `${HEADER}import { shape } from '../src/shap.mjs'\ntest('never loads', () => assert.equal(shape(1), 1))\n`,
      // Needs a file the checkout builds and git does not track.
      'apps/a/test/needs-build.test.mjs': `${HEADER}import { built } from '../lib/built.mjs'\ntest('built', () => assert.equal(built, true))\n`
    }
  )
  mkdirSync(join(f.repo, 'apps/a/lib'))
  writeFileSync(join(f.repo, 'apps/a/lib/built.mjs'), 'export const built = true\n')
  writeFileSync(join(f.repo, '.git/info/exclude'), 'lib/\n')
  const result = await run(f)
  const by = Object.fromEntries(result.rows.map((r) => [r.file.split('/').at(-1), r]))
  assert.deepEqual(
    [by['dynamic.test.mjs'].verdict, by['dynamic.test.mjs'].evidence, by['dynamic.test.mjs'].weak],
    ['proved', 'import-only', true],
    JSON.stringify(by['dynamic.test.mjs'].withoutFix)
  )
  assert.deepEqual(
    [by['own-typo.test.mjs'].verdict, by['own-typo.test.mjs'].evidence],
    ['broken', 'import-only']
  )
  assert.match(by['own-typo.test.mjs'].reason, /^cannot load at the head: .*shap\.mjs/)
  assert.equal(by['needs-build.test.mjs'].verdict, 'not-runnable')
  assert.match(
    by['needs-build.test.mjs'].reason,
    /apps\/a\/lib\/built\.mjs is in the checkout but not in git: build output/
  )
  // Compile-only evidence is never enough for --enforce, and a broken row refuses on its own.
  assert.match(result.enforceProblem, /own-typo\.test\.mjs is broken/)
  assert.match(enforceProblem({ rows: [by['dynamic.test.mjs']] }), /missing import/)

  // A tracked file missing from the checkout, or a package installed nowhere, is not the copy's lack.
  const where = { repo: f.repo, tree: join(WORK, 'no-such-tree') }
  assert.equal(
    scratchLack(
      "Cannot find module 'apps/a/src/shap.mjs' imported from apps/a/test/own-typo.test.mjs",
      where
    ),
    null
  )
  assert.equal(scratchLack("Cannot find module 'apps/a/src/double.mjs' imported from x", where), null)
  assert.equal(
    scratchLack("Cannot find package 'left-pad' imported from apps/a/test/x.test.mjs", where),
    null
  )
  mkdirSync(join(f.repo, 'node_modules/left-pad'), { recursive: true })
  assert.match(
    scratchLack("Cannot find package 'left-pad' imported from apps/a/test/x.test.mjs", where),
    /package 'left-pad' is installed in the checkout but not linked in the copy/
  )
})

test('a workspace package the scratch copy lacks is not-runnable, not proved by the missing import', () => {
  const green = classify(
    [{ type: 'pass', name: 'a', nesting: 0, line: 3, column: 1, kind: 'test' }, { type: 'end' }],
    {
      exit: 0,
      signal: null,
      timedOut: false,
      file: 'x.test.mjs',
      cwd: '/t',
      seconds: 0.1
    }
  )
  const missing = classify(
    [
      {
        type: 'stderr',
        text: "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@deepseek-ai/dsh-x' imported from /t/x.test.mjs\n"
      },
      {
        type: 'fail',
        name: 'x.test.mjs',
        nesting: 0,
        line: 1,
        column: 1,
        kind: 'test',
        error: { failureType: 'testCodeFailure' }
      },
      { type: 'end' }
    ],
    { exit: 1, signal: null, timedOut: false, file: 'x.test.mjs', cwd: '/t', seconds: 0.1 }
  )
  assert.equal(missing.evidence, 'import-only')
  assert.equal(verdictOf(green, missing).verdict, 'proved')
  const refused = verdictOf(green, missing, { unavailable: ["'@deepseek-ai/dsh-x'"] })
  assert.equal(refused.verdict, 'not-runnable')
  assert.match(refused.reason, /needs a build or a dependency/)
  // At the head it is the copy's lack only when the copy is shown to lack it; a test that cannot
  // load for any other reason is broken by its own import.
  assert.equal(verdictOf(missing, null, { unavailable: ["'@deepseek-ai/dsh-x'"] }).verdict, 'not-runnable')
  const own = verdictOf(missing, null)
  assert.deepEqual([own.verdict, own.evidence], ['broken', 'import-only'])
  assert.match(own.reason, /^cannot load at the head: /)
  assert.equal(
    verdictOf({ ...missing, scratchLack: 'lib/x.js is in the checkout but not in git: build output' }, null)
      .verdict,
    'not-runnable'
  )
  // A file of a submodule the copy does not hold, read at the head, is the copy's lack too — not `broken`.
  const noFile = classify(
    [
      {
        type: 'fail',
        name: 'reads the fork',
        nesting: 0,
        line: 4,
        column: 1,
        kind: 'test',
        error: {
          cause: {
            name: 'Error',
            code: 'ENOENT',
            message: "ENOENT: no such file or directory, open 'vendor/x/fork/src/a.css'"
          }
        }
      },
      { type: 'end' }
    ],
    { exit: 1, signal: null, timedOut: false, file: 'x.test.mjs', cwd: '/t', seconds: 0.1 }
  )
  assert.equal(verdictOf(noFile, null).verdict, 'broken')
  const lacking = verdictOf(noFile, null, { unavailable: [], unavailableAtHead: ['vendor/x/fork/'] })
  assert.deepEqual(lacking, {
    verdict: 'not-runnable',
    reason: 'needs a build or a dependency the scratch copy lacks at the head (vendor/x/fork/)'
  })
})

test('a run is whole only when the runner’s summary, its records and its exit code all agree', () => {
  const pass = { type: 'pass', name: 'a', nesting: 0, line: 3, column: 1, kind: 'test' }
  const fail = {
    type: 'fail',
    name: 'b',
    nesting: 0,
    line: 4,
    column: 1,
    kind: 'test',
    error: { cause: { code: 'ERR_ASSERTION', message: 'x' } }
  }
  const suite = { type: 'pass', name: 's', nesting: 0, line: 2, column: 1, kind: 'suite' }
  const counts = (over = {}) => ({
    tests: 1,
    suites: 0,
    passed: 1,
    failed: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
    ...over
  })
  const summary = (success, over) => ({ type: 'summary', counts: counts(over), success })
  const end = { type: 'end' }
  const ok = { exit: 0 }
  assert.equal(wholenessProblem([pass, summary(true), end], ok), null)
  assert.equal(wholenessProblem([pass, suite, summary(true, { suites: 1 }), end], ok), null)
  assert.equal(
    wholenessProblem([pass, fail, summary(false, { tests: 2, failed: 1 }), end], { exit: 1 }),
    null
  )
  // A cancelled case is a failed record; the runner counts it apart.
  assert.equal(
    wholenessProblem([pass, fail, summary(false, { tests: 2, cancelled: 1 }), end], { exit: 1 }),
    null
  )

  const state = (records, exit) =>
    classifyRun(records, { exit, signal: null, timedOut: false, file: 'x.test.mjs', cwd: '/t', seconds: 1 })
  const refused = (records, exit, why) => {
    assert.match(wholenessProblem(records, { exit }), why)
    const run = state(records, exit)
    assert.equal(run.state, 'incomplete', `${String(why)} must not be judged`)
    assert.equal(verdictOf(run, null).verdict, 'not-runnable')
    assert.match(verdictOf(run, null).reason, /the runner's result is not whole \(/)
    // And never the second half of a verdict either.
    assert.equal(verdictOf(state([pass, summary(true), end], 0), run).verdict, 'not-runnable')
  }
  // The reporter's last line alone is not completion: the stream closed, the runner said nothing.
  refused([pass, end], 0, /wrote 0 summaries/)
  refused([pass, summary(true), summary(true), end], 0, /wrote 2 summaries/)
  refused([pass, summary(true)], 0, /never wrote its last line/)
  refused([pass, { type: 'summary', counts: counts() }, end], 0, /no verdict or no counts/)
  // The summary says failure and the process exited 0, or the reverse.
  refused([pass, summary(false), end], 0, /says failure and the runner exited 0/)
  refused([pass, summary(true), end], 1, /says success and the runner exited 1/)
  refused([pass, summary(true), end], null, /was killed/)
  // The runner counted a result the reporter never received, or the reverse.
  refused([pass, summary(true, { tests: 2, passed: 2 }), end], 0, /counts 2 tests and the records hold 1/)
  refused([pass, pass, summary(true), end], 0, /counts 1 tests and the records hold 2/)
  refused([pass, summary(true, { skipped: 1, tests: 2 }), end], 0, /tests and the records hold 1/)
  refused([pass, fail, summary(false, { tests: 2, passed: 2 }), end], 1, /passed and the records hold 1/)
  refused([pass, suite, summary(true), end], 0, /counts 0 suites and the records hold 1/)
  assert.equal(state([pass, summary(true), end], 0).state, 'green')
})

test('verdict rules: timeouts, incomplete runs and a missing browser never become a pass', () => {
  const end = { exit: 0, signal: null, timedOut: false, file: 'x.test.mjs', cwd: '/t', seconds: 1 }
  const pass = { type: 'pass', name: 'a', nesting: 0, line: 3, column: 1, kind: 'test' }
  const green = classify([pass, { type: 'end' }], end)
  assert.equal(green.state, 'green')
  assert.equal(verdictOf(null, null).reason, 'time')
  assert.equal(verdictOf(green, null).reason, 'time')
  assert.equal(
    verdictOf(classify([pass], { ...end, exit: null, signal: 'SIGKILL', timedOut: true }), null).reason,
    'time'
  )
  assert.equal(verdictOf(green, classify([pass], { ...end, timedOut: true })).reason, 'time')
  // No `end` record: the reporter was cut short, whatever the exit code says.
  const cut = classify([pass], end)
  assert.equal(cut.state, 'incomplete')
  assert.equal(verdictOf(cut, null).verdict, 'not-runnable')
  assert.equal(verdictOf(green, cut).verdict, 'not-runnable')
  const noBrowser = classify(
    [
      {
        type: 'fail',
        name: 'opens',
        nesting: 0,
        line: 4,
        column: 1,
        kind: 'test',
        error: { cause: { message: "browserType.launch: Executable doesn't exist at /x" } }
      },
      { type: 'end' }
    ],
    { ...end, exit: 1 }
  )
  assert.deepEqual(verdictOf(noBrowser, null), { verdict: 'not-runnable', reason: 'needs a browser' })
  // A thrown error that is neither an assertion nor an import is `other`, and still proves.
  const threw = classify(
    [
      {
        type: 'fail',
        name: 'a',
        nesting: 0,
        line: 3,
        column: 1,
        kind: 'test',
        error: { cause: { name: 'TypeError', message: 'x is not a function' } }
      },
      { type: 'end' }
    ],
    { ...end, exit: 1 }
  )
  assert.equal(verdictOf(green, threw).evidence, 'other')
  // An exit code that is not 0 with no failure on record is red, never green.
  assert.equal(classify([pass, { type: 'end' }], { ...end, exit: 7 }).state, 'red')
})

test('past the time limit the unfinished rows are not-runnable: time, and the scratch copy is gone', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/a-slow.test.mjs': `${HEADER}test('slow', async () => { await new Promise((r) => setTimeout(r, 60000)) })\n`,
      'apps/a/test/b-later.test.mjs': REAL_TEST
    }
  )
  const started = Date.now()
  const result = await run(f, { budgetSeconds: 3 })
  assert.ok(Date.now() - started < 30000, 'the slow test was killed at the deadline')
  assert.deepEqual(
    result.rows.map((r) => [r.file, r.verdict, r.reason]),
    [
      ['apps/a/test/a-slow.test.mjs', 'not-runnable', 'time'],
      ['apps/a/test/b-later.test.mjs', 'not-runnable', 'time']
    ]
  )
  assert.equal(result.overall, 'not-runnable')
  assert.deepEqual(readdirSync(f.scratchRoot), [])
})

test('a runner that outlives its test process is stopped as stalled, long before the deadline', async () => {
  // Stands in for the `node --test` runner that span after its file had finished: it starts one
  // short child, the child exits, and it stays alive.
  const script =
    "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { stdio: 'ignore' }); setInterval(() => {}, 1000)"
  const session = { children: new Set() }
  const started = Date.now()
  const end = await runProcess(process.execPath, ['-e', script], {
    cwd: WORK,
    env: process.env,
    deadline: Date.now() + 60000,
    stdout: 'ignore',
    stderr: 'ignore',
    session,
    watchStall: true,
    stallSeconds: 2
  })
  assert.equal(end.stalled, true)
  assert.equal(end.timedOut, false)
  assert.ok(Date.now() - started < 20000)
  assert.equal(session.children.size, 0)
  // Whatever it wrote, a stalled run is incomplete: its verdict is a reason, not a pass.
  const pass = { type: 'pass', name: 'a', nesting: 0, line: 3, column: 1, kind: 'test' }
  const run = classify([pass, { type: 'end' }], { ...end, file: 'x.test.mjs', cwd: '/t' })
  assert.equal(run.state, 'incomplete')
  assert.match(verdictOf(run, null).reason, /did not exit after the test process ended, twice, at the head/)
  // A test file quicker than one poll is never seen as a child: the records it left count instead.
  const progressFile = join(WORK, 'progress.jsonl')
  writeFileSync(progressFile, '{"type":"pass"}\n')
  const quick = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: WORK,
    env: process.env,
    deadline: Date.now() + 60000,
    stdout: 'ignore',
    stderr: 'ignore',
    session,
    watchStall: true,
    stallSeconds: 2,
    progressFile
  })
  assert.equal(quick.stalled, true)
  // A program that simply runs with no child of its own is not a stall.
  const plain = await runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], {
    cwd: WORK,
    env: process.env,
    deadline: Date.now() + 60000,
    stdout: 'ignore',
    stderr: 'ignore',
    session,
    watchStall: true,
    stallSeconds: 2
  })
  assert.deepEqual([plain.stalled, plain.exit], [false, 0])
})

test('the suite command comes from the tree: an unknown script shape is a reason, never another command', () => {
  const tree = join(WORK, 'tree-shape')
  mkdirSync(join(tree, 'scripts/test'), { recursive: true })
  const set = (scripts) => writeFileSync(join(tree, 'package.json'), JSON.stringify({ scripts }))
  set(JSON.parse(PACKAGE).scripts)
  assert.deepEqual(suiteCommand(tree, 'scripts/test/x.test.ts'), {
    argv: ['--import', 'tsx', '--test', 'scripts/test/x.test.ts'],
    cwd: '.',
    suite: 'interop',
    forceExit: false
  })
  assert.equal(suiteCommand(tree, 'scripts/test/x.test.mjs').forceExit, true)
  assert.ok(!suiteCommand(tree, 'scripts/test/x.test.mjs').argv.includes('--test-force-exit'))
  set({ 'test:workers': 'vitest run', 'test:interop': 'node --test other/*.test.ts' })
  assert.match(suiteCommand(tree, 'scripts/test/x.test.mjs').notRunnable, /is "vitest run", not/)
  assert.match(suiteCommand(tree, 'scripts/test/x.test.ts').notRunnable, /does not select this file/)
  set({ 'test:workers': 'node --test scripts/test/*.test.mjs; rm -rf /' })
  assert.ok('notRunnable' in suiteCommand(tree, 'scripts/test/x.test.mjs'))
  assert.match(
    suiteCommand(tree, 'packages/cms/tracy-emdash-theme-base/tests/a.test.mjs').notRunnable,
    /package\.json is absent/
  )
  assert.match(
    suiteCommand(tree, 'vendor/tracy/dsh-passwords/test/tracy/a.test.ts').notRunnable,
    /needs a build/
  )
})

test('paths: which changed file is a test, a helper, a catalogue case or the fix', () => {
  const role = (p) => classifyPath(p).role
  assert.deepEqual(classifyPath('packages/site/tracy-add-site/test/x.test.mjs'), {
    role: 'test',
    suite: 'workers'
  })
  assert.deepEqual(classifyPath('scripts/test/x.test.ts'), { role: 'test', suite: 'interop' })
  assert.deepEqual(classifyPath('packages/cms/tracy-emdash-theme-saas/tests/x.test.mjs'), {
    role: 'test',
    suite: 'standalone'
  })
  assert.equal(role('apps/tracy-web/test/sub/x.test.mjs'), 'unsupported-test')
  assert.equal(role('vendor/tracy/dsh-subscriptions/test/x.test.mjs'), 'unsupported-test')
  assert.equal(role('apps/tracy-web/test/helpers/db.mjs'), 'support')
  assert.equal(role('scripts/test/fixtures/a.json'), 'support')
  assert.equal(role('tests/regression/scripts/x.mjs'), 'support')
  assert.equal(role('tests/regression/cases/REG-1.json'), 'catalogue')
  assert.equal(role('tests/qa/layers/unit/cases/a.json'), 'catalogue')
  assert.equal(role('apps/tracy-web/src/lib/session.js'), 'fix')
  assert.equal(role('scripts/test-timings.json'), 'fix')
  assert.equal(role('docs/references/x.md'), 'fix')
})

test('growth: files and cases added and removed are kept apart; computed titles are not counted', async () => {
  assert.deepEqual(
    countCases(
      "test('a', () => {})\n  it.skip(\"b\", f)\n// test('commented', f)\ntest(`c`, f)\ntest(`d ${x}`, f)\nfor (const n of names) test(n, f)\nlatest('no', f)\n"
    ),
    {
      titles: ['a', 'b', 'c'],
      dynamic: 2
    }
  )
  const t = (...titles) => `${HEADER}${titles.map((x) => `test('${x}', () => {})`).join('\n')}\n`
  const f = fixture(
    {
      'apps/a/test/edited.test.mjs': t('keeps', 'drops'),
      'apps/a/test/removed.test.mjs': t('r1', 'r2'),
      'apps/a/test/moved.test.mjs': t('m1', 'm2', 'm3', 'm4', 'm5', 'm6')
    },
    {
      'apps/a/test/edited.test.mjs': `${t('keeps', 'new one', 'new two')}for (const n of ['x']) test(n, () => {})\n`,
      'apps/a/test/removed.test.mjs': null,
      'apps/a/test/moved.test.mjs': null,
      'apps/a/test/moved-here.test.mjs': t('m1', 'm2', 'm3', 'm4', 'm5', 'm6'),
      // Unlike any file of the base, so Git does not pair it with the removed one as a rename.
      'apps/a/test/added.test.mjs':
        "import { test as it } from 'node:test'\nconst noop = () => undefined\nconst unrelated = [1, 2, 3].map(String)\nvoid unrelated\nit('a1', noop)\n",
      'tests/regression/cases/REG-PR-2-y.json': '{}\n'
    }
  )
  const growth = measureGrowth(f.repo, listChanges(f.repo, f.base, f.head))
  assert.deepEqual(growth.files, {
    added: ['apps/a/test/added.test.mjs'],
    removed: ['apps/a/test/removed.test.mjs'],
    renamed: [{ from: 'apps/a/test/moved.test.mjs', to: 'apps/a/test/moved-here.test.mjs' }],
    edited: ['apps/a/test/edited.test.mjs']
  })
  // +a1 +new one +new two, −drops −r1 −r2; the rename moves six cases and adds none.
  assert.deepEqual(growth.cases, { added: 3, removed: 3, dynamicAtBase: 0, dynamicAtHead: 1 })
  assert.deepEqual(growth.catalogue, { added: 1, removed: 0, edited: 0 })
  assert.equal(growth.seconds.measured, false)

  const cli = spawnSync(
    process.execPath,
    [TOOL, '--growth-only', '--repo', f.repo, '--base', f.base, '--head', f.head, '--out', f.out],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: join(WORK, 'growth-summary.md') }
    }
  )
  assert.equal(cli.status, 0, cli.stderr)
  assert.match(
    cli.stdout,
    /Test growth: files \+1 −1 \(renamed 1, edited 1\); cases \+3 −3; 1 computed registration/
  )
  assert.match(cli.stdout, /seconds not measured/)
  assert.equal(readFileSync(join(WORK, 'growth-summary.md'), 'utf8'), cli.stdout)
  assert.deepEqual(JSON.parse(readFileSync(join(f.out, 'growth.json'), 'utf8')).growth.cases, growth.cases)
  // Growth runs nothing: no scratch copy was ever made.
  assert.deepEqual(readdirSync(f.scratchRoot), [])
})

test('command line: report-only exits 0 on any verdict, --enforce exits 3, a tool error exits 1, usage 2', () => {
  const unproved = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/t.test.mjs': `${HEADER}test('always', () => assert.ok(true))\n`
    }
  )
  const proved = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    { 'apps/a/src/double.mjs': FIXED, 'apps/a/test/double.test.mjs': REAL_TEST }
  )
  const cli = (f, ...extra) =>
    spawnSync(
      process.execPath,
      [TOOL, '--repo', f.repo, '--base', f.base, '--head', f.head, '--scratch-root', f.scratchRoot, ...extra],
      {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: '' }
      }
    )
  const reportOnly = cli(unproved)
  assert.equal(reportOnly.status, 0, reportOnly.stderr)
  assert.match(reportOnly.stdout, /New-test proof: unproved/)
  const enforced = cli(unproved, '--enforce')
  assert.equal(enforced.status, 3)
  assert.match(enforced.stdout, /REFUSED — apps\/a\/test\/t\.test\.mjs is unproved/)
  const accepted = cli(proved, '--enforce')
  assert.equal(accepted.status, 0, accepted.stderr)
  assert.match(accepted.stdout, /`--enforce`: accepted/)

  // Tool errors: a ref git cannot read, evidence inside the repository, an unwritable summary.
  const badRef = cli({ ...proved, head: 'no-such-ref' })
  assert.equal(badRef.status, 1)
  assert.match(badRef.stderr, /TOOL ERROR/)
  assert.equal(cli(proved, '--out', join(proved.repo, 'evidence')).status, 2)
  assert.equal(cli({ ...proved, scratchRoot: join(proved.repo, 'scratch') }).status, 2)
  assert.ok(!existsSync(join(proved.repo, 'scratch')))
  const noSummary = spawnSync(
    process.execPath,
    [
      TOOL,
      '--repo',
      proved.repo,
      '--base',
      proved.base,
      '--head',
      proved.head,
      '--scratch-root',
      proved.scratchRoot
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: join(WORK, 'no-such-dir', 'summary.md') }
    }
  )
  assert.equal(noSummary.status, 1)
  assert.deepEqual(readdirSync(proved.scratchRoot), [])

  assert.match(parseArgs(['--base', 'a']).error, /--base and --head are required/)
  assert.match(parseArgs(['--base', 'a', '--head', 'b', '--enforced']).error, /unknown argument/)
  assert.match(parseArgs(['--base', 'a', '--head', 'b', '--base', 'c']).error, /repeated/)
  assert.match(parseArgs(['--base', 'a', '--head', 'b', '--budget-seconds', '0']).error, /whole seconds/)
  assert.match(parseArgs(['--growth-only', '--enforce', '--base', 'a', '--head', 'b']).error, /runs none/)
  assert.match(parseArgs(['--cleanup']).error, /--scratch-root/)
  assert.equal(
    spawnSync(process.execPath, [TOOL, '--base', '--upload-pack=x', '--head', 'HEAD'], {
      encoding: 'utf8',
      cwd: proved.repo
    }).status,
    2
  )
  assert.equal(DEFAULT_BUDGET_SECONDS, 180)
})

test('the same pair of commits gives the same result, measured seconds aside', async () => {
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/double.test.mjs': REAL_TEST,
      'apps/a/test/always.test.mjs': `${HEADER}test('always', () => assert.ok(true))\n`
    }
  )
  const strip = (value) =>
    JSON.parse(
      JSON.stringify(value, (key, v) =>
        ['seconds', 'wallSeconds', 'addedFiles', 'editedFiles'].includes(key) ? undefined : v
      )
    )
  const first = strip(await run(f))
  const second = strip(await run(f))
  assert.deepEqual(first, second)
  assert.deepEqual(
    first.rows.map((r) => r.verdict),
    ['unproved', 'proved']
  )
  assert.equal(first.overall, 'proved')
})

test('an interrupt kills the running test and leaves no scratch copy; --cleanup removes what a kill -9 left', async () => {
  const pidFile = join(WORK, 'slow-test.pid')
  const f = fixture(
    { 'apps/a/src/double.mjs': BUGGY },
    {
      'apps/a/src/double.mjs': FIXED,
      'apps/a/test/slow.test.mjs': `${HEADER}import { writeFileSync } from 'node:fs'\ntest('slow', async () => {\n  writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))\n  await new Promise((r) => setTimeout(r, 120000))\n})\n`
    }
  )
  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  const until = async (what, done) => {
    for (let i = 0; i < 300; i += 1) {
      if (done()) return
      await new Promise((r) => setTimeout(r, 100))
    }
    assert.fail(`timed out waiting for ${what}`)
  }
  const start = () =>
    spawn(
      process.execPath,
      [TOOL, '--repo', f.repo, '--base', f.base, '--head', f.head, '--scratch-root', f.scratchRoot],
      { stdio: 'ignore' }
    )

  for (const [signal, code] of [
    ['SIGTERM', 143],
    ['SIGINT', 130]
  ]) {
    rmSync(pidFile, { force: true })
    const tool = start()
    const exited = new Promise((r) => tool.on('close', (status) => r(status)))
    await until('the planted test to start', () => existsSync(pidFile))
    const testPid = Number(readFileSync(pidFile, 'utf8'))
    assert.equal(readdirSync(f.scratchRoot).length, 1, 'the scratch copy exists while the test runs')
    tool.kill(signal)
    assert.equal(await exited, code)
    await until('the test process to die', () => !alive(testPid))
    assert.deepEqual(readdirSync(f.scratchRoot), [], `no scratch copy after ${signal}`)
  }

  // SIGKILL cannot be handled: the copy stays, and `--cleanup` removes it by its owner file only.
  rmSync(pidFile, { force: true })
  const tool = start()
  const exited = new Promise((r) => tool.on('close', () => r()))
  await until('the planted test to start', () => existsSync(pidFile))
  const testPid = Number(readFileSync(pidFile, 'utf8'))
  tool.kill('SIGKILL')
  await exited
  // The runner the tool started leads the group the planted test is in; nothing else is left to stop it.
  const runnerPid = Number(
    execFileSync('ps', ['-o', 'ppid=', '-p', String(testPid)], { encoding: 'utf8' }).trim()
  )
  process.kill(-runnerPid, 'SIGKILL')
  await until('the orphaned test to die', () => !alive(testPid))
  const left = readdirSync(f.scratchRoot)
  assert.equal(left.length, 1)
  assert.ok(left[0].startsWith(SCRATCH_PREFIX))
  mkdirSync(join(f.scratchRoot, `${SCRATCH_PREFIX}not-ours`))
  mkdirSync(join(f.scratchRoot, 'someone-elses'))
  const cleaned = spawnSync(process.execPath, [TOOL, '--cleanup', '--scratch-root', f.scratchRoot], {
    encoding: 'utf8'
  })
  assert.equal(cleaned.status, 0, cleaned.stderr)
  assert.match(cleaned.stdout, /removed 1 scratch/)
  assert.deepEqual(readdirSync(f.scratchRoot).sort(), ['someone-elses', `${SCRATCH_PREFIX}not-ours`].sort())
  assert.deepEqual(cleanupScratch(f.scratchRoot), [])
})

test('the replay picks merged fix pull requests from first-parent history, by title or branch', () => {
  const f = fixture({ 'a.txt': '1\n' }, { 'a.txt': '2\n' })
  const merge = (n, branch, title) => {
    f.git('checkout', '-q', '-b', branch)
    writeFileSync(join(f.repo, `f${String(n)}.txt`), String(n))
    f.git('add', '-A')
    f.git('commit', '-q', '-m', `work ${String(n)}`)
    f.git('checkout', '-q', 'main')
    f.git(
      'merge',
      '-q',
      '--no-ff',
      branch,
      '-m',
      `Merge pull request #${String(n)} from TracyHQ/${branch}`,
      '-m',
      title
    )
  }
  merge(1, 'fix/one', 'fix(a): one')
  merge(2, 'feat/two', 'feat(a): two')
  merge(3, 'chore/three', 'fix: three, named by its title')
  merge(4, 'fix/four', 'docs: four, named by its branch')
  merge(5, 'docs/five', 'docs: five')
  const picked = selectFixMerges(f.repo, 'main', 30)
  assert.deepEqual(
    picked.map((p) => p.pr),
    [4, 3, 1]
  )
  assert.deepEqual(
    selectFixMerges(f.repo, 'main', 2).map((p) => p.pr),
    [4, 3]
  )
  for (const p of picked) assert.equal(f.git('rev-parse', `${p.merge}^1`), p.base)
  assert.equal(picked[2].title, 'fix(a): one')
})

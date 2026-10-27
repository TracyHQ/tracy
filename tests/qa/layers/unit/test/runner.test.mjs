/**
 * Selftests of the unit layer's runner against a fake repository: a green area suite is never a PASS,
 * red/zero/skipped/truncated runs are classified, prerequisites become ENV only with a probe, and a
 * regression case is PASS only when its own test goes red on the pre-fix source found in git history.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkObservedAgainstLog, completeRun } from '../../../fixtures/static/acceptance.mjs'
import { freshDir } from '../../../fixtures/static/fake-tree.mjs'
import { parseTap } from '../../static/lib/common.mjs'
import { dockerFence, listCases, MAX_TMPDIR, run } from '../index.mjs'
import { findFix, isProductPath, judgeRed } from '../lib/redproof.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const RUN = fileURLToPath(new URL('../run.mjs', import.meta.url))

const base = {
  itemIds: ['x'],
  requirement: 'r',
  oracle: { source: 's', ref: 'r', invariant: 'i' },
  edgeTags: ['happy'],
  targets: ['local'],
  effects: { reads: [], writes: [], mail: false, model: false, containers: false },
  prerequisites: [],
  assertionIds: [],
  redProof: null,
  legacyIds: [],
  cwd: '.',
  needs: [],
  tests: [],
  timeoutS: 60
}

/** A fake repo whose tests are plain node:test files. */
function repo(files) {
  const dir = freshDir()
  const root = join(dir, 'tree')
  mkdirSync(root, { recursive: true })
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  return {
    dir,
    root,
    out: join(dir, 'out'),
    ctx: {
      root,
      casesDir: join(dir, 'cases'),
      heavyDirs: [],
      env: { ...process.env },
      cdpUrl: 'http://127.0.0.1:1/json/version'
    }
  }
}

/** @returns {object} a suite manifest running the given files. */
function suite(id, files, over = {}) {
  return {
    ...base,
    id: `QA-UNIT-${id}`,
    kind: 'suite',
    area: id,
    areas: [id],
    command: ['node', '--test', '--test-reporter=tap', ...files],
    files,
    ...over
  }
}

async function go(t, manifests, { proveRed = true, target = 'local' } = {}) {
  mkdirSync(t.ctx.casesDir, { recursive: true })
  for (const m of manifests) writeFileSync(join(t.ctx.casesDir, `${m.id}.json`), JSON.stringify(m))
  return run({ cases: await listCases({}, t.ctx), target, proveRed, outDir: t.out }, t.ctx)
}

const PASSING =
  "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('adds', () => assert.equal(1 + 1, 2))\n"

test('a green area suite is reported with its counts and is never a PASS', async () => {
  const t = repo({ 'a/test/ok.test.mjs': PASSING })
  const [r] = await go(t, [suite('green', ['a/test/ok.test.mjs'])])
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /GREEN \(1 of 1 tests passed, 0 skipped\)/)
  assert.deepEqual(r.observed, { tests: 1, pass: 1, fail: 0, skipped: 0, todo: 0, cancelled: 0 })
})

test('a red suite is FAIL and names the first red test', async () => {
  const t = repo({
    'a/test/bad.test.mjs':
      "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('breaks', () => assert.equal(1, 2))\n"
  })
  const [r] = await go(t, [suite('red', ['a/test/bad.test.mjs'])])
  assert.equal(r.verdict, 'FAIL')
  assert.match(r.reason, /breaks/)
  assert.equal(r.observed.tests, 1)
  assert.equal(r.observed.fail, 1)
})

test('zero tests, truncated output and a module that cannot load are never PASS', async () => {
  const t = repo({
    'a/test/empty.test.mjs': '// no tests here\n',
    'a/test/load.test.mjs': "import 'qa-no-such-package-xyz'\n"
  })
  const out = await go(t, [
    suite('zero', ['a/test/empty.test.mjs']),
    suite('summaryzero', [], {
      command: [
        'node',
        '-e',
        "console.log('# tests 0\\n# pass 0\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0')",
        '--test-reporter=tap'
      ]
    }),
    suite('truncated', [], {
      command: [
        'node',
        '-e',
        "console.log('TAP version 13'); console.log('ok 1 - a'); // --test-reporter=tap",
        '--test-reporter=tap'
      ]
    }),
    suite('noload', ['a/test/load.test.mjs'])
  ])
  const by = Object.fromEntries(out.map((r) => [r.id, r]))
  assert.equal(by['QA-UNIT-zero'].verdict, 'PENDING')
  assert.match(by['QA-UNIT-zero'].reason, /registered no test/)
  assert.equal(by['QA-UNIT-summaryzero'].verdict, 'PENDING')
  assert.match(by['QA-UNIT-summaryzero'].reason, /zero tests ran/)
  assert.equal(by['QA-UNIT-truncated'].verdict, 'PENDING')
  assert.match(by['QA-UNIT-truncated'].reason, /TAP summary missing/)
  assert.notEqual(by['QA-UNIT-noload'].verdict, 'PASS')
})

test('a skipped test is ENV only when it names the database and the probe says it is unset', async () => {
  const skipDb =
    "import { test } from 'node:test'\ntest('needs db', { skip: 'set TEST_DATABASE_URL' }, () => {})\n"
  const skipOther = "import { test } from 'node:test'\ntest('lazy', { skip: 'later' }, () => {})\n"
  const t = repo({ 'a/test/db.test.mjs': skipDb, 'a/test/other.test.mjs': skipOther })
  delete t.ctx.env.TEST_DATABASE_URL
  const [db, other] = await go(t, [
    suite('db', ['a/test/db.test.mjs']),
    suite('other', ['a/test/other.test.mjs'])
  ])
  assert.equal(db.verdict, 'ENV')
  assert.match(db.reason, /postgres: 1 of 1 tests skipped/)
  assert.equal(other.verdict, 'PENDING')
  assert.match(other.reason, /skipped/)
  const t2 = repo({ 'a/test/db.test.mjs': skipDb })
  t2.ctx.env.TEST_DATABASE_URL = 'postgres://inherited/not-ours'
  const [again] = await go(t2, [suite('db2', ['a/test/db.test.mjs'])])
  assert.equal(again.verdict, 'PENDING', 'an inherited database URL is not trusted as a lease')
})

test('a missing php is ENV when every skip or red test names it and the probe says php is absent; a product failure beside it stays FAIL', async () => {
  const skipPhp =
    "import { test } from 'node:test'\ntest('p1', { skip: 'PHP tests need PHP: this host has none on PATH' }, () => {})\n"
  const ciPhp =
    "import { test } from 'node:test'\ntest('p2', () => { throw new Error('PHP tests cannot run on CI: this host has neither `php` on PATH nor a docker daemon') })\n"
  const product =
    "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('p3', () => assert.equal(1, 2))\n"
  const files = {
    'a/test/skip.test.mjs': skipPhp,
    'a/test/ci.test.mjs': ciPhp,
    'a/test/mixed.test.mjs': `${ciPhp}${product}`
  }
  const t = repo(files)
  t.ctx.env.PATH = dirname(process.execPath)
  const [ci, mixed, skip] = await go(t, [
    suite('phpskip', ['a/test/skip.test.mjs']),
    suite('phpci', ['a/test/ci.test.mjs']),
    suite('phpmixed', ['a/test/mixed.test.mjs'])
  ])
  assert.equal(skip.verdict, 'ENV', skip.reason)
  assert.match(skip.reason, /php: 1 of 1 tests skipped.*PHP/)
  assert.equal(ci.verdict, 'ENV', ci.reason)
  assert.match(ci.reason, /PHP/)
  assert.equal(mixed.verdict, 'FAIL', mixed.reason)
  assert.ok(mixed.evidence.length > 0)
})

test('the database URL is never inherited by a child', async () => {
  const t = repo({
    'a/test/env.test.mjs':
      "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('no url', () => assert.equal(process.env.TEST_DATABASE_URL, undefined))\n"
  })
  t.ctx.env.TEST_DATABASE_URL = 'postgres://inherited/not-ours'
  const [r] = await go(t, [suite('env', ['a/test/env.test.mjs'])])
  assert.equal(r.observed.pass, 1, r.reason)
})

test('a test file that moved away is FAIL, not a silent skip', async () => {
  const t = repo({ 'a/test/ok.test.mjs': PASSING })
  const [r] = await go(t, [suite('lost', ['a/test/ok.test.mjs', 'a/test/gone.test.mjs'])])
  assert.equal(r.verdict, 'FAIL')
  assert.match(r.reason, /test file not found: a\/test\/gone\.test\.mjs/)
})

test('needs become ENV only with a probe; a Playwright spec and browser scripts stay PENDING', async () => {
  const t = repo({})
  delete t.ctx.env.TEST_DATABASE_URL
  delete t.ctx.env.QA_STAND_URL
  const reg = (id, needs, over = {}) => ({
    ...base,
    id: `QA-UNIT-${id}`,
    kind: 'regression',
    area: 'regression',
    areas: ['regression'],
    style: 'node-tap',
    needs,
    command: ['node', '-e', '0'],
    regression: { id, pr: 1, kind: 'fix', area: 'x', file: 'f' },
    ...over
  })
  const out = await go(t, [
    reg('pg', ['postgres']),
    reg('stand', ['stand']),
    reg('chrome', ['chrome']),
    reg('pw', [], { style: 'playwright' })
  ])
  const by = Object.fromEntries(out.map((r) => [r.id, r]))
  assert.equal(by['QA-UNIT-pg'].verdict, 'ENV')
  assert.match(by['QA-UNIT-pg'].reason, /TEST_DATABASE_URL is not set/)
  assert.equal(by['QA-UNIT-stand'].verdict, 'ENV')
  assert.equal(by['QA-UNIT-chrome'].verdict, 'ENV')
  assert.match(by['QA-UNIT-chrome'].reason, /GET http:\/\/127\.0\.0\.1:1\/json\/version failed/)
  assert.equal(by['QA-UNIT-pw'].verdict, 'PENDING')
  const probes = JSON.parse(readTextSync(join(t.out, 'probes.json')))
  assert.deepEqual(probes.map((p) => p.probe).sort(), ['chrome', 'postgres', 'stand'])
})

const STARTS_CONTAINER =
  "import { test } from 'node:test'\nimport { spawnSync } from 'node:child_process'\nimport assert from 'node:assert/strict'\ntest('x', () => { assert.equal(spawnSync('docker', ['run', '--rm', 'php:8']).status, 0) })\n"

test('a command that asks for a container is refused by the fence: ENV when neither php nor docker exist, PENDING when docker is up, never FAIL; one that does not ask runs', async () => {
  const t = repo({ 'a/starts.test.mjs': STARTS_CONTAINER, 'a/plain.test.mjs': PASSING })
  t.ctx.env = { ...t.ctx.env, PATH: join(t.root, 'no-such-bin') }
  const cmd = (f) => [process.execPath, '--test', '--test-reporter=tap', f]
  const out = await go(t, [
    suite('docker', ['a/starts.test.mjs'], { command: cmd('a/starts.test.mjs') }),
    suite('plain', ['a/plain.test.mjs'], { command: cmd('a/plain.test.mjs') })
  ])
  const by = Object.fromEntries(out.map((r) => [r.id, r]))
  assert.equal(by['QA-UNIT-docker'].verdict, 'ENV', by['QA-UNIT-docker'].reason)
  assert.match(by['QA-UNIT-docker'].reason, /neither is available/)
  assert.match(by['QA-UNIT-docker'].reason, /docker run --rm php:8/)
  assert.ok(by['QA-UNIT-docker'].evidence.some((e) => e.endsWith('.docker-refused')))
  assert.doesNotMatch(by['QA-UNIT-plain'].reason, /container/)
  // docker answers the probe: the refusal is the adapter's, not a missing prerequisite
  const bin = join(t.dir, 'bin2')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), '#!/bin/sh\necho 27.0\n', { mode: 0o755 })
  const t2 = repo({ 'a/starts.test.mjs': STARTS_CONTAINER })
  t2.ctx.env = { ...t2.ctx.env, PATH: `${bin}:${join(t2.root, 'no-such-bin')}` }
  const [r2] = await go(t2, [suite('docker', ['a/starts.test.mjs'], { command: cmd('a/starts.test.mjs') })])
  assert.equal(r2.verdict, 'PENDING', r2.reason)
  assert.match(r2.reason, /does not own/)
})

test('a TAP run whose plan, points and summary disagree is invalid, and a truncated or unrelated TAP is not a RED', () => {
  const sum = (n, pass, fail) =>
    `1..${n}\n# tests ${n}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped 0\n# todo 0\n`
  assert.equal(parseTap(`ok 1 - a\n${sum(1, 1, 0)}`).valid, true)
  assert.match(parseTap(`ok 1 - a\n${sum(3, 1, 0)}`).why, /disagrees|plan says/)
  // the point says ok, the summary says it failed
  assert.match(parseTap(`ok 1 - a\n${sum(1, 0, 1)}`).why, /passing points/)
  // no plan line
  assert.match(
    parseTap('ok 1 - a\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n').why,
    /plan/
  )
  const m = { style: 'node-tap', tests: ['named'] }
  const run = { status: 1, timedOut: false }
  assert.equal(judgeRed(m, run, 'not ok 1 - named\n').red, false)
  assert.equal(judgeRed(m, run, `not ok 1 - named\n${sum(1, 0, 1)}`).red, true)
  // no named assertion: a single `not ok` plus a summary without a plan is not a run; a complete one counts
  // only when that test was green on the real tree
  const open = { style: 'node-tap', tests: [] }
  const control = `ok 1 - was green\n${sum(1, 1, 0)}`
  assert.equal(judgeRed(open, run, 'not ok 1 - was green\n# tests 1\n# fail 1\n', control).red, false)
  assert.equal(judgeRed(open, run, `not ok 1 - was green\n${sum(1, 0, 1)}`, control).red, true)
  assert.equal(judgeRed(open, run, `not ok 1 - brand new\n${sum(1, 0, 1)}`, control).red, false)
  // a script check outside the manifest's named assertions is not the case's RED
  const script = { style: 'script', tests: ['S1'] }
  assert.equal(
    judgeRed(script, run, 'not ok - S9: other\n1 CHECK(S) FAILED\n', 'ok - S9: other\n').red,
    false
  )
  // a script with no named check: only a check that passed on the real tree counts
  const bare = { style: 'script', tests: [] }
  assert.equal(judgeRed(bare, run, 'not ok - X\n1 CHECK(S) FAILED\n', 'ok - Y\n').red, false)
  assert.equal(judgeRed(bare, run, 'not ok - X\n1 CHECK(S) FAILED\n', 'ok - X\n').red, true)
})

test('cases without a deterministic run, flaky-model cases and unexecuted groups are PENDING with an owner or a probe', async () => {
  const t = repo({})
  const norun = (id, over = {}) => ({
    ...base,
    id: `QA-UNIT-${id}`,
    kind: 'no-run',
    area: 'regression-no-run',
    areas: ['regression-no-run'],
    ownerLayer: 'flows',
    ownerSource: 'rules',
    flakyModel: false,
    needs: ['stand'],
    command: [],
    ...over
  })
  const group = (id, probe) => ({
    ...base,
    id: `QA-UNIT-${id}`,
    kind: 'group',
    area: id,
    areas: [id],
    probe,
    notRun: 'slow',
    command: []
  })
  const out = await go(t, [
    norun('plain'),
    norun('flaky', { flakyModel: true }),
    group('standalone', 'node_modules:packages/x'),
    group('e2e', 'chrome'),
    group('vendor', 'none')
  ])
  const by = Object.fromEntries(out.map((r) => [r.id, r]))
  assert.match(by['QA-UNIT-plain'].reason, /owner layer flows/)
  assert.match(by['QA-UNIT-flaky'].reason, /harness live set/)
  assert.equal(by['QA-UNIT-standalone'].verdict, 'ENV')
  assert.equal(by['QA-UNIT-e2e'].verdict, 'ENV')
  assert.equal(by['QA-UNIT-vendor'].verdict, 'PENDING')
})

test('non-local targets are PENDING target-policy and run nothing', async () => {
  const t = repo({ 'a/test/ok.test.mjs': PASSING })
  const [r] = await go(t, [suite('policy', ['a/test/ok.test.mjs'])], { target: 'dev' })
  assert.match(r.reason, /^target-policy/)
  assert.equal(existsSync(join(t.out, 'logs')), false)
})

/** Build a git repo with a buggy base and a fix merged through `Merge pull request #7`. */
function gitFixture({ fixTouchesProduct = true, testNeedsNewModule = false } = {}) {
  const t = repo({
    'src/add.mjs': `export const add = (a, b) => a ${fixTouchesProduct ? '-' : '+'} b\n`,
    'test/add.test.mjs': PASSING.replace(
      "test('adds', () => assert.equal(1 + 1, 2))",
      "import { add } from '../src/add.mjs'\ntest('adds correctly', () => assert.equal(add(1, 2), 3))\ntest('other', () => assert.ok(true))"
    )
  })
  const git = (...args) => {
    const r = spawnSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args],
      { cwd: t.root, encoding: 'utf8' }
    )
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`)
    return r.stdout.trim()
  }
  git('init', '-q', '-b', 'main')
  // The pre-fix tree has no test yet; the PR adds the test with the fix.
  writeFileSync(join(t.root, 'test/add.test.mjs'), '// placeholder\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'base')
  const pre = git('rev-parse', 'HEAD')
  git('checkout', '-q', '-b', 'fix')
  const spec = PASSING.replace(
    "test('adds', () => assert.equal(1 + 1, 2))",
    `import { add } from '${testNeedsNewModule ? '../src/new.mjs' : '../src/add.mjs'}'\ntest('adds correctly', () => assert.equal(add(1, 2), 3))\ntest('other', () => assert.ok(true))`
  )
  writeFileSync(join(t.root, 'test/add.test.mjs'), spec)
  if (fixTouchesProduct) writeFileSync(join(t.root, 'src/add.mjs'), 'export const add = (a, b) => a + b\n')
  else writeFileSync(join(t.root, 'README.md'), 'docs only\n')
  if (testNeedsNewModule) writeFileSync(join(t.root, 'src/new.mjs'), 'export const add = (a, b) => a + b\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'fix')
  git('checkout', '-q', 'main')
  git('merge', '--no-ff', '-q', '-m', 'Merge pull request #7 from t/fix', 'fix')
  return { ...t, pre, git }
}

const regCase = (over = {}) => ({
  ...base,
  id: 'QA-UNIT-REG-X-happy',
  kind: 'regression',
  area: 'regression',
  areas: ['regression'],
  style: 'node-tap',
  command: ['node', '--test', '--test-reporter=tap', 'test/add.test.mjs'],
  tests: ['adds correctly'],
  legacyIds: ['REG-X'],
  regression: { id: 'REG-X', pr: 7, kind: 'fix', area: 'x', file: 'tests/regression/cases/REG-X.json' },
  ...over
})

test('a regression case is PASS only with a named assertion red on the pre-fix source from git history', async () => {
  const t = gitFixture()
  assert.equal(findFix(7, t.root).parent, t.pre)
  const [r] = await go(t, [regCase()])
  assert.equal(r.verdict, 'PASS', r.reason)
  assert.equal(r.redProof.kind, 'commit')
  assert.equal(r.redProof.ref, t.pre)
  assert.match(r.redProof.assertionId, /adds correctly/)
  assert.deepEqual(
    r.redProof.restored.map((f) => f.path),
    ['src/add.mjs']
  )
  const log = readTextSync(join(t.out, r.redProof.log))
  assert.match(log, /not ok \d+ - adds correctly/)
  assert.match(log, /ok \d+ - other/, 'only the named assertion regressed')
  assert.equal(
    readTextSync(join(t.root, 'src/add.mjs')),
    'export const add = (a, b) => a + b\n',
    'the real tree keeps the fix'
  )
  assert.deepEqual(
    readdirSync(t.out).filter((n) => n.startsWith('scratch')),
    []
  )
})

test('the same case is PENDING when the pre-fix source cannot be found, is not product, or stays green', async () => {
  const t = gitFixture()
  const [missing] = await go(t, [
    regCase({ regression: { id: 'REG-X', pr: 99, kind: 'fix', area: 'x', file: 'f' } })
  ])
  assert.equal(missing.verdict, 'PENDING')
  assert.match(missing.reason, /no first-parent merge/)
  const docs = gitFixture({ fixTouchesProduct: false })
  const [none] = await go(docs, [regCase()])
  assert.equal(none.verdict, 'PENDING')
  assert.match(none.reason, /changed no product file/)
  const green = gitFixture()
  const [still] = await go(green, [regCase({ tests: ['other'] })])
  assert.equal(still.verdict, 'PENDING')
  assert.match(still.reason, /still green|no named assertion/)
})

test('a pre-fix run that only fails to load a module is not RED', async () => {
  const t = gitFixture({ testNeedsNewModule: true })
  const [r] = await go(t, [regCase()])
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /load code|still green|no named/)
})

test('without --prove-red a green regression case stays PENDING', async () => {
  const t = gitFixture()
  const [r] = await go(t, [regCase()], { proveRed: false })
  assert.equal(r.verdict, 'PENDING')
  assert.match(r.reason, /RED proof not requested/)
})

test('judgeRed accepts only a named assertion; helpers classify product paths', () => {
  const tap = (lines, skipped = 0) =>
    `${lines}\n1..2\n# tests 2\n# suites 0\n# pass ${1 - skipped}\n# fail 1\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`
  const m = { style: 'node-tap', tests: ['named'] }
  assert.equal(judgeRed(m, { status: 1, timedOut: false }, tap('not ok 1 - named\nok 2 - other')).red, true)
  assert.equal(judgeRed(m, { status: 1, timedOut: false }, tap('ok 1 - named\nnot ok 2 - other')).red, false)
  assert.equal(judgeRed(m, { status: 0, timedOut: false }, tap('ok 1 - named')).red, false)
  assert.equal(
    judgeRed(
      m,
      { status: 1, timedOut: false },
      "not ok 1 - named\nError [ERR_MODULE_NOT_FOUND]: Cannot find module 'x'"
    ).red,
    false
  )
  assert.equal(judgeRed(m, { status: null, timedOut: true }, '').red, false)
  // a SKIPPED named assertion is not a RED (tapVerdict counts it as failed for green runs)
  assert.equal(
    judgeRed(m, { status: 1, timedOut: false }, tap('ok 1 - named # SKIP no db\nnot ok 2 - other', 1)).red,
    false
  )
  const script = { style: 'script', tests: [] }
  assert.equal(
    judgeRed(
      script,
      { status: 1, timedOut: false },
      'not ok - S1: x\n1 CHECK(S) FAILED\n',
      'ok - S1: x\nALL CHECKS PASSED\n'
    ).red,
    true
  )
  // a check that was not green on the real tree (unrelated or new failure) is not a RED
  assert.equal(
    judgeRed(
      script,
      { status: 1, timedOut: false },
      'not ok - S9: other\n1 CHECK(S) FAILED\n',
      'ok - S1: x\nALL CHECKS PASSED\n'
    ).red,
    false
  )
  assert.equal(
    judgeRed(script, { status: 1, timedOut: false }, 'not ok - S1: x\n1 CHECK(S) FAILED\n').red,
    false
  )
  assert.equal(judgeRed(script, { status: 1, timedOut: false }, 'crashed\n').red, false)
  for (const p of ['apps/tracy-web/src/lib/x.js', 'packages/a/b/lib/client.js', 'scripts/check-x.ts'])
    assert.equal(isProductPath(p), true, p)
  for (const p of [
    'apps/a/test/x.test.mjs',
    'tests/regression/cases/REG-1.json',
    'docs/a.md',
    'packages/a/b/package.json',
    'tasks/nhat-ky/x.md'
  ])
    assert.equal(isProductPath(p), false, p)
})

test('the CLI exits 2 on bad usage before running anything and 3 when only PENDING/ENV remain', () => {
  for (const args of [
    ['--bogus'],
    ['--area', 'no-such-area-xyz'],
    ['--area'],
    ['--target', 'moon'],
    ['--out', '/etc/qa-unit']
  ]) {
    const r = spawnSync('node', [RUN, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2, `${args.join(' ')} -> ${r.status}`)
  }
  const dir = join(freshDir(), 'o')
  const ok = spawnSync('node', [RUN, '--area', 'QA-UNIT-REG-001-pending', '--out', dir], {
    encoding: 'utf8'
  })
  assert.equal(ok.status, 3, ok.stderr)
  // --area narrows the run to that case: a runner that dropped it would run the whole layer.
  const only = JSON.parse(readTextSync(join(dir, 'results.json')))
  assert.deepEqual(
    only.map((r) => r.id),
    ['QA-UNIT-REG-001-pending']
  )
})

test('acceptance reads the TAP log of every observed result and goes red when the counts do not match it', () => {
  const dir = freshDir()
  const sum = (n, pass, fail) =>
    `1..${n}\n# tests ${n}\n# suites 0\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped 0\n# todo 0\n`
  writeFileSync(join(dir, 'ok.log'), `ok 1 - a\n${sum(1, 1, 0)}`)
  writeFileSync(join(dir, 'lie.log'), `ok 1 - a\n${sum(1, 0, 1)}`)
  const obs = (pass, fail) => ({ tests: 1, pass, fail, skipped: 0, todo: 0, cancelled: 0 })
  checkObservedAgainstLog(dir, { id: 'x', observed: obs(1, 0), evidence: ['ok.log'] }, parseTap)
  // counts edited in the result only
  assert.throws(() =>
    checkObservedAgainstLog(dir, { id: 'x', observed: obs(0, 1), evidence: ['ok.log'] }, parseTap)
  )
  // the log edited, the result left alone
  assert.throws(() =>
    checkObservedAgainstLog(dir, { id: 'x', observed: obs(1, 0), evidence: ['lie.log'] }, parseTap)
  )
  // observed counts with no log at all
  assert.throws(
    () => checkObservedAgainstLog(dir, { id: 'x', observed: obs(1, 0), evidence: [] }, parseTap),
    /need the TAP log/
  )
})

test('a strict reader: wrong numbering, repeated summary, nested suites and abnormal ends grant nothing', () => {
  const sum = (n, suites = 0) =>
    `1..${n}\n# tests ${n}\n# suites ${suites}\n# pass ${n}\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n`
  assert.equal(parseTap(`ok 1 - a\n${sum(1)}`).valid, true)
  assert.match(parseTap(`ok 7 - a\n${sum(1)}`).why, /test numbers/)
  assert.match(parseTap(`ok 1 - a\n${sum(1)}${sum(1)}`).why, /repeated|plan/)
  assert.match(parseTap(`ok 1 - a\n${sum(1, 1)}`).why, /nested suites/)
  const m = { style: 'node-tap', tests: ['named'] }
  const out = `not ok 1 - named\n1..1\n# tests 1\n# suites 0\n# pass 0\n# fail 1\n# cancelled 0\n# skipped 0\n# todo 0\n`
  assert.equal(judgeRed(m, { status: 1, signal: null, timedOut: false }, out).red, true)
  // killed by a signal after complete output, or no exit status: not a normal failure
  assert.equal(judgeRed(m, { status: null, signal: 'SIGTERM', timedOut: false }, out).red, false)
  assert.equal(judgeRed(m, { status: 1, signal: null, timedOut: false, spawnFailed: true }, out).red, false)
  // a name that only starts like the named assertion is another test
  assert.equal(
    judgeRed(m, { status: 1, signal: null, timedOut: false }, out.replace('named', 'named too')).red,
    false
  )
  const script = { style: 'script', tests: ['S1: one'] }
  const s = 'not ok - S1: one more\n1 CHECK(S) FAILED\n'
  assert.equal(judgeRed(script, { status: 1, timedOut: false }, s, 'ok - S1: one more\n').red, false)
})

test('a swallowed container refusal that still exits 0 is never GREEN', async () => {
  const swallowed =
    "import { test } from 'node:test'\nimport { spawnSync } from 'node:child_process'\ntest('x', () => { spawnSync('docker', ['run', 'php:8']) })\n"
  const t = repo({ 'a/swallow.test.mjs': swallowed })
  const [r] = await go(t, [
    suite('swallow', ['a/swallow.test.mjs'], {
      command: [process.execPath, '--test', '--test-reporter=tap', 'a/swallow.test.mjs']
    })
  ])
  assert.equal(r.verdict, 'PENDING', r.reason)
  assert.match(r.reason, /exited 0 anyway/)
  assert.ok(r.evidence.some((e) => e.endsWith('.docker-refused')))
})

test('acceptance counts each kind of point in the log itself and catches a result edited per kind', () => {
  const dir = freshDir()
  const tail = (t, p, f, s) =>
    `1..${t}\n# tests ${t}\n# suites 0\n# pass ${p}\n# fail ${f}\n# cancelled 0\n# skipped ${s}\n# todo 0\n`
  writeFileSync(join(dir, 'k.log'), `ok 1 - a\nnot ok 2 - b\nok 3 - c # SKIP why\n${tail(3, 1, 1, 1)}`)
  const obs = (o) => ({ tests: 3, pass: 1, fail: 1, skipped: 1, todo: 0, cancelled: 0, ...o })
  const check = (o) =>
    checkObservedAgainstLog(dir, { id: 'x', observed: obs(o), evidence: ['k.log'] }, parseTap)
  check({})
  // the same total, a different mix: only a per-kind count sees it
  assert.throws(() => check({ pass: 2, skipped: 0 }))
  assert.throws(() => check({ fail: 0, skipped: 2 }))
  assert.throws(() => check({ skipped: 0, todo: 1 }))
})

test('a cached run is reused only when every file and evidence path is a readable, non-empty regular file', () => {
  const dir = freshDir()
  const put = (f, text) => {
    mkdirSync(join(dir, f, '..'), { recursive: true })
    writeFileSync(join(dir, f), text)
  }
  put('exit-code.txt', '0\n')
  put('run/report.md', '# r\n')
  put('run/results.json', JSON.stringify([{ id: 'x', evidence: ['logs/x.log'] }]))
  assert.equal(completeRun(dir), false, 'the evidence log is missing')
  put('run/logs/x.log', 'ok\n')
  assert.equal(completeRun(dir), true)
  put('run/report.md', '')
  assert.equal(completeRun(dir), false, 'an empty report')
  put('run/report.md', '# r\n')
  put('run/results.json', '{not json')
  assert.equal(completeRun(dir), false, 'a corrupt result file')
  put('run/results.json', JSON.stringify([{ id: 'x', evidence: ['logs'] }]))
  assert.equal(completeRun(dir), false, 'evidence that is a directory')
})

test('a child gets a short TMPDIR for sockets and its data directory under the run output; both are removed', () => {
  const out = freshDir('qa-fence-')
  const fence = dockerFence({ env: process.env }, out, 'QA-UNIT-x')
  const { TMPDIR, TRACY_TEST_ARTIFACT_DIR } = fence.env
  assert.ok(TMPDIR.length <= MAX_TMPDIR, `${TMPDIR} leaves room for a socket name`)
  assert.ok(!TMPDIR.startsWith(out), 'the socket directory is not under the (long) run output')
  assert.ok(TRACY_TEST_ARTIFACT_DIR.startsWith(out), 'data stays in the run output')
  assert.ok(existsSync(TMPDIR) && existsSync(TRACY_TEST_ARTIFACT_DIR))
  assert.deepEqual(fence.dispose(), [])
  assert.ok(!existsSync(TMPDIR) && !existsSync(TRACY_TEST_ARTIFACT_DIR))
  assert.deepEqual(fence.dispose(), [], 'removing twice is harmless')
  // A socket directory whose ownership changed is left alone and reported, so the case is TEST_INVALID.
  const other = dockerFence({ env: process.env }, out, 'QA-UNIT-y')
  writeFileSync(join(other.env.TMPDIR, '.qa-scratch-owner'), '{"token":"not-ours"}\n')
  const left = other.dispose()
  assert.equal(left.length, 1)
  assert.match(left[0], /another owner's token/)
  assert.ok(existsSync(other.env.TMPDIR))
  rmSync(other.env.TMPDIR, { recursive: true, force: true })
  rmSync(out, { recursive: true, force: true })
})

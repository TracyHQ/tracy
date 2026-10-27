#!/usr/bin/env node
/**
 * The pre-push hook and the test gate, run as the COMMANDS they are, against a stand-in `pnpm` and
 * a stand-in `docker`.
 *
 *   node --test scripts/test/check-prepush-postgres.test.mjs
 *
 * WHY THIS IS NOT ANOTHER UNIT TEST. `check-push.test.mjs` tests the hook's decisions as pure
 * functions, and until 05/10/2026 nothing ran the hook itself: which command it spawns, how often,
 * with which environment, and what its exit code becomes were all read off the source. That is how
 * the hook came to run raw `pnpm test:workers` — no database, the PostgreSQL tests skipping
 * themselves, a green tick — beside a wrapper (`scripts/check-tests.ts`) written to refuse exactly
 * that. So the hook is copied into a scratch repository and pushed at, and the gate is started with
 * its real argv; the only things replaced are the two programs on `PATH`.
 *
 * WHAT A STAND-IN CANNOT SHOW: a database that answers. `docker start` here either fails or is
 * never reached, so the `ready` branch of the real command is covered by the stubbed lifecycle in
 * `check-tests-throwaway.test.ts` and by a real run, not by this file.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPTS = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(SCRIPTS, '..')
const SHA_ZERO = '0'.repeat(40)
const WRAPPER = 'exec tsx scripts/check-tests.ts --part workers --database owned'

const TMP = mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'prepush-postgres-'))
after(() => rmSync(TMP, { recursive: true, force: true }))

/**
 * The stand-ins. Each appends one line per call to `$FAKE_LOG` and then does what the test asked
 * through `FAKE_*` variables. `pnpm` also records the git location variables and the database url
 * it was started with, because what the hook must NOT pass on is half of what is under test.
 */
const BIN = join(TMP, 'bin')
mkdirSync(BIN)
writeFileSync(
  join(BIN, 'pnpm'),
  `#!/bin/sh
printf 'pnpm %s|GIT_DIR=%s|GIT_WORK_TREE=%s|GIT_INDEX_FILE=%s|TEST_DATABASE_URL=%s\\n' "$*" \\
  "\${GIT_DIR-unset}" "\${GIT_WORK_TREE-unset}" "\${GIT_INDEX_FILE-unset}" "\${TEST_DATABASE_URL-unset}" >> "$FAKE_LOG"
case "$*" in
  *test:workers*|*check-tests.ts*)
    if [ -n "$FAKE_TESTS_SIGNAL" ]; then kill -TERM $$; fi
    exit "\${FAKE_TESTS_EXIT:-0}" ;;
esac
exit 0
`
)
writeFileSync(
  join(BIN, 'docker'),
  `#!/bin/sh
printf 'docker %s\\n' "$*" >> "$FAKE_LOG"
case "$1" in
  version) exit "\${FAKE_DOCKER_VERSION_EXIT:-0}" ;;
  inspect) exit 1 ;;
  create)
    if [ "\${FAKE_DOCKER_CREATE_EXIT:-0}" != 0 ]; then echo 'create refused' >&2; exit "$FAKE_DOCKER_CREATE_EXIT"; fi
    printf '%s\\n' "$FAKE_DOCKER_ID"; exit 0 ;;
  start) echo 'Bind for 127.0.0.1:55432 failed: port is already allocated' >&2; exit 1 ;;
esac
exit 0
`
)
chmodSync(join(BIN, 'pnpm'), 0o755)
chmodSync(join(BIN, 'docker'), 0o755)

let logs = 0
/** A fresh log file, and a reader for the lines one program wrote to it. */
function newLog() {
  const file = join(TMP, `log-${String(logs++)}`)
  writeFileSync(file, '')
  const lines = () => readFileSync(file, 'utf8').split('\n').filter(Boolean)
  return {
    file,
    pnpm: () => lines().filter((line) => line.startsWith('pnpm ')),
    docker: () => lines().filter((line) => line.startsWith('docker ')),
    /** The calls that run the workers suite, raw or wrapped — the only ones this file judges. */
    testRuns: () =>
      lines()
        .filter((line) => line.startsWith('pnpm '))
        .map((line) => line.slice('pnpm '.length).split('|')[0])
        .filter((args) => args.includes('test:workers') || args.includes('check-tests.ts'))
  }
}

/**
 * The environment a child gets: the stand-ins first on `PATH`, and nothing a surrounding push left
 * behind. This file is itself part of the suite the hook runs, so `PRE_COMMIT_*`, `GIT_*` and the
 * opt-in may all be set around it, and inheriting them would make the hook under test judge the
 * real push instead of the scratch one.
 */
function cleanEnv(extra) {
  const env = { PATH: `${BIN}:${process.env.PATH ?? ''}`, HOME: process.env.HOME ?? TMP }
  return { ...env, ...extra }
}

/** A scratch repository holding a copy of the hook, with one commit per kind of push. */
function scratchRepo() {
  const root = mkdtempSync(join(TMP, 'repo-'))
  mkdirSync(join(root, 'scripts'))
  // Every top-level module and `lib/`, not a hand-kept import list: the hook growing an import
  // must not turn this file red for a reason that has nothing to do with what it asserts.
  for (const entry of readdirSync(SCRIPTS, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.mjs'))
      cpSync(join(SCRIPTS, entry.name), join(root, 'scripts', entry.name))
  }
  if (existsSync(join(SCRIPTS, 'lib')))
    cpSync(join(SCRIPTS, 'lib'), join(root, 'scripts/lib'), { recursive: true })

  const git = (...args) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', ...args], {
      cwd: root,
      encoding: 'utf8',
      env: cleanEnv({ GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' })
    }).trim()
  const commit = (path, message) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), `${message}\n`)
    git('add', '-f', '--', path)
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', message)
    return git('rev-parse', 'HEAD')
  }
  git('init', '-q', '-b', 'develop')
  const base = commit('README', 'base')
  // `scripts/` is one of the trees whose tests the suite runs; `tasks/` is not.
  const code = commit('scripts/touched.txt', 'code')
  git('checkout', '-q', '-b', 'docs', base)
  const docs = commit('tasks/note.md', 'docs')
  return { root, base, code, docs }
}

/** Push at the scratch hook: `refs` are `[localSha, remoteRef, remoteSha]`, written as git writes stdin. */
function push(repo, refs, extra = {}) {
  const log = newLog()
  const stdin = refs.map(
    ([localSha, remoteRef, remoteSha]) => `${remoteRef} ${localSha} ${remoteRef} ${remoteSha}\n`
  )
  const run = spawnSync(process.execPath, [join(repo.root, 'scripts/check-push.mjs')], {
    cwd: repo.root,
    input: stdin.join(''),
    encoding: 'utf8',
    env: cleanEnv({ FAKE_LOG: log.file, ...extra })
  })
  return { status: run.status, stderr: run.stderr, stdout: run.stdout, log }
}

const repo = scratchRepo()
const toDevelop = (sha) => [sha, 'refs/heads/develop', repo.base]

test('a qualifying shared-branch push runs the raw workers suite when nothing asks for a database', () => {
  for (const extra of [{}, { TRACY_PRE_PUSH_POSTGRES: '' }, { TRACY_PRE_PUSH_POSTGRES: '0' }]) {
    const run = push(repo, [toDevelop(repo.code)], extra)
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(run.log.testRuns(), ['test:workers'], JSON.stringify(extra))
  }
})

test('TRACY_PRE_PUSH_POSTGRES=1 runs the wrapper on its own database INSTEAD of the raw suite', () => {
  const run = push(repo, [toDevelop(repo.code)], { TRACY_PRE_PUSH_POSTGRES: '1' })
  assert.equal(run.status, 0, run.stderr)
  // Exactly the wrapper: the raw suite beside it would be the same tests twice, and `--database
  // owned` missing would let the run borrow whatever TEST_DATABASE_URL the pushing shell holds.
  assert.deepEqual(run.log.testRuns(), [WRAPPER])
})

test('the same choice is made on the path prek actually uses, where the range arrives in the environment', () => {
  const log = newLog()
  const run = spawnSync(process.execPath, [join(repo.root, 'scripts/check-push.mjs')], {
    cwd: repo.root,
    input: '',
    encoding: 'utf8',
    env: cleanEnv({
      FAKE_LOG: log.file,
      TRACY_PRE_PUSH_POSTGRES: '1',
      PRE_COMMIT_FROM_REF: repo.base,
      PRE_COMMIT_TO_REF: repo.code,
      PRE_COMMIT_REMOTE_BRANCH: 'refs/heads/main',
      PRE_COMMIT_LOCAL_BRANCH: 'refs/heads/main'
    })
  })
  assert.equal(run.status, 0, run.stderr)
  assert.deepEqual(log.testRuns(), [WRAPPER])
})

test('several qualifying refs in one push run the suite once, not once per ref', () => {
  const refs = [toDevelop(repo.code), [repo.code, 'refs/heads/main', repo.base]]
  for (const [extra, expected] of [
    [{}, ['test:workers']],
    [{ TRACY_PRE_PUSH_POSTGRES: '1' }, [WRAPPER]]
  ]) {
    const run = push(repo, refs, extra)
    assert.equal(run.status, 0, run.stderr)
    assert.deepEqual(run.log.testRuns(), expected)
  }
})

test('pushes that do not qualify start no suite and no database, whatever the opt-in says', () => {
  const notQualifying = {
    'a personal branch': [[repo.code, 'refs/heads/feat/x', repo.base]],
    'a docs-only range on a shared branch': [toDevelop(repo.docs)],
    'a deletion of a shared branch': [[SHA_ZERO, 'refs/heads/develop', repo.code]],
    'a brand-new shared branch, which has no base': [[repo.code, 'refs/heads/main', SHA_ZERO]],
    'no ref at all': []
  }
  for (const [name, refs] of Object.entries(notQualifying)) {
    for (const value of [undefined, '1', 'nonsense']) {
      const run = push(repo, refs, value === undefined ? {} : { TRACY_PRE_PUSH_POSTGRES: value })
      assert.equal(run.status, 0, `${name} with ${String(value)}: ${run.stderr}`)
      assert.deepEqual(run.log.testRuns(), [], `${name} with ${String(value)}`)
      assert.deepEqual(run.log.docker(), [], `${name} with ${String(value)}`)
    }
  }
})

test('an opt-in value nobody defined blocks the push and runs nothing — it is never read as on or off', () => {
  for (const value of [
    'true',
    'yes',
    'on',
    'TRUE',
    '2',
    '01',
    '1 ',
    ' 1',
    'false',
    'no',
    'off',
    '00',
    'owned'
  ]) {
    const run = push(repo, [toDevelop(repo.code)], { TRACY_PRE_PUSH_POSTGRES: value })
    assert.equal(run.status, 1, `${JSON.stringify(value)} must block`)
    assert.match(run.stderr, /TRACY_PRE_PUSH_POSTGRES/, value)
    assert.deepEqual(run.log.testRuns(), [], `${JSON.stringify(value)} must not start a suite`)
  }
})

test('a red suite blocks the push on either path, by exit code or by signal', () => {
  for (const optIn of [{}, { TRACY_PRE_PUSH_POSTGRES: '1' }]) {
    for (const failure of [{ FAKE_TESTS_EXIT: '1' }, { FAKE_TESTS_EXIT: '7' }, { FAKE_TESTS_SIGNAL: '1' }]) {
      const run = push(repo, [toDevelop(repo.code)], { ...optIn, ...failure })
      const name = JSON.stringify({ ...optIn, ...failure })
      assert.equal(run.status, 1, name)
      assert.match(run.stderr, /pre-push blocked this push/, name)
      assert.match(
        run.stderr,
        /(test:workers|--database owned) is red\./,
        `${name}: the red is named as the suite's`
      )
      assert.equal(run.log.testRuns().length, 1, `${name}: a red run is not retried`)
    }
  }
})

test('a suite that cannot be spawned at all blocks the push', () => {
  // A PATH that holds git and nothing else: `pnpm` is not found, and "could not start the tests"
  // must not read as "the tests passed".
  const onlyGit = mkdtempSync(join(TMP, 'only-git-'))
  const gitPath = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
  symlinkSync(gitPath, join(onlyGit, 'git'))
  for (const optIn of [{}, { TRACY_PRE_PUSH_POSTGRES: '1' }]) {
    const run = spawnSync(process.execPath, [join(repo.root, 'scripts/check-push.mjs')], {
      cwd: repo.root,
      input: `refs/heads/develop ${repo.code} refs/heads/develop ${repo.base}\n`,
      encoding: 'utf8',
      env: { PATH: onlyGit, HOME: process.env.HOME ?? TMP, ...optIn }
    })
    assert.equal(run.status, 1, run.stderr)
    assert.match(run.stderr, /(test:workers|--database owned) is red\./)
  }
})

test('neither path hands the suite git’s pointers at the repository being pushed', () => {
  // git exports these into a hook; a suite that inherits them has every `git` call of every test
  // redirected at this repository (measured 08/09 — see GIT_LOCATION_VARS in check-push.mjs).
  const location = {
    GIT_DIR: join(repo.root, '.git'),
    GIT_WORK_TREE: repo.root,
    GIT_INDEX_FILE: join(repo.root, '.git/index')
  }
  for (const optIn of [{}, { TRACY_PRE_PUSH_POSTGRES: '1' }]) {
    const run = push(repo, [toDevelop(repo.code)], { ...location, ...optIn })
    assert.equal(run.status, 0, run.stderr)
    const suite = run.log
      .pnpm()
      .filter((line) => line.includes('test:workers') || line.includes('check-tests.ts'))
    assert.equal(suite.length, 1)
    assert.match(suite[0], /\|GIT_DIR=unset\|GIT_WORK_TREE=unset\|GIT_INDEX_FILE=unset\|/)
  }
})

test('neither path hands the suite the database url of the shell that pushed', () => {
  // The pushing shell's TEST_DATABASE_URL belongs to whoever exported it: another session's stand,
  // or worse. With it inherited, the "no database" default would create and drop schemas there.
  const inherited = { TEST_DATABASE_URL: 'postgres://someone:else@127.0.0.1:1/not-ours' }
  for (const optIn of [
    {},
    { TRACY_PRE_PUSH_POSTGRES: '' },
    { TRACY_PRE_PUSH_POSTGRES: '0' },
    { TRACY_PRE_PUSH_POSTGRES: '1' }
  ]) {
    const run = push(repo, [toDevelop(repo.code)], { ...inherited, ...optIn })
    assert.equal(run.status, 0, run.stderr)
    const suite = run.log
      .pnpm()
      .filter((line) => line.includes('test:workers') || line.includes('check-tests.ts'))
    assert.equal(suite.length, 1, JSON.stringify(optIn))
    assert.match(suite[0], /\|TEST_DATABASE_URL=unset$/, JSON.stringify(optIn))
  }
})

/**
 * The gate, started with its real argv. `TEST_DATABASE_URL` is set to an address where nothing
 * listens: `auto` must say so and stop, and `owned` must not even look at it.
 */
const INHERITED = 'postgres://someone:else@127.0.0.1:1/not-ours'
const VALID_ID = 'a'.repeat(64)

function gate(args, extra = {}) {
  const log = newLog()
  const run = spawnSync(process.execPath, ['--import', 'tsx', join(SCRIPTS, 'check-tests.ts'), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: cleanEnv({ FAKE_LOG: log.file, TEST_DATABASE_URL: INHERITED, FAKE_DOCKER_ID: VALID_ID, ...extra })
  })
  return { status: run.status, stderr: run.stderr, stdout: run.stdout, log }
}

test('a missing, repeated, glued or unknown --database is refused before any database is touched', () => {
  for (const args of [
    ['--part', 'workers', '--database'],
    ['--database', '--part', 'workers'],
    ['--part', 'workers', '--database', 'owned', '--database', 'owned'],
    ['--part', 'workers', '--database=owned'],
    ['--part', 'workers', '--database', 'auto'],
    ['--part', 'workers', '--database', 'Owned'],
    ['--part', 'workers', '--database', 'throwaway'],
    ['--part', 'workers', '--database', '']
  ]) {
    const run = gate(args)
    assert.equal(run.status, 1, args.join(' '))
    assert.match(run.stderr, /check-tests: .*--database|check-tests: no such database mode/, args.join(' '))
    // Not the inherited url's verdict: reaching that message means the url was probed first.
    assert.doesNotMatch(run.stderr, /TEST_DATABASE_URL/, args.join(' '))
    assert.deepEqual(run.log.docker(), [], args.join(' '))
    assert.deepEqual(run.log.pnpm(), [], args.join(' '))
  }
})

test('an argument the gate does not know is refused before any database is touched — a typo is never auto', () => {
  // `--databas owned` used to be ignored: the mode stayed `auto` and the run borrowed the inherited
  // url, the one thing the caller had asked it not to do.
  for (const args of [
    ['--databas', 'owned'],
    ['--part', 'workers', '--databas', 'owned'],
    ['--part', 'workers', '-database', 'owned'],
    ['--part', 'workers', '--Database', 'owned'],
    ['--part', 'workers', '--db', 'owned'],
    ['--part', 'workers', 'database', 'owned'],
    ['--part', 'workers', '--database', 'owned', 'extra'],
    ['--part', 'workers', '--owned'],
    ['owned'],
    ['--par', 'workers', '--database', 'owned'],
    ['--part', 'workers', '--part', 'rest', '--database', 'owned'],
    ['--part=workers', '--database', 'owned']
  ]) {
    const run = gate(args)
    assert.equal(run.status, 1, args.join(' '))
    assert.match(run.stderr, /check-tests: (unknown argument|--part given more than once)/, args.join(' '))
    assert.doesNotMatch(run.stderr, /TEST_DATABASE_URL/, args.join(' '))
    assert.deepEqual(run.log.docker(), [], args.join(' '))
    assert.deepEqual(run.log.pnpm(), [], args.join(' '))
  }
})

test('owned with no usable docker fails without judging the inherited url and without running a test', () => {
  for (const exit of ['1', '127']) {
    const run = gate(['--part', 'workers', '--database', 'owned'], { FAKE_DOCKER_VERSION_EXIT: exit })
    assert.equal(run.status, 1, run.stderr)
    assert.match(run.stderr, /--database owned could not start a database of its own/)
    // `auto` answers an unreachable exported url with this line. `owned` must never reach it.
    assert.doesNotMatch(run.stderr, /connection CANNOT be opened/)
    assert.deepEqual(run.log.docker(), ['docker version'])
    assert.deepEqual(run.log.pnpm(), [], 'no suite may start without the database')
  }
})

test('owned with a create that fails owns nothing: no start, no rm, no test', () => {
  const run = gate(['--part', 'workers', '--database', 'owned'], { FAKE_DOCKER_CREATE_EXIT: '125' })
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stderr, /create refused/, 'docker’s own words are quoted')
  const verbs = run.log.docker().map((line) => line.split(' ')[1])
  assert.ok(verbs.includes('create'))
  assert.ok(!verbs.includes('start') && !verbs.includes('rm'), verbs.join(' '))
  assert.deepEqual(run.log.pnpm(), [])
})

test('owned refuses anything but a full container id from create, and never starts or removes by it', () => {
  for (const id of [
    '',
    'a'.repeat(63),
    'A'.repeat(64),
    `sha256:${'a'.repeat(64)}`,
    'tch-check-tests-postgres'
  ]) {
    const run = gate(['--part', 'workers', '--database', 'owned'], { FAKE_DOCKER_ID: id })
    assert.equal(run.status, 1, JSON.stringify(id))
    const verbs = run.log.docker().map((line) => line.split(' ')[1])
    assert.ok(!verbs.includes('start') && !verbs.includes('rm'), `${JSON.stringify(id)}: ${verbs.join(' ')}`)
    assert.deepEqual(run.log.pnpm(), [], JSON.stringify(id))
  }
})

test('owned whose port is held by another run fails, removes ITS container by id, and runs no test', () => {
  const run = gate(['--part', 'workers', '--database', 'owned'])
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stderr, /port is already allocated/)
  const docker = run.log.docker()
  const rms = docker.filter((line) => line.startsWith('docker rm'))
  // Once, by the id create returned, with the volume — and nothing else is stopped or removed.
  assert.deepEqual(rms, [`docker rm -f -v ${VALID_ID}`])
  assert.ok(!docker.some((line) => /^docker (stop|kill|rm -f [^-])/.test(line)), docker.join('\n'))
  assert.deepEqual(run.log.pnpm(), [])
})

test('without the flag an exported url that does not answer is still red, and still starts no container', () => {
  const run = gate(['--part', 'workers'])
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stderr, /TEST_DATABASE_URL is set but the connection CANNOT be opened/)
  assert.match(run.stderr, /:\*\*\*@/, 'the password is not printed')
  assert.deepEqual(run.log.docker(), [])
  assert.deepEqual(run.log.pnpm(), [])
})

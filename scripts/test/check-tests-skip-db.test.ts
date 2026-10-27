/**
 * `--skip-db-gated` / `TRACY_TESTS_SKIP_DB=1` — the explicit mode in which `check-tests.ts` leaves out
 * the workers files that need a database (16/10/2026).
 *
 * WHAT IS PINNED. The mode must (1) drop exactly the files `ensureDatabase` counts as needing a
 * database and nothing else, whichever way the files are chosen (whole suite, shard, related, owner);
 * (2) say how many it dropped and which, where Actions and a person read it; (3) demand no database;
 * (4) change nothing when it is off; (5) never reach the test processes, because the interop tests
 * spawn this very gate and would assert on a skip they did not ask for.
 *
 *   node --import tsx --test scripts/test/check-tests-skip-db.test.ts
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  databaseSkipOn,
  databaseWanted,
  forgetDatabaseSkip,
  ownerTaskFiles,
  ownerTaskSplit,
  splitWorkers,
  takeDatabaseSkip
} from '../check-tests.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  forgetDatabaseSkip()
  delete process.env.TRACY_TESTS_SKIP_DB
})

// ── the switch ───────────────────────────────────────────────────────────────────────────────────

test('takeDatabaseSkip reads the variable once and removes it, so no test process inherits it', () => {
  process.env.TRACY_TESTS_SKIP_DB = '1'
  assert.equal(takeDatabaseSkip(false), true)
  assert.equal(process.env.TRACY_TESTS_SKIP_DB, undefined, 'the variable is gone from this process')
  // Taken once: a second look does not read the (now unset) variable and flip to off.
  assert.equal(takeDatabaseSkip(false), true)
  assert.equal(databaseSkipOn(), true)
})

test('off by default; 0 and empty are off; the flag alone turns it on', () => {
  assert.equal(takeDatabaseSkip(false), false)
  forgetDatabaseSkip()
  for (const off of ['0', '']) {
    process.env.TRACY_TESTS_SKIP_DB = off
    assert.equal(takeDatabaseSkip(false), false, JSON.stringify(off))
    forgetDatabaseSkip()
  }
  assert.equal(takeDatabaseSkip(true), true)
})

test('a value that is neither 1, 0 nor unset is refused, never read as on or off', () => {
  for (const bad of ['true', 'yes', ' 1']) {
    process.env.TRACY_TESTS_SKIP_DB = bad
    assert.throws(() => takeDatabaseSkip(false), /must be 1, 0 or unset/, bad)
    forgetDatabaseSkip()
  }
})

test('a database is provisioned for every run but a skipping one, and for the one part that still reads it', () => {
  assert.equal(databaseWanted(false, null), true)
  assert.equal(databaseWanted(false, [{ part: 'workers' }]), true)
  assert.equal(databaseWanted(true, [{ part: 'workers' }]), false)
  assert.equal(databaseWanted(true, [{ part: 'owner' }]), false)
  assert.equal(databaseWanted(true, [{ part: 'related' }]), false)
  assert.equal(databaseWanted(true, [{ part: 'workers' }, { part: 'rest' }]), false)
  assert.equal(
    databaseWanted(true, [{ part: 'e2e' }]),
    true,
    'the own-domain pilot is red without a database'
  )
  assert.equal(databaseWanted(true, null), true, 'a whole run contains e2e')
})

// ── what is dropped ──────────────────────────────────────────────────────────────────────────────

const DB = "const url = process.env.TEST_DATABASE_URL\nconst skip = url ? false : 'set TEST_DATABASE_URL'\n"
const UNIT = "import { test } from 'node:test'\ntest('unit', () => {})\n"
const texts: Record<string, string> = {
  'apps/site/test/a-db.test.mjs': DB,
  'apps/site/test/b-unit.test.mjs': UNIT,
  'apps/site/test/c-db.test.mjs': DB,
  'apps/site/test/d-unit.test.mjs': UNIT,
  'packages/x/y/test/e-unit.test.mjs': UNIT
}
const read = (file: string): string => texts[file]
const all = Object.keys(texts)

test('splitWorkers: off keeps everything; on drops exactly the files that name the variable', () => {
  assert.deepEqual(splitWorkers(all, false, read), { run: all, dropped: [] })
  assert.deepEqual(splitWorkers(all, true, read), {
    run: [
      'apps/site/test/b-unit.test.mjs',
      'apps/site/test/d-unit.test.mjs',
      'packages/x/y/test/e-unit.test.mjs'
    ],
    dropped: ['apps/site/test/a-db.test.mjs', 'apps/site/test/c-db.test.mjs']
  })
})

test('an owner task: the shard is chosen first, the skip second, so a file keeps its shard', () => {
  const owner = 'apps/site'
  const shards = [1, 2].map((index) => ({ index, of: 2 }))
  const withSkip = shards.map((s) => ownerTaskSplit(all, owner, s, true, read))
  const without = shards.map((s) => ownerTaskSplit(all, owner, s, false, read))
  for (const [i, kept] of withSkip.entries()) {
    // Same file, same shard: what ran with the skip is the unskipped shard minus the database files.
    assert.deepEqual(
      [...kept.run, ...kept.dropped].sort(),
      [...without[i].run].sort(),
      `shard ${String(i + 1)} holds the same files with or without the skip`
    )
  }
  // And together the shards still cover the owner once: nothing falls between them.
  const ran = withSkip.flatMap((s) => s.run).sort()
  assert.deepEqual(ran, ['apps/site/test/b-unit.test.mjs', 'apps/site/test/d-unit.test.mjs'])
  assert.deepEqual(withSkip.flatMap((s) => s.dropped).sort(), [
    'apps/site/test/a-db.test.mjs',
    'apps/site/test/c-db.test.mjs'
  ])
  assert.deepEqual(ownerTaskFiles(all, owner, undefined, true, read), ran)
  assert.deepEqual(
    ownerTaskFiles(all, owner, undefined, false, read),
    all.filter((f) => f.startsWith('apps/site/'))
  )
})

test('the turbo setup and the gate take the files from the same function', () => {
  const setup = readFileSync(join(HERE, '../ci/turbo-setup.mjs'), 'utf8')
  assert.ok(
    setup.includes('tests.ownerTaskSplit(files, o.owner, t.shard)'),
    'tracedTasks uses the gate’s own split'
  )
  const gate = readFileSync(join(HERE, '../check-tests.ts'), 'utf8')
  assert.ok(gate.includes('ownerTaskSplit(files, owner, shard)'), 'runOwner uses it too')
})

// ── the gate, run over a fixture tree ────────────────────────────────────────────────────────────

const FIXTURE: Record<string, string> = {
  'apps/site/test/a-db.test.mjs':
    "import { test } from 'node:test'\ntest('RAN a-db', () => { throw new Error('a database test ran without a database') })\nvoid process.env.TEST_DATABASE_URL\n",
  'apps/site/test/b-db.test.mjs':
    "import { test } from 'node:test'\ntest('RAN b-db', () => { throw new Error('a database test ran without a database') })\nvoid process.env.TEST_DATABASE_URL\n",
  'apps/site/test/c-unit.test.mjs': "import { test } from 'node:test'\ntest('RAN c-unit', () => {})\n",
  'apps/site/test/d-unit.test.mjs': "import { test } from 'node:test'\ntest('RAN d-unit', () => {})\n"
}

function gateOver(
  args: string[],
  env: Record<string, string | undefined> = {},
  tree: Record<string, string> = FIXTURE
) {
  const root = mkdtempSync(
    join(realpathSync(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()), 'check-tests-skip-')
  )
  try {
    mkdirSync(join(root, 'scripts/ci'), { recursive: true })
    for (const module of ['check-tests.ts', 'test-database.ts', 'test-timing-reporter.mjs'])
      writeFileSync(join(root, 'scripts', module), readFileSync(join(HERE, '..', module), 'utf8'))
    writeFileSync(
      join(root, 'scripts/ci/related-tests.mjs'),
      readFileSync(join(HERE, '../ci/related-tests.mjs'), 'utf8')
    )
    for (const [file, body] of Object.entries(tree)) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), body)
    }
    const summary = join(root, 'summary.md')
    const {
      NODE_TEST_CONTEXT: _context,
      TEST_DATABASE_URL: _url,
      TRACY_TESTS_SKIP_DB: _skip,
      ...base
    } = process.env
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(root, 'scripts/check-tests.ts'), ...args],
      {
        cwd: join(HERE, '../..'),
        encoding: 'utf8',
        timeout: 90_000,
        env: { ...base, GITHUB_STEP_SUMMARY: summary, ...env } as NodeJS.ProcessEnv
      }
    )
    assert.equal(run.error, undefined, `the gate did not run: ${String(run.error)}`)
    let written = ''
    try {
      written = readFileSync(summary, 'utf8')
    } catch {
      written = ''
    }
    return { status: run.status, stdout: run.stdout, stderr: run.stderr, summary: written }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('the flag runs the unit tests, leaves the database files out, names them and provisions no database', () => {
  const got = gateOver(['--part', 'workers', '--skip-db-gated'])
  assert.equal(got.status, 0, `${got.stdout}${got.stderr}`)
  assert.match(got.stdout, /RAN c-unit/)
  assert.match(got.stdout, /RAN d-unit/)
  assert.doesNotMatch(got.stdout, /RAN a-db|RAN b-db/)
  assert.match(
    got.stdout,
    /2 workers test file\(s\) that read TEST_DATABASE_URL were left out of the workers suite/
  )
  assert.match(got.stdout, /check-tests: {3}- apps\/site\/test\/a-db\.test\.mjs/)
  assert.match(got.stdout, /check-tests: {3}- apps\/site\/test\/b-db\.test\.mjs/)
  assert.match(got.stdout, /label ci:integration/)
  assert.match(got.stdout, /no database is provisioned/)
  assert.doesNotMatch(got.stdout + got.stderr, /using a throwaway container|no database answers|docker/)
})

test('the variable does the same as the flag, and a skipping run says so on Actions and in the summary', () => {
  const got = gateOver(['--part', 'workers'], { TRACY_TESTS_SKIP_DB: '1', GITHUB_ACTIONS: 'true' })
  assert.equal(got.status, 0, `${got.stdout}${got.stderr}`)
  assert.match(got.stdout, /::notice title=database tests skipped::2 workers test file\(s\)/)
  assert.match(got.summary, /### Database tests skipped \(the workers suite\)/)
  assert.match(got.summary, /2 workers test file\(s\) that read TEST_DATABASE_URL/)
})

test('a shard leaves out its own database files; together the two shards ran every unit test once', () => {
  const ran = new Set<string>()
  for (const index of [1, 2]) {
    const got = gateOver(['--part', `workers:${String(index)}/2`, '--skip-db-gated'])
    assert.equal(got.status, 0, `${got.stdout}${got.stderr}`)
    assert.doesNotMatch(got.stdout, /RAN a-db|RAN b-db/)
    for (const m of got.stdout.matchAll(/✔ (RAN \S+)/g)) {
      assert.ok(!ran.has(m[1]), `${m[1]} ran in two shards`)
      ran.add(m[1])
    }
  }
  assert.deepEqual([...ran].sort(), ['RAN c-unit', 'RAN d-unit'])
})

test('an owner part leaves them out the same way', () => {
  const got = gateOver(['--part', 'owner=apps/site', '--skip-db-gated'])
  assert.equal(got.status, 0, `${got.stdout}${got.stderr}`)
  assert.match(got.stdout, /owner apps\/site — 2\/4 file/)
  assert.match(got.stdout, /left out of owner apps\/site/)
})

test('a value for the variable that is not 1, 0 or unset stops the run before anything is read', () => {
  const got = gateOver(['--part', 'workers'], { TRACY_TESTS_SKIP_DB: 'yes' })
  assert.equal(got.status, 1)
  assert.match(got.stderr, /TRACY_TESTS_SKIP_DB must be 1, 0 or unset/)
  assert.doesNotMatch(got.stdout, /RAN /)
})

test('a whole-suite run whose list is empty, or that the skip empties, is red — never a green run of nothing', () => {
  // No workers file at all: the list went missing.
  const none = gateOver(['--part', 'workers', '--skip-db-gated'], {}, {})
  assert.equal(none.status, 1, `${none.stdout}${none.stderr}`)
  assert.match(none.stderr, /the workers suite lists no test file/)
  // Only database files: the skip would leave nothing to run.
  const onlyDb = Object.fromEntries(Object.entries(FIXTURE).filter(([file]) => file.includes('-db.')))
  const empty = gateOver(['--part', 'workers', '--skip-db-gated'], {}, onlyDb)
  assert.equal(empty.status, 1, `${empty.stdout}${empty.stderr}`)
  assert.match(
    empty.stderr,
    /every workers file reads TEST_DATABASE_URL and TRACY_TESTS_SKIP_DB left them all out/
  )
  assert.doesNotMatch(empty.stdout, /RAN /)
})

test('a shard the skip empties is red, in English', () => {
  const onlyDb = Object.fromEntries(Object.entries(FIXTURE).filter(([file]) => file.includes('-db.')))
  const got = gateOver(['--part', 'workers:1/2', '--skip-db-gated'], {}, onlyDb)
  assert.equal(got.status, 1, `${got.stdout}${got.stderr}`)
  assert.match(got.stderr, /holds only files that read TEST_DATABASE_URL/)
})

test('the flag twice, or with an owned database, is refused: the two ask for opposite things', () => {
  const twice = gateOver(['--part', 'workers', '--skip-db-gated', '--skip-db-gated'])
  assert.equal(twice.status, 1)
  assert.match(twice.stderr, /given more than once/)
  const owned = gateOver(['--part', 'workers', '--skip-db-gated', '--database', 'owned'])
  assert.equal(owned.status, 1)
  assert.match(owned.stderr, /asks for a database of this run's own and the skip/)
})

test('the other flags are still checked strictly beside it', () => {
  const got = gateOver(['--part', 'workers', '--skip-db-gated', '--databas', 'owned'])
  assert.equal(got.status, 1)
  assert.match(got.stderr, /unknown argument/)
})

test('off, nothing changes: the database files are counted and a database is looked for, as always', () => {
  // No database here and no docker the fixture may use: the gate stops, loudly, rather than run the
  // two database tests and let them skip themselves — the behaviour `ensureDatabase` was written for.
  const got = gateOver(['--part', 'workers'], { PATH: '/nonexistent' })
  assert.equal(got.status, 1, `${got.stdout}${got.stderr}`)
  assert.match(got.stderr, /TEST_DATABASE_URL/)
  assert.doesNotMatch(got.stdout, /RAN /)
  assert.doesNotMatch(got.stdout, /left out of/)
})

test('the switch never reaches a test process: a file that spawns the gate sees it unset', () => {
  const probe = join(HERE, '../check-tests.ts')
  const source = readFileSync(probe, 'utf8')
  // takeDatabaseSkip deletes it from process.env before any child is spawned.
  assert.ok(/delete process\.env\[SKIP_DB_ENV\]/.test(source))
  assert.ok(source.indexOf('takeDatabaseSkip(asked.on)') < source.indexOf('ensureDatabase(database.mode)'))
})

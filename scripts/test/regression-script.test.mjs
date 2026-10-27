/**
 * The deterministic half of the regression runner: a case that carries `run` is judged by its own
 * command, never by a model (`tests/regression/script.mjs`, plan `tasks/todo-regression-deterministic.md`).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { validateCase } from '../../tests/regression/catalogue.mjs'
import { buildCase } from '../../tests/regression/create.mjs'
import { parseArgs } from '../../tests/regression/run.mjs'
import { missingNeeds, runScript, tapVerdict } from '../../tests/regression/script.mjs'

const base = {
  id: 'REG-001',
  kind: 'fix',
  title: 't',
  pr: 1,
  area: 'a',
  cms: ['any'],
  needs: [],
  flaky_model: false,
  steps: ['s'],
  expect: ['e'],
  selectors: {}
}

describe('the run field', () => {
  test('a case may carry run: an argv, optional needs, tests and timeout', () => {
    const run = {
      cmd: ['node', '--test', '--test-reporter=tap', 'x.test.mjs'],
      needs: ['postgres'],
      tests: ['a'],
      timeout_s: 60
    }
    assert.deepEqual(validateCase({ ...base, run }), [])
    assert.deepEqual(validateCase(base), [], 'run stays optional while cases move over')
  })
  test('a malformed run is refused, with why', () => {
    const problems = (run) => validateCase({ ...base, run }).join(' | ')
    assert.match(problems('node --test x'), /`run` must be an object/)
    assert.match(problems({ cmd: [] }), /`run.cmd`/)
    assert.match(problems({ cmd: ['node', ''] }), /`run.cmd`/)
    assert.match(problems({ cmd: ['node'], needs: ['moon'] }), /`run.needs`.*moon/)
    assert.match(problems({ cmd: ['node'], timeout_s: 0 }), /`run.timeout_s`/)
    assert.match(problems({ cmd: ['node', '--test', 'x'], tests: ['a'] }), /--test-reporter=tap/)
    assert.match(problems({ cmd: ['node'], extra: 1 }), /`run`.*extra/)
  })
})

describe('needs', () => {
  test('postgres needs TEST_DATABASE_URL, stand needs a stand, chrome needs a reachable CDP', () => {
    const run = { cmd: ['x'], needs: ['postgres', 'stand', 'chrome'] }
    assert.deepEqual(missingNeeds(run, { env: {}, stand: null, cdpUp: false }), [
      'postgres: TEST_DATABASE_URL is not set',
      'stand: no --stand given',
      'chrome: no Chrome answers on the CDP endpoint'
    ])
    assert.deepEqual(
      missingNeeds(run, { env: { TEST_DATABASE_URL: 'postgres://x' }, stand: 'http://s', cdpUp: true }),
      []
    )
    assert.deepEqual(missingNeeds({ cmd: ['x'] }, { env: {}, stand: null, cdpUp: false }), [])
  })
})

describe('TAP verdict', () => {
  const tap = [
    'TAP version 13',
    '# Subtest: once the site is up, prepare hands back',
    'ok 1 - once the site is up, prepare hands back what it has',
    'not ok 2 - a run that is over is stopped',
    'ok 3 - an id its engine names late never lands',
    '# pass 2',
    '# fail 1'
  ].join('\n')
  test('every named test must report ok; a missing one is a FAIL, not a pass', () => {
    assert.deepEqual(tapVerdict(tap, ['once the site is up', 'an id its engine names late']), {
      ok: true,
      missing: [],
      failed: []
    })
    assert.deepEqual(tapVerdict(tap, ['a run that is over']), {
      ok: false,
      missing: [],
      failed: ['a run that is over']
    })
    assert.deepEqual(tapVerdict(tap, ['renamed away']), { ok: false, missing: ['renamed away'], failed: [] })
  })
  test('a name is matched as a prefix of the test title, after the number', () => {
    assert.equal(tapVerdict('ok 7 - alpha beta', ['alpha']).ok, true)
    assert.equal(tapVerdict('ok 7 - alpha beta', ['beta']).ok, false)
  })
})

describe('runScript', () => {
  test('exit 0 is PASS, anything else FAIL, missing needs BLOCKED without running', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    assert.equal(runScript({ cmd: [process.execPath, '-e', 'process.exit(0)'] }, ctx).verdict, 'PASS')
    const fail = runScript({ cmd: [process.execPath, '-e', 'process.exit(3)'] }, ctx)
    assert.equal(fail.verdict, 'FAIL')
    assert.match(fail.reason, /exit 3/)
    const blocked = runScript({ cmd: [process.execPath, '-e', 'process.exit(0)'], needs: ['stand'] }, ctx)
    assert.equal(blocked.verdict, 'BLOCKED')
    assert.match(blocked.reason, /no --stand/)
    assert.equal(blocked.output, '', 'a blocked case runs nothing')
  })
  test('named tests are checked even when the command exits 0', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    const print = (s) => [process.execPath, '-e', `console.log(${JSON.stringify(s)})`]
    const r = runScript({ cmd: print('ok 1 - something else'), tests: ['the named one'] }, ctx)
    assert.equal(r.verdict, 'FAIL')
    assert.match(r.reason, /not found: the named one/)
  })
  test('the stand URL reaches the command as TRACY_STAND', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: 'http://s:1', cdpUp: false }
    const r = runScript(
      {
        cmd: [process.execPath, '-e', 'process.exit(process.env.TRACY_STAND === "http://s:1" ? 0 : 1)'],
        needs: ['stand']
      },
      ctx
    )
    assert.equal(r.verdict, 'PASS')
  })
  test('a script that says CANNOT RUN (exit 3) is BLOCKED, not judged', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    const r = runScript(
      { cmd: [process.execPath, '-e', 'console.log("CANNOT RUN: no tasks/"); process.exit(3)'] },
      ctx
    )
    assert.equal(r.verdict, 'BLOCKED')
    assert.match(r.reason, /no tasks\//)
  })
  test('a case script under tasks/ in a tree without tasks/ is BLOCKED; elsewhere a lost file FAILs', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'regression-no-tasks-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const ctx = { root, env: process.env, stand: null, cdpUp: false }
    const internal = runScript({ cmd: ['node', 'tasks/evidence/x/accept.mjs'] }, ctx)
    assert.equal(internal.verdict, 'BLOCKED')
    assert.match(internal.reason, /tasks\/evidence\/x\/accept\.mjs/)
    assert.equal(runScript({ cmd: ['node', 'scripts/gone.mjs'] }, ctx).verdict, 'FAIL')
  })
  test('a command that outlives timeout_s is a FAIL that says so', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    const r = runScript({ cmd: [process.execPath, '-e', 'setTimeout(() => {}, 5000)'], timeout_s: 1 }, ctx)
    assert.equal(r.verdict, 'FAIL')
    assert.match(r.reason, /timed out after 1 s/)
  })
})

describe('--no-codex', () => {
  test('runs without a stand, because only script cases run', () => {
    assert.equal(parseArgs(['--no-codex']).noCodex, true)
    assert.equal(parseArgs(['--no-codex']).stand, null)
    assert.throws(() => parseArgs([]), /--stand/)
  })
})

describe('create.mjs', () => {
  const fields = {
    kind: 'fix',
    title: 't',
    area: 'a',
    cms: ['any'],
    needs: [],
    flaky_model: false,
    steps: ['s'],
    expect: ['e'],
    selectors: {}
  }
  test('a new case keeps its run, and a bad run is refused before anything is written', () => {
    const ok = buildCase({
      pr: 9,
      slug: 'x',
      inputText: JSON.stringify({ ...fields, run: { cmd: ['node', '-v'] } })
    })
    assert.equal(ok.ok, true)
    assert.deepEqual(JSON.parse(ok.text).run, { cmd: ['node', '-v'] })
    const bad = buildCase({ pr: 9, slug: 'x', inputText: JSON.stringify({ ...fields, run: { cmd: [] } }) })
    assert.equal(bad.ok, false)
  })
})

describe('run.cwd', () => {
  test('a command may run from a folder of the repo; it must stay inside the repo', () => {
    assert.deepEqual(validateCase({ ...base, run: { cmd: ['node', '-v'], cwd: 'packages/tools' } }), [])
    assert.match(
      validateCase({ ...base, run: { cmd: ['node', '-v'], cwd: '../outside' } }).join(' '),
      /`run.cwd`/
    )
    assert.match(validateCase({ ...base, run: { cmd: ['node', '-v'], cwd: '/abs' } }).join(' '), /`run.cwd`/)
  })
  test('runScript runs the command in that folder', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    const r = runScript(
      {
        cmd: [process.execPath, '-e', 'process.exit(process.cwd().endsWith("/scripts/test") ? 0 : 1)'],
        cwd: 'scripts/test'
      },
      ctx
    )
    assert.equal(r.verdict, 'PASS')
  })
})

describe('a skipped test is not a passed one', () => {
  test('ok … # SKIP and ok … # TODO count as not run, so the case fails', () => {
    assert.deepEqual(tapVerdict('ok 1 - guarded thing # SKIP no database', ['guarded thing']), {
      ok: false,
      missing: [],
      failed: ['guarded thing']
    })
    assert.equal(tapVerdict('ok 1 - guarded thing # TODO later', ['guarded thing']).ok, false)
    assert.equal(tapVerdict('ok 1 - guarded thing', ['guarded thing']).ok, true)
  })
})

describe('a missing test file is a FAIL even when node --test exits 0', () => {
  test('"Could not find" in the output fails the case', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    const say = (t) => [process.execPath, '-e', `console.log(${JSON.stringify(t)})`]
    const r = runScript({ cmd: say("Could not find 'test/moved-away.test.ts'") }, ctx)
    assert.equal(r.verdict, 'FAIL')
    assert.match(r.reason, /test file not found: test\/moved-away.test.ts/)
  })
  test('node --test itself, given a path that does not exist next to one that does', () => {
    const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
    const r = runScript(
      {
        cmd: [
          process.execPath,
          '--test',
          'scripts/test/regression-ids.test.mjs',
          'scripts/test/no-such.test.mjs'
        ]
      },
      ctx
    )
    assert.equal(r.verdict, 'FAIL')
  })
})

describe('a spec named relative to the -c config is found where the config looks', () => {
  const ctx = { root: process.cwd(), env: process.env, stand: null, cdpUp: false }
  const cfg = 'tests/regression/playwright.config.mjs'
  const spec = 'specs/REG-057-invite-only-lands-on-inbox.spec.mjs'
  test('specs/<id>.spec.mjs next to the config is not "test file not found"', () => {
    const r = runScript({ cmd: [process.execPath, '-e', '0', '--', '-c', cfg, spec] }, ctx)
    assert.equal(r.verdict, 'PASS', r.reason)
  })
  test('a spec missing from both the config folder and the root still fails', () => {
    const r = runScript(
      { cmd: [process.execPath, '-e', '0', '--', '-c', cfg, 'specs/no-such.spec.mjs'] },
      ctx
    )
    assert.equal(r.verdict, 'FAIL')
    assert.match(r.reason, /test file not found: specs\/no-such.spec.mjs/)
  })
})

test('tapVerdict reads a title the way the case wrote it: TAP escapes # and \\', () => {
  const out = 'ok 1 - saved before \\#1436 read as today\nok 2 - a back\\\\slash\n'
  assert.deepEqual(tapVerdict(out, ['saved before #1436 read as today', 'a back\\slash']), {
    ok: true,
    missing: [],
    failed: []
  })
})

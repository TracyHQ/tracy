/**
 * Gate `test-quality` (`scripts/check-test-quality.mjs`): which assertions it reports, and that it
 * reports only what a change adds, read from a real Git repository built for each case.
 *
 *   node --test scripts/test/check-test-quality.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { findingsOf, GateError, isTestFile, run, surplus } from '../check-test-quality.mjs'

const GATE = fileURLToPath(new URL('../check-test-quality.mjs', import.meta.url))
const rules = (text, file = 'pkg/test/a.test.mjs') => findingsOf(text, file).map((f) => f.rule)
const HEAD =
  "import assert from 'node:assert/strict'\nimport { LIMIT, OTHER, en, limitOf } from '../src/a.js'\n"

describe('what is reported', () => {
  test('a value compared with itself, or an `ok` of a fixed value', () => {
    assert.deepEqual(rules(`${HEAD}assert.equal(1, 1)\n`), ['self-compare'])
    assert.deepEqual(rules(`${HEAD}const N = 4 * 60 * 1000\nassert.equal(N, 240_000)\n`), ['self-compare'])
    assert.deepEqual(rules(`${HEAD}assert.ok('yes')\nassert.ok(true)\n`), ['self-compare', 'self-compare'])
  })

  test('a product constant compared with a copy of itself, however it is imported or read', () => {
    assert.deepEqual(rules(`${HEAD}assert.equal(LIMIT, 5000)\n`), ['pinned-constant'])
    assert.deepEqual(rules(`${HEAD}assert.equal(en['account.note'], 'Sign in.')\n`), ['pinned-constant'])
    assert.deepEqual(rules(`${HEAD}const KNOWN = [{ id: 'a' }]\nassert.deepEqual(OTHER.list, KNOWN)\n`), [
      'pinned-constant'
    ])
    assert.deepEqual(
      rules("import assert from 'node:assert'\nimport * as m from './m.js'\nassert.strictEqual(m.X, 'x')\n"),
      ['pinned-constant']
    )
    const required =
      "import assert from 'node:assert/strict'\nimport { createRequire } from 'node:module'\n" +
      "const require = createRequire(import.meta.url)\nconst ch = require('../src/c.js')\n" +
      "assert.equal(ch.CHANNELS.open, 'app:open')\n"
    assert.deepEqual(rules(required), ['pinned-constant'])
    // The finding says where the constant comes from.
    assert.equal(
      findingsOf(`${HEAD}assert.equal(LIMIT, 5000)\n`, 'pkg/test/a.test.mjs')[0].why,
      '../src/a.js'
    )
  })

  test('every way node:assert is reached counts; a local `assert` of the same name does not', () => {
    for (const head of [
      "import { strict as assert } from 'node:assert'\n",
      "import assert from 'assert'\n",
      "const assert = require('node:assert/strict')\n"
    ])
      assert.deepEqual(rules(`${head}assert.equal(1, 1)\n`), ['self-compare'], head)
    assert.deepEqual(rules("import { equal } from 'node:assert/strict'\nequal(2, 2)\n"), ['self-compare'])
    assert.deepEqual(rules("import check from 'node:assert'\ncheck(true)\n"), ['self-compare'])
    assert.deepEqual(rules(`${HEAD}function f(assert) {\n  assert.equal(1, 1)\n}\n`), [])
    assert.deepEqual(rules(`${HEAD}{\n  const assert = { equal() {} }\n  assert.equal(1, 1)\n}\n`), [])
    assert.deepEqual(rules("import assert from './my-assert.js'\nassert.equal(1, 1)\n"), [])
  })

  test('a session’s temporary directory in a string; a made-up home directory is not one', () => {
    // Built from parts, so this file holds no such path itself.
    const session = ['', 'private', 'tmp', 'claude-501', '-Users-x', 'abc', 'scratchpad', 'site'].join('/')
    // macOS spells its per-user temporary directory both ways: through the /private link and without it.
    const macTemp = ['', 'private', 'var', 'folders', 'ab', 'cd123', 'T', 'x'].join('/')
    const macTempShort = ['', 'var', 'folders', 'ab', 'cd123', 'T', 'x'].join('/')
    const sessionShort = ['', 'tmp', 'claude-501', 'abc', 'site'].join('/')
    assert.deepEqual(rules(`const root = '${session}'\n`), ['machine-path'])
    assert.deepEqual(rules(`const t = \`${macTemp}\`\n`), ['machine-path'])
    assert.deepEqual(rules(`const t = '${macTempShort}'\n`), ['machine-path'])
    assert.deepEqual(rules(`const root = '${sessionShort}'\n`), ['machine-path'])
    // A path that only looks like one: no per-user directory and no T.
    assert.deepEqual(rules("const t = '/var/folders-of-docs/readme'\n"), [])
    assert.deepEqual(rules("const bin = '/Users/a/.local/bin/claude'\nconst home = '/home/a/x'\n"), [])
  })
})

describe('what is left alone', () => {
  test('anything that runs the product: a call, two product values, an expression over one', () => {
    assert.deepEqual(rules(`${HEAD}assert.equal(limitOf('x'), 5000)\n`), [])
    assert.deepEqual(rules(`${HEAD}assert.equal(LIMIT, OTHER)\n`), [])
    assert.deepEqual(rules(`${HEAD}assert.ok(LIMIT < OTHER)\nassert.ok(LIMIT > 10)\n`), [])
    assert.deepEqual(rules(`${HEAD}assert.match(en.note, /seat/)\nassert.notEqual(LIMIT, 0)\n`), [])
  })

  test('a const object the file hands to a call or changes may hold anything by the time it is compared', () => {
    assert.deepEqual(
      rules(`${HEAD}const input = { a: 1 }\nlimitOf(input)\nassert.deepEqual(input, { a: 1 })\n`),
      []
    )
    assert.deepEqual(
      rules(`${HEAD}const env = { P: '/b' }\nlimitOf({ env })\nassert.deepEqual(env, { P: '/b' })\n`),
      []
    )
    assert.deepEqual(rules(`${HEAD}const seen = []\nseen.push(LIMIT)\nassert.deepEqual(seen, [])\n`), [])
    // A primitive cannot change: still fixed.
    assert.deepEqual(rules(`${HEAD}const N = 3\nlimitOf(N)\nassert.equal(N, 3)\n`), ['self-compare'])
  })

  test('an assertion handed to another runner is its fixture; one inside a test or an array walk is not', () => {
    assert.deepEqual(rules(`${HEAD}step('x', () => assert.ok(true))\n`), [])
    assert.deepEqual(rules(`${HEAD}runCase({ run: async () => { assert.equal(1, 2) } })\n`), [])
    const inTest = `${HEAD}import { test } from 'node:test'\ntest('t', () => {\n  [1].forEach(() => assert.equal(LIMIT, 5))\n})\n`
    assert.deepEqual(rules(inTest), ['pinned-constant'])
  })

  test('a deliberate contract says so, with its reason; a marker without one is reported', () => {
    const marked = `${HEAD}// test-quality: contract the host process reads the same lock id\nassert.equal(LIMIT, 5000)\n`
    assert.deepEqual(rules(marked), [])
    assert.deepEqual(
      rules(`${HEAD}assert.equal(LIMIT, 5000) // test-quality: contract shared with the page\n`),
      []
    )
    assert.deepEqual(rules(`${HEAD}// test-quality: contract\nassert.equal(LIMIT, 5000)\n`), [
      'contract-without-reason'
    ])
  })

  test('a file that does not parse is a failure with its place; valid JavaScript the TypeScript parser refuses is read', () => {
    assert.throws(
      () => findingsOf('const = (\n', 'pkg/test/b.test.mjs'),
      (e) => e instanceof GateError && /b\.test\.mjs:1: does not parse/.test(e.message)
    )
    // `site-call.test.mjs`, 12/10/2026: a JSDoc type before an arrow's parameter, after a comment line.
    const jsdoc = `${HEAD}\n// ── lost answers ──\n\nconst w = (/** @type {string} */ title) => ({\n  action: 'x',\n  params: { title }\n})\nassert.equal(w('a').action, 'x')\n`
    assert.deepEqual(rules(jsdoc), [])
  })

  test('only test files outside vendor/ are read', () => {
    assert.equal(isTestFile('packages/a/b/test/x.test.mjs'), true)
    assert.equal(isTestFile('scripts/test/x.test.ts'), true)
    assert.equal(isTestFile('vendor/tracy/x/test/y.test.mjs'), false)
    assert.equal(isTestFile('packages/a/b/src/x.mjs'), false)
    assert.equal(isTestFile('packages/a/b/test/fixtures/data.json'), false)
  })
})

// ── what a change adds, from a real repository ───────────────────────────────────────────────────

const scratch = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'test-quality-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

let repos = 0
/** A repository with `files` committed on `main`; returns its path, the commit and a writer. */
function repoWith(files) {
  repos += 1
  const dir = path.join(scratch, `r${repos}`)
  mkdirSync(dir)
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  git('init', '--quiet', '--initial-branch=main')
  git('config', 'user.email', 'gate@example.test')
  git('config', 'user.name', 'gate')
  git('config', 'commit.gpgsign', 'false')
  const write = (entries) => {
    for (const [file, text] of Object.entries(entries)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      writeFileSync(path.join(dir, file), text)
    }
  }
  write(files)
  git('add', '-A')
  git('commit', '--quiet', '-m', 'base')
  return { dir, git, write, base: git('rev-parse', 'HEAD') }
}

const OLD_PIN = `${HEAD}assert.equal(LIMIT, 5000)\n`

describe('only what the change adds', () => {
  test('old pins stay; a new one, a re-pinned one and an untracked file are reported; vendor/ and product files are not', () => {
    const r = repoWith({
      'pkg/test/old.test.mjs': OLD_PIN,
      'pkg/test/gone.test.mjs': OLD_PIN,
      'pkg/test/moved.test.mjs': `${OLD_PIN}assert.equal(OTHER, 'x')\n`,
      'pkg/src/a.js': 'export const LIMIT = 5000\n'
    })
    r.write({
      // An edit next to an old pin: the old pin is not this change's.
      'pkg/test/old.test.mjs': `${OLD_PIN}assert.equal(limitOf('a'), 5000)\n`,
      'pkg/test/new.test.mjs': `${HEAD}assert.equal(OTHER, 'copy')\n`,
      'vendor/x/test/v.test.mjs': `${HEAD}assert.equal(1, 1)\n`,
      'pkg/src/b.js': `${HEAD}assert.equal(1, 1)\n`,
      'pkg/test/untracked.test.ts': `${HEAD}assert.ok(true)\n`
    })
    rmSync(path.join(r.dir, 'pkg/test/gone.test.mjs'))
    renameSync(path.join(r.dir, 'pkg/test/moved.test.mjs'), path.join(r.dir, 'pkg/test/renamed.test.mjs'))
    r.git('add', '-A', 'pkg/test/moved.test.mjs', 'pkg/test/renamed.test.mjs')
    const result = run({ repo: r.dir, arg: r.base, env: {} })
    assert.deepEqual(
      result.findings.map((f) => `${f.file}:${f.line} ${f.rule}`),
      ['pkg/test/new.test.mjs:3 pinned-constant', 'pkg/test/untracked.test.ts:3 self-compare']
    )
    assert.deepEqual(
      result.files.map((f) => `${f.path}<-${f.from}`),
      [
        'pkg/test/new.test.mjs<-null',
        'pkg/test/old.test.mjs<-pkg/test/old.test.mjs',
        'pkg/test/renamed.test.mjs<-pkg/test/moved.test.mjs',
        'pkg/test/untracked.test.ts<-null'
      ]
    )
    // Re-pinning the old constant to a new copy is this change's.
    r.write({ 'pkg/test/old.test.mjs': `${HEAD}assert.equal(LIMIT, 6000)\n` })
    const repinned = run({ repo: r.dir, arg: r.base, env: {} }).findings.map((f) => f.file)
    assert.ok(repinned.includes('pkg/test/old.test.mjs'))
  })

  test('the same pin twice where the base had it once: the second is new', () => {
    const before = findingsOf(OLD_PIN, 'a.test.mjs')
    const twice = findingsOf(`${OLD_PIN}assert.equal(LIMIT, 5000)\n`, 'a.test.mjs')
    assert.equal(surplus(twice, before).length, 1)
    assert.equal(surplus(before, before).length, 0)
  })

  test('the base: --base, a pull request’s merge parent, nothing on another CI event, a refusal without one', () => {
    const r = repoWith({ 'pkg/test/a.test.mjs': `${HEAD}assert.equal(limitOf(1), 1)\n` })
    // A pull request: CI checks out the merge commit, whose first parent is the base tip.
    r.git('checkout', '--quiet', '-b', 'feature')
    r.write({ 'pkg/test/a.test.mjs': `${HEAD}assert.equal(limitOf(1), 1)\nassert.equal(LIMIT, 1)\n` })
    r.git('commit', '--quiet', '-am', 'pin')
    r.git('checkout', '--quiet', 'main')
    r.git('merge', '--quiet', '--no-ff', '-m', 'merge', 'feature')
    const pr = run({ repo: r.dir, env: { GITHUB_EVENT_NAME: 'pull_request' } })
    assert.equal(pr.base, r.base)
    assert.deepEqual(
      pr.findings.map((f) => f.rule),
      ['pinned-constant']
    )
    assert.match(
      run({ repo: r.dir, env: { GITHUB_EVENT_NAME: 'schedule' } }).skip,
      /not a pull request \(schedule\)/
    )
    // Locally the base is the fork point from origin/develop; a repository without it is refused.
    assert.throws(
      () => run({ repo: r.dir, env: {} }),
      (e) => e instanceof GateError && /merge-base/.test(e.message)
    )
    assert.throws(() => run({ repo: r.dir, arg: 'no-such-ref', env: {} }), GateError)
    assert.throws(() => run({ repo: r.dir, arg: '--output=x', env: {} }), /not a usable base/)
  })

  test('a changed test file that does not parse stops the gate with its name', () => {
    const r = repoWith({ 'pkg/test/a.test.mjs': `${HEAD}assert.equal(limitOf(1), 1)\n` })
    r.write({ 'pkg/test/a.test.mjs': 'const = (\n' })
    assert.throws(
      () => run({ repo: r.dir, arg: r.base, env: {} }),
      /pkg\/test\/a\.test\.mjs:1: does not parse/
    )
  })

  test('a bad command line is exit 2', () => {
    const cli = spawnSync(process.execPath, [GATE, '--bogus'], { encoding: 'utf8' })
    assert.equal(cli.status, 2, cli.stderr)
    assert.match(cli.stderr, /unknown argument --bogus/)
  })
})

import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { drive } from '../drivers/pilot-drive.mjs'
import { runPilot } from '../drivers/publish-pilot.mjs'
import { LAYER_DIR, REPO, sha256File } from '../util.mjs'
import { tmpDir } from './helpers.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const RED = path.join(LAYER_DIR, 'drivers/red-on-base.mjs')
const REG = path.join(LAYER_DIR, 'drivers/regression-run.mjs')
const node = (script, args, opts = {}) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', ...opts })
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

function repo(name, { baseSource, headSource, test }) {
  const dir = tmpDir(name)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'qa@example.test')
  git(dir, 'config', 'user.name', 'qa')
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  mkdirSync(path.join(dir, 'tests'), { recursive: true })
  writeFileSync(path.join(dir, 'src/a.mjs'), baseSource)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'base')
  git(dir, 'branch', 'base')
  writeFileSync(path.join(dir, 'src/a.mjs'), headSource)
  writeFileSync(path.join(dir, 'tests/a.test.mjs'), test)
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'fix + test')
  return dir
}
const run = (dir, out, tests = 'tests/a.test.mjs') =>
  node(RED, ['--base', 'base', '--tests', tests, '--sources', 'src', '--out', out, '--repo', dir])

test('red-on-base: a test that fails on the base with a behaviour assertion is red proof (exit 0), and the unpacked tree is removed', () => {
  const dir = repo('red-ok', {
    baseSource: 'export const add = (a, b) => a - b\n',
    headSource: 'export const add = (a, b) => a + b\n',
    test: "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { add } from '../src/a.mjs'\ntest('add adds', () => assert.equal(add(1, 2), 3))\n"
  })
  const out = tmpDir('red-out')
  const r = run(dir, out)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const summary = JSON.parse(readTextSync(path.join(out, 'red-on-base.json')))
  assert.equal(summary.assertion, 1)
  assert.equal(summary.missingModule, 0)
  assert.ok(!existsSync(path.join(out, 'red-base')), 'scratch tree removed')
})

test('red-on-base: a test that also passes on the base proves nothing (exit 1); a missing module is not behaviour (exit 1)', () => {
  const passes = repo('red-green', {
    baseSource: 'export const add = (a, b) => a + b\n',
    headSource: 'export const add = (a, b) => a + b // touched\n',
    test: "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { add } from '../src/a.mjs'\ntest('add adds', () => assert.equal(add(1, 2), 3))\n"
  })
  const a = run(passes, tmpDir('o1'))
  assert.equal(a.status, 1)
  assert.match(a.stderr, /prove nothing/)
  const missing = repo('red-missing', {
    baseSource: 'export const x = 1\n',
    headSource: 'export const x = 2\nexport const add = () => 3\n',
    test: "import { test } from 'node:test'\nimport { add } from '../src/b.mjs'\ntest('t', () => add())\n"
  })
  const b = run(missing, tmpDir('o2'))
  assert.equal(b.status, 1)
  assert.match(b.stderr, /only missing modules/)
})

test('red-on-base refuses bad invocations with exit 2 and touches nothing', () => {
  const out = tmpDir('red-bad')
  for (const args of [
    [],
    ['--base', 'x'],
    ['--base', 'bad ref', '--tests', 't', '--sources', 's', '--out', out],
    ['--base', 'main', '--tests', '../escape.test.mjs', '--sources', 'src', '--out', out],
    ['--base', 'main', '--tests', 't', '--sources', '/etc', '--out', out],
    ['--base', 'main', '--tests', 't', '--sources', 's', '--out', out, '--wat', '1']
  ]) {
    const r = node(RED, args)
    assert.equal(r.status, 2, args.join(' '))
  }
  assert.deepEqual(readdirSync(out), [])
})

test('regression-run refuses a bad or absent case and never writes into tests/regression', () => {
  const out = tmpDir('reg-out')
  for (const args of [
    [],
    ['--case', 'nope', '--out', out],
    ['--case', 'REG-does-not-exist', '--out', out],
    ['--case', 'REG-1', '--out', out, '--wat', 'x']
  ]) {
    const r = node(REG, args, { cwd: REPO })
    assert.equal(r.status, 2, `${args.join(' ')}\n${r.stderr}`)
  }
  assert.deepEqual(readdirSync(out), [])
  const src = readTextSync(REG)
  const code = src
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
  assert.ok(
    !/tests\/regression\/(results|\.runs)|resultPath|formatResult/.test(code),
    'no write path into the catalogue'
  )
  assert.ok(!/run-required-tests|tchpublish|\/Users\//.test(src))
})

test('the generalised drivers carry no machine path, no fixed project, no recipe outside the layer', () => {
  for (const f of ['pilot-drive.mjs', 'publish-pilot.mjs', 'red-on-base.mjs', 'regression-run.mjs']) {
    const src = readTextSync(path.join(LAYER_DIR, 'drivers', f))
    assert.ok(!/\/Users\/|\/private\/tmp|tchpublish|work\/pilot|\.pnpm\/playwright@/.test(src), f)
  }
})

test('pilot: without stubs it says PENDING; the browser driver refuses to start without them; Playwright resolves from the workspace', async () => {
  const p = await runPilot({
    stand: { origin: 'http://x', siteDomain: 'localhost', containers: {} },
    outDir: tmpDir('pilot'),
    cdp: 'http://127.0.0.1:1'
  })
  assert.equal(p.status, 'PENDING')
  assert.match(p.reason, /stubs/)
  await assert.rejects(() => drive({ repo: REPO, rows: [] }), /stubDir is required/)
})

test('SOURCE.md records the sha256 of every original driver; when the originals are present the hashes are recomputed from them', () => {
  const text = readTextSync(path.join(LAYER_DIR, 'SOURCE.md'))
  const rows = [...text.matchAll(/^\| `([\w.-]+\.mjs)` \| `([0-9a-f]{64})` \|/gm)].map((m) => [m[1], m[2]])
  assert.deepEqual(rows.map(([f]) => f).sort(), [
    'pilot-drive.mjs',
    'publish-pilot.mjs',
    'red-on-base.mjs',
    'regression-run.mjs'
  ])
  assert.equal(new Set(rows.map(([, h]) => h)).size, 4)
  const dir =
    process.env.QA_FLOWS_PILOT_ORIGINALS ??
    path.join(os.homedir(), 'Workspace', 'qa-suite-plan', 'inputs', 'pilot-drivers')
  const present = rows.filter(([f]) => existsSync(path.join(dir, f)))
  // Present originals must match exactly; a machine without the plan directory checks the table only.
  for (const [f, h] of present)
    assert.equal(sha256File(path.join(dir, f)), h, `${f} differs from its recorded hash`)
  assert.ok(
    present.length === 0 || present.length === rows.length,
    'either all originals are present or none'
  )
  assert.ok(
    !/state\/repos\/c970542f994d47bd395e/.test(text),
    'the stale artifact directory is no longer named'
  )
})

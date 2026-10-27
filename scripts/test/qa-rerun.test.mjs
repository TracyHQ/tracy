/**
 * `rerun` (plan §4.10, §11 G4.3), the part that needs no real sandbox: what it runs, under which
 * profile, with which environment, and which tests it will accept. The real fence (a sample test
 * that cannot read ~/.zshenv) is `scripts/qa/rerun --self-check`, outside this suite like G2's
 * `fence-check --mock`.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { laneLayout } from '../qa/fence/render.mjs'
import { removeTree, rerunCommand, rerunPlan } from '../qa/lib/rerun.mjs'
import { installTestlib, libDigest, TESTLIB_FILES } from '../qa/testlib/install.mjs'

const tmps = []
after(() => {
  for (const d of tmps) removeTree(d)
})

function tree({ lib = true, tests = ['pr12-k1', 'pr12-k2'] } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'qa-rerun-')))
  tmps.push(root)
  const qaHome = join(root, 'qa')
  const worktrees = join(root, 'wt')
  const layout = laneLayout({ qaHome, worktrees, runId: '20261003a', lane: 'sol', pr: '12' })
  mkdirSync(layout.prTestDir, { recursive: true })
  for (const t of tests) writeFileSync(join(layout.prTestDir, `${t}.test.mjs`), 'export {}\n')
  writeFileSync(join(layout.prTestDir, 'helper.mjs'), 'export {}\n')
  if (lib) installTestlib(join(layout.prDir, 'lib'))
  return { root, qaHome, worktrees, layout }
}

const plan = (t, extra = {}) =>
  rerunPlan({
    lane: 'sol',
    pr: 12,
    runId: '20261003a',
    qaHome: t.qaHome,
    worktrees: t.worktrees,
    stamp: 'T1',
    ...extra
  })

test('a lane keeps its temporary root when its child folders do not exist yet', () => {
  const t = tree({ lib: false })
  assert.ok(t.layout.prTestDir.startsWith(`${t.root}/`))
  assert.ok(t.layout.testTmp.startsWith(`${t.root}/`))
})

test('G4.3 the command reports print names the lane, the PR and the case, never node or bash', () => {
  assert.equal(rerunCommand('sonnet', 745), 'scripts/qa/rerun sonnet 745')
  assert.equal(rerunCommand('sol', 745, 'pr745-k2'), 'scripts/qa/rerun sol 745 pr745-k2')
  assert.equal(rerunCommand('sol', 745, 'all'), 'scripts/qa/rerun sol 745')
})

test('G4.3 node --test runs under the lane test profile and nothing else', () => {
  const t = tree()
  const p = plan(t)
  assert.deepEqual(p.argv.slice(0, 3), ['/usr/bin/sandbox-exec', '-f', p.profile.file])
  assert.equal(p.argv[3], realpathSync(process.execPath))
  assert.ok(p.argv.includes('--test'))
  assert.ok(p.argv.includes(`--test-reporter=${join(t.layout.prDir, 'lib', 'reporter.mjs')}`))
  assert.deepEqual(
    p.files,
    ['pr12-k1', 'pr12-k2'].map((c) => join(t.layout.prTestDir, `${c}.test.mjs`))
  )
  const profile = readFileSync(p.profile.file, 'utf8')
  assert.match(profile, /\(sol \/ test\)/)
  assert.match(profile, /\(deny network\*\)/)
  assert.ok(profile.includes(`(subpath "${t.layout.results}")`), 'results are writable')
  assert.ok(!profile.includes(`(subpath "${homedir()}")`), 'home is not readable')
  assert.equal(p.resultDir, join(t.layout.results, 'rerun', '12-all-T1'))
})

test('G4.3 the environment is built by hand: no inherited variable, HOME is not the real home', () => {
  process.env.QA_LEAK_PROBE = 'must-not-pass'
  try {
    const t = tree()
    const p = plan(t)
    assert.equal(p.env.QA_LEAK_PROBE, undefined)
    assert.equal(p.env.HOME, join(t.layout.testTmp, 'home'))
    assert.notEqual(p.env.HOME, homedir())
    assert.equal(p.env.NODE_OPTIONS, `--import=${t.layout.resolvePreload}`)
    assert.equal(p.env.QA_RESOLVE_ONLY, '1')
    assert.equal(p.env.QA_LANE, 'sol')
    assert.equal(p.env.QA_PR, '12')
    assert.equal(p.env.QA_LANE_KEY_FILE, t.layout.laneKey)
    assert.equal(p.env.QA_CDP_PORT, '9237')
    assert.equal(p.env.QA_GATE_URL, 'http://127.0.0.1:36080')
    assert.equal(p.env.QA_RESULTS, p.resultDir)
    assert.equal(p.env.GIT_CONFIG_VALUE_0, '/dev/null')
    for (const k of Object.keys(p.env)) assert.ok(!/TOKEN|SECRET|KEY$/.test(k), `unexpected ${k}`)
  } finally {
    delete process.env.QA_LEAK_PROBE
  }
})

test('G4.3 which tests it accepts: a case id, a path inside the PR folder; nothing outside', () => {
  const t = tree()
  assert.deepEqual(plan(t, { target: 'pr12-k2' }).files, [join(t.layout.prTestDir, 'pr12-k2.test.mjs')])
  const byPath = plan(t, { target: join(t.layout.prTestDir, 'pr12-k1.test.mjs') })
  assert.equal(byPath.target, 'pr12-k1.test.mjs')
  assert.throws(() => plan(t, { target: 'pr12-k9' }), /missing/)
  const outside = join(t.root, 'elsewhere.test.mjs')
  writeFileSync(outside, 'export {}\n')
  assert.throws(() => plan(t, { target: outside }), /not a \.test\.mjs inside/)
  assert.throws(() => plan(t, { target: join(t.layout.prTestDir, 'helper.mjs') }), /not a \.test\.mjs/)
  assert.throws(() => plan(t, { lane: 'opus' }), /unknown lane/)
  assert.throws(() => plan(t, { pr: '12; rm -rf /' }), /PR must be a number/)
  assert.throws(() => plan(t, { runId: undefined }), /no run id/)
})

test('G4.3 no test library next to the tests -> refused before anything runs', () => {
  const t = tree({ lib: false })
  assert.throws(() => plan(t), /no test library/)
})

test('installTestlib puts a read-only lib/ with a stable digest', () => {
  const t = tree()
  const lib = join(t.layout.prDir, 'lib')
  const d1 = libDigest(lib)
  const again = installTestlib(lib)
  assert.equal(again.sha256, d1)
  assert.deepEqual(again.files, TESTLIB_FILES)
  assert.throws(() => writeFileSync(join(lib, 'stand.mjs'), 'x'), /EACCES|EPERM/)
})

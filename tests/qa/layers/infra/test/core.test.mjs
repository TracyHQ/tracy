// Self-tests of the infra layer's engine: a known-good case passes, an injected fault is caught,
// a missing dependency is ENV, a case without RED proof stays PENDING, and the usage / policy /
// containment rules hold. Cases here are synthetic unless they name a real case on purpose.
import { scratchDir } from '../lib/scratch.mjs'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { after, test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { HarnessError, REPO, containedPath, step } from '../lib/harness.mjs'
import { exitCodeFor } from '../lib/report.mjs'
import { allDefs, checkOracle, createMutantStore, runCase } from '../lib/runner.mjs'
import { ContractError, listCases, readManifests, run } from '../index.mjs'
import { writeFileSync } from 'node:fs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const RUN = path.join(REPO, 'tests/qa/layers/infra/run.mjs')
const temps = []
const scratch = () => {
  const dir = scratchDir('qa-infra-selftest-')
  temps.push(dir)
  return dir
}
after(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })))

const synthetic = (extra) => ({
  id: 'QA-INFRA-synthetic',
  itemIds: ['synthetic'],
  oracle: 'signed-channel',
  edgeTags: [],
  assertionIds: ['the-assertion'],
  redAssertion: 'the-assertion',
  mutation: null,
  ...extra
})
const opts = (extra = {}) => ({ target: 'local', proveRed: true, outDir: scratch(), env: {}, ...extra })

test('usage errors exit 2 and write nothing (bad target, unknown flag, missing value, unknown area)', () => {
  const out = path.join(scratch(), 'must-not-exist')
  for (const args of [['--target', 'staging'], ['--bogus'], ['--area'], ['--area', 'nope'], ['--out']]) {
    const r = spawnSync(process.execPath, [RUN, ...args, ...(args.includes('--out') ? [] : ['--out', out])], {
      encoding: 'utf8'
    })
    assert.equal(r.status, 2, `${args.join(' ')} → ${r.status}: ${r.stdout}${r.stderr}`)
  }
  assert.equal(existsSync(out), false, 'a usage error created the output directory')
})

test('known-good case: GREEN + RED on the same assertion → PASS, with a proof log that names the failing assertion', async () => {
  const def = allDefs().find((d) => d.id === 'QA-INFRA-backup-point-flipped-byte-same-size')
  const o = opts()
  const store = createMutantStore(o.outDir)
  try {
    const result = await runCase(def, { ...o, store })
    assert.equal(result.verdict, 'PASS', result.reason)
    assert.equal(result.redProof.assertionId, def.redAssertion)
    const log = JSON.parse(readTextSync(path.join(o.outDir, result.redProof.log)))
    assert.equal(log.observedAssertion, def.redAssertion)
    assert.match(log.observed, /Expected values to be strictly equal|AssertionError|!==|same/i)
  } finally {
    store.cleanup()
  }
})

test('an injected product fault is caught: a failing assertion on the real tree is FAIL, never PENDING', async () => {
  const def = synthetic({
    async run() {
      step('the-assertion', () => assert.equal(1 + 1, 3, 'injected fault'))
    }
  })
  const result = await runCase(def, { ...opts(), store: null })
  assert.equal(result.verdict, 'FAIL')
  assert.match(result.reason, /the-assertion: .*injected fault/)
})

test('a throw that is not an assertion is a harness error → PENDING (not FAIL)', async () => {
  const def = synthetic({
    async run() {
      throw new TypeError('boom')
    }
  })
  const result = await runCase(def, { ...opts(), store: null })
  assert.equal(result.verdict, 'PENDING')
  assert.match(result.reason, /harness error/)
})

test('a missing dependency is ENV and names its probe', async () => {
  for (const [need, env, text] of [
    ['stand', {}, /QA_STAND_URL is not set/],
    ['database', {}, /TEST_DATABASE_URL is not set/],
    ['stand', { QA_STAND_URL: 'http://127.0.0.1:1' }, /unreachable/]
  ]) {
    const result = await runCase(synthetic({ requires: [need], async run() {} }), {
      ...opts({ env }),
      store: null
    })
    assert.equal(result.verdict, 'ENV', result.reason)
    assert.match(result.reason, text)
  }
})

test('a case with no RED proof stays PENDING (no mutation, RED not requested, mutant not detected, mutant crashes)', async () => {
  const good = async () => {
    step('the-assertion', () => assert.ok(true))
  }
  const noMutation = await runCase(synthetic({ run: good }), { ...opts(), store: null })
  assert.equal(noMutation.verdict, 'PENDING')
  assert.match(noMutation.reason, /no RED proof/)

  const notRequested = await runCase(synthetic({ run: good, mutation: 'host-auth-off' }), {
    ...opts({ proveRed: false }),
    store: null
  })
  assert.equal(notRequested.verdict, 'PENDING')
  assert.match(notRequested.reason, /RED proof not requested/)

  const o = opts()
  const store = createMutantStore(o.outDir)
  try {
    const undetected = await runCase(synthetic({ run: good, mutation: 'host-auth-off' }), { ...o, store })
    assert.equal(undetected.verdict, 'PENDING')
    assert.match(undetected.reason, /mutant not detected/)

    // The case passes on the real tree but dies with a non-assertion error on the mutant: not RED.
    const crashes = synthetic({
      mutation: 'host-auth-off',
      async run({ root }) {
        if (root !== REPO) throw new TypeError('cannot boot the mutant')
        step('the-assertion', () => assert.ok(true))
      }
    })
    const crashed = await runCase(crashes, { ...o, store })
    assert.equal(crashed.verdict, 'PENDING')
    assert.match(crashed.reason, /non-assertion failure/)

    // Failing a different assertion than the case's own is not RED for this case either.
    const other = synthetic({
      mutation: 'host-auth-off',
      async run({ root }) {
        if (root !== REPO) step('some-other-assertion', () => assert.fail('x'))
        step('the-assertion', () => assert.ok(true))
      }
    })
    const wrong = await runCase(other, { ...o, store })
    assert.equal(wrong.verdict, 'PENDING')
    assert.match(wrong.reason, /not the case's/)
  } finally {
    store.cleanup()
  }
})

test('mutant scratch trees are created inside the output directory and removed afterwards', async () => {
  const o = opts()
  const store = createMutantStore(o.outDir)
  try {
    const entry = store.tree('host-auth-off')
    assert.ok(entry.root)
    assert.equal(existsSync(entry.root), true)
  } finally {
    store.cleanup()
  }
  assert.equal(existsSync(path.join(o.outDir, 'red/trees')), false, 'scratch trees were not cleaned up')
})

test('target policy: anything but local is PENDING target-policy and the case body never runs', async () => {
  let ran = false
  for (const target of ['dev', 'prod']) {
    const result = await runCase(
      synthetic({
        async run() {
          ran = true
        }
      }),
      { ...opts({ target }), store: null }
    )
    assert.equal(result.verdict, 'PENDING')
    assert.match(result.reason, /^target-policy/)
  }
  assert.equal(ran, false)
})

test('evidence containment: a path that escapes the output directory is refused', () => {
  const dir = scratch()
  for (const bad of ['../x', 'a/../../x', '/etc/passwd'])
    assert.throws(() => containedPath(dir, bad), HarnessError)
  assert.equal(containedPath(dir, 'red/ok.log'), path.join(dir, 'red/ok.log'))
})

test('oracle drift: an anchor that disappeared makes the oracle unusable (checked against a scratch repo)', () => {
  assert.equal(checkOracle('signed-channel').ok, true)
  const empty = scratch()
  const drifted = checkOracle('signed-channel', empty)
  assert.equal(drifted.ok, false)
  assert.match(drifted.detail, /missing/)
  assert.equal(checkOracle('no-such-oracle').ok, false)
})

test('exit-code rule: 0 all PASS, 1 any FAIL, 3 otherwise', () => {
  assert.equal(exitCodeFor([{ verdict: 'PASS' }]), 0)
  assert.equal(exitCodeFor([{ verdict: 'PASS' }, { verdict: 'PENDING' }]), 3)
  assert.equal(exitCodeFor([{ verdict: 'ENV' }]), 3)
  assert.equal(exitCodeFor([{ verdict: 'ENV' }, { verdict: 'FAIL' }]), 1)
})

test('listCases validates the manifests against the code; run() returns one result per case with the contract fields', async () => {
  const all = await listCases({})
  assert.ok(all.length > 200)
  assert.deepEqual(
    all.map((m) => m.id),
    [...new Set(all.map((m) => m.id))]
  )
  const two = all.filter(
    (m) =>
      m.id === 'QA-INFRA-teardown-invalid-args-unknown-flag' || m.id === 'QA-INFRA-lifecycle-provision-ready'
  )
  const results = await run({ cases: two, target: 'local', proveRed: false, outDir: scratch() })
  assert.deepEqual(results.map((r) => r.id).sort(), two.map((m) => m.id).sort())
  for (const r of results) {
    for (const key of ['id', 'verdict', 'reason', 'assertionIds', 'evidence', 'durationMs', 'redProof'])
      assert.ok(key in r, `result lacks ${key}`)
    assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict))
  }
  await assert.rejects(() => listCases({ area: 'nope' }), /unknown area/)
})

test('unreadable, empty or malformed manifests are a contract error, never guessed', () => {
  const dir = scratch()
  assert.throws(() => readManifests(path.join(dir, 'missing')), ContractError)
  assert.throws(() => readManifests(dir), /no case manifests/)
  writeFileSync(path.join(dir, 'a.json'), '{ not json')
  assert.throws(() => readManifests(dir), /not readable JSON/)
  writeFileSync(path.join(dir, 'a.json'), '{}')
  assert.throws(() => readManifests(dir), /array/)
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify([{ id: 'QA-INFRA-x' }]))
  assert.throws(() => readManifests(dir), /missing itemIds|missing/)
  const good = {
    id: 'QA-INFRA-x',
    itemIds: [],
    requirement: 'r',
    oracle: { source: 's', ref: 'r', invariant: 'i' },
    edgeTags: [],
    targets: ['local'],
    effects: {},
    prerequisites: [],
    assertionIds: [],
    redProof: null,
    legacyIds: []
  }
  writeFileSync(path.join(dir, 'a.json'), JSON.stringify([good]))
  assert.throws(() => readManifests(dir), /itemIds must not be empty/)
  writeFileSync(
    path.join(dir, 'a.json'),
    JSON.stringify([{ ...good, itemIds: ['i'], oracle: { source: '', ref: 'r', invariant: 'i' } }])
  )
  assert.throws(() => readManifests(dir), /oracle.source is empty/)
})

test('a results directory that cannot be written is exit 2 with a message, not a crash that looks like a FAIL', () => {
  const dir = scratch()
  const blocker = path.join(dir, 'a-file')
  writeFileSync(blocker, 'x')
  const r = spawnSync(process.execPath, [RUN, '--area', 'lifecycle', '--out', path.join(blocker, 'nested')], {
    encoding: 'utf8'
  })
  assert.equal(r.status, 2, `${r.status}: ${r.stdout}${r.stderr}`)
  assert.match(r.stderr, /cannot write the results/)
})

test('containment: a symlink on the path (parent or target) is refused, and so is a FIFO read as a file', async () => {
  const { symlinkSync, mkdirSync } = await import('node:fs')
  const { assertRegularFile } = await import('../lib/harness.mjs')
  const dir = scratch()
  const outside = scratch()
  symlinkSync(outside, path.join(dir, 'link'))
  assert.throws(() => containedPath(dir, 'link/x.log'), HarnessError)
  mkdirSync(path.join(dir, 'real'))
  symlinkSync(path.join(outside, 'f'), path.join(dir, 'real', 'file-link'))
  assert.throws(() => containedPath(dir, 'real/file-link'), HarnessError)
  assert.equal(containedPath(dir, 'real/new.log'), path.join(dir, 'real', 'new.log'))
  const fifo = path.join(dir, 'pipe')
  assert.equal(spawnSync('mkfifo', [fifo]).status, 0)
  assert.throws(() => assertRegularFile(fifo), HarnessError)
  assert.throws(() => assertRegularFile(dir), HarnessError)
})

test('a symlink in a PARENT of the base is refused for containment, scratch creation and file reads', async () => {
  const { symlinkSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { assertRegularFile } = await import('../lib/harness.mjs')
  const { scratchDir } = await import('../lib/scratch.mjs')
  const dir = scratch()
  const outside = scratch()
  writeFileSync(path.join(outside, 'f.txt'), 'x')
  symlinkSync(outside, path.join(dir, 'parent'))
  mkdirSync(path.join(outside, 'sub'))
  assert.throws(() => containedPath(path.join(dir, 'parent', 'sub'), 'x.log'), HarnessError)
  assert.throws(() => assertRegularFile(path.join(dir, 'parent', 'f.txt')), HarnessError)
  const before = process.env.QA_INFRA_ARTIFACT_DIR
  process.env.QA_INFRA_ARTIFACT_DIR = path.join(dir, 'parent')
  try {
    assert.throws(() => scratchDir('x-'), HarnessError)
  } finally {
    if (before === undefined) delete process.env.QA_INFRA_ARTIFACT_DIR
    else process.env.QA_INFRA_ARTIFACT_DIR = before
  }
})

test('scratch directories never fall back to a shared temp dir and only owned ones are removed', async () => {
  const { removeScratch, scratchBase } = await import('../lib/scratch.mjs')
  const base = scratchBase()
  assert.ok(
    (!base.startsWith('/tmp') && !base.startsWith('/var/folders')) || process.env.QA_INFRA_ARTIFACT_DIR
  )
  const dir = scratch()
  assert.throws(() => removeScratch(path.join(dir, '..')), /not a scratch directory/)
  assert.ok(existsSync(dir))
})

test('an oracle whose anchors are all product code has no independent source: PENDING, not PASS', () => {
  const caller = checkOracle('caller-verbs')
  assert.equal(caller.ok, false)
  assert.match(caller.detail, /product code|no independent source/)
})

test('an external oracle is usable only as a pinned copy: a URL string alone is PENDING', () => {
  for (const key of ['docker-name-grammar', 'dockerfile-copy-semantics']) {
    const verdict = checkOracle(key)
    assert.equal(verdict.ok, false, key)
    assert.match(verdict.detail, /not pinned/)
  }
})

test('a missing dependency is ENV even when the oracle is not usable (probe first, oracle after)', async () => {
  const def = synthetic({ oracle: 'refuse-before-effect', requires: ['stand'], run: async () => {} })
  const o = opts({ env: {} })
  const r = await runCase(def, { ...o, store: createMutantStore(o.outDir) })
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /probe stand/)
})

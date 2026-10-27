// Runs the existing suites through the adapter and checks what their result MEANS: every suite
// named in the plan really ran (or its missing prerequisite is proven), nothing failed, nothing
// was started in Docker, no tracked file changed, and a skip is never counted as a pass.
//
//   node --test tests/qa/layers/infra/test/legacy.test.mjs
//
// A green exit here says the adapter classified every suite correctly. It does not say the legacy
// expectations are right: they are not bound to an oracle, and the layer reports them PENDING.
import { removeScratch, scratchDir } from '../lib/scratch.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { REPO } from '../lib/harness.mjs'
import {
  LEGACY_SUITES,
  KNOWN_OUTPUT,
  ignoredPaths,
  PYTHON_SUITES,
  classifyFailures,
  runLegacySuite,
  runPythonSuite,
  suiteFiles
} from '../lib/legacy.mjs'

const outDir = scratchDir('qa-infra-legacy-')
const keep = process.env.QA_INFRA_ARTIFACT_DIR
// Every run writes to its own names: an earlier run's logs are review evidence and are never overwritten.
const runId = `${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}`

const git = (...args) => spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).stdout
let trackedBefore
let ignoredBefore

before(() => {
  trackedBefore = git('diff', '--stat', 'HEAD', '--', '.')
  ignoredBefore = ignoredPaths()
})
after(() => {
  // The original TAP logs are review evidence: copy them to the artifact directory before the scratch
  // directory (created by this run) is removed.
  if (keep) {
    const logs = path.join(path.resolve(keep), 'legacy-logs', runId)
    mkdirSync(logs, { recursive: true })
    const from = path.join(outDir, 'legacy')
    if (existsSync(from))
      for (const f of readdirSync(from)) copyFileSync(path.join(from, f), path.join(logs, f))
  }
  removeScratch(outDir)
})

test('the suites the plan names exist and are enumerated from the directories, not typed by hand', () => {
  const host = suiteFiles(LEGACY_SUITES.find((s) => s.key === 'host'))
  const onDisk = readdirSync(path.join(REPO, 'apps/tracy-host/test')).filter((f) => f.endsWith('.test.mjs'))
  assert.equal(host.length, onDisk.length)
  const shards = LEGACY_SUITES.filter((s) => s.shard)
  const fleet = shards.flatMap((s) => suiteFiles(s))
  const onDiskFleet = readdirSync(path.join(REPO, 'packages/fleet/tracy-fleet-operation/test')).filter((f) =>
    f.endsWith('.test.mjs')
  )
  assert.ok(fleet.length > 50, `only ${fleet.length} fleet suites found`)
  assert.equal(new Set(fleet).size, fleet.length, 'a fleet file is in two shards')
  assert.equal(fleet.length, onDiskFleet.length, 'the shards do not cover every fleet test file')
  for (const name of ['cron', 'inventory-reconcile', 'provision-settles', 'backup-restore']) {
    assert.ok(
      LEGACY_SUITES.some((s) => s.files?.[0] === `apps/tracy-web/test/${name}.test.mjs`),
      `${name} is not wrapped`
    )
  }
})

for (const suite of LEGACY_SUITES) {
  test(`legacy suite ${suite.key}: ran to the end with no failure, or its prerequisite is proven missing`, () => {
    const result = runLegacySuite(suite, { outDir })
    if (result.state === 'env') {
      // A prerequisite that is not there is ENV with its probe: never a pass, never silently dropped.
      if (suite.requires) {
        assert.match(result.probe, /not set/)
        assert.ok(result.files.length > 0)
      } else {
        // A tool-missing ENV is only legitimate with the probe output and the original log on disk.
        assert.match(result.probe, /not found on PATH/)
        assert.ok(result.log && existsSync(path.join(outDir, result.log)), `${suite.key}: log missing`)
        if (keep)
          appendFileSync(path.join(keep, `legacy-status-${runId}.txt`), `${suite.key} ENV: ${result.probe}\n`)
      }
      return
    }
    assert.ok(['ran', 'fail'].includes(result.state), `${suite.key}: ${result.error ?? result.state}`)
    assert.deepEqual(result.cleaned.unexpected, [], `${suite.key}: unknown build output left in the tree`)
    if (result.cleaned.leftBehind.length > 0 && keep)
      appendFileSync(
        path.join(keep, `legacy-left-behind-${runId}.txt`),
        `${suite.key}: ${result.cleaned.leftBehind.join(', ')}\n`
      )
    // The suite ran to the end. A failing child test is either explained by a proven missing prerequisite
    // (envFailures) or a product FAIL that carries its test name, error excerpt and the original log.
    const failing = result.rows.filter((r) => r.ok === false && r.depth === 0).map((r) => r.name)
    assert.ok(result.log && existsSync(path.join(outDir, result.log)), `${suite.key}: the TAP log is missing`)
    assert.equal(result.state === 'fail', result.productFailures.length > 0)
    assert.equal(
      result.productFailures.length + result.envFailures.length,
      failing.length,
      `${suite.key}: a failing test is neither ENV nor FAIL`
    )
    for (const f of result.productFailures)
      assert.ok(f.name && f.excerpt, `${suite.key}: a FAIL without name or evidence`)
    for (const f of result.envFailures) assert.match(f.probe, /not found on PATH/)
    if ((failing.length > 0 || result.skipped > 0) && keep) {
      appendFileSync(
        path.join(keep, `legacy-status-${runId}.txt`),
        `${suite.key} (${process.platform}) exit ${result.status}, log ${result.log}: product FAIL [${result.productFailures.map((f) => `${f.name}: ${f.excerpt.split('\n')[0]}`).join(' | ')}] env [${result.envFailures.map((f) => f.name).join(' | ')}] skipped ${result.skipped} [${result.skipReasons.join('; ')}]\n`
      )
    }
    assert.equal(result.fail, failing.length, `${suite.key}: fail count does not match the TAP rows`)
    assert.equal(result.cancelled, 0, `${suite.key}: cancelled tests`)
    assert.equal(
      result.status,
      failing.length === 0 ? 0 : 1,
      `${suite.key}: node --test exited ${result.status}`
    )
    assert.ok(result.tests > 0, `${suite.key}: zero tests ran`)
    // Every test is either executed (pass) or a counted skip; skips are listed, never counted as pass.
    assert.equal(
      result.pass + result.fail + result.skipped + result.todo + result.cancelled,
      result.tests,
      `${suite.key}: counts do not add up`
    )
    const skipRows = result.rows.filter((r) => r.directive === 'SKIP').length
    assert.ok(skipRows >= result.skipped, `${suite.key}: ${result.skipped} skips counted, ${skipRows} rows`)
    if (result.skipped > 0) {
      assert.ok(
        result.skipReasons.length > 0,
        `${suite.key}: ${result.skipped} skipped test(s) with no stated reason`
      )
    }
  })
}

test('python suites: run when python3 exists; a missing interpreter is ENV, a failing suite is not hidden', () => {
  for (const file of PYTHON_SUITES) {
    const result = runPythonSuite(file)
    if (result.state === 'env') {
      assert.match(result.probe, /python3/)
      continue
    }
    assert.equal(result.state, 'ran', result.error)
    assert.equal(result.status, 0, `${file} exited ${result.status}:\n${result.tail}`)
  }
})

test('docker is blocked for legacy suites: a self-starting container hook finds no daemon', () => {
  const probe = spawnSync(
    process.execPath,
    [
      '-e',
      "const {spawnSync}=require('node:child_process');process.stdout.write(String(spawnSync('docker',['info']).status))"
    ],
    {
      env: { ...process.env, PATH: `${path.join(outDir, 'nope')}:${process.env.PATH}` },
      encoding: 'utf8'
    }
  )
  assert.ok(probe.status === 0)
  // The shim itself, as the adapter installs it:
  const shim = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {dockerBlockDir} from '" +
        new URL('../lib/legacy.mjs', import.meta.url).href +
        "'; import {spawnSync} from 'node:child_process'; const d=dockerBlockDir(); const r=spawnSync(d+'/docker',['run','mariadb:11'],{encoding:'utf8'}); console.log(r.status, r.stderr.trim())"
    ],
    { encoding: 'utf8' }
  )
  assert.match(shim.stdout, /^125 docker is blocked/)
})

test('the legacy run changed no tracked file in the worktree', () => {
  assert.equal(git('diff', '--stat', 'HEAD', '--', '.'), trackedBefore)
  const grew = [...ignoredPaths()].filter((p) => !ignoredBefore.has(p))
  const unknown = grew.filter((p) => !KNOWN_OUTPUT.some((re) => re.test(p)))
  assert.deepEqual(
    unknown,
    [],
    `the legacy run left unknown ignored paths in the worktree:\n${unknown.join('\n')}`
  )
})

test('a failing test is ENV only when the tool is proven absent and its own error carries the signature', () => {
  const sig = '!! unzipped distribution.json says nothing'
  const row = (name, detail) => ({ depth: 0, ok: false, name, detail })
  const noJq = { PATH: '/nonexistent' }
  // mixed: the signature test is ENV, the other stays a product failure with its excerpt
  const mixed = classifyFailures(
    { rows: [row('a', `error: |-\n ${sig}\n`), row('b', 'EACCES: denied')] },
    noJq
  )
  assert.deepEqual(
    mixed.envFailures.map((f) => f.name),
    ['a']
  )
  assert.match(mixed.envFailures[0].probe, /jq not found on PATH/)
  assert.deepEqual(mixed.productFailures, [{ name: 'b', excerpt: 'EACCES: denied' }])
  // jq present: the same text is a product failure
  const withJq = classifyFailures({ rows: [row('a', sig)] }, process.env.PATH ? process.env : noJq)
  if (spawnSync('sh', ['-c', 'command -v jq']).status === 0) assert.equal(withJq.envFailures.length, 0)
  // no failing test: nothing to classify
  assert.deepEqual(classifyFailures({ rows: [] }, noJq), { envFailures: [], productFailures: [] })
})

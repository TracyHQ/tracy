/**
 * Shared checks of the two layers' acceptance tests: run the standalone runner once with
 * `--target local --prove-red`, keep its exit code, report and results, and compare them with
 * `listCases`, the case manifests and the files on disk.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { REPO } from '../../layers/static/lib/common.mjs'
import { readBytesSync, readTextSync } from '../../lib/bounded-reader.mjs'

/** @returns {string} where acceptance output goes: the task artifact root, else the temp dir. */
export function artifactDir(layer) {
  const root = process.env.QA_ARTIFACT_ROOT
    ? join(process.env.QA_ARTIFACT_ROOT, 'acceptance')
    : join(tmpdir(), 'qa-acceptance')
  const dir = join(root, `${layer}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** @returns {string} the non-QA part of `git status --porcelain`, to prove the product tree was not touched. */
export function productStatus() {
  const r = spawnSync('git', ['status', '--porcelain', '--', '.', ':!tests/qa', ':!qa-results'], {
    cwd: REPO,
    encoding: 'utf8'
  })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}

/** @returns {string} a digest of a file reached through any symlinks, or why there is none. */
function fileDigest(path) {
  try {
    return createHash('sha256').update(readBytesSync(path)).digest('hex')
  } catch (error) {
    return `absent (${error.code})`
  }
}

/** @returns {string} what this machine offers the runners; a change here makes an earlier result stale. */
function machineState() {
  const probe = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000 })
    return `${cmd} ${args.join(' ')} => ${r.error ? `error ${r.error.code}` : `${r.status} ${r.stdout}${r.stderr}`.trim()}`
  }
  return [
    process.version,
    probe('php', ['--version']),
    probe('docker', ['info', '--format', '{{.ServerVersion}}']),
    probe('python3', [
      '-c',
      'import sys, tarfile; print(sys.version_info[:3], hasattr(tarfile, "data_filter"))'
    ]),
    // Ignored by git yet read by the runners: the binary's bytes, and the variables' values (hashed, not logged).
    `dsh bin: ${fileDigest(join(REPO, 'node_modules/.bin/dsh'))}`,
    ...[
      'CI',
      'PATH',
      'NODE_OPTIONS',
      'TEST_DATABASE_URL',
      'QA_STAND_URL',
      'QA_CDP_URL',
      'QA_UNIT_CONCURRENCY'
    ].map(
      (k) =>
        `env ${k}: ${process.env[k] === undefined ? 'unset' : createHash('sha256').update(process.env[k]).digest('hex')}`
    )
  ].join('\n')
}

/**
 * @returns {string} a hash of the tree as it is now: HEAD, tracked changes, untracked files and the
 * machine's prerequisites (php, docker, python, dsh, database/stand variables).
 * A result from the same snapshot, layer and areas is the same run.
 */
export function treeSnapshot() {
  const git = (args) =>
    spawnSync('git', args, { cwd: REPO, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 })
  const hash = createHash('sha256')
  const head = git(['rev-parse', 'HEAD'])
  const diff = git(['diff', 'HEAD', '--binary', '--', '.', ':!qa-results'])
  const untracked = git(['ls-files', '-o', '--exclude-standard', '-z', '--', '.', ':!qa-results'])
  for (const r of [head, diff, untracked]) assert.equal(r.status, 0, String(r.stderr))
  hash.update(head.stdout).update(diff.stdout).update(machineState())
  for (const f of untracked.stdout.toString().split('\0').filter(Boolean))
    hash.update(f).update(readBytesSync(join(REPO, f)))
  return hash.digest('hex')
}

/** @returns {boolean} whether a run directory holds every file a reuse reads, each a non-empty regular file. */
export function completeRun(dir) {
  try {
    const files = ['exit-code.txt', 'run/results.json', 'run/report.md']
    if (!files.every((f) => statSync(join(dir, f)).isFile() && statSync(join(dir, f)).size > 0)) return false
    const results = JSON.parse(readTextSync(join(dir, 'run', 'results.json')))
    // Every evidence file the results name must still be there and readable, or the run is partial or edited.
    return results.every((r) =>
      (r.evidence ?? []).every((e) => {
        const path = existsSync(join(dir, 'run', e)) ? join(dir, 'run', e) : join(REPO, e)
        return statSync(path).isFile()
      })
    )
  } catch {
    return false
  }
}

/** @returns {string | null} an earlier finished run of this layer and areas on the same snapshot, if any. */
function cachedRun(layer, areas, snapshot) {
  if (!process.env.QA_ARTIFACT_ROOT || process.env.QA_NO_CACHE === '1') return null
  const root = join(process.env.QA_ARTIFACT_ROOT, 'acceptance')
  if (!existsSync(root)) return null
  const key = `${layer}${areas.length > 0 ? `-${areas.join('+')}` : ''}`
  const dirs = readdirSync(root)
    .filter((n) => n.startsWith(`${key}-2`))
    .sort()
    .reverse()
  for (const n of dirs) {
    const dir = join(root, n)
    try {
      const done = readTextSync(join(dir, 'snapshot.txt')).trim()
      if (done === snapshot && completeRun(dir)) return dir
    } catch {}
  }
  return null
}

/**
 * Run a layer's standalone entry; save exit code and streams next to the results.
 * @param {string} layer - static or unit.
 * @param {string[]} [areas] - `--area` values passed to the runner; none means the whole layer.
 * @returns {{out: string, status: number | null, results: object[], report: string}} what it produced.
 */
export function runLayer(layer, areas = []) {
  const snapshot = treeSnapshot()
  const cached = cachedRun(layer, areas, snapshot)
  if (cached) return readRun(cached)
  const out = artifactDir(`${layer}${areas.length > 0 ? `-${areas.join('+')}` : ''}`)
  const before = productStatus()
  const r = spawnSync(
    'node',
    [
      join(REPO, `tests/qa/layers/${layer}/run.mjs`),
      ...areas.flatMap((a) => ['--area', a]),
      '--target',
      'local',
      '--prove-red',
      '--out',
      join(out, 'run')
    ],
    {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, QA_ARTIFACT_ROOT: process.env.QA_ARTIFACT_ROOT ?? out }
    }
  )
  writeFileSync(join(out, 'exit-code.txt'), `${r.status}\n`)
  writeFileSync(join(out, 'stdout.txt'), r.stdout)
  writeFileSync(join(out, 'stderr.txt'), r.stderr)
  assert.equal(productStatus(), before, 'the runner changed the product tree')
  assert.ok(
    [0, 1, 3].includes(r.status),
    `exit ${r.status} (2 = contract error): ${r.stderr.slice(-800)}; see ${out}`
  )
  // The runner's output is a function of the snapshot, so it is reusable on an unchanged tree whether or not
  // the judging below passes; every reuse is judged again by readRun.
  if (treeSnapshot() === snapshot) writeFileSync(join(out, 'snapshot.txt'), `${snapshot}\n`)
  return readRun(out)
}

/** Read a finished run directory and check its exit code against its verdicts. */
function readRun(out) {
  const status = Number(readTextSync(join(out, 'exit-code.txt')).trim())
  const results = JSON.parse(readTextSync(join(out, 'run', 'results.json')))
  const report = readTextSync(join(out, 'run', 'report.md'))
  // The exit code must tell the truth about the verdicts; a product FAIL is kept, never turned into ENV.
  const verdicts = new Set(results.map((x) => x.verdict))
  const expected = verdicts.has('FAIL') ? 1 : [...verdicts].every((v) => v === 'PASS') ? 0 : 3
  assert.equal(status, expected, `exit ${status} disagrees with the verdicts ${[...verdicts]}`)
  return { out: join(out, 'run'), status, results, report }
}

/**
 * Checks every layer shares.
 * @param {{out: string, results: object[], report: string}} run - the run.
 * @param {object[]} cases - listCases({}) of the layer.
 */
export function checkCommon(run, cases) {
  const { out, results, report } = run
  assert.deepEqual(
    results.map((r) => r.id).sort(),
    cases.map((c) => c.id).sort(),
    'one result per listed case'
  )
  const count = (v) => results.filter((r) => r.verdict === v).length
  assert.match(
    report,
    new RegExp(
      `PASS ${count('PASS')}, FAIL ${count('FAIL')}, ENV ${count('ENV')}, PENDING ${count('PENDING')}`
    )
  )
  for (const r of results) {
    assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict), `${r.id}: ${r.verdict}`)
    // A FAIL is a product finding: it must name its evidence (the log with the first red).
    if (r.verdict === 'FAIL') assert.ok((r.evidence ?? []).length > 0, `${r.id}: FAIL carries evidence`)
    assert.ok(r.reason && r.reason.length > 3, `${r.id} states a reason`)
    for (const e of r.evidence ?? []) {
      const path = existsSync(join(out, e)) ? join(out, e) : join(REPO, e)
      assert.ok(existsSync(path) && statSync(path).isFile(), `${r.id}: evidence ${e} is a regular file`)
      if (r.verdict === 'FAIL' || r.verdict === 'ENV')
        assert.ok(statSync(path).size > 0, `${r.id}: evidence ${e} is not empty`)
    }
    // Every FAIL is a finding in the report: its id with its evidence path.
    if (r.verdict === 'FAIL')
      assert.ok(
        report.split('\n').some((l) => l.includes(`FAIL ${r.id}:`) && l.includes(r.evidence[0])),
        `${r.id}: the report lists the FAIL as a finding with its evidence path`
      )
    // Evidence index: every case with its verdict and its first evidence path, so a run can be audited from the log.
    console.log(
      `# ${r.verdict} ${r.id}: ${join(out, r.evidence?.[0] ?? '')} (results: ${join(out, 'results.json')})`
    )
    if (r.verdict === 'PASS') {
      assert.ok(
        r.redProof && ['commit', 'mutation'].includes(r.redProof.kind),
        `${r.id}: PASS carries a redProof`
      )
      assert.ok(existsSync(join(out, r.redProof.controlLog)), `${r.id}: control log exists`)
      for (const log of r.redProof.log.split(','))
        assert.ok(existsSync(join(out, log)), `${r.id}: red log ${log} exists`)
    } else assert.equal(r.redProof, null, `${r.id}: only a PASS holds a proof`)
  }
  assert.deepEqual(
    readdirSync(out).filter((n) => n.startsWith('scratch')),
    [],
    'no scratch overlay left behind'
  )
}

/**
 * Read a result's log with the TAP parser and compare its summary with what the runner recorded.
 * @param {string} out - the run directory.
 * @param {object} r - one result carrying `observed` and a log under `evidence`.
 * @param {(text: string) => object} parse - the TAP parser.
 */
export function checkObservedAgainstLog(out, r, parse) {
  if (!r.observed) return
  const log = (r.evidence ?? []).find((e) => e.endsWith('.log'))
  assert.ok(log !== undefined, `${r.id}: observed counts need the TAP log they were read from`)
  const text = readTextSync(join(out, log))
  const tap = parse(text)
  assert.ok(tap.valid, `${r.id}: its log is a complete, self-consistent TAP run (${tap.why})`)
  for (const k of ['tests', 'pass', 'fail', 'skipped', 'todo', 'cancelled'])
    assert.equal(r.observed[k], tap[k], `${r.id}: observed.${k} matches the TAP log`)
  // A second, independent count straight from the lines: every test point of the log, at any depth, against the summary.
  const points = text.split('\n').filter((l) => /^\s*(?:not ok|ok) \d+ - /.test(l)).length
  const summary = (k) => Number(new RegExp(`^# ${k} (\\d+)\\s*$`, 'm').exec(text)?.[1] ?? Number.NaN)
  assert.equal(
    points,
    summary('tests') + summary('suites'),
    `${r.id}: the log's test points agree with its summary`
  )
  assert.equal(r.observed.tests, summary('tests'), `${r.id}: observed.tests is the log's own summary`)
  // A third count by kind, straight from the lines and not from the runner's reader (flat form only).
  if (summary('suites') === 0) {
    const kinds = { pass: 0, fail: 0, skip: 0 }
    for (const l of text.split('\n')) {
      const m = /^\s*(not ok|ok) \d+ - (.*)$/.exec(l)
      if (m === null) continue
      if (/\s#\s*(?:SKIP|TODO)\b/i.test(m[2])) kinds.skip += 1
      else kinds[m[1] === 'ok' ? 'pass' : 'fail'] += 1
    }
    assert.equal(kinds.pass, r.observed.pass, `${r.id}: passing points of the log match observed.pass`)
    assert.equal(
      kinds.fail,
      r.observed.fail + r.observed.cancelled,
      `${r.id}: failing points of the log match observed.fail + cancelled`
    )
    assert.equal(
      kinds.skip,
      r.observed.skipped + r.observed.todo,
      `${r.id}: skip/todo points of the log match observed.skipped + todo`
    )
  }
}

/** The gates whose RED proof the static acceptance demands; a gate that is not one of these cannot stand in for it. */
export const STATIC_REQUIRED_GATES = ['plugin-identity', 'self-contained', 'interface-languages']

/**
 * Problems with the RED proof of one PASS result: a real mutation, an assertion-shaped red, a green control.
 * @param {object} r - one result.
 * @param {(rel: string) => string} readLog - reads a log named by the proof, relative to the run directory.
 * @param {object[]} mutations - the recorded mutations.
 * @returns {string[]} problems, empty when the proof stands.
 */
export function redProofProblems(r, readLog, mutations) {
  const problems = []
  if (!(r.redProof?.mutations?.length > 0)) return [`${r.id}: PASS without a red proof`]
  for (const proof of r.redProof.mutations) {
    const m = mutations.find((x) => x.id === proof.mutation)
    if (m === undefined) {
      problems.push(`${r.id}: the proof names an unrecorded mutation ${proof.mutation}`)
      continue
    }
    let log = ''
    try {
      log = readLog(proof.log)
    } catch (e) {
      problems.push(`${r.id}: red log unreadable: ${e.message}`)
      continue
    }
    for (const s of m.expect.output) if (!log.includes(s)) problems.push(`${r.id}: red log lacks "${s}"`)
    if (/ERR_MODULE_NOT_FOUND|Cannot find (module|package)/.test(log))
      problems.push(`${r.id}: the red is a load failure, not an assertion`)
    const f = proof.files?.[0]
    if (f === undefined || f.before === f.after) problems.push(`${r.id}: the mutation changed nothing`)
  }
  let control = ''
  try {
    control = readLog(r.redProof.controlLog)
  } catch {
    // an unreadable control log is not green
  }
  if (!/1 gate\(s\) passed/.test(control)) problems.push(`${r.id}: the control run is not green`)
  return problems
}

/**
 * Every required gate must itself be PASS with a valid RED proof; another gate's PASS never stands in for it, and a
 * FAIL, ENV, PENDING or missing result is a problem here (the product FAIL is still kept as a finding by the run).
 * @param {object[]} results - the run's results.
 * @param {(rel: string) => string} readLog - reads a log relative to the run directory.
 * @param {object[]} mutations - the recorded mutations.
 * @param {string[]} [gates] - the gate names that are required.
 * @returns {string[]} problems, empty when every required gate stands proven.
 */
export function requiredGateProblems(results, readLog, mutations, gates = STATIC_REQUIRED_GATES) {
  const problems = []
  for (const gate of gates) {
    const r = results.find((x) => x.id === `QA-STATIC-${gate}-happy`)
    if (r === undefined) problems.push(`${gate}: no result`)
    else if (r.verdict !== 'PASS') problems.push(`${gate}: ${r.verdict} (${r.reason})`)
    else problems.push(...redProofProblems(r, readLog, mutations))
  }
  return problems
}

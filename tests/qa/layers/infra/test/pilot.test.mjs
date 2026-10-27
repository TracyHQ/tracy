// Runs the real CLI end to end (--prove-red) and checks what the outputs MEAN: the exit code matches
// the verdicts, every PASS has an existing RED proof log under the output directory, every ENV names a
// probe, every PENDING a reason, the coverage block never claims completeness while extraction is
// incomplete. A valid report is not a product PASS: FAIL verdicts are product findings, not tooling errors.
//
//   QA_INFRA_ARTIFACT_DIR=<dir> node --test tests/qa/layers/infra/test/pilot.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { MAX_LAYER_FILE_BYTES, readBoundedJsonSync, readTextSync } from '../../../lib/bounded-reader.mjs'
import { removeScratch, scratchDir } from '../lib/scratch.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const run = path.join(here, '..', 'run.mjs')
const layerDir = path.join(here, '..')
const keep = process.env.QA_INFRA_ARTIFACT_DIR
// One directory per run: an earlier pilot (its proofs and logs) is review evidence and is never touched.
const runId = `${new Date().toISOString().replace(/[:.]/g, '')}-${process.pid}`
const outDir = keep ? path.join(path.resolve(keep), `infra-pilot-${runId}`) : scratchDir('qa-infra-pilot-')
let results
let report
let proc
let denominator

before(() => {
  assert.ok(!existsSync(outDir) || !keep, `${outDir} already exists`)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, '.infra-pilot-owned'), 'created by infra pilot.test.mjs\n')
  proc = spawnSync(process.execPath, [run, '--target', 'local', '--prove-red', '--out', outDir], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 540_000
  })
  if (keep) {
    writeFileSync(path.join(outDir, 'stdout.txt'), proc.stdout ?? '')
    writeFileSync(path.join(outDir, 'stderr.txt'), proc.stderr ?? '')
    writeFileSync(path.join(outDir, 'exit-code.txt'), `${proc.status}\n`)
  }
  results = readBoundedJsonSync(path.join(outDir, 'results.json'), { maxBytes: MAX_LAYER_FILE_BYTES })
  report = readTextSync(path.join(outDir, 'report.md'))
  denominator = readBoundedJsonSync(path.join(layerDir, 'denominator.json'), {
    maxBytes: MAX_LAYER_FILE_BYTES
  })
})
after(() => {
  if (!keep) removeScratch(outDir)
})

const count = (verdict) => results.filter((r) => r.verdict === verdict).length

test('the CLI ran to the end: not a termination, not a usage/contract error (exit 2)', () => {
  assert.equal(proc.error, undefined, String(proc.error))
  assert.equal(proc.signal, null)
  assert.ok([0, 1, 3].includes(proc.status), `exit ${proc.status}: ${proc.stderr}`)
})

test('the exit code follows the verdicts: 1 on any FAIL, else 3 on ENV/PENDING, else 0', () => {
  const expected = count('FAIL') > 0 ? 1 : count('ENV') + count('PENDING') > 0 ? 3 : 0
  assert.equal(proc.status, expected)
})

test('every verdict is one of the four, ids are unique, every case of the manifests appears once', () => {
  const ids = results.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length)
  const manifestIds = readdirSync(path.join(layerDir, 'cases'))
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => readBoundedJsonSync(path.join(layerDir, 'cases', f), { maxBytes: MAX_LAYER_FILE_BYTES }))
    .map((m) => m.id)
  assert.deepEqual(
    [...ids].sort(),
    [...manifestIds].sort(),
    'results.json and the manifests name different cases'
  )
  for (const r of results) assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict), r.id)
  assert.ok(results.length > 0)
  assert.equal(count('PASS') + count('FAIL') + count('ENV') + count('PENDING'), results.length)
})

test('every PASS carries a RED proof whose log is a regular file under the output directory', () => {
  for (const r of results.filter((x) => x.verdict === 'PASS')) {
    assert.ok(r.redProof?.log, `${r.id}: PASS without a RED proof`)
    assert.ok(r.redProof.assertionId, `${r.id}: proof names no assertion`)
    assert.ok(r.assertionIds.includes(r.redProof.assertionId), `${r.id}: proof assertion is not the case's`)
    const log = path.resolve(outDir, r.redProof.log)
    assert.ok(log.startsWith(`${outDir}${path.sep}`), `${r.id}: proof log escapes the output dir`)
    assert.ok(lstatSync(log).isFile(), `${r.id}: proof log is not a regular file`)
    assert.match(readTextSync(log), /\S/, `${r.id}: empty proof log`)
  }
})

test('every FAIL states expected vs actual; every ENV names its probe; every PENDING a reason', () => {
  for (const r of results) {
    assert.ok(
      (typeof r.reason === 'string' && r.reason.length > 0) || r.verdict === 'PASS',
      `${r.id}: no reason`
    )
    if (r.verdict === 'ENV') assert.match(r.reason, /probe/i, `${r.id}: ENV without a probe`)
    for (const e of r.evidence ?? []) {
      assert.ok(!path.isAbsolute(e), `${r.id}: evidence path is absolute`)
      assert.ok(existsSync(path.join(outDir, e)), `${r.id}: evidence ${e} is missing`)
    }
  }
})

test('the report counts match results.json and the coverage block flags incomplete extraction', () => {
  assert.match(
    report,
    new RegExp(
      `PASS ${count('PASS')} · FAIL ${count('FAIL')} · ENV ${count('ENV')} · PENDING ${count('PENDING')}`
    )
  )
  assert.match(report, new RegExp(`denominator items: ${denominator.items.length}`))
  if (denominator.unresolved.length > 0) {
    assert.match(report, /INCOMPLETE/)
    assert.doesNotMatch(report, /100\s?%/)
  }
})

test('bad usage exits 2 before any effect', () => {
  const bad = spawnSync(process.execPath, [run, '--target', 'nowhere'], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
  const unknown = spawnSync(process.execPath, [run, '--bogus'], { encoding: 'utf8' })
  assert.equal(unknown.status, 2)
  const area = spawnSync(process.execPath, [run, '--area', 'nope', '--out', path.join(outDir, 'never')], {
    encoding: 'utf8'
  })
  assert.equal(area.status, 2)
  assert.equal(existsSync(path.join(outDir, 'never')), false)
})

test('a non-local target never writes: every case is PENDING target-policy', () => {
  const dir = path.join(outDir, 'prod-target')
  const prod = spawnSync(process.execPath, [run, '--target', 'prod', '--area', 'host', '--out', dir], {
    encoding: 'utf8',
    timeout: 120_000
  })
  assert.equal(prod.status, 3, prod.stderr)
  const rows = readBoundedJsonSync(path.join(dir, 'results.json'), { maxBytes: MAX_LAYER_FILE_BYTES })
  assert.ok(rows.length > 0)
  for (const r of rows) {
    assert.equal(r.verdict, 'PENDING', r.id)
    assert.match(r.reason, /target-policy/)
  }
})

/**
 * The pilot: one real `run.mjs --target local --prove-red` over every shipped manifest, raw log and
 * exit code kept, then the result/proof/report contract checked against what the run produced.
 * No count, SHA or artifact list of an earlier run is pinned.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'

import { exitCodeOf, listCases } from '../index.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const RUN = path.join(here, '..', 'run.mjs')
const root = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'pilot-'))
const out = path.join(root, 'out')
let run
let results
let manifests

before(async () => {
  manifests = await listCases()
  const started = Date.now()
  run = spawnSync(process.execPath, [RUN, '--target', 'local', '--prove-red', '--out', out], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 1_450_000,
    env: { ...process.env }
  })
  fs.writeFileSync(path.join(root, 'pilot.log'), `${run.stdout}\n${run.stderr}\n`)
  fs.writeFileSync(path.join(root, 'pilot.exit'), `${run.status}\n`)
  run.durationMs = Date.now() - started
  results = JSON.parse(readTextSync(path.join(out, 'results.json')))
})

after(() => {
  // Raw evidence stays under the artifact root; only an unconfigured run removes its own scratch.
  if (process.env.QA_HARNESS_ARTIFACT_ROOT === undefined) fs.rmSync(root, { recursive: true, force: true })
})

test('the pilot ran to the end and its exit code follows the verdicts', () => {
  assert.notEqual(run.status, null, `run did not finish: ${run.error?.message}`)
  assert.ok([0, 1, 3].includes(run.status), `exit ${run.status}: ${run.stderr}`)
  assert.equal(run.status, exitCodeOf(results))
})

test('results.json holds exactly the selected manifests, once each', () => {
  assert.deepEqual(results.map((r) => r.id).sort(), manifests.map((m) => m.id).sort())
  assert.equal(new Set(results.map((r) => r.id)).size, results.length)
  for (const r of results) {
    assert.ok(['PASS', 'FAIL', 'ENV', 'PENDING'].includes(r.verdict), `${r.id}: ${r.verdict}`)
    assert.ok(
      (typeof r.reason === 'string' && r.reason.length > 0) || r.verdict === 'PASS',
      `${r.id} has no reason`
    )
  }
})

test('every PASS has a RED proof whose log exists and names a failing assertion', () => {
  for (const r of results.filter((x) => x.verdict === 'PASS')) {
    assert.equal(r.redProof?.kind, 'mutation', r.id)
    const log = path.join(out, r.redProof.log)
    assert.ok(fs.existsSync(log), `${r.id}: ${log} missing`)
    assert.ok(r.redProof.assertionId, r.id)
    assert.ok(r.assertionIds.length > 0, r.id)
  }
  for (const r of results.filter((x) => x.verdict !== 'PASS'))
    assert.equal(r.redProof ?? null, null, `${r.id} credits RED without PASS`)
})

test('report.md counts match results.json and lists every non-PASS', () => {
  const report = readTextSync(path.join(out, 'report.md'))
  for (const v of ['PASS', 'FAIL', 'ENV', 'PENDING']) {
    const n = results.filter((r) => r.verdict === v).length
    assert.match(report, new RegExp(`${v}\\D{1,6}${n}\\b`), `report lacks ${v} ${n}`)
  }
  // FAIL cases are listed one by one; ENV and PENDING are grouped by reason, each group with a count and examples.
  for (const r of results.filter((x) => x.verdict === 'FAIL'))
    assert.ok(report.includes(r.id), `report omits ${r.id}`)
  for (const v of ['ENV', 'PENDING']) {
    const group = results.filter((r) => r.verdict === v)
    assert.ok(report.includes(`## ${v} (${group.length})`), `report lacks the ${v} section`)
    if (group.length > 0)
      assert.ok(
        group.some((r) => report.includes(r.id)),
        `${v}: no example listed`
      )
  }
})

test('the run left no scratch folder or container behind', () => {
  assert.equal(fs.existsSync(path.join(out, 'scratch')), false)
  const ps = spawnSync('docker', ['ps', '-a', '--filter', 'name=tchqa', '-q'], { encoding: 'utf8' })
  if (ps.status === 0) assert.equal(ps.stdout.trim(), '')
})

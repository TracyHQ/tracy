/** The scratch preload, the report writer and the live-model catalogue. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, test } from 'node:test'

import { expandTo, generated } from '../generate.mjs'
import { coverageRun, writeReport } from '../report.mjs'
import { LIVE_PROMPTS, liveRecord } from '../live-model.mjs'
import { removeScratch } from '../runtime.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = path.join(here, '..', 'scratch-preload.mjs')
const base = fs.mkdtempSync(path.join(process.env.QA_HARNESS_ARTIFACT_ROOT ?? os.tmpdir(), 'misc-'))
after(() => fs.rmSync(base, { recursive: true, force: true }))

test('preload moves os.tmpdir() into the artifact root and leaves TMPDIR alone', () => {
  const root = path.join(base, 'artifact')
  fs.mkdirSync(root)
  const probe =
    "import { tmpdir } from 'node:os'; import os from 'node:os'; console.log(JSON.stringify([tmpdir(), os.tmpdir(), process.env.TMPDIR ?? null]))"
  const r = spawnSync(process.execPath, ['--import', PRELOAD, '--input-type=module', '-e', probe], {
    encoding: 'utf8',
    env: { ...process.env, QA_HARNESS_ARTIFACT_ROOT: root, TMPDIR: '/tmp/qa-socket-dir' }
  })
  assert.equal(r.status, 0, r.stderr)
  const [named, def, tmpdirEnv] = JSON.parse(r.stdout)
  assert.equal(named, fs.realpathSync(path.join(root, 'tmp')), 'the named import follows')
  assert.equal(def, named)
  assert.equal(tmpdirEnv, '/tmp/qa-socket-dir', 'TMPDIR itself is untouched (sockets keep their folder)')
})

test('preload does nothing without the variable', () => {
  const env = { ...process.env }
  delete env.QA_HARNESS_ARTIFACT_ROOT
  const r = spawnSync(
    process.execPath,
    ['--import', PRELOAD, '--input-type=module', '-e', "import os from 'node:os'; console.log(os.tmpdir())"],
    { encoding: 'utf8', env }
  )
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.stdout.trim(), os.tmpdir())
})

test('removeScratch refuses to delete outside the folder it was given', () => {
  const inside = path.join(base, 'a')
  fs.mkdirSync(inside)
  removeScratch(inside, base)
  assert.equal(fs.existsSync(inside), false)
  assert.throws(() => removeScratch(os.tmpdir(), base), /refusing to remove/)
  assert.throws(() => removeScratch(path.join(base, '..'), base), /refusing to remove/)
})

test('coverageRun counts a cell as holding only when every case of it PASSes', async () => {
  const results = [{ id: 'QA-HARNESS-fs-fence-read-file_path-happy-inside', verdict: 'PASS' }]
  const dir = path.join(base, 'expanded')
  expandTo(dir, (await generated()).files)
  assert.equal(
    coverageRun(results, path.join(dir, 'absent.json')),
    null,
    'no generated coverage → no figures'
  )
  const cov = coverageRun(results, path.join(dir, 'coverage.json'))
  assert.ok(cov.cells.covered > cov.cells.allPass, 'cases that were not run do not count as holding')
  assert.ok(cov.cells.notRun > 0)
})

test('writeReport lists seams and every non-PASS reason, and never prints a percentage', () => {
  const out = path.join(base, 'report')
  fs.mkdirSync(out)
  const results = [
    {
      id: 'QA-HARNESS-a',
      verdict: 'FAIL',
      reason: 'denied-1: escaped',
      assertionIds: ['x'],
      evidence: ['evidence/a.json'],
      durationMs: 1,
      redProof: null
    },
    {
      id: 'QA-HARNESS-b',
      verdict: 'ENV',
      reason: 'probe failed',
      assertionIds: ['x'],
      evidence: [],
      durationMs: 1,
      redProof: null
    },
    {
      id: 'QA-HARNESS-c',
      verdict: 'PENDING',
      reason: 'no RED proof: x',
      assertionIds: ['x'],
      evidence: [],
      durationMs: 1,
      redProof: null
    }
  ]
  writeReport({
    out,
    results,
    manifests: results,
    detail: new Map(),
    target: 'local',
    proveRed: true,
    liveModel: false,
    durationMs: 1000,
    missing: []
  })
  const text = readTextSync(path.join(out, 'report.md'))
  assert.match(text, /PASS 0  ·  FAIL 1  ·  ENV 1  ·  PENDING 1/)
  assert.match(text, /QA-HARNESS-a.*denied-1: escaped.*evidence\/a\.json/)
  assert.match(text, /docker: a stand-in CLI/)
  assert.doesNotMatch(text, /\d\s*%/)
})

test('the live-model prompts cover the three scenario kinds and the record carries what the brief asks', () => {
  assert.deepEqual(Object.keys(LIVE_PROMPTS).sort(), ['content-edit', 'file-edit', 'out-of-bounds'])
  const record = liveRecord({
    provider: 'p',
    model: 'm',
    prompt: 'x',
    attempts: 2,
    latencyMs: 5,
    tokens: { in: 1, out: 2 }
  })
  assert.deepEqual(Object.keys(record).sort(), [
    'attempts',
    'judged',
    'latencyMs',
    'model',
    'prompt',
    'provider',
    'tokens'
  ])
  assert.equal(record.judged, 'effects-and-canaries-only')
})

test('writeReport names every ENV and PENDING id with its evidence, not three examples', () => {
  const out = path.join(base, 'report-all')
  fs.mkdirSync(out)
  const results = Array.from({ length: 8 }, (_, i) => ({
    id: `QA-HARNESS-p${i}`,
    verdict: i < 5 ? 'PENDING' : 'ENV',
    reason: i < 5 ? 'same pending reason' : 'same env probe',
    assertionIds: ['x'],
    evidence: [`evidence/p${i}.json`],
    durationMs: 1,
    redProof: null
  }))
  writeReport({
    out,
    results,
    manifests: results.map((r) => ({ id: r.id })),
    detail: new Map(),
    target: 'local',
    proveRed: true,
    liveModel: false,
    durationMs: 1,
    missing: []
  })
  const report = readTextSync(path.join(out, 'report.md'))
  for (const r of results) {
    assert.ok(report.includes(`\`${r.id}\``), `${r.id} listed`)
    assert.ok(report.includes(r.evidence[0]), `${r.id} evidence listed`)
  }
})

test('a loopback that cannot be bound is an ENV probe result, and a half-booted runtime rolls back', async () => {
  const { createRuntime, EnvProbeError, probeRuntime } = await import('../runtime.mjs')
  if (probeRuntime().length > 0) return
  const http = await import('node:http')
  const real = http.Server.prototype.listen
  const env0 = { ...process.env }
  const err0 = console.error
  const root = fs.mkdtempSync(path.join(base, 'boot-'))
  http.Server.prototype.listen = function refuse() {
    queueMicrotask(() => this.emit('error', Object.assign(new Error('nope'), { code: 'EPERM' })))
    return this
  }
  try {
    await assert.rejects(
      createRuntime({ root }),
      (e) => e instanceof EnvProbeError && /EPERM/.test(e.message)
    )
  } finally {
    http.Server.prototype.listen = real
  }
  assert.equal(console.error, err0)
  assert.equal(process.env.TRACY_SITES_ROOT, env0.TRACY_SITES_ROOT)
  assert.equal(process.env.MCP_TRACY_ORIGIN, env0.MCP_TRACY_ORIGIN)
  // A throw after the environment was changed leaves nothing changed.
  await assert.rejects(
    createRuntime({
      root: fs.mkdtempSync(path.join(base, 'boot2-')),
      productDirs: { subprocessDocker: path.join(base, 'nowhere') }
    })
  )
  assert.equal(console.error, err0)
  assert.equal(process.env.TRACY_SITES_ROOT, env0.TRACY_SITES_ROOT)
  assert.equal(process.env.DSH_HOME, env0.DSH_HOME)
})

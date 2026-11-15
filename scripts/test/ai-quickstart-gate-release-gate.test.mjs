// The release gate as one run (ticket #586) on the invented florist kit and a site in memory: every phase in its
// order, the record with the six measurements, its page and the kit's verdict file; no reset hook leaves the
// measurements that need a fresh site `not_run` and the verdict failed; a phase that throws is `incomplete` with its
// reason while the later phases still run.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { floristGate, groups, overflow } from './fixtures/ai-quickstart-gate/florist-gate.mjs'
import { recordScanner } from '../ai-quickstart/gate/gate-inputs.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { pinnedGitleaks } from '../ai-quickstart/gate/secret-gitleaks.mjs'
import { stoppedRecord } from '../ai-quickstart/gate/release-gate-record.mjs'
import { verdictFromRecord } from '../ai-quickstart/gate/record-verdict.mjs'
import { RECORD_FILE, releaseProblems, VERDICT_FILE } from '../ai-quickstart/gate/release-binding.mjs'

const PHASES = [
  'secrets',
  'human control',
  'marker test',
  'structure full',
  'quality',
  'structure hidden',
  'structure minimum',
  'write safety'
]
test('every phase runs in its order and the record holds the six measurements, its page and the verdict file', async () => {
  const s = floristGate()
  try {
    const { record, verdictFile, phases } = await releaseGate(s.input)
    assert.deepEqual(
      phases.map((p) => p.phase),
      PHASES
    )
    assert.deepEqual(s.order, ['secrets', 'control', 'render', 'quality'])
    assert.ok(phases.every((p) => typeof p.seconds === 'number'))
    for (const name of ['markerTest', 'demoScan', 'writeSafety', 'structure', 'quality', 'secrets'])
      assert.ok(record.measurements[name]?.status, name)
    assert.equal(
      record.measurements.writeSafety.status,
      'passed',
      JSON.stringify(record.measurements.writeSafety.findings?.slice(0, 3))
    )
    assert.equal(record.measurements.structure.linkCheck.status, 'passed')
    assert.equal(record.measurements.structure.minItems.status, 'passed')
    assert.equal(record.measurements.structure.hidden.status, 'passed')
    assert.equal(record.measurements.quality.status, 'passed')
    assert.equal(record.measurements.quality.seo.status, 'passed')
    // The files: the record, its page, and the verdict file bound to the record's own text.
    const written = JSON.parse(readFileSync(path.join(s.out, RECORD_FILE), 'utf8'))
    assert.deepEqual(written.verdict, record.verdict)
    assert.deepEqual(JSON.parse(readFileSync(path.join(s.out, VERDICT_FILE), 'utf8')), verdictFile)
    assert.match(readFileSync(path.join(s.out, 'record.html'), 'utf8'), /Write safety/)
    assert.doesNotMatch(readFileSync(path.join(s.out, 'record.json'), 'utf8'), /florist\.example/)
    // A kit that ships this check record beside its own files may be released.
    const kitRoot = mkdtempSync(path.join(tmpdir(), 'release-gate-kit-'))
    const kitDir = path.join(kitRoot, 'example-petal', 'j6', '1.0.0')
    mkdirSync(kitDir, { recursive: true })
    writeFileSync(path.join(kitDir, 'mapping.json'), '{}')
    cpSync(path.join(s.out, 'check-record'), path.join(kitDir, 'check-record'), { recursive: true })
    const problems = releaseProblems(kitDir, {})
    rmSync(kitRoot, { recursive: true, force: true })
    assert.equal(
      problems.some((p) => p.code === 'record_changed'),
      false
    )
    assert.equal(record.measurements.markerTest.status, 'passed')
    assert.equal(record.verdict.pass, true, JSON.stringify(record.verdict.failing))
    assert.equal(verdictFile.verdict.pass, true)
    assert.deepEqual(problems, [])
  } finally {
    s.done()
  }
})

test('a quality regression and a missing SEO item fail the quality measurement and the verdict', async () => {
  const s = floristGate({ quality: groups([overflow('.hero h1'), overflow('.card p')]) })
  try {
    const { record } = await releaseGate(s.input)
    const q = record.measurements.quality
    assert.equal(q.status, 'failed')
    assert.deepEqual(
      q.regressions.map((r) => r.selector),
      ['.card p']
    )
    assert.deepEqual(
      q.sameAsTemplate.map((r) => r.selector),
      ['.hero h1']
    )
    assert.ok(record.verdict.failing.includes('quality'))
    assert.equal(record.verdict.pass, false)
  } finally {
    s.done()
  }
})

test('with no reset hook the minimum variant and write safety are not_run and the verdict fails', async () => {
  const s = floristGate({ reset: false })
  try {
    const { record } = await releaseGate(s.input)
    assert.equal(record.measurements.writeSafety.status, 'not_run')
    assert.equal(record.measurements.structure.minItems.status, 'not_run')
    assert.equal(record.measurements.structure.minItems.reason, 'no_reset_hook')
    assert.equal(record.measurements.structure.status, 'incomplete')
    assert.ok(record.verdict.notRun.includes('writeSafety'))
    assert.ok(record.verdict.failing.includes('writeSafety'))
    assert.ok(record.verdict.failing.includes('structure'))
    assert.equal(record.verdict.pass, false)
    assert.equal(s.site.counts.resets, 0)
  } finally {
    s.done()
  }
})

test('a phase that throws is incomplete with its reason, and the later phases still run', async () => {
  const s = floristGate()
  s.input.secrets = async () => {
    throw Object.assign(new Error('gitleaks went away'), { code: 'scan_crashed' })
  }
  s.input.quality = async () => {
    throw new Error('no browser')
  }
  try {
    const { record, phases } = await releaseGate(s.input)
    assert.deepEqual(
      phases.map((p) => p.phase),
      PHASES
    )
    assert.equal(record.measurements.secrets.status, 'incomplete')
    assert.equal(record.measurements.secrets.reason, 'scan_crashed')
    assert.equal(record.measurements.quality.status, 'incomplete')
    assert.match(record.measurements.quality.message, /no browser/)
    assert.equal(record.measurements.writeSafety.status, 'passed')
    assert.equal(record.verdict.pass, false)
  } finally {
    s.done()
  }
})

test('a marker write that throws leaves a record that fails on the marker test, with the other phases run', async () => {
  const s = floristGate({
    write: async () => {
      throw Object.assign(new Error('the build stopped'), { code: 'under_page_position_not_detail' })
    }
  })
  try {
    const { record, phases } = await releaseGate(s.input)
    assert.equal(phases.find((p) => p.phase === 'marker test').status, 'incomplete')
    assert.equal(record.measurements.markerTest.status, 'incomplete')
    assert.equal(record.measurements.markerTest.reason, 'under_page_position_not_detail')
    assert.equal(record.measurements.structure.linkCheck.status, 'incomplete')
    assert.equal(record.measurements.quality.status, 'incomplete')
    assert.equal(record.schema, 'tracy-ai-quickstart-check-record/v2')
    assert.equal(record.verdict.pass, false)
    assert.ok(record.verdict.failing.includes('write'))
  } finally {
    s.done()
  }
})

test('a secret in the record files fails the secret scan before they are written', async () => {
  const s = floristGate()
  s.input.scanRecord = (files) =>
    files.some((f) => f.name.endsWith('record.json'))
      ? [{ file: 'check-record/record.json', at: '/x', rule: 'jwt', fingerprint: 'abcdefabcdef' }]
      : []
  try {
    const { record } = await releaseGate(s.input)
    assert.equal(record.measurements.secrets.status, 'failed')
    assert.deepEqual(
      record.measurements.secrets.findings.map((f) => f.rule),
      ['jwt']
    )
  } finally {
    s.done()
  }
})

test('S1: the record written is byte for byte the one last scanned, and a scan without gitleaks never passes', async () => {
  const s = floristGate()
  const seen = []
  s.input.scanRecord = async (files) => {
    seen.push(files)
    return { findings: [], gitleaks: { status: 'ran' } }
  }
  try {
    const { record } = await releaseGate(s.input)
    const last = seen.at(-1)
    assert.equal(record.measurements.secrets.status, 'passed')
    assert.equal(
      last.find((f) => f.name === 'check-record/record.json').text,
      readFileSync(path.join(s.out, RECORD_FILE), 'utf8')
    )
    assert.equal(
      last.find((f) => f.name === 'check-record/record.html').text,
      readFileSync(path.join(s.out, 'record.html'), 'utf8')
    )
    assert.deepEqual(record.measurements.secrets.recordScan, { files: 2, findings: 0, gitleaks: 'ran' })
  } finally {
    s.done()
  }
  const blind = floristGate()
  blind.input.scanRecord = async () => ({
    findings: [],
    gitleaks: { status: 'not_available', reason: 'no binary' }
  })
  try {
    const { record } = await releaseGate(blind.input)
    assert.equal(record.measurements.secrets.status, 'incomplete')
    assert.equal(record.measurements.secrets.reason, 'record_gitleaks_not_run')
    assert.equal(record.verdict.pass, false)
  } finally {
    blind.done()
  }
  const none = floristGate()
  delete none.input.scanRecord
  try {
    const { record } = await releaseGate(none.input)
    assert.equal(record.measurements.secrets.reason, 'record_not_scanned')
  } finally {
    none.done()
  }
})

test('S6: crops that throw still leave the record and the verdict file written, the crops phase incomplete', async () => {
  const s = floristGate()
  s.input.decorate = async () => {
    throw Object.assign(new Error('no browser for the crops'), { code: 'crops_failed' })
  }
  try {
    const { record, phases } = await releaseGate(s.input)
    assert.deepEqual(phases.at(-1), { phase: 'crops', status: 'incomplete', seconds: phases.at(-1).seconds })
    assert.ok(existsSync(path.join(s.out, RECORD_FILE)))
    assert.ok(existsSync(path.join(s.out, VERDICT_FILE)))
    assert.ok(existsSync(path.join(s.out, 'record.html')))
    assert.equal(record.verdict.pass, true)
  } finally {
    s.done()
  }
})

test('S6: a run that stops before its phases still leaves a failing record, every measurement incomplete', () => {
  const error = Object.assign(new Error('the blank site step stopped'), { code: 'blank_site_failed' })
  const record = stoppedRecord({ startedAt: '2026-01-01T00:00:00.000Z', stage: 'blank site', error })
  assert.equal(record.verdict.pass, false)
  for (const name of ['markerTest', 'demoScan', 'writeSafety', 'structure', 'quality', 'secrets']) {
    assert.equal(record.measurements[name].status, 'incomplete', name)
    assert.equal(record.measurements[name].code, 'blank_site_failed', name)
  }
  assert.equal(verdictFromRecord(record).pass, false)
})

const shaOf = (t) => createHash('sha256').update(t).digest('hex')

test('the record the gate writes holds nothing the pinned gitleaks reads as a secret', async (t) => {
  if (!pinnedGitleaks().bin) return t.skip('the pinned gitleaks is not on this machine')
  const s = floristGate({
    inputs: {
      // Real hashes: gitleaks judges a value by its entropy, and a repeated letter has none.
      humanQuickstart: { sha256: shaOf('invented human installer') },
      blankSite: { sha256: shaOf('invented blank site') },
      secretAllow: { file: 'check-record/secret-allow.json', sha256: shaOf('[]\n') }
    }
  })
  s.input.scanRecord = recordScanner({ cms: 'joomla' })
  try {
    const { record } = await releaseGate(s.input)
    assert.deepEqual(record.measurements.secrets.recordScan, { files: 2, findings: 0, gitleaks: 'ran' })
  } finally {
    s.done()
  }
})

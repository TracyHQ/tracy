// A check record the release guard must refuse although its verdict and its hashes are all worked out again (ticket
// #586, review round 2): a failing record whose statuses and a few fields are set to pass, then its verdict, verdict
// file and kit hash recomputed; a record of another kit; a check record folder that holds a file the gate never writes
// or is a link to another folder. The guard re-derives every count the verdict depends on from the record's own lists,
// and refuses a measurement that says `passed` with less detail than a real run gives. The record is one the gate
// really made on the invented florist kit (`fixtures/ai-quickstart-gate/florist-gate.mjs`).
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { kitFilesSha256, kitHashesOf } from '../ai-quickstart/gate/record.mjs'
import { verdictFromRecord } from '../ai-quickstart/gate/record-verdict.mjs'
import {
  RECORD_FILE,
  VERDICT_FILE,
  recordText,
  releaseProblems,
  verdictFileOf
} from '../ai-quickstart/gate/release-binding.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { floristGate, HUMAN_SHA } from './fixtures/ai-quickstart-gate/florist-gate.mjs'

const PINS = { plugin: '1.0.0', humanQuickstartSha256: HUMAN_SHA }
const BLANK = 'b'.repeat(64)

/** The record the gate makes on the florist kit, with or without its reset hook (without, it fails). */
async function gateRecord(options = {}) {
  const s = floristGate({
    inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: HUMAN_SHA } },
    ...options
  })
  s.input.out = null
  try {
    return (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
}

/** A kit folder named as the florist kit's reference, its files, and the record and verdict file given. */
function kitOf(record, { verdict = verdictFileOf(record) } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'forged-record-'))
  const folder = path.join(root, 'example-petal', 'j6', '1.0.0')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  writeFileSync(path.join(folder, 'mapping.json'), '{"template":{"slug":"example-petal"}}\n')
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdict, null, 1))
  return { root, folder }
}

/** Bind a record to the kit folder and write it with the verdict its own contents give. */
function bindAndWrite(folder, record) {
  record.kitFiles = kitHashesOf(folder)
  record.binding.kitFilesSha256 = kitFilesSha256(record.kitFiles)
  record.verdict = { ...record.verdict, ...verdictFromRecord(record) }
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFileOf(record), null, 1))
}

/** The reviewer's forge: about fifteen fields of a failing record set to what a pass would hold. */
function forge(r) {
  r.write.site = { status: 'done', counts: null, code: null, message: null }
  r.markerTest.findings = []
  r.markerTest.notSeen = r.markerTest.notSeen.map((n) => ({ ...n, declared: true }))
  r.universe.unexplained = 0
  r.demoScan.findings = []
  r.demoScan.html = []
  const m = r.measurements
  m.writeSafety = { ticket: 586, status: 'passed', places: { tested: 1, probed: 1 }, findings: [] }
  for (const k of ['linkCheck', 'minItems', 'hidden']) m.structure[k] = { status: 'passed' }
  m.structure.status = 'passed'
  m.quality = { ticket: 586, status: 'passed', regressions: [], seo: { blocking: [] } }
  return r
}

const codes = (folder) => releaseProblems(folder, { pins: PINS }).map((p) => p.code)

test('the honest passing record of a kit folder named as its reference is released', async () => {
  const record = await gateRecord()
  assert.equal(record.verdict.pass, true, JSON.stringify(record.verdict.failing))
  const k = kitOf(record)
  bindAndWrite(k.folder, record)
  assert.deepEqual(codes(k.folder), [])
  rmSync(k.root, { recursive: true, force: true })
})

test('R1: a failing record forged field by field to pass, verdict and hashes recomputed, is refused', async () => {
  const failing = await gateRecord({ reset: false })
  assert.equal(failing.verdict.pass, false)
  const k = kitOf(failing)
  const forged = forge(structuredClone(failing))
  bindAndWrite(k.folder, forged)
  assert.equal(forged.verdict.pass, true, 'the forged record gives a pass from its statuses')
  const problems = releaseProblems(k.folder, { pins: PINS })
  const found = problems.map((p) => p.code)
  assert.ok(found.includes('measurement_inconsistent'), JSON.stringify(problems))
  assert.ok(found.includes('record_inconsistent'), JSON.stringify(problems))
  const said = problems.map((p) => p.message).join('\n')
  assert.match(said, /writeSafety/)
  assert.match(said, /structure/)
  assert.match(said, /quality/)
  assert.match(said, /site write/)
  assert.match(said, /not seen/)
  rmSync(k.root, { recursive: true, force: true })
})

test('R1: a passing record whose counts disagree with its own lists is refused', async () => {
  const honest = await gateRecord()
  const k = kitOf(honest)
  const cases = [
    ['writeSafety tested', (r) => (r.measurements.writeSafety.places.tested += 1)],
    ['writeSafety ledger', (r) => (r.measurements.writeSafety.ledger = [])],
    ['linkCheck pages', (r) => (r.measurements.structure.linkCheck.pages = 0)],
    ['hidden count', (r) => (r.measurements.structure.hidden.hidden = 0)],
    ['quality groups', (r) => delete r.measurements.quality.byGroup['text-overflow']],
    ['universe count', (r) => (r.universe.written += 1)],
    ['write counts', (r) => (r.write.site.counts = null)]
  ]
  for (const [name, edit] of cases) {
    const r = structuredClone(honest)
    edit(r)
    bindAndWrite(k.folder, r)
    const found = codes(k.folder)
    assert.ok(
      found.includes('measurement_inconsistent') || found.includes('record_inconsistent'),
      name + ': ' + JSON.stringify(found)
    )
  }
  rmSync(k.root, { recursive: true, force: true })
})

test('R1: a record of another kit is refused, whatever its verdict says', async () => {
  const r = await gateRecord()
  r.binding.kitRef = 'example-orchid/j6@1.0.0'
  r.kit = 'example-orchid/j6@1.0.0'
  const k = kitOf(r)
  bindAndWrite(k.folder, r)
  assert.ok(codes(k.folder).includes('kit_ref_mismatch'))
  rmSync(k.root, { recursive: true, force: true })
})

test('T5: a file the gate never writes in check-record, or a check-record that is a link, is refused', async () => {
  const r = await gateRecord()
  const k = kitOf(r)
  bindAndWrite(k.folder, r)
  writeFileSync(path.join(k.folder, 'check-record', 'extra.js'), 'payload\n')
  assert.ok(codes(k.folder).includes('check_record_unknown_file'))
  rmSync(path.join(k.folder, 'check-record', 'extra.js'))
  assert.deepEqual(codes(k.folder), [])
  const elsewhere = path.join(k.root, 'elsewhere')
  cpSync(path.join(k.folder, 'check-record'), elsewhere, { recursive: true })
  rmSync(path.join(k.folder, 'check-record'), { recursive: true })
  symlinkSync(elsewhere, path.join(k.folder, 'check-record'))
  assert.ok(codes(k.folder).includes('check_record_link'))
  rmSync(k.root, { recursive: true, force: true })
})

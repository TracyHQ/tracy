// The record binds the probe catalogue write safety ran (ticket #586, review 7 S7): a real run of a gate whose catalogue
// was cut to one probe writes a true record of a weaker gate, and the release checks refuse it because its catalogue
// is not the gate's own. The record is one the gate really made on the invented florist kit.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { GATE_PROBES, probeCatalogueSha256 } from '../ai-quickstart/gate/gate-probes.mjs'
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

async function kitWith(probes) {
  const s = floristGate({
    inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: HUMAN_SHA } },
    reset: true
  })
  s.input.out = null
  s.input.probes = probes
  let record
  try {
    record = (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
  const root = mkdtempSync(path.join(tmpdir(), 'release-catalogue-'))
  const folder = path.join(root, 'example-petal', 'j6', '1.0.0')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  writeFileSync(path.join(folder, 'mapping.json'), '{"template":{"slug":"example-petal"}}\n')
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  record.kitFiles = kitHashesOf(folder)
  record.binding.kitFilesSha256 = kitFilesSha256(record.kitFiles)
  record.verdict = { ...record.verdict, ...verdictFromRecord(record) }
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFileOf(record), null, 1))
  return { root, folder, record }
}

test('S7: the catalogue hash changes with any probe, and a record binds the catalogue that ran', async () => {
  const one = GATE_PROBES.filter((p) => p.id === 'other-scripts')
  assert.notEqual(probeCatalogueSha256(one), probeCatalogueSha256(GATE_PROBES))
  const edited = GATE_PROBES.map((p) => (p.id === 'tag' ? { ...p, text: () => '<b>' } : p))
  assert.notEqual(
    probeCatalogueSha256(edited),
    probeCatalogueSha256(GATE_PROBES),
    'a probe whose text changed'
  )
  const full = await kitWith(GATE_PROBES)
  assert.equal(full.record.binding.probeCatalogueSha256, probeCatalogueSha256(GATE_PROBES))
  const codes = releaseProblems(full.folder, { pins: PINS, blankSiteSha: BLANK }).map((p) => p.code)
  assert.ok(!codes.includes('probe_catalogue_changed'), codes.join(', '))
  rmSync(full.root, { recursive: true, force: true })
})

test('S7: a true record of a gate with one probe is refused for its catalogue', async () => {
  const weak = await kitWith(GATE_PROBES.filter((p) => p.id === 'other-scripts'))
  const codes = releaseProblems(weak.folder, { pins: PINS, blankSiteSha: BLANK }).map((p) => p.code)
  assert.ok(codes.includes('probe_catalogue_changed'), codes.join(', '))
  rmSync(weak.root, { recursive: true, force: true })
})

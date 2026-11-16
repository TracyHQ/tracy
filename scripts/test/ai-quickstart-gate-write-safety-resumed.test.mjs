// A resumed write safety never says it passed, and the guard knows it by more than one field (ticket #586, review 4
// X5). The invented florist gate: a clean run saves its state; a run on a site that answers an error on one probe
// resumes that state. Its record does not say write safety passed; with `resumedFrom` deleted and the verdict file
// recomputed, the guard still refuses it: the passes carried from the state say so, and so does their time.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { kitFilesSha256, kitHashesOf } from '../ai-quickstart/gate/record.mjs'
import { verdictFromRecord } from '../ai-quickstart/gate/record-verdict.mjs'
import * as B from '../ai-quickstart/gate/release-binding.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { memoryState } from '../ai-quickstart/gate/write-safety-state.mjs'
import { writeFloristFolder } from './fixtures/ai-quickstart-gate/florist-folder.mjs'
import { floristGate, HUMAN_SHA } from './fixtures/ai-quickstart-gate/florist-gate.mjs'
// The build writes a content plugin code with a word joiner after its brace (#597): the faults below match the code
// in either form, so they still meet the one probe that carries it.

const inputs = { blankSite: { sha256: 'b'.repeat(64) }, humanQuickstart: { sha256: HUMAN_SHA } }
const run = async (faults, state) => {
  const s = floristGate({ inputs, faults })
  s.input.out = null
  if (state) s.input.writeSafetyState = state
  try {
    return (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
}
const BAD = {
  door: (call) =>
    call.kind === 'module' &&
    call.fields?.title === 'hero-home' &&
    /\{\u2060?loadposition/.test(String(call.fields.params))
      ? 'server_error'
      : null
}

test('X5: a resumed write safety is not passed in its own record, and the guard refuses it without resumedFrom', async () => {
  const state = memoryState()
  const clean = await run({}, state)
  assert.equal(clean.measurements.writeSafety.status, 'passed')
  const r = await run(BAD, state)
  const ws = r.measurements.writeSafety
  assert.notEqual(ws.status, 'passed')
  assert.equal(ws.incomplete, 'resumed')
  assert.equal(r.verdict.pass, false)
  // A forger deletes the one field and calls it passed, then recomputes the verdict file.
  delete ws.resumedFrom
  ws.status = 'passed'
  delete ws.incomplete
  const dir = mkdtempSync(path.join(tmpdir(), 'gate-resumed-'))
  try {
    const folder = writeFloristFolder(dir)
    writeFileSync(path.join(folder, B.RECORD_FILE), '{}')
    r.binding.allowFileSha256 = B.allowShaOf(folder)
    r.kitFiles = kitHashesOf(folder)
    r.binding.kitFilesSha256 = kitFilesSha256(r.kitFiles)
    r.verdict = { ...r.verdict, ...verdictFromRecord(r) }
    writeFileSync(path.join(folder, B.RECORD_FILE), B.recordText(r))
    writeFileSync(path.join(folder, B.VERDICT_FILE), JSON.stringify(B.verdictFileOf(r), null, 1))
    const codes = B.releaseProblems(folder, {
      pins: { plugin: '1.0.0', humanQuickstartSha256: HUMAN_SHA },
      blankSiteSha: 'b'.repeat(64)
    }).map((p) => p.code)
    assert.ok(codes.includes('write_safety_resumed'), codes.join(', '))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

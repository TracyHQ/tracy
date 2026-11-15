// The release refusal of the gate (ticket #586): a check record is bound to the kit it measured (gate version, kit
// files, the two archives, the plugin at both ends, the controls, the secret allow file) and a kit is released only
// with a fresh passing verdict that its own record gives. The record is one the gate really made, on the invented
// florist kit and a memory site (`fixtures/ai-quickstart-gate/florist-gate.mjs`); every pin and hash is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { GATE_VERSION, kitFilesSha256, kitHashesOf } from '../ai-quickstart/gate/record.mjs'
import { verdictFromRecord } from '../ai-quickstart/gate/record-verdict.mjs'
import {
  ALLOW_FILE,
  RECORD_FILE,
  VERDICT_FILE,
  bindingOf,
  recordText,
  releaseProblems,
  verdictFileOf
} from '../ai-quickstart/gate/release-binding.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { assertReleasable } from '../ai-quickstart/gate/release-guard.mjs'
import { writeFloristFolder } from './fixtures/ai-quickstart-gate/florist-folder.mjs'
import { floristGate, HUMAN_SHA } from './fixtures/ai-quickstart-gate/florist-gate.mjs'

const GUARD = fileURLToPath(new URL('../ai-quickstart/gate/release-guard.mjs', import.meta.url))
const PINS = { plugin: '1.0.0', humanQuickstartSha256: HUMAN_SHA }
const BLANK = 'b'.repeat(64)
const FILES = {
  'mapping.json': '{"template":{"slug":"example-petal"}}\n',
  'block-store.json': '{"blocks":{}}\n'
}
const sha = (t) => createHash('sha256').update(t).digest('hex')
const HASHES = Object.fromEntries(Object.entries(FILES).map(([n, t]) => [n, sha(t)]))

let made
/** The record the gate makes on the florist kit, once for the file. */
async function gateRecord() {
  if (made) return structuredClone(made)
  const s = floristGate({
    kitHashes: HASHES,
    inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: HUMAN_SHA } }
  })
  s.input.out = null
  try {
    made = (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
  return structuredClone(made)
}

/** Write a record and the verdict file it gives (or the one given) into a kit folder. */
function writeCheck(folder, record, verdictFile = verdictFileOf(record)) {
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFile, null, 1))
}

/** An invented kit folder `example-petal/j6/1.0.0` with the gate's record of it, changed by `edit`, and its verdict file. */
async function kitWith(edit = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'kit-release-'))
  const folder = path.join(root, 'example-petal', 'j6', '1.0.0')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  for (const [n, t] of Object.entries(FILES)) writeFileSync(path.join(folder, n), t)
  const record = await gateRecord()
  edit(record)
  writeCheck(folder, record)
  return { root, folder, record }
}
/** A record whose secrets measurement failed, with the verdict its contents give: what the gate writes then. */
const failedSecrets = (r) => {
  r.measurements.secrets = {
    ...r.measurements.secrets,
    status: 'failed',
    findings: [{ rule: 'jwt', file: 'x' }]
  }
  r.verdict = { ...r.verdict, ...verdictFromRecord(r) }
}
const codes = (folder, options = { pins: PINS }) => releaseProblems(folder, options).map((p) => p.code)
const done = (...kits) => {
  for (const k of kits) rmSync(k.root, { recursive: true, force: true })
}

test('the record the gate made passes, and the binding names everything it was measured on', async () => {
  const k = await kitWith()
  assert.equal(k.record.verdict.pass, true, JSON.stringify(k.record.verdict.failing))
  assert.deepEqual(codes(k.folder), [])
  const b = bindingOf(k.record)
  assert.equal(b.gateVersion, GATE_VERSION)
  assert.equal(b.kitFilesSha256, kitFilesSha256(kitHashesOf(k.folder)))
  assert.equal(b.blankSiteSha256, BLANK)
  assert.equal(b.humanQuickstartSha256, HUMAN_SHA)
  assert.equal(b.controls.human.from, 'measured_in_run')
  assert.equal(b.controls.quality.humanQuickstartSha256, HUMAN_SHA)
  assert.equal(b.allowFileSha256, null)
  assert.match(b.recordSha256, /^[0-9a-f]{64}$/)
  assert.doesNotThrow(() => assertReleasable(k.folder, { pins: { ...PINS, version: '1.0.0' } }))
  done(k)
})

test('M1: a verdict file alone is refused; so is a hand-made passing verdict beside a record that failed', async () => {
  const k = await kitWith()
  rmSync(path.join(k.folder, RECORD_FILE))
  assert.deepEqual(codes(k.folder), ['no_record'])
  rmSync(path.join(k.folder, VERDICT_FILE))
  assert.deepEqual(codes(k.folder), ['no_verdict'])
  const failed = await kitWith(failedSecrets)
  assert.deepEqual(codes(failed.folder), ['not_passed'])
  // The verdict file forged to pass, beside the failing record it names by hash.
  const forged = verdictFileOf(failed.record)
  forged.verdict = { pass: true, failing: [], measurements: {} }
  writeCheck(failed.folder, failed.record, forged)
  assert.deepEqual(codes(failed.folder), ['verdict_not_from_record'])
  // The record's own verdict forged too: its contents still give a failure.
  const lie = structuredClone(failed.record)
  lie.verdict = { ...lie.verdict, pass: true, failing: [] }
  writeCheck(failed.folder, lie)
  assert.deepEqual(codes(failed.folder), ['record_verdict_wrong'])
  // A status forged to passed while the measurement holds the secret: the status itself is checked.
  const status = structuredClone(failed.record)
  status.measurements.secrets.status = 'passed'
  status.verdict = { ...status.verdict, ...verdictFromRecord(status) }
  writeCheck(failed.folder, status)
  assert.deepEqual(codes(failed.folder), ['measurement_inconsistent'])
  done(k, failed)
})

test('M7: a control the gate did not make for this installer is refused', async () => {
  const none = await kitWith((r) => {
    r.binding.controls.human = null
  })
  assert.deepEqual(codes(none.folder), ['control_unbound'])
  const other = await kitWith((r) => {
    r.binding.controls.quality = { ...r.binding.controls.quality, humanQuickstartSha256: 'c'.repeat(64) }
  })
  assert.deepEqual(codes(other.folder), ['control_unbound'])
  const file = await kitWith((r) => {
    r.binding.controls.quality = { ...r.binding.controls.quality, from: 'file' }
  })
  assert.deepEqual(codes(file.folder), ['control_unbound'])
  done(none, other, file)
})

test('S2: the secret allow file is bound: one added or changed since the record is refused', async () => {
  const k = await kitWith()
  writeFileSync(path.join(k.folder, ALLOW_FILE), '[]\n')
  assert.deepEqual(codes(k.folder), ['allow_changed'])
  const bound = await kitWith((r) => {
    r.binding.allowFileSha256 = sha('[]\n')
  })
  writeFileSync(path.join(bound.folder, ALLOW_FILE), '[]\n')
  assert.deepEqual(codes(bound.folder), [])
  writeFileSync(path.join(bound.folder, ALLOW_FILE), '[{"rule":"jwt"}]\n')
  assert.deepEqual(codes(bound.folder), ['allow_changed'])
  done(k, bound)
})

test('a kit file changed since the record is refused and named; the check record folder holds only the gate files', async () => {
  const k = await kitWith()
  // The check record folder is not a kit file, but a file the gate never writes there is refused (review round 2, T5).
  writeFileSync(path.join(k.folder, 'check-record', 'notes.txt'), 'x\n')
  assert.deepEqual(codes(k.folder), ['check_record_unknown_file'])
  rmSync(path.join(k.folder, 'check-record', 'notes.txt'))
  assert.deepEqual(codes(k.folder), [])
  writeFileSync(path.join(k.folder, 'mapping.json'), '{"template":{"slug":"petal","version":"1.0.1"}}\n')
  const [p] = releaseProblems(k.folder, { pins: PINS })
  assert.equal(p.code, 'kit_changed')
  assert.match(p.message, /mapping\.json/)
  done(k)
})

test('another plugin, a plugin that moved, another human quickstart, another blank site or gate are refused', async () => {
  const moved = await kitWith((r) => {
    r.binding.plugin = { ...r.binding.plugin, end: '1.0.1' }
  })
  assert.deepEqual(codes(moved.folder), ['plugin_moved'])
  const k = await kitWith()
  assert.deepEqual(codes(k.folder, { pins: { ...PINS, plugin: '9.9.3' } }), ['plugin_not_pinned'])
  assert.deepEqual(codes(k.folder, { pins: { ...PINS, humanQuickstartSha256: 'c'.repeat(64) } }), [
    'human_quickstart_not_pinned'
  ])
  assert.deepEqual(codes(k.folder, { pins: PINS, blankSiteSha: 'd'.repeat(64) }), ['blank_site_changed'])
  assert.deepEqual(codes(k.folder, { pins: PINS, blankSiteSha: BLANK }), [])
  const old = await kitWith((r) => {
    r.binding.gateVersion = GATE_VERSION - 1
  })
  assert.ok(codes(old.folder).includes('gate_outdated'))
  done(moved, k, old)
})

test('a record that is not the one the verdict was written from is refused', async () => {
  const k = await kitWith()
  writeFileSync(path.join(k.folder, RECORD_FILE), recordText({ ...k.record, kit: 'other/j6@1.0.0' }))
  assert.deepEqual(codes(k.folder), ['record_changed', 'verdict_not_from_record', 'kit_ref_mismatch'])
  done(k)
})

test('the guard command exits 1 and lists every problem; 0 on a fresh passing kit', async () => {
  const k = await kitWith(failedSecrets)
  const pins = path.join(k.root, 'pins.json')
  writeFileSync(pins, JSON.stringify({ ...PINS, plugin: '9.9.3' }))
  const refused = spawnSync(process.execPath, [GUARD, k.folder, '--pins', pins], { encoding: 'utf8' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /not_passed/)
  assert.match(refused.stderr, /plugin_not_pinned/)
  assert.throws(
    () => assertReleasable(k.folder, { pins: PINS }),
    (e) => e.problems.length === 1
  )
  // The command also rebuilds the kit's own marker plan from the folder, so the passing kit is the whole florist kit.
  const ok = { root: mkdtempSync(path.join(tmpdir(), 'kit-release-')) }
  ok.folder = writeFloristFolder(ok.root)
  const record = await gateRecord()
  record.kitFiles = kitHashesOf(ok.folder)
  record.binding.kitFilesSha256 = kitFilesSha256(record.kitFiles)
  writeCheck(ok.folder, record)
  writeFileSync(pins, JSON.stringify(PINS))
  const passed = spawnSync(process.execPath, [GUARD, ok.folder, '--pins', pins], { encoding: 'utf8' })
  assert.equal(passed.status, 0, passed.stderr)
  done(k, ok)
})

// Review 5 Z8: the marker build reads the template kit (`contracts/<slug>/<cms>/<version>/template-kit.json`, beside the
// AI quickstarts folder) for its dark accent, so the record binds its sha256: one changed since the record is refused.
test('Z8: the template kit the marker build reads is bound: one changed since the record is refused', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'kit-release-'))
  const folder = path.join(root, 'ai-quickstarts', 'example-petal', 'j6', '1.0.0')
  const kitFile = path.join(root, 'contracts', 'example-petal', 'j6', '1.0.0', 'template-kit.json')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  mkdirSync(path.dirname(kitFile), { recursive: true })
  for (const [n, t] of Object.entries(FILES)) writeFileSync(path.join(folder, n), t)
  const grounds = '{"themes":[{"side":"dark","ground":"#101010"}]}\n'
  writeFileSync(kitFile, grounds)
  const record = await gateRecord()
  record.binding.templateKitSha256 = sha(grounds)
  writeCheck(folder, record)
  assert.deepEqual(codes(folder), [])
  writeFileSync(kitFile, '{"themes":[{"side":"dark","ground":"#202020"}]}\n')
  assert.deepEqual(codes(folder), ['template_kit_changed'])
  rmSync(kitFile)
  assert.deepEqual(codes(folder), ['template_kit_changed'])
  rmSync(root, { recursive: true, force: true })
})

// Review 5 Z5: this round changes what a record means (a probe found by its place's own value, a stop's suspects and
// location, the list excuse from the pages read, noindex, kept literals, the template kit bound), so a record of gate 6
// is no proof any more.
test('Z5: a record of gate version 6 is refused as outdated', async () => {
  assert.ok(GATE_VERSION >= 7)
  const old = await kitWith((r) => {
    r.binding.gateVersion = 6
  })
  assert.ok(codes(old.folder).includes('gate_outdated'))
  done(old)
})

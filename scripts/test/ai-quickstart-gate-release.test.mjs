// The release refusal of the gate (ticket #586): a check record is bound to the kit it measured (gate version, kit
// files, the two archives, the plugin at both ends) and a kit is released only with a fresh passing verdict. Run on an
// invented florist kit in a temporary folder; every pin and hash is invented.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { GATE_VERSION, kitFilesSha256, kitHashesOf, recordBinding } from '../ai-quickstart/gate/record.mjs'
import {
  RECORD_FILE,
  VERDICT_FILE,
  bindingOf,
  recordText,
  releaseProblems,
  verdictFileOf
} from '../ai-quickstart/gate/release-binding.mjs'
import { assertReleasable } from '../ai-quickstart/gate/release-guard.mjs'

const GUARD = fileURLToPath(new URL('../ai-quickstart/gate/release-guard.mjs', import.meta.url))
const PINS = { plugin: '9.9.1', humanQuickstartSha256: 'a'.repeat(64) }
const BLANK = 'b'.repeat(64)

/** An invented kit folder `petal/j6/1.0.0` with a record of it and its verdict file. */
function kitWith({
  pass = true,
  plugin = { start: '9.9.1', end: '9.9.1' },
  human = PINS.humanQuickstartSha256
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'kit-release-'))
  const folder = path.join(root, 'petal', 'j6', '1.0.0')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  writeFileSync(path.join(folder, 'mapping.json'), '{"template":{"slug":"petal"}}\n')
  writeFileSync(path.join(folder, 'block-store.json'), '{"blocks":{}}\n')
  const kitHashes = kitHashesOf(folder)
  const record = {
    schema: 'tracy-ai-quickstart-check-record/v2',
    kit: 'petal/j6@1.0.0',
    kitFiles: kitHashes,
    binding: recordBinding({
      kit: { ref: 'petal/j6@1.0.0' },
      kitHashes,
      inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: human } },
      plugin
    }),
    verdict: { pass, failing: pass ? [] : ['secrets'], measurements: { secrets: pass ? 'passed' : 'failed' } }
  }
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFileOf(record), null, 1))
  return { root, folder, record }
}
const codes = (folder, options = { pins: PINS }) => releaseProblems(folder, options).map((p) => p.code)

test('the kit hashes skip the check record folder, and their digest is over the sorted per-file hashes', () => {
  const { root, folder } = kitWith()
  const hashes = kitHashesOf(folder)
  assert.deepEqual(Object.keys(hashes), ['block-store.json', 'mapping.json'])
  assert.equal(
    kitFilesSha256(hashes),
    kitFilesSha256({ 'mapping.json': hashes['mapping.json'], 'block-store.json': hashes['block-store.json'] })
  )
  assert.equal(kitFilesSha256(null), null)
  rmSync(root, { recursive: true, force: true })
})

test('the binding names the gate version, the kit, both archives, the plugin and the record hash', () => {
  const { root, record } = kitWith()
  const b = bindingOf(record)
  assert.equal(b.gateVersion, GATE_VERSION)
  assert.equal(b.kitRef, 'petal/j6@1.0.0')
  assert.match(b.kitFilesSha256, /^[0-9a-f]{64}$/)
  assert.equal(b.blankSiteSha256, BLANK)
  assert.equal(b.humanQuickstartSha256, PINS.humanQuickstartSha256)
  assert.deepEqual([b.plugin.start, b.plugin.end], ['9.9.1', '9.9.1'])
  assert.match(b.recordSha256, /^[0-9a-f]{64}$/)
  const v = verdictFileOf(record)
  assert.equal(v.schema, 'tracy-ai-quickstart-check-verdict/v1')
  assert.equal(v.verdict.pass, true)
  rmSync(root, { recursive: true, force: true })
})

test('a fresh passing verdict releases; a missing or failed one is refused', () => {
  const fresh = kitWith()
  assert.deepEqual(codes(fresh.folder), [])
  assert.doesNotThrow(() => assertReleasable(fresh.folder, { pins: { ...PINS, version: '1.0.0' } }))
  rmSync(path.join(fresh.folder, VERDICT_FILE))
  assert.deepEqual(codes(fresh.folder), ['no_verdict'])
  const failed = kitWith({ pass: false })
  assert.deepEqual(codes(failed.folder), ['not_passed'])
  for (const k of [fresh, failed]) rmSync(k.root, { recursive: true, force: true })
})

test('a kit file changed since the record is refused and named; the check record folder is not a kit file', () => {
  const k = kitWith()
  writeFileSync(path.join(k.folder, 'check-record', 'secret-allow.json'), '[]\n')
  assert.deepEqual(codes(k.folder), [])
  writeFileSync(path.join(k.folder, 'mapping.json'), '{"template":{"slug":"petal","version":"1.0.1"}}\n')
  const [p] = releaseProblems(k.folder, { pins: PINS })
  assert.equal(p.code, 'kit_changed')
  assert.match(p.message, /mapping\.json/)
  rmSync(k.root, { recursive: true, force: true })
})

test('another plugin, a plugin that moved, another human quickstart, another blank site or gate are refused', () => {
  const moved = kitWith({ plugin: { start: '9.9.1', end: '9.9.2' } })
  assert.deepEqual(codes(moved.folder), ['plugin_moved'])
  const k = kitWith()
  assert.deepEqual(codes(k.folder, { pins: { ...PINS, plugin: '9.9.3' } }), ['plugin_not_pinned'])
  assert.deepEqual(codes(k.folder, { pins: { ...PINS, humanQuickstartSha256: 'c'.repeat(64) } }), [
    'human_quickstart_not_pinned'
  ])
  assert.deepEqual(codes(k.folder, { pins: PINS, blankSiteSha: 'd'.repeat(64) }), ['blank_site_changed'])
  assert.deepEqual(codes(k.folder, { pins: PINS, blankSiteSha: BLANK }), [])
  const old = { ...verdictFileOf(k.record), gateVersion: GATE_VERSION - 1 }
  writeFileSync(path.join(k.folder, VERDICT_FILE), JSON.stringify(old))
  assert.deepEqual(codes(k.folder), ['gate_outdated'])
  for (const x of [moved, k]) rmSync(x.root, { recursive: true, force: true })
})

test('a record that is not the one the verdict was written from is refused', () => {
  const k = kitWith()
  writeFileSync(path.join(k.folder, RECORD_FILE), recordText({ ...k.record, verdict: { pass: true } }))
  assert.deepEqual(codes(k.folder), ['record_changed'])
  rmSync(k.root, { recursive: true, force: true })
})

test('the guard command exits 1 and lists every problem; 0 on a fresh passing kit', () => {
  const k = kitWith({ pass: false })
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
  const ok = kitWith()
  writeFileSync(pins, JSON.stringify(PINS))
  assert.equal(spawnSync(process.execPath, [GUARD, ok.folder, '--pins', pins]).status, 0)
  for (const x of [k, ok]) rmSync(x.root, { recursive: true, force: true })
})

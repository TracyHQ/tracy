// The release step publishes a kit only on a check record it has verified against the blank site archive it is about
// to publish (ticket #586, review rounds 2 and 3): the step runs the gate itself and checks the record in the folder is
// the one that run wrote, and publishes nothing on any refusal; a call with no blank site archive hash is refused before anything is read. The
// record is one the gate really made on the invented florist kit.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { kitFilesSha256, kitHashesOf } from '../ai-quickstart/gate/record.mjs'
import { verdictFromRecord } from '../ai-quickstart/gate/record-verdict.mjs'
import {
  RECORD_FILE,
  VERDICT_FILE,
  recordText,
  verdictFileOf
} from '../ai-quickstart/gate/release-binding.mjs'
import { releaseGate } from '../ai-quickstart/gate/release-gate.mjs'
import { publishVerified } from '../ai-quickstart/gate/release-publish.mjs'
import { floristGate, HUMAN_SHA } from './fixtures/ai-quickstart-gate/florist-gate.mjs'

const PINS = { plugin: '1.0.0', humanQuickstartSha256: HUMAN_SHA }
const BLANK = 'b'.repeat(64)

async function kit({ reset = true } = {}) {
  const s = floristGate({
    inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: HUMAN_SHA } },
    reset
  })
  s.input.out = null
  let record
  try {
    record = (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
  const root = mkdtempSync(path.join(tmpdir(), 'release-publish-'))
  const folder = path.join(root, 'example-petal', 'j6', '1.0.0')
  mkdirSync(path.join(folder, 'check-record'), { recursive: true })
  writeFileSync(path.join(folder, 'mapping.json'), '{"template":{"slug":"example-petal"}}\n')
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  record.kitFiles = kitHashesOf(folder)
  record.binding.kitFilesSha256 = kitFilesSha256(record.kitFiles)
  record.verdict = { ...record.verdict, ...verdictFromRecord(record) }
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFileOf(record), null, 1))
  // The folder holds no kit to build: the plan is the record's own, so these cases test the other refusals.
  const plan = async () => ({
    places: record.places.map((p) => [p.key, p.account]),
    probed: record.measurements.writeSafety.placeKeys ?? []
  })
  return { root, folder, record, runGate: async () => ({ record }), plan }
}

const publisher = () => {
  const calls = []
  return { calls, publish: async (folder) => void calls.push(folder) }
}

test('R1: a verified passing kit is published once, for the blank site archive it was measured on', async () => {
  const k = await kit()
  const p = publisher()
  const result = await publishVerified({
    folder: k.folder,
    pins: PINS,
    blankSiteSha: BLANK,
    runGate: k.runGate,
    plan: k.plan,
    publish: p.publish
  })
  assert.deepEqual(result.problems, [])
  assert.equal(result.published, true)
  assert.deepEqual(p.calls, [k.folder])
  rmSync(k.root, { recursive: true, force: true })
})

test('R1: publish is never called on a refusal', async () => {
  const k = await kit()
  const failing = await kit({ reset: false })
  const run = { runGate: k.runGate, plan: k.plan }
  const cases = [
    { folder: k.folder, pins: PINS, blankSiteSha: null, ...run },
    { folder: k.folder, pins: PINS, blankSiteSha: 'c'.repeat(64), ...run },
    { folder: k.folder, pins: { ...PINS, plugin: '9.9.9' }, blankSiteSha: BLANK, ...run },
    { folder: failing.folder, pins: PINS, blankSiteSha: BLANK, runGate: failing.runGate, plan: failing.plan }
  ]
  for (const c of cases) {
    const p = publisher()
    const result = await publishVerified({ ...c, publish: p.publish })
    assert.equal(result.published, false, JSON.stringify(c.blankSiteSha))
    assert.ok(result.problems.length > 0)
    assert.deepEqual(p.calls, [])
  }
  const none = await publishVerified({ folder: k.folder, pins: PINS, publish: publisher().publish })
  assert.deepEqual(
    none.problems.map((x) => x.code),
    ['blank_site_unbound']
  )
  rmSync(k.root, { recursive: true, force: true })
  rmSync(failing.root, { recursive: true, force: true })
})

test('R1: the release step runs the gate itself first, and publishes only what it then verifies', async () => {
  const k = await kit()
  const order = []
  const p = publisher()
  const result = await publishVerified({
    folder: k.folder,
    pins: PINS,
    blankSiteSha: BLANK,
    plan: k.plan,
    runGate: async () => {
      order.push('gate')
      return { record: k.record }
    },
    publish: async (f) => {
      order.push('publish')
      await p.publish(f)
    }
  })
  assert.equal(result.published, true)
  assert.deepEqual(order, ['gate', 'publish'])
  const broken = publisher()
  const refused = await publishVerified({
    folder: k.folder,
    pins: PINS,
    blankSiteSha: BLANK,
    plan: k.plan,
    runGate: async () => {
      throw new Error('the gate stopped')
    },
    publish: broken.publish
  })
  assert.equal(refused.published, false)
  assert.deepEqual(
    refused.problems.map((x) => x.code),
    ['gate_failed']
  )
  assert.deepEqual(broken.calls, [])
  rmSync(k.root, { recursive: true, force: true })
})

// Review 7 S8: the folder is hashed before the checks and again right before publishing; a file changed while the
// plan was rebuilt (after the guard read the folder) is never published.
test('S8: a kit file changed during the checks is not published', async () => {
  const k = await kit()
  const p = publisher()
  const result = await publishVerified({
    folder: k.folder,
    pins: PINS,
    blankSiteSha: BLANK,
    runGate: k.runGate,
    plan: async (folder) => {
      writeFileSync(
        path.join(folder, 'mapping.json'),
        '{"template":{"slug":"example-petal"},"swapped":true}\n'
      )
      return k.plan()
    },
    publish: p.publish
  })
  assert.equal(result.published, false)
  assert.deepEqual(
    result.problems.map((x) => x.code),
    ['kit_changed_during_publish']
  )
  assert.deepEqual(p.calls, [])
  rmSync(k.root, { recursive: true, force: true })
})

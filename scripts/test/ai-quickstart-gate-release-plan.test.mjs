// The release path checks a record against the kit it ships in and against the run that wrote it (ticket #586, review
// round 3): a passing record of another kit, relabelled, is refused because the kit's own marker build gives other
// places (U1); the publish step must run the gate itself and publishes only the record that run wrote (U2); a record
// whose write safety resumed a saved state is refused (U5). The record is one the gate made on the invented florist
// kit; the kit is written as a folder so its plan is rebuilt from the files.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
import { planOfFolder, planProblems } from '../ai-quickstart/gate/release-plan.mjs'
import { publishVerified } from '../ai-quickstart/gate/release-publish.mjs'
import { floristGate, HUMAN_SHA } from './fixtures/ai-quickstart-gate/florist-gate.mjs'
import { FLORIST_ICONS, writeFloristFolder } from './fixtures/ai-quickstart-gate/florist-folder.mjs'

const PINS = { plugin: '1.0.0', humanQuickstartSha256: HUMAN_SHA }
const BLANK = 'b'.repeat(64)
const plan = (folder) => planOfFolder(folder, { iconLibrary: FLORIST_ICONS })

async function honestRecord() {
  const s = floristGate({ inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: HUMAN_SHA } } })
  s.input.out = null
  try {
    return (await releaseGate(s.input)).record
  } finally {
    s.done()
  }
}

/** Bind a record to a kit folder and write it with the verdict its own contents give. */
function bindAndWrite(folder, record) {
  writeFileSync(path.join(folder, RECORD_FILE), '{}')
  record.kitFiles = kitHashesOf(folder)
  record.binding.kitFilesSha256 = kitFilesSha256(record.kitFiles)
  record.verdict = { ...record.verdict, ...verdictFromRecord(record) }
  writeFileSync(path.join(folder, RECORD_FILE), recordText(record))
  writeFileSync(path.join(folder, VERDICT_FILE), JSON.stringify(verdictFileOf(record), null, 1))
  return record
}

/** Another kit under the same name: one block of the florist store is dropped. */
const another = (kit) => {
  const drop = kit.blockStore.blocks.find((b) => b.placement === 'copy' && kit.mapping.blocks[b.id])
  delete kit.mapping.blocks[drop.id]
  return kit
}

test('U1: the honest record matches the plan of its own kit folder', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'release-plan-'))
  const folder = writeFloristFolder(root)
  const record = bindAndWrite(folder, await honestRecord())
  assert.deepEqual(releaseProblems(folder, { pins: PINS, blankSiteSha: BLANK }), [])
  assert.deepEqual(planProblems(record, await plan(folder)), [])
  rmSync(root, { recursive: true, force: true })
})

test('U1: a passing record put into another kit folder of the same name is refused', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'release-plan-'))
  const folder = writeFloristFolder(root, another)
  const record = bindAndWrite(folder, await honestRecord())
  // Every hash and binding agrees: only the kit's own plan tells the record is not of this kit.
  assert.deepEqual(releaseProblems(folder, { pins: PINS, blankSiteSha: BLANK }), [])
  const problems = planProblems(record, await plan(folder))
  assert.ok(
    problems.some((p) => p.code === 'plan_mismatch'),
    JSON.stringify(problems)
  )
  const published = []
  const result = await publishVerified({
    folder,
    pins: PINS,
    blankSiteSha: BLANK,
    runGate: async () => ({ record }),
    plan,
    publish: async (f) => void published.push(f)
  })
  assert.equal(result.published, false)
  assert.ok(result.problems.some((p) => p.code === 'plan_mismatch'))
  assert.deepEqual(published, [])
  rmSync(root, { recursive: true, force: true })
})

test('U2: the publish step must run the gate, and publishes only the record that run wrote', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'release-plan-'))
  const folder = writeFloristFolder(root)
  const record = bindAndWrite(folder, await honestRecord())
  const calls = []
  const publish = async (f) => void calls.push(f)
  const none = await publishVerified({ folder, pins: PINS, blankSiteSha: BLANK, plan, publish })
  assert.deepEqual(
    none.problems.map((p) => p.code),
    ['gate_not_run']
  )
  // The gate ran, but the record in the folder is not the one it wrote.
  const other = structuredClone(record)
  other.startedAt = '2000-01-01T00:00:00.000Z'
  const stale = await publishVerified({
    folder,
    pins: PINS,
    blankSiteSha: BLANK,
    runGate: async () => ({ record: other }),
    plan,
    publish
  })
  assert.deepEqual(
    stale.problems.map((p) => p.code),
    ['record_not_this_run']
  )
  assert.deepEqual(calls, [])
  const ok = await publishVerified({
    folder,
    pins: PINS,
    blankSiteSha: BLANK,
    runGate: async () => ({ record }),
    plan,
    publish
  })
  assert.deepEqual(ok.problems, [])
  assert.deepEqual(calls, [folder])
  rmSync(root, { recursive: true, force: true })
})

test('U5: a record whose write safety resumed a saved state is refused', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'release-plan-'))
  const folder = writeFloristFolder(root)
  const record = await honestRecord()
  record.measurements.writeSafety.resumedFrom = 2
  bindAndWrite(folder, record)
  const codes = releaseProblems(folder, { pins: PINS, blankSiteSha: BLANK }).map((p) => p.code)
  assert.ok(codes.includes('write_safety_resumed'), JSON.stringify(codes))
  rmSync(root, { recursive: true, force: true })
})

test('U5: a saved write safety state is resumed only by the same gate and build code on the same site', async () => {
  const { memoryState } = await import('../ai-quickstart/gate/write-safety-state.mjs')
  const run = async (state, codeSha256, limits) => {
    const s = floristGate({
      inputs: { blankSite: { sha256: BLANK }, humanQuickstart: { sha256: HUMAN_SHA } }
    })
    s.input.out = null
    Object.assign(s.input, { writeSafetyState: state, codeSha256, limits })
    try {
      return (await releaseGate(s.input)).record.measurements.writeSafety
    } finally {
      s.done()
    }
  }
  const short = { passes: 2, steps: 20, minutes: 60, reruns: 5 }
  const one = memoryState()
  assert.equal((await run(one, 'a'.repeat(64), short)).incomplete, 'passes')
  const otherCode = await run(one, 'c'.repeat(64))
  assert.equal(otherCode.resumedFrom, undefined, 'a state of other code is not resumed')
  const two = memoryState()
  await run(two, 'a'.repeat(64), short)
  const sameCode = await run(two, 'a'.repeat(64))
  assert.equal(sameCode.resumedFrom, 2, 'the same code resumes')
})

test('X6: a record of another kit whose two place lists were redone is still refused by what it counts and holds', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'release-plan-'))
  const folder = writeFloristFolder(root, another)
  const record = await honestRecord()
  const kitPlan = await plan(folder)
  // The two lists the plan check read, redone from this kit's own plan; the rest of the record is the other kit's.
  record.places = kitPlan.places.map(([key, account]) => ({ key, account }))
  record.measurements.writeSafety.placeKeys = [...kitPlan.probed]
  bindAndWrite(folder, record)
  const problems = planProblems(record, kitPlan)
  assert.ok(
    problems.some((p) => p.code === 'plan_mismatch' && /universe/.test(p.message)),
    JSON.stringify(problems)
  )
  rmSync(root, { recursive: true, force: true })
})

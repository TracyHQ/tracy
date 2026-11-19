// The copy step's first draft on the plan's checked first draft (step-chain.js, steps.copyDraft): it starts while the
// planner fixes its plan, the copy step on the final plan takes it as its base copy, pictures never wait for it, and a
// draft that fails leaves the copy step as before. Steps are doubles: no database, no bench.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { SITE_WRITER_STEP, baseCopyOf } from '../src/site-writer/bench-worker.js'
import { fixRoundsOf } from '../src/lib/bench-run-loop.js'

const quiet = { info() {}, warn() {} }
const tick = () => new Promise((r) => setImmediate(r))

function doubles({ draftFails = false, noDraft = false } = {}) {
  const calls = []
  let finishPlan
  const planDone = new Promise((r) => (finishPlan = r))
  const steps = {
    kit: async () => ({ value: { ref: 'ja-boxing/j6/1.0.11' } }),
    brand: async () => ({ value: { file: 'brand.json' } }),
    plan: async (_ctx, { onDraft }) => {
      calls.push('plan:start')
      if (!noDraft) onDraft?.({ file: 'plan-draft.json' })
      await planDone
      calls.push('plan:end')
      return { value: { file: 'plan.json' } }
    },
    copyDraft: async (_ctx, { plan }) => {
      calls.push(`copyDraft:${plan.file}`)
      if (draftFails) throw new Error('the draft run could not start')
      return { file: 'copy-draft/site-copy.json', usd: 0.05 }
    },
    copy: async (_ctx, { plan, base }) => {
      calls.push(`copy:${plan.file}:${base?.file ?? 'no base'}`)
      return { value: { file: 'copy/site-copy.json' }, usd: 0.02 }
    },
    pictures: async (_ctx, { plan }) => {
      calls.push(`pictures:${plan.file}`)
      return { value: { file: 'pictures.json' }, usd: 0.1 }
    }
  }
  return { calls, steps, finishPlan }
}

async function prepared(d) {
  const chain = createStepChainEngine({
    steps: d.steps,
    applyFor: () => async () => ({ ok: true }),
    log: quiet
  })
  const ctx = { runId: 'r', siteKey: 's', signal: new AbortController().signal }
  const going = chain.prepare(ctx)
  await tick()
  await tick()
  d.finishPlan()
  return going
}

test("the copy step's first draft starts on the plan's draft, before the plan ends, and the final copy takes it as its base", async () => {
  const d = doubles()
  const out = await prepared(d)
  assert.ok(d.calls.indexOf('copyDraft:plan-draft.json') < d.calls.indexOf('plan:end'), d.calls.join(' '))
  assert.ok(d.calls.includes('copy:plan.json:copy-draft/site-copy.json'), d.calls.join(' '))
  assert.ok(d.calls.includes('pictures:plan.json'))
  assert.equal(out.inputs.copy.file, 'copy/site-copy.json')
})

test('a draft that fails leaves the copy step as before, and a plan with no draft never starts one', async () => {
  const failing = doubles({ draftFails: true })
  await prepared(failing)
  assert.ok(failing.calls.includes('copy:plan.json:no base'), failing.calls.join(' '))
  const none = doubles({ noDraft: true })
  await prepared(none)
  assert.equal(none.calls.filter((c) => c.startsWith('copyDraft')).length, 0)
  assert.ok(none.calls.includes('copy:plan.json:no base'))
})

test('a writer run on a base copy writes no turn and takes it as round 0; a run may ask for no fix round', () => {
  const base = { version: 'site-copy/1', slots: [{ slot: 'block-1.1', text: 'Hello' }] }
  const row = { harness: { baseCopy: base, parallelPages: 5 } }
  assert.equal(baseCopyOf(row), base)
  assert.equal(SITE_WRITER_STEP.nextTurn({ row, ready: { input: {} }, answers: [] }), null)
  assert.equal(SITE_WRITER_STEP.parts({ row, ready: { input: {} } }), null)
  assert.equal(SITE_WRITER_STEP.mergeTurns([], { row }), base)
  assert.equal(baseCopyOf({ harness: {} }), null)
  assert.equal(baseCopyOf({ harness: { baseCopy: { slots: 'x' } } }), null)
  assert.equal(fixRoundsOf(SITE_WRITER_STEP, { maxFixRounds: 0 }), 0)
  assert.equal(fixRoundsOf(SITE_WRITER_STEP, { maxFixRounds: 5 }), SITE_WRITER_STEP.maxFixRounds)
  assert.equal(fixRoundsOf(SITE_WRITER_STEP, {}), SITE_WRITER_STEP.maxFixRounds)
})

// Shared set-up of the site planner bench tests (ADR 0041, #301): the site planner door assigned to a test
// provider, and a run started on the invented Harbour Sport Club brief and the JA Boxing kit. The model is always the
// scripted fake of _agent-over-door-fake.mjs: no real model is called.
import assert from 'node:assert/strict'
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { startBenchRun } from '../src/site-planner/bench-control.js'
import { brief } from './_site-plan-check-inputs.mjs'

export const SECRET = 's'.repeat(32)
export const KIT_REF = 'ja-boxing/j6/1.0.10'
export const MODEL = 'anthropic/claude-opus-5.5'
export const API_KEY = 'sk-or-test-secret-key'

export async function assignPlannerDoor(pool, { enabled = true } = {}) {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: API_KEY, enabled },
    SECRET,
    'owner@tracy.test'
  )
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'owner@tracy.test')
}

/** Start a run and return it; fails the test when the start is refused. */
export async function startRun(pool, over = {}) {
  const started = await startBenchRun({
    pool,
    secret: SECRET,
    brief: brief(),
    briefSource: { kind: 'file', name: 'harbour-sport-club.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    ...over
  })
  assert.equal(started.ok, true, JSON.stringify(started))
  return started.run
}

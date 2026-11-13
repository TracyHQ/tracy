// Before any model work a chain build asks whether every model door it spends can be answered (ADR 0047, #591): the
// doors that cannot (unset, switched off) are named, so the engine stops the build up front. No database needed: the
// door book is a scripted pool.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStepChainSteps, STEP_CHAIN_MODEL_DOORS } from '../src/step-chain-steps.js'

/** A door book where each door named in `rows` has that `llm_assignment` row, and every other door is unset. */
const book = (rows) => ({
  async query(sql, params) {
    assert.match(sql, /from llm_assignment/)
    return { rows: rows[params[0]] ? [rows[params[0]]] : [] }
  }
})

test('every door of the chain is checked, and each one that cannot be answered is named with why', async () => {
  const steps = createStepChainSteps({
    config: {},
    secret: 's'.repeat(32),
    pool: book({ siteWriter: { enabled: false } }),
    log: {}
  })
  const empty = await steps.doors({})
  assert.deepEqual(
    empty.map((d) => d.door),
    [...STEP_CHAIN_MODEL_DOORS]
  )
  assert.deepEqual(
    empty.find((d) => d.door === 'siteWriter'),
    { door: 'siteWriter', state: 'disabled' }
  )
  assert.equal(empty.find((d) => d.door === 'sitePlanner').state, 'unassigned')
})

test('the optional picture icon ranker is not a door the chain stops on', () => {
  assert.ok(!STEP_CHAIN_MODEL_DOORS.includes('pictureIconRanker'))
  for (const door of ['brandAgent', 'brandReviewer', 'sitePlanner', 'siteWriter', 'pictureLooker'])
    assert.ok(STEP_CHAIN_MODEL_DOORS.includes(door), door)
})

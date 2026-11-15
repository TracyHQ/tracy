// The reading summary the research record keeps carries the reading's own warning (#609), for operators and logs.
// The reading step is a stand in that answers what the business reading step answers; nothing here calls a model.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/build-draft-reading-warning.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readingOf } from '../src/build-draft/gather-reading.js'

const partsOf = (reading) => ({
  readingInputOf: () => ({ ownerStatement: null, heldTexts: [], heldPeople: [] }),
  readBusiness: async () => reading,
  modelTokensOf: () => ({ prompt: 0, completion: 0 }),
  ownerStatementRecordOf: () => ({ ownerStatement: null }),
  BudgetExceededError: class extends Error {}
})
const read = (reading) =>
  readingOf({
    parts: partsOf(reading),
    readingDoor: async () => ({ state: 'ready' }),
    rows: [],
    profile: {},
    google: null,
    trade: null,
    capCents: 200,
    now: () => 0,
    log: { warn() {} }
  })

for (const warning of ['reasoning_not_off', 'answer_cut'])
  test(`the reading summary keeps the warning ${warning}`, async () => {
    const { record } = await read({ method: 'model', model: 'invented-model', warning })
    assert.equal(record.warning, warning)
    assert.equal(record.method, 'model')
  })

test('a reading with no warning leaves none in the summary', async () => {
  const { record } = await read({ method: 'model', model: 'invented-model' })
  assert.equal('warning' in record, false)
})

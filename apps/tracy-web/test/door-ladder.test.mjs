// The shared ladder of the model doors (lib/door-ladder.js), climbed by the finder door of step 9b (#448): an unset,
// disabled or unreadable door refuses with the finder's own codes, a model that cannot read pictures refuses, and a ready
// door calls its model at the finder's effort. A fake pool answers the one lookup query; no database is needed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FINDER_EFFORT,
  FINDER_MODEL,
  FINDER_PROVIDER,
  finderDoor
} from '../src/write-step/finder/finder-door.js'
import { effortsFor } from '../src/lib/bench-harness.js'
import { assignDoor } from '../src/lib/llm-store.js'
import { sealSecret } from '../src/lib/secret-box.js'
import { finalReply, scriptedModel } from './_agent-over-door-fake.mjs'

const WHERE = '/ops › Model & AI'
const pool = (rows) => ({ query: async () => ({ rows }) })
const SECRET = 's'.repeat(32)

test('the finder door refuses an unset, a disabled and an unreadable door, each with its code and what to do', async () => {
  assert.deepEqual(await finderDoor({ pool: pool([]), secret: SECRET }), {
    ok: false,
    code: 'FINDER_DOOR_UNSET',
    reason: `The "Finisher finder" door has no provider and model. Set it in ${WHERE} (it runs on deepseek-flash on the deepseek provider).`
  })
  assert.equal(
    (await finderDoor({ pool: pool([{ enabled: false }]), secret: SECRET })).code,
    'FINDER_DOOR_DISABLED'
  )
  assert.equal((await finderDoor({ pool: pool([]) })).code, 'FINDER_DOOR_UNREADABLE')
})

/** /ops as lookupDoor reads it: one ready door on DeepSeek's own API. */
const readyDoor = async ({ model = 'deepseek-flash', vision = true, effort = null } = {}) =>
  pool([
    {
      id: 'deepseek',
      enabled: true,
      preset_id: 'deepseek',
      base_url: 'https://api.deepseek.com',
      api_key_cipher: await sealSecret('test-key', SECRET),
      revision: 1,
      door_model: model,
      assignment_revision: 1,
      assignment_updated_at: new Date(0),
      reasoning_effort: effort,
      models: [{ id: model, vision }]
    }
  ])

test('a ready finder door calls its model once, at the finder effort, and records the effort it used', async () => {
  const model = scriptedModel([finalReply({ content: '{"faults":[]}' })])
  const door = await finderDoor({ pool: await readyDoor(), secret: SECRET, fetchImpl: model.fetchImpl })
  assert.equal(door.ok, true, door.reason)
  const said = await door.ask({ system: 'look', content: [{ type: 'text', text: 'Page /.' }] })
  assert.equal(said.text, '{"faults":[]}')
  assert.equal(model.requests.length, 1)
  assert.equal(model.requests[0].body.reasoning_effort, FINDER_EFFORT)
  assert.equal(door.snapshot.effortUsed, FINDER_EFFORT)
  assert.ok(effortsFor(FINDER_MODEL, FINDER_PROVIDER).includes(FINDER_EFFORT))
})

test('a finder door whose model cannot read pictures is refused before any call', async () => {
  const model = scriptedModel([])
  const door = await finderDoor({
    pool: await readyDoor({ vision: false }),
    secret: SECRET,
    fetchImpl: model.fetchImpl
  })
  assert.equal(door.code, 'FINDER_DOOR_NO_IMAGES')
  assert.match(door.reason, /cannot read pictures, and the finder looks at page screenshots/)
  assert.equal(model.requests.length, 0)
})

test('the finder effort is a door setting: a saved effort is the one sent, and one the model does not take is refused', async () => {
  const model = scriptedModel([finalReply({ content: '{"faults":[]}' })])
  const door = await finderDoor({
    pool: await readyDoor({ effort: 'high' }),
    secret: SECRET,
    fetchImpl: model.fetchImpl
  })
  assert.equal(door.ok, true, door.reason)
  await door.ask({ system: 'look', content: [{ type: 'text', text: 'Page /.' }] })
  assert.equal(model.requests[0].body.reasoning_effort, 'high')
  assert.equal(door.snapshot.effortUsed, 'high')
  const refused = await finderDoor({ pool: await readyDoor({ effort: 'medium' }), secret: SECRET })
  assert.equal(refused.code, 'FINDER_DOOR_EFFORT_UNSUPPORTED')
  assert.match(refused.reason, /does not take effort medium; it takes low, high, max/)
})

test('/ops saves a finder effort only when the door model takes it, and no effort keeps the finder default', async () => {
  const saved = []
  const book = { query: async (sql, params) => (saved.push(params), { rows: [] }) }
  const pick = (effort) =>
    assignDoor(book, 'finisherFinder', { providerId: 'deepseek', model: FINDER_MODEL, effort }, 'ops')
  assert.deepEqual(await pick('medium'), {
    error: 'MODEL_EFFORT_UNSUPPORTED',
    supported: ['low', 'high', 'max'],
    mode: 'selectable'
  })
  assert.equal(saved.length, 0, 'a refused effort writes nothing')
  assert.deepEqual(await pick('low'), { error: null })
  assert.equal(saved.at(-1)[4], 'low')
  assert.deepEqual(await pick(undefined), { error: null })
  assert.equal(saved.at(-1)[4], null, `no effort saved: the door thinks at ${FINDER_EFFORT}`)
  const other = await assignDoor(
    book,
    'finisherFinder',
    { providerId: 'other', model: 'some-vision-model', effort: 'high' },
    'ops'
  )
  assert.equal(
    other.error,
    'MODEL_EFFORT_UNSUPPORTED',
    'a model whose efforts are not known takes no effort setting'
  )
})

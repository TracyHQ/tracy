// The shared ladder of the model doors (lib/door-ladder.js): the picture looker's, the picture drawer's and the finisher's
// doors refuse an unset, disabled or unreadable door with their own codes, and the looker's wording is what it was before
// the ladder was shared. A fake pool answers the one lookup query; no database is needed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pictureDrawerDoor } from '../src/site-pictures/drawer-door.js'
import { pictureLookerDoor } from '../src/site-pictures/looker-door.js'
import {
  FINISHER_MODEL,
  FINISHER_PROVIDER,
  FINISHER_ROLES,
  finisherDoor
} from '../src/write-step/finisher/finisher-doors.js'
import { effortsFor } from '../src/lib/bench-harness.js'
import { sealSecret } from '../src/lib/secret-box.js'
import { finalReply, scriptedModel } from './_agent-over-door-fake.mjs'

const WHERE = '/ops › Model & AI'
const pool = (rows) => ({ query: async () => ({ rows }) })
const UNASSIGNED = pool([])
const DISABLED = pool([{ enabled: false }])

test('the looker door keeps its codes and words on every rung of the ladder', async () => {
  assert.deepEqual(await pictureLookerDoor({ pool: UNASSIGNED, secret: 's' }), {
    ok: false,
    code: 'SITE_PICTURES_LOOKER_UNSET',
    reason: `The "Picture looker" door has no provider and model. Set it in ${WHERE} (the looker runs on openai/gpt-6-luna).`
  })
  assert.deepEqual(await pictureLookerDoor({ pool: DISABLED, secret: 's' }), {
    ok: false,
    code: 'SITE_PICTURES_LOOKER_DISABLED',
    reason: `The provider of the "Picture looker" door is switched off. Turn it on, or pick another provider in ${WHERE}.`
  })
  assert.deepEqual(await pictureLookerDoor({ pool: UNASSIGNED }), {
    ok: false,
    code: 'SITE_PICTURES_LOOKER_UNREADABLE',
    reason: `The key of the "Picture looker" door's provider cannot be opened (empty, or sealed with another secret). Save the key again in ${WHERE}.`
  })
})

test('the drawer door climbs the same ladder under its own codes', async () => {
  assert.equal(
    (await pictureDrawerDoor({ pool: UNASSIGNED, secret: 's' })).code,
    'SITE_PICTURES_DRAWER_UNSET'
  )
  assert.equal(
    (await pictureDrawerDoor({ pool: DISABLED, secret: 's' })).code,
    'SITE_PICTURES_DRAWER_DISABLED'
  )
  assert.equal((await pictureDrawerDoor({ pool: UNASSIGNED })).code, 'SITE_PICTURES_DRAWER_UNREADABLE')
})

test('a finisher door climbs the same ladder and names its role', async () => {
  const unset = await finisherDoor({ pool: UNASSIGNED, secret: 's', role: 'checker' })
  assert.equal(unset.code, 'FINISHER_DOOR_UNSET')
  assert.match(unset.reason, /"Finisher checker" door has no provider and model.*deepseek-flash/)
  assert.equal(
    (await finisherDoor({ pool: DISABLED, secret: 's', role: 'fixer' })).code,
    'FINISHER_DOOR_DISABLED'
  )
  assert.equal((await finisherDoor({ pool: UNASSIGNED, role: 'finder' })).code, 'FINISHER_DOOR_UNREADABLE')
})

/** /ops as lookupDoor reads it: one ready DeepSeek Flash door on DeepSeek's own API, its effort as set (null: none set). */
const readyDoor = async (effort) => ({
  query: async () => ({
    rows: [
      {
        id: 'deepseek',
        enabled: true,
        preset_id: 'deepseek',
        base_url: 'https://api.deepseek.com',
        api_key_cipher: await sealSecret('test-key', SECRET),
        revision: 1,
        door_model: 'deepseek-flash',
        assignment_revision: 1,
        assignment_updated_at: new Date(0),
        reasoning_effort: effort,
        models: [{ id: 'deepseek-flash', vision: true }]
      }
    ]
  })
})
const SECRET = 's'.repeat(32)

/** The reasoning effort one call of a finisher role sent to the model, with the door's effort as /ops holds it. */
async function effortSent(role, effort) {
  const model = scriptedModel([finalReply({ content: '{"faults":[]}' })])
  const door = await finisherDoor({
    pool: await readyDoor(effort),
    secret: SECRET,
    role,
    fetchImpl: model.fetchImpl
  })
  assert.equal(door.ok, true, door.reason)
  await door.ask({ system: 'look', content: [{ type: 'text', text: 'Page /.' }] })
  return { sent: model.requests[0].body.reasoning_effort, recorded: door.snapshot.effortUsed }
}

test('each finisher role calls its model at its own effort: finder max, fixer high, checker low by default', async () => {
  assert.deepEqual(await effortSent('finder', null), { sent: 'max', recorded: 'max' })
  // The product owner chose medium for the fixer; DeepSeek takes low, high and max only, so the nearest level is high.
  assert.deepEqual(await effortSent('fixer', null), { sent: 'high', recorded: 'high' })
  assert.deepEqual(await effortSent('checker', null), { sent: 'low', recorded: 'low' })
})

test("a finisher door's effort set in /ops wins over its role's default", async () => {
  assert.deepEqual(await effortSent('fixer', 'high'), { sent: 'high', recorded: 'high' })
  assert.deepEqual(await effortSent('finder', 'low'), { sent: 'low', recorded: 'low' })
})

test("a finisher door's effort its model does not take is refused before any call, with the levels it takes", async () => {
  const model = scriptedModel([])
  const door = await finisherDoor({
    pool: await readyDoor('medium'),
    secret: SECRET,
    role: 'fixer',
    fetchImpl: model.fetchImpl
  })
  assert.equal(door.ok, false)
  assert.equal(door.code, 'FINISHER_DOOR_EFFORT_UNSUPPORTED')
  assert.match(
    door.reason,
    /"Finisher fixer" door asks deepseek-flash for effort medium; it takes low, high, max/
  )
  assert.equal(model.requests.length, 0)
})

test('every finisher role default is an effort its default model takes', async () => {
  for (const role of Object.keys(FINISHER_ROLES))
    assert.ok(
      effortsFor(FINISHER_MODEL, FINISHER_PROVIDER).includes(FINISHER_ROLES[role].effort),
      `${role}: ${FINISHER_ROLES[role].effort}`
    )
})

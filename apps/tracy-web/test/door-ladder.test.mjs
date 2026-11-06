// The shared ladder of the model doors (lib/door-ladder.js): the picture looker's, the picture drawer's and the finisher's
// doors refuse an unset, disabled or unreadable door with their own codes, and the looker's wording is what it was before
// the ladder was shared. A fake pool answers the one lookup query; no database is needed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pictureDrawerDoor } from '../src/site-pictures/drawer-door.js'
import { pictureLookerDoor } from '../src/site-pictures/looker-door.js'
import { finisherDoor } from '../src/write-step/finisher/finisher-doors.js'

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

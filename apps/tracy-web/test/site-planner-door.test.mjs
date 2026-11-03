// The site planner door (ADR 0041, #301): a door of its own that needs tools and vision, and a resolver that refuses
// an unset, disabled or unreadable door with its reason instead of falling back to the environment.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { doorEntry, LLM_DOORS } from '../src/lib/llm-catalog.js'
import { assignDoor, readAssignments, saveModels, saveProvider } from '../src/lib/llm-store.js'
import { SITE_PLANNER_DOOR, sitePlannerDoor } from '../src/site-planner/door.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)
const MODEL = 'anthropic/claude-opus-5.5'

test('the catalogue has a site planner door that needs tools and vision', () => {
  const door = doorEntry(SITE_PLANNER_DOOR)
  assert.equal(SITE_PLANNER_DOOR, 'sitePlanner')
  assert.equal(door.label, 'Site planner')
  assert.equal(door.where, 'this process')
  assert.equal(door.needsModel, true)
  assert.deepEqual(door.requires, ['tools', 'vision'])
  assert.equal(door.configurableEffort, undefined)
})

test('the WO doors are unchanged by the new door', () => {
  assert.deepEqual(
    LLM_DOORS.map((d) => d.id),
    ['web', 'assistant', 'seedText', 'woEditorial', 'vision', 'seedImage', 'agent', 'sitePlanner']
  )
  const wo = doorEntry('woEditorial')
  assert.deepEqual(
    { requires: wo.requires, prefers: wo.prefers, configurableEffort: wo.configurableEffort },
    { requires: ['reasoning'], prefers: ['json'], configurableEffort: true }
  )
  const vision = doorEntry('vision')
  assert.deepEqual(
    { requires: vision.requires, prefers: vision.prefers },
    { requires: ['vision'], prefers: ['json'] }
  )
})

async function openRouter(pool, { enabled = true, models } = {}) {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-or-test', enabled },
    SECRET,
    'owner@tracy.test'
  )
  if (models) await saveModels(pool, 'openrouter', models)
}

test('the door can be assigned, takes no effort, and is listed with every other door', opts, async () => {
  const { pool } = db
  await openRouter(pool)
  assert.deepEqual(
    await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL, effort: 'high' }, 'me'),
    { error: 'DOOR_EFFORT_UNSUPPORTED' }
  )
  assert.deepEqual(await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'me'), {
    error: null
  })
  const all = await readAssignments(pool)
  assert.equal(all.sitePlanner.model, MODEL)
  assert.equal(all.sitePlanner.providerId, 'openrouter')
})

test('an unset door refuses with its reason, even when the environment has a model key', opts, async () => {
  const { pool } = db
  const saved = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'sk-env'
  try {
    const found = await sitePlannerDoor({ pool, secret: SECRET })
    assert.equal(found.ok, false)
    assert.equal(found.code, 'SITE_PLANNER_DOOR_UNSET')
    assert.match(found.reason, /Site planner/)
    assert.match(found.reason, /Model & AI/)
  } finally {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = saved
  }
})

test('a door whose provider is switched off refuses with its reason', opts, async () => {
  const { pool } = db
  await openRouter(pool)
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'me')
  await pool.query("update llm_provider set enabled = false where id = 'openrouter'")
  const found = await sitePlannerDoor({ pool, secret: SECRET })
  assert.deepEqual({ ok: found.ok, code: found.code }, { ok: false, code: 'SITE_PLANNER_DOOR_DISABLED' })
  assert.match(found.reason, /switched off/)
})

test('a door whose key cannot be opened refuses with its reason', opts, async () => {
  const { pool } = db
  await openRouter(pool)
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'me')
  const found = await sitePlannerDoor({ pool, secret: 'x'.repeat(32) })
  assert.deepEqual({ ok: found.ok, code: found.code }, { ok: false, code: 'SITE_PLANNER_DOOR_UNREADABLE' })
  assert.match(found.reason, /key/)
})

test('a model the provider says cannot call tools or read pictures is refused', opts, async () => {
  const { pool } = db
  await openRouter(pool, { models: [{ id: MODEL, tools: false, vision: true }] })
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'me')
  const found = await sitePlannerDoor({ pool, secret: SECRET })
  assert.deepEqual(
    { ok: found.ok, code: found.code, lacking: found.lacking },
    { ok: false, code: 'SITE_PLANNER_MODEL_LACKS', lacking: ['tools'] }
  )
  assert.match(found.reason, /tool calls/)
})

test('a ready door answers its credential and a snapshot that carries no key', opts, async () => {
  const { pool } = db
  await openRouter(pool, { models: [{ id: MODEL, tools: true, vision: true }] })
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'me')
  const found = await sitePlannerDoor({ pool, secret: SECRET })
  assert.equal(found.ok, true)
  assert.deepEqual(found.door, {
    providerId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'sk-or-test',
    model: MODEL
  })
  assert.equal(found.snapshot.door, 'sitePlanner')
  assert.equal(found.snapshot.model, MODEL)
  assert.equal(found.snapshot.endpointHost, 'openrouter.ai')
  assert.equal(found.snapshot.providerId, 'openrouter')
  assert.equal(typeof found.snapshot.assignmentRevision, 'number')
  assert.ok(!JSON.stringify(found.snapshot).includes('sk-or-test'), 'the key reached the snapshot')
})

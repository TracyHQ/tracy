// The site planner door (ADR 0041, #301): a door of its own that needs tools and prefers vision, and a resolver that
// refuses an unset, disabled or unreadable door with its reason instead of falling back to the environment. A model
// that cannot read pictures is let in only for a kit with a current look for every 1440 shot.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { doorEntry, LLM_DOORS } from '../src/lib/llm-catalog.js'
import { assignDoor, readAssignments, saveModels, saveProvider } from '../src/lib/llm-store.js'
import { SITE_PLANNER_DOOR, SITE_PLANNER_MODEL, sitePlannerDoor } from '../src/site-planner/door.js'
import { sendsImages } from '../src/site-planner/bench-control.js'
import { openKit } from '../src/site-planner/kit-source.js'
import { fileDb } from './_db.mjs'
import { KIT_REF, MODEL, withAllLooks } from './_site-planner-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SECRET = 's'.repeat(32)
/** DeepSeek V4 Pro, an alternative planner model that DeepSeek's own API lists as text only. */
const PRO = 'deepseek-v4-pro'

test('the catalogue has a site planner door that needs tools and prefers vision', () => {
  const door = doorEntry(SITE_PLANNER_DOOR)
  assert.equal(door.label, 'Site planner')
  assert.equal(door.where, 'this process')
  assert.equal(door.needsModel, true)
  assert.deepEqual(door.requires, ['tools'])
  assert.deepEqual(door.prefers, ['vision'])
  assert.equal(door.configurableEffort, undefined)
})

test('the WO doors are unchanged by the new door', () => {
  assert.deepEqual(
    LLM_DOORS.map((d) => d.id),
    [
      'web',
      'assistant',
      'seedText',
      'woEditorial',
      'vision',
      'seedImage',
      'agent',
      'sitePlanner',
      'siteWriter',
      'picturePicker',
      'pictureIconRanker',
      'brandAgent',
      'brandReviewer'
    ]
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

async function deepseek(pool, models, model = PRO) {
  await saveProvider(
    pool,
    { id: 'deepseek', presetId: 'deepseek', apiKey: 'sk-ds-test', enabled: true },
    SECRET,
    'owner@tracy.test'
  )
  await saveModels(pool, 'deepseek', models)
  await assignDoor(pool, 'sitePlanner', { providerId: 'deepseek', model }, 'me')
}

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
    assert.ok(
      found.reason.includes('deepseek-flash on the deepseek provider'),
      'an unset door names the planner model'
    )
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

test('a ready door with a model that reads pictures records that images are given', opts, async () => {
  const { pool } = db
  await openRouter(pool, { models: [{ id: MODEL, tools: true, vision: true }] })
  await assignDoor(pool, 'sitePlanner', { providerId: 'openrouter', model: MODEL }, 'me')
  const found = await sitePlannerDoor({ pool, secret: SECRET, kit: openKit(KIT_REF) })
  assert.equal(found.ok, true)
  assert.equal(found.snapshot.images, true)
})

test('the default DeepSeek Flash door is let in on the kit as it is, and is given images', opts, async () => {
  const { pool } = db
  // DeepSeek's own model list gives Flash text and image input.
  await deepseek(pool, [{ id: SITE_PLANNER_MODEL, tools: true, vision: true }], SITE_PLANNER_MODEL)
  const found = await sitePlannerDoor({ pool, secret: SECRET, kit: openKit(KIT_REF), sendsImages })
  assert.equal(found.ok, true, JSON.stringify(found))
  assert.equal(found.door.model, 'deepseek-flash')
  assert.equal(found.snapshot.providerId, 'deepseek')
  assert.equal(found.snapshot.images, true)
})

test(
  'a text-only model is let in for a kit with a current look for every 1440 shot, given no images',
  opts,
  async () => {
    const { pool } = db
    await deepseek(pool, [{ id: PRO, tools: true, vision: false }])
    const kit = { ref: KIT_REF, doc: withAllLooks(openKit(KIT_REF).doc) }
    const found = await sitePlannerDoor({ pool, secret: SECRET, kit })
    assert.equal(found.ok, true, JSON.stringify(found))
    assert.equal(found.door.model, PRO)
    assert.equal(found.snapshot.providerId, 'deepseek')
    assert.equal(found.snapshot.images, false)
  }
)

test(
  'a text-only model is refused for a kit missing looks, naming the kit, and without a kit',
  opts,
  async () => {
    const { pool } = db
    await deepseek(pool, [{ id: PRO, tools: true, vision: false }])
    const doc = withAllLooks(openKit(KIT_REF).doc)
    delete doc.pages[0].look
    const found = await sitePlannerDoor({ pool, secret: SECRET, kit: { ref: KIT_REF, doc } })
    assert.deepEqual(
      { ok: found.ok, code: found.code, lacking: found.lacking },
      { ok: false, code: 'SITE_PLANNER_MODEL_LACKS', lacking: ['vision'] }
    )
    assert.match(found.reason, /cannot do reading pictures/)
    assert.ok(found.reason.includes(KIT_REF), 'the refusal names the kit')
    assert.match(found.reason, /no current look for 1 of its 1440 shots/)
    assert.ok(found.reason.includes(doc.pages[0].id), 'the refusal names the part without a look')
    assert.match(found.reason, /Model & AI/)
    const unnamed = await sitePlannerDoor({ pool, secret: SECRET })
    assert.equal(unnamed.code, 'SITE_PLANNER_MODEL_LACKS')
    assert.match(unnamed.reason, /cannot do reading pictures/)
  }
)

test('a model that cannot call tools is refused even on a kit with every look', opts, async () => {
  const { pool } = db
  await deepseek(pool, [{ id: PRO, tools: false, vision: false }])
  const kit = { ref: KIT_REF, doc: withAllLooks(openKit(KIT_REF).doc) }
  const found = await sitePlannerDoor({ pool, secret: SECRET, kit })
  assert.deepEqual(found.lacking, ['tools', 'vision'])
  assert.match(found.reason, /tool calls or reading pictures/)
})

test(
  'a harness that sends no images needs the same complete looks, even for a model the provider did not list',
  opts,
  async () => {
    const { pool } = db
    await deepseek(pool, [])
    const noImages = () => false
    const doc = withAllLooks(openKit(KIT_REF).doc)
    delete doc.blocks[0].look
    const bare = await sitePlannerDoor({
      pool,
      secret: SECRET,
      kit: { ref: KIT_REF, doc },
      sendsImages: noImages
    })
    assert.equal(bare.code, 'SITE_PLANNER_MODEL_LACKS')
    assert.match(bare.reason, /is given no pictures/)
    const kit = { ref: KIT_REF, doc: withAllLooks(openKit(KIT_REF).doc) }
    const found = await sitePlannerDoor({ pool, secret: SECRET, kit, sendsImages: noImages })
    assert.equal(found.ok, true)
    assert.equal(found.snapshot.images, false)
  }
)

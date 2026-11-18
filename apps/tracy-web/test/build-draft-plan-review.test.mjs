// The owner's review on the plan card (#575): a part taken off through the plan edit door (an edit that carries one
// operation), brought back, taken back with the one undo, and the whole review gone back to the original; the review's
// count and removals answered with the draft. And the picture door the card shows the look with: the signed-in
// owner's own draft pictures that the look names, nothing else. Invented club and invented data only.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-plan-review.test.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { composePlan } from 'website-opportunities/domain'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { aiQuickstartCatalogue } from '../src/build-draft/ai-quickstarts.js'
import { createDraftPictures } from '../src/build-draft/pictures.js'
import { putComposed } from '../src/build-draft/store.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const config = readConfig({
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
})
const WO_FIXTURES = fileURLToPath(
  new URL('../../../packages/wo/website-opportunities/test/fixtures/', import.meta.url)
)
const kitRoot = mkdtempSync(path.join(tmpdir(), 'tracy-review-kits-'))
const kitDir = path.join(kitRoot, club.template().slug, 'j6', club.template().version)
mkdirSync(kitDir, { recursive: true })
for (const file of ['block-store.json', 'page-recipes.json'])
  cpSync(path.join(WO_FIXTURES, 'plan-composer', file), path.join(kitDir, file))
writeFileSync(path.join(kitDir, 'mapping.pending.json'), JSON.stringify({ ticket: '#1' }))
const catalogue = aiQuickstartCatalogue({ root: kitRoot, library: club.library() })
/** A review as the store keeps it: the kit's locks, which the door adds to every answer, aside. */
const bare = ({ locks: _locks, ...review }) => review
const aiQuickstarts = { loadKit: catalogue.loadKit, skipped: catalogue.skipped, templatesFor: () => [] }

const OWNER = 'owner@brindlewick-tennis.test'
const STRANGER = 'someone@elsewhere-courts.test'
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const LOGO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>')

function memoryObjects() {
  const kept = new Map()
  return {
    put: async (key, bytes) => (kept.set(key, Buffer.from(bytes)), true),
    get: async (key) => (kept.has(key) ? new Response(kept.get(key)) : null),
    delete: async (key) => kept.delete(key)
  }
}
const objects = memoryObjects()

const db = fileDb()
let composed
before(async () => {
  composed = await composePlan({
    blockStore: club.blockStore(),
    pageRecipes: club.pageRecipes(),
    library: club.library(),
    template: club.template(),
    brand: club.brand(),
    profile: club.clubProfile(),
    planId: 'plan-club',
    model: club.scriptedModel(JSON.stringify(club.goodComposition()))
  })
})
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(kitRoot, { recursive: true, force: true }))

async function call(email, method, urlPath = '', body) {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts,
    buildEngine: { pictureDoors: { objects } }
  })
  const headers = { 'sec-fetch-site': 'same-origin' }
  if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await app.fetch(
    new Request(`${config.origin}/api/build-draft${urlPath}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
  )
  const type = res.headers.get('content-type') ?? ''
  const bytes = Buffer.from(await res.arrayBuffer())
  return {
    status: res.status,
    headers: res.headers,
    bytes,
    body: type.includes('json') ? JSON.parse(bytes.toString('utf8')) : null
  }
}
const accountIdOf = async (email) =>
  (await db.pool.query('select id from account where email = $1', [email])).rows[0].id
const putPlan = async () =>
  putComposed(db.pool, await accountIdOf(OWNER), { plan: composed.plan, profile: composed.profile })
const operation = (revision, op) => ({
  edit: {
    schema: 'tracy-build-plan-edit/v1',
    id: `edit-${revision}`,
    plan: { id: composed.plan.id, revision },
    operation: op
  }
})
const withoutRevision = ({ revision: _r, ...rest }) => rest
const profileOf = async () =>
  (
    await db.pool.query('select needs_profile from build_draft where account_id = $1', [
      await accountIdOf(OWNER)
    ])
  ).rows[0].needs_profile

test(
  'a part taken off through the plan edit door counts once, is answered as a removal, and comes back',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await putPlan()
    const fresh = await call(OWNER, 'GET')
    assert.deepEqual(bare(fresh.body.draft.review), { count: 0, canRevert: false, removals: [] })
    // The kit's locks come with the draft, so the card shows no trash where the gate would refuse.
    const locks = fresh.body.draft.review.locks
    assert.deepEqual(Object.keys(locks).sort(), ['blocks', 'facts', 'minItems', 'pages'])
    assert.equal(locks.pages.home, 'first_page')
    assert.equal(locks.pages.team, undefined)
    const off = await call(OWNER, 'POST', '/plan-edits', operation(1, { op: 'remove-page', page: 'team' }))
    assert.equal(off.status, 200, JSON.stringify(off.body))
    const draft = off.body.draft
    assert.equal(draft.plan.revision, 2)
    assert.deepEqual(
      draft.plan.pages.map((p) => p.id),
      ['home', 'contact']
    )
    assert.equal(draft.canUndo, true)
    assert.equal(draft.lastEdit, null)
    assert.deepEqual(bare(draft.review), {
      count: 1,
      canRevert: true,
      removals: [{ id: 'removal-2', op: 'remove-page', target: { page: 'team' } }]
    })
    assert.equal('base' in draft.review, false, 'the base plan is never answered')
    const back = await call(
      OWNER,
      'POST',
      '/plan-edits',
      operation(2, { op: 'restore', removal: 'removal-2' })
    )
    assert.equal(back.status, 200, JSON.stringify(back.body))
    assert.deepEqual(withoutRevision(back.body.draft.plan), withoutRevision(composed.plan))
    assert.equal(back.body.draft.plan.revision, 3)
    assert.deepEqual(back.body.draft.review.removals, [])
    assert.equal(back.body.draft.review.count, 2)
  }
)

test(
  'the one undo takes an operation back exactly, with the profile and the review before it',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await putPlan()
    const services = composed.plan.pages[0].blocks.find((b) => b.type === 'services')
    const item = services.data[1]
    await call(
      OWNER,
      'POST',
      '/plan-edits',
      operation(1, { op: 'remove-item', page: 'home', block: services.id, item })
    )
    const undone = await call(OWNER, 'POST', '/plan-undo')
    assert.equal(undone.status, 200, JSON.stringify(undone.body))
    assert.deepEqual(withoutRevision(undone.body.draft.plan), withoutRevision(composed.plan))
    assert.equal(undone.body.draft.plan.revision, 3)
    assert.deepEqual(bare(undone.body.draft.review), { count: 0, canRevert: false, removals: [] })
    assert.deepEqual(await profileOf(), composed.profile)
    assert.equal((await call(OWNER, 'POST', '/plan-undo')).body.code, 'NOTHING_TO_UNDO')
  }
)

test(
  'back to the original puts the first plan back after edits and removals; undo takes that back',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await putPlan()
    const item = composed.plan.items[0].id
    const renamed = await call(OWNER, 'POST', '/plan-edits', {
      edit: {
        schema: 'tracy-build-plan-edit/v1',
        id: 'edit-1',
        plan: { id: composed.plan.id, revision: 1 },
        changes: [{ field: `items[${item}].label`, value: 'Kids tennis' }]
      }
    })
    assert.equal(renamed.body.draft.review.count, 1)
    const off = await call(OWNER, 'POST', '/plan-edits', operation(2, { op: 'remove-page', page: 'team' }))
    assert.equal(off.body.draft.review.count, 2)
    const reverted = await call(OWNER, 'POST', '/plan-edits', operation(3, { op: 'revert' }))
    assert.equal(reverted.status, 200, JSON.stringify(reverted.body))
    assert.deepEqual(withoutRevision(reverted.body.draft.plan), withoutRevision(composed.plan))
    assert.deepEqual(bare(reverted.body.draft.review), { count: 0, canRevert: false, removals: [] })
    assert.deepEqual(await profileOf(), composed.profile)
    const undone = await call(OWNER, 'POST', '/plan-undo')
    assert.deepEqual(
      undone.body.draft.plan.pages.map((p) => p.id),
      ['home', 'contact']
    )
    assert.equal(undone.body.draft.review.count, 2)
    assert.equal(undone.body.draft.review.removals.length, 1)
  }
)

test(
  'a refused operation answers its code and changes nothing; a stale one is refused as stale',
  opts,
  async () => {
    await call(OWNER, 'POST')
    await putPlan()
    const refused = await call(
      OWNER,
      'POST',
      '/plan-edits',
      operation(1, { op: 'remove-page', page: 'home' })
    )
    assert.equal(refused.status, 422)
    assert.equal(refused.body.code, 'INVALID_EDIT')
    assert.equal(refused.body.problems[0].code, 'first_page')
    const stale = await call(OWNER, 'POST', '/plan-edits', operation(7, { op: 'remove-page', page: 'team' }))
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'STALE_EDIT')
    const now = (await call(OWNER, 'GET')).body.draft
    assert.equal(now.plan.revision, 1)
    assert.equal(now.review.count, 0)
  }
)

test('a new plan starts the review over', opts, async () => {
  await call(OWNER, 'POST')
  await putPlan()
  await call(OWNER, 'POST', '/plan-edits', operation(1, { op: 'remove-page', page: 'team' }))
  await putComposed(db.pool, await accountIdOf(OWNER), {
    plan: { ...composed.plan, revision: 5 },
    profile: composed.profile
  })
  assert.deepEqual(bare((await call(OWNER, 'GET')).body.draft.review), {
    count: 0,
    canRevert: false,
    removals: []
  })
})

/** A draft whose look names one kept logo picture of its account, as the brand step leaves it. */
async function draftWithLogo(email) {
  await call(email, 'POST')
  const accountId = await accountIdOf(email)
  const pictures = createDraftPictures({ pool: db.pool, objects })
  const id = await pictures.keepBrand(accountId, {
    bytes: LOGO,
    sha256: sha256(LOGO),
    mime: 'image/svg+xml',
    name: 'logo-light.svg'
  })
  await db.pool.query('update build_draft set brand = $2::jsonb where account_id = $1', [
    accountId,
    JSON.stringify({
      file: {
        logos: [{ side: 'light', file: 'logo-light.svg' }],
        pictures: { 'logo-light.svg': { id, mime: 'image/svg+xml' } }
      }
    })
  ])
  return id
}

test('the picture door answers the owner a picture the plan look names, sandboxed', opts, async () => {
  const id = await draftWithLogo(OWNER)
  const draft = (await call(OWNER, 'GET')).body.draft
  assert.equal(draft.lookSources.pictures.logoLight.picture, id)
  const res = await call(OWNER, 'GET', `/pictures/${id}`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.bytes, LOGO)
  assert.equal(res.headers.get('content-type'), 'image/svg+xml')
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.match(res.headers.get('content-security-policy'), /sandbox/)
  assert.match(res.headers.get('cache-control'), /no-store/)
})

test(
  'the picture door refuses another account, a stranger, a picture the look does not name, and no session',
  opts,
  async () => {
    const id = await draftWithLogo(OWNER)
    await call(STRANGER, 'POST')
    const other = await call(STRANGER, 'GET', `/pictures/${id}`)
    assert.equal(other.status, 404, "another owner never reads this owner's picture")
    assert.equal((await call(null, 'GET', `/pictures/${id}`)).status, 401)
    // A picture of the owner's own account the look does not name is not answered either.
    const pictures = createDraftPictures({ pool: db.pool, objects })
    const unnamed = await pictures.keepBrand(await accountIdOf(OWNER), {
      bytes: Buffer.from('another invented picture'),
      sha256: sha256(Buffer.from('another invented picture')),
      mime: 'image/png',
      name: 'spots/b.png'
    })
    assert.equal((await call(OWNER, 'GET', `/pictures/${unnamed}`)).status, 404)
    assert.equal((await call(OWNER, 'GET', '/pictures/not-a-uuid')).status, 404)
  }
)

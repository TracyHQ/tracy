// A service renamed on the plan card reaches the writer (#612, the check Part 3 asked for): the edit gate writes a fact
// value into the needs profile (`profileAfterEdit`), but an item's label (`items[<id>].label`) only reached the plan,
// so the writer, which reads item names from the profile, still wrote the old name on every page. The plan card's edit
// door (`store.js editPlan`) now carries the new name into the profile item's name field, with the owner as its source;
// undo puts the profile back as it was. Driven through the real edit door and the writer's own request builder, on the
// invented club. Invented data only.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-rename-profile.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import { writerContextOf, writerRequestsOf } from 'website-opportunities/domain/page-writer-context.mjs'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import {
  createDraft,
  editPlan,
  putComposed,
  readEngineDraft,
  undoPlanEdit
} from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { fileDb } from './_db.mjs'
import { KIT_ROOT, OWNER, kits } from './build-draft-engine-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

const NEW_NAME = 'Little Racquets academy'

async function planned() {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const composed = await composePlan({
    blockStore: club.blockStore(),
    pageRecipes: club.pageRecipes(),
    library: club.library(),
    template: club.template(),
    brand: club.brand(),
    profile: club.clubProfile(),
    planId: 'plan-club',
    model: club.scriptedModel(JSON.stringify(club.goodComposition()))
  })
  await putComposed(db.pool, id, composed, { research: { trade: 'fitness' } })
  return { accountId: id, plan: composed.plan }
}

/** What every page's writer is asked, as JSON, from a plan and the profile the engine keeps beside it. */
const writerAsked = (plan, profile) =>
  JSON.stringify([
    ...writerRequestsOf(
      plan,
      writerContextOf({ profile, blockStore: club.blockStore(), library: club.library() })
    ).values()
  ])

test(
  'a service renamed on the plan card reaches the needs profile and every writer request',
  opts,
  async () => {
    const { accountId, plan } = await planned()
    const service = plan.items.find((i) => i.kind === 'service')
    const before = await readEngineDraft(db.pool, accountId)
    assert.ok(
      writerAsked(plan, before.needsProfile).includes(service.label),
      'the writer is asked the old name'
    )
    const edited = await editPlan(
      db.pool,
      accountId,
      {
        schema: 'tracy-build-plan-edit/v1',
        id: 'edit-rename',
        plan: { id: plan.id, revision: plan.revision },
        changes: [{ field: `items[${service.id}].label`, value: NEW_NAME }]
      },
      kits
    )
    assert.equal(edited.error, undefined, JSON.stringify(edited.problems ?? null))
    const after = await readEngineDraft(db.pool, accountId)
    const item = after.needsProfile.items.service.find((s) => s.id === service.id)
    assert.equal(item.fields['offering.name'].value, NEW_NAME)
    assert.deepEqual(item.fields['offering.name'].sources, ['customer-answer'])
    const asked = writerAsked(edited.draft.plan, after.needsProfile)
    assert.ok(asked.includes(NEW_NAME), 'the writer is asked the new name')
    assert.equal(asked.includes(service.label), false, 'no writer request names the old one')
    // Undo puts the profile back exactly as it was.
    await undoPlanEdit(db.pool, accountId, kits)
    assert.deepEqual((await readEngineDraft(db.pool, accountId)).needsProfile, before.needsProfile)
  }
)

test('a renamed review or photo label stays a plan label: the profile keeps its words', opts, async () => {
  const { accountId, plan } = await planned()
  const quote = plan.items.find((i) => i.kind === 'quote')
  assert.ok(quote, 'the invented club has a review')
  const before = await readEngineDraft(db.pool, accountId)
  const edited = await editPlan(
    db.pool,
    accountId,
    {
      schema: 'tracy-build-plan-edit/v1',
      id: 'edit-quote',
      plan: { id: plan.id, revision: plan.revision },
      changes: [{ field: `items[${quote.id}].label`, value: 'Review by a member' }]
    },
    kits
  )
  assert.equal(edited.error, undefined, JSON.stringify(edited.problems ?? null))
  const after = await readEngineDraft(db.pool, accountId)
  assert.deepEqual(after.needsProfile.items.quote, before.needsProfile.items.quote)
})

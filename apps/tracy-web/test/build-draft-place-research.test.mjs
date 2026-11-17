// The build chat's research of the owner's links is the step chain's own research (#575): the business saved as the
// account's private opportunity, the shared place research run by the place executor, each link's line read from the
// place run's own source rows while it runs, and the step chain's content brief (a `wo_revision`) kept in the draft
// with the ids later steps read. The doors are called as the dsh tool calls them; the domain's network doors and the
// needs profile's model are fakes. Every business, link and picture here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-place-research.test.mjs
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { storedPicturesOf } from '../src/step-chain-draft-stored.js'
import { moveToNextGeneration } from '../src/build-draft/fresh-start.js'
import { fileDb } from './_db.mjs'
import { FACEBOOK, SITE } from './build-draft-gather-fakes.mjs'
import {
  bakeryDomain,
  drain,
  memoryObjects,
  placeExecutor,
  pngBytes,
  server
} from './build-draft-place-research-fixtures.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const one = async (sql, params) => (await db.pool.query(sql, params)).rows[0]

/** A server, its executor and the invented bakery, researched from its website and Facebook page up to `running`. */
async function started() {
  const objects = memoryObjects()
  const { domain } = await bakeryDomain({ png: await pngBytes() })
  const s = server(db.pool, { domain, objects })
  const ex = placeExecutor(db.pool, domain, objects)
  const start = await s.call('POST', '/research', {
    links: [SITE, FACEBOOK],
    name: 'Hollowmere Bakehouse',
    description: 'A family bakery that opens before dawn.'
  })
  await s.app.buildDraftEngine.settled(await s.accountId())
  return { s, ex, objects, start }
}

test(
  'links: the business is saved as the account own opportunity and its place research starts',
  opts,
  async () => {
    const { s, start } = await started()
    assert.deepEqual(start.body, { step: 'research', state: 'running' })
    const accountId = await s.accountId()
    const draft = await one('select id, engine from build_draft where account_id = $1', [accountId])
    const opp = await one('select * from wo_opportunity where account_id = $1', [accountId])
    assert.equal(opp.name, 'Hollowmere Bakehouse')
    assert.equal(
      opp.candidate.ownSite.buildDraft,
      draft.id,
      'the opportunity is marked as the draft own business'
    )
    const job = await one('select * from wo_job where opportunity_id = $1', [opp.id])
    assert.equal(job.kind, 'research')
    assert.ok(job.place_job_id, 'the research is the shared place research')
    assert.equal(draft.engine.place.opportunityId, opp.id)
    // Nothing ran yet: every link still reads.
    const { first } = await s.poll()
    assert.equal(first.body.state, 'running')
    assert.deepEqual(
      first.body.links.map((l) => l.state),
      ['reading', 'reading']
    )
  }
)

test(
  'running then done: each link its own line, the failed source failed; the brief and its ids kept',
  opts,
  async () => {
    const { s, ex } = await started()
    await drain(ex)
    const { first, later } = await s.poll()
    // The poll that saw the place run end still says running, with each link's line from the place run's rows.
    assert.equal(first.body.state, 'running', JSON.stringify(first.body))
    const lines = Object.fromEntries(first.body.links.map((l) => [l.link, l.state]))
    assert.deepEqual(lines, { [SITE]: 'read', [FACEBOOK]: 'failed' })
    assert.equal(later.body.state, 'done', JSON.stringify(later.body))
    const accountId = await s.accountId()
    const { research, needs_profile: profile } = await one(
      'select research, needs_profile from build_draft where account_id = $1',
      [accountId]
    )
    const opp = await one('select id, place_id from wo_opportunity where account_id = $1', [accountId])
    const revision = await one('select id, brief from wo_revision where opportunity_id = $1', [opp.id])
    assert.deepEqual(research.ids, { opportunityId: opp.id, placeId: opp.place_id, revisionId: revision.id })
    assert.equal(research.brief.business.name, 'Hollowmere Bakehouse')
    assert.ok(research.placeProfile, 'the place profile is kept')
    assert.ok(profile?.questions, 'the needs profile is made from the brief')
    // The owner's words are kept out of the brief copy word for word (D46).
    assert.ok(!JSON.stringify(research.brief).includes('A family bakery that opens before dawn.'))
    // The finished research names each link as the done state does.
    assert.equal(later.body.result.links.find((l) => l.link === FACEBOOK)?.state, 'failed')
  }
)

test(
  'the place pictures of the brief open for the draft account only, as a run reads them',
  opts,
  async () => {
    const { s, ex } = await started()
    await drain(ex)
    await s.poll()
    const accountId = await s.accountId()
    const { research } = await one('select research from build_draft where account_id = $1', [accountId])
    const place = research.manifest.find((m) => m.origin === 'place')
    assert.ok(place, `the manifest names a place picture: ${JSON.stringify(research.manifest).slice(0, 300)}`)
    const run = storedPicturesOf({
      manifest: research.manifest,
      accountId,
      openDraftPicture: s.app.openDraftPicture
    })
    const stored = run.stored({ pictures: [{ frame: 'hero', source: 'own', ref: place.sourceUrl }] })
    assert.ok(stored.hero, 'the run finds the place picture by its address')
    const opened = await run.openStored(stored.hero.id)
    assert.ok(opened.bytes.length > 0)
    // Another account holds no opportunity on the place: nothing opens.
    const other = (
      await db.pool.query("insert into account (email) values ('other@quillan.example') returning id")
    ).rows[0].id
    const refused = storedPicturesOf({
      manifest: research.manifest,
      accountId: other,
      openDraftPicture: s.app.openDraftPicture
    })
    await assert.rejects(refused.openStored(stored.hero.id), { code: 'stored_picture_gone' })
  }
)

test('start over forgets the draft research ids; the shared place research stays', opts, async () => {
  const { s, ex } = await started()
  await drain(ex)
  await s.poll()
  const accountId = await s.accountId()
  const moved = await moveToNextGeneration(db.pool, accountId, { only: 'asked' })
  assert.ok(moved.generation >= 1, JSON.stringify(moved))
  const opp = await one('select candidate, place_id from wo_opportunity where account_id = $1', [accountId])
  assert.equal(opp.candidate.ownSite.buildDraft, undefined, 'the opportunity forgets the draft')
  assert.ok(await one('select id from wo_place where id = $1', [opp.place_id]), 'the place research stays')
  assert.equal(await one('select id from build_draft where account_id = $1', [accountId]), undefined)
})

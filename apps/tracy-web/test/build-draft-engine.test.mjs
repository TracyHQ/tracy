// The build chat's engine doors (#609, `build-draft/engine-route.js`): research, templates, compose, edit and the
// engine state, driven through the app as the dsh tool `tracy_build` calls them (signed actor and build session). The
// research gatherer, the brand step and the build model are fakes; the needs profile, the plan composer and its rules
// gate, the edit gate and the draft are the real ones. Every business, link and template here is invented.
//
//   TEST_DATABASE_URL=... node --test --test-concurrency=1 apps/tracy-web/test/build-draft-engine.test.mjs
import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { composePlan } from 'website-opportunities/domain'
import { brandLookOf } from 'website-opportunities/domain/brand-before-site.mjs'
import * as brands from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-brands.mjs'
import * as club from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import { buildApp } from '../src/app.js'
import { SAY, UNCHANGED_SAY } from '../src/build-draft/engine-state.js'
import { REQUEST_EMPTY_SAY, requestTooLongSay } from '../src/build-draft/engine-revise.js'
import { TEMPLATE_CHANGE_SAY, changeDraft, createDraft, putComposed } from '../src/build-draft/store.js'
import { ensureAccount } from '../src/seats/store.js'
import { buildSessionIdFor } from '../src/workspace/build-chat-session.js'
import { fileDb } from './_db.mjs'
import {
  MAPS as GATHER_MAPS,
  SITE as GATHER_SITE,
  connector,
  facebookResult,
  fakeDomain,
  fakeObjects,
  pngOf,
  runtimeWith,
  websiteResult
} from './build-draft-gather-fakes.mjs'
import {
  KIT_ROOT,
  OWNER,
  actor,
  config,
  gatheredBrief,
  heldClubBrief,
  kits,
  needsReading
} from './build-draft-engine-fixtures.mjs'

/** An en or em dash, written by code point. */
const DASHES = new RegExp(`[${String.fromCodePoint(0x2013, 0x2014)}]`)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
after(() => rmSync(KIT_ROOT, { recursive: true, force: true }))

/** One running server (one process): its doors, called as the owner's build chat, and its engine. */
function server(buildEngine = {}, aiQuickstarts = kits) {
  const app = buildApp({
    config,
    pool: db.pool,
    mail: { send: async () => {} },
    aiQuickstarts,
    buildEngine
  })
  async function call(method, path, body, { as = OWNER, session } = {}) {
    const headers = {}
    if (as) {
      headers['x-tracy-actor'] = actor(as)
      headers['x-tracy-session'] = session ?? (await buildSessionIdFor(as, config.sessionSecret))
    }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`${config.origin}/api/build-draft${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
    return { status: res.status, body: await res.json() }
  }
  const accountId = async () =>
    (await db.pool.query('select id from account where email = $1', [OWNER])).rows[0]?.id
  /** Start a step and wait for its end, as the tool's polling does. */
  async function run(method, path, body) {
    const started = await call(method, path, body)
    await app.buildDraftEngine.settled(await accountId())
    return { started, ended: await call('GET', '/engine') }
  }
  return { app, call, run, accountId, engine: app.buildDraftEngine }
}

const row = async (s) =>
  (await db.pool.query('select * from build_draft where account_id = $1', [await s.accountId()])).rows[0]
/** The invented club's research record, as the research step stores it. */
const clubResearch = () => ({
  links: ['https://brindlewick-tennis.example/'],
  trade: 'fitness',
  profile: club.clubProfile()
})
/**
 * A draft researched as the invented club (its stored needs profile) with the club's template chosen; with `brand`,
 * the brand step's record for that template is stored too.
 */
async function researchedClub(_server, { brand, research = clubResearch() } = {}) {
  const { id } = await ensureAccount(db.pool, OWNER)
  await createDraft(db.pool, id)
  const { accent: _accent, ...template } = club.template()
  await changeDraft(db.pool, id, () => ({
    research,
    template,
    ...(brand
      ? { brand: { record: brand, template: { slug: template.slug, version: template.version } } }
      : {})
  }))
}
/**
 * Ask for the plan as the tool does: a draft without a look record for its template runs the brand step first, and
 * the plan is asked for again once it is done.
 */
async function askPlan(s, body = {}) {
  const first = await s.run('POST', '/compose', body)
  if (first.ended.body.step !== 'brand' || first.ended.body.state !== 'done') return first
  return s.run('POST', '/compose', body)
}
const research = (gather, model) => ({
  gather,
  buildModel: async () => model,
  buildChatOn: async () => true
})
const ownBrand = async () => club.brand()
/** The invented club's plan, composed through the rules gate with its brand record. */
const composeClub = () =>
  composePlan({
    blockStore: club.blockStore(),
    pageRecipes: club.pageRecipes(),
    library: club.library(),
    template: club.template(),
    brand: club.brand(),
    profile: club.clubProfile(),
    planId: 'plan-club',
    model: club.scriptedModel(JSON.stringify(club.goodComposition()))
  })
/** The brand step's look record of an invented business of #616's fixtures. */
const recordOf = ({ brandFile, brief }) => brandLookOf({ brandFile, brief })
/** A brand whose logo colours research never measured. */
const unmeasured = ({ brandFile, brief }) => ({
  brandFile,
  brief: { brand: { ...brief.brand, colorsFrom: undefined } }
})

test(
  'research from an invented link: running at once, then the profile and its questions',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(needsReading()))
    const gathered = []
    const s = server(research(async (input) => (gathered.push(input), gatheredBrief()), model))
    const { started, ended } = await s.run('POST', '/research', {
      links: ['https://larkfen-racquets.example/']
    })
    assert.deepEqual(started, { status: 200, body: { step: 'research', state: 'running' } })
    assert.deepEqual(gathered, [{ links: ['https://larkfen-racquets.example/'], description: null }])
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    const { profile, questions, ask } = ended.body.result
    assert.equal(profile.business, 'Larkfen Racquet Club')
    assert.ok(questions.length >= 1, 'the needs profile issued questions')
    assert.ok(questions.every((q) => q.schema === 'tracy-build-question/v1'))
    assert.ok(ask.questions.length <= 3 && ask.questions.length >= 1)
    const stored = await row(s)
    assert.deepEqual(stored.needs_profile.questions, questions, 'the needs profile is kept in the draft')
    assert.equal(stored.research.trade, 'fitness')
    for (const table of ['wo_opportunity', 'wo_revision', 'site'])
      assert.equal((await db.pool.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table)

    // An answered question never comes back on the next card.
    const first = questions[0]
    const choice = first.choices[0]?.id
    const answer = choice
      ? { schema: 'tracy-build-answer/v1', question: first.id, choice }
      : { schema: 'tracy-build-answer/v1', question: first.id, text: 'Book a court' }
    const put = await s.call('PUT', '/answers', { question: first, answer })
    assert.equal(put.status, 200, JSON.stringify(put.body))
    const again = await s.call('GET', '/engine')
    assert.ok(!(again.body.result.ask?.questions ?? []).some((q) => q.id === first.id))
  }
)

test(
  'the doors answer only the person in their own build session, with the build chat on',
  opts,
  async () => {
    const s = server(
      research(
        async () => gatheredBrief(),
        async () => '{}'
      )
    )
    const wrong = await s.call('GET', '/engine', undefined, {
      session: 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
    })
    assert.equal(wrong.status, 403)
    assert.equal(wrong.body.code, 'NOT_BUILD_SESSION')
    assert.equal((await s.call('POST', '/research', { links: [] }, { as: null })).status, 401)
    const off = server({
      ...research(
        async () => gatheredBrief(),
        async () => '{}'
      ),
      buildChatOn: async () => false
    })
    assert.equal((await off.call('GET', '/templates')).status, 403)
    assert.equal((await s.call('POST', '/research', { links: ['ftp://larkfen.example/'] })).status, 400)
    assert.deepEqual((await s.call('GET', '/engine')).body, { step: null, state: 'idle' })
  }
)

/** The rows of every `wo_*` table of the test schema, by table. */
async function woRows() {
  const { rows } = await db.pool.query(
    `select table_name from information_schema.tables
      where table_schema = current_schema() and table_name like 'wo\\_%' and table_type = 'BASE TABLE'`
  )
  const counts = {}
  for (const { table_name: t } of rows)
    counts[t] = (await db.pool.query(`select count(*)::int as n from "${t}"`)).rows[0].n
  return counts
}

test(
  'research through the server own gatherer reads the links in memory and stores its pictures: no wo_* row is written',
  opts,
  async () => {
    // The website shows two pictures, then only one: the second research replaces the first one's pictures.
    let media = websiteResult().media
    const { domain } = await fakeDomain({
      connectors: {
        website: connector(() => ({ ...websiteResult(), media })),
        facebook: connector(facebookResult())
      }
    })
    const served = {
      [media[0].url]: await pngOf(640, 480),
      [media[1].url]: await pngOf(480, 640, { r: 30, g: 60, b: 140 })
    }
    domain.fetchLimited = async (url) =>
      served[url]
        ? { status: 200, bytes: served[url], truncated: false }
        : { status: 404, bytes: new Uint8Array(), truncated: false }
    const objects = fakeObjects()
    const s = server({
      ...research(
        undefined,
        club.scriptedModel(JSON.stringify(needsReading()), JSON.stringify(needsReading()))
      ),
      gatherDoors: {
        loadDomain: async () => domain,
        runtime: runtimeWith({ google: 'google-test' }),
        fetch: async () => assert.fail('no fetch outside the fakes')
      },
      pictureDoors: { objects }
    })
    // The account first: its trigger gives it a `wo_principal`, which is the account's, not the research's.
    const account = await ensureAccount(db.pool, OWNER)
    const before = await woRows()
    assert.ok(Object.keys(before).length > 10, 'the WO tables exist in the test schema')
    const { ended } = await s.run('POST', '/research', {
      links: [GATHER_SITE, GATHER_MAPS, 'http://localhost:8080/'],
      description: 'Family bakery, open early.'
    })
    assert.equal(ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    assert.deepEqual(await woRows(), before, 'no wo_* table changed')
    const stored = await row(s)
    assert.equal(stored.research.brief.business.name, 'Hollowmere Bakehouse')
    assert.equal(stored.research.brief.googlePlace.placeId, 'ChIJinventedHollowmere0001')
    assert.equal(stored.research.trade, 'food')
    // Only the owner's private link is set aside; the social page the website links to is read too.
    assert.deepEqual(stored.research.setAside, [
      { link: 'http://localhost:8080/', reason: 'a private address, not a page on the internet' }
    ])
    // The pictures are stored copies: one draft picture row each, its object under the draft key, opened by its id.
    const { manifest, pictureRun } = stored.research
    assert.deepEqual(manifest.map((m) => [m.origin, m.mime, m.width, m.height]).sort(), [
      ['draft', 'image/png', 480, 640],
      ['draft', 'image/png', 640, 480]
    ])
    const pictures = async () =>
      (await db.pool.query('select id, research_run, object_key from build_draft_picture order by id')).rows
    const first = await pictures()
    assert.deepEqual(first.map((r) => r.id).sort(), manifest.map((m) => m.id).sort())
    assert.ok(first.every((r) => r.research_run === pictureRun))
    assert.deepEqual([...objects.held.keys()].sort(), first.map((r) => r.object_key).sort())
    assert.ok(first.every((r) => r.object_key.startsWith(`build-drafts/${account.id}/`)))
    const opened = await s.app.openDraftPicture(manifest[0].id)
    assert.equal(opened.sha256, manifest[0].sha256)
    assert.deepEqual(stored.research.picturesSetAside, [
      { url: 'https://cdn.social.example/hollowmere/rye.jpg', reason: 'the picture could not be downloaded' }
    ])
    // Research again with one picture gone: the same bytes keep their id, the other row and its object go.
    media = [media[0]]
    const again = await s.run('POST', '/research', { links: [GATHER_SITE] })
    assert.equal(again.ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    const kept = await pictures()
    const loaves = manifest.find((m) => m.sourceUrl === media[0].url)
    assert.deepEqual(
      kept.map((r) => r.id),
      [loaves.id]
    )
    assert.equal(kept[0].research_run, (await row(s)).research.pictureRun)
    assert.deepEqual([...objects.held.keys()], [kept[0].object_key])
    assert.deepEqual(await woRows(), before, 'no wo_* table changed by a second research either')
  }
)

test(
  'research whose links read nothing stops with a sentence, and the team gets the fault',
  opts,
  async () => {
    // The server's own gatherer (`preSiteGatherer`), its network doors faked: a link the guard refuses.
    const { domain } = await fakeDomain()
    const s = server({
      buildModel: async () => async () => '{}',
      buildChatOn: async () => true,
      gatherDoors: {
        loadDomain: async () => domain,
        runtime: runtimeWith(),
        fetch: async () => assert.fail('no fetch')
      }
    })
    const { ended } = await s.run('POST', '/research', { links: ['https://larkfen.private.example/'] })
    assert.equal(ended.body.state, 'stopped')
    assert.doesNotMatch(ended.body.say, DASHES)
    assert.doesNotMatch(ended.body.say, /research_empty/)
    assert.equal(ended.body.result, undefined)
    assert.equal((await row(s)).fault.code, 'research_empty')
  }
)

test('a description with no link stops and asks the owner for a link, in plain words', opts, async () => {
  const { domain } = await fakeDomain()
  const s = server({
    buildModel: async () => async () => '{}',
    buildChatOn: async () => true,
    gatherDoors: {
      loadDomain: async () => domain,
      runtime: runtimeWith(),
      fetch: async () => assert.fail('no fetch')
    }
  })
  const { ended } = await s.run('POST', '/research', { description: 'A family bakery that opens early.' })
  assert.equal(ended.body.state, 'stopped')
  assert.match(
    ended.body.say,
    /at least one link to your website, your Google Maps listing or one of your social pages/
  )
  assert.doesNotMatch(ended.body.say, DASHES)
  const { fault } = await row(s)
  assert.deepEqual(
    [fault.code, fault.reason, fault.noRerun, fault.attempts],
    ['research_empty', 'no_links', true, 1]
  )
})

test(
  'templates come from the catalogue for the researched trade; none researched is an empty list',
  opts,
  async () => {
    const s = server(
      research(async () => gatheredBrief(), club.scriptedModel(JSON.stringify(needsReading())))
    )
    assert.deepEqual((await s.call('GET', '/templates')).body, { templates: [] })
    await s.run('POST', '/research', { links: ['https://larkfen-racquets.example/'] })
    const offered = (await s.call('GET', '/templates')).body.templates
    assert.deepEqual(
      offered.map((t) => t.slug),
      ['example-court']
    )
  }
)

test(
  'compose without a brand record of the business stops before any model call, never with the template look',
  opts,
  async () => {
    const model = club.scriptedModel()
    // The server's own brand step: the draft research holds no research revision for it.
    const s = server({ buildModel: async () => model, buildChatOn: async () => true })
    await researchedClub(s)
    const { started, ended } = await askPlan(s)
    assert.deepEqual(started.body, { step: 'brand', state: 'running' }, 'compose starts the brand step first')
    assert.equal(ended.body.state, 'stopped')
    assert.equal(ended.body.reason, 'brand-unavailable')
    assert.equal(model.calls.length, 0)
    const stored = await row(s)
    assert.equal(stored.plan, null, 'no plan reaches the draft')
    assert.equal(stored.fault.code, 'brand_input_missing')
    // Something that is not the brand step's look record is no brand: the composer refuses it (#616).
    for (const [brandStep, code] of [
      [async () => ({ website: { colors: [{ hex: '#1F7A4D', role: 'primary' }] } }), 'brand_missing'],
      [async () => null, 'brand_missing'],
      // The brand step kept the template accent for a logo whose colours were never measured: no rule of #616 reads it.
      [async () => recordOf(unmeasured(brands.saltmarshKayaks())), 'brand_logo_colours_unmeasured']
    ]) {
      const t = server({ buildModel: async () => model, brandStep, buildChatOn: async () => true })
      // A brand step that stopped for this template answers again as stopped: the next case starts afresh.
      await changeDraft(db.pool, await t.accountId(), () => ({ engine: null, brand: null }))
      assert.equal((await askPlan(t)).ended.body.reason, 'brand-unavailable', code)
      assert.equal((await row(t)).fault.code, code)
      assert.equal((await row(t)).plan, null)
    }
    assert.equal(model.calls.length, 0)
  }
)

test(
  'a business with no logo follows the rule of #616: the template accent, said to the owner',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
    const s = server({
      buildModel: async () => model,
      brandStep: async () => recordOf(brands.quaysidePianoCare()),
      buildChatOn: async () => true
    })
    await researchedClub(s)
    const { ended } = await askPlan(s)
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    const { plan } = ended.body.result
    assert.equal(plan.look.logo.kind, 'text', 'the temporary logo is a text logo on the plan')
    assert.ok(plan.assumptions.some((a) => a.field === 'look.logo' && /temporary/.test(a.said)))
  }
)

test('compose with the own brand puts a gated plan with the business colour in the draft', opts, async () => {
  const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
  const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
  await researchedClub(s)
  const { ended } = await askPlan(s)
  assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
  assert.equal(ended.body.result.brand, 'own')
  const { plan } = ended.body.result
  assert.equal(plan.look.accent, '#1f7a4d', 'the business colour, not the template accent #225588')
  assert.deepEqual((await row(s)).plan, plan)
  assert.equal(model.calls.length, 1)
  // Where the accent and the logo came from, as the composer answered them, kept and answered untouched.
  assert.equal(typeof ended.body.result.lookSources?.accent?.from, 'string')
  assert.deepEqual((await row(s)).brand.lookSources, ended.body.result.lookSources)
})

test(
  'choosing a template after research runs the brand step early and keeps its record; compose only reads it',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
    const seen = []
    const brandStep = async (input) => (seen.push(input), club.brand())
    const s = server({ buildModel: async () => model, brandStep, buildChatOn: async () => true })
    const { id } = await ensureAccount(db.pool, OWNER)
    await createDraft(db.pool, id)
    await changeDraft(db.pool, id, () => ({ research: clubResearch() }))
    const { accent: _accent, ...template } = club.template()
    const chosen = await s.call('PUT', '/template', { template })
    assert.equal(chosen.status, 200, JSON.stringify(chosen.body))
    await s.engine.settled(id)
    const read = await s.call('GET', '/engine')
    assert.deepEqual(read.body, { step: 'brand', state: 'done', result: { look: 'ready' } })
    assert.deepEqual((await row(s)).brand.record, club.brand())
    assert.equal(model.calls.length, 0, 'the brand step spends none of the build model')
    // Compose reads the stored record: one run, no brand step again.
    const { ended } = await s.run('POST', '/compose', {})
    assert.equal(ended.body.state, 'done', JSON.stringify(ended.body))
    assert.equal(seen.length, 1)
    // No record (new research writes none) while the plan lives: compose keeps the plan and runs nothing.
    await changeDraft(db.pool, id, () => ({ brand: null }))
    const kept = await s.run('POST', '/compose', {})
    assert.equal(kept.started.body.result.unchanged, true)
    assert.equal(seen.length, 1)
    // Starting over discards the plan: with no record, the brand step runs again first.
    assert.equal((await s.run('POST', '/compose', { restart: true })).ended.body.step, 'brand')
    assert.equal(seen.length, 2)
    assert.equal((await row(s)).plan, null, 'the restart discarded the plan')
  }
)

test(
  'a failure is run once more with the same inputs; a second failure stops and is recorded',
  opts,
  async () => {
    const boom = () => {
      throw new Error('the provider hung up')
    }
    const seen = []
    const brandStep = async (input) => (seen.push(input), club.brand())
    const once = club.scriptedModel(boom, JSON.stringify(club.goodComposition()))
    const s = server({ buildModel: async () => once, brandStep, buildChatOn: async () => true })
    await researchedClub(s)
    assert.equal((await askPlan(s)).ended.body.state, 'done')
    assert.equal(seen.length, 1, 'the brand step runs once: it keeps its own attempts')
    assert.equal(once.calls.length, 2)
    assert.deepEqual(once.calls[0], once.calls[1], 'the rerun read exactly the inputs of the first run')

    const twice = club.scriptedModel(boom, boom)
    const t = server({ buildModel: async () => twice, brandStep: ownBrand, buildChatOn: async () => true })
    // A draft holding a plan never composes again: the failing case starts without one.
    await changeDraft(db.pool, await t.accountId(), () => ({ plan: null }))
    const { ended } = await askPlan(t)
    assert.equal(ended.body.state, 'stopped')
    assert.equal(ended.body.reason, undefined)
    assert.deepEqual([(await row(t)).fault.code, (await row(t)).fault.attempts], ['step_failed', 2])
  }
)

test('a failure that says noRerun is never run again; a missing model stops at once', opts, async () => {
  const unreadable = club.scriptedModel('not json', 'still not json')
  const s = server({ buildModel: async () => unreadable, brandStep: ownBrand, buildChatOn: async () => true })
  await researchedClub(s)
  const { ended } = await askPlan(s)
  assert.equal(ended.body.state, 'stopped')
  assert.equal(unreadable.calls.length, 2, 'the composer own two attempts, no third')
  assert.deepEqual([(await row(s)).fault.code, (await row(s)).fault.attempts], ['plan_gate_failed', 1])

  const missing = server({
    buildModel: async () => {
      throw Object.assign(new Error('no model'), { code: 'model_missing', noRerun: true })
    },
    brandStep: ownBrand,
    buildChatOn: async () => true
  })
  const stopped = (await askPlan(missing)).ended.body
  assert.equal(stopped.state, 'stopped')
  assert.equal(stopped.ask, undefined, 'a system fault is never a question')
  assert.equal((await row(missing)).fault.code, 'model_missing')
})

test(
  'an edit applies to the current revision; a refused edit is 422 with owner sentences',
  opts,
  async () => {
    const s = server({
      buildModel: async () => club.scriptedModel(JSON.stringify(club.goodComposition())),
      brandStep: ownBrand,
      buildChatOn: async () => true
    })
    await researchedClub(s)
    const composed = (await askPlan(s)).ended.body.result.plan
    const item = composed.items[0].id
    const edited = await s.call('POST', '/edit', {
      changes: [{ field: `items[${item}].label`, value: 'Courts and coaching' }]
    })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    assert.equal(edited.body.step, 'edit')
    assert.equal(edited.body.result.plan.revision, composed.revision + 1)
    assert.equal(edited.body.result.plan.items[0].label, 'Courts and coaching')
    // Moving the plan to another template is refused in the owner's words; the plan stays on its own.
    const moved = await s.call('POST', '/edit', {
      changes: [{ field: 'look.template', value: { ...composed.look.template, slug: 'example-harbour' } }]
    })
    assert.equal(moved.status, 422)
    assert.deepEqual(moved.body.problems, [TEMPLATE_CHANGE_SAY])
    assert.equal((await row(s)).plan.look.template.slug, composed.look.template.slug)
    const refused = await s.call('POST', '/edit', { changes: [{ field: 'look.accent', value: 'red' }] })
    assert.equal(refused.status, 422)
    assert.ok(refused.body.problems.length > 0 && refused.body.problems.every((p) => typeof p === 'string'))
    assert.equal((await s.call('POST', '/edit', { changes: [] })).status, 400)
  }
)

test(
  'compose with no request on a draft that holds a plan keeps it with its edits; only a restart replaces it',
  opts,
  async () => {
    const model = club.scriptedModel(
      JSON.stringify(club.goodComposition()),
      JSON.stringify(club.goodComposition())
    )
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    await researchedClub(s)
    const composed = (await askPlan(s)).ended.body.result.plan
    const item = composed.items[0].id
    const field = `items[${item}].label`
    const edited = await s.call('POST', '/edit', { changes: [{ field, value: 'Courts and coaching' }] })
    assert.equal(edited.status, 200, JSON.stringify(edited.body))
    const revision = edited.body.result.plan.revision
    const before = await row(s)

    // Asked for again with no request: the composer is not run, the plan and its edit stay, and the owner reads it.
    const answered = await s.call('POST', '/compose', {})
    assert.equal(answered.status, 200, JSON.stringify(answered.body))
    assert.equal(answered.body.step, 'compose')
    assert.equal(answered.body.state, 'done')
    assert.equal(answered.body.say, UNCHANGED_SAY)
    assert.doesNotMatch(answered.body.say, DASHES)
    assert.equal(answered.body.result.unchanged, true)
    assert.equal(answered.body.result.brand, 'own')
    assert.equal(answered.body.result.plan.revision, revision)
    assert.equal(answered.body.result.plan.items[0].label, 'Courts and coaching')
    assert.equal(model.calls.length, 1, 'the composer ran once, for the first plan')
    const after = await row(s)
    assert.deepEqual(after.plan, before.plan)
    assert.deepEqual(after.last_edit, before.last_edit, 'the edit can still be undone')
    assert.deepEqual(after.engine, before.engine, 'the answer starts and records no step')

    // A restart is a separate intent: the plan and its edits are discarded and a new plan is composed.
    assert.equal((await s.call('POST', '/compose', { restart: 'yes' })).status, 400)
    const { started, ended } = await s.run('POST', '/compose', { restart: true })
    assert.deepEqual(started.body, { step: 'compose', state: 'running' })
    assert.equal(ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    assert.equal(ended.body.result.unchanged, undefined)
    const replaced = ended.body.result.plan
    assert.notEqual(replaced.id, composed.id)
    assert.notEqual(replaced.items[0].label, 'Courts and coaching', 'the edit went with the old plan')
    assert.equal(model.calls.length, 2)
    const stored = await row(s)
    assert.deepEqual(stored.plan, replaced)
    assert.deepEqual([stored.last_edit, stored.undo_edit], [null, null])
  }
)

/** The fake model's answer to a change request (#617): the changes and the entries not done. */
const revisionReply = (changes = [], notDone = []) => JSON.stringify({ changes, notDone })
/** The club's living plan, composed through the doors, with the owner's card edit of its first item. */
async function editedClub(s) {
  await researchedClub(s)
  const composed = (await askPlan(s)).ended.body.result.plan
  const field = `items[${composed.items[0].id}].label`
  const edited = await s.call('POST', '/edit', { changes: [{ field, value: 'Courts and coaching' }] })
  assert.equal(edited.status, 200, JSON.stringify(edited.body))
  return edited.body.result.plan
}

test(
  'a written change request on a living plan is revised by revisePlan: only what it names changes, the card edit stays',
  opts,
  async () => {
    const text = 'Please call the coaches page Our team.'
    const model = club.scriptedModel(
      JSON.stringify(club.goodComposition()),
      revisionReply([
        {
          op: 'rename_page',
          page: 'team',
          name: 'Our team',
          request: 'call the coaches page Our team',
          said: 'x'
        }
      ])
    )
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    const edited = await editedClub(s)
    const { started, ended } = await s.run('POST', '/compose', { request: text })
    assert.deepEqual(started.body, { step: 'revise', state: 'running' })
    assert.equal(ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    assert.equal(ended.body.step, 'revise')
    const { plan, unchanged, revision, brand } = ended.body.result
    assert.equal(model.calls.length, 2, 'the composer once, the change request once')
    assert.equal(JSON.parse(model.calls[1].user).request, text)
    assert.deepEqual([unchanged, brand], [false, 'own'])
    assert.equal(plan.id, edited.id)
    assert.equal(plan.revision, edited.revision + 1)
    assert.equal(plan.pages.find((p) => p.id === 'team').name, 'Our team')
    assert.equal(plan.items[0].label, 'Courts and coaching', 'the owner card edit is kept')
    assert.deepEqual(revision, { changed: ['The Coaches page is now called Our team.'], notDone: [] })
    const stored = await row(s)
    assert.deepEqual(stored.plan, plan)
    assert.deepEqual([stored.last_edit, stored.undo_edit], [null, null])
    // Read again later, the same answer.
    assert.deepEqual((await s.call('GET', '/engine')).body, ended.body)
  }
)

test(
  'a change request that changes nothing answers the same plan with what was not done; no fault',
  opts,
  async () => {
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()), revisionReply())
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    const edited = await editedClub(s)
    const before = await row(s)
    const { ended } = await s.run('POST', '/compose', { request: 'Make it pop.' })
    assert.equal(ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    assert.equal(ended.body.result.unchanged, true)
    assert.equal(ended.body.result.plan.revision, edited.revision)
    assert.ok(ended.body.result.revision.notDone.length >= 1)
    for (const entry of ended.body.result.revision.notDone) {
      assert.equal(typeof entry.why, 'string')
      assert.doesNotMatch(entry.why, DASHES)
    }
    const after = await row(s)
    assert.deepEqual([after.plan, after.last_edit, after.fault], [before.plan, before.last_edit, null])
  }
)

test(
  'a change request the gate refuses twice stops with one sentence; the fault keeps the problems and the request',
  opts,
  async () => {
    const unlinked = revisionReply([
      { op: 'remove_page', page: 'contact', request: 'tidy up the menu', said: 'Contact is removed.' }
    ])
    const model = club.scriptedModel(JSON.stringify(club.goodComposition()), unlinked, unlinked)
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    await editedClub(s)
    const before = await row(s)
    const text = 'Remove all the secondary pages.'
    const { ended } = await s.run('POST', '/compose', { request: text })
    assert.deepEqual(ended.body, {
      step: 'revise',
      state: 'stopped',
      say: SAY.revise,
      reason: 'revise-failed'
    })
    assert.doesNotMatch(SAY.revise, DASHES)
    assert.equal(model.calls.length, 3, 'two attempts of the change request, no rerun after noRerun')
    const { plan, fault } = await row(s)
    assert.deepEqual(plan, before.plan, 'the plan stays as it was')
    assert.equal(fault.code, 'plan_gate_failed')
    assert.equal(fault.request, text)
    assert.ok(
      fault.problems.length > 0 && fault.problems.every((p) => typeof p.code === 'string' && p.message)
    )
  }
)

test('a change request the plan moved past while the model worked writes nothing', opts, async () => {
  let s
  const model = club.scriptedModel(JSON.stringify(club.goodComposition()), async () => {
    // The owner edits the card meanwhile.
    await changeDraft(db.pool, await s.accountId(), (r) => ({
      plan: { ...r.plan, revision: r.plan.revision + 1 }
    }))
    return revisionReply([
      {
        op: 'rename_page',
        page: 'team',
        name: 'Our team',
        request: 'call the coaches page Our team',
        said: 'x'
      }
    ])
  })
  s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
  await editedClub(s)
  const { ended } = await s.run('POST', '/compose', { request: 'Please call the coaches page Our team.' })
  assert.deepEqual(ended.body, { step: 'revise', state: 'stopped', say: SAY.stale, reason: 'stale' })
  const stored = await row(s)
  assert.equal(stored.plan.pages.find((p) => p.id === 'team').name !== 'Our team', true)
  assert.equal(stored.fault, null, 'a moved plan is no fault')
})

test('a change request the model could never read is refused at the door, in plain words', opts, async () => {
  const model = club.scriptedModel(JSON.stringify(club.goodComposition()))
  const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
  await editedClub(s)
  const long = await s.call('POST', '/compose', { request: 'a'.repeat(1001) })
  assert.equal(long.status, 422)
  assert.deepEqual([long.body.code, long.body.problems], ['REQUEST_TOO_LONG', [requestTooLongSay(1000)]])
  const blank = await s.call('POST', '/compose', { request: String.fromCodePoint(0x200b) })
  assert.equal(blank.status, 422)
  assert.deepEqual(blank.body.problems, [REQUEST_EMPTY_SAY])
  assert.equal(model.calls.length, 1)
  assert.equal((await row(s)).fault, null)
})

test(
  'the draft keeps the whole settled profile: what the owner keeps off the site stays in it, marked held',
  opts,
  async () => {
    const c = club.goodComposition()
    c.pages.splice(1, 1)
    c.assumptions = []
    const s = server({
      buildModel: async () => club.scriptedModel(JSON.stringify(c)),
      brandStep: ownBrand,
      buildChatOn: async () => true
    })
    await researchedClub(s, { research: heldClubResearch('Racket club by the river') })
    assert.equal((await askPlan(s)).ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    const { needs_profile: kept, plan } = await row(s)
    assert.ok(kept.withheld, 'the withheld marker is kept')
    const people = JSON.stringify(kept.items)
    assert.ok(people.includes('Ilse Varrow'), 'a held person stays in the profile the edit gate reads')
    assert.equal(JSON.stringify(plan).includes('Ilse Varrow'), false, 'and never in the plan')

    // Bringing the held person back through an edit is refused in Part 3's neutral sentence: no id, no name.
    const held = Object.values(kept.items)
      .flat()
      .find((item) => JSON.stringify(item).includes('Ilse Varrow'))
    const page = plan.pages.find((p) => p.blocks.some((b) => b.data.length > 0))
    const block = page.blocks.find((b) => b.data.length > 0)
    const refused = await s.call('POST', '/edit', {
      changes: [{ field: `pages[${page.id}].blocks[${block.id}].data`, value: [...block.data, held.id] }]
    })
    assert.equal(refused.status, 422, JSON.stringify(refused.body))
    assert.equal(refused.body.problems.length, 1)
    assert.match(refused.body.problems[0], /stays off your site/)
    for (const leak of [held.id, 'Ilse Varrow', 'withheld_shown'])
      assert.equal(JSON.stringify(refused.body).includes(leak), false, leak)
  }
)

test('a step left running by a process that ended reads as stopped, with a fault', opts, async () => {
  let release
  const hanging = new Promise((resolve) => (release = resolve))
  const s = server({
    buildModel: async () => (await hanging, async () => '{}'),
    brandStep: ownBrand,
    buildChatOn: async () => true
  })
  await researchedClub(s, { brand: club.brand() })
  assert.equal((await s.call('POST', '/compose', {})).body.state, 'running')
  assert.equal((await s.call('GET', '/engine')).body.state, 'running', 'the same process still runs it')
  const restarted = server({ buildChatOn: async () => true })
  const read = await restarted.call('GET', '/engine')
  assert.equal(read.body.state, 'stopped')
  assert.equal((await row(s)).fault.code, 'step_interrupted')
  release()
  await s.engine.settled(await s.accountId())
  assert.equal((await restarted.call('GET', '/engine')).body.state, 'stopped', 'the old run changes nothing')
})

test('the composed plan and the done state of its step are one write', opts, async () => {
  const s = server({ buildChatOn: async () => true })
  await researchedClub(s)
  const id = await s.accountId()
  const composed = await composeClub()
  await changeDraft(db.pool, id, () => ({ engine: { step: 'compose', state: 'running', runner: 'gone' } }))
  assert.equal((await putComposed(db.pool, id, composed, { runner: 'other' })).error, 'NOT_RUNNING')
  assert.equal((await row(s)).plan, null, 'a step no longer this runner writes no plan')
  assert.equal((await putComposed(db.pool, id, composed, { runner: 'gone' })).error, undefined)
  // The process that wrote it is gone: the next read is done, not stopped.
  const read = await s.call('GET', '/engine')
  assert.equal(read.body.state, 'done')
  assert.equal(read.body.result.plan.id, composed.plan.id)
})

/** A draft researched before research kept `withheld`: only its stored brief holds the name and people off the site. */
const heldClubResearch = (siteName) => ({ ...clubResearch(), brief: heldClubBrief(siteName) })

test(
  'compose holds what the owner keeps off the site: the stored plan never shows the held name or people',
  opts,
  async () => {
    const c = club.goodComposition()
    c.pages.splice(1, 1)
    c.assumptions = []
    const model = club.scriptedModel(JSON.stringify(c))
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    await researchedClub(s, { research: heldClubResearch('Racket club by the river') })
    const { ended } = await askPlan(s)
    assert.equal(ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    const stored = JSON.stringify((await row(s)).plan)
    for (const held of ['Brindlewick', 'Ilse Varrow', 'Osric Vale'])
      assert.equal(stored.includes(held), false, held)
    assert.match(stored, /Racket club by the river/)
  }
)

/** The club's kit with a footer field that holds the business name in at most 20 characters. */
function limitKits() {
  const loadKit = (slug) => {
    const kit = kits.loadKit(slug)
    if (!kit) return kit
    const blockStore = structuredClone(kit.blockStore)
    blockStore.blocks
      .find((b) => b.id === 'footer-main')
      .fields.push({ name: 'brand', kind: 'business.name', type: 'text', limit: 20 })
    return { ...kit, blockStore }
  }
  return { ...kits, loadKit }
}
/** The owner's answer to a question, stored as the tool stores it: through the answers door, once. */
const answerWith = (s, question, text) =>
  s.call('PUT', '/answers', {
    question,
    answer: { schema: 'tracy-build-answer/v1', question: question.id, text }
  })

test(
  'a held name with nothing else to name the site asks the owner for a name, then the plan shows the typed name',
  opts,
  async () => {
    const c = club.goodComposition()
    c.pages.splice(1, 1)
    c.assumptions = []
    const model = club.scriptedModel(JSON.stringify(c))
    const s = server({ buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true })
    await researchedClub(s, { research: heldClubResearch(null) })
    const { ended } = await askPlan(s)
    assert.equal(ended.body.step, 'compose')
    assert.equal(ended.body.state, 'asking')
    assert.equal('say' in ended.body, false)
    const [question] = ended.body.result.questions
    assert.equal(question.id, 'site-name')
    assert.deepEqual(question.choices, [])
    assert.deepEqual(ended.body.result.ask.questions, [
      { id: 'site-name', question: question.prompt, options: [], multiSelect: false }
    ])
    assert.equal(model.calls.length, 0)
    assert.equal((await row(s)).fault, null, 'an open question is not a fault')
    assert.equal((await row(s)).plan, null)
    const stored = await answerWith(s, question, 'Riverside Courts')
    assert.equal(stored.status, 200, JSON.stringify(stored.body))
    const again = await askPlan(s)
    assert.equal(again.ended.body.state, 'done', JSON.stringify((await row(s)).fault))
    const plan = JSON.stringify((await row(s)).plan)
    for (const held of ['Brindlewick', 'Ilse Varrow', 'Osric Vale'])
      assert.equal(plan.includes(held), false, held)
    assert.deepEqual(
      (await row(s)).plan.facts.filter((f) => f.kind === 'business.name').map((f) => f.value),
      ['Riverside Courts']
    )
  }
)

test(
  'a site name longer than the design holds asks again with the limit; a shorter one is planned',
  opts,
  async () => {
    const c = club.goodComposition()
    c.pages.splice(1, 1)
    c.assumptions = []
    const model = club.scriptedModel(JSON.stringify(c))
    const s = server(
      { buildModel: async () => model, brandStep: ownBrand, buildChatOn: async () => true },
      limitKits()
    )
    await researchedClub(s, { research: heldClubResearch(null) })
    // The research card, read with the chosen template's kit, holds the question to its limit already.
    await changeDraft(db.pool, await s.accountId(), () => ({ engine: { step: 'research', state: 'done' } }))
    const card = await s.call('GET', '/engine')
    const question = card.body.result.questions.find((q) => q.id === 'site-name')
    assert.equal(question.freeText.maxLength, 20)
    // An answer stored against an older card (no kit yet, 120 characters) is longer than this design holds.
    const older = { ...question, freeText: { ...question.freeText, maxLength: 120 } }
    assert.equal((await answerWith(s, older, 'Riverside Courts and Racquets')).status, 200)
    const { ended } = await askPlan(s)
    assert.equal(ended.body.state, 'asking')
    assert.equal(
      ended.body.say,
      'That name is too long for this design. Please keep it to 20 characters or fewer.'
    )
    assert.equal(DASHES.test(ended.body.say), false)
    assert.equal(ended.body.result.questions[0].freeText.maxLength, 20)
    assert.equal(model.calls.length, 0)
    assert.equal((await row(s)).fault, null)
    assert.equal((await answerWith(s, ended.body.result.questions[0], 'Riverside Courts')).status, 200)
    const again = await askPlan(s)
    assert.equal(again.ended.body.state, 'done', JSON.stringify((await row(s)).fault))
  }
)

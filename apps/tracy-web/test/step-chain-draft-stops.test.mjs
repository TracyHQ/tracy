// The typed stops of a step chain run built from a build draft (#597 review): the run is pinned to the approved plan,
// a faulted draft or a plan the profile does not hold stops before any model work, the model door must answer a model,
// the kit must name its version, the write step of a draft run stops at once, and a page is written at most twice in
// one build whatever fails in which order. The invented florist, fakes only.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-stops.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { setUp } from './step-chain-draft-harness.mjs'
import { fakeBuildModel } from './step-chain-draft-fixtures.mjs'

const run = async (setup) => {
  try {
    return { ok: true, run: await setup.engine.prepare(setup.ctx) }
  } catch (error) {
    return { ok: false, error }
  }
}
const stopOf = (r) => (r.ok ? 'built' : `${r.error.stop?.step}:${r.error.stop?.code}`)
const attemptsOf = (r, step) =>
  (r.ok ? r.run.record : r.error.prepared.record).filter((x) => x.step === step).length

test('the run builds the plan its brief pins: a plan edited after Build stops before any model call', async () => {
  const s = await setUp()
  s.draft.approved.plan = { ...s.draft.approved.plan, revision: s.draft.approved.plan.revision + 1 }
  const r = await run(s)
  assert.equal(stopOf(r), 'kit:draft_changed')
  assert.equal(s.model.requests.length, 0)
  const bare = await setUp()
  bare.ctx.brief = { draftId: bare.ctx.brief.draftId }
  assert.equal(stopOf(await run(bare)), 'kit:draft_plan_ref_missing')
})

test('a plan showing an id the stored profile lacks, a faulted draft: typed stops, no model call', async () => {
  const mismatch = await setUp({
    mutate: (d) =>
      d.approved.plan.pages[0].blocks.find((b) => b.block === 'bouquets').data.push('service-added-later')
  })
  const r = await run(mismatch)
  assert.equal(stopOf(r), 'kit:draft_plan_profile_mismatch')
  assert.deepEqual(r.error.stop.details?.ids ?? r.error.details?.ids, ['service-added-later'])
  assert.equal(mismatch.model.requests.length, 0)
  const faulted = await setUp({ mutate: (d) => (d.engine.fault = { code: 'research_failed' }) })
  assert.equal(stopOf(await run(faulted)), 'kit:draft_faulted')
  assert.equal(faulted.model.requests.length, 0)
})

test('a plan whose template names no version stops typed at the kit', async () => {
  const s = await setUp({ mutate: (d) => delete d.approved.plan.look.template.version })
  const r = await run(s)
  assert.equal(stopOf(r), 'kit:aiq_kit_version_missing')
  assert.equal(attemptsOf(r, 'kit'), 1)
})

for (const [name, door] of [
  ['undefined', async () => undefined],
  ['null', async () => null],
  ['an object', async () => ({ call: true })]
])
  test(`a model door answering ${name} stops at the door check`, async () => {
    const s = await setUp({ buildModel: door })
    const r = await run(s)
    assert.equal(r.ok, false)
    assert.equal(r.error.stop?.step, 'doors')
    assert.match(String(r.error.stop?.error), /buildModel \(model_missing\)/)
  })

test('the write step of a draft run stops at once, typed, one attempt, nothing written', async () => {
  const s = await setUp()
  const prepared = await s.engine.prepare(s.ctx)
  const wrote = await s.engine.apply(s.ctx, prepared).then(
    () => null,
    (e) => e
  )
  assert.equal(wrote?.stop?.code, 'write_not_ready_for_draft')
  assert.equal(prepared.record.filter((x) => x.step === 'write').length, 1)
})

/** A model that counts writer calls per page and fails them by `rule(page, call, rewrite)`. */
function counting(rule, writer) {
  const base = fakeBuildModel({ writer })
  const calls = {}
  const model = async (req) => {
    if (req.system === PAGE_WRITER_PROMPT) {
      const user = JSON.parse(req.user)
      calls[user.page.id] = (calls[user.page.id] ?? 0) + 1
      if (rule(user.page.id, calls[user.page.id], Boolean(user.rewrite))) throw new Error('socket hang up')
    }
    return base(req)
  }
  return Object.assign(model, { requests: base.requests, calls })
}
const SAME = 'All our flowers are grown and tied by our own small team.'
const repeating = (always) => (slot, rewrite) =>
  slot.kind === 'business.copyright' && (always || !rewrite) ? SAME : undefined

const ORDERS = [
  ['the first call of one page fails once', (page, n) => page === 'bouquet' && n === 1, undefined, 'built'],
  ['the first call of every page always fails', () => true, undefined, 'copy:writer_call_failed'],
  ['the rewrite call fails', (_p, _n, rewrite) => rewrite, repeating(false), 'copy:writer_call_failed'],
  ['the check fails twice', () => false, repeating(true), 'copy:copy_check_failed'],
  [
    'a first call fails, then the second attempt fails its check',
    (page, n) => page === 'bouquet' && n === 1,
    repeating(true),
    'copy:copy_check_failed'
  ],
  ['the check fails once, the rewrite passes', () => false, repeating(false), 'built']
]
for (const [name, rule, writer, stop] of ORDERS)
  test(`a page is written at most twice in one build: ${name}`, async () => {
    const model = counting(rule, writer)
    const s = await setUp({ model })
    const r = await run(s)
    assert.equal(stopOf(r), stop)
    const pages = Object.keys(model.calls)
    assert.equal(pages.length, 3)
    for (const page of pages) assert.ok(model.calls[page] <= 2, `${page}: ${model.calls[page]} calls`)
    assert.ok(attemptsOf(r, 'copy') <= 2)
  })

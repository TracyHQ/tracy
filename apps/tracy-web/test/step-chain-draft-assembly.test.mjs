// A step chain run built from an approved build draft (#597): the real frame (`createStepChainEngine`) over the real
// steps (`createStepChainSteps`), the draft doors, the build model door, the draft pictures store and the pool all
// fakes, the invented florist of `step-chain-draft-fixtures.mjs`. Draft in, write order out. No database, no network,
// no real model.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/step-chain-draft-assembly.test.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { PLAN_COMPOSER_PROMPT } from 'website-opportunities/domain/plan-composer.mjs'
import { ownershipOf } from 'website-opportunities/domain/pictures/picture-links.mjs'
import { checkWriteOrder } from 'website-opportunities/domain/write-order-check.mjs'
import { createStepChainEngine, STEP_CHAIN_STOPPED } from '../src/sites/brief-engines/step-chain.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import {
  ACCOUNT_ID,
  DRAFT_ID,
  HELD_NAME,
  HELD_PERSON,
  SITE_NAME,
  fakeBuildModel,
  floristDraft,
  floristIcons
} from './step-chain-draft-fixtures.mjs'

const records = mkdtempSync(path.join(tmpdir(), 'step-chain-draft-'))
after(() => rmSync(records, { recursive: true, force: true }))

/** A pool no assembled step may use: every query fails the test. */
const pool = {
  async query(sql) {
    throw new Error(`no query expected on an assembled run: ${sql}`)
  }
}

/** The engine over the real steps with fake doors; `opened` lists the draft pictures the store was asked for. */
async function setUp({ model = fakeBuildModel(), pictureBytes } = {}) {
  const draft = await floristDraft()
  const opened = []
  const reads = { engine: 0, approved: 0, door: 0 }
  const steps = createStepChainSteps({
    pool,
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: records,
    draft: {
      readEngineDraft: async (accountId) => (reads.engine++, accountId === ACCOUNT_ID ? draft.engine : null),
      draftPlanForBuild: async (accountId) => (
        reads.approved++, accountId === ACCOUNT_ID ? draft.approved : null
      ),
      loadAiqKit: (slug) => (slug === draft.kit.template.slug ? draft.kit : null),
      buildModel: async () => (reads.door++, model),
      openDraftPicture: async (id, { accountId }) => {
        opened.push({ id, accountId })
        const bytes = pictureBytes ? pictureBytes(id) : id === 'draft-picture-3' ? null : Buffer.from(id)
        return bytes ? { id, bytes, mime: 'image/png' } : null
      },
      iconLibrary: floristIcons
    }
  })
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({}) })
  const ctx = {
    runId: 'run-meadowlight-1',
    accountId: ACCOUNT_ID,
    email: 'owner@meadowlight.example',
    brief: { draftId: DRAFT_ID },
    signal: new AbortController().signal,
    progress: async () => {}
  }
  return { engine, steps, ctx, draft, model, opened, reads }
}

test('draft in, write order out: no plan is composed, nothing held reaches the model, the order passes its check', async () => {
  // The vision call labels the first photo with the held reviewer's name: the alt hand-off must not carry it.
  let first = true
  const label = () => (first ? ((first = false), `${HELD_PERSON} at the counter`) : undefined)
  const { engine, ctx, model, opened, reads } = await setUp({ model: fakeBuildModel({ label }) })
  const run = await engine.prepare(ctx)
  // Every step once and done; brand and plan run side by side, so only their set is fixed.
  const steps = run.record.map((r) => `${r.step}:${r.outcome}`)
  assert.deepEqual(steps.slice(0, 2), ['doors:done', 'kit:done'])
  assert.deepEqual(new Set(steps.slice(2, 4)), new Set(['brand:done', 'plan:done']))
  assert.deepEqual(new Set(steps.slice(4, 6)), new Set(['copy:done', 'pictures:done']))
  assert.deepEqual(steps.slice(6), ['icons:done', 'order:done'])
  // (a) The approved plan is built: no call carries the composer's prompt, and the draft is read once per run.
  assert.equal(model.requests.filter((r) => r.system === PLAN_COMPOSER_PROMPT).length, 0)
  assert.deepEqual(reads, { engine: 1, approved: 1, door: 4 })
  // Every model call of the chain went through the one build model door: the door check, then the writer, the
  // labelling and the icon ranking each resolved it and called what it answered.
  const kinds = model.requests.map((r) =>
    r.images?.length ? 'vision' : r.system === PAGE_WRITER_PROMPT ? 'writer' : 'icons'
  )
  assert.deepEqual([...new Set(kinds)].sort(), ['icons', 'vision', 'writer'])
  // (b) No request to the model names the held business name or the held reviewer.
  const sent = JSON.stringify(model.requests)
  assert.ok(!sent.includes(HELD_NAME), 'the held business name reached the model')
  assert.ok(!sent.includes(HELD_PERSON), 'the held reviewer reached the model')
  assert.ok(sent.includes(SITE_NAME))
  // (c) One copy step, every page at most two writer calls (the first writing and one rewrite).
  assert.equal(run.record.filter((r) => r.step === 'copy').length, 1)
  for (const page of run.inputs.copy.pages) assert.ok(page.attempts.length <= 2, page.id)
  // (d) The draft pictures are opened for this account: one used as the owner's own, the pruned one missing.
  assert.ok(opened.every((o) => o.accountId === ACCOUNT_ID))
  const { draft } = run.inputs.pictures
  assert.ok(draft.used.includes('draft-picture-1'))
  assert.deepEqual(draft.missing, ['draft-picture-3'])
  assert.equal(ownershipOf({ id: 'draft-picture-1', origin: 'draft' }, SITE_NAME), 'owner')
  const own = run.inputs.pictures.frames.filter((f) => f.source === 'own')
  assert.ok(own.length > 0 && run.inputs.pictures.counts.own === own.length)
  // The vision call saw the stored bytes, never the web address, of an opened draft picture.
  const vision = model.requests.find((r) => r.images?.length)
  assert.ok(vision.images.some((i) => i.startsWith('data:image/png;base64,')))
  // (e) The write order passes its check; every placed picture has an alt that names nothing held.
  const { order } = run.inputs.order
  assert.deepEqual(checkWriteOrder(order), [])
  const placed = order.pictures.filter((p) => ['own', 'generated', 'initials'].includes(p.source))
  assert.ok(placed.length > 0)
  for (const p of placed) {
    assert.ok(typeof p.alt === 'string' && p.alt.trim() !== '', p.frame)
    assert.ok(!p.alt.includes(HELD_PERSON) && !p.alt.includes(HELD_NAME), p.alt)
  }
  // The photo the vision call labelled with the held name says the site name instead; the pruned one is hidden.
  const counter = order.pictures.find((p) => p.frame.includes('counter'))
  assert.equal(counter.alt, SITE_NAME)
  assert.ok(order.hidden.some((h) => h.at.includes('window')))
  assert.ok(!order.pictures.some((p) => p.frame.includes('window')))
  // The record keeps the in-memory values by their own small record, never the whole profile.
  assert.ok(!JSON.stringify(run.record).includes(HELD_PERSON))
  await engine.dispose(run)
})

/** A writer that writes one sentence in the copyright line of every page, also on its rewrite when `stubborn`. */
const repeating = (stubborn) =>
  fakeBuildModel({
    writer: (slot, rewrite) =>
      slot.kind === 'business.copyright' && (stubborn || !rewrite)
        ? 'All our flowers are grown and tied by our own small team.'
        : undefined
  })

test('a repeat across pages is found by the site check once and fixed by the one rewrite of the later pages', async () => {
  const { engine, ctx } = await setUp({ model: repeating(false) })
  const run = await engine.prepare(ctx)
  const calls = Object.fromEntries(run.inputs.copy.pages.map((p) => [p.id, p.attempts.length]))
  assert.deepEqual(calls, { home: 1, bouquet: 2, contact: 2 })
  assert.equal(run.record.filter((r) => r.step === 'copy').length, 1)
  assert.deepEqual(checkWriteOrder(run.inputs.order.order), [])
})

test('a copy that still repeats after its one rewrite stops the build at copy, once, naming pages and codes', async () => {
  const { engine, ctx, model } = await setUp({ model: repeating(true) })
  const error = await engine.prepare(ctx).catch((e) => e)
  assert.equal(error.code, STEP_CHAIN_STOPPED)
  assert.equal(error.stop.step, 'copy')
  assert.equal(error.stop.code, 'copy_check_failed')
  assert.equal(error.stop.attempts, 1)
  assert.deepEqual(
    error.stop.details.failing.map((f) => [f.page, f.key.endsWith('copyright') || f.key, f.problems[0].code]),
    [
      ['bouquet', true, 'repeated_copy'],
      ['contact', true, 'repeated_copy']
    ]
  )
  // Three first writings and two rewrites: no third call for any page, and nothing after the copy step.
  assert.equal(model.requests.filter((r) => JSON.parse(r.user ?? '{}').blocks).length, 5)
  assert.ok(!error.chain || !JSON.stringify(error.chain).includes('"order"'))
})

test('a draft run checks the build model door before any work, and an empty door stops it up front', async () => {
  const { steps, ctx } = await setUp()
  assert.deepEqual(await steps.doors(ctx), [])
  const empty = createStepChainSteps({
    pool,
    config: {},
    secret: 's'.repeat(32),
    log: {},
    recordsDir: records,
    draft: {
      buildModel: async () => {
        throw Object.assign(new Error('no door'), { code: 'model_missing' })
      }
    }
  })
  assert.deepEqual(await empty.doors(ctx), [{ door: 'buildModel', state: 'model_missing' }])
  const engine = createStepChainEngine({ steps: empty, applyFor: () => async () => ({}) })
  const error = await engine.prepare(ctx).catch((e) => e)
  assert.equal(error.code, STEP_CHAIN_STOPPED)
  assert.equal(error.stop.step, 'doors')
})

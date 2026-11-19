// A plan the composer's gate accepted is read by every later stage of the build against the same plan data the gate
// held it to (#575 stand: the build's input check read the bare profile and stopped on the brief's WhatsApp link).
// One function makes that data from a profile and its plan (`planDataOfPlan`); a stage that makes it from the profile
// alone, once the plan exists, misses what the composer added (brief channels, item field facts). Locked two ways:
// every composed plan's ids are known to the writer's context, and no build source calls `planDataOf` itself.
// Invented club, scripted fake model.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-plan-later-stages.test.mjs
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { writerContextOf } from '../domain/page-writer-context.mjs'
import { siteCopyError } from '../domain/page-writer-site-check.mjs'
import { gateOperatedPlan } from '../domain/plan-edit-gate.mjs'
import { revisePlan } from '../domain/plan-request.mjs'
import { COMPOSED_PLANS, composedWithChannels } from './fixtures/plan-composer/composed-plans.mjs'
import { answer, firstPlan, kit, revision } from './fixtures/plan-composer/plan-request.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const shownIds = (plan) => plan.pages.flatMap((p) => p.blocks.flatMap((b) => b.data))

/** Every id the plan shows is known to the page writer's plan data, which the write order reads too. */
function assertKnown({ plan, profile, kit: k }, name) {
  const context = writerContextOf({ profile, plan, blockStore: k.blockStore, library: k.library ?? [] })
  const known = (id) => context.data.byId.has(id) || context.data.rowsById?.has?.(id) === true
  assert.deepEqual(
    shownIds(plan).filter((id) => !known(id)),
    [],
    name
  )
}

test('every plan the composer accepts is known whole to the page writer', async () => {
  for (const [name, make] of Object.entries(COMPOSED_PLANS)) assertKnown(await make(), name)
})

test('a plan after card operations and after a change request is known whole to the page writer', async () => {
  const start = await composedWithChannels()
  const out = gateOperatedPlan({
    plan: start.plan,
    profile: start.profile,
    edit: {
      schema: 'tracy-build-plan-edit/v1',
      id: 'op-1',
      plan: { id: start.plan.id, revision: start.plan.revision },
      operation: { op: 'remove-key-message', message: start.plan.keyMessages[0].id }
    },
    review: { base: start, removals: [] },
    removal: 'removal-1',
    ...start.kit
  })
  assert.equal(out.ok, true, JSON.stringify(out.problems))
  assertKnown({ plan: out.plan, profile: out.profile, kit: start.kit }, 'after an operation')
  const first = await firstPlan()
  const reviews = first.plan.pages[0].blocks.find((b) => b.type === 'reviews' || b.block === 'reviews-strip')
  const { input } = revision(
    first,
    'Remove the reviews.',
    answer([{ op: 'remove_block', page: 'home', block: reviews.id, request: 'Remove the reviews' }])
  )
  const revised = await revisePlan(input)
  assert.equal(revised.unchanged, false, JSON.stringify(revised.problems ?? revised.notDone))
  assertKnown({ plan: revised.plan, profile: revised.profile, kit: kit() }, 'after a change request')
})

test('the site check reads the plan data of the plan it is given', async () => {
  const { plan, profile } = await composedWithChannels()
  assert.equal(siteCopyError({ pages: [], profile, plan }), null)
})

/** The source files of the domain and of tracy-web's build path, with their text. */
function sources() {
  const domain = path.resolve(here, '../domain')
  const web = path.resolve(here, '../../../../apps/tracy-web/src')
  const files = readdirSync(domain)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => path.join(domain, f))
  for (const dir of [web, path.join(web, 'build-draft')])
    for (const f of readdirSync(dir))
      if (/^(step-chain|build-draft|engine|build-)/.test(f) || dir.endsWith('build-draft'))
        if (f.endsWith('.js')) files.push(path.join(dir, f))
  return files.map((f) => [path.relative(path.resolve(here, '../../../..'), f), readFileSync(f, 'utf8')])
}

test('no build stage makes its plan data from the profile alone: one shared function does', () => {
  // The plan data of a profile alone is `planDataOf`; only the shared function calls it, and the composer's own
  // context (before a plan exists) goes through it too.
  const allowed = new Set(['plan-data-of-plan.mjs', 'plan-data.mjs'])
  const calls = sources()
    .filter(([file]) => !allowed.has(path.basename(file)))
    .filter(([, text]) => /\bplanDataOf\(/.test(text))
    .map(([file]) => file)
  assert.deepEqual(calls, [])
})

// The harness of the assembled step chain tests (#597): the real frame over the real steps, with fake draft doors, a
// fake build model door, a fake draft pictures store and a pool no assembled step may use.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after } from 'node:test'
import { createStepChainEngine } from '../src/sites/brief-engines/step-chain.js'
import { createStepChainSteps } from '../src/step-chain-steps.js'
import {
  ACCOUNT_ID,
  DRAFT_ID,
  fakeBuildModel,
  floristDraft,
  floristIcons
} from './step-chain-draft-fixtures.mjs'

export const records = mkdtempSync(path.join(tmpdir(), 'step-chain-draft-'))
after(() => rmSync(records, { recursive: true, force: true }))

/** A pool no assembled step may use: every query fails the test. */
export const pool = {
  async query(sql) {
    throw new Error(`no query expected on an assembled run: ${sql}`)
  }
}

/** The approved plan a run is pinned to, as the build chat passes it: `brief.plan`. */
export const planRefOf = (draft) => ({ id: draft.approved.plan.id, revision: draft.approved.plan.revision })

/**
 * The engine over the real steps with fake doors; `opened` lists the draft pictures the store was asked for.
 * `mutate(draft)` changes the stored draft before the run (the brief pins the plan as it then is); `doors` replaces
 * draft doors; `buildModel` replaces the build model door's resolver.
 */
export async function setUp({
  model = fakeBuildModel(),
  pictureBytes,
  heldInPlan = false,
  mutate,
  doors = {},
  buildModel
} = {}) {
  const draft = await floristDraft({ heldInPlan })
  if (mutate) await mutate(draft)
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
      buildModel: buildModel ?? (async () => (reads.door++, model)),
      openDraftPicture: async (id, { accountId }) => {
        opened.push({ id, accountId })
        const bytes = pictureBytes ? pictureBytes(id) : id === 'draft-picture-3' ? null : Buffer.from(id)
        return bytes ? { id, bytes, mime: 'image/png' } : null
      },
      iconLibrary: floristIcons,
      ...doors
    }
  })
  const engine = createStepChainEngine({ steps, applyFor: () => async () => ({}) })
  const ctx = {
    runId: 'run-meadowlight-1',
    accountId: ACCOUNT_ID,
    email: 'owner@meadowlight.example',
    brief: { draftId: DRAFT_ID, plan: planRefOf(draft) },
    signal: new AbortController().signal,
    progress: async () => {}
  }
  return { engine, steps, ctx, draft, model, opened, reads }
}

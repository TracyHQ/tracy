// Shared set-up of the rebuild tests (#612): the real draft steps of Part 3 (`step-chain-draft-steps.js`) on the
// invented florist's memory site (`draft-revision-fixtures.mjs`), with a build store given as `deps.builds` and the
// site key in the run's ctx, as the step chain gives it. Invented data only.
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { ACCOUNT, DRAFT, depsOf, draftOf, revisionModel } from './draft-revision-fixtures.mjs'

/**
 * The draft steps of Part 3 run once in the frame's order on a memory site, with `store` as `deps.builds`; a revision
 * when `rebuildFrom` names a build. Answers the plan step's value and the write step's value.
 */
export async function runOn({ memory, store, site, revised, runId, rebuildFrom, record = {} }) {
  const steps = createDraftSteps({
    ...depsOf({ draft: draftOf(revised), model: revisionModel(), memory, record }),
    builds: store
  })
  const plan = revised?.plan ?? draftOf().approved.plan
  const ctx = {
    runId,
    accountId: ACCOUNT,
    siteKey: site.siteKey,
    brief: {
      draftId: DRAFT,
      plan: { id: plan.id, revision: plan.revision },
      ...(rebuildFrom ? { rebuildFrom } : {})
    },
    signal: new AbortController().signal
  }
  const value = async (name, inputs) => (await steps[name](ctx, inputs, { signal: ctx.signal })).value
  const kit = await value('kit', {})
  const planned = await value('plan', { kit })
  const made = {
    kit,
    plan: planned,
    copy: await value('copy', { kit, plan: planned }),
    pictures: await value('pictures', { kit, plan: planned })
  }
  const icons = await value('icons', made)
  const order = await value('order', { ...made, icons })
  return { planned, write: await value('write', { ...made, icons, order }) }
}

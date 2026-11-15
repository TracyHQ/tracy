// Test helper (#612): the revision run of a built site on the REAL site wiring (`step-chain-draft-site.js`) and
// transport (`step-chain-draft-send.js`), the door client a stand-in over the memory site (`draft-site-doors-memory.mjs`),
// its run record saved through a run record store (`step-chain-draft-run-records.js`). Each call makes NEW draft steps,
// as a new process would: only the stores passed in (the build Map, the run record store) outlive it. Invented data.
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { ACCOUNT, DRAFT, depsOf, draftOf, revisionModel } from './draft-revision-fixtures.mjs'
import { applyOverMemory, memorySiteDoors } from './draft-site-doors-memory.mjs'

export const SITE_KEY = 'site-larkspur-1'
export const EMAIL = 'owner@larkspur-florist.example'

/**
 * The revision `revised` on the site of `first` (`firstBuild` of `draft-revision-run.mjs`), as run `runId`, from a new
 * set of draft steps over `runRecords`.
 * @returns {Promise<{run?: object, error?: object, writes: number, over: object}>}
 */
export async function siteRevision(first, revised, { runId, runRecords, from = first.ref }) {
  const over = applyOverMemory(first.memory)
  const { draftWrite, ...deps } = depsOf({
    draft: draftOf(revised),
    model: revisionModel(),
    memory: first.memory,
    builds: first.builds
  })
  const steps = createDraftSteps({
    ...deps,
    runRecords,
    site: {
      siteDoors: memorySiteDoors(first.memory),
      publicFile: over.publicFile,
      filePresence: over.filePresence,
      blankContract: () => draftWrite.blankContract(),
      pictures: { stored: (order) => draftWrite.stored(order), openStored: (id) => draftWrite.openStored(id) }
    }
  })
  const signal = new AbortController().signal
  const ctx = {
    runId,
    siteKey: SITE_KEY,
    accountId: ACCOUNT,
    email: EMAIL,
    brief: {
      draftId: DRAFT,
      plan: { id: revised.plan.id, revision: revised.plan.revision },
      rebuildFrom: from,
      buildRun: runId
    },
    signal,
    applied: () => {}
  }
  const how = { signal, door: { apply: over.applyFor(EMAIL, runId) } }
  const before = first.memory.calls
  const out = { over }
  try {
    const value = async (name, inputs) => (await steps[name](ctx, inputs, how)).value
    const kit = await value('kit', {})
    const plan = await value('plan', { kit })
    const copy = await value('copy', { kit, plan })
    const pictures = await value('pictures', { kit, plan })
    const made = { kit, plan, copy, pictures }
    const icons = await value('icons', made)
    const order = await value('order', { ...made, icons })
    out.run = { plan, write: await value('write', { ...made, icons, order }) }
  } catch (error) {
    out.error = error
  }
  out.writes = first.memory.calls - before
  return out
}

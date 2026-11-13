// The build draft a step chain run is assembled from (#597): the plan the customer approved in the build chat and the
// needs profile it was gated with, read once per run through the doors `app.js` injects (`readEngineDraft`,
// `draftPlanForBuild` of `build-draft/store.js`; that folder is never imported from here, `module-graph` holds it).
//
// A run is assembled from a draft when its brief names the draft (`ctx.brief.draftId`) and the run knows its account
// (`ctx.accountId`). Every other run keeps the bench chain. The draft is read at most once per run: every step of the
// run reads the same plan and profile, and a draft that changed or vanished stops the build before any model work.

/** A typed failure of an assembled step: `code` for the record, `noRerun` when a second attempt cannot help. */
export function draftError(code, message, details = {}, { noRerun = true } = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code, details, noRerun })
}

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Whether a run is built from an approved build draft. */
export const isDraftRun = (ctx) => isText(ctx?.brief?.draftId)

/**
 * The draft of a run, read once and checked: the same draft on both reads, the draft the run was started for, a plan
 * with pages and the gated profile beside it.
 * @param {{readEngineDraft: Function, draftPlanForBuild: Function}} doors
 * @param {{accountId?: string | null, brief: {draftId: string}}} ctx
 * @returns {Promise<{draftId: string, plan: object, lastEdit: object | null, profile: object, research: object | null}>}
 */
async function readRunDraft({ readEngineDraft, draftPlanForBuild }, ctx) {
  const wanted = ctx.brief.draftId
  if (typeof readEngineDraft !== 'function' || typeof draftPlanForBuild !== 'function')
    throw draftError('draft_doors_missing', 'this server reads no build draft for a step chain run')
  if (!isText(ctx.accountId))
    throw draftError(
      'draft_account_missing',
      'a run built from a draft names the account the draft belongs to'
    )
  const [engine, approved] = await Promise.all([
    readEngineDraft(ctx.accountId),
    draftPlanForBuild(ctx.accountId)
  ])
  if (!engine || !approved?.plan)
    throw draftError('draft_missing', `the account has no build draft with a plan (wanted ${wanted})`)
  if (engine.draftId !== wanted || approved.draftId !== wanted)
    throw draftError('draft_changed', `the build draft is not the one the run was started for (${wanted})`, {
      wanted,
      found: approved.draftId ?? engine.draftId ?? null
    })
  if (!Array.isArray(approved.plan.pages) || approved.plan.pages.length === 0)
    throw draftError('draft_plan_empty', 'the approved plan has no pages')
  if (!engine.needsProfile || typeof engine.needsProfile !== 'object')
    throw draftError('draft_profile_missing', 'the approved plan has no needs profile beside it')
  return {
    draftId: wanted,
    plan: approved.plan,
    lastEdit: approved.lastEdit ?? null,
    profile: engine.needsProfile,
    research: engine.research ?? null
  }
}

/**
 * The drafts of the runs going on: `of(ctx)` reads a run's draft once (a failed read is read again by the step's one
 * re-run), `forget(runId)` lets it go when the run is disposed.
 * @param {{readEngineDraft?: (accountId: string) => Promise<object | null>,
 *   draftPlanForBuild?: (accountId: string) => Promise<object | null>}} doors
 */
export function draftSource(doors) {
  const reads = new Map()
  return {
    of(ctx) {
      if (!reads.has(ctx.runId)) {
        const read = readRunDraft(doors, ctx)
        reads.set(ctx.runId, read)
        read.catch(() => {
          if (reads.get(ctx.runId) === read) reads.delete(ctx.runId)
        })
      }
      return reads.get(ctx.runId)
    },
    forget(runId) {
      reads.delete(runId)
    }
  }
}

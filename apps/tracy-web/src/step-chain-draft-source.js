// The build draft a step chain run is assembled from (#597): the plan the customer approved in the build chat and the
// needs profile it was gated with, read once per run through the doors `app.js` injects (`readEngineDraft`,
// `draftPlanForBuild` of `build-draft/store.js`; that folder is never imported from here, `module-graph` holds it).
//
// A run is assembled from a draft when its brief names the draft (`ctx.brief.draftId`) and the run knows its account
// (`ctx.accountId`). Every other run keeps the bench chain. The brief also pins the plan the customer approved
// (`ctx.brief.plan: {id, revision}`): the build is that plan or nothing. The draft is read at most once per run, plan,
// engine draft, plan again (the doors answer in two queries, so the plan is read on both sides of the engine read and
// must be the same revision both times); every step of the run reads the same plan and profile, and a draft that
// changed, vanished, carries a fault, lost its research or no longer matches its plan stops the build before any model
// work.
import { planWithoutWithheld, unknownPlanIdsOf } from './step-chain-draft-plan.js'

/** At most this many ids of a plan that does not match its profile are named in the stop report. */
const IDS_KEPT = 20

/** A typed failure of an assembled step: `code` for the record, `noRerun` when a second attempt cannot help. */
export function draftError(code, message, details = {}, { noRerun = true } = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code, details, noRerun })
}

const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Whether a run is built from an approved build draft. */
export const isDraftRun = (ctx) => isText(ctx?.brief?.draftId)

/** The approved plan a draft run is pinned to (`brief.plan`), or null when the brief does not pin one. */
const pinnedPlanOf = (brief) => {
  const pin = brief?.plan
  return isText(pin?.id) && Number.isInteger(pin?.revision) ? { id: pin.id, revision: pin.revision } : null
}
const samePlan = (plan, pin) => plan?.id === pin.id && plan?.revision === pin.revision

/**
 * The draft of a run, read once and checked: the plan pinned by the brief on both sides of the engine read, the draft
 * the run was started for, a plan with pages, the gated profile and the research beside it, no fault, and a plan that
 * shows only what the profile holds.
 * @param {{readEngineDraft: Function, draftPlanForBuild: Function}} doors
 * @param {{accountId?: string | null, brief: {draftId: string, plan?: {id: string, revision: number}}}} ctx
 * @returns {Promise<{draftId: string, plan: object, lastEdit: object | null, profile: object, research: object}>}
 */
async function readRunDraft({ readEngineDraft, draftPlanForBuild }, ctx) {
  const wanted = ctx.brief.draftId
  if (typeof readEngineDraft !== 'function' || typeof draftPlanForBuild !== 'function')
    throw draftError('draft_doors_missing', 'this server reads no build draft for a step chain run')
  const pin = pinnedPlanOf(ctx.brief)
  if (!pin)
    throw draftError(
      'draft_plan_ref_missing',
      'a run built from a draft names the approved plan it builds: brief.plan {id, revision}'
    )
  if (!isText(ctx.accountId))
    throw draftError(
      'draft_account_missing',
      'a run built from a draft names the account the draft belongs to'
    )
  const approved = await draftPlanForBuild(ctx.accountId)
  const engine = await readEngineDraft(ctx.accountId)
  const again = await draftPlanForBuild(ctx.accountId)
  if (!engine || !approved?.plan || !again?.plan)
    throw draftError('draft_missing', `the account has no build draft with a plan (wanted ${wanted})`)
  const changed = (found) =>
    draftError('draft_changed', `the build draft is not the one the run was started for (${wanted})`, {
      wanted,
      plan: pin,
      found
    })
  if (engine.draftId !== wanted || approved.draftId !== wanted || again.draftId !== wanted)
    throw changed({ draftId: approved.draftId ?? engine.draftId ?? null })
  if (!samePlan(approved.plan, pin) || !samePlan(again.plan, pin))
    throw changed({
      plan: { id: again.plan.id ?? null, revision: again.plan.revision ?? null },
      ...(samePlan(approved.plan, again.plan) ? {} : { moved: true })
    })
  if (!Array.isArray(approved.plan.pages) || approved.plan.pages.length === 0)
    throw draftError('draft_plan_empty', 'the approved plan has no pages')
  if (!engine.needsProfile || typeof engine.needsProfile !== 'object')
    throw draftError('draft_profile_missing', 'the approved plan has no needs profile beside it')
  if (engine.fault) {
    const code = typeof engine.fault?.code === 'string' ? engine.fault.code : 'unknown'
    throw draftError('draft_faulted', `the build draft carries a fault (${code})`, { fault: code })
  }
  if (!engine.research || typeof engine.research !== 'object')
    throw draftError('draft_research_missing', 'the approved plan has no research beside it')
  const unknown = unknownPlanIdsOf(approved.plan, engine.needsProfile)
  if (unknown.length) {
    const ids = [...new Set(unknown.map((u) => u.id))]
    throw draftError(
      'draft_plan_profile_mismatch',
      `the approved plan shows ${ids.length} id(s) the stored needs profile does not hold: ${ids.slice(0, IDS_KEPT).join(', ')}`,
      { ids: ids.slice(0, IDS_KEPT), idsCount: ids.length, at: unknown.slice(0, IDS_KEPT) }
    )
  }
  return {
    draftId: wanted,
    plan: planWithoutWithheld(approved.plan, engine.needsProfile),
    lastEdit: approved.lastEdit ?? null,
    profile: engine.needsProfile,
    research: engine.research
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

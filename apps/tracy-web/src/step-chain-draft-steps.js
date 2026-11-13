// The steps of a step chain run assembled from an approved build draft (#597): the domain steps of the AI quickstart
// build in the chain's frame (`sites/brief-engines/step-chain.js`), from the kit to the write order and its write on
// the blank site (`write` below). A run not built from a draft keeps the bench chain's steps (`step-chain-steps.js`).
//
//   kit       the AI quickstart kit of the approved plan's template (`loadAiqKit`), no model
//   brand     the approved plan's look: the brand step ran before the site (#616), nothing runs again
//   plan      the approved plan and the profile it was gated with, read from the draft: NO plan is composed
//   copy      `writePages`: every page in parallel, the page and site copy checks together, one rewrite of the failing
//             fields, then `copy_check_failed` (noRerun) naming pages and codes. 🔒 A PAGE IS WRITTEN AT MOST TWICE IN
//             ONE BUILD: a failure in the rewrite round is noRerun; a failure before it may be re-run once by the
//             frame, and that second attempt writes once with no rewrite round (`rewrite: false`)
//   pictures  the draft pictures opened, labelled by ONE vision call, assigned to every frame (`placeBuildPictures`);
//             a picture whose own texts name a held text is refused (`refusedPicture`)
//   icons     `selectBuildIcons` over the written copy and the placed frames
//   order, write   `step-chain-draft-steps-late.js`: the write order, and the write on the site through the doors
//             `deps.draftWrite` injects; with none, `write_not_ready_for_draft` at once (noRerun), nothing written
//
// 🔒 ONE MODEL DOOR. Every model call (the writer, the labelling, the icon keywords and ranking) is made through the
// build model door (`buildModel`, `lib/llm-catalog.js`), resolved once per step by the injected resolver; no step names
// a model. 🔒 NOTHING HELD REACHES THE WRITER. The draft keeps the full gated profile (`withWithheld`); every step
// reads it through `withoutWithheld`.
import { selectBuildIcons, placeBuildPictures } from 'website-opportunities/domain/picture-step.mjs'
import { writePages } from 'website-opportunities/domain/page-writer.mjs'
import { withoutWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { refusedPicture, visionThrough, withDraftPictures } from './step-chain-draft-pictures.js'
import { draftError, draftSource } from './step-chain-draft-source.js'
import { keptModelOf, reuseOf, revisionOf, revisionRecordOf } from './step-chain-draft-revision.js'
import { orderStep, writeStep } from './step-chain-draft-steps-late.js'

/** The build model door's id in `LLM_DOORS`, the only door an assembled run spends. */
export const ASSEMBLED_MODEL_DOOR = 'buildModel'
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * @param {{readEngineDraft?: Function, draftPlanForBuild?: Function, loadAiqKit?: (slug: string) => object | null,
 *   buildModel?: () => Promise<Function>, openDraftPicture?: Function, iconLibrary?: () => object,
 *   draftWrite?: object, builds?: object}} deps `draftWrite`: the site doors of the write step
 *   (`step-chain-draft-write-step.js`); `builds`: the build store of revisions
 *   (`{read, keep, current, begin, unfinished, end, forget}`,
 *   `docs/references/draft-revision-run.md`)
 *   `buildModel`: the build model door's resolver (`build-draft/build-model.js` `buildModelDoor`), which throws
 *   `model_missing` when the door has no provider
 */
export function createDraftSteps(deps) {
  const source = draftSource(deps)
  async function modelOf() {
    if (typeof deps.buildModel !== 'function')
      throw draftError('model_missing', 'this server has no build model door for a step chain run')
    const model = await deps.buildModel()
    if (typeof model !== 'function')
      throw draftError('model_missing', 'the build model door answered no model to call')
    return model
  }
  const declared = (kit) => ({ blockStore: kit.aiq.blockStore, library: list(kit.aiq.library) })

  return {
    forget: (runId) => source.forget(runId),

    /** The build model door, when it cannot be answered, as the frame's door check reads it. */
    async doors() {
      try {
        await modelOf()
        return []
      } catch (error) {
        return [{ door: ASSEMBLED_MODEL_DOOR, state: String(error?.code ?? 'unreadable') }]
      }
    },

    async kit(ctx) {
      const draft = await source.of(ctx)
      const wanted = draft.plan.look?.template
      const aiq = typeof deps.loadAiqKit === 'function' ? deps.loadAiqKit(wanted?.slug) : null
      if (!aiq?.blockStore)
        throw draftError(
          'aiq_kit_missing',
          `no AI quickstart kit for the template ${wanted?.slug ?? '(none)'}`
        )
      if (typeof wanted?.version !== 'string' || wanted.version.trim() === '')
        throw draftError(
          'aiq_kit_version_missing',
          `the approved plan names no version of the template ${wanted?.slug ?? '(none)'}: it cannot be held to a kit`
        )
      if (aiq.template?.version !== wanted.version)
        throw draftError(
          'aiq_kit_version_changed',
          `the plan was approved for ${wanted.slug} ${wanted.version}, this server has ${aiq.template?.version}`,
          { approved: wanted.version, kit: aiq.template?.version ?? null }
        )
      const ref = `${wanted.slug}@${aiq.template.version}`
      return { value: { ref, aiq, recorded: { ref, template: aiq.template } }, usd: 0 }
    },

    async brand(ctx) {
      const draft = await source.of(ctx)
      const look = draft.plan.look ?? null
      return { value: { from: 'plan', recorded: { from: 'plan', accent: look?.accent ?? null } }, usd: 0 }
    },

    async plan(ctx, { kit } = {}) {
      const draft = await source.of(ctx)
      const { plan, profile, lastEdit, draftId } = draft
      // A revision run (#599, `step-chain-draft-revision.js`): the previous build and which pages are written again.
      const revision = kit ? await revisionOf(deps, ctx, { kit, plan, profile }) : null
      const recorded = {
        draftId,
        plan: plan.id ?? null,
        revision: plan.revision ?? null,
        pages: plan.pages.length,
        ...(revision ? { rebuild: revisionRecordOf(revision) } : {})
      }
      const value = { draftId, plan, profile, lastEdit, research: draft.research, revision, recorded }
      return { value: { ...value, previous: revision?.previous ?? null }, usd: 0 }
    },

    async copy(_ctx, { kit, plan }, { signal, attempt = 1 } = {}) {
      const model = await modelOf()
      const written = await writePages({
        plan: plan.plan,
        profile: withoutWithheld(plan.profile),
        ...declared(kit),
        mapping: kit.aiq.mapping ?? undefined,
        model,
        signal,
        // The frame's second attempt: every page was written once already, so no rewrite round this time.
        rewrite: attempt <= 1,
        reuse: reuseOf(plan)
      })
      const recorded = { pages: written.pages.map((p) => ({ id: p.id, calls: p.attempts.length })) }
      return { value: { ...written, recorded }, usd: null, knownUsd: 0 }
    },

    async pictures(ctx, { kit, plan }) {
      const model = keptModelOf(await modelOf(), plan)
      const opened = await withDraftPictures({
        profile: withoutWithheld(plan.profile),
        manifest: plan.research?.manifest,
        accountId: ctx.accountId,
        openDraftPicture: deps.openDraftPicture
      })
      const placed = await placeBuildPictures({
        plan: plan.plan,
        profile: opened.profile,
        ...declared(kit),
        vision: visionThrough(model, opened.refs),
        refuse: refusedPicture(plan.profile?.withheld, opened.profile)
      })
      const draft = {
        used: opened.used,
        missing: opened.missing,
        unstored: opened.unstored,
        refused: placed.refused.length
      }
      const recorded = {
        calls: { asked: model.asked, replayed: model.replayed },
        counts: placed.counts,
        leftOut: placed.leftOut,
        difference: placed.difference,
        draft
      }
      const value = { ...placed, profile: opened.profile, draft, replies: model.replies, recorded }
      return { value, usd: null, knownUsd: 0 }
    },

    async icons(_ctx, { kit, plan, copy, pictures }) {
      const model = keptModelOf(await modelOf(), plan)
      const icons = await selectBuildIcons({
        plan: plan.plan,
        profile: pictures.profile,
        ...declared(kit),
        copy: { pages: copy.pages },
        iconLibrary: deps.iconLibrary?.(),
        model,
        pictureFrames: pictures.frames
      })
      const recorded = { counts: icons.iconCounts, calls: { asked: model.asked, replayed: model.replayed } }
      return { value: { ...icons, replies: model.replies, recorded }, usd: null, knownUsd: 0 }
    },

    order: (ctx, inputs) => orderStep(ctx, inputs),

    /** The write of a draft run: through the injected site doors, or a typed stop when none are wired. */
    write: (ctx, inputs) => writeStep(deps, ctx, inputs)
  }
}

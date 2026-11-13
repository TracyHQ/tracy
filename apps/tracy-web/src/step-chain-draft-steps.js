// The steps of a step chain run assembled from an approved build draft (#597): the domain steps of the AI quickstart
// build in the chain's frame (`sites/brief-engines/step-chain.js`), up to the write order. The Write step is not here:
// it stays the bench chain's (`step-chain-steps.js`) while the real write is redesigned.
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
//   order     the alt text hand-off (`step-chain-draft-alt.js`), `buildWriteOrder`, `checkWriteOrder`
//   write     not built for a draft run yet: `write_not_ready_for_draft` at once (noRerun), nothing written
//
// 🔒 ONE MODEL DOOR. Every model call (the writer, the labelling, the icon keywords and ranking) is made through the
// build model door (`buildModel`, `lib/llm-catalog.js`), resolved once per step by the injected resolver; no step names
// a model. 🔒 NOTHING HELD REACHES THE WRITER. The draft keeps the full gated profile (`withWithheld`); every step
// reads it through `withoutWithheld`.
import { selectBuildIcons, placeBuildPictures } from 'website-opportunities/domain/picture-step.mjs'
import { writePages } from 'website-opportunities/domain/page-writer.mjs'
import { withoutWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { buildWriteOrder } from 'website-opportunities/domain/write-order.mjs'
import { checkWriteOrder } from 'website-opportunities/domain/write-order-check.mjs'
import { altCountsOf, altProblemsOf, withAltTexts } from './step-chain-draft-alt.js'
import { refusedPicture, visionThrough, withDraftPictures } from './step-chain-draft-pictures.js'
import { draftError, draftSource } from './step-chain-draft-source.js'

/** The build model door's id in `LLM_DOORS`, the only door an assembled run spends. */
export const ASSEMBLED_MODEL_DOOR = 'buildModel'
/** At most this many problems of a failing write order are kept in the stop report. */
const ORDER_PROBLEMS_KEPT = 20
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * @param {{readEngineDraft?: Function, draftPlanForBuild?: Function, loadAiqKit?: (slug: string) => object | null,
 *   buildModel?: () => Promise<Function>, openDraftPicture?: Function, iconLibrary?: () => object}} deps
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

    async plan(ctx) {
      const draft = await source.of(ctx)
      const { plan, profile, lastEdit, draftId } = draft
      const recorded = {
        draftId,
        plan: plan.id ?? null,
        revision: plan.revision ?? null,
        pages: plan.pages.length
      }
      return { value: { draftId, plan, profile, lastEdit, research: draft.research, recorded }, usd: 0 }
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
        rewrite: attempt <= 1
      })
      const recorded = { pages: written.pages.map((p) => ({ id: p.id, calls: p.attempts.length })) }
      return { value: { ...written, recorded }, usd: null, knownUsd: 0 }
    },

    async pictures(ctx, { kit, plan }) {
      const model = await modelOf()
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
        counts: placed.counts,
        leftOut: placed.leftOut,
        difference: placed.difference,
        draft
      }
      return { value: { ...placed, profile: opened.profile, draft, recorded }, usd: null, knownUsd: 0 }
    },

    async icons(_ctx, { kit, plan, copy, pictures }) {
      const model = await modelOf()
      const icons = await selectBuildIcons({
        plan: plan.plan,
        profile: pictures.profile,
        ...declared(kit),
        copy: { pages: copy.pages },
        iconLibrary: deps.iconLibrary?.(),
        model,
        pictureFrames: pictures.frames
      })
      return { value: { ...icons, recorded: { counts: icons.iconCounts } }, usd: null, knownUsd: 0 }
    },

    async order(ctx, { kit, plan, copy, pictures, icons }) {
      const withheld = plan.profile?.withheld
      const frames = withAltTexts(pictures.frames, {
        profile: pictures.profile,
        language: plan.plan.language,
        withheld,
        template: kit.aiq.template
      })
      const order = buildWriteOrder({
        run: { id: ctx.runId ?? null, kind: 'build' },
        aiq: { ...kit.aiq, ref: kit.ref },
        approval: { plan: plan.plan, profile: pictures.profile },
        writers: [{ pages: copy.pages, prompt: copy.prompt }],
        pictures: { ...pictures, frames },
        icons
      })
      const problems = checkWriteOrder(order)
      if (problems.length)
        throw draftError(
          'write_order_check_failed',
          `${problems.length} problem(s) in the write order: ${[...new Set(problems.map((p) => p.code))].join(', ')}`,
          { problems: problems.slice(0, ORDER_PROBLEMS_KEPT), problemsCount: problems.length }
        )
      const alt = altProblemsOf(order, withheld)
      if (alt.length)
        throw draftError('alt_text_unusable', `${alt.length} placed picture(s) have no usable alt text`, {
          problems: alt.slice(0, ORDER_PROBLEMS_KEPT),
          problemsCount: alt.length
        })
      const recorded = {
        pages: order.pages.length,
        pictures: order.pictures.length,
        icons: order.icons.length,
        alts: altCountsOf(frames)
      }
      return { value: { order, recorded }, usd: 0 }
    },

    /** The write of a draft run: not built yet, so it stops at once and writes nothing. */
    async write() {
      throw draftError(
        'write_not_ready_for_draft',
        'a run built from a draft ends with its write order: the write step for it is not built yet'
      )
    }
  }
}

// The Write step of a draft run (#597): the checked write order of the `order` step, planned (`writePlanOf`, every
// guard before any door) and run on the blank site through the doors the server injects (`runDraftWrite`). With no
// doors injected the step stops at once, typed (`write_not_ready_for_draft`), writing nothing: the real door client is
// not built yet. Spec: docs/references/draft-write-step.md.
//
// `deps.draftWrite` (injected by `app.js` once the real client exists, by the tests until then):
//   doors(ctx)               the site doors of this run (`step-chain-draft-write.js` lists them)
//   record(ctx)              the run record the write resumes from: `{state, save(state)}`, kept between attempts
//   openStored(id, ctx)      the stored bytes of a picture: `{bytes, mime}`
//   stored(order, ctx)       the stored picture of every frame and icon the order shows: `{<frame>: {id, mime?}}`
//   blankContract(kit)       the blank site contract's content map of the kit (its slots, limits and `opensEmpty`)
//   drawInitials(draw)       optional: draws an initials picture (default: `lib/initials-avatar.js`)
//   builds.keep(build, ctx)  optional (`deps.builds`): keeps the finished build (`buildResultOf`) a revision starts from
//
// A revision run (#599: the plan step found the previous build, `inputs.plan.previous`) writes only what the revision
// changed, on a record of its own (`step-chain-draft-write-revision.js`).
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { buildResultOf } from 'website-opportunities/domain/build-result.mjs'
import { opsRecordOf } from 'website-opportunities/domain/revision-write-delta.mjs'
import { draftError } from './step-chain-draft-source.js'
import { runDraftWrite } from './step-chain-draft-write.js'
import { runRevisionWrite } from './step-chain-draft-write-revision.js'

/** The initials picture of a person with no photo, drawn in the frame (strokes A to Z, else the neutral figure). */
async function drawInitials(draw) {
  const { initialsAvatar } = await import('./lib/initials-avatar.js')
  const made = await initialsAvatar(draw)
  return { bytes: made.bytes, mime: 'image/jpeg' }
}

/**
 * @param {object | undefined} wiring `deps.draftWrite`
 * @param {object} ctx the run
 * @param {{kit: object, plan: object, order: {order: object}}} inputs the outputs of the kit, plan and order steps
 * @param {{iconLibrary?: () => {icons?: Array<{name: string}>}}} [chain] the icon library the icons step chose from: an
 *   icon picture of the order must be one of its names (no library wired: none is)
 */
export async function draftWriteStep(wiring, ctx, inputs, { iconLibrary, builds } = {}) {
  if (typeof wiring?.doors !== 'function')
    throw draftError(
      'write_not_ready_for_draft',
      'a run built from a draft ends with its write order: no site doors are wired for its write step'
    )
  const order = inputs?.order?.order
  if (!order) throw draftError('write_order_missing', 'the write step of a draft run has no write order')
  const aiq = {
    ...inputs.kit.aiq,
    blankContract: wiring.blankContract?.(inputs.kit) ?? inputs.kit.aiq.blankContract
  }
  const plan = writePlanOf(order, aiq, {
    stored: (await wiring.stored?.(order, ctx)) ?? {},
    withheld: inputs.plan?.profile?.withheld,
    approved: inputs.plan?.plan,
    iconKeys: (iconLibrary?.()?.icons ?? []).map((icon) => icon?.name)
  })
  const record = (await wiring.record?.(ctx)) ?? {}
  const previous = inputs.plan?.previous ?? null
  try {
    const run = {
      plan,
      doors: await wiring.doors(ctx),
      record,
      runId: ctx.runId ?? 'draft',
      openStored: (id) => wiring.openStored(id, ctx),
      drawInitials: wiring.drawInitials ?? drawInitials
    }
    const { report } = previous
      ? await runRevisionWrite({ ...run, previous: previous.write })
      : { report: await runDraftWrite(run) }
    const state = record.state
    const build = buildResultOf({
      // One ref per write on the site: a run id reused, or a revision run again after a restore, keeps its own.
      ref: `${ctx.runId ?? 'draft'}:r${plan.order?.plan?.revision ?? 'none'}:w${state.seq ?? 1}`,
      previous: previous?.ref ?? null,
      plan: inputs.plan.plan,
      profile: inputs.plan.profile,
      kit: inputs.kit.ref,
      copy: inputs.copy,
      replies: [...(inputs.pictures?.replies ?? []), ...(inputs.icons?.replies ?? [])],
      state,
      ops: opsRecordOf(plan)
    })
    await builds?.keep?.(build, ctx)
    return {
      value: {
        report,
        build: { ref: build.ref, previous: build.previous, kept: typeof builds?.keep === 'function' },
        recorded: {
          ops: plan.ops.length,
          ran: report.ran.length,
          unproven: report.unproven,
          // Two entries with other words for one place: how many lost a place, and which (entry ids, never the words).
          conflicts: { count: report.counts.conflicts.length, entries: report.counts.conflicts },
          ...(report.delta ? { delta: report.delta } : {})
        }
      },
      usd: 0
    }
  } catch (error) {
    // The report says exactly which operations ran; a half site is never left silent.
    if (error?.report) error.value = { report: error.report }
    throw error
  }
}

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
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { draftError } from './step-chain-draft-source.js'
import { runDraftWrite } from './step-chain-draft-write.js'

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
export async function draftWriteStep(wiring, ctx, inputs, { iconLibrary } = {}) {
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
  try {
    const report = await runDraftWrite({
      plan,
      doors: await wiring.doors(ctx),
      record,
      runId: ctx.runId ?? 'draft',
      openStored: (id) => wiring.openStored(id, ctx),
      drawInitials: wiring.drawInitials ?? drawInitials
    })
    return {
      value: {
        report,
        recorded: { ops: plan.ops.length, ran: report.ran.length, unproven: report.unproven }
      },
      usd: 0
    }
  } catch (error) {
    // The report says exactly which operations ran; a half site is never left silent.
    if (error?.report) error.value = { report: error.report }
    throw error
  }
}

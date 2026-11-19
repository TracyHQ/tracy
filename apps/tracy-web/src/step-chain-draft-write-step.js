// The Write step of a draft run (#597): the checked write order of the `order` step, planned (`writePlanOf`, every
// guard before any door) and run on the blank site through the doors the server injects (`runDraftWrite`). With no
// doors injected the step stops at once, typed (`write_not_ready_for_draft`), writing nothing. The real doors go
// are the door client `siteDoors({send})` over the run's Apply door (`step-chain-draft-site.js`); a test injects its own.
// Spec: docs/references/draft-write-step.md, docs/references/draft-write-doors.md.
//
// `deps.draftWrite` (the real site wiring of `step-chain-draft-site.js`, or a test's):
//   doors(ctx)               the site doors of this run (`step-chain-draft-write.js` lists them)
//   record(ctx)              the run record the write resumes from: `{state, save(state)}`, kept between attempts
//   openStored(id, ctx)      the stored bytes of a picture: `{bytes, mime}`
//   stored(order, ctx)       the stored picture of every frame and icon the order shows: `{<frame>: {id, mime?}}`
//   blankContract(kit)       the blank site contract's content map of the kit (its slots, limits and `opensEmpty`)
//   drawInitials(draw)       optional: draws an initials picture (default: `lib/initials-avatar.js`)
//   keepTrial(trial, ctx)    optional: keeps `{order, plan, report}` of the run, done or failed, for a local trial run
//                            (the write result a trial run saves; draft-write-step.md, "The step's value"). It holds
//                            the customer's words: never wired to a stored record of a customer build.
//   builds.keep(build, ctx)  optional (`deps.builds`): keeps the finished build (`buildResultOf`) a revision starts from
//
// The step's value is `{report, order, plan, build, recorded}`, and a failure's `error.value` is `{report, order, plan,
// recorded}` (`plan` null when the guards refused it, `report` null when nothing ran). The engine stores only
// `recorded` (`recordedValue`), never the order or the plan, which hold the customer's words. The engine hands the value of a
// done write to no one (`apply` keeps its counts), so a trial run takes the three through `keepTrial`.
//
// A revision run (#599: the plan step found the previous build, `inputs.plan.previous`) writes only what the revision
// changed, on a record of its own (`step-chain-draft-write-revision.js`).
import { writePlanOf } from 'website-opportunities/domain/draft-write-plan.mjs'
import { researchLabelsOf } from 'website-opportunities/domain/picture-research-labels.mjs'
import { buildResultOf } from 'website-opportunities/domain/build-result.mjs'
import { opsRecordOf } from 'website-opportunities/domain/revision-write-delta.mjs'
import { accentShiftsOf } from './step-chain-draft-brand-pictures.js'
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
 *   icon picture of the order must be one of its names (no library wired: none is); `beforeDoors`: a revision's site
 *   check and mark, run by the revision write after its checks that write nothing
 */
/** Every item the build left out: the writer's fields (#575) before the write's own. */
const skippedOf = (inputs, report) => [
  ...(inputs?.copy?.skippedItems ?? []),
  ...(inputs?.order?.skippedItems ?? []),
  ...(report?.skippedItems ?? [])
]

export async function draftWriteStep(wiring, ctx, inputs, { iconLibrary, builds, beforeDoors } = {}) {
  if (typeof wiring?.doors !== 'function')
    throw draftError(
      'write_not_ready_for_draft',
      'no site doors are wired for the write step of this draft run (no Apply door, no door client or no site key)'
    )
  const order = inputs?.order?.order
  if (!order) throw draftError('write_order_missing', 'the write step of a draft run has no write order')
  const aiq = {
    ...inputs.kit.aiq,
    blankContract: wiring.blankContract?.(inputs.kit) ?? inputs.kit.aiq.blankContract
  }
  let plan = null
  const keep = (report) =>
    typeof wiring.keepTrial === 'function' ? wiring.keepTrial({ order, plan, report }, ctx) : undefined
  try {
    plan = writePlanOf(order, aiq, {
      stored: (await wiring.stored?.(order, ctx)) ?? {},
      // The brand file's fill and words per side, when the plan's accent is its own (#575).
      accentShifts: accentShiftsOf(inputs.plan?.brand, inputs.plan?.plan?.look),
      withheld: inputs.plan?.profile?.withheld,
      approved: inputs.plan?.plan,
      // The build's policy (#575): one item a guard refuses is left out and listed, never the whole build.
      skipItems: true,
      iconKeys: (iconLibrary?.()?.icons ?? []).map((icon) => icon?.name)
    })
    const record = (await wiring.record?.(ctx)) ?? {}
    const previous = inputs.plan?.previous ?? null
    const run = {
      plan,
      doors: await wiring.doors(ctx),
      record,
      runId: ctx.runId ?? 'draft',
      openStored: (id) => wiring.openStored(id, ctx),
      drawInitials: wiring.drawInitials ?? drawInitials,
      // One operation the doors fail on is left out and listed; the rest is written (#575).
      skipFailed: true,
      // The research labels of the owner photos, by address: the photo cut keeps their subject whole.
      pictureLabels: researchLabelsOf(inputs.plan?.research?.brief, inputs.plan?.research?.manifest),
      // The clock the created articles are dated from (tests fix it; the server leaves the wall clock).
      ...(wiring.now ? { now: wiring.now } : {})
    }
    const { report } = previous
      ? await runRevisionWrite({ ...run, previous: previous.write, beforeDoors })
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
      ops: opsRecordOf(plan),
      skipped: skippedOf(inputs, report)
    })
    // The items left out, for the logs: codes and ids only, never the owner's words.
    if (skippedOf(inputs, report).length)
      console.warn(
        JSON.stringify({
          event: 'draft_write_items_skipped',
          run: ctx.runId ?? null,
          items: skippedOf(inputs, report)
        })
      )
    await builds?.keep?.(build, ctx)
    await keep(report)
    return {
      value: {
        report,
        order,
        plan,
        build: { ref: build.ref, previous: build.previous, kept: typeof builds?.keep === 'function' },
        recorded: {
          ops: plan.ops.length,
          ran: report.ran.length,
          unproven: report.unproven,
          // Fact places left unwritten by the kit's decision (place ids, never the words): not written, said so.
          notWritten: (report.notWritten ?? []).map(({ fact, entity, column, by }) => ({
            fact,
            entity,
            column,
            by
          })),
          // The created legal pages and the not-found page the write does not build, with the reason (#575).
          notBuilt: report.notBuilt ?? [],
          // The items left out, each a code with ids (#575): kept out of the owner's screen for now.
          skippedItems: skippedOf(inputs, report),
          // Two entries with other words for one place: how many lost a place, and which (entry ids, never the words).
          conflicts: { count: report.counts.conflicts.length, entries: report.counts.conflicts },
          ...(report.delta ? { delta: report.delta } : {})
        }
      },
      usd: 0
    }
  } catch (error) {
    // The report says exactly which operations ran; a half site is never left silent. A plan the guards refused has
    // no report: the order and the error's problems say why.
    const report = error?.report ?? null
    // `recorded`: what the engine stores of the failure, never the order's or the plan's words.
    const recorded = report
      ? {
          report: {
            status: report.status ?? null,
            counts: report.counts ?? null,
            failed: report.failed ?? null
          }
        }
      : null
    if (error && typeof error === 'object') error.value = { report, order, plan, recorded }
    try {
      await keep(report)
    } catch {
      // A trial keeper that fails never hides the write's own failure.
    }
    throw error
  }
}

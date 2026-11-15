// The site check of a draft run's write step (#599), split from `step-chain-draft-steps-late.js`: right before a run's
// first door write, the site still holds the build the run starts from (`builds.current`, null for a first build:
// `previous_build_not_current`), and a revision marks itself as the site's unfinished run (`builds.begin`, compare and
// set on the build and the mark: another run marked is `previous_run_unfinished`, the build moved on in between is
// `previous_build_not_current`). Nothing is written on the site before both pass.
//
// A revision runs this AFTER every check that can stop without a write (the write plan's guards,
// `revision_needs_removal`, `door_not_available`, the owner checks of its acts), so a stop that wrote nothing leaves
// no mark. A run that still stops having written nothing (`state.touched` unset: the journal sets and saves it before
// any door write) has its mark cleared (`unmarkUnwritten`); a run that wrote keeps it, to be resumed or abandoned.
import { draftError } from './step-chain-draft-source.js'

/** The check, a function; `check.began` says whether it marked the site for this run. */
export function siteCheckOf(builds, ctx, previous) {
  const check = async () => {
    const expected = previous?.ref ?? null
    if (typeof builds?.current === 'function') {
      const now = (await builds.current(ctx)) ?? null
      if (now !== expected)
        throw draftError(
          'previous_build_not_current',
          'the site holds another build than this run starts from',
          {
            expected,
            current: now
          }
        )
    }
    if (!previous || typeof builds?.begin !== 'function') return
    // `begin` compares the site's build with `expected` and sets the mark at once: a run that read the same build and
    // began first wins; this one, refused, stops here before any write, by what refused it.
    if ((await builds.begin({ runId: ctx.runId ?? null, from: expected }, ctx)) !== false) {
      check.began = true
      return
    }
    const now = typeof builds.current === 'function' ? ((await builds.current(ctx)) ?? null) : expected
    if (now !== expected)
      throw draftError('previous_build_not_current', 'another run changed the build of this site first', {
        expected,
        current: now
      })
    throw draftError('previous_run_unfinished', 'another run is still unfinished on this site', {
      run: (await builds.unfinished?.(ctx))?.runId ?? null
    })
  }
  check.began = false
  return check
}

/** A run that marked the site and stopped with no door write: its mark is cleared, so the next revision runs. */
export async function unmarkUnwritten(builds, ctx, check, record) {
  if (!check.began || record?.state?.touched || typeof builds?.end !== 'function') return
  await builds.end(ctx.runId ?? null, ctx)
}

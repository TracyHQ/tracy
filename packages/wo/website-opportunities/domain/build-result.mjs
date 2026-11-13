// What a finished build keeps so that a later plan revision re-runs only what it changed, and so that the build
// before a revision can be restored (ticket #599). Pure.
//
//   ref        the build's own reference (its run id): a revision run names it in `brief.rebuildFrom`
//   previous   the ref of the build this one revised, or null
//   plan       the approved plan, and `profile` the gated needs profile it was built from (with `withheld`)
//   kit        the kit ref (`<slug>@<version>`) the site was written from
//   copy       the writer's pages (`{pages, prompt}`): a revision keeps the words of every page whose request is the same
//   replies    the kept model replies of the labelling and the icons (`keptModel`)
//   write      `{state, ops}`: the run record's state (`{mark, ids, paths, done, seq, base, kept, rewrite, undo}`) and the
//              ops record (`opsRecordOf`); `undo` is what a revision run wrote over, by address, for the restore
//   status     `done`; only a build whose write is done can be revised
export const BUILD_RESULT_SCHEMA = 'tracy-build-result/v1'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** The build result of a finished run. */
export function buildResultOf({ ref, previous = null, plan, profile, kit, copy, replies, state, ops }) {
  return {
    schema: BUILD_RESULT_SCHEMA,
    ref,
    previous,
    status: 'done',
    plan,
    profile,
    kit,
    copy: copy ? { pages: copy.pages, prompt: copy.prompt ?? null } : null,
    replies: Array.isArray(replies) ? replies : [],
    write: { state, ops }
  }
}

/**
 * Why a stored build cannot start a revision of `plan` on kit `kit` (a typed code), or null. A build with no kept copy
 * still can: every page is then written again (`revisionImpactOf`).
 */
export function revisionBaseProblem(build, { plan, kit }) {
  if (!isObject(build)) return 'previous_build_missing'
  if (build.schema !== BUILD_RESULT_SCHEMA || !isObject(build.plan) || !isObject(build.profile))
    return 'previous_build_unreadable'
  if (build.status !== 'done' || !isObject(build.write?.state) || !Array.isArray(build.write?.ops))
    return 'previous_build_unfinished'
  const state = build.write.state
  if (Object.keys(state.pending ?? {}).length > 0) return 'previous_build_unfinished'
  if (build.plan.id !== plan?.id) return 'previous_build_other_plan'
  if (build.kit !== kit) return 'previous_build_other_kit'
  return null
}

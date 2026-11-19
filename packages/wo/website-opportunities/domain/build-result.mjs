// What a finished build keeps so that a later plan revision re-runs only what it changed, and so that the build
// before a revision can be restored (ticket #599). Pure.
//
//   ref        the build's own reference (its run id): a revision run names it in `brief.rebuildFrom`
//   previous   the ref of the build this one revised, or null
//   plan       the approved plan, and `profile` the gated needs profile it was built from (with `withheld`)
//   kit        the kit ref (`<slug>@<version>`) the site was written from
//   copy       the writer's pages (`{pages, prompt, systemPages?}`): a revision keeps the words of every page whose
//              request is the same, and the created Privacy page's text while its inputs are unchanged
//   replies    the kept model replies of the labelling and the icons (`keptModel`)
//   write      `{state, ops}`: the run record's state (`{mark, ids, paths, done, seq, base, kept, rewrite, undo}`) and the
//              ops record (`opsRecordOf`); `undo` is what a revision run wrote over, by address, for the restore;
//              `wrote` the sha256 of the value the build (and the builds before it) last wrote at each place
//   skipped    the items the write left out (#575): `{code, op, place, reason, at}` each, codes and ids only
//   status     `done`; only a build whose write is done can be revised
export const BUILD_RESULT_SCHEMA = 'tracy-build-result/v1'

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** The build result of a finished run. */
export function buildResultOf({
  ref,
  previous = null,
  plan,
  profile,
  kit,
  copy,
  replies,
  state,
  ops,
  skipped
}) {
  return {
    schema: BUILD_RESULT_SCHEMA,
    ref,
    previous,
    status: 'done',
    plan,
    profile,
    kit,
    copy: copy
      ? {
          pages: copy.pages,
          prompt: copy.prompt ?? null,
          // The created Privacy page's text (#575): a revision keeps it while its inputs are unchanged.
          ...(Array.isArray(copy.systemPages) && copy.systemPages.length
            ? { systemPages: copy.systemPages.map(({ attempts: _a, ...page }) => page) }
            : {})
        }
      : null,
    replies: Array.isArray(replies) ? replies : [],
    write: { state, ops, ...(Array.isArray(skipped) && skipped.length ? { skipped } : {}) }
  }
}

const isText = (value) => typeof value === 'string' && value.trim() !== ''
const isTextMap = (value) =>
  isObject(value) && Object.values(value).every((v) => isText(v) || Number.isFinite(v))

/** Whether the kept parts a revision reads are what `buildResultOf` writes: any other shape is unreadable. */
function readable(build) {
  if (!isText(build.ref) || !isText(build.kit)) return false
  if (!Array.isArray(build.replies)) return false
  if (!build.replies.every((r) => isObject(r) && isText(r.key) && r.reply !== undefined && r.reply !== null))
    return false
  if (build.copy !== null && build.copy !== undefined) {
    if (!isObject(build.copy) || !Array.isArray(build.copy.pages)) return false
    for (const page of build.copy.pages)
      if (!isObject(page) || !isText(page.id) || !Array.isArray(page.fields)) return false
      else if (!page.fields.every((f) => isObject(f) && isText(f.key))) return false
  }
  const { state, ops } = build.write ?? {}
  if (!isObject(state) || !Array.isArray(ops) || ops.length === 0) return false
  if (
    !ops.every(
      (o) => isObject(o) && isText(o.key) && isText(o.kind) && isText(o.hash) && Array.isArray(o.addresses)
    )
  )
    return false
  if (state.seq !== undefined && !(Number.isInteger(state.seq) && state.seq >= 1)) return false
  if (!isTextMap(state.ids) || !isTextMap(state.paths ?? {}) || !Array.isArray(state.done)) return false
  if (state.wrote !== undefined && !isTextMap(state.wrote)) return false
  return true
}

/**
 * Why a stored build cannot start a revision of `plan` on kit `kit` (a typed code), or null. A build with no kept copy
 * still can: every page is then written again (`revisionImpactOf`). Every part a revision reads is checked for its
 * shape first (`previous_build_unreadable`): a build changed or broken in the store never reaches the model or a door.
 */
export function revisionBaseProblem(build, { plan, kit }) {
  if (build === null || build === undefined) return 'previous_build_missing'
  if (!isObject(build)) return 'previous_build_unreadable'
  if (build.schema !== BUILD_RESULT_SCHEMA || !isObject(build.plan) || !isObject(build.profile))
    return 'previous_build_unreadable'
  if (build.status !== 'done' || !isObject(build.write?.state)) return 'previous_build_unfinished'
  if (Object.keys(build.write.state.pending ?? {}).length > 0) return 'previous_build_unfinished'
  if (!readable(build)) return 'previous_build_unreadable'
  if (build.plan.id !== plan?.id) return 'previous_build_other_plan'
  if (build.kit !== kit) return 'previous_build_other_kit'
  return null
}

// The build store of the revision run tests (#599): one site's builds in a Map, as `deps.builds` answers them.
/**
 * The build store of one site over a Map of builds by ref (`deps.builds`): `keep` stores a build and makes it the build
 * the site holds (`builds.currentRef`) only over the `expected` one (compare and set, else false and nothing kept),
 * `current` answers that ref; `begin`/`unfinished`/`end` mark the site's one unfinished run (`builds.unfinishedRun`);
 * `forget` keeps only a ref and a reason (`builds.forgotten`).
 */
export const buildStoreOf = (builds) => ({
  read: async (ref) => structuredClone(builds.get(ref) ?? null),
  keep: async (build, _ctx, { expected } = {}) => {
    if (expected !== undefined && (builds.currentRef ?? null) !== expected) return false
    builds.set(build.ref, structuredClone(build))
    builds.currentRef = build.ref
    return true
  },
  current: async () => builds.currentRef ?? null,
  begin: async (run) => {
    if (builds.unfinishedRun && builds.unfinishedRun.runId !== run.runId) return false
    builds.unfinishedRun = { ...run }
    return true
  },
  unfinished: async () => (builds.unfinishedRun ? { ...builds.unfinishedRun } : null),
  end: async (runId) => {
    if (builds.unfinishedRun?.runId === runId) builds.unfinishedRun = null
  },
  forget: async (ref, _ctx, { reason } = {}) => {
    builds.delete(ref)
    builds.forgotten ??= new Map()
    builds.forgotten.set(ref, reason)
  }
})

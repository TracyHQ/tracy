// The build store a draft run keeps its finished builds in (`deps.builds`, #599): the interface the write step, a
// revision, a restore and an abandon call (docs/references/draft-revision-run.md, "What the caller passes"), and a
// memory store of it. No durable store exists yet: `build_draft.build` (migration 219) is the build chat's approval
// record (one build id per draft, the frozen snapshot), not a store of finished build results per site. The build chat
// owns that store; until it provides one, a run reports `build.kept: false` and nothing can be revised later.
//
//   read(ref, ctx)                    the build kept under `ref`, or null
//   keep(build, ctx, {expected})      store `build` AND make its ref the site's build, only when the site's build is
//                                     `expected` now (null for a first build): compare and set, atomic; false otherwise
//   current(ctx)                      the ref of the site's build, or null
//   begin({runId, from}, ctx)         mark the site's one unfinished revision run (compare and set; the same run id
//                                     again is true, a resume); false when another run is marked
//   unfinished(ctx)                   the mark, or null
//   end(runId, ctx)                   clear the mark of that run
//   forget(ref, ctx, {reason})        drop the build, keeping only its ref and the reason
// One store per SITE (`ctx.siteKey`); the caller serialises runs per site.

/** The methods a build store must answer. */
export const BUILD_STORE_METHODS = Object.freeze([
  'read',
  'keep',
  'current',
  'begin',
  'unfinished',
  'end',
  'forget'
])

/** The methods `store` lacks (an empty list: it is a whole build store). */
export const missingBuildMethods = (store) =>
  BUILD_STORE_METHODS.filter((name) => typeof store?.[name] !== 'function')

/**
 * A build store in memory, one entry per site key. For tests and a local trial run only: it forgets everything when
 * the process ends, so a server must never wire it for customer builds.
 */
export function memoryBuildStore() {
  const sites = new Map()
  const siteOf = (ctx) => {
    const key = String(ctx?.siteKey ?? '')
    if (!sites.has(key))
      sites.set(key, { builds: new Map(), current: null, unfinished: null, forgotten: new Map() })
    return sites.get(key)
  }
  return {
    sites,
    read: async (ref, ctx) => structuredClone(siteOf(ctx).builds.get(ref) ?? null),
    async keep(build, ctx, { expected } = {}) {
      const site = siteOf(ctx)
      if (expected !== undefined && site.current !== expected) return false
      site.builds.set(build.ref, structuredClone(build))
      site.current = build.ref
      return true
    },
    current: async (ctx) => siteOf(ctx).current,
    async begin(run, ctx) {
      const site = siteOf(ctx)
      if (site.unfinished && site.unfinished.runId !== run.runId) return false
      site.unfinished = { ...run }
      return true
    },
    unfinished: async (ctx) => (siteOf(ctx).unfinished ? { ...siteOf(ctx).unfinished } : null),
    async end(runId, ctx) {
      const site = siteOf(ctx)
      if (site.unfinished?.runId === runId) site.unfinished = null
    },
    async forget(ref, ctx, { reason } = {}) {
      const site = siteOf(ctx)
      site.builds.delete(ref)
      site.forgotten.set(ref, reason ?? null)
    }
  }
}

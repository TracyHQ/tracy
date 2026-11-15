// The trials of write safety's bisection (ticket #586): each tries a subset of a pass's probes, on a fresh site for a
// stopped write, or the blocks of an erroring page taken off it on the same site, then the values of those blocks.
// Pure but for the injected build and site.
import { bisect, bisectBlocks } from './bisect.mjs'
import { buildRefusalOf, stopClassOf } from './write-safety-judge.mjs'
import { storedIndex } from './write-safety-places.mjs'

/** The probes of an assignment kept for a subset of its places. */
export const only = (assignment, keys) => new Map([...assignment].filter(([k]) => keys.includes(k)))

/** A trial of a subset of probes on a fresh site: the class of its stopped write, or null when it is written. */
export async function stopOf(subset, active, { attempt, writeOn, plainGaps }) {
  const a = await attempt(only(active, subset))
  if (buildRefusalOf(a, plainGaps)) return null
  const w = await writeOn(a)
  return w.report?.status === 'done' ? null : stopClassOf(w.report)
}

/** The probes that make a page answer an error: its blocks on the same site first, then the values of those blocks. */
export async function pageCulprits(page, a, w, active, ctx) {
  const { attempt, writeOn, budget, site, plainGaps } = ctx
  const pageFails = async () =>
    (await site.fetch(page.url)).status >= 500 ? { kind: 'server_error', code: 'page' } : null
  const index = storedIndex(a.built.writePlan)
  const opsOf = (key) => (index.get(String(a.opts.used.get(key).code).toUpperCase()) ?? []).map((s) => s.op)
  let units = [...a.opts.used.keys()]
  if (site.off && site.back) {
    const ops = [...new Set(units.flatMap(opsOf))]
    const blocks = await bisectBlocks({
      blocks: ops,
      off: (x) => site.off(x, w.record),
      back: (x) => site.back(x, w.record),
      pageFails,
      budget
    })
    if (blocks.culprits.length)
      units = units.filter((k) => opsOf(k).some((op) => blocks.culprits.some((c) => c.unit === op)))
  }
  const failure = { kind: 'server_error', code: 'page', cause: page.pageType ?? null }
  return bisect(
    units,
    async (subset) => {
      const t = await attempt(only(active, subset))
      if (buildRefusalOf(t, plainGaps)) return null
      const tw = await writeOn(t)
      if (tw.report?.status !== 'done') return null
      return (await site.fetch(page.url)).status >= 500 ? failure : null
    },
    budget,
    failure
  )
}
